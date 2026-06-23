/**
 * TEAMPLUS Deeplink Core Library
 * ------------------------------------------------------------
 * iOS Universal Links / Android App Links / Custom Scheme을 하나의 API로 다룬다.
 *
 * 지원 입력:
 *   1. Universal Link   `https://teamplusweb.icetimes.co.kr/classes/123`
 *   2. Custom Scheme    `teamplus://classes/123`
 *   3. Relative Path    `/classes/123`
 *
 * 보안 원칙:
 *   - path traversal 차단 (`..`, `//`, encoded variants)
 *   - 외부 origin redirect 차단 (allowlist만 허용)
 *   - query 보존은 화이트리스트 키만
 *
 * 순수 함수: 부수 효과 없음 · 브라우저/Node 모두 동작
 */

/**
 * 배포된 Universal Links / App Links 호스트.
 *
 * 운영 도메인 체계(icetimes.co.kr):
 *   - teamplusweb.icetimes.co.kr   → 사용자 웹(앱 WebView 로드 대상) ★딥링크 대상
 *   - teamplusadmin.icetimes.co.kr → 관리자(앱 미로드) · 딥링크 비대상(보안)
 *   - teamplus.icetimes.co.kr      → 홍보 홈페이지 · 딥링크 비대상
 * 앱은 사용자 웹만 로드하므로 딥링크 host 는 teamplusweb 만 등록한다.
 *
 * 2026-06-15 레거시 *.teamplus.com 제거 — 전 도메인 패밀리 DNS SERVFAIL(폐기).
 *   죽은 도메인을 allowlist 에 남기면 Play Console autoVerify 검증이 영구 실패하고
 *   (확인되지 않은 도메인 오류), 도메인 재등록 시 피싱 딥링크가 통과될 수 있어 제거.
 *
 * iOS AASA(apple-app-site-association)·Android AndroidManifest autoVerify host와
 * 일치해야 한다. 도메인 변경 시 ios/Runner/*.entitlements, AndroidManifest.xml,
 * teamplus-app/lib/core/router/deep_link_handler.dart(kUniversalLinkHosts)와 동기화.
 */
export const DEEPLINK_HOSTS = [
  "teamplusweb.icetimes.co.kr", // 운영 사용자 웹 (유일한 활성 딥링크 도메인)
] as const;

/** 커스텀 스킴 (AndroidManifest `android:scheme="teamplus"`과 일치) */
export const DEEPLINK_SCHEME = "teamplus" as const;

/**
 * Deeplink로 진입 가능한 경로 prefix 화이트리스트.
 * 이 목록에 해당하는 prefix만 외부 URL → 내부 라우팅이 허용된다.
 * 민감한 관리 경로(`/admin`, `/settings/security` 등)는 의도적으로 제외.
 */
export const DEEPLINK_ALLOWED_PREFIXES = [
  "/classes",
  "/class-calendar",
  "/coach",
  "/coaches",
  "/parent",
  "/child",
  "/teen",
  "/director",
  "/mypage",
  "/profile",
  "/notifications",
  "/notices",
  "/notice",
  "/faq",
  "/terms",
  "/help",
  "/feedback",
  "/attendance",
  "/attendance-history",
  "/calendar",
  "/schedule",
  "/matches",
  "/tournaments",
  "/badges",
  "/stickers",
  "/credits",
  "/payment",
  "/qr-scan",
  "/qr-generate",
  "/photos",
  "/shop",
  "/products",
  "/my-qr",
] as const;

/**
 * 쿼리 파라미터 화이트리스트. 이외의 키는 파싱 시 제거된다.
 * (`?token=...` 같은 민감 파라미터가 링크에 실리지 않도록)
 */
export const DEEPLINK_ALLOWED_QUERY_KEYS = [
  "tab",
  "id",
  "filter",
  "date",
  "source",
  "campaign",
  "from",
] as const;

export type DeeplinkAllowedQueryKey =
  (typeof DEEPLINK_ALLOWED_QUERY_KEYS)[number];

/** 파싱 결과 타입 — 항상 절대 경로 + 정제된 query */
export interface DeeplinkTarget {
  /** 정규화된 내부 경로 (`/classes/123`) — 반드시 `/`로 시작 */
  path: string;
  /** 화이트리스트 통과한 쿼리 파라미터 */
  query: Record<DeeplinkAllowedQueryKey, string>;
  /** 원본 입력 카테고리 */
  source: "universal" | "scheme" | "relative";
}

/**
 * 문자열이 안전한 내부 경로인지 판별.
 * - 반드시 `/`로 시작하고
 * - `..`, `//`, 인코딩된 traversal 시퀀스를 허용하지 않으며
 * - 화이트리스트 prefix로 시작해야 한다.
 *
 * @example
 *   isSafeInternalPath('/classes/123')        // true
 *   isSafeInternalPath('/admin/members')      // false (allowlist 제외)
 *   isSafeInternalPath('//evil.com')          // false
 *   isSafeInternalPath('/classes/../admin')   // false
 *   isSafeInternalPath('https://evil.com')    // false
 */
