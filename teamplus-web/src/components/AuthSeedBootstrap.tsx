"use client";

/**
 * AuthSeedBootstrap — dev 전용 외부 토큰 주입 훅
 *
 * tbot 대시보드(localhost:7788)가 역할별 폰 미리보기를 iframe으로 띄울 때,
 * 각 역할의 로그인 토큰을 URL 쿼리(`?__auth_seed=<token>&__auth_refresh=<refresh>`)
 * 로 전달하면 이 컴포넌트가 localStorage + Cookie에 주입한 뒤 쿼리를 즉시 제거한다.
 *
 * 보안:
 *  - `process.env.NODE_ENV === 'production'` 가드로 프로덕션 빌드에서 no-op.
 *  - `history.replaceState`로 URL에서 토큰 파라미터 제거 → 서버 로그 유출 최소화.
 *
 * 위치: RootLayout `<body>` 최상단에서 마운트하여, 이후 모든 fetch가 토큰을 읽을 수 있게 함.
 */

import { useEffect } from "react";
import { isInternalRedirectPath } from "@/lib/auth-routing";

// ⚠️ web 실제 사용 키는 teamplus_auth_token (web-token-storage.ts:21).
//    teamplus_access_token 은 Cookie 및 admin 전용. 혼동으로 인해 2026-04-21 수정.
const TOKEN_KEY = "teamplus_auth_token";
const REFRESH_TOKEN_KEY = "teamplus_refresh_token";
// Cookie 는 middleware.ts 가 기대하는 이름 그대로 유지
const COOKIE_ACCESS_KEY = "teamplus_access_token";
const COOKIE_REFRESH_KEY = "teamplus_refresh_token";

export default function AuthSeedBootstrap() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;

    try {
      const url = new URL(window.location.href);
      const access = url.searchParams.get("__auth_seed");
      if (!access) return;

      const refresh = url.searchParams.get("__auth_refresh");
      localStorage.setItem(TOKEN_KEY, access);
      if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);

      // httpOnly 쿠키는 아니지만 서버 미들웨어(middleware.ts) 가 쿠키로 JWT 검증 → 동기화 필요
      // 쿠키 이름은 teamplus_access_token 으로 고정 (middleware 와 계약)
      document.cookie = `${COOKIE_ACCESS_KEY}=${access}; path=/; max-age=900; SameSite=Lax`;
      if (refresh) {
        document.cookie = `${COOKIE_REFRESH_KEY}=${refresh}; path=/; max-age=604800; SameSite=Lax`;
      }

      // 2026-04-21 v3: redirect 쿼리가 있으면 저장 직후 즉시 이동.
      // 이유: login/page.tsx useEffect 가 redirect 쿼리 감지 시 "미들웨어 인증 실패"로
      //       판단하여 로그인 폼을 유지하므로, seed 주입된 경우엔 여기서 선제 이동 필요.
      const redirect = url.searchParams.get("redirect");
      url.searchParams.delete("__auth_seed");
      url.searchParams.delete("__auth_refresh");
      url.searchParams.delete("redirect");

      if (isInternalRedirectPath(redirect)) {
        // seed 토큰 저장 완료 → 대상 홈으로 즉시 이동 (replace: 뒤로가기 로그인 페이지 미노출)
        // 오픈 리다이렉트 방지: 내부 경로만 허용 (safeRedirectTarget 계열 단일 검증).
        window.location.replace(redirect);
      } else {
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      // silent — 주입 실패해도 페이지 렌더를 막지 않음
    }
  }, []);

  return null;
}
