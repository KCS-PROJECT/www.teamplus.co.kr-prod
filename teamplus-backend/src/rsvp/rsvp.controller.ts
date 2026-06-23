import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { RsvpService } from "./rsvp.service";
import { CreateRsvpDto, RsvpResponseDto, RsvpSummaryDto } from "./dto";

@ApiTags("RSVP")
@Controller("api/v1/rsvp")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class RsvpController {
  constructor(private readonly rsvpService: RsvpService) {}

  /**
   * RSVP 응답 (참석/불참)
   */
  @Post()
  @Roles("PARENT", "TEEN", "CHILD")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "RSVP 참석/불참 응답",
    description:
      "학부모 또는 학생이 수업 일정에 대해 참석(ATTENDING) 또는 불참(DECLINED) 응답합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "RSVP 응답 성공",
    type: RsvpResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "RSVP 마감 시간 초과 또는 취소된 일정",
  })
  @ApiResponse({ status: 403, description: "자녀 RSVP 응답 권한 없음" })
  @ApiResponse({ status: 404, description: "수업 일정을 찾을 수 없음" })
  async respondRsvp(
    @Request() req: AuthenticatedRequest,
    @Body() createRsvpDto: CreateRsvpDto,
  ): Promise<RsvpResponseDto> {
    return this.rsvpService.respondRsvp(req.user.id, createRsvpDto);
  }

  /**
   * 내 RSVP 목록 조회
   */
  @Get("my")
  @Roles("PARENT", "TEEN", "CHILD")
  @ApiOperation({
    summary: "내 RSVP 목록 조회",
    description: "로그인한 사용자의 RSVP 목록을 조회합니다.",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "페이지 번호 (기본: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "페이지당 개수 (기본: 20)",
  })
  @ApiResponse({
    status: 200,
    description: "내 RSVP 목록 조회 성공",
    schema: {
      example: {
        data: [
          {
            id: "rsvp-uuid",
            scheduleId: "schedule-uuid",
            userId: "user-uuid",
            childId: null,
            status: "ATTENDING",
            respondedAt: "2026-03-20T10:00:00Z",
            note: null,
            createdAt: "2026-03-16T09:00:00Z",
            updatedAt: "2026-03-20T10:00:00Z",
          },
        ],
        total: 5,
        page: 1,
        limit: 20,
      },
    },
  })
  async getMyRsvps(
    @Request() req: AuthenticatedRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.rsvpService.getMyRsvps(
      req.user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * 일정별 RSVP 현황 조회 (감독/코치 전용)
   */
  @Get("schedule/:scheduleId")
  @Roles("DIRECTOR", "COACH", "ADMIN")
  @ApiOperation({
    summary: "일정별 RSVP 현황 조회",
    description:
      "특정 수업 일정의 RSVP 전체 현황을 조회합니다. (감독/코치/관리자 전용)",
  })
  @ApiResponse({
    status: 200,
    description: "RSVP 현황 조회 성공",
    type: [RsvpResponseDto],
  })
  @ApiResponse({ status: 404, description: "수업 일정을 찾을 수 없음" })
  async getScheduleRsvps(
    @Param("scheduleId") scheduleId: string,
  ): Promise<RsvpResponseDto[]> {
    return this.rsvpService.getScheduleRsvps(scheduleId);
  }

  /**
   * 일정별 RSVP 집계 (감독/코치 전용)
   */
  @Get("schedule/:scheduleId/summary")
  @Roles("DIRECTOR", "COACH", "ADMIN")
  @ApiOperation({
    summary: "일정별 RSVP 집계",
    description:
      "특정 수업 일정의 참석/불참/미응답 수를 집계합니다. (감독/코치/관리자 전용)",
  })
  @ApiResponse({
    status: 200,
    description: "RSVP 집계 성공",
    type: RsvpSummaryDto,
  })
  @ApiResponse({ status: 404, description: "수업 일정을 찾을 수 없음" })
  async getScheduleRsvpSummary(
    @Param("scheduleId") scheduleId: string,
  ): Promise<RsvpSummaryDto> {
    return this.rsvpService.getScheduleRsvpSummary(scheduleId);
  }

  /**
   * RSVP 변경
   */
  @Put(":id")
  @Roles("PARENT", "TEEN", "CHILD")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "RSVP 변경",
    description: "기존 RSVP 응답을 변경합니다. 마감 시간 이전에만 가능합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "RSVP 변경 성공",
    type: RsvpResponseDto,
  })
  @ApiResponse({ status: 400, description: "RSVP 마감 시간 초과" })
  @ApiResponse({ status: 403, description: "타인의 RSVP 변경 불가" })
  @ApiResponse({ status: 404, description: "RSVP 기록을 찾을 수 없음" })
  async updateRsvp(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() createRsvpDto: CreateRsvpDto,
  ): Promise<RsvpResponseDto> {
    return this.rsvpService.updateRsvp(id, req.user.id, createRsvpDto);
  }
}
