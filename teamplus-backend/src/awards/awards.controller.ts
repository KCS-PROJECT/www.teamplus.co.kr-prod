import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AwardsService } from "./awards.service";
import { CreateClassHistoryDto } from "./dto/create-class-history.dto";
import { UpdateClassHistoryDto } from "./dto/update-class-history.dto";
import { CreatePlayerAwardDto } from "./dto/create-player-award.dto";
import { UpdatePlayerAwardDto } from "./dto/update-player-award.dto";
import { CreateTeamAwardDto } from "./dto/create-team-award.dto";
import { UpdateTeamAwardDto } from "./dto/update-team-award.dto";

@ApiTags("Awards (수상/경력)")
@Controller("api/v1/awards")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
// [2026-05-13 roles-check] 기본 — 인증된 모든 사용자 조회. 등록/수정은 메서드 레벨.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class AwardsController {
  constructor(private readonly awardsService: AwardsService) {}

  // ==================== Player Class History ====================

  @Get("class-history")
  @ApiOperation({ summary: "수업 이력 목록 조회" })
  @ApiQuery({ name: "memberId", required: false, description: "ClubMember ID" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["active", "completed", "withdrawn", "suspended"],
  })
  @ApiResponse({ status: 200, description: "수업 이력 목록" })
  async findAllClassHistories(
    @Query("memberId") memberId?: string,
    @Query("status") status?: string,
  ) {
    return this.awardsService.findAllClassHistories(memberId, status);
  }

  @Get("class-history/:id")
  @ApiOperation({ summary: "수업 이력 상세 조회" })
  @ApiParam({ name: "id", description: "PlayerClassHistory ID" })
  @ApiResponse({ status: 200, description: "수업 이력 상세" })
  @ApiResponse({ status: 404, description: "수업 이력을 찾을 수 없습니다." })
  async findClassHistoryById(@Param("id") id: string) {
    return this.awardsService.findClassHistoryById(id);
  }

  @Post("class-history")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "수업 이력 생성" })
  @ApiResponse({ status: 201, description: "수업 이력이 생성되었습니다." })
  @ApiResponse({
    status: 404,
    description: "회원 또는 수업을 찾을 수 없습니다.",
  })
  @ApiResponse({ status: 409, description: "이미 수업 이력이 존재합니다." })
  async createClassHistory(@Body() dto: CreateClassHistoryDto) {
    return this.awardsService.createClassHistory(dto);
  }

  @Patch("class-history/:id")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({ summary: "수업 이력 수정 (코치 총평, 출석률, 상태 등)" })
  @ApiParam({ name: "id", description: "PlayerClassHistory ID" })
  @ApiResponse({ status: 200, description: "수업 이력이 수정되었습니다." })
  @ApiResponse({ status: 404, description: "수업 이력을 찾을 수 없습니다." })
  async updateClassHistory(
    @Param("id") id: string,
    @Body() dto: UpdateClassHistoryDto,
  ) {
    return this.awardsService.updateClassHistory(id, dto);
  }

  @Delete("class-history/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "수업 이력 삭제" })
  @ApiParam({ name: "id", description: "PlayerClassHistory ID" })
  @ApiResponse({ status: 200, description: "수업 이력이 삭제되었습니다." })
  @ApiResponse({ status: 404, description: "수업 이력을 찾을 수 없습니다." })
  async deleteClassHistory(@Param("id") id: string) {
    return this.awardsService.deleteClassHistory(id);
  }

  // ==================== Player Awards ====================

  @Get("player")
  @ApiOperation({ summary: "개인 수상 기록 목록 조회" })
  @ApiQuery({ name: "memberId", required: false, description: "ClubMember ID" })
  @ApiQuery({
    name: "awardType",
    required: false,
    description: "수상 유형",
    enum: [
      "mvp",
      "best_scorer",
      "best_goalie",
      "most_improved",
      "sportsmanship",
      "skill",
      "attendance",
      "special",
    ],
  })
  @ApiQuery({
    name: "season",
    required: false,
    description: "시즌 (예: 2025-2026)",
  })
  @ApiResponse({ status: 200, description: "개인 수상 기록 목록" })
  async findAllPlayerAwards(
    @Query("memberId") memberId?: string,
    @Query("awardType") awardType?: string,
    @Query("season") season?: string,
  ) {
    return this.awardsService.findAllPlayerAwards(memberId, awardType, season);
  }

  @Get("player/:id")
  @ApiOperation({ summary: "개인 수상 기록 상세 조회" })
  @ApiParam({ name: "id", description: "PlayerAward ID" })
  @ApiResponse({ status: 200, description: "개인 수상 기록 상세" })
  @ApiResponse({ status: 404, description: "수상 기록을 찾을 수 없습니다." })
  async findPlayerAwardById(@Param("id") id: string) {
    return this.awardsService.findPlayerAwardById(id);
  }

  @Post("player")
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "개인 수상 기록 등록" })
  @ApiResponse({ status: 201, description: "수상 기록이 등록되었습니다." })
  @ApiResponse({
    status: 404,
    description: "회원/대회/경기를 찾을 수 없습니다.",
  })
  async createPlayerAward(@Body() dto: CreatePlayerAwardDto) {
    return this.awardsService.createPlayerAward(dto);
  }

  @Patch("player/:id")
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT")
  @ApiOperation({ summary: "개인 수상 기록 수정" })
  @ApiParam({ name: "id", description: "PlayerAward ID" })
  @ApiResponse({ status: 200, description: "수상 기록이 수정되었습니다." })
  @ApiResponse({ status: 404, description: "수상 기록을 찾을 수 없습니다." })
  async updatePlayerAward(
    @Param("id") id: string,
    @Body() dto: UpdatePlayerAwardDto,
  ) {
    return this.awardsService.updatePlayerAward(id, dto);
  }

  @Delete("player/:id")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({ summary: "개인 수상 기록 삭제" })
  @ApiParam({ name: "id", description: "PlayerAward ID" })
  @ApiResponse({ status: 200, description: "수상 기록이 삭제되었습니다." })
  @ApiResponse({ status: 404, description: "수상 기록을 찾을 수 없습니다." })
  async deletePlayerAward(@Param("id") id: string) {
    return this.awardsService.deletePlayerAward(id);
  }

  // ==================== Team Awards ====================

  @Get("team")
  @ApiOperation({ summary: "팀 수상 기록 목록 조회" })
  @ApiQuery({ name: "teamId", required: false, description: "Team ID" })
  @ApiQuery({
    name: "awardType",
    required: false,
    description: "수상 유형",
    enum: [
      "champion",
      "runner_up",
      "third_place",
      "league_winner",
      "fair_play",
      "best_team",
      "special",
    ],
  })
  @ApiQuery({ name: "season", required: false, description: "시즌" })
  @ApiResponse({ status: 200, description: "팀 수상 기록 목록" })
  async findAllTeamAwards(
    @Query("teamId") teamId?: string,
    @Query("awardType") awardType?: string,
    @Query("season") season?: string,
  ) {
    return this.awardsService.findAllTeamAwards(teamId, awardType, season);
  }

  @Get("team/:id")
  @ApiOperation({ summary: "팀 수상 기록 상세 조회" })
  @ApiParam({ name: "id", description: "TeamAward ID" })
  @ApiResponse({ status: 200, description: "팀 수상 기록 상세" })
  @ApiResponse({ status: 404, description: "팀 수상 기록을 찾을 수 없습니다." })
  async findTeamAwardById(@Param("id") id: string) {
    return this.awardsService.findTeamAwardById(id);
  }

  @Post("team")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "팀 수상 기록 등록" })
  @ApiResponse({ status: 201, description: "팀 수상 기록이 등록되었습니다." })
  @ApiResponse({ status: 404, description: "팀/대회를 찾을 수 없습니다." })
  async createTeamAward(@Body() dto: CreateTeamAwardDto) {
    return this.awardsService.createTeamAward(dto);
  }

  @Patch("team/:id")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({ summary: "팀 수상 기록 수정" })
  @ApiParam({ name: "id", description: "TeamAward ID" })
  @ApiResponse({ status: 200, description: "팀 수상 기록이 수정되었습니다." })
  @ApiResponse({ status: 404, description: "팀 수상 기록을 찾을 수 없습니다." })
  async updateTeamAward(
    @Param("id") id: string,
    @Body() dto: UpdateTeamAwardDto,
  ) {
    return this.awardsService.updateTeamAward(id, dto);
  }

  @Delete("team/:id")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({ summary: "팀 수상 기록 삭제" })
  @ApiParam({ name: "id", description: "TeamAward ID" })
  @ApiResponse({ status: 200, description: "팀 수상 기록이 삭제되었습니다." })
  @ApiResponse({ status: 404, description: "팀 수상 기록을 찾을 수 없습니다." })
  async deleteTeamAward(@Param("id") id: string) {
    return this.awardsService.deleteTeamAward(id);
  }

  // ==================== Portfolio (통합 조회) ====================

  @Get("portfolio/:memberId")
  @ApiOperation({
    summary: "선수 포트폴리오 (수업 이력 + 수상 기록 통합 조회)",
  })
  @ApiParam({ name: "memberId", description: "ClubMember ID" })
  @ApiResponse({ status: 200, description: "선수 포트폴리오" })
  @ApiResponse({ status: 404, description: "클럽 회원을 찾을 수 없습니다." })
  async getMemberPortfolio(@Param("memberId") memberId: string) {
    return this.awardsService.getMemberPortfolio(memberId);
  }
}
