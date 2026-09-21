import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { KgInicisIdentityGateway } from "./kg-inicis-identity.gateway";
import { deriveMTxId, seedEncrypt } from "./kg-inicis.crypto";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const MID = "INIiasTest";
const API_KEY = "TGdxb2l3enJDWFRTbTgvREU3MGYwUT09";
const SEED_IV = "SASKGINICIS00000";
const TOKEN = Buffer.alloc(16, 7).toString("base64");
const REQUEST_ID = "idv_0123456789abcdef0123456789abcdef";
const TX_ID = "TXID-0001";
const RESULT_URL = "https://kssa.inicis.com/api/result";

type ConfigOverrides = {
  allowMissingCi?: boolean;
  mid?: string;
  apiKey?: string;
  seedIv?: string;
};

function buildConfig(overrides: ConfigOverrides = {}) {
  return {
    kgInicis: {
      mid: overrides.mid ?? MID,
      apiKey: overrides.apiKey ?? API_KEY,
      seedIv: overrides.seedIv ?? SEED_IV,
      reqSvcCd: "01",
      authUrl: "https://sa.inicis.com/auth",
      allowedResultHosts: ["kssa.inicis.com", "fcsa.inicis.com"],
      allowMissingCi: overrides.allowMissingCi ?? false,
    },
    common: {
      publicBaseUrl: "http://localhost:5003",
      returnBaseUrl: "http://localhost:5001/identity/result",
      httpTimeout: 30000,
    },
  };
}

function createGateway(overrides: ConfigOverrides = {}) {
  const configService = {
    get: jest.fn().mockReturnValue(buildConfig(overrides)),
  } as unknown as ConfigService;
  return new KgInicisIdentityGateway(configService);
}

/** STEP4 정상 응답 (SEED 암호문) */
function buildQueryResponse(overrides: Record<string, unknown> = {}) {
  return {
    resultCode: "0000",
    resultMsg: "success",
    txId: TX_ID,
    mTxId: deriveMTxId(REQUEST_ID),
    providerDevCd: "TOSS",
    userName: seedEncrypt("홍길동", TOKEN, SEED_IV),
    userPhone: seedEncrypt("01012345678", TOKEN, SEED_IV),
    userBirthday: seedEncrypt("19900315", TOKEN, SEED_IV),
    userCi: seedEncrypt("CI_VALUE_0123456789", TOKEN, SEED_IV),
    ...overrides,
  };
}

/** STEP2 브라우저 폼 POST 로 들어오는 값 */
function callbackParams(overrides: Record<string, unknown> = {}) {
  return {
    requestId: REQUEST_ID,
    responseData: {
      resultCode: "0000",
      authRequestUrl: RESULT_URL,
      txId: TX_ID,
      token: TOKEN,
      ...overrides,
    },
  };
}

