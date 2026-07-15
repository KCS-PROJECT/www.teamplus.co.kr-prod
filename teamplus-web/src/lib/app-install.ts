/**
 * TEAMPLUS App Install Helper
 * ------------------------------------------------------------
 * 미설치 사용자를 App Store / Play Store 로 유도하는 유틸리티 모음.
 *
 * 호출 시점:
 *   1. `/get-app` 페이지 — 명시적 설치 안내 페이지
 *   2. `AppInstallBanner` — 모바일 웹 첫 방문자 상단 배너
 *   3. `useDeeplinkRouter` fallback — `teamplus://` 실패 시 스토어 이동
 *
 * 설계 원칙:
 *   - 순수 함수 + 브라우저 사이드 effect 함수 분리
 *   - SSR 안전 (window 가드 필수)
 *   - 환경변수 미설정 시에도 동작 (검색 페이지로 fallback)
 */

import { env } from "@/lib/env";
import { isNativeApp } from "@/lib/environment";

/** 지원 플랫폼 (other 는 PC / 미지원 모바일) */
export type AppInstallPlatform = "ios" | "android" | "other";

/** Android 패키지명 — env 기본값: kr.co.teamplus */
export const ANDROID_PACKAGE = env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME;

/** iOS Bundle ID — AASA appID 의 bundle 부분·Xcode PRODUCT_BUNDLE_IDENTIFIER 와 일치 필수 */
export const IOS_BUNDLE_ID =
  process.env.NEXT_PUBLIC_IOS_BUNDLE_ID || "kr.co.teamplus";

/**
 * User-Agent 기반 플랫폼 감지.
 * 서버사이드(window 없음)에서는 항상 'other' 반환 — 호출자는 mount 후 재호출해야 한다.
 *
 * iPad 13+ 의 desktop UA 위장도 처리 (`Macintosh` + touchscreen).
 */
export function detectPlatform(): AppInstallPlatform {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "other";
  }
  const ua = navigator.userAgent || "";

  // iOS — iPhone/iPad/iPod 또는 iPadOS 13+ (Mac UA + touch)
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return "ios";
  }

  // Android
  if (/Android/i.test(ua)) return "android";

  return "other";
}

/**
 * 플랫폼별 스토어 URL 반환.
 * iOS: `https://apps.apple.com/app/id{ID}` (ID 미설정 시 검색 fallback)
 * Android: `https://play.google.com/store/apps/details?id={PKG}`
 *
 * `referrer` 인자는 Android Play Store install referrer 에 첨부되어,
 * 앱 설치 후 첫 실행 시 deferred deeplink 처리에 사용 가능 (별도 SDK 통합 필요).
 */
export function getStoreUrl(
  platform: AppInstallPlatform,
  options: { referrer?: string } = {},
): string {
  const { referrer } = options;

  if (platform === "ios") {
    const id = env.NEXT_PUBLIC_IOS_APP_STORE_ID;
    if (id && /^\d+$/.test(id)) {
      return `https://apps.apple.com/app/id${id}`;
    }
    // ID 미설정 시 검색 fallback — 운영 배포 전에 반드시 NEXT_PUBLIC_IOS_APP_STORE_ID 설정
    return "https://apps.apple.com/kr/search?term=teamplus";
  }

  if (platform === "android") {
    const base = `https://play.google.com/store/apps/details?id=${encodeURIComponent(
      ANDROID_PACKAGE,
    )}`;
    if (referrer) {
      return `${base}&referrer=${encodeURIComponent(referrer)}`;
    }
    return base;
  }

  // PC / 미지원 모바일 — 검색 fallback
  return "https://apps.apple.com/kr/search?term=teamplus";
}

/** 양쪽 스토어 URL 동시 반환 (수동 선택 화면용) */
export function getAllStoreUrls(options: { referrer?: string } = {}): {
  ios: string;
  android: string;
} {
  return {
    ios: getStoreUrl("ios", options),
    android: getStoreUrl("android", options),
  };
}

