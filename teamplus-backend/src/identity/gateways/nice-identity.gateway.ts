import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import axios, { AxiosError } from "axios";
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
 * NICE평가정보 오류 코드 정의
 *
 * 각 오류 코드별 원인과 대응 방안을 정의합니다.
 */
export const NICE_ERROR_CODES = {
  // 성공
  "0000": { message: "성공", retryable: false },

  // 사용자 입력 오류 (1xxx)
  "1001": { message: "필수 파라미터 누락", retryable: false },
  "1002": { message: "파라미터 형식 오류", retryable: false },
  "1003": { message: "잘못된 요청 ID", retryable: false },
  "1004": { message: "만료된 요청", retryable: false },
  "1005": { message: "중복 요청", retryable: false },

  // 인증 실패 (2xxx)
  "2001": { message: "본인인증 취소", retryable: true },
  "2002": { message: "본인인증 실패", retryable: true },
  "2003": { message: "인증 시간 초과", retryable: true },
  "2004": { message: "인증 정보 불일치", retryable: false },
  "2005": { message: "인증 횟수 초과", retryable: false },

  // 가맹점 설정 오류 (3xxx)
  "3001": { message: "가맹점 ID 오류", retryable: false },
  "3002": { message: "가맹점 서명 오류", retryable: false },
  "3003": { message: "가맹점 미등록", retryable: false },
  "3004": { message: "서비스 이용 불가", retryable: false },

  // 통신 오류 (4xxx)
  "4001": { message: "통신사 연결 실패", retryable: true },
  "4002": { message: "응답 시간 초과", retryable: true },
  "4003": { message: "네트워크 오류", retryable: true },

  // 시스템 오류 (5xxx)
  "5001": { message: "NICE 시스템 오류", retryable: true },
  "5002": { message: "서버 점검 중", retryable: true },
  "5003": { message: "시스템 과부하", retryable: true },

  // 알 수 없는 오류
  UNKNOWN: { message: "알 수 없는 오류", retryable: false },
} as const;

/**
 * NICE평가정보 본인인증 Gateway
 *
 * NICE평가정보의 본인인증 서비스를 연동합니다.
 *
 * 주요 기능:
 * - 휴대폰/아이핀 기반 본인인증
 * - 암호화된 개인정보 처리
 * - 재시도 로직 및 상세 오류 처리
 *
 * 보안:
 * - HMAC-SHA256 서명
 * - AES-256-CBC 암호화
 * - IP 화이트리스트
 */
@Injectable()
export class NiceIdentityGateway implements IIdentityGateway {
  private readonly logger = new Logger(NiceIdentityGateway.name);
  private readonly config: any;
  private readonly commonConfig: any;
  private readonly securityConfig: any;

  readonly providerName: IdentityProvider = "nice";

  // NICE평가정보 IP 화이트리스트 (프로덕션)
  private readonly ipWhitelist: string[] = [
    "203.133.180.0/24", // NICE 서버 IP 대역
    "203.133.181.0/24",
    "125.131.217.0/24",
  ];

  constructor(private readonly configService: ConfigService) {
    const identityConfig = this.configService.get("identity");
    this.config = identityConfig.nice;
    this.commonConfig = identityConfig.common;
    this.securityConfig = identityConfig.security;

    // HTTP 클라이언트 초기화 (향후 API 호출 시 사용 예정)
    void axios.create({
      timeout: this.commonConfig.httpTimeout,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    });

    this.logger.log(
      `NICE평가정보 본인인증 Gateway 초기화 완료 (모드: ${this.config.mode}, 사이트코드: ${this.config.siteCode})`,
    );
  }

