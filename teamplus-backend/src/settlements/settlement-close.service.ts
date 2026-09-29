import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import {
  Prisma,
  SettlementDetailStatus,
  SettlementEntryType,
  SettlementSourceType,
} from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import {
  instantToKstDateOnly,
  nowKstParts,
} from "@/common/utils/kst-date.util";
import {
  dbDateToKstYearMonth,
  instantToKstYearMonth,
} from "@/payments/settlement/attribution.util";
import {
  resolvePaymentTeamIds,
  PaymentTeamLinks,
} from "@/payments/settlement/payment-team-scope.util";
import { acquireSettlementCloseLock } from "./utils/settlement-locks.util";
import { SETTLEMENT_STATUS } from "./constants/settlement-status.constant";

/**
 * approve/payout 등으로 확정되어 재계산 대상에서 제외되는 상태 — 그 팀은 잠긴 채 skip.
 * "completed" 는 현재 SETTLEMENT_STATUS 상수엔 없는 레거시 값(과거 데이터 잔존 가능성,
 * 실측 0건)이지만 방어적으로 잠금 대상에 포함한다.
 */
const LOCKED_STATUSES: readonly string[] = [
  SETTLEMENT_STATUS.APPROVED,
  SETTLEMENT_STATUS.PROCESSING,
  SETTLEMENT_STATUS.PAID,
  SETTLEMENT_STATUS.FAILED,
  "completed",
];

/** 마감 대상 결제 상태 — refund_processing 도 실결제(완료)라 정상 PAYMENT 행으로 포함한다. */
const CLOSABLE_PAYMENT_STATUSES = [
  "completed",
  "refunded",
  "partially_refunded",
  "refund_processing",
];

/** 매출로 집계하지 않는 결제사 — 테스트용(mock)·무료(free) 결제는 현금 이동이 없다. */
const NON_CASH_PG_PROVIDERS = new Set(["mock", "free"]);

export interface CloseSettlementSkippedTeam {
  teamId: string;
  teamName: string;
  reason: "LOCKED_STATUS" | "FAILED";
  status?: string;
}

export interface CloseSettlementConflict {
  eventKey: string;
  existingSettlementId: string;
}

export interface CloseSettlementLateArrival {
  paymentId: string;
  orderNumber: string;
  teamId: string;
  month: string;
}

export interface CloseSettlementLateRefund {
  refundLogId: string;
  orderNumber: string;
  amount: number;
}

export interface CloseSettlementUnmatchedRefund {
  refundLogId: string;
  orderNumber: string;
  amount: number;
}

export interface CloseSettlementRefundWithoutLog {
  paymentId: string;
  orderNumber: string;
  amount: number;
}

export interface CloseSettlementNegativeNetTeam {
  teamId: string;
  teamName: string;
  netAmount: number;
}

export interface CloseSettlementResult {
  month: string;
  commissionRate: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: CloseSettlementSkippedTeam[];
  totals: {
    teamCount: number;
    paymentCount: number;
    refundCount: number;
    totalRevenue: number;
    refundAmount: number;
    platformFee: number;
    paymentFee: number;
    netAmount: number;
  };
  excluded: { mockAmount: number };
  teamUnattributed: { count: number; amount: number };
  unmatchedRefunds: CloseSettlementUnmatchedRefund[];
  refundsWithoutLog: CloseSettlementRefundWithoutLog[];
  lateArrivals: CloseSettlementLateArrival[];
  lateRefunds: CloseSettlementLateRefund[];
  conflicts: CloseSettlementConflict[];
  negativeNetTeams: CloseSettlementNegativeNetTeam[];
  warnings: { previousMonthNotClosed: boolean };
}

/** 결제/환불 1건 → SettlementDetail 1행 초안(settlementId 는 팀 마감 시점에 확정). */
interface DraftDetailRow {
  teamId: string;
  paymentId: string;
  orderNumber: string;
  entryType: SettlementEntryType;
  refundLogId: string | null;
  eventKey: string;
  productName: string;
  sourceType: SettlementSourceType;
  sourceId: string | null;
  paymentDate: Date;
  paymentMethod: string;
  /** PAYMENT=+금액, REFUND=-환불액. */
  paymentAmount: number;
  feeRate: number;
  /** PAYMENT=+수수료, REFUND=-환급 수수료. */
  feeAmount: number;
  actualAmount: number;
  attributionMonth: string | null;
  memo: string | null;
}

