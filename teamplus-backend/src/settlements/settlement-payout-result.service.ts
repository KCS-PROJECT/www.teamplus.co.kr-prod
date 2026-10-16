import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import {
  addUtcDays,
  composeKstInstant,
  dateOnlyToString,
  dateOnlyToUtc,
  kstTodayUtcMidnight,
} from "@/common/utils/kst-date.util";
import { SETTLEMENT_STATUS } from "./constants/settlement-status.constant";
import {
  ACTIVE_PAYOUT_REQUEST_STATUSES,
  PAYOUT_REQUESTING_STALE_MS,
  PAYOUT_REQUEST_STATUS,
  classifyNiceStatusNm,
  type PayoutRequestStatus,
  type PayoutResultKind,
} from "./constants/payout-request-status.constant";
import {
  PAYOUT_REVIEW_REASON,
  type PayoutReviewReason,
} from "./constants/payout-review.constant";
import { resolvePayoutApiMode } from "./payout-mode.util";
import { NicePayoutApiService } from "./nice-payout-api.service";
import { acquireSettlementCloseLock } from "./utils/settlement-locks.util";
import { markSettlementPaidInTx } from "./utils/settlement-paid.util";
import {
  matchPayoutResults,
  type PayoutMatchDecision,
} from "./utils/payout-result-match.util";
import { detectPayoutReview } from "./utils/payout-review-detect.util";
import { describePayoutCallForOperator } from "./gateway/payout-res-code.util";
import type { NicePayoutResultRow } from "./gateway/nice-payout.types";

/** 같은 지급일 결과 조회가 겹치지 않게 — 수동 버튼과 자동 조회가 동시에 돌 수 있다. */
const CHECK_LOCK_TTL_SECONDS = 120;
const checkLockKey = (payDateCompact: string) =>
  `settlement:payout-check:${payDateCompact}`;

const PAID_DESCRIPTION = "나이스 지급대행 지급 완료";
/** 실패로 닫은 건이 나이스에서 성공했는데 정산은 이미 다른 경로로 끝나 있었다 — 요청 행에 남기는 사유(이중 지급 확인용). */
const REOPENED_DUPLICATE_NOTE =
  "나이스 재요청 성공 — 정산은 이미 다른 경로로 처리됨. 이중 지급 여부를 확인해주세요";
/**
 * 실패로 닫은 지급 건을 다시 맞춰야 하는 정산 상태 — failed 와, 실패 뒤 재요청이 삭제·미접수로 끝나 approved 로 되돌아간 정산.
 *   둘 다 옛 실패 요청(접수번호 있음)이 남아 있어 나이스 화면 재요청과 이중 지급이 날 수 있다.
 */
const REOPEN_CHECK_SETTLEMENT_STATUSES: readonly string[] = [
  SETTLEMENT_STATUS.FAILED,
  SETTLEMENT_STATUS.APPROVED,
];

/** 기준일(UTC 자정 규약의 KST 달력일) 직전 영업일 — 토·일만 건너뛴다(공휴일은 나이스가 "데이터 없음"으로 답한다). */
export function previousBusinessDay(dayUtcMidnight: Date): Date {
  let d = addUtcDays(dayUtcMidnight, -1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = addUtcDays(d, -1);
  return d;
}

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
  /** 이번 조회에서 운영자 확인(needsReview)을 새로 켠 요청 수 — 짝 맞추기 불가·모르는 상태·실패 건 재진행·이중 지급 의심·금액 불일치 */
  needsReview: number;
  /** 우리 요청 기록이 없는 접수번호(팀플러스 밖에서 올린 지급) 행 수 — 기록할 행이 없어 로그로만 남긴다 */
  external: number;
  remainAmt: number | null;
  /** 나이스 조회가 실패했을 때의 설명(운영자 버튼은 502 로 던지므로 자동·가드 경로에서만 채워진다) */
  error: string | null;
  /** targetRequestId 로 한 건만 봤을 때 — 이번 나이스 결과에서 그 요청이 어떻게 보였는지(그 요청이 조회 대상이 아니었으면 없음) */
  target?: PayoutTargetSighting;
}

/** 취소 확인 조회에서 그 요청이 이번 나이스 결과에 어떻게 보였는지 */
export type PayoutTargetSighting =
  | { kind: "MATCHED"; result: PayoutResultKind }
  | { kind: "AMBIGUOUS" | "NOT_FOUND" };

export interface PayoutCancelRecheck {
  /** 나이스를 실제로 조회했는지 */
  queried: boolean;
  /** 이번 결과에서 그 요청이 어떻게 보였는지 — 조회하지 못했거나 요청이 이미 닫혀 있었으면 null */
  sighting: PayoutTargetSighting | null;
}

/** 나이스 "요청 데이터 없음" — 그 지급일에 지급이 하나도 없다는 뜻이라 대조에서는 빈 목록으로 다룬다. */
const NICE_NO_DATA_CODE = "1104";

/** 지급 요청 전 실패 건 확인 결과 — 조회를 못 했으면 그 지급일의 실패 정산은 요청하지 않는다. */
export interface FailedRetryVerification {
  verified: boolean;
  reason: "IN_PROGRESS" | "NICE_ERROR" | "ERROR" | null;
}

