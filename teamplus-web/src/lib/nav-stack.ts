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
 * 소프트 백버튼 히스토리 소진 이벤트 (2026-07-16).
 *
 * `useNavigation.back()` 이 native 앱에서 `history.length <= 1` (뒤로 갈 곳 없음)을
 * 감지하면 이 커스텀 이벤트를 발행하고, 전역 마운트된 `useAppBack` 이 수신하여
 * 앱 종료 확인 팝업 플로우(requestAppExit)로 위임한다.
 * 하드웨어 백과 소프트 백의 "히스토리 없음 → 종료 confirm" 동작을 단일 SoT 로 묶는다.
 */
export const APP_BACK_EXHAUSTED_EVENT = "teamplus:app-back-exhausted";

/**
 * 뒤로 갈 위치가 소진됐는지(현재가 히스토리 첫 엔트리) 판정 (2026-07-16).
 *
 * `window.history.length` 는 세션 내에서 단조 증가(뒤로가기해도 감소하지 않음)라
 * "총 엔트리 수"일 뿐 "현재 위치가 첫 엔트리인지"를 알려주지 못한다. 딥링크로 A 진입
 * → B push → 백으로 A 복귀 시 length 는 2로 남아 `length<=1` 프록시가 소진을 놓친다
 * (백버튼 무반응 dead-end). Chromium(Android WebView)은 Navigation API 를 지원하므로
 * `navigation.currentEntry.index === 0`(위치 기반)을 우선 사용하고, 미지원 환경에서만
 * length 프록시로 폴백한다.
 */
export function isBackHistoryExhausted(): boolean {
  if (typeof window === "undefined") return false;
  const nav = (window as unknown as {
    navigation?: { currentEntry?: { index?: number } | null };
  }).navigation;
  const index = nav?.currentEntry?.index;
  if (typeof index === "number") return index <= 0;
  return window.history.length <= 1;
}

/**
 * 인증 진입 화면 경로 — back(history -1) 대상에서 제외해야 하는 경로 집합 (2026-07-17).
 * Flutter `_isAuthPathUrl`(webview_screen_helpers.dart) 과 동기화한다.
 */
const AUTH_ENTRY_PATHS = [
  "/login",
  "/signup",
  "/register",
  "/find-id",
  "/find-password",
  "/forgot-password",
  "/password-reset-complete",
  "/onboarding",
  "/splash",
] as const;

/** 엔트리 URL → trailing slash 정규화된 pathname ('' = 판정 불가). */
function normalizeEntryPath(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const path = new URL(url, window.location.origin).pathname;
    return path.length > 1 ? path.replace(/\/+$/, "") : path;
  } catch {
    return "";
  }
}

/**
 * back(history -1) 목적지가 인증 진입 화면(로그인/회원가입/온보딩/스플래시)인지 판정 (2026-07-17).
 *
 * 인증 화면으로 되돌아가면 인증 가드가 다시 홈으로 리다이렉트해 "로그인 화면 플래시 →
 * 홈 복귀" 루프가 생긴다. 이 경우 호출부(useAppBack/useNavigation)는 back 대신 역할
 * 메인 replace(2단 백 폴백)를 태운다. 현재와 같은 경로의 중복 엔트리는 건너뛰고 처음
 * 만나는 다른 경로를 검사한다. Navigation API(Chromium/Android WebView) 미지원 환경
 * (Safari 등)에서는 판정 불가 → false (기존 back 동작 유지).
 */
export function isBackTargetAuthEntry(): boolean {
  if (typeof window === "undefined") return false;
  const nav = (window as unknown as {
    navigation?: {
      currentEntry?: { index?: number } | null;
      entries?: () => Array<{ url?: string | null }>;
    };
  }).navigation;
  const index = nav?.currentEntry?.index;
  if (typeof index !== "number" || index <= 0 || typeof nav?.entries !== "function") {
    return false;
  }
  try {
    const entries = nav.entries();
    const currentPath = normalizeEntryPath(entries[index]?.url);
    for (let i = index - 1; i >= 0; i--) {
      const path = normalizeEntryPath(entries[i]?.url);
      if (path === currentPath) continue; // 같은 경로 중복 엔트리 스킵
      if (!path) return false;
      return AUTH_ENTRY_PATHS.some(
        (p) => path === p || path.startsWith(`${p}/`),
      );
    }
  } catch {
    // entries 접근 실패 — 기존 back 동작 유지
  }
  return false;
}

/**
 * 외부 도메인(결제창 등)으로 떠나기 직전의 history 길이 기록 (2026-09-22).
 *
 * 모바일에서 나이스 결제창은 다른 도메인 페이지로 화면 전체가 이동하고, 취소·실패 시
 * 서버 303 으로 우리 페이지에 **새 문서**로 돌아온다. 그 문서에서 Navigation API 는 같은
 * 출처의 연속 구간만 보여 주므로 결제창 앞의 목록·상세 항목이 "없는 것처럼" 보인다 —
 * 실제 브라우저 히스토리에는 그대로 남아 있다. 떠날 때 길이를 적어 두면 돌아온 뒤
 * `history.go(-n)` 으로 외부 페이지 블록을 건너뛰어 원래 항목에 착지할 수 있다.
 */
const EXTERNAL_DEPARTURE_KEY = "teamplus:nav:externalDeparture";
/** 기록 유효 시간 — 결제창에 머무는 시간보다 넉넉하되, 오래된 기록이 다른 흐름에 쓰이지 않게. */
const EXTERNAL_DEPARTURE_TTL_MS = 30 * 60 * 1000;

