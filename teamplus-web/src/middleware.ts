/**
 * Next.js Middleware - TEAMPLUS Route Protection & Security
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ALL_PROTECTED_PATHS,
  getDashboardPathByUserType,
  getProtectedPathsByUserType,
  normalizeUserType,
} from "@/lib/auth-routing";
import { env } from "@/lib/env";
const AUTH_PATHS = [
  "/login",
  "/register",
  "/signup",
  "/forgot-password",
  "/find-id",
  "/find-password",
];

/**
 * 경로 매칭: 정확히 일치하거나 하위 경로인 경우만 true
 * startsWith 단독 사용 시 /admin이 /admin-schedules와 매칭되는 버그 방지
 */
function matchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(path + "/");
}

interface TokenPayload {
  exp: number;
  userType: string; // 백엔드에서 userType으로 전달
  sub: string;
}

/**
 * JWT 토큰 유효성 및 권한 확인
 */
function checkAuth(
  token: string | undefined,
  pathname: string,
): {
  isValid: boolean;
  isAuthorized: boolean;
  role?: string;
} {
  if (!token) return { isValid: false, isAuthorized: false };

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { isValid: false, isAuthorized: false };

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    const { exp, userType } = payload as TokenPayload;
    const normalizedUserType = normalizeUserType(userType);

    // 1. 만료 체크
    const now = Math.floor(Date.now() / 1000);
    if (exp <= now) return { isValid: false, isAuthorized: false };

    // 2. 권한(RBAC) 체크 - 사용자 역할이 해당 경로에 접근 가능한지 확인
    const userPaths = getProtectedPathsByUserType(normalizedUserType);
    const isAuthorized = userPaths.some((path) => matchesPath(pathname, path));

    return {
      isValid: true,
      isAuthorized,
      role: normalizedUserType ?? undefined,
    };
  } catch {
    return { isValid: false, isAuthorized: false };
  }
}

/**
 * [2026-06-04] refresh 토큰이 아직 만료되지 않았는지(JWT exp) 검사.
 *
 * access(15분) 가 만료돼도 refresh(7일) 가 살아있으면 미들웨어는 `/login` 강제
 * 이동 대신 통과시키고, 클라이언트(api-client/AuthContext) 의 선제 갱신에 위임한다.
 * 이전에는 access 만료만 보고 즉시 로그아웃돼 "활동 없으면 자동 로그아웃" 회귀가 있었다.
 */
function isRefreshTokenFresh(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    const now = Math.floor(Date.now() / 1000);
    return typeof payload.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
}

/**
 * 실운영 호스트 판정 — CSP 에서 dev/LAN HTTP origin 을 제외할지 결정한다.
 *
 * [2026-07-30] 기존에는 `NEXT_PUBLIC_ENVIRONMENT === "production"` 만 봤는데,
 * 운영 배포에 그 변수가 주입되지 않아 **실서비스 CSP 에 dev origin(HTTP localhost·
 * 211.236.x)이 그대로 실려 있었다**(실측 확인). XSS 가 발생하면 그 origin 으로
 * 데이터를 실어 보낼 수 있어 공격면이 넓어진다.
 *
 * 환경변수 주입을 놓쳐도 안전하도록 요청 호스트로도 판정한다(fail-safe).
 */
function isRealProductionHost(host: string | null): boolean {
  if (process.env.NEXT_PUBLIC_ENVIRONMENT === "production") return true;
  if (!host) return false;
  const h = host.split(":")[0].toLowerCase();
  // 운영 도메인(icetimes.co.kr·teamplus.com 계열)이면 실운영으로 본다.
  //   스테이징은 IP(211.236.x) 로 접근하므로 여기에 걸리지 않아 기존 호환이 유지된다.
  return h.endsWith(".icetimes.co.kr") || h.endsWith(".teamplus.com");
}

