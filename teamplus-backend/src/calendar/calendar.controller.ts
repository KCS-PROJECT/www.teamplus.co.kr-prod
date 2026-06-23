import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Logger,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { CalendarService } from "./calendar.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";

@ApiTags("calendar")
@ApiBearerAuth()
@Controller("api/v1/calendar")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class CalendarController {
  private readonly logger = new Logger(CalendarController.name);

  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  @Roles("PARENT", "COACH", "DIRECTOR", "TEEN", "CHILD", "ACADEMY_DIRECTOR")
  @ApiOperation({ summary: "월별 통합 캘린더 조회" })
  @ApiQuery({
    name: "month",
    description: "조회 월 (YYYY-MM)",
    example: "2026-04",
  })
  @ApiQuery({
    name: "childId",
    required: false,
    description:
      "학부모 자녀 선택 스코프 — 지정 시 해당 자녀 등록 수업 일정만 (PARENT 전용)",
  })
  @ApiResponse({ status: 200, description: "날짜별 이벤트 목록 반환" })
  async getMonthlyCalendar(
    @Request() req: AuthenticatedRequest,
    @Query("month") month: string,
    @Query("childId") childId?: string,
  ) {
    this.logger.log(
      `[Calendar] 월별 조회: userId=${req.user.id}, month=${month}`,
    );
    return this.calendarService.getMonthlyCalendar(
      req.user.id,
      req.user.userType,
      month ?? "",
      childId,
    );
  }

  @Get("history")
  @Roles("PARENT", "COACH", "DIRECTOR", "TEEN", "CHILD", "ACADEMY_DIRECTOR")
  @ApiOperation({ summary: "연간 훈련 이력 월별 집계" })
  @ApiQuery({ name: "year", description: "조회 연도 (YYYY)", example: "2026" })
  @ApiQuery({
    name: "childId",
    required: false,
    description:
      "학부모 자녀 선택 스코프 — 지정 시 해당 자녀 등록 수업 일정만 (PARENT 전용)",
  })
  @ApiResponse({ status: 200, description: "월별 이벤트 카운트 반환" })
  async getYearlyHistory(
    @Request() req: AuthenticatedRequest,
    @Query("year") year: string,
    @Query("childId") childId?: string,
  ) {
    this.logger.log(
      `[Calendar] 연간 집계: userId=${req.user.id}, year=${year}`,
    );
    return this.calendarService.getYearlyHistory(
      req.user.id,
      req.user.userType,
      year ?? String(new Date().getFullYear()),
      childId,
    );
  }
}
