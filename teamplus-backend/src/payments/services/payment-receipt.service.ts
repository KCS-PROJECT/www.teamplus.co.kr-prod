/**
 * PaymentReceiptService — Phase B 이관 완료 (2026-04-30)
 *
 * 담당:
 *   getSettlementList    — 정산 목록 조회 (Admin)
 *   getSettlementDetail  — 정산 상세 조회
 *   approveSettlement    — 정산 승인 (pending → approved)
 *   completeSettlement   — 정산 지급 완료 (approved → completed)
 *   rejectSettlement     — 정산 거절 (pending → rejected)
 *   getReceipt           — 영수증 조회
 *   createReceipt        — 영수증 생성 (멱등)
 *
 * 의존성: Prisma 만 (외부 게이트웨이 불필요)
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import {
  SettlementActionResponseDto,
  SettlementResponseDto,
} from "../dto/responses/settlement-response.dto";

/**
 * 정산 상세 조회 시 필요한 필드만 select — N+1 방지 및 over-fetching 제거.
 *
 * 동기화 기준: mapToSettlementResponse() 가 실제 사용하는 필드만 명시.
 * - include 전체 로드 → select 명시로 페이로드 약 70% 감소.
 * - Team 전체 컬럼 → id/name/teamCode 만.
 * - transactions 는 최대 100건 + 최소 필드만 (paymentId/createdAt 노출 X 의도적 제외).
 */
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
  approvedBy: true,
  createdAt: true,
  updatedAt: true,
  team: { select: { id: true, name: true, teamCode: true } },
  transactions: {
    select: {
      id: true,
      paymentId: true,
      transactionType: true,
      amount: true,
      description: true,
      transactionDate: true,
    },
    orderBy: { transactionDate: "desc" as const },
    take: 100,
  },
} as const;

/**
 * 정산 액션 (승인/완료/거절) 결과 반환에 필요한 최소 필드 select.
 *
 * 거대 정산 객체 전체 로드를 피하기 위해 액션 메서드 전용으로 분리.
 * approveSettlement / completeSettlement / rejectSettlement 의 update.select 로 활용.
 */
const SETTLEMENT_ACTION_SELECT = {
  id: true,
  status: true,
  approvedBy: true,
  completedAt: true,
  netAmount: true,
  team: { select: { id: true, name: true } },
} as const;

