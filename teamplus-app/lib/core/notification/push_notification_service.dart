import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../constants/app_environment.dart';
import '../storage/secure_storage_service.dart';
import '../webview/js_bridge.dart';
import 'notification_channels.dart';

/// FCM 백그라운드 메시지 핸들러 (최상위 함수 필요)
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  debugPrint('[PushNotification] 백그라운드 메시지: ${message.notification?.title}');
}

/// 푸시 알림 서비스
///
/// Firebase Cloud Messaging(FCM) 및 로컬 알림을 처리합니다.
/// WebView Bridge와 연동하여 Web에서도 알림 기능을 사용할 수 있습니다.
class PushNotificationService {
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

  // 알림 스트림
  final StreamController<NotificationPayload> _notificationController =
      StreamController<NotificationPayload>.broadcast();

  Stream<NotificationPayload> get notificationStream =>
      _notificationController.stream;

  // 초기화 상태
  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;

  /// 서비스 초기화
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
  Future<void> _createNotificationChannels() async {
    final androidPlugin = _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    if (androidPlugin == null) return;

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
      final dio = Dio();
      final response = await dio.post(
        '${appEnv.apiBaseUrl}/users/me/devices',
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
      if (did is String && did.isNotEmpty) _registeredDeviceId = did;

      debugPrint('[PushNotification] FCM 토큰 서버 등록 성공');
    } catch (e) {
      debugPrint('[PushNotification] 토큰 등록 오류: $e');
    }
  }

  /// 로그인/회원가입 성공 직후 호출 — 토큰 확보 후 서버 등록을 보장한다.
  /// 앱 최초 실행 시 미인증으로 스킵된 등록을 로그인 시점에 재시도하는 핵심 경로.
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
  Future<void> unregisterTokenFromServer() async {
    final deviceId = _registeredDeviceId;
    if (deviceId == null) return;
    try {
      final secureStorage = SecureStorageService();
      final accessToken = await secureStorage.getAccessToken();
      if (accessToken == null) return;
      final dio = Dio();
      await dio.delete(
        '${appEnv.apiBaseUrl}/users/me/devices/$deviceId',
        options: Options(
          headers: {'Authorization': 'Bearer $accessToken'},
          sendTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
      _registeredDeviceId = null;
      debugPrint('[PushNotification] FCM 토큰 서버 해제 성공');
    } catch (e) {
      debugPrint('[PushNotification] 토큰 해제 오류: $e');
    }
  }

  /// 로컬 알림 표시
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

  /// 배지 카운트 업데이트 (iOS)
  Future<void> updateBadgeCount(int count) async {
    if (defaultTargetPlatform != TargetPlatform.iOS) return;

    try {
      // 배지 카운트 0 처리
      if (count <= 0) {
        await _localNotifications
            .resolvePlatformSpecificImplementation<
                IOSFlutterLocalNotificationsPlugin>()
            ?.requestPermissions(badge: true);
        // 배지 초기화: 빈 알림으로 배지 0 설정
        await _localNotifications.show(
          id: -1,
          title: null,
          body: null,
          notificationDetails: const NotificationDetails(
            iOS: DarwinNotificationDetails(
              presentAlert: false,
              presentBadge: true,
              presentSound: false,
              badgeNumber: 0,
            ),
          ),
        );
        await _localNotifications.cancel(id: -1);
        return;
      }

      // FCM으로 배지 업데이트 (서버 측에서 badge 값 포함한 APNs silent push 사용)
      debugPrint('[PushNotification] iOS 배지 업데이트: $count');
    } catch (e) {
      debugPrint('[PushNotification] 배지 업데이트 오류: $e');
    }
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