interface CheckOptions {
  /**
   * 진행 중 요청이 없어도 "실패로 닫았고 접수번호가 있으며 정산이 아직 failed" 인 요청이 있으면 나이스를 조회한다 —
   * 나이스 화면에서 실패 건을 재요청했는지 보기 위해서다. 운영자 버튼과 지급 전 가드가 쓰고, 자동 조회(cron)는 쓰지 않는다.
   */
  includeFailed?: boolean;
  /**
   * 실패로 닫은 건만 다시 맞추고 진행 중 요청의 결과는 반영하지 않는다 — 지급 전 가드용.
   * 운영자가 재요청 버튼을 연달아 눌러도 같은 지급일의 다른 요청 확인 기록이 부풀지 않게 한다.
   */
  reopenOnly?: boolean;
  /**
   * 응답 미확인 정리 배치용 — 응답을 못 받은 요청(UNCONFIRMED·오래된 REQUESTING)만 본다.
   * 접수번호를 확보해 상태만 올리고, 확인 횟수 증가·미접수 종결·실패 건 재맞춤·이상 감지는 하지 않는다(16시 전 부분 결과로 오탐을 만들지 않게).
   */
  unconfirmedOnly?: boolean;
  /** 우리 요청이 없어도 나이스를 조회한다 — 아침 대사가 전 영업일의 외부 지급을 보기 위해 쓴다. */
  forceQuery?: boolean;
  /**
   * 지급 취소 직후 확인용 — 이 요청 한 건만 나이스 결과와 맞춘다. 같은 지급일의 다른 요청은 짝 맞추기의 기준으로만 쓰고 건드리지 않는다.
   * 응답 미확인 정리처럼 확인 횟수 증가·미접수 종결·실패 건 재맞춤·이상 감지는 하지 않는다(10:30 전 부분 결과로 다른 팀 요청에 오탐을 켜지 않게).
   * 그 요청이 이번 결과에 어떻게 보였는지는 summary.target 에 남긴다.
   */
  targetRequestId?: string;
}

const ACTIVE_REQUEST_SELECT = {
  id: true,
  settlementId: true,
  teamId: true,
  subMallId: true,
  settlementDate: true,
  amount: true,
  niceSeq: true,
  status: true,
  checkCount: true,
  reviewReason: true,
  reviewedAt: true,
  needsReview: true,
  requestedAt: true,
  lastCheckedAt: true,
  bankName: true,
  bankAccount: true,
  accountHolder: true,
  settlement: { select: { teamId: true, status: true } },
} satisfies Prisma.SettlementPayoutRequestSelect;

type ActiveRequest = Prisma.SettlementPayoutRequestGetPayload<{
  select: typeof ACTIVE_REQUEST_SELECT;
}>;

/**
 * 나이스 지급 결과 조회(0101002) — 지급일 단위로 우리 요청과 짝을 맞춰 정산 상태를 확정한다.
 *   성공 → paid(수동 지급과 같은 기록) · 실패 → failed(사유는 요청 행에만) · 삭제/미접수 → approved 복귀.
 *   배치 세 개(결과·아침 대사·응답 미확인 정리)와 운영 대응용 수동 조회가 같은 경로를 쓴다. 나이스에 쓰기 호출은 없다.
 *   조회한 나이스 행 전체를 우리 요청과 대조해 이상 건(외부 지급·이중 성공·금액 불일치 등)을 기록한다.
 */
