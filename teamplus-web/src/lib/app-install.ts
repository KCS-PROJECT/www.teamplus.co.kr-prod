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

/** Android 패키지명 — env 기본값: kr.co.teamplus.app */
export const ANDROID_PACKAGE = env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME;

/** iOS Bundle ID — AASA appID 의 bundle 부분과 일치 (운영 배포 시 sync 필수) */
export const IOS_BUNDLE_ID = "com.teamplus.app";

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
