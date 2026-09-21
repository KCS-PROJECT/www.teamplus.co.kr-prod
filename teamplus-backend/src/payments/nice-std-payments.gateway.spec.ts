import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import * as crypto from "crypto";
import * as iconv from "iconv-lite";
import {
  NiceStdPaymentsGateway,
  NiceStdApproveAmbiguousError,
  NICE_STD_CANCEL_URL,
  NICE_STD_INQUIRY_URL,
} from "./nice-std-payments.gateway";
import { NiceCancelAmbiguousError } from "./nice-payments.gateway";
import { kstCompactToInstant } from "../common/utils/kst-date.util";

// Mock axios (신모듈 게이트웨이 spec 과 동일 패턴).
jest.mock("axios", () => {
  const mockPost = jest.fn();
  return {
    create: jest.fn().mockReturnValue({ post: mockPost }),
    __mockPost: mockPost,
  };
});

import axios from "axios";

// 서명 계산 검증용 더미 값 — 실제 상점 키가 아니다(실키는 .env 전용).
const MID = "nictest00m";
const MERCHANT_KEY = "test-merchant-key-not-a-real-credential";
const RETURN_URL =
  "https://api.teamplus.test/api/v1/payments/nicestd/authorize";

const NEXT_APP_URL = "https://dc1-api.nicepay.co.kr/webapi/pay_process.jsp";
const NET_CANCEL_URL =
  "https://dc2-api.nicepay.co.kr/webapi/cancel_process.jsp";

/** 규격 §0 규칙을 spec 안에서 독립적으로 재구현 — 게이트웨이 구현을 베끼지 않는다. */
const sha256hex = (s: string) =>
  crypto.createHash("sha256").update(s, "utf8").digest("hex");

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string, def?: string) => {
    const map: Record<string, string> = {
      NICE_STD_MID: MID,
      NICE_STD_MERCHANT_KEY: MERCHANT_KEY,
      NICE_STD_RETURN_URL: RETURN_URL,
    };
    return map[key] ?? def ?? "";
  }),
};

async function createGateway(): Promise<NiceStdPaymentsGateway> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      NiceStdPaymentsGateway,
      { provide: ConfigService, useValue: mockConfigService },
    ],
  }).compile();
  return module.get<NiceStdPaymentsGateway>(NiceStdPaymentsGateway);
}

const getPost = () =>
  (axios as unknown as { __mockPost: jest.Mock }).__mockPost;

/** 전송 본문(ASCII 필드 한정) 조회. */
const field = (body: string, key: string): string =>
  new URLSearchParams(body).get(key) ?? "";

