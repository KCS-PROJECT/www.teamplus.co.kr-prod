import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../auth/jwt_format.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';

/// WebSocket 연결 상태
enum WebSocketStatus {
  disconnected,
  connecting,
  connected,
  reconnecting,
  error,
}

/// WebSocket 이벤트 타입
enum WebSocketEventType {
  /// 알림 수신
  notification,

  /// 출석 업데이트
  attendanceUpdate,

  /// 클래스 변경
  classUpdate,

  /// 결제 상태
  paymentStatus,

  /// 시스템 공지
  systemNotice,

  /// 사용자 정의 이벤트
  custom,
}

/// WebSocket 이벤트 데이터
class WebSocketEvent {
  final WebSocketEventType type;
  final String eventName;
  final Map<String, dynamic> data;
  final DateTime timestamp;

  const WebSocketEvent({
    required this.type,
    required this.eventName,
    required this.data,
    required this.timestamp,
  });

  factory WebSocketEvent.fromRaw(String eventName, dynamic rawData) {
    final type = _mapEventType(eventName);
    final data = rawData is Map<String, dynamic> ? rawData : {'value': rawData};

    return WebSocketEvent(
      type: type,
      eventName: eventName,
      data: data,
      timestamp: DateTime.now(),
    );
  }

  static WebSocketEventType _mapEventType(String eventName) {
    switch (eventName) {
      case 'notification':
        return WebSocketEventType.notification;
      case 'attendance_update':
        return WebSocketEventType.attendanceUpdate;
      case 'class_update':
        return WebSocketEventType.classUpdate;
      case 'payment_status':
        return WebSocketEventType.paymentStatus;
      case 'system_notice':
        return WebSocketEventType.systemNotice;
      default:
        return WebSocketEventType.custom;
    }
  }

  @override
  String toString() =>
      'WebSocketEvent(type: $type, event: $eventName, data: $data)';
}

/// WebSocket 서비스 (Socket.IO 기반)
///
/// 2026-05-08 v2 안정성 강화 (P1~P3):
///  - P1 transports: `['websocket', 'polling']` (polling fallback) — 일시적 WS 거부 시 회복
///  - P1 reconnectionAttempts: 무한 (5회 후 포기 차단)
///  - P1 randomizationFactor: 0.5 (jitter — thundering herd 방지)
///  - P2 onDisconnect/onConnectError reason 인자 로깅 (사유 진단)
///  - P3 WidgetsBindingObserver — background↔resume 시 강제 reconnect (iOS 안정성)
///
/// 2026-05-14 v3 (P0 안정성·보안 패치):
///  - P0 reconnectionAttempts 무한 → 50회 (배터리·트래픽 폭주 차단)
///  - P0 reconnectionDelayMax 10s → 60s (실패 누적 시 백오프 증가)
///  - P0 `token_expired` 이벤트 수신 시 refresh + 1회 재연결 (서버측 만료 신호 처리)
///  - P0 onReconnectFailed 시에도 refresh + 재연결 폴백 (50회 소진 회복 경로)
///  - 보안: namespace 화이트리스트 검증 (URL injection 차단)
class WebSocketService with WidgetsBindingObserver {
  static final WebSocketService _instance = WebSocketService._internal();

  factory WebSocketService() => _instance;

  io.Socket? _socket;
  final _storage = SecureStorageService();

  // 연결 상태
  WebSocketStatus _status = WebSocketStatus.disconnected;

  // 상태 변경 스트림
  final _statusController = StreamController<WebSocketStatus>.broadcast();

  // 이벤트 스트림
  final _eventController = StreamController<WebSocketEvent>.broadcast();

  // 재연결 시도 횟수 (Socket.IO 자체 재연결 추적용 — onReconnectAttempt 에서 갱신)
  // 디버그 UI / status bar 노출용으로 [reconnectAttempts] getter 제공.
  int _reconnectAttempts = 0;

  /// 현재까지 누적된 reconnect 시도 횟수 (성공 시 0 으로 리셋).
  /// 50회 도달 시 onReconnectFailed → refresh 폴백 진입 (v3 P0).
  int get reconnectAttempts => _reconnectAttempts;

  // dispose 후 재사용 차단 — _statusController/_eventController close 후 add 시
  // StateError 가 발생하지 않도록 가드.
  bool _isDisposed = false;

  /// 서비스가 dispose 되었는지 (재사용 차단 외부 노출).
  bool get isDisposed => _isDisposed;

  // 마지막 connect 호출 시 사용한 namespace (resume 시 재연결용)
  String? _lastNamespace;

  // 라이프사이클 옵저버 등록 여부
  bool _lifecycleObserverRegistered = false;

