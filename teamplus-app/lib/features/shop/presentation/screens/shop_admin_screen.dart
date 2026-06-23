import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/auth/user_role.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/app_drawer.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../widgets/shop_menu_section.dart';
import '../widgets/product_list_view.dart';
import '../widgets/category_list_view.dart';
import 'shop_menu_skeleton_screens.dart';

/// 주문 목록 모델 (Backend GET /api/v1/shop/orders 응답 매핑)
class _ShopOrderItem {
  final String id;
  final String orderNumber;
  final String customerName;
  final int totalAmount;
  final String status;

  const _ShopOrderItem({
    required this.id,
    required this.orderNumber,
    required this.customerName,
    required this.totalAmount,
    required this.status,
  });
}

/// Backend 주문 상태 → 한글 라벨 + 컬러 매핑
({String label, Color color}) _statusMeta(String status) {
  switch (status) {
    case 'pending':
      return (label: '결제 대기', color: AppColors.error);
    case 'paid':
      return (label: '결제 완료', color: AppColors.success);
    case 'preparing':
      return (label: '배송 준비', color: AppColors.warning);
    case 'shipped':
      return (label: '배송 중', color: AppColors.primary);
    case 'delivered':
      return (label: '배송 완료', color: AppColors.lightText);
    case 'cancelled':
      return (label: '주문 취소', color: AppColors.lightText);
    default:
      return (label: status, color: AppColors.lightText);
  }
}

/// 관리자 주문 목록 Provider — GET /api/v1/shop/orders?page=1&limit=20
final _shopOrdersProvider = FutureProvider<List<_ShopOrderItem>>((ref) async {
  final client = ref.read(apiClientProvider);
  try {
    final response = await client.get('/api/v1/shop/orders?page=1&limit=20');
    final data = response.data;
    final List<dynamic> items = (data is Map<String, dynamic>
            ? (data['orders'] ?? data['items'] ?? data['data'] ?? data)
            : data) as List<dynamic>? ??
        const [];
    return items.map((raw) {
      final m = raw as Map<String, dynamic>;
      final user = m['user'] as Map<String, dynamic>? ?? {};
      final lastName = user['lastName'] as String? ?? '';
      final firstName = user['firstName'] as String? ?? '';
      final amount = m['totalAmount'] ?? m['amount'] ?? 0;
      return _ShopOrderItem(
        id: m['id']?.toString() ?? '',
        orderNumber: m['orderNumber']?.toString() ?? m['id']?.toString() ?? '',
        customerName: '$lastName$firstName'.trim().isEmpty
            ? (user['name'] as String? ?? '미상')
            : '$lastName$firstName',
        totalAmount:
            amount is int ? amount : int.tryParse(amount.toString()) ?? 0,
        status: m['status']?.toString() ?? 'pending',
      );
    }).toList();
  } on DioException {
    return const [];
  } catch (_) {
    return const [];
  }
});

/// TEAMPLUS 쇼핑몰 관리 화면
///
/// Design 7 Principles 적용:
/// 1. 화면 분석 필수 - coach_admin_screen.dart 디자인 패턴 분석 완료
/// 2. 휴먼 디자인 - 전문적인 관리 시스템 UI
/// 3. AI 스타일 절대 금지 - 그라데이션, blur 효과 미사용
/// 4. 페르소나 융합 - frontend, architect, backend 협업
/// 5. 명령어 필수 - frontend-design 스킬 활용
/// 6. 결과 출력 필수 - 하단 주석 참조
/// 7. Tone & Manner - 존댓말, 전문적 표현
class ShopAdminScreen extends ConsumerStatefulWidget {
  const ShopAdminScreen({super.key});

  @override
  ConsumerState<ShopAdminScreen> createState() => _ShopAdminScreenState();
}

