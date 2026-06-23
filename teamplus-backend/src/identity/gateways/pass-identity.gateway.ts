import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import axios, { AxiosInstance, AxiosError } from "axios";
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
 * PASS 앱 오류 코드 정의
 *
 * 통신사별 오류 코드와 공통 오류 코드를 정의합니다.
 */
export const PASS_ERROR_CODES = {
  // 성공
  "0000": { message: "성공", retryable: false, carrier: "common" },

  // 사용자 입력 오류 (1xxx)
  "1001": {
    message: "필수 파라미터 누락",
    retryable: false,
    carrier: "common",
  },
  "1002": {
    message: "파라미터 형식 오류",
    retryable: false,
    carrier: "common",
  },
  "1003": { message: "잘못된 요청 ID", retryable: false, carrier: "common" },
  "1004": { message: "만료된 요청", retryable: false, carrier: "common" },
  "1005": { message: "중복 요청", retryable: false, carrier: "common" },

  // 사용자 인증 오류 (2xxx)
  "2001": { message: "본인인증 취소", retryable: true, carrier: "common" },
  "2002": { message: "본인인증 실패", retryable: true, carrier: "common" },
  "2003": { message: "인증 시간 초과", retryable: true, carrier: "common" },
  "2004": { message: "인증 정보 불일치", retryable: false, carrier: "common" },
  "2005": { message: "인증 횟수 초과", retryable: false, carrier: "common" },
  "2006": { message: "PASS 앱 미설치", retryable: false, carrier: "common" },
  "2007": { message: "PASS 앱 버전 오류", retryable: false, carrier: "common" },

  // SKT 특정 오류 (21xx)
  "2101": { message: "SKT 인증 실패", retryable: true, carrier: "SKT" },
  "2102": { message: "SKT 가입자 아님", retryable: false, carrier: "SKT" },
  "2103": { message: "SKT 서비스 중단", retryable: true, carrier: "SKT" },

  // KT 특정 오류 (22xx)
  "2201": { message: "KT 인증 실패", retryable: true, carrier: "KT" },
  "2202": { message: "KT 가입자 아님", retryable: false, carrier: "KT" },
  "2203": { message: "KT 서비스 중단", retryable: true, carrier: "KT" },

  // LGU+ 특정 오류 (23xx)
  "2301": { message: "LGU+ 인증 실패", retryable: true, carrier: "LGU+" },
  "2302": { message: "LGU+ 가입자 아님", retryable: false, carrier: "LGU+" },
  "2303": { message: "LGU+ 서비스 중단", retryable: true, carrier: "LGU+" },

  // 알뜰폰 오류 (24xx)
  "2401": { message: "MVNO 인증 실패", retryable: true, carrier: "MVNO" },
  "2402": { message: "MVNO 미지원 통신사", retryable: false, carrier: "MVNO" },

  // 가맹점 설정 오류 (3xxx)
  "3001": { message: "서비스 ID 오류", retryable: false, carrier: "common" },
  "3002": { message: "서비스 키 오류", retryable: false, carrier: "common" },
  "3003": { message: "가맹점 미등록", retryable: false, carrier: "common" },
  "3004": { message: "서비스 이용 불가", retryable: false, carrier: "common" },

  // 통신 오류 (4xxx)
  "4001": { message: "통신사 연결 실패", retryable: true, carrier: "common" },
  "4002": { message: "응답 시간 초과", retryable: true, carrier: "common" },
  "4003": { message: "네트워크 오류", retryable: true, carrier: "common" },

  // 시스템 오류 (5xxx)
  "5001": { message: "PASS 시스템 오류", retryable: true, carrier: "common" },
  "5002": { message: "서버 점검 중", retryable: true, carrier: "common" },
  "5003": { message: "시스템 과부하", retryable: true, carrier: "common" },

  // 알 수 없는 오류
  UNKNOWN: { message: "알 수 없는 오류", retryable: false, carrier: "common" },
} as const;

/**
 * 통신사 코드
 */
export const CARRIER_CODES = {
  SKT: "01",
  KT: "02",
  LGU: "03",
  SKT_MVNO: "04",
  KT_MVNO: "05",
  LGU_MVNO: "06",
} as const;

/**
 * PASS 앱 본인인증 Gateway
 *
 * 3대 통신사(SKT, KT, LGU+) PASS 앱을 통한 본인인증 서비스를 연동합니다.
 *
 * 주요 기능:
 * - PASS 앱 기반 간편 본인인증
 * - 통신사별 오류 처리
 * - 딥링크 기반 앱 연동
 *
 * 보안:
 * - HMAC-SHA256 서명
 * - AES-256-CBC 암호화
 * - IP 화이트리스트
 */
@Injectable()
export class PassIdentityGateway implements IIdentityGateway {
  private readonly logger = new Logger(PassIdentityGateway.name);
  private readonly httpClient: AxiosInstance;
  private readonly config: any;
  private readonly commonConfig: any;
  private readonly securityConfig: any;