  // 토큰 refresh 중복 트리거 가드 (token_expired ↔ onReconnectFailed race 방지)
  bool _isRefreshingToken = false;

  // 이벤트 리스너 등록
  final Map<String, List<void Function(Map<String, dynamic>)>> _eventListeners =
      {};

  /// 서버에 등록된 Socket.IO namespace 화이트리스트
  /// (URL injection 차단 — `connect(namespace: ...)` 외부 입력 검증)
  static const Set<String> _allowedNamespaces = {
    'notifications',
    'chat',
    'match-scoreboard',
  };

  WebSocketService._internal();

  /// 현재 연결 상태
  WebSocketStatus get status => _status;

  /// 연결 상태 스트림
  Stream<WebSocketStatus> get statusStream => _statusController.stream;

  /// 이벤트 스트림
  Stream<WebSocketEvent> get eventStream => _eventController.stream;

  /// 연결 여부
  bool get isConnected => _status == WebSocketStatus.connected;

  /// WebSocket 연결 (앱 시작 시 또는 로그인 후 호출)
  Future<void> connect({String? namespace}) async {
    // dispose 후 재사용 가드 — _statusController close 상태에서 add 시 StateError 방지.
    if (_isDisposed) {
      if (kDebugMode) {
        debugPrint('⚠️ WebSocketService 가 이미 dispose 됨 — connect 무시');
      }
      return;
    }

    // 보안: namespace 화이트리스트 검증 (URL injection 차단)
    if (namespace != null && !_allowedNamespaces.contains(namespace)) {
      if (kDebugMode) {
        debugPrint('❌ WebSocket connect 거부 — 허용되지 않은 namespace: "$namespace"');
      }
      _updateStatus(WebSocketStatus.error);
      return;
    }

    // 라이프사이클 옵저버 1회 등록 (P3 — background↔resume 강제 reconnect)
    if (!_lifecycleObserverRegistered) {
      WidgetsBinding.instance.addObserver(this);
      _lifecycleObserverRegistered = true;
    }
    _lastNamespace = namespace;

    // Q2 stale socket 가드 — _status 와 실제 socket.connected 불일치 감지.
    // (예: onDisconnect 콜백 누락·OS 강제 종료로 _status 갱신 안 됨)
    // stale 이면 정리 후 새 연결을 허용한다.
    final hasStaleSocket = _status == WebSocketStatus.connected &&
        (_socket == null || _socket!.connected == false);
    if (hasStaleSocket) {
      if (kDebugMode) {
        debugPrint('⚠️ WebSocket stale 상태 감지 — 정리 후 재연결 허용');
      }
      _socket?.dispose();
      _socket = null;
      _updateStatus(WebSocketStatus.disconnected);
    } else if (_status == WebSocketStatus.connecting ||
        _status == WebSocketStatus.connected) {
      if (kDebugMode) {
        debugPrint('🔌 WebSocket already connected or connecting');
      }
      return;
    }

    _updateStatus(WebSocketStatus.connecting);

    try {
      // 토큰 가져오기
      final accessToken = await _storage.getAccessToken();
      if (accessToken == null) {
        if (kDebugMode) {
          debugPrint('❌ WebSocket connection failed: No access token');
        }
        _updateStatus(WebSocketStatus.error);
        return;
      }

      // WebSocket URL 구성 — Socket.IO 게이트웨이는 REST prefix(`/api/v1`)를 쓰지 않고
      // 호스트 루트에 네임스페이스(`/notifications`, `/chat`)로 등록된다.
      // `ApiConstants.baseUrl`에는 `/api/v1`이 포함되어 있으므로 이를 제거해야
      // 서버 네임스페이스와 일치한다 (그렇지 않으면 `Invalid namespace` 에러 발생).
      final origin = ApiConstants.baseUrl
          .replaceFirst('http', 'ws')
          .replaceAll(RegExp(r'/api/v\d+/?$'), '');
      final url = namespace != null ? '$origin/$namespace' : origin;

      // Socket.IO 클라이언트 생성 (v3, 2026-05-14 P0 패치)
      //  · transports: WebSocket 우선 + polling fallback (일시적 WS 거부 시 회복)
      //  · reconnectionAttempts: 50회 (무한 → 상한 — 배터리·트래픽 폭주 차단)
      //    50회 소진 시 onReconnectFailed → refresh + 1회 재연결 폴백 경로 진입.
      //    이후에도 실패하면 AppLifecycleState.resumed (main.dart) 에서 수동 재개.
      //  · reconnectionDelay 1s → reconnectionDelayMax 60s (지수 백오프 상한 확장)
      //  · randomizationFactor 0.5 — exponential backoff jitter (thundering herd 방지)
      //  · 서버 ping 정책 (notifications/chat/match-scoreboard 모두 60s/30s 명시) 와 매칭
      _socket = io.io(
        url,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': accessToken})
            .setReconnectionAttempts(50)
            .setReconnectionDelay(1000)
            .setReconnectionDelayMax(60000)
            .setRandomizationFactor(0.5)
            .enableAutoConnect()
            .build(),
      );

      _setupEventHandlers();

      if (kDebugMode) {
        debugPrint('🔌 Connecting to WebSocket: $url');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('❌ WebSocket connection error: $e');
      }
      _updateStatus(WebSocketStatus.error);
    }
  }

