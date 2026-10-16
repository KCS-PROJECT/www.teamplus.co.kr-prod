import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { dateOnlyToString, dateOnlyToUtc } from "@/common/utils/kst-date.util";
import {
  SETTLEMENT_STATUS,
  type SettlementStatus,
} from "./constants/settlement-status.constant";
import {
  ACTIVE_PAYOUT_REQUEST_STATUSES,
  PAYOUT_REQUEST_STATUS,
} from "./constants/payout-request-status.constant";
import type { PayoutApiMode } from "./constants/payout-mode.constant";
import { resolvePayoutApiMode } from "./payout-mode.util";
import { NicePayoutApiService } from "./nice-payout-api.service";
import { SettlementPayoutResultService } from "./settlement-payout-result.service";
import { TeamSettlementAccountService } from "./team-settlement-account.service";
import { assertNicePayDate } from "./utils/nice-pay-date.util";
import { computeDefaultPayDate } from "./utils/payout-default-date.util";
import { truncateUtf8Bytes } from "./utils/nice-xlsx.util";
import { decryptOrRaw, maskBankAccount } from "./utils/account-mask.util";
import { PAYOUT_FILE_EXCLUSION_REASON } from "./utils/nice-account-state.util";
import {
  classifyPayoutBlock,
  toPayoutAccountInput,
  type PayoutBlockReason,
} from "./utils/payout-block.util";
import { acquireSettlementCloseLock } from "./utils/settlement-locks.util";
import {
  classifyPayoutCancelBlock,
  type PayoutCancelBlock,
} from "./utils/payout-request-view.util";
import { describePayoutCallForOperator } from "./gateway/payout-res-code.util";
import type {
  CreatePayoutRequestsDto,
  PayoutRequestItemDto,
} from "./dto/payout-request.dto";
import { PAYOUT_REQUEST_MAX_ITEMS } from "./dto/payout-request.dto";
import { PAYOUT_REVIEW_REASON } from "./constants/payout-review.constant";

export const DEFAULT_PAYOUT_DAY_OF_MONTH = 15;

/** 나이스 수취 통장 표기(accntDesc) 길이 — 규격 30. */
const ACCNT_DESC_MAX_BYTES = 30;

export type PayoutRequestExclusion =
  | PayoutBlockReason
  | "SETTLEMENT_NOT_FOUND"
  | "ACCOUNT_CHANGED"
  | "SETTLEMENT_CHANGED"
  | "DUPLICATE_ITEM"
  | "FAILED_REQUEST_UNVERIFIED";

export const PAYOUT_REQUEST_EXCLUSION_REASON: Readonly<
  Record<PayoutRequestExclusion, string>
> = {
  ...PAYOUT_FILE_EXCLUSION_REASON,
  SETTLEMENT_NOT_FOUND: "정산을 찾을 수 없음",
  NOT_PAYABLE_STATUS: "지급 예정(승인) 또는 지급 실패 상태가 아님",
  PAYOUT_IN_PROGRESS: "이미 지급 요청이 진행 중",
  NET_NOT_POSITIVE: "지급할 금액이 없음(0원 이하)",
  ACCOUNT_CHANGED: "미리보기 이후 팀 계좌가 바뀜 — 다시 확인해주세요",
  SETTLEMENT_CHANGED: "미리보기 이후 정산이 바뀜 — 다시 확인해주세요",
  DUPLICATE_ITEM: "같은 정산이 두 번 들어 있음",
  PAYOUT_REVIEW_OPEN:
    "확인이 필요한 지급 건이 있음 — 상세에서 확인 완료 처리 뒤 요청해주세요",
  PAYOUT_REVIEW_REOPENED:
    "실패한 지급 건이 나이스에서 다시 진행 중 — 나이스에서 실패·삭제로 바뀌기 전까지는 요청할 수 없습니다. 나이스 화면에서 처리해주세요",
  FAILED_REQUEST_UNVERIFIED:
    "실패한 지급 건의 나이스 상태를 확인하지 못함 — 잠시 후 다시 요청해주세요",
};

export type PayoutRequestOutcome =
  | "REQUESTED"
  | "UNCONFIRMED"
  | "REJECTED"
  | "SKIPPED"
  /** 예기치 않은 오류(DB 등) — 나이스 호출 뒤라면 요청 행이 REQUESTING 으로 남고 결과 조회가 응답 유실로 확정한다 */
  | "ERROR";

export interface PayoutRequestItemResult {
  settlementId: string;
  teamName: string | null;
  amount: number | null;
  outcome: PayoutRequestOutcome;
  requestId: string | null;
  niceSeq: string | null;
  reasonCode: PayoutRequestExclusion | null;
  message: string;
}

/** 요청 전 조건이 맞지 않아 그 건만 건너뛴다 — 트랜잭션을 되돌리는 신호로도 쓴다. */
class PayoutSkip extends Error {
  constructor(readonly reasonCode: PayoutRequestExclusion) {
    super(reasonCode);
  }
}

