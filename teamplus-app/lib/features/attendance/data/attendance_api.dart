import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../../core/network/api_client.dart';

/// 출석 기록 DTO
class AttendanceDto {
  final String id;
  final String memberId;
  final String scheduleId;
  final String attendanceStatus;
  final DateTime? checkedInAt;
  final bool creditDeducted;
  final String? note;
  final String? className;
  final String? memberName;
  final DateTime? scheduledDate;

  AttendanceDto({
    required this.id,
    required this.memberId,
    required this.scheduleId,
    required this.attendanceStatus,
    this.checkedInAt,
    this.creditDeducted = false,
    this.note,
    this.className,
    this.memberName,
    this.scheduledDate,
  });

  factory AttendanceDto.fromJson(Map<String, dynamic> json) {
    return AttendanceDto(
      id: json['id'] as String,
      memberId: json['memberId'] as String,
      scheduleId: json['scheduleId'] as String,
      attendanceStatus: json['attendanceStatus'] as String,
      checkedInAt: json['checkedInAt'] != null
          ? DateTime.parse(json['checkedInAt'] as String)
          : null,
      creditDeducted: json['creditDeducted'] as bool? ?? false,
      note: json['note'] as String?,
      className: json['className'] as String?,
      memberName: json['memberName'] as String?,
      scheduledDate: json['scheduledDate'] != null
          ? DateTime.parse(json['scheduledDate'] as String)
          : null,
    );
  }

  /// 출석 상태 한글 표시 (2026-05-12 회의록 결정 — 3-state)
  String get statusText {
    switch (attendanceStatus.toLowerCase()) {
      case 'present':
        return '출석';
      case 'absent':
        return '결석';
      case 'unchecked':
        return '미확인';
      default:
        return attendanceStatus;
    }
  }

  /// 출석 여부
  bool get isPresent => attendanceStatus.toLowerCase() == 'present';
}

/// 출석 체크 결과 DTO
class CheckInResultDto {
  final String id;
  final String memberId;
  final String scheduleId;
  final String attendanceStatus;
  final DateTime checkedInAt;
  final bool creditDeducted;

  CheckInResultDto({
    required this.id,
    required this.memberId,
    required this.scheduleId,
    required this.attendanceStatus,
    required this.checkedInAt,
    required this.creditDeducted,
  });

  factory CheckInResultDto.fromJson(Map<String, dynamic> json) {
    return CheckInResultDto(
      id: json['id'] as String,
      memberId: json['memberId'] as String,
      scheduleId: json['scheduleId'] as String,
      attendanceStatus: json['attendanceStatus'] as String,
      checkedInAt: DateTime.parse(json['checkedInAt'] as String),
      creditDeducted: json['creditDeducted'] as bool? ?? false,
    );
  }
}

/// 일정별 출석 현황 DTO
class ScheduleAttendanceDto {
  final String scheduleId;
  final DateTime scheduledDate;
  final bool isCancelled;
  final int total;
  final int present;
  final int absent;
  final int late;
  final String presentRate;
  final List<AttendanceDto> attendances;

  ScheduleAttendanceDto({
    required this.scheduleId,
    required this.scheduledDate,
    required this.isCancelled,
    required this.total,
    required this.present,
    required this.absent,
    required this.late,
    required this.presentRate,
    required this.attendances,
  });

