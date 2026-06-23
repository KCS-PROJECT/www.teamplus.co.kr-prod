import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import {
  IIdentityGateway,
  IdentityRequestParams,
  IdentityRequestResult,
  IdentityCallbackParams,
  IdentityVerificationResult,
  SignatureVerificationResult,
  IdentityProvider,
} from "./identity-gateway.interface";

/**
 * 포트원(PortOne) 본인인증 Gateway — KG이니시스 통합인증 경유 (2026-05-26 결정)
 *
 * 결제는 토스페이먼츠 직접 SDK, 본인인증만 포트원 V2 SDK 를 통해
 * KG이니시스 통합본인인증을 호출하는 구조.
 *
 * 흐름 (다른 4-gateway 와 다름 — 클라이언트 SDK 주도):
 *   1. createAuthRequest()  → storeId/channelKey/requestId metadata 반환
 *      (다른 Gateway 의 authUrl 대신 SDK 파라미터를 metadata 로 회신)
 *   2. 프론트 @portone/browser-sdk:
 *        PortOne.requestIdentityVerification({ storeId, channelKey,
 *          identityVerificationId: requestId })
 *      → KG 통합인증창 노출 → 사용자 인증 완료
 *   3. 프론트가 백엔드 호출:
 *        POST /api/v1/identity/callback/portone
 *          { identityVerificationId, requestId }
 *   4. processCallback() → GET https://api.portone.io/identity-verifications/{id}
 *        Authorization: PortOne {apiSecret}
 *      → 인증 결과 (CI/DI/이름/생년월일/성별/휴대폰/통신사) 수신
 */
@Injectable()
export class PortOneIdentityGateway implements IIdentityGateway {
  private readonly logger = new Logger(PortOneIdentityGateway.name);
  private readonly config: any;

  private readonly http: AxiosInstance;

  readonly providerName: IdentityProvider = "portone" as IdentityProvider;

  constructor(private readonly configService: ConfigService) {
    const identityConfig = this.configService.get("identity");
    this.config = identityConfig.portone;

    this.http = axios.create({
      baseURL: this.config.apiBaseUrl,
      timeout: identityConfig.common.httpTimeout,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(this.config.apiSecret && {
          Authorization: `PortOne ${this.config.apiSecret}`,
        }),
      },
    });

