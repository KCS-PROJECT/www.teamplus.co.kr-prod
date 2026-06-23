/**
 * AppStatus(네이티브 상단 시스템 상태바 — 시계·배터리·노치 영역) 노출 정책 — 단일 출처(SoT).
 *
 * 정책 (2026-06-07 최초 · 2026-06-15 전 인증화면 표시 전환):
 *   - 모든 화면: 상태바 **표시** (로그인/회원가입/계정찾기 포함 — 2026-06-15 사용자 직접 지시).
 *   - splash / onboarding: 네이티브 splash 가 부팅 중 상태바를 직접 제어하므로
 *     공통 컨트롤러는 관여하지 않음(SKIP) — 기존 동작 보존.
 *
 * ⚠️ 예외 화면이 늘어나면(예: 약관 동의 전체화면) 아래 배열에 **한 줄만 추가**하면 된다.
 *    AppStatus 노출은 `AppStatusController` 가 이 정책을 단일 진입점에서 적용한다.
 */

/** 상태바를 숨길 경로(접두 일치) — 현재 없음.
 *  [2026-06-15 사용자 직접 지시] 로그인·회원가입·계정찾기 모두 상태바 **표시**로 전환.
 *  숨길 화면이 생기면 이 배열에 prefix 를 추가한다. (splash/onboarding 은 아래 SKIP 별도.) */
export const APP_STATUS_HIDDEN_PREFIXES = [] as const;

/**
 * 공통 컨트롤러가 관여하지 않는 경로(접두 일치) — 네이티브/페이지 자체 제어 보존.
 * splash·onboarding 은 부팅 시 네이티브 splash 가 상태바를 직접 끄므로,
 * 공통 컨트롤러가 강제로 표시하면 부팅 중 깜빡임이 생길 수 있어 제외한다.
 *
 * [2026-06-18 appstatus-fix F4] `/force-update` 추가 — 강제 업데이트 화면은 페이지가
 *   `useFullscreen()` 으로 상태바를 직접 끈다. 컨트롤러의 force-show(F2)가 이 의도를
 *   침범하지 않도록 SKIP 처리한다. (top-level 라우트라 prefix 매칭이 안전 —
 *   `/force-update` 로 시작하는 다른 경로 없음.)
 */
export const APP_STATUS_SKIP_PREFIXES = [
  "/splash",
  "/onboarding",
  "/force-update",
] as const;

/**
 * 페이지가 스스로 풀스크린(`useFullscreen`)을 제어하는 경로 패턴 — 정규식 **정확 매칭**.
 * 이 경로들은 페이지의 `useFullscreen()` 이 상태바를 끄는 것이 정상 동작이므로,
 * 공통 컨트롤러가 force-show(F2)로 침범하면 안 된다 → SKIP 처리(F4 회귀 가드).
 *
 * [2026-06-18 appstatus-fix F4]
 *  - 갤러리 풀뷰어는 **leaf 경로 3세그먼트** `(gallery)/photos/[albumId]/[photoId]`
 *    만 풀스크린이다. route group `(gallery)` 는 URL 에서 제거되어 런타임 pathname 은
 *    `/photos/{albumId}/{photoId}` (+ 선택적 trailing slash). 앨범 그리드
 *    `/photos`(1세그먼트)·사진 그리드 `/photos/{albumId}`(2세그먼트)는 상태바를
 *    **표시**해야 하므로, 단순 `/photos` prefix 가 아닌 **3세그먼트 정확 매칭**(`$` 앵커)
 *    으로만 skip 처리한다 → 그리드 2종 회귀 차단 + 가상의 4세그먼트 하위 경로도 미매칭.
 */
export const APP_STATUS_FULLSCREEN_PATTERNS: readonly RegExp[] = [
  /^\/photos\/[^/]+\/[^/]+\/?$/,
];

export type AppStatusVisibility = "show" | "hide" | "skip";

function matchesPrefix(
  pathname: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function matchesFullscreenPattern(pathname: string): boolean {
  return APP_STATUS_FULLSCREEN_PATTERNS.some((re) => re.test(pathname));
}

/**
 * 경로에 대한 AppStatus 노출 정책을 해석한다.
 * - "skip": 공통 컨트롤러 미관여(네이티브/페이지 자체 제어 — splash/onboarding/
 *           force-update + 갤러리 풀뷰어 등 페이지 자체 useFullscreen 화면)
 * - "hide": 상태바 숨김(인증 화면 그룹)
 * - "show": 상태바 표시(그 외 전부)
 */
export function resolveAppStatusVisibility(
  pathname: string | null | undefined,
): AppStatusVisibility {
  if (!pathname) return "show";
  if (matchesPrefix(pathname, APP_STATUS_SKIP_PREFIXES)) return "skip";
  if (matchesFullscreenPattern(pathname)) return "skip";
  if (matchesPrefix(pathname, APP_STATUS_HIDDEN_PREFIXES)) return "hide";
  return "show";
}

/** 인증 화면 그룹(상태바 숨김 대상)인지 여부 — 외부 재사용용 헬퍼. */
export function isAppStatusHiddenPath(
  pathname: string | null | undefined,
): boolean {
  return !!pathname && matchesPrefix(pathname, APP_STATUS_HIDDEN_PREFIXES);
}
