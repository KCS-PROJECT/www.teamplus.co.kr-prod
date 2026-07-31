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

/** 프로덕션급 환경 판정 — 이 환경에서는 서버 전용 키가 필수(레거시 폴백 암호화 금지). */
function isProductionLike(): boolean {
  const env = (process.env.NODE_ENV ?? "").toLowerCase();
  return env === "production" || env === "staging";
}

function hexKey(hex?: string): Buffer | null {
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, "hex");
}

/**
 * 신규 암호화에 사용할 **서버 전용** 키.
 *
 * [2026-07-30 SECURITY] `CRYPTO_SECRET_KEY` 폴백을 신규 암호화 경로에서 제거했다.
 * 이 값은 web 의 `NEXT_PUBLIC_CRYPTO_SECRET_KEY` 와 동일해 브라우저 번들에 인라인되는
 * **공개값**이라, 계좌번호 등 at-rest PII 를 공개키로 암호화하는 것과 같았다.
 * 신규 암호화는 서버에만 존재하는 `FIELD_ENCRYPTION_KEY`(또는 `ENCRYPTION_KEY`)만 허용한다.
 *
 * 운영: `openssl rand -hex 32` 로 생성해 서버 환경변수에만 설정(NEXT_PUBLIC_ 접두사 금지).
 */
function getEncryptionKey(): Buffer {
  const key =
    hexKey(process.env.FIELD_ENCRYPTION_KEY) ??
    hexKey(process.env.ENCRYPTION_KEY);
  if (!key) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY (64 hex chars, server-only) is required for field encryption. " +
        "CRYPTO_SECRET_KEY is a client-exposed value and can no longer be used to encrypt data at rest.",
    );
  }
  return key;
}

/**
 * 복호화 후보 키 목록(우선순위 순) — **읽기 전용 하위 호환 경로**.
 *
 * 이미 저장된 암호문은 레거시 키(`CRYPTO_SECRET_KEY` / `JWT_SECRET` 파생)로 만들어졌을 수
 * 있고, 이 폴백을 끊으면 운영 데이터를 영구히 읽을 수 없다. AES-GCM 은 키가 틀리면
 * auth tag 검증 실패로 throw 하므로 후보 순회가 오복호화를 만들지 않는다.
 * 레거시 키는 **복호화에만** 쓰이고 신규 암호화에는 절대 쓰이지 않는다(getEncryptionKey 참조).
 */
function resolveDecryptionKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const seen = new Set<string>();
  const push = (buf: Buffer | null) => {
    if (!buf) return;
    const fp = buf.toString("hex");
    if (seen.has(fp)) return;
    seen.add(fp);
    keys.push(buf);
  };

  // 현행 서버 전용 키
  push(hexKey(process.env.FIELD_ENCRYPTION_KEY));
  push(hexKey(process.env.ENCRYPTION_KEY));
  // 레거시(읽기 전용): 과거 이 키로 암호화된 기존 행 복호화용
  push(hexKey(process.env.CRYPTO_SECRET_KEY));
  push(
    process.env.JWT_SECRET
      ? createHash("sha256").update(process.env.JWT_SECRET).digest()
      : null,
  );

  if (keys.length === 0) {
    throw new Error(
      "No decryption key available. Set FIELD_ENCRYPTION_KEY (64 hex chars, server-only).",
    );
  }
  return keys;
}

/**
 * 부팅 시 fail-fast — 프로덕션/스테이징에서 서버 전용 키가 없으면 즉시 중단.
 *
 * 런타임 첫 암호화 시점까지 발견이 지연되면 정산 등록 같은 실사용 흐름에서 500 이 터진다.
 * `identity.config.ts` 의 IDENTITY_ENCRYPTION_KEY fail-fast 와 동일 관례.
 */
if (
  isProductionLike() &&
  !hexKey(process.env.FIELD_ENCRYPTION_KEY) &&
  !hexKey(process.env.ENCRYPTION_KEY)
) {
  throw new Error(
    `[필드 암호화 설정 오류] ${process.env.NODE_ENV} 환경에서 FIELD_ENCRYPTION_KEY 가 설정되지 않았습니다. ` +
      "서버 전용 64자 hex 키(openssl rand -hex 32)를 설정하세요. " +
      "CRYPTO_SECRET_KEY 는 클라이언트 노출값이라 at-rest 암호화 키로 사용할 수 없습니다.",
  );
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
  const keys = resolveDecryptionKeys();
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
