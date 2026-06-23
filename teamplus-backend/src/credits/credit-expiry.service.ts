import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { CreditDomainService } from "./credit-domain.service";

/** SYSTEM 사용자 id 캐시 — cron actorUserId 매핑용 (lazy load) */
let cachedSystemUserId: string | null = null;

@Injectable()
export class CreditExpiryService {
  private readonly logger = new Logger(CreditExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): 만료 + 이월 단일 진입점
  ) {}

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
   * 매일 오전 9시 - 만료 사전 알림 발송 (7일/3일/1일 전)
   *
   * 만료 예정 크레딧이 있는 회원에게 앱 내 알림을 발송합니다.
   */
  @Cron("0 0 9 * * *") // 매일 09:00
  async sendExpiryWarnings() {
    this.logger.log("크레딧 만료 사전 알림 배치 시작");

    try {
      const now = new Date();
      const warningDays = [7, 3, 1];
      let totalNotifications = 0;

      for (const days of warningDays) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + days);

        // 해당 일자에 만료되는 크레딧 조회 (해당일의 시작~끝)
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const expiringCredits = await this.prisma.memberCredit.findMany({
          where: {
            expiresAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
          include: {
            user: { select: { id: true } },
          },
        });

        // 잔여 크레딧이 있는 건만 필터
        const creditsWithRemaining = expiringCredits.filter(
          (c) => c.totalSessions - c.usedSessions > 0,
        );

        // 동일 사용자에 대해 크레딧을 그룹핑 (사용자별 합산 알림)
        const userCreditMap = new Map<
          string,
          { totalRemaining: number; expiresAt: Date }
        >();

        for (const credit of creditsWithRemaining) {
          const userId = credit.userId;
          const remaining = credit.totalSessions - credit.usedSessions;
          const existing = userCreditMap.get(userId);

          if (existing) {
            existing.totalRemaining += remaining;
          } else {
            userCreditMap.set(userId, {
              totalRemaining: remaining,
              expiresAt: credit.expiresAt,
            });
          }
        }

        // 사용자별 알림 발송
        for (const [userId, info] of userCreditMap) {
          try {
            const expiryDateStr = info.expiresAt.toISOString().split("T")[0];

            await this.notificationsService.createNotification({
              userId,
              notificationType: "credit_expiry_warning",
              title: "크레딧 만료 예정",
              message: `보유 크레딧 ${info.totalRemaining}회가 ${days}일 후(${expiryDateStr})에 만료됩니다. 만료 전에 사용해주세요.`,
            });

            totalNotifications++;
          } catch (error) {
            this.logger.error(
              `크레딧 만료 알림 발송 실패: userId=${userId}, days=${days}`,
              error.stack,
            );
          }
        }

        if (userCreditMap.size > 0) {
          this.logger.log(
            `${days}일 전 만료 알림: ${userCreditMap.size}명에게 발송`,
          );
        }
      }

      this.logger.log(
        `크레딧 만료 사전 알림 배치 완료: 총 ${totalNotifications}건 발송`,
      );

      return { totalNotifications };
    } catch (error) {
      this.logger.error(
        `크레딧 만료 사전 알림 배치 실패: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
