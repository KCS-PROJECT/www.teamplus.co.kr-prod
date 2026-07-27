import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";
import { CreditDomainService } from "./credit-domain.service";
import { SystemLogService } from "@/logger/system-log.service";

/** SYSTEM 사용자 id 캐시 — cron actorUserId 매핑용 (lazy load) */
let cachedSystemUserId: string | null = null;

@Injectable()
export class CreditExpiryService {
  private readonly logger = new Logger(CreditExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): 만료 + 이월 단일 진입점
    private readonly systemLog: SystemLogService,
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

  /* [제거 2026-07-24] sendExpiryWarnings(만료 사전 알림 7/3/1일 전 09:00 cron) —
   *  크레딧 미사용 전환 정책에 따라 알림 발송 폐기(사용자 지시). 만료 처리(processExpiredCredits)는 유지. */
}
