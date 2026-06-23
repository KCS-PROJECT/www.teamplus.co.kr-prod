import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
// [2026-05-19] 네이티브 LoginScreen import 제거 — WebView /login/ 단일 SoT 통합.
//   GoRouter '/login' 라우트가 사라졌으므로 LoginScreen 참조 0건. 파일 자체는
//   features/auth/presentation/screens/login_screen.dart 에 잔존 (참고용).
import '../../features/auth/presentation/screens/register_screen.dart';
import '../../features/auth/presentation/screens/biometric_prompt_screen.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../core/providers/shared_providers.dart' show appPreferencesProvider;
import '../../core/security/app_lock_manager.dart';
import '../../main.dart' show navigatorKey;
import '../../features/dashboard/presentation/screens/parent_dashboard_screen.dart';
import '../../features/dashboard/presentation/screens/coach_dashboard_screen.dart';
import '../../features/qr/presentation/screens/qr_scanner_screen.dart';
import '../../features/notifications/presentation/screens/notifications_screen.dart';
import '../../features/classes/presentation/screens/class_list_screen.dart';
import '../../features/clubs/presentation/screens/club_join_screen.dart';
import '../../features/attendance/presentation/screens/qr_checkin_screen.dart';
import '../../features/qr/presentation/screens/my_profile_qr_screen.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';
import '../../features/profile/presentation/screens/profile_edit_screen.dart';
import '../../features/profile/presentation/screens/profile_password_screen.dart';
import '../../features/profile/presentation/screens/profile_notification_settings_screen.dart';
import '../../features/profile/presentation/screens/profile_security_screen.dart';
import '../../features/attendance/presentation/screens/attendance_history_screen.dart';
import '../../features/payments/presentation/screens/payment_history_screen.dart';
import 'initial_destination.dart';
import '../../features/onboarding/presentation/screens/onboarding_screen.dart';
import '../../features/onboarding/presentation/screens/signup_permissions_screen.dart';
import '../../features/onboarding/presentation/screens/signup_agreements_screen.dart';
import '../../features/onboarding/presentation/screens/signup_child_register_screen.dart';
import '../../features/onboarding/presentation/screens/signup_welcome_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/children/presentation/screens/children_management_screen.dart';
import '../../features/lessons/presentation/screens/lesson_card_screen.dart';
import '../../features/coach/presentation/screens/coach_admin_screen.dart';
import '../../features/calendar/presentation/screens/calendar_screen.dart';
import '../../features/shop/presentation/screens/shop_admin_screen.dart';
import '../../features/tournaments/presentation/screens/tournament_screen.dart';
import '../../features/rinks/presentation/screens/rink_info_screen.dart';
import '../../features/matches/presentation/screens/match_recruitment_screen.dart';
import '../../features/community/presentation/screens/club_feed_screen.dart';
import '../../features/community/presentation/screens/club_events_screen.dart';
import '../../features/identity/presentation/screens/identity_verification_screen.dart';
import '../../features/identity/presentation/screens/identity_verify_screen.dart';
import '../../features/videos/presentation/screens/video_upload_screen.dart';
import '../../core/webview/webview_screen.dart';
import '../../shared/widgets/teamplus_bottom_nav.dart';

/// 🔐 사용자 활동 추적을 위한 RouteObserver
/// - 모든 라우트 변경 시 AppLockManager에 활동 기록
class ActivityRecordingRouteObserver
    extends RouteObserver<ModalRoute<dynamic>> {
  @override
  void didPush(Route route, Route? previousRoute) {
    super.didPush(route, previousRoute);
    _recordActivity();
  }

  @override
  void didPop(Route route, Route? previousRoute) {
    super.didPop(route, previousRoute);
    _recordActivity();
  }

  @override
  void didReplace({Route? newRoute, Route? oldRoute}) {
    super.didReplace(newRoute: newRoute, oldRoute: oldRoute);
    _recordActivity();
  }

  void _recordActivity() {
    appLockManager.recordActivity();
    debugPrint('[ActivityRecordingRouteObserver] 활동 기록: ${DateTime.now()}');
  }
}

