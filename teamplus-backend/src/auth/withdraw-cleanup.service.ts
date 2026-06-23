import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { AppleTokenService } from "./services/apple-token.service";

/**
 * 회원 탈퇴 배치 처리 서비스
 *
 * 매일 00:00(KST)에 실행되어 유예 기간(7일)이 지난
 * WITHDRAW_PENDING 상태 사용자의 개인정보를 비식별화합니다.
 *
 * 법적 보관 의무:
 * - 결제 기록: 5년 (전자상거래법)
 * - 계약 기록: 5년 (전자상거래법)
 * - 불만/분쟁 처리 기록: 3년 (전자상거래법)
 * → 이 기록들은 삭제하지 않고 보존합니다.
 */
@Injectable()
export class WithdrawCleanupService {
  private readonly logger = new Logger(WithdrawCleanupService.name);

  /** 유예 기간 (일) */
  private readonly GRACE_PERIOD_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly appleTokenService: AppleTokenService,
  ) {}

  /**
   * 매일 자정(KST 00:00 = UTC 15:00)에 실행
   * 유예 기간이 지난 탈퇴 대기 사용자를 비식별화 처리
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: "withdraw-cleanup",
    timeZone: "Asia/Seoul",
  })
  async handleWithdrawCleanup() {
    this.logger.log("🔄 회원 탈퇴 배치 처리 시작");

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.GRACE_PERIOD_DAYS);

    try {
      // 유예 기간이 지난 WITHDRAW_PENDING 상태 사용자 조회
      const pendingUsers = await this.prisma.user.findMany({
        where: {
          status: "WITHDRAW_PENDING",
          withdrawRequestedAt: {
            lte: cutoffDate,
          },
        },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
        },
      });

      if (pendingUsers.length === 0) {
        this.logger.log("✅ 처리 대상 탈퇴 회원 없음");
        return;
      }

      this.logger.log(`📋 탈퇴 처리 대상: ${pendingUsers.length}명`);

      let successCount = 0;
      let failCount = 0;

      for (const user of pendingUsers) {
        try {
          await this.anonymizeUser(user.id, user.email);
          successCount++;
        } catch (error) {
          failCount++;
          this.logger.error(
            `❌ 탈퇴 처리 실패 (userId: ${user.id}): ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `✅ 회원 탈퇴 배치 처리 완료 — 성공: ${successCount}, 실패: ${failCount}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ 회원 탈퇴 배치 처리 중 오류: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 개인정보 비식별화 처리
   *
   * 처리 항목:
   * 1. 이름 → "탈퇴회원"
   * 2. 이메일 → SHA-256 해시 (재가입 방지 목적)
   * 3. 전화번호 → null
   * 4. 주소/상세주소/우편번호 → null
   * 5. 본인인증 정보(CI/DI) → null
   * 6. 생년월일/나이/성별 → null
   * 7. JWT 블랙리스트 등록 + 리프레시 토큰 삭제
   * 8. 소셜 계정 연결 해제
   *
   * 보존 항목 (법적 의무):
   * - Payment 결제 기록 (5년)
   * - Enrollment 수강 기록 (5년)
   * - CreditTransaction 크레딧 기록 (5년)
   * - AuditLog 감사 로그 (보존)
   */
  private async anonymizeUser(userId: string, email: string) {
    const hashedEmail = this.hashEmail(email);
    const now = new Date();

    // 0. [iOS 5.1.1(v)] 계정 삭제 시 Apple Sign in with Apple 토큰 revoke.
    //    네트워크 호출이므로 트랜잭션 밖에서 먼저 수행하고, 실패해도 비식별화는 진행한다.
    const appleAccounts = await this.prisma.socialAccount.findMany({
      where: { userId, provider: "apple", appleRefreshToken: { not: null } },
      select: { appleRefreshToken: true },
    });
    for (const acc of appleAccounts) {
      if (acc.appleRefreshToken) {
        await this.appleTokenService.revokeRefreshToken(acc.appleRefreshToken);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. 사용자 개인정보 비식별화
      await tx.user.update({
        where: { id: userId },
        data: {
          firstName: "탈퇴회원",
          lastName: "",
          email: `withdrawn_${hashedEmail}@deleted.teamplus.com`,
          phone: `withdrawn_${userId.substring(0, 8)}`,
          passwordHash: "WITHDRAWN",
          status: "WITHDRAWN",
          withdrawProcessedAt: now,

          // 개인정보 삭제
          ci: null,
          di: null,
          isVerified: false,
          verifiedAt: null,
          birthDate: null,
          koreanAge: null,
          gender: null,
          note: null,
          zipCode: null,
          address: null,
          addressDetail: null,
        },
      });

      // 2. 소셜 계정 연결 해제
      await tx.socialAccount.deleteMany({
        where: { userId },
      });

      // 3. 알림 설정 삭제
      await tx.userNotificationPreference.deleteMany({
        where: { userId },
      });

      // 4. 디바이스 토큰 삭제
      await tx.userDevice.deleteMany({
        where: { userId },
      });

      // 5. 감사 로그 기록 (비식별화 처리 완료)
      await tx.auditLog.create({
        data: {
          userId,
          action: "withdraw_completed",
          resource: "user",
          newValue: {
            originalEmailHash: hashedEmail,
            processedAt: now.toISOString(),
            reason: "grace_period_expired",
          },
        },
      });
    });

    // 6. Redis에서 리프레시 토큰 삭제
    try {
      const redisConfig = this.configService.get("redis");
      const refreshKeyPrefix = redisConfig?.keyPrefix?.refresh || "refresh:";
      await this.redisService.del(`${refreshKeyPrefix}${userId}`);
    } catch (redisError) {
      // Redis 오류는 비식별화 실패로 처리하지 않음 (이미 DB 처리 완료)
      this.logger.warn(
        `Redis 토큰 삭제 실패 (userId: ${userId}): ${redisError instanceof Error ? redisError.message : String(redisError)}`,
      );
    }

    this.logger.log(
      `✅ 개인정보 비식별화 완료: userId=${userId}, emailHash=${hashedEmail.substring(0, 8)}...`,
    );
  }

  /**
   * 이메일 SHA-256 해시 (재가입 확인용)
   */
  private hashEmail(email: string): string {
    return createHash("sha256")
      .update(email.toLowerCase().trim())
      .digest("hex");
  }
}
