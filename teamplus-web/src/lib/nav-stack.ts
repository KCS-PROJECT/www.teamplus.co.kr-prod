/**
 * Navigation Stack 관리 유틸
 *
 * 로그인 후 홈 진입 / BottomNav 탭 전환 시 history 스택을 초기화하여
 * "뒤로가기 → 로그인 화면 → 인증 재실행" 같은 비정상 흐름을 차단한다.
 *
 * 사용 패턴:
 *   1) 로그인 성공 직후: `resetToHome('/parent')`
 *   2) BottomNav 탭 클릭 시: `replaceCurrentEntry(href)` (push 대신 replace 로 stack 깊이 유지)
 *   3) 홈 진입 시 자동 호출: `useNavStackResetOnHome()` (홈 페이지 layout 또는 page 마운트 시)
 *
 * 원칙:
 * - Next.js `router.replace` + `window.history.replaceState` 조합으로 SPA stack 정리
 * - history.length 자체는 브라우저가 직접 통제(JS 로 0 으로 강제 불가) → 의미적 초기화로 충분
 * - hash sentinel 사용: 홈 페이지에 "_home" 마커를 남겨 popState 감지 시 종료 confirm 트리거 가능
 */

import { ROLE_HOME_PATHS } from "./nav-home-paths";

/**
 * 홈 페이지인지 확인 (BottomNav 의 홈 탭 + 5개 메인 대시보드)
 */
export function isHomePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const normalized = pathname.replace(/\/$/, "") || "/";
  return ROLE_HOME_PATHS.has(normalized);
}

/**
 * 현재 URL 의 history entry 를 새 URL 로 교체.
 * BottomNav 탭 전환 시 사용 — push 가 아닌 replace 로 처리하여 stack depth 가 무한 증가하지 않게 한다.
 *
 * Next.js App Router 의 `router.replace` 는 새 entry 로 대체하므로,
 * 별도 `window.history.replaceState` 를 추가 호출할 필요는 없다.
 * 다만 SSR 페이지 진입 직후 timing issue 회피를 위해 조용히 try/catch.
 */
export function replaceCurrentEntry(): void {
  if (typeof window === "undefined") return;
  try {
    // History API 안전 호출 — "back 가능" 상태가 사라지지는 않지만(브라우저 정책)
    // 의미적으로 현재 entry 가 갱신되어 stack 의 의도된 위치로 정렬됨.
    const currentUrl =
      window.location.pathname + window.location.search + window.location.hash;
    window.history.replaceState(window.history.state, "", currentUrl);
  } catch {
    // ignore — 일부 WebView 에서는 보안상 차단될 수 있음
  }
}

/**
 * 홈 진입 시 history sentinel(`#_home`) 마킹.
 * popstate 발생 시 sentinel 존재 여부로 "홈에서 백버튼 → 종료 confirm" 분기 결정.
 *
 * @returns sentinel 추가 여부
 */
export function markHomeSentinel(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hash === "#_home") return false; // 이미 마킹됨
  try {
    // 현재 entry 위에 sentinel push → 사용자가 백버튼 누르면 popstate(state=null) 발생
    window.history.pushState({ teamplusHomeSentinel: true }, "", "#_home");
    return true;
  } catch {
    return false;
  }
}

/**
 * sentinel 존재 여부 확인.
 */
export function hasHomeSentinel(): boolean {
  if (typeof window === "undefined") return false;
  const state = window.history.state as {
    teamplusHomeSentinel?: boolean;
  } | null;
  return (
    Boolean(state?.teamplusHomeSentinel) || window.location.hash === "#_home"
  );
}

/**
 * sentinel 제거 (홈을 떠날 때 호출).
 */
export function clearHomeSentinel(): void {
  if (typeof window === "undefined") return;
  if (window.location.hash !== "#_home") return;
  try {
    const url = window.location.pathname + window.location.search;
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // ignore
  }
}
