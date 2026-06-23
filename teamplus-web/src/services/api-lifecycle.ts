/**
 * API Lifecycle — 전처리/후처리 훅 레지스트리
 *
 * 로그인 후 호출되는 모든 API 요청에 대해
 * `beforeRequest` (pre-processing) 과 `afterResponse` / `onError` (post-processing)
 * 훅을 등록·실행한다.
 *
 * 사용 예:
 *   import { apiLifecycle } from '@/services/api-lifecycle';
 *   const un = apiLifecycle.subscribe({
 *     afterResponse: (ctx) => { if (ctx.durationMs > 3000) devWarn(...) },
 *   });
 *   // 해제: un();
 */

import { isNativeApp } from '@/lib/environment';

export type ClientPlatform = 'web' | 'ios' | 'android' | 'flutter' | 'unknown';

export interface LifecycleRequestContext {
  /** X-Request-ID */
  requestId: string;
  /** 호출 메서드 */
  method: string;
  /** URL path (baseURL 포함 가능) */
  url: string;
  /** 요청 시작 시각 (performance.now()) */
  startAt: number;
  /** 클라이언트 플랫폼 */
  platform: ClientPlatform;
  /** 클라이언트 버전 */
  clientVersion: string;
  /** 추가 메타 (훅 간 공유용) */
  meta: Record<string, unknown>;
}

export interface LifecycleResponseContext extends LifecycleRequestContext {
  /** 응답 HTTP 상태 (Native Bridge 등에서 없을 수도 있음) */
  status?: number;
  /** 응답 소요 시간 (ms) */
  durationMs: number;
  /** 서버가 돌려준 X-Server-Time (있을 때만) */
  serverTime?: string;
}

export interface LifecycleErrorContext extends LifecycleResponseContext {
  /** 원본 에러 객체 */
  error: unknown;
  /** 표준화된 메시지 (가능한 경우) */
  message?: string;
  /** 에러 코드 (가능한 경우) */
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

class ApiLifecycleRegistry {
  private hooks: Array<HookBundle> = [];
  private clientVersion: string = 'unknown';

  /** 클라이언트 버전 주입 (앱 부팅 시 1회) */
  setClientVersion(version: string): void {
    this.clientVersion = version || 'unknown';
  }

  getClientVersion(): string {
    return this.clientVersion;
  }