    this.logger.log(
      `PortOne 본인인증 Gateway 초기화 (mode=${this.config.mode}, channelKey=${this.maskKey(this.config.channelKey)}, apiSecret=${this.config.apiSecret ? "설정됨" : "비어있음 (테스트 모드)"})`,
    );
  }

  /**
   * 인증 요청 생성
   *
   * 다른 Gateway 와 달리 URL/HTML 을 반환하지 않고, 클라이언트 SDK 호출에
   * 필요한 storeId/channelKey/requestId 를 metadata 로 회신한다.
   */
  async createAuthRequest(
    params: IdentityRequestParams,
  ): Promise<IdentityRequestResult> {
    const { requestId, purpose, userId } = params;

    this.logger.log(
      `PortOne 인증 요청 생성: requestId=${requestId}, purpose=${purpose}, userId=${userId ?? "anonymous"}`,
    );

    if (!this.config.channelKey) {
      this.logger.error("PortOne channelKey 미설정 — 환경변수 확인 필요");
      return {
        success: false,
        requestId,
        errorCode: "PORTONE_CONFIG_MISSING",
        errorMessage: "포트원 채널키가 설정되지 않았습니다.",
      };
    }

    return {
      success: true,
      requestId,
      // 클라이언트 SDK 호출에 필요한 파라미터를 authHtml 자리 대신
      // 별도 metadata 형태로 회신 (Service 가 InitiateIdentityResponseDto 로 전달).
      // - 프론트는 InitiateIdentityResponseDto.authParams 를 읽어 SDK 에 그대로 주입.
      authHtml: JSON.stringify({
        provider: "portone",
        storeId: this.config.storeId,
        channelKey: this.config.channelKey,
        identityVerificationId: requestId,
      }),
    };
  }

  /**
   * 콜백 처리
   *
   * 프론트가 SDK 인증 성공 후 백엔드로 보낸 identityVerificationId 로
   * PortOne REST API 를 호출해 인증 결과를 가져온다.
   */
  async processCallback(
    params: IdentityCallbackParams,
  ): Promise<IdentityVerificationResult> {
    const { requestId, responseData } = params;

    // 클라이언트가 전달한 identityVerificationId 우선, 없으면 requestId 사용
    const idvId =
      responseData.identityVerificationId ||
      responseData.identity_verification_id ||
      requestId;

    this.logger.log(
      `PortOne 콜백 처리: requestId=${requestId}, identityVerificationId=${idvId}`,
    );

    if (!this.config.apiSecret) {
      this.logger.error(
        "PortOne apiSecret 미설정 — 환경변수 PORTONE_API_SECRET 필요",
      );
      return {
        success: false,
        requestId,
        errorCode: "PORTONE_API_SECRET_MISSING",
        errorMessage: "포트원 API 시크릿이 설정되지 않았습니다.",
      };
    }

    try {
      const res = await this.http.get(
        `/identity-verifications/${encodeURIComponent(idvId)}`,
      );
      const data = res.data;

      // 상태 확인 — VERIFIED 외에는 실패 처리
      const status: string = data?.status ?? "";
      if (status !== "VERIFIED") {
        this.logger.warn(
          `PortOne 인증 미완료: status=${status}, requestId=${requestId}`,
        );
        return {
          success: false,
          requestId,
          errorCode: `PORTONE_STATUS_${status || "UNKNOWN"}`,
          errorMessage: `포트원 인증이 완료되지 않았습니다 (status=${status}).`,
        };
      }

      const v = data?.verifiedCustomer ?? {};
      return {
        success: true,
        requestId,
        ci: v.ci,
        di: v.di,
        name: v.name,
        phone: v.phoneNumber,
        birthDate: this.normalizeBirthDate(v.birthDate),
        gender: this.normalizeGender(v.gender),
        carrier: v.operator || v.carrier,
        isForeigner: v.isForeigner ?? false,
        verifiedAt: data?.verifiedAt ? new Date(data.verifiedAt) : new Date(),
      };
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      this.logger.error(
        `PortOne API 호출 실패: status=${status}, body=${JSON.stringify(body)}`,
        error?.stack,
      );
      return {
        success: false,
        requestId,
        errorCode: `PORTONE_API_ERROR_${status ?? "NETWORK"}`,
        errorMessage:
          body?.message || error?.message || "포트원 API 호출 중 오류 발생",
      };
    }
  }

  /**
   * 서명 검증
   *
   * PortOne V2 는 클라이언트 SDK 가 KG 와 직접 통신하며,
   * 백엔드 검증은 apiSecret 기반 REST API 호출 결과를 신뢰한다.
   * 별도 콜백 서명은 사용하지 않으므로 항상 valid 반환.
   */
  verifySignature(
    _data: Record<string, any>,
    _signature: string,
  ): SignatureVerificationResult {
    return { valid: true };
  }

  /**
   * IP 화이트리스트 검증
   *
   * 콜백이 PortOne → 백엔드 형태가 아닌 클라이언트 → 백엔드 형태이므로
   * IP whitelist 검증 대신 JWT 인증 또는 apiSecret 기반 결과 조회로 보안 유지.
   */
  verifyIpWhitelist(_ip: string): boolean {
    return true;
  }

  /**
   * 데이터 복호화
   *
   * PortOne REST API 가 평문 JSON 으로 반환하므로 복호화 불필요.
   */
  async decryptData(encryptedData: string): Promise<Record<string, any>> {
    try {
      return JSON.parse(encryptedData);
    } catch {
      return { raw: encryptedData };
    }
  }

  // ─────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────

  private normalizeGender(gender: string | undefined): string | undefined {
    if (!gender) return undefined;
    const g = String(gender).toUpperCase();
    if (g === "M" || g === "MALE" || g === "1") return "M";
    if (g === "F" || g === "FEMALE" || g === "2") return "F";
    return gender;
  }

  /**
   * PortOne 은 birthDate 를 ISO (YYYY-MM-DD) 로 반환.
   * 기존 4-gateway 와 통일하기 위해 YYYYMMDD 로 정규화.
   */
  private normalizeBirthDate(birthDate: string | undefined): string | undefined {
    if (!birthDate) return undefined;
    const digits = String(birthDate).replace(/[-/]/g, "");
    return digits.length === 8 ? digits : birthDate;
  }

  private maskKey(key: string | undefined): string {
    if (!key) return "(empty)";
    if (key.length < 12) return "***";
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
  }
}
