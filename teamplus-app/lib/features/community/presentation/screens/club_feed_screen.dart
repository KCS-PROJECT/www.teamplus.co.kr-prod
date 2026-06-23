import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../data/community_api.dart';
import '../widgets/user_safety_menu.dart';

/// 팀 피드(게시글 전체 목록) 화면
class ClubFeedScreen extends ConsumerStatefulWidget {
  const ClubFeedScreen({super.key});

  @override
  ConsumerState<ClubFeedScreen> createState() => _ClubFeedScreenState();
}

class _ClubFeedScreenState extends ConsumerState<ClubFeedScreen> {
  List<TeamPostDto> _posts = [];
  bool _isLoading = true;
  String? _errorMessage;
  String? _currentClubId;

  @override
  void initState() {
    super.initState();
    _loadPosts();
  }

  Future<void> _loadPosts() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final currentClub = await ref.read(currentClubProvider.future);
      if (currentClub == null) {
        setState(() {
          _isLoading = false;
          _errorMessage = '선택된 팀이 없습니다.';
        });
        return;
      }

      _currentClubId = currentClub.id;
      final communityApi = ref.read(communityApiProvider);
      final posts = await communityApi.getClubPosts(
        clubId: currentClub.id,
        limit: 50, // 전체 목록이므로 더 많이 가져옴
      );

      setState(() {
        _posts = posts;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = '게시글을 불러올 수 없습니다.';
      });
    }
  }

  Future<void> _handleLike(String postId) async {
    if (_currentClubId == null) return;

    try {
      final communityApi = ref.read(communityApiProvider);
      final result = await communityApi.toggleLike(
        clubId: _currentClubId!,
        postId: postId,
      );

      // 로컬 상태 업데이트
      setState(() {
        _posts = _posts.map((post) {
          if (post.id == postId) {
            return post.copyWith(
              isLikedByMe: result.liked,
              likeCount: result.likeCount,
            );
          }
          return post;
        }).toList();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('좋아요 처리 중 오류가 발생했습니다.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const TeamplusAppBar(title: '팀 소식'),
      body: RefreshIndicator(
        onRefresh: _loadPosts,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 48,
              color: AppColors.error.withValues(alpha: 0.7),
            ),
            const SizedBox(height: 16),
            Text(
              _errorMessage!,
              style: const TextStyle(
                fontSize: 16,
                color: AppColors.lightText,
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadPosts,
              child: const Text('다시 시도'),
            ),
          ],
        ),
      );
    }

    if (_posts.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.article_outlined,
              size: 64,
              color: AppColors.lightText.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 16),
            const Text(
              '등록된 팀 소식이 없습니다.',
              style: TextStyle(
                fontSize: 16,
                color: AppColors.lightText,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _posts.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final post = _posts[index];
        return _PostCard(
          post: post,
          onTap: () => _showPostDetail(post),
          onLikeTap: () => _handleLike(post.id),
          onLongPress: () => UserSafetyMenu.show(
            context,
            targetUserId: post.id,
            targetUserName: '게시글 작성자',
            postId: post.id,
          ),
        );
      },
    );
  }

  void _showPostDetail(TeamPostDto post) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (context) => _PostDetailSheet(post: post),
    );
  }
}

/// 게시글 카드 위젯
class _PostCard extends StatelessWidget {
  final TeamPostDto post;
  final VoidCallback onTap;
  final VoidCallback onLikeTap;
  final VoidCallback? onLongPress;

