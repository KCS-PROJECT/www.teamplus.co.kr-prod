import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import {
  dateOnlyToString,
  dateOnlyToUtc,
  kstTodayUtcMidnight,
} from "@/common/utils/kst-date.util";
import { SETTLEMENT_STATUS } from "./constants/settlement-status.constant";
import {
  ACTIVE_PAYOUT_REQUEST_STATUSES,
  PAYOUT_NOT_FOUND_CONFIRM_COUNT,
  PAYOUT_REQUESTING_STALE_MS,
  PAYOUT_REQUEST_STATUS,
  classifyNiceStatusNm,
  type PayoutRequestStatus,
  type PayoutResultKind,
} from "./constants/payout-request-status.constant";
import { resolvePayoutApiMode } from "./payout-mode.util";
import { NicePayoutApiService } from "./nice-payout-api.service";
import { acquireSettlementCloseLock } from "./utils/settlement-locks.util";
import { markSettlementPaidInTx } from "./utils/settlement-paid.util";
import {
  matchPayoutResults,
  type PayoutMatchDecision,
} from "./utils/payout-result-match.util";
import { describePayoutCallForOperator } from "./gateway/payout-res-code.util";
import type { NicePayoutResultRow } from "./gateway/nice-payout.types";

/** 같은 지급일 결과 조회가 겹치지 않게 — 수동 버튼과 자동 조회가 동시에 돌 수 있다. */
const CHECK_LOCK_TTL_SECONDS = 120;
const checkLockKey = (payDateCompact: string) =>
  `settlement:payout-check:${payDateCompact}`;

const PAID_DESCRIPTION = "나이스 지급대행 지급 완료";

export interface PayoutCheckSummary {
  payDate: string;
  /** 나이스를 실제로 조회했는지 — 조회할 요청이 없으면 false */
  queried: boolean;
  checked: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  notFound: number;
  pending: number;
  needsReview: number;
  remainAmt: number | null;
}

const ACTIVE_REQUEST_SELECT = {
  id: true,
  settlementId: true,
  teamId: true,
  subMallId: true,
  amount: true,
  niceSeq: true,
  status: true,
  checkCount: true,
  requestedAt: true,
  bankName: true,
  bankAccount: true,
  accountHolder: true,
  settlement: { select: { teamId: true } },
} satisfies Prisma.SettlementPayoutRequestSelect;

type ActiveRequest = Prisma.SettlementPayoutRequestGetPayload<{
  select: typeof ACTIVE_REQUEST_SELECT;
}>;

/**
 * 나이스 지급 결과 조회(0101002) — 지급일 단위로 우리 요청과 짝을 맞춰 정산 상태를 확정한다.
 *   성공 → paid(수동 지급과 같은 기록) · 실패 → failed(사유는 요청 행에만) · 삭제/미접수 → approved 복귀.
 *   자동(평일 16시·18시 KST)과 운영자 버튼이 같은 경로를 쓴다. 나이스에 쓰기 호출은 없다.
 */
@Injectable()
export class SettlementPayoutResultService {
  private readonly logger = new Logger(SettlementPayoutResultService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly payoutApi: NicePayoutApiService,
  ) {}

  /** 운영자 버튼 — readonly·live 에서만. off 면 409, 나이스 오류면 502. */
  async checkByAdmin(
    payDate: string,
    adminId: string,
  ): Promise<PayoutCheckSummary> {
    const mode = await resolvePayoutApiMode(this.prisma, this.redis);
    if (mode === "off") {
      throw new ConflictException({
        message:
          "지급대행 API 를 사용하지 않는 상태입니다. 앱 설정에서 지급대행 모드를 확인해주세요.",
        errorCode: "PAYOUT_API_OFF",
      });
    }
    return this.check(payDate, adminId, true);
  }

