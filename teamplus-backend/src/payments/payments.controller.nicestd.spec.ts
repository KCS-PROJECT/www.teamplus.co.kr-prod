import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { HttpStatus } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import {
  PaymentsService,
  NiceStdResultPendingError,
  NiceStdPaymentVoidedError,
} from "./payments.service";
import { WebhookRetryService } from "./webhook-retry.service";
import { KgInicisGateway } from "./kg-inicis.gateway";
import { TossPaymentsGateway } from "./toss-payments.gateway";
import { NicePaymentsGateway } from "./nice-payments.gateway";
import { NiceStdPaymentsGateway } from "./nice-std-payments.gateway";
import { PaymentCalculationService } from "./payment-calculation.service";
import { PostpaidSettlementService } from "./postpaid-settlement.service";
import { SettlementSummaryService } from "./settlement/settlement-summary.service";
import { RedisService } from "@/redis/redis.service";

/**
 * 나이스 구모듈 엔드포인트 3종 계약 검증.
 *
 *  1) sign 은 주문 소유자·pending 확인을 서비스에 위임하고 서명 필드를 그대로 돌려준다.
 *  2) authorize 는 검증 실패 사유를 각각 다른 error 쿼리로 매핑하며 승인을 부르지 않는다.
 *  3) webhook 은 신뢰 판정에 실패해도 본문 `"OK"` 를 돌려주고 처리는 하지 않는다.
 */
