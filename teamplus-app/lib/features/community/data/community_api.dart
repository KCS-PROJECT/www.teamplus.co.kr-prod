import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../../core/network/api_client.dart';

/// Team Post DTO
class TeamPostDto {
  final String id;
  final String title;
  final String content;
  final String postType;
  final String? targetLevel;
  final bool isPinned;
  final bool isActive;
  final int likeCount;
  final int commentCount;
  final int viewCount;
  final bool isLikedByMe;
  final DateTime createdAt;

  TeamPostDto({
    required this.id,
    required this.title,
    required this.content,
    required this.postType,
    required this.isPinned,
    required this.createdAt,
    this.targetLevel,
    this.isActive = true,
    this.likeCount = 0,
    this.commentCount = 0,
    this.viewCount = 0,
    this.isLikedByMe = false,
  });

  factory TeamPostDto.fromJson(Map<String, dynamic> json) {
    return TeamPostDto(
      id: json['id'] as String,
      title: json['title'] as String,
      content: json['content'] as String,
      postType: json['postType'] as String,
      targetLevel: json['targetLevel'] as String?,
      isPinned: json['isPinned'] as bool? ?? false,
      isActive: json['isActive'] as bool? ?? true,
      likeCount: json['likeCount'] as int? ?? 0,
      commentCount: json['commentCount'] as int? ?? 0,
      viewCount: json['viewCount'] as int? ?? 0,
      isLikedByMe: json['isLikedByMe'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  TeamPostDto copyWith({
    bool? isLikedByMe,
    int? likeCount,
  }) {
    return TeamPostDto(
      id: id,
      title: title,
      content: content,
      postType: postType,
      targetLevel: targetLevel,
      isPinned: isPinned,
      isActive: isActive,
      likeCount: likeCount ?? this.likeCount,
      commentCount: commentCount,
      viewCount: viewCount,
      isLikedByMe: isLikedByMe ?? this.isLikedByMe,
      createdAt: createdAt,
    );
  }
}

/// Team Event DTO
class TeamEventDto {
  final String id;
  final String title;
  final String eventType;
  final String? description;
  final String? targetLevel;
  final int? capacity;
  final DateTime startAt;
  final DateTime endAt;
  final String status;

  TeamEventDto({
    required this.id,
    required this.title,
    required this.eventType,
    required this.startAt,
    required this.endAt,
    required this.status,
    this.description,
    this.targetLevel,
    this.capacity,
  });

  factory TeamEventDto.fromJson(Map<String, dynamic> json) {
    return TeamEventDto(
      id: json['id'] as String,
      title: json['title'] as String,
      eventType: json['eventType'] as String,
      description: json['description'] as String?,
      targetLevel: json['targetLevel'] as String?,
      capacity: json['capacity'] as int?,
      startAt: DateTime.parse(json['startAt'] as String),
      endAt: DateTime.parse(json['endAt'] as String),
      status: json['status'] as String,
    );
  }
}

/// Community API - Parent/Coach 대시보드에서 공지/이벤트 표시용 최소 기능
class CommunityApi {
  final ApiClient _client;

  CommunityApi(this._client);

  /// 팀 게시글 목록 조회
  Future<List<TeamPostDto>> getClubPosts({
    required String clubId,
    int limit = 5,
  }) async {
    try {
      final Response response = await _client.get(
        '/teams/$clubId/community/posts',
        queryParameters: {'limit': limit},
      );

      final data = response.data;
      final List<dynamic> rawList =
          data is Map<String, dynamic> && data['data'] is List
              ? data['data'] as List
              : (data as List<dynamic>);

      return rawList
          .map((e) => TeamPostDto.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[CommunityApi] getClubPosts error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 팀 이벤트 목록 조회
  Future<List<TeamEventDto>> getClubEvents({
    required String clubId,
    int limit = 5,
  }) async {
    try {
      final Response response = await _client.get(
        '/teams/$clubId/community/events',
      );

      final data = response.data;
      final List<dynamic> rawList =
          data is Map<String, dynamic> && data['data'] is List
              ? data['data'] as List
              : (data as List<dynamic>);

      final events = rawList
          .map((e) => TeamEventDto.fromJson(e as Map<String, dynamic>))
          .toList();

      // 가장 가까운 순으로 정렬 후 상위 limit 개만 반환
      events.sort((a, b) => a.startAt.compareTo(b.startAt));
      if (events.length > limit) {
        return events.sublist(0, limit);
      }
      return events;
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[CommunityApi] getClubEvents error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 팀 이벤트 참가 신청
  ///
  /// 성공: 201
  /// 409: 이미 신청됨 / 410: 정원 초과(마감)
  Future<void> registerEventParticipation({
    required String teamId,
    required String eventId,
  }) async {
    await _client
        .post('/teams/$teamId/community/events/$eventId/registrations');
  }

  /// 좋아요 토글
  Future<LikeResult> toggleLike({
    required String clubId,
    required String postId,
  }) async {
    try {
      final Response response = await _client.post(
        '/teams/$clubId/community/posts/$postId/like',
      );

      final data = response.data;
      final result = data is Map<String, dynamic> && data['data'] != null
          ? data['data'] as Map<String, dynamic>
          : data as Map<String, dynamic>;

      return LikeResult(
        liked: result['liked'] as bool,
        likeCount: result['likeCount'] as int,
      );
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[CommunityApi] toggleLike error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }
}

/// 좋아요 토글 결과
class LikeResult {
  final bool liked;
  final int likeCount;

  LikeResult({required this.liked, required this.likeCount});
}