interface ClaimedRequest {
  requestId: string;
  teamId: string;
  teamName: string;
  subMallId: string;
  amount: number;
  accntDesc: string;
  previousStatus: SettlementStatus;
}

const SETTLEMENT_TARGET_SELECT = {
  id: true,
  teamId: true,
  settlementMonth: true,
  status: true,
  netAmount: true,
  updatedAt: true,
  team: {
    select: {
      id: true,
      name: true,
      settlementAccount: {
        select: {
          status: true,
          subMallId: true,
          bankCode: true,
          bankAccount: true,
          accountHolder: true,
          updatedAt: true,
          registrationStartedAt: true,
        },
      },
    },
  },
  // 실패로 닫았고 접수번호가 있는 요청 — 재요청 전에 그 지급일을 나이스에 다시 조회한다.
  payoutRequests: {
    where: {
      status: PAYOUT_REQUEST_STATUS.FAILED,
      niceSeq: { not: null },
    },
    select: { settlementDate: true, needsReview: true, reviewReason: true },
  },
  // 운영자 확인이 필요한 요청 수(상태 무관) — 하나라도 있으면 요청하지 않는다.
  _count: {
    select: { payoutRequests: { where: { needsReview: true } } },
  },
} satisfies Prisma.SettlementSelect;

type SettlementTarget = Prisma.SettlementGetPayload<{
  select: typeof SETTLEMENT_TARGET_SELECT;
}>;

/** 건너뛴 건의 응답에 실을 팀명·금액. */
interface SettlementHead {
  teamName: string | null;
  amount: number;
}

/** 운영자 지급 취소 — 나이스 호출이 한 번에 하나만 나가게 정산 단위로 잡는다. 취소 호출에 즉시 결과 조회까지 이어질 수 있어 결과 조회 락(120초)과 같게 둔다. */
const CANCEL_LOCK_TTL_SECONDS = 120;
const cancelLockKey = (settlementId: string) =>
  `settlement:payout-cancel:${settlementId}`;
/** 나이스 "대상 없음" — 이미 취소·삭제됐거나 접수되지 않은 건. 즉시 조회로 실제 상태를 맞춘다. */
const NICE_NO_DATA_CODE = "1104";
/** 운영자 취소로 닫은 요청 행의 사유 — 누가 취소했는지는 감사 로그에 남는다. */
export const PAYOUT_CANCEL_REASON = "팀플러스에서 취소";

/** 취소를 막는 이유별 409 — 목록의 cancelable 과 같은 판정(classifyPayoutCancelBlock). */
const PAYOUT_CANCEL_BLOCK_ERROR: Record<
  PayoutCancelBlock,
  { message: string; errorCode: string }
> = {
  NO_REQUEST: {
    message:
      "나이스 접수번호를 아직 확인하지 못해 취소할 수 없습니다. 결과 확인 뒤 다시 시도하거나 나이스 화면에서 처리해주세요.",
    errorCode: "PAYOUT_CANCEL_NO_REQUEST",
  },
  REVIEW_OPEN: {
    message:
      "운영자 확인이 필요한 지급 요청입니다. 정산 상세에서 확인을 먼저 마쳐주세요.",
    errorCode: "PAYOUT_REVIEW_OPEN",
  },
  CUTOFF_PASSED: {
    message:
      "지급일 오전 10시 30분이 지나 취소할 수 없습니다. 지급 결과를 확인해주세요.",
    errorCode: "PAYOUT_CANCEL_CUTOFF_PASSED",
  },
};

export type PayoutCancelOutcome = "CANCELLED" | "UNCONFIRMED" | "REJECTED";

export interface PayoutCancelResult {
  settlementId: string;
  requestId: string;
  outcome: PayoutCancelOutcome;
  resCode: string | null;
  message: string;
}

/** 수취 통장에 찍히는 표기 — "팀플러스 N월 정산". */
export function buildAccntDesc(settlementMonth: string): string {
  const month = Number(settlementMonth.slice(5, 7));
  return truncateUtf8Bytes(`팀플러스 ${month}월 정산`, ACCNT_DESC_MAX_BYTES);
}

/**
 * 나이스 지급대행 지급 요청(0102001) — 운영자가 어드민에서 고른 정산을 건별로 순차 요청한다.
 *   - 정산 1건에 진행 중 요청은 1건: 팀 lock 트랜잭션에서 요청 행을 먼저 만들고(부분 유니크 인덱스) 정산을 processing 으로 잡는다.
 *   - 나이스 호출은 트랜잭션 밖. 응답을 못 받으면 재전송하지 않고 UNCONFIRMED 로 남겨 결과 조회로만 확정한다.
 *   - 확정 거절(비영업일·중복 등)·우리 설정 결함은 요청을 REJECTED 로 닫고 정산을 요청 전 상태로 되돌린다.
 */
