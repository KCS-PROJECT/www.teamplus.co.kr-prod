import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { TeamsService } from "./teams.service";

@ApiTags("Statistics")
@Controller("api/v1/statistics/team")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class TeamStatisticsController {
  constructor(private readonly teamsService: TeamsService) {}

  /**
   * 팀 통계 조회 (프론트엔드 /statistics/team/:teamId 호환)
   */
  @Get(":teamId")
  @Roles("COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "팀 통계 조회",
    description: "팀의 출석, 회원, 크레딧 통계를 조회합니다.",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "시작일 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "종료일 (YYYY-MM-DD)",
  })
  @ApiResponse({ status: 200, description: "팀 통계 조회 성공" })
  @ApiResponse({ status: 403, description: "팀 통계 조회 권한이 없습니다." })
  async getTeamStatistics(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.teamsService.getTeamAttendanceStatistics(
      req.user.id,
      teamId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
