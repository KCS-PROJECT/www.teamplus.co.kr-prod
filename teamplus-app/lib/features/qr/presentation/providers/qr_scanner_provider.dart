import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/shared_providers.dart';

/// 출석 체크인 결과
class CheckInResult {
  final String id;
  final String scheduleId;
  final String attendanceStatus;
  final bool creditDeducted;
  final int? remainingCredits;

  const CheckInResult({
    required this.id,
    required this.scheduleId,
    required this.attendanceStatus,
    required this.creditDeducted,
    this.remainingCredits,
  });

  factory CheckInResult.fromJson(Map<String, dynamic> json) {
    return CheckInResult(
      id: json['id'] as String? ?? '',
      scheduleId: json['scheduleId'] as String? ?? '',
      attendanceStatus: json['attendanceStatus'] as String? ?? 'present',
      creditDeducted: json['creditDeducted'] as bool? ?? false,
      remainingCredits: json['remainingCredits'] as int?,
    );
  }
}

/// 출석 체크인 Provider (QR 스캔 후 서버에 출석 체크인 요청)
///
/// Backend 스펙: `POST /attendance/check-in` body `{ qrData: UUID, childId?: string }`
/// - `qrData`: 코치 발급 QR 의 UUID v4 (AttendanceQR.qrData)
/// - `childId`: 학부모 대리 체크인 시 자녀 User ID (선택)
final checkInAttendanceProvider =
    FutureProvider.family<CheckInResult, ({String qrData, String? childId})>(
  (ref, params) async {
    final apiClient = ref.watch(apiClientProvider);

    try {
      final response = await apiClient.post(
        '/attendance/check-in',
        data: {
          'qrData': params.qrData,
          if (params.childId != null) 'childId': params.childId,
        },
      );

      final data = response.data;
      final resultData = data is Map<String, dynamic> && data['data'] != null
          ? data['data'] as Map<String, dynamic>
          : (data is Map<String, dynamic> ? data : <String, dynamic>{});

      if (kDebugMode) {
        debugPrint('[QR] 체크인 성공: qrData=${params.qrData}');
      }

      // 결제권 잔액 provider 무효화 (체크인 성공 시 결제권 차감됨)
      ref.invalidate(myCreditBalanceProvider);

      return CheckInResult.fromJson(resultData);
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final message = e.response?.data is Map
          ? (e.response!.data as Map)['message'] as String?
          : null;

      if (statusCode == 401) throw Exception('인증이 만료되었습니다. 다시 로그인해주세요.');
      if (statusCode == 404) throw Exception('수업 정보를 찾을 수 없습니다.');
      if (statusCode == 409) throw Exception(message ?? '이미 출석 체크되었습니다.');
      if (statusCode == 422) throw Exception(message ?? '결제권이 부족합니다.');

      throw Exception(message ?? '출석 체크인에 실패했습니다. 다시 시도해주세요.');
    } catch (e) {
      throw Exception('출석 체크인 중 오류가 발생했습니다.');
    }
  },
);
