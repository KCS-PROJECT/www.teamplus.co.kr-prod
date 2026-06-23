import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { CreditDomainService } from "./credit-domain.service";
import { AdjustCreditDto } from "./dto/adjust-credit.dto";

/**
 * 크레딧 발급/조정 요청자 컨텍스트 (클럽 스코프 검증용).
 */
export interface CreditActor {
  id: string;
  userType?: string;
}

export interface CreateCreditDto {
  userId: string;
  classId: string;
  totalSessions: number;
}

export interface UpdateCreditDto {
  totalSessions?: number;
}

// PR-B (v0.5): CARRY_OVER_ENABLED_FOR_TEAM_REGULAR 상수 제거 — 이월 정책은 CreditDomainService 내부에 위치

@Injectable()
export class CreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): thin wrapper 위임
  ) {}

  /**
   * 수업권 발급 (결제 완료 또는 관리자 수동 충전).
   * 2026-04-27 (N-9): User × Class 단위로 발급. ClubMember 결합 제거.
   * 2026-05-19 (N주 패키지 정합): expiresAt = 결제일 + durationDays.
   *   - durationDays 미지정 시 28일(4주) 폴백.
   *   - ClassProduct.durationDays 가 패키지 N주 × 7일을 의미 (예: 8주 패키지 → 56).
   */
  /**
   * [2026-06-10 SECURITY] 크레딧(금전성 수업권) 발급/조정 클럽 스코프 검증.
   *   - ADMIN/SYSTEM/OPER/DIRECTOR/ACADEMY_DIRECTOR: 조직 관리자 → 통과.
   *   - COACH: 해당 수업(class)의 담당 코치이거나, 수업이 속한 팀의 owner/승인 코치인 경우에만 통과.
   *   - classId 미해결 시 코치는 스코프 검증 불가 → 차단.
   *   기존엔 검증이 전무하여 코치가 임의 회원에게 무제한 발급/조정 가능했음(CRITICAL).
   */
  private async assertCanManageCredit(
    actor: CreditActor | undefined,
    classId: string | null | undefined,
  ): Promise<void> {
    const userType = actor?.userType;
    // 조직 관리자급은 통과 (컨트롤러 @Roles 가 1차 게이트)
    if (
      isAdminRole(userType) ||
      userType === "DIRECTOR" ||
      userType === "ACADEMY_DIRECTOR"
    ) {
      return;
    }

    // COACH (그 외 역할은 컨트롤러 @Roles 에서 이미 차단됨)
    if (!actor?.id || !classId) {
      throw new ForbiddenException("크레딧을 관리할 권한이 없습니다.");
    }

    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { coachId: true, teamId: true },
    });
    if (!klass) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    let authorized = klass.coachId === actor.id;
    if (!authorized && klass.teamId) {
      const [teamOwner, approvedCoach] = await Promise.all([
        this.prisma.team.findFirst({
          where: { id: klass.teamId, coachId: actor.id },
          select: { id: true },
        }),
        this.prisma.teamMember.findFirst({
          where: {
            userId: actor.id,
            teamId: klass.teamId,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
          },
          select: { id: true },
        }),
      ]);
      authorized = !!teamOwner || !!approvedCoach;
    }

    if (!authorized) {
      throw new ForbiddenException(
        "담당 수업/소속 클럽의 회원만 크레딧을 관리할 수 있습니다.",
      );
    }
  }

  async issueCredit(
    userId: string,
    classId: string,
    totalSessions: number,
    paymentId?: string,
    durationDays: number = 28,
    actor?: CreditActor,
  ) {
    // [2026-06-10 SECURITY] 발급 권한(클럽 스코프) 검증 — 코치는 담당 수업만.
    await this.assertCanManageCredit(actor, classId);

    // 사용자 + 수업 존재 확인
    const [user, klass] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }),
      this.prisma.class.findUnique({
        where: { id: classId },
        select: { id: true },
      }),
    ]);
    if (!user) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }
    if (!klass) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // 만료일 계산: 결제일 + durationDays (N주 패키지 유효 기간).
    // 예) 8주 패키지(durationDays=56) 5/1 결제 → 6/26 만료
    //     4주 패키지(durationDays=28) 5/1 결제 → 5/29 만료
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    expiresAt.setHours(23, 59, 59, 999);

    // PR-B (v0.5): CreditDomainService.issueFromPayment 위임
    const result = await this.prisma.$transaction(async (tx) => {
      const { memberCreditId } = await this.creditDomain.issueFromPayment(tx, {
        paymentId: paymentId ?? null,
        userId,
        classId,
        sessions: totalSessions,
        expiresAt,
        sourceLabel: "수업권 발급",
      });
      return tx.memberCredit.findUniqueOrThrow({
        where: { id: memberCreditId },
      });
    });

    return {
      id: result.id,
      userId: result.userId,
      classId: result.classId,
      totalSessions: result.totalSessions,
      usedSessions: result.usedSessions,
      remainingSessions: totalSessions,
      expiresAt: result.expiresAt,
      issuedDate: result.issuedDate,
    };
  }

  /**
   * [2026-06-10 SECURITY] 회원 크레딧 조회 권한 검증 (IDOR 차단).
   *   본인 / 부모-자녀 / 조직 관리자 / 같은 클럽 코치만 타 회원 크레딧 조회 가능.
   *   기존엔 검증이 없어 임의 memberId 로 타인 잔액·거래내역·paymentId 열람 가능했음.
   */
  private async assertCanViewMember(
    requester: CreditActor | undefined,
    memberId: string,
  ): Promise<void> {
    if (!requester?.id) {
      throw new ForbiddenException("크레딧을 조회할 권한이 없습니다.");
    }
    if (requester.id === memberId) return;
    if (
      isAdminRole(requester.userType) ||
      requester.userType === "DIRECTOR" ||
      requester.userType === "ACADEMY_DIRECTOR"
    ) {
      return;
    }

    // 부모-자녀 관계
    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: requester.id, childId: memberId },
      },
      select: { id: true },
    });
    if (parentChild) return;

    // 같은 클럽 코치 (대상이 PLAYER 로 속한 팀의 owner/승인 코치)
    if (requester.userType === "COACH") {
      const memberTeam = await this.prisma.teamMember.findFirst({
        where: {
          userId: memberId,
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
        },
        select: { teamId: true },
      });
      if (memberTeam?.teamId) {
        const [owner, approvedCoach] = await Promise.all([
          this.prisma.team.findFirst({
            where: { id: memberTeam.teamId, coachId: requester.id },
            select: { id: true },
          }),
          this.prisma.teamMember.findFirst({
            where: {
              userId: requester.id,
              teamId: memberTeam.teamId,
              approvalStatus: "approved",
              leftAt: null,
              roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
            },
            select: { id: true },
          }),
        ]);
        if (owner || approvedCoach) return;
      }
    }

    throw new ForbiddenException("해당 회원의 크레딧을 조회할 권한이 없습니다.");
  }

  /**
   * 회원의 가용 크레딧 조회 (유효하고 아직 사용 가능한 크레딧)
   */
  async getAvailableCredit(userId: string, requester?: CreditActor) {
    await this.assertCanViewMember(requester, userId);
    const credit = await this.prisma.memberCredit.findFirst({
      where: {
        userId,
        expiresAt: {
          gte: new Date(),
        },
      },
      orderBy: {
        expiresAt: "asc", // 만료일이 가장 가까운 것 우선
      },
    });

    if (!credit) {
      throw new NotFoundException("해당 수업 미결제 상태입니다.");
    }

    const remainingCredits = credit.totalSessions - credit.usedSessions;

    if (remainingCredits <= 0) {
      throw new BadRequestException("해당 수업 미결제 상태입니다.");
    }

    return {
      id: credit.id,
      userId: credit.userId,
      totalSessions: credit.totalSessions,
      usedSessions: credit.usedSessions,
      remainingCredits,
      expiresAt: credit.expiresAt,
      issuedDate: credit.issuedDate,
    };
  }

  /**
   * 회원의 모든 크레딧 조회 (유효한 것만)
   */
  async getMemberCredits(userId: string, requester?: CreditActor) {
    await this.assertCanViewMember(requester, userId);
    const credits = await this.prisma.memberCredit.findMany({
      where: {
        userId,
        expiresAt: {
          gte: new Date(),
        },
      },
      orderBy: {
        expiresAt: "asc",
      },
    });

    return credits.map((credit) => ({
      id: credit.id,
      userId: credit.userId,
      totalSessions: credit.totalSessions,
      usedSessions: credit.usedSessions,
      remainingCredits: credit.totalSessions - credit.usedSessions,
      expiresAt: credit.expiresAt,
      issuedDate: credit.issuedDate,
      paymentId: credit.paymentId,
    }));
  }

  /**
   * 크레딧 사용 (출석 확인 시 호출)
   */
  async useCredit(creditId: string, amount: number = 1, scheduleId?: string) {
    const credit = await this.prisma.memberCredit.findUnique({
      where: { id: creditId },
    });

    if (!credit) {
      throw new NotFoundException("크레딧을 찾을 수 없습니다.");
    }

    if (credit.expiresAt < new Date()) {
      throw new BadRequestException("만료된 크레딧입니다.");
    }

    const remainingCredits = credit.totalSessions - credit.usedSessions;

    if (remainingCredits < amount) {
      throw new BadRequestException("해당 수업 미결제 상태입니다.");
    }

    // PR-B (v0.5): CreditDomainService.deductByCreditId 위임
    const updatedCredit = await this.prisma.$transaction(async (tx) => {
      await this.creditDomain.deductByCreditId(tx, {
        memberCreditId: creditId,
        amount,
        scheduleId,
        reason: "출석 체크인 - 크레딧 차감",
      });
      return tx.memberCredit.findUniqueOrThrow({ where: { id: creditId } });
    });

    return {
      id: updatedCredit.id,
      userId: updatedCredit.userId,
      totalSessions: updatedCredit.totalSessions,
      usedSessions: updatedCredit.usedSessions,
      remainingCredits:
        updatedCredit.totalSessions - updatedCredit.usedSessions,
      expiresAt: updatedCredit.expiresAt,
    };
  }

  /**
   * 크레딧 복원 (수업 취소 시 호출)
   */
  async restoreCredit(creditId: string, amount: number = 1, reason?: string) {
    const credit = await this.prisma.memberCredit.findUnique({
      where: { id: creditId },
    });

    if (!credit) {
      throw new NotFoundException("크레딧을 찾을 수 없습니다.");
    }

    // PR-B (v0.5): CreditDomainService.refundSessions 위임 (부분 환불 패턴)
    const sessionsToRestore = Math.min(amount, credit.usedSessions);

    const updatedCredit = await this.prisma.$transaction(async (tx) => {
      await this.creditDomain.refundSessions(tx, {
        memberCreditId: creditId,
        sessionsToRestore,
        isFullRefund: false,
        reason: reason || "수업 취소 - 크레딧 복원",
      });
      return tx.memberCredit.findUniqueOrThrow({ where: { id: creditId } });
    });

    return {
      id: updatedCredit.id,
      userId: updatedCredit.userId,
      totalSessions: updatedCredit.totalSessions,
      usedSessions: updatedCredit.usedSessions,
      remainingCredits:
        updatedCredit.totalSessions - updatedCredit.usedSessions,
      expiresAt: updatedCredit.expiresAt,
    };
  }

  /**
   * 크레딧 조회
   */
  async getCredit(creditId: string, requester?: CreditActor) {
    const credit = await this.prisma.memberCredit.findUnique({
      where: { id: creditId },
    });

    if (!credit) {
      throw new NotFoundException("크레딧을 찾을 수 없습니다.");
    }

    // [2026-06-10 SECURITY] 크레딧 소유자 기준 조회 권한 검증.
    await this.assertCanViewMember(requester, credit.userId);

    const isExpired = credit.expiresAt < new Date();

    return {
      id: credit.id,
      userId: credit.userId,
      totalSessions: credit.totalSessions,
      usedSessions: credit.usedSessions,
      remainingCredits: credit.totalSessions - credit.usedSessions,
      expiresAt: credit.expiresAt,
      issuedDate: credit.issuedDate,
      isExpired,
    };
  }

  /**
   * 만료된 크레딧 조회
   */
  async getExpiredCredits(userId: string, requester?: CreditActor) {
    await this.assertCanViewMember(requester, userId);
    const credits = await this.prisma.memberCredit.findMany({
      where: {
        userId,
        expiresAt: {
          lt: new Date(),
        },
      },
      orderBy: {
        expiresAt: "desc",
      },
    });

    return credits.map((credit) => ({
      id: credit.id,
      userId: credit.userId,
      totalSessions: credit.totalSessions,
      usedSessions: credit.usedSessions,
      remainingCredits: credit.totalSessions - credit.usedSessions,
      expiresAt: credit.expiresAt,
      issuedDate: credit.issuedDate,
    }));
  }

  /**
   * 관리자 크레딧 수동 조정 (추가/차감)
   * - 양수: 크레딧 추가 (totalSessions 증가)
   * - 음수: 크레딧 차감 (usedSessions 증가)
   */
  async adjustCredit(
    dto: AdjustCreditDto,
    adjustedById: string,
    actor?: CreditActor,
  ) {
    // PR-B (v0.5): CreditDomainService.adjustSessions 위임 (admin_add/admin_deduct type 명시)
    return this.prisma.$transaction(async (tx) => {
      const memberCredit = await tx.memberCredit.findFirst({
        where: {
          userId: dto.userId,
          expiresAt: { gte: new Date() },
        },
        orderBy: { expiresAt: "asc" },
        select: {
          id: true,
          classId: true,
          totalSessions: true,
          usedSessions: true,
        },
      });

      if (!memberCredit) {
        throw new NotFoundException("회원 크레딧 정보를 찾을 수 없습니다.");
      }

      // [2026-06-10 SECURITY] 조정 권한(클럽 스코프) 검증 — 코치는 담당 수업의 크레딧만 조정.
      await this.assertCanManageCredit(
        actor ?? { id: adjustedById },
        memberCredit.classId,
      );

      const currentBalance =
        memberCredit.totalSessions - memberCredit.usedSessions;
      const newBalance = currentBalance + dto.amount;

      if (newBalance < 0) {
        throw new BadRequestException("해당 학생은 이번 달 결제가 필요합니다.");
      }

      const { transactionId } = await this.creditDomain.adjustSessions(tx, {
        memberCreditId: memberCredit.id,
        delta: dto.amount,
        reason: dto.reason,
        adjustedBy: adjustedById,
        transactionType: dto.amount > 0 ? "admin_add" : "admin_deduct",
      });

      const updated = await tx.memberCredit.findUniqueOrThrow({
        where: { id: memberCredit.id },
        select: { totalSessions: true, usedSessions: true },
      });

      return {
        memberCreditId: memberCredit.id,
        previousBalance: currentBalance,
        adjustedAmount: dto.amount,
        balanceAfter: newBalance,
        transactionId,
        totalSessions: updated.totalSessions,
        usedSessions: updated.usedSessions,
      };
    });
  }

  // PR-B (v0.5): carryOverUnusedSessions 제거.
  //   - 호출처 0건 (credit-expiry.service.ts 가 CreditDomainService.expireRemaining 사용으로 전환)
  //   - 이월 정책은 CreditDomainService.expireRemaining 내부에서 처리

  /**
   * 회원의 크레딧 거래 내역 조회
   *
   * 학부모/관리자 모두 조회 가능.
   * 최근 N건 내림차순 반환 (기본 50건, limit 쿼리 파라미터로 조절 가능).
   */
  async getMemberCreditTransactions(
    userId: string,
    limit = 50,
    offset = 0,
    requester?: CreditActor,
  ) {
    await this.assertCanViewMember(requester, userId);
    const transactions = await this.prisma.creditTransaction.findMany({
      where: {
        memberCredit: { userId },
      },
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        reason: true,
        adjustedBy: true,
        createdAt: true,
        memberCreditId: true,
        memberCredit: {
          select: {
            classId: true,
            expiresAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
      skip: offset,
    });

    return transactions.map((t) => ({
      id: t.id,
      memberCreditId: t.memberCreditId,
      classId: t.memberCredit?.classId,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      reason: t.reason,
      adjustedBy: t.adjustedBy,
      createdAt: t.createdAt,
    }));
  }

  /**
   * 회원의 크레딧 통계
   */
  async getCreditStats(userId: string, requester?: CreditActor) {
    await this.assertCanViewMember(requester, userId);
    const allCredits = await this.prisma.memberCredit.findMany({
      where: { userId },
    });

    const availableCredits = allCredits.filter((c) => c.expiresAt > new Date());
    const expiredCredits = allCredits.filter((c) => c.expiresAt <= new Date());

    const totalIssued = allCredits.reduce((sum, c) => sum + c.totalSessions, 0);
    const totalUsed = allCredits.reduce((sum, c) => sum + c.usedSessions, 0);
    const totalRemaining = totalIssued - totalUsed;
    const availableRemaining = availableCredits.reduce(
      (sum, c) => sum + (c.totalSessions - c.usedSessions),
      0,
    );

    return {
      userId,
      totalIssued,
      totalUsed,
      totalRemaining,
      availableRemaining,
      availableCreditCount: availableCredits.length,
      expiredCreditCount: expiredCredits.length,
      allCredits: allCredits.length,
    };
  }
}