type TeamCloseResult =
  | {
      kind: "locked";
      teamId: string;
      teamName: string;
      status: string;
      lateArrivals: CloseSettlementLateArrival[];
      lateRefunds: CloseSettlementLateRefund[];
    }
  | {
      kind: "deleted" | "noop";
      teamId: string;
      teamName: string;
      conflicts: CloseSettlementConflict[];
    }
  | {
      kind: "closed";
      teamId: string;
      teamName: string;
      created: boolean;
      paymentCount: number;
      refundCount: number;
      totals: {
        totalRevenue: number;
        refundAmount: number;
        platformFee: number;
        paymentFee: number;
        netAmount: number;
      };
      conflicts: CloseSettlementConflict[];
    };

/** 결제 마감 조회용 select — 팀 귀속(payment-team-scope) + 귀속월(attributionMonth) 산정 겸용. */
const CLOSE_PAYMENT_SELECT = {
  id: true,
  orderNumber: true,
  amount: true,
  pgProvider: true,
  paymentMethod: true,
  completedAt: true,
  createdAt: true,
  paymentStatus: true,
  _count: { select: { refundLogs: true } },
  // 관계 배열의 [0] 을 출처·상품명으로 쓰므로 순서를 고정한다(backfill SQL 과 같은 기준).
  enrollments: {
    select: {
      billingMonth: true,
      class: { select: { id: true, teamId: true, className: true } },
    },
    orderBy: { classId: "asc" },
  },
  monthlyBillingLines: {
    select: {
      billing: {
        select: {
          yearMonth: true,
          class: { select: { id: true, teamId: true, className: true } },
        },
      },
    },
    orderBy: { billing: { classId: "asc" } },
  },
  tournamentRegistrations: {
    select: { tournament: { select: { id: true, teamId: true, name: true } } },
    orderBy: { tournamentId: "asc" },
  },
} satisfies Prisma.PaymentSelect;

type ClosePaymentRow = Prisma.PaymentGetPayload<{
  select: typeof CLOSE_PAYMENT_SELECT;
}>;

/**
 * 귀속월(YYYY-MM) — 마감 판정에는 쓰지 않는 표시용 병기값.
 *  선불=enrollment.billingMonth, 후불=billing.yearMonth, 대회=completedAt KST 월.
 */
function resolveAttributionMonth(payment: ClosePaymentRow): string | null {
  const line = payment.monthlyBillingLines[0];
  if (line) return line.billing.yearMonth;
  const enrollment = payment.enrollments[0];
  if (enrollment?.billingMonth) {
    return dbDateToKstYearMonth(enrollment.billingMonth);
  }
  if (payment.tournamentRegistrations.length > 0) {
    return instantToKstYearMonth(payment.completedAt ?? payment.createdAt);
  }
  return null;
}

/**
 * 정산 상세 출처 + productName — 대회 → 선불 수업 → 후불 수업 순(팀 거래탭 subjectName 과
 * 동일 우선순위). 이름과 출처를 한 함수에서 정해 둘이 서로 다른 대상을 가리키지 않게 한다.
 */
function resolveSourceAndName(payment: ClosePaymentRow): {
  sourceType: SettlementSourceType;
  sourceId: string | null;
  productName: string;
} {
  const tournament = payment.tournamentRegistrations[0]?.tournament;
  if (tournament) {
    return {
      sourceType: SettlementSourceType.TOURNAMENT,
      sourceId: tournament.id,
      productName: tournament.name,
    };
  }
  const cls =
    payment.enrollments[0]?.class ??
    payment.monthlyBillingLines[0]?.billing?.class;
  if (cls) {
    return {
      sourceType: SettlementSourceType.CLASS,
      sourceId: cls.id,
      productName: cls.className,
    };
  }
  return {
    sourceType: SettlementSourceType.OTHER,
    sourceId: null,
    productName: "알 수 없음",
  };
}

/** 선택월("YYYY-MM")의 KST 경계 [1일 00:00, 다음달 1일 00:00) → UTC instant 범위. */
function kstMonthBoundsUtc(yearMonth: string): { start: Date; end: Date } {
  const [y, m] = yearMonth.split("-").map(Number);
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - KST_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS),
  };
}