describe("PaymentsController — 나이스 구모듈", () => {
  let controller: PaymentsController;
  let niceStdGateway: {
    verifyAuthResult: jest.Mock;
    parseNotifyBody: jest.Mock;
    isTrustedNotify: jest.Mock;
  };
  let paymentsService: {
    buildNiceStdPayRequest: jest.Mock;
    getPaymentAmountByOrderNumber: jest.Mock;
    getRetryPathByOrderNumber: jest.Mock;
    confirmNiceStdPayment: jest.Mock;
    handleNiceStdNotify: jest.Mock;
  };

  const makeRes = () => {
    const redirect = jest.fn();
    return { redirect } as unknown as Parameters<
      PaymentsController["authorizeNiceStdPayment"]
    >[1] & { redirect: jest.Mock };
  };

  /**
   * authorize 는 raw Buffer 를 받으므로 요청 스텁을 만든다.
   * 객체를 그대로 넘기면 raw 파서를 거치지 않은 경로(프록시 구성 차이)를 흉내낸다.
   */
  const makeAuthReq = (
    body: unknown,
    contentType = "application/x-www-form-urlencoded",
  ) =>
    ({
      body,
      headers: { "content-type": contentType },
    }) as never;

  const authBody = {
    AuthResultCode: "0000",
    AuthResultMsg: "인증 성공",
    AuthToken: "authtoken-1",
    TxTid: "nicestdtid0000000000000000001",
    MID: "nictest00m",
    Moid: "ORD-1",
    Amt: "1004",
    Signature: "sig-1",
    NextAppURL: "https://dc1-api.nicepay.co.kr/webapi/pay_process.jsp",
    NetCancelURL: "https://dc1-api.nicepay.co.kr/webapi/cancel_process.jsp",
  };

  beforeEach(async () => {
    niceStdGateway = {
      verifyAuthResult: jest.fn().mockReturnValue({ ok: true }),
      parseNotifyBody: jest.fn(),
      isTrustedNotify: jest.fn().mockReturnValue(true),
    };
    paymentsService = {
      buildNiceStdPayRequest: jest.fn().mockResolvedValue({
        actionUrl:
          "https://api.teamplus.test/api/v1/payments/nicestd/authorize",
        fields: { MID: "nictest00m", Amt: "1004", SignData: "sign" },
      }),
      getPaymentAmountByOrderNumber: jest.fn().mockResolvedValue(1004),
      getRetryPathByOrderNumber: jest.fn().mockResolvedValue(null),
      confirmNiceStdPayment: jest.fn().mockResolvedValue({ success: true }),
      handleNiceStdNotify: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: paymentsService },
        { provide: WebhookRetryService, useValue: {} },
        { provide: KgInicisGateway, useValue: {} },
        { provide: TossPaymentsGateway, useValue: {} },
        { provide: NicePaymentsGateway, useValue: {} },
        { provide: NiceStdPaymentsGateway, useValue: niceStdGateway },
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

  describe("POST nicestd/sign", () => {
    it("요청자 id 와 주문번호를 서비스에 넘기고 폼 필드를 그대로 반환한다", async () => {
      const req = { user: { id: "parent-1" } } as never;

      const result = await controller.signNiceStdPayment(req, {
        orderNumber: "ORD-1",
        payMethod: "CARD",
      });

      expect(paymentsService.buildNiceStdPayRequest).toHaveBeenCalledWith({
        orderNumber: "ORD-1",
        userId: "parent-1",
        payMethod: "CARD",
        wapUrl: undefined,
        ispCancelUrl: undefined,
      });
      expect(result.fields.SignData).toBe("sign");
      // 로그인 ID 인 이메일이 PG 로 나가면 안 된다.
      expect(result.fields).not.toHaveProperty("BuyerEmail");
    });

    it("소유자·pending 판정은 서비스가 한다 — 예외를 삼키지 않고 전파한다", async () => {
      paymentsService.buildNiceStdPayRequest.mockRejectedValue(
        new Error("주문 정보를 찾을 수 없습니다."),
      );
      const req = { user: { id: "parent-2" } } as never;

      await expect(
        controller.signNiceStdPayment(req, {
          orderNumber: "ORD-1",
          payMethod: "CARD",
        }),
      ).rejects.toThrow("주문 정보를 찾을 수 없습니다.");
    });
  });

  describe("POST nicestd/authorize", () => {
    it("정상 인증이면 승인 후 303 리다이렉트한다 (provider=nicestd)", async () => {
      const res = makeRes();

      await controller.authorizeNiceStdPayment(makeAuthReq(authBody), res);

      expect(paymentsService.confirmNiceStdPayment).toHaveBeenCalledWith({
        orderNumber: "ORD-1",
        tid: authBody.TxTid,
        authToken: authBody.AuthToken,
        amount: 1004,
        nextAppUrl: authBody.NextAppURL,
        netCancelUrl: authBody.NetCancelURL,
      });
      const [status, url] = res.redirect.mock.calls[0];
      expect(status).toBe(HttpStatus.SEE_OTHER);
      expect(url).toContain("provider=nicestd");
      expect(url).toContain("orderNumber=ORD-1");
      expect(url).not.toContain("error=");
    });

    it("검증 기준 금액은 응답 Amt 가 아니라 DB 금액이다", async () => {
      const res = makeRes();

      await controller.authorizeNiceStdPayment(
        makeAuthReq({ ...authBody, Amt: "99999999" }),
        res,
      );

      expect(niceStdGateway.verifyAuthResult).toHaveBeenCalledWith(
        expect.objectContaining({ Amt: "99999999" }),
        1004,
      );
    });

    it("주문번호가 없으면 승인을 호출하지 않는다", async () => {
      const res = makeRes();

      await controller.authorizeNiceStdPayment(
        makeAuthReq({ ...authBody, Moid: "" }),
        res,
      );

      expect(paymentsService.confirmNiceStdPayment).not.toHaveBeenCalled();
      expect(res.redirect.mock.calls[0][1]).toContain("error=approve_failed");
    });

    it("주문을 찾지 못하면 승인을 호출하지 않는다", async () => {
      paymentsService.getPaymentAmountByOrderNumber.mockResolvedValue(null);
      const res = makeRes();

      await controller.authorizeNiceStdPayment(makeAuthReq(authBody), res);

      expect(paymentsService.confirmNiceStdPayment).not.toHaveBeenCalled();
      expect(res.redirect.mock.calls[0][1]).toContain("error=approve_failed");
    });

    it.each([
      ["auth_failed"],
      ["invalid_signature"],
      ["mid_mismatch"],
      ["amount_mismatch"],
      ["no_tid"],
      ["bad_next_url"],
    ])(
      "검증 실패(%s)는 같은 이름의 error 로 리다이렉트한다",
      async (reason) => {
        niceStdGateway.verifyAuthResult.mockReturnValue({ ok: false, reason });
        const res = makeRes();

        await controller.authorizeNiceStdPayment(makeAuthReq(authBody), res);

        expect(paymentsService.confirmNiceStdPayment).not.toHaveBeenCalled();
        expect(res.redirect.mock.calls[0][1]).toContain(`error=${reason}`);
      },
    );

    it("사용자 취소(I002)는 결과 화면이 아니라 원래 결제 화면으로 303 한다", async () => {
      niceStdGateway.verifyAuthResult.mockReturnValue({
        ok: false,
        reason: "auth_failed",
      });
      paymentsService.getRetryPathByOrderNumber.mockResolvedValue(
        "/payment/checkout?productId=prod-1&childId=child-1&classId=class-1&amount=1004&error=fail&code=I002&cancel=1",
      );
      const res = makeRes();

      await controller.authorizeNiceStdPayment(
        makeAuthReq({ ...authBody, AuthResultCode: "I002" }),
        res,
      );

      expect(paymentsService.confirmNiceStdPayment).not.toHaveBeenCalled();
      // 취소 여부·코드는 서버가 판정해 서비스에 넘긴다 — 쿼리 조립은 서비스 한 곳.
      expect(paymentsService.getRetryPathByOrderNumber).toHaveBeenCalledWith(
        "ORD-1",
        { code: "I002", cancelled: true },
      );
      const [status, url] = res.redirect.mock.calls[0];
      expect(status).toBe(HttpStatus.SEE_OTHER);
      expect(url).toBe(
        "http://localhost:5001/payment/checkout?productId=prod-1&childId=child-1&classId=class-1&amount=1004&error=fail&code=I002&cancel=1",
      );
    });

    it("사용자 취소라도 복귀 경로를 복원하지 못하면 결과 화면으로 간다", async () => {
      niceStdGateway.verifyAuthResult.mockReturnValue({
        ok: false,
        reason: "auth_failed",
      });
      const res = makeRes();

      await controller.authorizeNiceStdPayment(
        makeAuthReq({ ...authBody, AuthResultCode: "9993" }),
        res,
      );

      expect(paymentsService.confirmNiceStdPayment).not.toHaveBeenCalled();
      expect(res.redirect.mock.calls[0][1]).toContain(
        "/payment/complete?provider=nicestd",
      );
      expect(res.redirect.mock.calls[0][1]).toContain("error=auth_failed");
    });

    it("취소가 아닌 결제창 단계 실패도 코드와 함께 원래 결제 화면으로 303 한다", async () => {
      niceStdGateway.verifyAuthResult.mockReturnValue({
        ok: false,
        reason: "auth_failed",
      });
      paymentsService.getRetryPathByOrderNumber.mockResolvedValue(
        "/tournaments/tour-1/apply?error=fail&code=W090",
      );
      const res = makeRes();

      await controller.authorizeNiceStdPayment(
        makeAuthReq({ ...authBody, AuthResultCode: "W090" }),
        res,
      );

      expect(paymentsService.confirmNiceStdPayment).not.toHaveBeenCalled();
      expect(paymentsService.getRetryPathByOrderNumber).toHaveBeenCalledWith(
        "ORD-1",
        { code: "W090", cancelled: false },
      );
      expect(res.redirect.mock.calls[0][1]).toBe(
        "http://localhost:5001/tournaments/tour-1/apply?error=fail&code=W090",
      );
    });

    it("게이트웨이 미설정으로 auth_failed 가 났지만 코드가 0000 이면 결제 화면으로 되돌리지 않는다", async () => {
      niceStdGateway.verifyAuthResult.mockReturnValue({
        ok: false,
        reason: "auth_failed",
      });
      const res = makeRes();

      await controller.authorizeNiceStdPayment(makeAuthReq(authBody), res);

      expect(paymentsService.getRetryPathByOrderNumber).not.toHaveBeenCalled();
      expect(res.redirect.mock.calls[0][1]).toContain("error=auth_failed");
    });

    it("결제창 단계 실패인데 복귀 경로를 복원하지 못하면 코드와 함께 결과 화면으로 간다", async () => {
      niceStdGateway.verifyAuthResult.mockReturnValue({
        ok: false,
        reason: "auth_failed",
      });
      const res = makeRes();

      await controller.authorizeNiceStdPayment(
        makeAuthReq({ ...authBody, AuthResultCode: "F100" }),
        res,
      );

      expect(res.redirect.mock.calls[0][1]).toContain("/payment/complete?");
      expect(res.redirect.mock.calls[0][1]).toContain("error=auth_failed");
      expect(res.redirect.mock.calls[0][1]).toContain("code=F100");
    });

    it("무결성 오류(서명 불일치 등)는 복귀 경로를 조회하지 않고 결과 화면으로 간다", async () => {
      niceStdGateway.verifyAuthResult.mockReturnValue({
        ok: false,
        reason: "invalid_signature",
      });
      const res = makeRes();

      await controller.authorizeNiceStdPayment(makeAuthReq(authBody), res);

      expect(paymentsService.getRetryPathByOrderNumber).not.toHaveBeenCalled();
      expect(res.redirect.mock.calls[0][1]).toContain(
        "error=invalid_signature",
      );
    });

    it("charset=euc-kr form 본문도 415 없이 승인까지 간다", async () => {
      const res = makeRes();
      // 게이트웨이의 EUC-KR 디코더로 위임되는지만 본다(디코드 자체는 게이트웨이 spec 담당).
      niceStdGateway.parseNotifyBody.mockReturnValue(authBody);

      await controller.authorizeNiceStdPayment(
        makeAuthReq(
          Buffer.from("Moid=ORD-1&AuthResultCode=0000", "latin1"),
          "application/x-www-form-urlencoded; charset=euc-kr",
        ),
        res,
      );

      expect(niceStdGateway.parseNotifyBody).toHaveBeenCalledTimes(1);
      expect(paymentsService.confirmNiceStdPayment).toHaveBeenCalledTimes(1);
      const [status, url] = res.redirect.mock.calls[0];
      expect(status).toBe(HttpStatus.SEE_OTHER);
      expect(url).not.toContain("error=");
    });

    it("charset=utf-8 form 본문은 EUC-KR 디코더를 거치지 않는다", async () => {
      const res = makeRes();
      const form = new URLSearchParams({
        Moid: "ORD-1",
        AuthResultCode: "0000",
        AuthToken: "authtoken-1",
        TxTid: "nicestdtid0000000000000000001",
        Amt: "1004",
        NextAppURL: authBody.NextAppURL,
        NetCancelURL: authBody.NetCancelURL,
      }).toString();

      await controller.authorizeNiceStdPayment(
        makeAuthReq(
          Buffer.from(form, "utf8"),
          "application/x-www-form-urlencoded; charset=utf-8",
        ),
        res,
      );

      expect(niceStdGateway.parseNotifyBody).not.toHaveBeenCalled();
      expect(paymentsService.confirmNiceStdPayment).toHaveBeenCalledWith(
        expect.objectContaining({ orderNumber: "ORD-1", amount: 1004 }),
      );
      expect(res.redirect.mock.calls[0][0]).toBe(HttpStatus.SEE_OTHER);
    });

    it("본문 파싱이 실패해도 500 대신 결과 화면으로 리다이렉트한다", async () => {
      const res = makeRes();
      niceStdGateway.parseNotifyBody.mockImplementation(() => {
        throw new Error("디코드 실패");
      });

      await expect(
        controller.authorizeNiceStdPayment(
          makeAuthReq(
            Buffer.from([0xff, 0xfe, 0x00]),
            "application/x-www-form-urlencoded; charset=EUC-KR",
          ),
          res,
        ),
      ).resolves.not.toThrow();

      expect(paymentsService.confirmNiceStdPayment).not.toHaveBeenCalled();
      const [status, url] = res.redirect.mock.calls[0];
      expect(status).toBe(HttpStatus.SEE_OTHER);
      expect(url).toContain("error=approve_failed");
    });

    it("망취소까지 실패한 승인은 result_pending 으로 구분해 리다이렉트한다", async () => {
      paymentsService.confirmNiceStdPayment.mockRejectedValue(
        new NiceStdResultPendingError("결제 결과를 확인 중입니다."),
      );
      const res = makeRes();

      await controller.authorizeNiceStdPayment(makeAuthReq(authBody), res);

      expect(res.redirect.mock.calls[0][1]).toContain("error=result_pending");
    });

    it("승인이 취소로 확정되면 retry_payment 로 리다이렉트한다", async () => {
      paymentsService.confirmNiceStdPayment.mockRejectedValue(
        new NiceStdPaymentVoidedError(
          "결제 결과를 확인하지 못해 취소 처리했습니다.",
        ),
      );
      const res = makeRes();

      await controller.authorizeNiceStdPayment(makeAuthReq(authBody), res);

      expect(res.redirect.mock.calls[0][1]).toContain("error=retry_payment");
    });

    it("그 밖의 승인 실패는 approve_failed 로 리다이렉트하고 예외를 던지지 않는다", async () => {
      paymentsService.confirmNiceStdPayment.mockRejectedValue(
        new Error("결제 금액 불일치"),
      );
      const res = makeRes();

      await expect(
        controller.authorizeNiceStdPayment(makeAuthReq(authBody), res),
      ).resolves.not.toThrow();

      expect(res.redirect.mock.calls[0][1]).toContain("error=approve_failed");
    });
  });

  describe("POST nicestd/webhook", () => {
    const makeReq = (body: unknown, ip = "121.133.126.10") =>
      ({ body, ip }) as never;

    beforeEach(() => {
      niceStdGateway.parseNotifyBody.mockReturnValue({
        MID: "nictest00m",
        MOID: "ORD-1",
        TID: "tid-1",
        StateCd: "0",
      });
    });

    it("신뢰 판정을 통과하면 처리 후 OK 를 반환한다", async () => {
      const result = await controller.niceStdWebhook(
        makeReq(Buffer.from("MID=nictest00m")),
      );

      expect(paymentsService.handleNiceStdNotify).toHaveBeenCalledWith(
        expect.objectContaining({ MOID: "ORD-1" }),
      );
      expect(result).toBe("OK");
    });

    it("신뢰 판정에 실패하면 처리하지 않지만 OK 는 반환한다", async () => {
      niceStdGateway.isTrustedNotify.mockReturnValue(false);

      const result = await controller.niceStdWebhook(
        makeReq(Buffer.from("MID=other"), "1.2.3.4"),
      );

      expect(paymentsService.handleNiceStdNotify).not.toHaveBeenCalled();
      expect(result).toBe("OK");
    });

    it("본문이 Buffer 가 아니어도 예외 없이 OK 를 반환한다", async () => {
      niceStdGateway.parseNotifyBody.mockReturnValue({});
      niceStdGateway.isTrustedNotify.mockReturnValue(false);

      const result = await controller.niceStdWebhook(makeReq(undefined));

      expect(result).toBe("OK");
    });

    it("처리 중 예외가 나도 OK 를 반환한다 (재전송 폭주 방지)", async () => {
      paymentsService.handleNiceStdNotify.mockRejectedValue(
        new Error("DB down"),
      );

      const result = await controller.niceStdWebhook(
        makeReq(Buffer.from("MID=nictest00m")),
      );

      expect(result).toBe("OK");
    });
  });
});
