/**
 * Admin API Lifecycle — 전처리/후처리 훅 레지스트리
 *
 * Web 버전(`teamplus-web`)과 동일한 인터페이스를 제공하되 Admin 전용 플랫폼 식별자
 * (`admin`)를 사용한다. 관리자 전용 비즈니스 규칙(세션 타임아웃, 민감 API 감사 등)을
 * 훅으로 등록할 수 있다.
 */

export type ClientPlatform = "admin" | "web" | "unknown";

export interface LifecycleRequestContext {
  requestId: string;
  method: string;
  url: string;
  startAt: number;
  platform: ClientPlatform;
  clientVersion: string;
  meta: Record<string, unknown>;
}

export interface LifecycleResponseContext extends LifecycleRequestContext {
  status?: number;
  durationMs: number;
  serverTime?: string;
}

export interface LifecycleErrorContext extends LifecycleResponseContext {
  error: unknown;
  message?: string;
  code?: string;
}

export interface LifecycleHooks {
  beforeRequest?: (ctx: LifecycleRequestContext) => void | Promise<void>;
  afterResponse?: (ctx: LifecycleResponseContext) => void | Promise<void>;
  onError?: (ctx: LifecycleErrorContext) => void | Promise<void>;
}

type HookBundle = Required<LifecycleHooks>;

const NOOP = () => {
  /* noop */
};

class AdminApiLifecycleRegistry {
  private hooks: Array<HookBundle> = [];
  private clientVersion: string = "admin-unknown";

  setClientVersion(version: string): void {
    this.clientVersion = version || "admin-unknown";
  }

  getClientVersion(): string {
    return this.clientVersion;
  }

  getPlatform(): ClientPlatform {
    return "admin";
  }

  subscribe(hooks: LifecycleHooks): () => void {
    const bundle: HookBundle = {
      beforeRequest: hooks.beforeRequest ?? NOOP,
      afterResponse: hooks.afterResponse ?? NOOP,
      onError: hooks.onError ?? NOOP,
    };
    this.hooks.push(bundle);
    return () => {
      this.hooks = this.hooks.filter((h) => h !== bundle);
    };
  }

  async runBeforeRequest(ctx: LifecycleRequestContext): Promise<void> {
    await Promise.allSettled(
      this.hooks.map((h) => Promise.resolve().then(() => h.beforeRequest(ctx))),
    );
  }

  async runAfterResponse(ctx: LifecycleResponseContext): Promise<void> {
    await Promise.allSettled(
      this.hooks.map((h) => Promise.resolve().then(() => h.afterResponse(ctx))),
    );
  }

  async runOnError(ctx: LifecycleErrorContext): Promise<void> {
    await Promise.allSettled(
      this.hooks.map((h) => Promise.resolve().then(() => h.onError(ctx))),
    );
  }

  reset(): void {
    this.hooks = [];
  }
}

export const apiLifecycle = new AdminApiLifecycleRegistry();

/**
 * 로그인 전 호출 허용 경로 (Admin 화이트리스트)
 * Admin은 보통 관리자 로그인만 지원하므로 로그인·패스워드 리셋 계열만 포함.
 */
export const PUBLIC_API_PATTERNS: readonly RegExp[] = [
  /(^|\/)auth\/login(\/|\?|$)/,
  // Admin 전용 chldiv=ADM 로그인 (2026-04-20 신규) — AuthGuardInterceptor 바이패스 필수
  /(^|\/)auth\/admin\/login(\/|\?|$)/,
  /(^|\/)auth\/register(\/|\?|$)/,
  /(^|\/)auth\/refresh(\/|\?|$)/,
  /(^|\/)auth\/find-id(\/|\?|$)/,
  /(^|\/)auth\/password(\/|\?|$)/,
  /(^|\/)auth\/check-email(\/|\?|$)/,
  /(^|\/)auth\/check-phone(\/|\?|$)/,
  /(^|\/)auth\/social(\/|\?|$)/,
  /(^|\/)sms\/(send|verify|resend-status)(\/|\?|$)/,
  /(^|\/)app\/settings(\/|\?|$)/,
  /(^|\/)app\/banners(\/|\?|$)/,
  /(^|\/)app\/versions\/latest(\/|\?|$)/,
  /(^|\/)app\/premium-events\/featured(\/|\?|$)/,
  /(^|\/)health(\/|\?|$)/,
  /(^|\/)metrics(\/|\?|$)/,
];

