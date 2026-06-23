import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
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
  Request,
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
import { TrainingStatsService } from "./training-stats.service";
import { CreateTrainingSessionDto } from "./dto/create-training-session.dto";
import { QueryTrainingStatsDto } from "./dto/query-training-stats.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Training Stats")
@Controller("api/v1/training-stats")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class TrainingStatsController {
  constructor(private readonly trainingStatsService: TrainingStatsService) {}

  /**
   * 훈련 기록 생성
   */
  @Post("sessions")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "훈련 기록 생성",
    description: "회원의 훈련 세션과 지표를 함께 기록합니다.",
  })
  @ApiResponse({ status: 201, description: "훈련 기록이 생성되었습니다." })
  async createSession(
    @Body() dto: CreateTrainingSessionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.trainingStatsService.createSession(dto, req.user.id);
  }

  /**
   * 회원별 훈련 기록 목록
   */
  @Get("member/:memberId")
  @Roles("COACH", "DIRECTOR", "PARENT", "TEEN")
  @ApiOperation({
    summary: "회원별 훈련 기록 목록",
    description: "특정 회원의 훈련 기록을 페이지네이션으로 조회합니다.",
  })
  @ApiParam({ name: "memberId", description: "ClubMember ID" })
  @ApiResponse({ status: 200, description: "훈련 기록 목록 조회 성공" })
  async getMemberSessions(
    @Param("memberId") memberId: string,
    @Query() query: QueryTrainingStatsDto,
  ) {
    return this.trainingStatsService.getMemberSessions(memberId, query);
  }

  /**
   * 훈련 기록 상세
   */
  @Get("sessions/:id")
  @Roles("COACH", "DIRECTOR", "PARENT", "TEEN")
  @ApiOperation({
    summary: "훈련 기록 상세",
    description: "훈련 세션의 상세 정보와 지표를 조회합니다.",
  })
  @ApiParam({ name: "id", description: "TrainingSession ID" })
  @ApiResponse({ status: 200, description: "훈련 기록 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "훈련 기록을 찾을 수 없습니다." })
  async getSession(@Param("id") id: string) {
    return this.trainingStatsService.getSession(id);
  }

  /**
   * 훈련 기록 수정
   */
  @Patch("sessions/:id")
  @Roles("COACH", "DIRECTOR")
  @ApiOperation({
    summary: "훈련 기록 수정",
    description: "훈련 세션 정보를 수정합니다.",
  })
  @ApiParam({ name: "id", description: "TrainingSession ID" })
  @ApiResponse({ status: 200, description: "훈련 기록이 수정되었습니다." })
  @ApiResponse({ status: 404, description: "훈련 기록을 찾을 수 없습니다." })
  async updateSession(
    @Param("id") id: string,
    @Body() dto: Partial<CreateTrainingSessionDto>,
  ) {
    return this.trainingStatsService.updateSession(id, dto);
  }

  /**
   * 훈련 기록 삭제
   */
  @Delete("sessions/:id")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "훈련 기록 삭제",
    description: "훈련 세션과 관련 지표를 삭제합니다.",
  })
  @ApiParam({ name: "id", description: "TrainingSession ID" })
  @ApiResponse({ status: 200, description: "훈련 기록이 삭제되었습니다." })
  @ApiResponse({ status: 404, description: "훈련 기록을 찾을 수 없습니다." })
  async deleteSession(@Param("id") id: string) {
    return this.trainingStatsService.deleteSession(id);
  }

  /**
   * 대시보드 전용 통계 (프론트 전용 가공 데이터)
   */
  @Get("member/:memberId/dashboard")
  @Roles("COACH", "DIRECTOR", "PARENT", "TEEN", "ADMIN")
  @ApiOperation({
    summary: "대시보드 전용 훈련 통계",
    description:
      "프론트 대시보드에서 바로 사용할 수 있는 가공된 데이터를 반환합니다. (5축 레이더, 요일별 강도, 향상도, 팀 평균)",
  })
  @ApiParam({ name: "memberId", description: "ClubMember ID" })
  @ApiResponse({ status: 200, description: "대시보드 통계 조회 성공" })
  async getDashboardStats(
    @Param("memberId") memberId: string,
    @Query("period") period?: string,
  ) {
    const p = period === "monthly" ? "monthly" : "weekly";
    return this.trainingStatsService.getDashboardStats(memberId, p);
  }

  /**
   * 주간 통계
   */
  @Get("member/:memberId/weekly")
  @Roles("COACH", "DIRECTOR", "PARENT", "TEEN")
  @ApiOperation({
    summary: "주간 훈련 통계",
    description:
      "회원의 최근 7일 훈련 통계를 조회합니다. (총 시간, 세션 수, 일별 기록)",
  })
  @ApiParam({ name: "memberId", description: "ClubMember ID" })
  @ApiResponse({ status: 200, description: "주간 통계 조회 성공" })
  async getWeeklyStats(@Param("memberId") memberId: string) {
    return this.trainingStatsService.getWeeklyStats(memberId);
  }

  /**
   * 월간 통계
   */
  @Get("member/:memberId/monthly")
  @Roles("COACH", "DIRECTOR", "PARENT", "TEEN")
  @ApiOperation({
    summary: "월간 훈련 통계",
    description:
      "회원의 최근 30일 훈련 통계를 조회합니다. (총 시간, 세션 수, 일별 기록)",
  })
  @ApiParam({ name: "memberId", description: "ClubMember ID" })
  @ApiResponse({ status: 200, description: "월간 통계 조회 성공" })
  async getMonthlyStats(@Param("memberId") memberId: string) {
    return this.trainingStatsService.getMonthlyStats(memberId);
  }
}
