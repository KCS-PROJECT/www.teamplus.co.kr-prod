"use client";

import { ReactNode, Suspense, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { SelectedChildProvider } from "@/contexts/SelectedChildContext";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PageLoader } from "@/components/ui/Spinner";
import { ToastProvider } from "@/components/ui/Toast";
import { ModalProvider } from "@/components/ui/Modal";
import { useBridgeErrorHandler } from "@/hooks/useBridgeErrorHandler";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { GlobalEventPopup } from "@/components/common/GlobalEventPopup";
import { GlobalPullToRefresh } from "@/components/common/GlobalPullToRefresh";
import { ShareSheetMount } from "@/components/common/ShareSheet";
import { AppInstallBanner } from "@/components/common/AppInstallBanner";
import { isNativeApp, isFlutterInAppWebView } from "@/lib/environment";
import { ui as nativeUI } from "@/services/native-bridge";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";
import { AccessibilityProvider } from "@/contexts/AccessibilityContext";
import { apiLifecycle } from "@/services/api-lifecycle";
import { registerDefaultLifecycleHooks } from "@/services/api-lifecycle-defaults";
import { installAuthBridgeSeed } from "@/services/auth-bridge-seed";
import { offlineQueue } from "@/services/offline-queue";
import { apiClient } from "@/services/api-client";
import { UnauthorizedToastListener } from "@/components/auth/UnauthorizedToastListener";
import { SessionExpiredGate } from "@/components/auth/SessionExpiredGate";
import { ActivityTracker } from "@/components/providers/ActivityTracker";
import { AppBackHandlerSetup } from "@/components/providers/AppBackHandlerSetup";
import { AppStatusController } from "@/components/providers/AppStatusController";
import { devLog } from "@/lib/logger";

// auth 라우트 패턴 — NotificationProvider 스킵하여 콜드 스타트 부하 감소
// 2026-04-29: 자녀 PIN 인증 폐지로 '/child-pin' 항목 제거 (페이지 자체 삭제됨).
const AUTH_ROUTE_PATTERNS = [
  "/login",
  "/signup",
  "/find-id",
  "/find-password",
  "/password-reset-complete",
  "/splash",
  "/onboarding",
];

// 앱 부팅 시 1회 등록 — 모듈 로드 시점에 즉시 실행되어 최초 요청 전에 준비 완료
if (typeof window !== "undefined") {
  apiLifecycle.setClientVersion(
    process.env.NEXT_PUBLIC_APP_VERSION ?? "web-dev",
  );
  registerDefaultLifecycleHooks();
  installAuthBridgeSeed(); // Bridge tokenUpdate → AUTH_CACHE partial seed
}

// Global type declaration for Flutter bridge navigation
declare global {
  interface Window {
    __NEXT_ROUTER_PUSH__?: (
      path: string,
      options?: { scroll?: boolean },
    ) => void;
    teamplusNavigate?: (path: string) => void;
  }
}

interface ClientProvidersProps {
  children: ReactNode;
}

function applyViewportMetricsToCss() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const root = document.documentElement;
  const toCssPx = (value: number) =>
    `${Math.max(0, Math.round(value * 100) / 100)}px`;

  root.style.setProperty("--viewport-width", toCssPx(width));
  root.style.setProperty("--viewport-height", toCssPx(height));

  // 브라우저 단독 실행에서도 Native Bridge 와 동일한 CSS 변수 계약을 제공한다.
  root.style.setProperty(
    "--screen-width",
    toCssPx(window.screen?.width ?? width),
  );
  root.style.setProperty(
    "--screen-height",
    toCssPx(window.screen?.height ?? height),
  );
  root.style.setProperty(
    "--device-pixel-ratio",
    String(window.devicePixelRatio || 1),
  );
  root.dataset.viewportOrientation = width > height ? "landscape" : "portrait";
}

/**
 * Bridge Error Handler 설정 컴포넌트
 * ToastProvider 내부에서 호출되어야 Toast 시스템과 연동됩니다.
 */