describe("KgInicisIdentityGateway", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createAuthRequest", () => {
    it("규격 필수 파라미터를 모두 담은 자동 submit 폼을 반환한다", async () => {
      const result = await createGateway().createAuthRequest({
        requestId: REQUEST_ID,
        purpose: "registration",
      });

      expect(result.success).toBe(true);
      expect(result.authUrl).toBeUndefined();

      const html = result.authHtml as string;
      expect(html).toContain('action="https://sa.inicis.com/auth"');
      expect(html).toContain(`value="${MID}"`);
      expect(html).toContain('name="reqSvcCd"');
      expect(html).toContain(`value="${deriveMTxId(REQUEST_ID)}"`);
      expect(html).toContain('name="authHash"');
      expect(html).toContain(
        `value="http://localhost:5003/api/v1/identity/kg-inicis/success/${REQUEST_ID}"`,
      );
      expect(html).toContain(
        `value="http://localhost:5003/api/v1/identity/kg-inicis/fail/${REQUEST_ID}"`,
      );
    });

    it("reservedMsg 는 isUseToken=Y 고정이다", async () => {
      const result = await createGateway().createAuthRequest({
        requestId: REQUEST_ID,
        purpose: "registration",
      });

      expect(result.authHtml).toContain(
        '<input type="hidden" name="reservedMsg" value="isUseToken=Y" />',
      );
    });

    it("기본 flgFixedUser 는 N 이고 userHash 를 보내지 않는다", async () => {
      const result = await createGateway().createAuthRequest({
        requestId: REQUEST_ID,
        purpose: "registration",
      });

      expect(result.authHtml).toContain(
        '<input type="hidden" name="flgFixedUser" value="N" />',
      );
      expect(result.authHtml).not.toContain('name="userHash"');
      expect(result.authHtml).not.toContain('name="userName"');
    });

    it("metadata 로 이름·휴대폰·생년월일이 모두 오면 사용자 고정 + userHash 를 세팅한다", async () => {
      const result = await createGateway().createAuthRequest({
        requestId: REQUEST_ID,
        purpose: "profile_update",
        metadata: {
          userName: "홍길동",
          userPhone: "01012345678",
          userBirth: "19900315",
        },
      });

      expect(result.authHtml).toContain(
        '<input type="hidden" name="flgFixedUser" value="Y" />',
      );
      expect(result.authHtml).toContain('name="userHash"');
      expect(result.authHtml).toContain('value="홍길동"');
    });

    describe("운영 환경 자격증명 가드", () => {
      const originalEnv = process.env.NODE_ENV;

      afterEach(() => {
        process.env.NODE_ENV = originalEnv;
      });

      it("production 에서 공개 샘플 MID 면 인증 요청을 거부한다", async () => {
        process.env.NODE_ENV = "production";

        const result = await createGateway().createAuthRequest({
          requestId: REQUEST_ID,
          purpose: "registration",
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe("INICIS_CREDENTIALS_NOT_CONFIGURED");
        expect(result.authHtml).toBeUndefined();
      });

      it("production 에서 공개 샘플 apiKey 면 인증 요청을 거부한다", async () => {
        process.env.NODE_ENV = "production";

        const result = await createGateway({
          mid: "CIC0000001",
        }).createAuthRequest({
          requestId: REQUEST_ID,
          purpose: "registration",
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe("INICIS_CREDENTIALS_NOT_CONFIGURED");
      });

      it("production 이라도 계약 자격증명이면 정상 생성한다", async () => {
        process.env.NODE_ENV = "production";

        const result = await createGateway({
          mid: "CIC0000001",
          apiKey: "contract-api-key",
        }).createAuthRequest({
          requestId: REQUEST_ID,
          purpose: "registration",
        });

        expect(result.success).toBe(true);
        expect(result.authHtml).toContain('value="CIC0000001"');
      });

      it("개발 환경에서는 샘플 자격증명으로도 동작한다", async () => {
        process.env.NODE_ENV = "development";

        const result = await createGateway().createAuthRequest({
          requestId: REQUEST_ID,
          purpose: "registration",
        });

        expect(result.success).toBe(true);
      });

      // .env 가 유일한 출처 — 비어 있으면 개발 환경에서도 거부해야 로딩 실패가 드러난다.
      it("mid 가 비어 있으면 개발 환경에서도 거부한다", async () => {
        process.env.NODE_ENV = "development";

        const result = await createGateway({ mid: "" }).createAuthRequest({
          requestId: REQUEST_ID,
          purpose: "registration",
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe("INICIS_CREDENTIALS_NOT_CONFIGURED");
        expect(result.authHtml).toBeUndefined();
      });

      it("apiKey 가 비어 있으면 개발 환경에서도 거부한다", async () => {
        process.env.NODE_ENV = "development";

        const result = await createGateway({ apiKey: "" }).createAuthRequest({
          requestId: REQUEST_ID,
          purpose: "registration",
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe("INICIS_CREDENTIALS_NOT_CONFIGURED");
      });

      it("seedIv 가 비어 있으면 개발 환경에서도 거부한다", async () => {
        process.env.NODE_ENV = "development";

        const result = await createGateway({ seedIv: "" }).createAuthRequest({
          requestId: REQUEST_ID,
          purpose: "registration",
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe("INICIS_CREDENTIALS_NOT_CONFIGURED");
      });
    });

    it("일부만 오면 사용자 고정을 쓰지 않는다", async () => {
      const result = await createGateway().createAuthRequest({
        requestId: REQUEST_ID,
        purpose: "registration",
        metadata: { userName: "홍길동" },
      });

      expect(result.authHtml).toContain(
        '<input type="hidden" name="flgFixedUser" value="N" />',
      );
      expect(result.authHtml).not.toContain('name="userHash"');
    });
  });

  describe("processCallback", () => {
    it("정상 흐름에서 복호화된 인증 정보를 반환한다", async () => {
      mockedAxios.post.mockResolvedValue({ data: buildQueryResponse() });

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(true);
      expect(result.name).toBe("홍길동");
      expect(result.phone).toBe("01012345678");
      expect(result.birthDate).toBe("19900315");
      expect(result.ci).toBe("CI_VALUE_0123456789");
      // reqSvcCd=01(간편인증)은 DI·성별·외국인 여부를 제공하지 않는다.
      expect(result.di).toBeUndefined();
      expect(result.gender).toBeUndefined();
      expect(result.isForeigner).toBeUndefined();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        RESULT_URL,
        { mid: MID, txId: TX_ID },
        expect.objectContaining({ timeout: 5000, maxRedirects: 0 }),
      );
    });

    it("STEP2 resultCode 가 0000 이 아니면 결과조회를 호출하지 않는다", async () => {
      const result = await createGateway().processCallback(
        callbackParams({ resultCode: "9999", resultMsg: "%EC%B7%A8%EC%86%8C" }),
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("KG_AUTH_9999");
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("authRequestUrl 검증 실패 시 axios 를 호출하지 않는다 (SSRF 차단)", async () => {
      const result = await createGateway().processCallback(
        callbackParams({
          authRequestUrl: "https://kssa.inicis.com.evil.io/api/result",
        }),
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_RESULT_URL");
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("token 이 없으면 결과조회를 호출하지 않는다", async () => {
      const result = await createGateway().processCallback(
        callbackParams({ token: undefined }),
      );

      expect(result.errorCode).toBe("TOKEN_MISSING");
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("STEP4 resultCode 가 0000 이 아니면 실패로 끊는다", async () => {
      mockedAxios.post.mockResolvedValue({
        data: buildQueryResponse({ resultCode: "1001" }),
      });

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("KG_RESULT_1001");
    });

    it("mTxId 가 다르면 MTXID_MISMATCH 로 실패한다", async () => {
      mockedAxios.post.mockResolvedValue({
        data: buildQueryResponse({ mTxId: "OTHER_TRANSACTION01" }),
      });

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("MTXID_MISMATCH");
    });

    it("txId 가 다르면 실패한다", async () => {
      mockedAxios.post.mockResolvedValue({
        data: buildQueryResponse({ txId: "TXID-OTHER" }),
      });

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("TXID_MISMATCH");
    });

    it("결과조회가 두 번 다 타임아웃이면 실패로 매핑된다", async () => {
      mockedAxios.post.mockRejectedValue(
        Object.assign(new Error("timeout of 5000ms exceeded"), {
          code: "ECONNABORTED",
        }),
      );

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("RESULT_QUERY_FAILED_ECONNABORTED");
      // 1회 재시도 — 한 번 실패로 인증 1건을 소각하지 않는다.
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it("타임아웃 후 재시도가 성공하면 인증이 완료된다", async () => {
      mockedAxios.post
        .mockRejectedValueOnce(
          Object.assign(new Error("timeout"), { code: "ECONNABORTED" }),
        )
        .mockResolvedValueOnce({ data: buildQueryResponse() });

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(true);
      expect(result.name).toBe("홍길동");
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it("5xx 는 재시도한다", async () => {
      mockedAxios.post
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce({ data: buildQueryResponse() });

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it("4xx 는 재시도하지 않는다", async () => {
      mockedAxios.post.mockRejectedValue({ response: { status: 400 } });

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("RESULT_QUERY_FAILED_400");
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("resultCode 로 실패가 확정되면 재시도하지 않는다", async () => {
      mockedAxios.post.mockResolvedValue({
        data: buildQueryResponse({ resultCode: "1001" }),
      });

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(false);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("복호화 실패 시 평문 폴백 없이 DECRYPT_FAILED 로 끊는다", async () => {
      mockedAxios.post.mockResolvedValue({
        data: buildQueryResponse({ userName: "홍길동" }), // 평문이 섞여 들어온 상황
      });

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("DECRYPT_FAILED");
      expect(result.name).toBeUndefined();
      expect(result.ci).toBeUndefined();
    });

    it("CI 부재 + 허용 안 함(기본) → CI_MISSING 실패", async () => {
      mockedAxios.post.mockResolvedValue({
        data: buildQueryResponse({ userCi: undefined }),
      });

      const result = await createGateway().processCallback(callbackParams());

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("CI_MISSING");
    });

    it("CI 부재 + 허용 스위치 ON → 성공 처리", async () => {
      mockedAxios.post.mockResolvedValue({
        data: buildQueryResponse({ userCi: undefined }),
      });

      const result = await createGateway({
        allowMissingCi: true,
      }).processCallback(callbackParams());

      expect(result.success).toBe(true);
      expect(result.ci).toBeUndefined();
      expect(result.name).toBe("홍길동");
    });
  });

  describe("verifyIpWhitelist", () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it("production 에서도 항상 true — STEP2 는 KG 서버가 아니라 사용자 브라우저가 POST 한다", () => {
      process.env.NODE_ENV = "production";
      const gateway = createGateway();

      expect(gateway.verifyIpWhitelist("1.2.3.4")).toBe(true);
      expect(gateway.verifyIpWhitelist("::1")).toBe(true);
    });
  });

  describe("verifySignature", () => {
    it("콜백 방향 서명 규격이 없으므로 항상 valid", () => {
      expect(createGateway().verifySignature({}, "")).toEqual({ valid: true });
    });
  });
});
