import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import {
  IIdentityGateway,
  IdentityRequestParams,
  IdentityRequestResult,
  IdentityCallbackParams,
  IdentityVerificationResult,
  SignatureVerificationResult,
  IdentityProvider,
} from "./identity-gateway.interface";
import {
  INICIS_IDENTITY_SAMPLE_API_KEY,
  INICIS_IDENTITY_SAMPLE_MID,
} from "@/config/identity.config";
import {
  SEED_UNAVAILABLE_MESSAGE,
  assertAuthRequestUrl,
  buildAuthHash,
  buildAutoSubmitForm,
  buildUserHash,
  deriveMTxId,
  isSeedCipherAvailable,
  seedDecrypt,
} from "./kg-inicis.crypto";

/** STEP3 결과조회 타임아웃 — 매뉴얼 권고 5초 */
const RESULT_QUERY_TIMEOUT_MS = 5000;

/** STEP3 결과조회 최대 시도 횟수 (최초 1 + 재시도 1) */
const RESULT_QUERY_MAX_ATTEMPTS = 2;

/** 재시도 백오프 */
const RESULT_QUERY_RETRY_DELAY_MS = 300;

/** 성공 결과코드 */
const RESULT_CODE_SUCCESS = "0000";

/** STEP4 결과조회 응답 (복호화 전) */
interface KgResultQueryResponse {
  resultCode?: string;
  resultMsg?: string;
  txId?: string;
  mTxId?: string;
  svcCd?: string;
  providerDevCd?: string;
  userName?: string;
  userPhone?: string;
  userBirthday?: string;
  userCi?: string;
}

/**
 * KG이니시스 통합인증 Gateway (직계약)
 *
 * 규격 SoT: docs/Reference/INICIS_UNIFIED_IDENTITY_API.md
 *
 * 흐름
 *   STEP1 createAuthRequest() → 자동 submit 폼 HTML (브라우저가 KG 인증창으로 POST)
 *   STEP2 KG → successUrl/failUrl 폼 POST (브라우저) → authRequestUrl · txId · token
 *   STEP3 processCallback() → authRequestUrl 로 서버-서버 결과조회 (JSON POST)
 *   STEP4 SEED 복호화 → 이름 · 휴대폰 · 생년월일 · CI
 *
 * CI 암호화·ciHash·상태 전이는 IdentityService 가 담당한다.
 * `reqSvcCd=01`(간편인증)은 DI · 성별 · 외국인 여부를 제공하지 않는다.
 */
@Injectable()
export class KgInicisIdentityGateway implements IIdentityGateway {
  private readonly logger = new Logger(KgInicisIdentityGateway.name);
  private readonly config: any;
  private readonly commonConfig: any;

  readonly providerName: IdentityProvider = "kg_inicis";

  constructor(private readonly configService: ConfigService) {
    const identityConfig = this.configService.get("identity");
    this.config = identityConfig.kgInicis;
    this.commonConfig = identityConfig.common;

    this.logger.log(
      `KG이니시스 통합인증 Gateway 초기화 (mid=${this.config.mid}, reqSvcCd=${this.config.reqSvcCd}, ` +
        `authUrl=${this.config.authUrl}, allowMissingCi=${this.config.allowMissingCi})`,
    );

    // 부팅은 막지 않는다 — 현재 운영 경로는 포트원이고, 여기서 끊으면 API 전체가 내려간다.
    if (!isSeedCipherAvailable()) {
      this.logger.warn(SEED_UNAVAILABLE_MESSAGE);
    }
    if (!this.hasCredentials()) {
      this.logger.warn(
        "KG 자격증명(INICIS_IDENTITY_MID / INICIS_IDENTITY_API_KEY / INICIS_IDENTITY_SEED_IV)이 비어 있습니다. " +
          ".env 에서 읽히지 않으면 KG 직결 인증 요청은 거부됩니다.",
      );
    }
  }

