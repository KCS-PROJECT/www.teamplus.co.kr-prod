import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// JWT 토큰 저장 및 관리 서비스
class TokenStorage {
  static final TokenStorage _instance = TokenStorage._internal();

  factory TokenStorage() => _instance;

  TokenStorage._internal();

  final _storage = const FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock,
    ),
  );

  // Storage keys
  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String _tokenExpiryKey = 'token_expiry';
  static const String _userIdKey = 'user_id';
  static const String _userTypeKey = 'user_type';
  static const String _userNameKey = 'user_name';
  static const String _userEmailKey = 'user_email';

  // 🔐 생체인증 관련 keys
  static const String _biometricEnabledKey = 'biometric_enabled';
  static const String _appLockedKey = 'app_locked';
  static const String _sessionTimeoutMinutesKey = 'session_timeout_minutes';

  // 🎛️ UI 설정 keys
  static const String _drawerPositionKey =
      'drawer_position'; // 'left' | 'right'

  /// Access Token 저장
  Future<void> saveAccessToken(String token) async {
    await _storage.write(key: _accessTokenKey, value: token);
  }

  /// Access Token 조회
  Future<String?> getAccessToken() async {
    return await _storage.read(key: _accessTokenKey);
  }

  /// Refresh Token 저장
  Future<void> saveRefreshToken(String token) async {
    await _storage.write(key: _refreshTokenKey, value: token);
  }

  /// Refresh Token 조회
  Future<String?> getRefreshToken() async {
    return await _storage.read(key: _refreshTokenKey);
  }

  /// 토큰 만료 시간 저장 (Unix timestamp)
  Future<void> saveTokenExpiry(int expiryTimestamp) async {
    await _storage.write(
      key: _tokenExpiryKey,
      value: expiryTimestamp.toString(),
    );
  }

  /// 토큰 만료 시간 조회
  Future<int?> getTokenExpiry() async {
    final expiry = await _storage.read(key: _tokenExpiryKey);
    return expiry != null ? int.tryParse(expiry) : null;
  }

  /// 토큰이 만료되었는지 확인 (ms/s 단위 혼재 자동 처리)
  Future<bool> isTokenExpired() async {
    final expiry = await getTokenExpiry();
    return _isExpiryPast(expiry);
  }

  /// User ID 저장
  Future<void> saveUserId(String userId) async {
    await _storage.write(key: _userIdKey, value: userId);
  }

  /// User ID 조회
  Future<String?> getUserId() async {
    return await _storage.read(key: _userIdKey);
  }

  /// User Type 저장 (parent | coach | admin | child)
  Future<void> saveUserType(String userType) async {
    await _storage.write(key: _userTypeKey, value: userType);
  }

  /// User Type 조회
  Future<String?> getUserType() async {
    return await _storage.read(key: _userTypeKey);
  }

  /// User Name 저장
  Future<void> saveUserName(String name) async {
    await _storage.write(key: _userNameKey, value: name);
  }

  /// User Name 조회
  Future<String?> getUserName() async {
    return await _storage.read(key: _userNameKey);
  }

  /// User Email 저장
  Future<void> saveUserEmail(String email) async {
    await _storage.write(key: _userEmailKey, value: email);
  }

  /// User Email 조회
  Future<String?> getUserEmail() async {
    return await _storage.read(key: _userEmailKey);
  }

  /// 인증 상태 확인
  Future<bool> isAuthenticated() async {
    final token = await getAccessToken();
    if (token == null || token.isEmpty) return false;

    final isExpired = await isTokenExpired();
    return !isExpired;
  }

  /// 모든 토큰 및 사용자 정보 삭제 (로그아웃)
  Future<void> clearAll() async {
    invalidateAuthBundleCache();
    await _storage.deleteAll();
  }

  /// 토큰 정보를 Map으로 반환 (WebView 전달용)
  ///
  /// ⚡ Cold Start 최적화: 6회 직렬 I/O → 6회 병렬 I/O
  /// (FlutterSecureStorage 는 각 read 가 독립적이므로 병렬 가능)
  Future<Map<String, String?>> getTokenInfo() async {
    final results = await Future.wait([
      getAccessToken(),
      getRefreshToken(),
      getUserId(),
      getUserType(),
      getUserName(),
      getUserEmail(),
    ]);
    return {
      'accessToken': results[0],
      'refreshToken': results[1],
      'userId': results[2],
      'userType': results[3],
      'userName': results[4],
      'userEmail': results[5],
    };
  }

  /// ⚡ 인증/유저 프로파일 묶음 읽기 (Cold Start 최적화)
  ///
  /// Splash + WebViewScreen 이 공유하는 핵심 프로파일을 **한 번의 Future.wait**
  /// 로 병렬 로드. 기존에는 Splash에서 2회 + WebView에서 3회 = 총 5회가 직렬로
  /// 수행되어 ~250-500ms 블로킹 되던 구간을 ~50-100ms 로 단축.
  ///
  /// 결과는 짧은 TTL 로 메모리 캐시되어, Splash 이후 WebView가 다시 부를 때
  /// 즉시 반환됨. 로그아웃/토큰 갱신 시 [invalidateAuthBundleCache] 호출 필수.
  static const Duration _authBundleTtl = Duration(seconds: 30);
  AuthBundle? _cachedAuthBundle;
  DateTime? _cachedAuthBundleAt;

  /// 진행 중인 read Future — 콜드스타트 동시 다중 호출이 단일 7-read 를 공유하도록
  /// 메모이제이션. 완료/실패 시 finally 에서 null 정리.
  Future<AuthBundle>? _inFlightAuthBundle;

  Future<AuthBundle> readAuthBundle({bool force = false}) async {
    if (!force && _cachedAuthBundle != null && _cachedAuthBundleAt != null) {
      final age = DateTime.now().difference(_cachedAuthBundleAt!);
      if (age < _authBundleTtl) {
        return _cachedAuthBundle!;
      }
    }

    // 강제 새로고침은 공유 가드를 우회 — 항상 새 read 수행.
    if (force) {
      return _doReadAuthBundle();
    }

    // [2026-05-30 perf · FL-05] 진행 중인 동일 read 가 있으면 그 Future 를 공유.
    //   콜드스타트 동시 3 호출(early preload / authStateProvider /
    //   resolveInitialDestination)이 단일 Keychain 7-read 로 합쳐져 채널 경합·중복
    //   I/O 를 제거한다. 호출부 변경 0건.
    final inflight = _inFlightAuthBundle;
    if (inflight != null) return inflight;

    final future = _doReadAuthBundle();
    _inFlightAuthBundle = future;
    try {
      return await future;
    } finally {
      if (identical(_inFlightAuthBundle, future)) {
        _inFlightAuthBundle = null;
      }
    }
  }

  /// 실제 Keychain 묶음 read (병렬 7-read + 파싱 + 캐시 저장).
  /// [readAuthBundle] 이 캐시·in-flight 가드를 통과한 뒤에만 호출된다.
  Future<AuthBundle> _doReadAuthBundle() async {
    // ⚡ iOS 26+ / iPhone 17 시리즈 Keychain 응답 지연 방어
    // SecItemCopyMatching 이 플랫폼 호환/디바이스 락 이슈로 응답하지 않아도
    // Splash 가 영원히 멈추지 않도록 timeout 후 빈 번들로 폴백.
    //
    // 2026-05-16: 콜드 스타트 SLA 4s 대응 — 5s → 1.5s 단축.
    //   정상 Keychain 응답은 100-200ms 내 완료 (Apple docs 기준).
    //   1.5s 는 iOS 26+ MainThread 블록 case 대응 충분 + 콜드 스타트 미저해.
    //   메모리 캐시(30s TTL) + main.dart warmup 으로 재시작 시 0ms 응답.
    final results = await Future.wait([
      _storage.read(key: _accessTokenKey),
      _storage.read(key: _tokenExpiryKey),
      _storage.read(key: _userIdKey),
      _storage.read(key: _userTypeKey),
      _storage.read(key: _userNameKey),
      _storage.read(key: _userEmailKey),
      _storage.read(key: _drawerPositionKey),
    ]).timeout(
      const Duration(milliseconds: 1500),
      onTimeout: () {
        // [보안 2026-06-07] release 로그 누출 방지 — 디버그에서만 출력
        if (kDebugMode) {
          // ignore: avoid_print
          print(
            '[TokenStorage] ⚠️ readAuthBundle 1.5s timeout — Keychain 응답 없음. '
            '빈 번들 반환 (미인증 상태로 진행)',
          );
        }
        return <String?>[null, null, null, null, null, null, null];
      },
    );

    final token = results[0];
    final expiryStr = results[1];
    final expiry = expiryStr != null ? int.tryParse(expiryStr) : null;
    // ⚠️ 단위 호환성: 본 프로젝트는 두 저장 체계가 혼재한다.
    //   - SecureStorageService.saveTokenExpiryFromJwt: ms 단위 (exp * 1000)
    //   - Web Bridge saveTokenInfo.expiryTimestamp: s 단위 (JWT exp 원형)
    // 둘 다 같은 Keychain 키 `token_expiry` 를 공유하므로, 비교 시점에
    // 값의 자리수로 단위를 판별한다. ms 은 ~10^12, s 는 ~10^10.
    //   임계값 10^11 보다 크면 ms, 작으면 s 로 해석.
    final isExpired = _isExpiryPast(expiry);

    final bundle = AuthBundle(
      accessToken: token,
      tokenExpiry: expiry,
      isAuthenticated: token != null && token.isNotEmpty && !isExpired,
      userId: results[2],
      userType: results[3],
      userName: results[4],
      userEmail: results[5],
      drawerPosition: results[6] ?? 'right',
    );

    _cachedAuthBundle = bundle;
    _cachedAuthBundleAt = DateTime.now();
    return bundle;
  }

  void invalidateAuthBundleCache() {
    _cachedAuthBundle = null;
    _cachedAuthBundleAt = null;
    // 진행 중이던 read 가 stale 번들을 반환하지 않도록 in-flight 도 함께 정리.
    _inFlightAuthBundle = null;
  }

  /// expiry 값이 ms/s 혼재 저장 체계 양쪽에서 모두 "이미 지난 시각"인지 판정.
  /// - null → 만료로 간주 (안전한 기본값)
  /// - > 10^11 → 밀리초 단위로 해석 (기본 2001년 이후만 ms)
  /// - 그 외 → 초 단위로 해석
  static bool _isExpiryPast(int? expiry) {
    if (expiry == null) return true;
    const msThreshold = 100000000000; // 10^11
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    if (expiry > msThreshold) {
      return nowMs >= expiry;
    }
    return (nowMs ~/ 1000) >= expiry;
  }

  /// 토큰 정보 일괄 저장
  ///
  /// ⚡ 병렬 write + 캐시 무효화 — 로그인/토큰 갱신 직후 readAuthBundle() 가
  /// 스테일 bundle 을 반환하는 것을 방지
  Future<void> saveTokenInfo({
    required String accessToken,
    String? refreshToken,
    int? expiryTimestamp,
    String? userId,
    String? userType,
    String? userName,
    String? userEmail,
  }) async {
    // 캐시 먼저 무효화 — 병렬 write 중 readAuthBundle 이 호출되어도 스테일 값 반환 안 함
    invalidateAuthBundleCache();

    await Future.wait([
      saveAccessToken(accessToken),
      if (refreshToken != null) saveRefreshToken(refreshToken),
      if (expiryTimestamp != null) saveTokenExpiry(expiryTimestamp),
      if (userId != null) saveUserId(userId),
      if (userType != null) saveUserType(userType),
      if (userName != null) saveUserName(userName),
      if (userEmail != null) saveUserEmail(userEmail),
    ]);
  }

  // 🔐 생체인증 활성화 여부 저장
  Future<void> setBiometricEnabled(bool enabled) async {
    await _storage.write(
      key: _biometricEnabledKey,
      value: enabled.toString(),
    );
  }

  /// 생체인증 활성화 여부 조회
  Future<bool?> getBiometricEnabled() async {
    final value = await _storage.read(key: _biometricEnabledKey);
    return value != null ? value.toLowerCase() == 'true' : null;
  }

  /// 앱 잠금 상태 저장
  Future<void> setAppLocked(bool locked) async {
    await _storage.write(
      key: _appLockedKey,
      value: locked.toString(),
    );
  }

  /// 앱 잠금 상태 조회
  Future<bool?> getAppLocked() async {
    final value = await _storage.read(key: _appLockedKey);
    return value != null ? value.toLowerCase() == 'true' : null;
  }

  /// 자동 잠금 타임아웃(분) 저장
  Future<void> setSessionTimeoutMinutes(int minutes) async {
    await _storage.write(
      key: _sessionTimeoutMinutesKey,
      value: minutes.toString(),
    );
  }

  /// 자동 잠금 타임아웃(분) 조회 (기본값: 30)
  Future<int> getSessionTimeoutMinutes() async {
    final value = await _storage.read(key: _sessionTimeoutMinutesKey);
    final parsed = value != null ? int.tryParse(value) : null;
    return parsed != null && parsed > 0 ? parsed : 30;
  }

  // 🎛️ UI 설정 관련 메서드

  /// Drawer 위치 저장 ('left' | 'right')
  Future<void> saveDrawerPosition(String position) async {
    await _storage.write(key: _drawerPositionKey, value: position);
  }

  /// Drawer 위치 조회 (기본값: 'right')
  Future<String> getDrawerPosition() async {
    final value = await _storage.read(key: _drawerPositionKey);
    return value ?? 'right';
  }
}