  /** 지급일이 된 요청의 결과를 평일 16시·18시(KST)에 확인한다 — 나이스 결과는 16시 이후 조회할 수 있다. */
  @Cron("0 16,18 * * 1-5", { timeZone: "Asia/Seoul" })
  async checkDueRequests(): Promise<void> {
    try {
      const mode = await resolvePayoutApiMode(this.prisma, this.redis);
      if (mode === "off") return;
      const today = kstTodayUtcMidnight();
      const dates = await this.prisma.settlementPayoutRequest.findMany({
        where: {
          status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] },
          settlementDate: { lte: today },
        },
        select: { settlementDate: true },
        distinct: ["settlementDate"],
        orderBy: { settlementDate: "asc" },
      });
      for (const { settlementDate } of dates) {
        const payDate = dateOnlyToString(settlementDate);
        try {
          const summary = await this.check(payDate, null, false);
          this.logger.log(
            `지급 결과 자동 조회: payDate=${payDate}, checked=${summary.checked}, succeeded=${summary.succeeded}, failed=${summary.failed}, pending=${summary.pending}, needsReview=${summary.needsReview}`,
          );
        } catch (err) {
          this.logger.warn(
            `지급 결과 자동 조회 실패: payDate=${payDate}: ${
              err instanceof Error ? err.message : "unknown"
            }`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `지급 결과 자동 조회 준비 실패: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  private async check(
    payDate: string,
    adminId: string | null,
    throwOnNiceError: boolean,
  ): Promise<PayoutCheckSummary> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
      throw new BadRequestException("지급일은 YYYY-MM-DD 형식이어야 합니다.");
    }
    const settlementDate = dateOnlyToUtc(payDate);
    if (
      Number.isNaN(settlementDate.getTime()) ||
      dateOnlyToString(settlementDate) !== payDate
    ) {
      throw new BadRequestException("존재하지 않는 날짜입니다.");
    }
    const payDateCompact = payDate.replace(/-/g, "");

    const lockKey = checkLockKey(payDateCompact);
    // 락 값은 이번 실행만의 토큰 — TTL 이 지난 뒤 다른 실행이 잡은 락을 우리가 지우지 않게 한다.
    const lockToken = `${adminId ?? "cron"}:${randomUUID()}`;
    const locked = await this.redis.setIfNotExists(
      lockKey,
      lockToken,
      CHECK_LOCK_TTL_SECONDS,
    );
    if (!locked) {
      throw new ConflictException({
        message:
          "같은 지급일의 결과를 이미 조회하고 있습니다. 잠시 후 다시 확인해주세요.",
        errorCode: "PAYOUT_CHECK_IN_PROGRESS",
      });
    }

    try {
      const summary = this.emptySummary(payDate);
      // 같은 지급일의 요청을 닫힌 것까지 모두 읽는다 — 닫힌 요청의 접수번호가 다른 요청의 결과로 쓰이면 안 된다.
      const onDate = await this.prisma.settlementPayoutRequest.findMany({
        where: { settlementDate },
        select: ACTIVE_REQUEST_SELECT,
        orderBy: { requestedAt: "asc" },
      });
      // 요청 중(REQUESTING)인 건은 반영 트랜잭션이 곧 끝난다 — 60초가 지나도 남아 있으면 서버가 멈춘 것이라 응답 유실로 본다.
      const staleBefore = Date.now() - PAYOUT_REQUESTING_STALE_MS;
      const isActive = (r: ActiveRequest) =>
        ACTIVE_PAYOUT_REQUEST_STATUSES.includes(
          r.status as PayoutRequestStatus,
        );
      const eligible = onDate.filter(
        (r) =>
          isActive(r) &&
          (r.status !== PAYOUT_REQUEST_STATUS.REQUESTING ||
            r.requestedAt.getTime() < staleBefore),
      );
      const eligibleIds = new Set(eligible.map((r) => r.id));
      const others = onDate.filter((r) => !eligibleIds.has(r.id));
      if (eligible.length === 0) return summary;

      const result = await this.payoutApi.queryPayoutResults(
        { settlmntDt: payDateCompact },
        { requestedBy: adminId },
      );
      if (result.outcome !== "SUCCESS") {
        const detail = describePayoutCallForOperator(result.meta);
        if (throwOnNiceError) {
          throw new BadGatewayException({
            message: detail,
            errorCode: "NICE_PAYOUT_API_FAILED",
          });
        }
        this.logger.warn(
          `지급 결과 조회 응답 오류: payDate=${payDate}, ${detail}`,
        );
        return summary;
      }
      summary.queried = true;
      summary.remainAmt = result.remainAmt;

      const byId = new Map(eligible.map((r) => [r.id, r]));
      const decisions = matchPayoutResults(eligible, result.rows, {
        seqs: others
          .map((r) => r.niceSeq)
          .filter((s): s is string => s !== null),
        rivals: others.filter(
          (r) =>
            r.status === PAYOUT_REQUEST_STATUS.REQUESTING && r.niceSeq === null,
        ),
      });
      const payDatePassed =
        kstTodayUtcMidnight().getTime() > settlementDate.getTime();
      for (const decision of decisions) {
        const request = byId.get(decision.requestId);
        if (!request) continue;
        summary.checked += 1;
        await this.applyDecision(request, decision, payDatePassed, summary);
      }
      await this.flagReopenedFailures(others, result.rows, summary);
      return summary;
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  private async applyDecision(
    request: ActiveRequest,
    decision: PayoutMatchDecision,
    payDatePassed: boolean,
    summary: PayoutCheckSummary,
  ): Promise<void> {
    const now = new Date();
    const teamId = request.settlement.teamId;

    if (decision.kind === "MATCHED") {
      await this.applyMatched(
        request,
        decision.row,
        decision.result,
        now,
        summary,
      );
      return;
    }

    if (decision.kind === "AMBIGUOUS") {
      await this.updateActive(request, teamId, {
        lastCheckedAt: now,
        checkCount: { increment: 1 },
        needsReview: true,
      });
      summary.needsReview += 1;
      this.logger.warn(
        `지급 결과 짝 맞추기 불가: requestId=${request.id}, 후보 접수번호=${decision.candidateSeqs.join(",") || "-"}`,
      );
      return;
    }

    // NOT_FOUND — 지급일이 지났고 두 번 이상 확인했을 때만 "접수되지 않음"으로 닫는다(당일 조회 지연 가능성).
    const confirmCount = request.checkCount + 1;
    if (payDatePassed && confirmCount >= PAYOUT_NOT_FOUND_CONFIRM_COUNT) {
      await this.closeAndRevert(
        request,
        teamId,
        PAYOUT_REQUEST_STATUS.NOT_FOUND,
        { lastCheckedAt: now, checkCount: { increment: 1 }, confirmedAt: now },
      );
      summary.notFound += 1;
      this.logger.warn(
        `지급 요청 접수되지 않음(지급 예정으로 복귀): requestId=${request.id}, settlementId=${request.settlementId}`,
      );
      return;
    }
    await this.updateActive(request, teamId, {
      lastCheckedAt: now,
      checkCount: { increment: 1 },
    });
    summary.pending += 1;
  }

  private async applyMatched(
    request: ActiveRequest,
    row: NicePayoutResultRow,
    result: PayoutResultKind,
    now: Date,
    summary: PayoutCheckSummary,
  ): Promise<void> {
    const teamId = request.settlement.teamId;
    const seq = row.seq ?? request.niceSeq;
    const common = {
      niceSeq: seq,
      niceStatusNm: row.statusNm.slice(0, 20),
      lastCheckedAt: now,
    };

    if (result === "SUCCEEDED") {
      const paid = await this.prisma.$transaction(async (tx) => {
        await acquireSettlementCloseLock(tx, teamId);
        const updated = await tx.settlementPayoutRequest.updateMany({
          where: {
            id: request.id,
            status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] },
          },
          data: {
            ...common,
            status: PAYOUT_REQUEST_STATUS.SUCCEEDED,
            errReason: null,
            needsReview: false,
            confirmedAt: now,
          },
        });
        if (updated.count === 0) return false;
        const ok = await markSettlementPaidInTx(tx, {
          settlementId: request.settlementId,
          expectedFrom: [SETTLEMENT_STATUS.PROCESSING],
          account: {
            bankName: request.bankName,
            bankAccount: request.bankAccount,
            accountHolder: request.accountHolder,
          },
          description: `${PAID_DESCRIPTION}(접수번호 ${seq ?? "-"})`,
        });
        if (!ok) {
          // processing 이 아닌 정산에 진행 중 요청이 남아 있었다 — 불변식 위반이라 기록만 남기고 요청은 닫는다.
          this.logger.error(
            `지급 성공 반영 실패(정산이 processing 아님): requestId=${request.id}, settlementId=${request.settlementId}`,
          );
        }
        return true;
      });
      if (paid) summary.succeeded += 1;
      this.logger.log(
        `나이스 지급 성공: settlementId=${request.settlementId}, requestId=${request.id}, seq=${seq}`,
      );
      return;
    }

    if (result === "FAILED") {
      await this.prisma.$transaction(async (tx) => {
        await acquireSettlementCloseLock(tx, teamId);
        const updated = await tx.settlementPayoutRequest.updateMany({
          where: {
            id: request.id,
            status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] },
          },
          data: {
            ...common,
            status: PAYOUT_REQUEST_STATUS.FAILED,
            errReason: row.errReason,
            needsReview: false,
            confirmedAt: now,
          },
        });
        if (updated.count === 0) return;
        await tx.settlement.updateMany({
          where: {
            id: request.settlementId,
            status: SETTLEMENT_STATUS.PROCESSING,
          },
          data: { status: SETTLEMENT_STATUS.FAILED },
        });
      });
      summary.failed += 1;
      this.logger.warn(
        `나이스 지급 실패: settlementId=${request.settlementId}, requestId=${request.id}, seq=${seq}, reason=${row.errReason ?? "-"}`,
      );
      return;
    }

    if (result === "CANCELLED") {
      await this.closeAndRevert(
        request,
        teamId,
        PAYOUT_REQUEST_STATUS.CANCELLED,
        {
          ...common,
          confirmedAt: now,
        },
      );
      summary.cancelled += 1;
      this.logger.warn(
        `나이스에서 지급 요청 삭제됨(지급 예정으로 복귀): settlementId=${request.settlementId}, requestId=${request.id}`,
      );
      return;
    }

    // PENDING(요청·재요청 진행중) — 접수번호를 알게 됐으면 UNCONFIRMED 를 REQUESTED 로 올린다. 모르는 상태값은 운영자 확인을 켠다.
    await this.updateActive(request, teamId, {
      ...common,
      status: PAYOUT_REQUEST_STATUS.REQUESTED,
      checkCount: { increment: 1 },
      ...(result === "UNKNOWN" ? { needsReview: true } : {}),
    });
    if (result === "UNKNOWN") {
      summary.needsReview += 1;
      this.logger.warn(
        `알 수 없는 나이스 결과 상태: requestId=${request.id}, statusNm=${row.statusNm}`,
      );
    } else {
      summary.pending += 1;
    }
  }

  /** 진행 중인 요청 행만 갱신한다 — 그 사이 다른 경로가 확정했으면 건드리지 않는다. */
  private async updateActive(
    request: ActiveRequest,
    teamId: string,
    data: Prisma.SettlementPayoutRequestUpdateManyMutationInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await acquireSettlementCloseLock(tx, teamId);
      await tx.settlementPayoutRequest.updateMany({
        where: {
          id: request.id,
          status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] },
        },
        data,
      });
    });
  }

  /** 요청을 종결 상태로 닫고 정산을 지급 예정(approved)으로 되돌린다 — 삭제·미접수. */
  private async closeAndRevert(
    request: ActiveRequest,
    teamId: string,
    status:
      | typeof PAYOUT_REQUEST_STATUS.CANCELLED
      | typeof PAYOUT_REQUEST_STATUS.NOT_FOUND,
    data: Prisma.SettlementPayoutRequestUpdateManyMutationInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await acquireSettlementCloseLock(tx, teamId);
      const updated = await tx.settlementPayoutRequest.updateMany({
        where: {
          id: request.id,
          status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] },
        },
        data: { ...data, status, needsReview: false },
      });
      if (updated.count === 0) return;
      await tx.settlement.updateMany({
        where: {
          id: request.settlementId,
          status: SETTLEMENT_STATUS.PROCESSING,
        },
        data: { status: SETTLEMENT_STATUS.APPROVED },
      });
    });
  }

  /**
   * "실패"로 닫은 요청의 접수번호가 나이스에서 다른 상태(재요청 진행중·성공)로 바뀌었으면 운영자 확인을 켠다.
   * 나이스 화면에서 실패 건을 재요청해 두고 팀플러스에서도 다시 요청하면 이중 지급이 된다 — 상태는 바꾸지 않고 표시만 한다.
   */
  private async flagReopenedFailures(
    closed: readonly ActiveRequest[],
    rows: readonly NicePayoutResultRow[],
    summary: PayoutCheckSummary,
  ): Promise<void> {
    const bySeq = new Map<string, NicePayoutResultRow>();
    for (const row of rows) {
      if (row.seq !== null && !bySeq.has(row.seq)) bySeq.set(row.seq, row);
    }
    for (const request of closed) {
      if (
        request.status !== PAYOUT_REQUEST_STATUS.FAILED ||
        request.niceSeq === null
      ) {
        continue;
      }
      const row = bySeq.get(request.niceSeq);
      if (!row || classifyNiceStatusNm(row.statusNm) === "FAILED") continue;
      const flagged = await this.prisma.settlementPayoutRequest.updateMany({
        where: {
          id: request.id,
          status: PAYOUT_REQUEST_STATUS.FAILED,
          needsReview: false,
        },
        data: {
          needsReview: true,
          niceStatusNm: row.statusNm.slice(0, 20),
          lastCheckedAt: new Date(),
        },
      });
      if (flagged.count === 0) continue;
      summary.needsReview += 1;
      this.logger.warn(
        `실패로 닫은 지급 건의 나이스 상태가 바뀜(운영자 확인 필요): requestId=${request.id}, settlementId=${request.settlementId}, seq=${request.niceSeq}, statusNm=${row.statusNm}`,
      );
    }
  }

  private emptySummary(payDate: string): PayoutCheckSummary {
    return {
      payDate,
      queried: false,
      checked: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      notFound: 0,
      pending: 0,
      needsReview: 0,
      remainAmt: null,
    };
  }
}
