/**
 * crypto.util.ts 회귀 가드.
 *
 * 핵심 검증:
 *  1. fallback 페이로드(`iv[0..8] = "FALLBACK"`) 는 dev/test 환경에서만 허용
 *  2. production / staging 에서는 fallback 거부 → "Decryption failed" throw
 *  3. ALLOW_CRYPTO_FALLBACK=false 면 dev 에서도 거부 (실제 암호화 검증 모드)
 *  4. `isFallbackPayload` 헬퍼는 iv 파싱 실패 시에도 안전하게 false 반환
 *
 * 이 테스트가 깨지면 클라이언트가 평문 base64 자격증명을 보내고 서버가 받아주는
 * 보안 결함이 재발한다. CI 게이트 필수.
 */

import {
  decryptCredentials,
  isFallbackPayload,
  getCryptoStatus,
  EncryptedPayload,
} from "./crypto.util";

/** iv 첫 8바이트 = "FALLBACK" 마커 + 나머지 임의 8바이트 (timestamp 흉내). */
function buildFallbackPayload(plaintext: string): EncryptedPayload {
  const iv = Buffer.alloc(16);
  iv.write("FALLBACK", 0, "utf8");
  // 나머지 8바이트는 의미 없는 값
  for (let i = 8; i < 16; i++) iv[i] = i * 7;
  return {
    encryptedData: Buffer.from(plaintext, "utf8").toString("base64"),
    iv: iv.toString("base64"),
    authTag: Buffer.alloc(16, 0).toString("base64"),
  };
}

describe("crypto.util — fallback security gate", () => {
  const origEnv = process.env.NODE_ENV;
  const origAllow = process.env.ALLOW_CRYPTO_FALLBACK;
  const origKey = process.env.CRYPTO_SECRET_KEY;

  beforeEach(() => {
    // 64 hex chars dummy key (실제 AES 동작 안 함, fallback 분기만 검증)
    process.env.CRYPTO_SECRET_KEY = "0".repeat(64);
  });

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
    process.env.ALLOW_CRYPTO_FALLBACK = origAllow;
    process.env.CRYPTO_SECRET_KEY = origKey;
  });

  it("development 환경에서 fallback 페이로드 정상 디코드", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ALLOW_CRYPTO_FALLBACK;
    const payload = buildFallbackPayload('{"email":"a@b.com","password":"x"}');
    const result = decryptCredentials(payload);
    const parsed = JSON.parse(result);
    expect(parsed.email).toBe("a@b.com");
    expect(parsed.password).toBe("x");
  });

  it("test 환경에서도 fallback 페이로드 허용 (jest 자체 환경 대응)", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ALLOW_CRYPTO_FALLBACK;
    const payload = buildFallbackPayload('{"k":"v"}');
    expect(() => decryptCredentials(payload)).not.toThrow();
  });

  it("🛡️ production 환경에서 fallback 거부 → throw", () => {
    process.env.NODE_ENV = "production";
    const payload = buildFallbackPayload(
      '{"email":"attacker@x","password":"plain"}',
    );
    expect(() => decryptCredentials(payload)).toThrow("Decryption failed");
  });

  it("🛡️ staging 환경에서도 fallback 거부 → throw", () => {
    process.env.NODE_ENV = "staging";
    const payload = buildFallbackPayload('{"k":"v"}');
    expect(() => decryptCredentials(payload)).toThrow("Decryption failed");
  });

  it("🛡️ ALLOW_CRYPTO_FALLBACK=false 면 development 에서도 fallback 거부", () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_CRYPTO_FALLBACK = "false";
    const payload = buildFallbackPayload('{"k":"v"}');
    expect(() => decryptCredentials(payload)).toThrow("Decryption failed");
  });

  it("isFallbackPayload — 정상 fallback iv 감지", () => {
    const payload = buildFallbackPayload('{"k":"v"}');
    expect(isFallbackPayload(payload)).toBe(true);
  });

  it("isFallbackPayload — 비-fallback iv 는 false", () => {
    const randomIv = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) randomIv[i] = i * 13 + 1;
    const payload: EncryptedPayload = {
      encryptedData: "anything",
      iv: randomIv.toString("base64"),
      authTag: Buffer.alloc(16, 0).toString("base64"),
    };
    expect(isFallbackPayload(payload)).toBe(false);
  });

  it("isFallbackPayload — 잘못된 base64 iv 도 안전하게 false (throw 없음)", () => {
    const payload: EncryptedPayload = {
      encryptedData: "x",
      iv: "!!! not base64 !!!",
      authTag: "x",
    };
    expect(() => isFallbackPayload(payload)).not.toThrow();
    // Buffer.from 은 invalid char 를 skip 하므로 짧은 buffer 가 만들어져 false 가 정상.
    expect(isFallbackPayload(payload)).toBe(false);
  });

  it("getCryptoStatus — production 에서 fallbackSupported=false", () => {
    process.env.NODE_ENV = "production";
    const status = getCryptoStatus();
    expect(status.fallbackSupported).toBe(false);
  });

  it("getCryptoStatus — development 에서 fallbackSupported=true", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ALLOW_CRYPTO_FALLBACK;
    const status = getCryptoStatus();
    expect(status.fallbackSupported).toBe(true);
  });

  it("getCryptoStatus — ALLOW_CRYPTO_FALLBACK=false 면 dev 에서도 false", () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_CRYPTO_FALLBACK = "false";
    const status = getCryptoStatus();
    expect(status.fallbackSupported).toBe(false);
  });
});