/** 출발 표식 history.state. `depth` = 연속된 표식 개수(결제창에서 빠져나와 재시도하면 2, 3…). */
type DepartureMarkerState = { teamplusDeparture: true; depth: number };

/**
 * 외부 도메인으로 떠나기 직전(결제창 호출 직전)에 호출 — 같은 주소의 **출발 표식 항목**을
 * push 한 뒤 history 길이·떠나는 경로·시각을 기록한다.
 *
 * 표식을 push 하는 이유: `history.length` 는 앞으로가기 항목까지 센다. 결제창에서 한 번
 * 빠져나와(히스토리 되짚기) 다시 결제하면 만료된 결제창 항목이 앞으로가기 쪽에 남아 있어
 * 길이가 현재 위치보다 크고, 그대로 기록하면 복귀 시 되짚기 칸 수가 어긋나 만료된
 * 결제창에 착지한다. push 는 앞으로가기 항목을 잘라내므로 기록 시점의 길이 = 현재 위치 + 1
 * 이 보장된다. 표식은 떠나는 화면과 같은 주소라 되돌아와도 같은 화면이 보이고, 앱의
 * 히스토리 복귀(`_safeHistoryBackSteps`)는 같은 경로가 이어지면 그 앞까지 한 번에 내려간다.
 * 경로는 복귀 시 "같은 화면으로 돌아왔을 때만" 쓰기 위한 대조 키다.
 *
 * 알려진 부작용: 앱이 아닌 모바일 브라우저에서 결제창을 브라우저 뒤로가기로 빠져나오면 표식
 * 위에 서게 되고, 그때 헤더 ← 는 같은 주소의 원본 항목으로 한 칸 이동해 화면이 그대로다
 * (한 번 더 눌러야 이전 화면). 결제창을 실제로 열지 못한 경우(goPay 예외)도 같다. 표식
 * 항목은 history 에서 제거할 수 없어 감수한다.
 */
export function markExternalDeparture(): void {
  if (typeof window === "undefined") return;
  // 결제창에서 되짚어 나와(표식 위에 서 있음) 다시 떠나는 경우 표식이 연속으로 쌓인다.
  //   복귀 계산이 "떠난 페이지 = 표식 바로 앞" 을 전제하므로 깊이를 함께 적어 그만큼 더 되짚는다.
  const current = window.history.state as Partial<DepartureMarkerState> | null;
  const depth =
    current?.teamplusDeparture && typeof current.depth === "number"
      ? current.depth + 1
      : 1;
  try {
    const marker: DepartureMarkerState = { teamplusDeparture: true, depth };
    window.history.pushState(
      marker,
      "",
      window.location.pathname + window.location.search + window.location.hash,
    );
  } catch {
    // History API 차단 환경 — 표식 없이 진행(길이가 어긋날 수 있어 아래 기록도 생략)
    return;
  }
  try {
    window.sessionStorage.setItem(
      EXTERNAL_DEPARTURE_KEY,
      JSON.stringify({
        length: window.history.length,
        depth,
        path: window.location.pathname.replace(/\/+$/, "") || "/",
        at: Date.now(),
      }),
    );
  } catch {
    // sessionStorage 차단 환경 — 기록 없음 (호출부는 replace 폴백)
  }
}

export function clearExternalDeparture(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(EXTERNAL_DEPARTURE_KEY);
  } catch {
    // ignore
  }
}

/**
 * 외부 도메인을 거쳐 돌아온 문서에서, **떠난 페이지의 직전 항목**까지 되짚는 step 수.
 *
 * `currentLength` 는 복귀 문서 마운트 시점(보초 push 전)의 `history.length`.
 *   기록길이 = 마지막 출발 표식 index + 1, 표식은 depth 개 연속, 떠난 페이지는 그 앞이므로
 *   직전 항목 index = 기록길이 - 2 - depth, 복귀 페이지 index = currentLength - 1
 *   → step = currentLength - 기록길이 + 1 + depth.
 *   기록이 없거나 길이가 맞지 않으면(새로고침·다른 경로 진입) null — 호출부가 기존
 *   replace 폴백을 쓴다.
 */
export function stepsBackPastExternalReturn(
  currentLength: number,
): number | null {
  if (typeof window === "undefined") return null;
  type Departure = {
    length?: unknown;
    depth?: unknown;
    path?: unknown;
    at?: unknown;
  };
  let saved: Departure | null = null;
  try {
    const raw = window.sessionStorage.getItem(EXTERNAL_DEPARTURE_KEY);
    saved = raw ? (JSON.parse(raw) as Departure) : null;
  } catch {
    saved = null;
  }
  // 기록은 한 번만 쓴다 — 결제 성공·다른 결제사 흐름 등 이 복귀와 무관한 곳에서 되살아나
  //   엉뚱한 칸 수로 되짚지 않도록 읽는 즉시 지운다.
  clearExternalDeparture();
  if (!saved || typeof saved.length !== "number" || saved.length < 3) return null;
  if (typeof saved.at !== "number" || Date.now() - saved.at > EXTERNAL_DEPARTURE_TTL_MS) {
    return null;
  }
  // 떠난 화면과 같은 화면으로 돌아온 경우에만 유효(결제 화면 ↔ 결제 화면).
  const here = window.location.pathname.replace(/\/+$/, "") || "/";
  if (saved.path !== here) return null;
  const depth =
    typeof saved.depth === "number" && saved.depth >= 1 ? saved.depth : 1;
  const steps = currentLength - saved.length + 1 + depth;
  // 최소 = 외부 페이지 1개 이상 + 표식 depth 개 + 떠난 페이지 1개. 그보다 작으면 이 복귀의 기록이 아니다.
  return steps >= 2 + depth ? steps : null;
}

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
