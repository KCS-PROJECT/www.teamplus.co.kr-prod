import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../network/api_client.dart';
import '../storage/secure_storage_service.dart';
import '../webview/js_bridge.dart';
import 'notification_channels.dart';

/// FCM 백그라운드 메시지 핸들러 (최상위 함수 필요 — @pragma('vm:entry-point'))
///
/// 📜 계약(Contract) — 2026-06 기준:
///   현재 백엔드는 항상 `notification` 페이로드(title/body 포함)를 발송한다.
///   이 경우 앱이 백그라운드/종료 상태여도 OS(Android 시스템 트레이 / iOS APNS)가
///   알림 배너 표시·진동·소리를 '직접' 처리하므로, 이 핸들러에서 로컬 알림을 다시
///   만들 필요가 없다 — 만들면 알림이 2번 표시되는 중복이 된다. 따라서 진단 로그만 남긴다.
///
///   ⚠️ 백엔드가 향후 data-only 메시지(`notification` 없이 `data` 만)로 전환하면
///   OS 가 자동 표시를 하지 않으므로, 이 핸들러에서 반드시 flutter_local_notifications
///   로 로컬 알림을 '직접' 구성·표시해야 한다(이때 채널/진동은 [NotificationChannels]
///   · kNotificationVibrationPattern 을 따른다). 현 시점에는 백엔드 계약상 불필요하므로
///   구현하지 않는다(과설계 방지). 전환 시점에 `message.notification == null` 분기로
///   로컬 알림 빌드 로직을 추가하면 된다.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // notification 페이로드는 OS 가 자동 표시 → 여기서는 진단 로그만 남긴다.
  // data-only 여부를 함께 로깅해 두면 백엔드 계약 변경(전환) 시 즉시 식별 가능.
  final isDataOnly = message.notification == null;
  debugPrint(
      '[PushNotification] 백그라운드 메시지: ${message.notification?.title} '
      '(dataOnly=$isDataOnly)');
}

/// 푸시 알림 서비스 추상 인터페이스.
///
/// 호출부(WebView Bridge · 로그인/로그아웃 플로우 등)가 의존하는 '최소 표면'만 노출한다.
/// Riverpod provider([notification_providers.dart]의 `pushNotificationProvider`)를 통해
/// 주입되어, 테스트에서는 Mock 구현으로 손쉽게 교체할 수 있다.
/// 기본 구현체는 [PushNotificationService] 싱글톤이다.
abstract class PushNotificationApi {
  /// 서비스 초기화 (로컬 알림 + FCM)
  Future<void> initialize();

  /// 알림 권한 요청 (A5 사전설명 화면 등에서 호출)
  Future<bool> requestPermission();

  /// 현재 알림 권한 허용 여부 조회 (팝업 없음)
  Future<bool> hasPermission();

  /// 확보된 FCM 토큰을 서버에 등록(upsert)
  Future<void> registerTokenToServer();

  /// 로그인/회원가입 직후 — 토큰 확보 후 서버 등록을 보장
  Future<void> ensureTokenRegistered();

  /// 로그아웃 직전 — 현재(또는 영속 저장된) 기기 토큰을 서버에서 비활성화
  Future<void> unregisterTokenFromServer();

  /// 로컬 알림 표시
  Future<void> showNotification({
    required String title,
    required String body,
    String? channelId,
    Map<String, dynamic>? payload,
  });

  /// 알림 수신/탭 이벤트 스트림 (라우팅용)
  Stream<NotificationPayload> get notificationStream;

  /// iOS 앱 아이콘 배지 카운트를 [count] 로 설정한다(0 이하 → 클리어).
  ///
  /// 백엔드 푸시가 `aps.badge` 로 미확인 수를 '누적' 시키는 방향과 짝을 이루어,
  /// 사용자가 알림을 확인한 시점에 배지를 '감소/클리어' 시키는 앱 측 진입점이다.
  Future<void> updateBadgeCount(int count);

  /// iOS 앱 아이콘 배지를 0 으로 클리어한다('모두 읽음' · 알림센터 진입 등).
  Future<void> clearBadge();
}

/// 푸시 알림 서비스
///
/// Firebase Cloud Messaging(FCM) 및 로컬 알림을 처리합니다.
/// WebView Bridge와 연동하여 Web에서도 알림 기능을 사용할 수 있습니다.
class PushNotificationService implements PushNotificationApi {
  static final PushNotificationService _instance =
      PushNotificationService._internal();

  factory PushNotificationService() => _instance;

