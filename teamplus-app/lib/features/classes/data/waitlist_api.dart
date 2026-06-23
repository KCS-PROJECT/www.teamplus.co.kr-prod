import '../../../core/network/api_client.dart';

/// 대기자 정보 모델
class WaitlistDto {
  final String id;
  final String classId;
  final String className;
  final String? scheduleId;
  final String userId;
  final String? childId;
  final String? childName;
  final int position;
  final String status; // WAITING, CONFIRMED, CANCELLED, EXPIRED
  final DateTime? notifiedAt;
  final DateTime? confirmedAt;
  final DateTime? expiresAt;
  final DateTime createdAt;

  WaitlistDto({
    required this.id,
    required this.classId,
    required this.className,
    this.scheduleId,
    required this.userId,
    this.childId,
    this.childName,
    required this.position,
    required this.status,
    this.notifiedAt,
    this.confirmedAt,
    this.expiresAt,
    required this.createdAt,
  });

  factory WaitlistDto.fromJson(Map<String, dynamic> json) {
    return WaitlistDto(
      id: json['id'] as String,
      classId: json['classId'] as String,
      className: json['className'] as String? ?? '',
      scheduleId: json['scheduleId'] as String?,
      userId: json['userId'] as String,
      childId: json['childId'] as String?,
      childName: json['childName'] as String?,
      position: (json['position'] as num).toInt(),
      status: json['status'] as String,
      notifiedAt: json['notifiedAt'] != null
          ? DateTime.parse(json['notifiedAt'] as String)
          : null,
      confirmedAt: json['confirmedAt'] != null
          ? DateTime.parse(json['confirmedAt'] as String)
          : null,
      expiresAt: json['expiresAt'] != null
          ? DateTime.parse(json['expiresAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  bool get isWaiting => status == 'WAITING';
  bool get isPromoted => status == 'CONFIRMED' && confirmedAt == null;
  bool get isConfirmed => status == 'CONFIRMED' && confirmedAt != null;

  /// 승격 후 확정 기한 내인지 확인
  bool get isWithinConfirmationWindow {
    if (expiresAt == null) return false;
    return DateTime.now().isBefore(expiresAt!);
  }
}

/// 대기자 API 클라이언트
class WaitlistApi {
  final ApiClient _client;

  WaitlistApi(this._client);

  /// 대기 등록
  Future<WaitlistDto> createWaitlist({
    required String classId,
    String? childId,
  }) async {
    final response = await _client.post(
      '/api/v1/waitlist',
      data: {
        'classId': classId,
        if (childId != null) 'childId': childId,
      },
    );
    return WaitlistDto.fromJson(response.data['data'] as Map<String, dynamic>);
  }

  /// 내 대기 목록
  Future<List<WaitlistDto>> getMyWaitlists() async {
    final response = await _client.get('/api/v1/waitlist/my');
    final data = response.data['data'] as List<dynamic>;
    return data
        .map((e) => WaitlistDto.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 대기 취소
  Future<void> cancelWaitlist(String id) async {
    await _client.delete('/api/v1/waitlist/$id');
  }

  /// 대기 확정 (승격 후 24h 내)
  Future<WaitlistDto> confirmWaitlist(String id) async {
    final response = await _client.post('/api/v1/waitlist/$id/confirm');
    return WaitlistDto.fromJson(response.data['data'] as Map<String, dynamic>);
  }
}