/* ─────────────────────────────────────────────────────────────
 * SNS 인앱브라우저 감지 & 앱 오픈 전략 URL 빌더
 *
 * 카카오톡·인스타그램·페이스북·네이버·X·라인 등의 "인앱 브라우저"는 iOS Universal
 * Links / 커스텀 스킴을 자주 차단한다. 플랫폼별로 다른 탈출 전략이 필요하다:
 *   - Android 인앱: `intent://` (S.browser_fallback_url=스토어) 로 앱/스토어 자동 처리
 *   - iOS 카카오톡: `kakaotalk://web/openExternal?url=` 로 Safari 탈출 → Universal Link 재시도
 *   - iOS 인스타/페북 등: 자동 실행 불가 → 스토어 안내(/get-app)가 최선
 * ─────────────────────────────────────────────────────────── */

/** 감지된 SNS 인앱브라우저 종류 (null = 일반 브라우저) */
export type InAppBrowser =
  | "kakaotalk"
  | "instagram"
  | "facebook"
  | "naver"
  | "twitter"
  | "line"
  | "other-webview"
  | null;

/**
 * User-Agent 로 SNS 인앱브라우저를 감지.
 *
 * ⚠️ 호출 전 `isNativeApp()` 로 TEAMPLUS 자체 WebView 를 먼저 걸러내야 한다
 *    (TEAMPLUS Android WebView 도 `; wv)` 를 포함해 'other-webview' 로 잡힐 수 있음).
 *
 * @param ua 테스트용 UA 주입 (미지정 시 navigator.userAgent)
 */
export function detectInAppBrowser(ua?: string): InAppBrowser {
  const uaStr =
    ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!uaStr) return null;

  if (/KAKAOTALK/i.test(uaStr)) return "kakaotalk";
  if (/Instagram/i.test(uaStr)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(uaStr)) return "facebook";
  if (/NAVER\(inapp/i.test(uaStr)) return "naver";
  if (/\bLine\//i.test(uaStr)) return "line";
  if (/Twitter/i.test(uaStr)) return "twitter";
  if (/; wv\)/.test(uaStr)) return "other-webview"; // generic Android WebView
  return null;
}

/**
 * Android `intent://` URL 생성 — 앱이 있으면 앱으로, 없으면
 * `S.browser_fallback_url`(스토어)로 자동 이동. 카카오톡·크롬 계열 인앱에서 동작.
 *
 * @param httpsUrl 앱이 처리할 Universal Link (예: `https://teamplusweb.icetimes.co.kr/classes/123`)
 * @param options.fallbackUrl 미설치 시 이동할 스토어 URL (필수)
 * @param options.packageName Android 패키지명 (기본 ANDROID_PACKAGE)
 * @returns intent:// URL. httpsUrl 파싱 실패 시 fallbackUrl 그대로 반환.
 */
export function buildAndroidIntentUrl(
  httpsUrl: string,
  options: { fallbackUrl: string; packageName?: string },
): string {
  const { fallbackUrl, packageName = ANDROID_PACKAGE } = options;
  let u: URL;
  try {
    u = new URL(httpsUrl);
  } catch {
    return fallbackUrl;
  }
  const scheme = u.protocol.replace(/:$/, ""); // "https"
  const hostPathQuery = `${u.host}${u.pathname}${u.search}`;
  return (
    `intent://${hostPathQuery}#Intent;` +
    `scheme=${scheme};` +
    `package=${packageName};` +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};` +
    `end`
  );
}

/**
 * iOS 카카오톡 인앱 → Safari 탈출 URL.
 * Safari 에서 Universal Link 가 재평가되어 앱 설치 시 앱으로, 미설치 시 웹으로 열린다.
 *
 * @param targetUrl Safari 로 넘길 최종 URL (Universal Link 또는 /get-app)
 */
export function buildKakaoInAppEscapeUrl(targetUrl: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(targetUrl)}`;
}