describe("NiceStdPaymentsGateway.buildPayRequest", () => {
  let gateway: NiceStdPaymentsGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    gateway = await createGateway();
  });

  it("SignData 재료는 EdiDate + MID + Amt + MerchantKey 순서다", () => {
    const { actionUrl, fields } = gateway.buildPayRequest({
      orderNumber: "TRN-20260918-0001",
      amount: 1004,
      goodsName: "팀플러스 수업 결제",
      payMethod: "CARD",
    });

    expect(actionUrl).toBe(RETURN_URL);
    expect(fields.EdiDate).toMatch(/^\d{14}$/);
    expect(fields.SignData).toBe(
      sha256hex(`${fields.EdiDate}${MID}1004${MERCHANT_KEY}`),
    );
    expect(fields).toMatchObject({
      Amt: "1004",
      MID,
      Moid: "TRN-20260918-0001",
      PayMethod: "CARD",
      ReturnURL: RETURN_URL,
      CharSet: "utf-8",
    });
  });

  it("GoodsName 을 EUC-KR 40byte 로 절단하되 한글 경계를 깨지 않는다", () => {
    const longName = `ABC${"한".repeat(40)}`;
    const { fields } = gateway.buildPayRequest({
      orderNumber: "TRN-1",
      amount: 1000,
      goodsName: longName,
      payMethod: "CARD",
    });

    const bytes = iconv.encode(fields.GoodsName, "euc-kr");
    // "ABC"(3) + 한글 18자(36) = 39byte — 한 글자 더 넣으면 40 을 넘는다.
    expect(bytes.length).toBe(39);
    expect(fields.GoodsName).toBe(`ABC${"한".repeat(18)}`);
    // 잘린 자리에서 반 바이트가 남아 깨지지 않았는지 왕복으로 확인.
    expect(iconv.decode(bytes, "euc-kr")).toBe(fields.GoodsName);
  });

  it("선택 필드는 값이 있을 때만 싣는다", () => {
    const plain = gateway.buildPayRequest({
      orderNumber: "TRN-2",
      amount: 1000,
      goodsName: "수업",
      payMethod: "BANK",
    });
    expect(plain.fields).not.toHaveProperty("BuyerName");
    expect(plain.fields).not.toHaveProperty("WapUrl");

    const withOptions = gateway.buildPayRequest({
      orderNumber: "TRN-3",
      amount: 1000,
      goodsName: "수업",
      payMethod: "CARD",
      buyerName: "홍길동",
      buyerTel: "010-1234-5678",
      wapUrl: "teamplus://payment",
      ispCancelUrl: "teamplus://payment/cancel",
    });
    expect(withOptions.fields.BuyerName).toBe("홍길동");
    expect(withOptions.fields.BuyerTel).toBe("01012345678");
    expect(withOptions.fields.WapUrl).toBe("teamplus://payment");
    expect(withOptions.fields.IspCancelUrl).toBe("teamplus://payment/cancel");
  });

  it("주문번호가 64byte 를 넘으면 거부한다", () => {
    expect(() =>
      gateway.buildPayRequest({
        orderNumber: "A".repeat(65),
        amount: 1000,
        goodsName: "수업",
        payMethod: "CARD",
      }),
    ).toThrow(BadRequestException);
  });
});

