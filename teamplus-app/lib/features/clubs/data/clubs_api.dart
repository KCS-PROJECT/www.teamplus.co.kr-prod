import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/network/api_client.dart';

/// 내 팀 정보 DTO
class UserClubDto {
  final String id;
  final String teamCode;
  final String name;
  final String? coachName;
  final String? location;
  final DateTime createdAt;
  final DateTime joinedAt;

  UserClubDto({
    required this.id,
    required this.teamCode,
    required this.name,
    this.coachName,
    this.location,
    required this.createdAt,
    required this.joinedAt,
  });

  factory UserClubDto.fromJson(Map<String, dynamic> json) {
    return UserClubDto(
      id: json['id'] as String,
      teamCode: (json['teamCode'] ?? json['clubCode']) as String,
      name: (json['name'] ?? json['clubName']) as String,
      coachName: json['coachName'] as String?,
      location: json['location'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      joinedAt: DateTime.parse(json['joinedAt'] as String),
    );
  }
}

/// 팀 정보 검증 결과 DTO (by-code 조회)
class TeamInfoDto {
  final String id;
  final String teamCode;
  final String name;
  final String? coachName;
  final String? location;
  final String? phone;
  final int memberCount;
  final DateTime createdAt;

  TeamInfoDto({
    required this.id,
    required this.teamCode,
    required this.name,
    this.coachName,
    this.location,
    this.phone,
    required this.memberCount,
    required this.createdAt,
  });