function BridgeErrorHandlerSetup({ children }: { children: ReactNode }) {
  useBridgeErrorHandler();
  const router = useRouter();

  // Native 앱 환경 감지 (FlutterBridge 주입 타이밍 고려)
  // 초기값은 true로 설정하여 Native 환경에서 깜빡임 방지
  const [isNative, setIsNative] = useState(true);

  useEffect(() => {
    // 클라이언트 마운트 후 환경 체크
    const checkNativeEnvironment = () => {
      const native = isNativeApp() || isFlutterInAppWebView();
      setIsNative(native);
    };

    // 즉시 체크
    checkNativeEnvironment();

    // FlutterBridge 주입을 기다리기 위해 약간의 딜레이 후 다시 체크
    const timer = setTimeout(checkNativeEnvironment, 500);

    return () => clearTimeout(timer);
  }, []);

  // [2026-05-13 Phase D-6] Offline Queue 자동 활성화.
  //   네트워크 단절 시 큐에 적재된 mutation 요청을 online 이벤트에서 flush.
  //   apiClient(axios 인스턴스)로 재전송 — X-Idempotency-Key 헤더가 보존되어
  //   backend 가 멱등성 처리 가능.
  useEffect(() => {
    const detach = offlineQueue.attachOnlineHandler((req) =>
      apiClient.request(req),
    );
    return detach;
  }, []);

  // 🎨 [2026-05-20 Phase 5 v18] Native splash → WebView 핸드오프.
  //   WebView 첫 paint 완료 시 Flutter `removeNativeSplashOnce()` 트리거하여
  //   native_splash 가 자연스럽게 사라지도록 통합.
  //
  //   SPEC: claudedocs/SPEC_LOADER_IMPECCABLE_2026-05-20.md §3.4
  //   Flutter contract: webview_bridge.dart `_handleUIRequest` 의
  //     `case 'signalFirstPaint'` → `removeNativeSplashOnce(trigger: 'web-signal')`.
  //
  //   2 RAF 패턴:
  //     · raf1 — React commit + layout 완료 보장
  //     · raf2 — paint 가 실제로 GPU 에 도착한 직후
  //     → 이 시점에 native 에 신호를 보내야 splash 가 빈 화면 위에서 사라지는
  //        flash 가 발생하지 않는다.
  //
  //   main.dart 의 5초 failsafe 가 별도로 작동하므로 signalFirstPaint 가 실패해도
  //   사용자는 5초 후 splash 가 강제 hide 된다. 따라서 본 호출은 silent fail-safe.
  //
  //   Web 단독 환경(isNativeApp 가 false)에서는 no-op.
  useEffect(() => {
    if (!isNativeApp()) return;

    let raf1Id = 0;
    let raf2Id = 0;
    let cancelled = false;

    raf1Id = window.requestAnimationFrame(() => {
      raf2Id = window.requestAnimationFrame(() => {
        if (cancelled) return;
        void nativeUI.signalFirstPaint?.().catch(() => {
          // 5초 failsafe 가 처리하므로 silent ignore — handleBridgeError 가 이미 로깅함
        });
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1Id);
      if (raf2Id) window.cancelAnimationFrame(raf2Id);
    };
  }, []);

  // 📐 Viewport Auto Layout 변수 주입
  //   iOS Safari/WebView 의 visualViewport 와 일반 브라우저 viewport 를 CSS 변수로 동기화해
  //   MobileContainer, AppBar, BottomNav 가 같은 해상도 기준으로 자동 확장·축소되게 한다.
  useEffect(() => {
    if (typeof window === "undefined") return;

    applyViewportMetricsToCss();
    const onChange = () => applyViewportMetricsToCss();
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    window.visualViewport?.addEventListener("resize", onChange);
    window.visualViewport?.addEventListener("scroll", onChange);

    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      window.visualViewport?.removeEventListener("resize", onChange);
      window.visualViewport?.removeEventListener("scroll", onChange);
    };
  }, []);

  // 🛡️ 디바이스 Safe Area CSS 변수 주입 (2026-05-08 신규)
  //   Android WebView 에서 var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) 이 0px 로 평가되어
  //   BottomNav 가 navigation/indicator 영역을 침범하는 문제 해결 + 화면 해상도
  //   기반 전역 autolayout 시스템.
  //
  //   v2 (2026-05-09) — `subscribeToDeviceMetrics` 단일 구독자로 통합:
  //     · Native: Flutter MediaQuery (정확) → didChangeMetrics push 이벤트
  //     · Web 폴백: visualViewport / orientationchange / resize
  //     · RAF 디바운싱 + 동일 핸들러 단일화로 잦은 리스너 호출 비용 제거
  //
  //   주입 CSS 변수 (전역 autolayout SoT — `docs/Architecture/SCREEN_METRICS.md`):
  //     · --safe-area-inset-{top|bottom|left|right}
  //     · --screen-{width|height} (px) + --screen-{width|height}-px (unitless)
  //     · --viewport-{width|height} (키보드/inset 제외)
  //     · --device-pixel-ratio · --device-orientation · --device-platform
  //     · --keyboard-inset-bottom
  //     · data-screen-bp ("xs"|"sm"|"md"|"lg"|"xl") · data-orientation · data-native-platform
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Bridge 주입 타이밍 보강 — 마운트 직후 + 500ms 후 한 번 더 강제 적용
    const t = setTimeout(() => {
      void nativeUI.applyDeviceInsetsToCss().catch(() => {});
    }, 500);

    const unsubscribe = nativeUI.subscribeToDeviceMetrics();

    return () => {
      clearTimeout(t);
      unsubscribe();
    };
  }, []);

  // 🚀 Flutter BottomNav 클라이언트 사이드 네비게이션 지원
  // Flutter에서 evaluateJavascript로 호출하여 SPA 네비게이션 유지
  useEffect(() => {
    // Next.js router.push를 글로벌 함수로 노출
    window.__NEXT_ROUTER_PUSH__ = (
      path: string,
      options?: { scroll?: boolean },
    ) => {
      if (process.env.NODE_ENV === "development") {
        devLog("[ClientProviders] __NEXT_ROUTER_PUSH__ called:", path);
      }
      router.push(path, options ?? { scroll: false });
    };

    // 기존 teamplusNavigate 함수가 있으면 업데이트
    // (FlutterBridge에서 AT_DOCUMENT_START에 기본 버전을 주입하므로)
    const originalteamplusNavigate = window.teamplusNavigate;
    window.teamplusNavigate = (path: string) => {
      if (process.env.NODE_ENV === "development") {
        devLog("[ClientProviders] teamplusNavigate called:", path);
      }
      router.push(path, { scroll: false });
    };

    if (process.env.NODE_ENV === "development") {
      devLog("[ClientProviders] Flutter navigation functions registered");
    }

    return () => {
      // 정리 시 기존 함수 복원
      window.__NEXT_ROUTER_PUSH__ = undefined;
      window.teamplusNavigate = originalteamplusNavigate;
    };
  }, [router]);

  // Native 앱 환경에서는 WebView의 navigator.onLine이 신뢰할 수 없으므로
  // OfflineIndicator를 비활성화합니다. 네트워크 상태는 Flutter 앱에서 관리합니다.
  const showOfflineIndicator = !isNative;

  return (
    <>
      {/* 전역 당겨서 새로고침 (2026-06-04) — 모든 페이지 스크롤 최상단에서 아래로 당기면 location.reload.
          입력 포커스/모달/자체 PTR([data-ptr-self]) 영역은 컴포넌트 내부에서 가드. */}
      <GlobalPullToRefresh />
      {showOfflineIndicator && <OfflineIndicator position="top" />}
      {/* 모바일 웹 사용자에게 앱 설치 권유. 네이티브 WebView 안에서는 자동으로 null 반환.
          7일 dismiss · /get-app 자기참조 방지는 컴포넌트 내부에서 처리. */}
      <AppInstallBanner />
      {/* WCAG 4.1.3 Status Messages — 글로벌 aria-live polite region.
          ToastProvider/NotificationProvider 외부에서 발생하는 상태 변화(예: 오프라인 복귀,
          백그라운드 동기화 완료 등)를 스크린 리더에 즉시 알림. 비파괴/비차단(polite). */}
      <div
        id="a11y-live-polite"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        id="a11y-live-assertive"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
      {/* v8.6 (2026-05-20) — 통합 로깅 시스템 클라이언트 활동 추적
          PAGE_VIEW · CLICK(data-track-id) · global error · beforeunload sendBeacon flush */}
      <Suspense fallback={null}>
        <ActivityTracker />
      </Suspense>
      {/* AppStatus(네이티브 상단 상태바) 공통 컨트롤러 (2026-06-07) —
          경로별 정책(@/lib/app-status)에 따라 인증 화면 그룹은 숨김, 그 외 전 화면은
          표시를 보장. useNativeUI 미호출 페이지에서 로딩이 끈 상태바가 복원되지 않던
          회귀를 단일 진입점에서 해소. 네이티브 전용(컴포넌트 내부 isNativeApp 가드). */}
      <AppStatusController />
      {children}
    </>
  );
}

