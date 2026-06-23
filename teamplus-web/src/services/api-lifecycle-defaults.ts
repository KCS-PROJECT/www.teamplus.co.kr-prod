/**
 * API Lifecycle — 기본 훅 등록
 *
 * 앱 부팅 시 ClientProviders 등에서 `registerDefaultLifecycleHooks()`를 한 번 호출.
 * - slow 요청 경고 (개발 환경 3초 초과)
 * - 401 자동 로그아웃 이벤트 유도
 * - 요청 ID · 소요 시간 개발 로그
 */

import { apiLifecycle, AUTH_REQUIRED_CODE } from "./api-lifecycle";
import { devLog, devError, devWarn } from "@/lib/logger";
import { MESSAGES } from "@/lib/messages";

let registered = false;

/** 로그인 유도 리다이렉트 연속 발사 방지 플래그 */
let isRedirectingToLogin = false;

export function resetAuthGuardRedirectFlag(): void {
  isRedirectingToLogin = false;
}

export function registerDefaultLifecycleHooks(): void {
  if (registered) return;
  registered = true;

  apiLifecycle.subscribe({
    beforeRequest: (ctx) => {
      if (process.env.NODE_ENV !== "production") {
        devLog(
          `[API] → ${ctx.method} ${ctx.url} [${ctx.requestId.slice(0, 8)}]`,
        );
      }
    },
    afterResponse: (ctx) => {
      if (process.env.NODE_ENV !== "production") {
        devLog(
          `[API] ← ${ctx.method} ${ctx.url} ${ctx.status ?? "-"} in ${ctx.durationMs}ms [${ctx.requestId.slice(0, 8)}]`,
        );
      }
      // 🎯 1초 SLA — 1000ms 초과 시 WARN, 3000ms 초과 시 ERROR
      // 프로덕션에서도 Sentry 로 전송 가능하도록 조건 없이 경고
      if (ctx.durationMs > 3000) {
        devError(
          `[API SLA_CRITICAL] ${ctx.method} ${ctx.url} took ${ctx.durationMs}ms (>3s)`,
        );
      } else if (ctx.durationMs > 1000) {
        devWarn(
          `[API SLA_BREACH] ${ctx.method} ${ctx.url} took ${ctx.durationMs}ms (>1s target)`,
        );
      }
      // [2026-05-14] Sentry SLA 보고 — NEXT_PUBLIC_SENTRY_DSN 활성 시에만 동작.
      //   dynamic import 로 번들 무게 절감 + SSR 안전 (Sentry SDK 가 init 되어 있어야 함).
      if (ctx.durationMs > 1000 && typeof window !== "undefined") {
        void import("@sentry/nextjs")
          .then((Sentry) => {
            Sentry.withScope((scope) => {
              scope.setTag("type", "SLA_VIOLATION");
              scope.setTag("method", ctx.method);
              scope.setExtra("requestId", ctx.requestId);
              scope.setExtra("durationMs", ctx.durationMs);
              scope.setExtra("url", ctx.url);
              Sentry.captureMessage(
                `[API SLA_VIOLATION] ${ctx.method} ${ctx.url} took ${ctx.durationMs}ms`,
                ctx.durationMs > 3000 ? "error" : "warning",
              );
            });
          })
          .catch(() => {
            /* Sentry SDK 미초기화 / 일시 오류는 무시 */
          });
      }
    },
    onError: (ctx) => {
      if (process.env.NODE_ENV !== "production") {
        // AUTH_GUARD(사전 차단) · 4xx 클라이언트 예측 가능 에러(404/409/400 등)는 warning,
        // 5xx/네트워크 실패만 error 레벨로 구분 — Next.js dev overlay 오염 방지.
        // v8.7 (2026-05-23) — 일시 Network Error (axios ERR_NETWORK / status undefined)
        //   도 warning 으로 강등. 백엔드 nodemon hot-reload 중 connection refused
        //   가 dev overlay 빨간 에러로 떠 작업 흐름을 방해하는 회귀 차단. 진짜 5xx
        //   응답은 status 가 채워져 있으므로 정상적으로 error 레벨 유지.
        const isNetworkError =
          ctx.status === undefined &&
          (ctx.code === "ERR_NETWORK" ||
            ctx.code === "ECONNREFUSED" ||
            ctx.code === "ECONNABORTED" ||
            ctx.message === "Network Error");
        const isClientExpected =
          ctx.method === "AUTH_GUARD" ||
          isNetworkError ||
          (typeof ctx.status === "number" &&
            ctx.status >= 400 &&
            ctx.status < 500);
        const logFn = isClientExpected ? devWarn : devError;
        logFn(
          `[API] ✗ ${ctx.method} ${ctx.url} ${ctx.status ?? "-"} ${ctx.code ?? ""} ${ctx.message ?? ""} [${ctx.requestId.slice(0, 8)}]`,
        );
      }

      if (typeof window === "undefined") return;

      const isUnauthorized =
        ctx.status === 401 || ctx.code === AUTH_REQUIRED_CODE;
      if (!isUnauthorized) return;

      // 글로벌 이벤트 — AuthContext·토스트 시스템이 구독
      window.dispatchEvent(
        new CustomEvent("teamplus:api-unauthorized", {
          detail: {
            requestId: ctx.requestId,
            url: ctx.url,
            code: ctx.code ?? "HTTP_401",
            reason: ctx.code === AUTH_REQUIRED_CODE ? "required" : "expired",
            message:
              ctx.code === AUTH_REQUIRED_CODE
                ? MESSAGES.authGuard.required
                : MESSAGES.authGuard.expired,
          },
        }),
      );

      // 로그인 페이지 자동 유도 — 1회만 + 이미 /login 경로는 건너뛰기
      const { pathname, search } = window.location;
      const reason = ctx.code === AUTH_REQUIRED_CODE ? "required" : "expired";

      // 세션 만료(expired)는 SessionExpiredGate 의 자동 로그아웃 안내 모달이
      // '재로그인' 버튼으로 이동을 유도하므로 여기서 자동 리다이렉트하지 않는다.
      // (required = 미인증 접근은 아래 기존 자동 유도 로직이 처리)
      if (reason === "expired") return;

      if (isRedirectingToLogin) return;
      if (pathname.startsWith("/login")) return;
      // 공개 진입점(splash, onboarding, signup, identity callback 등)에서
      // 발생한 배경 호출은 리다이렉트 지양. 회원가입 도중 백그라운드 API
      // (/venues, /app/terms 등) 가 401 받았다고 /login 으로 보내면 사용자가
      // 입력하던 폼이 통째로 날아간다.
      if (
        pathname === "/" ||
        pathname.startsWith("/splash") ||
        pathname.startsWith("/onboarding") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/identity")
      ) {
        return;
      }

      isRedirectingToLogin = true;
      const redirect = encodeURIComponent(`${pathname}${search}`);
      // requestAnimationFrame으로 최종 에러 훅 모두 실행 후 이동
      const target = `/login?redirect=${redirect}&reason=${reason}`;
      setTimeout(() => {
        window.location.href = target;
      }, 0);
    },
  });
}
