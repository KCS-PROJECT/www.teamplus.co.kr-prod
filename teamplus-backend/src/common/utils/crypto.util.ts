/**
 * Backend 복호화 유틸리티 (AES-256-GCM)
 *
 * 클라이언트(Web/Flutter)에서 암호화한 페이로드를 복호화
 *
 * 사용:
 * ```typescript
 * const plaintext = decryptCredentials({
 *   encryptedData: "base64...",
 *   iv: "base64...",
 *   authTag: "base64..."
 * });
 * const { email, password } = JSON.parse(plaintext);
 * ```
 */

import * as crypto from "crypto";

// 환경 변수 검증 (lazy loading - 실제 사용 시점에 확인)
function getSecretKey(): string {
  const SECRET_KEY = process.env.CRYPTO_SECRET_KEY;

  if (!SECRET_KEY || SECRET_KEY.length !== 64) {
    throw new Error(
      "CRYPTO_SECRET_KEY must be 64 hex chars (32 bytes). Current: " +
        (SECRET_KEY?.length || "undefined"),
    );
  }

  return SECRET_KEY;
}

/**
 * 암호화된 페이로드 인터페이스
 */
export interface EncryptedPayload {
  encryptedData: string; // Base64 암호화 데이터
  iv: string; // Base64 IV (16 바이트)
  authTag: string; // Base64 인증 태그 (16 바이트)
}

/**
 * 폴백 모드 여부 확인
 * WebView 환경에서 Web Crypto API가 지원되지 않을 때 사용되는 폴백 모드 감지
 *
 * @param iv - Base64 인코딩된 IV
 * @returns 폴백 모드 여부
 */
function isFallbackMode(iv: Buffer): boolean {
  // 폴백 모드의 IV는 첫 8바이트가 'FALLBACK'
  if (iv.length < 8) return false;
  const fallbackMarker = iv.slice(0, 8).toString("utf8");
  return fallbackMarker === "FALLBACK";
}

/**
 * 페이로드가 폴백 모드인지 확인 (외부 노출용).
 *
 * 호출자(예: AuthService) 가 IP/UA 컨텍스트와 함께 보안 audit 로그를 남길 수 있도록
 * 페이로드 단계에서 판별 가능. 절대 분기 로직(`decryptFallback`)을 외부에 노출하지
 * 않고, 단순 boolean 만 반환한다.
 */
export function isFallbackPayload(payload: EncryptedPayload): boolean {
  try {
    return isFallbackMode(Buffer.from(payload.iv, "base64"));
  } catch {
    return false;
  }
}

/**
 * 폴백 모드 복호화
 * WebView 환경에서 Web Crypto API가 없을 때 사용된 Base64 인코딩 데이터 디코드
 *
 * @param payload - 클라이언트에서 전송한 폴백 암호화 페이로드
 * @returns 복호화된 평문
 */
function decryptFallback(payload: EncryptedPayload): string {
  // 폴백 모드에서는 encryptedData가 Base64 인코딩된 평문
  const decoded = Buffer.from(payload.encryptedData, "base64").toString("utf8");
  const lastBrace = decoded.lastIndexOf("}");
  if (lastBrace !== -1) return decoded.substring(0, lastBrace + 1);
  return decoded;
}

/**
 * AES-256-GCM 복호화
 *
 * WebView 환경에서 Web Crypto API가 지원되지 않을 때는
 * 폴백 모드(Base64 인코딩)를 자동 감지하여 처리
 *
 * ⚠️ 보안 정책 (2026-05-14):
 *   - 폴백 모드는 **인증 태그 검증이 불가능** (평문 base64 + 가짜 authTag).
 *   - production / staging 환경에서는 폴백을 **무조건 거부** — 평문 자격증명
 *     수용은 MITM 공격에 무방비.
 *   - development 에서만 한정 허용 + `ALLOW_CRYPTO_FALLBACK=false` 로 끄기 가능
 *     (실제 암호화 동작 검증을 위해).
 *
 * @param payload - 클라이언트에서 전송한 암호화된 페이로드
 * @returns 복호화된 평문 (JSON stringified object)
 * @throws Error if decryption fails (invalid key, tampered data, fallback rejected, etc.)
 */
export function decryptCredentials(payload: EncryptedPayload): string {
  try {
    // 1. Base64에서 바이너리로 변환
    const iv = Buffer.from(payload.iv, "base64");

    // 2. 폴백 모드 감지 (WebView 환경에서 Web Crypto API 미지원 시)
    if (isFallbackMode(iv)) {
      // ⚠️ 보안 게이트: production / staging 에서는 거부.
      //   클라이언트가 평문을 보내고 있다는 의미이므로 절대 처리하지 않는다.
      //   (감사 로그는 호출자 service 레이어가 IP/UA 컨텍스트와 함께 기록.)
      const env = (process.env.NODE_ENV ?? "").toLowerCase();
      const allowFallback =
        process.env.ALLOW_CRYPTO_FALLBACK !== "false" &&
        (env === "development" || env === "test");

      if (!allowFallback) {
        // 보안: 클라이언트로는 일반적인 복호화 실패 메시지로 위장하여
        //       fallback 감지 로직 자체를 노출하지 않는다.
        if (env === "production" || env === "staging") {
          // stderr 로 명시적 보안 경고 — 운영 모니터링에서 즉시 알림이 필요한 사항.
          console.error(
            "[Crypto][SECURITY] Fallback payload rejected in non-dev env " +
              `(NODE_ENV=${env}). Clients must use WebCrypto AES-GCM.`,
          );
        }
        throw new Error("Decryption failed");
      }

      if (env === "development") {
        console.log("[Crypto] Fallback mode detected - using Base64 decode");
      }
      return decryptFallback(payload);
    }

    // 3. 일반 AES-256-GCM 복호화
    const keyBuffer = Buffer.from(getSecretKey(), "hex");
    const encryptedData = Buffer.from(payload.encryptedData, "base64");
    const authTag = Buffer.from(payload.authTag, "base64");

    // 4. Decipher 생성
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);

    // 5. 인증 태그 검증 (탐변 감지)
    decipher.setAuthTag(authTag);

    // 6. 복호화
    let decrypted = decipher.update(encryptedData, undefined, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    // 보안: 구체적인 에러 메시지 노출 금지
    // 상세 에러는 서비스 계층에서 구조화된 로깅으로 처리
    throw new Error("Decryption failed");
  }
}

/**
 * 암호화 상태 확인 (개발용)
 *
 * @return 암호화 설정 상태 정보
 */
export function getCryptoStatus() {
  const secretKey = process.env.CRYPTO_SECRET_KEY;
  const env = (process.env.NODE_ENV ?? "").toLowerCase();
  const fallbackSupported =
    process.env.ALLOW_CRYPTO_FALLBACK !== "false" &&
    (env === "development" || env === "test");
  return {
    isConfigured: secretKey && secretKey.length === 64,
    keyLength: secretKey?.length || 0,
    algorithm: "aes-256-gcm",
    ivSize: 16,
    authTagSize: 16,
    fallbackSupported, // dev/test 환경에서만 true (production/staging 거부)
  };
}
