/**
 * 환경 변수 단일 출처 (SoT · Single Source of Truth)
 *
 * teamplus-web/src/lib/env.ts 와 동일 패턴으로 구축.
 * 모든 포트·URL 의 fallback 이 여기서 결정된다.
 * 포트 변경 시 `PORTS` 상수만 수정하면 전체 소비처 동기화됨.
 *
 * ⚠️ Next.js 환경변수 인라인 규칙:
 *    NEXT_PUBLIC_* 는 반드시 정적 접근(process.env.NAME) 으로 참조해야
 *    빌드 시점에 클라이언트 번들로 치환된다. process.env[key] 같은 동적 접근은
 *    클라이언트에서 undefined 가 되어 fallback 만 사용되므로 장애를 유발한다.
 *
 * ─── Admin 특화 이슈 ─────────────────────────────
 * Admin 의 `.env.local` 은 `NEXT_PUBLIC_API_URL=http://.../api/v1` 처럼
 * `/api/v1` suffix 를 **포함**해서 설정한다.
 * 그러나 코드 내 소비처는 두 종류다:
 *   1) api-client.ts — baseURL 에 그대로 사용 (`/api/v1` 포함 필요)
 *   2) upload.service / tms 페이지 — `${origin}/api/v1/files/...` 수동 조립
 *      (즉 `/api/v1` suffix 가 없는 origin 만 필요)
 * env.ts 는 양쪽 모두를 제공해서 소비처가 혼란 없이 사용하도록 한다.
 *
 * @example
 * import { env, PORTS } from '@/lib/env';
 * axios.create({ baseURL: env.NEXT_PUBLIC_API_URL });      // api-client
 * fetch(`${env.API_ORIGIN}/api/v1/files/upload`, ...);      // upload
 */

/**
 * 프로젝트 포트 상수 (SoT).
 * teamplus-web 과 동일 값 유지 필수.
 */
export const PORTS = {
  backend: 5003,
  web: 5001,
  admin: 5002,
} as const;

/** Backend API URL fallback — Admin 컨벤션상 `/api/v1` suffix 포함 */
const DEFAULT_API_URL = `http://localhost:${PORTS.backend}/api/v1`;

/**
 * Next.js 빌드 시점 인라인을 위해 **정적 접근**으로 환경변수 읽기.
 * `process.env.NEXT_PUBLIC_API_URL` 는 빌드 시 실제 값(또는 undefined)으로 치환된다.
 * undefined 일 때만 fallback 사용.
 */
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;

/** `/api/v1` suffix 를 포함하는 형태 (api-client baseURL 용) */
const API_WITH_V1 = /\/api\/v1\/?$/.test(RAW_API_URL)
  ? RAW_API_URL.replace(/\/$/, "")
  : `${RAW_API_URL.replace(/\/$/, "")}/api/v1`;

/** `/api/v1` suffix 없는 origin (수동 path 조립 · preconnect 용) */
const API_ORIGIN = RAW_API_URL.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");

/**
 * 공개 환경 변수 (클라이언트에서 접근 가능).
 */
export const env = {
  /** Backend API URL — `/api/v1` suffix 포함 (api-client 용) */
  NEXT_PUBLIC_API_URL: API_WITH_V1,

  /** Backend Origin — `/api/v1` 없음 (수동 path 조립 용) */
  API_ORIGIN,

  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
} as const;
