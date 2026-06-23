import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 관리자 대시보드 통계
   */
  async getAdminDashboard(startDate?: Date, endDate?: Date) {
    // W2: Redis 캐시 (기본 조회: 날짜 범위 없는 경우만, TTL 30s)
    const useCache = !startDate && !endDate;
    const cacheKey = "dashboard:admin:today";
    if (useCache) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cached = await this.redis.get<any>(cacheKey);
      if (cached) return cached;
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const monthStart =
        startDate || new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd =
        endDate || new Date(today.getFullYear(), today.getMonth() + 1, 0);

      // 7일 전 날짜
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 6);

      // 전월 마지막 날
      const previousMonthEnd = new Date(
        today.getFullYear(),
        today.getMonth(),
        0,
      );

      // 월간 목표 상수
      const MONTHLY_REVENUE_TARGET = 10_000_000;

      // 출석 where 조건
      const attendanceWhere = {
        schedule: {
          scheduledDate: { gte: today, lt: tomorrow },
        },
      };

      // === 단일 Promise.all 통합 (21개 쿼리 전체 병렬화, W1 최적화) ===
      const [
        // 사용자 통계
        totalUsers,
        newUsersThisMonth,
        usersByType,
        // 클럽 통계
        totalClubs,
        totalMembers,
        activeClubsAgg,
        // 결제 통계 + 신규 필드
        totalRevenueAgg,
        monthRevenueAgg,
        refundAgg,
        pendingApprovals,
        recentPaymentsRaw,
        todayRevenueAgg,
        weeklyPayments,
        recentOrdersRaw,
        pendingPayments,
        pendingEnrollments,
        previousMonthMembersCount,
        // 출석 + 차트 (기존 2차 블록)
        todayTotal,
        todayPresent,
        revenueByMonth,
        membersByMonth,
        // W6
        latestNotices,
      ] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: {
            createdAt: { gte: monthStart, lte: monthEnd },
          },
        }),
        this.prisma.user.groupBy({
          by: ["userType"],
          _count: true,
        }),
        this.prisma.team.count(),
        this.prisma.teamMember.count({
          where: { approvalStatus: "approved" },
        }),
        this.prisma.teamMember.groupBy({
          by: ["teamId"],
          where: { approvalStatus: "approved" },
          _count: { teamId: true },
        }),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { paymentStatus: "completed" },
        }),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: {
            paymentStatus: "completed",
            createdAt: { gte: monthStart, lte: monthEnd },
          },
        }),
        this.prisma.refundLog.aggregate({
          _sum: { refundAmount: true },
        }),
        this.prisma.teamMember.count({
          where: { approvalStatus: "pending" },
        }),
        this.prisma.payment.findMany({
          where: { paymentStatus: "completed" },
          orderBy: { completedAt: "desc" },
          take: 3,
          select: {
            id: true,
            amount: true,
            completedAt: true,
            product: { select: { productName: true } },
            user: { select: { firstName: true, lastName: true } },
          },
        }),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: {
            paymentStatus: "completed",
            completedAt: { gte: today, lt: tomorrow },
          },
        }),
        this.prisma.payment.findMany({
          where: {
            paymentStatus: "completed",
            completedAt: { gte: sevenDaysAgo },
          },
          select: { amount: true, completedAt: true },
        }),
        this.prisma.shopOrder.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            paymentAmount: true,
            orderStatus: true,
            createdAt: true,
            user: { select: { firstName: true, lastName: true } },
            items: {
              take: 1,
              orderBy: { createdAt: "asc" },
              select: { productName: true },
            },
          },
        }),
        this.prisma.payment.count({ where: { paymentStatus: "pending" } }),
        this.prisma.enrollment.count({
          where: { status: { in: ["pending", "pending_approval"] } },
        }),
        this.prisma.teamMember.count({
          where: {
            approvalStatus: "approved",
            joinedAt: { lte: previousMonthEnd },
          },
        }),
        // 기존 2차 블록 통합
        this.prisma.classAttendance.count({ where: attendanceWhere }),
        this.prisma.classAttendance.count({
          where: {
            ...attendanceWhere,
            attendanceStatus: { in: ["present", "late"] },
          },
        }),
        this.getRevenueByMonth(6),
        this.getMembersByMonth(6),
        // W6: 프론트 NoticeSection 중복 API 제거 — 대시보드 응답에 통합
        // targetType: null(미지정), "all", "admin"만 관리자에게 노출
        this.prisma.systemNotice.findMany({
          where: {
            isActive: true,
            OR: [
              { targetType: null },
              { targetType: "all" },
              { targetType: "admin" },
            ],
          },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
          take: 5,
          select: {
            id: true,
            title: true,
            targetType: true,
            createdAt: true,
            pinned: true,
          },
        }),
      ]);

      // 1차 Promise.all 이후 파생 데이터 계산
      const activeClubs = activeClubsAgg.length;
      const byType: Record<string, number> = {};
      usersByType.forEach((u) => {
        byType[u.userType] = u._count;
      });

      const totalRevenue = Number(totalRevenueAgg._sum.amount ?? 0);
      const monthRevenue = Number(monthRevenueAgg._sum.amount ?? 0);
      const refundedAmount = Number(refundAgg._sum.refundAmount ?? 0);

      // recentPayments 매핑
      const recentPayments = recentPaymentsRaw.map((p) => ({
        id: p.id,
        memberName:
          `${p.user.lastName ?? ""}${p.user.firstName ?? ""}`.trim() ||
          "알 수 없음",
        description: p.product?.productName ?? "기타 결제",
        amount: Number(p.amount),
        completedAt: p.completedAt,
      }));

      // 금일 매출
      const todayRevenue = Number(todayRevenueAgg._sum.amount ?? 0);

      // 최근 7일 일별 매출 집계
      const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];
      const weeklyRevenue: {
        date: string;
        revenue: number;
        label: string;
      }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
        const dayRevenue = weeklyPayments
          .filter((p) => {
            if (!p.completedAt) return false;
            const pd = new Date(p.completedAt);
            return (
              pd.getFullYear() === d.getFullYear() &&
              pd.getMonth() === d.getMonth() &&
              pd.getDate() === d.getDate()
            );
          })
          .reduce((sum, p) => sum + Number(p.amount), 0);
        weeklyRevenue.push({
          date: dateStr,
          revenue: dayRevenue,
          label: dayLabels[d.getDay()],
        });
      }

      // 월간 목표 달성률
      const monthlyGoal = {
        target: MONTHLY_REVENUE_TARGET,
        current: monthRevenue,
        rate: Math.min(
          100,
          Math.round((monthRevenue / MONTHLY_REVENUE_TARGET) * 100),
        ),
      };

      // 최근 주문 매핑
      const recentOrders = recentOrdersRaw.map((o) => ({
        id: o.id,
        memberName:
          `${o.user.lastName ?? ""}${o.user.firstName ?? ""}`.trim() ||
          "알 수 없음",
        productName: o.items[0]?.productName ?? "기타",
        amount: o.paymentAmount,
        status: o.orderStatus,
        orderedAt: o.createdAt,
      }));

      // 대기 처리 건수
      const pendingItems = {
        pendingApprovals,
        pendingPayments,
        pendingEnrollments,
      };

      // 회원 증감률
      const growthRate =
        previousMonthMembersCount > 0
          ? Math.round(
              ((totalMembers - previousMonthMembersCount) /
                previousMonthMembersCount) *
                1000,
            ) / 10
          : 0;
      const memberGrowth = {
        activeMembers: totalMembers,
        previousMonthMembers: previousMonthMembersCount,
        growthRate,
      };

      // 출석률 계산 (1차 Promise.all에서 이미 병렬 조회됨)
      const presentRate =
        todayTotal > 0 ? ((todayPresent / todayTotal) * 100).toFixed(1) : "0";

      // 월간 매출 추이 (한글 월 이름 포맷)
      const monthlyRevenueTrend = revenueByMonth.map((item) => {
        const [, month] = item.month.split("-");
        return { month: `${parseInt(month, 10)}월`, revenue: item.revenue };
      });

      const result = {
        users: {
          total: totalUsers,
          newThisMonth: newUsersThisMonth,
          byType,
        },
        clubs: {
          total: totalClubs,
          activeClubs,
          totalMembers,
        },
        payments: {
          totalRevenue,
          monthRevenue,
          refundedAmount,
          netRevenue: totalRevenue - refundedAmount,
        },
        attendance: {
          todayTotal,
          todayPresent,
          presentRate,
        },
        charts: {
          revenueByMonth,
          membersByMonth,
        },
        pendingApprovals,
        recentPayments,
        todayRevenue,
        weeklyRevenue,
        monthlyGoal,
        monthlyRevenueTrend,
        recentOrders,
        pendingItems,
        todayAttendance: todayPresent,
        memberGrowth,
        // W6: NoticeSection 중복 API 제거
        latestNotices,
      };

      // W2: 캐시 저장 (TTL 30s)
      if (useCache) {
        await this.redis.set(cacheKey, result, 30);
      }
      return result;
    } catch (error) {
      this.logger.error(
        "getAdminDashboard error:",
        error instanceof Error ? error.stack : error,
      );
      return {
        users: { total: 0, newThisMonth: 0, byType: {} },
        clubs: { total: 0, activeClubs: 0, totalMembers: 0 },
        payments: {
          totalRevenue: 0,
          monthRevenue: 0,
          refundedAmount: 0,
          netRevenue: 0,
          totalOrders: 0,
        },
        attendance: { todayTotal: 0, todayPresent: 0, presentRate: "0" },
        charts: { revenueByMonth: [], membersByMonth: [] },
        pendingApprovals: 0,
        recentPayments: [],
        todayRevenue: 0,
        weeklyRevenue: [],
        monthlyGoal: { target: 10000000, current: 0, rate: 0 },
        monthlyRevenueTrend: [],
        recentOrders: [],
        pendingItems: {
          pendingApprovals: 0,
          pendingPayments: 0,
          pendingEnrollments: 0,
        },
        todayAttendance: 0,
        memberGrowth: {
          activeMembers: 0,
          previousMonthMembers: 0,
          growthRate: 0,
        },
        latestNotices: [],
      };
    }
  }

  /**
   * 월별 매출 조회
   * N+1 방지: 단일 쿼리로 기간 내 전체 결제 조회 후 JS에서 월별 집계
   */
  async getRevenueByMonth(months: number) {
    const today = new Date();
    const rangeStart = new Date(
      today.getFullYear(),
      today.getMonth() - (months - 1),
      1,
    );

    const payments = await this.prisma.payment.findMany({
      where: {
        paymentStatus: "completed",
        createdAt: { gte: rangeStart },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    const revenueMap = new Map<string, number>();
    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
      revenueMap.set(monthStr, 0);
    }

    for (const p of payments) {
      const d = p.createdAt;
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = revenueMap.get(monthStr);
      if (existing !== undefined) {
        revenueMap.set(monthStr, existing + Number(p.amount));
      }
    }

    return Array.from(revenueMap.entries()).map(([month, revenue]) => ({
      month,
      revenue,
    }));
  }

  /**
   * 월별 회원 수 조회 (누적)
   * W7-1: JS 메모리 집계(전체 회원 findMany) → PostgreSQL generate_series + LEFT JOIN 단일 쿼리
   *       회원 1만명 기준 예상 -200ms, 메모리 -90%
   */
  async getMembersByMonth(months: number) {
    const today = new Date();
    const rangeStart = new Date(
      today.getFullYear(),
      today.getMonth() - (months - 1),
      1,
    );
    const rangeEnd = new Date(today.getFullYear(), today.getMonth(), 1);

    // PostgreSQL 단일 쿼리: 각 월말 시점까지 누적 승인 회원 수
    const rows = await this.prisma.$queryRaw<
      Array<{ month: string; count: bigint | number }>
    >`
      WITH months AS (
        SELECT generate_series(
          ${rangeStart}::timestamp,
          ${rangeEnd}::timestamp,
          '1 month'::interval
        ) AS m
      )
      SELECT
        TO_CHAR(months.m, 'YYYY-MM') AS month,
        COUNT(cm.id)::int AS count
      FROM months
      LEFT JOIN "club_members" cm
        ON cm.approval_status = 'approved'
        AND cm.joined_at < (months.m + INTERVAL '1 month')
      GROUP BY months.m
      ORDER BY months.m ASC
    `;

    return rows.map((r) => ({
      month: r.month,
      count: typeof r.count === "bigint" ? Number(r.count) : r.count,
    }));
  }
}
