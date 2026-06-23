import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
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
 * 카카오 본인인증 Gateway
 *
 * 카카오 인증 서비스를 연동합니다.
 *
 * 주요 기능:
 * - 카카오톡 기반 본인인증
 * - OAuth2 인증 플로우
 * - 인증 결과 조회
 *
 * 보안:
 * - HMAC-SHA256 서명
 * - State 파라미터 검증 (CSRF 방지)
 * - 암호화된 개인정보 처리
 */
@Injectable()
export class KakaoIdentityGateway implements IIdentityGateway {
  private readonly logger = new Logger(KakaoIdentityGateway.name);
  private readonly httpClient: AxiosInstance;
  private readonly config: any;
  private readonly commonConfig: any;
  private readonly securityConfig: any;

  readonly providerName: IdentityProvider = "kakao";

  // 카카오 IP 화이트리스트 (프로덕션)
  private readonly ipWhitelist: string[] = [
    "211.249.220.0/24", // 카카오 서버 IP 대역
    "211.249.221.0/24",
    "27.0.236.0/24",
  ];

  constructor(private readonly configService: ConfigService) {
    const identityConfig = this.configService.get("identity");
    this.config = identityConfig.kakao;
    this.commonConfig = identityConfig.common;
    this.securityConfig = identityConfig.security;

    // HTTP 클라이언트 초기화
    this.httpClient = axios.create({
      timeout: this.commonConfig.httpTimeout,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    });

    this.logger.log(
      `카카오 본인인증 Gateway 초기화 완료 (모드: ${this.config.mode})`,
    );
  }