  PushNotificationService._internal();

  // 로컬 알림 플러그인
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  // FCM 토큰
  String? _fcmToken;
  String? get fcmToken => _fcmToken;

  // 서버 등록 후 받은 deviceId — 로그아웃 시 해당 기기 토큰 비활성화에 사용
  String? _registeredDeviceId;

  // [M1] deviceId 영속 저장 — in-memory 만으로는 앱 강제 종료 시 deviceId 가 유실되어
  //   다음 세션 로그아웃에서 이전 기기 토큰을 비활성화하지 못한다(크로스 유저 푸시 위험).
  //   SecureStorageService 가 generic K-V setter 를 노출하지 않으므로, 동일한 Keychain
  //   접근성 옵션을 가진 FlutterSecureStorage 인스턴스를 직접 사용한다. clearAll() 의
  //   deleteAll() 범위에 함께 포함되어 로그아웃 시 자연 정리된다.
  //   ⚠️ 서버 측 단일 기기(single-device) 강제는 별도 승인된 백엔드 플랜에서 처리한다
  //      (이 작업 범위 밖).
  static const String _kRegisteredDeviceIdKey = 'push_registered_device_id';
  final FlutterSecureStorage _deviceIdStore = const FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock,
    ),
  );

  // 알림 스트림
  final StreamController<NotificationPayload> _notificationController =
      StreamController<NotificationPayload>.broadcast();

  @override
  Stream<NotificationPayload> get notificationStream =>
      _notificationController.stream;

  // 초기화 상태
  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;

  /// 서비스 초기화
  @override
  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      // 로컬 알림 초기화 (Firebase와 독립적으로 항상 동작)
      await _initializeLocalNotifications();

      // FCM 초기화 — Firebase 앱이 등록되어 있을 때만 수행.
      // 설정 파일 미배치 상태에서는 호출 자체를 건너뛰어 [core/no-app] 에러를 방지한다.
      if (Firebase.apps.isNotEmpty) {
        await _initializeFCM();
      } else {
        debugPrint(
            '[PushNotification] Firebase 앱 미등록 — FCM 단계 건너뜀 (로컬 알림만 활성)');
      }

      _isInitialized = true;
      debugPrint('[PushNotification] 서비스 초기화 완료');
    } catch (e) {
      debugPrint('[PushNotification] 초기화 오류: $e');
      rethrow;
    }
  }

  /// 로컬 알림 초기화
  Future<void> _initializeLocalNotifications() async {
    // Android 설정
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');

    // iOS 설정 (flutter_local_notifications 18.x+)
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      settings: initSettings,
      onDidReceiveNotificationResponse: _onNotificationResponse,
    );

    // Android 알림 채널 생성
    if (defaultTargetPlatform == TargetPlatform.android) {
      await _createNotificationChannels();
    }
  }

  /// Android 알림 채널 생성 — 채널 정의는 [NotificationChannels] 단일 출처를 따른다.
  ///
  /// Android 8+(API 26) 는 채널의 진동/소리 설정을 생성 시점에 동결한다. 같은 id 로
  /// 삭제 후 재생성해도 OS 가 이전 설정을 복원하므로, 진동을 켜려면 채널 id 를
  /// 버전업(`_v2`)해야 한다. 여기서는 진동이 누락됐던 구버전 채널을 먼저 삭제해
  /// 사용자 알림 설정 화면을 정리하고, 진동이 명시된 새 채널을 생성한다.
  Future<void> _createNotificationChannels() async {
    final androidPlugin = _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    if (androidPlugin == null) return;

    // 진동/소리 설정 없이 동결된 구버전 채널 정리
    for (final legacyId in NotificationChannels.legacyChannelIds) {
      await androidPlugin.deleteNotificationChannel(channelId: legacyId);
    }

    // 진동(enableVibration + vibrationPattern)이 명시된 새 채널 생성
    for (final channel in NotificationChannels.all) {
      await androidPlugin.createNotificationChannel(channel.toAndroidChannel());
    }
  }

  /// FCM 초기화
  Future<void> _initializeFCM() async {
    // 백그라운드 메시지 핸들러 등록
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    final messaging = FirebaseMessaging.instance;

    // [2026-06-14 · 앱심사 Apple HIG 4.5.4] 부팅 시 OS 알림 권한 팝업 자동 노출 제거.
    //   기존: 앱 첫 실행 시 requestPermission(provisional:false) 가 '사전 설명 없이'
    //   OS 알림 팝업을 즉시 띄워, 이미 잘 만들어진 가입 플로우 A5 사전설명 화면
    //   (SignupPermissionsScreen) 을 무력화했다. Apple HIG 4.5.4 는 권한 요청 전
    //   "왜 필요한지" 맥락(사전 설명)을 먼저 제공할 것을 권고한다.
    //   변경: 부팅 시에는 requestPermission(팝업 유발) 대신 getNotificationSettings
    //   (조회 전용, 팝업 없음) 로 '현재 권한 상태만' 확인한다.
    //     · 알림 권한 요청 책임은 A5 화면(Permission.notification.request)이 단독으로 진다.
    //     · A5 동의 → 가입/로그인 완료 → saveToken bridge → ensureTokenRegistered()
    //       경로로 토큰이 확보·서버 등록된다.
    //     · 이미 허용(authorized/provisional)된 사용자(재실행·기존)는 그대로 토큰 처리.
    final settings = await messaging.getNotificationSettings();

    // 메시지 수신 리스너는 권한 상태와 무관하게 등록 — 이후 사용자가 A5에서 권한을
    // 허용하면 별도 재초기화 없이 즉시 푸시 수신/토큰 갱신이 동작한다.
    messaging.onTokenRefresh.listen(_onTokenRefresh);
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);

    // 앱 종료 상태에서 알림 탭으로 열린 경우
    final initialMessage = await messaging.getInitialMessage();
    if (initialMessage != null) {
      _handleMessageOpenedApp(initialMessage);
    }

    // iOS: 포그라운드 알림 표시 설정
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
    }

    // 권한이 이미 허용된 경우에만 토큰을 즉시 조회·등록.
    //   미결정(notDetermined) 상태면 토큰 조회를 보류한다 — 부팅 시 OS 팝업을 띄우지
    //   않기 위함. A5 동의 후 가입/로그인 완료 시 ensureTokenRegistered() 가
    //   getToken() 으로 토큰을 확보(iOS APNS 등록 트리거)·서버 등록한다.
    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      _fcmToken = await messaging.getToken();
      debugPrint(
          '[PushNotification] FCM Token: ${_fcmToken?.substring(0, 20)}...');

      // 앱 재시작 시 이미 로그인된 세션이면 토큰 즉시 등록
      // (onTokenRefresh 가 갱신 시에만 발화하는 한계를 보완)
      if (await SecureStorageService().isAuthenticated()) {
        await registerTokenToServer();
      }
    } else {
      debugPrint(
          '[PushNotification] 알림 권한 미결정/거부 — 부팅 시 OS 팝업 생략(Apple 4.5.4). '
          'A5 사전설명 화면에서 사용자 동의 후 토큰을 등록한다. '
          '(status=${settings.authorizationStatus})');
    }
  }

  /// 알림 권한 요청
  @override
  Future<bool> requestPermission() async {
    try {
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        final iosPlugin =
            _localNotifications.resolvePlatformSpecificImplementation<
                IOSFlutterLocalNotificationsPlugin>();

        final granted = await iosPlugin?.requestPermissions(
          alert: true,
          badge: true,
          sound: true,
        );

        return granted ?? false;
      } else if (defaultTargetPlatform == TargetPlatform.android) {
        final androidPlugin =
            _localNotifications.resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>();

        final granted = await androidPlugin?.requestNotificationsPermission();
        return granted ?? false;
      }

      return false;
    } catch (e) {
      debugPrint('[PushNotification] 권한 요청 오류: $e');
      return false;
    }
  }

  /// 권한 상태 확인
  @override
  Future<bool> hasPermission() async {
    try {
      final settings =
          await FirebaseMessaging.instance.getNotificationSettings();
      return settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
    } catch (e) {
      debugPrint('[PushNotification] 권한 확인 오류: $e');
      return false;
    }
  }

  /// FCM 토큰을 서버에 등록
  @override
  Future<void> registerTokenToServer() async {
    if (_fcmToken == null) {
      debugPrint('[PushNotification] FCM 토큰이 없습니다.');
      return;
    }

    try {
      // 토큰 저장소에서 인증 정보 조회
      final secureStorage = SecureStorageService();
      final isAuthenticated = await secureStorage.isAuthenticated();

      if (!isAuthenticated) {
        debugPrint('[PushNotification] 인증되지 않은 사용자');
        return;
      }

      final accessToken = await secureStorage.getAccessToken();

      // 백엔드 API 호출하여 FCM 토큰 등록 (upsert)
      // 엔드포인트: POST /api/v1/users/me/devices
      // 백엔드 컨트롤러: UsersMeController.registerDevice (users-me.controller.ts)
      // [H2-push] 공유 ApiClient 사용 — SSL pinning + 표준 인터셉터(요청ID/재시도 등)를
      //   타도록 raw Dio() 직접 생성을 대체한다. baseUrl 이 appEnv.apiBaseUrl 과 동일하므로
      //   경로는 '/users/me/devices' 만 전달한다(URL 동일성 유지). Authorization 헤더와
      //   10초 타임아웃은 그대로 보존한다(인터셉터가 토큰을 재주입해도 동일 값).
      final response = await ApiClient().post(
        '/users/me/devices',
        data: {
          'fcmToken': _fcmToken,
          'platform':
              defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
        },
        options: Options(
          headers: {'Authorization': 'Bearer $accessToken'},
          sendTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );

      // 응답에서 deviceId 보관 — 로그아웃 시 비활성화에 사용 (응답 래퍼 유무 모두 대응)
      final dynamic body = response.data;
      final dynamic did = body is Map
          ? (body['deviceId'] ??
              (body['data'] is Map ? body['data']['deviceId'] : null))
          : null;
      if (did is String && did.isNotEmpty) {
        _registeredDeviceId = did;
        // [M1] 영속 저장 — 앱 강제 종료 후에도 다음 세션 로그아웃에서 비활성화 가능.
        await _persistRegisteredDeviceId(did);
      }

      debugPrint('[PushNotification] FCM 토큰 서버 등록 성공');
    } catch (e) {
      debugPrint('[PushNotification] 토큰 등록 오류: $e');
    }
  }

  /// 로그인/회원가입 성공 직후 호출 — 토큰 확보 후 서버 등록을 보장한다.
  /// 앱 최초 실행 시 미인증으로 스킵된 등록을 로그인 시점에 재시도하는 핵심 경로.
  @override
  Future<void> ensureTokenRegistered() async {
    try {
      if (Firebase.apps.isEmpty) return;
      final messaging = FirebaseMessaging.instance;
      // [2026-06-14] 부팅 시 권한 팝업을 A5 사전설명 화면으로 위임하면서, 로그인/가입
      //   완료 시점엔 사용자가 이미 A5 에서 알림을 허용/거부한 상태다. 미허용이면
      //   죽은 토큰을 서버에 등록하지 않도록 보류하고, 허용 상태에서만 토큰을 확보한다.
      //   iOS 는 getToken() 호출이 APNS 등록(registerForRemoteNotifications)을 트리거하므로
      //   A5 에서 permission_handler 로 허용한 뒤에도 정상적으로 FCM 토큰을 받는다.
      final settings = await messaging.getNotificationSettings();
      if (settings.authorizationStatus != AuthorizationStatus.authorized &&
          settings.authorizationStatus != AuthorizationStatus.provisional) {
        debugPrint(
            '[PushNotification] 알림 권한 미허용 — 토큰 등록 보류 '
            '(status=${settings.authorizationStatus})');
        return;
      }
      _fcmToken ??= await messaging.getToken();
      await registerTokenToServer();
    } catch (e) {
      debugPrint('[PushNotification] ensureTokenRegistered 오류: $e');
    }
  }

  /// 로그아웃 직전 호출 — 현재 기기 토큰을 서버에서 비활성화한다.
  /// 인증 토큰이 유효한 시점(clearAll 이전)에 호출되어야 한다.
  @override
  Future<void> unregisterTokenFromServer() async {
    // [M1] in-memory 가 비어 있으면(앱 강제 종료 후 재실행 등) 영속 저장된 deviceId 로 폴백.
    final deviceId = _registeredDeviceId ?? await _readPersistedDeviceId();
    if (deviceId == null || deviceId.isEmpty) return;
    try {
      final secureStorage = SecureStorageService();
      final accessToken = await secureStorage.getAccessToken();
      if (accessToken == null) return;
      // [H2-push] 공유 ApiClient 사용 — SSL pinning + 표준 인터셉터 경유.
      //   URL/헤더/타임아웃은 기존과 동일하게 보존한다.
      await ApiClient().delete(
        '/users/me/devices/$deviceId',
        options: Options(
          headers: {'Authorization': 'Bearer $accessToken'},
          sendTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
      _registeredDeviceId = null;
      // [M1] 비활성화 성공 후 영속 값도 정리 — 재시도/오발송 방지.
      await _clearPersistedDeviceId();
      debugPrint('[PushNotification] FCM 토큰 서버 해제 성공');
    } catch (e) {
      debugPrint('[PushNotification] 토큰 해제 오류: $e');
    }
  }

  // === [M1] deviceId 영속 저장 헬퍼 ===
  // 저장 실패는 비치명적 — 로그만 남기고 흐름을 막지 않는다(하위 호환·무크래시).

  Future<void> _persistRegisteredDeviceId(String deviceId) async {
    try {
      await _deviceIdStore.write(key: _kRegisteredDeviceIdKey, value: deviceId);
    } catch (e) {
      debugPrint('[PushNotification] deviceId 영속 저장 실패: $e');
    }
  }

  Future<String?> _readPersistedDeviceId() async {
    try {
      return await _deviceIdStore.read(key: _kRegisteredDeviceIdKey);
    } catch (e) {
      debugPrint('[PushNotification] deviceId 영속 조회 실패: $e');
      return null;
    }
  }

  Future<void> _clearPersistedDeviceId() async {
    try {
      await _deviceIdStore.delete(key: _kRegisteredDeviceIdKey);
    } catch (e) {
      debugPrint('[PushNotification] deviceId 영속 삭제 실패: $e');
    }
  }

  /// 로컬 알림 표시
  @override
  Future<void> showNotification({
    required String title,
    required String body,
    String? channelId,
    Map<String, dynamic>? payload,
  }) async {
    final channel = NotificationChannels.byId(channelId);
    final androidDetails = AndroidNotificationDetails(
      channel.id,
      channel.name,
      channelDescription: channel.description,
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      // 진동 명시 — Android 8+ 는 채널 설정이 우선하지만, 채널 진동과 동일한
      // 패턴을 지정해 pre-O 기기 및 포그라운드 표시에서도 진동을 보장한다.
      enableVibration: true,
      vibrationPattern: kNotificationVibrationPattern,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    final details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    final notificationId = DateTime.now().millisecondsSinceEpoch ~/ 1000;

    await _localNotifications.show(
      id: notificationId,
      title: title,
      body: body,
      notificationDetails: details,
      payload: payload != null ? jsonEncode(payload) : null,
    );
  }

  /// 알림 전체 삭제
  Future<void> cancelAllNotifications() async {
    await _localNotifications.cancelAll();
  }

  /// 특정 알림 삭제
  Future<void> cancelNotification(int id) async {
    await _localNotifications.cancel(id: id);
  }

  /// iOS 앱 아이콘 배지 카운트 설정 — 누적/감소 양방향을 모두 책임진다.
  ///
  ///   · 백엔드는 푸시 수신 시 `aps.badge` 로 '미확인 수' 를 올려 보낸다(누적 ↑).
  ///   · 앱은 사용자가 알림을 '확인 / 모두 읽음' 하는 순간 이 메서드로 배지를 내린다(↓).
  ///
  /// 메커니즘(추가 패키지 불필요): 알림 배너/소리 없이(presentAlert·presentSound=false)
  /// 배지만 표시하는 무음 로컬 알림을 한 번 띄운 뒤 즉시 취소한다. iOS 는 배지 값을
  /// 앱 아이콘에 영구 반영하며 알림을 취소해도 배지는 유지되므로, '보이는 알림' 없이
  /// 임의의 배지 숫자를 안정적으로 설정할 수 있다(count<=0 클리어 경로와 동일한
  /// 검증된 메커니즘을 count>0 에도 그대로 재사용).
  ///
  /// ⚠️ iOS 전용. Android 의 앱 아이콘 배지는 런처(제조사) 의존적이라 보장되지 않으므로
  ///    여기서는 처리하지 않는다(early return). Android 배지는 활성 알림의
  ///    AndroidNotificationDetails.number 를 런처가 표시 여부와 함께 결정한다.
  @override
  Future<void> updateBadgeCount(int count) async {
    if (defaultTargetPlatform != TargetPlatform.iOS) return;

    final safeCount = count < 0 ? 0 : count;
    try {
      await _setIosBadge(safeCount);
      debugPrint('[PushNotification] iOS 배지 설정: $safeCount');
    } catch (e) {
      debugPrint('[PushNotification] 배지 업데이트 오류: $e');
    }
  }

  /// iOS 앱 아이콘 배지를 0 으로 클리어한다.
  /// 알림센터 진입 · '모두 읽음' 등 사용자가 알림을 확인한 시점에 호출한다.
  @override
  Future<void> clearBadge() => updateBadgeCount(0);

  /// 무음 로컬 알림으로 iOS 배지를 [count] 로 설정(0 → 클리어)하는 내부 헬퍼.
  /// id: -1 슬롯을 재사용해 배지 전용 알림을 띄운 즉시 취소한다 — 배지 값만 잔존.
  Future<void> _setIosBadge(int count) async {
    await _localNotifications.show(
      id: -1,
      title: null,
      body: null,
      notificationDetails: NotificationDetails(
        iOS: DarwinNotificationDetails(
          presentAlert: false,
          presentBadge: true,
          presentSound: false,
          badgeNumber: count,
        ),
      ),
    );
    await _localNotifications.cancel(id: -1);
  }

  /// Bridge 응답 생성 (WebView Bridge에서 사용)
  Map<String, dynamic> createBridgeResponse({
    required String action,
    bool? granted,
    String? token,
    bool? shown,
  }) {
    return BridgeResponse.success(
      data: {
        'action': action,
        if (granted != null) 'granted': granted,
        if (token != null) 'token': token,
        if (shown != null) 'shown': shown,
      },
    ).toJson();
  }

  // === Private Methods ===

  void _onTokenRefresh(String token) {
    _fcmToken = token;
    debugPrint('[PushNotification] FCM 토큰 갱신');
    registerTokenToServer();
  }

  void _handleForegroundMessage(RemoteMessage message) {
    debugPrint('[PushNotification] 포그라운드 메시지: ${message.notification?.title}');

    // iOS는 setForegroundNotificationPresentationOptions(alert:true)로 OS가 포그라운드
    // 배너를 자동 표시하므로, flutter_local_notifications 재표시는 중복이 된다 → 스킵.
    // Android는 포그라운드에서 OS가 자동 표시하지 않으므로 로컬 알림으로 표시한다.
    if (defaultTargetPlatform == TargetPlatform.iOS) return;

    showNotification(
      title: message.notification?.title ?? '',
      body: message.notification?.body ?? '',
      channelId: _getChannelFromData(message.data),
      payload: message.data,
    );
  }

  void _handleMessageOpenedApp(RemoteMessage message) {
    debugPrint(
        '[PushNotification] 알림 탭으로 앱 열림: ${message.notification?.title}');

    final payload = NotificationPayload(
      type: message.data['type'] as String? ?? 'general',
      title: message.notification?.title,
      body: message.notification?.body,
      data: message.data,
    );

    _notificationController.add(payload);
  }

  /// 메시지 데이터에서 알림 채널 결정 — 채널 id는 [NotificationChannels]를 참조.
  String _getChannelFromData(Map<String, dynamic> data) {
    final type = data['type'] as String? ?? '';
    if (type.contains('payment')) return NotificationChannels.payment.id;
    if (type.contains('class') || type.contains('attendance')) {
      return NotificationChannels.lesson.id;
    }
    if (type.contains('notice')) return NotificationChannels.notice.id;
    return NotificationChannels.defaultChannel.id;
  }

  void _onNotificationResponse(NotificationResponse response) {
    final payloadString = response.payload;
    if (payloadString == null) return;

    try {
      final payload = jsonDecode(payloadString) as Map<String, dynamic>;
      final notificationPayload = NotificationPayload.fromJson(payload);
      _notificationController.add(notificationPayload);
    } catch (e) {
      debugPrint('[PushNotification] 페이로드 파싱 오류: $e');
    }
  }

  /// 리소스 정리
  void dispose() {
    _notificationController.close();
  }
}

/// 알림 페이로드
class NotificationPayload {
  final String type;
  final String? title;
  final String? body;
  final Map<String, dynamic>? data;

  NotificationPayload({
    required this.type,
    this.title,
    this.body,
    this.data,
  });

  factory NotificationPayload.fromJson(Map<String, dynamic> json) {
    return NotificationPayload(
      type: json['type'] as String? ?? 'general',
      title: json['title'] as String?,
      body: json['body'] as String?,
      data: json['data'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'type': type,
      'title': title,
      'body': body,
      'data': data,
    };
  }

  /// 알림 타입에 따른 라우트 결정
  String? getRoute() {
    switch (type) {
      case 'payment_success':
      case 'payment_failed':
        return '/payments/history';
      case 'class_reminder':
      case 'class_cancelled':
        return '/classes';
      case 'attendance_checked':
        return '/attendance';
      case 'membership_approved':
        return '/club/members';
      case 'notice':
        return '/notices';
      default:
        return null;
    }
  }
}