  /**
   * STEP1 — 통합인증 요청 폼 생성
   *
   * 회원가입은 인증 결과로 입력값을 자동채움하는 흐름이라 기본은 `flgFixedUser=N`.
   * 이름·휴대폰·생년월일이 모두 주어지면(기존 회원 재인증) 사용자 고정 + userHash 를 세팅한다.
   */
  async createAuthRequest(
    params: IdentityRequestParams,
  ): Promise<IdentityRequestResult> {
    const { requestId, purpose, userId, metadata } = params;

    // .env 가 유일한 출처다 — 코드 폴백을 두지 않아야 로딩 실패가 테스트 키로 위장되지 않는다.
    if (!this.hasCredentials()) {
      this.logger.error(
        "KG 자격증명이 비어 있어 인증 요청을 중단합니다. " +
          "INICIS_IDENTITY_MID / INICIS_IDENTITY_API_KEY / INICIS_IDENTITY_SEED_IV 를 .env 에 설정하세요.",
      );
      return {
        success: false,
        requestId,
        errorCode: "INICIS_CREDENTIALS_NOT_CONFIGURED",
        errorMessage: "본인인증 설정이 완료되지 않았습니다.",
      };
    }

    // 운영에서 공개 샘플 자격증명으로 인증이 나가는 것을 사용 시점에 차단한다.
    if (this.isProduction() && this.hasSampleCredentials()) {
      this.logger.error(
        "운영 환경에서 KG 공개 샘플 자격증명이 감지되어 인증 요청을 중단합니다. " +
          "INICIS_IDENTITY_MID / INICIS_IDENTITY_API_KEY 를 계약 값으로 설정하세요.",
      );
      return {
        success: false,
        requestId,
        errorCode: "INICIS_CREDENTIALS_NOT_CONFIGURED",
        errorMessage: "본인인증 설정이 완료되지 않았습니다.",
      };
    }

    try {
      const mid: string = this.config.mid;
      const reqSvcCd: string = this.config.reqSvcCd;
      const mTxId = deriveMTxId(requestId);
      const baseUrl: string = this.commonConfig.publicBaseUrl;

      const fields: Record<string, string | undefined> = {
        mid,
        reqSvcCd,
        mTxId,
        successUrl: `${baseUrl}/api/v1/identity/kg-inicis/success/${requestId}`,
        failUrl: `${baseUrl}/api/v1/identity/kg-inicis/fail/${requestId}`,
        authHash: buildAuthHash(mid, mTxId, this.config.apiKey),
        flgFixedUser: "N",
        // token 방식 SEED 복호화를 쓰려면 고정값
        reservedMsg: "isUseToken=Y",
      };

      const userName = metadata?.userName as string | undefined;
      const userPhone = metadata?.userPhone as string | undefined;
      const userBirth = metadata?.userBirth as string | undefined;
      if (userName && userPhone && userBirth) {
        fields.flgFixedUser = "Y";
        fields.userName = userName;
        fields.userPhone = userPhone;
        fields.userBirth = userBirth;
        fields.userHash = buildUserHash(
          userName,
          mid,
          userPhone,
          mTxId,
          userBirth,
          reqSvcCd,
        );
      }

      this.logger.log(
        `KG 통합인증 요청 생성: requestId=${requestId}, purpose=${purpose}, ` +
          `userId=${userId ?? "anonymous"}, flgFixedUser=${fields.flgFixedUser}`,
      );

      return {
        success: true,
        requestId,
        authHtml: buildAutoSubmitForm(this.config.authUrl, fields),
      };
    } catch (error: any) {
      this.logger.error(
        `KG 통합인증 요청 생성 실패: requestId=${requestId}, message=${error?.message}`,
      );
      return {
        success: false,
        requestId,
        errorCode: "AUTH_REQUEST_BUILD_FAILED",
        errorMessage: "본인인증 요청 생성에 실패했습니다.",
      };
    }
  }

