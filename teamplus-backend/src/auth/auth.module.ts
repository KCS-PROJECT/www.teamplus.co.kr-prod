import { Module, forwardRef } from "@nestjs/common";
import { JwtModule, JwtModuleOptions } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ScheduleModule } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { AccountLockoutService } from "./services/account-lockout.service";
import { CryptoService } from "./services/crypto.service";
import { AuditService } from "./services/audit.service";
import { AppleTokenService } from "./services/apple-token.service";
import { WithdrawCleanupService } from "./withdraw-cleanup.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { RolesGuard } from "./roles.guard";
import { TwoFactorService } from "./two-factor.service";
import { EmailVerificationService } from "./email-verification.service";
import { MailModule } from "@/mail/mail.module";
import { UsersModule } from "@/users/users.module";
import { PrismaModule } from "@/prisma/prisma.module";
import { RedisModule } from "@/redis/redis.module";
import { LoggerModule } from "@/logger/logger.module";
import { SmsModule } from "@/sms/sms.module";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const jwtSecret = configService.get<string>("JWT_SECRET");
        if (!jwtSecret) {
          throw new Error(
            "JWT_SECRET 환경 변수가 설정되지 않았습니다. 보안을 위해 반드시 설정해주세요.",
          );
        }

        // [2026-06-10 SECURITY] 시크릿 강도/기본값/분리 검증 — 프로덕션 fail-fast.
        //   배포 시 .env.example의 약한 기본값을 그대로 사용하거나 JWT_REFRESH_SECRET을
        //   누락(=JWT_SECRET 폴백 → 시크릿 공유)하면 토큰 위조·refresh 남용 위험이 크다.
        //   운영(NODE_ENV=production)에서는 즉시 기동을 실패시켜 안전하지 않은 배포를 차단한다.
        if (process.env.NODE_ENV === "production") {
          const refreshSecret =
            configService.get<string>("JWT_REFRESH_SECRET");
          const WEAK_DEFAULTS = [
            "dev-secret-key-change-in-production",
            "secret",
            "change-me",
            "changeme",
          ];
          if (jwtSecret.length < 32) {
            throw new Error(
              "JWT_SECRET 이 너무 짧습니다(최소 32바이트). 운영 배포 전 강력한 시크릿으로 교체하세요.",
            );
          }
          if (WEAK_DEFAULTS.includes(jwtSecret)) {
            throw new Error(
              "JWT_SECRET 이 알려진 기본/약한 값입니다. 운영 배포 전 반드시 교체하세요.",
            );
          }
          if (!refreshSecret) {
            throw new Error(
              "JWT_REFRESH_SECRET 이 설정되지 않았습니다. access 토큰과 분리된 강력한 시크릿을 설정하세요.",
            );
          }
          if (refreshSecret === jwtSecret) {
            throw new Error(
              "JWT_REFRESH_SECRET 이 JWT_SECRET 과 동일합니다. 반드시 서로 다른 값으로 분리하세요.",
            );
          }
        }

        const jwtExpiration = configService.get<string>(
          "JWT_EXPIRATION",
          "1800",
        );
        return {
          secret: jwtSecret,
          // [2026-05-13 Phase E-4] Algorithm pinning — HS256 만 허용.
          //   `alg: none` 공격 / algorithm confusion (HS256 ↔ RS256) 방지.
          //   verifyOptions 는 JwtStrategy / verify 시점에 사용되며,
          //   signOptions 의 algorithm 도 함께 명시한다.
          signOptions: {
            expiresIn: parseInt(jwtExpiration, 10),
            algorithm: "HS256",
          },
          verifyOptions: {
            algorithms: ["HS256"],
          },
        };
      },
    }),
    ScheduleModule.forRoot(),
    forwardRef(() => UsersModule),
    PrismaModule,
    RedisModule,
    LoggerModule,
    SmsModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard,
    AccountLockoutService,
    CryptoService,
    AuditService,
    AppleTokenService,
    WithdrawCleanupService,
    TwoFactorService,
    EmailVerificationService,
  ],
  exports: [
    AuthService,
    JwtModule,
    RolesGuard,
    AccountLockoutService,
    AuditService,
    TwoFactorService,
  ],
})
export class AuthModule {}
