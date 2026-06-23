import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { TrainingService } from "./training.service";
import { CreateTrainingDto } from "./dto/create-training.dto";
import { UpdateTrainingDto } from "./dto/update-training.dto";
import { QueryTrainingDto } from "./dto/query-training.dto";

@ApiTags("Training (훈련 관리)")
@Controller("api/v1/training")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
// [2026-05-13 roles-check] 기본 권한 — 인증된 모든 사용자 조회 허용.
//   mutation 메서드는 이미 메서드 레벨 @Roles("COACH","DIRECTOR") 명시됨.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  // ─── 훈련 세션 CRUD ─────────────────────────────────────────

  /**
   * 훈련 세션 생성
   */
  @Post(":teamId")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "훈련 세션 생성",
    description:
      "코치 또는 감독이 팀 단위 훈련 세션을 생성합니다. scheduleDates를 함께 전달하면 일괄 일정 생성도 가능합니다.",
  })
  @ApiParam({ name: "teamId", description: "클럽 ID" })
  @ApiResponse({
    status: 201,
    description: "훈련 세션이 생성되었습니다.",
    schema: {
      example: {
        id: "training-uuid",
        teamId: "club-uuid",
        className: "월요일 정규훈련",
        trainingType: "REGULAR_TRAINING",
        instructorName: "김철수 코치",
        capacity: 25,
        startTime: "2026-04-07T18:00:00Z",
        endTime: "2026-04-07T20:00:00Z",
        isActive: true,
        createdAt: "2026-04-05T10:00:00Z",
        schedules: [
          {
            id: "schedule-uuid",
            scheduledDate: "2026-04-07T00:00:00Z",
            isCancelled: false,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 400, description: "올바른 시간을 입력해주세요." })
  @ApiResponse({
    status: 403,
    description: "코치 또는 감독만 생성할 수 있습니다.",
  })
  async createTraining(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() dto: CreateTrainingDto,
  ) {
    return this.trainingService.createTraining(req.user.id, teamId, dto);
  }

  /**
   * 클럽의 훈련 목록 조회
   */
  @Get("club/:teamId")
  @ApiOperation({
    summary: "클럽 훈련 목록 조회",
    description:
      "특정 클럽의 훈련 세션 목록을 조회합니다. 훈련 유형, 검색어로 필터링 가능합니다.",
  })
  @ApiParam({ name: "teamId", description: "클럽 ID" })
  @ApiResponse({
    status: 200,
    description: "훈련 목록 조회 성공",
    schema: {
      example: {
        data: [
          {
            id: "training-uuid",
            className: "월요일 정규훈련",
            trainingType: "REGULAR_TRAINING",
            instructorName: "김철수 코치",
            capacity: 25,
            isActive: true,
            _count: { schedules: 4, enrollments: 15 },
          },
        ],
        pagination: { total: 5, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  async getClubTrainings(
    @Param("teamId") teamId: string,
    @Query() query: QueryTrainingDto,
  ) {
    return this.trainingService.getClubTrainings(teamId, query);
  }

  /**
   * 훈련 세션 상세 조회
   */
  @Get(":id")
  @ApiOperation({
    summary: "훈련 세션 상세 조회",
    description:
      "훈련 세��의 상세 정보를 조회합니다. 일정 목록, 출석/RSVP 카운트를 포함합니다.",
  })
  @ApiParam({ name: "id", description: "훈련 세션 ID" })
  @ApiResponse({ status: 200, description: "훈련 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "훈련 세션을 찾을 수 없습니다." })
  async getTrainingDetail(@Param("id") id: string) {
    return this.trainingService.getTrainingDetail(id);
  }

  /**
   * 훈련 세션 수정
   */
  @Patch(":id")
  @Roles("COACH", "DIRECTOR")
  @ApiOperation({
    summary: "훈련 세션 수정",
    description:
      "코치 또는 감독이 훈련 세션 정보를 수정합니다. 부분 업데이트(PATCH)를 지원합니다.",
  })
  @ApiParam({ name: "id", description: "훈련 세션 ID" })
  @ApiResponse({ status: 200, description: "훈련 세션이 수정되었습니다." })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "훈련 세션을 찾을 수 없습니다." })
  async updateTraining(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateTrainingDto,
  ) {
    return this.trainingService.updateTraining(req.user.id, id, dto);
  }

  /**
   * 훈련 세션 삭제 (소프트 삭제)
   */
  @Delete(":id")
  @Roles("COACH", "DIRECTOR")
  @ApiOperation({
    summary: "훈련 세션 삭제",
    description:
      "코치 또는 감독이 훈련 세션을 삭제(비활성화)합니다. 실제 데이터는 유지됩니다.",
  })
  @ApiParam({ name: "id", description: "훈련 세션 ID" })
  @ApiResponse({
    status: 200,
    description: "훈련 세션이 삭제되었습니다.",
  })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "훈련 세션을 찾을 수 없습니다." })
  async deleteTraining(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.trainingService.deleteTraining(req.user.id, id);
  }

  // ─── 훈련 일정 관리 ─────────────────────────────────────────

  /**
   * 훈련 일정 추가
   */
  @Post(":id/schedules")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "훈련 일정 추가",
    description:
      "특정 훈련 세션에 일정을 추가합니다. 여러 날짜를 한 번에 추가할 수 있습니다.",
  })
  @ApiParam({ name: "id", description: "훈련 세션 ID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        dates: {
          type: "array",
          items: { type: "string", example: "2026-04-14" },
          description: "일정 날짜 배열 (YYYY-MM-DD)",
        },
      },
      required: ["dates"],
    },
  })
  @ApiResponse({
    status: 201,
    description: "일정이 추가되었습니다.",
  })
  @ApiResponse({ status: 400, description: "날짜가 필요합니다." })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "훈련 세션을 찾을 수 없습니다." })
  async addSchedules(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body("dates") dates: string[],
  ) {
    return this.trainingService.addSchedules(req.user.id, id, dates);
  }

  /**
   * 훈련 일정 취소
   */
  @Put(":id/schedules/:scheduleId/cancel")
  @Roles("COACH", "DIRECTOR")
  @ApiOperation({
    summary: "훈련 일정 취소",
    description:
      "특정 훈련 일정을 취소합니다. 출석 기록이 있으면 크레딧이 자동 복원됩니다.",
  })
  @ApiParam({ name: "id", description: "훈련 세션 ID" })
  @ApiParam({ name: "scheduleId", description: "일정 ID" })
  @ApiResponse({ status: 200, description: "일정이 취소되었습니다." })
  @ApiResponse({ status: 400, description: "이미 취소된 일정입니다." })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "일정을 찾을 수 없습니다." })
  async cancelSchedule(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("scheduleId") scheduleId: string,
    @Body("cancellationReason") cancellationReason?: string,
  ) {
    return this.trainingService.cancelSchedule(
      req.user.id,
      id,
      scheduleId,
      cancellationReason,
    );
  }

  // ─── 출석 관리 ──────────────────────────────────────────────

  /**
   * 훈련 출석 현황 조회
   */
  @Get(":id/schedules/:scheduleId/attendance")
  @Roles("COACH", "DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "훈련 출석 현황 조회",
    description:
      "특정 훈련 일정의 출석 현황을 조회합니다. 참석율, 개별 출석 상태를 포함합니다.",
  })
  @ApiParam({ name: "id", description: "훈련 세션 ID" })
  @ApiParam({ name: "scheduleId", description: "일정 ID" })
  @ApiResponse({ status: 200, description: "출석 현황 조회 성공" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "일정을 찾을 수 없습니다." })
  async getScheduleAttendance(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("scheduleId") scheduleId: string,
  ) {
    return this.trainingService.getScheduleAttendance(
      req.user.id,
      id,
      scheduleId,
    );
  }

  /**
   * 수동 출석 체크 (코치가 직접 기록)
   */
  @Post(":id/schedules/:scheduleId/attendance")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수동 출석 체크",
    description:
      "코치가 훈련에 참석한 회원들의 출석을 수동으로 기록합니다. 크레딧이 자동 차감됩니다.",
  })
  @ApiParam({ name: "id", description: "훈련 세션 ID" })
  @ApiParam({ name: "scheduleId", description: "일정 ID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        memberIds: {
          type: "array",
          items: { type: "string" },
          description: "출석할 ClubMember ID 배열",
        },
      },
      required: ["memberIds"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "출석 기록 완료",
    schema: {
      example: {
        scheduleId: "schedule-uuid",
        results: [
          {
            memberId: "member-1",
            status: "checked_in",
            attendanceId: "att-uuid",
            creditDeducted: true,
          },
          {
            memberId: "member-2",
            status: "already_checked_in",
            attendanceId: "att-uuid-2",
          },
        ],
        checkedInCount: 1,
        alreadyCheckedInCount: 1,
      },
    },
  })
  @ApiResponse({ status: 400, description: "취소된 일정 또는 회원 ID 누락" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "일정을 찾을 수 없습니다." })
  async markAttendance(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("scheduleId") scheduleId: string,
    @Body("memberIds") memberIds: string[],
  ) {
    return this.trainingService.markAttendance(
      req.user.id,
      id,
      scheduleId,
      memberIds,
    );
  }

  // ─── 통계 ──────────────────────────────────────────────────

  /**
   * 클럽 훈련 통계
   */
  @Get("stats/club/:teamId")
  @Roles("COACH", "DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "클럽 훈련 통계",
    description:
      "클럽의 이번 달 훈련 통계를 조회합니다. 유형별 분류, 일정 완수율, 출석 수를 포함합니다.",
  })
  @ApiParam({ name: "teamId", description: "클럽 ID" })
  @ApiResponse({
    status: 200,
    description: "통계 조회 성공",
    schema: {
      example: {
        teamId: "club-uuid",
        month: "2026-04",
        totalTrainingSessions: 5,
        typeBreakdown: {
          REGULAR_TRAINING: 3,
          GAME: 1,
          FUN: 1,
          CAMP: 0,
          PICKUP: 0,
        },
        monthlySchedules: 20,
        monthlyCancelled: 2,
        monthlyAttendance: 150,
        completionRate: "90.0",
      },
    },
  })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  async getClubTrainingStats(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.trainingService.getClubTrainingStats(req.user.id, teamId);
  }
}
