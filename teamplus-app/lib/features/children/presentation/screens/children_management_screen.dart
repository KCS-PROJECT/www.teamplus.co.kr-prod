import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/colors.dart';
import '../providers/children_provider.dart';
import '../widgets/child_card.dart';
// 2026-05-16: 자녀 등록 기능 제거 — AddChildFab import 삭제 (관련 위젯 미사용)

/// TEAMPLUS 자녀 관리 화면
/// 참고: 학교종이 앱 서비스/자녀추가 디자인
///
/// Design 7 Principles 적용:
/// 1. 화면 분석 필수 - 서비스/자녀추가 화면 구조 분석 완료
/// 2. 휴먼 디자인 - 오렌지 헤더, 깔끔한 자녀 카드
/// 3. AI 스타일 절대 금지 - 그라데이션, blur 효과 미사용
/// 4. 페르소나 융합 - frontend, architect, backend 협업
/// 5. 명령어 필수 - frontend-design 스킬 활용
/// 6. 결과 출력 필수 - 하단 주석 참조
/// 7. Tone & Manner - 존댓말, 전문적 표현
class ChildrenManagementScreen extends ConsumerStatefulWidget {
  const ChildrenManagementScreen({super.key});

  @override
  ConsumerState<ChildrenManagementScreen> createState() =>
      _ChildrenManagementScreenState();
}