/**
 * ClientProviders - Provider 계층 구조
 *
 * LoadingProvider가 최상위에 있어야 useNavigation이 모든 곳에서 작동
 *
 * LoadingProvider (스피너/로딩 상태)
 *   └─ ModalProvider (모달/다이얼로그)
 *        └─ ToastProvider (토스트 알림)
 *             └─ BridgeErrorHandlerSetup (네이티브 브릿지 에러 + 오프라인 표시)
 *                  └─ OfflineIndicator (오프라인 상태 배너)
 *                  └─ Suspense (SSR fallback)
 *                       └─ AuthProvider (인증 상태)
 *                            └─ NotificationProvider (알림 상태)
 *                                 └─ children
 */
export function ClientProviders({ children }: ClientProvidersProps) {
  const pathname = usePathname();
  const isAuthRoute = pathname
    ? AUTH_ROUTE_PATTERNS.some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
      )
    : false;

  // [수정 2026-04-29] LoadingProvider defaultVariant fullscreen → navigation.
  // 풀스크린 스피너는 화면 전체를 덮어 인터랙션을 차단하고 무겁게 느껴짐.
  // navigation 은 상단 프로그레스 바만 표시하여 체감 전환 속도를 크게 개선
  // (페이지 콘텐츠가 곧바로 보임). 명시적 fullscreen 이 필요한 곳에서만 startLoading('fullscreen') 호출.
  return (
    <LoadingProvider defaultVariant="navigation">
      <ThemeProvider>
        <AccessibilityProvider>
          <AppSettingsProvider>
            <ModalProvider>
              <ToastProvider>
                <UnauthorizedToastListener />
                <SessionExpiredGate />
                <ShareSheetMount />
                <BridgeErrorHandlerSetup>
                  <Suspense fallback={<PageLoader message="로딩중..." />}>
                    <AuthProvider>
                      <AppBackHandlerSetup>
                        {isAuthRoute ? (
                          children
                        ) : (
                          <NotificationProvider>
                            <SelectedChildProvider>
                              {children}
                              <GlobalEventPopup />
                            </SelectedChildProvider>
                          </NotificationProvider>
                        )}
                      </AppBackHandlerSetup>
                    </AuthProvider>
                  </Suspense>
                </BridgeErrorHandlerSetup>
              </ToastProvider>
            </ModalProvider>
          </AppSettingsProvider>
        </AccessibilityProvider>
      </ThemeProvider>
    </LoadingProvider>
  );
}

export default ClientProviders;