  readonly providerName: IdentityProvider = "pass";

  // PASS IP 화이트리스트 (프로덕션)
  private readonly ipWhitelist: string[] = [
    "203.235.210.0/24", // SKT
    "210.103.68.0/24", // KT
    "211.115.106.0/24", // LGU+
    "211.63.24.0/24", // PASS 공통
  ];

  constructor(private readonly configService: ConfigService) {
    const identityConfig = this.configService.get("identity");
    this.config = identityConfig.pass;
    this.commonConfig = identityConfig.common;
    this.securityConfig = identityConfig.security;

    // HTTP 클라이언트 초기화
    this.httpClient = axios.create({
      timeout: this.commonConfig.httpTimeout,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    this.logger.log(
      `PASS 본인인증 Gateway 초기화 완료 (모드: ${this.config.mode}, 서비스ID: ${this.config.serviceId})`,
    );
  }

  /**
   * 인증 요청 생성
   *
   * PASS 앱을 통한 본인인증 요청을 생성합니다.
   */
  async createAuthRequest(
    params: IdentityRequestParams,
  ): Promise<IdentityRequestResult> {
    const { requestId, purpose, userId, returnUrl } = params;
    // clientIp, userAgent, metadata는 향후 보안 검증에 사용 예정

    this.logger.log(
      `본인인증 요청 생성: requestId=${requestId}, purpose=${purpose}, userId=${userId || "anonymous"}`,
    );

    try {
      const timestamp = this.getTimestamp();
      const endpoints = this.config.endpoints[this.config.mode];

      // 콜백 URL 구성
      const callbackUrl = `${this.commonConfig.callbackBaseUrl}/pass`;
      const finalReturnUrl =
        returnUrl ||
        `${this.commonConfig.returnBaseUrl}?requestId=${requestId}`;

      // Deep Link 스킴 (PASS 앱으로 연결)
      const deepLinkScheme = this.commonConfig.deepLinkScheme;

      // 요청 데이터
      const requestData: Record<string, string> = {
        service_id: this.config.serviceId,
        request_id: requestId,
        timestamp,
        callback_url: callbackUrl,
        return_url: finalReturnUrl,
        deep_link_scheme: deepLinkScheme,
        auth_type: "CERT", // 본인인증
        extra_data: JSON.stringify({
          purpose,
          userId,
        }),
      };

      // 서명 생성
      const signature = this.generateSignature(requestData);
      requestData["signature"] = signature;

      // PASS 서버에 인증 요청
      const response = await this.httpClient.post(
        endpoints.request,
        requestData,
      );

      if (response.data.result_code !== "0000") {
        const errorCode = response.data.result_code || "UNKNOWN";
        const errorInfo =
          (
            PASS_ERROR_CODES as Record<
              string,
              { message: string; retryable: boolean; carrier: string }
            >
          )[errorCode] || PASS_ERROR_CODES["UNKNOWN"];

        throw new Error(`PASS 요청 실패: ${errorInfo.message}`);
      }

      // 인증 URL 또는 딥링크 생성
      const authUrl =
        response.data.auth_url || this.buildDeepLink(response.data);

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
        errorCode: "PASS_REQUEST_ERROR",
        errorMessage: this.getErrorMessage(error),
      };
    }
  }

  /**
   * 콜백 처리
   *
   * PASS로부터 받은 콜백 데이터를 처리하여 인증 결과를 반환합니다.
   */
  async processCallback(
    params: IdentityCallbackParams,
  ): Promise<IdentityVerificationResult> {
    const { requestId, responseData, signature, clientIp } = params;

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

      // 결과 코드 확인
      const resultCode =
        responseData.result_code || responseData.resultCode || "0000";
      if (resultCode !== "0000") {
        const errorInfo =
          (
            PASS_ERROR_CODES as Record<
              string,
              { message: string; retryable: boolean; carrier: string }
            >
          )[resultCode] || PASS_ERROR_CODES["UNKNOWN"];

        this.logger.warn(
          `인증 실패: resultCode=${resultCode}, message=${errorInfo.message}, carrier=${errorInfo.carrier}`,
        );

        return {
          success: false,
          requestId,
          errorCode: resultCode,
          errorMessage: this.getCarrierSpecificMessage(resultCode, errorInfo),
        };
      }

      // [2026-06-10 SECURITY] 프로덕션에서는 서명 + 암호화 데이터 필수.
      //   기존: 둘 다 선택적이라 평문 responseData 폴백 → 서명·암호화 없이 위조 CI/DI 가입 가능(CRITICAL).
      const strict = this.config.mode === "production";
      const encryptedData = responseData.enc_data || responseData.encData;

      if (strict && (!signature || !encryptedData)) {
        this.logger.error(
          `[SECURITY] 본인인증 콜백 서명/암호화 누락 차단: requestId=${requestId}, signature=${!!signature}, encData=${!!encryptedData}`,
        );
        return {
          success: false,
          requestId,
          errorCode: "SIGNATURE_REQUIRED",
          errorMessage: "본인인증 서명/암호화 정보가 누락되었습니다.",
        };
      }

      // 서명 검증
      if (signature) {
        const verifyResult = this.verifySignature(responseData, signature);
        if (!verifyResult.valid) {
          this.logger.error("서명 검증 실패");
          return {
            success: false,
            requestId,
            errorCode: "SIGNATURE_INVALID",
            errorMessage: "서명 검증에 실패했습니다.",
          };
        }
      }

      // 암호화된 데이터 복호화
      let decryptedData: Record<string, any>;

      if (encryptedData) {
        decryptedData = await this.decryptData(encryptedData);
      } else {
        // 비프로덕션(sandbox/dev)에서만 평문 데이터 허용 — 위 strict 가드가 프로덕션 차단.
        decryptedData = responseData;
      }

      // 개인정보 추출
      const ci = decryptedData.ci || decryptedData.CI;
      const di = decryptedData.di || decryptedData.DI;
      const name = decryptedData.name || decryptedData.userName;
      const phone = decryptedData.phone || decryptedData.userPhone;
      const birthDate = decryptedData.birthDate || decryptedData.userBirth;
      const gender = decryptedData.gender || decryptedData.userGender;
      const carrier = this.getCarrierName(
        decryptedData.carrier_type || decryptedData.carrierType,
      );

      this.logger.log(
        `인증 성공: requestId=${requestId}, name=${this.maskName(name)}, carrier=${carrier}`,
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
        carrier,
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
      errorMessage = PASS_ERROR_CODES["4002"].message;
    } else if (error.code === "ECONNREFUSED") {
      errorCode = "4001";
      errorMessage = PASS_ERROR_CODES["4001"].message;
    } else if (error.response) {
      const status = error.response.status;
      if (status >= 500) {
        errorCode = "5001";
        errorMessage = PASS_ERROR_CODES["5001"].message;
      } else if (status === 401 || status === 403) {
        errorCode = "3002";
        errorMessage = PASS_ERROR_CODES["3002"].message;
      } else if (status === 400) {
        errorCode = "1002";
        errorMessage = PASS_ERROR_CODES["1002"].message;
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
   * 통신사별 메시지 생성
   */
  private getCarrierSpecificMessage(
    _errorCode: string,
    errorInfo: { message: string; carrier: string },
  ): string {
    if (errorInfo.carrier === "common") {
      return errorInfo.message;
    }
    return `[${errorInfo.carrier}] ${errorInfo.message}`;
  }

  /**
   * 통신사 이름 변환
   */
  private getCarrierName(carrierCode: string): string {
    const carrierNames: Record<string, string> = {
      "01": "SKT",
      "02": "KT",
      "03": "LGU+",
      "04": "SKT 알뜰폰",
      "05": "KT 알뜰폰",
      "06": "LGU+ 알뜰폰",
    };
    return carrierNames[carrierCode] || "기타";
  }

  /**
   * Deep Link URL 생성
   */
  private buildDeepLink(data: Record<string, any>): string {
    const baseUrl = "pass://cert";
    const params = new URLSearchParams({
      service_id: this.config.serviceId,
      tx_id: data.tx_id || "",
    });
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * 서명 검증
   */
  verifySignature(
    data: Record<string, any>,
    signature: string,
  ): SignatureVerificationResult {
    try {
      const expectedSignature = this.generateCallbackSignature(data);
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
      const key = Buffer.from(this.config.serviceKey.substring(0, 32), "utf8");
      const iv = Buffer.from(this.config.serviceKey.substring(0, 16), "utf8");

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
   * 요청 서명 생성 (HMAC-SHA256)
   */
  private generateSignature(data: Record<string, string>): string {
    const sortedKeys = Object.keys(data).sort();
    const signatureData = sortedKeys
      .map((key) => `${key}=${data[key]}`)
      .join("&");

    return crypto
      .createHmac("sha256", this.config.serviceKey)
      .update(signatureData)
      .digest("hex");
  }

  /**
   * 콜백 서명 생성
   */
  private generateCallbackSignature(data: Record<string, any>): string {
    const requestId = data.request_id || data.requestId;
    const resultCode = data.result_code || data.resultCode;
    const timestamp = data.timestamp || data.ts;

    const signatureData = `${requestId}|${resultCode}|${timestamp}`;

    return crypto
      .createHmac("sha256", this.config.serviceKey)
      .update(signatureData)
      .digest("hex");
  }

  /**
   * 타임스탬프 생성
   */
  private getTimestamp(): string {
    return Date.now().toString();
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
    if (g === "F" || g === "FEMALE" || g === "2") return "F";
    return gender;
  }
}
