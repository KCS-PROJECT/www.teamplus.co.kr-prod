import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { CreditDomainService } from "./credit-domain.service";
import { SystemLogService } from "@/logger/system-log.service";

/** SYSTEM 사용자 id 캐시 — cron actorUserId 매핑용 (lazy load) */
let cachedSystemUserId: string | null = null;

/**
 * 만료 사전 통지 시점(만료 N일 전). 7일은 법적 최소선 — 유상 이용권을 사전 고지
 * 없이 소멸시키는 조항은 무효 판단 소지가 있다(약관규제법 §6·§9④).
 */
const EXPIRY_WARNING_DAYS = [7, 3, 1] as const;

@Injectable()
export class CreditExpiryService {
  private readonly logger = new Logger(CreditExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): 만료 + 이월 단일 진입점
    private readonly systemLog: SystemLogService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * NotificationsService 지연 조회.
   *
   * CreditsModule 은 NotificationsModule 을 imports 하지 않으므로 생성자 주입이 불가하다.
   * 알림은 사전 통지 cron 에서만 쓰는 부수 의존이라 모듈 그래프를 넓히는 대신
   * 전역 컨테이너에서 지연 조회한다. 조회 실패는 통지만 건너뛰고 만료 처리는 유지.
   */
  private getNotifications(): NotificationsService | null {
    try {
      return this.moduleRef.get(NotificationsService, { strict: false });
    } catch (error) {
      this.logger.error(
        `NotificationsService 조회 실패 — 만료 사전 통지 스킵: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /** SYSTEM 사용자 id 를 lazy load + 캐시. cron actorUserId 매핑용 */
  private async getSystemUserId(): Promise<string> {
    if (cachedSystemUserId) return cachedSystemUserId;
    const sys = await this.prisma.user.findFirst({
      where: { userType: "SYSTEM" },
      select: { id: true },
    });
    if (!sys) {
      throw new Error(
        "SYSTEM 사용자 시드가 없습니다. seed.ts 의 SYSTEM 계정 생성을 확인하세요.",
      );
    }
    cachedSystemUserId = sys.id;
    return cachedSystemUserId;
  }

  /**
   * 매일 자정 - 만료 크레딧 자동 소멸 처리
   *
   * expiresAt이 현재 시각보다 과거이고 잔여 크레딧이 남아 있는 건을 조회하여
   * MemberCredit.usedSessions를 totalSessions로 갱신 + CreditTransaction(type: expired) 기록
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processExpiredCredits() {
    this.logger.log("만료 크레딧 소멸 배치 시작");

    try {
      const now = new Date();

      // 만료되었으나 아직 잔여 크레딧이 남아 있는 건 조회
      const expiredCredits = await this.prisma.memberCredit.findMany({
        where: {
          expiresAt: { lt: now },
          // usedSessions < totalSessions 인 건만 (소멸할 잔여분이 있는 건)
        },
        include: {
          user: { select: { id: true } },
        },
      });

      // 실제 잔여분이 있는 건만 필터
      const creditsToExpire = expiredCredits.filter(
        (c) => c.totalSessions - c.usedSessions > 0,
      );

      if (creditsToExpire.length === 0) {
        this.logger.log("소멸 처리할 만료 크레딧이 없습니다.");
        return { processedCount: 0 };
      }

      let processedCount = 0;

      const systemUserId = await this.getSystemUserId();

      for (const credit of creditsToExpire) {
        try {
          const remainingCredits = credit.totalSessions - credit.usedSessions;

          await this.prisma.$transaction(async (tx) => {
            // 1~3. PR-B (v0.5): CreditDomainService.expireRemaining 위임
            //    내부에서 이월 처리 + 원본 소진 + creditTransaction(expired) 일괄 처리
            await this.creditDomain.expireRemaining(tx, {
              memberCreditId: credit.id,
              actorUserId: systemUserId,
            });

            // 4. 연결된 Enrollment.status 'paid' → 'completed' 전환
            //    동일 (userId, classId) 에서 paid 상태인 가장 최근 Enrollment 1건 전환.
            const paidEnrollment = await tx.enrollment.findFirst({
              where: {
                childId: credit.userId,
                classId: credit.classId,
                status: "paid",
              },
              orderBy: { paidAt: "desc" },
              select: { id: true },
            });

            if (paidEnrollment) {
              await tx.enrollment.update({
                where: { id: paidEnrollment.id },
                data: { status: "completed" },
              });

              this.logger.debug(
                `Enrollment 완료 전환: enrollmentId=${paidEnrollment.id}`,
              );
            }

            // 5. ClassRegistration.status active → inactive 전환
            const registration = await tx.classRegistration.findUnique({
              where: {
                classId_userId: {
                  classId: credit.classId,
                  userId: credit.userId,
                },
              },
              select: { id: true, status: true },
            });

            if (registration && registration.status === "active") {
              await tx.classRegistration.update({
                where: { id: registration.id },
                data: { status: "inactive" },
              });

              this.logger.debug(
                `ClassRegistration 비활성화: classId=${credit.classId}, userId=${credit.userId}`,
              );
            }
          });

          processedCount++;

          this.logger.debug(
            `크레딧 소멸 처리 완료: creditId=${credit.id}, 소멸 수량=${remainingCredits}`,
          );
        } catch (error) {
          this.logger.error(
            `크레딧 소멸 처리 실패: creditId=${credit.id}`,
            error.stack,
          );
        }
      }

      this.logger.log(
        `만료 크레딧 소멸 배치 완료: ${processedCount}/${creditsToExpire.length}건 처리`,
      );
      this.systemLog.cron(
        "CREDIT_EXPIRY",
        `만료 크레딧 소멸 배치 완료: ${processedCount}/${creditsToExpire.length}건 처리`,
      );

      return { processedCount };
    } catch (error) {
      this.logger.error(
        `만료 크레딧 소멸 배치 실패: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 매일 09:00 - 만료 사전 통지 (7일/3일/1일 전)
   *
   * [복원 2026-07-30] 유상 취득한 수업권을 사전 고지 없이 소멸시키는 구조는 고객에게
   * 부당하게 불리한 조항으로 무효 판단 소지가 있어(약관규제법 §6·§9④) 최소 7일 전
   * 1회 통지를 법적 최소선으로 되살린다. 발급 시 최소 유효기간
   * (MIN_CREDIT_VALIDITY_DAYS)이 보장되므로 7일 전 통지는 항상 1회 이상 발송된다.
   *
   * 발송 실패는 사용자 단위로 격리한다 — 통지 실패가 자정 만료 배치를 막지 않는다.
   */
  @Cron("0 0 9 * * *") // 매일 09:00
  async sendExpiryWarnings() {
    this.logger.log("수업권 만료 사전 통지 배치 시작");

    const notifications = this.getNotifications();
    if (!notifications) {
      return { totalNotifications: 0 };
    }

    try {
      const now = new Date();
      let totalNotifications = 0;

      for (const days of EXPIRY_WARNING_DAYS) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + days);

        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const expiringCredits = await this.prisma.memberCredit.findMany({
          where: { expiresAt: { gte: startOfDay, lte: endOfDay } },
          select: {
            userId: true,
            totalSessions: true,
            usedSessions: true,
            expiresAt: true,
          },
        });

        // 사용자별 잔여 회차 합산 — 같은 날 만료 건이 여러 개여도 통지는 1건.
        const userCreditMap = new Map<
          string,
          { totalRemaining: number; expiresAt: Date }
        >();
        for (const credit of expiringCredits) {
          const remaining = credit.totalSessions - credit.usedSessions;
          if (remaining <= 0) continue;
          const existing = userCreditMap.get(credit.userId);
          if (existing) {
            existing.totalRemaining += remaining;
          } else {
            userCreditMap.set(credit.userId, {
              totalRemaining: remaining,
              expiresAt: credit.expiresAt,
            });
          }
        }
        if (userCreditMap.size === 0) continue;

        // 만료일이 동일한 사용자끼리 묶어 notifyUsers 배치 1회로 발송
        //   (인앱 적재는 수신거부와 무관하게 전원 — 법정 고지 성격).
        const byExpiryDate = new Map<string, string[]>();
        for (const [userId, info] of userCreditMap) {
          const key = `${info.expiresAt.toISOString().split("T")[0]}|${info.totalRemaining}`;
          const bucket = byExpiryDate.get(key);
          if (bucket) bucket.push(userId);
          else byExpiryDate.set(key, [userId]);
        }

        for (const [key, userIds] of byExpiryDate) {
          const [expiryDateStr, remaining] = key.split("|");
          try {
            await notifications.notifyUsers(userIds, {
              notificationType: "credit_expiry_warning",
              title: "수업권 만료 예정",
              message: `보유 수업권 ${remaining}회가 ${days}일 후(${expiryDateStr})에 만료됩니다. 만료 전에 사용해주세요.`,
              linkUrl: "/credits",
            });
            totalNotifications += userIds.length;
          } catch (error) {
            this.logger.error(
              `만료 사전 통지 발송 실패: days=${days}, 대상=${userIds.length}명`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }

        this.logger.log(
          `${days}일 전 만료 통지: ${userCreditMap.size}명 대상 발송`,
        );
      }

      this.logger.log(
        `수업권 만료 사전 통지 배치 완료: 총 ${totalNotifications}건 발송`,
      );
      this.systemLog.cron(
        "CREDIT_EXPIRY_WARNING",
        `수업권 만료 사전 통지 배치 완료: 총 ${totalNotifications}건 발송`,
      );

      return { totalNotifications };
    } catch (error) {
      this.logger.error(
        `수업권 만료 사전 통지 배치 실패: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      // 통지 배치 실패가 만료 처리 cron 에 영향을 주지 않도록 여기서 종결한다.
      return { totalNotifications: 0 };
    }
  }
}
