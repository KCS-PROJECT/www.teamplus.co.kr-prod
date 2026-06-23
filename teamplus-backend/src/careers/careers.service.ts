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

@Injectable()
export class CareersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async createStaffCareer(dto: CreateStaffCareerDto) {
    // 사용자 존재 + 역할 확인 (DIRECTOR, COACH, ADMIN만)
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, userType: true },
    });
    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }
    const allowedTypes = ["ADMIN", "DIRECTOR", "COACH"];
    if (!allowedTypes.includes(user.userType)) {
      throw new ForbiddenException(
        "경력 등록은 감독, 코치, 관리자만 가능합니다.",
      );
    }

    // displayOrder 자동 산출
    const maxOrder = await this.prisma.staffCareer.aggregate({
      where: { userId: dto.userId },
      _max: { displayOrder: true },
    });
    const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    return this.prisma.staffCareer.create({
      data: {
        userId: dto.userId,
        role: dto.role,
        organizationName: dto.organizationName,
        leagueName: dto.leagueName,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isCurrent: dto.isCurrent ?? false,
        description: dto.description,
        certifications: dto.certifications
          ? JSON.stringify(dto.certifications)
          : undefined,
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

  async updateStaffCareer(id: string, dto: UpdateStaffCareerDto) {
    const existing = await this.prisma.staffCareer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("스태프 경력을 찾을 수 없습니다.");
    }

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

  async deleteStaffCareer(id: string) {
    const existing = await this.prisma.staffCareer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("스태프 경력을 찾을 수 없습니다.");
    }
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
