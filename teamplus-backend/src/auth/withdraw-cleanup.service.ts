import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { ConfigService } from "@nestjs/config";
import { UploadCleanupService } from "@/common/upload-cleanup.service";
import {
  anonymizeUserWithinTx,
  expireRemainingCreditsWithinTx,
} from "@/common/utils/user-anonymize.util";
import { findBlockingOwnership } from "@/common/utils/withdrawal-guard.util";
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
    private readonly uploadCleanupService: UploadCleanupService,
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
          userType: true,
        },
      });

      if (pendingUsers.length === 0) {
        this.logger.log("✅ 처리 대상 탈퇴 회원 없음");
        return;
      }

      this.logger.log(`📋 탈퇴 처리 대상: ${pendingUsers.length}명`);

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (const user of pendingUsers) {
        try {
          // 유예 기간(7일) 중 재로그인으로 신규 자산(팀·수업·대회·오픈클래스·자녀 수강신청)이
          // 생겼을 수 있어 확정 직전 재검증한다. WITHDRAWN 만 로그인이 막히므로 WITHDRAW_PENDING
          // 상태에서는 신규 팀 생성 등이 가능 → 주인 없는 자산 방지.
          const blockers = await findBlockingOwnership(
            this.prisma,
            user.id,
            user.userType,
          );
          if (blockers.length > 0) {
            skippedCount++;
            this.logger.warn(
              `⏭️ 탈퇴 처리 보류 (userId: ${user.id}): ${blockers.join(", ")} — 다음 배치 재시도`,
            );
            continue;
          }

          await this.anonymizeUser(user.id);
          successCount++;
        } catch (error) {
          failCount++;
          this.logger.error(
            `❌ 탈퇴 처리 실패 (userId: ${user.id}): ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `✅ 회원 탈퇴 배치 처리 완료 — 성공: ${successCount}, 보류: ${skippedCount}, 실패: ${failCount}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ 회원 탈퇴 배치 처리 중 오류: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 개인정보 비식별화 처리 (부모 본인 + 무보호자 자녀 연쇄).
   *
   * 처리 항목:
   * 1. User 개인정보 비식별화 (이름/이메일/전화/본인인증/생년월일/주소/아바타 등)
   * 2. 프로필 사진(avatarUrl) 파기 + 업로드 파일 실삭제 (커밋 후)
   * 3. 소셜 계정 / 알림 설정 / 디바이스 토큰 삭제, 활성 팀 멤버십 종료
   * 4. 다른 활성 보호자가 없는 자녀는 부모와 동일 수준으로 연쇄 익명화
   * 5. Apple Sign in with Apple 토큰 revoke (iOS 5.1.1(v))
   * 6. 리프레시 토큰 삭제 (부모 + 연쇄 익명화된 자녀)
   *
   * 보존 항목 (법적 의무): Payment / Enrollment / CreditTransaction / AuditLog.
   */
  private async anonymizeUser(userId: string): Promise<void> {
    const now = new Date();

    // 0. [iOS 5.1.1(v)] Apple 토큰 revoke. 네트워크 호출이므로 트랜잭션 밖에서 먼저 수행하며,
    //    revokeRefreshToken 은 실패 시 예외 없이 false 를 반환하므로 비식별화는 그대로 진행된다.
    const appleAccounts = await this.prisma.socialAccount.findMany({
      where: { userId, provider: "apple", appleRefreshToken: { not: null } },
      select: { appleRefreshToken: true },
    });
    for (const acc of appleAccounts) {
      if (acc.appleRefreshToken) {
        await this.appleTokenService.revokeRefreshToken(acc.appleRefreshToken);
      }
    }

    // 이 부모의 자녀 중 '다른 활성 보호자'가 없는 자녀 = 연쇄 익명화 대상
    const childLinks = await this.prisma.parentChild.findMany({
      where: { parentId: userId },
      select: { childId: true },
    });
    const orphanChildIds: string[] = [];
    for (const { childId } of childLinks) {
      const otherActiveGuardians = await this.prisma.parentChild.count({
        where: {
          childId,
          parentId: { not: userId },
          parent: { status: { notIn: ["WITHDRAWN", "WITHDRAW_PENDING"] } },
        },
      });
      if (otherActiveGuardians === 0) orphanChildIds.push(childId);
    }

    const collectedFileUrls: string[] = [];
    let expiredSessionsTotal = 0;
    await this.prisma.$transaction(async (tx) => {
      // 부모 본인 — 배치 경로는 withdrawRequestedAt(요청 시각) 보존(미전달)
      const parentRes = await anonymizeUserWithinTx(tx, userId, {
        reason: "grace_period_expired",
        now,
      });
      collectedFileUrls.push(...parentRes.fileUrls);

      // 잔여 수업권 전액 소멸 — 유의사항·약관 고지("탈퇴 확정 시 전액 소멸")와 일치
      const parentExpired = await expireRemainingCreditsWithinTx(
        tx,
        userId,
        "회원 탈퇴 확정으로 잔여 수업권 소멸",
      );
      expiredSessionsTotal += parentExpired.expiredSessions;

      // 무보호자 자녀 연쇄 익명화 + 관계 제거 + 잔여 수업권 소멸
      for (const childId of orphanChildIds) {
        const childRes = await anonymizeUserWithinTx(tx, childId, {
          reason: "부모 탈퇴로 인한 자녀 연쇄 익명화",
          now,
          withdrawRequestedAt: now,
        });
        collectedFileUrls.push(...childRes.fileUrls);
        await tx.parentChild.deleteMany({ where: { childId } });

        const childExpired = await expireRemainingCreditsWithinTx(
          tx,
          childId,
          "부모 회원 탈퇴 확정으로 자녀 잔여 수업권 소멸",
        );
        expiredSessionsTotal += childExpired.expiredSessions;
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: "withdraw_completed",
          resource: "user",
          newValue: {
            processedAt: now.toISOString(),
            reason: "grace_period_expired",
            cascadedChildIds: orphanChildIds,
            expiredSessions: expiredSessionsTotal,
          },
        },
      });
    });

    // 커밋 후 부수효과 — best-effort(실패해도 DB 비식별화는 이미 완료되어 개인정보는 제거됨)
    for (const url of collectedFileUrls) {
      await this.uploadCleanupService.cleanupReplacedUpload(url).catch(() => {});
    }
    await this.deleteRefreshToken(userId);
    for (const childId of orphanChildIds) {
      await this.deleteRefreshToken(childId);
    }

    this.logger.log(
      `✅ 개인정보 비식별화 완료: userId=${userId}, cascadedChildren=${orphanChildIds.length}, expiredSessions=${expiredSessionsTotal}`,
    );
  }

  /** Redis 리프레시 토큰 삭제 (실패해도 비식별화 성공으로 처리). */
  private async deleteRefreshToken(userId: string): Promise<void> {
    try {
      const redisConfig = this.configService.get("redis");
      const refreshKeyPrefix = redisConfig?.keyPrefix?.refresh || "refresh:";
      await this.redisService.del(`${refreshKeyPrefix}${userId}`);
    } catch (redisError) {
      this.logger.warn(
        `Redis 토큰 삭제 실패 (userId: ${userId}): ${redisError instanceof Error ? redisError.message : String(redisError)}`,
      );
    }
  }
}
