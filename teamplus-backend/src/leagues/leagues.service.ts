import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateLeagueDto,
  UpdateLeagueDto,
  CreateDivisionDto,
  UpdateDivisionDto,
  CreateTeamDivisionDto,
  BulkCreateTeamDivisionDto,
  CreateTournamentMatchDto,
  UpdateTournamentMatchDto,
  GenerateRoundRobinDto,
} from "./dto/league.dto";

@Injectable()
export class LeaguesService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== League CRUD ====================

  async findAllLeagues(filters?: {
    season?: string;
    ageGroup?: string;
    status?: string;
    search?: string;
  }) {
    const where: Prisma.LeagueWhereInput = {};

    if (filters?.season) where.season = filters.season;
    if (filters?.ageGroup) where.ageGroup = filters.ageGroup;
    if (filters?.status) where.status = filters.status;
    if (filters?.search) {
      where.name = { contains: filters.search, mode: "insensitive" };
    }

    return this.prisma.league.findMany({
      where,
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      include: {
        team: { select: { id: true, name: true } },
        _count: { select: { divisions: true } },
      },
    });
  }

  async findOneLeague(id: string) {
    const league = await this.prisma.league.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true } },
        divisions: {
          orderBy: { sortOrder: "asc" },
          include: {
            _count: {
              select: { teamDivisions: true, tournamentMatches: true },
            },
          },
        },
      },
    });
    if (!league) {
      throw new NotFoundException("리그를 찾을 수 없습니다.");
    }
    return league;
  }

  async createLeague(dto: CreateLeagueDto) {
    return this.prisma.league.create({
      data: {
        name: dto.name,
        season: dto.season,
        year: dto.year,
        description: dto.description ?? null,
        ageGroup: dto.ageGroup ?? null,
        region: dto.region ?? null,
        status: dto.status ?? "draft",
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        teamId: dto.teamId ?? null,
      },
      include: {
        team: { select: { id: true, name: true } },
        _count: { select: { divisions: true } },
      },
    });
  }

  async updateLeague(id: string, dto: UpdateLeagueDto) {
    await this.findOneLeague(id);

    return this.prisma.league.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.season !== undefined && { season: dto.season }),
        ...(dto.year !== undefined && { year: dto.year }),
        ...(dto.description !== undefined && {
          description: dto.description || null,
        }),
        ...(dto.ageGroup !== undefined && {
          ageGroup: dto.ageGroup || null,
        }),
        ...(dto.region !== undefined && { region: dto.region || null }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.startDate !== undefined && {
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        }),
        ...(dto.endDate !== undefined && {
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        }),
        ...(dto.teamId !== undefined && { teamId: dto.teamId || null }),
      },
      include: {
        team: { select: { id: true, name: true } },
        _count: { select: { divisions: true } },
      },
    });
  }

  async removeLeague(id: string) {
    const league = await this.findOneLeague(id);

    // 리그 삭제 시 하위 디비전, 팀 편성, 경기 일정 모두 CASCADE 삭제
    await this.prisma.league.delete({ where: { id } });

    return {
      message: `리그 "${league.name}"이(가) 삭제되었습니다.`,
    };
  }

  // ==================== Division CRUD ====================

  async findAllDivisions(leagueId: string) {
    return this.prisma.division.findMany({
      where: { leagueId },
      orderBy: { sortOrder: "asc" },
      include: {
        teamDivisions: {
          where: { status: "active" },
          include: {
            team: {
              select: {
                id: true,
                name: true,
                shortName: true,
                logoUrl: true,
              },
            },
          },
          orderBy: { seed: "asc" },
        },
        _count: { select: { tournamentMatches: true } },
      },
    });
  }

  async findOneDivision(id: string) {
    const division = await this.prisma.division.findUnique({
      where: { id },
      include: {
        league: { select: { id: true, name: true, season: true } },
        teamDivisions: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
                shortName: true,
                logoUrl: true,
              },
            },
          },
          orderBy: [{ points: "desc" }, { wins: "desc" }],
        },
        _count: { select: { tournamentMatches: true } },
      },
    });
    if (!division) {
      throw new NotFoundException("디비전을 찾을 수 없습니다.");
    }
    return division;
  }

  async createDivision(dto: CreateDivisionDto) {
    // 리그 존재 확인
    const league = await this.prisma.league.findUnique({
      where: { id: dto.leagueId },
    });
    if (!league) {
      throw new NotFoundException("리그를 찾을 수 없습니다.");
    }

    return this.prisma.division.create({
      data: {
        leagueId: dto.leagueId,
        name: dto.name,
        level: dto.level ?? 1,
        description: dto.description ?? null,
        maxTeams: dto.maxTeams ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: {
        _count: { select: { teamDivisions: true } },
      },
    });
  }

  async updateDivision(id: string, dto: UpdateDivisionDto) {
    await this.findOneDivision(id);

    return this.prisma.division.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.level !== undefined && { level: dto.level }),
        ...(dto.description !== undefined && {
          description: dto.description || null,
        }),
        ...(dto.maxTeams !== undefined && { maxTeams: dto.maxTeams || null }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
      include: {
        _count: { select: { teamDivisions: true } },
      },
    });
  }

  async removeDivision(id: string) {
    const division = await this.findOneDivision(id);

    await this.prisma.division.delete({ where: { id } });

    return {
      message: `디비전 "${division.name}"이(가) 삭제되었습니다.`,
    };
  }

  // ==================== TeamDivision (팀 편성) ====================

  async addTeamToDivision(dto: CreateTeamDivisionDto) {
    // Phase 2 (2026-04-29) — Team 모델 폐기. teamId 는 clubs.id 를 가리킴
    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
    });
    if (!team) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    // 디비전 존재 확인
    const division = await this.prisma.division.findUnique({
      where: { id: dto.divisionId },
      include: { _count: { select: { teamDivisions: true } } },
    });
    if (!division) {
      throw new NotFoundException("디비전을 찾을 수 없습니다.");
    }

    // maxTeams 초과 체크
    if (
      division.maxTeams &&
      division._count.teamDivisions >= division.maxTeams
    ) {
      throw new BadRequestException(
        `디비전 최대 팀 수(${division.maxTeams})를 초과할 수 없습니다.`,
      );
    }

    // 중복 체크
    const existing = await this.prisma.teamDivision.findUnique({
      where: {
        teamId_divisionId_season: {
          teamId: dto.teamId,
          divisionId: dto.divisionId,
          season: dto.season,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        "해당 팀은 이미 이 디비전에 편성되어 있습니다.",
      );
    }

    return this.prisma.teamDivision.create({
      data: {
        teamId: dto.teamId,
        divisionId: dto.divisionId,
        season: dto.season,
        seed: dto.seed ?? null,
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
        division: { select: { id: true, name: true } },
      },
    });
  }

  async bulkAddTeamsToDivision(dto: BulkCreateTeamDivisionDto) {
    const division = await this.prisma.division.findUnique({
      where: { id: dto.divisionId },
      include: { _count: { select: { teamDivisions: true } } },
    });
    if (!division) {
      throw new NotFoundException("디비전을 찾을 수 없습니다.");
    }

    if (
      division.maxTeams &&
      division._count.teamDivisions + dto.teamIds.length > division.maxTeams
    ) {
      throw new BadRequestException(
        `디비전 최대 팀 수(${division.maxTeams})를 초과할 수 없습니다.`,
      );
    }

    const results = await this.prisma.$transaction(
      dto.teamIds.map((teamId, index) =>
        this.prisma.teamDivision.create({
          data: {
            teamId,
            divisionId: dto.divisionId,
            season: dto.season,
            seed: index + 1,
          },
        }),
      ),
    );

    return {
      message: `${results.length}개 팀이 디비전에 편성되었습니다.`,
      count: results.length,
    };
  }

  async removeTeamFromDivision(id: string) {
    const td = await this.prisma.teamDivision.findUnique({
      where: { id },
      include: {
        // Phase 2 (2026-04-29) — Team → Club 통합. clubName 사용
        team: { select: { name: true } },
        division: { select: { name: true } },
      },
    });
    if (!td) {
      throw new NotFoundException("팀-디비전 편성을 찾을 수 없습니다.");
    }

    await this.prisma.teamDivision.delete({ where: { id } });

    return {
      message: `"${td.team.name}"이(가) "${td.division.name}" 디비전에서 제외되었습니다.`,
    };
  }

  async getDivisionStandings(divisionId: string) {
    const division = await this.prisma.division.findUnique({
      where: { id: divisionId },
    });
    if (!division) {
      throw new NotFoundException("디비전을 찾을 수 없습니다.");
    }

    return this.prisma.teamDivision.findMany({
      where: { divisionId, status: "active" },
      orderBy: [{ points: "desc" }, { wins: "desc" }, { draws: "desc" }],
      include: {
        team: {
          select: {
            id: true,
            name: true,
            shortName: true,
            logoUrl: true,
          },
        },
      },
    });
  }

  // ==================== TournamentMatch CRUD ====================

  async findAllTournamentMatches(filters?: {
    tournamentId?: string;
    divisionId?: string;
    teamId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: Prisma.TournamentMatchWhereInput = {};

    if (filters?.tournamentId) where.tournamentId = filters.tournamentId;
    if (filters?.divisionId) where.divisionId = filters.divisionId;
    if (filters?.status) where.status = filters.status;
    if (filters?.teamId) {
      where.OR = [
        { homeTeamId: filters.teamId },
        { awayTeamId: filters.teamId },
      ];
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.matchDate = {};
      if (filters?.dateFrom) {
        where.matchDate.gte = new Date(filters.dateFrom);
      }
      if (filters?.dateTo) {
        where.matchDate.lte = new Date(filters.dateTo);
      }
    }

    return this.prisma.tournamentMatch.findMany({
      where,
      orderBy: [{ matchDate: "asc" }, { startTime: "asc" }],
      include: {
        tournament: { select: { id: true, name: true } },
        division: { select: { id: true, name: true, level: true } },
        homeTeam: {
          select: {
            id: true,
            name: true,
            shortName: true,
            logoUrl: true,
          },
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
            shortName: true,
            logoUrl: true,
          },
        },
        venue: { select: { id: true, name: true, address: true } },
      },
    });
  }

  async findOneTournamentMatch(id: string) {
    const match = await this.prisma.tournamentMatch.findUnique({
      where: { id },
      include: {
        tournament: { select: { id: true, name: true } },
        division: {
          select: {
            id: true,
            name: true,
            level: true,
            league: { select: { id: true, name: true, season: true } },
          },
        },
        homeTeam: {
          select: {
            id: true,
            name: true,
            shortName: true,
            logoUrl: true,
          },
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
            shortName: true,
            logoUrl: true,
          },
        },
        venue: {
          select: { id: true, name: true, address: true, city: true },
        },
      },
    });
    if (!match) {
      throw new NotFoundException("경기 일정을 찾을 수 없습니다.");
    }
    return match;
  }

  async createTournamentMatch(dto: CreateTournamentMatchDto) {
    // 같은 팀 간 경기 방지
    if (dto.homeTeamId === dto.awayTeamId) {
      throw new BadRequestException("홈팀과 어웨이팀이 동일할 수 없습니다.");
    }

    // 대회 존재 확인
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: dto.tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }

    return this.prisma.tournamentMatch.create({
      data: {
        tournamentId: dto.tournamentId,
        divisionId: dto.divisionId ?? null,
        homeTeamId: dto.homeTeamId,
        awayTeamId: dto.awayTeamId,
        matchDate: new Date(dto.matchDate),
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        venueId: dto.venueId ?? null,
        round: dto.round ?? null,
        period: dto.period ?? null,
        referee: dto.referee ?? null,
        memo: dto.memo ?? null,
      },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true } },
      },
    });
  }

  async updateTournamentMatch(id: string, dto: UpdateTournamentMatchDto) {
    const match = await this.findOneTournamentMatch(id);

    const data: any = {};
    if (dto.matchDate !== undefined) data.matchDate = new Date(dto.matchDate);
    if (dto.startTime !== undefined) data.startTime = dto.startTime || null;
    if (dto.endTime !== undefined) data.endTime = dto.endTime || null;
    if (dto.venueId !== undefined) data.venueId = dto.venueId || null;
    if (dto.round !== undefined) data.round = dto.round || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.homeScore !== undefined) data.homeScore = dto.homeScore;
    if (dto.awayScore !== undefined) data.awayScore = dto.awayScore;
    if (dto.period !== undefined) data.period = dto.period || null;
    if (dto.referee !== undefined) data.referee = dto.referee || null;
    if (dto.memo !== undefined) data.memo = dto.memo || null;

    // 경기 완료 시 TeamDivision 승패 자동 업데이트
    if (
      dto.status === "completed" &&
      match.status !== "completed" &&
      dto.homeScore !== undefined &&
      dto.awayScore !== undefined &&
      match.divisionId
    ) {
      await this.updateTeamDivisionRecords(
        match.homeTeam.id,
        match.awayTeam.id,
        match.divisionId,
        dto.homeScore,
        dto.awayScore,
      );
    }

    return this.prisma.tournamentMatch.update({
      where: { id },
      data,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true } },
      },
    });
  }

  async removeTournamentMatch(id: string) {
    const match = await this.findOneTournamentMatch(id);

    await this.prisma.tournamentMatch.delete({ where: { id } });

    return {
      message: `경기 일정 (${match.homeTeam.name} vs ${match.awayTeam.name})이 삭제되었습니다.`,
    };
  }

  // ==================== 자동 대진표 생성 (라운드 로빈) ====================

  async generateRoundRobin(dto: GenerateRoundRobinDto) {
    const division = await this.prisma.division.findUnique({
      where: { id: dto.divisionId },
      include: {
        teamDivisions: {
          where: { status: "active" },
          include: { team: { select: { id: true, name: true } } },
          orderBy: { seed: "asc" },
        },
        league: { select: { season: true } },
      },
    });
    if (!division) {
      throw new NotFoundException("디비전을 찾을 수 없습니다.");
    }

    const teams = division.teamDivisions.map((td) => td.team);
    if (teams.length < 2) {
      throw new BadRequestException(
        "대진표를 생성하려면 최소 2개 팀이 필요합니다.",
      );
    }

    // 대회 존재 확인
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: dto.tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }

    // 라운드 로빈 대진 생성
    const matchups = this.generateRoundRobinMatchups(teams.map((t) => t.id));
    const matchDuration = dto.matchDurationMinutes ?? 75;
    const baseDate = new Date(dto.startDate);
    const baseTime = dto.startTime ?? "09:00";

    const matchData = matchups.map((matchup, index) => {
      const matchDate = new Date(baseDate);
      // 하루에 최대 6경기 배치 가정
      const dayOffset = Math.floor(index / 6);
      matchDate.setDate(matchDate.getDate() + dayOffset);

      const timeSlotIndex = index % 6;
      const [hours, minutes] = baseTime.split(":").map(Number);
      const startMinutes = hours * 60 + minutes + timeSlotIndex * matchDuration;
      const endMinutes = startMinutes + matchDuration;

      const startTimeStr = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
      const endTimeStr = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

      return {
        tournamentId: dto.tournamentId,
        divisionId: dto.divisionId,
        homeTeamId: matchup.home,
        awayTeamId: matchup.away,
        matchDate,
        startTime: startTimeStr,
        endTime: endTimeStr,
        venueId: dto.venueId ?? null,
        round: "group",
        period: `${division.league?.season ?? ""} ${division.name}`.trim(),
        status: "scheduled",
      };
    });

    const created = await this.prisma.tournamentMatch.createMany({
      data: matchData,
    });

    return {
      message: `${created.count}개 경기가 자동 생성되었습니다.`,
      count: created.count,
      matchups: matchups.length,
      teams: teams.length,
    };
  }

  // ==================== Private Helpers ====================

  /**
   * 라운드 로빈 대진표 생성 (표준 원형 로테이션 알고리즘)
   * 홀수 팀이면 BYE(부전승) 추가
   */
  private generateRoundRobinMatchups(
    teamIds: string[],
  ): { home: string; away: string }[] {
    const teams = [...teamIds];
    // 홀수 팀이면 BYE 추가
    if (teams.length % 2 !== 0) {
      teams.push("BYE");
    }

    const n = teams.length;
    const rounds = n - 1;
    const halfSize = n / 2;
    const matchups: { home: string; away: string }[] = [];

    // 첫 번째 팀을 고정하고 나머지를 로테이션
    const fixed = teams[0];
    const rotating = teams.slice(1);

    for (let round = 0; round < rounds; round++) {
      // 고정 팀 vs 로테이션 첫 번째 팀
      if (rotating[0] !== "BYE" && fixed !== "BYE") {
        matchups.push({
          home: round % 2 === 0 ? fixed : rotating[0],
          away: round % 2 === 0 ? rotating[0] : fixed,
        });
      }

      // 나머지 매치업
      for (let i = 1; i < halfSize; i++) {
        const home = rotating[i];
        const away = rotating[n - 1 - i - 1];
        if (home !== "BYE" && away !== "BYE") {
          matchups.push({ home, away });
        }
      }

      // 로테이션: 마지막 요소를 앞으로
      rotating.unshift(rotating.pop()!);
    }

    return matchups;
  }

  /**
   * 경기 완료 시 TeamDivision 승/패/무 및 승점 자동 업데이트
   */
  private async updateTeamDivisionRecords(
    homeTeamId: string,
    awayTeamId: string,
    divisionId: string,
    homeScore: number,
    awayScore: number,
  ) {
    const homeTd = await this.prisma.teamDivision.findFirst({
      where: { teamId: homeTeamId, divisionId, status: "active" },
    });
    const awayTd = await this.prisma.teamDivision.findFirst({
      where: { teamId: awayTeamId, divisionId, status: "active" },
    });

    if (!homeTd || !awayTd) return;

    if (homeScore > awayScore) {
      // 홈팀 승리
      await this.prisma.$transaction([
        this.prisma.teamDivision.update({
          where: { id: homeTd.id },
          data: { wins: { increment: 1 }, points: { increment: 3 } },
        }),
        this.prisma.teamDivision.update({
          where: { id: awayTd.id },
          data: { losses: { increment: 1 } },
        }),
      ]);
    } else if (homeScore < awayScore) {
      // 어웨이팀 승리
      await this.prisma.$transaction([
        this.prisma.teamDivision.update({
          where: { id: homeTd.id },
          data: { losses: { increment: 1 } },
        }),
        this.prisma.teamDivision.update({
          where: { id: awayTd.id },
          data: { wins: { increment: 1 }, points: { increment: 3 } },
        }),
      ]);
    } else {
      // 무승부
      await this.prisma.$transaction([
        this.prisma.teamDivision.update({
          where: { id: homeTd.id },
          data: { draws: { increment: 1 }, points: { increment: 1 } },
        }),
        this.prisma.teamDivision.update({
          where: { id: awayTd.id },
          data: { draws: { increment: 1 }, points: { increment: 1 } },
        }),
      ]);
    }
  }
}
