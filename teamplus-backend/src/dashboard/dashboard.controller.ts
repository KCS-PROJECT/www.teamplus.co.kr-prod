import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { DashboardService } from "./dashboard.service";
import { DailyMetricsService } from "./daily-metrics.service";
import { CalendarDashboardService } from "./calendar-dashboard.service";
import { ChildDashboardService } from "./child-dashboard.service";
import { CoachDashboardService } from "./coach-dashboard.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Dashboard")
@Controller("api/v1/dashboard")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly dailyMetricsService: DailyMetricsService,
    private readonly calendarDashboardService: CalendarDashboardService,
    private readonly childDashboardService: ChildDashboardService,
    private readonly coachDashboardService: CoachDashboardService,
  ) {}

  /**
   * 통합 캘린더 이벤트 조회
   *
   * 팀 훈련(red), 개인 레슨(green), 대회(blue)를 통합하여
   * 날짜순으로 반환합니다.
   */
  @Get("calendar")
  @Roles("COACH", "DIRECTOR", "PARENT", "TEEN", "CHILD", "ADMIN")
  @ApiOperation({
    summary: "통합 캘린더 이벤트 조회",
    description:
      "팀 훈련(red), 개인 레슨(green), 대회(blue)를 통합하여 날짜순으로 반환합니다.",
  })
  @ApiQuery({
    name: "month",
    required: true,
    description: "조회 월 (YYYY-MM)",
    example: "2026-04",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description: "특정 클럽 필터 (미지정 시 소속 전체 클럽)",
  })
  @ApiResponse({
    status: 200,
    description: "캘린더 이벤트 조회 성공",
    schema: {
      example: {
        events: [
          {
            id: "schedule-id",
            type: "training",
            color: "red",
            title: "팀 훈련",
            date: "2026-04-05",
            startTime: "18:00",
            endTime: "20:00",
            venue: "분당아이스아레나",
            teamId: "club-id",
            name: "ICE HOCKEY CLUB",
            meta: {
              classId: "class-id",
              trainingType: "REGULAR_TRAINING",
              instructorName: "김코치",
            },
          },
          {
            id: "schedule-id-2",
            type: "lesson",
            color: "green",
            title: "개인 레슨",
            date: "2026-04-06",
            startTime: "10:00",
            endTime: "11:00",
            venue: "ICE HOCKEY CLUB",
            teamId: "club-id",
            name: "ICE HOCKEY CLUB",
            meta: {
              classId: "class-id",
              trainingType: "lesson",
              instructorName: "박코치",
            },
          },
          {
            id: "tournament-id_2026-04-10",
            type: "tournament",
            color: "blue",
            title: "i-League U12",
            date: "2026-04-10",
            startTime: null,
            endTime: null,
            venue: "태릉국제빙상장",
            teamId: "club-id",
            name: "ICE HOCKEY CLUB",
            meta: {
              tournamentId: "tournament-id",
              status: "scheduled",
              startDate: "2026-04-10",
              endDate: "2026-04-12",
            },
          },
        ],
      },
    },
  })
  async getCalendarEvents(
    @Request() req: AuthenticatedRequest,
    @Query("month") month: string,
    @Query("teamId") teamId?: string,
  ) {
    return this.calendarDashboardService.getCalendarEvents(
      req.user.id,
      req.user.userType,
      month,
      teamId,
    );
  }

  /**
   * 코치 대시보드 통계
   */
  @Get("coach")
  @Roles("COACH", "DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "코치 대시보드 통계",
    description: "코치용 대시보드 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "대시보드 통계 조회 성공",
    schema: {
      example: {
        clubs: {
          total: 3,
          activeMembers: 45,
          pendingMembers: 5,
        },
        classes: {
          total: 10,
          todaySchedules: 3,
          weekSchedules: 15,
        },
        attendance: {
          todayPresent: 25,
          todayAbsent: 5,
          weekPresentRate: "85.0",
        },
        payments: {
          monthRevenue: 7200000,
          monthPayments: 30,
          pendingPayments: 3,
        },
        recentActivities: [
          {
            type: "attendance",
            message: "홍길동 출석 체크",
            createdAt: "2026-01-11T10:00:00Z",
          },
        ],
      },
    },
  })
  async getCoachDashboard(@Request() req: AuthenticatedRequest) {
    return this.dashboardService.getCoachDashboard(req.user.id);
  }

  /**
   * W3: 학생(child/teen) 홈 대시보드 통합 엔드포인트
   * 기존 3 RTT (/clubs/my/list → /clubs/{id} → /attendance) → 1 RTT
   */
  @Get("child-home")
  @Roles("CHILD", "TEEN", "PARENT", "ADMIN")
  @ApiOperation({
    summary: "학생(child/teen) 홈 통합 조회",
    description:
      "클럽 멤버십 · 오늘 수업 · 주간 출석 기록 · 스트릭을 단일 응답으로 반환합니다 (W3 최적화).",
  })
  @ApiResponse({
    status: 200,
    description: "학생 홈 데이터 조회 성공",
    schema: {
      example: {
        name: "분당 아이스하키 클럽",
        coachName: "김코치",
        todayClass: {
          title: "정규 훈련",
          startTime: "18:00",
          endTime: "20:00",
          coach: "김코치",
        },
        weekRecords: [{ date: "2026-04-13T00:00:00.000Z", status: "present" }],
        streakCount: 3,
      },
    },
  })
  async getChildHome(@Request() req: AuthenticatedRequest) {
    const userType =
      req.user.userType === "TEEN" || req.user.userType === "CHILD"
        ? req.user.userType
        : undefined;
    return this.childDashboardService.getChildHome(req.user.id, userType);
  }

  /**
   * 학부모 대시보드 통계
   */
  @Get("parent")
  @Roles("PARENT", "ADMIN")
  @ApiOperation({
    summary: "학부모 대시보드 통계",
    description: "학부모용 대시보드 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "대시보드 통계 조회 성공",
    schema: {
      example: {
        children: [
          {
            id: "member-uuid",
            name: "홍길동",
            teamBelonging: "ICE HOCKEY CLUB",
            className: "신규 수강생반",
            remainingCredits: 5,
            nextClass: "2026-01-12T16:00:00Z",
          },
        ],
        attendance: {
          monthPresent: 8,
          monthAbsent: 1,
          presentRate: "88.9",
        },
        payments: {
          recentPayment: {
            id: "payment-uuid",
            amount: 240000,
            createdAt: "2026-01-05T10:00:00Z",
          },
          totalPaidThisMonth: 240000,
        },
        upcomingSchedules: [
          {
            className: "신규 수강생반",
            scheduledDate: "2026-01-12T16:00:00Z",
          },
        ],
      },
    },
  })
  async getParentDashboard(@Request() req: AuthenticatedRequest) {
    return this.dashboardService.getParentDashboard(req.user.id);
  }

  /**
   * 관리자 대시보드 통계
   */
  @Get("admin")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "관리자 대시보드 통계",
    description: "관리자용 대시보드 통계를 조회합니다.",
  })
  @ApiQuery({ name: "startDate", required: false, description: "시작일" })
  @ApiQuery({ name: "endDate", required: false, description: "종료일" })
  @ApiResponse({
    status: 200,
    description: "대시보드 통계 조회 성공",
    schema: {
      example: {
        users: {
          total: 150,
          newThisMonth: 20,
          byType: {
            PARENT: 100,
            COACH: 15,
            CHILD: 30,
            ADMIN: 5,
          },
        },
        clubs: {
          total: 10,
          activeClubs: 8,
          totalMembers: 200,
        },
        payments: {
          totalRevenue: 28800000,
          monthRevenue: 7200000,
          refundedAmount: 480000,
          netRevenue: 28320000,
        },
        attendance: {
          todayTotal: 50,
          todayPresent: 45,
          presentRate: "90.0",
        },
        charts: {
          revenueByMonth: [
            { month: "2025-12", revenue: 6000000 },
            { month: "2026-01", revenue: 7200000 },
          ],
          membersByMonth: [
            { month: "2025-12", count: 180 },
            { month: "2026-01", count: 200 },
          ],
        },
      },
    },
  })
  async getAdminDashboard(
    @Request() _req: any,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.dashboardService.getAdminDashboard(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * 대시보드 요약 통계 (공통)
   */
  @Get("summary")
  @Roles("COACH", "DIRECTOR", "PARENT", "ADMIN")
  @ApiOperation({
    summary: "대시보드 요약 통계",
    description: "역할에 맞는 요약 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "요약 통계 조회 성공",
  })
  async getDashboardSummary(@Request() req: AuthenticatedRequest) {
    return this.dashboardService.getDashboardSummary(
      req.user.id,
      req.user.userType,
    );
  }

  /**
   * 최근 활동 조회
   */
  @Get("activities")
  @Roles("COACH", "DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "최근 활동 조회",
    description: "최근 활동 내역을 조회합니다.",
  })
  @ApiQuery({ name: "limit", required: false, description: "조회 개수" })
  @ApiResponse({
    status: 200,
    description: "활동 내역 조회 성공",
    schema: {
      example: [
        {
          id: "activity-uuid",
          type: "attendance",
          message: "홍길동 출석 체크",
          userId: "user-uuid",
          createdAt: "2026-01-11T10:00:00Z",
        },
      ],
    },
  })
  async getRecentActivities(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limit?: string,
  ) {
    return this.dashboardService.getRecentActivities(
      req.user.id,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  // =========================================
  // Advanced Statistics Endpoints
  // =========================================

  /**
   * 매출 상세 분석
   */
  @Get("analytics/revenue")
  @Roles("COACH", "DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "매출 상세 분석",
    description:
      "매출 추이, 상품별 매출, 환불 분석 등 상세 매출 데이터를 조회합니다.",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description: "클럽 ID (관리자용)",
  })
  @ApiQuery({
    name: "period",
    required: false,
    description: "분석 기간 (개월, 기본값: 6)",
  })
  @ApiResponse({
    status: 200,
    description: "매출 분석 조회 성공",
    schema: {
      example: {
        summary: {
          currentMonthRevenue: 7200000,
          lastMonthRevenue: 6500000,
          growthRate: "10.8",
          totalPayments: 30,
          averageAmount: 240000,
        },
        monthlyTrend: [
          { month: "2025-12", revenue: 6500000, count: 27, avgAmount: 240741 },
          { month: "2026-01", revenue: 7200000, count: 30, avgAmount: 240000 },
        ],
        dailyTrend: [
          { date: "2026-01-11", revenue: 480000 },
          { date: "2026-01-12", revenue: 720000 },
        ],
        byProduct: [
          { productName: "기초반", revenue: 4800000, count: 20 },
          { productName: "심화반", revenue: 2400000, count: 10 },
        ],
        refunds: {
          totalAmount: 480000,
          count: 2,
          rate: "6.7",
        },
      },
    },
  })
  async getRevenueAnalytics(
    @Request() req: AuthenticatedRequest,
    @Query("teamId") teamId?: string,
    @Query("period") period?: string,
  ) {
    return this.dashboardService.getRevenueAnalytics(
      req.user.id,
      req.user.userType,
      teamId,
      this.resolvePeriodMonths(period),
    );
  }

  /**
   * period 쿼리를 개월 수로 정규화.
   * 숫자("6") → 그대로, 별칭("monthly", "weekly", "yearly") → 매핑,
   * 그 외/미지정 → 기본 6.
   */
  private resolvePeriodMonths(period?: string): number {
    if (!period) return 6;
    const aliasMap: Record<string, number> = {
      weekly: 1,
      monthly: 6,
      quarterly: 3,
      yearly: 12,
    };
    const alias = aliasMap[period.toLowerCase()];
    if (alias) return alias;
    const parsed = parseInt(period, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
  }

  /**
   * 출석 상세 분석
   */
  @Get("analytics/attendance")
  @Roles("COACH", "DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "출석 상세 분석",
    description:
      "출석률 추이, 요일별/시간대별 패턴, 클래스별 분석 등 상세 출석 데이터를 조회합니다.",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description: "클럽 ID (관리자용)",
  })
  @ApiQuery({
    name: "period",
    required: false,
    description: "분석 기간 (개월, 기본값: 3)",
  })
  @ApiResponse({
    status: 200,
    description: "출석 분석 조회 성공",
    schema: {
      example: {
        summary: {
          currentMonthRate: "88.5",
          totalSessions: 450,
          avgPresentRate: "86.3",
        },
        monthlyTrend: [
          {
            month: "2025-12",
            present: 120,
            absent: 15,
            late: 10,
            rate: "89.7",
          },
          {
            month: "2026-01",
            present: 150,
            absent: 18,
            late: 12,
            rate: "90.0",
          },
        ],
        weekdayPattern: [
          { day: "월", present: 85, absent: 10, rate: "89.5" },
          { day: "화", present: 90, absent: 8, rate: "91.8" },
        ],
        hourlyPattern: [
          { hour: 16, count: 120 },
          { hour: 17, count: 95 },
        ],
        byClass: [
          {
            classId: "uuid",
            className: "기초반",
            totalAttendances: 200,
            presentCount: 180,
            attendanceRate: "90.0",
          },
        ],
      },
    },
  })
  async getAttendanceAnalytics(
    @Request() req: AuthenticatedRequest,
    @Query("teamId") teamId?: string,
    @Query("period") period?: string,
  ) {
    return this.dashboardService.getAttendanceAnalytics(
      req.user.id,
      req.user.userType,
      teamId,
      period ? parseInt(period, 10) : 3,
    );
  }

  /**
   * 회원 상세 분석
   */
  @Get("analytics/members")
  @Roles("COACH", "DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "회원 상세 분석",
    description:
      "회원 성장 추이, 연령대 분포, 크레딧 현황 등 상세 회원 데이터를 조회합니다.",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description: "클럽 ID (관리자용)",
  })
  @ApiQuery({
    name: "period",
    required: false,
    description: "분석 기간 (개월, 기본값: 6)",
  })
  @ApiResponse({
    status: 200,
    description: "회원 분석 조회 성공",
    schema: {
      example: {
        summary: {
          totalActiveMembers: 45,
          newMembersThisMonth: 5,
          growthRate: "12.5",
          avgAge: 10,
        },
        monthlyTrend: [
          { month: "2025-12", newMembers: 4, cumulativeTotal: 40 },
          { month: "2026-01", newMembers: 5, cumulativeTotal: 45 },
        ],
        statusDistribution: {
          approved: 45,
          pending: 3,
          rejected: 2,
        },
        ageDistribution: {
          "0-6세": 5,
          "7-9세": 15,
          "10-12세": 18,
          "13-15세": 5,
          "16세 이상": 2,
        },
        clubDistribution: [
          { teamId: "uuid", name: "ICE HOCKEY CLUB", memberCount: 25 },
        ],
        credits: {
          totalRemainingCredits: 180,
          avgCreditsPerMember: 4,
          membersWithCredits: 40,
        },
      },
    },
  })
  async getMemberAnalytics(
    @Request() req: AuthenticatedRequest,
    @Query("teamId") teamId?: string,
    @Query("period") period?: string,
  ) {
    return this.dashboardService.getMemberAnalytics(
      req.user.id,
      req.user.userType,
      teamId,
      period ? parseInt(period, 10) : 6,
    );
  }

  /**
   * 수업 성과 분석
   */
  @Get("analytics/classes")
  @Roles("COACH", "DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "수업 성과 분석",
    description:
      "수업별 등록 현황, 출석률, 매출 등 수업 성과 데이터를 조회합니다.",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description: "클럽 ID (관리자용)",
  })
  @ApiResponse({
    status: 200,
    description: "수업 성과 분석 조회 성공",
    schema: {
      example: {
        summary: {
          totalClasses: 5,
          totalEnrolled: 45,
          totalCapacity: 60,
          overallCapacityRate: "75.0",
          avgAttendanceRate: "88.5",
          totalRevenue: 10800000,
        },
        classDetails: [
          {
            classId: "uuid",
            className: "기초반",
            ageRange: "7-10세",
            capacity: 15,
            enrolledCount: 12,
            capacityRate: "80.0",
            attendanceRate: "90.5",
            revenue: 2880000,
            totalSchedules: 24,
            cancelledSchedules: 1,
            operationRate: "95.8",
          },
        ],
        popularClasses: [
          { classId: "uuid", className: "기초반", enrolledCount: 12 },
        ],
        highRevenueClasses: [
          { classId: "uuid", className: "기초반", revenue: 2880000 },
        ],
      },
    },
  })
  async getClassPerformanceAnalytics(
    @Request() req: AuthenticatedRequest,
    @Query("teamId") teamId?: string,
  ) {
    return this.dashboardService.getClassPerformanceAnalytics(
      req.user.id,
      req.user.userType,
      teamId,
    );
  }

  /**
   * 감독 대시보드 통계
   *
   * [수정 2026-04-30] 사용자 요청 — COACH 도 감독 대시보드와 동일 화면을 보도록 허용.
   * 서비스 측 TeamRoster(HEAD_COACH/COACH) 기반 조회로 코치 본인 팀 통계 정확히 반환됨.
   */
  @Get("director")
  @Roles("DIRECTOR", "COACH", "ADMIN", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "감독 대시보드 통계",
    description: "감독용 대시보드 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "대시보드 통계 조회 성공",
  })
  async getDirectorDashboard(@Request() req: AuthenticatedRequest) {
    return this.dashboardService.getDirectorDashboard(req.user.id);
  }

  // ================ Daily Metrics ================

  /**
   * 일간 통계 수동 집계 (관리자 전용)
   */
  @Post("metrics/aggregate")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "일간 통계 수동 집계",
    description:
      "특정 날짜의 일간 통계를 수동으로 재집계합니다. date 미지정 시 전날 기준.",
  })
  @ApiQuery({
    name: "date",
    required: false,
    description: "집계 대상 날짜 (YYYY-MM-DD)",
  })
  @ApiResponse({ status: 200, description: "집계 완료" })
  async aggregateMetrics(@Query("date") dateStr?: string) {
    const date = dateStr ? new Date(dateStr) : new Date(Date.now() - 86400000);
    return this.dailyMetricsService.aggregateForDate(date);
  }

  /**
   * 일간 통계 조회
   */
  @Get("metrics")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "일간 통계 조회",
    description: "특정 클럽의 일간 통계를 기간별로 조회합니다.",
  })
  @ApiQuery({ name: "teamId", required: true })
  @ApiQuery({
    name: "startDate",
    required: true,
    description: "시작일 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: true,
    description: "종료일 (YYYY-MM-DD)",
  })
  @ApiResponse({ status: 200, description: "통계 조회 성공" })
  async getMetrics(
    @Query("teamId") teamId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.dailyMetricsService.getMetrics(
      teamId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * 미결제 학부모 조회 (코치 대시보드)
   *
   * 코치가 담당하는 수업에서 지정 월 기준 paid Enrollment 가 없는 학부모 목록 반환.
   */
  @Get("coach/unpaid-members")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "미결제 학부모 조회",
    description:
      "코치 담당 수업 중 지정 월(YYYY-MM)에 결제가 완료되지 않은 학부모 목록을 반환합니다.",
  })
  @ApiQuery({
    name: "month",
    required: true,
    description: "조회 월 (YYYY-MM)",
    example: "2026-06",
  })
  @ApiResponse({
    status: 200,
    description: "미결제 학부모 목록 조회 성공",
    schema: {
      example: {
        month: "2026-06",
        count: 2,
        members: [
          {
            userId: "user-uuid",
            parentName: "홍길동",
            childName: "홍길순",
            classId: "class-uuid",
            className: "아이스하키 입문반",
            billingPeriod: "2026-06",
          },
        ],
      },
    },
  })
  async getUnpaidMembers(
    @Request() req: AuthenticatedRequest,
    @Query("month") month: string,
  ) {
    return this.coachDashboardService.getUnpaidMembers(req.user.id, month);
  }
}
