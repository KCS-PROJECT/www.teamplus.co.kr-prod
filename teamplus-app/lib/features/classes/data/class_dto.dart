/// 요일별 기본 일정(ClassDaySchedule) — "월"~"일" + "HH:mm" 텍스트.
class ClassDayScheduleDto {
  final String dayOfWeek;
  final String startTime;
  final String endTime;

  ClassDayScheduleDto({
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
  });

  factory ClassDayScheduleDto.fromJson(Map<String, dynamic> json) =>
      ClassDayScheduleDto(
        dayOfWeek: json['dayOfWeek'] as String? ?? '',
        startTime: json['startTime'] as String? ?? '',
        endTime: json['endTime'] as String? ?? '',
      );
}

/// 다음 회차(비취소·오늘 이후 첫 회차) — 날짜 + 회차 실제 시각("HH:mm").
class ClassNextScheduleDto {
  final DateTime? scheduledDate;
  final String? startTime;
  final String? endTime;

  ClassNextScheduleDto({this.scheduledDate, this.startTime, this.endTime});

  factory ClassNextScheduleDto.fromJson(Map<String, dynamic> json) =>
      ClassNextScheduleDto(
        scheduledDate: json['scheduledDate'] != null
            ? DateTime.tryParse(json['scheduledDate'] as String)
            : null,
        startTime: json['startTime'] as String?,
        endTime: json['endTime'] as String?,
      );
}

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
  final bool isActive;
  final int enrolledCount;
  final List<ClassDayScheduleDto> daySchedules;
  final ClassNextScheduleDto? nextSchedule;

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
    required this.isActive,
    required this.enrolledCount,
    this.daySchedules = const [],
    this.nextSchedule,
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
      isActive: json['isActive'] as bool? ?? true,
      enrolledCount: (count?['enrollments'] as num?)?.toInt() ?? 0,
      daySchedules: (json['daySchedules'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ClassDayScheduleDto.fromJson)
          .toList(),
      nextSchedule: json['nextSchedule'] is Map<String, dynamic>
          ? ClassNextScheduleDto.fromJson(
              json['nextSchedule'] as Map<String, dynamic>)
          : null,
    );
  }

  /// 일정 라벨 — 요일 기본 일정 패턴 > 다음 회차(날짜+회차 시각) > '일정 미정'.
  ///  - 요일별 시간이 모두 동일: "월·수 17:00 - 18:00"
  ///  - 요일별 시간 상이: "매주 월·수" (시간은 상세에서)
  ///  - 기본 일정 없음: "다음 7/8 (화) 19:00 - 20:00"
  /// 대표값(Class.startTime)은 요일별 상이 왜곡·등록시각 오염으로 사용하지 않는다.
  String get scheduleLabel {
    if (daySchedules.isNotEmpty) {
      final days = daySchedules.map((d) => d.dayOfWeek).join('·');
      final first = daySchedules.first;
      final uniform = daySchedules.every(
          (d) => d.startTime == first.startTime && d.endTime == first.endTime);
      if (uniform && first.startTime.isNotEmpty) {
        final end = first.endTime.isNotEmpty ? ' - ${first.endTime}' : '';
        return '$days ${first.startTime}$end';
      }
      return '매주 $days';
    }
    final next = nextSchedule;
    final date = next?.scheduledDate;
    if (date != null) {
      // scheduledDate 는 @db.Date(UTC 자정) — UTC 성분이 KST 달력일과 일치.
      const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
      final day = weekdays[(date.weekday - 1) % 7];
      final start = next?.startTime;
      final time = (start != null && start.isNotEmpty)
          ? ' $start${(next?.endTime != null && next!.endTime!.isNotEmpty) ? ' - ${next.endTime}' : ''}'
          : '';
      return '다음 ${date.month}/${date.day} ($day)$time';
    }
    return '일정 미정';
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

