import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * JWT 토큰 검증 결과
 */
interface TokenValidationResult {
  isValid: boolean;
  isExpired: boolean;
  reason?: string;
  role?: string;
}

/**
 * Admin 대시보드 접근 허용 역할 (ADM chldiv 한정)
 * - chldiv.constants.ts 백엔드 SoT 와 동기화
 */
const ADMIN_ALLOWED_ROLES = new Set([
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "SYSTEM",
  "OPER",
]);

/**
 * JWT 토큰 검증 (Edge Runtime용)
 * @param token - JWT 토큰 문자열
 * @param bufferSeconds - 만료 전 여유 시간 (초)
 * @returns 검증 결과 객체
 */
function validateToken(
  token: string,
  bufferSeconds: number = 30,
): TokenValidationResult {
  try {
    // JWT는 header.payload.signature 형식
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { isValid: false, isExpired: false, reason: "invalid_format" };
    }

    // Base64URL → Base64 변환
    const base64Payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    // Base64 디코딩 (Edge Runtime에서는 atob 사용 가능)
    const jsonPayload = decodeURIComponent(
      atob(base64Payload)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );

    const payload = JSON.parse(jsonPayload);
    const role: string | undefined =
      payload.userType ?? payload.role ?? undefined;

    // exp 클레임이 없는 토큰은 만료되지 않는 것으로 간주 (개발 환경용)
    if (!payload.exp) {
      return { isValid: true, isExpired: false, reason: "no_exp_claim", role };
    }

    // 현재 시간 (초 단위)
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTime = payload.exp - bufferSeconds;
    const isExpired = currentTime >= expirationTime;

    return {
      isValid: !isExpired,
      isExpired,
      reason: isExpired ? "token_expired" : "valid",
      role,
    };
  } catch {
    return { isValid: false, isExpired: false, reason: "parse_error" };
  }
}

/**
 * Next.js Middleware - 서버 레벨 인증 체크
 *
 * 동작 방식:
 * 1. 모든 /dashboard/* 요청에 대해 쿠키에서 토큰 확인
 * 2. 토큰이 없거나 만료되었으면 /login으로 즉시 리다이렉트
 * 3. 공개 페이지 (/, /login, /signup, /payments)는 인증 없이 접근 가능
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 공개 페이지는 인증 체크 없이 통과
  const publicPaths = ["/", "/login", "/signup", "/payments"];
  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // 정적 파일, API, _next 경로는 제외
  const isStaticOrApi =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") || // 정적 파일 (.ico, .png 등)
    pathname.startsWith("/favicon");

  if (isPublicPath || isStaticOrApi) {
    return NextResponse.next();
  }

  // /dashboard 접근 시 토큰 확인
  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get("teamplus_access_token")?.value;

    // 토큰이 없으면 로그인 페이지로 리다이렉트
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);

      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete("teamplus_access_token");
      response.cookies.delete("teamplus_refresh_token");

      return response;
    }

    // 토큰 검증
    const validation = validateToken(token);

    // 토큰 형식 오류 또는 파싱 불가 — 만료가 아닌 무효 토큰은 즉시 차단 (인증 우회 방지)
    if (!validation.isValid && !validation.isExpired) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      loginUrl.searchParams.set("reason", "invalid_token");

      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete("teamplus_access_token");
      response.cookies.delete("teamplus_refresh_token");

      return response;
    }

    // 토큰이 명확히 만료된 경우
    if (validation.isExpired) {
      // 리프레시 토큰이 있으면 통과 (클라이언트에서 갱신 처리)
      const refreshToken = request.cookies.get("teamplus_refresh_token")?.value;
      if (refreshToken) {
        return NextResponse.next();
      }

      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      loginUrl.searchParams.set("reason", "token_expired");

      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete("teamplus_access_token");
      response.cookies.delete("teamplus_refresh_token");

      return response;
    }

    // RBAC: Admin 대시보드는 ADMIN/DIRECTOR/ACADEMY_DIRECTOR/SYSTEM/OPER 만 허용
    // 다른 역할의 유효 토큰(PARENT/COACH/CHILD/TEEN 등)으로 우회 차단
    if (validation.role && !ADMIN_ALLOWED_ROLES.has(validation.role)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("reason", "insufficient_role");

      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete("teamplus_access_token");
      response.cookies.delete("teamplus_refresh_token");

      return response;
    }

    // 토큰이 유효하면 통과
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청에 대해 미들웨어 실행:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
