import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { DateTimeService } from "./datetime.service";
import { GetDateTimeQueryDto } from "./dto/datetime-query.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

/**
 * 날짜/시간 공용 API
 *
 * - 단일 엔드포인트로 8개 포맷 모두 반환 (Web/Admin/App 공통 훅이 호출)
 * - 개별 엔드포인트는 단일 키만 필요할 때 사용
 * - baseDate 미지정 시 호출 시점의 오늘 (Asia/Seoul)
 */
@ApiTags("DateTime")
@ApiBearerAuth()
@Controller("api/v1/datetime")
@UseGuards(AuthGuard("jwt"), RolesGuard)
// [2026-05-13 roles-check] 인증된 모든 사용자 서버 시간 조회 허용 (UTC drift 보정용).
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class DateTimeController {
  constructor(private readonly datetimeService: DateTimeService) {}

  @Get()
  @ApiOperation({
    summary: "날짜/시간 통합 조회",
    description:
      "year/month/date/dateTime/dateTimeSecond/dateTimeMillisecond/weeklyDates/monthlyDates 8개 포맷을 한 번에 반환합니다. baseDate 미지정 시 오늘 기준.",
  })
  @ApiResponse({ status: 200, description: "조회 성공" })
  async getAll(@Query() query: GetDateTimeQueryDto) {
    return this.datetimeService.getAll(query);
  }

  @Get("year")
  @ApiOperation({ summary: "년도 조회 (yyyy)", description: '예: "2026"' })
  async getYear(@Query() query: GetDateTimeQueryDto) {
    const { year } = this.datetimeService.getAll(query);
    return { year };
  }

  @Get("month")
  @ApiOperation({
    summary: "현재월 조회 (yyyyMM)",
    description: '예: "202604"',
  })
  async getMonth(@Query() query: GetDateTimeQueryDto) {
    const { month } = this.datetimeService.getAll(query);
    return { month };
  }

  @Get("date")
  @ApiOperation({
    summary: "오늘 날짜 조회 (yyyyMMdd)",
    description: '예: "20260419"',
  })
  async getDate(@Query() query: GetDateTimeQueryDto) {
    const { date } = this.datetimeService.getAll(query);
    return { date };
  }

  @Get("datetime")
  @ApiOperation({
    summary: "오늘 날짜시간 조회 (yyyyMMddHHmm)",
    description: '예: "202604190920"',
  })
  async getDateTime(@Query() query: GetDateTimeQueryDto) {
    const { dateTime } = this.datetimeService.getAll(query);
    return { dateTime };
  }

  @Get("datetime-second")
  @ApiOperation({
    summary: "오늘 날짜시간초 조회 (yyyyMMddHHmmss)",
    description: '예: "20260419092028"',
  })
  async getDateTimeSecond(@Query() query: GetDateTimeQueryDto) {
    const { dateTimeSecond } = this.datetimeService.getAll(query);
    return { dateTimeSecond };
  }

  @Get("datetime-millisecond")
  @ApiOperation({
    summary: "오늘 날짜시간초밀리세컨드 조회 (yyyyMMddHHmmssSSSS)",
    description: '4자리 밀리초 padding. 예: "202604190920280205"',
  })
  async getDateTimeMillisecond(@Query() query: GetDateTimeQueryDto) {
    const { dateTimeMillisecond } = this.datetimeService.getAll(query);
    return { dateTimeMillisecond };
  }

  @Get("weekly")
  @ApiOperation({
    summary: "주간 날짜 조회 (월요일 기준 7일)",
    description: '예: ["13","14","15","16","17","18","19"]',
  })
  async getWeekly(@Query() query: GetDateTimeQueryDto) {
    const { weeklyDates } = this.datetimeService.getAll(query);
    return { weeklyDates };
  }

  @Get("monthly")
  @ApiOperation({
    summary: "월간 날짜 조회 (1일 ~ 말일)",
    description: '예: ["01","02",...,"30"]',
  })
  async getMonthly(@Query() query: GetDateTimeQueryDto) {
    const { monthlyDates } = this.datetimeService.getAll(query);
    return { monthlyDates };
  }
}