  /**
   * STEP2 수신값 검증 → STEP3 결과조회 → STEP4 복호화
   *
   * 앞 단계가 실패하면 다음 단계로 진행하지 않는다.
   */
  async processCallback(
    params: IdentityCallbackParams,
  ): Promise<IdentityVerificationResult> {
    const { requestId, responseData } = params;

    const resultCode: string = responseData.resultCode ?? "";
    const resultMsg = this.decodeMsg(responseData.resultMsg);

    // 1) STEP2 결과코드
    if (resultCode !== RESULT_CODE_SUCCESS) {
      this.logger.warn(
        `KG 통합인증 실패 수신: requestId=${requestId}, resultCode=${resultCode}`,
      );
      return {
        success: false,
        requestId,
        errorCode: `KG_AUTH_${resultCode || "UNKNOWN"}`,
        errorMessage: resultMsg || "본인인증에 실패했습니다.",
      };
    }

    // 2) 결과조회 URL 검증 — 실패 시 절대 호출하지 않는다 (SSRF)
    const authRequestUrl: string | undefined = responseData.authRequestUrl;
    try {
      assertAuthRequestUrl(authRequestUrl, this.config.allowedResultHosts);
    } catch (error: any) {
      // 정상 흐름에서는 나올 수 없는 값 — 위변조 시도 신호로 취급한다.
      this.logger.error(
        `KG 결과조회 URL 검증 실패(위변조 의심): requestId=${requestId}, reason=${error?.message}`,
      );
      return {
        success: false,
        requestId,
        errorCode: "INVALID_RESULT_URL",
        errorMessage: "인증 결과 조회 주소가 유효하지 않습니다.",
      };
    }

    const txId: string | undefined = responseData.txId;
    if (!txId) {
      this.logger.warn(`KG txId 누락: requestId=${requestId}`);
      return {
        success: false,
        requestId,
        errorCode: "TXID_MISSING",
        errorMessage: "인증 트랜잭션 정보가 없습니다.",
      };
    }

    const token: string | undefined = responseData.token;
    if (!token) {
      this.logger.warn(`KG token 누락: requestId=${requestId}`);
      return {
        success: false,
        requestId,
        errorCode: "TOKEN_MISSING",
        errorMessage: "인증 결과를 복호화할 수 없습니다.",
      };
    }

    // 3) STEP3 결과조회 (서버-서버)
    //    결과조회는 멱등하므로 타임아웃·5xx·네트워크 오류는 1회 재시도한다.
    //    (한 번 실패로 끊으면 인증 1건이 영구 소각된다)
    let queried: KgResultQueryResponse | undefined;
    for (let attempt = 1; attempt <= RESULT_QUERY_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await axios.post<KgResultQueryResponse>(
          authRequestUrl as string,
          { mid: this.config.mid, txId },
          {
            timeout: RESULT_QUERY_TIMEOUT_MS,
            maxRedirects: 0,
            headers: {
              "Content-Type": "application/json;charset=utf-8",
              Accept: "application/json",
            },
          },
        );
        queried = res.data ?? {};
        break;
      } catch (error: any) {
        const status: number | undefined = error?.response?.status;
        // 응답이 없으면(타임아웃·네트워크) 또는 5xx 면 재시도 대상. 4xx 는 재시도해도 같다.
        const retryable = status === undefined || status >= 500;
        const canRetry = attempt < RESULT_QUERY_MAX_ATTEMPTS && retryable;

        this.logger.error(
          `KG 결과조회 호출 실패(${attempt}/${RESULT_QUERY_MAX_ATTEMPTS}): requestId=${requestId}, ` +
            `status=${status ?? "NETWORK"}, code=${error?.code ?? "-"}, retry=${canRetry}`,
        );

        if (canRetry) {
          await this.delay(RESULT_QUERY_RETRY_DELAY_MS);
          continue;
        }

        return {
          success: false,
          requestId,
          errorCode: `RESULT_QUERY_FAILED_${status ?? error?.code ?? "NETWORK"}`,
          errorMessage: "인증 결과 조회에 실패했습니다.",
        };
      }
    }

    if (!queried) {
      return {
        success: false,
        requestId,
        errorCode: "RESULT_QUERY_FAILED_EMPTY",
        errorMessage: "인증 결과 조회에 실패했습니다.",
      };
    }

    // 4) STEP4 결과코드
    if (queried.resultCode !== RESULT_CODE_SUCCESS) {
      this.logger.warn(
        `KG 결과조회 실패: requestId=${requestId}, resultCode=${queried.resultCode}`,
      );
      return {
        success: false,
        requestId,
        errorCode: `KG_RESULT_${queried.resultCode || "UNKNOWN"}`,
        errorMessage:
          this.decodeMsg(queried.resultMsg) || "본인인증에 실패했습니다.",
      };
    }

    // 5) 최초 요청자 일치 확인 — 다른 트랜잭션 결과가 섞여 들어오는 것을 차단
    const expectedMTxId = deriveMTxId(requestId);
    if (queried.mTxId !== expectedMTxId) {
      this.logger.error(
        `KG mTxId 불일치: requestId=${requestId} (위변조 의심)`,
      );
      return {
        success: false,
        requestId,
        errorCode: "MTXID_MISMATCH",
        errorMessage: "인증 요청 정보가 일치하지 않습니다.",
      };
    }
    if (queried.txId !== txId) {
      this.logger.error(`KG txId 불일치: requestId=${requestId} (위변조 의심)`);
      return {
        success: false,
        requestId,
        errorCode: "TXID_MISMATCH",
        errorMessage: "인증 요청 정보가 일치하지 않습니다.",
      };
    }

    // 6) SEED 복호화 — 실패 시 평문 폴백 없이 실패 처리
    let name: string | undefined;
    let phone: string | undefined;
    let birthDate: string | undefined;
    let ci: string | undefined;
    try {
      const iv: string = this.config.seedIv;
      name = this.decryptOptional(queried.userName, token, iv);
      phone = this.decryptOptional(queried.userPhone, token, iv);
      birthDate = this.decryptOptional(queried.userBirthday, token, iv);
      ci = this.decryptOptional(queried.userCi, token, iv);
    } catch (error: any) {
      this.logger.error(
        `KG SEED 복호화 실패: requestId=${requestId}, message=${error?.message}`,
      );
      return {
        success: false,
        requestId,
        errorCode: "DECRYPT_FAILED",
        errorMessage: "인증 정보를 복호화하지 못했습니다.",
      };
    }

