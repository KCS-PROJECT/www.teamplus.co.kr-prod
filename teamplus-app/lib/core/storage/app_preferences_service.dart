import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

/// 앱 설정 저장 서비스 (SharedPreferences 사용)
/// 민감하지 않은 데이터 저장용 - 앱 삭제 시 함께 삭제됨
class AppPreferencesService {
  static final AppPreferencesService _instance =
      AppPreferencesService._internal();

  factory AppPreferencesService() => _instance;

  AppPreferencesService._internal();

  SharedPreferences? _prefs;

  // Preference keys
  static const String _onboardingCompletedKey = 'onboarding_completed';
  static const String _splashViewedKey = 'splash_viewed';
  static const String _currentClubIdKey = 'current_club_id';
  static const String _logSessionIdKey = 'teamplus_log_session_id';

  /// 권장 업데이트 "나중에" 억제 타임스탬프 키 접두사.
  /// 실제 키 = `optional_update_dismissed_at:{platform}:{latestVersion}`.
  static const String _optionalUpdateDismissedPrefix =
      'optional_update_dismissed_at';

  /// SharedPreferences 초기화
  Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  /// SharedPreferences 인스턴스 가져오기
  Future<SharedPreferences> _getPrefs() async {
    if (_prefs == null) {
      await init();
    }
    return _prefs!;
  }

  // Onboarding
  Future<void> setOnboardingCompleted(bool completed) async {
    final prefs = await _getPrefs();
    await prefs.setBool(_onboardingCompletedKey, completed);
  }

  Future<bool> isOnboardingCompleted() async {
    final prefs = await _getPrefs();
    return prefs.getBool(_onboardingCompletedKey) ?? false;
  }

  // Splash Screen
  Future<void> setSplashViewed(bool viewed) async {
    final prefs = await _getPrefs();
    await prefs.setBool(_splashViewedKey, viewed);
  }

  Future<bool> isSplashViewed() async {
    final prefs = await _getPrefs();
    return prefs.getBool(_splashViewedKey) ?? false;
  }

  // 현재 선택된 클럽 ID (학부모/코치 공통)
  Future<void> setCurrentClubId(String? clubId) async {
    final prefs = await _getPrefs();
    if (clubId == null || clubId.isEmpty) {
      await prefs.remove(_currentClubIdKey);
    } else {
      await prefs.setString(_currentClubIdKey, clubId);
    }
  }

  Future<String?> getCurrentClubId() async {
    final prefs = await _getPrefs();
    return prefs.getString(_currentClubIdKey);
  }

  /// 익명 로그 세션 ID — 앱 사용 통계(DAU/MAU)용.
  ///   개인정보 아님(익명 난수). 앱 삭제 전까지 유지되어 재방문을 동일 세션으로 집계.
  ///   백엔드 UserActivityLog.sessionId 로 전송되어 platform='app' 활성 사용자 집계에 사용.
  Future<String> getOrCreateLogSessionId() async {
    final prefs = await _getPrefs();
    var id = prefs.getString(_logSessionIdKey);
    if (id == null || id.isEmpty) {
      final ts = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
      final rand = Random();
      final suffix =
          List.generate(8, (_) => rand.nextInt(36).toRadixString(36)).join();
      id = 'app-$ts-$suffix';
      await prefs.setString(_logSessionIdKey, id);
    }
    return id;
  }

  // 권장 업데이트 억제 (24h) — 앱 버전 게이트에서 사용
  //
  // [storeKey] 는 플랫폼·버전을 분리한 부분 키(예: "ios:1.2.0"). 접두사는 서비스가
  // 소유해 키 네임스페이스를 단일 지점에서 관리한다.
  Future<void> setOptionalUpdateDismissedAt(
      String storeKey, int epochMillis) async {
    final prefs = await _getPrefs();
    await prefs.setInt('$_optionalUpdateDismissedPrefix:$storeKey', epochMillis);
  }

  Future<int?> getOptionalUpdateDismissedAt(String storeKey) async {
    final prefs = await _getPrefs();
    return prefs.getInt('$_optionalUpdateDismissedPrefix:$storeKey');
  }

  /// 모든 설정 초기화
  Future<void> clearAll() async {
    final prefs = await _getPrefs();
    await prefs.clear();
  }
}
