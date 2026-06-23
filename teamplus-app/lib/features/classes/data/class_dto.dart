import 'package:intl/intl.dart';

/// GET /api/v1/classes 응답 단건 모델
class ClassDto {
  final String id;
  final String className;
  final String? description;
  final String trainingType;
  final String instructorName;
  final int capacity;
  final int? ageMin;
  final int? ageMax;
  final String? levelRequired;
  final DateTime? startTime;
  final DateTime? endTime;
  final bool isActive;
  final int enrolledCount;

  ClassDto({
    required this.id,
    required this.className,
    this.description,
    required this.trainingType,
    required this.instructorName,
    required this.capacity,
    this.ageMin,
    this.ageMax,
    this.levelRequired,
    this.startTime,
    this.endTime,
    required this.isActive,
    required this.enrolledCount,
  });

  factory ClassDto.fromJson(Map<String, dynamic> json) {
    final count = json['_count'] as Map<String, dynamic>?;
    return ClassDto(
      id: json['id'] as String,
      className: json['className'] as String? ?? '',
      description: json['description'] as String?,
      trainingType: json['trainingType'] as String? ?? '',
      instructorName: json['instructorName'] as String? ?? '',
      capacity: (json['capacity'] as num?)?.toInt() ?? 0,
      ageMin: (json['ageMin'] as num?)?.toInt(),
      ageMax: (json['ageMax'] as num?)?.toInt(),
      levelRequired: json['levelRequired'] as String?,
      startTime: json['startTime'] != null
          ? DateTime.tryParse(json['startTime'] as String)
          : null,
      endTime: json['endTime'] != null
          ? DateTime.tryParse(json['endTime'] as String)
          : null,
      isActive: json['isActive'] as bool? ?? true,
      enrolledCount: (count?['enrollments'] as num?)?.toInt() ?? 0,
    );
  }

  /// "월요일 19:00 - 20:00" 형태의 일정 문자열
  String get scheduleLabel {
    if (startTime == null) return '일정 미정';
    final weekdays = ['월', '화', '수', '목', '금', '토', '일'];
    final day = weekdays[(startTime!.weekday - 1) % 7];
    final startStr = DateFormat('HH:mm').format(startTime!);
    final endStr =
        endTime != null ? ' - ${DateFormat('HH:mm').format(endTime!)}' : '';
    return '$day요일 $startStr$endStr';
  }

  /// "7-12세" 형태의 나이 범위 문자열
  String get ageRangeLabel {
    if (ageMin == null && ageMax == null) return '';
    if (ageMin != null && ageMax != null) return '$ageMin-$ageMax세';
    if (ageMin != null) return '$ageMin세 이상';
    return '$ageMax세 이하';
  }

  /// 남은 자리: "잔여 3자리" 또는 "마감"
  String get availabilityLabel {
    final remaining = capacity - enrolledCount;
    if (remaining <= 0) return '마감';
    return '잔여 $remaining자리';
  }
}
