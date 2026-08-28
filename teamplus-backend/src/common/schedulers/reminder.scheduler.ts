import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { SystemLogService } from "../../logger/system-log.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { dbDateToKstYearMonth } from "@/payments/settlement/attribution.util";
import { AWAITING_EXPIRY } from "@/common/enrollment/enrollment-status.constants";
import { deriveClassLifecycle } from "@/common/utils/class-lifecycle.util";

/** 후불 미납 독촉 — 결제자 1명분으로 합산되는 개별 청구. */
interface UnpaidReminderItem {
  amount: number;
  orderNumber: string | null;
  /** 결제 화면 표시명 — 정산 확정 알림(postpaid_billing)의 name 파라미터와 동일 포맷. */
  paymentName: string;
  /** 청구 시각 = Payment 생성 시각. 독촉 기산점이자 발송 이력 집계 하한. */
  billedAt: Date;
}

@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  /** 자동 독촉 상한(회) — 소진 후에는 감독의 수동 미납 안내로 넘긴다. */
  private readonly UNPAID_REMINDER_MAX = 3;
  /** 첫 독촉 기산 시간이자 재발송 최소 간격(시간). */
  private readonly UNPAID_REMINDER_INTERVAL_HOURS = 48;

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLog: SystemLogService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 1시간마다: 미응답 RSVP 리마인드
   * - 24시간 전에 생성된 PENDING RSVP 중 미응답 건 조회
   * - 해당 사용자에게 알림 생성
   */
  // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ─────────────────────────
  // [STATUS] cron 비활성 — 신규 자동 생성 차단 후 기존 PENDING 잔여 데이터에 매시간 알림 발송 방지
  // [WHY] RSVP 기능 미완성 (학부모 /rsvp API 경로 오류, 코치 /coach-rsvp 진입점 0개) + 백데이터 6건 전수 검증 결과 비즈니스 출처 0건
  // [TO RE-ENABLE] 아래 @Cron 데코레이터 주석 해제
  // [TO DELETE] grep "RSVP_DISABLED_2026-05-28" 으로 일괄 검색 → handleRsvpReminder 함수 통째 삭제
  // [REF] docs/Planning/RSVP_FEATURE_ANALYSIS.md §6
  // @Cron(CronExpression.EVERY_HOUR)
  // ─── RSVP_DISABLED_2026-05-28 ─── END ───────────────────────────
  async handleRsvpReminder() {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const pendingRsvps = await this.prisma.classRsvp.findMany({
        where: {
          status: "PENDING",
          createdAt: { lt: twentyFourHoursAgo },
        },
        include: {
          schedule: {
            select: {
              id: true,
              scheduledDate: true,
              class: { select: { className: true } },
            },
          },
        },
      });

      if (pendingRsvps.length === 0) return;

      // 중복 알림 방지: 최근 24시간 이내 동일 사용자에게 rsvp_reminder 발송 이력 확인
      const recentNotifications = await this.prisma.notification.findMany({
        where: {
          notificationType: "rsvp_reminder",
          createdAt: { gte: twentyFourHoursAgo },
        },
        select: { userId: true },
      });
      const recentlyNotifiedUserIds = new Set(
        recentNotifications.map((n) => n.userId),
      );

      const notifications = pendingRsvps
        .filter((rsvp) => !recentlyNotifiedUserIds.has(rsvp.userId))
        .map((rsvp) => ({
          userId: rsvp.userId,
          notificationType: "rsvp_reminder",
          title: "수업 참석 응답 요청",
          message: `"${rsvp.schedule.class?.className ?? "수업"}" 참석 여부를 응답해주세요.`,
          isRead: false,
        }));

      if (notifications.length === 0) return;

      const result = await this.prisma.notification.createMany({
        data: notifications,
      });

      this.logger.log(
        `RSVP 리마인드 알림 ${result.count}건 생성 (미응답 ${pendingRsvps.length}건)`,
      );
    } catch (error) {
      this.logger.error("RSVP 리마인드 처리 실패", error);
    }
  }

  /**
   * 매일 오전 9시(KST): 후불 청구 미납 독촉
   *
   * 대상은 감독·코치가 **확정한 후불 청구** 중 결제자가 아직 결제하지 않은 건이다.
   *  - 수업: MonthlyPostpaidBillingLine (팀 수업·오픈클래스 공용 — billing 은 classId 기준)
   *  - 대회: 후불 대회 참가비 (billingMode=POSTPAID 한정)
   *
   * 기산점은 청구 Payment 생성 시각 — 정산 미확정 건은 애초에 Payment 가 없어 대상이 아니다.
   * 결제·취소·환불되면 Payment 가 pending 을 벗어나므로 자동으로 대상에서 빠진다.
   *
   * ⚠️ 선불 미결제는 대상이 아니다. 선불은 결제 완료 전 수강이 성립하지 않아
   *    "결제 이탈"일 뿐 채권이 아니며, 미수금은 확정 청구만으로 정의한다.
   */
  @Cron("0 9 * * *", { timeZone: "Asia/Seoul" })
  async handlePaymentReminder() {
    try {
      const intervalMs = this.UNPAID_REMINDER_INTERVAL_HOURS * 60 * 60 * 1000;
      const now = Date.now();
      const billedBefore = new Date(now - intervalMs);
      const resentAfter = new Date(now - intervalMs);

      const [classLines, tournamentRegs] = await Promise.all([
        this.prisma.monthlyPostpaidBillingLine.findMany({
          where: {
            paymentStatus: "pending",
            billing: { status: "confirmed" },
            payment: {
              paymentStatus: "pending",
              createdAt: { lt: billedBefore },
            },
          },
          select: {
            amount: true,
            billing: { select: { yearMonth: true } },
            payment: {
              select: { userId: true, orderNumber: true, createdAt: true },
            },
          },
        }),
        // billingMode 한정 필수 — 선불 대회의 미완료 신청도 PENDING 이라, 필터를 빼면
        //   결제 이탈자를 미납으로 독촉하게 된다(후불은 감독 정산 시에만 PENDING 전환).
        this.prisma.tournamentRegistration.findMany({
          where: {
            paymentStatus: "PENDING",
            tournament: { billingMode: "POSTPAID" },
            payment: {
              paymentStatus: "pending",
              createdAt: { lt: billedBefore },
            },
          },
          select: {
            calculatedFee: true,
            tournament: { select: { name: true } },
            payment: {
              select: { userId: true, orderNumber: true, createdAt: true },
            },
          },
        }),
      ]);

      // 결제자(학부모) 단위로 합산 — 수업·대회 여러 건이어도 알림은 1건.
      const byPayer = new Map<string, UnpaidReminderItem[]>();
      const addItem = (userId: string, item: UnpaidReminderItem) => {
        const list = byPayer.get(userId);
        if (list) list.push(item);
        else byPayer.set(userId, [item]);
      };
      for (const line of classLines) {
        if (!line.payment?.userId) continue;
        addItem(line.payment.userId, {
          amount: line.amount,
          orderNumber: line.payment.orderNumber ?? null,
          paymentName: `${line.billing.yearMonth} 수업료`,
          billedAt: line.payment.createdAt,
        });
      }
      for (const reg of tournamentRegs) {
        if (!reg.payment?.userId) continue;
        addItem(reg.payment.userId, {
          amount: Number(reg.calculatedFee),
          orderNumber: reg.payment.orderNumber ?? null,
          paymentName: `${reg.tournament.name} 참가비`,
          billedAt: reg.payment.createdAt,
        });
      }

      const payerIds = [...byPayer.keys()];
      if (payerIds.length === 0) return;

      // 발송 이력 — 재발송 간격과 자동 발송 상한 판정용.
      //   간격은 감독 수동 독촉(payment_unpaid)도 함께 세어 같은 날 중복 발송을 막고,
      //   상한은 자동 발송(payment_reminder)만 센다(수동은 감독 판단이므로 무제한).
      const earliestBilledAt = new Date(
        Math.min(
          ...[...byPayer.values()]
            .flat()
            .map((item) => item.billedAt.getTime()),
        ),
      );
      const history = await this.prisma.notification.findMany({
        where: {
          userId: { in: payerIds },
          notificationType: { in: ["payment_reminder", "payment_unpaid"] },
          createdAt: { gte: earliestBilledAt },
        },
        select: { userId: true, notificationType: true, createdAt: true },
      });

      let sent = 0;
      let skipped = 0;
      for (const [userId, items] of byPayer) {
        const billedAt = new Date(
          Math.min(...items.map((item) => item.billedAt.getTime())),
        );
        const mine = history.filter(
          (h) => h.userId === userId && h.createdAt >= billedAt,
        );
        const recentlyNotified = mine.some((h) => h.createdAt >= resentAfter);
        const autoCount = mine.filter(
          (h) => h.notificationType === "payment_reminder",
        ).length;
        if (recentlyNotified || autoCount >= this.UNPAID_REMINDER_MAX) {
          skipped += 1;
          continue;
        }

        const total = items.reduce((sum, item) => sum + item.amount, 0);
        const single = items.length === 1 ? items[0] : null;
        // 단건은 해당 청구 결제 화면으로 직행, 복수는 미납 목록 탭으로.
        const linkUrl =
          single && single.orderNumber
            ? `/payment/postpaid?orderNumber=${encodeURIComponent(single.orderNumber)}&amount=${single.amount}&name=${encodeURIComponent(single.paymentName)}`
            : "/payment/history?tab=pending";
        const message = single
          ? `${single.paymentName} ${single.amount.toLocaleString()}원 결제가 아직 완료되지 않았습니다.`
          : `미납 ${items.length}건 ${total.toLocaleString()}원 결제가 아직 완료되지 않았습니다.`;

        // 한 사람의 발송 실패가 배치 전체를 중단시키지 않도록 대상별로 격리한다.
        try {
          await this.notifications.notifyUsers([userId], {
            notificationType: "payment_reminder",
            title: "미납 결제 안내",
            message,
            linkUrl,
          });
          sent += 1;
        } catch (error) {
          this.logger.warn(
            `미납 독촉 발송 실패: userId=${userId}, ${(error as Error).message}`,
          );
        }
      }

      this.logger.log(
        `후불 미납 독촉 ${sent}건 발송 (대상 ${payerIds.length}명, 간격·상한 제외 ${skipped}명)`,
      );
      this.systemLog.cron(
        "UNPAID_REMINDER",
        `후불 미납 독촉 발송: ${sent}건 (대상 ${payerIds.length}명, 제외 ${skipped}명)`,
      );
    } catch (error) {
      this.logger.error("후불 미납 독촉 처리 실패", error);
      this.systemLog.cron("UNPAID_REMINDER", "후불 미납 독촉 처리 실패", {
        level: "ERROR",
      });
    }
  }

  /**
   * 매일 자정: 만료된 Enrollment 자동 처리
   * - expiresAt이 지난 pending/pending_approval Enrollment
   * - status를 'expired'로 일괄 변경
   *
   * expiresAt 은 "승인·결제를 기다리는 상태"의 시한이므로 기다림이 끝난 approved 는 제외한다.
   * 후불 수강이 approved 를 활성 상태로 쓰기 때문에, 포함하면 정상 수강자가 등록 72시간 뒤
   * expired 로 뒤집혀 BOTH(선택형) 수업의 후불 출석이 정산 집계에서 누락된다.
   *
   * ⚠️ ClassRegistration 의 'expired'(판매 시작 시 미갱신 선수 배치 해제)와는 다른 개념 —
   *    이쪽은 기한 만료다.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredEnrollments() {
    try {
      const now = new Date();

      const result = await this.prisma.enrollment.updateMany({
        where: {
          expiresAt: { lt: now },
          // 만료 대상 2종 — approved(후불 수강 중) 포함 금지. 중복 차단 집합과 다름.
          status: { in: AWAITING_EXPIRY },
        },
        data: { status: "expired" },
      });

      if (result.count > 0) {
        this.logger.log(`만료 Enrollment ${result.count}건 자동 처리 완료`);
      }
      this.systemLog.cron(
        "ENROLLMENT_EXPIRY",
        `만료 Enrollment 자동 처리 완료: ${result.count}건`,
      );
    } catch (error) {
      this.logger.error("만료 Enrollment 처리 실패", error);
      this.systemLog.cron("ENROLLMENT_EXPIRY", "만료 Enrollment 처리 실패", {
        level: "ERROR",
      });
    }
  }

  /**
   * 판매 준비 리마인더 — 월 판매 사이클(일정·상품 등록 후 [판매 시작])이 수동이라
   * 감독이 잊으면 신규 결제 차단·지난달 결제자 무기한 잔류로 상태가 방치된다.
   * 매월 25일(다음 달 사전 준비 유도)·1일(당월 미처리 재알림) 09:00 KST 에
   * 대상월 판매 시작이 안 된 수업을 소유자(팀 감독/아카데미 원장)별 합산 1건으로 통지.
   */
  @Cron("0 9 25 * *", { timeZone: "Asia/Seoul" })
  async handleSalesPrepReminderPre() {
    await this.runSalesPrepReminder("next");
  }

  @Cron("0 9 1 * *", { timeZone: "Asia/Seoul" })
  async handleSalesPrepReminderStart() {
    await this.runSalesPrepReminder("current");
  }

  private async runSalesPrepReminder(scope: "next" | "current") {
    try {
      // KST 연·월 — +9h 보정값은 getUTC* getter 와 짝으로만 사용(시간 규약).
      const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      let year = kst.getUTCFullYear();
      let monthIdx = kst.getUTCMonth();
      if (scope === "next") {
        monthIdx += 1;
        if (monthIdx > 11) {
          monthIdx = 0;
          year += 1;
        }
      }
      const targetYm = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;

      // 운영 중 + 활성 수강생 보유 수업만 — 수강생 0 수업은 방치돼도 피해자가 없다.
      //   리마인더 중단 수단은 수업 종료(endedAt) — 설계된 생애주기 액션.
      //   ⚠️ spot(1회용) 파생 자동 종료는 endedAt=null 이라 where 로 거를 수 없다 —
      //   아래에서 deriveClassLifecycle(수명주기 SoT)로 ENDED 를 제외한다.
      const classes = await this.prisma.class.findMany({
        where: {
          endedAt: null,
          registrations: { some: { status: "active" } },
        },
        select: {
          id: true,
          className: true,
          salesOpenMonth: true,
          trainingType: true,
          teamId: true,
          schedules: {
            where: { isCancelled: false },
            select: { scheduledDate: true },
          },
          academy: { select: { directorId: true } },
        },
      });

      // 대상 수업 선별 — 파생 종료 제외 + 대상월 판매 미시작만.
      const pendingClasses: {
        className: string;
        teamId: string | null;
        academyDirectorId: string | null;
      }[] = [];
      for (const cls of classes) {
        const lifecycle = deriveClassLifecycle({
          endedAt: null,
          salesOpenMonth: cls.salesOpenMonth,
          trainingType: cls.trainingType,
          schedules: cls.schedules,
        });
        if (lifecycle.state === "ENDED") continue; // spot 파생 종료
        const salesYm = cls.salesOpenMonth
          ? dbDateToKstYearMonth(cls.salesOpenMonth)
          : null;
        if (salesYm != null && salesYm >= targetYm) continue; // 대상월 판매 시작 완료
        pendingClasses.push({
          className: cls.className,
          teamId: cls.teamId,
          academyDirectorId: cls.academy?.directorId ?? null,
        });
      }

      // 수신자 — 판매 시작 권한 SoT(assertTeamManagerPermission)와 동일 집합:
      //   팀 = 승인된 관리역할 TeamMember ∪ Team.coachId / 오픈클래스 = 원장.
      //   레거시 Team.coachId FK 오염 이력이 있어 단독 의존하지 않고, 발송 전
      //   실존 사용자로 한 번 거른다(무효 id 1건이 createMany 전체를 깨는 것 방지).
      const teamIds = [
        ...new Set(
          pendingClasses.map((c) => c.teamId).filter((v): v is string => !!v),
        ),
      ];
      const [teamManagers, teamOwners] = teamIds.length
        ? await Promise.all([
            this.prisma.teamMember.findMany({
              where: {
                teamId: { in: teamIds },
                approvalStatus: "approved",
                leftAt: null,
                roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
              },
              select: { teamId: true, userId: true },
            }),
            this.prisma.team.findMany({
              where: { id: { in: teamIds } },
              select: { id: true, coachId: true },
            }),
          ])
        : [[], []];
      const managersByTeam = new Map<string, Set<string>>();
      for (const m of teamManagers) {
        const set = managersByTeam.get(m.teamId) ?? new Set<string>();
        set.add(m.userId);
        managersByTeam.set(m.teamId, set);
      }
      for (const t of teamOwners) {
        const set = managersByTeam.get(t.id) ?? new Set<string>();
        set.add(t.coachId);
        managersByTeam.set(t.id, set);
      }

      const pendingByOwner = new Map<string, string[]>();
      const addPending = (ownerId: string, className: string) => {
        const list = pendingByOwner.get(ownerId);
        if (list) {
          list.push(className);
        } else {
          pendingByOwner.set(ownerId, [className]);
        }
      };
      for (const cls of pendingClasses) {
        if (cls.teamId) {
          for (const ownerId of managersByTeam.get(cls.teamId) ?? []) {
            addPending(ownerId, cls.className);
          }
        } else if (cls.academyDirectorId) {
          addPending(cls.academyDirectorId, cls.className);
        }
      }

      // 실존 사용자 필터 — 오염된 coachId 가 알림 적재를 깨지 않도록.
      const validUserIds = new Set(
        (
          await this.prisma.user.findMany({
            where: { id: { in: [...pendingByOwner.keys()] } },
            select: { id: true },
          })
        ).map((u) => u.id),
      );

      let sent = 0;
      const monthLabel = monthIdx + 1;
      for (const [ownerId, names] of pendingByOwner) {
        if (!validUserIds.has(ownerId)) continue;
        const head = names.slice(0, 3).join(", ");
        const rest = names.length > 3 ? ` 외 ${names.length - 3}개` : "";
        try {
          await this.notifications.notifyUsers([ownerId], {
            notificationType: "class_sales_prep_reminder",
            title: "판매 준비 안내",
            message: `${monthLabel}월 판매 시작이 필요한 수업이 ${names.length}개 있습니다: ${head}${rest}. 일정·수업권 확인 후 판매를 시작해주세요.`,
            linkUrl: "/classes-manage",
          });
          sent += 1;
        } catch (error) {
          this.logger.warn(
            `판매 준비 리마인더 발송 실패: ownerId=${ownerId}, ${(error as Error).message}`,
          );
        }
      }

      this.systemLog.cron(
        "SALES_PREP_REMINDER",
        `판매 준비 리마인더(${targetYm}) 발송: 관리자 ${sent}명 / 대상 수업 ${pendingClasses.length}개`,
      );
    } catch (error) {
      this.logger.error("판매 준비 리마인더 처리 실패", error);
      this.systemLog.cron("SALES_PREP_REMINDER", "판매 준비 리마인더 처리 실패", {
        level: "ERROR",
      });
    }
  }
}