export function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (path.length === 0 || path.length > 2048) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false; // protocol-relative URL 차단
  if (path.startsWith("/\\")) return false; // backslash 혼합 경로 차단
  // 디코딩 후 traversal 패턴 재검사
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (decoded.includes("..")) return false;
  if (decoded.includes("\0")) return false;
  if (/[\r\n\t]/.test(decoded)) return false;

  // 경로 부분만 추출 (query/hash 제외)
  const pathOnly = decoded.split(/[?#]/, 1)[0] ?? decoded;
  return DEEPLINK_ALLOWED_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
  );
}

/** 쿼리 파라미터를 화이트리스트 필터링 */
function sanitizeQuery(
  params: URLSearchParams,
): Record<DeeplinkAllowedQueryKey, string> {
  const result = {} as Record<DeeplinkAllowedQueryKey, string>;
  for (const key of DEEPLINK_ALLOWED_QUERY_KEYS) {
    const value = params.get(key);
    if (value !== null && value.length <= 256) {
      // 제어문자 차단
      if (!/[\r\n\t\0]/.test(value)) {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * 임의 문자열(외부 URL·커스텀 스킴·상대 경로)을 안전한 DeeplinkTarget으로 파싱.
 * 실패 시 `null` 반환 — 절대 예외를 던지지 않는다 (호출부 방어 코드 단순화).
 *
 * @example
 *   parseDeeplink('https://teamplusweb.icetimes.co.kr/classes/123?tab=info')
 *     → { path: '/classes/123', query: { tab: 'info' }, source: 'universal' }
 *   parseDeeplink('teamplus://coach/456')
 *     → { path: '/coach/456', query: {}, source: 'scheme' }
 *   parseDeeplink('https://evil.com/classes/123')
 *     → null (외부 host)
 *   parseDeeplink('/admin/members')
 *     → null (allowlist 제외)
 */
export function parseDeeplink(input: unknown): DeeplinkTarget | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (raw.length === 0 || raw.length > 2048) return null;

  let source: DeeplinkTarget["source"];
  let pathWithQuery: string;

  if (raw.startsWith(`${DEEPLINK_SCHEME}://`)) {
    // teamplus://classes/123?tab=info
    source = "scheme";
    const rest = raw.slice(`${DEEPLINK_SCHEME}://`.length);
    pathWithQuery = rest.startsWith("/") ? rest : `/${rest}`;
  } else if (raw.startsWith("https://") || raw.startsWith("http://")) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    // allowlist host만 허용
    if (!(DEEPLINK_HOSTS as readonly string[]).includes(url.hostname)) {
      return null;
    }
    source = "universal";
    pathWithQuery = `${url.pathname}${url.search}`;
  } else if (raw.startsWith("/")) {
    source = "relative";
    pathWithQuery = raw;
  } else {
    return null;
  }

  // URL 객체로 path/query 분리 (상대 URL 안전 파싱 — base host 는 더미, 폐기되지 않음)
  let parsed: URL;
  try {
    parsed = new URL(pathWithQuery, "https://teamplusweb.icetimes.co.kr");
  } catch {
    return null;
  }

  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  if (!isSafeInternalPath(path)) return null;

  return {
    path,
    query: sanitizeQuery(parsed.searchParams),
    source,
  };
}

/**
 * 내부 DeeplinkTarget을 외부에서 공유 가능한 URL로 빌드.
 *
 * @example
 *   buildDeeplink({ path: '/classes/123', query: { tab: 'info' } })
 *     → { https: 'https://teamplusweb.icetimes.co.kr/classes/123?tab=info',
 *         scheme: 'teamplus://classes/123?tab=info' }
 */
export function buildDeeplink(
  target: {
    path: string;
    query?: Partial<Record<DeeplinkAllowedQueryKey, string>>;
  },
  options: { host?: string } = {},
): { https: string; scheme: string } {
  const host = options.host ?? DEEPLINK_HOSTS[0];
  if (!isSafeInternalPath(target.path)) {
    throw new Error(`[deeplink] unsafe or disallowed path: ${target.path}`);
  }
  const searchParams = new URLSearchParams();
  if (target.query) {
    for (const key of DEEPLINK_ALLOWED_QUERY_KEYS) {
      const v = target.query[key];
      if (typeof v === "string" && v.length > 0 && v.length <= 256) {
        searchParams.set(key, v);
      }
    }
  }
  const qs = searchParams.toString();
  const suffix = qs.length > 0 ? `?${qs}` : "";
  return {
    https: `https://${host}${target.path}${suffix}`,
    scheme: `${DEEPLINK_SCHEME}://${target.path.replace(/^\//, "")}${suffix}`,
  };
}

/**
 * 파싱된 DeeplinkTarget을 Next.js router에 넘길 수 있는 경로 문자열로 변환.
 * `useRouter().push(resolveInternalPath(target))` 식으로 사용.
 */
export function resolveInternalPath(target: DeeplinkTarget): string {
  const qs = new URLSearchParams();
  for (const key of DEEPLINK_ALLOWED_QUERY_KEYS) {
    const v = target.query[key];
    if (typeof v === "string" && v.length > 0) {
      qs.set(key, v);
    }
  }
  const suffix = qs.toString();
  return suffix.length > 0 ? `${target.path}?${suffix}` : target.path;
}
