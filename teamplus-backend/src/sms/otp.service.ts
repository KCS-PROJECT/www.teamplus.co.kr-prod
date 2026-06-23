import { Injectable } from "@nestjs/common";
import { RedisService } from "@/redis/redis.service";
import { LoggerService } from "@/logger/logger.service";
import * as crypto from "crypto";

/**
 * OTP 서비스
 *
 * 6자리 인증번호 생성, 저장, 검증을 담당합니다.
 * Redis에 저장하며 기본 TTL은 3분입니다.
 */
@Injectable()
export class OtpService {
  private readonly OTP_PREFIX = "otp:";
  private readonly OTP_TTL = 180; // 3분 (초 단위)
  private readonly MAX_ATTEMPTS = 5; // 최대 시도 횟수

  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * 6자리 OTP 생성
   */
  generateOtp(): string {
    // 보안을 위해 crypto.randomInt 사용
    const otp = crypto.randomInt(100000, 999999).toString();
    return otp;
  }

  /**
   * OTP 저장
   *
   * @param phone 휴대폰 번호 (숫자만)
   * @param purpose 용도 (signup, find-id, reset-password 등)
   * @returns 생성된 OTP
   */
  async createOtp(phone: string, purpose: string): Promise<string> {
    const normalizedPhone = phone.replace(/\D/g, "");
    const key = `${this.OTP_PREFIX}${purpose}:${normalizedPhone}`;

    // 기존 OTP 삭제
    await this.redisService.del(key);
    await this.redisService.del(`${key}:attempts`);

    // 새 OTP 생성 및 저장
    const otp = this.generateOtp();
    await this.redisService.set(key, otp, this.OTP_TTL);
    await this.redisService.set(`${key}:attempts`, "0", this.OTP_TTL);

    this.logger.info(
      `OTP 생성: ${purpose}, phone: ${normalizedPhone.slice(0, 3)}****`,
    );

    return otp;
  }

  /**
   * OTP 검증
   *
   * @param phone 휴대폰 번호
   * @param purpose 용도
   * @param inputOtp 사용자 입력 OTP
   * @returns { valid: boolean, message: string }
   */
  async verifyOtp(
    phone: string,
    purpose: string,
    inputOtp: string,
  ): Promise<{ valid: boolean; message: string }> {
    const normalizedPhone = phone.replace(/\D/g, "");
    const key = `${this.OTP_PREFIX}${purpose}:${normalizedPhone}`;
    const attemptsKey = `${key}:attempts`;

    // 시도 횟수 확인
    const attemptsStr = await this.redisService.get(attemptsKey);
    const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

    if (attempts >= this.MAX_ATTEMPTS) {
      this.logger.warn(
        `OTP 최대 시도 초과: ${purpose}, phone: ${normalizedPhone.slice(0, 3)}****`,
      );
      await this.redisService.del(key);
      await this.redisService.del(attemptsKey);
      return {
        valid: false,
        message: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.",
      };
    }

    // 저장된 OTP 확인
    const storedOtp = await this.redisService.get(key);

    if (!storedOtp) {
      return {
        valid: false,
        message: "인증번호가 만료되었습니다. 다시 요청해주세요.",
      };
    }

    // OTP 일치 확인 (RedisService.get이 JSON.parse를 적용하므로 문자열 변환 필요)
    if (String(storedOtp) !== inputOtp) {
      // 시도 횟수 증가
      await this.redisService.incr(attemptsKey);
      const remaining = this.MAX_ATTEMPTS - attempts - 1;

      this.logger.warn(`OTP 불일치: ${purpose}, 남은 시도: ${remaining}`);

      return {
        valid: false,
        message: `인증번호가 일치하지 않습니다. (${remaining}회 남음)`,
      };
    }

    // 검증 성공: OTP 삭제
    await this.redisService.del(key);
    await this.redisService.del(attemptsKey);

    this.logger.info(
      `OTP 검증 성공: ${purpose}, phone: ${normalizedPhone.slice(0, 3)}****`,
    );

    return {
      valid: true,
      message: "인증이 완료되었습니다.",
    };
  }

  /**
   * OTP 남은 시간 확인 (초)
   */
  async getRemainingTime(phone: string, purpose: string): Promise<number> {
    const normalizedPhone = phone.replace(/\D/g, "");
    const key = `${this.OTP_PREFIX}${purpose}:${normalizedPhone}`;

    const ttl = await this.redisService.ttl(key);
    return ttl > 0 ? ttl : 0;
  }

  /**
   * OTP 존재 여부 확인
   */
  async hasActiveOtp(phone: string, purpose: string): Promise<boolean> {
    const normalizedPhone = phone.replace(/\D/g, "");
    const key = `${this.OTP_PREFIX}${purpose}:${normalizedPhone}`;

    return await this.redisService.exists(key);
  }
}