  factory TeamInfoDto.fromJson(Map<String, dynamic> json) {
    // members 배열에서 승인된 회원 수 계산
    final members = json['members'] as List<dynamic>? ?? [];

    return TeamInfoDto(
      id: json['id'] as String,
      teamCode: (json['teamCode'] ?? json['clubCode']) as String,
      name: (json['name'] ?? json['clubName']) as String,
      coachName: json['coachName'] as String?,
      location: json['location'] as String?,
      phone: json['phone'] as String?,
      memberCount: members.length,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

/// 팀 가입 신청 결과 DTO
class JoinClubResultDto {
  final String id;
  final String teamId;
  final String teamName;
  final String playerName;
  final String status;
  final DateTime createdAt;

  JoinClubResultDto({
    required this.id,
    required this.teamId,
    required this.teamName,
    required this.playerName,
    required this.status,
    required this.createdAt,
  });

  factory JoinClubResultDto.fromJson(Map<String, dynamic> json) {
    return JoinClubResultDto(
      id: json['id'] as String,
      teamId: (json['teamId'] ?? json['clubId']) as String,
      teamName: (json['teamName'] ?? json['clubName']) as String,
      playerName: json['playerName'] as String,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

/// 클럽 가입 요청 DTO
class JoinClubRequest {
  final String clubCode;
  final String playerName;
  final int playerAge;

  JoinClubRequest({
    required this.clubCode,
    required this.playerName,
    required this.playerAge,
  });

  Map<String, dynamic> toJson() => {
        'clubCode': clubCode,
        'playerName': playerName,
        'playerAge': playerAge,
      };
}

/// 내 회원 정보 DTO (특정 팀 내)
class MyMemberInfoDto {
  final String id;
  final String userId;
  final String teamId;
  final String playerName;
  final int playerAge;
  final String approvalStatus;
  final DateTime createdAt;

  MyMemberInfoDto({
    required this.id,
    required this.userId,
    required this.teamId,
    required this.playerName,
    required this.playerAge,
    required this.approvalStatus,
    required this.createdAt,
  });

  factory MyMemberInfoDto.fromJson(Map<String, dynamic> json) {
    return MyMemberInfoDto(
      id: json['id'] as String,
      userId: json['userId'] as String,
      teamId: (json['teamId'] ?? json['clubId']) as String,
      playerName: json['playerName'] as String,
      playerAge: json['playerAge'] as int? ?? 0,
      approvalStatus: json['approvalStatus'] as String? ?? 'PENDING',
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

/// Clubs API - 팀 관련 API 호출
class ClubsApi {
  final ApiClient _client;

  ClubsApi(this._client);

  /// 내 팀 목록 조회 (`GET /api/v1/teams/my/list`)
  Future<List<UserClubDto>> getMyClubs() async {
    try {
      final Response response = await _client.get('/teams/my/list');
      final data = response.data;

      final List<dynamic> rawList =
          data is Map<String, dynamic> && data['data'] is List
              ? data['data'] as List
              : (data as List<dynamic>);

      return rawList
          .map((e) => UserClubDto.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[ClubsApi] getMyClubs error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 팀 코드로 팀 정보 조회 (`GET /api/v1/teams/by-code/:teamCode`)
  Future<TeamInfoDto> verifyClubCode(String teamCode) async {
    try {
      final Response response = await _client.get('/teams/by-code/$teamCode');
      final data = response.data;

      // 응답이 Map인 경우 직접 파싱
      if (data is Map<String, dynamic>) {
        // 'data' 키로 래핑된 경우 처리
        final teamData =
            data['data'] is Map<String, dynamic> ? data['data'] : data;
        return TeamInfoDto.fromJson(teamData as Map<String, dynamic>);
      }

      throw Exception('잘못된 응답 형식입니다.');
    } on DioException catch (e) {
      if (kDebugMode) {
        debugPrint('[ClubsApi] verifyClubCode error: $e');
      }

      // 404 Not Found - 팀을 찾을 수 없음
      if (e.response?.statusCode == 404) {
        throw ClubNotFoundException('존재하지 않는 초대코드입니다.');
      }

      // 기타 오류
      final message =
          e.response?.data?['message'] as String? ?? '팀 정보를 조회할 수 없습니다.';
      throw ClubApiException(message);
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[ClubsApi] verifyClubCode error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 특정 팀에서 내 회원 정보 조회 (`GET /api/v1/teams/:teamId/my-membership`)
  Future<MyMemberInfoDto?> getMyMemberInfo(String teamId) async {
    try {
      final Response response =
          await _client.get('/teams/$teamId/my-membership');
      final data = response.data;

      if (data is Map<String, dynamic>) {
        final memberData =
            data['data'] is Map<String, dynamic> ? data['data'] : data;
        return MyMemberInfoDto.fromJson(memberData as Map<String, dynamic>);
      }

      return null;
    } on DioException catch (e) {
      if (kDebugMode) {
        debugPrint('[ClubsApi] getMyMemberInfo error: $e');
      }

      // 404 Not Found - 회원 정보를 찾을 수 없음
      if (e.response?.statusCode == 404) {
        return null;
      }

      rethrow;
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[ClubsApi] getMyMemberInfo error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 팀 가입 신청 (`POST /api/v1/teams/join`)
  Future<JoinClubResultDto> joinClub(JoinClubRequest request) async {
    try {
      final Response response = await _client.post(
        '/teams/join',
        data: request.toJson(),
      );
      final data = response.data;

      // 응답이 Map인 경우 직접 파싱
      if (data is Map<String, dynamic>) {
        final resultData =
            data['data'] is Map<String, dynamic> ? data['data'] : data;
        return JoinClubResultDto.fromJson(resultData as Map<String, dynamic>);
      }

      throw Exception('잘못된 응답 형식입니다.');
    } on DioException catch (e) {
      if (kDebugMode) {
        debugPrint('[ClubsApi] joinClub error: $e');
      }

      final statusCode = e.response?.statusCode;
      final message = e.response?.data?['message'] as String?;

      // 404 Not Found - 팀을 찾을 수 없음
      if (statusCode == 404) {
        throw ClubNotFoundException(message ?? '팀을 찾을 수 없습니다.');
      }

      // 409 Conflict - 이미 가입됨 또는 대기 중
      if (statusCode == 409) {
        throw ClubAlreadyJoinedException(message ?? '이미 가입되었거나 신청이 대기 중입니다.');
      }

      // 400 Bad Request - 유효성 검증 오류
      if (statusCode == 400) {
        throw ClubApiException(message ?? '입력 정보를 확인해주세요.');
      }

      // 기타 오류
      throw ClubApiException(message ?? '팀 가입 신청 중 오류가 발생했습니다.');
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[ClubsApi] joinClub error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }
}

/// 클럽 API 예외 클래스들
class ClubApiException implements Exception {
  final String message;
  ClubApiException(this.message);

  @override
  String toString() => message;
}

class ClubNotFoundException extends ClubApiException {
  ClubNotFoundException(super.message);
}

class ClubAlreadyJoinedException extends ClubApiException {
  ClubAlreadyJoinedException(super.message);
}
