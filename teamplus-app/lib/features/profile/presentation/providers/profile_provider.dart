import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/shared_providers.dart';

// ──────────────────────────────────────────────────────────
// 내 프로필 조회
// GET /users/me
// ──────────────────────────────────────────────────────────

/// 현재 사용자 프로필 조회 Provider
///
/// 백엔드 `GET /api/v1/users/me` 를 호출하여 이름, 이메일, 전화번호 등을 반환합니다.
final myProfileProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    final response = await apiClient.get('/users/me');
    final data = response.data;
    if (data is Map<String, dynamic>) {
      return data;
    }
    return null;
  } catch (e) {
    // 오류 발생 시 null 반환 → UI에서 에러 상태로 표시
    throw Exception('프로필 정보를 불러올 수 없습니다.');
  }
});

// ──────────────────────────────────────────────────────────
// 프로필 수정
// PUT /users/me/profile
// ──────────────────────────────────────────────────────────

/// 프로필 수정 Provider
///
/// [params]: `name`, `phone`, `avatarUrl` 등 변경할 필드를 담은 Map
/// 백엔드 `PUT /api/v1/users/me/profile` 를 호출합니다.
final updateProfileProvider =
    FutureProvider.family<void, Map<String, dynamic>>((ref, params) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    await apiClient.put('/users/me/profile', data: params);
  } catch (e) {
    throw Exception('프로필 수정에 실패했습니다.');
  }
});

// ──────────────────────────────────────────────────────────
// 아바타 URL 업데이트
// PUT /users/me/profile (avatarUrl 단독)
// ──────────────────────────────────────────────────────────

/// 프로필 사진(아바타) URL 업데이트 Provider
///
/// 파일 업로드 완료 후 반환된 [avatarUrl] 을 서버 프로필에 저장합니다.
/// 백엔드 `PUT /api/v1/users/me/profile` 의 `avatarUrl` 필드를 사용합니다.
final updateAvatarProvider =
    FutureProvider.family<void, String>((ref, avatarUrl) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    await apiClient.put('/users/me/profile', data: {'avatarUrl': avatarUrl});
  } catch (e) {
    throw Exception('프로필 사진 저장에 실패했습니다.');
  }
});

// ──────────────────────────────────────────────────────────
// 비밀번호 변경
// PATCH /auth/change-password
// ──────────────────────────────────────────────────────────

/// 비밀번호 변경 파라미터
typedef ChangePasswordParams = ({
  String currentPassword,
  String newPassword,
});

/// 비밀번호 변경 Provider
///
/// 백엔드 `PATCH /api/v1/auth/change-password` 를 호출합니다.
final changePasswordProvider =
    FutureProvider.family<void, ChangePasswordParams>((ref, params) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    await apiClient.patch('/auth/change-password', data: {
      'currentPassword': params.currentPassword,
      'newPassword': params.newPassword,
    });
  } catch (e) {
    throw Exception('비밀번호 변경에 실패했습니다. 현재 비밀번호를 확인해주세요.');
  }
});

// ──────────────────────────────────────────────────────────
// 알림 설정 조회 / 수정
// GET /notifications/settings  /  PATCH /notifications/settings
// ──────────────────────────────────────────────────────────

/// 알림 설정 조회 Provider
///
/// 백엔드 `GET /api/v1/notifications/settings` 를 호출합니다.
final notificationSettingsProvider =
    FutureProvider<Map<String, dynamic>>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    final response = await apiClient.get('/notifications/settings');
    final data = response.data;
    if (data is Map<String, dynamic>) {
      return data;
    }
    // 설정이 없는 경우 기본값 반환
    return _defaultNotificationSettings();
  } catch (_) {
    // 네트워크 오류 시 기본값 사용
    return _defaultNotificationSettings();
  }
});

/// 알림 설정 기본값
Map<String, dynamic> _defaultNotificationSettings() => {
      'pushEnabled': true,
      'attendanceAlert': true,
      'paymentAlert': true,
      'classReminder': true,
      'eventAlert': true,
      'marketingAlert': false,
    };

/// 알림 설정 수정 Provider
///
/// 백엔드 `PATCH /api/v1/notifications/settings` 를 호출합니다.
final updateNotificationSettingsProvider =
    FutureProvider.family<void, Map<String, dynamic>>((ref, params) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    await apiClient.patch('/notifications/settings', data: params);
  } catch (e) {
    throw Exception('알림 설정 저장에 실패했습니다.');
  }
});