  /**
   * 인증 요청 생성
   *
   * 사용자를 NICE 본인인증 페이지로 리다이렉트할 정보를 생성합니다.
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
      metadata: _metadata,
    } = params;

    this.logger.log(
      `본인인증 요청 생성: requestId=${requestId}, purpose=${purpose}, userId=${userId || "anonymous"}`,
    );

    try {
      void this.getTimestamp(); // timestamp는 향후 사용 예정
      const endpoints = this.config.endpoints[this.config.mode];

      // 콜백 URL 구성
      const callbackUrl = `${this.commonConfig.callbackBaseUrl}/nice`;
      const finalReturnUrl =
        returnUrl ||
        `${this.commonConfig.returnBaseUrl}?requestId=${requestId}`;

      // 암호화 토큰 생성
      const encryptedData = await this.encryptRequestData({
        requestno: requestId,
        returnurl: callbackUrl,
        errorurl: `${callbackUrl}?error=true`,
        sitecode: this.config.siteCode,
        methodtype: "M", // 휴대폰 인증
        popupyn: "N",
        receivedata: JSON.stringify({
          purpose,
          userId,
          returnUrl: finalReturnUrl,
        }),
      });

      // 요청 데이터
      const requestData: Record<string, string> = {
        m: "service",
        token_version_id: this.config.tokenVersionId,
        enc_data: encryptedData.encData,
        integrity_value: encryptedData.integrityValue,
      };

      // 인증 URL 생성
      const authUrl = `${endpoints.request}?${new URLSearchParams(requestData).toString()}`;

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
        errorCode: "NICE_REQUEST_ERROR",
        errorMessage: this.getErrorMessage(error),
      };
    }
  }

  /**
   * 콜백 처리
   *
   * NICE로부터 받은 콜백 데이터를 처리하여 인증 결과를 반환합니다.
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

      // 에러 응답 확인
      if (responseData.error === "true" || responseData.error_code) {
        const errorCode = responseData.error_code || "UNKNOWN";
        const errorInfo =
          (
            NICE_ERROR_CODES as Record<
              string,
              { message: string; retryable: boolean }
            >
          )[errorCode] || NICE_ERROR_CODES["UNKNOWN"];

        this.logger.warn(
          `인증 실패: errorCode=${errorCode}, message=${errorInfo.message}`,
        );

        return {
          success: false,
          requestId,
          errorCode: errorCode,
          errorMessage: errorInfo.message,
        };
      }

      // 무결성 검증
      const encData = responseData.enc_data;
      const integrityValue = responseData.integrity_value;
      // [2026-06-10 SECURITY] 프로덕션에서는 enc_data + integrity_value 필수.
      //   기존: 둘 다 선택적이라 평문 responseData 폴백 → 서명·암호화 없이 위조 CI/DI 가입 가능(CRITICAL).
      const strict = this.config.mode === "production";

      if (strict && (!encData || !integrityValue)) {
        this.logger.error(
          `[SECURITY] 본인인증 콜백 무결성 누락 차단: requestId=${requestId}, encData=${!!encData}, integrity=${!!integrityValue}`,
        );
        return {
          success: false,
          requestId,
          errorCode: "INTEGRITY_REQUIRED",
          errorMessage: "본인인증 데이터 무결성 정보가 누락되었습니다.",
        };
      }

      if (integrityValue) {
        const verifyResult = this.verifyIntegrity(encData, integrityValue);
        if (!verifyResult) {
          this.logger.error("무결성 검증 실패");
          return {
            success: false,
            requestId,
            errorCode: "INTEGRITY_INVALID",
            errorMessage: "데이터 무결성 검증에 실패했습니다.",
          };
        }
      }

      // 암호화된 데이터 복호화
      let decryptedData: Record<string, any>;

      if (encData) {
        decryptedData = await this.decryptData(encData);
      } else {
        // 비프로덕션(sandbox/dev)에서만 평문 데이터 허용 — 위 strict 가드가 프로덕션 차단.
        decryptedData = responseData;
      }

      // 결과 코드 확인
      const resultCode = decryptedData.resultcode || "0000";
      if (resultCode !== "0000") {
        const errorInfo =
          (
            NICE_ERROR_CODES as Record<
              string,
              { message: string; retryable: boolean }
            >
          )[resultCode] || NICE_ERROR_CODES["UNKNOWN"];

        this.logger.warn(
          `인증 결과 오류: resultCode=${resultCode}, message=${errorInfo.message}`,
        );

        return {
          success: false,
          requestId,
          errorCode: resultCode,
          errorMessage: errorInfo.message,
        };
      }

      // 개인정보 추출
      const ci = decryptedData.ci || decryptedData.CI;
      const di = decryptedData.di || decryptedData.DI;
      const name = decryptedData.name || decryptedData.utf8_name;
      const phone = decryptedData.mobileno;
      const birthDate = decryptedData.birthdate;
      const gender = decryptedData.gender;
      const isForeigner = decryptedData.nationalinfo === "1";

      this.logger.log(
        `인증 성공: requestId=${requestId}, name=${this.maskName(name)}`,
      );

      return {
        success: true,
        requestId,
        ci,
        di,
        name,
        phone,
        birthDate,
        gender: this.normalizeGender(gender),
        isForeigner,
        verifiedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`콜백 처리 실패: ${error.message}`, error.stack);

      // 오류 유형별 처리
      if (error instanceof AxiosError) {
        return this.handleAxiosError(error, requestId);
      }

      return {
        success: false,
        requestId,
        errorCode: "CALLBACK_PROCESS_ERROR",
        errorMessage: this.getErrorMessage(error),
      };
    }
  }

  /**
   * Axios 오류 처리
   */
  private handleAxiosError(
    error: AxiosError,
    requestId: string,
  ): IdentityVerificationResult {
    let errorCode = "NETWORK_ERROR";
    let errorMessage = "네트워크 오류가 발생했습니다.";

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      errorCode = "4002";
      errorMessage = NICE_ERROR_CODES["4002"].message;
    } else if (error.code === "ECONNREFUSED") {
      errorCode = "4001";
      errorMessage = NICE_ERROR_CODES["4001"].message;
    } else if (error.response) {
      const status = error.response.status;
      if (status >= 500) {
        errorCode = "5001";
        errorMessage = NICE_ERROR_CODES["5001"].message;
      } else if (status === 401 || status === 403) {
        errorCode = "3002";
        errorMessage = NICE_ERROR_CODES["3002"].message;
      } else if (status === 400) {
        errorCode = "1002";
        errorMessage = NICE_ERROR_CODES["1002"].message;
      }
    }

