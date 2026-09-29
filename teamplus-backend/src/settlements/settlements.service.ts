import {
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
import { PrismaService } from "@/prisma/prisma.service";
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
import {
  decryptOrRaw,
  formatBusinessNumber,
  maskBankAccount,
} from "./utils/account-mask.util";
import { TeamSettlementAccountService } from "./team-settlement-account.service";

/** LIKE 패턴 리터럴화 — 이스케이프 문자 `\` 기준으로 `\`·`%`·`_` 앞에 `\` 를 붙인다. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  REGISTERED: "등록완료",
  SUBMITTED: "등록확인중",
  NONE: "미등록",
};

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
  _count: { select: { details: true } },
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
} satisfies Prisma.SettlementSelect;

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resourceAccess: ResourceAccessService,
    private readonly accountService: TeamSettlementAccountService,
  ) {}

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
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = query;

    const where: Prisma.SettlementWhereInput = {};

    // 관리자급은 전체 팀이 범위라 IN 목록을 만들지 않고 teamId 지정 시에만 필터한다.
    if (isAdminRole(requester.userType)) {
      if (teamId) where.teamId = teamId;
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

    return {
      // 계좌 상태는 team 객체에 섞지 않고 행 최상위에 둔다(team 응답은 {id, name} 계약 유지).
      data: settlements.map(({ team, ...row }) => {
        const { settlementAccount, ...teamInfo } = team;
        return {
          ...row,
          team: teamInfo,
          accountStatus: settlementAccount?.status ?? null,
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
    // COACH 는 은행 정보 열람 대상이 아니다 — 감독(DIRECTOR)은 마스킹 표시.
    if (requester.userType === "COACH") {
      return {
        ...settlement,
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
      ...settlement,
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
        message:
          "순지급액이 음수인 정산은 승인할 수 없습니다. 다음 달 정산에서 처리하세요.",
      },
    );

    this.logger.log(
      `정산 승인: settlementId=${id}, adminId=${adminId}${note ? `, note=${note}` : ""}`,
    );
    return updated;
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
   * 정산 지급 — approved → paid. 팀 정산 계좌가 나이스 등록 완료(REGISTERED)여야 하며,
   * 그 계좌를 정산 행에 스냅샷으로 남긴다. 성공 시에만 SettlementTransaction(payout) 기록 + Detail 상태 동기화.
   * 순지급액 0원은 보낼 돈이 없어 계좌 없이 완료 처리한다. approved 가 아니면 계좌보다 상태 오류를 먼저 안내한다.
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

    const account =
      target.status === SETTLEMENT_STATUS.APPROVED && target.netAmount > 0
        ? await this.accountService.getPayoutAccount(teamId)
        : null;
    if (
      target.status === SETTLEMENT_STATUS.APPROVED &&
      target.netAmount > 0 &&
      account?.status !== "REGISTERED"
    ) {
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

    const updated = await this.transition(
      id,
      teamId,
      SETTLEMENT_STATUS.APPROVED,
      SETTLEMENT_STATUS.PAID,
      {
        status: SETTLEMENT_STATUS.PAID,
        completedAt: new Date(),
        ...(account
          ? {
              bankName: account.bankName,
              bankAccount: account.bankAccount,
              accountHolder: account.accountHolder,
            }
          : {}),
      },
      { id: true, status: true, completedAt: true, netAmount: true },
      async (tx, settlement) => {
        await tx.settlementDetail.updateMany({
          where: { settlementId: id },
          data: { status: SettlementDetailStatus.PAID },
        });
        await tx.settlementTransaction.create({
          data: {
            settlementId: id,
            transactionType: "payout",
            amount: settlement.netAmount,
            description: note ?? "정산 지급 완료",
            // @db.Date — KST 달력일. completedAt(instant)의 UTC 날짜부를 쓰면 KST 심야(00~09시) 완료 건이 전일로 기록됨.
            transactionDate: kstTodayUtcMidnight(),
          },
        });
      },
      {
        // 미리 읽은 계좌가 그대로일 때만 지급한다 — 그 사이 감독이 계좌를 고쳤거나 운영자가
        //   등록을 해제·초기화했다면 스냅샷이 틀어지므로 막는다(팀 lock 안의 단일 updateMany 로 판정).
        //   계좌 없이 진행하는 경로(0원·비approved)는 금액이 0원 이하로 유지될 때만 통과한다.
        where: account
          ? {
              netAmount: { gt: 0 },
              team: {
                settlementAccount: {
                  is: { status: "REGISTERED", updatedAt: account.updatedAt },
                },
              },
            }
          : { netAmount: 0 },
        onFail: (current) => {
          if (current.netAmount < 0) {
            return new BadRequestException(
              "순지급액이 음수인 정산은 지급할 수 없습니다. 다음 달 정산에서 처리하세요.",
            );
          }
          return account ? this.accountChanged() : this.accountNotRegistered();
        },
      },
    );

    this.logger.log(
      `정산 지급 완료: settlementId=${id}, adminId=${adminId}, amount=${updated.netAmount}`,
    );
    return updated;
  }

  /**
   * 정산 현황 요약(상태별 groupBy) — ADMIN 전용, 정산 센터 대시보드 카드.
   * month 는 선택 — 생략하면 전체 기간, 지정하면 그 월(YYYY-MM)만 집계한다.
   * rejected 는 count 만 제공(금액 집계 의미 없음 — netAmount 0으로 반려됨).
   */
  async getSettlementsSummary(month?: string) {
    if (month !== undefined) this.assertValidMonthFormat(month);
    const grouped = await this.prisma.settlement.groupBy({
      by: ["status"],
      where: month ? { settlementMonth: month } : {},
      _count: { _all: true },
      _sum: { netAmount: true },
    });
    const byStatus = new Map(grouped.map((g) => [g.status, g]));
    const pick = (status: SettlementStatus) => {
      const g = byStatus.get(status);
      return { count: g?._count._all ?? 0, netAmount: g?._sum.netAmount ?? 0 };
    };

    return {
      pending: pick(SETTLEMENT_STATUS.PENDING),
      approved: pick(SETTLEMENT_STATUS.APPROVED),
      paid: pick(SETTLEMENT_STATUS.PAID),
      rejected: { count: pick(SETTLEMENT_STATUS.REJECTED).count },
    };
  }

  /**
   * 지급 대상 CSV(ADMIN 전용) — approved·순지급액 양수 정산만. 운영자가 나이스 관리자에서 수동 지급할 때 쓴다.
   * 계좌는 현재 팀 정산 계좌(복호화 평문)에서 읽고, 미등록·확인 전 팀도 빈칸과 상태로 포함해 누락을 드러낸다.
   * 수식 주입 방지 등 이스케이프는 toCsvBuffer(csv.util) 공용 처리.
   */
  async getPayoutExport(month: string): Promise<Buffer> {
    this.assertValidMonthFormat(month);
    const [settlements, bankNames] = await Promise.all([
      this.prisma.settlement.findMany({
        where: {
          settlementMonth: month,
          status: SETTLEMENT_STATUS.APPROVED,
          netAmount: { gt: 0 }, // 음수·0원 행은 지급 대상이 아니다.
        },
        select: {
          netAmount: true,
          team: {
            select: {
              name: true,
              teamCode: true,
              settlementAccount: {
                select: {
                  status: true,
                  businessNumber: true,
                  bankCode: true,
                  bankAccount: true,
                  accountHolder: true,
                },
              },
            },
          },
        },
        orderBy: { team: { name: "asc" } },
      }),
      this.accountService.loadBankNames(),
    ]);

    const headers = [
      "팀명",
      "팀코드",
      "정산월",
      "사업자등록번호",
      "은행코드",
      "은행명",
      "계좌번호",
      "예금주",
      "순지급액",
      "계좌상태",
    ];

    const rows = settlements.map((s) => {
      const account = s.team.settlementAccount;
      return [
        s.team.name ?? "",
        s.team.teamCode ?? "",
        month,
        formatBusinessNumber(decryptOrRaw(account?.businessNumber)) ?? "",
        account?.bankCode ?? "",
        account ? (bankNames.get(account.bankCode) ?? account.bankCode) : "",
        decryptOrRaw(account?.bankAccount) ?? "",
        account?.accountHolder ?? "",
        String(s.netAmount ?? 0),
        ACCOUNT_STATUS_LABEL[account?.status ?? "NONE"],
      ];
    });

    return toCsvBuffer(headers, rows);
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

  /** summary/payout-export 의 필수 month 쿼리 파라미터 형식 검증(YYYY-MM). */
  private assertValidMonthFormat(month: string | undefined): void {
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException(
        "month 는 YYYY-MM 형식으로 필수 입력해야 합니다.",
      );
    }
  }
}