/**
 * "앱 열기 or 스토어 유도" 전략 결정 (순수 함수).
 *
 * 플랫폼 × 인앱브라우저 조합으로 취해야 할 액션을 계산한다. 부수효과(window.location /
 * navigate / timeout)는 호출자(`useDeeplinkRouter.openInAppOrInstall`)가 수행한다.
 * 순수 함수라 모든 진입 시나리오(카톡/인스타/네이버/일반)를 단위 테스트로 검증 가능.
 */
export type AppOpenStrategy =
  | "internal" // 네이티브 앱 안 / PC → 그냥 내부 라우팅
  | "android-intent" // Android 인앱 → intent:// (스토어 fallback 내장)
  | "ios-kakao-escape" // iOS 카카오톡 → Safari 탈출
  | "ios-inapp-guide" // iOS 기타 인앱(인스타/페북 등) → /get-app 안내
  | "scheme-timeout"; // 일반 모바일 브라우저 → teamplus:// + 미설치 시 /get-app

export interface AppOpenPlan {
  strategy: AppOpenStrategy;
  /** `window.location.href` 로 이동할 URL (android-intent / ios-kakao-escape) */
  href?: string;
  /** `navigate()` 로 이동할 내부 경로 (internal / ios-inapp-guide) */
  path?: string;
  /** scheme-timeout 전략: 시도할 스킴 URL */
  schemeUrl?: string;
  /** scheme-timeout 전략: 미설치 시 fallback 내부 경로 */
  fallbackPath?: string;
}

export function planAppOpen(params: {
  /** 정규화된 내부 경로 (`/classes/123`) */
  internalPath: string;
  /** 앱이 처리할 Universal Link (`https://teamplusweb.icetimes.co.kr/classes/123`) */
  universalUrl: string;
  /** 커스텀 스킴 URL (`teamplus://classes/123`) */
  schemeUrl: string;
  platform: AppInstallPlatform;
  inApp: InAppBrowser;
  isNative: boolean;
}): AppOpenPlan {
  const { internalPath, universalUrl, schemeUrl, platform, inApp, isNative } =
    params;
  const getAppPath = `/get-app?redirect=${encodeURIComponent(internalPath)}`;

  // 이미 앱 안 / PC·미지원 모바일 → 스토어 유도 무의미, 내부 라우팅
  if (isNative || platform === "other") {
    return { strategy: "internal", path: internalPath };
  }

  // Android 인앱브라우저(카톡/인스타/페북/네이버/…) → intent://
  if (platform === "android" && inApp) {
    const storeUrl = getStoreUrl("android", { referrer: internalPath });
    return {
      strategy: "android-intent",
      href: buildAndroidIntentUrl(universalUrl, { fallbackUrl: storeUrl }),
    };
  }

  // iOS 카카오톡 → Safari 탈출(Universal Link 재평가)
  if (platform === "ios" && inApp === "kakaotalk") {
    return {
      strategy: "ios-kakao-escape",
      href: buildKakaoInAppEscapeUrl(universalUrl),
    };
  }

  // iOS 인스타/페북/네이버 등 → 자동 실행 불가 → /get-app 안내
  if (platform === "ios" && inApp && inApp !== "kakaotalk") {
    return { strategy: "ios-inapp-guide", path: `${getAppPath}&inapp=${inApp}` };
  }

  // 일반 모바일 브라우저 → teamplus:// 시도 후 미설치 시 /get-app
  return { strategy: "scheme-timeout", schemeUrl, fallbackPath: getAppPath };
}

/* ─────────────────────────────────────────────────────────────
 * AppInstallBanner dismiss 추적
 * ─────────────────────────────────────────────────────────── */