  getPlatform(): ClientPlatform {
    if (typeof window === 'undefined') return 'unknown';
    if (isNativeApp()) return 'flutter';
    return 'web';
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

  /** 요청 수행 전 전처리 — 등록된 모든 beforeRequest 실행 (동기 완료 대기) */
  async runBeforeRequest(ctx: LifecycleRequestContext): Promise<void> {
    await Promise.allSettled(
      this.hooks.map((h) => Promise.resolve().then(() => h.beforeRequest(ctx))),
    );
  }

  /** 성공 응답 후처리 */
  async runAfterResponse(ctx: LifecycleResponseContext): Promise<void> {
    await Promise.allSettled(
      this.hooks.map((h) => Promise.resolve().then(() => h.afterResponse(ctx))),
    );
  }

  /** 에러 응답 후처리 */
  async runOnError(ctx: LifecycleErrorContext): Promise<void> {
    await Promise.allSettled(
      this.hooks.map((h) => Promise.resolve().then(() => h.onError(ctx))),
    );
  }

  /** 디버그/테스트용 — 훅 초기화 */
  reset(): void {
    this.hooks = [];
  }
}

export const apiLifecycle = new ApiLifecycleRegistry();

/**
 * UUID v4 생성 — 브라우저/Node 공용 (crypto.randomUUID fallback 포함)
 */
export function generateRequestId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  // RFC4122 v4 fallback
  const r = new Array(16);
  for (let i = 0; i < 16; i += 1) r[i] = Math.floor(Math.random() * 256);
  r[6] = (r[6] & 0x0f) | 0x40;
  r[8] = (r[8] & 0x3f) | 0x80;
  const hex = r.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 활동 추적에서 제외할 경로 (Backend와 동일)
 */
export const LIFECYCLE_EXCLUDE_PATHS: readonly string[] = [
  '/auth/refresh',
  '/auth/login',
  '/health',
  '/metrics',
];

export function isExcludedFromLifecycle(url: string): boolean {
  return LIFECYCLE_EXCLUDE_PATHS.some((p) => url.includes(p));
}

/**
 * 로그인 전 호출 허용 경로 (화이트리스트)
 *
 * Backend `@Public()` 데코레이터가 적용된 엔드포인트 + 정책상 인증 없이 허용되는 경로.
 * 서버의 `@Public()` 선언이 변경되면 이 목록도 갱신해야 한다.
 *
 * 현재 매핑 (2026-04-19 기준 `@Public()` 전수 조사):
 * - auth/*          : 로그인·회원가입·토큰 갱신·비밀번호·소셜·중복 확인
 * - child-auth/*    : 아동 전용 인증 플로우
 * - identity/*      : 본인인증 콜백·결과 조회·익명 시작 (callback/:provider, result/:requestId, initiate-anonymous)
 * - sms/*           : OTP 발송·검증
 * - app/settings    : 앱 유지보수 모드·버전 정보 (AppSettingsContext 최초 로드)
 * - app/banners     : 배너 조회 (스플래시 직후)
 * - app/premium-events/featured : 메인 피처 이벤트
 * - main-popups     : 메인 팝업 배너
 * - academies/public/* : 오픈클래스 공개 상세
 * - venues/my-bookings / venues/:id/bookings : 링크 예약 (@Public 선언됨)
 * - health/metrics/api/docs : 헬스체크·문서
 */
export const PUBLIC_API_PATTERNS: readonly RegExp[] = [
  /(^|\/)auth\/login(\/|\?|$)/,
  /(^|\/)auth\/register(\/|\?|$)/,
  /(^|\/)auth\/refresh(\/|\?|$)/,
  /(^|\/)auth\/signup(\/|\?|$)/,
  /(^|\/)auth\/find-id(\/|\?|$)/,
  // [추가 2026-06-17] 본인인증 기반 아이디 찾기/비밀번호 재설정 — 비로그인(JWT 없음) 호출.
  //   find-id 패턴은 `find-id-by-identity` 를 매칭하지 못하므로(뒤에 `-`) 별도 등록 필수.
  //   누락 시 본인인증 직후 조회 호출이 AUTH_REQUIRED → /login 강제 이동.
  /(^|\/)auth\/find-id-by-identity(\/|\?|$)/,
  /(^|\/)auth\/find-account(\/|\?|$)/,
  /(^|\/)auth\/password(\/|\?|$)/,
  /(^|\/)auth\/social(\/|\?|$)/,
  /(^|\/)auth\/check-email(\/|\?|$)/,
  /(^|\/)auth\/check-phone(\/|\?|$)/,
  // [추가 2026-05-12] 회원가입 이메일 인증 (사전 인증 토큰 없이 호출).
  /(^|\/)auth\/email\/send-code(\/|\?|$)/,
  /(^|\/)auth\/email\/verify-code(\/|\?|$)/,
  /(^|\/)child-auth\//,
  // [추가 2026-05-26] /identity/initiate-anonymous 는 회원가입 전(JWT 없음) 호출이므로 화이트리스트.
  /(^|\/)identity\/(callback|result|initiate-anonymous)(\/|\?|$)/,
  /(^|\/)sms\/(send|verify|resend-status)(\/|\?|$)/,
  /(^|\/)app\/settings(\/|\?|$)/,
  /(^|\/)app\/banners(\/|\?|$)/,
  // [추가 2026-06-14] 약관·개인정보처리방침 조회 — GET /app/terms 는 백엔드 @Public.
  //   /terms 페이지(=(public) 그룹, 비로그인 접근 가능)가 호출하므로 화이트리스트 필수.
  //   누락 시 토큰 없는 사용자가 /terms 진입 → 클라이언트 AUTH_REQUIRED → /login 강제 이동
  //   (= 외부 공개 개인정보처리방침 URL 로 쓸 수 없게 됨 · Play Console/App Store 리젝 사유).
  /(^|\/)app\/terms(\/|\?|$)/,
  // [추가 2026-06-14] FAQ 조회 — GET /app/faqs 도 백엔드 @Public · (public)/faq 페이지가
  //   비로그인 호출하므로 동일 사유로 화이트리스트 필요(누락 시 /faq 도 /login 튕김).
  /(^|\/)app\/faqs(\/|\?|$)/,
  /(^|\/)app\/versions\/latest(\/|\?|$)/,
  /(^|\/)app\/premium-events\/featured(\/|\?|$)/,
  /(^|\/)main-popups(\/|\?|$)/,
  /(^|\/)academies\/public(\/|\?|$)/,
  // 회원가입 화면 팀 선택 목록 (비로그인 호출).
  /(^|\/)teams\/public(\/|\?|$)/,
  // [추가 2026-05-22] 링크장 조회 — GET /venues 목록·상세는 @Public.
  //   회원가입(감독 훈련장소 선택) 등 비로그인 화면에서 호출되므로 화이트리스트 필수.
  /(^|\/)venues(\/|\?|$)/,
  /(^|\/)health(\/|\?|$)/,
  /(^|\/)metrics(\/|\?|$)/,
  /(^|\/)api\/docs(\/|\?|$)/,
];

export function isPublicApiPath(url: string): boolean {
  if (!url) return false;
  return PUBLIC_API_PATTERNS.some((re) => re.test(url));
}

/** 표준 에러 코드 */
export const AUTH_REQUIRED_CODE = 'AUTH_REQUIRED';

/** 로그인 필요 에러 — 클라이언트 전처리 단계에서 throw */
export class AuthRequiredError extends Error {
  readonly code: string = AUTH_REQUIRED_CODE;
  readonly statusCode: number = 401;
  readonly url: string;
  readonly requestId?: string;

  constructor(url: string, requestId?: string) {
    super('로그인이 필요합니다.');
    this.name = 'AuthRequiredError';
    this.url = url;
    this.requestId = requestId;
  }
}
