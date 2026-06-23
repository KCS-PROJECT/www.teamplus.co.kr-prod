import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
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

/**
 * KG이니시스 본인인증 Gateway
 *
 * KG이니시스의 본인인증 서비스(SafeKey)를 연동합니다.
 *
 * 주요 기능:
 * - 본인인증 요청 URL 생성
 * - 콜백 데이터 처리 및 검증
 * - 서명 생성/검증
 * - 암호화된 개인정보 복호화
 *
 * 보안:
 * - HMAC-SHA256 서명
 * - AES-256-CBC 암호화
 * - IP 화이트리스트
 */
@Injectable()
export class KgInicisIdentityGateway implements IIdentityGateway {
  private readonly logger = new Logger(KgInicisIdentityGateway.name);
  private readonly config: any;
  private readonly commonConfig: any;
  private readonly securityConfig: any;

  readonly providerName: IdentityProvider = "kg_inicis";

  // KG이니시스 IP 화이트리스트 (프로덕션)
  private readonly ipWhitelist: string[] = [
    "203.238.37.0/24", // KG이니시스 서버 IP 대역
    "211.219.96.0/24",
    "121.133.104.0/24",
  ];

  constructor(private readonly configService: ConfigService) {
    const identityConfig = this.configService.get("identity");
    this.config = identityConfig.kgInicis;
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
      `KG이니시스 본인인증 Gateway 초기화 완료 (모드: ${this.config.mode}, 상점ID: ${this.config.storeId})`,
    );
  }

  /**
   * 인증 요청 생성
   *
   * 사용자를 KG이니시스 본인인증 페이지로 리다이렉트할 정보를 생성합니다.
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
      metadata,
    } = params;

    this.logger.log(
      `본인인증 요청 생성: requestId=${requestId}, purpose=${purpose}, userId=${userId || "anonymous"}`,
    );

    try {
      const timestamp = Date.now().toString();
      const endpoints = this.config.endpoints[this.config.mode];

      // 콜백 URL 구성
      const callbackUrl = `${this.commonConfig.callbackBaseUrl}/kg_inicis`;
      const finalReturnUrl =
        returnUrl ||
        `${this.commonConfig.returnBaseUrl}?requestId=${requestId}`;

      // 요청 데이터
      const requestData: Record<string, string> = {
        mid: this.config.storeId,
        reqSvcCd: "Auth", // 본인인증 서비스
        mTxId: requestId,
        authType: "M", // 휴대폰 인증
        flgFixedUser: "N", // 사용자 정보 고정 안함
        returnUrl: callbackUrl,
        closeUrl: finalReturnUrl,
        timestamp,
        charset: "UTF-8",
        format: "JSON",
      };

      // 추가 메타데이터
      if (metadata) {
        if (metadata.userName) {
          requestData.userName = metadata.userName;
          requestData.flgFixedUser = "Y"; // 사용자 정보 고정
        }
        if (metadata.userPhone) {
          requestData.userPhone = metadata.userPhone;
        }
        if (metadata.userBirth) {
          requestData.userBirth = metadata.userBirth;
        }
      }

      // 서명 생성
      requestData.signature = this.generateSignature({
        mid: this.config.storeId,
        mTxId: requestId,
        timestamp,
      });

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
        errorCode: "INICIS_REQUEST_ERROR",
        errorMessage: "본인인증 요청 생성에 실패했습니다.",
      };
    }
  }

  /**
   * 콜백 처리
   *
   * KG이니시스로부터 받은 콜백 데이터를 처리하여 인증 결과를 반환합니다.
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
      const resultCode = responseData.resultCode || responseData.result_cd;
      const resultMsg = responseData.resultMsg || responseData.result_msg;

      if (resultCode !== "0000") {
        this.logger.warn(
          `인증 실패: resultCode=${resultCode}, resultMsg=${resultMsg}`,
        );
        return {
          success: false,
          requestId,
          errorCode: resultCode,
          errorMessage: resultMsg || "본인인증에 실패했습니다.",
        };
      }

      // [2026-06-10 SECURITY] 프로덕션에서는 서명 + 암호화 데이터 필수.
      //   기존: 둘 다 선택적이라 평문 responseData 폴백 → 서명·암호화 없이 위조 CI/DI 가입 가능(CRITICAL).
      const strict = this.config.mode === "production";
      const encryptedData = responseData.encData || responseData.enc_data;

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
   * 서명 검증
   */
  verifySignature(
    data: Record<string, any>,
    signature: string,
  ): SignatureVerificationResult {
    try {
      // 검증용 서명 생성
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
      const key = Buffer.from(this.config.merchantKey.substring(0, 32), "utf8");
      const iv = Buffer.from(this.config.merchantKey.substring(0, 16), "utf8");

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

    const signature = crypto
      .createHmac("sha256", this.config.merchantKey)
      .update(signatureData)
      .digest("hex");

    return signature;
  }

  /**
   * 콜백 서명 생성
   */
  private generateCallbackSignature(data: Record<string, any>): string {
    const mTxId = data.mTxId || data.m_tx_id;
    const resultCode = data.resultCode || data.result_cd;
    const timestamp = data.timestamp || data.ts;

    const signatureData = `${mTxId}|${resultCode}|${timestamp}`;

    return crypto
      .createHmac("sha256", this.config.merchantKey)
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
