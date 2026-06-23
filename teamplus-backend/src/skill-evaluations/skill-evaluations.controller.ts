import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
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
import { SkillEvaluationsService } from "./skill-evaluations.service";
import { CreateSkillEvaluationDto } from "./dto/create-skill-evaluation.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Skill Evaluations")
@Controller("api/v1")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class SkillEvaluationsController {
  constructor(
    private readonly skillEvaluationsService: SkillEvaluationsService,
  ) {}

  /**
   * 최신 기술 평가 조회 (학생 본인 - /reports/skill/latest 와 동일 역할)
   */
  @Get("reports/skill/latest")
  @Roles("CHILD", "TEEN", "PARENT", "ADMIN")
  @ApiOperation({
    summary: "최신 기술 평가 리포트 조회",
    description: "학생 본인의 가장 최근 공개된 기술 평가를 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "기술 평가 리포트 조회 성공" })
  @ApiResponse({ status: 404, description: "기술 평가 리포트가 없습니다." })
  async getLatestEvaluation(@Request() req: AuthenticatedRequest) {
    return this.skillEvaluationsService.getLatestEvaluation(req.user.id);
  }

  /**
   * 특정 학생의 최신 기술 평가 조회 (프론트엔드 /reports/skill/:userId 호환)
   */
  @Get("reports/skill/:userId")
  @Roles("CHILD", "TEEN", "PARENT", "COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "학생 기술 평가 리포트 조회",
    description: "특정 학생의 최근 공개된 기술 평가를 조회합니다.",
  })
  @ApiParam({ name: "userId", description: "학생 사용자 ID" })
  @ApiResponse({ status: 200, description: "기술 평가 리포트 조회 성공" })
  @ApiResponse({ status: 404, description: "기술 평가 리포트가 없습니다." })
  async getSkillReportByUserId(
    @Param("userId") userId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.skillEvaluationsService.getLatestEvaluation(userId, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 기술 평가 생성 (COACH만)
   */
  @Post("skill-evaluations")
  @Roles("COACH", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "기술 평가 생성",
    description:
      "코치가 클럽 멤버의 기술 평가를 작성합니다. 초안(draft)으로 저장됩니다.",
  })
  @ApiResponse({ status: 201, description: "기술 평가가 저장되었습니다." })
  @ApiResponse({
    status: 403,
    description: "해당 클럽의 코치만 평가를 작성할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "클럽 멤버를 찾을 수 없습니다." })
  async createEvaluation(
    @Body() dto: CreateSkillEvaluationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.skillEvaluationsService.createEvaluation(dto, req.user.id);
  }

  /**
   * 선수 등급 조회 (childId = User ID)
   * 반드시 :id 라우트보다 위에 배치 (라우트 파라미터 충돌 방지)
   */
  @Get("skill-evaluations/:childId/grade")
  @Roles("CHILD", "TEEN", "PARENT", "COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "선수 등급 조회",
    description:
      "학생의 기술 평가 기반 등급(grade 1~3), 평균 점수, 백분위, 평가 횟수를 반환합니다.",
  })
  @ApiParam({ name: "childId", description: "학생 사용자 ID (User ID)" })
  @ApiResponse({ status: 200, description: "선수 등급 조회 성공" })
  @ApiResponse({
    status: 404,
    description: "클럽 회원 정보 또는 공개된 평가를 찾을 수 없습니다.",
  })
  async getPlayerGrade(
    @Param("childId") childId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = await this.skillEvaluationsService.getPlayerGrade(childId, {
      id: req.user.id,
      userType: req.user.userType,
    });
    return { success: true, data };
  }

  /**
   * 회원별 평가 이력 조회 (COACH/ADMIN)
   * 고정 경로 — 동적 :id 보다 반드시 위에 배치
   */
  @Get("skill-evaluations/member/:memberId")
  @Roles("COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "회원 기술 평가 이력",
    description: "특정 클럽 멤버의 기술 평가 이력을 조회합니다.",
  })
  @ApiParam({ name: "memberId", description: "ClubMember ID" })
  @ApiResponse({ status: 200, description: "평가 이력 조회 성공" })
  @ApiResponse({ status: 403, description: "열람 권한이 없습니다." })
  @ApiResponse({ status: 404, description: "클럽 멤버를 찾을 수 없습니다." })
  async getMemberEvaluations(
    @Param("memberId") memberId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.skillEvaluationsService.getMemberEvaluations(
      memberId,
      req.user.id,
      req.user.userType,
    );
  }

  // ==================== 통계 ====================

  /**
   * 클럽 전체 기술 평가 통계
   * 고정 경로 — 동적 :id 보다 반드시 위에 배치
   */
  @Get("skill-evaluations/stats/club")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "클럽 전체 기술 평가 통계",
    description:
      "클럽 전체의 기술 평가 통계(평균 점수, 평가 수, 최근 30일 추이)를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "클럽 통계 조회 성공",
    schema: {
      example: {
        totalEvaluations: 150,
        averageOverallScore: 72.5,
        dimensionAverages: {
          스케이팅: 75.2,
          퍽핸들링: 68.1,
          패싱: 71.4,
          슛팅: 69.8,
          게임운영: 77.0,
        },
        recentTrend: [
          { date: "2026-03-15", count: 5, avgScore: 71.2 },
          { date: "2026-03-20", count: 3, avgScore: 74.0 },
        ],
      },
    },
  })
  async getClubStats() {
    return this.skillEvaluationsService.getClubStats();
  }

  /**
   * 코치별 기술 평가 통계
   * 고정 경로 — 동적 :id 보다 반드시 위에 배치
   */
  @Get("skill-evaluations/stats/coach/:coachId")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "코치별 기술 평가 통계",
    description: "특정 코치의 기술 평가 통계를 조회합니다.",
  })
  @ApiParam({ name: "coachId", description: "코치 사용자 ID" })
  @ApiResponse({
    status: 200,
    description: "코치 통계 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "해당 코치의 평가 기록이 없습니다.",
  })
  async getCoachStats(@Param("coachId") coachId: string) {
    return this.skillEvaluationsService.getCoachStats(coachId);
  }

  /**
   * 기술 평가 상세 조회
   * 동적 :id — 모든 고정 경로(member, stats) 아래에 배치 필수
   */
  @Get("skill-evaluations/:id")
  @Roles("CHILD", "TEEN", "PARENT", "COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({ summary: "기술 평가 상세 조회" })
  @ApiParam({ name: "id", description: "평가 ID" })
  @ApiResponse({ status: 200, description: "평가 상세 조회 성공" })
  @ApiResponse({ status: 403, description: "열람 권한이 없습니다." })
  @ApiResponse({ status: 404, description: "기술 평가를 찾을 수 없습니다." })
  async getEvaluationById(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.skillEvaluationsService.getEvaluationById(
      id,
      req.user.id,
      req.user.userType,
    );
  }

  /**
   * 기술 평가 공개 (COACH만)
   */
  @Patch("skill-evaluations/:id/publish")
  @Roles("COACH", "ADMIN")
  @ApiOperation({
    summary: "기술 평가 공개",
    description: "초안 평가를 학생에게 공개합니다.",
  })
  @ApiParam({ name: "id", description: "평가 ID" })
  @ApiResponse({ status: 200, description: "평가가 공개되었습니다." })
  @ApiResponse({
    status: 403,
    description: "본인이 작성한 평가만 공개할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "기술 평가를 찾을 수 없습니다." })
  async publishEvaluation(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.skillEvaluationsService.publishEvaluation(id, req.user.id);
  }

  /**
   * 기술 평가 삭제
   */
  @Delete("skill-evaluations/:id")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "기술 평가 삭제",
    description:
      "기술 평가를 삭제합니다. 코치는 본인이 작성한 평가만 삭제할 수 있습니다.",
  })
  @ApiParam({ name: "id", description: "평가 ID" })
  @ApiResponse({
    status: 200,
    description: "기술 평가가 삭제되었습니다.",
    schema: { example: { message: "기술 평가가 삭제되었습니다." } },
  })
  @ApiResponse({
    status: 403,
    description: "본인이 작성한 평가만 삭제할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "기술 평가를 찾을 수 없습니다." })
  async deleteEvaluation(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.skillEvaluationsService.deleteEvaluation(
      id,
      req.user.id,
      req.user.userType,
    );
  }
}