  const _PostCard({
    required this.post,
    required this.onTap,
    required this.onLikeTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.cardBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: 유형 칩 + 고정 아이콘
            Row(
              children: [
                _PostTypeChip(type: post.postType),
                if (post.isPinned) ...[
                  const SizedBox(width: 8),
                  const Icon(
                    Icons.push_pin,
                    size: 16,
                    color: AppColors.warning,
                  ),
                ],
                const Spacer(),
                Text(
                  _formatDate(post.createdAt),
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.lightText,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // 제목
            Text(
              post.title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.darkText,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),

            // 내용 미리보기
            Text(
              post.content,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.lightText,
                height: 1.4,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),

            // 대상 레벨
            if (post.targetLevel != null) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(
                    Icons.people,
                    size: 14,
                    color: AppColors.lightText,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '대상: ${post.targetLevel}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.lightText,
                    ),
                  ),
                ],
              ),
            ],

            // 좋아요/댓글/조회수 영역
            const SizedBox(height: 12),
            Row(
              children: [
                // 좋아요 버튼
                InkWell(
                  onTap: onLikeTap,
                  borderRadius: BorderRadius.circular(4),
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: Row(
                      children: [
                        Icon(
                          post.isLikedByMe
                              ? Icons.favorite
                              : Icons.favorite_border,
                          size: 16,
                          color: post.isLikedByMe
                              ? Colors.red
                              : AppColors.lightText,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '${post.likeCount}',
                          style: TextStyle(
                            fontSize: 12,
                            color: post.isLikedByMe
                                ? Colors.red
                                : AppColors.lightText,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                // 댓글 수
                Row(
                  children: [
                    const Icon(
                      Icons.chat_bubble_outline,
                      size: 16,
                      color: AppColors.lightText,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${post.commentCount}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.lightText,
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 16),
                // 조회수
                Row(
                  children: [
                    const Icon(
                      Icons.visibility_outlined,
                      size: 16,
                      color: AppColors.lightText,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${post.viewCount}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.lightText,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inDays == 0) {
      if (diff.inHours == 0) {
        return '${diff.inMinutes}분 전';
      }
      return '${diff.inHours}시간 전';
    } else if (diff.inDays < 7) {
      return '${diff.inDays}일 전';
    }
    return DateFormat('MM.dd').format(date);
  }
}

/// 게시글 유형 칩
class _PostTypeChip extends StatelessWidget {
  final String type;

  const _PostTypeChip({required this.type});

  @override
  Widget build(BuildContext context) {
    final config = _getTypeConfig(type);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: config.color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        config.label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: config.color,
        ),
      ),
    );
  }

  _TypeConfig _getTypeConfig(String type) {
    switch (type) {
      case 'announcement':
        return _TypeConfig('공지', AppColors.primary);
      case 'lesson':
        return _TypeConfig('수업', AppColors.success);
      case 'tournament':
        return _TypeConfig('대회', AppColors.warning);
      case 'friendly':
        return _TypeConfig('친선', AppColors.info);
      case 'survey':
        return _TypeConfig('설문', AppColors.accent);
      default:
        return _TypeConfig('일반', AppColors.lightText);
    }
  }
}

class _TypeConfig {
  final String label;
  final Color color;

  _TypeConfig(this.label, this.color);
}

/// 게시글 상세 바텀시트
class _PostDetailSheet extends StatelessWidget {
  final TeamPostDto post;

  const _PostDetailSheet({required this.post});

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              // 드래그 핸들
              Container(
                margin: const EdgeInsets.only(top: 12),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.dividers,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // 콘텐츠
              Expanded(
                child: SingleChildScrollView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 헤더
                      Row(
                        children: [
                          _PostTypeChip(type: post.postType),
                          if (post.isPinned) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.warning.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.push_pin,
                                    size: 12,
                                    color: AppColors.warning,
                                  ),
                                  SizedBox(width: 4),
                                  Text(
                                    '고정',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                      color: AppColors.warning,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 16),

                      // 제목
                      Text(
                        post.title,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: AppColors.darkText,
                        ),
                      ),
                      const SizedBox(height: 8),

                      // 날짜
                      Text(
                        DateFormat('yyyy년 MM월 dd일 HH:mm')
                            .format(post.createdAt),
                        style: const TextStyle(
                          fontSize: 14,
                          color: AppColors.lightText,
                        ),
                      ),

                      if (post.targetLevel != null) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(
                              Icons.people,
                              size: 16,
                              color: AppColors.lightText,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '대상: ${post.targetLevel}',
                              style: const TextStyle(
                                fontSize: 14,
                                color: AppColors.lightText,
                              ),
                            ),
                          ],
                        ),
                      ],

                      const Divider(height: 32),

                      // 내용
                      Text(
                        post.content,
                        style: const TextStyle(
                          fontSize: 16,
                          color: AppColors.darkText,
                          height: 1.6,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
