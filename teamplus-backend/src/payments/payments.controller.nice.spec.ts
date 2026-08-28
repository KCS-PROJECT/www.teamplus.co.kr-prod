import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { HttpStatus } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { WebhookRetryService } from "./webhook-retry.service";
import { KgInicisGateway } from "./kg-inicis.gateway";
import { TossPaymentsGateway } from "./toss-payments.gateway";
import { NicePaymentsGateway } from "./nice-payments.gateway";
import { PaymentCalculationService } from "./payment-calculation.service";
import { PostpaidSettlementService } from "./postpaid-settlement.service";
import { SettlementSummaryService } from "./settlement/settlement-summary.service";
import { RedisService } from "@/redis/redis.service";

/**
 * 나이스 결제창 인증 착지점(authorize) · 웹훅 계약 검증.
 *
 * 여기서 지키려는 계약은 세 가지다.
 *  1) 인증 실패·서명 불일치면 **승인 API를 부르지 않는다** (부르지 않으면 결제가 발생하지 않음).
 *  2) 응답은 JSON 이 아니라 **303 리다이렉트** — POST 새로고침 재전송으로 이중 승인이 나면 안 된다.
 *  3) 웹훅은 어떤 경우에도 body 에 문자열 `OK` 를 돌려준다 — 없으면 나이스가 재전송한다.
 */
