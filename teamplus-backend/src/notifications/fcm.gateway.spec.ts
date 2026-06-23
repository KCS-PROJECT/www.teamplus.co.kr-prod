import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { FcmGateway, FcmMessage } from "./fcm.gateway";

// 개별 env 폴백 경로 비활성화 — 테스트는 FIREBASE_SERVICE_ACCOUNT_JSON 경로만 검증
const mockConfigService = { get: jest.fn().mockReturnValue(undefined) };

/**
 * FcmGateway 테스트
 *
 * Firebase Admin SDK를 직접 mock하여 네트워크 없이 동작을 검증합니다.
 * firebase-admin 모듈 전체를 jest.mock으로 대체합니다.
 */

// firebase-admin 전체 mock
jest.mock("firebase-admin", () => {
  const mockSend = jest.fn();
  const mockSendEachForMulticast = jest.fn();
  const mockMessaging = jest.fn(() => ({
    send: mockSend,
    sendEachForMulticast: mockSendEachForMulticast,
  }));

  return {
    apps: [],
    initializeApp: jest.fn(() => ({ name: "teamplus-fcm-gateway" })),
    credential: {
      cert: jest.fn((sa) => ({ serviceAccount: sa })),
    },
    messaging: mockMessaging,
  };
});

describe("FcmGateway", () => {
  let gateway: FcmGateway;

  const testMessage: FcmMessage = {
    title: "테스트 알림",
    body: "알림 내용입니다.",
  };

  beforeEach(async () => {
    // FIREBASE_SERVICE_ACCOUNT_JSON 환경변수를 설정하여 초기화 경로 진입
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      project_id: "test-project",
      client_email: "test@test.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----",
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FcmGateway,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    gateway = module.get<FcmGateway>(FcmGateway);
    // onModuleInit 수동 호출 (TestingModule은 자동 호출하지 않음)
    await gateway.onModuleInit();

    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  });

  // ── sendToDevice ──────────────────────────────────────────────────────────

  describe("sendToDevice", () => {
    it("미초기화 상태에서 successCount=0, failureCount=0 을 반환한다", async () => {
      // isInitialized=false 상태 강제
      (gateway as any).isInitialized = false;
      (gateway as any).messaging = null;

      const result = await gateway.sendToDevice("token-1", testMessage);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.invalidTokens).toEqual([]);
    });

    it("발송 성공 시 successCount=1 과 messageId를 반환한다", async () => {
      (gateway as any).isInitialized = true;
      (gateway as any).messaging = {
        send: jest.fn().mockResolvedValue("projects/test/messages/msg-1"),
        sendEachForMulticast: jest.fn(),
      };

      const result = await gateway.sendToDevice("valid-token", testMessage);

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
      expect(result.messageId).toBe("projects/test/messages/msg-1");
    });

    it("잘못된 토큰 에러 시 invalidTokens 배열에 토큰을 포함한다", async () => {
      const invalidTokenError = {
        code: "messaging/registration-token-not-registered",
        message: "The registration token is not registered",
      };
      (gateway as any).isInitialized = true;
      (gateway as any).messaging = {
        send: jest.fn().mockRejectedValue(invalidTokenError),
        sendEachForMulticast: jest.fn(),
      };

      const result = await gateway.sendToDevice("invalid-token", testMessage);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
      expect(result.invalidTokens).toContain("invalid-token");
    });
  });

  // ── sendMulticast ─────────────────────────────────────────────────────────

  describe("sendMulticast", () => {
    it("토큰 배열이 비어 있으면 early return으로 successCount=0 을 반환한다", async () => {
      (gateway as any).isInitialized = true;
      (gateway as any).messaging = {
        send: jest.fn(),
        sendEachForMulticast: jest.fn(),
      };

      const result = await gateway.sendMulticast([], testMessage);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.invalidTokens).toEqual([]);
      // sendEachForMulticast 는 호출되지 않아야 함
      expect(
        (gateway as any).messaging.sendEachForMulticast,
      ).not.toHaveBeenCalled();
    });

    it("일부 토큰 실패 시 invalidTokens에 해당 토큰만 포함한다", async () => {
      (gateway as any).isInitialized = true;
      (gateway as any).messaging = {
        send: jest.fn(),
        sendEachForMulticast: jest.fn().mockResolvedValue({
          successCount: 1,
          failureCount: 1,
          responses: [
            { success: true },
            {
              success: false,
              error: { code: "messaging/registration-token-not-registered" },
            },
          ],
        }),
      };

      const tokens = ["token-ok", "token-bad"];
      const result = await gateway.sendMulticast(tokens, testMessage);

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.invalidTokens).toEqual(["token-bad"]);
    });

    it("전체 멀티캐스트 실패 시 failureCount=tokens.length 를 반환한다", async () => {
      (gateway as any).isInitialized = true;
      (gateway as any).messaging = {
        send: jest.fn(),
        sendEachForMulticast: jest
          .fn()
          .mockRejectedValue(new Error("FCM 서버 오류")),
      };

      const tokens = ["t1", "t2", "t3"];
      const result = await gateway.sendMulticast(tokens, testMessage);

      expect(result.failureCount).toBe(3);
      expect(result.invalidTokens).toEqual([]);
    });
  });

  // ── isReady ───────────────────────────────────────────────────────────────

  describe("isReady", () => {
    it("FIREBASE_SERVICE_ACCOUNT_JSON 미설정 시 isReady()=false 이다", async () => {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          FcmGateway,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const gw = module2.get<FcmGateway>(FcmGateway);
      await gw.onModuleInit();

      expect(gw.isReady()).toBe(false);
    });
  });
});
