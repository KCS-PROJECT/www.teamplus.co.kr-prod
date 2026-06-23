import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Get,
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
  ApiQuery,
} from "@nestjs/swagger";
import { AttendanceService } from "./attendance.service";
import { CheckInDto } from "./dto/check-in.dto";
import { GenerateQrDto } from "./dto/generate-qr.dto";
import { UpdateAttendanceDto } from "./dto/update-attendance.dto";
import { ParentCheckInDto } from "./dto/parent-check-in.dto";
import { CoachCheckInDto } from "./dto/coach-check-in.dto";
import { CoachManualMarkDto } from "./dto/coach-manual-mark.dto";
import { SelfCheckInDto } from "./dto/self-check-in.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Attendance")
@Controller("api/v1/attendance")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * QR 코드 생성 (코치/감독/관리자 전용, 5분 유효)
   */
  @Post("qr-generate")
  @Roles("COACH", "DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "출석 QR 코드 생성",
    description:
      "코치가 특정 수업 일정에 대한 출석 QR 코드를 생성합니다. (5분 유효)",
  })
  @ApiResponse({
    status: 201,
    description: "QR 코드 생성 성공",
    schema: {
      example: {
        success: true,
        data: {
          qrData: "550e8400-e29b-41d4-a716-446655440000",
          scheduleId: "schedule-uuid",
          expiresAt: "2026-01-05T16:35:00Z",
          generatedAt: "2026-01-05T16:30:00Z",
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "해당 수업의 코치만 QR 코드를 생성할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "일정을 찾을 수 없습니다." })
  async generateQr(
    @Request() req: AuthenticatedRequest,
    @Body() generateQrDto: GenerateQrDto,
  ) {
    const data = await this.attendanceService.generateQr(
      generateQrDto.scheduleId,
      req.user.id,
    );
    return { success: true, data };
  }

  /**
   * QR 코드로 출석 체크인 (실연동)
   * - 학생(CHILD/TEEN): 본인 체크인
   * - 학부모(PARENT): 자녀 대리 체크인 (childId 필수)
   */
  @Post("check-in")
  @Roles("CHILD", "TEEN", "PARENT")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "QR 출석 체크인",
    description:
      "QR 코드를 스캔하여 출석을 체크합니다. 학부모는 childId를 전달하여 자녀 대리 체크인이 가능합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "출석 체크 성공",
    schema: {
      example: {
        success: true,
        data: {
          id: "attendance-uuid",
          memberId: "user-uuid",
          scheduleId: "schedule-uuid",
          className: "신규 수강생반",
          attendanceStatus: "present",
          checkedInAt: "2026-01-04T16:30:00Z",
          creditDeducted: true,
          proxyCheckIn: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      "QR 만료 / 취소된 일정 / 크레딧 부족 / 이미 출석 / 미승인 회원",
  })
  @ApiResponse({
    status: 404,
    description: "유효하지 않은 QR 코드",
  })
  async checkInAttendance(
    @Request() req: AuthenticatedRequest,
    @Body() checkInDto: CheckInDto,
  ) {
    const data = await this.attendanceService.checkInByQr(
      req.user.id,
      checkInDto.qrData,
      checkInDto.childId,
    );
    return { success: true, data };
  }

  /**
   * 2026-04-27 (Phase 2 · D-A~E): 학부모 자녀 대리 출석 체크 (QR 없음)
   */
  @Post("parent-check-in")
  @Roles("PARENT")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "학부모 자녀 출석 체크 (버튼)",
    description:
      "학부모가 자녀를 대신 출석 체크합니다. QR 없이 scheduleId + childId 만으로 호출. 시간 윈도우(-60분 ~ +120분), 학부모-자녀 관계, 수업권 잔량을 검증합니다.",
  })
  @ApiResponse({ status: 200, description: "출석 체크 성공" })
  @ApiResponse({
    status: 400,
    description:
      "시간 윈도우 외 / 취소된 일정 / 이미 출석 / 수업권 부족 / 미가입",
  })
  @ApiResponse({ status: 403, description: "보호자 아님 / 미등록 수업" })
  @ApiResponse({ status: 404, description: "수업 일정 없음" })
  async parentCheckIn(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ParentCheckInDto,
  ) {
    return this.attendanceService.parentCheckIn(
      req.user.id,
      dto.scheduleId,
      dto.childId,
    );
  }

  /**
   * 2026-04-28 (Phase 2 · D-1=B): 학생 본인 출석 체크 (QR 없음)
   * 회의록 R1 변경: 자녀 본인 QR → 학부모와 동일한 버튼 방식으로 일원화.
   */
  @Post("self-check-in")
  @Roles("CHILD", "TEEN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "학생 본인 출석 체크 (버튼)",
    description:
      "학생(CHILD/TEEN)이 본인 출석을 직접 체크합니다. QR 없이 scheduleId 만으로 호출. 시간 윈도우(-60분 ~ +120분), 본인 등록 자격, 수업권 잔량을 검증합니다.",
  })
  @ApiResponse({ status: 200, description: "출석 체크 성공" })
  @ApiResponse({
    status: 400,
    description:
      "시간 윈도우 외 / 취소된 일정 / 이미 출석 / 수업권 부족 / 미가입",
  })
  @ApiResponse({ status: 403, description: "수강 등록 안 됨" })
  @ApiResponse({ status: 404, description: "수업 일정 없음" })
  async selfCheckIn(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SelfCheckInDto,
  ) {
    return this.attendanceService.selfCheckIn(req.user.id, dto.scheduleId);
  }

  /**
   * 2026-04-27 (Phase 2 · N-4): 감독/코치 일괄 출석 체크
   */
  @Post("coach-check-in")
  @Roles("COACH", "DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "감독/코치 일괄 출석 체크",
    description:
      "감독·코치가 여러 회원을 한 번에 출석 처리합니다. 부분 실패 허용 — 회원별 결과(checked_in/already_checked_in/no_registration/credit_insufficient) 를 results 배열로 반환합니다.",
  })
  @ApiResponse({
    status: 200,
    description:
      "처리 결과 요약 — checkedInCount / alreadyCheckedInCount / failedCount",
  })
  @ApiResponse({ status: 403, description: "수업 권한 없음" })
  @ApiResponse({ status: 404, description: "수업 일정 없음" })
  async coachCheckIn(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CoachCheckInDto,
  ) {
    return this.attendanceService.coachCheckIn(
      req.user.id,
      dto.scheduleId,
      dto.memberIds,
    );
  }

  /**
   * 2026-04-28 (Phase B): 코치/감독/관리자 — 오늘 담당 수업 + 학생 출석 현황 조회.
   * /attendance-manage 페이지의 1차 데이터 소스.
   */
  @Get("coach/today-schedules")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "코치 오늘 담당 수업 + 출석 현황",
    description:
      "코치 본인이 담당하는 오늘의 schedule + 등록 학생 + 학생별 출석 상태(present/absent/unchecked)를 한 번에 반환합니다. ADMIN/DIRECTOR 는 전체 클럽, COACH 는 본인 소속/소유 클럽만 조회됩니다.",
  })
  @ApiResponse({
    status: 200,
    description: "오늘 schedule 배열 (각 schedule 에 students 포함)",
  })
  async getCoachTodaySchedules(@Request() req: AuthenticatedRequest) {
    return this.attendanceService.getCoachTodaySchedules(req.user.id);
  }

  /**
   * 2026-04-28 (Phase B): 코치/감독/관리자 수동 출석 마킹/취소.
   * 기존 attendance 있으면 update + 수업권 자동 복원/차감.
   * 없으면 신규 생성 + present 면 수업권 차감.
   */
  @Post("coach/manual-mark")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "코치 수동 출석 마킹/취소",
    description:
      "코치가 학생 출석 상태를 직접 설정합니다. present ↔ absent 전환 시 수업권 자동 복원/차감. 미등록 학생은 차단됩니다.",
  })
  @ApiResponse({ status: 200, description: "출석 마킹/수정 성공" })
  @ApiResponse({
    status: 400,
    description: "수업권 부족 / 잘못된 상태",
  })
  @ApiResponse({
    status: 403,
    description: "클럽 권한 없음 / 미등록 학생",
  })
  @ApiResponse({ status: 404, description: "수업 일정 없음" })
  async coachManualMark(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CoachManualMarkDto,
  ) {
    return this.attendanceService.coachManualMark(
      req.user.id,
      dto.scheduleId,
      dto.memberId,
      dto.attendanceStatus,
      dto.modifiedReason,
    );
  }

  /**
   * 2026-04-28 (Phase B · 옵션 A): 코치 출석 처리 취소 (미체크 복귀).
   * attendance 레코드 자체를 삭제하고 차감된 수업권을 복원합니다.
   * 사용 시나리오: 학생 도착 전 코치가 실수로 출석 처리한 경우.
   */
  @Delete("coach/:attendanceId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "코치 출석 처리 취소 (미체크 복귀)",
    description:
      "출석 레코드 자체를 삭제하여 미체크 상태로 되돌립니다. creditDeducted=true 였다면 수업권 1회 자동 복원 + creditTransaction(type=restored) 기록.",
  })
  @ApiResponse({ status: 200, description: "처리 취소 성공" })
  @ApiResponse({ status: 403, description: "클럽 권한 없음" })
  @ApiResponse({ status: 404, description: "출석 기록 없음" })
  async coachClearAttendance(
    @Request() req: AuthenticatedRequest,
    @Param("attendanceId") attendanceId: string,
  ) {
    return this.attendanceService.coachClearAttendance(
      req.user.id,
      attendanceId,
    );
  }

  /**
   * 일정별 출석 현황 조회
   */
  @Get("schedule/:scheduleId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "일정별 출석 현황",
    description: "특정 수업 일정의 출석 현황을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "출석 현황 조회 성공",
    schema: {
      example: {
        scheduleId: "schedule-uuid",
        scheduledDate: "2026-01-05T16:00:00Z",
        isCancelled: false,
        total: 15,
        present: 12,
        absent: 3,
        presentRate: "80.0",
        attendances: [
          {
            id: "attendance-uuid",
            memberId: "member-uuid",
            attendanceStatus: "present",
            checkedInAt: "2026-01-05T16:05:00Z",
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "일정을 찾을 수 없습니다.",
  })
  async getScheduleAttendance(@Param("scheduleId") scheduleId: string) {
    return this.attendanceService.getScheduleAttendance(scheduleId);
  }

  /**
   * 2026-05-08: 일정별 출석 명단 (등록 학생 전체 + 출석 LEFT JOIN).
   * 코치/감독 출석확인 페이지에서 사용.
   */
  @Get("schedule/:scheduleId/roster")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "일정별 출석 명단 (등록 학생 전체)",
    description:
      "특정 수업 일정의 출석 명단을 조회합니다. 출석 레코드 유무와 무관하게 활성 등록 학생 전원을 반환하며, 미체크 학생은 attendanceStatus='unchecked' 로 표기됩니다.",
  })
  async getScheduleRoster(@Param("scheduleId") scheduleId: string) {
    return this.attendanceService.getScheduleRoster(scheduleId);
  }

  /**
   * 2026-05-12: 수업별 일정 출석 이력 (3단 섹션: 진행 중 / 완료 / 예정).
   * /attendance-manage?classId=X 페이지의 1차 데이터 소스.
   *
   * 시점 분류 (회의록 22:31 정합):
   *   - 진행 중: now ∈ [start-60min, start+120min]
   *   - 완료:   now > start+120min (최신순 페이징)
   *   - 예정:   now < start-60min (별도 endpoint lazy load)
   */
  @Get("class/:classId/schedules")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "수업별 일정 출석 이력 (3단 섹션)",
    description:
      "특정 수업의 모든 일정을 진행 중/완료(역순 페이징)/예정 카운트로 반환합니다. 회의록 결정 기반 수업별 누적 출석 관리 화면용.",
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    description: "완료 섹션 페이징 커서 (ISO scheduledDate)",
  })
  @ApiQuery({
    name: "pageSize",
    required: false,
    description: "완료 섹션 페이지 크기 (기본 20)",
  })
  @ApiResponse({ status: 200, description: "수업 출석 이력 조회 성공" })
  @ApiResponse({ status: 404, description: "수업을 찾을 수 없습니다." })
  async getClassScheduleHistory(
    @Param("classId") classId: string,
    @Query("cursor") cursor?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.attendanceService.getClassScheduleHistory(
      classId,
      cursor,
      pageSize ? Math.min(parseInt(pageSize, 10) || 20, 50) : 20,
    );
  }

  /**
   * 2026-05-12: 수업별 예정 일정 lazy load.
   */
  @Get("class/:classId/schedules/upcoming")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "수업별 예정 일정 목록 (lazy load)",
    description:
      "현재 시각 +60분 이후의 예정 일정을 가까운 미래부터 정순 페이징으로 반환합니다.",
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    description: "페이징 커서 (ISO scheduledDate)",
  })
  @ApiQuery({
    name: "pageSize",
    required: false,
    description: "페이지 크기 (기본 20)",
  })
  async getClassScheduleUpcoming(
    @Param("classId") classId: string,
    @Query("cursor") cursor?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.attendanceService.getClassScheduleUpcoming(
      classId,
      cursor,
      pageSize ? Math.min(parseInt(pageSize, 10) || 20, 50) : 20,
    );
  }

  /**
   * [Phase C] 수업별 회원 월 출석 횟수 (선불 출석 가시화).
   */
  @Get("class/:classId/monthly-counts")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "수업별 회원 월 출석 횟수",
    description:
      "특정 수업의 해당 월 회원별 출석(present) 횟수를 반환합니다. 선불 수업 출석관리 화면의 참여 확인용(읽기 전용·정산 없음).",
  })
  @ApiQuery({
    name: "yearMonth",
    required: false,
    description: "조회 월 (YYYY-MM). 미전송 시 당월.",
  })
  @ApiResponse({ status: 200, description: "월 출석 횟수 조회 성공" })
  @ApiResponse({ status: 404, description: "수업을 찾을 수 없습니다." })
  async getClassMonthlyAttendanceCounts(
    @Param("classId") classId: string,
    @Query("yearMonth") yearMonth?: string,
  ) {
    const ym =
      yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)
        ? yearMonth
        : new Date(Date.now() + 9 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 7);
    return this.attendanceService.getClassMonthlyAttendanceCounts(classId, ym);
  }

  /**
   * 회원 출석 기록 조회
   */
  @Get("member/:memberId")
  @Roles("PARENT", "CHILD", "TEEN", "COACH", "DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "회원 출석 기록",
    description: "회원의 최근 출석 기록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "출석 기록 조회 성공",
    schema: {
      example: [
        {
          id: "attendance-uuid",
          classId: "class-uuid",
          className: "신규 수강생반",
          scheduledDate: "2026-01-05T16:00:00Z",
          attendanceStatus: "present",
          checkedInAt: "2026-01-05T16:05:00Z",
          creditDeducted: true,
        },
      ],
    },
  })
  async getMemberAttendanceHistory(
    @Request() req: AuthenticatedRequest,
    @Param("memberId") memberId: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.attendanceService.getMemberAttendanceHistory(
      req.user.id,
      memberId,
      parsedLimit,
    );
  }

  /**
   * 수업별 출석 통계
   */
  @Get("class/:classId/stats")
  @Roles("COACH")
  @ApiOperation({
    summary: "수업별 출석 통계",
    description: "특정 수업의 전체 출석 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "출석 통계 조회 성공",
    schema: {
      example: {
        classId: "class-uuid",
        totalSessions: 8,
        totalPresent: 96,
        totalAbsent: 8,
        totalLate: 4,
        presentRate: "80.0",
      },
    },
  })
  async getClassAttendanceStats(@Param("classId") classId: string) {
    return this.attendanceService.getClassAttendanceStats(classId);
  }

  /**
   * 출석 기록 이력 조회 (필터링)
   */
  @Get("history")
  @Roles("COACH", "ADMIN")
  @ApiOperation({
    summary: "출석 이력 조회",
    description: "출석 기록을 필터링하여 조회합니다.",
  })
  @ApiQuery({ name: "teamId", required: false, description: "클럽 ID" })
  @ApiQuery({ name: "classId", required: false, description: "수업 ID" })
  @ApiQuery({ name: "memberId", required: false, description: "회원 ID" })
  @ApiQuery({
    name: "status",
    required: false,
    description: "출석 상태 (present/absent/unchecked)",
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
  @ApiQuery({ name: "page", required: false, description: "페이지 번호" })
  @ApiQuery({ name: "limit", required: false, description: "페이지당 개수" })
  @ApiResponse({
    status: 200,
    description: "출석 이력 조회 성공",
    schema: {
      example: {
        data: [
          {
            id: "attendance-uuid",
            memberName: "홍길동",
            className: "신규 수강생반",
            scheduledDate: "2026-01-05T16:00:00Z",
            attendanceStatus: "present",
            checkedInAt: "2026-01-05T16:05:00Z",
          },
        ],
        pagination: {
          total: 100,
          page: 1,
          limit: 20,
          totalPages: 5,
        },
      },
    },
  })
  async getAttendanceHistory(
    @Request() req: AuthenticatedRequest,
    @Query("teamId") teamId?: string,
    @Query("classId") classId?: string,
    @Query("memberId") memberId?: string,
    @Query("status") status?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.attendanceService.getAttendanceHistory(
      req.user.id,
      {
        teamId,
        classId,
        memberId,
        status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * 관리자 전체 출석 통계 (기간별 집계)
   * NOTE: 이 라우트는 반드시 :attendanceId 파라미터 라우트보다 위에 위치해야 합니다.
   *       NestJS는 라우트를 위→아래 순으로 매칭하므로 "admin"이 :attendanceId로 캡처되는 것을 방지합니다.
   */
  @Get("admin/statistics")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "관리자 출석 통계",
    description:
      "전체 또는 특정 클럽/수업의 기간별 출석 통계를 조회합니다. (관리자/감독/코치)",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description: "클럽 ID (미입력 시 전체)",
  })
  @ApiQuery({
    name: "classId",
    required: false,
    description: "수업 ID (미입력 시 전체)",
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
  @ApiResponse({
    status: 200,
    description: "출석 통계 조회 성공",
    schema: {
      example: {
        success: true,
        data: {
          period: {
            startDate: "2026-03-01T00:00:00Z",
            endDate: "2026-03-31T23:59:59Z",
          },
          totalAttendances: 960,
          attendanceRate: "89.6",
          summary: {
            totalSessions: 120,
            totalAttendances: 960,
            presentCount: 820,
            absentCount: 140,
            presentRate: "85.4",
          },
          dailyStats: [
            {
              date: "2026-03-01",
              count: 32,
              rate: "87.5",
              present: 28,
              absent: 4,
            },
          ],
          classStats: [
            {
              classId: "class-uuid",
              className: "신규 수강생반",
              rate: "85.0",
              sessions: 10,
              totalAttendances: 80,
            },
          ],
          byClub: [
            {
              teamId: "club-uuid",
              name: "ICE TIGERS",
              sessions: 60,
              totalAttendances: 480,
              presentRate: "91.7",
            },
          ],
        },
      },
    },
  })
  async getAdminAttendanceStatistics(
    @Query("teamId") teamId?: string,
    @Query("classId") classId?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const data = await this.attendanceService.getAdminAttendanceStatistics({
      teamId,
      classId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    return { success: true, data };
  }

  /**
   * 출석 상세 조회
   */
  @Get(":attendanceId")
  @Roles("COACH", "PARENT", "ADMIN")
  @ApiOperation({
    summary: "출석 상세 조회",
    description: "특정 출석 기록의 상세 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "출석 상세 조회 성공",
    schema: {
      example: {
        id: "attendance-uuid",
        memberId: "member-uuid",
        memberName: "홍길동",
        scheduleId: "schedule-uuid",
        className: "신규 수강생반",
        scheduledDate: "2026-01-05T16:00:00Z",
        attendanceStatus: "present",
        checkedInAt: "2026-01-05T16:05:00Z",
        creditDeducted: true,
        note: null,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "출석 기록을 찾을 수 없습니다.",
  })
  async getAttendanceDetail(
    @Param("attendanceId") attendanceId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendanceService.getAttendanceDetail(
      attendanceId,
      req.user.id,
      req.user.userType,
    );
  }

  /**
   * 출석 상태 수정
   */
  @Patch(":attendanceId")
  @Roles("COACH", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "출석 상태 수정",
    description: "출석 상태를 수정합니다. (코치/관리자 전용)",
  })
  @ApiResponse({
    status: 200,
    description: "출석 상태 수정 성공",
    schema: {
      example: {
        id: "attendance-uuid",
        attendanceStatus: "absent",
        note: "현장 확인 결과 결석으로 정정",
        updatedAt: "2026-01-05T18:00:00Z",
        updatedBy: "coach-uuid",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "출석 기록을 찾을 수 없습니다.",
  })
  async updateAttendance(
    @Request() req: AuthenticatedRequest,
    @Param("attendanceId") attendanceId: string,
    @Body() updateAttendanceDto: UpdateAttendanceDto,
  ) {
    return this.attendanceService.updateAttendance(
      req.user.id,
      attendanceId,
      updateAttendanceDto,
    );
  }

  /**
   * 클럽 전체 출석 통계
   */
  @Get("stats/club/:teamId")
  @Roles("COACH", "ADMIN")
  @ApiOperation({
    summary: "클럽 출석 통계",
    description: "클럽의 전체 출석 통계를 조회합니다.",
  })
  @ApiQuery({ name: "startDate", required: false, description: "시작일" })
  @ApiQuery({ name: "endDate", required: false, description: "종료일" })
  @ApiResponse({
    status: 200,
    description: "클럽 출석 통계 조회 성공",
    schema: {
      example: {
        teamId: "club-uuid",
        totalSessions: 50,
        totalAttendances: 400,
        presentCount: 350,
        absentCount: 50,
        presentRate: "87.5",
        byClass: [
          {
            classId: "class-uuid",
            className: "신규 수강생반",
            sessions: 10,
            presentRate: "85.0",
          },
        ],
      },
    },
  })
  async getClubAttendanceStats(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.attendanceService.getClubAttendanceStats(
      req.user.id,
      teamId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