class _ChildrenManagementScreenState
    extends ConsumerState<ChildrenManagementScreen> {
  int _currentNavIndex = 3; // 서비스/자녀추가 탭 선택됨

  /// API 데이터를 ChildData로 변환
  List<ChildData> _mapApiToChildData(List<Map<String, dynamic>> apiChildren) {
    const avatarColors = [
      AppColors.accent,
      AppColors.warning,
      AppColors.primary,
      AppColors.success,
      AppColors.info,
    ];

    return apiChildren.asMap().entries.map((entry) {
      final child = entry.value;
      final index = entry.key;

      // 이름 조합: firstName + lastName 또는 name
      final name = child['name'] as String? ??
          '${child['firstName'] ?? ''} ${child['lastName'] ?? ''}'.trim();

      // 클럽 정보 추출 (memberships가 있는 경우)
      String clubName = '';
      String className = '';
      if (child['memberships'] is List &&
          (child['memberships'] as List).isNotEmpty) {
        final membership =
            (child['memberships'] as List).first as Map<String, dynamic>?;
        if (membership != null) {
          clubName = (membership['club'] as Map<String, dynamic>?)?['name']
                  as String? ??
              '';
          className = membership['className'] as String? ?? '';
        }
      }

      return ChildData(
        id: (child['id'] ?? '').toString(),
        name: name.isNotEmpty ? name : '자녀 ${index + 1}',
        clubName: clubName,
        className: className,
        avatarColor: avatarColors[index % avatarColors.length],
      );
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final childrenAsync = ref.watch(myChildrenProvider);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: Column(
          children: [
            // 오렌지색 헤더
            _buildHeader(),

            // 내 정보 섹션
            _buildMyInfoSection(),

            // 자녀 목록 (API 데이터)
            Expanded(
              child: childrenAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => _buildErrorState(),
                data: (apiChildren) {
                  final children = _mapApiToChildData(apiChildren);
                  if (children.isEmpty) return _buildEmptyState();
                  return _buildChildrenList(children);
                },
              ),
            ),

            // 메뉴 섹션
            _buildMenuSection(),
          ],
        ),
        // 2026-05-16: 자녀 등록 기능 제거 — AddChildFab(+) 삭제.
        //   자녀 등록은 소속 클럽 담당 코치 또는 관리자가 수행하는 정책으로 변경.
        bottomNavigationBar: _buildBottomNavBar(),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      color: AppColors.warning, // 오렌지색
      child: SafeArea(
        bottom: false,
        child: Container(
          height: 56,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            children: [
              // Back 버튼
              if (Navigator.of(context).canPop() ||
                  GoRouter.of(context).canPop())
                IconButton(
                  onPressed: () {
                    if (Navigator.of(context).canPop()) {
                      Navigator.of(context).pop();
                    } else {
                      context.pop();
                    }
                  },
                  icon: const Icon(
                    Icons.arrow_back_ios_new,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
              const Expanded(
                child: Padding(
                  padding: EdgeInsets.only(left: 12),
                  child: Text(
                    '자녀 관리',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: -0.3,
                    ),
                  ),
                ),
              ),
              IconButton(
                onPressed: () {},
                icon: const Icon(
                  Icons.settings_outlined,
                  color: Colors.white,
                  size: 24,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMyInfoSection() {
    return Container(
      color: AppColors.white,
      padding: const EdgeInsets.all(16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // 선택된 자녀 표시
          Consumer(
            builder: (context, ref, _) {
              final selectedChild = ref.watch(selectedChildProvider);
              return selectedChild.when(
                data: (child) => Text(
                  child != null
                      ? '${child['name'] ?? '자녀'} 관리 중'
                      : '자녀를 선택해주세요',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppColors.darkText,
                  ),
                ),
                loading: () => const Text(
                  '불러오는 중...',
                  style: TextStyle(fontSize: 16, color: AppColors.lightText),
                ),
                error: (_, __) => const Text(
                  '자녀 정보',
                  style: TextStyle(fontSize: 16, color: AppColors.darkText),
                ),
              );
            },
          ),
          // 내정보관리 버튼
          GestureDetector(
            onTap: () => context.push('/profile'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                border: Border.all(color: AppColors.warning, width: 1.5),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.play_arrow,
                    size: 14,
                    color: AppColors.warning,
                  ),
                  SizedBox(width: 4),
                  Text(
                    '내정보관리',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.warning,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChildrenList(List<ChildData> children) {
    return Container(
      color: AppColors.background,
      child: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myChildrenProvider);
        },
        child: ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: children.length,
          itemBuilder: (context, index) {
            final isSelected = ref.watch(selectedChildIndexProvider) == index;
            return Padding(
              padding:
                  EdgeInsets.only(bottom: index < children.length - 1 ? 12 : 0),
              child: Stack(
                children: [
                  ChildCard(
                    data: children[index],
                    onTap: () {
                      // 자녀 선택 시 selectedChildIndex 업데이트
                      ref
                          .read(selectedChildIndexProvider.notifier)
                          .setIndex(index);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('${children[index].name}님이 선택되었습니다.'),
                          duration: const Duration(seconds: 1),
                        ),
                      );
                    },
                    onVideoUpload: () {
                      context.push(
                        '/videos/upload',
                        extra: {
                          'childId': children[index].id,
                          'childName': children[index].name,
                        },
                      );
                    },
                  ),
                  // 선택 표시
                  if (isSelected)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Container(
                        width: 24,
                        height: 24,
                        decoration: const BoxDecoration(
                          color: AppColors.success,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.check,
                          size: 14,
                          color: Colors.white,
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: const BoxDecoration(
              color: AppColors.primaryLight,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.child_care,
              size: 40,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            '등록된 자녀가 없습니다',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.darkText,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            '자녀를 추가하여 수업을 관리해보세요',
            style: TextStyle(
              fontSize: 14,
              color: AppColors.lightText,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 48, color: AppColors.error),
          const SizedBox(height: 12),
          const Text('자녀 목록을 불러올 수 없습니다.'),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () => ref.invalidate(myChildrenProvider),
            child: const Text('다시 시도'),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuSection() {
    return Container(
      color: AppColors.white,
      child: Column(
        children: [
          _buildMenuItem(
            icon: Icons.info_outline,
            title: '이용 안내',
            onTap: () {},
          ),
          const Divider(height: 1),
          _buildMenuItem(
            icon: Icons.help_outline,
            title: '자주하는 질문',
            onTap: () {},
          ),
        ],
      ),
    );
  }

  Widget _buildMenuItem({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Row(
          children: [
            Icon(icon, size: 20, color: AppColors.lightText),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: AppColors.darkText,
                ),
              ),
            ),
            const Icon(
              Icons.chevron_right,
              size: 20,
              color: AppColors.hintText,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomNavBar() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: SizedBox(
          height: 64,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildNavItem(
                icon: Icons.home_outlined,
                activeIcon: Icons.home,
                label: '홈',
                index: 0,
              ),
              _buildNavItem(
                icon: Icons.schedule_outlined,
                activeIcon: Icons.schedule,
                label: '일정',
                index: 1,
              ),
              _buildNavItem(
                icon: Icons.message_outlined,
                activeIcon: Icons.message,
                label: '알림',
                index: 2,
              ),
              _buildNavItem(
                icon: Icons.family_restroom_outlined,
                activeIcon: Icons.family_restroom,
                label: '자녀관리',
                index: 3,
                showBadge: true,
              ),
              _buildNavItem(
                icon: Icons.store_outlined,
                activeIcon: Icons.store,
                label: '스토어',
                index: 4,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required IconData icon,
    required IconData activeIcon,
    required String label,
    required int index,
    bool showBadge = false,
  }) {
    final isSelected = _currentNavIndex == index;
    return GestureDetector(
      onTap: () {
        setState(() {
          _currentNavIndex = index;
        });
        switch (index) {
          case 0:
            context.push('/home');
            break;
          case 1:
            context.push('/classes');
            break;
          case 2:
            context.push('/notifications');
            break;
          case 3: // 자녀관리 - 현재 화면
            break;
          case 4: // 스토어
            break;
        }
      },
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 64,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  isSelected ? activeIcon : icon,
                  color: isSelected ? AppColors.warning : AppColors.lightText,
                  size: 26,
                ),
                if (showBadge && isSelected)
                  Positioned(
                    right: -8,
                    top: -4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.warning,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'ooo',
                        style: TextStyle(
                          fontSize: 8,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected ? AppColors.warning : AppColors.lightText,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // 2026-05-16: 자녀 등록 기능 제거 — 미사용 메서드(추후 클린업 시 위젯 _AddChildBottomSheet 와 함께 삭제 예정).
  @Deprecated('자녀 등록 기능 제거 (2026-05-16) — 코치/관리자 측에서 수행')
  // ignore: unused_element
  void _showAddChildBottomSheet() {
    final messenger = ScaffoldMessenger.of(context);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _AddChildBottomSheet(
        onAdd: (name, email, password, birthDate) async {
          Navigator.pop(ctx);
          try {
            await ref.read(createChildProvider((
              firstName: name,
              lastName: '',
              birthDate: birthDate,
              email: email,
              password: password,
              phone: null,
              gender: null,
              relationship: null,
              note: null,
            )).future);

            // 자녀 목록 새로고침
            ref.invalidate(myChildrenProvider);

            if (mounted) {
              messenger.showSnackBar(
                const SnackBar(
                  content: Text('자녀가 등록되었습니다.'),
                  backgroundColor: AppColors.success,
                ),
              );
            }
          } catch (e) {
            if (mounted) {
              messenger.showSnackBar(
                SnackBar(
                  content: Text('자녀 등록에 실패했습니다. ${e.toString()}'),
                  backgroundColor: AppColors.error,
                ),
              );
            }
          }
        },
      ),
    );
  }
}

/// 자녀 데이터 모델
class ChildData {
  final String id;
  final String name;
  final String clubName;
  final String className;
  final Color avatarColor;

  const ChildData({
    required this.id,
    required this.name,
    required this.clubName,
    required this.className,
    required this.avatarColor,
  });
}

/// 자녀 추가 바텀시트 (API 연동)
class _AddChildBottomSheet extends StatefulWidget {
  final Function(String name, String email, String password, String birthDate)
      onAdd;

  const _AddChildBottomSheet({required this.onAdd});

  @override
  State<_AddChildBottomSheet> createState() => _AddChildBottomSheetState();
}

class _AddChildBottomSheetState extends State<_AddChildBottomSheet> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _birthDateController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _birthDateController.dispose();
    super.dispose();
  }

  Future<void> _selectBirthDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(2015, 1, 1),
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
      locale: const Locale('ko'),
    );
    if (picked != null) {
      _birthDateController.text =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    }
  }

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
                '자녀 추가',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                '자녀 정보를 입력해주세요',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.lightText,
                ),
              ),
              const SizedBox(height: 24),

              // 자녀 이름 입력
              _buildLabel('자녀 이름'),
              const SizedBox(height: 8),
              TextField(
                controller: _nameController,
                decoration:
                    _inputDecoration('이름을 입력해주세요', Icons.person_outline),
              ),
              const SizedBox(height: 16),

              // 이메일 입력
              _buildLabel('이메일'),
              const SizedBox(height: 8),
              TextField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration:
                    _inputDecoration('이메일을 입력해주세요', Icons.email_outlined),
              ),
              const SizedBox(height: 16),

              // 비밀번호 입력
              _buildLabel('비밀번호'),
              const SizedBox(height: 8),
              TextField(
                controller: _passwordController,
                obscureText: true,
                decoration:
                    _inputDecoration('비밀번호 (8자 이상)', Icons.lock_outline),
              ),
              const SizedBox(height: 16),

              // 생년월일 입력
              _buildLabel('생년월일'),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: _selectBirthDate,
                child: AbsorbPointer(
                  child: TextField(
                    controller: _birthDateController,
                    decoration:
                        _inputDecoration('생년월일을 선택해주세요', Icons.calendar_today),
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // 추가 버튼
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: () {
                    if (_nameController.text.isNotEmpty &&
                        _emailController.text.isNotEmpty &&
                        _passwordController.text.isNotEmpty &&
                        _birthDateController.text.isNotEmpty) {
                      widget.onAdd(
                        _nameController.text,
                        _emailController.text,
                        _passwordController.text,
                        _birthDateController.text,
                      );
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('모든 필드를 입력해주세요.'),
                        ),
                      );
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.warning,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                  ),
                  child: const Text(
                    '자녀 추가하기',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: AppColors.darkText,
      ),
    );
  }

  InputDecoration _inputDecoration(String hint, IconData icon) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: Icon(icon),
      filled: true,
      fillColor: AppColors.background,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide.none,
      ),
    );
  }
}