    return {
      success: false,
      requestId,
      errorCode,
      errorMessage,
    };
  }

  /**
   * 서명 검증
   */
  verifySignature(
    data: Record<string, any>,
    signature: string,
  ): SignatureVerificationResult {
    try {
      const expectedSignature = this.generateSignature(data);
      const isValid = signature === expectedSignature;

      if (!isValid) {
        this.logger.error(
          `서명 검증 실패: 예상=${expectedSignature}, 실제=${signature}`,
        );
      }

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
        this.config.sitePassword.substring(0, 32),
        "utf8",
      );
      const iv = Buffer.from(this.config.sitePassword.substring(0, 16), "utf8");

      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encryptedData, "base64", "utf8");
      decrypted += decipher.final("utf8");

      // JSON 파싱 시도
      try {
        return JSON.parse(decrypted);
      } catch {
        // URL 인코딩된 데이터 파싱
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
   * 요청 데이터 암호화
   */
  private async encryptRequestData(
    data: Record<string, string>,
  ): Promise<{ encData: string; integrityValue: string }> {
    try {
      const key = Buffer.from(
        this.config.sitePassword.substring(0, 32),
        "utf8",
      );
      const iv = Buffer.from(this.config.sitePassword.substring(0, 16), "utf8");

      const plainText = new URLSearchParams(data).toString();

      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
      let encrypted = cipher.update(plainText, "utf8", "base64");
      encrypted += cipher.final("base64");

      // 무결성 값 생성
      const integrityValue = crypto
        .createHmac("sha256", this.config.sitePassword)
        .update(encrypted)
        .digest("base64");

      return {
        encData: encrypted,
        integrityValue,
      };
    } catch (error) {
      this.logger.error(`데이터 암호화 실패: ${error.message}`);
      throw new Error("데이터 암호화에 실패했습니다.");
    }
  }

  /**
   * 무결성 검증
   */
  private verifyIntegrity(encData: string, integrityValue: string): boolean {
    const expectedIntegrity = crypto
      .createHmac("sha256", this.config.sitePassword)
      .update(encData)
      .digest("base64");

    return integrityValue === expectedIntegrity;
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
      .createHmac("sha256", this.config.sitePassword)
      .update(signatureData)
      .digest("hex");
  }

  /**
   * 타임스탬프 생성
   */
  private getTimestamp(): string {
    return new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .substring(0, 14);
  }

  /**
   * 오류 메시지 추출
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      const axiosError = error as Error & {
        response?: { data?: { message?: string } };
      };
      if (axiosError.response?.data?.message) {
        return axiosError.response.data.message;
      }
      return error.message;
    }
    return "알 수 없는 오류가 발생했습니다.";
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
   * 성별 정규화
   */
  private normalizeGender(gender: string): string {
    if (!gender) return "";
    const g = gender.toUpperCase();
    if (g === "M" || g === "MALE" || g === "1") return "M";
    if (g === "F" || g === "FEMALE" || g === "0") return "F";
    return gender;
  }
}
