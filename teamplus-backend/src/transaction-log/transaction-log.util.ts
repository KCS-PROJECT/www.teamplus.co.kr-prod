/**
 * 거래로그 순수 유틸 (2026-06-08)
 *
 * - decideResult : 성공/실패 판정 단일 진입점 (SUCCESS/FAIL/ERROR) — 정책상 "한 곳"에만 둔다.
 * - maskSensitive : 민감 키 [REDACTED] 마스킹 (내용은 남기고 비밀값만 가림). Date/Buffer 보존.
 * - preparePayload : 10KB 초과 payload 구조보존 truncate (기존 truncateForLog 재사용).
 * - toPathname : 쿼리스트링 분리.
 *
 * 모두 순수 함수 → 단위 테스트 용이. 마스킹·판정 로직 분산 금지(여기로 집중).
 */

import { truncateForLog } from "../common/utils/truncate-for-log.util";
import { DecideResultOutput } from "./transaction-log.types";

/**
 * 마스킹 대상 — 부분일치(substring) 패턴.
 * 정책 7필드(authorization,cookie,set-cookie,password,token,accessToken,refreshToken)
 *  + CLAUDE.md 백엔드 마스킹 표준(secret,cardNumber,cvv) + PIPA 고유식별 PII.
 * 오탐 낮은 긴 키만 부분일치로 둔다.
 */
const SENSITIVE_SUBSTRING: readonly string[] = [
  "authorization", // authorization
  "cookie", // cookie, set-cookie
  "password", // password, passwordHash
  "token", // token, accessToken, refreshToken, authToken
  "secret", // *secret, secretKey, cryptoSecretKey
  "creditcard", // creditCard
  "cardnumber", // cardNumber
  "socialnumber", // socialNumber
  "residentnumber", // 주민등록번호 (residentNumber)
  "privatekey",
  "apikey", // x-api-key, apiKey
  "encdata", // NICE 본인인증 암호화 페이로드(이미 암호화이나 이중 안전)
  "birthdate", // birthDate, birth_date — PIPA 보호
];

/**
 * 마스킹 대상 — 정확일치(===) 키.
 * 짧아서 부분일치 시 오탐(city/audit/media/ascii/decimal 등) 위험이 큰 고유식별 PII.
 * CLAUDE.md 백엔드 표준 ci/di + 주민번호/전화/생년월일.
 */
const SENSITIVE_EXACT: ReadonlySet<string> = new Set([
  "ci", // 연계정보 (본인인증)
  "di", // 중복가입확인정보
  "ssn",
  "rrn", // resident registration number
  "cvv",
  "cvc",
  "phone",
  "mobile",
  "phonenumber",
  "birth",
  "birthday",
  // 자녀 인증 자격증명 — 짧은 키라 정확일치로 둠(city/option 등 substring 오탐 회피)
  "pin",
  "otp",
]);

/** payload 1건당 최대 바이트 — 초과 시 truncate (정책 10KB) */
export const TX_MAX_PAYLOAD_BYTES = 10 * 1024;

/** errorMessage 최대 길이 (DB Text 컬럼 폭주 방지) */
const MAX_ERROR_MESSAGE_LEN = 2000;

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  // 하이픈/언더스코어 정규화 — 헤더 키(x-api-key)와 camelCase(apiKey)를 모두 매칭.
  const normalized = k.replace(/[-_]/g, "");
  if (SENSITIVE_EXACT.has(k) || SENSITIVE_EXACT.has(normalized)) return true;
  return SENSITIVE_SUBSTRING.some((p) => normalized.includes(p));
}

/**
 * 민감값 마스킹 — 키 이름이 민감 패턴이면 값을 [REDACTED] 로 치환.
 * Date/Buffer 는 spread/순회 시 `{}` 로 깨지므로 원형(또는 요약)으로 보존.
 */
