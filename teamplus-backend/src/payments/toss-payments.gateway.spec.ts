import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import {
  TossPaymentsGateway,
  TossCancelAmbiguousError,
} from "./toss-payments.gateway";

// Mock axios (KG 게이트웨이 spec 과 동일 패턴).
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

describe("TossPaymentsGateway.cancel — 결과 확정/불확실 구분", () => {
  let gateway: TossPaymentsGateway;
  let mockPost: jest.Mock;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, def?: string) => {
      const map: Record<string, string> = {
        TOSS_CLIENT_KEY: "test_ck_xxx",
        TOSS_SECRET_KEY: "test_sk_xxx",
        TOSS_WEBHOOK_SECRET: "whsec",
      };
      return map[key] ?? def ?? "";
    }),
  };

  const cancelParams = {
    paymentKey: "tviatoss202607232311111ABCD",
    cancelReason: "관리자 환불",
    cancelAmount: 100000,
    idempotencyKey: "rr:rr-1",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPost = (axios as any).__mockPost;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TossPaymentsGateway,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
    gateway = module.get<TossPaymentsGateway>(TossPaymentsGateway);
  });

  it("성공(PARTIAL_CANCELED) → 응답 데이터 반환 + Idempotency-Key 헤더 전달", async () => {
    mockPost.mockResolvedValueOnce({ data: { status: "PARTIAL_CANCELED" } });
    const res = await gateway.cancel(cancelParams);
    expect(res.status).toBe("PARTIAL_CANCELED");
    expect(mockPost).toHaveBeenCalledWith(
      `/v1/payments/${cancelParams.paymentKey}/cancel`,
      expect.objectContaining({ cancelAmount: 100000 }),
      { headers: { "Idempotency-Key": "rr:rr-1" } },
    );
  });

  it("timeout(ECONNABORTED) → TossCancelAmbiguousError(격리)", async () => {
    mockPost.mockRejectedValueOnce({ code: "ECONNABORTED", request: {} });
    await expect(gateway.cancel(cancelParams)).rejects.toBeInstanceOf(
      TossCancelAmbiguousError,
    );
  });

  it("응답 유실(request 존재·response 없음) → TossCancelAmbiguousError(격리)", async () => {
    mockPost.mockRejectedValueOnce({ request: {}, response: undefined });
    await expect(gateway.cancel(cancelParams)).rejects.toBeInstanceOf(
      TossCancelAmbiguousError,
    );
  });

  it("5xx → TossCancelAmbiguousError(격리)", async () => {
    mockPost.mockRejectedValueOnce({
      response: { status: 503, data: { message: "server error" } },
      request: {},
    });
    await expect(gateway.cancel(cancelParams)).rejects.toBeInstanceOf(
      TossCancelAmbiguousError,
    );
  });

  it("409 IDEMPOTENT_REQUEST_PROCESSING → TossCancelAmbiguousError(kind=PROCESSING, 격리)", async () => {
    mockPost.mockRejectedValueOnce({
      request: {},
      response: {
        status: 409,
        data: { code: "IDEMPOTENT_REQUEST_PROCESSING", message: "처리 중" },
      },
    });
    const err = await gateway.cancel(cancelParams).catch((e) => e);
    expect(err).toBeInstanceOf(TossCancelAmbiguousError);
    expect(err.kind).toBe("PROCESSING");
  });

  it("[Minor1] 409 + 다른 code → PROCESSING 오분류 아님(BadRequestException 확정 실패)", async () => {
    mockPost.mockRejectedValueOnce({
      request: {},
      response: { status: 409, data: { code: "ALREADY_CANCELED", message: "이미 취소" } },
    });
    const err = await gateway.cancel(cancelParams).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err).not.toBeInstanceOf(TossCancelAmbiguousError);
  });

  it("[Minor1] 200/기타 status + IDEMPOTENT_REQUEST_PROCESSING code → PROCESSING 오분류 아님", async () => {
    mockPost.mockRejectedValueOnce({
      request: {},
      response: { status: 400, data: { code: "IDEMPOTENT_REQUEST_PROCESSING", message: "x" } },
    });
    const err = await gateway.cancel(cancelParams).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err).not.toBeInstanceOf(TossCancelAmbiguousError);
  });

  it("422(멱등 본문 불일치) → TossCancelAmbiguousError(kind=CONFLICT, 격리)", async () => {
    mockPost.mockRejectedValueOnce({
      request: {},
      response: {
        status: 422,
        data: { code: "IDEMPOTENT_KEY_CONFLICT", message: "본문 불일치" },
      },
    });
    const err = await gateway.cancel(cancelParams).catch((e) => e);
    expect(err).toBeInstanceOf(TossCancelAmbiguousError);
    expect(err.kind).toBe("CONFLICT");
  });

  it("정상 수신된 명확한 거절(4xx 바디) → BadRequestException(확정 실패, 모호성 아님)", async () => {
    mockPost.mockRejectedValueOnce({
      request: {},
      response: {
        status: 400,
        data: { code: "ALREADY_CANCELED", message: "이미 취소된 결제입니다." },
      },
    });
    const err = await gateway.cancel(cancelParams).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err).not.toBeInstanceOf(TossCancelAmbiguousError);
  });
});
