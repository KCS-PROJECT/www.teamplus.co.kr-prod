import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// 카테고리 목록 뷰
class CategoryListView extends StatelessWidget {
  const CategoryListView({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: const [
        _CategoryGroup(
          title: '하키 장비',
          description: '스틱, 헬멧, 글러브 등',
          productCount: 24,
          isActive: true,
          children: [
            _SubCategory(name: '스틱', productCount: 8),
            _SubCategory(name: '헬멧', productCount: 6),
            _SubCategory(name: '글러브', productCount: 10),
          ],
        ),
        SizedBox(height: 12),
        _CategoryGroup(
          title: '보호대',
          description: '어깨, 팔꿈치, 신가드 등',
          productCount: 15,
          isActive: true,
          children: [
            _SubCategory(name: '어깨 보호대', productCount: 5),
            _SubCategory(name: '팔꿈치 보호대', productCount: 4),
            _SubCategory(name: '신 가드', productCount: 6),
          ],
        ),
        SizedBox(height: 12),
        _CategoryGroup(
          title: '스케이트',
          description: '아이스 스케이트, 블레이드',
          productCount: 18,
          isActive: true,
          children: [
            _SubCategory(name: '성인용', productCount: 10),
            _SubCategory(name: '주니어용', productCount: 5),
            _SubCategory(name: '블레이드', productCount: 3),
          ],
        ),
        SizedBox(height: 12),
        _CategoryGroup(
          title: '의류',
          description: '유니폼, 연습복, 양말 등',
          productCount: 32,
          isActive: true,
          children: [
            _SubCategory(name: '유니폼', productCount: 12),
            _SubCategory(name: '연습복', productCount: 15),
            _SubCategory(name: '양말', productCount: 5),
          ],
        ),
        SizedBox(height: 12),
        _CategoryGroup(
          title: '액세서리',
          description: '가방, 테이프, 퍽 등',
          productCount: 45,
          isActive: true,
          children: [
            _SubCategory(name: '가방', productCount: 8),
            _SubCategory(name: '테이프', productCount: 12),
            _SubCategory(name: '퍽', productCount: 6),
            _SubCategory(name: '기타', productCount: 19),
          ],
        ),
        SizedBox(height: 12),
        _CategoryGroup(
          title: '골키퍼 장비',
          description: '골키퍼 전용 장비',
          productCount: 12,
          isActive: false,
          children: [],
        ),
      ],
    );
  }
}

class _SubCategory {
  final String name;
  final int productCount;

  const _SubCategory({required this.name, required this.productCount});
}

class _CategoryGroup extends StatefulWidget {
  final String title;
  final String description;
  final int productCount;
  final bool isActive;
  final List<_SubCategory> children;

  const _CategoryGroup({
    required this.title,
    required this.description,
    required this.productCount,
    required this.isActive,
    required this.children,
  });

  @override
  State<_CategoryGroup> createState() => _CategoryGroupState();
}

class _CategoryGroupState extends State<_CategoryGroup> {
  bool _isExpanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderColor),
      ),
      child: Column(
        children: [
          // 메인 카테고리
          InkWell(
            onTap: widget.children.isNotEmpty
                ? () => setState(() => _isExpanded = !_isExpanded)
                : null,
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  // 아이콘
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.folder,
                      color: AppColors.primary,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 14),

                  // 정보
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              widget.title,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 15,
                                color: AppColors.darkText,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: widget.isActive
                                    ? AppColors.success.withValues(alpha: 0.1)
                                    : AppColors.lightText
                                        .withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                widget.isActive ? '활성' : '비활성',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: widget.isActive
                                      ? AppColors.success
                                      : AppColors.lightText,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.description,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.lightText,
                          ),
                        ),
                      ],
                    ),
                  ),

                  // 상품 수
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.background,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '${widget.productCount}개',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.darkText,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),

                  // 액션 버튼
                  PopupMenuButton<String>(
                    icon:
                        const Icon(Icons.more_vert, color: AppColors.lightText),
                    onSelected: (value) => _handleAction(context, value),
                    itemBuilder: (context) => [
                      const PopupMenuItem(
                        value: 'edit',
                        child: Row(
                          children: [
                            Icon(Icons.edit, size: 18),
                            SizedBox(width: 8),
                            Text('수정'),
                          ],
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'add_sub',
                        child: Row(
                          children: [
                            Icon(Icons.add, size: 18),
                            SizedBox(width: 8),
                            Text('하위 카테고리 추가'),
                          ],
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'delete',
                        child: Row(
                          children: [
                            Icon(Icons.delete,
                                size: 18, color: AppColors.error),
                            SizedBox(width: 8),
                            Text('삭제',
                                style: TextStyle(color: AppColors.error)),
                          ],
                        ),
                      ),
                    ],
                  ),

                  // 확장 아이콘
                  if (widget.children.isNotEmpty)
                    Icon(
                      _isExpanded
                          ? Icons.keyboard_arrow_up
                          : Icons.keyboard_arrow_down,
                      color: AppColors.lightText,
                    ),
                ],
              ),
            ),
          ),

          // 하위 카테고리
          if (_isExpanded && widget.children.isNotEmpty) ...[
            const Divider(height: 1),
            ...widget.children.map((sub) => _buildSubCategoryItem(sub)),
          ],
        ],
      ),
    );
  }

  Widget _buildSubCategoryItem(_SubCategory sub) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: AppColors.background,
      ),
      child: Row(
        children: [
          const SizedBox(width: 44),
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              sub.name,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.darkText,
              ),
            ),
          ),
          Text(
            '${sub.productCount}개',
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.lightText,
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.edit, size: 16),
            color: AppColors.lightText,
            onPressed: () {},
            constraints: const BoxConstraints(
              minWidth: 32,
              minHeight: 32,
            ),
          ),
        ],
      ),
    );
  }

  void _handleAction(BuildContext context, String action) {
    switch (action) {
      case 'edit':
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${widget.title} 카테고리 수정')),
        );
        break;
      case 'add_sub':
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${widget.title}에 하위 카테고리 추가')),
        );
        break;
      case 'delete':
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('카테고리 삭제'),
            content: Text('${widget.title} 카테고리를 삭제하시겠습니까?\n'
                '(하위 카테고리 및 연결된 상품도 함께 영향을 받을 수 있습니다.)'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('취소'),
              ),
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('카테고리가 삭제되었습니다.')),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.error,
                  foregroundColor: Colors.white,
                ),
                child: const Text('삭제'),
              ),
            ],
          ),
        );
        break;
    }
  }
}