@Injectable()
export class SettlementPayoutResultService {
  private readonly logger = new Logger(SettlementPayoutResultService.name);
  /** 같은 배치가 겹쳐 돌지 않게 — 단일 프로세스 전제(지급일 단위 Redis 락은 따로 있다). */
  private readonly runningJobs = new Set<string>();

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
    // 운영자 버튼은 실패로 닫은 건도 다시 맞춘다 — 진행 중 요청이 없는 지급일의 확인 표시(needsReview)를 풀거나 재요청 성공을 반영할 길이다.
    return this.check(payDate, adminId, true, { includeFailed: true });
  }

  /**
   * 지급 취소 직후 — 취소 응답을 못 받았거나, 나이스가 "대상 없음(1104)"이라고 했거나, 취소는 됐는데 상태 반영이 실패했을 때
   * 그 지급일 결과에서 취소한 요청 한 건만 실제 상태로 맞춘다(targetRequestId — 같은 지급일의 다른 요청은 건드리지 않는다).
   * 자동 조회는 지급일 당일 이후만 보므로, 미래 지급일 요청은 이 조회가 없으면 지급일 16시까지 맞춰지지 않는다.
   * 어떤 경우에도 던지지 않는다(같은 지급일 조회 중·나이스 오류면 queried=false).
   */
  async recheckAfterCancel(
    payDate: string,
    adminId: string,
    requestId: string,
  ): Promise<PayoutCancelRecheck> {
    try {
      const summary = await this.check(payDate, adminId, false, {
        targetRequestId: requestId,
      });
      return { queried: summary.queried, sighting: summary.target ?? null };
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        this.logger.error(
          `지급 취소 후 결과 확인 오류: payDate=${payDate}, requestId=${requestId}, ${
            error instanceof Error ? error.message : "unknown"
          }`,
        );
      }
      return { queried: false, sighting: null };
    }
  }

  /**
   * 지급 전 — 실패로 닫은 건의 지급일을 나이스에 다시 조회해 재요청 여부를 반영한다(reconcileReopenedFailures, 진행 중 요청은 건드리지 않음).
   * 조회를 못 했으면(같은 지급일 조회 중·나이스 오류·예기치 않은 오류) verified=false — 호출한 쪽이 그 지급일의 실패 정산을 건너뛴다.
   * 조회할 건이 없는 날짜는 확인할 것이 없으므로 verified=true. 어떤 경우에도 던지지 않는다 — 일괄 요청의 다른 건을 막으면 안 된다.
   */
  async verifyFailedForRetry(
    payDate: string,
    adminId: string,
  ): Promise<FailedRetryVerification> {
    let summary: PayoutCheckSummary;
    try {
      summary = await this.check(payDate, adminId, false, {
        includeFailed: true,
        reopenOnly: true,
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        return { verified: false, reason: "IN_PROGRESS" };
      }
      this.logger.error(
        `지급 전 실패 건 확인 오류: payDate=${payDate}, ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      return { verified: false, reason: "ERROR" };
    }
    if (summary.error !== null)
      return { verified: false, reason: "NICE_ERROR" };
    return { verified: true, reason: null };
  }

  /**
   * 운영자 확인 완료 — 결과 조회가 켠 needsReview 를 메모와 함께 끈다. 정산·요청 상태와 원장은 바꾸지 않는다.
   * 한 번 확인 완료한 요청(reviewedAt)은 이후 조회가 같은 이유로 다시 켜지 않는다.
   */
  async completeReview(requestId: string, adminId: string, memo: string) {
    const request = await this.prisma.settlementPayoutRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        settlementId: true,
        settlement: { select: { teamId: true } },
      },
    });
    if (!request) {
      throw new NotFoundException("지급 요청을 찾을 수 없습니다.");
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await acquireSettlementCloseLock(tx, request.settlement.teamId);
      const updated = await tx.settlementPayoutRequest.updateMany({
        where: { id: requestId, needsReview: true },
        data: {
          needsReview: false,
          reviewedAt: now,
          reviewedById: adminId,
          reviewMemo: memo,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          message: "확인이 필요한 상태가 아닙니다.",
          errorCode: "PAYOUT_REVIEW_NOT_OPEN",
        });
      }
      const openLeft = await tx.settlementPayoutRequest.count({
        where: { settlementId: request.settlementId, needsReview: true },
      });
      this.logger.log(
        `지급 요청 확인 완료: requestId=${requestId}, settlementId=${request.settlementId}, adminId=${adminId}, openLeft=${openLeft}`,
      );
      return {
        id: requestId,
        settlementId: request.settlementId,
        reviewedAt: now,
        reviewedById: adminId,
        /** 같은 정산에 아직 확인이 필요한 요청 수 — 0이면 지급 요청·수동 완료가 다시 가능하다 */
        openLeft,
      };
    });
  }

  /**
   * 지급(나이스 요청·수동 완료) 전에 실패로 닫은 지급 건이 남은 정산(failed·approved)의 그 건을 나이스와 다시 맞춘다.
   * 돌려주는 집합 = 확인하지 못한 지급일에 걸린 정산 id — 호출한 쪽이 그 건을 건너뛰거나 거절한다.
   * 확인이 끝난 정산은 요청 행의 needsReview 로 판정이 남아 있어, 이어지는 팀 lock 트랜잭션 안의 판정이 최종 차단을 맡는다.
   */
  async verifyFailedSettlements(
    settlementIds: readonly string[],
    adminId: string,
  ): Promise<Set<string>> {
    const failed = await this.prisma.settlement.findMany({
      where: {
        id: { in: [...new Set(settlementIds)] },
        status: { in: [...REOPEN_CHECK_SETTLEMENT_STATUSES] },
      },
      select: {
        id: true,
        payoutRequests: {
          where: {
            status: PAYOUT_REQUEST_STATUS.FAILED,
            niceSeq: { not: null },
          },
          select: { settlementDate: true },
        },
      },
    });
    const datesBySettlement = new Map<string, string[]>();
    for (const s of failed) {
      datesBySettlement.set(s.id, [
        ...new Set(
          s.payoutRequests.map((r) => dateOnlyToString(r.settlementDate)),
        ),
      ]);
    }
    const dates = [...new Set([...datesBySettlement.values()].flat())].sort();

    const unverifiedDates = new Set<string>();
    for (const payDate of dates) {
      const verification = await this.verifyFailedForRetry(payDate, adminId);
      if (verification.verified) continue;
      unverifiedDates.add(payDate);
      this.logger.warn(
        `지급 전 실패 건 확인 못 함: payDate=${payDate}, reason=${verification.reason}, adminId=${adminId}`,
      );
    }

    const unverified = new Set<string>();
    for (const [settlementId, settlementDates] of datesBySettlement) {
      if (settlementDates.some((d) => unverifiedDates.has(d))) {
        unverified.add(settlementId);
      }
    }
    return unverified;
  }

  /**
   * 결과 배치 — 평일 16:00~19:30 30분 간격(KST). 나이스 결과는 지급일 당일 16시 이후 나온다.
   * 대상 = 지급일이 오늘 이하인 진행 중 요청 + 확인 필요가 켜진 실패 건(재진행 여부를 계속 본다). 날짜가 없으면 나이스를 부르지 않는다.
   */
  @Cron("0,30 16-19 * * 1-5", { timeZone: "Asia/Seoul" })
  async checkDueRequests(): Promise<void> {
    await this.runJob("results", async () => {
      const dates = await this.dueDates(kstTodayUtcMidnight());
      await this.checkDates(dates, { includeFailed: true });
    });
  }

  /**
   * 아침 대사 — 매일 09:05(KST). 전날까지 끝나지 않은 진행 중 요청·확인 필요 건을 다시 보고,
   * 전 영업일은 우리 요청이 없어도 한 번 조회해 팀플러스 밖에서 올린 지급을 찾는다(하루 1회 호출).
   */
  @Cron("5 9 * * *", { timeZone: "Asia/Seoul" })
  async reconcilePreviousBusinessDay(): Promise<void> {
    await this.runJob("reconcile", async () => {
      const today = kstTodayUtcMidnight();
      const previous = previousBusinessDay(today);
      const dates = new Set(await this.dueDates(addUtcDays(today, -1)));
      const previousStr = dateOnlyToString(previous);
      await this.checkDates(
        [...dates].filter((d) => d !== previousStr),
        { includeFailed: true },
      );
      await this.checkDates([previousStr], {
        includeFailed: true,
        forceQuery: true,
      });
    });
  }

  /**
   * 응답 미확인 정리 — 5분 간격. 응답을 못 받은 요청(UNCONFIRMED·60초 넘은 REQUESTING)이 있을 때만 나이스를 조회한다.
   * 접수 여부는 16시 전에도 결과 목록에 보이므로 접수번호를 확보해 "접수됨"으로 올린다. 평소에는 DB 조회 한 번으로 끝난다.
   */
  @Cron("*/5 * * * *", { timeZone: "Asia/Seoul" })
  async settleUnconfirmedRequests(): Promise<void> {
    await this.runJob("unconfirmed", async () => {
      const staleBefore = new Date(Date.now() - PAYOUT_REQUESTING_STALE_MS);
      const rows = await this.prisma.settlementPayoutRequest.findMany({
        where: {
          OR: [
            { status: PAYOUT_REQUEST_STATUS.UNCONFIRMED },
            {
              status: PAYOUT_REQUEST_STATUS.REQUESTING,
              requestedAt: { lt: staleBefore },
            },
          ],
        },
        select: { settlementDate: true },
        distinct: ["settlementDate"],
        orderBy: { settlementDate: "asc" },
      });
      if (rows.length === 0) return;
      await this.checkDates(
        rows.map((r) => dateOnlyToString(r.settlementDate)),
        { unconfirmedOnly: true },
      );
    });
  }

  /** 배치 공통 — 모드 off 면 아무것도 하지 않고, 같은 배치가 아직 도는 중이면 이번 회차를 건너뛴다. */
  private async runJob(name: string, body: () => Promise<void>): Promise<void> {
    if (this.runningJobs.has(name)) {
      this.logger.warn(`지급 결과 배치 겹침 — 건너뜀: job=${name}`);
      return;
    }
    this.runningJobs.add(name);
    try {
      const mode = await resolvePayoutApiMode(this.prisma, this.redis);
      if (mode === "off") return;
      await body();
    } catch (err) {
      this.logger.error(
        `지급 결과 배치 준비 실패: job=${name}, ${err instanceof Error ? err.message : "unknown"}`,
      );
    } finally {
      this.runningJobs.delete(name);
    }
  }

  /** 결과를 확인할 지급일 — 지급일이 기준일 이하인 진행 중 요청 + 확인 필요가 켜진 실패 건(접수번호 있음). */
  private async dueDates(upTo: Date): Promise<string[]> {
    const rows = await this.prisma.settlementPayoutRequest.findMany({
      where: {
        OR: [
          {
            status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] },
            settlementDate: { lte: upTo },
          },
          {
            status: PAYOUT_REQUEST_STATUS.FAILED,
            needsReview: true,
            niceSeq: { not: null },
          },
        ],
      },
      select: { settlementDate: true },
      distinct: ["settlementDate"],
      orderBy: { settlementDate: "asc" },
    });
    return rows.map((r) => dateOnlyToString(r.settlementDate));
  }

  /** 날짜별로 조회한다 — 한 날짜의 실패(락 충돌 포함)가 다른 날짜를 막지 않는다. */
  private async checkDates(
    dates: readonly string[],
    options: CheckOptions,
  ): Promise<void> {
    for (const payDate of dates) {
      try {
        const summary = await this.check(payDate, null, false, options);
        this.logger.log(
          `지급 결과 자동 조회: payDate=${payDate}, queried=${summary.queried}, checked=${summary.checked}, succeeded=${summary.succeeded}, failed=${summary.failed}, pending=${summary.pending}, needsReview=${summary.needsReview}, external=${summary.external}${summary.error ? `, error=${summary.error}` : ""}`,
        );
      } catch (err) {
        if (err instanceof ConflictException) {
          this.logger.debug(
            `지급 결과 조회 중인 지급일 — 건너뜀: payDate=${payDate}`,
          );
          continue;
        }
        this.logger.warn(
          `지급 결과 자동 조회 실패: payDate=${payDate}: ${
            err instanceof Error ? err.message : "unknown"
          }`,
        );
      }
    }
  }

  private async check(
    payDate: string,
    adminId: string | null,
    throwOnNiceError: boolean,
    options: CheckOptions = {},
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
      const isStaleRequesting = (r: ActiveRequest) =>
        r.status === PAYOUT_REQUEST_STATUS.REQUESTING &&
        r.requestedAt.getTime() < staleBefore;
      const target = options.targetRequestId;
      // 가볍게 보기 — 응답 미확인 정리·취소 확인은 그 요청의 상태만 맞추고, 확인 횟수·미접수 종결·실패 건 재맞춤·이상 감지는 하지 않는다.
      const light = options.unconfirmedOnly === true || target !== undefined;
      const eligible = onDate.filter((r) =>
        target !== undefined
          ? r.id === target && isActive(r)
          : options.unconfirmedOnly === true
            ? r.status === PAYOUT_REQUEST_STATUS.UNCONFIRMED ||
              isStaleRequesting(r)
            : isActive(r) &&
              (r.status !== PAYOUT_REQUEST_STATUS.REQUESTING ||
                isStaleRequesting(r)),
      );
      const eligibleIds = new Set(eligible.map((r) => r.id));
      const others = onDate.filter((r) => !eligibleIds.has(r.id));
      // 실패로 닫은 건을 다시 맞출 이유가 있는가 — 정산이 아직 failed·approved 이거나, 켜 둔 확인 표시(needsReview)가 남아 있을 때.
      const hasReopenCandidate =
        options.includeFailed === true &&
        !light &&
        others.some(
          (r) =>
            r.status === PAYOUT_REQUEST_STATUS.FAILED &&
            r.niceSeq !== null &&
            (r.needsReview ||
              REOPEN_CHECK_SETTLEMENT_STATUSES.includes(r.settlement.status)),
        );
      if (
        eligible.length === 0 &&
        !hasReopenCandidate &&
        options.forceQuery !== true
      ) {
        return summary;
      }

      const result = await this.payoutApi.queryPayoutResults(
        { settlmntDt: payDateCompact },
        { requestedBy: adminId },
      );
      let rows: NicePayoutResultRow[];
      if (result.outcome === "SUCCESS") {
        rows = result.rows;
        summary.remainAmt = result.remainAmt;
      } else if (result.meta.resCode === NICE_NO_DATA_CODE) {
        // 그 지급일에 지급이 하나도 없다 — 오류가 아니라 빈 목록이다(접수되지 않은 요청은 이 결과로 미접수 종결에 이른다).
        rows = [];
      } else {
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
        summary.error = detail;
        return summary;
      }
      summary.queried = true;

      const byId = new Map(eligible.map((r) => [r.id, r]));
      const decisions = matchPayoutResults(eligible, rows, {
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
      if (options.reopenOnly !== true) {
        for (const decision of decisions) {
          const request = byId.get(decision.requestId);
          if (!request) continue;
          summary.checked += 1;
          await this.applyDecision(
            request,
            decision,
            payDatePassed,
            summary,
            light,
          );
          if (decision.requestId === target) {
            summary.target =
              decision.kind === "MATCHED"
                ? { kind: "MATCHED", result: decision.result }
                : { kind: decision.kind };
          }
        }
      }
      if (!light) {
        await this.reconcileReopenedFailures(others, rows, summary);
      }
      // 대조 — 결정을 반영한 뒤 그 날 요청을 다시 읽어 최신 상태로 나이스 행 전체와 맞춘다. 가드(reopenOnly)·가볍게 보기는 건너뛴다.
      if (options.reopenOnly !== true && !light) {
        await this.detectReviewFlags(settlementDate, rows, summary);
      }
      return summary;
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  /**
   * 나이스 행 전체를 우리 요청과 대조한다 — 금액 불일치·같은 팀 이중 성공은 그 요청에 확인 필요를 켜고,
   * 우리 요청이 없는 접수번호(팀플러스 밖에서 올린 지급)는 기록할 행이 없어 경고 로그로만 남긴다(운영 규칙이 막는다).
   */
  private async detectReviewFlags(
    settlementDate: Date,
    rows: readonly NicePayoutResultRow[],
    summary: PayoutCheckSummary,
  ): Promise<void> {
    if (rows.length === 0) return;
    const requests = await this.prisma.settlementPayoutRequest.findMany({
      where: { settlementDate },
      select: {
        id: true,
        settlementId: true,
        teamId: true,
        subMallId: true,
        amount: true,
        niceSeq: true,
        settlement: { select: { teamId: true } },
      },
    });
    const { flags, external, skippedNoSeq } = detectPayoutReview(
      rows,
      requests,
    );
    const payDate = dateOnlyToString(settlementDate);
    if (skippedNoSeq > 0) {
      this.logger.warn(
        `접수번호 없는 나이스 결과 행 — 외부 지급 판정 생략: payDate=${payDate}, rows=${skippedNoSeq}`,
      );
    }
    if (external.length > 0) {
      summary.external += external.length;
      this.logger.warn(
        `팀플러스 밖에서 올린 지급(우리 요청 기록 없음): payDate=${payDate}, ${external
          .map(
            (e) =>
              `seq=${e.seq}/subId=${e.subId}/amount=${e.amount ?? "-"}/status=${e.statusNm}`,
          )
          .join(", ")}`,
      );
    }
    const byId = new Map(requests.map((r) => [r.id, r]));
    const now = new Date();
    for (const flag of flags) {
      const request = byId.get(flag.requestId);
      if (!request) continue;
      const flagged = await this.prisma.$transaction(async (tx) => {
        await acquireSettlementCloseLock(tx, request.settlement.teamId);
        return this.flagReviewInTx(tx, request.id, flag.reason, {
          niceStatusNm: flag.niceStatusNm.slice(0, 20),
          lastCheckedAt: now,
        });
      });
      if (!flagged) continue;
      summary.needsReview += 1;
      this.logger.warn(
        `지급 결과 대조 이상(운영자 확인 필요): reason=${flag.reason}, requestId=${request.id}, settlementId=${request.settlementId}, seq=${flag.niceSeq}, niceAmount=${flag.niceAmount ?? "-"}, amount=${request.amount}`,
      );
    }
  }

  /**
   * 요청에 운영자 확인(needsReview)과 사유를 켠다 — 이미 켜져 있거나 운영자가 한 번 확인 완료한 요청(reviewedAt)은 다시 켜지 않는다.
   * 켠 요청이 있으면 true.
   */
  private async flagReviewInTx(
    tx: Prisma.TransactionClient,
    requestId: string,
    reason: PayoutReviewReason,
    data: Prisma.SettlementPayoutRequestUpdateManyMutationInput = {},
  ): Promise<boolean> {
    // 운영자가 확인 완료한 요청은 "같은 이유"로만 다시 켜지 않는다 — 다른 이유가 새로 보이면 켠다.
    //   실패 건의 나이스 재진행(REOPENED_IN_PROGRESS)은 예외로 항상 다시 켠다: 확인 완료해도 나이스에서 돈이 나가는 중이라
    //   그대로 두면 팀플러스 재요청이 같은 정산을 한 번 더 보낸다(풀리는 길은 나이스 쪽 실패·삭제 확인뿐).
    //   다시 켤 때는 지난 확인 기록을 비운다 — 메모는 감사 로그(settlement.payout-request.review)에 남아 있다.
    const suppressWhenReviewed =
      reason === PAYOUT_REVIEW_REASON.REOPENED_IN_PROGRESS
        ? {}
        : {
            OR: [
              { reviewedAt: null },
              { reviewReason: null },
              { reviewReason: { not: reason } },
            ],
          };
    const r = await tx.settlementPayoutRequest.updateMany({
      where: { id: requestId, needsReview: false, ...suppressWhenReviewed },
      data: {
        ...data,
        needsReview: true,
        reviewReason: reason,
        reviewedAt: null,
        reviewedById: null,
        reviewMemo: null,
      },
    });
    return r.count > 0;
  }

  private async applyDecision(
    request: ActiveRequest,
    decision: PayoutMatchDecision,
    payDatePassed: boolean,
    summary: PayoutCheckSummary,
    /** 가볍게 보기(응답 미확인 정리·취소 확인) — 확인 횟수를 세지 않고 미접수로 닫지 않는다 */
    light: boolean,
  ): Promise<void> {
    const now = new Date();
    const teamId = request.settlement.teamId;
    // 가볍게 보기는 확인 횟수를 세지 않는다 — 하루 여러 번 돌아도 기록이 부풀지 않게.
    const countCheck = light ? {} : { checkCount: { increment: 1 } };

    if (decision.kind === "MATCHED") {
      await this.applyMatched(
        request,
        decision.row,
        decision.result,
        now,
        summary,
        !light,
      );
      return;
    }

    if (decision.kind === "AMBIGUOUS") {
      // 운영자가 이미 확인 완료한 요청(reviewedAt)은 다시 켜지 않는다 — 확인 기록만 남긴다.
      const flagged = await this.prisma.$transaction(async (tx) => {
        await acquireSettlementCloseLock(tx, teamId);
        if (!light) {
          await tx.settlementPayoutRequest.updateMany({
            where: {
              id: request.id,
              status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] },
            },
            data: { lastCheckedAt: now, ...countCheck },
          });
        }
        return this.flagReviewInTx(
          tx,
          request.id,
          PAYOUT_REVIEW_REASON.MATCH_AMBIGUOUS,
        );
      });
      if (!flagged) {
        summary.pending += 1;
        return;
      }
      summary.needsReview += 1;
      this.logger.warn(
        `지급 결과 짝 맞추기 불가: requestId=${request.id}, 후보 접수번호=${decision.candidateSeqs.join(",") || "-"}`,
      );
      return;
    }

    // NOT_FOUND — 가볍게 보기는 종결하지 않는다(16시 전 부분 결과일 수 있다).
    if (light) {
      summary.pending += 1;
      return;
    }
    // 지급일이 지났고, 지급일 다음 날 0시(KST) 이후의 조회에서 이미 한 번 없음을 봤을 때만 "접수되지 않음"으로 닫는다 — 당일 조회 지연 가능성.
    const nextDayKstMidnight = composeKstInstant(
      addUtcDays(request.settlementDate, 1),
      "00:00",
    );
    const seenAfterPayDate =
      request.lastCheckedAt !== null &&
      request.lastCheckedAt.getTime() >= nextDayKstMidnight.getTime();
    if (payDatePassed && seenAfterPayDate) {
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
    countCheck: boolean,
  ): Promise<void> {
    const teamId = request.settlement.teamId;
    const seq = row.seq ?? request.niceSeq;
    const niceStatusNm = row.statusNm.slice(0, 20);
    const common = {
      niceSeq: seq,
      niceStatusNm,
      lastCheckedAt: now,
    };

    if (result === "SUCCEEDED") {
      const outcome = await this.prisma.$transaction(async (tx) => {
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
        if (updated.count === 0) return "ALREADY_CLOSED" as const;
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
        if (ok) return "PAID" as const;
        // processing 이 아닌 정산에 진행 중 요청이 남아 있었다 — 정산이 이미 paid 면 돈이 두 번 나간 것이라 이 요청에 이중 지급 의심을 켠다.
        const current = await tx.settlement.findUnique({
          where: { id: request.settlementId },
          select: { status: true },
        });
        if (current?.status === SETTLEMENT_STATUS.PAID) {
          await this.flagReviewInTx(
            tx,
            request.id,
            PAYOUT_REVIEW_REASON.DUPLICATE_SUCCESS,
          );
          return "DUPLICATE" as const;
        }
        return "NOT_PROCESSING" as const;
      });
      if (outcome === "PAID") summary.succeeded += 1;
      if (outcome === "DUPLICATE") {
        summary.needsReview += 1;
        this.logger.error(
          `지급 성공인데 정산이 이미 paid — 이중 지급 의심: requestId=${request.id}, settlementId=${request.settlementId}, seq=${seq}`,
        );
      } else if (outcome === "NOT_PROCESSING") {
        this.logger.error(
          `지급 성공 반영 실패(정산이 processing 아님): requestId=${request.id}, settlementId=${request.settlementId}`,
        );
      }
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

    // PENDING(요청·재요청 진행중) — 접수번호를 알게 됐으면 UNCONFIRMED 를 REQUESTED 로 올린다.
    const increment = countCheck ? { checkCount: { increment: 1 } } : {};
    if (result !== "UNKNOWN") {
      await this.updateActive(request, teamId, {
        ...common,
        status: PAYOUT_REQUEST_STATUS.REQUESTED,
        ...increment,
      });
      summary.pending += 1;
      return;
    }

    // 모르는 상태값 — 운영자 확인을 켠다. 운영자가 이미 확인 완료한 요청(reviewedAt)은 다시 켜지 않는다.
    const flagged = await this.prisma.$transaction(async (tx) => {
      await acquireSettlementCloseLock(tx, teamId);
      const updated = await tx.settlementPayoutRequest.updateMany({
        where: {
          id: request.id,
          status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] },
        },
        data: {
          ...common,
          status: PAYOUT_REQUEST_STATUS.REQUESTED,
          ...increment,
        },
      });
      if (updated.count === 0) return false;
      return this.flagReviewInTx(
        tx,
        request.id,
        PAYOUT_REVIEW_REASON.UNKNOWN_STATUS,
      );
    });
    if (!flagged) {
      summary.pending += 1;
      return;
    }
    summary.needsReview += 1;
    this.logger.warn(
      `알 수 없는 나이스 결과 상태: requestId=${request.id}, statusNm=${row.statusNm}`,
    );
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

  /**
   * 요청을 종결 상태로 닫고 정산을 지급 예정(approved)으로 되돌린다 — 삭제·미접수·운영자 지급 취소.
   * 진행 중인 요청일 때만 바꾼다 — 그 사이 다른 경로가 확정했으면 false(아무것도 바꾸지 않음).
   */
  async closeAndRevert(
    request: Pick<ActiveRequest, "id" | "settlementId">,
    teamId: string,
    status:
      | typeof PAYOUT_REQUEST_STATUS.CANCELLED
      | typeof PAYOUT_REQUEST_STATUS.NOT_FOUND,
    data: Prisma.SettlementPayoutRequestUpdateManyMutationInput,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await acquireSettlementCloseLock(tx, teamId);
      const updated = await tx.settlementPayoutRequest.updateMany({
        where: {
          id: request.id,
          status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] },
        },
        data: { ...data, status, needsReview: false },
      });
      if (updated.count === 0) return false;
      await tx.settlement.updateMany({
        where: {
          id: request.settlementId,
          status: SETTLEMENT_STATUS.PROCESSING,
        },
        data: { status: SETTLEMENT_STATUS.APPROVED },
      });
      return true;
    });
  }

  /**
   * "실패"로 닫은 요청의 접수번호를 나이스 결과와 다시 맞춘다 — 나이스 화면에서 실패 건을 재요청하면 같은 접수번호가 다시 진행된다.
   *   요청·재요청 진행중·모르는 상태 → 운영자 확인(needsReview)을 켠다. 켜져 있는 동안 팀플러스의 지급 요청·수동 완료가 막힌다.
   *   성공 → 요청 SUCCEEDED, 정산 failed → paid(돈이 실제로 나갔다).
   *   실패·삭제 → 켜 둔 확인 표시를 끈다(다시 요청할 수 있다).
   */
  private async reconcileReopenedFailures(
    closed: readonly ActiveRequest[],
    rows: readonly NicePayoutResultRow[],
    summary: PayoutCheckSummary,
  ): Promise<void> {
    const bySeq = new Map<string, NicePayoutResultRow>();
    for (const row of rows) {
      if (row.seq !== null && !bySeq.has(row.seq)) bySeq.set(row.seq, row);
    }
    const now = new Date();
    for (const request of closed) {
      if (
        request.status !== PAYOUT_REQUEST_STATUS.FAILED ||
        request.niceSeq === null
      ) {
        continue;
      }
      const row = bySeq.get(request.niceSeq);
      if (!row) continue;
      const kind = classifyNiceStatusNm(row.statusNm);
      const niceStatusNm = row.statusNm.slice(0, 20);

      if (kind === "FAILED" || kind === "CANCELLED") {
        // 다시 실패·삭제로 보이면 "재진행"으로 켰던 확인 표시만 끈다(사유는 이력으로 남긴다) — 다시 요청할 수 있다.
        //   금액 불일치·이중 지급 의심처럼 다른 이유로 켜진 표시는 운영자 확인 완료로만 푼다.
        await this.prisma.$transaction(async (tx) => {
          await acquireSettlementCloseLock(tx, request.settlement.teamId);
          await tx.settlementPayoutRequest.updateMany({
            where: {
              id: request.id,
              status: PAYOUT_REQUEST_STATUS.FAILED,
              needsReview: true,
              OR: [
                { reviewReason: PAYOUT_REVIEW_REASON.REOPENED_IN_PROGRESS },
                { reviewReason: null },
              ],
            },
            data: { needsReview: false, niceStatusNm, lastCheckedAt: now },
          });
        });
        continue;
      }

      if (kind === "SUCCEEDED") {
        await this.applyReopenedSuccess(request, row, now, summary);
        continue;
      }

      // 요청·재요청 진행중·모르는 상태 — 확인 표시를 켠다. 운영자가 확인 완료한 요청(reviewedAt)은 다시 켜지 않는다.
      const flagged = await this.prisma.$transaction(async (tx) => {
        await acquireSettlementCloseLock(tx, request.settlement.teamId);
        await tx.settlementPayoutRequest.updateMany({
          where: { id: request.id, status: PAYOUT_REQUEST_STATUS.FAILED },
          data: { niceStatusNm, lastCheckedAt: now },
        });
        return this.flagReviewInTx(
          tx,
          request.id,
          PAYOUT_REVIEW_REASON.REOPENED_IN_PROGRESS,
        );
      });
      if (!flagged) continue;
      summary.needsReview += 1;
      this.logger.warn(
        `실패로 닫은 지급 건의 나이스 상태가 바뀜(운영자 확인 필요): requestId=${request.id}, settlementId=${request.settlementId}, seq=${request.niceSeq}, statusNm=${row.statusNm}`,
      );
    }
  }

  /** 실패로 닫은 건이 나이스 재요청으로 성공했다 — 수동 지급과 같은 기록으로 정산을 닫는다. */
  private async applyReopenedSuccess(
    request: ActiveRequest,
    row: NicePayoutResultRow,
    now: Date,
    summary: PayoutCheckSummary,
  ): Promise<void> {
    const teamId = request.settlement.teamId;
    const seq = row.seq ?? request.niceSeq;
    const niceStatusNm = row.statusNm.slice(0, 20);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await acquireSettlementCloseLock(tx, teamId);
      const current = await tx.settlementPayoutRequest.findUnique({
        where: { id: request.id },
        select: { status: true, reviewReason: true },
      });
      if (current?.status !== PAYOUT_REQUEST_STATUS.FAILED) {
        return "ALREADY_CLOSED" as const;
      }
      // 정산을 먼저 닫는다 — failed(실패 뒤 아직 안 보냄) 또는 approved(그 사이 팀플러스 요청이 삭제·미접수로 되돌아감)만 이 돈으로 닫힌다.
      const ok = await markSettlementPaidInTx(tx, {
        settlementId: request.settlementId,
        expectedFrom: [SETTLEMENT_STATUS.FAILED, SETTLEMENT_STATUS.APPROVED],
        account: {
          bankName: request.bankName,
          bankAccount: request.bankAccount,
          accountHolder: request.accountHolder,
        },
        description: `${PAID_DESCRIPTION}(재요청, 접수번호 ${seq ?? "-"})`,
      });
      if (ok) {
        await tx.settlementPayoutRequest.updateMany({
          where: { id: request.id, status: PAYOUT_REQUEST_STATUS.FAILED },
          data: {
            status: PAYOUT_REQUEST_STATUS.SUCCEEDED,
            niceSeq: seq,
            niceStatusNm,
            errReason: null,
            needsReview: false,
            lastCheckedAt: now,
            confirmedAt: now,
          },
        });
        return "PAID" as const;
      }
      // 정산이 processing(팀플러스 재요청 진행 중)이거나 paid(수동 완료·다른 요청 성공) — 돈이 두 번 나갔거나 나갈 수 있다.
      //   이 요청은 **FAILED 로 둔 채** 확인 표시와 사유만 남긴다. 차단 조건(needsReview: claim 판정·수동 완료)이
      //   그대로 살아 있어 정산이 나중에 failed·approved 로 돌아와도 다시 고를 수 없고, 다음 조회에서 "성공"이 다시 보이면 위 분기가 닫는다.
      //   진행 중 요청에도 확인 표시를 켠다. 성공 집계가 아니라 확인 필요 집계에 넣는다.
      //   사유가 이미 재요청 중복이면 한 번 본 중복이다 — 조회할 때마다 다시 켜거나 세지 않는다(운영자가 확인 완료한 건도 되살리지 않는다).
      if (current.reviewReason === PAYOUT_REVIEW_REASON.REOPENED_DUPLICATE) {
        await tx.settlementPayoutRequest.updateMany({
          where: { id: request.id, status: PAYOUT_REQUEST_STATUS.FAILED },
          data: { niceStatusNm, lastCheckedAt: now },
        });
        return "DUPLICATE_SEEN" as const;
      }
      await tx.settlementPayoutRequest.updateMany({
        where: { id: request.id, status: PAYOUT_REQUEST_STATUS.FAILED },
        data: {
          needsReview: true,
          reviewReason: PAYOUT_REVIEW_REASON.REOPENED_DUPLICATE,
          // 예전에 다른 사유로 확인 완료한 기록은 비운다 — 확인이 다시 열렸는데 지난 처리자·메모가 보이지 않게.
          reviewedAt: null,
          reviewedById: null,
          reviewMemo: null,
          errReason: REOPENED_DUPLICATE_NOTE,
          niceStatusNm,
          lastCheckedAt: now,
        },
      });
      await tx.settlementPayoutRequest.updateMany({
        where: {
          settlementId: request.settlementId,
          status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] },
          needsReview: false,
          reviewedAt: null,
        },
        data: {
          needsReview: true,
          reviewReason: PAYOUT_REVIEW_REASON.REOPENED_DUPLICATE,
        },
      });
      return "DUPLICATE" as const;
    });
    if (outcome === "PAID") {
      summary.succeeded += 1;
      this.logger.warn(
        `실패로 닫은 지급 건이 나이스 재요청으로 성공(정산 지급 완료): settlementId=${request.settlementId}, requestId=${request.id}, seq=${seq}`,
      );
      return;
    }
    if (outcome === "DUPLICATE") {
      summary.needsReview += 1;
      this.logger.error(
        `재요청 성공인데 정산이 failed·approved 아님 — 이중 지급 확인 필요: requestId=${request.id}, settlementId=${request.settlementId}, seq=${seq}`,
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
      external: 0,
      remainAmt: null,
      error: null,
    };
  }
}