@Injectable()
export class SettlementPayoutRequestService {
  private readonly logger = new Logger(SettlementPayoutRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly payoutApi: NicePayoutApiService,
    private readonly accountService: TeamSettlementAccountService,
    private readonly resultService: SettlementPayoutResultService,
  ) {}

  /** 팝업 초기값 — 현재 모드, 앱 설정 "매월 N일", 그로부터 계산한 기본 지급일. */
  async getDefaults() {
    const [mode, settings] = await Promise.all([
      resolvePayoutApiMode(this.prisma, this.redis),
      this.prisma.appSettings.findFirst({
        select: { payoutDayOfMonth: true },
      }),
    ]);
    const payoutDayOfMonth =
      settings?.payoutDayOfMonth ?? DEFAULT_PAYOUT_DAY_OF_MONTH;
    return {
      mode,
      payoutDayOfMonth,
      defaultPayDate: computeDefaultPayDate(payoutDayOfMonth),
      maxItems: PAYOUT_REQUEST_MAX_ITEMS,
    };
  }

  /**
   * 요청 전 확인 — 들어갈 정산(마스킹 계좌·계좌 버전)과 빠지는 정산·사유, 현재 잔액과 부족 여부.
   * readonly 모드에서도 볼 수 있다(요청 버튼은 live 에서만).
   */
  async preview(settlementIds: string[], payDate: string, adminId: string) {
    const mode = await this.requireMode(["readonly", "live"]);
    assertNicePayDate(payDate);

    const uniqueIds = [...new Set(settlementIds)];
    const [settlements, bankNames] = await Promise.all([
      this.prisma.settlement.findMany({
        where: { id: { in: uniqueIds } },
        select: SETTLEMENT_TARGET_SELECT,
      }),
      this.accountService.loadBankNames(),
    ]);
    const byId = new Map(settlements.map((s) => [s.id, s]));

    const included: {
      settlementId: string;
      teamId: string;
      teamName: string;
      settlementMonth: string;
      netAmount: number;
      isRetry: boolean;
      subMallId: string;
      bankName: string;
      bankAccountMasked: string | null;
      accountHolder: string;
      accountUpdatedAt: Date;
      accntDesc: string;
    }[] = [];
    const excluded: {
      settlementId: string;
      teamId: string | null;
      teamName: string | null;
      settlementMonth: string | null;
      netAmount: number | null;
      reasonCode: PayoutRequestExclusion;
      reason: string;
    }[] = [];

    for (const id of uniqueIds) {
      const s = byId.get(id);
      if (!s) {
        excluded.push({
          settlementId: id,
          teamId: null,
          teamName: null,
          settlementMonth: null,
          netAmount: null,
          reasonCode: "SETTLEMENT_NOT_FOUND",
          reason: PAYOUT_REQUEST_EXCLUSION_REASON.SETTLEMENT_NOT_FOUND,
        });
        continue;
      }
      const verdict = this.classifyTarget(s);
      const base = {
        settlementId: s.id,
        teamId: s.teamId,
        teamName: s.team.name ?? "",
        settlementMonth: s.settlementMonth,
        netAmount: s.netAmount,
      };
      if (verdict.exclusion !== null) {
        excluded.push({
          ...base,
          reasonCode: verdict.exclusion,
          reason: PAYOUT_REQUEST_EXCLUSION_REASON[verdict.exclusion],
        });
        continue;
      }
      const account = verdict.account;
      included.push({
        ...base,
        // 미리보기는 나이스를 부르지 않는다 — 실패로 닫은 건이 남은 정산(isRetry)의 재요청 여부는 요청할 때 확인한다.
        isRetry:
          s.status === SETTLEMENT_STATUS.FAILED || s.payoutRequests.length > 0,
        subMallId: verdict.subMallId,
        bankName: bankNames.get(account.bankCode) ?? account.bankCode,
        bankAccountMasked: maskBankAccount(decryptOrRaw(account.bankAccount)),
        accountHolder: account.accountHolder,
        accountUpdatedAt: account.updatedAt,
        accntDesc: buildAccntDesc(s.settlementMonth),
      });
    }

    const includedTotal = included.reduce((sum, r) => sum + r.netAmount, 0);
    const balance = await this.payoutApi.getBalance({ requestedBy: adminId });
    const remainAmt = balance.outcome === "SUCCESS" ? balance.remainAmt : null;

    return {
      payDate,
      mode,
      included,
      excluded,
      includedCount: included.length,
      includedTotal,
      excludedCount: excluded.length,
      balance: remainAmt,
      // 잔액을 못 읽어도 요청은 막지 않는다 — 운영자가 나이스 화면에서 확인하도록 사유만 보여준다.
      balanceError:
        remainAmt === null ? describePayoutCallForOperator(balance.meta) : null,
      // 지급일 당일 이체 때 잔액이 모자라면 그 건은 실패한다 — 요청 시점과 지급일 사이에 정산 대금이 들어올 수 있어 경고만 한다.
      balanceShort: remainAmt !== null && includedTotal > remainAmt,
    };
  }

