import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class DailyMetricsService {
  private readonly logger = new Logger(DailyMetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 매일 자정(00:00)에 전날 일간 통계 자동 집계
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async aggregateDailyMetrics() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const endOfDay = new Date(yesterday);
    endOfDay.setHours(23, 59, 59, 999);

    this.logger.log(
      `일간 통계 집계 시작: ${yesterday.toISOString().split("T")[0]}`,
    );

    try {
      // 모든 클럽 조회
      const clubs = await this.prisma.team.findMany({
        select: { id: true, name: true },
      });

      for (const club of clubs) {
        await this.aggregateForClub(club.id, yesterday, endOfDay);
      }

      // 팀별 최근 30일 평균 출석률 → Team.recentAttendanceRate 롤업
      await this.rollupRecentAttendanceRate(clubs.map((c) => c.id));

      this.logger.log(`일간 통계 집계 완료: ${clubs.length}개 클럽 처리`);
    } catch (error) {
      this.logger.error(`일간 통계 집계 실패: ${error.message}`, error.stack);
    }
  }

  /**
   * 특정 클럽의 일간 통계 집계
   */
  private async aggregateForClub(
    teamId: string,
    startOfDay: Date,
    endOfDay: Date,
  ) {
    const metricDate = new Date(startOfDay);

    // 1. 활성 회원 수 (승인된 회원)
    const activeMembers = await this.prisma.teamMember.count({
      where: {
        teamId,
        approvalStatus: "approved",
        joinedAt: { lte: endOfDay },
      },
    });

    // 2. 신규 회원 수 (해당일 가입)
    const newMembers = await this.prisma.teamMember.count({
      where: {
        teamId,
        joinedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // 3. 진행된 수업 수
    const classesHeld = await this.prisma.classSchedule.count({
      where: {
        class: { teamId },
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        isCancelled: false,
      },
    });

    // 4. 총 출석자 수
    const totalAttendees = await this.prisma.classAttendance.count({
      where: {
        schedule: {
          class: { teamId },
          scheduledDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        attendanceStatus: "present",
      },
    });

    // 5. 출석률 계산
    const totalExpected = await this.prisma.classAttendance.count({
      where: {
        schedule: {
          class: { teamId },
          scheduledDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      },
    });
    const attendanceRate =
      totalExpected > 0
        ? Math.round((totalAttendees / totalExpected) * 100)
        : 0;

    // 6. 총 매출 (해당일 결제 완료)
    const revenueResult = await this.prisma.payment.aggregate({
      where: {
        completedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        paymentStatus: "completed",
        product: {
          class: { teamId },
        },
      },
      _sum: { amount: true },
    });
    const totalRevenue = Number(revenueResult._sum?.amount || 0);

    // upsert로 중복 방지
    await this.prisma.dailyMetrics.upsert({
      where: {
        teamId_metricDate: {
          teamId,
          metricDate,
        },
      },
      update: {
        activeMembers,
        newMembers,
        classesHeld,
        totalAttendees,
        attendanceRate,
        totalRevenue,
      },
      create: {
        teamId,
        metricDate,
        activeMembers,
        newMembers,
        classesHeld,
        totalAttendees,
        attendanceRate,
        totalRevenue,
      },
    });
  }

  /**
   * 수동 트리거용 — 특정 날짜의 통계 재집계
   */
  async aggregateForDate(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const clubs = await this.prisma.team.findMany({
      select: { id: true },
    });

    for (const club of clubs) {
      await this.aggregateForClub(club.id, startOfDay, endOfDay);
    }

    return {
      date: startOfDay.toISOString().split("T")[0],
      clubsProcessed: clubs.length,
    };
  }

  /**
   * 팀별 최근 30일 DailyMetrics.attendanceRate 평균 → Team.recentAttendanceRate 갱신
   */
  private async rollupRecentAttendanceRate(teamIds: string[]) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    for (const teamId of teamIds) {
      const agg = await this.prisma.dailyMetrics.aggregate({
        where: {
          teamId,
          metricDate: { gte: thirtyDaysAgo },
          attendanceRate: { gt: 0 },
        },
        _avg: { attendanceRate: true },
        _count: { id: true },
      });

      const avg = agg._avg.attendanceRate;
      const hasData = agg._count.id > 0;

      await this.prisma.team.update({
        where: { id: teamId },
        data: {
          recentAttendanceRate: hasData ? Math.round(avg ?? 0) : null,
        },
      });
    }
  }

  /**
   * 특정 클럽의 일간 통계 조회
   */
  async getMetrics(teamId: string, startDate: Date, endDate: Date) {
    return this.prisma.dailyMetrics.findMany({
      where: {
        teamId,
        metricDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { metricDate: "asc" },
    });
  }
}