/// ⚡ 인증 + 유저 프로파일 묶음 (Cold Start 최적화)
///
/// [TokenStorage.readAuthBundle] 이 단일 Future.wait 로 모든 필드를 병렬 로드한 결과.
/// Splash, WebViewScreen 이 공유하여 추가 I/O 없이 즉시 사용 가능.
class AuthBundle {
  final String? accessToken;
  final int? tokenExpiry;
  final bool isAuthenticated;
  final String? userId;
  final String? userType;
  final String? userName;
  final String? userEmail;
  final String drawerPosition;

  const AuthBundle({
    required this.accessToken,
    required this.tokenExpiry,
    required this.isAuthenticated,
    required this.userId,
    required this.userType,
    required this.userName,
    required this.userEmail,
    required this.drawerPosition,
  });

  /// Cold start 단계에서 Keychain timeout 또는 초기화 실패 시 사용하는
  /// 미인증 폴백 번들. Splash 가 무한 대기하지 않고 /login 으로 진행하게 한다.
  factory AuthBundle.empty() {
    return const AuthBundle(
      accessToken: null,
      tokenExpiry: null,
      isAuthenticated: false,
      userId: null,
      userType: null,
      userName: null,
      userEmail: null,
      drawerPosition: 'right',
    );
  }
}
