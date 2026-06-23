import 'app_environment.dart';

/// API 관련 상수 및 설정
/// 환경별 서버 주소는 AppEnvironment에서 관리
class ApiConstants {
  ApiConstants._();

  // ============================================================
  // 서버 URL (환경 설정에서 가져옴)
  // ============================================================

  /// API Base URL
  static String get baseUrl => appEnv.apiBaseUrl;

  /// WebView URL (React/Vue.js Web App)
  static String get webAppUrl => appEnv.webAppUrl;

  /// 현재 환경 이름
  static String get environmentName => appEnv.name;

  /// 로깅 활성화 여부
  static bool get enableLogging => appEnv.enableLogging;

  // ============================================================
  // Timeouts
  // ============================================================

  // 🎯 1초 SLA 목표에 맞춰 타임아웃 단축
  // - connect: TCP handshake 실패를 5초 내 인지 (네트워크 스위칭 대응)
  // - receive: 서버 처리 + 응답 수신 전체 10초 (RetryInterceptor 가 5xx 재시도 커버)
  // - send: 업로드는 파일 크기 따라 가변 — 업로드 서비스에서 개별 override 필요
  static const Duration connectTimeout = Duration(seconds: 5);
  static const Duration receiveTimeout = Duration(seconds: 10);
  static const Duration sendTimeout = Duration(seconds: 15);

  // ============================================================
  // API Endpoints
  // ============================================================

  // Auth
  static const String authLoginEndpoint = '/auth/login';
  static const String authRegisterEndpoint = '/auth/register';
  static const String authRefreshEndpoint = '/auth/refresh';
  static const String authProfileEndpoint = '/auth/profile';
  static const String authLogoutEndpoint = '/auth/logout';

  // Notifications
  static const String notificationsEndpoint = '/notifications';

  // Classes
  static const String classesEndpoint = '/classes';

  // Attendance
  static const String attendanceEndpoint = '/attendance';

  // Payments
  static const String paymentsEndpoint = '/payments';

  // Members
  static const String membersEndpoint = '/members';

  // Clubs
  static const String clubsEndpoint = '/clubs';

  // App settings (공개) — 앱 버전 정보 등
  static const String appSettingsEndpoint = '/app/settings';

  // 시스템 점검 공지 (공개) — 현재 활성 점검 공지(제목/내용/기간) · 서버시간 기준 판정
  static const String maintenanceNoticeEndpoint = '/app/maintenance-notice';

  // ============================================================
  // Headers
  // ============================================================

  static const String contentTypeJson = 'application/json';
  static const String acceptJson = 'application/json';
  static const String authorizationHeader = 'Authorization';
  static const String bearerPrefix = 'Bearer';

  // ============================================================
  // Error Messages
  // ============================================================

  static const String connectionTimeoutMessage =
      '연결 시간이 초과되었습니다. 네트워크를 확인해주세요.';
  static const String receiveTimeoutMessage = '응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
  static const String sendTimeoutMessage = '요청 시간이 초과되었습니다. 네트워크를 확인해주세요.';
  static const String networkErrorMessage = '네트워크 오류가 발생했습니다. 다시 시도해주세요.';
  static const String unknownErrorMessage = '알 수 없는 오류가 발생했습니다.';
  static const String unauthorizedMessage = '인증이 만료되었습니다. 다시 로그인해주세요.';
  static const String serverErrorMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
}
