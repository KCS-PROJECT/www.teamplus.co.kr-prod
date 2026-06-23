import { Injectable, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "@/redis/redis.service";
import { LoggerService } from "@/logger/logger.service";
import { OtpService } from "./otp.service";
import axios from "axios";

/**
 * SMS 서비스
 *
 * 휴대폰 인증번호 발송 기능을 제공합니다.
 * - NHN Cloud SMS API 연동 (프로덕션)
 * - 개발 환경에서는 Mock 모드 지원
 * - Rate Limiting: 동일 번호 60초에 1회 제한
 */

/** SMS 발송 결과 */
export interface SmsSendResult {
  success: boolean;
  message: string;
  remainingTime?: number; // OTP 만료까지 남은 시간 (초)
  devOtp?: string; // 개발 환경(NODE_ENV !== 'production') 한정 OTP 노출. 프로덕션 응답엔 절대 포함되지 않음.
}

/** SMS 발송 요청 */
export interface SmsSendRequest {
  phone: string;
  purpose:
    | "signup"
    | "find-id"
    | "reset-password"
    | "change-phone"
    | "child-pin";
}

@Injectable()
export class SmsService {
  private readonly RATE_LIMIT_PREFIX = "sms:rate:";
  private readonly RATE_LIMIT_TTL = 60; // 60초에 1회만 발송 가능
  private readonly isDev: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly otpService: OtpService,
    private readonly logger: LoggerService,
  ) {
    this.isDev = this.configService.get("NODE_ENV") !== "production";
  }

  /**
   * 인증번호 발송
   */
  async sendVerificationCode(request: SmsSendRequest): Promise<SmsSendResult> {
    const normalizedPhone = request.phone.replace(/\D/g, "");

    // 휴대폰 번호 유효성 검사
    if (!/^01[0-9]{8,9}$/.test(normalizedPhone)) {
      throw new BadRequestException("올바른 휴대폰 번호를 입력해주세요.");
    }

    // Rate Limit 체크
    const rateLimitKey = `${this.RATE_LIMIT_PREFIX}${normalizedPhone}`;
    const isRateLimited: boolean = await this.redisService.exists(rateLimitKey);

    if (isRateLimited) {
      const remainingTtl = await this.redisService.ttl(rateLimitKey);
      throw new BadRequestException({
        message: `잠시 후 다시 시도해주세요. (${remainingTtl}초 후 재발송 가능)`,
        error: "SMS_RATE_LIMIT",
      });
    }

    // OTP 생성
    const otp = await this.otpService.createOtp(
      normalizedPhone,
      request.purpose,
    );

    // SMS 발송
    const sendSuccess = await this.sendSms(
      normalizedPhone,
      otp,
      request.purpose,
    );

    if (!sendSuccess) {
      throw new BadRequestException(
        "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
    }

    // Rate Limit 설정
    await this.redisService.set(rateLimitKey, "1", this.RATE_LIMIT_TTL);

    // 남은 시간 조회
    const remainingTime = await this.otpService.getRemainingTime(
      normalizedPhone,
      request.purpose,
    );

    return {
      success: true,
      message: "인증번호가 발송되었습니다.",
      remainingTime,
      // 개발 환경 한정: 응답에 OTP 노출 → 프론트 브라우저 콘솔에 표시되어 테스트 편의 제공
      ...(this.isDev ? { devOtp: otp } : {}),
    };
  }

  /**
   * 인증번호 확인
   */
  async verifyCode(
    phone: string,
    purpose: string,
    code: string,
  ): Promise<{ valid: boolean; message: string }> {
    const normalizedPhone = phone.replace(/\D/g, "");

    if (!code || code.length !== 6) {
      return {
        valid: false,
        message: "6자리 인증번호를 입력해주세요.",
      };
    }

    return this.otpService.verifyOtp(normalizedPhone, purpose, code);
  }

  /**
   * SMS 발송 (실제 API 호출 또는 Mock)
   */
  private async sendSms(
    phone: string,
    otp: string,
    purpose: string,
  ): Promise<boolean> {
    const message = this.buildMessage(otp, purpose);

    // 개발 환경: Mock 모드 (구조화 로거 사용 - OTP는 마스킹)
    if (this.isDev) {
      const maskedPhone =
        phone.length >= 8
          ? phone.slice(0, 3) + "****" + phone.slice(-4)
          : "****";
      // 개발 편의를 위해 전체 OTP 노출 (dev 환경 한정, 프로덕션은 실제 SMS 발송 경로로 분기되어 영향 없음)
      this.logger.info(
        `[SMS Mock] To: ${maskedPhone}, OTP: ${otp}, Purpose: ${purpose}`,
      );
      return true;
    }

    // 프로덕션: 실제 SMS API 호출
    try {
      const apiKey = this.configService.get<string>("SMS_API_KEY");
      const secretKey = this.configService.get<string>("SMS_SECRET_KEY");
      const senderId = this.configService.get<string>("SMS_SENDER_ID");

      if (!apiKey || !secretKey || !senderId) {
        this.logger.error("SMS API 설정이 누락되었습니다.");
        return false;
      }

      // NHN Cloud SMS API 호출 예시
      // 실제 구현 시 해당 SMS 제공자의 API 스펙에 맞게 수정 필요
      const response = await axios.post(
        "https://api-sms.cloud.toast.com/sms/v3.0/appKeys/{appKey}/sender/sms",
        {
          body: message,
          sendNo: senderId,
          recipientList: [{ recipientNo: phone }],
        },
        {
          headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "X-Secret-Key": secretKey,
          },
          timeout: 10000,
        },
      );

      if (response.data?.header?.isSuccessful) {
        this.logger.info(`SMS 발송 성공: ${phone.slice(0, 3)}****`);
        return true;
      } else {
        this.logger.error("SMS 발송 실패", response.data);
        return false;
      }
    } catch (error) {
      this.logger.error("SMS API 호출 실패", error);
      return false;
    }
  }

  /**
   * SMS 메시지 템플릿
   */
  private buildMessage(otp: string, purpose: string): string {
    const purposeText =
      {
        signup: "회원가입",
        "find-id": "아이디 찾기",
        "reset-password": "비밀번호 재설정",
        "change-phone": "휴대폰 번호 변경",
      }[purpose] || "본인인증";

    return `[TEAMPLUS] ${purposeText} 인증번호: ${otp}\n3분 이내에 입력해주세요.`;
  }

  // ──────────────────────────────────────────────────────────────
  // 야간 마케팅 발송 제한 (정보통신망법 제50조)
  // KST 21:00 ~ 08:00 광고성 메시지 발송 금지
  // ──────────────────────────────────────────────────────────────

  /**
   * 현재 시각이 야간 시간대(KST 21:00~08:00)인지 판별
   */
  private isNightTimeKST(): boolean {
    const now = new Date();
    const kstOffset = 9 * 60; // 분 단위
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const kstMinutes = (utcMinutes + kstOffset) % (24 * 60);
    const kstHour = Math.floor(kstMinutes / 60);
    return kstHour >= 21 || kstHour < 8;
  }

  /**
   * 알림 메시지 발송 (알림톡 폴백용)
   *
   * 인증번호가 아닌 일반 알림 메시지를 발송합니다.
   *
   * @param phone 수신자 전화번호
   * @param message 발송 메시지
   * @param isMarketing 광고성 메시지 여부 (true이면 야간 발송 제한 적용)
   */
  async sendNotificationSms(
    phone: string,
    message: string,
    isMarketing: boolean = false,
  ): Promise<boolean> {
    const normalizedPhone = phone.replace(/\D/g, "");

    // 야간 마케팅 발송 제한 (정보통신망법 제50조)
    if (isMarketing && this.isNightTimeKST()) {
      this.logger.warn(
        `야간 광고성 SMS 발송 차단: phone=${this.maskPhone(normalizedPhone)}`,
      );
      return false;
    }

    if (!/^01[0-9]{8,9}$/.test(normalizedPhone)) {
      this.logger.warn(
        `잘못된 휴대폰 번호: ${this.maskPhone(normalizedPhone)}`,
      );
      return false;
    }

    if (this.isDev) {
      this.logger.info(
        `[SMS Mock] 알림 발송 To: ${this.maskPhone(normalizedPhone)}, Message: ${message.substring(0, 30)}...`,
      );
      return true;
    }

    try {
      const apiKey = this.configService.get<string>("SMS_API_KEY");
      const secretKey = this.configService.get<string>("SMS_SECRET_KEY");
      const senderId = this.configService.get<string>("SMS_SENDER_ID");

      if (!apiKey || !secretKey || !senderId) {
        this.logger.error("SMS API 설정이 누락되었습니다.");
        return false;
      }

      const response = await axios.post(
        "https://api-sms.cloud.toast.com/sms/v3.0/appKeys/{appKey}/sender/sms",
        {
          body: message,
          sendNo: senderId,
          recipientList: [{ recipientNo: normalizedPhone }],
        },
        {
          headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "X-Secret-Key": secretKey,
          },
          timeout: 10000,
        },
      );

      if (response.data?.header?.isSuccessful) {
        this.logger.info(
          `알림 SMS 발송 성공: ${this.maskPhone(normalizedPhone)}`,
        );
        return true;
      } else {
        this.logger.error("알림 SMS 발송 실패", response.data);
        return false;
      }
    } catch (error) {
      this.logger.error("알림 SMS API 호출 실패", error);
      return false;
    }
  }

  /**
   * 전화번호 마스킹
   */
  private maskPhone(phone: string): string {
    if (phone.length >= 8) {
      return phone.slice(0, 3) + "****" + phone.slice(-4);
    }
    return "****";
  }

  /**
   * 재발송 가능 여부 확인
   */
  async canResend(
    phone: string,
  ): Promise<{ canResend: boolean; waitSeconds: number }> {
    const normalizedPhone = phone.replace(/\D/g, "");
    const rateLimitKey = `${this.RATE_LIMIT_PREFIX}${normalizedPhone}`;

    const ttl = await this.redisService.ttl(rateLimitKey);

    if (ttl > 0) {
      return { canResend: false, waitSeconds: ttl };
    }

    return { canResend: true, waitSeconds: 0 };
  }
}
