import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../../shared/widgets/keyboard_aware_scroll_view.dart';
import '../providers/auth_provider.dart';

// 아이디 저장 — SharedPreferences 키 (Web 의 localStorage 키와 동일 의미)
// 사용자 직접 지시 (2026-05-23): App 도 Web 과 동일하게 "아이디 저장" 동작 제공.
const String _kRememberEmailFlagKey = 'teamplus_remember_email_enabled';
const String _kSavedEmailKey = 'teamplus_saved_email';

/// TEAMPLUS 로그인 화면
/// HTML 디자인 파일 (code.html) 기반 구현
///
/// Design Specs from HTML:
/// - Background: #0f172a (Slate-900)
/// - Surface: #1e293b (Slate-800)
/// - Primary: #2563eb (Blue-600)
/// - Font: Pretendard
/// - Header: 32px, font-extrabold (w800)
/// - Labels: 14px, font-semibold (w600)
/// - Input: h-14 (56px), rounded-xl (12px)
/// - Button: rounded-xl (12px), shadow-blue-500/30
/// - Social: 56x56px, rounded-full
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    with SingleTickerProviderStateMixin {
  late TextEditingController _emailController;
  late TextEditingController _passwordController;
  late TabController _tabController;
  bool _isLoading = false;
  bool _obscurePassword = true;
  String? _errorMessage;
  // 아이디 저장 — 기본 켜짐(Web 과 동일). initState 의 _loadSavedEmail() 에서
  // SharedPreferences 값으로 덮어씀.
  bool _rememberEmail = true;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController();
    _passwordController = TextEditingController();
    _tabController = TabController(length: 2, vsync: this, initialIndex: 0);
    _loadSavedEmail();
  }

  /// SharedPreferences 에서 저장된 이메일 + 체크 상태 복원.
  /// initState 직후 비동기로 호출되어 첫 frame 이후 setState 로 반영.
  Future<void> _loadSavedEmail() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final enabled = prefs.getBool(_kRememberEmailFlagKey);
      final savedEmail = prefs.getString(_kSavedEmailKey);
      if (!mounted) return;
      setState(() {
        if (enabled != null) _rememberEmail = enabled;
        if (savedEmail != null && savedEmail.isNotEmpty) {
          _emailController.text = savedEmail;
        }
      });
    } catch (_) {
      // SharedPreferences 비가용 환경 — 무시 (기본값 유지)
    }
  }

  /// 체크박스 토글 시 즉시 SharedPreferences 반영.
  /// 해제 시 저장된 이메일도 함께 삭제 (Web 동작과 동일).
  Future<void> _onRememberEmailChanged(bool checked) async {
    setState(() => _rememberEmail = checked);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_kRememberEmailFlagKey, checked);
      if (!checked) {
        await prefs.remove(_kSavedEmailKey);
      }
    } catch (_) {
      // SharedPreferences 비가용 환경 — 무시
    }
  }

  /// 로그인 성공 시 호출 — 체크 상태에 따라 이메일 보관/삭제.
  Future<void> _persistEmailAfterLogin(String email) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (_rememberEmail) {
        await prefs.setString(_kSavedEmailKey, email);
        await prefs.setBool(_kRememberEmailFlagKey, true);
      } else {
        await prefs.remove(_kSavedEmailKey);
        await prefs.setBool(_kRememberEmailFlagKey, false);
      }
    } catch (_) {
      // SharedPreferences 비가용 환경 — 무시
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _tabController.dispose();
    super.dispose();
  }

  void _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      setState(() {
        _errorMessage = '이메일과 비밀번호를 입력해주세요.';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final response = await ref.read(
        loginProvider(
          (email: email, password: password),
        ).future,
      );

      if (mounted) {
        // 아이디 저장 — 성공 시점에만 갱신 (실패한 이메일은 저장하지 않음)
        await _persistEmailAfterLogin(email);
        setState(() {
          _isLoading = false;
        });
        _navigateAfterLogin(response.userType);
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

  /// 로그인 성공 후 이동
  /// - useAuthGuard / requireLogin 이 부착한 `?returnPath=` 가 있으면 그 경로로 우선 이동
  /// - 없으면 userType 기반 기본 대시보드로
  void _navigateAfterLogin(String userType) {
    final returnPath = _readReturnPath();
    if (returnPath != null &&
        returnPath.startsWith('/') &&
        !returnPath.startsWith('//')) {
      context.go(returnPath);
      return;
    }
    if (userType == 'COACH' || userType == 'coach') {
      context.go('/coach-dashboard');
    } else {
      context.go('/dashboard');
    }
  }

  String? _readReturnPath() {
    try {
      final state = GoRouterState.of(context);
      final fromQuery = state.uri.queryParameters['returnPath'];
      if (fromQuery != null && fromQuery.isNotEmpty) {
        return Uri.decodeQueryComponent(fromQuery);
      }
      final extra = state.extra;
      if (extra is Map && extra['returnPath'] is String) {
        return extra['returnPath'] as String;
      }
    } catch (_) {
      // GoRouterState 가 컨텍스트에 없을 경우 무시
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: _C.bg,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: _C.bg,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: _C.bg,
        resizeToAvoidBottomInset: true,
        body: SafeArea(
          child: Column(
            children: [
              // App Bar - p-4 (16px)
              _buildAppBar(),
              // Scrollable Content
              Expanded(
                child: KeyboardAwareScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header - 회원가입과 동일한 시작 위치
                      const SizedBox(height: 16),
                      _buildHeader(),
                      const SizedBox(height: 24),
                      // Tab Bar
                      _buildTabBar(),
                      const SizedBox(height: 24),
                      // Login Form
                      _buildLoginForm(),
                      const SizedBox(height: 32),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 앱바 - 타이틀만 중앙 배치
  Widget _buildAppBar() {
    return const Padding(
      padding: EdgeInsets.all(16),
      child: Center(
        child: Text(
          'TEAMPLUS',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: _C.blueLight,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }

  /// 헤더 - text-[32px] font-extrabold leading-tight tracking-tight
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
              color: _C.textPrimary,
              height: 1.2,
              letterSpacing: -0.5,
            ),
            children: [
              TextSpan(text: '아이스하키의 새로운 미래,\n'),
              TextSpan(
                text: '환영합니다',
                style: TextStyle(color: _C.primary),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // p - mt-2 text-text-secondary text-base
        const Text(
          '서비스 이용을 위해 정보를 입력해주세요.',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w400,
            color: _C.textSecondary,
          ),
        ),
      ],
    );
  }

  /// 탭바 - border-b border-slate-700
  Widget _buildTabBar() {
    return Container(
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: _C.borderColor,
            width: 1,
          ),
        ),
      ),
      child: TabBar(
        controller: _tabController,
        onTap: (index) {
          if (index == 1) {
            // 회원가입 탭 → 새 가입 플로우(A5 권한 안내)로 진입.
            // 기존 /register 단일 폼은 deprecated. 다단계 플로우 사용.
            context.go('/signup/permissions');
          }
        },
        // border-b-[3px] border-primary
        indicatorColor: _C.primary,
        indicatorWeight: 3,
        indicatorSize: TabBarIndicatorSize.tab,
        // text-primary text-sm font-bold
        labelColor: _C.primary,
        labelStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
        // text-slate-500 text-sm font-bold
        unselectedLabelColor: _C.textMuted,
        unselectedLabelStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
        ),
        dividerColor: Colors.transparent,
        labelPadding: EdgeInsets.zero,
        // pb-3 pt-2
        tabs: const [
          Tab(
            height: 44,
            text: '로그인',
          ),
          Tab(
            height: 44,
            text: '회원가입',
          ),
        ],
      ),
    );
  }

  /// 로그인 폼 - flex flex-col gap-5
  Widget _buildLoginForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Email Field
        _buildInputField(
          controller: _emailController,
          label: '이메일 주소',
          hint: '이메일을 입력해주세요',
          icon: Icons.mail_outline,
          keyboardType: TextInputType.emailAddress,
        ),
        // gap-5 (20px)
        const SizedBox(height: 20),

        // Password Field
        _buildInputField(
          controller: _passwordController,
          label: '비밀번호',
          hint: '비밀번호를 입력하세요',
          icon: Icons.lock_outline,
          isPassword: true,
        ),

        // 옵션 줄: [아이디 저장 체크박스] ─ [비밀번호 찾기]
        // Web 의 옵션 줄과 동일한 위계 (좌: 저장 토글, 우: 비밀번호 찾기).
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            InkWell(
              onTap: _isLoading
                  ? null
                  : () => _onRememberEmailChanged(!_rememberEmail),
              borderRadius: BorderRadius.circular(4),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 20,
                      height: 20,
                      child: Checkbox(
                        value: _rememberEmail,
                        onChanged: _isLoading
                            ? null
                            : (v) => _onRememberEmailChanged(v ?? false),
                        materialTapTargetSize:
                            MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                        activeColor: _C.primary,
                        checkColor: Colors.white,
                        side: const BorderSide(
                          color: _C.borderColor,
                          width: 1.5,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Text(
                      '아이디 저장',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _C.labelColor,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            TextButton(
              onPressed: () {},
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 4),
                minimumSize: const Size(48, 32),
              ),
              child: const Text(
                '비밀번호 찾기',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: _C.primary,
                ),
              ),
            ),
          ],
        ),

        // Error Message
        if (_errorMessage != null) ...[
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _C.error.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
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

        // mt-2 (8px)
        const SizedBox(height: 8),

        // Login Button - rounded-2xl py-4 shadow-lg shadow-blue-500/30
        Container(
          width: double.infinity,
          height: 56,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
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
            onPressed: _isLoading ? null : _handleLogin,
            style: ElevatedButton.styleFrom(
              backgroundColor: _C.primary,
              foregroundColor: Colors.white,
              disabledBackgroundColor: _C.primary.withValues(alpha: 0.5),
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
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
                    '로그인',
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

  /// 입력 필드 - gap-1.5, h-14, rounded-2xl, bg-surface-dark
  Widget _buildInputField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
    bool isPassword = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // span - text-slate-200 text-sm font-semibold
        Text(
          label,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: _C.labelColor,
          ),
        ),
        // gap-1.5 (6px)
        const SizedBox(height: 6),
        // input - h-14 rounded-2xl bg-surface-dark border-none
        Container(
          height: 56,
          decoration: BoxDecoration(
            color: _C.surface,
            borderRadius: BorderRadius.circular(16),
          ),
          child: TextField(
            controller: controller,
            keyboardType: keyboardType,
            obscureText: isPassword && _obscurePassword,
            enabled: !_isLoading,
            cursorColor: Colors.black,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w400,
              color: Colors.black,
            ),
            decoration: InputDecoration(
              hintText: hint,
              // placeholder:text-slate-500
              hintStyle: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w400,
                color: _C.textMuted,
              ),
              // absolute left-4 - pl-12
              prefixIcon: Padding(
                padding: const EdgeInsets.only(left: 16, right: 12),
                child: Icon(icon, size: 24, color: _C.textMuted),
              ),
              prefixIconConstraints: const BoxConstraints(
                minWidth: 48,
                minHeight: 56,
              ),
              // absolute right-4
              suffixIcon: isPassword
                  ? IconButton(
                      tooltip: _obscurePassword ? '비밀번호 보기' : '비밀번호 숨기기',
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        size: 24,
                        color: _C.textMuted,
                      ),
                      onPressed: () {
                        setState(() {
                          _obscurePassword = !_obscurePassword;
                        });
                      },
                    )
                  : null,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 18),
            ),
          ),
        ),
      ],
    );
  }
}

/// HTML 디자인 파일 기반 컬러 팔레트
/// Tailwind CSS 클래스 → Flutter Color
class _C {
  // background-dark: #0f172a (Slate-900)
  static const Color bg = Color(0xFF0F172A);

  // surface-dark: #1e293b (Slate-800 - 입력필드 배경)
  static const Color surface = Color(0xFF1E293B);

  // primary: #2563eb (Blue-600)
  static const Color primary = Color(0xFF2563EB);

  // text-blue-400
  static const Color blueLight = Color(0xFF60A5FA);

  // text-white
  static const Color textPrimary = Color(0xFFFFFFFF);

  // text-slate-200 (labels)
  static const Color labelColor = Color(0xFFE2E8F0);

  // text-secondary: #94a3b8 (Slate-400)
  static const Color textSecondary = Color(0xFF94A3B8);

  // text-slate-500
  static const Color textMuted = Color(0xFF64748B);

  // border-slate-700
  static const Color borderColor = Color(0xFF334155);

  // Error
  static const Color error = Color(0xFFEF4444);
}
