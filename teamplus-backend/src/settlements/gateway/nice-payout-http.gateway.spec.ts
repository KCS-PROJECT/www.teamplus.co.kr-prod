import * as crypto from "crypto";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

jest.mock("axios", () => {
  const mockPost = jest.fn();
  return {
    create: jest.fn().mockReturnValue({ post: mockPost }),
    __mockPost: mockPost,
  };
});

import axios from "axios";
import {
  NICE_PAYOUT_DEFAULT_API_URL,
  NICE_PAYOUT_TIMEOUT_MS,
  NicePayoutHttpGateway,
} from "./nice-payout-http.gateway";
import { NiceSubMallRequest } from "./nice-payout.types";

// 규격 검증용 더미 값 — 실제 상점 키가 아니다.
const MID = "nictest00m";
const KEY = "dummy-merchant-key-not-real";
const ACCNT_NO = "110123456789";
const SUB_CO_NO = "1268262702";
// 01:02:03 UTC = 10:02:03 KST
const FIXED_NOW = new Date(Date.UTC(2026, 8, 30, 1, 2, 3));
const TR_DTM = "20260930100203";

const sha256hex = (s: string) =>
  crypto.createHash("sha256").update(s, "utf8").digest("hex");

const cfg = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

const fullEnv = { NICE_PAYOUT_MID: MID, NICE_PAYOUT_MERCHANT_KEY: KEY };

const getPost = () =>
  (axios as unknown as { __mockPost: jest.Mock }).__mockPost;

const subMall: NiceSubMallRequest = {
  subId: "TEAM-42",
  subNm: "테스트팀",
  subCoNo: SUB_CO_NO,
  bankCd: "004",
  accntNo: ACCNT_NO,
  accntNm: "홍길동",
  reqType: 0,
};

const okResponse = (sid: string, body: Record<string, unknown>) => ({
  status: 200,
  data: {
    header: { sid, trDtm: TR_DTM, gubun: "R", resCode: "0000", resMsg: "" },
    body: { mid: MID, ...body },
  },
});

const codeResponse = (sid: string, resCode: string, resMsg = "x") => ({
  status: 200,
  data: { header: { sid, gubun: "R", resCode, resMsg }, body: {} },
});

