import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class AnalyticsDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 역할에 따른 클럽 ID 목록 조회 (공통 유틸)
   */
  private async resolveClubIds(
    userId: string,
    userType: string,
    teamId?: string,
  ): Promise<string[]> {
    if (userType === "COACH") {
      const clubs = await this.prisma.team.findMany({
        where: { coachId: userId },
        select: { id: true },
      });
      return clubs.map((c) => c.id);
    }
    if (teamId) {
      return [teamId];
    }
    return [];
  }

  /**
   * 매출 상세 분석
   */
  async getRevenueAnalytics(
    userId: string,
    userType: string,
    teamId?: string,
    period: number = 6,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clubIds = await this.resolveClubIds(userId, userType, teamId);

    const whereClause =
      clubIds.length > 0
        ? {
            user: {
              teamMembers: {
                some: { teamId: { in: clubIds } },
              },
            },
          }
        : {};

    // 월별 매출 추이 (N+1 방지: 단일 쿼리 후 JS 집계)
    const analyticsRangeStart = new Date(
      today.getFullYear(),
      today.getMonth() - (period - 1),
      1,
    );
    const allMonthlyPayments = await this.prisma.payment.findMany({
      where: {
        ...whereClause,
        paymentStatus: "completed",
        createdAt: { gte: analyticsRangeStart },
      },
      select: { amount: true, createdAt: true },
    });

    // 월별 집계 초기화
    const monthlyRevenueMap = new Map<
      string,
      { revenue: number; count: number }
    >();
    for (let i = period - 1; i >= 0; i--) {
      const ms = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStr = `${ms.getFullYear()}-${String(ms.getMonth() + 1).padStart(2, "0")}`;
      monthlyRevenueMap.set(monthStr, { revenue: 0, count: 0 });
    }
    for (const p of allMonthlyPayments) {
      const d = p.createdAt;
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = monthlyRevenueMap.get(monthStr);
      if (bucket) {
        bucket.revenue += Number(p.amount);
        bucket.count += 1;
      }
    }

    const monthlyRevenue = Array.from(monthlyRevenueMap.entries()).map(
      ([month, { revenue, count }]) => ({
        month,
        revenue,
        count,
        avgAmount: count > 0 ? Math.round(revenue / count) : 0,
      }),
    );

    // 이번 달 vs 지난 달 비교
    const thisMonth = monthlyRevenue[monthlyRevenue.length - 1];
    const lastMonth = monthlyRevenue[monthlyRevenue.length - 2];
    const growthRate =
      lastMonth && lastMonth.revenue > 0
        ? (
            ((thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue) *
            100
          ).toFixed(1)
        : "0";

    // 상품별 매출 분석 (select 최적화 — 기존 include 제거)
    const productPayments = await this.prisma.payment.findMany({
      where: {
        ...whereClause,
        paymentStatus: "completed",
        createdAt: {
          gte: new Date(today.getFullYear(), today.getMonth() - period + 1, 1),
        },
      },
      select: {
        amount: true,
        product: {
          select: {
            class: { select: { className: true } },
          },
        },
      },
    });

    const revenueByProduct: Record<
      string,
      { productName: string; revenue: number; count: number }
    > = {};
    productPayments.forEach((p: any) => {
      const productName = p.product?.class?.className || "기타";
      if (!revenueByProduct[productName]) {
        revenueByProduct[productName] = { productName, revenue: 0, count: 0 };
      }
      revenueByProduct[productName].revenue += Number(p.amount);
      revenueByProduct[productName].count += 1;
    });

    // 환불 분석
    const refunds = await this.prisma.refundLog.findMany({
      where: {
        processedAt: {
          gte: new Date(today.getFullYear(), today.getMonth() - period + 1, 1),
        },
      },
      select: { refundAmount: true },
    });

    const totalRefundAmount = refunds.reduce(
      (sum, r) => sum + Number(r.refundAmount),
      0,
    );
    const refundRate =
      productPayments.length > 0
        ? ((refunds.length / productPayments.length) * 100).toFixed(1)
        : "0";

    // 일별 매출 (N+1 방지: 단일 쿼리 후 JS 집계)
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const dailyPaymentsRaw = await this.prisma.payment.findMany({
      where: {
        ...whereClause,
        paymentStatus: "completed",
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { amount: true, createdAt: true },
    });

    const dailyMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dailyMap.set(d.toISOString().split("T")[0], 0);
    }
    for (const p of dailyPaymentsRaw) {
      const dateStr = p.createdAt.toISOString().split("T")[0];
      const existing = dailyMap.get(dateStr);
      if (existing !== undefined) {
        dailyMap.set(dateStr, existing + Number(p.amount));
      }
    }

    const dailyRevenue = Array.from(dailyMap.entries()).map(
      ([date, revenue]) => ({ date, revenue }),
    );

    return {
      summary: {
        currentMonthRevenue: thisMonth.revenue,
        lastMonthRevenue: lastMonth?.revenue || 0,
        growthRate,
        totalPayments: thisMonth.count,
        averageAmount: thisMonth.avgAmount,
      },
      monthlyTrend: monthlyRevenue,
      dailyTrend: dailyRevenue,
      byProduct: Object.values(revenueByProduct).sort(
        (a, b) => b.revenue - a.revenue,
      ),
      refunds: {
        totalAmount: totalRefundAmount,
        count: refunds.length,
        rate: refundRate,
      },
    };
  }

  /**
   * 출석 상세 분석
   */
  async getAttendanceAnalytics(
    userId: string,
    userType: string,
    teamId?: string,
    period: number = 3,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clubIds = await this.resolveClubIds(userId, userType, teamId);

    const scheduleWhere =
      clubIds.length > 0 ? { class: { teamId: { in: clubIds } } } : {};

    // 월별 출석률 추이 (N+1 방지: 단일 쿼리 후 JS 집계)
    const attendanceRangeStart = new Date(
      today.getFullYear(),
      today.getMonth() - (period - 1),
      1,
    );
    const allPeriodAttendances = await this.prisma.classAttendance.findMany({
      where: {
        schedule: {
          ...scheduleWhere,
          scheduledDate: { gte: attendanceRangeStart, lte: today },
        },
      },
      select: {
        attendanceStatus: true,
        schedule: { select: { scheduledDate: true } },
      },
    });

    // 월별 집계 초기화
    const monthAttMap = new Map<
      string,
      { present: number; absent: number; late: number }
    >();
    for (let i = period - 1; i >= 0; i--) {
      const ms = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStr = `${ms.getFullYear()}-${String(ms.getMonth() + 1).padStart(2, "0")}`;
      monthAttMap.set(monthStr, { present: 0, absent: 0, late: 0 });
    }
    for (const a of allPeriodAttendances) {
      const d = a.schedule.scheduledDate;
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = monthAttMap.get(monthStr);
      if (bucket) {
        if (a.attendanceStatus === "present") bucket.present++;
        else if (a.attendanceStatus === "absent") bucket.absent++;
        else if (a.attendanceStatus === "late") bucket.late++;
      }
    }

    const monthlyAttendance = Array.from(monthAttMap.entries()).map(
      ([month, { present, absent, late }]) => {
        const total = present + absent + late;
        const rate =
          total > 0 ? (((present + late) / total) * 100).toFixed(1) : "0";
        return { month, present, absent, late, rate };
      },
    );

    // 요일별/시간대별 출석 패턴 — 단일 쿼리 (select 최적화)
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - period);

    const allAttendances = await this.prisma.classAttendance.findMany({
      where: {
        schedule: {
          ...scheduleWhere,
          scheduledDate: { gte: threeMonthsAgo, lte: today },
        },
      },
      select: {
        attendanceStatus: true,
        schedule: { select: { scheduledDate: true } },
      },
    });

    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    const weekdayAttendance = Array.from({ length: 7 }, (_, day) => {
      const dayAttendances = allAttendances.filter(
        (a) => new Date(a.schedule.scheduledDate).getDay() === day,
      );
      const present = dayAttendances.filter(
        (a) =>
          a.attendanceStatus === "present" || a.attendanceStatus === "late",
      ).length;
      const absent = dayAttendances.filter(
        (a) => a.attendanceStatus === "absent",
      ).length;
      const total = dayAttendances.length;
      const rate = total > 0 ? ((present / total) * 100).toFixed(1) : "0";
      return { day: dayNames[day], present, absent, rate };
    });

    // 클래스별 출석률
    const classes = await this.prisma.class.findMany({
      where: clubIds.length > 0 ? { teamId: { in: clubIds } } : {},
      select: {
        id: true,
        className: true,
        schedules: {
          where: {
            scheduledDate: { gte: threeMonthsAgo, lte: today },
          },
          select: {
            attendances: {
              select: { attendanceStatus: true },
            },
          },
        },
      },
    });

    const attendanceByClass = classes
      .map((cls) => {
        const allClassAttendances = cls.schedules.flatMap((s) => s.attendances);
        const present = allClassAttendances.filter(
          (a) =>
            a.attendanceStatus === "present" || a.attendanceStatus === "late",
        ).length;
        const total = allClassAttendances.length;
        const rate = total > 0 ? ((present / total) * 100).toFixed(1) : "0";

        return {
          classId: cls.id,
          className: cls.className,
          totalAttendances: total,
          presentCount: present,
          attendanceRate: rate,
        };
      })
      .sort(
        (a, b) => parseFloat(b.attendanceRate) - parseFloat(a.attendanceRate),
      );

    // 시간대별 출석 패턴
    const hourlyPattern: { hour: number; count: number }[] = [];
    for (let hour = 6; hour < 22; hour++) {
      const hourAttendances = allAttendances.filter((a) => {
        const scheduleHour = new Date(a.schedule.scheduledDate).getHours();
        return scheduleHour === hour;
      });
      hourlyPattern.push({ hour, count: hourAttendances.length });
    }

    return {
      summary: {
        currentMonthRate:
          monthlyAttendance[monthlyAttendance.length - 1]?.rate || "0",
        totalSessions: allAttendances.length,
        avgPresentRate:
          monthlyAttendance.length > 0
            ? (
                monthlyAttendance.reduce(
                  (sum, m) => sum + parseFloat(m.rate),
                  0,
                ) / monthlyAttendance.length
              ).toFixed(1)
            : "0",
      },
      monthlyTrend: monthlyAttendance,
      weekdayPattern: weekdayAttendance,
      hourlyPattern,
      byClass: attendanceByClass,
    };
  }

  /**
   * 회원 상세 분석
   */
  async getMemberAnalytics(
    userId: string,
    userType: string,
    teamId?: string,
    period: number = 6,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clubIds = await this.resolveClubIds(userId, userType, teamId);

    const memberWhere = clubIds.length > 0 ? { teamId: { in: clubIds } } : {};

    // 월별 신규 회원 추이 (N+1 방지: 단일 쿼리 후 JS 집계)
    const memberRangeStart = new Date(
      today.getFullYear(),
      today.getMonth() - (period - 1),
      1,
    );
    const newMembersRaw = await this.prisma.teamMember.findMany({
      where: {
        ...memberWhere,
        approvalStatus: "approved",
        joinedAt: { gte: memberRangeStart },
      },
      select: { joinedAt: true },
    });

    // 월별 신규 가입 수 집계
    const newMemberMonthMap = new Map<string, number>();
    for (let i = period - 1; i >= 0; i--) {
      const ms = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStr = `${ms.getFullYear()}-${String(ms.getMonth() + 1).padStart(2, "0")}`;
      newMemberMonthMap.set(monthStr, 0);
    }
    for (const m of newMembersRaw) {
      const d = m.joinedAt;
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = newMemberMonthMap.get(monthStr);
      if (existing !== undefined) {
        newMemberMonthMap.set(monthStr, existing + 1);
      }
    }

    const monthlyNewMembers: {
      month: string;
      newMembers: number;
      cumulativeTotal: number;
    }[] = [];
    let cumulativeTotal = 0;
    for (const [month, newMembers] of newMemberMonthMap.entries()) {
      cumulativeTotal += newMembers;
      monthlyNewMembers.push({ month, newMembers, cumulativeTotal });
    }

    // 회원 상태별 분포 + 전체 회원 (병렬)
    const [membersByStatus, allMembers] = await Promise.all([
      this.prisma.teamMember.groupBy({
        by: ["approvalStatus"],
        where: memberWhere,
        _count: true,
      }),
      this.prisma.teamMember.findMany({
        where: {
          ...memberWhere,
          approvalStatus: "approved",
        },
        select: { id: true, playerAge: true, userId: true },
      }),
    ]);

    const statusDistribution: Record<string, number> = {};
    membersByStatus.forEach((m) => {
      statusDistribution[m.approvalStatus] = m._count;
    });

    // 연령대별 분포
    const ageGroups: Record<string, number> = {
      "0-6세": 0,
      "7-9세": 0,
      "10-12세": 0,
      "13-15세": 0,
      "16세 이상": 0,
    };

    allMembers.forEach((m) => {
      if (!m.playerAge) return;
      if (m.playerAge <= 6) ageGroups["0-6세"]++;
      else if (m.playerAge <= 9) ageGroups["7-9세"]++;
      else if (m.playerAge <= 12) ageGroups["10-12세"]++;
      else if (m.playerAge <= 15) ageGroups["13-15세"]++;
      else ageGroups["16세 이상"]++;
    });

    // 클럽별 회원 수
    const [membersByClub, clubDetails] = await Promise.all([
      this.prisma.teamMember.groupBy({
        by: ["teamId"],
        where: {
          ...memberWhere,
          approvalStatus: "approved",
        },
        _count: true,
      }),
      this.prisma.team.findMany({
        where: clubIds.length > 0 ? { id: { in: clubIds } } : {},
        select: { id: true, name: true },
      }),
    ]);

    const clubDistribution = membersByClub
      .map((m) => {
        const club = clubDetails.find((c) => c.id === m.teamId);
        return {
          teamId: m.teamId,
          name: club?.name || "알 수 없음",
          memberCount: m._count,
        };
      })
      .sort((a, b) => b.memberCount - a.memberCount);

    // 2026-04-27 (N-9): 수업권 = User × Class 단위 → ClubMember.userId 들로 조회
    const memberUserIds = allMembers.map((m) => m.userId);
    const activeCredits = await this.prisma.memberCredit.findMany({
      where: {
        userId: { in: memberUserIds },
        expiresAt: { gte: today },
      },
      select: { totalSessions: true, usedSessions: true },
    });

    const totalRemainingCredits = activeCredits.reduce(
      (sum, c) => sum + (c.totalSessions - c.usedSessions),
      0,
    );
    const avgCreditsPerMember =
      allMembers.length > 0
        ? Math.round(totalRemainingCredits / allMembers.length)
        : 0;

    // 성장률 계산
    const thisMonth = monthlyNewMembers[monthlyNewMembers.length - 1];
    const lastMonth = monthlyNewMembers[monthlyNewMembers.length - 2];
    const growthRate =
      lastMonth && lastMonth.newMembers > 0
        ? (
            ((thisMonth.newMembers - lastMonth.newMembers) /
              lastMonth.newMembers) *
            100
          ).toFixed(1)
        : "0";

    return {
      summary: {
        totalActiveMembers: allMembers.length,
        newMembersThisMonth: thisMonth?.newMembers || 0,
        growthRate,
        avgAge:
          allMembers.length > 0
            ? Math.round(
                allMembers.reduce((sum, m) => sum + (m.playerAge || 0), 0) /
                  allMembers.length,
              )
            : 0,
      },
      monthlyTrend: monthlyNewMembers,
      statusDistribution,
      ageDistribution: ageGroups,
      clubDistribution,
      credits: {
        totalRemainingCredits,
        avgCreditsPerMember,
        membersWithCredits: activeCredits.length,
      },
    };
  }

  /**
   * 수업 성과 분석
   */
  async getClassPerformanceAnalytics(
    userId: string,
    userType: string,
    teamId?: string,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const clubIds = await this.resolveClubIds(userId, userType, teamId);

    const classWhere = clubIds.length > 0 ? { teamId: { in: clubIds } } : {};

    // 수업별 상세 분석
    const classes = await this.prisma.class.findMany({
      where: classWhere,
      select: {
        id: true,
        className: true,
        capacity: true,
        ageMin: true,
        ageMax: true,
        registrations: {
          where: { status: "active" },
          select: { id: true },
        },
        schedules: {
          where: {
            scheduledDate: { gte: threeMonthsAgo, lte: today },
          },
          select: {
            isCancelled: true,
            attendances: {
              select: { attendanceStatus: true },
            },
          },
        },
        products: {
          select: {
            payments: {
              where: {
                paymentStatus: "completed",
                createdAt: { gte: threeMonthsAgo },
              },
              select: { amount: true },
            },
          },
        },
      },
    });

    const classPerformance = classes.map((cls) => {
      const enrolledCount = cls.registrations.length;
      const capacityRate =
        cls.capacity > 0
          ? ((enrolledCount / cls.capacity) * 100).toFixed(1)
          : "0";

      const allAttendances = cls.schedules.flatMap((s) => s.attendances);
      const presentCount = allAttendances.filter(
        (a) =>
          a.attendanceStatus === "present" || a.attendanceStatus === "late",
      ).length;
      const attendanceRate =
        allAttendances.length > 0
          ? ((presentCount / allAttendances.length) * 100).toFixed(1)
          : "0";

      const revenue = cls.products.reduce(
        (sum, p) =>
          sum + p.payments.reduce((pSum, pay) => pSum + Number(pay.amount), 0),
        0,
      );

      const totalSchedules = cls.schedules.length;
      const cancelledSchedules = cls.schedules.filter(
        (s) => s.isCancelled,
      ).length;
      const operationRate =
        totalSchedules > 0
          ? (
              ((totalSchedules - cancelledSchedules) / totalSchedules) *
              100
            ).toFixed(1)
          : "0";

      return {
        classId: cls.id,
        className: cls.className,
        ageRange:
          cls.ageMin && cls.ageMax ? `${cls.ageMin}-${cls.ageMax}세` : "전체",
        capacity: cls.capacity,
        enrolledCount,
        capacityRate,
        attendanceRate,
        revenue,
        totalSchedules,
        cancelledSchedules,
        operationRate,
      };
    });

    // 전체 요약
    const totalEnrolled = classPerformance.reduce(
      (sum, c) => sum + c.enrolledCount,
      0,
    );
    const totalCapacity = classPerformance.reduce(
      (sum, c) => sum + c.capacity,
      0,
    );
    const totalRevenue = classPerformance.reduce(
      (sum, c) => sum + c.revenue,
      0,
    );
    const avgAttendanceRate =
      classPerformance.length > 0
        ? (
            classPerformance.reduce(
              (sum, c) => sum + parseFloat(c.attendanceRate),
              0,
            ) / classPerformance.length
          ).toFixed(1)
        : "0";

    const popularClasses = [...classPerformance]
      .sort((a, b) => b.enrolledCount - a.enrolledCount)
      .slice(0, 5);

    const highRevenueClasses = [...classPerformance]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      summary: {
        totalClasses: classes.length,
        totalEnrolled,
        totalCapacity,
        overallCapacityRate:
          totalCapacity > 0
            ? ((totalEnrolled / totalCapacity) * 100).toFixed(1)
            : "0",
        avgAttendanceRate,
        totalRevenue,
      },
      classDetails: classPerformance.sort(
        (a, b) => parseFloat(b.capacityRate) - parseFloat(a.capacityRate),
      ),
      popularClasses,
      highRevenueClasses,
    };
  }
}
