import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ChildAuthController } from "./child-auth.controller";
import { ChildAuthPublicController } from "./child-auth-public.controller";
import { ChildAuthService } from "./child-auth.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { SmsModule } from "@/sms/sms.module";
import { RedisModule } from "@/redis/redis.module";
import { LoggerModule } from "@/logger/logger.module";

/**
 * ChildAuth Module
 *
 * 자녀 PIN 인증 관리 모듈
 *
 * 주요 기능:
 * - PIN 설정 (학부모 전용, bcrypt 해싱)
 * - PIN 검증 (학부모, 청소년, 아동)
 * - PIN 삭제/초기화 (학부모 전용)
 * - PIN 검증 + 로그인 (Public, JWT 발급)
 * - OTP 발송 요청 (Public, SMS)
 * - OTP 검증 + 로그인 (Public, JWT 발급)
 *
 * 보안 규칙:
 * - PIN은 bcrypt(salt=10)으로 해싱 저장
 * - 5회 실패 시 10분 잠금 (ChildPin.lockedUntil)
 * - 연속 숫자(123456), 동일 숫자(111111) 패턴 거부
 * - ParentChild 테이블 기반 소유권 확인
 * - OTP: Redis TTL 3분, SMS rate limit 60초
 */
@Module({
  imports: [
    PrismaModule,
    SmsModule,
    RedisModule,
    LoggerModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: parseInt(
            configService.get<string>("JWT_EXPIRATION", "900"),
            10,
          ),
        },
      }),
    }),
  ],
  controllers: [ChildAuthController, ChildAuthPublicController],
  providers: [ChildAuthService],
  exports: [ChildAuthService],
})
export class ChildAuthModule {}
