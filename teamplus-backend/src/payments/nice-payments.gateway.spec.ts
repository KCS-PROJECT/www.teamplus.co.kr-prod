import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import * as crypto from "crypto";
import {
  NicePaymentsGateway,
  NiceApproveAmbiguousError,
  NiceCancelAmbiguousError,
} from "./nice-payments.gateway";

// Mock axios (KG·토스 게이트웨이 spec 과 동일 패턴).
jest.mock("axios", () => {
  const mockPost = jest.fn();
  const mockGet = jest.fn();
  return {
    create: jest.fn().mockReturnValue({ post: mockPost, get: mockGet }),
    __mockPost: mockPost,
    __mockGet: mockGet,
  };
});

import axios from "axios";

// 서명 계산 검증용 더미 값 — 실제 상점 키가 아니다(실키는 .env 전용, 코드에 두지 않는다).
// S2_ 접두는 유지한다: SDK 가 이 접두로 Server 승인 모델을 판별하므로 형식이 의미를 갖는다.
const CLIENT_KEY = "S2_test0000000000000000000000000000";
const SECRET_KEY = "test-secret-key-not-a-real-credential";

/** 매뉴얼 규칙을 spec 안에서 독립적으로 재구현 — 게이트웨이 구현을 그대로 베끼지 않는다. */
const sha256hex = (s: string) =>
  crypto.createHash("sha256").update(s, "utf8").digest("hex");

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string, def?: string) => {
    const map: Record<string, string> = {
      NICE_CLIENT_KEY: CLIENT_KEY,
      NICE_SECRET_KEY: SECRET_KEY,
    };
    return map[key] ?? def ?? "";
  }),
};

async function createGateway(): Promise<NicePaymentsGateway> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      NicePaymentsGateway,
      { provide: ConfigService, useValue: mockConfigService },
    ],
  }).compile();
  return module.get<NicePaymentsGateway>(NicePaymentsGateway);
}

describe("NicePaymentsGateway — 위변조 검증 서명 규칙", () => {
  let gateway: NicePaymentsGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    gateway = await createGateway();
  });

  describe("verifyAuthSignature — hex(sha256(authToken + clientId + amount + SecretKey))", () => {
    const authToken = "nicuntct1m0101210727200708A058";
    const amount = 1004;
    const validSignature = sha256hex(
      `${authToken}${CLIENT_KEY}${amount}${SECRET_KEY}`,
    );

    it("매뉴얼 규칙대로 생성된 서명을 통과시킨다", () => {
      expect(
        gateway.verifyAuthSignature({
          authToken,
          clientId: CLIENT_KEY,
          amount,
          signature: validSignature,
        }),
      ).toBe(true);
    });

    it("금액이 변조되면 거부한다", () => {
      expect(
        gateway.verifyAuthSignature({
          authToken,
          clientId: CLIENT_KEY,
          amount: 10,
          signature: validSignature,
        }),
      ).toBe(false);
    });

    it("clientId 가 우리 설정값과 다르면 서명 계산 전에 거부한다", () => {
      // 공격자가 clientId 와 signature 를 함께 바꿔 오는 경우 — 해시만으로는 통과한다.
      const attackerClientId = "S2_attacker00000000000000000000000";
      const consistentSignature = sha256hex(
        `${authToken}${attackerClientId}${amount}${SECRET_KEY}`,
      );
      expect(
        gateway.verifyAuthSignature({
          authToken,
          clientId: attackerClientId,
          amount,
          signature: consistentSignature,
        }),
      ).toBe(false);
    });

    it("amount 가 문자열(form POST)로 와도 동일하게 통과한다", () => {
      // returnUrl 은 x-www-form-urlencoded 로 POST 되므로 amount 가 문자열이다.
      expect(
        gateway.verifyAuthSignature({
          authToken,
          clientId: CLIENT_KEY,
          amount: "1004",
          signature: validSignature,
        }),
      ).toBe(true);
    });

    it("signature 가 비어 있으면 거부한다", () => {
      expect(
        gateway.verifyAuthSignature({
          authToken,
          clientId: CLIENT_KEY,
          amount,
          signature: "",
        }),
      ).toBe(false);
    });
  });

  describe("verifyResultSignature — hex(sha256(tid + amount + ediDate + SecretKey))", () => {
    const tid = "nicuntct1m0101210727200708A058";
    const amount = 1004;
    const ediDate = "2026-08-27T10:16:00.000Z";
    const validSignature = sha256hex(`${tid}${amount}${ediDate}${SECRET_KEY}`);

    it("매뉴얼 규칙대로 생성된 서명을 통과시킨다", () => {
      expect(
        gateway.verifyResultSignature({
          tid,
          amount,
          ediDate,
          signature: validSignature,
        }),
      ).toBe(true);
    });

    it("인증 서명 규칙(authToken+clientId 기반)과 서로 호환되지 않는다", () => {
      // 두 규칙의 재료가 다르므로 섞어 쓰면 반드시 실패해야 한다 — 규칙 공유 방지 회귀 테스트.
      const authRuleSignature = sha256hex(
        `${tid}${CLIENT_KEY}${amount}${SECRET_KEY}`,
      );
      expect(
        gateway.verifyResultSignature({
          tid,
          amount,
          ediDate,
          signature: authRuleSignature,
        }),
      ).toBe(false);
    });

    it("ediDate 가 다르면 거부한다", () => {
      expect(
        gateway.verifyResultSignature({
          tid,
          amount,
          ediDate: "2026-08-27T10:16:01.000Z",
          signature: validSignature,
        }),
      ).toBe(false);
    });
  });

  describe("verifyWebhookSignature — 응답 서명과 동일 규칙", () => {
    const tid = "nicuntct1m0101210727200708A058";
    const amount = 1004;
    const ediDate = "2026-08-27T10:16:00.000Z";

    it("body 필드로 검증한다 (토스와 달리 헤더 HMAC 이 아니다)", () => {
      expect(
        gateway.verifyWebhookSignature({
          tid,
          amount,
          ediDate,
          signature: sha256hex(`${tid}${amount}${ediDate}${SECRET_KEY}`),
        }),
      ).toBe(true);
    });

    it("필수 필드가 하나라도 없으면 거부한다", () => {
      expect(gateway.verifyWebhookSignature({ tid, amount, ediDate })).toBe(
        false,
      );
      expect(
        gateway.verifyWebhookSignature({ amount, ediDate, signature: "x" }),
      ).toBe(false);
    });

    it("amount 가 0 이어도 필드 누락으로 오판하지 않는다", () => {
      // `!body.amount` 로 검사하면 0 이 falsy 라 정상 거래를 거부한다.
      const zeroSig = sha256hex(`${tid}0${ediDate}${SECRET_KEY}`);
      expect(
        gateway.verifyWebhookSignature({
          tid,
          amount: 0,
          ediDate,
          signature: zeroSig,
        }),
      ).toBe(true);
    });
  });
});

