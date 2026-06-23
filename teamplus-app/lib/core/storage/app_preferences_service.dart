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

  /// 모든 설정 초기화
  Future<void> clearAll() async {
    final prefs = await _getPrefs();
    await prefs.clear();
  }
}
