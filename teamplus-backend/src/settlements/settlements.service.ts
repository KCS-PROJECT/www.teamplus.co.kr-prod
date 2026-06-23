import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { QuerySettlementDto } from "./dto/query-settlement.dto";
import { Prisma } from "@prisma/client";

/**
 * 정산 조회 요청자 컨텍스트 (클럽 스코프 검증용).
 */
export interface SettlementActor {
  id: string;
  userType?: string;
}

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 전체 정산 목록 조회 (ADMIN, DIRECTOR)
   * - 기간 필터, 상태 필터, 페이징 지원
   */
  async getSettlements(query: QuerySettlementDto) {
    const { startDate, endDate, status, page = 1, pageSize = 20 } = query;

    const where: Prisma.SettlementWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
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
            },
          },
          _count: {
            select: { details: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return {
      data: settlements,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 코치 자신 소속 클럽의 정산 목록 조회
   * - ClubMember 테이블에서 코치가 소속된 clubId를 추출하여 필터
   */
  async getMySettlements(coachId: string, query: QuerySettlementDto) {
    const { startDate, endDate, status, page = 1, pageSize = 20 } = query;

    // 코치가 소속된 클럽 ID 목록
    const clubMembers = await this.prisma.teamMember.findMany({
      where: {
        userId: coachId,
        approvalStatus: "approved",
      },
      select: { teamId: true },
    });

    const clubIds = clubMembers.map((m) => m.teamId);

    if (clubIds.length === 0) {
      return {
        data: [],
        meta: { total: 0, page, pageSize, totalPages: 0 },
      };
    }

    const where: Prisma.SettlementWhereInput = {
      teamId: { in: clubIds },
    };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
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
          scheduledAt: true,
          completedAt: true,
          managerApprovalStatus: true,
          createdAt: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: { details: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return {
      data: settlements,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 정산 상세 조회
   * - SettlementDetail include, manager 정보 포함
   */
  async getSettlementById(id: string, requester?: SettlementActor) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
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
        managerId: true,
        managerApprovalStatus: true,
        managerApprovalAt: true,
        createdAt: true,
        updatedAt: true,
        details: true,
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!settlement) {
      throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
    }

    // [2026-06-10 SECURITY] 클럽 스코프 검증 — 코치는 소속 클럽 정산만 조회 가능.
    //   기존: id 만으로 조회 → 타 클럽 코치가 임의 정산의 계좌번호·매출·순지급액 열람 가능(IDOR).
    await this.assertCanViewSettlementTeam(requester, settlement.teamId);

    return settlement;
  }

  /**
   * [2026-06-10 SECURITY] 정산 조회 클럽 스코프 검증.
   *   ADMIN/SYSTEM/OPER/DIRECTOR/ACADEMY_DIRECTOR → 통과. COACH → 해당 팀의 owner/승인 멤버만.
   */
  private async assertCanViewSettlementTeam(
    requester: SettlementActor | undefined,
    teamId: string | null | undefined,
  ): Promise<void> {
    const userType = requester?.userType;
    if (
      isAdminRole(userType) ||
      userType === "DIRECTOR" ||
      userType === "ACADEMY_DIRECTOR"
    ) {
      return;
    }
    if (!requester?.id || !teamId) {
      throw new ForbiddenException("정산 정보를 조회할 권한이 없습니다.");
    }
    const [teamOwner, approvedMember] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, coachId: requester.id },
        select: { id: true },
      }),
      this.prisma.teamMember.findFirst({
        where: {
          userId: requester.id,
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: { id: true },
      }),
    ]);
    if (!teamOwner && !approvedMember) {
      throw new ForbiddenException(
        "소속 클럽의 정산만 조회할 수 있습니다.",
      );
    }
  }

  /**
   * 정산 거래 상세 내역 (SettlementDetail 페이징)
   */
  async getSettlementDetails(
    settlementId: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    // 정산 존재 확인
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: { id: true },
    });

    if (!settlement) {
      throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
    }

    const [details, total] = await Promise.all([
      this.prisma.settlementDetail.findMany({
        where: { settlementId },
        select: {
          id: true,
          settlementId: true,
          paymentId: true,
          orderNumber: true,
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
        },
        orderBy: { paymentDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.settlementDetail.count({ where: { settlementId } }),
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

  /**
   * 감독 승인 — $transaction으로 상태 + 타임스탬프 원자적 업데이트
   */
  async approveSettlement(id: string, managerId: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
      select: { id: true, managerApprovalStatus: true, status: true },
    });

    if (!settlement) {
      throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
    }

    if (settlement.managerApprovalStatus === "APPROVED") {
      throw new BadRequestException("이미 승인된 정산입니다.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.settlement.update({
        where: { id },
        data: {
          managerId,
          managerApprovalStatus: "APPROVED",
          managerApprovalAt: new Date(),
        },
        select: {
          id: true,
          managerApprovalStatus: true,
          managerApprovalAt: true,
          managerId: true,
        },
      });
    });

    this.logger.log(
      `정산 승인 완료: settlementId=${id}, managerId=${managerId}`,
    );

    return updated;
  }

  /**
   * 관리자 승인 — Settlement.status: pending → approved
   * ADMIN 또는 DIRECTOR가 재정 검토 후 지급 승인
   */
  async adminApproveSettlement(id: string, adminId: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!settlement) {
      throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
    }

    if (settlement.status !== "pending") {
      throw new BadRequestException(
        "승인 대기(pending) 상태인 정산만 승인할 수 있습니다.",
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.settlement.update({
        where: { id },
        data: {
          status: "approved",
          managerId: adminId,
          managerApprovalStatus: "APPROVED",
          managerApprovalAt: new Date(),
        },
        select: {
          id: true,
          status: true,
          managerApprovalStatus: true,
          managerApprovalAt: true,
          managerId: true,
        },
      });
    });

    this.logger.log(`관리자 정산 승인: settlementId=${id}, adminId=${adminId}`);

    return updated;
  }

  /**
   * 정산 지급 실행 — Settlement.status: approved → paid
   * $transaction 내에서 Settlement 상태 갱신 + SettlementTransaction 기록
   */
  async payoutSettlement(id: string, adminId: string, note?: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
      select: { id: true, status: true, netAmount: true },
    });

    if (!settlement) {
      throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
    }

    if (settlement.status !== "approved") {
      throw new BadRequestException(
        "승인(approved) 상태인 정산만 지급할 수 있습니다.",
      );
    }

    const completedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedSettlement = await tx.settlement.update({
        where: { id },
        data: {
          status: "paid",
          completedAt,
        },
        select: {
          id: true,
          status: true,
          completedAt: true,
          netAmount: true,
        },
      });

      await tx.settlementTransaction.create({
        data: {
          settlementId: id,
          transactionType: "payout",
          amount: settlement.netAmount,
          description: note ?? "정산 지급 완료",
          transactionDate: completedAt,
        },
      });

      return updatedSettlement;
    });

    this.logger.log(
      `정산 지급 완료: settlementId=${id}, adminId=${adminId}, amount=${settlement.netAmount}`,
    );

    return updated;
  }

  /**
   * 감독 거절 — $transaction으로 상태 + 타임스탬프 원자적 업데이트
   * 참고: Settlement 모델에 rejectionReason 필드 없음 — 사유는 로그로 기록
   */
  async rejectSettlement(id: string, managerId: string, reason?: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
      select: { id: true, managerApprovalStatus: true, status: true },
    });

    if (!settlement) {
      throw new NotFoundException("정산 정보를 찾을 수 없습니다.");
    }

    if (settlement.managerApprovalStatus === "REJECTED") {
      throw new BadRequestException("이미 반려된 정산입니다.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.settlement.update({
        where: { id },
        data: {
          managerId,
          managerApprovalStatus: "REJECTED",
          managerApprovalAt: new Date(),
        },
        select: {
          id: true,
          managerApprovalStatus: true,
          managerApprovalAt: true,
          managerId: true,
        },
      });
    });

    this.logger.warn(
      `정산 반려: settlementId=${id}, managerId=${managerId}, reason=${reason ?? "(미입력)"}`,
    );

    return { ...updated, reason: reason ?? null };
  }
}
