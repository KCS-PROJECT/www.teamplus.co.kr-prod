import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { MatchScoreboardService } from "./match-scoreboard.service";
import {
  CreateMatchEventDto,
  UpdateMatchStatusDto,
} from "./dto/create-match-event.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Match Scoreboard")
@Controller("api/v1/match-scoreboard")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
// [2026-05-13 roles-check] 기본 — 인증된 모든 사용자 조회. 점수 변경은 메서드 레벨.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class MatchScoreboardController {
  constructor(private readonly scoreboardService: MatchScoreboardService) {}

  /**
   * 실시간 스코어 조회
   */
  @Get(":matchId")
  @ApiOperation({
    summary: "실시간 스코어 조회",
    description: "경기의 현재 스코어와 피리어드별 점수를 조회합니다.",
  })
  @ApiParam({ name: "matchId", description: "HockeyMatch ID" })
  @ApiResponse({ status: 200, description: "스코어 조회 성공" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async getScoreboard(@Param("matchId") matchId: string) {
    return this.scoreboardService.getScoreboard(matchId);
  }

  /**
   * 이벤트 타임라인 조회
   */
  @Get(":matchId/events")
  @ApiOperation({
    summary: "이벤트 타임라인",
    description: "경기 중 발생한 모든 이벤트를 시간순으로 조회합니다.",
  })
  @ApiParam({ name: "matchId", description: "HockeyMatch ID" })
  @ApiResponse({ status: 200, description: "이벤트 목록 조회 성공" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async getEvents(@Param("matchId") matchId: string) {
    return this.scoreboardService.getEvents(matchId);
  }

  /**
   * 이벤트 기록
   */
  @Post(":matchId/events")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "이벤트 기록",
    description:
      "경기 이벤트(골, 페널티 등)를 기록합니다. 골 이벤트 시 스코어가 자동 갱신됩니다.",
  })
  @ApiParam({ name: "matchId", description: "HockeyMatch ID" })
  @ApiResponse({ status: 201, description: "이벤트 기록 성공" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async createEvent(
    @Param("matchId") matchId: string,
    @Body() dto: CreateMatchEventDto,
  ) {
    return this.scoreboardService.createEvent(matchId, dto);
  }

  /**
   * 경기 상태 변경
   */
  @Patch(":matchId/status")
  @Roles("COACH", "DIRECTOR")
  @ApiOperation({
    summary: "경기 상태 변경",
    description:
      "경기 상태를 변경합니다 (예: scheduled → in_progress → completed).",
  })
  @ApiParam({ name: "matchId", description: "HockeyMatch ID" })
  @ApiResponse({ status: 200, description: "상태 변경 성공" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async updateStatus(
    @Param("matchId") matchId: string,
    @Body() dto: UpdateMatchStatusDto,
  ) {
    return this.scoreboardService.updateStatus(matchId, dto);
  }
}