  /// 앱 라이프사이클 변경 (P3 — background↔resume 시 강제 reconnect)
  ///
  /// iOS 는 background 진입 시 socket 연결을 OS 가 끊는 경향이 있어, resume 시
  /// 명시적으로 재연결을 트리거하지 않으면 다음 사용자 액션까지 stale state 유지.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      final socket = _socket;
      if (socket != null && !socket.connected) {
        if (kDebugMode) {
          debugPrint('🔄 App resumed — forcing WebSocket reconnect');
        }
        socket.connect();
      } else if (socket == null && _lastNamespace != null) {
        // socket 자체가 dispose 된 상태 → 새로 connect
        if (kDebugMode) {
          debugPrint('🔄 App resumed — re-establishing WebSocket connection');
        }
        connect(namespace: _lastNamespace);
      }
    }
  }

  /// 이벤트 핸들러 설정
  void _setupEventHandlers() {
    final socket = _socket;
    if (socket == null) return;

    // 연결 이벤트
    socket.onConnect((_) {
      if (kDebugMode) {
        debugPrint('✅ WebSocket connected');
      }
      _reconnectAttempts = 0;
      _updateStatus(WebSocketStatus.connected);
    });

    // 연결 해제 이벤트 (v2 — reason 로깅: io server disconnect / transport close /
    // ping timeout 등 사유 구분 가능. 진단성 강화)
    socket.onDisconnect((reason) {
      if (kDebugMode) {
        debugPrint('🔌 WebSocket disconnected (reason: $reason)');
      }
      _updateStatus(WebSocketStatus.disconnected);
    });

    // 재연결 시도
    socket.onReconnectAttempt((attempt) {
      if (kDebugMode) {
        debugPrint('🔄 WebSocket reconnecting... attempt $attempt');
      }
      _reconnectAttempts = attempt;
      _updateStatus(WebSocketStatus.reconnecting);
    });

    // 재연결 성공
    socket.onReconnect((_) {
      if (kDebugMode) {
        debugPrint('✅ WebSocket reconnected');
      }
      _reconnectAttempts = 0;
      _updateStatus(WebSocketStatus.connected);
    });

    // 재연결 실패 (50회 소진 — v3 P0 폴백 경로)
    //  · 50회 모두 실패하면 토큰 만료가 원인일 가능성이 높으므로 refresh 후 1회 재연결.
    //  · refresh 도 실패하면 error 상태 유지 → main.dart AppLifecycleState.resumed 에서
    //    토큰 유효성 재확인 + manual connect 트리거 (자연 회복 경로).
    socket.onReconnectFailed((_) async {
      if (kDebugMode) {
        debugPrint('❌ WebSocket reconnection failed (50회 소진) — refresh 후 재시도');
      }
      _updateStatus(WebSocketStatus.error);
      await _refreshAndReconnect();
    });

    // 서버 토큰 만료 신호 (notifications.gateway.ts handleConnection 에서 emit)
    //  · payload 예: `{"reason": "no_token"}` 또는 `{"reason": "expired"}`
    //  · 무한 reconnect 사이클 중단 → refresh → 새 토큰으로 1회 재연결
    socket.on('token_expired', (data) async {
      if (kDebugMode) {
        debugPrint('🔐 token_expired 수신 (reason: $data) — refresh 후 재연결');
      }
      socket.disconnect(); // Socket.IO 자체 reconnect 사이클 중단
      await _refreshAndReconnect();
    });

    // 서버 토큰 갱신 권고 (notifications/chat gateway 가 만료 임박 시 emit)
    //  · token_expired 와 동일한 처리 — 사전 refresh 로 빈 토큰 사이클 방지.
    //  · payload 예: `{"reason": "expiring_soon", "expiresIn": 120}`
    socket.on('token:refresh_required', (data) async {
      if (kDebugMode) {
        debugPrint('🔐 token:refresh_required 수신 ($data) — 사전 refresh');
      }
      // disconnect 하지 않음 — 만료 임박일 뿐 현재 연결은 유효. refresh 후 새 토큰
      // 으로 reconnect 만 수행하여 끊김 시간 최소화.
      await _refreshAndReconnect();
    });

    // 에러 이벤트
    socket.onError((error) {
      if (kDebugMode) {
        debugPrint('❌ WebSocket error: $error');
      }
      _updateStatus(WebSocketStatus.error);
    });

    // 연결 에러
    socket.onConnectError((error) {
      if (kDebugMode) {
        debugPrint('❌ WebSocket connection error: $error');
      }
      _updateStatus(WebSocketStatus.error);
    });

    // 기본 이벤트 리스너 등록
    _registerDefaultEvents();
  }

  /// 기본 이벤트 리스너 등록
  ///
  /// 2026-05-14 v3 cleanup — 백엔드 emit 매핑 실측 결과 분류:
  ///  ✅ 활성: `notification` (notifications.gateway 가 user/club/all 으로 emit)
  ///  ⏸️ 예약: `attendance_update` / `attendance:checkin` / `class_update` /
  ///     `payment_status` / `system_notice` — 백엔드 emit 아직 없음.
  ///     향후 구현 시 listener 자동 동작하도록 등록은 유지하되,
  ///     dead listener 임을 명시 (callsite 와 동기화 책임 표시).
  ///
  /// 추가로 wiring 되어야 할 이벤트(별도 핸들러 보유):
  ///  - `token_expired` / `token:refresh_required` (위 _setupEventHandlers)
  ///  - `unreadCount` / `unread_count` / `initial_state` / `connected`
  ///    (필요 시점에 외부에서 .on() 으로 구독)
  void _registerDefaultEvents() {
    const defaultEvents = <String>[
      // 활성
      'notification',
      // 예약 (백엔드 emit 추가 시 즉시 활성)
      'attendance_update',
      'attendance:checkin',
      'class_update',
      'payment_status',
      'system_notice',
    ];

    for (final eventName in defaultEvents) {
      _socket?.on(eventName, (data) {
        _handleEvent(eventName, data);
      });
    }
  }

  /// 이벤트 처리
  void _handleEvent(String eventName, dynamic data) {
    if (_isDisposed) return; // dispose 후 stream add 차단
    if (kDebugMode) {
      debugPrint('📨 WebSocket event received: $eventName');
    }

    final event = WebSocketEvent.fromRaw(eventName, data);
    _eventController.add(event);

    // 등록된 리스너에게 전달
    final listeners = _eventListeners[eventName];
    if (listeners != null) {
      for (final listener in listeners) {
        listener(event.data);
      }
    }
  }

  /// 상태 업데이트
  void _updateStatus(WebSocketStatus newStatus) {
    if (_isDisposed) return; // dispose 후 stream add 차단 (StateError 방지)
    if (_status != newStatus) {
      _status = newStatus;
      _statusController.add(newStatus);
    }
  }

  /// 특정 이벤트 리스너 등록
  void on(String eventName, void Function(Map<String, dynamic>) callback) {
    _eventListeners.putIfAbsent(eventName, () => []).add(callback);

    // Socket.IO에도 등록 (이미 등록된 기본 이벤트가 아닌 경우)
    final defaultEvents = [
      'notification',
      'attendance_update',
      'class_update',
      'payment_status',
      'system_notice'
    ];
    if (!defaultEvents.contains(eventName)) {
      _socket?.on(eventName, (data) {
        _handleEvent(eventName, data);
      });
    }
  }

  /// 이벤트 리스너 제거
  void off(String eventName, [void Function(Map<String, dynamic>)? callback]) {
    if (callback != null) {
      _eventListeners[eventName]?.remove(callback);
    } else {
      _eventListeners.remove(eventName);
    }
  }

  /// 이벤트 전송
  void emit(String eventName, [dynamic data]) {
    if (!isConnected) {
      if (kDebugMode) {
        debugPrint('⚠️ Cannot emit event: WebSocket not connected');
      }
      return;
    }

    _socket?.emit(eventName, data);

    if (kDebugMode) {
      debugPrint('📤 WebSocket event sent: $eventName');
    }
  }

  /// 특정 네임스페이스 룸에 참여
  void joinRoom(String roomId) {
    emit('join_room', {'roomId': roomId});
  }

  /// 룸에서 나가기
  void leaveRoom(String roomId) {
    emit('leave_room', {'roomId': roomId});
  }

  /// 토큰 refresh 후 1회 재연결 (v3 P0)
  ///
  /// 호출 경로:
  ///  1. `token_expired` 이벤트 수신 (서버측 만료 신호)
  ///  2. `onReconnectFailed` (50회 reconnect 소진)
  ///
  /// 중복 트리거(token_expired ↔ onReconnectFailed race) 는 [_isRefreshingToken]
  /// 플래그로 방지. refresh 실패 시 error 상태 유지 — main.dart 의 resume 핸들러가
  /// 토큰 유효성 재확인 후 manual connect 시도 (자연 회복 경로).
  Future<void> _refreshAndReconnect() async {
    if (_isRefreshingToken) {
      if (kDebugMode) {
        debugPrint('⏭️ token refresh 이미 진행 중 — 중복 트리거 무시');
      }
      return;
    }
    _isRefreshingToken = true;
    try {
      final newToken = await _tryRefreshAccessToken();
      if (newToken == null) {
        if (kDebugMode) {
          debugPrint('❌ token refresh 실패 — 재로그인 필요 (error 상태 유지)');
        }
        _updateStatus(WebSocketStatus.error);
        return;
      }
      // 기존 socket 정리 후 새 토큰으로 재연결
      _socket?.dispose();
      _socket = null;
      _updateStatus(WebSocketStatus.disconnected);
      await connect(namespace: _lastNamespace);
    } finally {
      _isRefreshingToken = false;
    }
  }

  /// `/auth/refresh` 호출 (인터셉터 우회용 raw Dio).
  /// 성공 시 새 accessToken 반환, 실패 시 null.
  Future<String?> _tryRefreshAccessToken() async {
    try {
      final refreshToken = await _storage.getRefreshToken();
      // [2026-05-14] JWT 형식 사전 검증 — null/빈문자열/비-JWT 모두 호출 차단.
      //   백엔드 RefreshTokenDto @IsJWT 와 동일한 가드. 잘못된 토큰으로 인한
      //   400 BadRequest 사이클 + 무한 reconnect→refresh→실패 루프 방지.
      if (!isJwtFormatPattern(refreshToken)) {
        // stale invalid 토큰 자동 정리 — 다음 reconnect 사이클이 또 시도하지 않도록.
        if (refreshToken != null && refreshToken.isNotEmpty) {
          await _storage.delete('refresh_token');
          if (kDebugMode) {
            debugPrint(
                '🧹 invalid refresh token 감지 → SecureStorage 정리됨 (재로그인 필요)');
          }
        } else if (kDebugMode) {
          debugPrint('⚠️ refresh token 없음 — refresh 스킵');
        }
        return null;
      }

      final refreshDio = Dio(BaseOptions(
        baseUrl: ApiConstants.baseUrl,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 10),
      ));

      final response = await refreshDio.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data;
        final newAccessToken = data['accessToken'] as String?;
        final newRefreshToken = data['refreshToken'] as String?;
        if (newAccessToken != null && newRefreshToken != null) {
          await _storage.saveAccessToken(newAccessToken);
          await _storage.saveRefreshToken(newRefreshToken);
          if (kDebugMode) {
            debugPrint('✅ WebSocket token refresh 성공');
          }
          return newAccessToken;
        }
      }
      return null;
    } catch (e) {
      if (kDebugMode) {
        // 토큰·세션 ID 노출 차단 위해 메시지 80자 trim
        final safeMsg = e.toString();
        debugPrint(
            '❌ WebSocket token refresh 실패: ${safeMsg.length > 80 ? "${safeMsg.substring(0, 80)}..." : safeMsg}');
      }
      return null;
    }
  }

  /// WebSocket 연결 해제
  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _updateStatus(WebSocketStatus.disconnected);

    if (kDebugMode) {
      debugPrint('🔌 WebSocket manually disconnected');
    }
  }

  /// 서비스 정리 (앱 종료 시)
  void dispose() {
    if (_isDisposed) return; // 멱등 — 중복 dispose 가드
    _isDisposed = true;
    if (_lifecycleObserverRegistered) {
      WidgetsBinding.instance.removeObserver(this);
      _lifecycleObserverRegistered = false;
    }
    disconnect();
    _statusController.close();
    _eventController.close();
    _eventListeners.clear();
  }
}

/// WebSocket 이벤트 필터 (편의 확장)
extension WebSocketEventStreamExtension on Stream<WebSocketEvent> {
  /// 특정 타입의 이벤트만 필터링
  Stream<WebSocketEvent> whereType(WebSocketEventType type) {
    return where((event) => event.type == type);
  }

  /// 특정 이벤트 이름만 필터링
  Stream<WebSocketEvent> whereEvent(String eventName) {
    return where((event) => event.eventName == eventName);
  }
}