  factory ScheduleAttendanceDto.fromJson(Map<String, dynamic> json) {
    final attendanceList = json['attendances'] as List<dynamic>? ?? [];
    return ScheduleAttendanceDto(
      scheduleId: json['scheduleId'] as String,
      scheduledDate: DateTime.parse(json['scheduledDate'] as String),
      isCancelled: json['isCancelled'] as bool? ?? false,
      total: json['total'] as int? ?? 0,
      present: json['present'] as int? ?? 0,
      absent: json['absent'] as int? ?? 0,
      late: json['late'] as int? ?? 0,
      presentRate: json['presentRate'] as String? ?? '0',
      attendances: attendanceList
          .map((e) => AttendanceDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// 출석 통계 DTO
class AttendanceStatsDto {
  final int totalSessions;
  final int totalPresent;
  final int totalAbsent;
  final int totalLate;
  final String presentRate;

  AttendanceStatsDto({
    required this.totalSessions,
    required this.totalPresent,
    required this.totalAbsent,
    required this.totalLate,
    required this.presentRate,
  });

  factory AttendanceStatsDto.fromJson(Map<String, dynamic> json) {
    return AttendanceStatsDto(
      totalSessions: json['totalSessions'] as int? ?? 0,
      totalPresent: json['totalPresent'] as int? ?? 0,
      totalAbsent: json['totalAbsent'] as int? ?? 0,
      totalLate: json['totalLate'] as int? ?? 0,
      presentRate: json['presentRate'] as String? ?? '0',
    );
  }
}

/// 출석 API 서비스
class AttendanceApi {
  final ApiClient _client;

  AttendanceApi(this._client);

  /// QR 코드로 출석 체크
  ///
  /// Backend 스펙: `POST /attendance/check-in` body `{ qrData: UUID, childId?: string }`
  /// - [qrData]: 코치 발급 QR의 UUID v4
  /// - [childId]: 학부모가 자녀 대신 체크인할 때 자녀 User ID (선택)
  Future<CheckInResultDto> checkIn({
    required String qrData,
    String? childId,
  }) async {
    try {
      final Response response = await _client.post(
        '/attendance/check-in',
        data: {
          'qrData': qrData,
          if (childId != null) 'childId': childId,
        },
      );

      final data = response.data;
      final resultData = data is Map<String, dynamic> && data['data'] != null
          ? data['data'] as Map<String, dynamic>
          : data as Map<String, dynamic>;

      return CheckInResultDto.fromJson(resultData);
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[AttendanceApi] checkIn error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 회원 출석 기록 조회
  Future<List<AttendanceDto>> getMemberAttendanceHistory(
    String memberId, {
    int limit = 10,
  }) async {
    try {
      final Response response = await _client.get(
        '/attendance/member/$memberId',
        queryParameters: {'limit': limit},
      );

      final data = response.data;
      final List<dynamic> rawList =
          data is Map<String, dynamic> && data['data'] is List
              ? data['data'] as List
              : (data is List ? data : []);

      return rawList
          .map((e) => AttendanceDto.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[AttendanceApi] getMemberAttendanceHistory error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 일정별 출석 현황 조회
  Future<ScheduleAttendanceDto> getScheduleAttendance(String scheduleId) async {
    try {
      final Response response = await _client.get(
        '/attendance/schedule/$scheduleId',
      );

      final data = response.data;
      final resultData = data is Map<String, dynamic> && data['data'] != null
          ? data['data'] as Map<String, dynamic>
          : data as Map<String, dynamic>;

      return ScheduleAttendanceDto.fromJson(resultData);
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[AttendanceApi] getScheduleAttendance error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 수업별 출석 통계 조회
  Future<AttendanceStatsDto> getClassAttendanceStats(String classId) async {
    try {
      final Response response = await _client.get(
        '/attendance/class/$classId/stats',
      );

      final data = response.data;
      final resultData = data is Map<String, dynamic> && data['data'] != null
          ? data['data'] as Map<String, dynamic>
          : data as Map<String, dynamic>;

      return AttendanceStatsDto.fromJson(resultData);
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[AttendanceApi] getClassAttendanceStats error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 출석 상세 조회
  Future<AttendanceDto> getAttendanceDetail(String attendanceId) async {
    try {
      final Response response = await _client.get(
        '/attendance/$attendanceId',
      );

      final data = response.data;
      final resultData = data is Map<String, dynamic> && data['data'] != null
          ? data['data'] as Map<String, dynamic>
          : data as Map<String, dynamic>;

      return AttendanceDto.fromJson(resultData);
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[AttendanceApi] getAttendanceDetail error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }
}
