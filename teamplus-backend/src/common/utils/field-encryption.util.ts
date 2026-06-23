import { createHash } from "crypto";

/**
 * Server-side field encryption utility (AES-256-GCM)
 *
 * Used for encrypting sensitive fields at rest (e.g., bank account numbers).
 * Separate from crypto.util.ts which handles client-to-server payload decryption.
 *
 * Format: base64(iv:authTag:ciphertext)
 *   - iv: 12 bytes
 *   - authTag: 16 bytes
 *   - ciphertext: variable length
 *
 * Usage:
 * ```typescript
 * const encrypted = encryptField('1234-5678-9012');
 * const plain = decryptField(encrypted);
 * ```
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * 후보 32바이트 키 목록(우선순위 순).
 *
 * [2026-06-15 SECURITY] at-rest 필드 암호화 키를 **클라이언트에 노출되는 키와 분리**한다.
 * 기존엔 CRYPTO_SECRET_KEY 를 썼는데, 이 값은 web 의 NEXT_PUBLIC_CRYPTO_SECRET_KEY 와
 * 동일(브라우저 번들에 인라인)이라 at-rest PII 암호화 키가 공개로 읽혔다.
 *
 * 해결: 서버 전용 `FIELD_ENCRYPTION_KEY` 를 최우선 키로 둔다.
 *  - 신규 암호화: 첫 번째(가장 강한) 키 사용 → FIELD_ENCRYPTION_KEY 설정 시 그 키.
 *  - 복호화: 목록 전체를 순회. AES-GCM 은 잘못된 키면 auth tag 검증 실패로 throw 하므로,
 *    레거시(CRYPTO_SECRET_KEY)로 암호화된 기존 데이터도 폴백으로 안전하게 복호화된다.
 *  - FIELD_ENCRYPTION_KEY 미설정 시 동작은 기존과 100% 동일(CRYPTO_SECRET_KEY 사용).
 *
 * 운영: FIELD_ENCRYPTION_KEY 를 `openssl rand -hex 32`(서버 전용, NEXT_PUBLIC 금지)로 설정.
 * 기존 데이터 강제 이관은 prisma/manual-migrations 재암호화 스크립트로(선택 — 폴백이 호환 보장).
 */
function resolveKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const seen = new Set<string>();
  const pushHex = (hex?: string) => {
    if (!hex || hex.length !== 64) return;
    const buf = Buffer.from(hex, "hex");
    const fp = buf.toString("hex");
    if (seen.has(fp)) return;
    seen.add(fp);
    keys.push(buf);
  };
  const pushSecret = (secret?: string) => {
    if (!secret) return;
    const buf = createHash("sha256").update(secret).digest();
    const fp = buf.toString("hex");
    if (seen.has(fp)) return;
    seen.add(fp);
    keys.push(buf);
  };

  // 신규 암호화 우선순위: 서버 전용 FIELD_ENCRYPTION_KEY > ENCRYPTION_KEY
  pushHex(process.env.FIELD_ENCRYPTION_KEY);
  pushHex(process.env.ENCRYPTION_KEY);
  // 레거시(복호화 폴백): CRYPTO_SECRET_KEY 로 암호화된 기존 데이터 호환
  pushHex(process.env.CRYPTO_SECRET_KEY);
  // 최종 폴백: JWT_SECRET SHA-256 파생
  pushSecret(process.env.JWT_SECRET);

  if (keys.length === 0) {
    throw new Error(
      "No encryption key available. Set FIELD_ENCRYPTION_KEY (64 hex chars, server-only) or CRYPTO_SECRET_KEY/ENCRYPTION_KEY/JWT_SECRET.",
    );
  }
  return keys;
}

/** 신규 암호화에 사용할 기본 키(우선순위 첫 번째). */
function getEncryptionKey(): Buffer {
  return resolveKeys()[0];
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt
 * @returns Base64-encoded string containing iv + authTag + ciphertext
 */
export function encryptField(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv(12) + authTag(16) + ciphertext(N)
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64-encoded AES-256-GCM encrypted string.
 *
 * @param encryptedBase64 - Base64 string produced by encryptField()
 * @returns The original plaintext
 * @throws Error if decryption fails (wrong key, tampered data)
 */
export function decryptField(encryptedBase64: string): string {
  const packed = Buffer.from(encryptedBase64, "base64");

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted data: too short");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  // [2026-06-15 SECURITY] 후보 키 순회 복호화 — 신규 키(FIELD_ENCRYPTION_KEY)로 암호화된
  //   데이터와 레거시 키(CRYPTO_SECRET_KEY)로 암호화된 기존 데이터를 모두 지원.
  //   AES-GCM 은 키가 틀리면 final() 에서 auth tag 검증 실패로 throw 하므로, 성공한
  //   첫 키가 올바른 키다(잘못된 복호화 위험 없음).
  const keys = resolveKeys();
  let lastErr: unknown;
  for (const key of keys) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext, undefined, "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(
    `Field decryption failed with all candidate keys: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

/**
 * Check if a string looks like it was encrypted by encryptField().
 * Useful for migration: detect whether a field is already encrypted.
 *
 * A valid encrypted value is base64-encoded and decodes to at least
 * IV_LENGTH + AUTH_TAG_LENGTH + 1 bytes.
 *
 * @param value - The string to check
 * @returns true if the value appears to be encrypted
 */
export function isEncryptedField(value: string): boolean {
  try {
    const decoded = Buffer.from(value, "base64");
    // Must be at least iv + authTag + 1 byte of ciphertext
    if (decoded.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      return false;
    }
    // Re-encoding should produce the same base64 (validates it's truly base64)
    return decoded.toString("base64") === value;
  } catch {
    return false;
  }
}