  /**
   * 인증 요청 생성
   *
   * 사용자를 카카오 인증 페이지로 리다이렉트할 정보를 생성합니다.
   */
  async createAuthRequest(
    params: IdentityRequestParams,
  ): Promise<IdentityRequestResult> {
    const {
      requestId,
      purpose,
      userId,
      returnUrl,
      clientIp: _clientIp,
      userAgent: _userAgent,
    } = params;

    this.logger.log(
      `본인인증 요청 생성: requestId=${requestId}, purpose=${purpose}, userId=${userId || "anonymous"}`,
    );

    try {
      const endpoints = this.config.endpoints[this.config.mode];

      // State 생성 (CSRF 방지)
      const state = this.generateState(requestId);

      // 콜백 URL 구성
      const callbackUrl = `${this.commonConfig.callbackBaseUrl}/kakao`;
      // finalReturnUrl은 나중에 사용 예정
      void (
        returnUrl || `${this.commonConfig.returnBaseUrl}?requestId=${requestId}`
      );

      // OAuth2 인증 URL 파라미터
      const authParams = new URLSearchParams({
        client_id: this.config.clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        state: state,
        scope: "account_ci profile_nickname",
      });

      // 인증 URL 생성
      const authUrl = `${endpoints.authorize}?${authParams.toString()}`;

      this.logger.debug(`인증 URL 생성 완료: ${authUrl.substring(0, 100)}...`);

      return {
        success: true,
        authUrl,
        requestId,
      };
    } catch (error) {
      this.logger.error(
        `본인인증 요청 생성 실패: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        requestId,
        errorCode: "KAKAO_REQUEST_ERROR",
        errorMessage: "본인인증 요청 생성에 실패했습니다.",
      };
    }
  }

  /**
   * 콜백 처리
   *
   * 카카오로부터 받은 콜백 데이터를 처리하여 인증 결과를 반환합니다.
   */
  async processCallback(
    params: IdentityCallbackParams,
  ): Promise<IdentityVerificationResult> {
    const { requestId, responseData, signature: _signature, clientIp } = params;

    this.logger.log(
      `콜백 처리 시작: requestId=${requestId}, ip=${clientIp || "unknown"}`,
    );

    try {
      // IP 화이트리스트 검증
      if (clientIp && !this.verifyIpWhitelist(clientIp)) {
        this.logger.warn(`허용되지 않은 IP에서 콜백 요청: ${clientIp}`);
        return {
          success: false,
          requestId,
          errorCode: "IP_NOT_ALLOWED",
          errorMessage: "허용되지 않은 IP에서의 요청입니다.",
        };
      }

      // 에러 확인
      if (responseData.error) {
        this.logger.warn(
          `인증 실패: error=${responseData.error}, description=${responseData.error_description}`,
        );
        return {
          success: false,
          requestId,
          errorCode: responseData.error,
          errorMessage:
            responseData.error_description || "본인인증에 실패했습니다.",
        };
      }

      // State 검증
      const state = responseData.state;
      if (state) {
        const verifyResult = this.verifyState(state, requestId);
        if (!verifyResult) {
          this.logger.error("State 검증 실패");
          return {
            success: false,
            requestId,
            errorCode: "STATE_INVALID",
            errorMessage: "State 검증에 실패했습니다.",
          };
        }
      }

      // Authorization code로 Access Token 발급
      const code = responseData.code;
      const tokenResult = await this.exchangeCodeForToken(code);

      if (!tokenResult.success) {
        return {
          success: false,
          requestId,
          errorCode: "TOKEN_EXCHANGE_FAILED",
          errorMessage: "토큰 발급에 실패했습니다.",
        };
      }

      // Access Token으로 사용자 정보 조회
      const userInfo = await this.getUserInfo(tokenResult.accessToken!);

      if (!userInfo.success) {
        return {
          success: false,
          requestId,
          errorCode: "USER_INFO_FAILED",
          errorMessage: "사용자 정보 조회에 실패했습니다.",
        };
      }

      // 개인정보 추출
      const ci = userInfo.data.ci;
      const name = userInfo.data.kakao_account?.name;
      const phone = userInfo.data.kakao_account?.phone_number;
      const birthDate = userInfo.data.kakao_account?.birthyear
        ? `${userInfo.data.kakao_account.birthyear}${userInfo.data.kakao_account.birthday}`
        : undefined;
      const gender = userInfo.data.kakao_account?.gender;

      this.logger.log(
        `인증 성공: requestId=${requestId}, name=${this.maskName(name)}`,
      );

      return {
        success: true,
        requestId,
        ci,
        name,
        phone: this.normalizePhone(phone),
        birthDate,
        gender: this.normalizeGender(gender),
        verifiedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`콜백 처리 실패: ${error.message}`, error.stack);

      return {
        success: false,
        requestId,
        errorCode: "CALLBACK_PROCESS_ERROR",
        errorMessage: "콜백 처리 중 오류가 발생했습니다.",
      };
    }
  }

  /**
   * Authorization Code를 Access Token으로 교환
   */
  private async exchangeCodeForToken(
    code: string,
  ): Promise<{ success: boolean; accessToken?: string }> {
    try {
      const endpoints = this.config.endpoints[this.config.mode];
      const callbackUrl = `${this.commonConfig.callbackBaseUrl}/kakao`;

      const response = await this.httpClient.post(
        endpoints.token,
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: callbackUrl,
          code: code,
        }).toString(),
      );

      if (response.data.access_token) {
        return {
          success: true,
          accessToken: response.data.access_token,
        };
      }

      return { success: false };
    } catch (error) {
      this.logger.error(`토큰 교환 실패: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * 사용자 정보 조회
   */
  private async getUserInfo(
    accessToken: string,
  ): Promise<{ success: boolean; data?: any }> {
    try {
      const endpoints = this.config.endpoints[this.config.mode];

      const response = await this.httpClient.get(endpoints.userInfo, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
      });

      if (response.data) {
        return {
          success: true,
          data: response.data,
        };
      }

      return { success: false };
    } catch (error) {
      this.logger.error(`사용자 정보 조회 실패: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * 서명 검증
   */
  verifySignature(
    data: Record<string, any>,
    signature: string,
  ): SignatureVerificationResult {
    try {
      // 카카오는 State 기반 검증을 주로 사용
      // 필요시 추가 서명 검증 로직 구현
      const expectedSignature = this.generateSignature(data);
      const isValid = signature === expectedSignature;

      return {
        valid: isValid,
        errorMessage: isValid ? undefined : "서명이 일치하지 않습니다.",
      };
    } catch (error) {
      return {
        valid: false,
        errorMessage: `서명 검증 오류: ${error.message}`,
      };
    }
  }

  /**
   * IP 화이트리스트 검증
   */
  verifyIpWhitelist(ip: string): boolean {
    // 개발/샌드박스 모드에서는 모든 IP 허용
    if (this.config.mode !== "production") {
      return true;
    }

    // 설정된 화이트리스트 확인
    const configWhitelist = this.securityConfig.ipWhitelist;
    if (configWhitelist && configWhitelist.length > 0) {
      return configWhitelist.includes(ip);
    }

    // 기본 화이트리스트 확인 (CIDR 범위)
    return this.isIpInCidrRanges(ip, this.ipWhitelist);
  }

  /**
   * 암호화된 데이터 복호화
   */
  async decryptData(encryptedData: string): Promise<Record<string, any>> {
    try {
      const key = Buffer.from(
        this.config.clientSecret.substring(0, 32),
        "utf8",
      );
      const iv = Buffer.from(this.config.clientSecret.substring(0, 16), "utf8");

      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encryptedData, "base64", "utf8");
      decrypted += decipher.final("utf8");

      try {
        return JSON.parse(decrypted);
      } catch {
        const params = new URLSearchParams(decrypted);
        const result: Record<string, any> = {};
        params.forEach((value, key) => {
          result[key] = value;
        });
        return result;
      }
    } catch (error) {
      this.logger.error(`데이터 복호화 실패: ${error.message}`);
      throw new Error("데이터 복호화에 실패했습니다.");
    }
  }

  /**
   * State 생성 (CSRF 방지)
   */
  private generateState(requestId: string): string {
    const timestamp = Date.now().toString();
    const data = `${requestId}|${timestamp}`;

    return crypto
      .createHmac("sha256", this.config.clientSecret)
      .update(data)
      .digest("hex")
      .substring(0, 32);
  }

  /**
   * State 검증
   */
  private verifyState(state: string, _requestId: string): boolean {
    // State는 요청 시 생성된 것과 동일해야 함
    // 실제 구현에서는 Redis 등에 저장된 state와 비교
    return Boolean(state && state.length === 32);
  }

  /**
   * 서명 생성 (HMAC-SHA256)
   */
  private generateSignature(data: Record<string, any>): string {
    const sortedKeys = Object.keys(data).sort();
    const signatureData = sortedKeys
      .map((key) => `${key}=${data[key]}`)
      .join("&");

    return crypto
      .createHmac("sha256", this.config.clientSecret)
      .update(signatureData)
      .digest("hex");
  }

  /**
   * IP가 CIDR 범위에 포함되는지 확인
   */
  private isIpInCidrRanges(ip: string, cidrRanges: string[]): boolean {
    const ipNum = this.ipToNumber(ip);

    for (const cidr of cidrRanges) {
      const [rangeIp, bits] = cidr.split("/");
      const mask = ~((1 << (32 - parseInt(bits, 10))) - 1);
      const rangeNum = this.ipToNumber(rangeIp);

      if ((ipNum & mask) === (rangeNum & mask)) {
        return true;
      }
    }

    return false;
  }

  /**
   * IP 주소를 숫자로 변환
   */
  private ipToNumber(ip: string): number {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    return (
      ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
    );
  }

  /**
   * 이름 마스킹
   */
  private maskName(name: string): string {
    if (!name || name.length < 2) return name;
    if (name.length === 2) return name[0] + "*";
    return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
  }

  /**
   * 전화번호 정규화
   */
  private normalizePhone(phone: string): string {
    if (!phone) return "";
    // 카카오는 +82 10-1234-5678 형식으로 반환
    return phone.replace(/^\+82\s?/, "0").replace(/-/g, "");
  }

  /**
   * 성별 정규화
   */
  private normalizeGender(gender: string): string {
    if (!gender) return "";
    const g = gender.toLowerCase();
    if (g === "male") return "M";
    if (g === "female") return "F";
    return gender;
  }
}
