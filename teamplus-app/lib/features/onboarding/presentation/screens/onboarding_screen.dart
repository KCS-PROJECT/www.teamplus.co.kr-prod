import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/providers/shared_providers.dart';
import '../providers/signup_flow_provider.dart';

/// 온보딩 페이지 데이터
class OnboardingPage {
  final String imagePath;
  final String title;
  final String description;

  const OnboardingPage({
    required this.imagePath,
    required this.title,
    required this.description,
  });
}

/// 온보딩 화면
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  // 권한 안내 페이지는 가입 플로우 A5 와 중복되어 제거 (2026-05-12).
  // 마지막 페이지 [동의하고 시작하기] 탭 시 신규 사용자는 A6 약관 동의로 직진.
  static const int _permissionPageCount = 0;

  final List<OnboardingPage> _pages = const [
    OnboardingPage(
      imagePath: 'assets/images/onboarding01.png',
      title: '함께하는 아이스하키',
      description: '팀과 동료들이 함께하는 빙판 위의 시작\n팀플러스가 든든하게 함께합니다',
    ),
    OnboardingPage(
      imagePath: 'assets/images/onboarding02.png',
      title: '매일이 새로운 도전',
      description: '스케이트 한 발 한 발이 만드는 성장\n즐거운 순간을 놓치지 마세요',
    ),
    OnboardingPage(
      imagePath: 'assets/images/onboarding03.png',
      title: '꿈을 향한 여정',
      description: '수업·출석·성취까지 한 곳에서\n부모님과 코치님이 함께하는 관리',
    ),
  ];

  int get _totalPages => _pages.length + _permissionPageCount;

  bool get _isLastPage => _currentPage == _totalPages - 1;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _completeOnboarding() async {
    // 1) SharedPreferences 에 온보딩 완료 표시
    final prefs = ref.read(appPreferencesProvider);
    await prefs.setOnboardingCompleted(true);

    if (!mounted) return;

    // 2) 가입 완료 플래그 확인 — 기존 가입자라면 WebView /login 으로 직행,
    //    신규 사용자라면 A5(권한 안내) 부터 시작하는 가입 플로우로 진입.
    final signupController = ref.read(signupFlowProvider.notifier);
    final isSignupCompleted = await signupController.isSignupCompleted();

    if (!mounted) return;

    if (!isSignupCompleted) {
      // 신규 사용자 → A5 권한 안내 화면 진입.
      //   A5에서 실제 OS 권한(카메라·알림·사진 저장)을
      //   순차 요청 후 A6 약관 동의로 진행. Face ID 는 첫 사용 시 OS 가 자동 요청.
      context.go('/signup/permissions');
      return;
    }

    // 기존 사용자 → WebView /login/ 직행
    // (NSURLErrorCancelled -999 회피 위해 명시적으로 URL 지정 — 2026-05-11)
    // [2026-05-19] trailing slash 추가 — next.config trailingSlash:true 로 308
    //   redirect 회피. targetPath 메타데이터도 동일하게 통일.
    final loginUrl = '${ApiConstants.webAppUrl}/login/';
    context.goNamed(
      'webview',
      extra: {
        'title': 'TEAMPLUS',
        'url': loginUrl,
        'targetPath': '/login/',
      },
    );
  }

  void _nextPage() {
    if (_currentPage < _totalPages - 1) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    } else {
      _completeOnboarding();
    }
  }

  void _skipOnboarding() {
    _completeOnboarding();
  }

  @override
  Widget build(BuildContext context) {
    // 다크 배경 → status bar 아이콘은 라이트(light) 로 강제.
    // 글로벌 SystemChrome SoT(다크 아이콘, 라이트 배경 기준) 을 화면 단위로 오버라이드.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light, // Android
        statusBarBrightness: Brightness.dark, // iOS (dark bg)
        systemNavigationBarColor: Colors.black,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            // 페이지 뷰 (1~3 인트로만, 권한 안내는 가입 플로우 A5 로 위임)
            PageView.builder(
              controller: _pageController,
              onPageChanged: (index) {
                setState(() {
                  _currentPage = index;
                });
              },
              itemCount: _totalPages,
              itemBuilder: (context, index) => _buildPage(_pages[index]),
            ),

            // 상단 Skip 버튼
            Positioned(
              top: MediaQuery.of(context).padding.top + 16,
              right: 20,
              child: TextButton(
                onPressed: _skipOnboarding,
                child: Text(
                  '건너뛰기',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.8),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),

            // 하단 인디케이터 및 버튼
            Positioned(
              left: 0,
              right: 0,
              bottom: MediaQuery.of(context).padding.bottom + 40,
              child: Column(
                children: [
                  // 페이지 인디케이터
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      _totalPages,
                      (index) => _buildIndicator(index == _currentPage),
                    ),
                  ),
                  const SizedBox(height: 32),

                  // 다음/시작 버튼
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: _nextPage,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          elevation: 0,
                        ),
                        child: Text(
                          _isLastPage ? '시작하기' : '다음',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPage(OnboardingPage page) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // 배경 이미지
        Image.asset(
          page.imagePath,
          fit: BoxFit.cover,
        ),

        // 그라데이션 오버레이
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.3),
                Colors.black.withValues(alpha: 0.1),
                Colors.black.withValues(alpha: 0.7),
                Colors.black.withValues(alpha: 0.9),
              ],
              stops: const [0.0, 0.3, 0.7, 1.0],
            ),
          ),
        ),

        // 텍스트 콘텐츠
        Positioned(
          left: 24,
          right: 24,
          bottom: MediaQuery.of(context).padding.bottom + 180,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                page.title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                page.description,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.85),
                  fontSize: 16,
                  fontWeight: FontWeight.w400,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildIndicator(bool isActive) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      margin: const EdgeInsets.symmetric(horizontal: 4),
      width: isActive ? 24 : 8,
      height: 8,
      decoration: BoxDecoration(
        color:
            isActive ? AppColors.primary : Colors.white.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(4),
      ),
    );
  }
}
