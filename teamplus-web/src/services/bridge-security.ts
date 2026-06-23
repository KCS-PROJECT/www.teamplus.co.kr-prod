/**
 * Bridge Security Layer
 *
 * WebView Bridge 통신의 보안을 강화합니다.
 *
 * 보안 검증:
 * 1. Origin 검증: 허용된 origin에서만 Bridge 호출 허용
 * 2. Timestamp 검증: 요청 시점 기준 5분 이내 요청만 허용 (재전송 공격 방지)
 * 3. Nonce 검증: 동일 요청 재사용 방지 (replay attack 차단)
 */

// ============================================
// 상수 정의
// ============================================

/** 요청 유효 시간 (밀리초): 5분 */
const REQUEST_VALIDITY_MS = 5 * 60 * 1000;

/** Nonce 캐시 최대 크기 (메모리 보호) */
const MAX_NONCE_CACHE_SIZE = 1000;

/**
 * 허용된 Bridge 호출 origin 패턴.
 *
 * 운영 환경(LOCAL/DEV/PROD)별 서버 IP는 정규식으로 일괄 매칭한다.
 * `NEXT_PUBLIC_BRIDGE_ALLOWED_ORIGINS` 환경변수가 설정된 경우 콤마 구분
 * origin을 추가 허용한다 (사내 LAN 등).
 *
 * 포트는 `@/lib/env` 의 PORTS.web 을 단일 출처로 사용.
 */
import { PORTS } from "@/lib/env";

const ENV_EXTRA_ORIGINS: string[] = (
  process.env.NEXT_PUBLIC_BRIDGE_ALLOWED_ORIGINS ?? ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const WEB_PORT = PORTS.web;

const ALLOWED_ORIGINS: ReadonlyArray<string | RegExp> = [
  "file://", // Flutter WebView 로컬 파일
  `http://localhost:${WEB_PORT}`, // 개발 환경 (localhost)
  `http://127.0.0.1:${WEB_PORT}`,
  // TEAMPLUS 운영/스테이징 서버 IP (LOCAL 86, WSL2 호스트 110, DEV 115, PROD 230)
  new RegExp(`^http://211\\.236\\.174\\.(86|110|115|230):${WEB_PORT}$`),
  // 사내 LAN 192.168.x.x:{WEB_PORT} 일반 패턴
  new RegExp(`^http://192\\.168\\.\\d{1,3}\\.\\d{1,3}:${WEB_PORT}$`),
  // 프로덕션 도메인
  /^https:\/\/([a-z0-9-]+\.)?teamplus\.com$/,
  ...ENV_EXTRA_ORIGINS,
];

// ============================================
// Nonce 캐시 (Replay Attack 방지)
// ============================================

/** 사용된 nonce 저장소 (Set + 만료 관리) */
const usedNonces = new Map<string, number>();

/**
 * Nonce 캐시 정리
 * 만료된 nonce를 제거하여 메모리 누수를 방지합니다.
 */
function cleanupExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, expiry] of usedNonces) {
    if (now > expiry) {
      usedNonces.delete(nonce);
    }
  }

  // 캐시 크기 초과 시 가장 오래된 항목부터 제거
  if (usedNonces.size > MAX_NONCE_CACHE_SIZE) {
    const entries = Array.from(usedNonces.entries()).sort(
      (a, b) => a[1] - b[1],
    );
    const deleteCount = usedNonces.size - MAX_NONCE_CACHE_SIZE;
    for (let i = 0; i < deleteCount; i++) {
      usedNonces.delete(entries[i][0]);
    }
  }
}

// ============================================
// 보안 검증 유틸리티
// ============================================

export interface BridgeSecurityContext {
  /** 요청 타임스탬프 (Unix ms) */
  timestamp: number;
  /** 요청 고유 식별자 (nonce) */
  nonce: string;
  /** 요청 핸들러 이름 */
  handler: string;
}

/**
 * Origin 검증
 *
 * 현재 페이지의 origin이 허용된 목록에 있는지 확인합니다.
 * Flutter WebView에서는 origin이 'file://' 또는 앱에서 설정한 URL입니다.
 *
 * @returns true이면 안전한 origin
 */
