import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SmsController } from "./sms.controller";
import { SmsService } from "./sms.service";
import { OtpService } from "./otp.service";
import { RedisModule } from "@/redis/redis.module";
import { LoggerModule } from "@/logger/logger.module";

/**
 * SMS/OTP 모듈
 *
 * 휴대폰 인증번호 발송 및 확인 기능을 제공합니다.
 * - SMS 발송 (NHN Cloud, Kakao Alimtalk 지원)
 * - OTP 생성 및 검증
 * - Redis 기반 OTP 저장 (TTL: 3분)
 * - Rate Limiting (발송 제한)
 */
@Module({
  imports: [ConfigModule, RedisModule, LoggerModule],
  controllers: [SmsController],
  providers: [SmsService, OtpService],
  exports: [SmsService, OtpService],
})
export class SmsModule {}