final goRouterProvider = Provider<GoRouter>((ref) {
  // [2026-05-26] GoRouter 재생성 방지 — 부팅 빨간 화면 크래시 근본 차단.
  //   기존: redirect 콜백 내부에서 ref.watch(authStateProvider) 호출 →
  //   goRouterProvider 가 authStateProvider 에 의존 → 콜드스타트 시 auth 상태가
  //   loading→data 로 전이될 때마다 goRouterProvider 자체가 재빌드되어 **새 GoRouter +
  //   새 Navigator(전역 단일 navigatorKey 공유)** 가 생성된다. 이때 직전
  //   InitialDestinationGate 의 InAppWebView 가 플랫폼뷰 init 도중 강제 unmount 되며
  //   `AndroidPullToRefreshController was used after being disposed` → 동일 navigatorKey
  //   충돌 `Duplicate GlobalKey` → `element._lifecycleState == inactive` assertion(빨간
  //   화면)으로 cascade 한다. (auth 해소 타이밍 ↔ WebView init 프레임 race 로 간헐 발생.)
  //   해결: GoRouter 는 1회만 생성하고, auth 변경은 refreshListenable 로 redirect
  //   재평가만 트리거. redirect 내부는 ref.read 로 현재 값만 읽는다.
  final authRefresh = ValueNotifier<int>(0);
  ref.listen(authStateProvider, (_, __) => authRefresh.value++);
  ref.onDispose(authRefresh.dispose);

  return GoRouter(
    navigatorKey: navigatorKey,
    initialLocation: '/webview',
    observers: [ActivityRecordingRouteObserver()],
    refreshListenable: authRefresh,
    redirect: (context, state) async {
      final authState = ref.read(authStateProvider);
      final currentLocation = state.matchedLocation;

      // 🔐 생체인증 잠금 화면 제외 (무한 루프 방지)
      if (currentLocation == '/biometric-lock') {
        return null;
      }

      // [수정 2026-05-19 v5] SplashScreen 제거에 따라 '/' 가드 삭제.
      //   '/' 진입 시도가 들어오면 Native LaunchScreen 흐름과 동일하게
      //   '/webview' 로 즉시 보내고 InitialDestinationGate 가 인증 분기를 수행.
      if (currentLocation == '/') {
        return '/webview';
      }

      // Public routes: 인증 없이 접근 가능한 화면들
      // /webview는 하이브리드 앱의 메인 화면이므로 public route로 설정
      // Web 앱 자체에서 인증 상태를 관리함
      //
      // 2026-04-22: '/qr-scanner' 추가 — 카메라 스캐너 UI 자체는 인증 불필요.
      //   WebView Bridge(qrScan.scan)에서 context.push('/qr-scanner') 호출 시
      //   authStateProvider race condition 으로 /login 강제 이동되는 이슈 해소.
      //   실제 출석 체크 인증은 Web /attendance/check-in API 호출 시점에 수행됨.
      //
      // [2026-05-19] '/login' 제거 — 네이티브 로그인 화면 폐기, WebView /login/ 단일 SoT.
      //   미인증 진입은 모두 /webview 로 보내 InitialDestinationGate 가 token 검증
      //   후 WebView 의 /login/ URL 로 자동 로드한다.
      const publicRoutes = {
        '/onboarding',
        '/register',
        '/home',
        '/webview',
        '/qr-scanner',
      };
      // 가입 플로우 A5~A13 (참고자료 디자인 일치)
      final isSignupFlowRoute = currentLocation.startsWith('/signup/');
      final isPublicRoute =
          publicRoutes.contains(currentLocation) || isSignupFlowRoute;

      // Protected routes: 인증 필요한 화면들
      final isProtectedRoute = !isPublicRoute;

      // [수정 2026-05-22 사용자 직접 지시]
      //   "앱을 설치 또는 재설치 했을 때 기존 Flutter 온보딩·가입 플로우가 보이도록".
      //   기존엔 미인증 사용자가 /webview 진입 → InitialDestinationGate 가 web /login/ URL
      //   로 직접 로드하여 Flutter /onboarding (3슬라이드) + /signup/* (A5~A13) 9개 화면이
      //   전혀 노출되지 않았다.
      //
      //   해결: redirect 에서 AppPreferencesService.isOnboardingCompleted() 를 await 로 확인.
      //     · 미인증 + 온보딩 미완료(신규/재설치) → /onboarding 으로 강제 이동
      //     · 미인증 + 온보딩 완료 → /webview (web /login/) 그대로
      //     · 인증됨 → 기존 흐름
      //   SharedPreferences 는 앱 삭제 시 함께 초기화되므로 "재설치 자동 감지" 보장.
      bool onboardingCompleted = true; // 기본 true (안전: 미인증 + 캐시 오류 시 기존 흐름)
      try {
        onboardingCompleted =
            await ref.read(appPreferencesProvider).isOnboardingCompleted();
      } catch (_) {
        // SharedPreferences 실패 → 보수적으로 true (기존 /webview 흐름 유지)
        onboardingCompleted = true;
      }

      return authState.when(
        data: (isAuthenticated) {
          if (isAuthenticated) {
            // 🔐 생체인증 잠금 확인 (보호된 화면 접근 시)
            if (isProtectedRoute) {
              // 비동기 작업을 동기적으로 처리하기 위해 Future 사용
              // ref.watch 사용 시 비동기 처리는 FutureProvider를 통해 수행
              // 여기서는 shouldShowBiometricLock 체크 로직을 나중에 추가
              // (실제로는 ConsumerWidget에서 처리하는 것이 더 나음)
            }

            // 인증된 사용자가 가입 화면 접근 시 → 대시보드로 리다이렉트
            // (온보딩, 홈, 로그인(WebView)은 허용 - 사용자가 명시적으로 이동한 경우)
            // [2026-05-19] '/login' 분기 제거 — 네이티브 로그인 화면 폐기됨.
            if (currentLocation == '/register') {
              final userType = ref.read(currentUserTypeProvider);
              return userType.when(
                data: (type) =>
                    type == 'coach' ? '/coach-dashboard' : '/dashboard',
                loading: () => '/dashboard',
                error: (_, __) => '/dashboard',
              );
            }
            return null; // 다른 모든 경로 허용
          }

          // 미인증 사용자 — 신규/재설치 감지: 온보딩 미완료 시 Flutter 네이티브
          //   /onboarding 으로 이동. 이미 /onboarding 또는 /signup/* 안에 있으면
          //   루프 방지를 위해 null 반환.
          if (!onboardingCompleted) {
            if (currentLocation == '/onboarding' || isSignupFlowRoute) {
              return null;
            }
            return '/onboarding';
          }

          // 미인증 사용자 + 온보딩 완료 → 보호된 경로 접근 시 WebView /login/ 로 위임.
          //   InitialDestinationGate 가 token 부재를 감지해 자동으로
          //   Next.js /login/ URL 을 WebView 에 로드한다.
          if (isProtectedRoute) {
            return '/webview';
          }

          return null; // Public route 허용
        },
        loading: () => null,
        // [2026-05-19] error 시에도 네이티브 /login 으로 가지 않고 /webview 로.
        //   콜드 스타트 직후 authStateProvider 첫 fetch 가 일시 error 상태일 때
        //   네이티브 LoginScreen 으로 강제 이동되어 회귀하던 문제 차단.
        //   단, 온보딩 미완료(신규/재설치)이면 /onboarding 우선.
        error: (error, stackTrace) =>
            onboardingCompleted ? '/webview' : '/onboarding',
      );
    },
    routes: [
      // Onboarding Route
      GoRoute(
        path: '/onboarding',
        name: 'onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),

      // Signup Flow (A5~A13) — 참고자료 `팀플러스 추가화면.html` 100% 일치
      GoRoute(
        path: '/signup/permissions',
        name: 'signup-permissions',
        builder: (context, state) => const SignupPermissionsScreen(),
      ),
      GoRoute(
        path: '/signup/agreements',
        name: 'signup-agreements',
        builder: (context, state) => const SignupAgreementsScreen(),
      ),
      GoRoute(
        path: '/signup/child-register',
        name: 'signup-child-register',
        builder: (context, state) => const SignupChildRegisterScreen(),
      ),
      GoRoute(
        path: '/signup/welcome',
        name: 'signup-welcome',
        builder: (context, state) => const SignupWelcomeScreen(),
      ),

      // Auth Routes
      // [2026-05-19] 네이티브 '/login' GoRoute 제거 — WebView /login/ 단일 SoT 통합.
      //   모든 미인증 경로는 redirect 가드가 /webview 로 보내고, InitialDestinationGate
      //   가 token 부재 감지 시 자동으로 Next.js /login/ URL 을 WebView 에 로드한다.
      GoRoute(
        path: '/register',
        name: 'register',
        builder: (context, state) => const RegisterScreen(),
      ),

      // 🔐 Biometric Lock Screen
      GoRoute(
        path: '/biometric-lock',
        name: 'biometric-lock',
        builder: (context, state) {
          final extras = state.extra as Map<String, dynamic>?;
          return BiometricPromptScreen(
            title: extras?['title'] ?? '생체인증',
            message: extras?['message'],
            onSuccess: extras?['onSuccess'] as VoidCallback?,
            onCancel: extras?['onCancel'] as VoidCallback?,
            showCancel: extras?['showCancel'] ?? true,
          );
        },
      ),

      // Dashboard Routes
      GoRoute(
        path: '/dashboard',
        name: 'dashboard',
        builder: (context, state) => const ParentDashboardScreen(),
      ),
      GoRoute(
        path: '/coach-dashboard',
        name: 'coach-dashboard',
        builder: (context, state) => const CoachDashboardScreen(),
      ),

      // QR Routes
      GoRoute(
        path: '/qr-scanner',
        name: 'qr-scanner',
        builder: (context, state) => const QrScannerScreen(),
      ),
      GoRoute(
        path: '/qr-checkin',
        name: 'qr-checkin',
        builder: (context, state) => const QRCheckInScreen(),
      ),
      GoRoute(
        path: '/my-qr',
        name: 'my-qr',
        builder: (context, state) => const MyProfileQrScreen(),
      ),

      // Class Routes
      GoRoute(
        path: '/classes',
        name: 'classes',
        builder: (context, state) => const ClassListScreen(),
      ),
      // Note: /classes/:classId and /payment routes require complex data
      // They should be navigated via Navigator.push() with data

      // Club Routes
      GoRoute(
        path: '/club-join',
        name: 'club-join',
        builder: (context, state) => const ClubJoinScreen(),
      ),

      // Community Routes
      GoRoute(
        path: '/club-feed',
        name: 'club-feed',
        builder: (context, state) => const ClubFeedScreen(),
      ),
      GoRoute(
        path: '/club-events',
        name: 'club-events',
        builder: (context, state) => const ClubEventsScreen(),
      ),

      // Notification Routes
      GoRoute(
        path: '/notifications',
        name: 'notifications',
        builder: (context, state) => const NotificationsScreen(),
      ),

      // Profile Routes
      GoRoute(
        path: '/profile',
        name: 'profile',
        builder: (context, state) => const ProfileScreen(),
      ),
      GoRoute(
        path: '/profile/edit',
        name: 'profile-edit',
        builder: (context, state) => const ProfileEditScreen(),
      ),
      GoRoute(
        path: '/profile/password',
        name: 'profile-password',
        builder: (context, state) => const ProfilePasswordScreen(),
      ),
      GoRoute(
        path: '/profile/notifications',
        name: 'profile-notifications',
        builder: (context, state) => const ProfileNotificationSettingsScreen(),
      ),
      GoRoute(
        path: '/profile/security',
        name: 'profile-security',
        builder: (context, state) => const ProfileSecurityScreen(),
      ),

      // History Routes
      GoRoute(
        path: '/attendance-history',
        name: 'attendance-history',
        builder: (context, state) => const AttendanceHistoryScreen(),
      ),
      GoRoute(
        path: '/payment-history',
        name: 'payment-history',
        builder: (context, state) => const PaymentHistoryScreen(),
      ),

      // New Design Screens
      GoRoute(
        path: '/home',
        name: 'home',
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: '/children',
        name: 'children',
        builder: (context, state) => const ChildrenManagementScreen(),
      ),
      GoRoute(
        path: '/lesson-card',
        name: 'lesson-card',
        builder: (context, state) => const LessonCardScreen(),
      ),
      GoRoute(
        path: '/coach-admin',
        name: 'coach-admin',
        builder: (context, state) => const CoachAdminScreen(),
      ),
      GoRoute(
        path: '/calendar',
        name: 'calendar',
        builder: (context, state) => const CalendarScreen(),
      ),
      GoRoute(
        path: '/shop-admin',
        name: 'shop-admin',
        builder: (context, state) => const ShopAdminScreen(),
      ),
      GoRoute(
        path: '/tournaments',
        name: 'tournaments',
        builder: (context, state) => const TournamentScreen(),
      ),
      GoRoute(
        path: '/rinks',
        name: 'rinks',
        builder: (context, state) => const RinkInfoScreen(),
      ),
      GoRoute(
        path: '/match-recruitment',
        name: 'match-recruitment',
        builder: (context, state) => const MatchRecruitmentScreen(),
      ),

      // Video Upload Route
      GoRoute(
        path: '/videos/upload',
        name: 'videos-upload',
        builder: (context, state) {
          final extras = state.extra as Map<String, dynamic>?;
          return VideoUploadScreen(
            childId: extras?['childId'] as String? ?? '',
            childName: extras?['childName'] as String? ?? '자녀',
          );
        },
      ),

      // Identity Gateway Selection Route (본인인증 제공자 선택)
      GoRoute(
        path: '/identity-gateway',
        name: 'identity-gateway',
        builder: (context, state) {
          final extras = state.extra as Map<String, dynamic>?;
          return IdentityVerifyScreen(
            returnPath: extras?['returnPath'] as String?,
          );
        },
      ),

      // Identity Verification Route (본인인증 WebView)
      GoRoute(
        path: '/identity-verify',
        name: 'identity-verify',
        builder: (context, state) {
          final extras = state.extra as Map<String, dynamic>?;
          return IdentityVerificationScreen(
            authUrl: extras?['authUrl'] ?? '',
            requestId: extras?['requestId'] ?? '',
            provider: extras?['provider'] ?? IdentityProvider.kgInicis,
            purpose: extras?['purpose'] ?? IdentityPurpose.registration,
          );
        },
      ),

      // WebView Route (Main App Content - 하이브리드 앱 메인 화면)
      //
      // [수정 2026-05-19 v5] SplashScreen 제거 — extras 가 비어 있는 cold start
      //   진입 시 `InitialDestinationGate` 가 인증 상태를 보고 URL/userType 을
      //   결정한 뒤 WebViewScreen 으로 위임한다. extras 가 제공되는 일반 호출
      //   (예: 결제 콜백, 딥링크) 은 기존 경로 그대로 동작.
      GoRoute(
        path: '/webview',
        name: 'webview',
        builder: (context, state) {
          final extras = state.extra as Map<String, dynamic>?;

          // extras 가 없거나 url 이 비어 있으면 인증 분기 게이트 사용.
          //   - 부팅(무 extras) 진입은 gateKey == null → const 게이트와 동일(회귀 0).
          //   - 포그라운드 복귀 점검 재게이트는 extras['gateKey'] 에 매번 새 UniqueKey 를
          //     실어 보낸다(app.dart `_onAppResumed`). 같은 location 의 MaterialPage 가
          //     page key 로 재사용되더라도, 게이트 위젯 key 가 달라져 새 State 가 강제
          //     생성되고 didChangeDependencies 의 MaintenanceService.check() 가 재실행된다.
          if (extras == null || extras['url'] == null) {
            return InitialDestinationGate(key: extras?['gateKey'] as Key?);
          }

          // userType 추출 (extras에서 전달받거나 null이면 WebViewScreen에서 자동 로드)
          UserType? userType;
          if (extras['userType'] != null) {
            if (extras['userType'] is UserType) {
              userType = extras['userType'] as UserType;
            } else if (extras['userType'] is String) {
              userType =
                  TeamplusBottomNav.fromString(extras['userType'] as String);
            }
          }

          return WebViewScreen(
            initialUrl: extras['url'],
            title: extras['title'] ?? 'TEAMPLUS',
            showAppBar: extras['showAppBar'] ?? false, // 기본값: AppBar 숨김
            showBottomNav: extras['showBottomNav'] ?? false, // 웹에서 BottomNav 제공
            userType: userType,
          );
        },
      ),
    ],
    errorBuilder: (context, state) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.error_outline,
                  size: 64,
                  color: Colors.grey,
                ),
                const SizedBox(height: 16),
                const Text(
                  '페이지를 찾을 수 없습니다.',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  state.matchedLocation,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Colors.grey,
                  ),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => context.go('/webview'),
                  child: const Text('홈으로 돌아가기'),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
});
