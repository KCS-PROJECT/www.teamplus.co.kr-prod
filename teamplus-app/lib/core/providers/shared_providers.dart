import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';
import '../storage/secure_storage_service.dart';
import '../storage/app_preferences_service.dart';
import '../storage/offline_cache_service.dart';
import '../storage/database/local_database.dart';
import '../storage/database/local_db_service.dart';
import '../identity/identity_service.dart';
import '../constants/app_environment.dart';
import '../../features/community/data/community_api.dart';
import '../../features/clubs/data/clubs_api.dart';
import '../../features/payments/data/payments_api.dart';
import '../../features/attendance/data/attendance_api.dart';
import '../../features/classes/data/waitlist_api.dart';

// Shared API Client Provider
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

// Community API Provider
final communityApiProvider = Provider<CommunityApi>(
  (ref) => CommunityApi(ref.read(apiClientProvider)),
);

// Clubs API Provider
final clubsApiProvider = Provider<ClubsApi>(
  (ref) => ClubsApi(ref.read(apiClientProvider)),
);

// Payments API Provider
final paymentsApiProvider = Provider<PaymentsApi>(
  (ref) => PaymentsApi(ref.read(apiClientProvider)),
);

// Attendance API Provider
final attendanceApiProvider = Provider<AttendanceApi>(
  (ref) => AttendanceApi(ref.read(apiClientProvider)),
);

// Waitlist API Provider
final waitlistApiProvider = Provider<WaitlistApi>(
  (ref) => WaitlistApi(ref.read(apiClientProvider)),
);

/// 내 클럽 목록 Provider
/// - 승인된 상태의 클럽만 반환
final myClubsProvider = FutureProvider<List<UserClubDto>>((ref) async {
  final clubsApi = ref.read(clubsApiProvider);
  return clubsApi.getMyClubs();
});

/// 현재 선택된 기본 클럽 Provider
/// - 1) 백엔드에서 승인된 내 클럽 목록 조회
/// - 2) 로컬에 저장된 currentClubId 가 있으면 우선 사용
/// - 3) 없거나 유효하지 않으면 첫 번째 클럽을 기본값으로 저장 후 사용
final currentClubProvider = FutureProvider<UserClubDto?>((ref) async {
  final prefs = ref.read(appPreferencesProvider);

  final clubs = await ref.watch(myClubsProvider.future);
  if (clubs.isEmpty) {
    return null;
  }

  final savedId = await prefs.getCurrentClubId();
  if (savedId != null && savedId.isNotEmpty) {
    final existing = clubs.firstWhere(
      (c) => c.id == savedId,
      orElse: () => clubs.first,
    );

    // 저장된 ID가 목록에 없으면 첫 번째 클럽으로 갱신
    if (existing.id != savedId) {
      await prefs.setCurrentClubId(existing.id);
    }
    return existing;
  }

  final first = clubs.first;
  await prefs.setCurrentClubId(first.id);
  return first;
});

// Identity Service Provider (본인인증)
final identityServiceProvider = Provider<IdentityService>((ref) {
  final protocol = appEnv.useHttps ? 'https' : 'http';
  final baseUrl = '$protocol://${appEnv.apiHost}:${appEnv.apiPort}';
  return IdentityService(baseUrl: baseUrl);
});

// Shared Secure Storage Provider (민감한 데이터: 토큰, 사용자 정보)
final secureStorageProvider =
    Provider<SecureStorageService>((ref) => SecureStorageService());

// App Preferences Provider (일반 데이터: 온보딩, 스플래시 상태 - 앱 삭제 시 초기화됨)
final appPreferencesProvider =
    Provider<AppPreferencesService>((ref) => AppPreferencesService());

// Offline Cache Provider (Hive 기반 오프라인 데이터 캐싱)
// ⚠️ 2026-05-22 Phase A: SQLite(drift) 도입 — Phase C 에서 제거 예정.
final offlineCacheProvider =
    Provider<OfflineCacheService>((ref) => OfflineCacheService());

// SQLite (drift) 로컬 DB 단일 진입점 (2026-05-22 Phase A 신규)
//   - 사용 전 main.dart _deferredInit() 에서 LocalDbService.instance.initialize() 호출 필수.
//   - 토큰/PIN/비밀번호는 절대 저장 금지 (Keychain 격리 유지).
final localDbServiceProvider = Provider<LocalDbService>(
  (ref) => LocalDbService.instance,
);

// 직접 drift Database 접근이 필요한 경우 (raw query, transaction).
// 일반 사용은 DAO 를 통해 접근 권장.
final localDatabaseProvider = Provider<LocalDatabase>(
  (ref) => ref.watch(localDbServiceProvider).db,
);

/// 내 결제권 잔액 Provider
/// 체크인 성공 또는 결제 완료 후 invalidate 하여 최신 잔액을 조회
/// 엔드포인트: GET /credits/stats/me → availableRemaining 필드
final myCreditBalanceProvider = FutureProvider<int>((ref) async {
  final client = ref.read(apiClientProvider);
  try {
    final response = await client.get('/credits/stats/me');
    final data = response.data;
    final body = data is Map<String, dynamic> && data['data'] != null
        ? data['data'] as Map<String, dynamic>
        : (data is Map<String, dynamic> ? data : <String, dynamic>{});
    return (body['availableRemaining'] as num?)?.toInt() ?? 0;
  } catch (_) {
    return 0;
  }
});