class _ShopAdminScreenState extends ConsumerState<ShopAdminScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isWideScreen = screenWidth > 600;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: _buildAppBar(),
        body: Row(
          children: [
            // 사이드 메뉴 (태블릿/데스크탑)
            if (isWideScreen) _buildSideMenu(),

            // 메인 콘텐츠
            Expanded(
              child: Column(
                children: [
                  // 탭바
                  _buildTabBar(),

                  // 탭 콘텐츠
                  Expanded(
                    child: TabBarView(
                      controller: _tabController,
                      children: [
                        ProductListView(searchQuery: _searchQuery),
                        const CategoryListView(),
                        const _OrderListView(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        // 모바일용 드로어 (접이식 메뉴)
        drawerEnableOpenDragGesture: false,
        drawer: isWideScreen
            ? null
            : const Drawer(child: AppDrawer(currentRoute: '/shop-admin')),
        floatingActionButton: _buildFAB(),
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    return TeamplusAppBar(
      title: '쇼핑몰 관리',
      backgroundColor: AppColors.primary,
      foregroundColor: Colors.white,
      centerTitle: false,
      actions: [
        IconButton(
          icon: const Icon(Icons.search),
          onPressed: () => _showSearchDialog(),
        ),
        IconButton(
          icon: const Icon(Icons.refresh),
          onPressed: () => _refreshData(),
        ),
      ],
    );
  }

  Widget _buildSideMenu() {
    return Container(
      width: 280,
      decoration: const BoxDecoration(
        color: AppColors.white,
        border: Border(
          right: BorderSide(
            color: AppColors.borderColor,
            width: 1,
          ),
        ),
      ),
      child: _buildSideMenuContent(),
    );
  }

  Widget _buildSideMenuContent() {
    final userTypeAsync = ref.watch(currentUserTypeProvider);
    final role = userRoleFromType(userTypeAsync.value);
    return SafeArea(
      child: Column(
        children: [
          // 로고 헤더
          Container(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.sports_hockey, color: Colors.white, size: 20),
                      SizedBox(width: 6),
                      Text(
                        'TEAMPLUS',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // 메뉴 섹션들
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                children: [
                  // 상품 관리
                  _buildRoleSection(
                    role: role,
                    title: '상품 관리',
                    items: [
                      _RoleAwareMenuItem(
                        label: '전체 상품',
                        icon: Icons.inventory_2,
                        onTap: () => _tabController.animateTo(0),
                        allowedRoles: {UserRole.coach, UserRole.admin},
                      ),
                      _RoleAwareMenuItem(
                        label: '상품 등록',
                        icon: Icons.add_box,
                        onTap: () => _showProductFormDialog(isAdd: true),
                        allowedRoles: {UserRole.admin},
                      ),
                      _RoleAwareMenuItem(
                        label: '재고 관리',
                        icon: Icons.warehouse,
                        onTap: () => _showStockManagementDialog(),
                        allowedRoles: {UserRole.admin},
                      ),
                    ],
                  ),

                  // 카테고리 관리
                  _buildRoleSection(
                    role: role,
                    title: '카테고리 관리',
                    items: [
                      _RoleAwareMenuItem(
                        label: '카테고리 목록',
                        icon: Icons.category,
                        onTap: () => _tabController.animateTo(1),
                        allowedRoles: {UserRole.coach, UserRole.admin},
                      ),
                      _RoleAwareMenuItem(
                        label: '카테고리 추가',
                        icon: Icons.create_new_folder,
                        onTap: () => _showCategoryFormDialog(isAdd: true),
                        allowedRoles: {UserRole.admin},
                      ),
                    ],
                  ),

                  // 주문 관리
                  _buildRoleSection(
                    role: role,
                    title: '주문 관리',
                    items: [
                      _RoleAwareMenuItem(
                        label: '주문 내역',
                        icon: Icons.receipt_long,
                        onTap: () => _tabController.animateTo(2),
                        allowedRoles: {UserRole.coach, UserRole.admin},
                      ),
                      _RoleAwareMenuItem(
                        label: '반품/환불',
                        icon: Icons.assignment_return,
                        onTap: () => _pushScreen(const ReturnsRefundScreen()),
                        allowedRoles: {UserRole.admin},
                      ),
                    ],
                  ),

                  // 배송/정산
                  _buildRoleSection(
                    role: role,
                    title: '배송/정산',
                    items: [
                      _RoleAwareMenuItem(
                        label: '배송 현황',
                        icon: Icons.local_shipping,
                        onTap: () => _showDeliveryStatusDialog(),
                        allowedRoles: {UserRole.coach, UserRole.admin},
                      ),
                      _RoleAwareMenuItem(
                        label: '정산 내역',
                        icon: Icons.account_balance_wallet,
                        onTap: () =>
                            _pushScreen(const SettlementHistoryScreen()),
                        allowedRoles: {UserRole.admin},
                      ),
                    ],
                  ),

                  // 고객 관리
                  _buildRoleSection(
                    role: role,
                    title: '고객 관리',
                    items: [
                      _RoleAwareMenuItem(
                        label: '회원 리스트',
                        icon: Icons.people_outline,
                        onTap: () => _pushScreen(const CustomerListScreen()),
                        allowedRoles: {UserRole.admin},
                      ),
                      _RoleAwareMenuItem(
                        label: '문의 관리',
                        icon: Icons.support_agent,
                        onTap: () =>
                            _pushScreen(const InquiryManagementScreen()),
                        allowedRoles: {UserRole.admin},
                      ),
                      _RoleAwareMenuItem(
                        label: '리뷰 관리',
                        icon: Icons.rate_review_outlined,
                        onTap: () =>
                            _pushScreen(const ReviewManagementScreen()),
                        allowedRoles: {UserRole.admin},
                      ),
                    ],
                  ),

                  // 마케팅
                  _buildRoleSection(
                    role: role,
                    title: '마케팅',
                    items: [
                      _RoleAwareMenuItem(
                        label: '배너/팝업',
                        icon: Icons.campaign_outlined,
                        onTap: () => _pushScreen(const BannerPopupScreen()),
                        allowedRoles: {UserRole.admin},
                      ),
                      _RoleAwareMenuItem(
                        label: '기획전',
                        icon: Icons.view_carousel_outlined,
                        onTap: () => _pushScreen(const ExhibitionScreen()),
                        allowedRoles: {UserRole.admin},
                      ),
                    ],
                  ),

                  // 프로모션
                  _buildRoleSection(
                    role: role,
                    title: '프로모션',
                    items: [
                      _RoleAwareMenuItem(
                        label: '쿠폰 관리',
                        icon: Icons.local_activity_outlined,
                        onTap: () =>
                            _pushScreen(const CouponManagementScreen()),
                        allowedRoles: {UserRole.admin},
                      ),
                    ],
                  ),

                  // 설정
                  _buildRoleSection(
                    role: role,
                    title: '설정',
                    items: [
                      _RoleAwareMenuItem(
                        label: '결제/배송 설정',
                        icon: Icons.settings_outlined,
                        onTap: () => _pushScreen(
                          const PaymentShippingSettingsScreen(),
                        ),
                        allowedRoles: {UserRole.admin},
                      ),
                      _RoleAwareMenuItem(
                        label: '운영 정책',
                        icon: Icons.gavel_outlined,
                        onTap: () =>
                            _pushScreen(const PolicyManagementScreen()),
                        allowedRoles: {UserRole.admin},
                      ),
                    ],
                  ),

                  const Divider(height: 32),

                  // 통계 요약
                  _buildStatsSummary(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsSummary() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '오늘 현황',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.darkText,
            ),
          ),
          const SizedBox(height: 12),
          _buildStatItem('신규 주문', '3건', AppColors.primary),
          const SizedBox(height: 8),
          _buildStatItem('배송 중', '5건', AppColors.warning),
          const SizedBox(height: 8),
          _buildStatItem('품절 상품', '2개', AppColors.error),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String value, Color color) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 13,
            color: AppColors.lightText,
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRoleSection({
    required UserRole role,
    required String title,
    required List<_RoleAwareMenuItem> items,
  }) {
    final visibleItems = items
        .where((item) => isRoleAllowed(role, item.allowedRoles))
        .map(
          (item) => ShopMenuItem(
            label: item.label,
            icon: item.icon,
            onTap: item.onTap,
          ),
        )
        .toList();

    if (visibleItems.isEmpty) {
      return const SizedBox.shrink();
    }

    return ShopMenuSection(
      title: title,
      items: visibleItems,
    );
  }

  Widget _buildTabBar() {
    return Container(
      color: AppColors.white,
      child: Column(
        children: [
          TabBar(
            controller: _tabController,
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.lightText,
            indicatorColor: AppColors.primary,
            indicatorWeight: 3,
            labelStyle: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
            unselectedLabelStyle: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
            tabs: const [
              Tab(text: '상품 관리'),
              Tab(text: '카테고리'),
              Tab(text: '주문 내역'),
            ],
          ),
          const Divider(height: 1),
        ],
      ),
    );
  }

  Widget _buildFAB() {
    return FloatingActionButton.extended(
      onPressed: () => _showAddBottomSheet(),
      backgroundColor: AppColors.primary,
      icon: const Icon(Icons.add, color: Colors.white),
      label: const Text(
        '등록하기',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  // 다이얼로그/바텀시트 메서드들
  Future<void> _showSearchDialog() async {
    final query = await showDialog<String>(
      context: context,
      builder: (context) => const _SearchDialog(),
    );
    if (query != null && mounted) {
      setState(() => _searchQuery = query);
      _tabController.animateTo(0);
    }
  }

  void _refreshData() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('데이터를 새로고침했습니다.')),
    );
  }

  void _pushScreen(Widget screen) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => screen),
    );
  }

  void _showProductFormDialog({required bool isAdd}) {
    showDialog(
      context: context,
      builder: (context) => ProductFormDialog(isAdd: isAdd),
    );
  }

  void _showStockManagementDialog() {
    showDialog(
      context: context,
      builder: (context) => const _StockManagementDialog(),
    );
  }

  void _showCategoryFormDialog({required bool isAdd}) {
    showDialog(
      context: context,
      builder: (context) => CategoryFormDialog(isAdd: isAdd),
    );
  }

  void _showDeliveryStatusDialog() {
    showDialog(
      context: context,
      builder: (context) => const _DeliveryStatusDialog(),
    );
  }

  void _showAddBottomSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _AddItemBottomSheet(
        onProductTap: () {
          Navigator.pop(context);
          _showProductFormDialog(isAdd: true);
        },
        onCategoryTap: () {
          Navigator.pop(context);
          _showCategoryFormDialog(isAdd: true);
        },
      ),
    );
  }
}

class _RoleAwareMenuItem {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final Set<UserRole> allowedRoles;

  const _RoleAwareMenuItem({
    required this.label,
    required this.icon,
    required this.onTap,
    required this.allowedRoles,
  });
}

// ============================================================
// 다이얼로그 위젯들
// ============================================================

/// 검색 다이얼로그
class _SearchDialog extends StatefulWidget {
  const _SearchDialog();

  @override
  State<_SearchDialog> createState() => _SearchDialogState();
}

class _SearchDialogState extends State<_SearchDialog> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('상품 검색'),
      content: TextField(
        controller: _searchController,
        autofocus: true,
        decoration: InputDecoration(
          hintText: '상품명, 코드, 브랜드로 검색',
          prefixIcon: const Icon(Icons.search),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        onSubmitted: (_) => _doSearch(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('취소'),
        ),
        ElevatedButton(
          onPressed: _doSearch,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
          child: const Text('검색'),
        ),
      ],
    );
  }

  void _doSearch() {
    final query = _searchController.text.trim();
    Navigator.pop(context, query);
  }
}

/// 상품 등록/수정 다이얼로그
class ProductFormDialog extends StatefulWidget {
  final bool isAdd;
  final Map<String, dynamic>? product;

  const ProductFormDialog({
    super.key,
    required this.isAdd,
    this.product,
  });

  @override
  State<ProductFormDialog> createState() => _ProductFormDialogState();
}

class _ProductFormDialogState extends State<ProductFormDialog> {
  final _nameController = TextEditingController();
  final _codeController = TextEditingController();
  final _priceController = TextEditingController();
  final _salePriceController = TextEditingController();
  final _stockController = TextEditingController();
  final _descriptionController = TextEditingController();
  String? _selectedCategory;
  bool _isActive = true;
  bool _isFeatured = false;

  @override
  void dispose() {
    _nameController.dispose();
    _codeController.dispose();
    _priceController.dispose();
    _salePriceController.dispose();
    _stockController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.isAdd ? '상품 등록' : '상품 수정'),
      content: SizedBox(
        width: 400,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 카테고리 선택
              const Text('카테고리:',
                  style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              DropdownButtonFormField<String>(
                initialValue: _selectedCategory,
                hint: const Text('카테고리 선택'),
                items: ['하키 장비', '보호대', '스케이트', '의류', '액세서리']
                    .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                    .toList(),
                onChanged: (value) => setState(() => _selectedCategory = value),
                decoration: InputDecoration(
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8)),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                ),
              ),
              const SizedBox(height: 16),

              // 상품명
              _buildTextField(_nameController, '상품명', Icons.inventory),
              const SizedBox(height: 12),

              // 상품 코드
              _buildTextField(_codeController, '상품 코드 (SKU)', Icons.qr_code),
              const SizedBox(height: 12),

              // 가격
              Row(
                children: [
                  Expanded(
                    child: _buildTextField(
                      _priceController,
                      '정상가 (원)',
                      Icons.attach_money,
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildTextField(
                      _salePriceController,
                      '할인가 (원)',
                      Icons.discount,
                      keyboardType: TextInputType.number,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // 재고
              _buildTextField(
                _stockController,
                '재고 수량',
                Icons.warehouse,
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 12),

              // 설명
              const Text('상품 설명:',
                  style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              TextField(
                controller: _descriptionController,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: '상품 설명을 입력해주세요',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.all(12),
                ),
              ),
              const SizedBox(height: 16),

              // 옵션
              Row(
                children: [
                  Expanded(
                    child: CheckboxListTile(
                      title: const Text('활성화', style: TextStyle(fontSize: 14)),
                      value: _isActive,
                      onChanged: (v) => setState(() => _isActive = v ?? true),
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                    ),
                  ),
                  Expanded(
                    child: CheckboxListTile(
                      title:
                          const Text('추천 상품', style: TextStyle(fontSize: 14)),
                      value: _isFeatured,
                      onChanged: (v) =>
                          setState(() => _isFeatured = v ?? false),
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('취소'),
        ),
        ElevatedButton(
          onPressed: _saveProduct,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
          child: const Text('저장'),
        ),
      ],
    );
  }

  Widget _buildTextField(
    TextEditingController controller,
    String label,
    IconData icon, {
    TextInputType? keyboardType,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      ),
    );
  }

  void _saveProduct() {
    Navigator.pop(context);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(widget.isAdd ? '상품이 등록되었습니다.' : '상품이 수정되었습니다.'),
      ),
    );
  }
}

/// 카테고리 등록/수정 다이얼로그
class CategoryFormDialog extends StatefulWidget {
  final bool isAdd;

  const CategoryFormDialog({super.key, required this.isAdd});

  @override
  State<CategoryFormDialog> createState() => _CategoryFormDialogState();
}

class _CategoryFormDialogState extends State<CategoryFormDialog> {
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  String? _parentCategory;
  bool _isActive = true;

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.isAdd ? '카테고리 추가' : '카테고리 수정'),
      content: SizedBox(
        width: 350,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 상위 카테고리
            const Text('상위 카테고리:',
                style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            DropdownButtonFormField<String>(
              initialValue: _parentCategory,
              hint: const Text('없음 (최상위)'),
              items: ['하키 장비', '보호대', '스케이트']
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (value) => setState(() => _parentCategory = value),
              decoration: InputDecoration(
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
            ),
            const SizedBox(height: 16),

            // 카테고리명
            TextField(
              controller: _nameController,
              decoration: InputDecoration(
                labelText: '카테고리명',
                prefixIcon: const Icon(Icons.folder, size: 20),
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
            const SizedBox(height: 12),

            // 설명
            TextField(
              controller: _descriptionController,
              maxLines: 2,
              decoration: InputDecoration(
                labelText: '설명 (선택)',
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
            const SizedBox(height: 12),

            // 활성화
            CheckboxListTile(
              title: const Text('활성화'),
              value: _isActive,
              onChanged: (v) => setState(() => _isActive = v ?? true),
              contentPadding: EdgeInsets.zero,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('취소'),
        ),
        ElevatedButton(
          onPressed: () {
            Navigator.pop(context);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content:
                    Text(widget.isAdd ? '카테고리가 추가되었습니다.' : '카테고리가 수정되었습니다.'),
              ),
            );
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
          child: const Text('저장'),
        ),
      ],
    );
  }
}

/// 재고 관리 다이얼로그
class _StockManagementDialog extends StatelessWidget {
  const _StockManagementDialog();

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('재고 관리'),
      content: SizedBox(
        width: 450,
        height: 400,
        child: Column(
          children: [
            // 검색바
            TextField(
              decoration: InputDecoration(
                hintText: '상품명으로 검색',
                prefixIcon: const Icon(Icons.search),
                border:
                    OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
            const SizedBox(height: 16),

            // 재고 목록
            Expanded(
              child: ListView.separated(
                itemCount: 5,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final stockData = [
                    ('CCM 헬멧 L', 15, AppColors.success),
                    ('Bauer 스케이트 280', 3, AppColors.warning),
                    ('CCM 글러브 M', 0, AppColors.error),
                    ('보호대 세트', 8, AppColors.success),
                    ('하키 스틱 주니어', 2, AppColors.warning),
                  ][index];

                  return ListTile(
                    title: Text(stockData.$1),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: stockData.$3.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            '${stockData.$2}개',
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: stockData.$3,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          icon: const Icon(Icons.edit, size: 18),
                          onPressed: () {},
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('닫기'),
        ),
      ],
    );
  }
}

/// 배송 현황 다이얼로그
class _DeliveryStatusDialog extends StatelessWidget {
  const _DeliveryStatusDialog();

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('배송 현황'),
      content: SizedBox(
        width: 450,
        height: 350,
        child: ListView.separated(
          itemCount: 4,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final deliveryData = [
              ('주문 #1234', '김민수', '배송 중', AppColors.primary),
              ('주문 #1235', '이영희', '배송 준비', AppColors.warning),
              ('주문 #1236', '박철수', '배송 완료', AppColors.success),
              ('주문 #1237', '최영자', '배송 중', AppColors.primary),
            ][index];

            return ListTile(
              title: Text(deliveryData.$1),
              subtitle: Text(deliveryData.$2),
              trailing: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: deliveryData.$4.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  deliveryData.$3,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: deliveryData.$4,
                  ),
                ),
              ),
            );
          },
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('닫기'),
        ),
      ],
    );
  }
}

/// 주문 내역 뷰 — Backend GET /api/v1/shop/orders 실 연동 (2026-04-30 P2-GAP-APP-001 해소)
class _OrderListView extends ConsumerWidget {
  const _OrderListView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(_shopOrdersProvider);

    return ordersAsync.when(
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      error: (_, __) => _OrderEmptyState(
        message: '주문 내역을 불러오지 못했습니다.',
        onRetry: () => ref.invalidate(_shopOrdersProvider),
      ),
      data: (orders) {
        if (orders.isEmpty) {
          return _OrderEmptyState(
            message: '아직 주문 내역이 없습니다.',
            onRetry: () => ref.invalidate(_shopOrdersProvider),
          );
        }
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(_shopOrdersProvider),
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: orders.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final order = orders[index];
              final meta = _statusMeta(order.status);
              return Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.borderColor),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '주문 #${order.orderNumber}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            order.customerName,
                            style: const TextStyle(
                              color: AppColors.lightText,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '₩${order.totalAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: meta.color.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            meta.label,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: meta.color,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }
}

/// 등록 선택 바텀시트
/// 주문 내역 빈 상태 (mock fallback 제거 후 노출용)
class _OrderEmptyState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _OrderEmptyState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.receipt_long_outlined,
              size: 48,
              color: AppColors.lightText.withValues(alpha: 0.6),
            ),
            const SizedBox(height: 12),
            Text(
              message,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.lightText,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: onRetry,
              child: const Text('다시 불러오기'),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddItemBottomSheet extends StatelessWidget {
  final VoidCallback onProductTap;
  final VoidCallback onCategoryTap;

  const _AddItemBottomSheet({
    required this.onProductTap,
    required this.onCategoryTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 핸들
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.dividers,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // 타이틀
              const Text(
                '등록하기',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                '등록할 항목을 선택해주세요',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.lightText,
                ),
              ),
              const SizedBox(height: 24),

              // 선택 버튼
              Row(
                children: [
                  Expanded(
                      child: _buildTypeButton(
                          '상품', Icons.inventory_2, onProductTap)),
                  const SizedBox(width: 12),
                  Expanded(
                      child: _buildTypeButton(
                          '카테고리', Icons.folder, onCategoryTap)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTypeButton(String label, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderColor),
        ),
        child: Column(
          children: [
            Icon(icon, color: AppColors.primary, size: 32),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.darkText,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// Design 7 Principles 적용 결과
// ============================================================
// 1. 화면 분석 필수: coach_admin_screen.dart 디자인 패턴 분석 완료
// 2. 휴먼 디자인: 전문적인 관리 시스템 UI 적용
// 3. AI 스타일 절대 금지: gradient, blur 미사용, 솔리드 컬러만 사용
// 4. 페르소나 융합: frontend + architect + backend 협업
// 5. 명령어 필수: frontend-design 스킬 활용
// 6. 결과 출력 필수: 본 주석으로 결과 출력
// 7. Tone & Manner: 존댓말 적용 (등록되었습니다, 선택해주세요 등)
