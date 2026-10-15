import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import {
  Prisma,
  SettlementDetailStatus,
  SettlementEntryType,
  SettlementSourceType,
} from "@prisma/client";
import {
  PAYOUT_REQUEST_VIEW_SELECT,
  payoutScheduledDateOf,
  toAdminPayoutRequestView,
} from "./utils/payout-request-view.util";
import { markSettlementPaidInTx } from "./utils/settlement-paid.util";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { ResourceAccessService } from "@/common/access/resource-access.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import {
  dateOnlyToUtc,
  kstTodayUtcMidnight,
} from "@/common/utils/kst-date.util";
import {
  SETTLEMENT_STATUS,
  SettlementStatus,
  assertTransition,
} from "./constants/settlement-status.constant";
import { QuerySettlementDto } from "./dto/query-settlement.dto";
import { QuerySettlementDetailsDto } from "./dto/query-settlement-details.dto";
import { acquireSettlementCloseLock } from "./utils/settlement-locks.util";
import { toCsvBuffer } from "./utils/csv.util";
import { aggregateDetailsBySource } from "./utils/settlement-detail-summary.util";
import { decryptOrRaw, maskBankAccount } from "./utils/account-mask.util";
import {
  TeamSettlementAccountService,
  isSubMallRegistrationInProgress,
} from "./team-settlement-account.service";
import { assertNicePayDate } from "./utils/nice-pay-date.util";
import { buildNiceXlsx } from "./utils/nice-xlsx.util";
import {
  PAYOUT_FILE_EXCLUSION_REASON,
  classifyPayoutFileAccount,
  type PayoutFileExclusion,
} from "./utils/nice-account-state.util";
import { NicePayoutApiService } from "./nice-payout-api.service";
import { SettlementPayoutResultService } from "./settlement-payout-result.service";
import {
  DUPLICATE_SUSPECT_REVIEW_REASONS,
  PAYOUT_REVIEW_REASON,
} from "./constants/payout-review.constant";

/** 나이스 결과 조회 전문 ID — 호출 기록에서 마지막 조회 시각을 읽을 때 쓴다. */
const NICE_PAYOUT_RESULT_SID = "0101002";
import { PG_FEE_RATE } from "./constants/pg-fee.constant";
import { resolvePayoutApiMode } from "./payout-mode.util";
import { describePayoutApiModes } from "./constants/payout-mode.constant";
import { describePayoutCallForOperator } from "./gateway/payout-res-code.util";

/** LIKE 패턴 리터럴화 — 이스케이프 문자 `\` 기준으로 `\`·`%`·`_` 앞에 `\` 를 붙인다. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 명세 CSV 안전 상한 — 팀·월 단위라 통상 수백 건 이하. */
const DETAIL_EXPORT_MAX_ROWS = 10000;

const ENTRY_TYPE_LABEL: Record<SettlementEntryType, string> = {
  PAYMENT: "결제",
  REFUND: "환불",
};

const SOURCE_TYPE_LABEL: Record<SettlementSourceType, string> = {
  CLASS: "수업",
  TOURNAMENT: "대회",
  OTHER: "기타",
};