describe("PaymentsController — 나이스페이먼츠", () => {
  let controller: PaymentsController;
  let niceGateway: {
    getClientKey: jest.Mock;
    verifyAuthSignature: jest.Mock;
    verifyWebhookSignature: jest.Mock;
  };
  let paymentsService: {
    confirmNicePayment: jest.Mock;
    handleNiceWebhook: jest.Mock;
  };

  /** express Response 스텁 — redirect(status, url) 호출만 관찰한다. */
  const makeRes = () => {
    const redirect = jest.fn();
    return { redirect } as unknown as Parameters<
      PaymentsController["authorizeNicePayment"]
    >[1] & { redirect: jest.Mock };
  };

  const validAuthBody = {
    authResultCode: "0000",
    authResultMsg: "인증 성공",
    tid: "nicuntct1m0101210727200708A058",
    clientId: "S2_test",
    orderId: "order-uuid-1",
    amount: "1004",
    authToken: "authtoken-1",
    signature: "sig-1",
  };

  beforeEach(async () => {
    niceGateway = {
      getClientKey: jest.fn().mockReturnValue("S2_test"),
      verifyAuthSignature: jest.fn().mockReturnValue(true),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };
    paymentsService = {
      confirmNicePayment: jest.fn().mockResolvedValue({ success: true }),
      handleNiceWebhook: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: paymentsService },
        { provide: WebhookRetryService, useValue: {} },
        { provide: KgInicisGateway, useValue: {} },
        { provide: TossPaymentsGateway, useValue: {} },
        { provide: NicePaymentsGateway, useValue: niceGateway },
        { provide: PaymentCalculationService, useValue: {} },
        { provide: PostpaidSettlementService, useValue: {} },
        { provide: SettlementSummaryService, useValue: {} },
        { provide: RedisService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) =>
              key === "NICE_RETURN_BASE_URL" ? "http://localhost:5001" : def,
            ),
          },
        },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  describe("GET nice/client-key", () => {
    it("클라이언트키만 반환한다 (시크릿키 비노출)", async () => {
      const result = await controller.getNiceClientKey();
      expect(result).toEqual({ clientKey: "S2_test" });
    });
  });

  describe("POST nice/authorize", () => {
    it("정상 인증이면 승인을 호출하고 결과 화면으로 303 리다이렉트한다", async () => {
      const res = makeRes();

      await controller.authorizeNicePayment(validAuthBody, res);

      expect(paymentsService.confirmNicePayment).toHaveBeenCalledWith({
        tid: validAuthBody.tid,
        orderId: "order-uuid-1",
        amount: 1004, // form POST 문자열 → 숫자 변환
      });
      const [status, url] = res.redirect.mock.calls[0];
      expect(status).toBe(HttpStatus.SEE_OTHER);
      expect(url).toContain("http://localhost:5001/payment/complete");
      expect(url).toContain("provider=nice");
      expect(url).toContain("orderNumber=order-uuid-1");
      expect(url).not.toContain("error=");
    });

    it("authResultCode 가 0000 이 아니면 승인을 호출하지 않는다", async () => {
      const res = makeRes();

      await controller.authorizeNicePayment(
        {
          ...validAuthBody,
          authResultCode: "2001",
          authResultMsg: "사용자 취소",
        },
        res,
      );

      expect(paymentsService.confirmNicePayment).not.toHaveBeenCalled();
      expect(res.redirect.mock.calls[0][1]).toContain("error=auth_failed");
    });

    it("서명 검증에 실패하면 승인을 호출하지 않는다", async () => {
      niceGateway.verifyAuthSignature.mockReturnValue(false);
      const res = makeRes();

      await controller.authorizeNicePayment(validAuthBody, res);

      expect(paymentsService.confirmNicePayment).not.toHaveBeenCalled();
      expect(res.redirect.mock.calls[0][1]).toContain(
        "error=invalid_signature",
      );
    });

    it("인증 성공인데 tid 가 없으면 승인을 호출하지 않는다", async () => {
      const res = makeRes();

      await controller.authorizeNicePayment(
        { ...validAuthBody, tid: undefined },
        res,
      );

      expect(paymentsService.confirmNicePayment).not.toHaveBeenCalled();
      expect(res.redirect.mock.calls[0][1]).toContain("error=no_tid");
    });

    it("승인이 실패해도 에러를 던지지 않고 결과 화면으로 보낸다", async () => {
      paymentsService.confirmNicePayment.mockRejectedValue(
        new Error("결제 금액 불일치"),
      );
      const res = makeRes();

      await expect(
        controller.authorizeNicePayment(validAuthBody, res),
      ).resolves.not.toThrow();

      expect(res.redirect.mock.calls[0][1]).toContain("error=approve_failed");
    });

    it("리다이렉트 대상은 요청 본문이 아니라 서버 설정값만 사용한다 (오픈 리다이렉트 방지)", async () => {
      const res = makeRes();

      await controller.authorizeNicePayment(
        {
          ...validAuthBody,
          mallReserved: "https://evil.example.com",
        } as typeof validAuthBody & { mallReserved: string },
        res,
      );

      const url: string = res.redirect.mock.calls[0][1];
      expect(url.startsWith("http://localhost:5001/")).toBe(true);
      expect(url).not.toContain("evil.example.com");
    });
  });

  describe("POST nice/webhook", () => {
    const webhookBody = {
      tid: "nicuntct1m0101210727200708A058",
      orderId: "order-uuid-1",
      status: "cancelled",
      amount: 1004,
      ediDate: "2026-08-27T10:16:00.000Z",
      signature: "sig",
    };

    it("서명이 유효하면 처리 후 OK 를 반환한다", async () => {
      const result = await controller.niceWebhook(webhookBody);

      expect(paymentsService.handleNiceWebhook).toHaveBeenCalledWith(
        webhookBody,
      );
      expect(result).toBe("OK");
    });

    it("서명이 무효면 처리하지 않지만 OK 는 반환한다", async () => {
      niceGateway.verifyWebhookSignature.mockReturnValue(false);

      const result = await controller.niceWebhook(webhookBody);

      expect(paymentsService.handleNiceWebhook).not.toHaveBeenCalled();
      expect(result).toBe("OK");
    });

    it("처리 중 예외가 나도 OK 를 반환한다 (재전송 폭주 방지)", async () => {
      paymentsService.handleNiceWebhook.mockRejectedValue(new Error("DB down"));

      const result = await controller.niceWebhook(webhookBody);

      expect(result).toBe("OK");
    });
  });
});
