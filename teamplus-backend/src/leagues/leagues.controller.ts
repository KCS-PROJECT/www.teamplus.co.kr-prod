import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { LeaguesService } from "./leagues.service";
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

// ==================== League Controller ====================

@Controller("api/v1/leagues")
@UseGuards(AuthGuard("jwt"), RolesGuard)
// [2026-05-13 roles-check] 기본 권한 — 인증된 모든 사용자 조회 허용.
//   mutation/admin 메서드는 메서드 레벨 @Roles("ADMIN","DIRECTOR") 명시됨.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class LeagueController {
  constructor(private readonly leaguesService: LeaguesService) {}

  @Get()
  async findAll(
    @Query("season") season?: string,
    @Query("ageGroup") ageGroup?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    const data = await this.leaguesService.findAllLeagues({
      season,
      ageGroup,
      status,
      search,
    });
    return { success: true, data };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.leaguesService.findOneLeague(id);
    return { success: true, data };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async create(@Body() dto: CreateLeagueDto) {
    const data = await this.leaguesService.createLeague(dto);
    return { success: true, data };
  }

  @Put(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async update(@Param("id") id: string, @Body() dto: UpdateLeagueDto) {
    const data = await this.leaguesService.updateLeague(id, dto);
    return { success: true, data };
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  async remove(@Param("id") id: string) {
    const data = await this.leaguesService.removeLeague(id);
    return { success: true, data };
  }

  // ==================== Division Endpoints (nested under league) ====================

  @Get(":leagueId/divisions")
  async findAllDivisions(@Param("leagueId") leagueId: string) {
    const data = await this.leaguesService.findAllDivisions(leagueId);
    return { success: true, data };
  }

  @Post(":leagueId/divisions")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async createDivision(
    @Param("leagueId") leagueId: string,
    @Body() dto: CreateDivisionDto,
  ) {
    // leagueId를 URL 파라미터에서 자동 설정
    dto.leagueId = leagueId;
    const data = await this.leaguesService.createDivision(dto);
    return { success: true, data };
  }
}

// ==================== Division Controller ====================

@Controller("api/v1/divisions")
@UseGuards(AuthGuard("jwt"))
export class DivisionController {
  constructor(private readonly leaguesService: LeaguesService) {}

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.leaguesService.findOneDivision(id);
    return { success: true, data };
  }

  @Put(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async update(@Param("id") id: string, @Body() dto: UpdateDivisionDto) {
    const data = await this.leaguesService.updateDivision(id, dto);
    return { success: true, data };
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  async remove(@Param("id") id: string) {
    const data = await this.leaguesService.removeDivision(id);
    return { success: true, data };
  }

  // ==================== Team Division (팀 편성) ====================

  @Get(":divisionId/standings")
  async getStandings(@Param("divisionId") divisionId: string) {
    const data = await this.leaguesService.getDivisionStandings(divisionId);
    return { success: true, data };
  }

  @Post(":divisionId/teams")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async addTeam(
    @Param("divisionId") divisionId: string,
    @Body() dto: CreateTeamDivisionDto,
  ) {
    dto.divisionId = divisionId;
    const data = await this.leaguesService.addTeamToDivision(dto);
    return { success: true, data };
  }

  @Post(":divisionId/teams/bulk")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async bulkAddTeams(
    @Param("divisionId") divisionId: string,
    @Body() dto: BulkCreateTeamDivisionDto,
  ) {
    dto.divisionId = divisionId;
    const data = await this.leaguesService.bulkAddTeamsToDivision(dto);
    return { success: true, data };
  }

  @Delete("teams/:teamDivisionId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async removeTeam(@Param("teamDivisionId") teamDivisionId: string) {
    const data =
      await this.leaguesService.removeTeamFromDivision(teamDivisionId);
    return { success: true, data };
  }
}

// ==================== TournamentMatch Controller ====================

@Controller("api/v1/tournament-matches")
@UseGuards(AuthGuard("jwt"))
export class TournamentMatchController {
  constructor(private readonly leaguesService: LeaguesService) {}

  @Get()
  async findAll(
    @Query("tournamentId") tournamentId?: string,
    @Query("divisionId") divisionId?: string,
    @Query("teamId") teamId?: string,
    @Query("status") status?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    const data = await this.leaguesService.findAllTournamentMatches({
      tournamentId,
      divisionId,
      teamId,
      status,
      dateFrom,
      dateTo,
    });
    return { success: true, data };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.leaguesService.findOneTournamentMatch(id);
    return { success: true, data };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async create(@Body() dto: CreateTournamentMatchDto) {
    const data = await this.leaguesService.createTournamentMatch(dto);
    return { success: true, data };
  }

  @Put(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async update(@Param("id") id: string, @Body() dto: UpdateTournamentMatchDto) {
    const data = await this.leaguesService.updateTournamentMatch(id, dto);
    return { success: true, data };
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  async remove(@Param("id") id: string) {
    const data = await this.leaguesService.removeTournamentMatch(id);
    return { success: true, data };
  }

  @Post("generate-round-robin")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async generateRoundRobin(@Body() dto: GenerateRoundRobinDto) {
    const data = await this.leaguesService.generateRoundRobin(dto);
    return { success: true, data };
  }
}