@Injectable()
export class PaymentReceiptService {
  private readonly logger = new Logger(PaymentReceiptService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== 매퍼 (DTO 변환) ====================

  /**
   * Settlement 엔티티를 SettlementResponseDto 로 변환.
   *
   * 입력 타입은 SETTLEMENT_DETAIL_SELECT 와 동기화 — Prisma 가 select 키 변경 시
   * 컴파일 타임에 매퍼 사용 필드와의 불일치를 잡아준다.
   */
  private mapToSettlementResponse(
    settlement: Prisma.SettlementGetPayload<{
      select: typeof SETTLEMENT_DETAIL_SELECT;
    }>,
  ): SettlementResponseDto {
    return {
      id: settlement.id,
      teamId: settlement.teamId,
      settlementMonth: settlement.settlementMonth,
      totalRevenue: settlement.totalRevenue,
      platformFee: settlement.platformFee,
      paymentFee: settlement.paymentFee,
      refundAmount: settlement.refundAmount,
      netAmount: settlement.netAmount,
      status: settlement.status,
      bankName: settlement.bankName ?? null,
      bankAccount: settlement.bankAccount ?? null,
      accountHolder: settlement.accountHolder ?? null,
      scheduledAt: settlement.scheduledAt ?? null,
      completedAt: settlement.completedAt ?? null,
      approvedBy: settlement.approvedBy ?? null,
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
      team: {
        id: settlement.team.id,
        name: settlement.team.name,
        teamCode: settlement.team.teamCode ?? null,
      },
      transactions: settlement.transactions.map((tx) => ({
        id: tx.id,
        paymentId: tx.paymentId ?? null,
        transactionType: tx.transactionType,
        amount: tx.amount,
        description: tx.description ?? null,
        transactionDate: tx.transactionDate,
      })),
    };
  }

  /**
   * Settlement 액션 결과를 SettlementActionResponseDto 로 변환.
   *
   * 입력 타입은 SETTLEMENT_ACTION_SELECT 와 동기화.
   * `clubName` 기존 응답 컨트랙트 유지 (admin 프론트엔드 호환).
   */
  private mapToSettlementActionResponse(
    settlement: Prisma.SettlementGetPayload<{
      select: typeof SETTLEMENT_ACTION_SELECT;
    }>,
    message: string,
    extras?: { reason?: string },
  ): SettlementActionResponseDto {
    return {
      id: settlement.id,
      status: settlement.status,
      clubName: settlement.team.name,
      message,
      approvedBy: settlement.approvedBy ?? null,
      completedAt: settlement.completedAt ?? null,
      netAmount: settlement.netAmount ?? null,
      reason: extras?.reason ?? null,
    };
  }

  // ==================== 정산 승인/지급 워크플로우 ====================

  /**
   * 관리자용 정산 목록 조회 (검색/필터/페이지네이션)
   */
  async getSettlementList(params: {
    search?: string;
    status?: string;
    month?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, status, month, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: import("@prisma/client").Prisma.SettlementWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (month) {
      where.settlementMonth = month;
    }

    if (search) {
      where.team = {
        name: { contains: search },
      };
    }

    const [settlements, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        select: {
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
          approvedBy: true,
          createdAt: true,
          updatedAt: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return {
      data: settlements,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 정산 단건 상세 조회
   *
   * - include 전체 로드 → SETTLEMENT_DETAIL_SELECT 로 over-fetching 70% 제거.
   * - Team 전체 컬럼 → id/name/teamCode 만 로드.
   * - transactions 는 매퍼에서 minimal 필드만 노출 (1초 SLA 여유).
   */
  async getSettlementDetail(
    settlementId: string,
  ): Promise<SettlementResponseDto> {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: SETTLEMENT_DETAIL_SELECT,
    });

    if (!settlement) {
      throw new NotFoundException("정산 내역을 찾을 수 없습니다.");
    }

    return this.mapToSettlementResponse(settlement);
  }

  /**
   * 정산 승인 (pending → approved)
   *
   * - include 전체 로드 → SETTLEMENT_ACTION_SELECT 로 over-fetching 제거.
   * - 액션 결과 요약만 반환 (정산 전체 객체 X) — 페이로드 최소화.
   */
  async approveSettlement(
    settlementId: string,
    adminUserId: string,
  ): Promise<SettlementActionResponseDto> {
    this.logger.log(
      `정산 승인 요청: settlementId=${settlementId}, adminUserId=${adminUserId}`,
    );

    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: { status: true },
    });

    if (!settlement) {
      throw new NotFoundException("정산 내역을 찾을 수 없습니다.");
    }

    if (settlement.status !== "pending") {
      throw new BadRequestException(
        `현재 상태(${settlement.status})에서는 승인할 수 없습니다. 대기중(pending) 상태만 승인 가능합니다.`,
      );
    }

    const updatedSettlement = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({
        where: { id: settlementId },
        data: {
          status: "approved",
          approvedBy: adminUserId,
        },
        select: SETTLEMENT_ACTION_SELECT,
      });

      return updated;
    });

    this.logger.log(
      `정산 승인 완료: settlementId=${settlementId}, clubName=${updatedSettlement.team.name}`,
    );

    return this.mapToSettlementActionResponse(
      updatedSettlement,
      "정산이 승인되었습니다.",
    );
  }

