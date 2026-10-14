import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { dateOnlyToUtc } from "@/common/utils/kst-date.util";
import {
  SETTLEMENT_STATUS,
  type SettlementStatus,
} from "./constants/settlement-status.constant";
import { PAYOUT_REQUEST_STATUS } from "./constants/payout-request-status.constant";
import type { PayoutApiMode } from "./constants/payout-mode.constant";
import { resolvePayoutApiMode } from "./payout-mode.util";
import { NicePayoutApiService } from "./nice-payout-api.service";
import {
  TeamSettlementAccountService,
  isSubMallRegistrationInProgress,
} from "./team-settlement-account.service";
import { assertNicePayDate } from "./utils/nice-pay-date.util";
import { computeDefaultPayDate } from "./utils/payout-default-date.util";
import { truncateUtf8Bytes } from "./utils/nice-xlsx.util";
import { decryptOrRaw, maskBankAccount } from "./utils/account-mask.util";
import {
  PAYOUT_FILE_EXCLUSION_REASON,
  classifyPayoutFileAccount,
  type PayoutFileExclusion,
} from "./utils/nice-account-state.util";
import { acquireSettlementCloseLock } from "./utils/settlement-locks.util";
import { describePayoutCallForOperator } from "./gateway/payout-res-code.util";
import type {
  CreatePayoutRequestsDto,
  PayoutRequestItemDto,
} from "./dto/payout-request.dto";
import { PAYOUT_REQUEST_MAX_ITEMS } from "./dto/payout-request.dto";

export const DEFAULT_PAYOUT_DAY_OF_MONTH = 15;

/** 나이스 수취 통장 표기(accntDesc) 길이 — 규격 30. */
const ACCNT_DESC_MAX_BYTES = 30;

/** 지급 요청을 받을 수 있는 정산 상태 — 지급 예정(approved)과 지급 실패 뒤 재요청(failed). */
const PAYABLE_STATUSES: readonly SettlementStatus[] = [
  SETTLEMENT_STATUS.APPROVED,
  SETTLEMENT_STATUS.FAILED,
];

export type PayoutRequestExclusion =
  | PayoutFileExclusion
  | "SETTLEMENT_NOT_FOUND"
  | "NOT_PAYABLE_STATUS"
  | "PAYOUT_IN_PROGRESS"
  | "NET_NOT_POSITIVE"
  | "ACCOUNT_CHANGED"
  | "SETTLEMENT_CHANGED"
  | "DUPLICATE_ITEM";

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
} satisfies Prisma.SettlementSelect;

type SettlementTarget = Prisma.SettlementGetPayload<{
  select: typeof SETTLEMENT_TARGET_SELECT;
}>;

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
        isRetry: s.status === SETTLEMENT_STATUS.FAILED,
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

    const results: PayoutRequestItemResult[] = [];
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.settlementId)) {
        results.push(
          this.skipped(item.settlementId, null, null, "DUPLICATE_ITEM"),
        );
        continue;
      }
      seen.add(item.settlementId);
      try {
        results.push(
          await this.requestOne(
            item,
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
        return this.skipped(item.settlementId, null, null, error.reasonCode);
      }
      // 부분 유니크 인덱스(정산당 진행 중 1건) 위반 — 같은 정산을 동시에 요청한 경쟁이다.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return this.skipped(
          item.settlementId,
          null,
          null,
          "PAYOUT_IN_PROGRESS",
        );
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
    if (!PAYABLE_STATUSES.includes(s.status as SettlementStatus)) {
      return {
        exclusion:
          s.status === SETTLEMENT_STATUS.PROCESSING
            ? "PAYOUT_IN_PROGRESS"
            : "NOT_PAYABLE_STATUS",
      };
    }
    if (s.netAmount <= 0) return { exclusion: "NET_NOT_POSITIVE" };
    const account = s.team.settlementAccount;
    const classified = classifyPayoutFileAccount(
      account
        ? {
            status: account.status,
            subMallId: account.subMallId,
            registrationInProgress: isSubMallRegistrationInProgress(
              account.registrationStartedAt,
            ),
          }
        : null,
    );
    if (classified.exclusion !== null || !account) {
      return { exclusion: classified.exclusion ?? "ACCOUNT_NONE" };
    }
    return { exclusion: null, subMallId: classified.subMallId, account };
  }

  private skipped(
    settlementId: string,
    teamName: string | null,
    amount: number | null,
    reasonCode: PayoutRequestExclusion,
  ): PayoutRequestItemResult {
    return {
      settlementId,
      teamName,
      amount,
      outcome: "SKIPPED",
      requestId: null,
      niceSeq: null,
      reasonCode,
      message: PAYOUT_REQUEST_EXCLUSION_REASON[reasonCode],
    };
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
