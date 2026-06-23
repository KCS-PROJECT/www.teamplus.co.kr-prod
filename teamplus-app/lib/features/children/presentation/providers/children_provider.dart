import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/shared_providers.dart';

// ──────────────────────────────────────────────────────────
// 자녀 목록 조회
// GET /children
// ──────────────────────────────────────────────────────────

/// 내 자녀 목록 조회 Provider
///
/// 백엔드 `GET /api/v1/children` 를 호출하여 자녀 목록을 반환합니다.
/// 응답: { success: true, data: [...], total: N }
final myChildrenProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    final response = await apiClient.get('/children');
    final data = response.data;
    if (data is Map<String, dynamic> && data['data'] is List) {
      return (data['data'] as List)
          .map((e) => e as Map<String, dynamic>)
          .toList();
    }
    return [];
  } catch (e) {
    throw Exception('자녀 목록을 불러올 수 없습니다.');
  }
});

// ──────────────────────────────────────────────────────────
// 자녀 상세 조회
// GET /children/:childId
// ──────────────────────────────────────────────────────────

/// 자녀 상세 조회 Provider
///
/// 백엔드 `GET /api/v1/children/:childId` 를 호출합니다.
final childDetailProvider =
    FutureProvider.family<Map<String, dynamic>?, String>((ref, childId) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    final response = await apiClient.get('/children/$childId');
    final data = response.data;
    if (data is Map<String, dynamic> && data['data'] != null) {
      return data['data'] as Map<String, dynamic>;
    }
    return null;
  } catch (e) {
    throw Exception('자녀 정보를 불러올 수 없습니다.');
  }
});

// ──────────────────────────────────────────────────────────
// 자녀 등록
// POST /children
// ──────────────────────────────────────────────────────────

/// 자녀 등록 파라미터
typedef CreateChildParams = ({
  String firstName,
  String lastName,
  String birthDate,
  String email,
  String password,
  String? phone,
  String? gender,
  String? relationship,
  String? note,
});

/// 자녀 등록 Provider
///
/// 백엔드 `POST /api/v1/children` 를 호출합니다.
final createChildProvider =
    FutureProvider.family<Map<String, dynamic>, CreateChildParams>(
        (ref, params) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    final response = await apiClient.post('/children', data: {
      'firstName': params.firstName,
      'lastName': params.lastName,
      'birthDate': params.birthDate,
      'email': params.email,
      'password': params.password,
      if (params.phone != null) 'phone': params.phone,
      if (params.gender != null) 'gender': params.gender,
      if (params.relationship != null) 'relationship': params.relationship,
      if (params.note != null) 'note': params.note,
    });
    final data = response.data;
    if (data is Map<String, dynamic> && data['data'] != null) {
      return data['data'] as Map<String, dynamic>;
    }
    return data as Map<String, dynamic>;
  } catch (e) {
    throw Exception('자녀 등록에 실패했습니다. 입력 정보를 확인해주세요.');
  }
});

// ──────────────────────────────────────────────────────────
// 자녀 정보 수정
// PUT /children/:childId
// ──────────────────────────────────────────────────────────

/// 자녀 수정 파라미터
typedef UpdateChildParams = ({
  String childId,
  Map<String, dynamic> data,
});

/// 자녀 정보 수정 Provider
///
/// 백엔드 `PUT /api/v1/children/:childId` 를 호출합니다.
final updateChildProvider =
    FutureProvider.family<Map<String, dynamic>, UpdateChildParams>(
        (ref, params) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    final response = await apiClient.put(
      '/children/${params.childId}',
      data: params.data,
    );
    final data = response.data;
    if (data is Map<String, dynamic> && data['data'] != null) {
      return data['data'] as Map<String, dynamic>;
    }
    return data as Map<String, dynamic>;
  } catch (e) {
    throw Exception('자녀 정보 수정에 실패했습니다.');
  }
});

// ──────────────────────────────────────────────────────────
// 자녀 삭제
// DELETE /children/:childId
// ──────────────────────────────────────────────────────────

/// 자녀 삭제 Provider
///
/// 백엔드 `DELETE /api/v1/children/:childId` 를 호출합니다.
final deleteChildProvider =
    FutureProvider.family<void, String>((ref, childId) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    await apiClient.delete('/children/$childId');
  } catch (e) {
    throw Exception('자녀 삭제에 실패했습니다.');
  }
});

// ──────────────────────────────────────────────────────────
// 자녀 연결 해제
// DELETE /children/:childId/link
// ──────────────────────────────────────────────────────────

/// 자녀 연결 해제 Provider
///
/// 백엔드 `DELETE /api/v1/children/:childId/link` 를 호출합니다.
/// 학부모-자녀 관계만 삭제하고 자녀 계정은 유지합니다.
final unlinkChildProvider =
    FutureProvider.family<void, String>((ref, childId) async {
  final apiClient = ref.watch(apiClientProvider);
  try {
    await apiClient.delete('/children/$childId/link');
  } catch (e) {
    throw Exception('자녀 연결 해제에 실패했습니다.');
  }
});

// ──────────────────────────────────────────────────────────
// 현재 선택된 자녀 (복수 자녀 전환 지원)
// ──────────────────────────────────────────────────────────

/// 현재 선택된 자녀 인덱스 Notifier
///
/// 사용: `ref.read(selectedChildIndexProvider.notifier).setIndex(2)`
class SelectedChildIndexNotifier extends Notifier<int> {
  @override
  int build() => 0;

  void setIndex(int index) => state = index;
}

final selectedChildIndexProvider =
    NotifierProvider<SelectedChildIndexNotifier, int>(
        SelectedChildIndexNotifier.new);

/// 현재 선택된 자녀 데이터
///
/// 자녀 목록에서 선택된 인덱스의 자녀를 반환합니다.
final selectedChildProvider =
    FutureProvider<Map<String, dynamic>?>((ref) async {
  final children = await ref.watch(myChildrenProvider.future);
  final selectedIndex = ref.watch(selectedChildIndexProvider);

  if (children.isEmpty) return null;
  if (selectedIndex >= children.length) return children.first;
  return children[selectedIndex];
});
