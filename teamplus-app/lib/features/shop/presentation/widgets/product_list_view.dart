import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// 상품 목록 뷰
class ProductListView extends StatelessWidget {
  final String searchQuery;

  const ProductListView({super.key, this.searchQuery = ''});

  @override
  Widget build(BuildContext context) {
    final query = searchQuery.trim().toLowerCase();
    final filtered = query.isEmpty
        ? _sampleProducts
        : _sampleProducts
            .where((p) =>
                p.name.toLowerCase().contains(query) ||
                p.code.toLowerCase().contains(query) ||
                p.category.toLowerCase().contains(query))
            .toList();

    if (filtered.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.search_off, size: 48, color: AppColors.lightText),
            const SizedBox(height: 12),
            Text(
              '"$searchQuery" 검색 결과가 없습니다.',
              style: const TextStyle(fontSize: 14, color: AppColors.lightText),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: filtered.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final product = filtered[index];
        return _ProductCard(product: product);
      },
    );
  }

  static final List<_ProductData> _sampleProducts = [
    _ProductData(
      name: 'CCM 하키 헬멧 FL500',
      code: 'CCM-HEL-001',
      price: 189000,
      salePrice: 159000,
      stock: 15,
      category: '하키 장비',
      isActive: true,
      isFeatured: true,
    ),
    _ProductData(
      name: 'Bauer 아이스 스케이트 X-LP',
      code: 'BAU-SKT-002',
      price: 450000,
      salePrice: null,
      stock: 8,
      category: '스케이트',
      isActive: true,
      isFeatured: false,
    ),
    _ProductData(
      name: '주니어 보호대 세트',
      code: 'PRO-SET-001',
      price: 125000,
      salePrice: 99000,
      stock: 0,
      category: '보호대',
      isActive: true,
      isFeatured: false,
    ),
    _ProductData(
      name: 'CCM 글러브 FT4 Pro',
      code: 'CCM-GLV-003',
      price: 220000,
      salePrice: 198000,
      stock: 5,
      category: '하키 장비',
      isActive: true,
      isFeatured: true,
    ),
    _ProductData(
      name: '훈련용 퍽 10개 세트',
      code: 'TRN-PUK-001',
      price: 35000,
      salePrice: null,
      stock: 50,
      category: '액세서리',
      isActive: false,
      isFeatured: false,
    ),
  ];
}

class _ProductData {
  final String name;
  final String code;
  final int price;
  final int? salePrice;
  final int stock;
  final String category;
  final bool isActive;
  final bool isFeatured;

  _ProductData({
    required this.name,
    required this.code,
    required this.price,
    this.salePrice,
    required this.stock,
    required this.category,
    required this.isActive,
    required this.isFeatured,
  });
}

class _ProductCard extends StatelessWidget {
  final _ProductData product;

  const _ProductCard({required this.product});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 상단: 상품명 + 상태 배지
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            product.name,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                              color: AppColors.darkText,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (product.isFeatured) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.warning.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              '추천',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: AppColors.warning,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${product.code} · ${product.category}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.lightText,
                      ),
                    ),
                  ],
                ),
              ),

              // 상태 배지
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: product.isActive
                      ? AppColors.success.withValues(alpha: 0.1)
                      : AppColors.lightText.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  product.isActive ? '판매중' : '비활성',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: product.isActive
                        ? AppColors.success
                        : AppColors.lightText,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 12),

          // 하단: 가격 + 재고 + 액션
          Row(
            children: [
              // 가격
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (product.salePrice != null) ...[
                      Text(
                        _formatPrice(product.price),
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.lightText,
                          decoration: TextDecoration.lineThrough,
                        ),
                      ),
                      Text(
                        _formatPrice(product.salePrice!),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.error,
                        ),
                      ),
                    ] else
                      Text(
                        _formatPrice(product.price),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.darkText,
                        ),
                      ),
                  ],
                ),
              ),

              // 재고
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: _getStockColor(product.stock).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.inventory_2_outlined,
                      size: 14,
                      color: _getStockColor(product.stock),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      product.stock > 0 ? '재고 ${product.stock}개' : '품절',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: _getStockColor(product.stock),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),

              // 액션 버튼
              IconButton(
                icon: const Icon(Icons.edit_outlined, size: 20),
                color: AppColors.primary,
                onPressed: () => _editProduct(context),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 20),
                color: AppColors.error,
                onPressed: () => _deleteProduct(context),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Color _getStockColor(int stock) {
    if (stock == 0) return AppColors.error;
    if (stock <= 5) return AppColors.warning;
    return AppColors.success;
  }

  String _formatPrice(int price) {
    return '₩${price.toString().replaceAllMapped(
          RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
          (match) => '${match[1]},',
        )}';
  }

  void _editProduct(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('${product.name} 수정')),
    );
  }

  void _deleteProduct(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('상품 삭제'),
        content: Text('${product.name}을(를) 삭제하시겠습니까?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('취소'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('상품이 삭제되었습니다.')),
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
  }
}