describe("NicePayoutHttpGateway", () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  const make = (env: Record<string, string> = fullEnv) =>
    new NicePayoutHttpGateway(cfg(env), () => FIXED_NOW);

  const allLogText = () =>
    [...logSpy.mock.calls, ...warnSpy.mock.calls]
      .map((c) => JSON.stringify(c))
      .join("\n");

  beforeEach(() => {
    getPost().mockReset();
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("axios 인스턴스 타임아웃 10초", () => {
    make();
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: NICE_PAYOUT_TIMEOUT_MS }),
    );
    expect(NICE_PAYOUT_TIMEOUT_MS).toBe(10_000);
  });

  describe("getBalance", () => {
    it("성공 — 규격 전문 구성과 remainAmt 숫자", async () => {
      getPost().mockResolvedValue(okResponse("0101001", { remainAmt: 77000 }));
      const r = await make().getBalance();

      expect(r.outcome).toBe("SUCCESS");
      expect(r.remainAmt).toBe(77000);
      expect(r.meta).toMatchObject({
        sid: "0101001",
        resCode: "0000",
        httpStatus: 200,
        error: null,
      });

      const [url, payload] = getPost().mock.calls[0];
      expect(url).toBe(NICE_PAYOUT_DEFAULT_API_URL);
      expect(payload).toEqual({
        header: {
          sid: "0101001",
          trDtm: TR_DTM,
          gubun: "S",
          resCode: "",
          resMsg: "",
        },
        body: {
          mid: MID,
          encKey: sha256hex("0101001" + MID + TR_DTM + KEY),
        },
      });
    });

    it("remainAmt 문자열 숫자는 변환, 비숫자는 null", async () => {
      getPost().mockResolvedValueOnce(
        okResponse("0101001", { remainAmt: "1500" }),
      );
      expect((await make().getBalance()).remainAmt).toBe(1500);
      getPost().mockResolvedValueOnce(
        okResponse("0101001", { remainAmt: "abc" }),
      );
      const r = await make().getBalance();
      expect(r.outcome).toBe("SUCCESS");
      expect(r.remainAmt).toBeNull();
    });

    it("NICE_PAYOUT_API_URL 지정 시 그 주소로 호출", async () => {
      getPost().mockResolvedValue(okResponse("0101001", { remainAmt: 0 }));
      await make({
        ...fullEnv,
        NICE_PAYOUT_API_URL: "https://x.test/om",
      }).getBalance();
      expect(getPost().mock.calls[0][0]).toBe("https://x.test/om");
    });

    it("1102 → TERMINAL, remainAmt null", async () => {
      getPost().mockResolvedValue(
        codeResponse("0101001", "1102", "잔액데이터가 없습니다"),
      );
      const r = await make().getBalance();
      expect(r.outcome).toBe("TERMINAL");
      expect(r.remainAmt).toBeNull();
      expect(r.meta.resCode).toBe("1102");
      expect(r.meta.resMsg).toBe("잔액데이터가 없습니다");
    });

    it("타임아웃 → AMBIGUOUS/timeout", async () => {
      getPost().mockRejectedValue(
        Object.assign(new Error("timeout of 10000ms exceeded"), {
          code: "ECONNABORTED",
        }),
      );
      const r = await make().getBalance();
      expect(r.outcome).toBe("AMBIGUOUS");
      expect(r.meta).toMatchObject({
        resCode: null,
        httpStatus: null,
        error: "timeout",
      });
    });

    it("연결 실패 → AMBIGUOUS/network", async () => {
      getPost().mockRejectedValue(
        Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        }),
      );
      const r = await make().getBalance();
      expect(r.outcome).toBe("AMBIGUOUS");
      expect(r.meta.error).toBe("network");
    });

    it("비2xx → AMBIGUOUS/invalid_response", async () => {
      getPost().mockResolvedValue({ status: 502, data: "<html>bad</html>" });
      const r = await make().getBalance();
      expect(r.outcome).toBe("AMBIGUOUS");
      expect(r.meta).toMatchObject({
        httpStatus: 502,
        error: "invalid_response",
      });
    });

    it.each([
      ["파싱 불가 문자열", "{not json"],
      ["header 없음", { body: { remainAmt: 1 } }],
      ["resCode 비문자열", { header: { resCode: 0 }, body: {} }],
      ["null", null],
    ])("잘못된 JSON(%s) → AMBIGUOUS/invalid_response", async (_n, data) => {
      getPost().mockResolvedValue({ status: 200, data });
      const r = await make().getBalance();
      expect(r.outcome).toBe("AMBIGUOUS");
      expect(r.meta.error).toBe("invalid_response");
      expect(r.remainAmt).toBeNull();
    });

    it("문자열 JSON 응답도 해석", async () => {
      getPost().mockResolvedValue({
        status: 200,
        data: JSON.stringify(okResponse("0101001", { remainAmt: 5 }).data),
      });
      const r = await make().getBalance();
      expect(r.outcome).toBe("SUCCESS");
      expect(r.remainAmt).toBe(5);
    });

    it.each([
      ["MID 없음", { NICE_PAYOUT_MERCHANT_KEY: KEY }],
      ["Key 없음", { NICE_PAYOUT_MID: MID }],
      ["공백", { NICE_PAYOUT_MID: " ", NICE_PAYOUT_MERCHANT_KEY: KEY }],
    ])("env 누락(%s) → 호출 없이 CONFIG/not_configured", async (_n, env) => {
      const gw = make(env as Record<string, string>);
      expect(gw.isConfigured()).toBe(false);
      const r = await gw.getBalance();
      expect(r.outcome).toBe("CONFIG");
      expect(r.meta.error).toBe("not_configured");
      expect(getPost()).not.toHaveBeenCalled();
    });

    it("예외를 던지지 않는다 — post 가 동기 throw 해도 결과 객체", async () => {
      getPost().mockImplementation(() => {
        throw new Error("boom");
      });
      await expect(make().getBalance()).resolves.toMatchObject({
        outcome: "AMBIGUOUS",
        meta: { error: "network" },
      });
    });
  });

  describe("upsertSubMall", () => {
    it("성공 — 규격 필드 전송(reqType 문자열)", async () => {
      getPost().mockResolvedValue(
        okResponse("0105001", { subId: "TEAM-42", reqType: "0" }),
      );
      const r = await make().upsertSubMall(subMall);
      expect(r.outcome).toBe("SUCCESS");
      expect(r.meta.sid).toBe("0105001");

      const [, payload] = getPost().mock.calls[0];
      expect(payload.header).toEqual({
        sid: "0105001",
        trDtm: TR_DTM,
        gubun: "S",
        resCode: "",
        resMsg: "",
      });
      expect(payload.body).toEqual({
        mid: MID,
        encKey: sha256hex("0105001" + MID + TR_DTM + KEY),
        subId: "TEAM-42",
        subNm: "테스트팀",
        subCoNo: SUB_CO_NO,
        bankCd: "004",
        accntNo: ACCNT_NO,
        accntNm: "홍길동",
        reqType: "0",
      });
    });

    it("수정 요청은 reqType '1'", async () => {
      getPost().mockResolvedValue(okResponse("0105001", {}));
      await make().upsertSubMall({ ...subMall, reqType: 1 });
      expect(getPost().mock.calls[0][1].body.reqType).toBe("1");
    });

    it.each([
      ["1003", "TERMINAL"],
      ["1106", "TERMINAL"],
      ["1105", "TERMINAL"],
      ["1000", "CONFIG"],
      ["8003", "AMBIGUOUS"],
    ])("resCode %s → %s", async (code, outcome) => {
      getPost().mockResolvedValue(codeResponse("0105001", code));
      const r = await make().upsertSubMall(subMall);
      expect(r.outcome).toBe(outcome);
      expect(r.meta.resCode).toBe(code);
    });

    it("로그·반환 meta 에 계좌번호·사업자번호·Key·encKey 가 없다", async () => {
      const encKey = sha256hex("0105001" + MID + TR_DTM + KEY);
      getPost().mockResolvedValue(
        codeResponse(
          "0105001",
          "1003",
          ["계좌성명 불일치", ACCNT_NO, SUB_CO_NO, KEY].join(" "),
        ),
      );
      const r = await make().upsertSubMall(subMall);
      const metaText = JSON.stringify(r);
      const logText = allLogText();
      for (const secret of [ACCNT_NO, SUB_CO_NO, KEY, encKey]) {
        expect(metaText).not.toContain(secret);
        expect(logText).not.toContain(secret);
      }
      expect(r.meta.resMsg).toContain("계좌성명 불일치");
      expect(logText).toContain("sid=0105001");
      expect(logText).toContain("subId=TEAM-42");
      expect(logText).toContain("resCode=1003");
    });

    it("타임아웃 로그·meta 에도 민감값 없음", async () => {
      getPost().mockRejectedValue(
        Object.assign(new Error("timeout " + ACCNT_NO), {
          code: "ECONNABORTED",
        }),
      );
      const r = await make().upsertSubMall(subMall);
      expect(r.outcome).toBe("AMBIGUOUS");
      expect(r.meta.error).toBe("timeout");
      expect(JSON.stringify(r)).not.toContain(ACCNT_NO);
      expect(allLogText()).not.toContain(ACCNT_NO);
    });
  });
});