/** "YYYY-MM" 바로 전월. */
function previousYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 재마감 도중 다른 트랜잭션(승인 등)이 먼저 상태를 바꿔 잠긴 것으로 확인된 경우 —
 * closeTeam 이 tx 를 롤백시키기 위해 던지고, 같은 함수 안에서 잡아 "locked" 결과로 변환한다.
 */
class SettlementRaceLockedError extends Error {
  constructor(
    readonly status: string,
    readonly lateArrivals: CloseSettlementLateArrival[],
    readonly lateRefunds: CloseSettlementLateRefund[],
  ) {
    super(`정산 마감 경쟁 감지(잠김으로 전환): status=${status}`);
  }
}

/**
 * [정산 센터] 월 마감 생성기 — "M월 정산 = KST M월에 완료된 결제 − KST M월에 처리된 환불"
 * (현금 기준). 수업/대회 귀속월과 무관하게 돈이 실제로 오간 달을 그대로 마감한다.
 *
 * ⚠️ ADMIN 전용 — 컨트롤러가 @Roles("ADMIN") 로 가드한다(이 서비스는 인가를 직접 하지 않는다).
 * 결제/환불 로그를 그대로 재조회해 팀별 Detail 을 산출하므로, 재실행(재마감)해도 같은
 * 입력이면 같은 금액이 나온다(멱등) — approved/paid 로 확정된 팀만 잠겨 재계산에서 빠진다.
 */