  /** 지급 요청 실행(live 전용) — 건별 순차. 한 건의 실패가 다른 건을 막지 않는다. */
  async request(dto: CreatePayoutRequestsDto, adminId: string) {
    await this.requireMode(["live"]);
    const payDateCompact = assertNicePayDate(dto.payDate);
    const settlementDate = dateOnlyToUtc(dto.payDate);
    const bankNames = await this.accountService.loadBankNames();
    // 재요청 전 가드 — 지급 실패 정산의 실패 건을 나이스와 다시 맞춘 뒤 요청한다(나이스 화면 재요청과의 이중 지급 차단).
    //   확인 표시(needsReview)가 켜지면 claim 의 판정이 PAYOUT_REVIEW_OPEN 으로 건너뛴다. 결과 조회의 Redis 락은
    //   이 단계에서 잡고 놓으며 claim 의 팀 lock 과 겹치지 않는다. 확인하지 못한 정산은 FAILED_REQUEST_UNVERIFIED.
    const unverified = await this.resultService.verifyFailedSettlements(
      dto.items.map((i) => i.settlementId),
      adminId,
    );
    // 건너뛴 건에도 팀명·금액을 돌려주기 위한 머리 정보 — claim 전에 한 번만 읽는다(판정은 claim 안에서 다시 읽은 값으로 한다).
    const heads = await this.loadHeads(dto.items.map((i) => i.settlementId));

    const results: PayoutRequestItemResult[] = [];
    const seen = new Set<string>();
    for (const item of dto.items) {
      const head = heads.get(item.settlementId);
      if (seen.has(item.settlementId)) {
        results.push(this.skipped(item.settlementId, head, "DUPLICATE_ITEM"));
        continue;
      }
      seen.add(item.settlementId);
      if (unverified.has(item.settlementId)) {
        results.push(
          this.skipped(item.settlementId, head, "FAILED_REQUEST_UNVERIFIED"),
        );
        continue;
      }
      try {
        results.push(
          await this.requestOne(
            item,
            head,
            payDateCompact,
            settlementDate,
            adminId,
            bankNames,
          ),
        );
      } catch (error) {
        // 한 건의 예기치 않은 오류가 나머지 건을 막지 않는다. 이미 나이스에 보낸 건의 결과도 운영자에게 돌려줘야 한다.
        this.logger.error(
          `나이스 지급 요청 처리 오류: settlementId=${item.settlementId}, ${
            error instanceof Error ? error.message : "unknown"
          }`,
        );
        results.push({
          settlementId: item.settlementId,
          teamName: null,
          amount: null,
          outcome: "ERROR",
          requestId: null,
          niceSeq: null,
          reasonCode: null,
          message:
            "처리 중 오류가 났습니다. 목록을 새로고침해 이 정산의 상태를 확인해주세요.",
        });
      }
    }

    const count = (outcome: PayoutRequestOutcome) =>
      results.filter((r) => r.outcome === outcome).length;
    this.logger.log(
      `나이스 지급 요청 일괄: payDate=${payDateCompact}, items=${dto.items.length}, requested=${count("REQUESTED")}, unconfirmed=${count("UNCONFIRMED")}, rejected=${count("REJECTED")}, skipped=${count("SKIPPED")}, errored=${count("ERROR")}, adminId=${adminId}`,
    );
    return {
      payDate: dto.payDate,
      results,
      summary: {
        requested: count("REQUESTED"),
        unconfirmed: count("UNCONFIRMED"),
        rejected: count("REJECTED"),
        skipped: count("SKIPPED"),
        errored: count("ERROR"),
      },
    };
  }

  private async requestOne(
    item: PayoutRequestItemDto,
    head: SettlementHead | undefined,
    payDateCompact: string,
    settlementDate: Date,
    adminId: string,
    bankNames: Map<string, string>,
  ): Promise<PayoutRequestItemResult> {
    const expectedAccountUpdatedAt = new Date(item.expectedAccountUpdatedAt);

    let claimed: ClaimedRequest;
    try {
      claimed = await this.claim(
        item.settlementId,
        expectedAccountUpdatedAt,
        settlementDate,
        adminId,
        bankNames,
      );
    } catch (error) {
      if (error instanceof PayoutSkip) {
        return this.skipped(item.settlementId, head, error.reasonCode);
      }
      // 부분 유니크 인덱스(정산당 진행 중 1건) 위반 — 같은 정산을 동시에 요청한 경쟁이다.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return this.skipped(item.settlementId, head, "PAYOUT_IN_PROGRESS");
      }
      throw error;
    }

    const result = await this.payoutApi.requestPayout(
      {
        subId: claimed.subMallId,
        settlmntDt: payDateCompact,
        settlmntAmt: claimed.amount,
        // 같은 팀의 두 달치 정산을 같은 지급일에 각각 보낼 수 있어야 한다 — 중복은 우리 DB(정산당 1건)가 막는다.
        dupChkYn: "N",
        accntDesc: claimed.accntDesc,
      },
      {
        teamId: claimed.teamId,
        settlementId: item.settlementId,
        requestedBy: adminId,
      },
    );

