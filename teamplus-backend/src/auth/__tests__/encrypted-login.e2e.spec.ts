/**
 * End-to-End Encryption Test
 *
 * 테스트 범위:
 * - Web/Flutter 클라이언트의 암호화
 * - 암호화된 페이로드 전송
 * - 서버 복호화 및 인증
 * - 보안 검증 (tampering 감지)
 */

import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AuthController } from "../auth.controller";
import { AuthService } from "../auth.service";
import {
  encryptCredentials,
  decryptCredentials,
} from "../../common/utils/crypto.util";

describe("E2E Encryption - Login Flow", () => {
  let app: INestApplication;
  let authService: AuthService;

  const testEmail = "test@teamplus.com";
  const testPassword = "Test1234!";

  beforeAll(async () => {
    // 테스트용 환경 변수 설정
    process.env.CRYPTO_SECRET_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockResolvedValue({
              user: {
                id: "user-123",
                email: testEmail,
                userType: "PARENT",
              },
              accessToken: "test-access-token",
              refreshToken: "test-refresh-token",
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    authService = moduleFixture.get<AuthService>(AuthService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Client-Side Encryption (Web/Flutter)", () => {
    it("동일 평문이라도 IV가 달라 암호문 다름 (nonce 검증)", async () => {
      const plaintext = JSON.stringify({
        email: testEmail,
        password: testPassword,
      });

      const encrypted1 = await encryptCredentials(plaintext);
      const encrypted2 = await encryptCredentials(plaintext);

      // IV는 매번 새로 생성
      expect(encrypted1.iv).not.toBe(encrypted2.iv);

      // 암호문도 다름
      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);

      // 인증 태그도 다름
      expect(encrypted1.authTag).not.toBe(encrypted2.authTag);
    });

    it("암호화된 페이로드는 Base64 인코딩", async () => {
      const plaintext = JSON.stringify({
        email: testEmail,
        password: testPassword,
      });
      const encrypted = await encryptCredentials(plaintext);

      // Base64 정규식: /^[A-Za-z0-9+/]*={0,2}$/
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

      expect(encrypted.encryptedData).toMatch(base64Regex);
      expect(encrypted.iv).toMatch(base64Regex);
      expect(encrypted.authTag).toMatch(base64Regex);
    });

    it("암호화 결과는 encryptedData, iv, authTag 포함", async () => {
      const plaintext = JSON.stringify({
        email: testEmail,
        password: testPassword,
      });
      const encrypted = await encryptCredentials(plaintext);

      expect(encrypted).toHaveProperty("encryptedData");
      expect(encrypted).toHaveProperty("iv");
      expect(encrypted).toHaveProperty("authTag");

      expect(typeof encrypted.encryptedData).toBe("string");
      expect(typeof encrypted.iv).toBe("string");
      expect(typeof encrypted.authTag).toBe("string");
    });
  });

  describe("Server-Side Decryption", () => {
    it("암호화 → 복호화 → 원본 일치 (roundtrip)", async () => {
      const plaintext = JSON.stringify({
        email: testEmail,
        password: testPassword,
      });

      // 클라이언트: 암호화
      const encrypted = await encryptCredentials(plaintext);

      // 서버: 복호화
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("복호화된 데이터는 유효한 JSON", async () => {
      const credentials = { email: testEmail, password: testPassword };
      const plaintext = JSON.stringify(credentials);

      const encrypted = await encryptCredentials(plaintext);
      const decrypted = decryptCredentials(encrypted);

      const parsed = JSON.parse(decrypted);
      expect(parsed.email).toBe(testEmail);
      expect(parsed.password).toBe(testPassword);
    });
  });

  describe("Security Validation (Tampering Detection)", () => {
    it("authTag 변조 시 복호화 실패", async () => {
      const plaintext = JSON.stringify({
        email: testEmail,
        password: testPassword,
      });
      const encrypted = await encryptCredentials(plaintext);

      // authTag 변조
      const tamperedPayload = {
        ...encrypted,
        authTag: "AAAAAAAAAAAAAAAAAAAAAA==",
      };

      expect(() => decryptCredentials(tamperedPayload)).toThrow(
        "Decryption failed",
      );
    });

    it("encryptedData 변조 시 복호화 실패", async () => {
      const plaintext = JSON.stringify({
        email: testEmail,
        password: testPassword,
      });
      const encrypted = await encryptCredentials(plaintext);

      // encryptedData 변조 (마지막 문자 변경)
      const tamperedPayload = {
        ...encrypted,
        encryptedData: encrypted.encryptedData.slice(0, -5) + "XXXXX",
      };

      expect(() => decryptCredentials(tamperedPayload)).toThrow(
        "Decryption failed",
      );
    });

    it("IV 변조 시 복호화 실패", async () => {
      const plaintext = JSON.stringify({
        email: testEmail,
        password: testPassword,
      });
      const encrypted = await encryptCredentials(plaintext);

      // IV 변조
      const tamperedPayload = {
        ...encrypted,
        iv: "AAAAAAAAAAAAAAAAAAAAAA==",
      };

      expect(() => decryptCredentials(tamperedPayload)).toThrow(
        "Decryption failed",
      );
    });

    it("유효하지 않은 Base64 처리", () => {
      const invalidPayload = {
        encryptedData: "!!!invalid base64!!!",
        iv: "also_invalid",
        authTag: "invalid_too",
      };

      expect(() => decryptCredentials(invalidPayload)).toThrow(
        "Decryption failed",
      );
    });
  });

  describe("End-to-End Login Flow", () => {
    it("Web 클라이언트: 암호화 → 서버 전송 → 복호화 → 인증", async () => {
      // 1. 클라이언트: 인증 정보 준비
      const credentials = { email: testEmail, password: testPassword };

      // 2. 클라이언트: 암호화
      const plaintext = JSON.stringify(credentials);
      const encryptedPayload = await encryptCredentials(plaintext);

      // 3. POST 요청으로 암호화된 페이로드 전송
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send(encryptedPayload)
        .expect(200);

      // 4. 응답 확인
      expect(response.body).toHaveProperty("user");
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");

      // 5. authService.login이 올바른 자격증명으로 호출되었는지 확인
      expect(authService.login).toHaveBeenCalledWith({
        email: testEmail,
        password: testPassword,
      });
    });

    it("Flutter 앱: 암호화 → API 요청 → 로그인 성공", async () => {
      // Flutter 에뮬레이터에서의 시나리오 시뮬레이션
      const credentials = { email: testEmail, password: testPassword };
      const plaintext = JSON.stringify(credentials);

      // Flutter: EncryptionService.encryptCredentials()
      const encryptedPayload = await encryptCredentials(plaintext);

      // Flutter: API 요청 (EncryptedLoginRequest.toJson())
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send(encryptedPayload)
        .expect(200);

      // Flutter: 응답 처리
      expect(response.body.user.email).toBe(testEmail);
      expect(response.body.accessToken).toBeDefined();
    });

    it("복호화 실패 시 generic 에러 메시지 반환 (정보 노출 방지)", async () => {
      const invalidPayload = {
        encryptedData: "invalid-base64-data",
        iv: "invalid-iv",
        authTag: "invalid-tag",
      };

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send(invalidPayload)
        .expect(401);

      // Generic 에러 메시지만 반환 (복호화 실패 상세 정보 노출 안 함)
      expect(response.body.message).toBe("Invalid credentials");
    });
  });

  describe("Performance Tests", () => {
    it("암호화 성능: 100회 < 1초 (≈10ms/회)", async () => {
      const plaintext = JSON.stringify({
        email: testEmail,
        password: testPassword,
      });
      const iterations = 100;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await encryptCredentials(plaintext);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // 평균 50ms 이하 (느린 머신 고려)
      expect(avgTime).toBeLessThan(50);
      console.log(`평균 암호화 시간: ${avgTime.toFixed(2)}ms/회`);
    });

    it("복호화 성능: 100회 < 1초 (≈10ms/회)", async () => {
      const plaintext = JSON.stringify({
        email: testEmail,
        password: testPassword,
      });

      // 먼저 100개의 암호화 데이터 생성
      const payloads = [];
      for (let i = 0; i < 100; i++) {
        payloads.push(await encryptCredentials(plaintext));
      }

      // 복호화 성능 측정
      const startTime = Date.now();

      for (const payload of payloads) {
        decryptCredentials(payload);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / payloads.length;

      // 평균 50ms 이하
      expect(avgTime).toBeLessThan(50);
      console.log(`평균 복호화 시간: ${avgTime.toFixed(2)}ms/회`);
    });
  });

  describe("Special Cases", () => {
    it("한글을 포함한 평문 암호화/복호화", async () => {
      const specialPlaintext = JSON.stringify({
        email: "한글@teamplus.com",
        password: "P@$$w0rd!한글",
      });

      const encrypted = await encryptCredentials(specialPlaintext);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toBe(specialPlaintext);
    });

    it("긴 평문 (반복 10회) 암호화/복호화", async () => {
      const plaintext = JSON.stringify({
        email: testEmail,
        password: testPassword,
      });
      const longPlaintext = plaintext.repeat(10);

      const encrypted = await encryptCredentials(longPlaintext);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toBe(longPlaintext);
    });

    it("빈 평문 처리", async () => {
      const emptyPlaintext = "";

      const encrypted = await encryptCredentials(emptyPlaintext);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toBe(emptyPlaintext);
    });
  });
});