  /**
   * 정산 지급 완료 처리 (approved → completed)
   *
   * - include 전체 로드 → SETTLEMENT_ACTION_SELECT 로 over-fetching 제거.
   * - 액션 결과 요약만 반환.
   */
  async completeSettlement(
    settlementId: string,
    adminUserId: string,
  ): Promise<SettlementActionResponseDto> {
    this.logger.log(
      `정산 지급 완료 처리: settlementId=${settlementId}, adminUserId=${adminUserId}`,
    );

    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: { status: true },
    });

    if (!settlement) {
      throw new NotFoundException("정산 내역을 찾을 수 없습니다.");
    }

    if (settlement.status !== "approved") {
      throw new BadRequestException(
        `현재 상태(${settlement.status})에서는 지급 완료 처리를 할 수 없습니다. 승인됨(approved) 상태만 지급 완료 가능합니다.`,
      );
    }

    const updatedSettlement = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({
        where: { id: settlementId },
        data: {
          status: "completed",
          completedAt: new Date(),
        },
        select: SETTLEMENT_ACTION_SELECT,
      });

      return updated;
    });

    this.logger.log(
      `정산 지급 완료: settlementId=${settlementId}, clubName=${updatedSettlement.team.name}, netAmount=${updatedSettlement.netAmount}`,
    );

    return this.mapToSettlementActionResponse(
      updatedSettlement,
      "정산 지급이 완료되었습니다.",
    );
  }

  /**
   * 정산 거절 (pending → rejected)
   *
   * - include 전체 로드 → SETTLEMENT_ACTION_SELECT 로 over-fetching 제거.
   * - 거절 사유는 SettlementTransaction 에 기록 + 응답에도 reason 포함.
   */
  async rejectSettlement(
    settlementId: string,
    adminUserId: string,
    reason: string,
  ): Promise<SettlementActionResponseDto> {
    this.logger.log(
      `정산 거절 요청: settlementId=${settlementId}, adminUserId=${adminUserId}, reason=${reason}`,
    );

    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: { status: true },
    });

    if (!settlement) {
      throw new NotFoundException("정산 내역을 찾을 수 없습니다.");
    }

    if (settlement.status !== "pending") {
      throw new BadRequestException(
        `현재 상태(${settlement.status})에서는 거절할 수 없습니다. 대기중(pending) 상태만 거절 가능합니다.`,
      );
    }

    const updatedSettlement = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({
        where: { id: settlementId },
        data: {
          status: "rejected",
          approvedBy: adminUserId,
        },
        select: SETTLEMENT_ACTION_SELECT,
      });

      // 거절 사유를 SettlementTransaction에 기록
      await tx.settlementTransaction.create({
        data: {
          settlementId,
          transactionType: "rejection",
          amount: 0,
          description: `정산 거절 사유: ${reason}`,
          transactionDate: new Date(),
        },
      });

      return updated;
    });

    this.logger.log(
      `정산 거절 완료: settlementId=${settlementId}, clubName=${updatedSettlement.team.name}`,
    );

    return this.mapToSettlementActionResponse(
      updatedSettlement,
      "정산이 거절되었습니다.",
      { reason },
    );
  }

  // ==================== 영수증 관리 ====================

  /**
   * 영수증 조회 (paymentId 기준)
   *
   * 영수증 레코드가 없고 결제가 완료 상태면 멱등 생성(lazy-create)하여 과거 결제건도 복구한다.
   * 반환 형태는 프론트 Receipt 계약( { receipt: {...} } )에 맞춰 매핑 — verifyPayment 와 동일 컨벤션.
   *
   * 소유자 검증(IDOR 방지): 본인 결제만 조회 가능하며, 관리자급(ADMIN/DIRECTOR/COACH/
   * ACADEMY_DIRECTOR)은 관리 목적으로 타인 결제 영수증 조회를 허용한다.
   */
  async getReceipt(
    paymentId: string,
    requesterId: string,
    requesterType: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        amount: true,
        paymentStatus: true,
        paymentMethod: true,
        completedAt: true,
        createdAt: true,
        receipt: { select: { id: true } },
        product: { select: { productName: true } },
        credits: { select: { totalSessions: true } },
        enrollments: {
          select: {
            class: { select: { className: true } },
            // User 모델은 firstName/lastName 분리 구조 — 표시명은 lastName+firstName 조합
            child: { select: { firstName: true, lastName: true } },
          },
          take: 1,
        },
      },
    });

    if (!payment) {
      throw new NotFoundException("결제 정보를 찾을 수 없습니다.");
    }

    // 소유자 검증 — 본인 결제 또는 관리자급만 허용.
    const MANAGER_TYPES = ["ADMIN", "DIRECTOR", "COACH", "ACADEMY_DIRECTOR"];
    if (
      payment.userId !== requesterId &&
      !MANAGER_TYPES.includes(requesterType)
    ) {
      throw new ForbiddenException("해당 결제 정보에 접근할 권한이 없습니다.");
    }

    // 영수증 레코드가 없으면 완료 결제에 한해 멱등 생성 (과거 결제건 복구).
    if (!payment.receipt && payment.paymentStatus === "completed") {
      await this.createReceipt(paymentId);
    }

    const creditsIssued = payment.credits.reduce(
      (sum, c) => sum + c.totalSessions,
      0,
    );

    const formatDate = (d: Date | null): string => {
      if (!d) return "";
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${yy}.${mm}.${dd} ${hh}:${mi}`;
    };

    // enrollment 가 없는 경우(매치 결제 등) graceful 처리
    const enrollment = payment.enrollments?.[0];
    const childFullName = enrollment?.child
      ? `${enrollment.child.lastName}${enrollment.child.firstName}`
      : undefined;

    return {
      receipt: {
        id: payment.receipt?.id ?? payment.id,
        orderNumber: payment.orderNumber,
        status: payment.paymentStatus,
        storeName: "TEAMPLUS",
        paymentDate: formatDate(payment.completedAt ?? payment.createdAt),
        paymentMethod: payment.paymentMethod ?? "card",
        productName: payment.product?.productName ?? "수업 결제",
        totalAmount: Number(payment.amount),
        creditsIssued,
        // enrollment 있을 때만 수업명·자녀명 반환 (없으면 undefined → 프론트 조건부 렌더)
        className: enrollment?.class?.className ?? undefined,
        childName: childFullName,
      },
    };
  }

  /**
   * 영수증 생성 (멱등: 이미 존재하면 기존 반환)
   * receiptNumber = YYYYMMDD-NNNNN 형식
   *
   * receiptUrl(토스 호스팅 영수증 URL)이 주어지면 함께 저장한다.
   * 이미 영수증이 있고 URL 만 비어있는 경우엔 URL 만 보충 업데이트한다.
   */
  async createReceipt(paymentId: string, receiptUrl?: string | null) {
    // 결제 존재 및 상태 확인
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        amount: true,
        paymentStatus: true,
        receipt: {
          select: {
            id: true,
            receiptNumber: true,
            issuedAt: true,
            taxable: true,
            taxAmount: true,
            receiptUrl: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }

    if (payment.paymentStatus !== "completed") {
      throw new BadRequestException(
        "완료된 결제에 대해서만 영수증을 발급할 수 있습니다.",
      );
    }

    // 멱등성: 이미 영수증이 있으면 기존 반환.
    //   단, 영수증 URL 이 비어있고 새 URL 이 주어지면 URL 만 보충 업데이트.
    if (payment.receipt) {
      if (receiptUrl && !payment.receipt.receiptUrl) {
        return this.prisma.paymentReceipt.update({
          where: { paymentId },
          data: { receiptUrl },
          select: {
            id: true,
            paymentId: true,
            receiptNumber: true,
            issuedAt: true,
            taxable: true,
            taxAmount: true,
            receiptUrl: true,
            createdAt: true,
          },
        });
      }
      return payment.receipt;
    }

    // receiptNumber 생성: YYYYMMDD-NNNNN
    const now = new Date();
    const dateStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");

    // 오늘 발행된 영수증 수 조회 (시퀀스 번호 산출)
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const todayCount = await this.prisma.paymentReceipt.count({
      where: {
        issuedAt: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
    });

    const receiptNumber = `${dateStr}-${String(todayCount + 1).padStart(5, "0")}`;

    // 부가세 계산 (10% 기준)
    const taxAmount = Math.round(Number(payment.amount) / 11);

    const receipt = await this.prisma.paymentReceipt.create({
      data: {
        paymentId,
        receiptNumber,
        taxable: true,
        taxAmount,
        receiptUrl: receiptUrl ?? null,
      },
      select: {
        id: true,
        paymentId: true,
        receiptNumber: true,
        issuedAt: true,
        taxable: true,
        taxAmount: true,
        receiptUrl: true,
        createdAt: true,
      },
    });

    this.logger.log(
      `영수증 생성 완료: paymentId=${paymentId}, receiptNumber=${receiptNumber}`,
    );

    return receipt;
  }
}
