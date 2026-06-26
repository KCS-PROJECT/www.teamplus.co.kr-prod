import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePlayerCareerDto } from "./dto/create-player-career.dto";
import { UpdatePlayerCareerDto } from "./dto/update-player-career.dto";
import { CreateStaffCareerDto } from "./dto/create-staff-career.dto";
import { UpdateStaffCareerDto } from "./dto/update-staff-career.dto";
import { resolveManagedTeamIds } from "../common/utils/team-scope.util";

@Injectable()
export class CareersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 스태프 약력 수정/삭제 소유권 가드.
   *   - ADMIN → 전체 허용
   *   - 본인 약력(targetUserId === requesterId) → 허용
   *   - 요청자 관리 팀 ∩ 대상 코치 소속 팀 교집합 존재 → 허용
   *   - 그 외 → 403
   *
   * "관리/소속 팀" 판정은 팀 가시성 SoT인 resolveManagedTeamIds 재사용
   *   (TeamMember(approved) ∪ CoachProfile.teamId ∪ Team.coachId).
   */
  private async assertCanManageCareer(
    requesterId: string,
    requesterRole: string,
    targetUserId: string,
  ): Promise<void> {
    if (requesterRole === "ADMIN") return;
    if (targetUserId === requesterId) return;

    const [requesterTeamIds, targetTeamIds] = await Promise.all([
      resolveManagedTeamIds(this.prisma, requesterId),
      resolveManagedTeamIds(this.prisma, targetUserId),
    ]);
    const targetSet = new Set(targetTeamIds);
    const hasOverlap = requesterTeamIds.some((id) => targetSet.has(id));
    if (hasOverlap) return;

    throw new ForbiddenException(
      "해당 코치의 약력을 수정할 권한이 없습니다.",
    );
  }

  // ==================== Player Career ====================

  async findAllPlayerCareers(memberId?: string, isCurrent?: boolean) {
    const where: Prisma.PlayerCareerWhereInput = {};
    if (memberId) where.memberId = memberId;
    if (isCurrent !== undefined) where.isCurrent = isCurrent;

    return this.prisma.playerCareer.findMany({
      where,
      select: {
        id: true,
        teamName: true,
        position: true,
        jerseyNumber: true,
        leagueName: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        description: true,
        displayOrder: true,
        createdAt: true,
        member: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
    });
  }

  async findPlayerCareerById(id: string) {
    const career = await this.prisma.playerCareer.findUnique({
      where: { id },
      select: {
        id: true,
        teamName: true,
        position: true,
        jerseyNumber: true,
        leagueName: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        description: true,
        displayOrder: true,
        createdAt: true,
        updatedAt: true,
        member: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });
    if (!career) {
      throw new NotFoundException("선수 경력을 찾을 수 없습니다.");
    }
    return career;
  }

  async createPlayerCareer(dto: CreatePlayerCareerDto) {
    // PLAYER 필터 — 선수 경력 등록은 선수(PLAYER)만 가능, 학부모(PARENT) 제외
    const member = await this.prisma.teamMember.findFirst({
      where: { id: dto.memberId, roleInTeam: "PLAYER" },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException("클럽 회원을 찾을 수 없습니다.");
    }

    // displayOrder 자동 산출
    const maxOrder = await this.prisma.playerCareer.aggregate({
      where: { memberId: dto.memberId },
      _max: { displayOrder: true },
    });
    const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    return this.prisma.playerCareer.create({
      data: {
        memberId: dto.memberId,
        teamName: dto.teamName,
        position: dto.position,
        jerseyNumber: dto.jerseyNumber,
        leagueName: dto.leagueName,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isCurrent: dto.isCurrent ?? false,
        description: dto.description,
        displayOrder: nextOrder,
      },
      select: {
        id: true,
        teamName: true,
        position: true,
        startDate: true,
        isCurrent: true,
        displayOrder: true,
        createdAt: true,
      },
    });
  }

  async updatePlayerCareer(id: string, dto: UpdatePlayerCareerDto) {
    const existing = await this.prisma.playerCareer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("선수 경력을 찾을 수 없습니다.");
    }

    const data: any = { ...dto };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);

    return this.prisma.playerCareer.update({
      where: { id },
      data,
      select: {
        id: true,
        teamName: true,
        position: true,
        jerseyNumber: true,
        leagueName: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        description: true,
        displayOrder: true,
        updatedAt: true,
      },
    });
  }

  async deletePlayerCareer(id: string) {
    const existing = await this.prisma.playerCareer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("선수 경력을 찾을 수 없습니다.");
    }
    await this.prisma.playerCareer.delete({ where: { id } });
    return { message: "선수 경력이 삭제되었습니다." };
  }

  /** 선수 경력 전체 조회 (포트폴리오용) */
  async getPlayerCareerSummary(memberId: string) {
    // PLAYER 필터 — 경력 조회는 선수(PLAYER)만 대상, 학부모(PARENT) 제외
    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, roleInTeam: "PLAYER" },
      select: {
        id: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!member) {
      throw new NotFoundException("클럽 회원을 찾을 수 없습니다.");
    }

    const careers = await this.prisma.playerCareer.findMany({
      where: { memberId },
      select: {
        id: true,
        teamName: true,
        position: true,
        jerseyNumber: true,
        leagueName: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        description: true,
        displayOrder: true,
      },
      orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
    });

    return {
      member,
      careers,
      summary: {
        totalCareers: careers.length,
        currentTeams: careers.filter((c) => c.isCurrent).length,
        pastTeams: careers.filter((c) => !c.isCurrent).length,
      },
    };
  }

  // ==================== Staff Career ====================

  async findAllStaffCareers(
    userId?: string,
    role?: string,
    isCurrent?: boolean,
  ) {
    const where: Prisma.StaffCareerWhereInput = {};
    if (userId) where.userId = userId;
    if (role) where.role = role;
    if (isCurrent !== undefined) where.isCurrent = isCurrent;

    return this.prisma.staffCareer.findMany({
      where,
      select: {
        id: true,
        role: true,
        organizationName: true,
        leagueName: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        description: true,
        certifications: true,
        displayOrder: true,
        createdAt: true,
        user: {
          select: { id: true, firstName: true, lastName: true, userType: true },
        },
      },
      orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
    });
  }

  async findStaffCareerById(id: string) {
    const career = await this.prisma.staffCareer.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        organizationName: true,
        leagueName: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        description: true,
        certifications: true,
        displayOrder: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userType: true,
          },
        },
      },
    });
    if (!career) {
      throw new NotFoundException("스태프 경력을 찾을 수 없습니다.");
    }
    return career;
  }

  async createStaffCareer(
    dto: CreateStaffCareerDto,
    requesterId: string,
    requesterRole: string,
  ) {
    // 사용자 존재 + 역할 확인 (DIRECTOR, COACH, ADMIN만)
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, userType: true },
    });
    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }
    const allowedTypes = ["ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH"];
    if (!allowedTypes.includes(user.userType)) {
      throw new ForbiddenException(
        "경력 등록은 감독, 코치, 관리자만 가능합니다.",
      );
    }

    // 소유권 가드 — 본인/관리팀 코치/ADMIN 외 403
    await this.assertCanManageCareer(requesterId, requesterRole, dto.userId);

    // displayOrder 자동 산출
    const maxOrder = await this.prisma.staffCareer.aggregate({
      where: { userId: dto.userId },
      _max: { displayOrder: true },
    });
    const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    return this.prisma.staffCareer.create({
      data: {
        userId: dto.userId,
        // 자유텍스트 전환(A-1): 누락 시 더미값 없이 NULL 저장
        role: dto.role ?? null,
        organizationName: dto.organizationName ?? null,
        leagueName: dto.leagueName ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isCurrent: dto.isCurrent ?? false,
        description: dto.description ?? null,
        certifications: dto.certifications
          ? JSON.stringify(dto.certifications)
          : null,
        displayOrder: nextOrder,
      },
      select: {
        id: true,
        role: true,
        organizationName: true,
        startDate: true,
        isCurrent: true,
        displayOrder: true,
        createdAt: true,
      },
    });
  }

  async updateStaffCareer(
    id: string,
    dto: UpdateStaffCareerDto,
    requesterId: string,
    requesterRole: string,
  ) {
    const existing = await this.prisma.staffCareer.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing) {
      throw new NotFoundException("스태프 경력을 찾을 수 없습니다.");
    }

    // 소유권 가드 — 대상 약력의 userId 기준 검증
    await this.assertCanManageCareer(
      requesterId,
      requesterRole,
      existing.userId,
    );

    const data: any = { ...dto };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    if (dto.certifications) {
      data.certifications = JSON.stringify(dto.certifications);
    }

    return this.prisma.staffCareer.update({
      where: { id },
      data,
      select: {
        id: true,
        role: true,
        organizationName: true,
        leagueName: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        description: true,
        certifications: true,
        displayOrder: true,
        updatedAt: true,
      },
    });
  }

  async deleteStaffCareer(
    id: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const existing = await this.prisma.staffCareer.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing) {
      throw new NotFoundException("스태프 경력을 찾을 수 없습니다.");
    }

    // 소유권 가드 — 대상 약력의 userId 기준 검증
    await this.assertCanManageCareer(
      requesterId,
      requesterRole,
      existing.userId,
    );

    await this.prisma.staffCareer.delete({ where: { id } });
    return { message: "스태프 경력이 삭제되었습니다." };
  }

  /** 스태프 경력 전체 조회 (프로필용) */
  async getStaffCareerProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userType: true,
      },
    });
    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    const careers = await this.prisma.staffCareer.findMany({
      where: { userId },
      select: {
        id: true,
        role: true,
        organizationName: true,
        leagueName: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        description: true,
        certifications: true,
        displayOrder: true,
      },
      orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
    });

    // certifications JSON → 배열 파싱
    const parsed = careers.map((c) => ({
      ...c,
      certifications: c.certifications ? JSON.parse(c.certifications) : [],
    }));

    return {
      user,
      careers: parsed,
      summary: {
        totalCareers: careers.length,
        currentPositions: careers.filter((c) => c.isCurrent).length,
        pastPositions: careers.filter((c) => !c.isCurrent).length,
        roles: [...new Set(careers.map((c) => c.role))],
      },
    };
  }
}