const DISMISS_STORAGE_KEY = "teamplus:app-install-banner:dismissed-at";
/** dismiss 후 재노출까지의 유예 (7일) */
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 상단 설치 배너를 노출할지 판정.
 * 다음 조건 모두 충족 시 true:
 *   - 클라이언트 사이드
 *   - 네이티브 WebView 가 아님 (이미 앱 안)
 *   - 모바일 플랫폼 (ios/android)
 *   - 7일 이내 dismiss 한 적 없음
 */
export function shouldShowInstallBanner(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return false;

  const platform = detectPlatform();
  if (platform === "other") return false;

  try {
    const dismissedAt = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (dismissedAt) {
      const ts = Number.parseInt(dismissedAt, 10);
      if (Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS) {
        return false;
      }
    }
  } catch {
    // localStorage 접근 실패 (Safari private mode 등) — 노출 허용
  }
  return true;
}

/** 사용자가 배너 닫기를 누르면 호출. 7일간 재노출 안 함. */
export function dismissInstallBanner(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage 사용 불가 — 무시 (현재 세션에서만 닫힘)
  }
}

/** dismiss 상태 초기화 (개발/디버그용) */
export function resetInstallBannerDismiss(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DISMISS_STORAGE_KEY);
  } catch {
    // no-op
  }
}

/* ─────────────────────────────────────────────────────────────
 * Deeplink → 앱 오픈 시도 + fallback
 * ─────────────────────────────────────────────────────────── */

/**
 * `teamplus://` 스킴을 시도하여 앱을 열고, 일정 시간 내 페이지가 살아있으면
 * 미설치로 간주하고 스토어로 이동시킨다.
 *
 * 원리: 앱이 열리면 브라우저 탭이 background 로 가서 `document.hidden` 이 true 가 된다.
 *       timeoutMs 내 hidden 으로 전환되지 않으면 미설치로 판정.
 *
 * iOS Safari 는 사용자 제스처가 있어야 스킴 호출이 동작 — 이 함수는 반드시
 * 클릭 핸들러 안에서 호출해야 한다.
 *
 * @param schemeUrl 시도할 deeplink (예: `teamplus://classes/123`)
 * @param options.timeoutMs 미설치 판정까지 대기 (기본 1500ms)
 * @param options.fallbackUrl 스토어 URL — 미지정 시 detectPlatform() 기반 자동 결정
 * @returns dispose 함수 (취소용)
 */
export function tryOpenAppWithFallback(
  schemeUrl: string,
  options: {
    timeoutMs?: number;
    fallbackUrl?: string;
    onFallback?: () => void;
  } = {},
): () => void {
  const { timeoutMs = 1500, onFallback } = options;

  if (typeof window === "undefined") return () => {};

  let timerId: ReturnType<typeof setTimeout> | null = null;
  let canceled = false;

  const cleanup = () => {
    if (timerId !== null) clearTimeout(timerId);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", cleanup);
  };

  function onVisibility() {
    if (document.hidden) {
      // 앱이 열려서 background 로 이동 → fallback 취소
      canceled = true;
      cleanup();
    }
  }

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", cleanup);

  // iframe 트릭 — iOS Safari 가 알 수 없는 스킴 시 알림 팝업을 띄우지 않게.
  // (location.href 직접 변경하면 "주소가 잘못되었습니다" 알림이 뜰 수 있음)
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = schemeUrl;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        // 이미 제거됨
      }
    }, 100);
  } catch {
    // iframe 사용 불가 시 location.href fallback
    try {
      window.location.href = schemeUrl;
    } catch {
      // no-op
    }
  }

  // timeoutMs 내 background 전환 없으면 스토어 이동
  timerId = setTimeout(() => {
    if (canceled || document.hidden) return;
    const fallback =
      options.fallbackUrl ?? getStoreUrl(detectPlatform());
    onFallback?.();
    window.location.href = fallback;
  }, timeoutMs);

  return () => {
    canceled = true;
    cleanup();
  };
}
