/**
 * native-bridge 플랫폼/화면 판별 유틸 (C-1 분리 · 2026-06-07)
 *
 * `native-bridge.ts`(3,236줄 God object)에서 순수 함수 군을 분리.
 * 의존성: `@/lib/environment`(isFlutterBridgeAvailable)만 — 단방향, 순환 없음.
 * 기존 import 경로 호환을 위해 native-bridge.ts 가 전량 re-export 한다.
 */
import { isFlutterBridgeAvailable } from "@/lib/environment";

export type Platform = "ios" | "android" | "web";

/**
 * 현재 실행 중인 플랫폼을 반환.
 * - 'ios': iPhone / iPad WebView (Flutter) 또는 Mobile Safari
 * - 'android': Android WebView (Flutter) 또는 Chrome Android
 * - 'web': 데스크톱 브라우저 / SSR
 *
 * 우선순위:
 *   1) Flutter WebView 의 User-Agent 토큰 (`teamplusApp-iOS` / `teamplusApp-Android`) — 가장 명확
 *   2) navigator.platform / userAgent 에서 'iPhone'/'iPad'/'Mac'(iOS-like) · 'Android'
 *   3) 모두 미매칭 → 'web'
 */
export function getPlatform(): Platform {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return "web";

  const ua = navigator.userAgent || "";

  // 1) Flutter app custom UA 토큰
  if (/teamplusApp[-_/]?iOS|iPhone.*teamplusApp|iPad.*teamplusApp/i.test(ua))
    return "ios";
  if (/teamplusApp[-_/]?Android|Android.*teamplusApp/i.test(ua))
    return "android";

  // 2) 표준 UA 토큰
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";

  // iPadOS 13+ 는 navigator.platform === 'MacIntel' + maxTouchPoints>1 로 위장. Bridge 가용 시 ios 로 간주
  if (
    /Macintosh|MacIntel/.test(ua) &&
    typeof (navigator as Navigator & { maxTouchPoints?: number })
      .maxTouchPoints === "number" &&
    (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! >
      1 &&
    isFlutterBridgeAvailable()
  ) {
    return "ios";
  }

  return "web";
}

/** 현재 실행 환경이 iOS 인지 확인 (iPhone / iPad / iOS WebView) */
export function isIOS(): boolean {
  return getPlatform() === "ios";
}

/** 현재 실행 환경이 Android 인지 확인 */
export function isAndroid(): boolean {
  return getPlatform() === "android";
}

/** 현재 실행 환경이 모바일(iOS 또는 Android) 인지 확인 */
export function isMobile(): boolean {
  const p = getPlatform();
  return p === "ios" || p === "android";
}

// ──────────────────────────────────────────────────────────
// 메인 화면 판별 (홈 대시보드 여부)
// ──────────────────────────────────────────────────────────

/**
 * 메인(홈) 화면 경로 SoT — 5개 역할 메인 대시보드.
 * `nav-home-paths.ts` 의 ROLE_HOME_PATHS 와 동일 정렬 (중복 정의 의도 — native-bridge 자체 완결성).
 * 새 역할 추가 시 본 상수 + `lib/nav-home-paths.ts` 두 곳 모두 갱신 필수.
 */
const MAIN_SCREEN_PATHS: ReadonlySet<string> = new Set([
  "/admin",
  "/director",
  "/coach",
  "/parent",
  "/student",
  "/child",
  "/teen",
]);

/**
 * 현재 화면이 메인(홈) 대시보드인지 true/false 로 반환.
 *
 * 메인 화면 정의: 로그인 후 BottomNav 의 홈 탭이 가리키는 5개 대시보드
 *   `/admin`, `/director`, `/coach`, `/parent`, `/student` (`/child`, `/teen` 호환)
 *
 * 사용 예시:
 *   - 하드웨어 백 버튼 핸들러에서 "메인이면 종료 confirm, 아니면 router.back" 분기
 *   - 네이티브 측에 메인 진입 알림 전송 (analytics)
 *   - BottomNav 활성 탭 강조
 *
 * @param pathname 검사할 경로. 미지정 시 `window.location.pathname` 자동 사용.
 *                 SSR 환경(`window` undefined) 에서는 `false` 반환.
 * @returns 메인 화면이면 `true`, 그 외 (서브 페이지·인증·SSR) 는 `false`.
 *
 * @example
 * import { isMainScreen } from '@/services/native-bridge';
 *
 * if (isMainScreen()) {
 *   // 종료 confirm 표시
 * } else {
 *   router.back();
 * }
 *
 * // 명시적 path 검사
 * isMainScreen('/parent');           // true
 * isMainScreen('/parent/credits');   // false
 * isMainScreen('/login');            // false
 */
export function isMainScreen(pathname?: string): boolean {
  // SSR / Node.js 환경 대응
  let path = pathname;
  if (path === undefined) {
    if (typeof window === "undefined") return false;
    path = window.location.pathname;
  }
  if (!path) return false;

  // trailing slash 제거 + 빈 문자열 → '/' 정규화
  const normalized = path.replace(/\/$/, "") || "/";
  return MAIN_SCREEN_PATHS.has(normalized);
}

// ──────────────────────────────────────────────────────────
// 서브메인 화면 판별 (BottomNav 탭 허브 — 홈 제외)
// ──────────────────────────────────────────────────────────

/**
 * 서브메인(BottomNav 탭 허브) 화면 경로 SoT.
 *
 * 정의: BottomNav 의 탭이 직접 가리키는 페이지 중 "홈" 탭(= 메인 화면)을 제외한 모든 허브.
 * `components/layout/BottomNav.tsx` 의 각 역할별 탭 정의(href + matchPaths)와 동기화 유지.
 * 새 BottomNav 탭 추가 시 본 상수도 갱신 필수.
 *
 * 학부모: /classes, /parent-calendar, /children, /mypage
 * 코치/감독: /classes-manage, /classes-organize, /director-schedules, /team, /coaches, /mypage
 * 학생(child/teen): /classes, /schedule, /calendar, /badges, /mypage
 * 관리자: /members, /member, /approval, /director-approvals, /settlements, /payments-manage,
 *         /notifications, /notices-manage, /notices
 * 쇼핑: /products, /search, /home, /wishlist, /shop-profile, /orders
 * 오픈클래스: /academy, /coach-members, /promotions
 */
const SUBMAIN_SCREEN_PATHS: ReadonlySet<string> = new Set([
  // 공통 마이페이지
  "/mypage",
  // 학부모
  "/classes",
  "/parent-calendar",
  "/children",
  // 코치/감독
  "/classes-manage",
  "/classes-organize",
  "/director-schedules",
  "/team",
  "/coaches",
  // 학생
  "/schedule",
  "/calendar",
  "/badges",
  // 관리자
  "/members",
  "/member",
  "/approval",
  "/director-approvals",
  "/settlements",
  "/payments-manage",
  "/notifications",
  "/notices-manage",
  "/notices",
  // 쇼핑
  "/products",
  "/search",
  "/home",
  "/wishlist",
  "/shop-profile",
  "/orders",
  // 오픈클래스
  "/academy",
  "/coach-members",
  "/promotions",
]);

/**
 * 현재 화면이 서브메인(BottomNav 탭 허브 — 홈 제외)인지 true/false 로 반환.
 *
 * @param pathname 검사할 경로. 미지정 시 `window.location.pathname` 자동 사용.
 *                 SSR 환경(`window` undefined) 에서는 `false` 반환.
 *
 * @example
 * isSubmainScreen('/classes-manage');    // true
 * isSubmainScreen('/classes/abc123');    // false (서브 페이지)
 * isSubmainScreen('/parent');            // false (메인 — isMainScreen 사용)
 */
export function isSubmainScreen(pathname?: string): boolean {
  let path = pathname;
  if (path === undefined) {
    if (typeof window === "undefined") return false;
    path = window.location.pathname;
  }
  if (!path) return false;

  const normalized = path.replace(/\/$/, "") || "/";
  return SUBMAIN_SCREEN_PATHS.has(normalized);
}

/**
 * 현재 화면이 메인 또는 서브메인인지 통합 판별.
 *
 * 두 조건 중 하나라도 매칭되면 true.
 * BottomNav 탭 허브(메인+서브메인) 판별 / 풀스크린 로더 정책 / 뒤로가기 분기 등에 활용.
 *
 * @example
 * isMainOrSubmainScreen('/parent');         // true (메인)
 * isMainOrSubmainScreen('/classes-manage'); // true (서브메인)
 * isMainOrSubmainScreen('/classes/abc123'); // false (서브 페이지)
 */
export function isMainOrSubmainScreen(pathname?: string): boolean {
  return isMainScreen(pathname) || isSubmainScreen(pathname);
}

/**
 * AppBar variant 자동 판별 — pathname 으로 PageAppBar 의 적절한 variant 를 반환.
 *
 * - 메인 (홈 5종)              → `'main'`
 * - 서브메인 (BottomNav 탭 허브) → `'submain'`
 * - 그 외                       → `'default'` (← + 타이틀 inline + 우측 3 액션 = detail 패턴)
 *
 * SSR / window 미존재 / 경로 없음 → `'default'` (안전 폴백).
 *
 * @example
 * getAppBarVariant('/parent');           // 'main'
 * getAppBarVariant('/classes-manage');   // 'submain'
 * getAppBarVariant('/classes/abc123');   // 'default'
 *
 * // PageAppBar 자동 변형 사용 예:
 * import { getAppBarVariant } from '@/services/native-bridge';
 * const pathname = usePathname();
 * <PageAppBar variant={getAppBarVariant(pathname)} title="..." />
 */
export type AppBarVariantAuto = "main" | "submain" | "default";
export function getAppBarVariant(pathname?: string): AppBarVariantAuto {
  if (isMainScreen(pathname)) return "main";
  if (isSubmainScreen(pathname)) return "submain";
  return "default";
}

// ─── 화면 breakpoint (C-1 2026-06-07) ───
export type ScreenBreakpoint = "xs" | "sm" | "md" | "lg" | "xl";

export function computeScreenBreakpoint(width: number): ScreenBreakpoint {
  if (width <= 359) return "xs";
  if (width <= 413) return "sm";
  if (width <= 479) return "md";
  if (width <= 767) return "lg";
  return "xl";
}