    // 7) CI 부재 — 카카오 등 제한적 제공 케이스. 기본은 실패, 스위치로만 통과.
    if (!ci) {
      if (!this.config.allowMissingCi) {
        this.logger.warn(`KG CI 미제공: requestId=${requestId}`);
        return {
          success: false,
          requestId,
          errorCode: "CI_MISSING",
          errorMessage: "인증 기관에서 연계정보(CI)를 제공하지 않았습니다.",
        };
      }
      this.logger.warn(
        `KG CI 미제공이나 허용 설정으로 진행: requestId=${requestId}, provider=${queried.providerDevCd ?? "-"}`,
      );
    }

    this.logger.log(
      `KG 통합인증 완료: requestId=${requestId}, provider=${queried.providerDevCd ?? "-"}`,
    );

    return {
      success: true,
      requestId,
      ci,
      name,
      phone: this.normalizePhone(phone),
      birthDate: this.normalizeBirthDate(birthDate),
      verifiedAt: new Date(),
    };
  }

  /**
   * 서명 검증
   *
   * 통합인증은 가맹점 → KG 방향의 authHash 만 규정하고, 콜백 방향 서명은 없다.
   * 무결성은 STEP3 서버-서버 결과조회 + mTxId/txId 대조로 보장한다.
   */
  verifySignature(
    _data: Record<string, any>,
    _signature: string,
  ): SignatureVerificationResult {
    return { valid: true };
  }

  /**
   * IP 화이트리스트 검증 — 항상 허용.
   *
   * STEP2 successUrl/failUrl 은 KG 서버가 아니라 **사용자 브라우저**가 폼 POST 한다.
   * 따라서 KG IP 대역으로 검사하면 정상 인증이 전부 차단된다.
   * 실제 신뢰 경계는 STEP3 서버-서버 결과조회이며, 그 결과만 인증 성공 근거로 쓴다.
   */
  verifyIpWhitelist(_ip: string): boolean {
    return true;
  }

  /**
   * SEED 복호화 유틸 (배치·점검용).
   *
   * SEED 키는 트랜잭션마다 다른 STEP2 token 이라 단일 인자로는 복호화할 수 없다.
   * `{"token":"<base64>","fields":{"userCi":"<base64>"}}` 형태 JSON 을 받는다.
   */
  async decryptData(encryptedData: string): Promise<Record<string, any>> {
    const parsed = JSON.parse(encryptedData) as {
      token?: string;
      fields?: Record<string, string>;
    };
    if (!parsed?.token || !parsed?.fields) {
      throw new Error(
        "복호화 입력 형식이 올바르지 않습니다. { token, fields } 가 필요합니다.",
      );
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.fields)) {
      result[key] = seedDecrypt(value, parsed.token, this.config.seedIv);
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────

  private isProduction(): boolean {
    return (process.env.NODE_ENV ?? "").toLowerCase() === "production";
  }

  /** mid · apiKey · seedIv 가 전부 채워져 있는지 — .env 로딩 실패를 사용 시점에 드러내기 위한 검사. */
  private hasCredentials(): boolean {
    return (
      Boolean(this.config.mid) &&
      Boolean(this.config.apiKey) &&
      Boolean(this.config.seedIv)
    );
  }

  /** 공개 샘플 자격증명 사용 여부 — mid 또는 apiKey 둘 중 하나라도 샘플이면 미설정으로 본다. */
  private hasSampleCredentials(): boolean {
    return (
      this.config.mid === INICIS_IDENTITY_SAMPLE_MID ||
      this.config.apiKey === INICIS_IDENTITY_SAMPLE_API_KEY
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private decryptOptional(
    value: string | undefined,
    token: string,
    iv: string,
  ): string | undefined {
    if (!value) return undefined;
    return seedDecrypt(value, token, iv);
  }

  /** resultMsg 는 UTF-8 urlEncoding 으로 온다. 디코딩 실패 시 원문 유지. */
  private decodeMsg(msg: string | undefined): string | undefined {
    if (!msg) return undefined;
    try {
      return decodeURIComponent(msg);
    } catch {
      return msg;
    }
  }

  private normalizePhone(phone: string | undefined): string | undefined {
    if (!phone) return undefined;
    return phone.replace(/[^0-9]/g, "");
  }

  /** 다른 Gateway 와 통일해 YYYYMMDD 로 정규화 */
  private normalizeBirthDate(birth: string | undefined): string | undefined {
    if (!birth) return undefined;
    const digits = birth.replace(/[^0-9]/g, "");
    return digits.length === 8 ? digits : birth;
  }
}
