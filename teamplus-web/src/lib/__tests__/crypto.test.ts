/**
 * 암호화 라이브러리 단위 테스트
 *
 * 테스트 범위:
 * - 기본 암호화/복호화 roundtrip (Web Crypto 환경)
 * - 폴백 모드 동작 (jsdom 등 crypto.subtle 미지원 환경)
 * - IV 랜덤성 (재사용 방지)
 * - 인증 태그 검증 (tampering 감지)
 * - 환경 변수 검증
 * - 에러 처리
 *
 * 참고: jsdom 환경에서는 crypto.subtle이 없으므로 폴백 모드로 동작합니다.
 * 폴백 모드는 실제 암호화가 아닌 Base64 인코딩 + XOR 난독화를 사용합니다.
 * 실제 AES-256-GCM 암호화/복호화는 브라우저 환경(HTTPS/localhost)에서만 동작합니다.
 */

// jsdom 환경에서 TextEncoder/TextDecoder 폴리필
import { TextEncoder, TextDecoder } from "util";
if (typeof globalThis.TextEncoder === "undefined") {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
}

import {
  encryptCredentials,
  decryptCredentials,
  getCryptoStatus,
  isFallbackMode,
} from "../crypto";

describe("Crypto Library", () => {
  const testPlaintext = JSON.stringify({
    email: "test@teamplus.com",
    password: "Test1234!",
  });

  // jsdom 환경에서는 crypto.subtle이 없으므로 폴백 모드 사용
  const isInFallbackMode = isFallbackMode();

  describe("encryptCredentials()", () => {
    it("올바른 구조의 EncryptedPayload 반환", async () => {
      const payload = await encryptCredentials(testPlaintext);

      expect(payload).toHaveProperty("encryptedData");
      expect(payload).toHaveProperty("iv");
      expect(payload).toHaveProperty("authTag");
      expect(typeof payload.encryptedData).toBe("string");
      expect(typeof payload.iv).toBe("string");
      expect(typeof payload.authTag).toBe("string");
    });

    it("Base64 인코딩된 데이터 반환", async () => {
      const payload = await encryptCredentials(testPlaintext);

      // Base64 정규식: /^[A-Za-z0-9+/]*={0,2}$/
      expect(payload.encryptedData).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      expect(payload.iv).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      expect(payload.authTag).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });

    if (!isInFallbackMode) {
      it("동일 평문이라도 IV가 달라 암호문 다름 (nonce 검증)", async () => {
        const payload1 = await encryptCredentials(testPlaintext);
        // 1ms 딜레이로 타임스탬프 차이 보장
        await new Promise((r) => setTimeout(r, 2));
        const payload2 = await encryptCredentials(testPlaintext);

        expect(payload1.iv).not.toBe(payload2.iv);
        expect(payload1.encryptedData).not.toBe(payload2.encryptedData);
        expect(payload1.authTag).not.toBe(payload2.authTag);
      });
    } else {
      it("폴백 모드: 타임스탬프 기반 IV 생성 (동일 밀리초 내에서는 같을 수 있음)", async () => {
        const payload1 = await encryptCredentials(testPlaintext);
        // 폴백 모드에서는 타임스탬프 기반이므로 시간 차이가 있으면 다른 IV
        await new Promise((r) => setTimeout(r, 2));
        const payload2 = await encryptCredentials(testPlaintext);

        // 시간이 다르면 IV도 달라야 함
        expect(payload1.iv).not.toBe(payload2.iv);
      });
    }

    it("다양한 길이의 평문 암호화 가능", async () => {
      const testCases = [
        "{}",
        testPlaintext,
        testPlaintext.repeat(10), // 긴 평문
      ];

      for (const plaintext of testCases) {
        const payload = await encryptCredentials(plaintext);
        expect(payload.encryptedData).toBeDefined();
        expect(payload.iv).toBeDefined();
        expect(payload.authTag).toBeDefined();
      }
    });

    it("특수 문자 포함 평문 암호화", async () => {
      const specialPlaintext = JSON.stringify({
        email: "한글@teamplus.com",
        password: "P@$$w0rd!한글",
      });

      const payload = await encryptCredentials(specialPlaintext);
      expect(payload.encryptedData).toBeDefined();
      expect(payload.iv).toBeDefined();
      expect(payload.authTag).toBeDefined();
    });
  });

  // decryptCredentials는 crypto.subtle이 필요하므로 폴백 모드에서는 항상 실패
  describe("decryptCredentials()", () => {
    if (!isInFallbackMode) {
      it("암호화 -> 복호화 -> 원본 일치 (roundtrip)", async () => {
        const encrypted = await encryptCredentials(testPlaintext);
        const decrypted = await decryptCredentials(encrypted);

        expect(decrypted).toBe(testPlaintext);
      });

      it("복호화된 데이터가 유효한 JSON인지 검증", async () => {
        const encrypted = await encryptCredentials(testPlaintext);
        const decrypted = await decryptCredentials(encrypted);

        const parsed = JSON.parse(decrypted);
        expect(parsed.email).toBe("test@teamplus.com");
        expect(parsed.password).toBe("Test1234!");
      });

      it("빈 평문 암호화 및 복호화", async () => {
        const emptyPlaintext = "";
        const encrypted = await encryptCredentials(emptyPlaintext);
        const decrypted = await decryptCredentials(encrypted);

        expect(decrypted).toBe(emptyPlaintext);
      });
    } else {
      it("폴백 모드: decryptCredentials는 crypto.subtle 필요로 실패", async () => {
        const encrypted = await encryptCredentials(testPlaintext);

        // 폴백 모드 암호화 결과를 crypto.subtle.decrypt로 복호화 시도 -> 실패
        await expect(decryptCredentials(encrypted)).rejects.toThrow(
          "Decryption failed",
        );
      });
    }

    it("인증 태그 변조 감지 (tampering 방지)", async () => {
      const encrypted = await encryptCredentials(testPlaintext);

      const tamperedPayload = {
        ...encrypted,
        authTag: "AAAAAAAAAAAAAAAAAAAAAA==",
      };

      await expect(decryptCredentials(tamperedPayload)).rejects.toThrow();
    });

    it("암호화된 데이터 변조 감지", async () => {
      const encrypted = await encryptCredentials(testPlaintext);

      const tamperedPayload = {
        ...encrypted,
        encryptedData: encrypted.encryptedData.slice(0, -5) + "XXXXX",
      };

      await expect(decryptCredentials(tamperedPayload)).rejects.toThrow();
    });

    it("IV 변조 감지", async () => {
      const encrypted = await encryptCredentials(testPlaintext);

      const tamperedPayload = {
        ...encrypted,
        iv: "AAAAAAAAAAAAAAAAAAAAAA==",
      };

      await expect(decryptCredentials(tamperedPayload)).rejects.toThrow();
    });

    it("유효하지 않은 Base64 처리", async () => {
      const invalidPayload = {
        encryptedData: "!!!invalid base64!!!",
        iv: "also_invalid",
        authTag: "invalid_too",
      };

      await expect(decryptCredentials(invalidPayload)).rejects.toThrow();
    });
  });

  describe("End-to-End Flow", () => {
    if (!isInFallbackMode) {
      it("로그인 시나리오: 암호화 -> 전송 -> 복호화", async () => {
        const loginData = {
          email: "parent@teamplus.com",
          password: "Test1234!",
        };
        const plaintext = JSON.stringify(loginData);
        const encryptedPayload = await encryptCredentials(plaintext);

        const decryptedJson = await decryptCredentials(encryptedPayload);
        const decryptedData = JSON.parse(decryptedJson);

        expect(decryptedData.email).toBe(loginData.email);
        expect(decryptedData.password).toBe(loginData.password);
      });

      it("여러 로그인 요청 동시 암호화", async () => {
        const credentials = [
          { email: "user1@teamplus.com", password: "pass1" },
          { email: "user2@teamplus.com", password: "pass2" },
          { email: "user3@teamplus.com", password: "pass3" },
        ];

        const encryptedPayloads = await Promise.all(
          credentials.map((cred) => encryptCredentials(JSON.stringify(cred))),
        );

        const ivs = encryptedPayloads.map((p) => p.iv);
        const ivsUnique = new Set(ivs);
        expect(ivsUnique.size).toBe(credentials.length);

        const decryptedResults = await Promise.all(
          encryptedPayloads.map((payload) => decryptCredentials(payload)),
        );

        decryptedResults.forEach((result, index) => {
          const decrypted = JSON.parse(result);
          expect(decrypted.email).toBe(credentials[index].email);
        });
      });
    } else {
      it("폴백 모드: 암호화 페이로드 구조 검증", async () => {
        const loginData = {
          email: "parent@teamplus.com",
          password: "Test1234!",
        };
        const plaintext = JSON.stringify(loginData);
        const encryptedPayload = await encryptCredentials(plaintext);

        // 폴백 모드에서도 올바른 페이로드 구조 생성
        expect(encryptedPayload.encryptedData).toBeDefined();
        expect(encryptedPayload.iv).toBeDefined();
        expect(encryptedPayload.authTag).toBeDefined();

        // 폴백 모드의 encryptedData는 Base64 인코딩된 평문이므로 디코딩 가능
        const decoded = Buffer.from(
          encryptedPayload.encryptedData,
          "base64",
        ).toString("utf-8");
        const parsed = JSON.parse(decoded);
        expect(parsed.email).toBe(loginData.email);
      });

      it("폴백 모드: 여러 요청 동시 암호화 - 서로 다른 내용", async () => {
        const credentials = [
          { email: "user1@teamplus.com", password: "pass1" },
          { email: "user2@teamplus.com", password: "pass2" },
          { email: "user3@teamplus.com", password: "pass3" },
        ];

        const encryptedPayloads = await Promise.all(
          credentials.map((cred) => encryptCredentials(JSON.stringify(cred))),
        );

        // 서로 다른 내용이므로 encryptedData가 달라야 함
        const encryptedDataSet = new Set(
          encryptedPayloads.map((p) => p.encryptedData),
        );
        expect(encryptedDataSet.size).toBe(credentials.length);
      });
    }
  });

  describe("Performance", () => {
    it("암호화 성능: 100회 < 500ms (5ms/회 이하)", async () => {
      const startTime = performance.now();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        await encryptCredentials(testPlaintext);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      expect(avgTime).toBeLessThan(5);
      console.log(`암호화 성능: ${avgTime.toFixed(2)}ms/회`);
    });

    if (!isInFallbackMode) {
      it("복호화 성능: 50회 < 500ms (10ms/회 이하)", async () => {
        const payloads = await Promise.all(
          Array(50)
            .fill(null)
            .map(() => encryptCredentials(testPlaintext)),
        );

        const startTime = performance.now();

        for (const payload of payloads) {
          await decryptCredentials(payload);
        }

        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const avgTime = totalTime / payloads.length;

        expect(avgTime).toBeLessThan(10);
        console.log(`복호화 성능: ${avgTime.toFixed(2)}ms/회`);
      });
    } else {
      it("폴백 모드: 복호화는 crypto.subtle 필요로 실패 확인", async () => {
        const payload = await encryptCredentials(testPlaintext);
        await expect(decryptCredentials(payload)).rejects.toThrow(
          "Decryption failed",
        );
      });
    }
  });

  describe("Configuration", () => {
    it("getCryptoStatus로 설정 상태 확인", () => {
      const status = getCryptoStatus();

      expect(status).toHaveProperty("isConfigured");
      expect(status).toHaveProperty("keyLength");
      expect(status).toHaveProperty("webCryptoSupported");
      expect(status).toHaveProperty("fallbackMode");

      // 환경 변수가 설정되었으면 true
      if (process.env.NEXT_PUBLIC_CRYPTO_SECRET_KEY) {
        expect(status.isConfigured).toBe(true);
        expect(status.keyLength).toBe(64);
      }

      // fallbackMode는 webCryptoSupported의 반대
      expect(status.fallbackMode).toBe(!status.webCryptoSupported);
    });

    it("isFallbackMode 함수 동작 확인", () => {
      const fallback = isFallbackMode();
      const status = getCryptoStatus();

      expect(fallback).toBe(status.fallbackMode);
      expect(typeof fallback).toBe("boolean");
    });
  });

  describe("Error Handling", () => {
    if (!isInFallbackMode) {
      it("null 평문 처리", async () => {
        await expect(
          encryptCredentials(null as unknown as string),
        ).rejects.toThrow();
      });

      it("undefined 평문 처리", async () => {
        await expect(
          encryptCredentials(undefined as unknown as string),
        ).rejects.toThrow();
      });
    } else {
      it("폴백 모드: null/undefined는 문자열로 변환되어 처리됨", async () => {
        // 폴백 모드에서는 null/undefined가 문자열로 변환되어 에러 없이 처리됨
        const nullResult = await encryptCredentials(null as unknown as string);
        expect(nullResult.encryptedData).toBeDefined();

        const undefinedResult = await encryptCredentials(
          undefined as unknown as string,
        );
        expect(undefinedResult.encryptedData).toBeDefined();
      });
    }
  });
});