/** 응답에 표준 보안 헤더(+production CSP, 보호경로 캐시 차단)를 적용한다. */
function withSecurityHeaders(
  response: NextResponse,
  pathname?: string,
  host?: string | null,
): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // CSP는 프로덕션 환경에서만 적용 (개발 환경에서 API 호출 차단 방지)
  if (process.env.NODE_ENV === "production") {
    // [보안 2026-06-07] dev/LAN 백엔드 origin(HTTP)을 connect-src에서 분리.
    //   실제 프로덕션(NEXT_PUBLIC_ENVIRONMENT=production)에서는 제외해 CSP 공격면을 축소하고,
    //   스테이징(211.236.x HTTP에 배포되는 production 빌드)에서는 그대로 포함해 호환을 유지한다.
    //   ⚠️ 실프로덕션 배포 시 NEXT_PUBLIC_ENVIRONMENT=production 환경변수 주입 필수.
    const DEV_CONNECT_ORIGINS = [
      "http://localhost:5001", "http://localhost:5002", "http://localhost:5003", "http://localhost:5010",
      "http://127.0.0.1:5001", "http://127.0.0.1:5002", "http://127.0.0.1:5003", "http://127.0.0.1:5010",
      "http://211.236.174.86:5001", "http://211.236.174.86:5002", "http://211.236.174.86:5003", "http://211.236.174.86:5010",
      "http://211.236.174.110:5001", "http://211.236.174.110:5002", "http://211.236.174.110:5003", "http://211.236.174.110:5010",
      "http://211.236.174.90:5001", "http://211.236.174.90:5002", "http://211.236.174.90:5003", "http://211.236.174.90:5010",
      "http://211.236.174.115:5001", "http://211.236.174.115:5002", "http://211.236.174.115:5003", "http://211.236.174.115:5010",
    ];
    const devConnect = isRealProductionHost(host ?? null)
      ? ""
      : ` ${DEV_CONNECT_ORIGINS.join(" ")}`;
    // staging(211.236.x HTTP 배포)에서 백엔드 정적 이미지(/uploads/*)가 HTTP origin 으로
    //   로드되므로 img-src 에도 dev origin 보강. 실운영(https)은 제외해 공격면 불변.
    const devImg = devConnect;
    response.headers.set(
      "Content-Security-Policy",
      // 운영에서는 이 매-요청 CSP가 next.config.js headers()의 CSP를 덮어쓰므로,
      // 외부 도메인(카카오 SDK·이니시스·Sentry·Daum CDN·폰트) 허용 목록을 여기에도 유지해야 한다.
      `default-src 'self'; script-src 'self' 'unsafe-inline' https://pg.inicis.com https://*.sentry.io https://*.daumcdn.net https://t1.kakaocdn.net https://developers.kakao.com https://*.tosspayments.com https://cdn.portone.io https://*.portone.io https://*.iamport.co https://*.iamport.kr; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:${devImg}; font-src 'self' data: https://fonts.gstatic.com; media-src 'self' data: blob:; connect-src 'self'${devConnect} https://*.teamplus.com https://*.icetimes.co.kr https://*.sentry.io https://*.ingest.sentry.io https://*.kakao.com https://t1.kakaocdn.net https://*.tosspayments.com https://api.portone.io https://*.portone.io https://*.iamport.co https://*.iamport.kr https://*.inicis.com wss: ws:; frame-src 'self' https://*.tosspayments.com https://pg.inicis.com https://*.inicis.com https://*.portone.io https://*.iamport.co https://*.iamport.kr https://*.kakao.com https://*.kakaopay.com https://*.naver.com https://*.nice.co.kr https://*.passauth.co.kr https://nice.checkplus.co.kr;`,
    );
  }

  // 보호 경로는 브라우저/프록시 캐시 차단 (인증 응답 누출 방지)
  if (pathname && ALL_PROTECTED_PATHS.some((path) => matchesPath(pathname, path))) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Backend 업로드 정적 파일 프록시 (/uploads/*) ───
  // Backend(NestJS) 가 useStaticAssets 로 서빙하는 /uploads/avatar, /uploads/image,
  // /uploads/products, /uploads/venues 등을 프론트 동일 origin 으로 노출한다.
  // middleware 에서 명시적으로 rewrite(302/308 없이) 처리해 trailingSlash 설정의
  // 파일명 슬래시 덧붙임 문제를 근본 차단한다. (config rewrites 보다 안정적)
  //
  // 주의: `NextResponse.rewrite` 의 두 번째 인자(상대 URL) + 새 base URL 조합으로
  //       backend URL 을 구성. pathname 을 그대로 전달.
  if (pathname.startsWith("/uploads/")) {
    const backendBaseUrl = env.NEXT_PUBLIC_API_URL;
    const target = new URL(pathname + request.nextUrl.search, backendBaseUrl);
    return NextResponse.rewrite(target);
  }

  // ─── Deeplink Well-Known 파일 내부 rewrite ───
  // iOS Universal Links (apple-app-site-association)와 Android App Links
  // (assetlinks.json)는 `/.well-known/*` 경로에서 **리다이렉트 없이** 서빙되어야
  // 한다. Next.js app router는 `.`으로 시작하는 디렉토리를 숨김 처리하고,
  // `trailingSlash: true` 설정은 모든 경로를 trailing slash 버전으로 308
  // 리다이렉트하기 때문에 정상 경로 매칭이 불가능하다.
  //
  // Middleware는 파일 시스템 라우팅 · trailing slash 정규화보다 먼저 실행되므로
  // 여기서 직접 Route Handler로 rewrite하면 두 문제를 동시에 회피할 수 있다.
  // iOS는 리다이렉트를 허용하지 않으므로 반드시 rewrite(302/308 없이)여야 한다.
  if (pathname === "/.well-known/apple-app-site-association") {
    // trailingSlash: true 대응 — destination에 이미 slash 포함하여 재정규화 방지
    return NextResponse.rewrite(new URL("/api/deeplink/aasa/", request.url));
  }
  if (pathname === "/.well-known/assetlinks.json") {
    return NextResponse.rewrite(
      new URL("/api/deeplink/assetlinks/", request.url),
    );
  }

  // 스킵할 경로들
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/.well-known/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ─── CHILD 직접사용 기능 비활성화 (2026-06-06 · 18+ 타겟 정책) ───
  // 자녀는 비사용자(감독·코치·학부모 등 성인만 이용). 자녀 PIN 로그인·어린이 전용 화면
  // (홈/수업/QR 체크인) 라우팅을 차단한다. 코드는 보존하며, 복구 시 이 블록만 제거.
  // 학부모용 자녀 관리(/children, /child-auth)는 경로 prefix 불일치로 영향 없음.
  const DISABLED_CHILD_PATHS = [
    "/child-pin",
    "/child",
    "/child-classes",
    "/qr-checkin",
  ];
  if (DISABLED_CHILD_PATHS.some((path) => matchesPath(pathname, path))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const accessToken = request.cookies.get("teamplus_access_token")?.value;
  const refreshToken = request.cookies.get("teamplus_refresh_token")?.value;
  const { isValid, isAuthorized, role } = checkAuth(accessToken, pathname);

  // [2026-07-15 로그인 개선 ①] Native WebView(teamplusApp UA) 폴백.
  //   네이티브에서는 로그인/refresh 가 Flutter Dio 경유라 백엔드 httpOnly refresh
  //   쿠키가 WebView 에 도달하지 않아 아래 refresh 유예가 무력화되던 회귀가 있었다.
  //   앱은 WebViewCookieSync 로 쿠키를 직접 심도록 수정됐지만(정확 판정 경로),
  //   스토어 업데이트 전 구버전 앱을 위해 UA 기반으로도 유예한다 — 네이티브는
  //   Bridge refresh(secure storage 7일) 능력이 있어 클라이언트가 갱신한다.
  //
  //   ⚠️ access 쿠키 존재를 함께 요구한다(세션 흔적 조건). UA 만으로 유예하면
  //   진짜 미인증(로그아웃/최초 설치) native 딥링크·푸시가 미들웨어의
  //   /login?redirect={pathname} 을 건너뛰어 클라이언트 가드의 파라미터 없는
  //   replace('/login') 으로 흘러 "로그인 후 원래 목적지 복귀" 연속성이 깨진다.
  //   로그인했던 WebView 에는 web saveTokens 가 항상 access 쿠키를 남기므로,
  //   (만료 JWT 라도) 쿠키 존재 = 세션 흔적으로 판정해 유예 대상을 한정한다.
  const isNativeWebViewWithSession =
    (request.headers.get("user-agent") ?? "").includes("teamplusApp") &&
    Boolean(accessToken);

  // [2026-06-04] access 만료(또는 무효) 인데 refresh 가 아직 유효하면 통과 — 클라이언트
  //   선제 갱신에 위임. "활동 없으면 자동 로그아웃" 회귀(access 15분=사실상 세션) 차단.
  //   refresh 도 만료/없으면 기존대로 /login.
  const canDeferToClientRefresh =
    !isValid &&
    (isRefreshTokenFresh(refreshToken) || isNativeWebViewWithSession);

  // 1. 보호된 경로 접근 제어
  const isProtected = ALL_PROTECTED_PATHS.some((path) =>
    matchesPath(pathname, path),
  );
  if (isProtected) {
    if (!isValid) {
      // refresh 토큰이 살아있으면 로그인 강제 이동 대신 통과(클라이언트가 갱신).
      //   RBAC(isAuthorized) 는 access 가 없어 판정 불가하므로 일시 통과시키고,
      //   갱신된 access 로 다음 요청/렌더에서 검증된다(admin 미들웨어와 동일 정책).
      if (canDeferToClientRefresh) {
        return withSecurityHeaders(NextResponse.next(), pathname, request.headers.get("host"));
      }
      const loginUrl = new URL("/login", request.url);
      // 쿼리스트링 포함 보존 — 토스 successUrl(/payment/complete?paymentKey=...) 등
      // 파라미터가 본체인 경로에서 재로그인 후 복귀 시 파라미터 소실을 막는다.
      loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
    if (!isAuthorized) {
      // 권한 없는 경우 각자의 대시보드로 리다이렉트하거나 403 페이지로 이동
      const fallbackUrl = getDashboardPathByUserType(role, "/");
      return NextResponse.redirect(new URL(fallbackUrl, request.url));
    }
    // [2026-05-16] ACADEMY_DIRECTOR 가 `/director` 진입 시 전용 대시보드로 SSR 리다이렉트.
    //  이전: director/page.tsx 의 client-side useEffect 가 마운트 후 router.replace.
    //  변경: middleware 단계에서 차단 → 1프레임 깜빡임 0, SoT 일원화.
    //  주의: /director-* (director-approvals, director-coaches 등) 는 ACADEMY_DIRECTOR
    //         권한 paths 에 포함되어 있으므로 그대로 통과. 정확히 /director 만 분기.
    if (
      role === "academy_director" &&
      (pathname === "/director" || pathname === "/director/")
    ) {
      return NextResponse.redirect(new URL("/academy-director", request.url));
    }
  }

  // 2. 이미 로그인한 사용자가 로그인 페이지 접근 시 역할별 대시보드로 이동
  if (
    AUTH_PATHS.some((path) => matchesPath(pathname, path)) &&
    isValid &&
    role
  ) {
    const dashboard = getDashboardPathByUserType(role, "/");
    return NextResponse.redirect(new URL(dashboard, request.url));
  }

  // 3. 보안 헤더 + 보호경로 캐시 차단 (헬퍼 — defer-to-refresh 통과 경로와 공유)
  return withSecurityHeaders(NextResponse.next(), pathname, request.headers.get("host"));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