    const now = new Date();
    if (result.outcome === "SUCCESS") {
      await this.applyRequestResult(claimed, item.settlementId, {
        status: PAYOUT_REQUEST_STATUS.REQUESTED,
        niceSeq: result.seq,
        resCode: result.meta.resCode,
        resMsg: result.meta.resMsg?.slice(0, 200) ?? null,
        requestError: null,
      });
      this.logger.log(
        `나이스 지급 요청 접수: settlementId=${item.settlementId}, requestId=${claimed.requestId}, seq=${result.seq}`,
      );
      return {
        settlementId: item.settlementId,
        teamName: claimed.teamName,
        amount: claimed.amount,
        outcome: "REQUESTED",
        requestId: claimed.requestId,
        niceSeq: result.seq,
        reasonCode: null,
        message: `나이스에 접수되었습니다(접수번호 ${result.seq}).`,
      };
    }

    if (result.outcome === "AMBIGUOUS") {
      // 접수됐는지 모른다 — 재전송하면 이중 지급이 될 수 있어 결과 조회로만 확정한다.
      await this.applyRequestResult(claimed, item.settlementId, {
        status: PAYOUT_REQUEST_STATUS.UNCONFIRMED,
        niceSeq: null,
        resCode: result.meta.resCode,
        resMsg: result.meta.resMsg?.slice(0, 200) ?? null,
        requestError: result.meta.error?.slice(0, 50) ?? null,
      });
      this.logger.warn(
        `나이스 지급 요청 응답 미확인: settlementId=${item.settlementId}, requestId=${claimed.requestId}, ${describePayoutCallForOperator(result.meta)}`,
      );
      return {
        settlementId: item.settlementId,
        teamName: claimed.teamName,
        amount: claimed.amount,
        outcome: "UNCONFIRMED",
        requestId: claimed.requestId,
        niceSeq: null,
        reasonCode: null,
        message: `나이스 응답을 확인하지 못했습니다(${describePayoutCallForOperator(result.meta)}). 다시 보내지 않고 지급일 결과 조회로 확정합니다.`,
      };
    }

