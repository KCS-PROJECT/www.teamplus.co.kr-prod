import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { UserType } from "@prisma/client";
import { calculateKoreanAgeSafe } from "@/common/utils/age.util";
import { isAdminRole } from "@/auth/constants/chldiv.constants";

@Injectable()
export class MemberApprovalsService {
  private readonly logger = new Logger(MemberApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 대기 중(pending) 회원 목록 조회
   */
  async getPending(query: {
    teamId?: string;
    page?: string;
    pageSize?: string;
  }) {
    const page = Math.max(1, parseInt(query.page || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize || "20", 10)),
    );
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { approvalStatus: "pending" };
    if (query.teamId) {
      where.teamId = query.teamId;
    }

    const [items, total] = await Promise.all([
      this.prisma.teamMember.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          playerName: true,
          playerAge: true,
          playerLevel: true,
          teamId: true,
          joinedAt: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              gender: true,
              birthDate: true,
              userType: true,
              avatarUrl: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.teamMember.count({ where }),
    ]);

    // 나이는 birthDate 에서 항상 최신값으로 계산 (User.koreanAge 캐시 신뢰 X, ClubMember.playerAge 캐시 신뢰 X)
    const itemsWithAge = items.map((m) => ({
      ...m,
      playerAge: calculateKoreanAgeSafe(m.user?.birthDate) ?? m.playerAge,
      user: m.user
        ? {
            ...m.user,
            koreanAge: calculateKoreanAgeSafe(m.user.birthDate),
          }
        : null,
    }));

    return {
      items: itemsWithAge,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 승인된(approved) 회원 목록 조회
   */
  async getApproved(query: {
    teamId?: string;
    page?: string;
    pageSize?: string;
  }) {
    return this.getByStatus("approved", query);
  }

  /**
   * 거절된(rejected) 회원 목록 조회
   */
  async getRejected(query: {
    teamId?: string;
    page?: string;
    pageSize?: string;
  }) {
    return this.getByStatus("rejected", query);
  }

  /**
   * 개별 승인
   * $transaction: ClubMember 상태 변경 + MemberApprovalLog 생성
   */
  async approve(memberId: string, actorId: string, actorRole: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        approvalStatus: true,
        playerName: true,
        teamId: true,
      },
    });