@Injectable()
export class SettlementCloseService {
  private readonly logger = new Logger(SettlementCloseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async closeMonth(month: string): Promise<CloseSettlementResult> {
    this.assertClosableMonth(month);

    const [teams, appSettings] = await Promise.all([
      this.prisma.team.findMany({ select: { id: true, name: true } }),
      this.prisma.appSettings.findFirst({ select: { commissionRate: true } }),
    ]);
    const commissionRate = appSettings ? Number(appSettings.commissionRate) : 0;

    const { start: monthStart, end: monthEnd } = kstMonthBoundsUtc(month);

    const excluded = { mockAmount: 0 };
    const teamUnattributed = { count: 0, amount: 0 };
    const refundsWithoutLog: CloseSettlementRefundWithoutLog[] = [];
    const unmatchedRefunds: CloseSettlementUnmatchedRefund[] = [];
    const groupsByTeam = new Map<string, DraftDetailRow[]>();
    const pushRow = (row: DraftDetailRow) => {
      let arr = groupsByTeam.get(row.teamId);
      if (!arr) {
        arr = [];
        groupsByTeam.set(row.teamId, arr);
      }
      arr.push(row);
    };

    // ── PAYMENT 후보 — completedAt ∈ KST M ──
    const payments = await this.prisma.payment.findMany({
      where: {
        completedAt: { gte: monthStart, lt: monthEnd },
        paymentStatus: { in: CLOSABLE_PAYMENT_STATUSES },
        amount: { gt: 0 },
      },
      select: CLOSE_PAYMENT_SELECT,
    });

    // 같은 배치(이번 달) 안의 PAYMENT 유무 — REFUND 매칭 판정에 쓴다.
    const paymentIdsThisRun = new Set<string>();

    for (const p of payments) {
      if (p.pgProvider && NON_CASH_PG_PROVIDERS.has(p.pgProvider)) {
        excluded.mockAmount += p.amount;
        continue;
      }
      const teamIds = resolvePaymentTeamIds(p);
      if (teamIds.length !== 1) {
        teamUnattributed.count++;
        teamUnattributed.amount += p.amount;
        if (teamIds.length >= 2) {
          this.logger.warn(
            `[정산 마감] 결제 1건이 여러 팀에 귀속됨 — 정산 제외: paymentId=${p.id}, teams=${teamIds.join(",")}`,
          );
        }
        continue;
      }
      const teamId = teamIds[0];
      paymentIdsThisRun.add(p.id);

      if (p.paymentStatus === "refunded" && p._count.refundLogs === 0) {
        refundsWithoutLog.push({
          paymentId: p.id,
          orderNumber: p.orderNumber,
          amount: p.amount,
        });
      }

      const feeAmount = Math.round(p.amount * commissionRate);
      pushRow({
        teamId,
        paymentId: p.id,
        orderNumber: p.orderNumber,
        entryType: SettlementEntryType.PAYMENT,
        refundLogId: null,
        eventKey: `P:${p.id}`,
        ...resolveSourceAndName(p),
        paymentDate: instantToKstDateOnly(p.completedAt ?? p.createdAt),
        paymentMethod: p.paymentMethod ?? p.pgProvider ?? "unknown",
        paymentAmount: p.amount,
        feeRate: commissionRate,
        feeAmount,
        actualAmount: p.amount - feeAmount,
        attributionMonth: resolveAttributionMonth(p),
        memo: null,
      });
    }

    // ── REFUND 후보 — processedAt ∈ KST M ──
    const refundLogs = await this.prisma.refundLog.findMany({
      where: { processedAt: { gte: monthStart, lt: monthEnd } },
      select: {
        id: true,
        paymentId: true,
        refundAmount: true,
        processedAt: true,
        payment: { select: CLOSE_PAYMENT_SELECT },
      },
    });

    if (refundLogs.length > 0) {
      const candidatePaymentEventKeys = [
        ...new Set(refundLogs.map((r) => `P:${r.paymentId}`)),
      ];
      const existingPaymentDetails =
        await this.prisma.settlementDetail.findMany({
          where: { eventKey: { in: candidatePaymentEventKeys } },
          select: { eventKey: true, paymentId: true, feeRate: true },
        });
      const matchedPaymentEventKeys = new Set(
        existingPaymentDetails.map((d) => d.eventKey),
      );
      // 환불 수수료 환급은 "지금" 요율이 아니라 원 결제(PAYMENT 행)가 적용받은 요율을
      //   따른다 — 결제 당시 3%로 걷었으면 환불도 3%만 환급한다(중간에 요율이 바뀌어도).
      const originalFeeRateByPaymentId = new Map(
        existingPaymentDetails.map((d) => [d.paymentId, d.feeRate]),
      );

      for (const r of refundLogs) {
        const original = r.payment;
        if (
          original.pgProvider &&
          NON_CASH_PG_PROVIDERS.has(original.pgProvider)
        ) {
          // 원 결제가 mock/free 면 애초에 정산 대상이 아니었다 — 이미 PAYMENT 쪽에서
          //   mockAmount 로 집계됐으므로 여기서 다시 더하지 않는다(이중 합산 방지).
          //   보고할 것도 없다(원 결제가 정산 대상이 아니므로 이 환불도 조용히 제외).
          continue;
        }
        const teamIds = resolvePaymentTeamIds(original as PaymentTeamLinks);
        if (teamIds.length !== 1) {
          teamUnattributed.count++;
          teamUnattributed.amount += r.refundAmount;
          if (teamIds.length >= 2) {
            this.logger.warn(
              `[정산 마감] 환불 원 결제가 여러 팀에 귀속됨 — 정산 제외: paymentId=${original.id}, refundLogId=${r.id}`,
            );
          }
          continue;
        }
        const teamId = teamIds[0];

        const matched =
          paymentIdsThisRun.has(original.id) ||
          matchedPaymentEventKeys.has(`P:${original.id}`);
        if (!matched) {
          unmatchedRefunds.push({
            refundLogId: r.id,
            orderNumber: original.orderNumber,
            amount: r.refundAmount,
          });
          continue;
        }

        // 이번 배치에서 같이 만든 PAYMENT 행이면 그 행과 같은(=commissionRate) 요율,
        //   아니면 과거에 기록된 원 결제 Detail 의 feeRate 를 그대로 쓴다.
        const originalFeeRate = paymentIdsThisRun.has(original.id)
          ? commissionRate
          : (originalFeeRateByPaymentId.get(original.id) ?? commissionRate);
        const feeAmount = -Math.round(r.refundAmount * originalFeeRate);
        pushRow({
          teamId,
          paymentId: original.id,
          orderNumber: original.orderNumber,
          entryType: SettlementEntryType.REFUND,
          refundLogId: r.id,
          eventKey: `R:${r.id}`,
          ...resolveSourceAndName(original),
          paymentDate: instantToKstDateOnly(r.processedAt),
          paymentMethod:
            original.paymentMethod ?? original.pgProvider ?? "unknown",
          paymentAmount: -r.refundAmount,
          feeRate: originalFeeRate,
          feeAmount,
          actualAmount: -r.refundAmount - feeAmount,
          attributionMonth: resolveAttributionMonth(original),
          memo: "환불",
        });
      }
    }

    // ── 전월 미마감 경고 — 첫 마감(이전 정산이 전혀 없음)이면 경고하지 않는다. ──
    const [prevMonthCount, anyBeforeCount] = await Promise.all([
      this.prisma.settlement.count({
        where: { settlementMonth: previousYearMonth(month) },
      }),
      this.prisma.settlement.count({
        where: { settlementMonth: { lt: month } },
      }),
    ]);
    const previousMonthNotClosed = prevMonthCount === 0 && anyBeforeCount > 0;

    // ── 팀별 마감 ──
    let created = 0;
    let updated = 0;
    let deleted = 0;
    let paymentCount = 0;
    let refundCount = 0;
    let totalRevenue = 0;
    let refundAmount = 0;
    let platformFee = 0;
    let netAmount = 0;
    const skipped: CloseSettlementSkippedTeam[] = [];
    const conflicts: CloseSettlementConflict[] = [];
    const lateArrivals: CloseSettlementLateArrival[] = [];
    const lateRefunds: CloseSettlementLateRefund[] = [];
    const negativeNetTeams: CloseSettlementNegativeNetTeam[] = [];

    for (const team of teams) {
      const candidateRows = groupsByTeam.get(team.id) ?? [];
      let result: TeamCloseResult;
      try {
        result = await this.closeTeam(team.id, team.name, month, candidateRows);
      } catch (err) {
        this.logger.error(
          `[정산 마감] 팀 처리 실패: teamId=${team.id}, month=${month}`,
          err instanceof Error ? err.stack : String(err),
        );
        skipped.push({
          teamId: team.id,
          teamName: team.name,
          reason: "FAILED",
        });
        continue;
      }

      switch (result.kind) {
        case "locked":
          skipped.push({
            teamId: team.id,
            teamName: team.name,
            reason: "LOCKED_STATUS",
            status: result.status,
          });
          lateArrivals.push(...result.lateArrivals);
          lateRefunds.push(...result.lateRefunds);
          break;
        case "deleted":
          deleted++;
          conflicts.push(...result.conflicts);
          break;
        case "noop":
          conflicts.push(...result.conflicts);
          break;
        case "closed":
          if (result.created) created++;
          else updated++;
          paymentCount += result.paymentCount;
          refundCount += result.refundCount;
          totalRevenue += result.totals.totalRevenue;
          refundAmount += result.totals.refundAmount;
          platformFee += result.totals.platformFee;
          netAmount += result.totals.netAmount;
          conflicts.push(...result.conflicts);
          if (result.totals.netAmount < 0) {
            negativeNetTeams.push({
              teamId: team.id,
              teamName: team.name,
              netAmount: result.totals.netAmount,
            });
          }
          break;
      }
    }

    return {
      month,
      commissionRate,
      created,
      updated,
      deleted,
      skipped,
      totals: {
        teamCount: created + updated,
        paymentCount,
        refundCount,
        totalRevenue,
        refundAmount,
        platformFee,
        paymentFee: 0,
        netAmount,
      },
      excluded,
      teamUnattributed,
      unmatchedRefunds,
      refundsWithoutLog,
      lateArrivals,
      lateRefunds,
      conflicts,
      negativeNetTeams,
      warnings: { previousMonthNotClosed },
    };
  }

  /** 당월·미래월(KST 기준) 마감 차단 — 그 달이 끝나기 전엔 청구가 아직 미완성일 수 있다. */
  private assertClosableMonth(month: string): void {
    const { year, month: mm } = nowKstParts();
    const currentYearMonth = `${year}-${mm}`;
    if (month >= currentYearMonth) {
      throw new BadRequestException(
        "해당 월이 종료된 후에 마감할 수 있습니다.",
      );
    }
  }

  /**
   * candidateRows 중 eventKey 가 어느 Detail 에도 없는 것만 "진짜 늦은 도착"으로 분류한다.
   * 이번 배치는 completedAt/processedAt 로 월 M 을 다시 훑은 결과라, 이미 잠긴 정산에
   * 반영된 이벤트도 매번 재검출되므로 이 구분이 없으면 재스캔 자체가 오탐이 된다.
   */
  private async computeLateEvents(
    tx: Prisma.TransactionClient,
    candidateRows: DraftDetailRow[],
    teamId: string,
    month: string,
  ): Promise<{
    lateArrivals: CloseSettlementLateArrival[];
    lateRefunds: CloseSettlementLateRefund[];
  }> {
    const candidateEventKeys = candidateRows.map((r) => r.eventKey);
    const recordedElsewhere =
      candidateEventKeys.length > 0
        ? await tx.settlementDetail.findMany({
            where: { eventKey: { in: candidateEventKeys } },
            select: { eventKey: true },
          })
        : [];
    const recorded = new Set(recordedElsewhere.map((d) => d.eventKey));

    const lateArrivals: CloseSettlementLateArrival[] = [];
    const lateRefunds: CloseSettlementLateRefund[] = [];
    for (const row of candidateRows) {
      if (recorded.has(row.eventKey)) continue; // 이미 반영됨 — 재스캔 오탐 아님.
      if (row.entryType === SettlementEntryType.PAYMENT) {
        lateArrivals.push({
          paymentId: row.paymentId,
          orderNumber: row.orderNumber,
          teamId,
          month,
        });
      } else {
        lateRefunds.push({
          refundLogId: row.refundLogId as string,
          orderNumber: row.orderNumber,
          amount: -row.paymentAmount,
        });
      }
    }
    return { lateArrivals, lateRefunds };
  }

  /**
   * 팀 1개 마감 — pg_advisory_xact_lock 으로 같은 팀의 동시 마감/승인/지급과 직렬화한다.
   * 실패(P2002 등)는 호출측이 catch 해 해당 팀만 FAILED 로 격리한다(전체 마감을 막지 않는다).
   * 재마감 도중 승인 등으로 상태가 먼저 바뀌면(SettlementRaceLockedError) LOCKED_STATUS 로
   * 보고한다 — FAILED 가 아니다.
   */
  private async closeTeam(
    teamId: string,
    teamName: string,
    month: string,
    candidateRows: DraftDetailRow[],
  ): Promise<TeamCloseResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await acquireSettlementCloseLock(tx, teamId);

        const existing = await tx.settlement.findUnique({
          where: { teamId_settlementMonth: { teamId, settlementMonth: month } },
          select: { id: true, status: true },
        });

        if (existing && LOCKED_STATUSES.includes(existing.status)) {
          const { lateArrivals, lateRefunds } = await this.computeLateEvents(
            tx,
            candidateRows,
            teamId,
            month,
          );
          return {
            kind: "locked" as const,
            teamId,
            teamName,
            status: existing.status,
            lateArrivals,
            lateRefunds,
          };
        }

        const candidateEventKeys = candidateRows.map((r) => r.eventKey);
        const existingElsewhere =
          candidateEventKeys.length > 0
            ? await tx.settlementDetail.findMany({
                where: { eventKey: { in: candidateEventKeys } },
                select: { eventKey: true, settlementId: true },
              })
            : [];

        const conflicts: CloseSettlementConflict[] = [];
        const conflictEventKeys = new Set<string>();
        for (const d of existingElsewhere) {
          if (existing && d.settlementId === existing.id) continue; // 이 정산 소속 — 재생성 대상.
          conflictEventKeys.add(d.eventKey);
          conflicts.push({
            eventKey: d.eventKey,
            existingSettlementId: d.settlementId,
          });
        }

        const targetRows = candidateRows.filter(
          (r) => !conflictEventKeys.has(r.eventKey),
        );

        if (targetRows.length === 0) {
          if (
            existing &&
            (existing.status === SETTLEMENT_STATUS.PENDING ||
              existing.status === SETTLEMENT_STATUS.REJECTED)
          ) {
            await tx.settlementDetail.deleteMany({
              where: { settlementId: existing.id },
            });
            await tx.settlement.delete({ where: { id: existing.id } });
            return { kind: "deleted" as const, teamId, teamName, conflicts };
          }
          return { kind: "noop" as const, teamId, teamName, conflicts };
        }

        let settlementId: string;
        let created: boolean;
        if (!existing) {
          const createdSettlement = await tx.settlement.create({
            data: {
              teamId,
              settlementMonth: month,
              status: SETTLEMENT_STATUS.PENDING,
            },
            select: { id: true },
          });
          settlementId = createdSettlement.id;
          created = true;
        } else {
          // pending 또는 rejected → pending 재계산(마감 전용 전이 — settlement-status.constant 참고).
          //   조건 없는 update 는 그 사이 끼어든 승인(pending→approved)을 조용히 되돌린다 —
          //   반드시 조건부 updateMany 로 "여전히 pending/rejected 일 때만" 덮어쓴다.
          settlementId = existing.id;
          created = false;
          const claim = await tx.settlement.updateMany({
            where: {
              id: existing.id,
              status: {
                in: [SETTLEMENT_STATUS.PENDING, SETTLEMENT_STATUS.REJECTED],
              },
            },
            data: { status: SETTLEMENT_STATUS.PENDING },
          });
          if (claim.count !== 1) {
            // 사이에 다른 트랜잭션(승인 등)이 상태를 바꿨다 — 잠긴 것으로 취급하고
            //   Detail 은 건드리지 않은 채(아직 아무 것도 안 씀) tx 를 롤백시킨다.
            const current = await tx.settlement.findUnique({
              where: { id: existing.id },
              select: { status: true },
            });
            const { lateArrivals, lateRefunds } = await this.computeLateEvents(
              tx,
              candidateRows,
              teamId,
              month,
            );
            throw new SettlementRaceLockedError(
              current?.status ?? "unknown",
              lateArrivals,
              lateRefunds,
            );
          }
        }

        await tx.settlementDetail.deleteMany({ where: { settlementId } });

        // skipDuplicates 없이 그대로 생성 — eventKey 충돌(P2002)은 tx 를 롤백시켜
        //   호출측이 해당 팀만 FAILED 로 격리하도록 던진다.
        await tx.settlementDetail.createMany({
          data: targetRows.map((r) => ({
            settlementId,
            paymentId: r.paymentId,
            orderNumber: r.orderNumber,
            entryType: r.entryType,
            refundLogId: r.refundLogId,
            eventKey: r.eventKey,
            productName: r.productName,
            sourceType: r.sourceType,
            sourceId: r.sourceId,
            paymentDate: r.paymentDate,
            paymentMethod: r.paymentMethod,
            paymentAmount: r.paymentAmount,
            feeRate: r.feeRate,
            feeAmount: r.feeAmount,
            actualAmount: r.actualAmount,
            attributionMonth: r.attributionMonth,
            status: SettlementDetailStatus.PENDING,
            memo: r.memo,
          })),
        });

        let paymentCount = 0;
        let refundCount = 0;
        let totalRevenue = 0;
        let refundAmount = 0;
        let platformFee = 0;
        let netAmount = 0;
        for (const r of targetRows) {
          if (r.entryType === SettlementEntryType.PAYMENT) {
            paymentCount++;
            totalRevenue += r.paymentAmount;
          } else {
            refundCount++;
            refundAmount += -r.paymentAmount;
          }
          platformFee += r.feeAmount;
          netAmount += r.actualAmount;
        }

        const updateResult = await tx.settlement.updateMany({
          where: { id: settlementId, status: SETTLEMENT_STATUS.PENDING },
          data: {
            totalRevenue,
            refundAmount,
            platformFee,
            paymentFee: 0,
            netAmount,
          },
        });
        if (updateResult.count !== 1) {
          // lock 이 보호하므로 이론상 도달하지 않는다 — 도달 시 tx 를 롤백시켜 안전하게 실패.
          throw new Error(
            `정산 재계산 경쟁 감지: settlementId=${settlementId}`,
          );
        }

        return {
          kind: "closed" as const,
          teamId,
          teamName,
          created,
          paymentCount,
          refundCount,
          totals: {
            totalRevenue,
            refundAmount,
            platformFee,
            paymentFee: 0,
            netAmount,
          },
          conflicts,
        };
      });
    } catch (err) {
      if (err instanceof SettlementRaceLockedError) {
        return {
          kind: "locked" as const,
          teamId,
          teamName,
          status: err.status,
          lateArrivals: err.lateArrivals,
          lateRefunds: err.lateRefunds,
        };
      }
      throw err;
    }
  }
}