export function isPublicApiPath(url: string): boolean {
  if (!url) return false;
  return PUBLIC_API_PATTERNS.some((re) => re.test(url));
}

export const AUTH_REQUIRED_CODE = "AUTH_REQUIRED";

export class AuthRequiredError extends Error {
  readonly code: string = AUTH_REQUIRED_CODE;
  readonly statusCode: number = 401;
  readonly url: string;
  readonly requestId?: string;

  constructor(url: string, requestId?: string) {
    super("로그인이 필요합니다.");
    this.name = "AuthRequiredError";
    this.url = url;
    this.requestId = requestId;
  }
}

export function generateRequestId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const r = new Array(16);
  for (let i = 0; i < 16; i += 1) r[i] = Math.floor(Math.random() * 256);
  r[6] = (r[6] & 0x0f) | 0x40;
  r[8] = (r[8] & 0x3f) | 0x80;
  const hex = r.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 기본 훅 등록 — 앱 부팅 시 1회 호출.
 * Admin 전용 규칙:
 *  - 모든 요청 로깅 (개발 환경)
 *  - 401 발생 시 `teamplus-admin:api-unauthorized` 커스텀 이벤트 dispatch
 *  - 느린 요청(3초 초과) 경고
 */
let registered = false;
export function registerDefaultAdminLifecycleHooks(): void {
  if (registered) return;
  registered = true;

  apiLifecycle.subscribe({
    beforeRequest: (ctx) => {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[Admin API] → ${ctx.method} ${ctx.url} [${ctx.requestId.slice(0, 8)}]`,
        );
      }
    },
    afterResponse: (ctx) => {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[Admin API] ← ${ctx.method} ${ctx.url} ${ctx.status ?? "-"} in ${ctx.durationMs}ms [${ctx.requestId.slice(0, 8)}]`,
        );
      }
      // 🎯 1초 SLA 모니터링
      if (ctx.durationMs > 3000) {
        console.error(
          `[Admin API SLA_CRITICAL] ${ctx.method} ${ctx.url} took ${ctx.durationMs}ms (>3s)`,
        );
      } else if (ctx.durationMs > 1000) {
        console.warn(
          `[Admin API SLA_BREACH] ${ctx.method} ${ctx.url} took ${ctx.durationMs}ms (>1s target)`,
        );
      }
    },
    onError: (ctx) => {
      if (process.env.NODE_ENV === "development") {
        console.error(
          `[Admin API] ✗ ${ctx.method} ${ctx.url} ${ctx.status ?? "-"} ${ctx.code ?? ""} ${ctx.message ?? ""}`,
        );
      }
      if (typeof window === "undefined") return;
      const isUnauthorized =
        ctx.status === 401 || ctx.code === AUTH_REQUIRED_CODE;
      if (!isUnauthorized) return;

      window.dispatchEvent(
        new CustomEvent("teamplus-admin:api-unauthorized", {
          detail: {
            requestId: ctx.requestId,
            url: ctx.url,
            code: ctx.code ?? "HTTP_401",
            reason: ctx.code === AUTH_REQUIRED_CODE ? "required" : "expired",
            message:
              ctx.code === AUTH_REQUIRED_CODE
                ? "로그인이 필요합니다."
                : "로그인이 만료되었습니다. 다시 로그인해주세요.",
          },
        }),
      );

      // 로그인 페이지 자동 유도 — 1회만
      if (isAdminRedirectingToLogin) return;
      const { pathname, search } = window.location;
      if (pathname.startsWith("/login")) return;

      isAdminRedirectingToLogin = true;
      const redirect = encodeURIComponent(`${pathname}${search}`);
      const reason = ctx.code === AUTH_REQUIRED_CODE ? "required" : "expired";
      setTimeout(() => {
        window.location.href = `/login?redirect=${redirect}&reason=${reason}`;
      }, 0);
    },
  });
}

let isAdminRedirectingToLogin = false;
export function resetAdminAuthGuardRedirectFlag(): void {
  isAdminRedirectingToLogin = false;
}