    if (!member) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }
    if (member.approvalStatus === "approved") {
      throw new ConflictException("이미 승인된 회원입니다.");
    }

    // 승인자가 해당 회원의 클럽/팀 관할인지 검증 (크로스-테넌트 차단)
    await this.assertCanManageMemberTeam(member.teamId, actorId, actorRole);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.teamMember.update({
        where: { id: memberId },
        data: { approvalStatus: "approved", rejectionReason: null },
        select: {
          id: true,
          playerName: true,
          approvalStatus: true,
          teamId: true,
        },
      });

      await tx.memberApprovalLog.create({
        data: {
          memberId,
          action: "APPROVED",
          actorId,
          actorRole: actorRole as UserType,
        },
      });

      return updated;
    });

    this.logger.log(`회원 승인: memberId=${memberId}, actor=${actorId}`);

    // 인앱 알림 발송 (비동기 — 실패해도 승인 결과에 영향 없음)
    this.sendApprovalNotification(result.id, actorId).catch((err) =>
      this.logger.warn(`승인 알림 발송 실패: ${err.message}`, err.stack),
    );

    return {
      id: result.id,
      playerName: result.playerName,
      status: result.approvalStatus,
      approvedAt: new Date().toISOString(),
    };
  }

  private async sendApprovalNotification(memberId: string, actorId: string) {
    const teamMember = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
      select: { userId: true, team: { select: { name: true } } },
    });
    if (!teamMember?.userId) return;

    // 자녀의 학부모를 찾아 알림 전송 (학부모만 대상)
    const parentChild = await this.prisma.parentChild.findFirst({
      where: { childId: teamMember.userId },
      select: { parentId: true },
    });
    if (!parentChild?.parentId) return;

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { firstName: true, lastName: true },
    });
    const coachName =
      `${actor?.lastName ?? ""}${actor?.firstName ?? ""}`.trim() || "관리자";

    const targetUserId = parentChild.parentId;

    await this.notificationsService.sendMembershipApproval({
      userId: targetUserId,
      clubName: teamMember.team?.name ?? "팀",
      coachName,
    });
  }

  /**
   * 개별 거절
   * $transaction: ClubMember 상태 변경 + rejectionReason 저장 + MemberApprovalLog 생성
   */
  async reject(
    memberId: string,
    actorId: string,
    actorRole: string,
    reason: string,
  ) {
    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
      select: { id: true, approvalStatus: true, playerName: true, teamId: true },
    });

    if (!member) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }
    if (member.approvalStatus === "rejected") {
      throw new ConflictException("이미 거절된 회원입니다.");
    }

    // 거절자가 해당 회원의 클럽/팀 관할인지 검증 (크로스-테넌트 차단)
    await this.assertCanManageMemberTeam(member.teamId, actorId, actorRole);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.teamMember.update({
        where: { id: memberId },
        data: {
          approvalStatus: "rejected",
          rejectionReason: reason,
        },
        select: {
          id: true,
          playerName: true,
          approvalStatus: true,
        },
      });

      await tx.memberApprovalLog.create({
        data: {
          memberId,
          action: "REJECTED",
          reason,
          actorId,
          actorRole: actorRole as UserType,
        },
      });

      return updated;
    });

    this.logger.log(
      `회원 거절: memberId=${memberId}, actor=${actorId}, reason=${reason}`,
    );

    return {
      id: result.id,
      playerName: result.playerName,
      status: result.approvalStatus,
      rejectedAt: new Date().toISOString(),
    };
  }

  /**
   * 학부모 자녀 재신청
   * 거절(rejected) 상태의 TeamMember 를 다시 pending 으로 전환한다.
   *  - 본인 자녀(ParentChild) 검증
   *  - 현재 status === "rejected" 만 허용
   *  - rejectionReason 초기화 + MemberApprovalLog{ action: REAPPLIED } 기록
   * 코치/감독은 수동 승인이므로 별도 cooldown/rate-limit 은 두지 않는다.
   */
  async reapply(memberId: string, parentId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        approvalStatus: true,
        userId: true,
        teamId: true,
        playerName: true,
        team: { select: { name: true } },
      },
    });

    if (!member) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }
    if (member.approvalStatus !== "rejected") {
      throw new ConflictException("거절된 자녀만 재신청할 수 있습니다.");
    }

    const link = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId, childId: member.userId },
      },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenException(
        "본인 자녀에 대해서만 재신청할 수 있습니다.",
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.teamMember.update({
        where: { id: memberId },
        data: {
          approvalStatus: "pending",
          rejectionReason: null,
        },
        select: {
          id: true,
          playerName: true,
          approvalStatus: true,
          teamId: true,
        },
      });

      await tx.memberApprovalLog.create({
        data: {
          memberId,
          action: "REAPPLIED",
          actorId: parentId,
          actorRole: "PARENT" as UserType,
        },
      });

      return updated;
    });

    this.logger.log(
      `자녀 재신청: memberId=${memberId}, parentId=${parentId}, teamId=${result.teamId}`,
    );

    // 재신청(re-pending) 시 해당 팀 감독/코치 전원에게 가입 승인 요청 알림 (fire-and-forget)
    void this.notificationsService.notifyTeamManagers(result.teamId, {
      notificationType: "membership_requested",
      title: "가입 승인 요청",
      message: `${result.playerName} 님이 ${member.team?.name ?? "해당"} 팀 가입을 재신청했습니다.`,
      linkUrl: "/approval",
    });

    return {
      id: result.id,
      playerName: result.playerName,
      status: result.approvalStatus,
      reappliedAt: new Date().toISOString(),
    };
  }

  /**
   * 일괄 승인
   * $transaction 내에서 각 회원을 순회하며 상태 변경 + 로그 생성
   */
  async bulkApprove(ids: string[], actorId: string, actorRole: string) {
    const members = await this.validateBulkMembers(ids, "pending");

    // 모든 대상 회원이 actor 관할 클럽/팀인지 검증 (크로스-테넌트 차단)
    await this.assertCanManageMembers(members, actorId, actorRole);

    const results = await this.prisma.$transaction(async (tx) => {
      const approved: Array<{ id: string; playerName: string }> = [];

      for (const id of ids) {
        const updated = await tx.teamMember.update({
          where: { id },
          data: { approvalStatus: "approved", rejectionReason: null },
          select: { id: true, playerName: true },
        });

        await tx.memberApprovalLog.create({
          data: {
            memberId: id,
            action: "APPROVED",
            actorId,
            actorRole: actorRole as UserType,
          },
        });

        approved.push(updated);
      }

      return approved;
    });

    this.logger.log(`일괄 승인: count=${ids.length}, actor=${actorId}`);

    // 인앱 알림 발송 (비동기 — 단건 승인과 동일, 실패해도 승인 결과에 영향 없음)
    for (const m of results) {
      this.sendApprovalNotification(m.id, actorId).catch((err) =>
        this.logger.warn(`승인 알림 발송 실패: ${err.message}`, err.stack),
      );
    }

    return {
      approvedCount: results.length,
      approvedMembers: results.map((m) => ({
        id: m.id,
        playerName: m.playerName,
        status: "approved",
      })),
    };
  }

  /**
   * 일괄 거절
   * $transaction 내에서 각 회원을 순회하며 상태 변경 + 로그 생성
   */
  async bulkReject(
    ids: string[],
    actorId: string,
    actorRole: string,
    reason: string,
  ) {
    const members = await this.validateBulkMembers(ids, "pending");

    // 모든 대상 회원이 actor 관할 클럽/팀인지 검증 (크로스-테넌트 차단)
    await this.assertCanManageMembers(members, actorId, actorRole);

    const results = await this.prisma.$transaction(async (tx) => {
      const rejected: Array<{ id: string; playerName: string }> = [];

      for (const id of ids) {
        const updated = await tx.teamMember.update({
          where: { id },
          data: {
            approvalStatus: "rejected",
            rejectionReason: reason,
          },
          select: { id: true, playerName: true },
        });

        await tx.memberApprovalLog.create({
          data: {
            memberId: id,
            action: "REJECTED",
            reason,
            actorId,
            actorRole: actorRole as UserType,
          },
        });

        rejected.push(updated);
      }

      return rejected;
    });

    this.logger.log(
      `일괄 거절: count=${ids.length}, actor=${actorId}, reason=${reason}`,
    );

    return {
      rejectedCount: results.length,
      rejectedMembers: results.map((m) => ({
        id: m.id,
        playerName: m.playerName,
        status: "rejected",
      })),
    };
  }

  /**
   * 승인 이력 로그 조회
   */
  async getLogs(query: {
    memberId?: string;
    teamId?: string;
    page?: string;
    pageSize?: string;
  }) {
    const page = Math.max(1, parseInt(query.page || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize || "20", 10)),
    );
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.memberId) {
      where.memberId = query.memberId;
    }
    if (query.teamId) {
      where.member = { teamId: query.teamId };
    }

    const [items, total] = await Promise.all([
      this.prisma.memberApprovalLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          memberId: true,
          action: true,
          reason: true,
          actorId: true,
          actorRole: true,
          createdAt: true,
          member: {
            select: {
              id: true,
              playerName: true,
              teamId: true,
              team: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          actor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              userType: true,
            },
          },
        },
      }),
      this.prisma.memberApprovalLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ───────────────────── private helpers ─────────────────────

  /**
   * [2026-06-12 SECURITY] 승인/거절 클럽 스코프 검증 (크로스-테넌트 차단).
   *   ADMIN/SYSTEM/OPER → 전역 허용. DIRECTOR/ACADEMY_DIRECTOR → 통과.
   *   COACH → 해당 teamId 의 owner 또는 승인된 코치/매니저일 때만 허용.
   *   기존엔 검증이 없어 임의 클럽 코치가 타 클럽 대기 회원을 승인/거절할 수 있었음.
   */
  private async assertCanManageMemberTeam(
    teamId: string,
    actorId: string,
    actorRole: string,
  ): Promise<void> {
    if (
      isAdminRole(actorRole) ||
      actorRole === "DIRECTOR" ||
      actorRole === "ACADEMY_DIRECTOR"
    ) {
      return;
    }

    const [teamOwner, approvedCoach] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, coachId: actorId },
        select: { id: true },
      }),
      this.prisma.teamMember.findFirst({
        where: {
          userId: actorId,
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: { id: true },
      }),
    ]);

    if (!teamOwner && !approvedCoach) {
      throw new ForbiddenException(
        "소속 클럽의 회원만 승인/거절할 수 있습니다.",
      );
    }
  }

  /**
   * 상태별 회원 목록 조회 (approved / rejected 공통)
   */
  private async getByStatus(
    status: string,
    query: { teamId?: string; page?: string; pageSize?: string },
  ) {
    const page = Math.max(1, parseInt(query.page || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize || "20", 10)),
    );
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { approvalStatus: status };
    if (query.teamId) {
      where.teamId = query.teamId;
    }

    const [items, total] = await Promise.all([
      this.prisma.teamMember.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          playerName: true,
          playerAge: true,
          playerLevel: true,
          approvalStatus: true,
          rejectionReason: true,
          teamId: true,
          joinedAt: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              gender: true,
              birthDate: true,
              userType: true,
              avatarUrl: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.teamMember.count({ where }),
    ]);

    // 나이는 birthDate 에서 항상 최신값으로 계산 (캐시 컬럼 신뢰 X)
    const itemsWithAge = items.map((m) => ({
      ...m,
      playerAge: calculateKoreanAgeSafe(m.user?.birthDate) ?? m.playerAge,
      user: m.user
        ? {
            ...m.user,
            koreanAge: calculateKoreanAgeSafe(m.user.birthDate),
          }
        : null,
    }));

    return {
      items: itemsWithAge,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 일괄 작업 대상 회원 유효성 검증
   * - 모든 ID가 존재하는지
   * - 모든 ID가 expectedStatus 상태인지
   */
  private async validateBulkMembers(ids: string[], expectedStatus: string) {
    const members = await this.prisma.teamMember.findMany({
      where: { id: { in: ids } },
      select: { id: true, approvalStatus: true, teamId: true },
    });

    if (members.length !== ids.length) {
      const foundIds = new Set(members.map((m) => m.id));
      const missingIds = ids.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `다음 회원을 찾을 수 없습니다: ${missingIds.join(", ")}`,
      );
    }

    const wrongStatus = members.filter(
      (m) => m.approvalStatus !== expectedStatus,
    );
    if (wrongStatus.length > 0) {
      throw new BadRequestException(
        `다음 회원의 상태가 '${expectedStatus}'가 아닙니다: ${wrongStatus.map((m) => m.id).join(", ")}`,
      );
    }

    return members;
  }

  /**
   * 일괄 작업 대상 회원이 모두 actor 관할 클럽/팀인지 검증 (크로스-테넌트 차단).
   * 중복 teamId 는 한 번만 검증한다.
   */
  private async assertCanManageMembers(
    members: Array<{ teamId: string }>,
    actorId: string,
    actorRole: string,
  ): Promise<void> {
    const teamIds = [...new Set(members.map((m) => m.teamId))];
    for (const teamId of teamIds) {
      await this.assertCanManageMemberTeam(teamId, actorId, actorRole);
    }
  }
}
