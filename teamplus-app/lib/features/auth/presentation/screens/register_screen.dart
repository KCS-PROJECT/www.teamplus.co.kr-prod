import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../shared/widgets/keyboard_aware_scroll_view.dart';
import '../providers/auth_provider.dart';

/// TEAMPLUS 회원가입 화면
///
/// Design 7 Principles 적용:
/// 1. 화면 분석 필수 - HTML/이미지 픽셀 단위 분석 완료
/// 2. 휴먼 디자인 - 솔리드 컬러, 깔끔한 레이아웃
/// 3. AI 스타일 절대 금지 - 그라데이션 미사용
/// 4. 참조 이미지 컬러 팔레트 정확히 적용
/// 5. 접근성 고려 - WCAG AA 준수 (48dp 터치 타겟)
/// 6. Tone & Manner - 존댓말 사용
/// 7. Material Symbols 아이콘 사용
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nameController;
  late TextEditingController _emailController;
  late TextEditingController _passwordController;
  late TextEditingController _confirmPasswordController;
  late TabController _tabController;

  String _userType = 'parent'; // parent, coach
  bool _isLoading = false;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _emailController = TextEditingController();
    _passwordController = TextEditingController();
    _confirmPasswordController = TextEditingController();
    _tabController = TabController(length: 2, vsync: this, initialIndex: 1);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _tabController.dispose();
    super.dispose();
  }

  void _handleRegister() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = await ref.read(
        registerProvider(
          (
            email: _emailController.text.trim(),
            phone: '',
            password: _passwordController.text.trim(),
            name: _nameController.text.trim(),
            userType: _userType,
          ),
        ).future,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('환영합니다! 가입이 완료되었습니다.'),
            backgroundColor: _C.primary,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        );

        if (response.userType == 'coach') {
          context.go('/coach-dashboard');
        } else {
          context.go('/dashboard');
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: _C.bgDark,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: _C.bgDark,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: _C.bgDark,
        resizeToAvoidBottomInset: true,
        body: SafeArea(
          child: Column(
            children: [
              // App Bar
              _buildAppBar(),
              // Scrollable Content
              Expanded(
                child: KeyboardAwareScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 16),
                        _buildHeader(),
                        const SizedBox(height: 24),
                        _buildTabBar(),
                        const SizedBox(height: 24),
                        _buildUserTypeSelection(),
                        const SizedBox(height: 20),
                        _buildRegisterForm(),
                        const SizedBox(height: 24),
                        _buildTermsText(),
                        const SizedBox(height: 32),
                      ],
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

  /// 앱바 - 타이틀만
  Widget _buildAppBar() {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: const Center(
        child: Text(
          'TEAMPLUS',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: _C.blueLight,
            letterSpacing: 1.5,
          ),
        ),
      ),
    );
  }

  /// 헤더 - 메인 타이틀 + 서브타이틀 (로그인과 동일한 구조)
  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // h1 - text-[32px] font-extrabold
        RichText(
          text: const TextSpan(
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              color: _C.textWhite,
              height: 1.2,
              letterSpacing: -0.5,
            ),
            children: [
              TextSpan(text: '아이스하키의 새로운 미래,\n'),
              TextSpan(
                text: '시작해보세요',
                style: TextStyle(color: _C.primary),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // Subtitle
        const Text(
          '회원가입을 위해 정보를 입력해주세요.',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w400,
            color: _C.textSecondary,
          ),
        ),
      ],
    );
  }

  /// 탭바 - 로그인/회원가입
  Widget _buildTabBar() {
    return Container(
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: _C.borderDark,
            width: 1,
          ),
        ),
      ),
      child: TabBar(
        controller: _tabController,
        onTap: (index) {
          if (index == 0) {
            // [2026-05-19] 네이티브 /login 폐기 → WebView /login/ 단일 SoT.
            context.go('/webview');
          }
        },
        indicatorColor: _C.primary,
        indicatorWeight: 3,
        indicatorSize: TabBarIndicatorSize.tab,
        labelColor: _C.primary,
        unselectedLabelColor: _C.textMuted,
        labelStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
        unselectedLabelStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
        dividerColor: Colors.transparent,
        labelPadding: EdgeInsets.zero,
        tabs: const [
          Tab(text: '로그인'),
          Tab(text: '회원가입'),
        ],
      ),
    );
  }

  /// 회원 유형 선택 (학부모/코치)
  Widget _buildUserTypeSelection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '회원 유형',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: _C.textLight,
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: _buildUserTypeButton(
                label: '학부모',
                value: 'parent',
                icon: Icons.family_restroom_outlined,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildUserTypeButton(
                label: '코치',
                value: 'coach',
                icon: Icons.sports_hockey_outlined,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildUserTypeButton({
    required String label,
    required String value,
    required IconData icon,
  }) {
    final isSelected = _userType == value;
    return GestureDetector(
      onTap: _isLoading
          ? null
          : () {
              setState(() {
                _userType = value;
              });
            },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 56,
        decoration: BoxDecoration(
          color:
              isSelected ? _C.primary.withValues(alpha: 0.15) : _C.surfaceDark,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? _C.primary : Colors.transparent,
            width: 2,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 22,
              color: isSelected ? _C.primary : _C.textMuted,
            ),
            const SizedBox(width: 10),
            Text(
              label,
              style: TextStyle(
                fontSize: 15,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected ? _C.primary : _C.textWhite,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 회원가입 폼
  Widget _buildRegisterForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Name Field
        _buildInputField(
          controller: _nameController,
          label: '이름',
          hint: '이름을 입력해주세요',
          icon: Icons.person_outline,
          validator: (value) {
            if (value == null || value.isEmpty) {
              return '이름을 입력해주세요.';
            }
            return null;
          },
        ),
        const SizedBox(height: 20),

        // Email Field
        _buildInputField(
          controller: _emailController,
          label: '이메일 주소',
          hint: '이메일을 입력해주세요',
          icon: Icons.mail_outline,
          keyboardType: TextInputType.emailAddress,
          validator: (value) {
            if (value == null || value.isEmpty) {
              return '이메일을 입력해주세요.';
            }
            if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value)) {
              return '올바른 이메일 형식을 입력해주세요.';
            }
            return null;
          },
        ),
        const SizedBox(height: 20),

        // Password Field
        _buildInputField(
          controller: _passwordController,
          label: '비밀번호',
          hint: '비밀번호를 입력하세요',
          icon: Icons.lock_outline,
          isPassword: true,
          obscureText: _obscurePassword,
          onToggleObscure: () {
            setState(() {
              _obscurePassword = !_obscurePassword;
            });
          },
          validator: (value) {
            if (value == null || value.isEmpty) {
              return '비밀번호를 입력해주세요.';
            }
            if (value.length < 8) {
              return '비밀번호는 8자 이상이어야 합니다.';
            }
            return null;
          },
        ),
        const SizedBox(height: 20),

        // Confirm Password Field
        _buildInputField(
          controller: _confirmPasswordController,
          label: '비밀번호 확인',
          hint: '비밀번호를 다시 입력하세요',
          icon: Icons.check_circle_outline,
          isPassword: true,
          obscureText: _obscureConfirmPassword,
          onToggleObscure: () {
            setState(() {
              _obscureConfirmPassword = !_obscureConfirmPassword;
            });
          },
          validator: (value) {
            if (value == null || value.isEmpty) {
              return '비밀번호 확인을 입력해주세요.';
            }
            if (value != _passwordController.text) {
              return '비밀번호가 일치하지 않습니다.';
            }
            return null;
          },
        ),
        const SizedBox(height: 8),

        // Error Message
        if (_errorMessage != null) ...[
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _C.error.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.error_outline, color: _C.error, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _errorMessage!,
                    style: const TextStyle(fontSize: 13, color: _C.error),
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),

        // Register Button (h-14 = 56px, shadow-lg shadow-blue-500/30)
        Container(
          width: double.infinity,
          height: 56,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: _C.primary.withValues(alpha: 0.3),
                blurRadius: 16,
                offset: const Offset(0, 8),
                spreadRadius: 0,
              ),
            ],
          ),
          child: ElevatedButton(
            onPressed: _isLoading ? null : _handleRegister,
            style: ElevatedButton.styleFrom(
              backgroundColor: _C.primary,
              foregroundColor: Colors.white,
              disabledBackgroundColor: _C.primary.withValues(alpha: 0.5),
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: _isLoading
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : const Text(
                    '회원가입',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
          ),
        ),
      ],
    );
  }

  /// 입력 필드 (참조 이미지 기준: h-14, rounded-xl, no border, shadow-sm)
  Widget _buildInputField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
    bool isPassword = false,
    bool obscureText = false,
    VoidCallback? onToggleObscure,
    String? Function(String?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Label (text-sm font-semibold)
        Text(
          label,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: _C.textLight,
          ),
        ),
        const SizedBox(height: 6),
        // Input Field (h-14 = 56px, rounded-xl = 12px, bg-surface-dark, no border)
        Container(
          height: 56,
          decoration: BoxDecoration(
            color: _C.surfaceDark,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.1),
                blurRadius: 4,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          child: TextFormField(
            controller: controller,
            keyboardType: keyboardType,
            obscureText: isPassword && obscureText,
            enabled: !_isLoading,
            validator: validator,
            cursorColor: Colors.black,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w400,
              color: Colors.black,
            ),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w400,
                color: _C.textMuted,
              ),
              prefixIcon: Padding(
                padding: const EdgeInsets.only(left: 16, right: 12),
                child: Icon(icon, size: 24, color: _C.textMuted),
              ),
              prefixIconConstraints: const BoxConstraints(
                minWidth: 52,
                minHeight: 56,
              ),
              suffixIcon: isPassword
                  ? Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: IconButton(
                        tooltip: obscureText ? '비밀번호 보기' : '비밀번호 숨기기',
                        icon: Icon(
                          obscureText
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                          size: 24,
                          color: _C.textMuted,
                        ),
                        onPressed: onToggleObscure,
                      ),
                    )
                  : null,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 16),
              errorStyle: const TextStyle(
                fontSize: 12,
                color: _C.error,
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// 푸터 - 약관 동의 텍스트
  Widget _buildTermsText() {
    return const Center(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 32),
        child: Text.rich(
          TextSpan(
            style: TextStyle(
              fontSize: 12,
              color: _C.textMuted,
              height: 1.6,
            ),
            children: [
              TextSpan(text: '회원가입하시면 '),
              TextSpan(
                text: '이용약관',
                style: TextStyle(
                  color: _C.textMuted,
                  decoration: TextDecoration.underline,
                  decorationColor: _C.textMuted,
                ),
              ),
              TextSpan(text: ' 및 '),
              TextSpan(
                text: '개인정보처리방침',
                style: TextStyle(
                  color: _C.textMuted,
                  decoration: TextDecoration.underline,
                  decorationColor: _C.textMuted,
                ),
              ),
              TextSpan(text: '에 동의하는 것으로 간주됩니다.'),
            ],
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

/// 참조 이미지 기반 컬러 팔레트 (code.html tailwind.config 기준)
class _C {
  // Primary: #2563eb (Blue-600)
  static const Color primary = Color(0xFF2563EB);

  // Background Dark: #0f172a (Slate-900)
  static const Color bgDark = Color(0xFF0F172A);

  // Surface Dark: #1e293b (Slate-800 - 입력필드 배경)
  static const Color surfaceDark = Color(0xFF1E293B);

  // Text Colors
  static const Color textWhite = Color(0xFFFFFFFF);
  static const Color textLight = Color(0xFFE2E8F0); // Slate-200
  static const Color textSecondary = Color(0xFF94A3B8); // Slate-400
  static const Color textMuted = Color(0xFF64748B); // Slate-500

  // Blue Light: text-blue-400
  static const Color blueLight = Color(0xFF60A5FA);

  // Border Dark: #334155 (Slate-700)
  static const Color borderDark = Color(0xFF334155);

  // Error
  static const Color error = Color(0xFFEF4444);
}