describe("NicePaymentsGateway.approve — 요청 서명·결과 판정", () => {
  let gateway: NicePaymentsGateway;
  let mockPost: jest.Mock;

  const tid = "nicuntct1m0101210727200708A058";
  const orderId = "order-uuid-1";
  const amount = 1004;

  const okResponse = {
    resultCode: "0000",
    resultMsg: "정상 처리되었습니다.",
    tid,
    orderId,
    status: "paid",
    payMethod: "card",
    amount,
    balanceAmt: amount,
    goodsName: "팀플러스 수업 결제",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPost = (axios as unknown as { __mockPost: jest.Mock }).__mockPost;
    gateway = await createGateway();
  });

  it("경로에 tid 를 담고 signData = sha256(tid + amount + ediDate + SecretKey) 를 보낸다", async () => {
    mockPost.mockResolvedValueOnce({ data: okResponse });

    await gateway.approve({ tid, amount, orderId });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(`/v1/payments/${tid}`);
    expect(body.amount).toBe(amount);
    expect(body.signData).toBe(
      sha256hex(`${tid}${amount}${body.ediDate}${SECRET_KEY}`),
    );
  });

  it("resultCode 가 0000 이 아니면 BadRequestException — 망취소 대상이 아니다", async () => {
    mockPost.mockResolvedValueOnce({
      data: { ...okResponse, resultCode: "F100", resultMsg: "한도초과" },
    });

    await expect(gateway.approve({ tid, amount, orderId })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("read-timeout 은 NiceApproveAmbiguousError 로 던지고 orderId 를 실어준다", async () => {
    mockPost.mockRejectedValueOnce({
      code: "ECONNABORTED",
      request: {},
      message: "timeout of 15000ms exceeded",
    });

    await expect(
      gateway.approve({ tid, amount, orderId }),
    ).rejects.toMatchObject({
      name: "NiceApproveAmbiguousError",
      orderId,
    });
  });

  it("5xx 도 결과 미확정으로 처리한다", async () => {
    mockPost.mockRejectedValueOnce({ response: { status: 502 }, request: {} });

    await expect(
      gateway.approve({ tid, amount, orderId }),
    ).rejects.toBeInstanceOf(NiceApproveAmbiguousError);
  });

  it("4xx 명확한 거절은 확정 실패로 처리한다", async () => {
    mockPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { resultCode: "F113", resultMsg: "이미 승인된 거래입니다." },
      },
      request: {},
    });

    await expect(gateway.approve({ tid, amount, orderId })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe("NicePaymentsGateway.cancel / netCancel — 서명 재료가 서로 다르다", () => {
  let gateway: NicePaymentsGateway;
  let mockPost: jest.Mock;

  const tid = "nicuntct1m0101210727200708A058";
  const orderId = "order-uuid-1";

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPost = (axios as unknown as { __mockPost: jest.Mock }).__mockPost;
    gateway = await createGateway();
  });

  it("cancel 의 signData 는 amount 를 포함하지 않는다 — sha256(tid + ediDate + SecretKey)", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        resultCode: "0000",
        resultMsg: "정상",
        tid,
        cancelledTid: `${tid}C`,
        orderId,
        status: "cancelled",
        payMethod: "card",
        amount: 1004,
        balanceAmt: 0,
        goodsName: "팀플러스 수업 결제",
      },
    });

    await gateway.cancel({ tid, orderId, reason: "관리자 환불" });

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(`/v1/payments/${tid}/cancel`);
    expect(body.signData).toBe(sha256hex(`${tid}${body.ediDate}${SECRET_KEY}`));
    // 전액취소는 cancelAmt 를 아예 보내지 않는다(누락 = 전액취소).
    expect(body).not.toHaveProperty("cancelAmt");
  });

  it("cancelAmt 를 주면 부분취소로 전달한다", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        resultCode: "0000",
        resultMsg: "정상",
        tid,
        orderId,
        status: "partialCancelled",
        payMethod: "card",
        amount: 1004,
        balanceAmt: 504,
        goodsName: "팀플러스 수업 결제",
      },
    });

    await gateway.cancel({
      tid,
      orderId,
      reason: "부분 환불",
      cancelAmt: 500,
    });

    expect(mockPost.mock.calls[0][1].cancelAmt).toBe(500);
  });

  it("취소 timeout 은 NiceCancelAmbiguousError — 승인과 달리 망취소 대상이 아니다", async () => {
    mockPost.mockRejectedValueOnce({ code: "ETIMEDOUT", request: {} });

    await expect(
      gateway.cancel({ tid, orderId, reason: "관리자 환불" }),
    ).rejects.toBeInstanceOf(NiceCancelAmbiguousError);
  });

  it("netCancel 의 signData 는 orderId 기반이다 — sha256(orderId + ediDate + SecretKey)", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        resultCode: "0000",
        resultMsg: "정상",
        tid,
        orderId,
        status: "cancelled",
        payMethod: "card",
        amount: 1004,
        balanceAmt: 0,
        goodsName: "팀플러스 수업 결제",
      },
    });

    await gateway.netCancel({ orderId });

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe("/v1/payments/netcancel");
    expect(body.orderId).toBe(orderId);
    expect(body.signData).toBe(
      sha256hex(`${orderId}${body.ediDate}${SECRET_KEY}`),
    );
  });

  it("망취소 실패는 삼키지 않고 예외로 올린다", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        resultCode: "F999",
        resultMsg: "망취소 유효시간이 초과되었습니다.",
        tid,
        orderId,
        status: "paid",
        payMethod: "card",
        amount: 1004,
        balanceAmt: 1004,
        goodsName: "팀플러스 수업 결제",
      },
    });

    await expect(gateway.netCancel({ orderId })).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe("NicePaymentsGateway — 키 미설정", () => {
  it("키가 없으면 isConfigured() 가 false 이고 API 호출은 500 으로 막힌다", async () => {
    const emptyConfig = { get: jest.fn((_k: string, d?: string) => d ?? "") };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NicePaymentsGateway,
        { provide: ConfigService, useValue: emptyConfig },
      ],
    }).compile();
    const gateway = module.get<NicePaymentsGateway>(NicePaymentsGateway);

    expect(gateway.isConfigured()).toBe(false);
    expect(gateway.getClientKey()).toBe("");
    await expect(
      gateway.approve({ tid: "t", amount: 1, orderId: "o" }),
    ).rejects.toThrow("나이스페이 결제 키가 설정되지 않았습니다.");
  });
});