const SETTLEMENT_DETAIL_ROW_SELECT = {
  id: true,
  settlementId: true,
  paymentId: true,
  orderNumber: true,
  entryType: true,
  sourceType: true,
  sourceId: true,
  attributionMonth: true,
  productName: true,
  paymentDate: true,
  paymentMethod: true,
  paymentAmount: true,
  feeRate: true,
  feeAmount: true,
  pgFeeRate: true,
  pgFeeAmount: true,
  actualAmount: true,
  status: true,
  memo: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SettlementDetailSelect;

const SETTLEMENT_LIST_SELECT = {
  id: true,
  teamId: true,
  settlementMonth: true,
  totalRevenue: true,
  platformFee: true,
  paymentFee: true,
  refundAmount: true,
  netAmount: true,
  status: true,
  scheduledAt: true,
  completedAt: true,
  managerApprovalStatus: true,
  managerApprovalAt: true,
  createdAt: true,
  updatedAt: true,
  team: {
    select: {
      id: true,
      name: true,
      settlementAccount: { select: { status: true } },
    },
  },
  _count: {
    select: {
      details: true,
      // 운영자 확인이 필요한 지급 요청 수(상태 무관) — 최신 요청이 다른 것(REJECTED 등)이어도 어드민이 알아야 한다.
      payoutRequests: { where: { needsReview: true } },
    },
  },
  // 가장 최근 나이스 지급 요청 1건 — 지급 예정일(전 역할)과 운영자용 상태 표시에 쓴다.
  payoutRequests: {
    select: PAYOUT_REQUEST_VIEW_SELECT,
    orderBy: { requestedAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.SettlementSelect;

const SETTLEMENT_DETAIL_SELECT = {
  id: true,
  teamId: true,
  settlementMonth: true,
  totalRevenue: true,
  platformFee: true,
  paymentFee: true,
  refundAmount: true,
  netAmount: true,
  status: true,
  bankName: true,
  bankAccount: true,
  accountHolder: true,
  scheduledAt: true,
  completedAt: true,
  managerId: true,
  managerApprovalStatus: true,
  managerApprovalAt: true,
  createdAt: true,
  updatedAt: true,
  manager: { select: { id: true, firstName: true, lastName: true } },
  team: {
    select: {
      id: true,
      name: true,
      settlementAccount: {
        select: {
          status: true,
          bankCode: true,
          bankAccount: true,
          accountHolder: true,
          updatedAt: true,
        },
      },
    },
  },
  transactions: {
    select: {
      id: true,
      paymentId: true,
      transactionType: true,
      amount: true,
      description: true,
      transactionDate: true,
      createdAt: true,
    },
    orderBy: { transactionDate: "desc" as const },
  },
  payoutRequests: {
    select: PAYOUT_REQUEST_VIEW_SELECT,
    orderBy: { requestedAt: "desc" as const },
  },
} satisfies Prisma.SettlementSelect;

/** 수동 "지급 완료" 처리를 받을 수 있는 상태 — 지급 예정과, 나이스 지급이 실패해 다른 방법으로 보낸 뒤 닫는 경우. */
const MANUAL_PAYOUT_FROM: readonly SettlementStatus[] = [
  SETTLEMENT_STATUS.APPROVED,
  SETTLEMENT_STATUS.FAILED,
];

/**
 * 운영자 확인이 필요한 지급 요청(결과 조회가 needsReview 를 켠 건, 상태 무관) — 이 건이 있는 정산은 어떤 경로로도 다시 지급하지 않는다.
 * 지급 요청 서비스의 claim 판정과 같은 조건이다.
 */
const OPEN_REVIEW_REQUEST = { needsReview: true } as const;

/** 운영자 확인이 필요한 정산 — 목록 필터(needsReview=true)와 요약 집계가 같은 조건을 쓴다. */
const NEEDS_REVIEW_WHERE: Prisma.SettlementWhereInput = {
  payoutRequests: { some: OPEN_REVIEW_REQUEST },
};

export type SettlementApproveOutcome = "APPROVED" | "SKIPPED" | "ERROR";
export type SettlementApproveSkipReason =
  | "NOT_PENDING"
  | "NET_NEGATIVE"
  | "SETTLEMENT_NOT_FOUND"
  | "DUPLICATE_ITEM";

export interface SettlementApproveItemResult {
  settlementId: string;
  teamName: string | null;
  outcome: SettlementApproveOutcome;
  reasonCode: SettlementApproveSkipReason | null;
  reason: string | null;
}

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resourceAccess: ResourceAccessService,
    private readonly accountService: TeamSettlementAccountService,
    private readonly payoutApi: NicePayoutApiService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly payoutResultService: SettlementPayoutResultService,
  ) {}

  getPayoutModes() {
    return describePayoutApiModes(this.config);
  }

  /** 나이스 지급대행 잔액 — 지급 전 확인·어드민 표시용. 조회도 호출 기록에 남는다. */
  async getPayoutBalance(adminId: string) {
    const mode = await resolvePayoutApiMode(this.prisma, this.redis);
    if (mode === "off") {
      throw new ConflictException({
        message:
          "지급대행 API 를 사용하지 않는 상태입니다. 앱 설정에서 지급대행 모드를 확인해주세요.",
        errorCode: "PAYOUT_API_OFF",
      });
    }
    const result = await this.payoutApi.getBalance({ requestedBy: adminId });
    if (result.outcome !== "SUCCESS" || result.remainAmt === null) {
      throw new BadGatewayException({
        // 운영자 전용 API — 원인(통신·키·코드·나이스 원문)을 그대로 보여준다.
        message: describePayoutCallForOperator(result.meta),
        errorCode: "NICE_PAYOUT_API_FAILED",
      });
    }
    return { remainAmt: result.remainAmt, checkedAt: new Date() };
  }

  /**
   * 정산 목록 조회 — 팀 스코프는 ResourceAccessService.resolveTeamScope 단일 SoT.
   * 스코프가 빈 배열이면 DB 조회 없이 빈 페이지를 반환한다(관리 팀 0개, 또는 teamId 가
   * 요청자 관리 범위 밖).
   */
  async getSettlements(query: QuerySettlementDto, requester: JwtUserPayload) {
    const {
      status,
      month,
      teamId,
      needsReview,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = query;

    const where: Prisma.SettlementWhereInput = {};

    // 관리자급은 전체 팀이 범위라 IN 목록을 만들지 않고 teamId 지정 시에만 필터한다.
    if (isAdminRole(requester.userType)) {
      if (teamId) where.teamId = teamId;
      if (needsReview) Object.assign(where, NEEDS_REVIEW_WHERE);
    } else {
      const scopeTeamIds = await this.resourceAccess.resolveTeamScope(
        requester,
        teamId,
      );
      if (scopeTeamIds.length === 0) {
        return { data: [], meta: { total: 0, page, pageSize, totalPages: 0 } };
      }
      where.teamId = { in: scopeTeamIds };
    }

    if (status) {
      where.status = status;
    }

    if (month) {
      where.settlementMonth = month;
    }

    const createdAt = this.kstDateOnlyRange(startDate, endDate);
    if (createdAt) where.createdAt = createdAt;

    const [settlements, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        select: SETTLEMENT_LIST_SELECT,
        // 지급 정산 목록은 최신 정산월이 위 — 과거 월을 나중에 마감해도 순서가 흔들리지 않게 정산월 기준.
        orderBy: [{ settlementMonth: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.settlement.count({ where }),
    ]);

    const isAdmin = isAdminRole(requester.userType);
    const today = kstTodayUtcMidnight();
    // 이중 지급 의심(재요청 중복·같은 팀 이중 성공) 요청이 켜진 정산 — 이 페이지의 정산만 한 번에 읽는다(N+1 없음).
    const duplicateSuspectIds = new Set<string>();
    if (isAdmin && settlements.length > 0) {
      const suspects = await this.prisma.settlementPayoutRequest.findMany({
        where: {
          settlementId: { in: settlements.map((s) => s.id) },
          needsReview: true,
          reviewReason: { in: [...DUPLICATE_SUSPECT_REVIEW_REASONS] },
        },
        select: { settlementId: true },
        distinct: ["settlementId"],
      });
      for (const s of suspects) duplicateSuspectIds.add(s.settlementId);
    }
    return {
      // 계좌 상태는 team 객체에 섞지 않고 행 최상위에 둔다(team 응답은 {id, name} 계약 유지).
      data: settlements.map(({ team, payoutRequests, _count, ...row }) => {
        const { settlementAccount, ...teamInfo } = team;
        const latest = payoutRequests[0] ?? null;
        return {
          ...row,
          _count: { details: _count.details },
          team: teamInfo,
          accountStatus: settlementAccount?.status ?? null,
          // 진행 중인 나이스 지급 요청의 지급 예정일 — 감독·코치도 본다(사유·접수번호는 운영자만).
          payoutScheduledDate: payoutScheduledDateOf(latest),
          ...(isAdmin
            ? {
                payoutRequest: latest
                  ? toAdminPayoutRequestView(latest, today)
                  : null,
                /** 운영자 확인이 필요한 지급 요청 수 — 0보다 크면 지급 요청·수동 완료가 막힌 정산 */
                reviewOpenCount: _count.payoutRequests,
                /** 확인 필요 사유 중 돈이 두 번 나갔을 수 있는 것이 있음 */
                duplicateSuspected: duplicateSuspectIds.has(row.id),
              }
            : {}),
        };
      }),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 정산 목록을 CSV 버퍼로 반환(ADMIN 전용, admin.service.ts exportSettlements 이식 — 13열 동일).
   * 수식 주입 방지 등 이스케이프는 toCsvBuffer(csv.util) 공용 처리.
   */
  async exportSettlements(
    startDate?: string,
    endDate?: string,
    month?: string,
  ): Promise<Buffer> {
    const where: Prisma.SettlementWhereInput = {};

    if (month) {
      where.settlementMonth = month;
    }

    const createdAt = this.kstDateOnlyRange(startDate, endDate);
    if (createdAt) where.createdAt = createdAt;

    const settlements = await this.prisma.settlement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        settlementMonth: true,
        totalRevenue: true,
        platformFee: true,
        paymentFee: true,
        refundAmount: true,
        netAmount: true,
        status: true,
        bankName: true,
        bankAccount: true,
        accountHolder: true,
        createdAt: true,
        team: { select: { id: true, name: true } },
      },
    });

    const headers = [
      "ID",
      "정산월",
      "클럽명",
      "총매출",
      "플랫폼수수료",
      "PG수수료",
      "환불금액",
      "정산금액",
      "상태",
      "은행명",
      "계좌번호",
      "예금주",
      "생성일",
    ];

    const rows = settlements.map((s) => [
      s.id,
      s.settlementMonth ?? "",
      s.team?.name ?? "",
      s.totalRevenue?.toString() ?? "0",
      s.platformFee?.toString() ?? "0",
      s.paymentFee?.toString() ?? "0",
      s.refundAmount?.toString() ?? "0",
      s.netAmount?.toString() ?? "0",
      s.status ?? "",
      s.bankName ?? "",
      decryptOrRaw(s.bankAccount) ?? "",
      s.accountHolder ?? "",
      s.createdAt?.toISOString() ?? "",
    ]);

    return toCsvBuffer(headers, rows);
  }

  /**
   * 정산 상세 조회 — 관리자급은 계좌 평문, 그 외(스코프 통과자)는 마스킹 표시.
   */
  async getSettlementById(id: string, requester: JwtUserPayload) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
      select: SETTLEMENT_DETAIL_SELECT,
    });

    if (!settlement) {
      throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
    }

    const scope = await this.resourceAccess.resolveTeamScope(
      requester,
      settlement.teamId,
    );
    if (scope.length === 0) {
      throw new ForbiddenException("정산 정보를 조회할 권한이 없습니다.");
    }

    const isAdmin = isAdminRole(requester.userType);
    const { settlementAccount, ...team } = settlement.team;
    const { payoutRequests, ...settlementRow } = settlement;
    const today = kstTodayUtcMidnight();
    const payoutView = {
      payoutScheduledDate: payoutScheduledDateOf(payoutRequests[0] ?? null),
      ...(isAdmin
        ? {
            payoutRequests: payoutRequests.map((r) =>
              toAdminPayoutRequestView(r, today),
            ),
          }
        : {}),
    };
    // COACH 는 은행 정보 열람 대상이 아니다 — 감독(DIRECTOR)은 마스킹 표시.
    if (requester.userType === "COACH") {
      return {
        ...settlementRow,
        ...payoutView,
        team,
        bankName: null,
        bankAccount: null,
        accountHolder: null,
        teamSettlementAccount: settlementAccount
          ? {
              status: settlementAccount.status,
              bankName: null,
              bankAccount: null,
              accountHolder: null,
            }
          : null,
      };
    }

    const bankNames = settlementAccount
      ? await this.accountService.loadBankNames()
      : new Map<string, string>();
    const displayAccount = (value: string | null | undefined) => {
      const plain = decryptOrRaw(value);
      return isAdmin ? plain : maskBankAccount(plain);
    };
    return {
      ...settlementRow,
      ...payoutView,
      team,
      // 지급 시점 스냅샷(지급 전에는 비어 있다).
      bankAccount: displayAccount(settlement.bankAccount),
      // 현재 팀 정산 계좌 — 지급 가능 여부(status=REGISTERED) 판단과 지급 전 확인용.
      teamSettlementAccount: settlementAccount
        ? {
            status: settlementAccount.status,
            bankName:
              bankNames.get(settlementAccount.bankCode) ??
              settlementAccount.bankCode,
            bankAccount: displayAccount(settlementAccount.bankAccount),
            accountHolder: settlementAccount.accountHolder,
            // 지급 확인 화면이 본 계좌 버전 — payout 의 expectedAccountUpdatedAt 으로 되돌려 받는다.
            updatedAt: settlementAccount.updatedAt,
          }
        : null,
    };
  }

  /**
   * 정산 명세 접근 검증 — 팀 스코프 밖 403, 없음 404. allowCoach=false 면 COACH 도 403
   * (코치는 합계·출처별 요약까지만 보고 건별 결제 명세는 열람 대상이 아니다).
   */
  private async assertDetailAccess(
    settlementId: string,
    requester: JwtUserPayload,
    allowCoach: boolean,
  ) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: { id: true, teamId: true, settlementMonth: true },
    });

    if (!settlement) {
      throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
    }

    const scope = await this.resourceAccess.resolveTeamScope(
      requester,
      settlement.teamId,
    );
    if (scope.length === 0) {
      throw new ForbiddenException("정산 상세 내역을 조회할 권한이 없습니다.");
    }

    if (!allowCoach && requester.userType === "COACH") {
      throw new ForbiddenException("정산 상세 내역을 조회할 권한이 없습니다.");
    }

    return settlement;
  }

  /** 건별 명세 필터 — 화면 조회와 CSV 가 같은 집합을 보도록 공유한다. */
  private async buildDetailsWhere(
    settlementId: string,
    query: QuerySettlementDetailsDto,
  ): Promise<Prisma.SettlementDetailWhereInput> {
    if (query.sourceId && !query.sourceType) {
      throw new BadRequestException(
        "sourceId 는 sourceType 과 함께 전달해야 합니다.",
      );
    }

    const where: Prisma.SettlementDetailWhereInput = { settlementId };
    if (query.entryType) where.entryType = query.entryType;
    // 요약 그룹 키와 같은 규칙 — sourceId 가 없는 그룹(OTHER 등)은 sourceId IS NULL + 상품명으로 가린다.
    if (query.sourceType) {
      where.sourceType = query.sourceType;
      where.sourceId = query.sourceId ?? null;
    }
    if (query.productName) where.productName = query.productName;
    if (query.q) {
      // Prisma contains 는 %·_ 를 이스케이프하지 않아 "%" 검색이 전체를 맞춘다 —
      //   직접 이스케이프한 ILIKE 로 대상 id 를 좁힌다(정산 1건 범위라 소량).
      const pattern = `%${escapeLikePattern(query.q)}%`;
      const matched = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM settlement_details
          WHERE settlement_id = ${settlementId}
            AND (product_name ILIKE ${pattern} ESCAPE '\\'
              OR order_number ILIKE ${pattern} ESCAPE '\\')`,
      );
      where.id = { in: matched.map((r) => r.id) };
    }
    return where;
  }

  /** 정산 거래 상세 내역(SettlementDetail 페이징) — 구분·검색어·출처 필터. */
  async getSettlementDetails(
    settlementId: string,
    query: QuerySettlementDetailsDto,
    requester: JwtUserPayload,
  ) {
    await this.assertDetailAccess(settlementId, requester, false);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = await this.buildDetailsWhere(settlementId, query);

    const [details, total] = await Promise.all([
      this.prisma.settlementDetail.findMany({
        where,
        select: SETTLEMENT_DETAIL_ROW_SELECT,
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.settlementDetail.count({ where }),
    ]);

    return {
      data: details,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /** 정산 명세 출처별 요약 — 수업·대회 단위 결제·환불 건수와 금액. COACH 도 열람 가능. */
  async getSettlementDetailsSummary(
    settlementId: string,
    requester: JwtUserPayload,
  ) {
    await this.assertDetailAccess(settlementId, requester, true);

    const rows = await this.prisma.settlementDetail.findMany({
      where: { settlementId },
      select: {
        entryType: true,
        sourceType: true,
        sourceId: true,
        productName: true,
        paymentAmount: true,
        feeAmount: true,
        pgFeeAmount: true,
        actualAmount: true,
      },
      // 그룹 이름은 가장 최근 행의 productName — 월 중 이름이 바뀌면 최신 이름을 보여준다.
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    });

    return aggregateDetailsBySource(rows);
  }

  /** 정산 명세 CSV — 건별 조회와 같은 필터(page/pageSize 무시), 계좌 정보 미포함. */
  async exportSettlementDetails(
    settlementId: string,
    query: QuerySettlementDetailsDto,
    requester: JwtUserPayload,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const settlement = await this.assertDetailAccess(
      settlementId,
      requester,
      false,
    );
    const where = await this.buildDetailsWhere(settlementId, query);

    // 상한 +1 건만 읽어 초과 여부를 한 번의 조회로 판정한다.
    const details = await this.prisma.settlementDetail.findMany({
      where,
      select: SETTLEMENT_DETAIL_ROW_SELECT,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: DETAIL_EXPORT_MAX_ROWS + 1,
    });
    if (details.length > DETAIL_EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `내려받을 명세가 ${DETAIL_EXPORT_MAX_ROWS}건을 넘습니다. 구분이나 검색어로 범위를 줄여주세요.`,
      );
    }

    const headers = [
      "구분",
      "출처",
      "상품명",
      "주문번호",
      "결제일",
      "결제수단",
      "귀속월",
      "결제금액",
      "수수료율",
      "수수료",
      "결제수수료율",
      "결제수수료",
      "실지급액",
      "메모",
    ];
    const rows = details.map((d) => [
      ENTRY_TYPE_LABEL[d.entryType],
      SOURCE_TYPE_LABEL[d.sourceType],
      d.productName,
      d.orderNumber,
      // @db.Date 는 UTC 자정으로 저장되므로 UTC 기준 날짜 부분이 곧 달력 날짜다.
      d.paymentDate.toISOString().slice(0, 10),
      d.paymentMethod,
      d.attributionMonth ?? "",
      String(d.paymentAmount),
      String(d.feeRate),
      String(d.feeAmount),
      String(d.pgFeeRate),
      String(d.pgFeeAmount),
      String(d.actualAmount),
      d.memo ?? "",
    ]);

    return {
      buffer: toCsvBuffer(headers, rows),
      filename: `settlement_details_${settlement.settlementMonth}_${settlement.id}.csv`,
    };
  }

  /** 정산 승인 — pending → approved, 소속 Detail 상태도 함께 동기화 */
  async approve(id: string, adminId: string, note?: string) {
    const teamId = await this.resolveTeamId(id);
    return this.approveWithTeam(id, teamId, adminId, note);
  }

  /** approve 본체 — 일괄 승인이 미리 읽은 teamId 로 건별 조회를 아끼려고 나눈다. 규칙은 단건과 같다. */
  private async approveWithTeam(
    id: string,
    teamId: string,
    adminId: string,
    note?: string,
  ) {
    const updated = await this.transition(
      id,
      teamId,
      SETTLEMENT_STATUS.PENDING,
      SETTLEMENT_STATUS.APPROVED,
      {
        status: SETTLEMENT_STATUS.APPROVED,
        managerId: adminId,
        managerApprovalStatus: "APPROVED",
        managerApprovalAt: new Date(),
      },
      {
        id: true,
        status: true,
        managerId: true,
        managerApprovalStatus: true,
        managerApprovalAt: true,
      },
      async (tx) => {
        await tx.settlementDetail.updateMany({
          where: { settlementId: id },
          data: { status: SettlementDetailStatus.APPROVED },
        });
      },
      {
        where: { netAmount: { gte: 0 } },
        onFail: () =>
          new BadRequestException({
            message:
              "순지급액이 음수인 정산은 승인할 수 없습니다. 다음 달 정산에서 처리하세요.",
            errorCode: "SETTLEMENT_NET_NEGATIVE",
          }),
      },
    );

    this.logger.log(
      `정산 승인: settlementId=${id}, adminId=${adminId}${note ? `, note=${note}` : ""}`,
    );
    return updated;
  }

  /**
   * 정산 일괄 승인 — 건마다 approve 를 그대로 거친다(음수 불가·pending 만·명세 동기화·승인자 기록).
   * 건별로 별도 트랜잭션이라 한 건의 실패가 다른 건을 되돌리지 않는다. 묶음 트랜잭션은 두지 않는다 —
   * 여러 팀 lock 을 한 트랜잭션에서 잡으면 재마감과 lock 순서가 엇갈려 교착할 수 있다.
   */
  async approveBatch(ids: string[], adminId: string, note?: string) {
    const uniqueIds = [...new Set(ids)];
    const heads = await this.prisma.settlement.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, teamId: true, team: { select: { name: true } } },
    });
    const headById = new Map(heads.map((h) => [h.id, h]));

    const results: SettlementApproveItemResult[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const head = headById.get(id);
      const teamName = head?.team.name ?? null;
      if (seen.has(id)) {
        results.push({
          settlementId: id,
          teamName,
          outcome: "SKIPPED",
          reasonCode: "DUPLICATE_ITEM",
          reason: "같은 정산이 두 번 들어 있음",
        });
        continue;
      }
      seen.add(id);
      try {
        if (!head) throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
        await this.approveWithTeam(id, head.teamId, adminId, note);
        results.push({
          settlementId: id,
          teamName,
          outcome: "APPROVED",
          reasonCode: null,
          reason: null,
        });
      } catch (error) {
        results.push(this.classifyApproveFailure(id, teamName, error));
      }
    }

    const count = (outcome: SettlementApproveOutcome) =>
      results.filter((r) => r.outcome === outcome).length;
    this.logger.log(
      `정산 일괄 승인: items=${ids.length}, approved=${count("APPROVED")}, skipped=${count("SKIPPED")}, errored=${count("ERROR")}, adminId=${adminId}`,
    );
    return {
      results,
      summary: {
        approved: count("APPROVED"),
        skipped: count("SKIPPED"),
        errored: count("ERROR"),
      },
    };
  }

  /** approve 의 예외를 건별 결과로 바꾼다 — 메시지 문자열이 아니라 예외 종류와 errorCode 로 가른다. */
  private classifyApproveFailure(
    settlementId: string,
    teamName: string | null,
    error: unknown,
  ): SettlementApproveItemResult {
    if (error instanceof NotFoundException) {
      return {
        settlementId,
        teamName,
        outcome: "SKIPPED",
        reasonCode: "SETTLEMENT_NOT_FOUND",
        reason: error.message,
      };
    }
    if (error instanceof BadRequestException) {
      const body = error.getResponse();
      const errorCode =
        typeof body === "object" && body !== null
          ? (body as { errorCode?: string }).errorCode
          : undefined;
      return {
        settlementId,
        teamName,
        outcome: "SKIPPED",
        reasonCode:
          errorCode === "SETTLEMENT_NET_NEGATIVE"
            ? "NET_NEGATIVE"
            : "NOT_PENDING",
        reason: error.message,
      };
    }
    this.logger.error(
      `정산 승인 처리 오류: settlementId=${settlementId}, ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
    return {
      settlementId,
      teamName,
      outcome: "ERROR",
      reasonCode: null,
      reason:
        "처리 중 오류가 났습니다. 목록을 새로고침해 이 정산의 상태를 확인해주세요.",
    };
  }

  /**
   * 정산 반려 — pending → rejected (사유 필수, 컬럼 없어 응답 echo).
   * 소속 Detail 상태를 REJECTED 로 동기화하고, 사유를 SettlementTransaction(reject, amount 0)로 남긴다.
   */
  async reject(id: string, adminId: string, reason: string) {
    const teamId = await this.resolveTeamId(id);
    const updated = await this.transition(
      id,
      teamId,
      SETTLEMENT_STATUS.PENDING,
      SETTLEMENT_STATUS.REJECTED,
      {
        status: SETTLEMENT_STATUS.REJECTED,
        managerId: adminId,
        managerApprovalStatus: "REJECTED",
        managerApprovalAt: new Date(),
      },
      {
        id: true,
        status: true,
        managerId: true,
        managerApprovalStatus: true,
        managerApprovalAt: true,
      },
      async (tx) => {
        await tx.settlementDetail.updateMany({
          where: { settlementId: id },
          data: { status: SettlementDetailStatus.REJECTED },
        });
        await tx.settlementTransaction.create({
          data: {
            settlementId: id,
            transactionType: "reject",
            amount: 0,
            description: reason,
            // @db.Date — KST 달력일(payout 과 동일 규약).
            transactionDate: kstTodayUtcMidnight(),
          },
        });
      },
    );

    this.logger.warn(
      `정산 반려: settlementId=${id}, adminId=${adminId}, reason=${reason}`,
    );
    return { ...updated, reason };
  }

  /**
   * 정산 수동 지급 완료 — approved|failed → paid(운영자가 나이스 관리자 또는 다른 방법으로 이체한 뒤 닫는다).
   * 팀 정산 계좌가 나이스 등록 완료(REGISTERED)여야 하며, 그 계좌를 정산 행에 스냅샷으로 남긴다.
   * 성공 시에만 SettlementTransaction(payout) 기록 + Detail 상태 동기화 — 나이스 지급 결과(paid)와 같은 기록이다.
   * 순지급액 0원은 보낼 돈이 없어 계좌 없이 완료 처리한다. 지급 가능 상태가 아니면 계좌보다 상태 오류를 먼저 안내한다.
   */
  async payout(
    id: string,
    adminId: string,
    note?: string,
    expectedAccountUpdatedAt?: string,
  ) {
    const target = await this.prisma.settlement.findUnique({
      where: { id },
      select: { teamId: true, status: true, netAmount: true },
    });
    if (!target) {
      throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
    }
    const teamId = target.teamId;
    const payable = MANUAL_PAYOUT_FROM.includes(
      target.status as SettlementStatus,
    );

    // 수동 완료할 수 있는 정산(failed·approved)은 실패로 닫은 지급 건을 나이스 쪽에서 재요청했는지 먼저 맞춘다(지급 요청 경로와
    //   같은 가드 — 그런 건이 없는 정산은 결과 서비스가 바로 빈 집합을 돌려준다). API 를 쓰지 않는 off 모드는 조회할 수
    //   없어 건너뛴다 — 그때는 운영자가 나이스 화면을 직접 확인하는 수동 운영 규칙에 맡긴다.
    if (payable) {
      const mode = await resolvePayoutApiMode(this.prisma, this.redis);
      if (mode !== "off") {
        const unverified =
          await this.payoutResultService.verifyFailedSettlements([id], adminId);
        if (unverified.has(id)) throw this.payoutReopenUnverified();
      }
    }

    const account =
      payable && target.netAmount > 0
        ? await this.accountService.getPayoutAccount(teamId)
        : null;
    if (payable && target.netAmount > 0 && account?.status !== "REGISTERED") {
      throw this.accountNotRegistered();
    }
    // 운영자가 확인 화면에서 본 계좌와 지금 계좌가 다르면(그 사이 수정·재등록) 스냅샷이 어긋나므로 막는다.
    if (
      account &&
      expectedAccountUpdatedAt &&
      account.updatedAt.getTime() !==
        new Date(expectedAccountUpdatedAt).getTime()
    ) {
      throw this.accountChanged();
    }

    // 미리 읽은 계좌가 그대로일 때만 지급한다 — 그 사이 감독이 계좌를 고쳤거나 운영자가
    //   등록을 해제·초기화했다면 스냅샷이 틀어지므로 막는다(팀 lock 안의 단일 updateMany 로 판정).
    //   계좌 없이 진행하는 경로(0원·지급 불가 상태)는 금액이 0원 이하로 유지될 때만 통과한다.
    //   운영자 확인이 필요한 지급 요청(needsReview — 실패 건의 나이스 재진행·이중 지급 의심 등)이 있으면 수동 완료도 막는다 — 두 번 나간다.
    const notUnderReview: Prisma.SettlementWhereInput = {
      payoutRequests: { none: OPEN_REVIEW_REQUEST },
    };
    const guardWhere: Prisma.SettlementWhereInput = account
      ? {
          ...notUnderReview,
          netAmount: { gt: 0 },
          team: {
            settlementAccount: {
              is: { status: "REGISTERED", updatedAt: account.updatedAt },
            },
          },
        }
      : { ...notUnderReview, netAmount: 0 };

    const updated = await this.prisma.$transaction(async (tx) => {
      await acquireSettlementCloseLock(tx, teamId);
      const paid = await markSettlementPaidInTx(tx, {
        settlementId: id,
        expectedFrom: MANUAL_PAYOUT_FROM,
        extraWhere: guardWhere,
        account,
        description: note ?? "정산 지급 완료",
      });
      if (!paid) {
        const current = await tx.settlement.findUnique({
          where: { id },
          select: { status: true, netAmount: true },
        });
        if (!current) {
          throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
        }
        if (MANUAL_PAYOUT_FROM.includes(current.status as SettlementStatus)) {
          // 상태는 맞는데 계좌·금액 조건만 어긋난 경우.
          if (current.netAmount < 0) {
            throw new BadRequestException(
              "순지급액이 음수인 정산은 지급할 수 없습니다. 다음 달 정산에서 처리하세요.",
            );
          }
          const underReview = await tx.settlementPayoutRequest.count({
            where: { settlementId: id, ...OPEN_REVIEW_REQUEST },
          });
          if (underReview > 0) {
            // 실패 건의 나이스 재진행은 확인 완료로 풀리지 않는다 — 안내를 따로 한다.
            const reopened = await tx.settlementPayoutRequest.count({
              where: {
                settlementId: id,
                ...OPEN_REVIEW_REQUEST,
                reviewReason: PAYOUT_REVIEW_REASON.REOPENED_IN_PROGRESS,
              },
            });
            throw reopened > 0
              ? this.payoutReviewReopened()
              : this.payoutReviewOpen();
          }
          throw account ? this.accountChanged() : this.accountNotRegistered();
        }
        assertTransition(current.status, SETTLEMENT_STATUS.PAID);
        throw new BadRequestException(
          `현재 상태(${current.status})에서는 처리할 수 없습니다.`,
        );
      }
      return tx.settlement.findUniqueOrThrow({
        where: { id },
        select: { id: true, status: true, completedAt: true, netAmount: true },
      });
    });

    this.logger.log(
      `정산 지급 완료: settlementId=${id}, adminId=${adminId}, amount=${updated.netAmount}`,
    );
    return updated;
  }

  /**
   * 정산 현황 요약(상태별 groupBy) — ADMIN 전용, 정산 센터 대시보드 카드.
   * month 는 선택 — 생략하면 전체 기간, 지정하면 그 월(YYYY-MM)만 집계한다.
   * rejected 는 count 만 제공(금액 집계 의미 없음 — netAmount 0으로 반려됨).
   * processing(지급 요청 진행 중)·failed(지급 실패)는 approved 와 같은 "아직 지급 안 된 돈"이라 따로 집계한다.
   */
  async getSettlementsSummary(month?: string) {
    if (month !== undefined) this.assertValidMonthFormat(month);
    const monthWhere: Prisma.SettlementWhereInput = month
      ? { settlementMonth: month }
      : {};
    const [grouped, reviewCount, lastSucceeded, lastFailed] = await Promise.all(
      [
        this.prisma.settlement.groupBy({
          by: ["status"],
          where: monthWhere,
          _count: { _all: true },
          _sum: { netAmount: true },
        }),
        this.prisma.settlement.count({
          where: { ...monthWhere, ...NEEDS_REVIEW_WHERE },
        }),
        // 나이스 결과 조회 호출 기록에서 마지막 성공·실패 시각 — 배치가 언제 마지막으로 돌았는지 보여 준다.
        this.prisma.nicePayoutApiLog.findFirst({
          where: { sid: NICE_PAYOUT_RESULT_SID, outcome: "SUCCESS" },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.nicePayoutApiLog.findFirst({
          where: { sid: NICE_PAYOUT_RESULT_SID, outcome: { not: "SUCCESS" } },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
      ],
    );
    const byStatus = new Map(grouped.map((g) => [g.status, g]));
    const pick = (status: SettlementStatus) => {
      const g = byStatus.get(status);
      return {
        count: g?._count._all ?? 0,
        netAmount: g?._sum.netAmount ?? 0,
      };
    };

    return {
      // 새로 마감하는 정산에 적용되는 결제 수수료율(정책 고정값) — 화면 표시용.
      pgFeeRate: PG_FEE_RATE,
      pending: pick(SETTLEMENT_STATUS.PENDING),
      approved: pick(SETTLEMENT_STATUS.APPROVED),
      processing: pick(SETTLEMENT_STATUS.PROCESSING),
      failed: pick(SETTLEMENT_STATUS.FAILED),
      paid: pick(SETTLEMENT_STATUS.PAID),
      rejected: { count: pick(SETTLEMENT_STATUS.REJECTED).count },
      /** 운영자 확인이 필요한 지급 요청이 있는 정산 수 */
      review: { count: reviewCount },
      /** 나이스 결과 조회의 마지막 성공·실패 시각 */
      payoutCheck: {
        lastSucceededAt: lastSucceeded?.createdAt ?? null,
        lastFailedAt: lastFailed?.createdAt ?? null,
      },
    };
  }

  /**
   * 나이스 지급 엑셀에 들어갈 정산과 빠지는 정산 — 미리보기와 파일이 같은 계산을 쓴다.
   * 지급 예정(approved)·금액 양수 정산 중 계좌가 등록 완료이고 서브몰 ID 가 있는 팀만 넣는다.
   * fingerprint 는 이 결과의 지문 — 미리보기 뒤 정산·계좌가 바뀌면 값이 달라져 파일 요청이 거절된다.
   */
  private async resolvePayoutFile(month: string, payDate: string) {
    this.assertValidMonthFormat(month);
    const payDateCompact = assertNicePayDate(payDate);

    const settlements = await this.prisma.settlement.findMany({
      where: {
        settlementMonth: month,
        status: SETTLEMENT_STATUS.APPROVED,
        netAmount: { gt: 0 },
      },
      select: {
        id: true,
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
                updatedAt: true,
                registrationStartedAt: true,
              },
            },
          },
        },
      },
      orderBy: [{ team: { name: "asc" } }, { id: "asc" }],
    });

    const included: {
      settlementId: string;
      teamId: string;
      teamName: string;
      subMallId: string;
      netAmount: number;
    }[] = [];
    const excluded: {
      settlementId: string;
      teamId: string;
      teamName: string;
      netAmount: number;
      reasonCode: PayoutFileExclusion;
      reason: string;
    }[] = [];
    const marks: unknown[] = [];

    for (const s of settlements) {
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
      const base = {
        settlementId: s.id,
        teamId: s.team.id,
        teamName: s.team.name ?? "",
        netAmount: s.netAmount,
      };
      if (classified.exclusion !== null || !account) {
        const reasonCode = classified.exclusion ?? "ACCOUNT_NONE";
        excluded.push({
          ...base,
          reasonCode,
          reason: PAYOUT_FILE_EXCLUSION_REASON[reasonCode],
        });
        marks.push([s.id, reasonCode]);
        continue;
      }
      included.push({ ...base, subMallId: classified.subMallId });
      marks.push([
        s.id,
        s.netAmount,
        s.updatedAt.toISOString(),
        classified.subMallId,
        account.updatedAt.toISOString(),
      ]);
    }

    const fingerprint = createHash("sha256")
      .update(JSON.stringify([month, payDateCompact, marks]))
      .digest("hex");
    return { payDateCompact, included, excluded, fingerprint };
  }

  /** 나이스 지급 엑셀 미리보기(ADMIN) — 계좌번호·사업자번호는 싣지 않는다. */
  async getPayoutFilePreview(month: string, payDate: string) {
    const { included, excluded, fingerprint } = await this.resolvePayoutFile(
      month,
      payDate,
    );
    const paid = await this.prisma.settlement.aggregate({
      where: { settlementMonth: month, status: SETTLEMENT_STATUS.PAID },
      _count: { _all: true },
      _sum: { netAmount: true },
    });
    const total = (rows: { netAmount: number }[]) =>
      rows.reduce((sum, row) => sum + row.netAmount, 0);

    return {
      month,
      payDate,
      included,
      excluded,
      includedCount: included.length,
      includedTotal: total(included),
      excludedCount: excluded.length,
      excludedTotal: total(excluded),
      paidThisMonth: {
        count: paid._count._all,
        netAmount: paid._sum.netAmount ?? 0,
      },
      fingerprint,
    };
  }

  /**
   * 나이스 관리자 "지급내역 등록 > 다량등록"에 그대로 올리는 xlsx(ADMIN) — 서브ID·지급일·지급액.
   * 운영자가 미리보기에서 본 내용과 지금 내용이 다르면(fingerprint 불일치) 만들지 않는다.
   */
  async getPayoutFile(
    month: string,
    payDate: string,
    fingerprint: string,
    adminId: string,
  ): Promise<{ buffer: Buffer; payDateCompact: string }> {
    const resolved = await this.resolvePayoutFile(month, payDate);
    if (resolved.fingerprint !== fingerprint) {
      throw new ConflictException({
        message:
          "미리보기 이후 정산 또는 계좌 정보가 바뀌었습니다. 내용을 다시 확인해주세요.",
        errorCode: "PAYOUT_FILE_CHANGED",
      });
    }
    if (resolved.included.length === 0) {
      throw new ConflictException({
        message: "지급 엑셀에 넣을 정산이 없습니다.",
        errorCode: "PAYOUT_FILE_EMPTY",
      });
    }

    const total = resolved.included.reduce((sum, r) => sum + r.netAmount, 0);
    this.logger.log(
      `나이스 지급 엑셀 생성: month=${month}, payDate=${resolved.payDateCompact}, count=${resolved.included.length}, total=${total}, adminId=${adminId}`,
    );
    return {
      buffer: buildNiceXlsx(
        ["서브ID", "지급일", "지급액"],
        resolved.included.map((r) => [
          r.subMallId,
          Number(resolved.payDateCompact),
          r.netAmount,
        ]),
      ),
      payDateCompact: resolved.payDateCompact,
    };
  }

  /**
   * `YYYY-MM-DD` 달력일 구간을 KST 하루 경계의 UTC instant 범위로 바꾼다
   * (createdAt 은 절대 시점 컬럼이라 date-only 를 그대로 비교하면 KST 기준 9시간이 어긋난다).
   * 시작일 KST 00:00 = UTC 자정 − 9h, 종료일 다음날 KST 00:00 = UTC 자정 + 15h (exclusive).
   */
  private kstDateOnlyRange(
    startDate?: string,
    endDate?: string,
  ): Prisma.DateTimeFilter | undefined {
    if (!startDate && !endDate) return undefined;
    const filter: Prisma.DateTimeFilter = {};
    const hour = 60 * 60 * 1000;
    if (startDate) {
      filter.gte = new Date(dateOnlyToUtc(startDate).getTime() - 9 * hour);
    }
    if (endDate) {
      filter.lt = new Date(dateOnlyToUtc(endDate).getTime() + 15 * hour);
    }
    return filter;
  }

  /** approve/reject/payout 이 advisory lock 획득에 필요한 teamId 를 조회(없으면 404). */
  private async resolveTeamId(id: string): Promise<string> {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
      select: { teamId: true },
    });
    if (!settlement) {
      throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
    }
    return settlement.teamId;
  }

  /**
   * approve/reject/payout 공용 상태 전이 헬퍼.
   *  ⓪ tx 선두에서 팀 단위 advisory lock 획득(settlement-locks.util) — 마감 생성기
   *     (SettlementCloseService)의 재마감과 같은 lock 을 공유해 직렬화한다. 재마감이
   *     기존 정산을 조건 없이 덮어쓰는 사이에 이 승인/반려/지급이 끼어들어 조용히
   *     되돌려지는 경쟁을 막는다.
   *  ① updateMany(where: {id, status: expectedFrom, ...guard.where}) — 조건부 원자적 갱신(동시성 방어)
   *  ② count===0 이면 같은 tx 에서 현재 상태(+netAmount) 재조회
   *     → 없으면 404, 상태는 맞는데 guard 조건만 걸렸으면 guard.message 로 400,
   *       그 외엔 assertTransition 으로 상태 전이 오류 400
   *  ③ 성공 시(count===1)에만 onSuccess 후속 기록(SettlementTransaction 등) 실행
   */
  private async transition<S extends Prisma.SettlementSelect>(
    id: string,
    teamId: string,
    expectedFrom: SettlementStatus,
    to: SettlementStatus,
    // updateMany 는 관계 필드(connect 등)를 지원하지 않아 scalar FK(managerId)를 직접 받는
    // UncheckedUpdateManyInput 을 쓴다 — SettlementUpdateInput(관계 전용 manager.connect) 와는 다르다.
    data: Prisma.SettlementUncheckedUpdateManyInput,
    select: S,
    onSuccess?: (
      tx: Prisma.TransactionClient,
      settlement: Prisma.SettlementGetPayload<{ select: S }>,
    ) => Promise<void>,
    // 상태 전이 외에 추가로 만족해야 하는 조건(예: 순지급액 음수 승인/지급 차단, 지급 계좌 일치).
    //   상태 전이 오류와 구분해 안내한다 — onFail 이 있으면 그 예외, 없으면 message 로 400.
    guard?: {
      where: Prisma.SettlementWhereInput;
      message?: string;
      onFail?: (current: { status: string; netAmount: number }) => Error;
    },
  ): Promise<Prisma.SettlementGetPayload<{ select: S }>> {
    return this.prisma.$transaction(async (tx) => {
      await acquireSettlementCloseLock(tx, teamId);

      const result = await tx.settlement.updateMany({
        where: { id, status: expectedFrom, ...(guard?.where ?? {}) },
        data,
      });

      if (result.count === 0) {
        const current = await tx.settlement.findUnique({
          where: { id },
          select: { status: true, netAmount: true },
        });
        if (!current) {
          throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
        }
        if (guard && current.status === expectedFrom) {
          // 상태 전이 자체는 유효한데 guard 조건(순지급액 음수·계좌 변경 등)만 막은 경우.
          throw guard.onFail
            ? guard.onFail(current)
            : new BadRequestException(guard.message);
        }
        assertTransition(current.status, to);
        // assertTransition 이 통과하는 이론상 케이스(예: processing→paid)는 Phase 1 서비스가
        // processing 상태를 생성하지 않아 실제로는 도달하지 않는다 — 방어적 fallback.
        throw new BadRequestException(
          `현재 상태(${current.status})에서는 처리할 수 없습니다.`,
        );
      }

      const updated = (await tx.settlement.findUniqueOrThrow({
        where: { id },
        select,
      })) as Prisma.SettlementGetPayload<{ select: S }>;

      if (onSuccess) {
        await onSuccess(tx, updated);
      }

      return updated;
    });
  }

  private accountNotRegistered() {
    return new ConflictException({
      message:
        "팀 정산 계좌가 나이스 등록 완료 상태가 아닙니다. 지급 계좌 탭에서 확인해주세요.",
      errorCode: "SETTLEMENT_ACCOUNT_NOT_REGISTERED",
    });
  }

  private accountChanged() {
    return new ConflictException({
      message:
        "지급 처리 중 팀 정산 계좌가 변경되었습니다. 계좌를 다시 확인한 뒤 지급해주세요.",
      errorCode: "SETTLEMENT_ACCOUNT_CHANGED",
    });
  }

  private payoutReviewOpen() {
    return new ConflictException({
      message:
        "이 정산에 확인이 필요한 지급 건이 있습니다. 지급 요청 이력에서 확인 완료 처리한 뒤 지급해주세요.",
      errorCode: "PAYOUT_REVIEW_OPEN",
    });
  }

  private payoutReviewReopened() {
    return new ConflictException({
      message:
        "이 정산의 실패한 지급 건이 나이스에서 다시 진행 중입니다. 나이스에서 실패·삭제로 바뀌기 전까지는 지급할 수 없습니다. 나이스 화면에서 처리해주세요.",
      errorCode: "PAYOUT_REVIEW_REOPENED",
    });
  }

  private payoutReopenUnverified() {
    return new ConflictException({
      message:
        "실패한 지급 건의 나이스 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
      errorCode: "PAYOUT_REOPEN_UNVERIFIED",
    });
  }

  /** summary 등 필수 month 쿼리 파라미터 형식 검증(YYYY-MM). */
  private assertValidMonthFormat(month: string | undefined): void {
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException(
        "month 는 YYYY-MM 형식으로 필수 입력해야 합니다.",
      );
    }
  }
}