describe("NiceStdPaymentsGateway.verifyAuthResult", () => {
  let gateway: NiceStdPaymentsGateway;
  const authToken = "nicuntct1m0101210727200708A058";
  const amount = 1004;

  const authBody = (over: Record<string, string | undefined> = {}) => {
    const amt = over.Amt ?? String(amount);
    const token = over.AuthToken ?? authToken;
    const mid = over.MID ?? MID;
    return {
      AuthResultCode: "0000",
      AuthToken: token,
      TxTid: "nictest00m01012107272007081234",
      MID: mid,
      Moid: "TRN-1",
      Amt: amt,
      Signature: sha256hex(`${token}${mid}${amt}${MERCHANT_KEY}`),
      NextAppURL: NEXT_APP_URL,
      NetCancelURL: NET_CANCEL_URL,
      ...over,
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    gateway = await createGateway();
  });

  it("Signature 재료는 AuthToken + MID + Amt + MerchantKey 순서다", () => {
    expect(gateway.verifyAuthResult(authBody(), amount)).toEqual({ ok: true });
  });

  it("AuthResultCode 가 0000 이 아니면 auth_failed", () => {
    expect(
      gateway.verifyAuthResult(authBody({ AuthResultCode: "I002" }), amount),
    ).toEqual({ ok: false, reason: "auth_failed" });
  });

  it("MID 는 응답값이 아니라 설정값과 대조한다", () => {
    // 공격자가 MID 와 Signature 를 함께 바꿔 와도 설정값 대조에서 먼저 막힌다.
    expect(
      gateway.verifyAuthResult(authBody({ MID: "attacker0m" }), amount),
    ).toEqual({ ok: false, reason: "mid_mismatch" });
  });

  it("금액이 다르면 amount_mismatch", () => {
    expect(gateway.verifyAuthResult(authBody({ Amt: "10" }), 10)).toEqual({
      ok: true,
    });
    expect(gateway.verifyAuthResult(authBody({ Amt: "10" }), amount)).toEqual({
      ok: false,
      reason: "amount_mismatch",
    });
  });

  it("서명이 변조되면 invalid_signature", () => {
    expect(
      gateway.verifyAuthResult(
        { ...authBody(), Signature: sha256hex("wrong") },
        amount,
      ),
    ).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("TxTid 가 없으면 no_tid", () => {
    expect(
      gateway.verifyAuthResult({ ...authBody(), TxTid: undefined }, amount),
    ).toEqual({ ok: false, reason: "no_tid" });
  });

  it("승인 URL 이 허용 호스트가 아니면 bad_next_url", () => {
    expect(
      gateway.verifyAuthResult(
        { ...authBody(), NextAppURL: "https://evil.example.com/pay.jsp" },
        amount,
      ),
    ).toEqual({ ok: false, reason: "bad_next_url" });

    expect(
      gateway.verifyAuthResult(
        { ...authBody(), NetCancelURL: "http://dc1-api.nicepay.co.kr/x.jsp" },
        amount,
      ),
    ).toEqual({ ok: false, reason: "bad_next_url" });
  });
});

describe("NiceStdPaymentsGateway.approve", () => {
  let gateway: NiceStdPaymentsGateway;
  let mockPost: jest.Mock;

  const tid = "nictest00m01012107272007081234";
  const authToken = "nicuntct1m0101210727200708A058";
  const amount = 1004;
  const orderNumber = "TRN-20260918-0001";
  // 응답 금액은 12자리 좌측 0 채움.
  const paddedAmt = "000000001004";

  const approveParams = {
    nextAppUrl: NEXT_APP_URL,
    netCancelUrl: NET_CANCEL_URL,
    tid,
    authToken,
    amount,
    orderNumber,
  };

  const okResponse = (over: Record<string, string> = {}) => ({
    ResultCode: "3001",
    ResultMsg: "정상 처리",
    TID: tid,
    MID,
    Moid: orderNumber,
    Amt: paddedAmt,
    Signature: sha256hex(`${tid}${MID}${paddedAmt}${MERCHANT_KEY}`),
    AuthCode: "12345678",
    AuthDate: "260918093015",
    PayMethod: "CARD",
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPost = getPost();
    gateway = await createGateway();
  });

  it("요청 SignData 재료는 AuthToken + MID + Amt + EdiDate + MerchantKey 순서다", async () => {
    mockPost.mockResolvedValueOnce({ data: okResponse() });

    await gateway.approve(approveParams);

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(NEXT_APP_URL);
    const ediDate = field(body, "EdiDate");
    expect(ediDate).toMatch(/^\d{14}$/);
    expect(field(body, "SignData")).toBe(
      sha256hex(`${authToken}${MID}1004${ediDate}${MERCHANT_KEY}`),
    );
    expect(field(body, "TID")).toBe(tid);
    expect(field(body, "Amt")).toBe("1004");
    expect(field(body, "CharSet")).toBe("utf-8");
    expect(field(body, "EdiType")).toBe("JSON");
    expect(body).not.toContain(MERCHANT_KEY);
  });

  it("3001 은 승인 성공 — 0 채움 Amt 를 숫자로 정규화하고 AuthDate 를 KST instant 로 변환한다", async () => {
    mockPost.mockResolvedValueOnce({ data: okResponse() });

    const result = await gateway.approve(approveParams);

    expect(result.status).toBe("approved");
    expect(result.amount).toBe(1004);
    expect(result.authDate).toBe("260918093015");
    expect(result.approvedAt?.toISOString()).toBe("2026-09-18T00:30:15.000Z");
    expect(result.tid).toBe(tid);
  });

  it("계좌이체 성공 코드 4000 도 승인으로 취급한다", async () => {
    mockPost.mockResolvedValueOnce({
      data: okResponse({ ResultCode: "4000", PayMethod: "BANK" }),
    });

    const result = await gateway.approve(approveParams);
    expect(result.status).toBe("approved");
    expect(result.payMethod).toBe("BANK");
  });

  it("응답 서명이 숫자 표기 Amt 로 생성돼도 재검증으로 통과시킨다", async () => {
    mockPost.mockResolvedValueOnce({
      data: okResponse({
        Signature: sha256hex(`${tid}${MID}1004${MERCHANT_KEY}`),
      }),
    });

    const result = await gateway.approve(approveParams);
    expect(result.status).toBe("approved");
  });

  it("1682 는 이미 승인된 거래로 분류한다 — 재승인 금지", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        ResultCode: "1682",
        ResultMsg: "동일한 승인 성공건이 존재합니다.",
        TID: tid,
        MID,
      },
    });

    const result = await gateway.approve(approveParams);
    expect(result.status).toBe("already_approved");
    expect(result.resultCode).toBe("1682");
    expect(result.amount).toBe(amount);
  });

  it("1673(기취소 거래 재승인 불가)은 확정 실패 — 대금이 들어오지 않는다", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        ResultCode: "1673",
        ResultMsg: "기취소된 거래는 재승인할 수 없습니다.",
        TID: tid,
        MID,
      },
    });

    const error = await gateway.approve(approveParams).catch((e: Error) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    // ResultMsg + 코드 규칙을 유지하면서 결제창 재호출 안내를 덧붙인다.
    expect((error as Error).message).toBe(
      "기취소된 거래는 재승인할 수 없습니다. 결제를 다시 시도해주세요. (1673)",
    );
  });

  it("1620(카드사 타임아웃)은 확정 실패로 던진다", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        ResultCode: "1620",
        ResultMsg: "승인 처리 중 타임아웃",
        TID: tid,
        MID,
      },
    });

    await expect(gateway.approve(approveParams)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("timeout 은 망취소에 필요한 값을 실은 모호 에러로 던진다", async () => {
    mockPost.mockRejectedValueOnce({
      code: "ECONNABORTED",
      request: {},
      message: "timeout of 30000ms exceeded",
    });

    await expect(gateway.approve(approveParams)).rejects.toMatchObject({
      name: "NiceStdApproveAmbiguousError",
      orderId: orderNumber,
      tid,
      authToken,
      netCancelUrl: NET_CANCEL_URL,
    });
  });

  it("5xx 도 결과 미확정으로 처리한다", async () => {
    mockPost.mockRejectedValueOnce({ response: { status: 502 }, request: {} });

    await expect(gateway.approve(approveParams)).rejects.toBeInstanceOf(
      NiceStdApproveAmbiguousError,
    );
  });

  it("응답을 해석하지 못하면 결과 미확정으로 처리한다", async () => {
    mockPost.mockResolvedValueOnce({ data: "<html>error page</html>" });

    await expect(gateway.approve(approveParams)).rejects.toBeInstanceOf(
      NiceStdApproveAmbiguousError,
    );
  });

  it("응답 서명이 어느 표기로도 맞지 않으면 모호 에러 — 망취소로 되돌린다", async () => {
    mockPost.mockResolvedValueOnce({
      data: okResponse({ Signature: sha256hex("forged") }),
    });

    await expect(gateway.approve(approveParams)).rejects.toBeInstanceOf(
      NiceStdApproveAmbiguousError,
    );
  });

  it("서명 검증에 실패한 응답의 TID 는 쓰지 않는다 — 망취소 대상은 인증 단계의 tid", async () => {
    mockPost.mockResolvedValueOnce({
      data: okResponse({
        TID: "attacker000000000000000000000",
        Signature: sha256hex("forged"),
      }),
    });

    const error = await gateway.approve(approveParams).catch((e: Error) => e);
    expect(error).toBeInstanceOf(NiceStdApproveAmbiguousError);
    expect((error as NiceStdApproveAmbiguousError).tid).toBe(tid);
  });

  it("승인 URL 이 허용 호스트가 아니면 호출 전에 거부한다", async () => {
    await expect(
      gateway.approve({
        ...approveParams,
        nextAppUrl: "https://evil.example.com/webapi/pay_process.jsp",
      }),
    ).rejects.toThrow(BadRequestException);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("NiceStdPaymentsGateway.netCancel", () => {
  let gateway: NiceStdPaymentsGateway;
  let mockPost: jest.Mock;

  const tid = "nictest00m01012107272007081234";
  const authToken = "nicuntct1m0101210727200708A058";
  const params = {
    netCancelUrl: NET_CANCEL_URL,
    tid,
    authToken,
    amount: 1004,
    orderNumber: "TRN-20260918-0001",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPost = getPost();
    gateway = await createGateway();
  });

  it("NetCancel=1 과 승인과 동일한 서명 재료로 보낸다", async () => {
    mockPost.mockResolvedValueOnce({
      data: { ResultCode: "2001", ResultMsg: "정상 취소", TID: tid },
    });

    await gateway.netCancel(params);

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(NET_CANCEL_URL);
    expect(field(body, "NetCancel")).toBe("1");
    const ediDate = field(body, "EdiDate");
    expect(field(body, "SignData")).toBe(
      sha256hex(`${authToken}${MID}1004${ediDate}${MERCHANT_KEY}`),
    );
  });

  it("timeoutMs 를 주면 해당 호출에만 적용한다 (기본 30초 유지)", async () => {
    mockPost.mockResolvedValueOnce({
      data: { ResultCode: "2001", ResultMsg: "정상 취소", TID: tid },
    });

    await gateway.netCancel({ ...params, timeoutMs: 8000 });
    expect(mockPost.mock.calls[0][2]).toEqual({ timeout: 8000 });

    mockPost.mockResolvedValueOnce({
      data: { ResultCode: "2001", ResultMsg: "정상 취소", TID: tid },
    });
    await gateway.netCancel(params);
    expect(mockPost.mock.calls[1][2]).toBeUndefined();
  });

  it("망취소 실패는 삼키지 않고 예외로 올린다", async () => {
    mockPost.mockResolvedValueOnce({
      data: { ResultCode: "2020", ResultMsg: "망상 취소 허용시간 초과" },
    });

    await expect(gateway.netCancel(params)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe("NiceStdPaymentsGateway.cancel", () => {
  let gateway: NiceStdPaymentsGateway;
  let mockPost: jest.Mock;

  const tid = "nictest00m01012107272007081234";
  const cancelMoid = "RF-clz1234567890abcdefghijk";
  const amount = 1004;
  const paddedCancelAmt = "000000001004";

  const params = {
    tid,
    cancelMoid,
    amount,
    reason: "수업 환불",
    partial: false,
  };

  const okResponse = (over: Record<string, string> = {}) => ({
    ResultCode: "2001",
    ResultMsg: "정상 취소",
    TID: tid,
    MID,
    Moid: cancelMoid,
    CancelAmt: paddedCancelAmt,
    RemainAmt: "000000000000",
    Signature: sha256hex(`${tid}${MID}${paddedCancelAmt}${MERCHANT_KEY}`),
    CancelDate: "20260918",
    CancelTime: "093015",
    CancelNum: "30012345",
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPost = getPost();
    gateway = await createGateway();
  });

  it("요청 SignData 재료는 MID + CancelAmt + EdiDate + MerchantKey 순서다", async () => {
    mockPost.mockResolvedValueOnce({ data: okResponse() });

    await gateway.cancel(params);

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(NICE_STD_CANCEL_URL);
    const ediDate = field(body, "EdiDate");
    expect(field(body, "SignData")).toBe(
      sha256hex(`${MID}1004${ediDate}${MERCHANT_KEY}`),
    );
    expect(field(body, "PartialCancelCode")).toBe("0");
    expect(field(body, "Moid")).toBe(cancelMoid);
  });

  it("한글 CancelMsg 를 EUC-KR 로 percent-encode 한다", async () => {
    mockPost.mockResolvedValueOnce({ data: okResponse() });

    await gateway.cancel({ ...params, reason: "수업 환불" });

    const body: string = mockPost.mock.calls[0][1];
    const expected = Array.from(iconv.encode("수업", "euc-kr"))
      .map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`)
      .join("");
    expect(body).toContain(`CancelMsg=${expected}`);
    // UTF-8 로 보냈다면 한 글자가 3바이트라 이 시퀀스가 나올 수 없다.
    expect(body).not.toContain("%EC%88%98");
  });

  it("부분취소는 PartialCancelCode=1 로 보낸다", async () => {
    mockPost.mockResolvedValueOnce({
      data: okResponse({ RemainAmt: "000000000504" }),
    });

    const result = await gateway.cancel({
      ...params,
      amount: 500,
      partial: true,
      reason: "부분 환불",
    });

    expect(field(mockPost.mock.calls[0][1], "PartialCancelCode")).toBe("1");
    expect(result.remainAmount).toBe(504);
  });

  it.each(["2001", "2211"])("%s 은 취소 성공", async (code) => {
    mockPost.mockResolvedValueOnce({ data: okResponse({ ResultCode: code }) });

    const result = await gateway.cancel(params);
    expect(result.status).toBe("cancelled");
    expect(result.cancelAmount).toBe(1004);
    expect(result.cancelDate).toBe("20260918");
    expect(result.cancelTime).toBe("093015");
    expect(result.cancelNum).toBe("30012345");
  });

  it.each(["2002", "2212", "2056", "2013", "2015"])(
    "%s 은 미확정 — 자동 재호출 금지 격리",
    async (code) => {
      mockPost.mockResolvedValueOnce({
        data: { ResultCode: code, ResultMsg: "취소 진행중", TID: tid },
      });

      await expect(gateway.cancel(params)).rejects.toBeInstanceOf(
        NiceCancelAmbiguousError,
      );
    },
  );

  it("2013·2015 는 취소 금액·시점을 알 수 없어 성공으로 확정하지 않는다", async () => {
    mockPost.mockResolvedValueOnce({
      data: { ResultCode: "2013", ResultMsg: "취소 완료 거래", TID: tid, MID },
    });

    const error = await gateway.cancel(params).catch((e: Error) => e);
    expect(error).toBeInstanceOf(NiceCancelAmbiguousError);
    expect((error as Error).message).toContain("가맹점관리자");
    expect((error as Error).message).toContain("2013");
  });

  it("2003(취소 실패)은 확정 실패로 던진다", async () => {
    mockPost.mockResolvedValueOnce({
      data: { ResultCode: "2003", ResultMsg: "취소 실패", TID: tid },
    });

    await expect(gateway.cancel(params)).rejects.toThrow(BadRequestException);
  });

  it("취소 timeout 은 NiceCancelAmbiguousError — Payment 복원 금지 신호다", async () => {
    mockPost.mockRejectedValueOnce({ code: "ETIMEDOUT", request: {} });

    await expect(gateway.cancel(params)).rejects.toBeInstanceOf(
      NiceCancelAmbiguousError,
    );
  });

  it("취소 응답 서명이 맞지 않으면 거부한다", async () => {
    mockPost.mockResolvedValueOnce({
      data: okResponse({ Signature: sha256hex("forged") }),
    });

    await expect(gateway.cancel(params)).rejects.toThrow(BadRequestException);
  });

  it("취소 주문번호가 64byte 를 넘으면 호출 전에 거부한다", async () => {
    await expect(
      gateway.cancel({ ...params, cancelMoid: "R".repeat(65) }),
    ).rejects.toThrow(BadRequestException);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("NiceStdPaymentsGateway.getTransactionStatus", () => {
  let gateway: NiceStdPaymentsGateway;
  let mockPost: jest.Mock;
  const tid = "nictest00m01012107272007081234";

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPost = getPost();
    gateway = await createGateway();
  });

  it("SignData 재료는 TID + MID + EdiDate + MerchantKey 순서다", async () => {
    mockPost.mockResolvedValueOnce({
      data: { ResultCode: "0000", ResultMsg: "정상", TID: tid, Status: "0" },
    });

    await gateway.getTransactionStatus(tid);

    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(NICE_STD_INQUIRY_URL);
    const ediDate = field(body, "EdiDate");
    expect(field(body, "SignData")).toBe(
      sha256hex(`${tid}${MID}${ediDate}${MERCHANT_KEY}`),
    );
  });

  it.each([
    ["0", "approved"],
    ["1", "cancelled"],
    ["9", "none"],
  ])("Status %s 를 %s 로 해석한다", async (code, expected) => {
    mockPost.mockResolvedValueOnce({
      data: {
        ResultCode: "0000",
        ResultMsg: "정상",
        TID: tid,
        Status: code,
        AuthCode: "12345678",
        AuthDate: "260918093015",
      },
    });

    const result = await gateway.getTransactionStatus(tid);
    expect(result.status).toBe(expected);
    expect(result.authCode).toBe("12345678");
  });

  it("timeoutMs 를 주면 해당 호출에만 적용한다", async () => {
    mockPost.mockResolvedValueOnce({
      data: { ResultCode: "0000", ResultMsg: "정상", TID: tid, Status: "0" },
    });

    await gateway.getTransactionStatus(tid, { timeoutMs: 8000 });
    expect(mockPost.mock.calls[0][2]).toEqual({ timeout: 8000 });
  });

  it("조회 실패 코드는 예외로 올린다", async () => {
    mockPost.mockResolvedValueOnce({
      data: { ResultCode: "9999", ResultMsg: "조회 실패" },
    });

    await expect(gateway.getTransactionStatus(tid)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe("NiceStdPaymentsGateway — 통보(노티)", () => {
  let gateway: NiceStdPaymentsGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    gateway = await createGateway();
  });

  it("허용 IP + MID 일치일 때만 신뢰한다", () => {
    expect(
      gateway.isTrustedNotify({ remoteIp: "121.133.126.10", mid: MID }),
    ).toBe(true);
    expect(
      gateway.isTrustedNotify({ remoteIp: "::ffff:211.33.136.39", mid: MID }),
    ).toBe(true);
    expect(gateway.isTrustedNotify({ remoteIp: "1.2.3.4", mid: MID })).toBe(
      false,
    );
    expect(
      gateway.isTrustedNotify({
        remoteIp: "121.133.126.11",
        mid: "attacker0m",
      }),
    ).toBe(false);
  });

  it("EUC-KR urlencoded 통보 본문의 한글을 복원한다", () => {
    const encode = (value: string) =>
      Array.from(iconv.encode(value, "euc-kr"))
        .map((b) =>
          (b >= 0x30 && b <= 0x39) ||
          (b >= 0x41 && b <= 0x5a) ||
          (b >= 0x61 && b <= 0x7a)
            ? String.fromCharCode(b)
            : `%${b.toString(16).toUpperCase().padStart(2, "0")}`,
        )
        .join("");

    const raw = Buffer.concat([
      Buffer.from(
        "TID=nictest00m0101&MID=nictest00m&Amt=1004&GoodsName=",
        "latin1",
      ),
      Buffer.from(encode("팀플러스 수업"), "latin1"),
      Buffer.from("&StateCd=0", "latin1"),
    ]);

    expect(gateway.parseNotifyBody(raw)).toEqual({
      TID: "nictest00m0101",
      MID: "nictest00m",
      Amt: "1004",
      GoodsName: "팀플러스 수업",
      StateCd: "0",
    });
  });

  it("빈 본문은 빈 객체", () => {
    expect(gateway.parseNotifyBody(Buffer.alloc(0))).toEqual({});
  });
});

describe("NiceStdPaymentsGateway — 설정 미비", () => {
  it("키가 없으면 isConfigured() 가 false 이고 호출이 막힌다", async () => {
    const emptyConfig = { get: jest.fn((_k: string, d?: string) => d ?? "") };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NiceStdPaymentsGateway,
        { provide: ConfigService, useValue: emptyConfig },
      ],
    }).compile();
    const gateway = module.get<NiceStdPaymentsGateway>(NiceStdPaymentsGateway);

    expect(gateway.isConfigured()).toBe(false);
    expect(gateway.getMid()).toBe("");
    expect(gateway.getReturnUrl()).toBe("");
    expect(() =>
      gateway.buildPayRequest({
        orderNumber: "TRN-1",
        amount: 1000,
        goodsName: "수업",
        payMethod: "CARD",
      }),
    ).toThrow("나이스 구모듈 결제 설정이 없습니다.");
  });
});

describe("kstCompactToInstant", () => {
  it("YYMMDDHHMISS(KST) 를 UTC instant 로 변환한다", () => {
    expect(kstCompactToInstant("260918093015").toISOString()).toBe(
      "2026-09-18T00:30:15.000Z",
    );
    // KST 심야는 전일 UTC 가 된다.
    expect(kstCompactToInstant("260101003000").toISOString()).toBe(
      "2025-12-31T15:30:00.000Z",
    );
  });

  it("형식이 아니거나 존재하지 않는 시각이면 던진다", () => {
    expect(() => kstCompactToInstant("26091809301")).toThrow();
    expect(() => kstCompactToInstant("26091a093015")).toThrow();
    expect(() => kstCompactToInstant("261301093015")).toThrow();
    // ISO 파서가 다음 달로 굴려버리는 2월 31일도 거부한다.
    expect(() => kstCompactToInstant("260231093015")).toThrow();
    expect(() => kstCompactToInstant("260918253015")).toThrow();
  });
});
