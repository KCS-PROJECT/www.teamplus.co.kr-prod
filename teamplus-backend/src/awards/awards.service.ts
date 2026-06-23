import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClassHistoryDto } from "./dto/create-class-history.dto";
import { UpdateClassHistoryDto } from "./dto/update-class-history.dto";
import { CreatePlayerAwardDto } from "./dto/create-player-award.dto";
import { UpdatePlayerAwardDto } from "./dto/update-player-award.dto";
import { CreateTeamAwardDto } from "./dto/create-team-award.dto";
import { UpdateTeamAwardDto } from "./dto/update-team-award.dto";

@Injectable()
export class AwardsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== Player Class History ====================

  async findAllClassHistories(memberId?: string, status?: string) {
    const where: Prisma.PlayerClassHistoryWhereInput = {};
    if (memberId) where.memberId = memberId;
    if (status) where.status = status;

    return this.prisma.playerClassHistory.findMany({
      where,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        totalSessions: true,
        attendedSessions: true,
        attendanceRate: true,
        status: true,
        coachComment: true,
        finalScore: true,
        certificateUrl: true,
        createdAt: true,
        member: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        class: {
          select: { id: true, className: true, levelRequired: true },
        },
      },
      orderBy: { startDate: "desc" },
    });
  }

  async findClassHistoryById(id: string) {
    const history = await this.prisma.playerClassHistory.findUnique({
      where: { id },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        totalSessions: true,
        attendedSessions: true,
        attendanceRate: true,
        status: true,
        coachComment: true,
        finalScore: true,
        certificateUrl: true,
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
        class: {
          select: {
            id: true,
            className: true,
            levelRequired: true,
            description: true,
          },
        },
        enrollment: {
          select: { id: true, status: true, requestType: true },
        },
      },
    });
    if (!history) {
      throw new NotFoundException("수업 이력을 찾을 수 없습니다.");
    }
    return history;
  }

  async createClassHistory(dto: CreateClassHistoryDto) {
    // 회원 존재 확인 + PLAYER 필터 — 학부모(PARENT)가 수업 이력 대상이 되지 않도록 방어
    const member = await this.prisma.teamMember.findFirst({
      where: { id: dto.memberId, roleInTeam: "PLAYER" },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException("클럽 회원을 찾을 수 없습니다.");
    }

    // 수업 존재 확인
    const classEntity = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      select: { id: true, className: true },
    });
    if (!classEntity) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // 중복 확인 (memberId + classId unique)
    const existing = await this.prisma.playerClassHistory.findUnique({
      where: {
        memberId_classId: {
          memberId: dto.memberId,
          classId: dto.classId,
        },
      },
    });
    if (existing) {
      throw new ConflictException("해당 회원의 수업 이력이 이미 존재합니다.");
    }

    // Enrollment 연결 시 검증
    if (dto.enrollmentId) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { id: dto.enrollmentId },
        select: { id: true },
      });
      if (!enrollment) {
        throw new NotFoundException("수강신청을 찾을 수 없습니다.");
      }
    }

    return this.prisma.playerClassHistory.create({
      data: {
        memberId: dto.memberId,
        classId: dto.classId,
        enrollmentId: dto.enrollmentId,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        totalSessions: dto.totalSessions ?? 0,
        status: dto.status ?? "active",
      },
      select: {
        id: true,
        startDate: true,
        status: true,
        member: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        class: { select: { id: true, className: true } },
      },
    });
  }

  async updateClassHistory(id: string, dto: UpdateClassHistoryDto) {
    const existing = await this.prisma.playerClassHistory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("수업 이력을 찾을 수 없습니다.");
    }

    const data: any = { ...dto };
    if (dto.endDate) data.endDate = new Date(dto.endDate);

    return this.prisma.playerClassHistory.update({
      where: { id },
      data,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        totalSessions: true,
        attendedSessions: true,
        attendanceRate: true,
        status: true,
        coachComment: true,
        finalScore: true,
        certificateUrl: true,
        updatedAt: true,
      },
    });
  }

  async deleteClassHistory(id: string) {
    const existing = await this.prisma.playerClassHistory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("수업 이력을 찾을 수 없습니다.");
    }
    await this.prisma.playerClassHistory.delete({ where: { id } });
    return { message: "수업 이력이 삭제되었습니다." };
  }

  // ==================== Player Awards ====================

  async findAllPlayerAwards(
    memberId?: string,
    awardType?: string,
    season?: string,
  ) {
    const where: Prisma.PlayerAwardWhereInput = {};
    if (memberId) where.memberId = memberId;
    if (awardType) where.awardType = awardType;
    if (season) where.season = season;

    return this.prisma.playerAward.findMany({
      where,
      select: {
        id: true,
        awardName: true,
        awardType: true,
        description: true,
        awardedAt: true,
        season: true,
        awardedBy: true,
        certificateUrl: true,
        imageUrl: true,
        isDisplayed: true,
        displayOrder: true,
        createdAt: true,
        member: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        tournament: { select: { id: true, name: true } },
        match: { select: { id: true } },
      },
      orderBy: [{ awardedAt: "desc" }, { displayOrder: "asc" }],
    });
  }

  async findPlayerAwardById(id: string) {
    const award = await this.prisma.playerAward.findUnique({
      where: { id },
      select: {
        id: true,
        awardName: true,
        awardType: true,
        description: true,
        awardedAt: true,
        season: true,
        awardedBy: true,
        certificateUrl: true,
        imageUrl: true,
        isDisplayed: true,
        displayOrder: true,
        createdAt: true,
        member: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
        tournament: { select: { id: true, name: true } },
        match: { select: { id: true } },
      },
    });
    if (!award) {
      throw new NotFoundException("수상 기록을 찾을 수 없습니다.");
    }
    return award;
  }

  async createPlayerAward(dto: CreatePlayerAwardDto) {
    // PLAYER 필터 — 학부모(PARENT)가 시상 대상이 되지 않도록 방어
    const member = await this.prisma.teamMember.findFirst({
      where: { id: dto.memberId, roleInTeam: "PLAYER" },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException("클럽 회원을 찾을 수 없습니다.");
    }

    if (dto.tournamentId) {
      const tournament = await this.prisma.tournament.findUnique({
        where: { id: dto.tournamentId },
        select: { id: true },
      });
      if (!tournament) {
        throw new NotFoundException("대회를 찾을 수 없습니다.");
      }
    }

    if (dto.matchId) {
      const match = await this.prisma.hockeyMatch.findUnique({
        where: { id: dto.matchId },
        select: { id: true },
      });
      if (!match) {
        throw new NotFoundException("경기를 찾을 수 없습니다.");
      }
    }

    // displayOrder 자동 산출
    const maxOrder = await this.prisma.playerAward.aggregate({
      where: { memberId: dto.memberId },
      _max: { displayOrder: true },
    });
    const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    return this.prisma.playerAward.create({
      data: {
        memberId: dto.memberId,
        awardName: dto.awardName,
        awardType: dto.awardType,
        description: dto.description,
        awardedAt: new Date(dto.awardedAt),
        tournamentId: dto.tournamentId,
        matchId: dto.matchId,
        season: dto.season,
        awardedBy: dto.awardedBy,
        certificateUrl: dto.certificateUrl,
        imageUrl: dto.imageUrl,
        displayOrder: nextOrder,
      },
      select: {
        id: true,
        awardName: true,
        awardType: true,
        awardedAt: true,
        season: true,
        createdAt: true,
        member: {
          select: {
            id: true,
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  async updatePlayerAward(id: string, dto: UpdatePlayerAwardDto) {
    const existing = await this.prisma.playerAward.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("수상 기록을 찾을 수 없습니다.");
    }

    return this.prisma.playerAward.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        awardName: true,
        awardType: true,
        awardedAt: true,
        isDisplayed: true,
        displayOrder: true,
        createdAt: true,
      },
    });
  }

  async deletePlayerAward(id: string) {
    const existing = await this.prisma.playerAward.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("수상 기록을 찾을 수 없습니다.");
    }
    await this.prisma.playerAward.delete({ where: { id } });
    return { message: "수상 기록이 삭제되었습니다." };
  }

  // ==================== Team Awards ====================

  async findAllTeamAwards(
    teamId?: string,
    awardType?: string,
    season?: string,
  ) {
    const where: Prisma.TeamAwardWhereInput = {};
    if (teamId) where.teamId = teamId;
    if (awardType) where.awardType = awardType;
    if (season) where.season = season;

    return this.prisma.teamAward.findMany({
      where,
      select: {
        id: true,
        awardName: true,
        awardType: true,
        description: true,
        awardedAt: true,
        season: true,
        awardedBy: true,
        certificateUrl: true,
        imageUrl: true,
        createdAt: true,
        // Phase 2 (2026-04-29) — Team 모델 폐기. teamId 는 clubs.id 를 가리킴
        teamId: true,
        tournament: { select: { id: true, name: true } },
      },
      orderBy: { awardedAt: "desc" },
    });
  }

  async findTeamAwardById(id: string) {
    const award = await this.prisma.teamAward.findUnique({
      where: { id },
      select: {
        id: true,
        awardName: true,
        awardType: true,
        description: true,
        awardedAt: true,
        season: true,
        awardedBy: true,
        certificateUrl: true,
        imageUrl: true,
        createdAt: true,
        // Phase 2 (2026-04-29) — Team 모델 폐기. teamId 는 clubs.id 를 가리킴
        teamId: true,
        tournament: { select: { id: true, name: true } },
      },
    });
    if (!award) {
      throw new NotFoundException("팀 수상 기록을 찾을 수 없습니다.");
    }
    return award;
  }

  async createTeamAward(dto: CreateTeamAwardDto) {
    // Phase 2 (2026-04-29) — Team 모델 폐기. teamId 는 clubs.id 를 가리킴
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
      select: { id: true, name: true },
    });
    if (!team) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    if (dto.tournamentId) {
      const tournament = await this.prisma.tournament.findUnique({
        where: { id: dto.tournamentId },
        select: { id: true },
      });
      if (!tournament) {
        throw new NotFoundException("대회를 찾을 수 없습니다.");
      }
    }

    return this.prisma.teamAward.create({
      data: {
        teamId: dto.teamId,
        awardName: dto.awardName,
        awardType: dto.awardType,
        description: dto.description,
        awardedAt: new Date(dto.awardedAt),
        tournamentId: dto.tournamentId,
        season: dto.season,
        awardedBy: dto.awardedBy,
        certificateUrl: dto.certificateUrl,
        imageUrl: dto.imageUrl,
      },
      select: {
        id: true,
        awardName: true,
        awardType: true,
        awardedAt: true,
        season: true,
        createdAt: true,
        // Phase 2 (2026-04-29) — Team 모델 폐기. teamId 는 clubs.id 를 가리킴
        teamId: true,
      },
    });
  }

  async updateTeamAward(id: string, dto: UpdateTeamAwardDto) {
    const existing = await this.prisma.teamAward.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("팀 수상 기록을 찾을 수 없습니다.");
    }

    return this.prisma.teamAward.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        awardName: true,
        awardType: true,
        awardedAt: true,
        season: true,
      },
    });
  }

  async deleteTeamAward(id: string) {
    const existing = await this.prisma.teamAward.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("팀 수상 기록을 찾을 수 없습니다.");
    }
    await this.prisma.teamAward.delete({ where: { id } });
    return { message: "팀 수상 기록이 삭제되었습니다." };
  }

  // ==================== Portfolio (통합 조회) ====================

  async getMemberPortfolio(memberId: string) {
    // PLAYER 필터 — 포트폴리오 조회는 선수(PLAYER)만 대상, 학부모(PARENT) 제외
    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, roleInTeam: "PLAYER" },
      select: {
        id: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        team: { select: { id: true, name: true } },
      },
    });
    if (!member) {
      throw new NotFoundException("클럽 회원을 찾을 수 없습니다.");
    }

    const [classHistories, playerAwards] = await Promise.all([
      this.prisma.playerClassHistory.findMany({
        where: { memberId },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          totalSessions: true,
          attendedSessions: true,
          attendanceRate: true,
          status: true,
          finalScore: true,
          certificateUrl: true,
          class: { select: { id: true, className: true, levelRequired: true } },
        },
        orderBy: { startDate: "desc" },
      }),
      this.prisma.playerAward.findMany({
        where: { memberId, isDisplayed: true },
        select: {
          id: true,
          awardName: true,
          awardType: true,
          awardedAt: true,
          season: true,
          certificateUrl: true,
          imageUrl: true,
          tournament: { select: { id: true, name: true } },
        },
        orderBy: [{ displayOrder: "asc" }, { awardedAt: "desc" }],
      }),
    ]);

    return {
      member,
      classHistories,
      playerAwards,
      summary: {
        totalClasses: classHistories.length,
        completedClasses: classHistories.filter((h) => h.status === "completed")
          .length,
        activeClasses: classHistories.filter((h) => h.status === "active")
          .length,
        totalAwards: playerAwards.length,
      },
    };
  }
}
