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
  ApiQuery,
} from "@nestjs/swagger";
import { WorkScheduleService } from "./work-schedule.service";
import { CreateWorkScheduleDto } from "./dto/create-work-schedule.dto";
import { CreateSwapRequestDto } from "./dto/create-swap-request.dto";
import { ReviewSwapRequestDto } from "./dto/review-swap-request.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Work Schedule")
@Controller("api/v1/work-schedule")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class WorkScheduleController {
  constructor(private readonly workScheduleService: WorkScheduleService) {}

  /**
   * 스케줄 생성
   */
  @Post()
  @Roles("DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "근무 스케줄 생성",
    description: "코치의 근무 스케줄을 생성합니다.",
  })
  @ApiResponse({ status: 201, description: "스케줄이 생성되었습니다." })
  async create(@Body() dto: CreateWorkScheduleDto) {
    return this.workScheduleService.create(dto);
  }

  /**
   * 클럽 전체 스케줄
   */
  @Get("club/:teamId")
  @Roles("DIRECTOR", "COACH")
  @ApiOperation({
    summary: "클럽 전체 스케줄 조회",
    description: "클럽의 전체 근무 스케줄을 기간별로 조회합니다.",
  })
  @ApiParam({ name: "teamId", description: "클럽 ID" })
  @ApiQuery({
    name: "startDate",
    required: true,
    description: "시작일 (ISO 8601)",
  })
  @ApiQuery({
    name: "endDate",
    required: true,
    description: "종료일 (ISO 8601)",
  })
  @ApiQuery({ name: "coachId", required: false, description: "코치 ID 필터" })
  @ApiResponse({ status: 200, description: "스케줄 목록 조회 성공" })
  async getClubSchedules(
    @Param("teamId") teamId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("coachId") coachId?: string,
  ) {
    return this.workScheduleService.getClubSchedules(teamId, {
      startDate,
      endDate,
      coachId,
    });
  }

  /**
   * 내 스케줄
   */
  @Get("me")
  @Roles("COACH")
  @ApiOperation({
    summary: "내 근무 스케줄 조회",
    description: "로그인한 코치의 근무 스케줄을 조회합니다.",
  })
  @ApiQuery({
    name: "startDate",
    required: true,
    description: "시작일 (ISO 8601)",
  })
  @ApiQuery({
    name: "endDate",
    required: true,
    description: "종료일 (ISO 8601)",
  })
  @ApiResponse({ status: 200, description: "내 스케줄 조회 성공" })
  async getMySchedules(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.workScheduleService.getMySchedules(req.user.id, {
      startDate,
      endDate,
    });
  }

  /**
   * 스케줄 수정
   */
  @Patch(":id")
  @Roles("DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "근무 스케줄 수정",
    description: "근무 스케줄 정보를 수정합니다.",
  })
  @ApiParam({ name: "id", description: "WorkSchedule ID" })
  @ApiResponse({ status: 200, description: "스케줄이 수정되었습니다." })
  @ApiResponse({ status: 404, description: "스케줄을 찾을 수 없습니다." })
  async update(
    @Param("id") id: string,
    @Body() dto: Partial<CreateWorkScheduleDto>,
  ) {
    return this.workScheduleService.update(id, dto);
  }

  /**
   * 스케줄 삭제
   */
  @Delete(":id")
  @Roles("DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "근무 스케줄 삭제",
    description: "근무 스케줄을 삭제합니다.",
  })
  @ApiParam({ name: "id", description: "WorkSchedule ID" })
  @ApiResponse({ status: 200, description: "스케줄이 삭제되었습니다." })
  @ApiResponse({ status: 404, description: "스케줄을 찾을 수 없습니다." })
  async delete(@Param("id") id: string) {
    return this.workScheduleService.delete(id);
  }

  // ============ Swap Requests ============

  /**
   * 변경 요청 생성
   */
  @Post("swap-requests")
  @Roles("COACH")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "스케줄 변경 요청",
    description: "코치가 근무 스케줄 변경을 요청합니다.",
  })
  @ApiResponse({ status: 201, description: "변경 요청이 생성되었습니다." })
  async createSwapRequest(
    @Body() dto: CreateSwapRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.workScheduleService.createSwapRequest(dto, req.user.id);
  }

  /**
   * 클럽별 변경 요청 목록
   */
  @Get("swap-requests/club/:teamId")
  @Roles("DIRECTOR")
  @ApiOperation({
    summary: "변경 요청 목록",
    description: "클럽의 스케줄 변경 요청 목록을 조회합니다.",
  })
  @ApiParam({ name: "teamId", description: "클럽 ID" })
  @ApiResponse({ status: 200, description: "변경 요청 목록 조회 성공" })
  async getSwapRequests(@Param("teamId") teamId: string) {
    return this.workScheduleService.getSwapRequests(teamId);
  }

  /**
   * 변경 요청 승인/거부
   */
  @Patch("swap-requests/:id/review")
  @Roles("DIRECTOR")
  @ApiOperation({
    summary: "변경 요청 승인/거부",
    description: "감독이 스케줄 변경 요청을 승인 또는 거부합니다.",
  })
  @ApiParam({ name: "id", description: "ScheduleSwapRequest ID" })
  @ApiResponse({ status: 200, description: "변경 요청이 처리되었습니다." })
  @ApiResponse({ status: 404, description: "변경 요청을 찾을 수 없습니다." })
  async reviewSwapRequest(
    @Param("id") id: string,
    @Body() dto: ReviewSwapRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.workScheduleService.reviewSwapRequest(id, dto, req.user.id);
  }
}