export function maskSensitive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}B]`;
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v));
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? "[REDACTED]" : maskSensitive(v);
  }
  return out;
}

export interface PreparedPayload {
  /** Prisma Json 컬럼에 넣을 값 (없으면 undefined → NULL) */
  value: unknown;
  /** 10KB 초과로 잘렸는지 */
  truncated: boolean;
}

/**
 * 마스킹된 값을 받아 직렬화 크기를 재고, 10KB 초과 시 구조보존 truncate.
 * 직렬화 불가(순환참조/BigInt 등)는 플래그 객체로 대체.
 */
export function preparePayload(masked: unknown): PreparedPayload {
  if (masked === null || masked === undefined) {
    return { value: undefined, truncated: false };
  }
  // 빈 객체/빈 배열은 그대로 (의미 있는 "비어있음" 표시)
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(masked);
  } catch {
    return { value: { __unserializable: true }, truncated: true };
  }
  if (serialized === undefined) return { value: undefined, truncated: false };

  if (serialized.length > TX_MAX_PAYLOAD_BYTES) {
    return {
      value: {
        __truncated: true,
        size: serialized.length,
        body: truncateForLog(masked),
      },
      truncated: true,
    };
  }
  return { value: masked, truncated: false };
}

function clampMessage(msg: unknown): string | null {
  if (msg === null || msg === undefined) return null;
  let s: string;
  try {
    s = typeof msg === "string" ? msg : JSON.stringify(msg);
  } catch {
    s = String(msg);
  }
  if (!s) return null;
  return s.length > MAX_ERROR_MESSAGE_LEN
    ? `${s.slice(0, MAX_ERROR_MESSAGE_LEN)}…`
    : s;
}

/**
 * errorCode/errorMessage 추출 — 응답 body 와 예외 객체(NestJS HttpException) 양쪽에서.
 * NestJS 예외는 `.response`(getResponse 결과: { statusCode, message, error|errorCode })를 가짐.
 */
function extractError(
  bodyObj: Record<string, unknown> | null,
  outputError: unknown,
  fallbackCode: string,
): { errorCode: string; errorMessage: string | null } {
  const errObj =
    outputError && typeof outputError === "object"
      ? (outputError as Record<string, unknown>)
      : null;
  const errResponse =
    errObj && typeof errObj["response"] === "object" && errObj["response"]
      ? (errObj["response"] as Record<string, unknown>)
      : null;

  const errorCode = String(
    bodyObj?.["errorCode"] ??
      errResponse?.["errorCode"] ??
      errObj?.["code"] ??
      errObj?.["errorCode"] ??
      fallbackCode,
  );
  const rawMsg =
    bodyObj?.["message"] ??
    errResponse?.["message"] ??
    (outputError instanceof Error
      ? outputError.message
      : outputError != null
        ? outputError
        : null);
  return { errorCode, errorMessage: clampMessage(rawMsg) };
}

/**
 * 성공/실패 판정 — 정책 단일 함수.
 *  - ERROR  : httpStatus >= 500, 또는 상태코드를 만들지 못한 서버 예외(httpStatus < 400 인데 예외 존재)
 *  - FAIL   : httpStatus 400~499, 또는 (2xx 인데 body.success === false)
 *  - SUCCESS: 2xx 이고 (body.success 없거나 true)
 *
 * 주의: 호출부(인터셉터)에서 예외 시 httpStatus 를 예외 객체의 status 로 보정해 전달해야 한다.
 *   (NestJS ExceptionFilter 가 인터셉터 finalize 이후 res.status 를 설정하므로
 *    finalize 시점 res.statusCode 는 기본 200 일 수 있음.)
 */
export function decideResult(
  httpStatus: number,
  outputError: unknown,
  body: unknown,
): DecideResultOutput {
  const bodyObj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const rawSuccess = bodyObj ? bodyObj["success"] : undefined;
  const bizSuccess = typeof rawSuccess === "boolean" ? rawSuccess : null;
  const hasError = outputError != null;

  // 1) ERROR — 5xx, 또는 상태코드를 만들지 못한 서버 예외
  if (httpStatus >= 500 || (hasError && httpStatus < 400)) {
    const { errorCode, errorMessage } = extractError(
      bodyObj,
      outputError,
      "INTERNAL_ERROR",
    );
    return { result: "ERROR", bizSuccess, errorCode, errorMessage };
  }

  // 2) FAIL — 4xx, 또는 (2xx 인데 success === false)
  if ((httpStatus >= 400 && httpStatus < 500) || bizSuccess === false) {
    const fallback = httpStatus >= 400 ? `HTTP_${httpStatus}` : "BIZ_FAIL";
    const { errorCode, errorMessage } = extractError(
      bodyObj,
      outputError,
      fallback,
    );
    return { result: "FAIL", bizSuccess, errorCode, errorMessage };
  }

  // 3) SUCCESS
  return { result: "SUCCESS", bizSuccess, errorCode: null, errorMessage: null };
}

/** req.url 에서 쿼리스트링 제거한 pathname (과도한 길이 방어). */
export function toPathname(url: string): string {
  if (!url) return "/";
  const qIdx = url.indexOf("?");
  const p = qIdx >= 0 ? url.slice(0, qIdx) : url;
  return p.length > 1024 ? p.slice(0, 1024) : p;
}
