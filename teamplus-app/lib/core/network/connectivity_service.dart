import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

/// 네트워크 연결 상태
enum NetworkStatus {
  /// 인터넷 연결됨
  online,

  /// 인터넷 연결 안됨
  offline,

  /// 연결 상태 확인 중
  unknown,
}

/// 네트워크 연결 유형
enum NetworkType {
  wifi,
  mobile,
  ethernet,
  vpn,
  bluetooth,
  other,
  none,
}

/// 네트워크 상태 정보
class NetworkInfo {
  final NetworkStatus status;
  final NetworkType type;
  final DateTime timestamp;

  const NetworkInfo({
    required this.status,
    required this.type,
    required this.timestamp,
  });

  bool get isOnline => status == NetworkStatus.online;
  bool get isOffline => status == NetworkStatus.offline;

  @override
  String toString() => 'NetworkInfo(status: $status, type: $type)';
}

/// 네트워크 연결 상태 감지 서비스
class ConnectivityService {
  static final ConnectivityService _instance = ConnectivityService._internal();

  factory ConnectivityService() => _instance;

  final Connectivity _connectivity = Connectivity();

  // 현재 네트워크 상태
  NetworkInfo _currentInfo = NetworkInfo(
    status: NetworkStatus.unknown,
    type: NetworkType.none,
    timestamp: DateTime.now(),
  );

  // 상태 변경 스트림
  final StreamController<NetworkInfo> _statusController =
      StreamController<NetworkInfo>.broadcast();

  // 구독 관리
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  // 오프라인 요청 큐
  final List<PendingRequest> _pendingRequests = [];

  ConnectivityService._internal();

  /// 현재 네트워크 상태
  NetworkInfo get currentStatus => _currentInfo;

  /// 네트워크 상태 변경 스트림
  Stream<NetworkInfo> get onStatusChange => _statusController.stream;

  /// 현재 온라인 상태 여부
  bool get isOnline => _currentInfo.isOnline;

  /// 현재 오프라인 상태 여부
  bool get isOffline => _currentInfo.isOffline;

  /// 서비스 초기화 (앱 시작 시 호출)
  Future<void> initialize() async {
    // 초기 상태 확인
    await _checkConnectivity();

    // 상태 변경 리스닝
    _subscription =
        _connectivity.onConnectivityChanged.listen(_handleConnectivityChange);

    if (kDebugMode) {
      debugPrint('🌐 ConnectivityService initialized: $_currentInfo');
    }
  }

  /// 현재 연결 상태 확인
  Future<NetworkInfo> checkConnectivity() async {
    return await _checkConnectivity();
  }

  /// 연결 상태 확인 (내부)
  Future<NetworkInfo> _checkConnectivity() async {
    try {
      final results = await _connectivity.checkConnectivity();
      _handleConnectivityChange(results);
      return _currentInfo;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('❌ Connectivity check failed: $e');
      }
      return _currentInfo;
    }
  }

  /// 연결 상태 변경 처리
  void _handleConnectivityChange(List<ConnectivityResult> results) {
    final networkType = _mapConnectivityResult(results);
    final status = networkType == NetworkType.none
        ? NetworkStatus.offline
        : NetworkStatus.online;

    final newInfo = NetworkInfo(
      status: status,
      type: networkType,
      timestamp: DateTime.now(),
    );

    // 상태가 변경된 경우에만 알림
    if (_currentInfo.status != newInfo.status ||
        _currentInfo.type != newInfo.type) {
      _currentInfo = newInfo;
      _statusController.add(newInfo);

      if (kDebugMode) {
        debugPrint('🌐 Network status changed: $newInfo');
      }

      // 온라인 복구 시 대기 중인 요청 처리
      if (newInfo.isOnline && _pendingRequests.isNotEmpty) {
        _processPendingRequests();
      }
    }
  }

  /// ConnectivityResult를 NetworkType으로 변환
  NetworkType _mapConnectivityResult(List<ConnectivityResult> results) {
    if (results.isEmpty || results.contains(ConnectivityResult.none)) {
      return NetworkType.none;
    }

    // 우선순위: wifi > ethernet > mobile > vpn > bluetooth > other
    if (results.contains(ConnectivityResult.wifi)) {
      return NetworkType.wifi;
    }
    if (results.contains(ConnectivityResult.ethernet)) {
      return NetworkType.ethernet;
    }
    if (results.contains(ConnectivityResult.mobile)) {
      return NetworkType.mobile;
    }
    if (results.contains(ConnectivityResult.vpn)) {
      return NetworkType.vpn;
    }
    if (results.contains(ConnectivityResult.bluetooth)) {
      return NetworkType.bluetooth;
    }
    if (results.contains(ConnectivityResult.other)) {
      return NetworkType.other;
    }

    return NetworkType.none;
  }

  /// 오프라인 요청 큐에 추가
  void queueRequest(PendingRequest request) {
    _pendingRequests.add(request);
    if (kDebugMode) {
      debugPrint('📥 Request queued (offline): ${request.id}');
    }
  }

  /// 대기 중인 요청 처리
  Future<void> _processPendingRequests() async {
    if (_pendingRequests.isEmpty) return;

    if (kDebugMode) {
      debugPrint(
          '📤 Processing ${_pendingRequests.length} pending requests...');
    }

    final requests = List<PendingRequest>.from(_pendingRequests);
    _pendingRequests.clear();

    for (final request in requests) {
      try {
        await request.execute();
        if (kDebugMode) {
          debugPrint('✅ Pending request completed: ${request.id}');
        }
      } catch (e) {
        if (kDebugMode) {
          debugPrint('❌ Pending request failed: ${request.id}, $e');
        }
        // 실패한 요청은 다시 큐에 추가 (최대 재시도 횟수 확인)
        if (request.retryCount < request.maxRetries) {
          request.retryCount++;
          _pendingRequests.add(request);
        } else {
          request.onFailed?.call(e);
        }
      }
    }
  }

  /// 대기 중인 요청 개수
  int get pendingRequestCount => _pendingRequests.length;

  /// 특정 요청 취소
  bool cancelPendingRequest(String requestId) {
    final index = _pendingRequests.indexWhere((r) => r.id == requestId);
    if (index >= 0) {
      _pendingRequests.removeAt(index);
      return true;
    }
    return false;
  }

  /// 모든 대기 중인 요청 취소
  void cancelAllPendingRequests() {
    _pendingRequests.clear();
  }

  /// 서비스 정리
  void dispose() {
    _subscription?.cancel();
    _statusController.close();
    _pendingRequests.clear();
  }
}

/// 대기 중인 요청
class PendingRequest {
  final String id;
  final Future<void> Function() execute;
  final int maxRetries;
  int retryCount;
  final void Function(Object error)? onFailed;
  final DateTime createdAt;

  PendingRequest({
    required this.id,
    required this.execute,
    this.maxRetries = 3,
    this.retryCount = 0,
    this.onFailed,
  }) : createdAt = DateTime.now();
}

/// Riverpod Provider를 위한 확장
extension ConnectivityServiceProvider on ConnectivityService {
  /// 초기화된 서비스 인스턴스 반환
  static Future<ConnectivityService> create() async {
    final service = ConnectivityService();
    await service.initialize();
    return service;
  }
}