    // TERMINAL(비영업일·중복 등)·CONFIG(키·전문 결함) — 나이스에 접수되지 않았다. 정산을 요청 전 상태로 되돌린다.
    await this.applyRequestResult(
      claimed,
      item.settlementId,
      {
        status: PAYOUT_REQUEST_STATUS.REJECTED,
        niceSeq: null,
        resCode: result.meta.resCode,
        resMsg: result.meta.resMsg?.slice(0, 200) ?? null,
        requestError: result.meta.error?.slice(0, 50) ?? null,
        confirmedAt: now,
      },
      claimed.previousStatus,
    );
    this.logger.warn(
      `나이스 지급 요청 거절: settlementId=${item.settlementId}, requestId=${claimed.requestId}, ${describePayoutCallForOperator(result.meta)}`,
    );
    return {
      settlementId: item.settlementId,
      teamName: claimed.teamName,
      amount: claimed.amount,
      outcome: "REJECTED",
      requestId: claimed.requestId,
      niceSeq: null,
      reasonCode: null,
      message: describePayoutCallForOperator(result.meta),
    };
  }

  /**
   * 팀 lock 트랜잭션에서 요청 행을 만들고 정산을 processing 으로 잡는다.
   * 조건이 하나라도 어긋나면 PayoutSkip 으로 트랜잭션을 되돌린다 — 나이스는 부르지 않는다.
   */
  private async claim(
    settlementId: string,
    expectedAccountUpdatedAt: Date,
    settlementDate: Date,
    adminId: string,
    bankNames: Map<string, string>,
  ): Promise<ClaimedRequest> {
    const head = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: { teamId: true },
    });
    if (!head) throw new PayoutSkip("SETTLEMENT_NOT_FOUND");

    return this.prisma.$transaction(async (tx) => {
      await acquireSettlementCloseLock(tx, head.teamId);

      const s = await tx.settlement.findUnique({
        where: { id: settlementId },
        select: SETTLEMENT_TARGET_SELECT,
      });
      if (!s) throw new PayoutSkip("SETTLEMENT_NOT_FOUND");
      const verdict = this.classifyTarget(s);
      if (verdict.exclusion !== null) throw new PayoutSkip(verdict.exclusion);
      const account = verdict.account;
      if (account.updatedAt.getTime() !== expectedAccountUpdatedAt.getTime()) {
        throw new PayoutSkip("ACCOUNT_CHANGED");
      }

      const accntDesc = buildAccntDesc(s.settlementMonth);
      const request = await tx.settlementPayoutRequest.create({
        data: {
          settlementId: s.id,
          teamId: s.teamId,
          teamName: (s.team.name ?? "").slice(0, 100),
          settlementMonth: s.settlementMonth,
          subMallId: verdict.subMallId,
          settlementDate,
          amount: s.netAmount,
          accntDesc,
          status: PAYOUT_REQUEST_STATUS.REQUESTING,
          bankName: (bankNames.get(account.bankCode) ?? account.bankCode).slice(
            0,
            50,
          ),
          bankAccount: account.bankAccount,
          accountHolder: account.accountHolder,
          accountUpdatedAt: account.updatedAt,
          requestedById: adminId,
        },
        select: { id: true },
      });

      // 읽은 그대로일 때만 잡는다 — 그 사이 재마감·승인 취소 등으로 금액이나 상태가 바뀌었으면 보내지 않는다.
      const updated = await tx.settlement.updateMany({
        where: {
          id: s.id,
          status: s.status,
          netAmount: s.netAmount,
          updatedAt: s.updatedAt,
        },
        data: { status: SETTLEMENT_STATUS.PROCESSING },
      });
      if (updated.count === 0) throw new PayoutSkip("SETTLEMENT_CHANGED");

      return {
        requestId: request.id,
        teamId: s.teamId,
        teamName: s.team.name ?? "",
        subMallId: verdict.subMallId,
        amount: s.netAmount,
        accntDesc,
        previousStatus: s.status as SettlementStatus,
      };
    });
  }

  /**
   * 나이스 응답을 요청 행에 반영한다. 요청 행이 아직 REQUESTING 일 때만 — 그 사이 결과 조회가 먼저 확정했으면 덮어쓰지 않는다.
   * revertTo 가 있으면(거절) 정산을 processing 에서 요청 전 상태로 되돌린다.
   */
  private async applyRequestResult(
    claimed: ClaimedRequest,
    settlementId: string,
    data: Prisma.SettlementPayoutRequestUpdateManyMutationInput,
    revertTo?: SettlementStatus,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await acquireSettlementCloseLock(tx, claimed.teamId);
      const updated = await tx.settlementPayoutRequest.updateMany({
        where: {
          id: claimed.requestId,
          status: PAYOUT_REQUEST_STATUS.REQUESTING,
        },
        data,
      });
      if (updated.count === 0) {
        this.logger.warn(
          `지급 요청 반영 건너뜀(이미 다른 경로로 확정): requestId=${claimed.requestId}`,
        );
        return;
      }
      if (revertTo) {
        await tx.settlement.updateMany({
          where: { id: settlementId, status: SETTLEMENT_STATUS.PROCESSING },
          data: { status: revertTo },
        });
      }
    });
  }

  /** 지급 요청 가능 여부 — 상태·금액·계좌(등록 완료 + 서브몰 ID + 등록 호출 진행 중 아님). */
  private classifyTarget(s: SettlementTarget):
    | {
        exclusion: null;
        subMallId: string;
        account: NonNullable<SettlementTarget["team"]["settlementAccount"]>;
      }
    | { exclusion: PayoutRequestExclusion } {
    const account = s.team.settlementAccount;
    const verdict = classifyPayoutBlock({
      status: s.status,
      netAmount: s.netAmount,
      reviewReopened: s.payoutRequests.some(
        (r) =>
          r.needsReview &&
          r.reviewReason === PAYOUT_REVIEW_REASON.REOPENED_IN_PROGRESS,
      ),
      reviewOpen: s._count.payoutRequests > 0,
      account: toPayoutAccountInput(account),
    });
    if (verdict.reason !== null || !account) {
      return { exclusion: verdict.reason ?? "ACCOUNT_NONE" };
    }
    return { exclusion: null, subMallId: verdict.subMallId, account };
  }

  /** 건너뛴 건의 팀명·금액 — 요청 전에 한 번 읽어 둔 머리 정보. */
  private async loadHeads(
    settlementIds: readonly string[],
  ): Promise<Map<string, SettlementHead>> {
    const rows = await this.prisma.settlement.findMany({
      where: { id: { in: [...new Set(settlementIds)] } },
      select: { id: true, netAmount: true, team: { select: { name: true } } },
    });
    return new Map(
      rows.map((r) => [
        r.id,
        { teamName: r.team.name ?? null, amount: r.netAmount },
      ]),
    );
  }

  private skipped(
    settlementId: string,
    head: SettlementHead | undefined,
    reasonCode: PayoutRequestExclusion,
  ): PayoutRequestItemResult {
    return {
      settlementId,
      teamName: head?.teamName ?? null,
      amount: head?.amount ?? null,
      outcome: "SKIPPED",
      requestId: null,
      niceSeq: null,
      reasonCode,
      message: PAYOUT_REQUEST_EXCLUSION_REASON[reasonCode],
    };
  }

  /**
   * 운영자 지급 취소(0103001) — 지급 처리 중 정산의 진행 중 요청 1건을 나이스에서 취소한다. live 에서만, 지급일 당일 10:30 전까지.
   *   - 취소 성공: 나이스 화면 삭제와 같은 경로(closeAndRevert)로 요청 CANCELLED · 정산 approved.
   *   - 응답 없음·"대상 없음(1104)": 상태를 바꾸지 않고 그 지급일을 한 번 조회해 나이스의 실제 상태(삭제/요청)로 맞춘다.
   *   - 확정 거절·설정 오류: 상태를 바꾸지 않는다.
   * 나이스를 부른 뒤의 결과는 모두 200 으로 돌려준다(감사 로그가 실패·미확인 건도 남기게). 부르기 전에 막히면 409.
   */
  async cancel(
    settlementId: string,
    adminId: string,
  ): Promise<PayoutCancelResult> {
    await this.requireMode(["live"]);
    const lockKey = cancelLockKey(settlementId);
    const lockToken = `${adminId}:${randomUUID()}`;
    const locked = await this.redis.setIfNotExists(
      lockKey,
      lockToken,
      CANCEL_LOCK_TTL_SECONDS,
    );
    if (!locked) {
      throw new ConflictException({
        message:
          "이 정산의 지급 취소를 이미 처리하고 있습니다. 잠시 후 다시 확인해주세요.",
        errorCode: "PAYOUT_CANCEL_IN_PROGRESS",
      });
    }
    try {
      return await this.cancelLocked(settlementId, adminId);
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  private async cancelLocked(
    settlementId: string,
    adminId: string,
  ): Promise<PayoutCancelResult> {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: {
        teamId: true,
        status: true,
        payoutRequests: {
          where: { status: { in: [...ACTIVE_PAYOUT_REQUEST_STATUSES] } },
          select: {
            id: true,
            status: true,
            niceSeq: true,
            subMallId: true,
            settlementDate: true,
            needsReview: true,
          },
          take: 1,
        },
      },
    });
    if (!settlement) {
      throw new NotFoundException("정산을 찾을 수 없습니다.");
    }
    if (settlement.status !== SETTLEMENT_STATUS.PROCESSING) {
      throw new ConflictException({
        message: "지급 처리 중인 정산만 취소할 수 있습니다.",
        errorCode: "PAYOUT_CANCEL_NOT_PROCESSING",
      });
    }
    const request = settlement.payoutRequests[0];
    if (!request) {
      throw new ConflictException(PAYOUT_CANCEL_BLOCK_ERROR.NO_REQUEST);
    }
    const verdict = classifyPayoutCancelBlock(request);
    if (verdict.reason !== null) {
      throw new ConflictException(PAYOUT_CANCEL_BLOCK_ERROR[verdict.reason]);
    }

    const payDate = dateOnlyToString(request.settlementDate);
    const call = await this.payoutApi.cancelPayout(
      {
        subId: request.subMallId,
        settlmntDt: payDate.replace(/-/g, ""),
        seq: verdict.niceSeq,
      },
      { teamId: settlement.teamId, settlementId, requestedBy: adminId },
    );
    const result = (
      outcome: PayoutCancelOutcome,
      message: string,
    ): PayoutCancelResult => ({
      settlementId,
      requestId: request.id,
      outcome,
      resCode: call.meta.resCode,
      message,
    });
    const cancelled = () =>
      result("CANCELLED", "지급을 취소했습니다. 지급 대기로 돌아갔습니다.");
    // 지급 대기로 돌아간 종결 — 우리가 닫았든(삭제) 결과 조회가 접수되지 않음으로 닫았든 운영자에게는 같은 결과다.
    const revertedOutcome = (status: string | null) =>
      status === PAYOUT_REQUEST_STATUS.CANCELLED
        ? cancelled()
        : status === PAYOUT_REQUEST_STATUS.NOT_FOUND
          ? result(
              "CANCELLED",
              "나이스에 접수되지 않은 요청으로 확인되어 지급 대기로 돌아갔습니다.",
            )
          : null;

    if (call.outcome === "SUCCESS") {
      let closed: boolean;
      try {
        closed = await this.resultService.closeAndRevert(
          { id: request.id, settlementId },
          settlement.teamId,
          PAYOUT_REQUEST_STATUS.CANCELLED,
          { errReason: PAYOUT_CANCEL_REASON, confirmedAt: new Date() },
        );
      } catch (error) {
        // 나이스는 이미 취소했다 — 그 건만 바로 다시 조회해 "삭제"로 닫히면 취소로 알리고,
        //   그래도 안 되면 다음 결과 조회가 맞추도록 남기고 운영자에게는 확인 중으로 알린다.
        this.logger.error(
          `나이스 지급 취소는 성공했는데 상태 반영 실패: settlementId=${settlementId}, requestId=${request.id}, ${
            error instanceof Error ? error.message : "unknown"
          }`,
        );
        await this.resultService.recheckAfterCancel(
          payDate,
          adminId,
          request.id,
        );
        const { status } = await this.readRequestAfterCancel(request.id);
        return (
          revertedOutcome(status) ??
          result(
            "UNCONFIRMED",
            "나이스에서는 취소됐지만 팀플러스 상태 반영에 실패했습니다. 잠시 후 목록을 새로 고쳐 확인해주세요.",
          )
        );
      }
      if (closed) return cancelled();
      const { status } = await this.readRequestAfterCancel(request.id);
      const reverted = revertedOutcome(status);
      if (reverted) return reverted;
      this.logger.error(
        `나이스 지급 취소 성공인데 요청이 이미 다른 상태로 닫힘: settlementId=${settlementId}, requestId=${request.id}, status=${status}`,
      );
      return result(
        "UNCONFIRMED",
        "나이스는 취소를 받았지만 팀플러스 상태가 이미 바뀌었습니다. 정산 상세에서 확인해주세요.",
      );
    }

    if (
      call.outcome === "AMBIGUOUS" ||
      call.meta.resCode === NICE_NO_DATA_CODE
    ) {
      this.logger.warn(
        `나이스 지급 취소 결과 불명 — 그 건만 즉시 결과 조회: settlementId=${settlementId}, requestId=${request.id}, ${describePayoutCallForOperator(call.meta)}`,
      );
      const recheck = await this.resultService.recheckAfterCancel(
        payDate,
        adminId,
        request.id,
      );
      const { status } = await this.readRequestAfterCancel(request.id);
      // 결과 조회가 나이스 "삭제"로 닫았다(사유는 그 경로가 적은 대로 둔다 — 누가 취소했는지는 감사 로그).
      const reverted = revertedOutcome(status);
      if (reverted) return reverted;
      if (status !== null && status !== PAYOUT_REQUEST_STATUS.REQUESTED) {
        return result(
          "REJECTED",
          "지급 결과가 이미 확정되어 취소하지 못했습니다. 정산 상세에서 확인해주세요.",
        );
      }
      if (!recheck.queried || status === null) {
        return result(
          "UNCONFIRMED",
          "취소 결과를 확인 중입니다. 잠시 후 목록을 새로 고치거나 나이스 화면에서 확인해주세요.",
        );
      }
      // 이번 조회에서 나이스가 그 건을 아직 "요청"으로 보여줬을 때만 취소되지 않았다고 말한다 — 지난 조회가 저장해 둔 상태값은 보지 않는다.
      const sighting = recheck.sighting;
      if (sighting?.kind === "MATCHED" && sighting.result === "PENDING") {
        if (call.outcome === "AMBIGUOUS") {
          // 취소 응답을 못 받았을 뿐 나이스가 받아서 뒤늦게 반영할 수 있다 — 취소 안 됨으로 확정하지 않는다.
          return result(
            "UNCONFIRMED",
            "취소 요청의 응답을 받지 못했고 나이스에는 아직 요청으로 남아 있습니다. 잠시 후 목록을 새로 고치거나 나이스 화면에서 확인해주세요.",
          );
        }
        return result(
          "REJECTED",
          "나이스에 취소되지 않은 요청으로 남아 있습니다. 다시 시도해주세요.",
        );
      }
      if (sighting?.kind === "NOT_FOUND") {
        // 결과 목록에 그 건이 없었다(삭제된 행을 나이스가 빼는 경우 등) — 판단할 수 없어 나이스 화면 확인으로 넘긴다.
        return result(
          "UNCONFIRMED",
          "나이스가 취소할 지급 건을 찾지 못했습니다. 나이스 화면에서 이 건의 상태를 확인해주세요.",
        );
      }
      // 짝 맞추기 불가·모르는 상태값(결과 조회가 확인 필요를 켰다) 등 — 상세에서 보게 한다.
      return result(
        "UNCONFIRMED",
        "취소 결과를 확인 중입니다. 잠시 후 목록을 새로 고치거나 정산 상세에서 확인해주세요.",
      );
    }

    return result(
      "REJECTED",
      `지급을 취소하지 못했습니다. ${describePayoutCallForOperator(call.meta)}`,
    );
  }

  private async readRequestAfterCancel(
    requestId: string,
  ): Promise<{ status: string | null }> {
    const row = await this.prisma.settlementPayoutRequest.findUnique({
      where: { id: requestId },
      select: { status: true },
    });
    return { status: row?.status ?? null };
  }

  private async requireMode(
    allowed: readonly PayoutApiMode[],
  ): Promise<PayoutApiMode> {
    const mode = await resolvePayoutApiMode(this.prisma, this.redis);
    if (allowed.includes(mode)) return mode;
    if (mode === "off") {
      throw new ConflictException({
        message:
          "지급대행 API 를 사용하지 않는 상태입니다. 앱 설정에서 지급대행 모드를 확인해주세요.",
        errorCode: "PAYOUT_API_OFF",
      });
    }
    throw new ConflictException({
      message: "지급대행 API 사용(live) 중에만 지급을 요청할 수 있습니다.",
      errorCode: "PAYOUT_API_NOT_LIVE",
    });
  }
}