export function verifyOrigin(): boolean {
  if (typeof window === "undefined") return false;

  const currentOrigin = window.location.origin;

  // file:// 프로토콜 (Flutter WebView 로컬)
  if (currentOrigin === "null" || window.location.protocol === "file:") {
    return true;
  }

  for (const allowed of ALLOWED_ORIGINS) {
    if (typeof allowed === "string") {
      if (currentOrigin === allowed || currentOrigin.startsWith(allowed)) {
        return true;
      }
    } else if (allowed instanceof RegExp) {
      if (allowed.test(currentOrigin)) {
        return true;
      }
    }
  }

  // 개발 환경에서는 localhost/127.0.0.1 패턴도 허용
  if (
    process.env.NODE_ENV !== "production" &&
    (currentOrigin.includes("localhost") || currentOrigin.includes("127.0.0.1"))
  ) {
    return true;
  }

  return false;
}

/**
 * Timestamp 검증
 *
 * 요청의 타임스탬프가 현재 시간 기준 5분 이내인지 확인합니다.
 * 이를 통해 캡처된 요청의 지연 재전송(replay attack)을 방지합니다.
 *
 * @param timestamp - 요청 생성 시각 (Unix milliseconds)
 * @returns true이면 유효한 타임스탬프
 */
export function verifyTimestamp(timestamp: number): boolean {
  if (!timestamp || typeof timestamp !== "number") return false;

  const now = Date.now();
  const diff = Math.abs(now - timestamp);

  return diff <= REQUEST_VALIDITY_MS;
}

/**
 * Nonce 검증 및 등록
 *
 * 동일한 nonce가 재사용되지 않도록 검증합니다.
 * 각 nonce는 REQUEST_VALIDITY_MS 이후 자동 만료됩니다.
 *
 * @param nonce - 요청 고유 식별자
 * @returns true이면 새로운 (유효한) nonce
 */
export function verifyAndRegisterNonce(nonce: string): boolean {
  if (!nonce || typeof nonce !== "string") return false;

  // 주기적 정리
  cleanupExpiredNonces();

  // 이미 사용된 nonce인지 확인
  if (usedNonces.has(nonce)) {
    return false;
  }

  // nonce 등록 (만료 시간 포함)
  usedNonces.set(nonce, Date.now() + REQUEST_VALIDITY_MS);
  return true;
}

/**
 * 보안 컨텍스트 생성
 *
 * Bridge 호출 시 첨부할 보안 메타데이터를 생성합니다.
 *
 * @param handler - 호출할 핸들러 이름
 * @returns BridgeSecurityContext
 */
export function createSecurityContext(handler: string): BridgeSecurityContext {
  return {
    timestamp: Date.now(),
    nonce: `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
    handler,
  };
}

/**
 * 전체 보안 검증 수행
 *
 * Origin, Timestamp, Nonce를 한 번에 검증합니다.
 *
 * @param context - 보안 컨텍스트
 * @returns { valid: boolean, reason?: string }
 */
export function validateSecurityContext(context: BridgeSecurityContext): {
  valid: boolean;
  reason?: string;
} {
  // 1. Origin 검증
  if (!verifyOrigin()) {
    return {
      valid: false,
      reason: `허용되지 않은 origin: ${typeof window !== "undefined" ? window.location.origin : "unknown"}`,
    };
  }

  // 2. Timestamp 검증
  if (!verifyTimestamp(context.timestamp)) {
    return {
      valid: false,
      reason: `타임스탬프 만료: ${new Date(context.timestamp).toISOString()}`,
    };
  }

  // 3. Nonce 검증
  if (!verifyAndRegisterNonce(context.nonce)) {
    return {
      valid: false,
      reason: `nonce 재사용 감지: ${context.nonce}`,
    };
  }

  return { valid: true };
}

/**
 * 보안 검증이 활성화된 환경인지 확인
 *
 * 개발 환경에서는 보안 검증을 완화하고 경고만 출력합니다.
 * 프로덕션에서는 검증 실패 시 요청을 차단합니다.
 */
export function isSecurityEnforced(): boolean {
  return process.env.NODE_ENV === "production";
}
