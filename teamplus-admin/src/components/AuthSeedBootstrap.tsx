"use client";

/**
 * AuthSeedBootstrap (admin) — dev 전용 외부 토큰 주입 훅
 *
 * tbot(localhost:7788)에서 admin(localhost:5002) iframe을 띄울 때,
 * URL 쿼리(`?__auth_seed=<access>&__auth_refresh=<refresh>`)로 전달된 토큰을
 * localStorage + Cookie(middleware용)에 주입하고 URL에서 제거한다.
 *
 * 관련 상수: `src/services/api-client.ts` TOKEN_KEYS.ACCESS_TOKEN/REFRESH_TOKEN.
 * 프로덕션 빌드에서는 no-op (XSS 벡터 방지).
 */

import { useEffect } from "react";

const ACCESS_KEY = "teamplus_access_token";
const REFRESH_KEY = "teamplus_refresh_token";

export default function AuthSeedBootstrap() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;

    try {
      const url = new URL(window.location.href);
      const access = url.searchParams.get("__auth_seed");
      if (!access) return;

      const refresh = url.searchParams.get("__auth_refresh");
      localStorage.setItem(ACCESS_KEY, access);
      if (refresh) localStorage.setItem(REFRESH_KEY, refresh);

      document.cookie = `${ACCESS_KEY}=${access}; path=/; max-age=900; SameSite=Lax`;
      if (refresh) {
        document.cookie = `${REFRESH_KEY}=${refresh}; path=/; max-age=604800; SameSite=Lax`;
      }

      // 2026-04-21 v3: redirect 쿼리 선제 이동 (login 페이지 체류 방지)
      const redirect = url.searchParams.get("redirect");
      url.searchParams.delete("__auth_seed");
      url.searchParams.delete("__auth_refresh");
      url.searchParams.delete("redirect");

      if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
        window.location.replace(redirect);
      } else {
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      // silent
    }
  }, []);

  return null;
}
