import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateTrainingSessionDto } from "./dto/create-training-session.dto";
import { QueryTrainingStatsDto } from "./dto/query-training-stats.dto";

@Injectable()
export class TrainingStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 훈련 기록 생성 (TrainingSession + TrainingMetric[] 트랜잭션)
   */
  async createSession(dto: CreateTrainingSessionDto, recordedBy: string) {
    const { metrics, ...sessionData } = dto;

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trainingSession.create({
        data: {
          memberId: sessionData.memberId,
          teamId: sessionData.teamId,
          classId: sessionData.classId,
          sessionDate: new Date(sessionData.sessionDate),
          durationMin: sessionData.durationMin,
          intensityLvl: sessionData.intensityLvl ?? "medium",
          focusArea: sessionData.focusArea,
          notes: sessionData.notes,
          recordedBy,
        },
        select: { id: true },
      });

      if (metrics && metrics.length > 0) {
        await tx.trainingMetric.createMany({
          data: metrics.map((m) => ({
            sessionId: created.id,
            metricName: m.metricName,
            metricValue: m.metricValue,
            unit: m.unit ?? "",
          })),
        });
      }

      return tx.trainingSession.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          memberId: true,
          teamId: true,
          classId: true,
          sessionDate: true,
          durationMin: true,
          intensityLvl: true,
          focusArea: true,
          notes: true,
          recordedBy: true,
          createdAt: true,
          metrics: {
            select: {
              id: true,
              metricName: true,
              metricValue: true,
              unit: true,
            },
          },
        },
      });
    });

    return { message: "훈련 기록이 생성되었습니다.", session };
  }

  /**
   * 회원별 훈련 기록 목록 (페이지네이션)
   */
  async getMemberSessions(memberId: string, query: QueryTrainingStatsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { memberId };
    if (query.startDate || query.endDate) {
      where.sessionDate = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }
    // [추가 2026-05-15 db-keeper] T03/L — teamId 격리 필터.
    //  · 동일 회원이 여러 팀에 속할 수 있어도 teamId 명시 시 해당 팀의 세션만 반환.
    if (query.teamId) {
      where.teamId = query.teamId;
    }

    const [items, total] = await Promise.all([
      this.prisma.trainingSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sessionDate: "desc" },
        select: {
          id: true,
          sessionDate: true,
          durationMin: true,
          intensityLvl: true,
          focusArea: true,
          notes: true,
          createdAt: true,
          metrics: {
            select: {
              id: true,
              metricName: true,
              metricValue: true,
              unit: true,
            },
          },
        },
      }),
      this.prisma.trainingSession.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 훈련 기록 상세
   */
  async getSession(id: string) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id },
      select: {
        id: true,
        memberId: true,
        teamId: true,
        classId: true,
        sessionDate: true,
        durationMin: true,
        intensityLvl: true,
        focusArea: true,
        notes: true,
        recordedBy: true,
        createdAt: true,
        updatedAt: true,
        metrics: {
          select: {
            id: true,
            metricName: true,
            metricValue: true,
            unit: true,
            createdAt: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException("훈련 기록을 찾을 수 없습니다.");
    }

    return session;
  }

  /**
   * 훈련 기록 수정
   */
  async updateSession(id: string, dto: Partial<CreateTrainingSessionDto>) {
    const existing = await this.prisma.trainingSession.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("훈련 기록을 찾을 수 없습니다.");
    }

    const { metrics, ...updateData } = dto;

    const session = await this.prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (updateData.sessionDate)
        data.sessionDate = new Date(updateData.sessionDate);
      if (updateData.durationMin !== undefined)
        data.durationMin = updateData.durationMin;
      if (updateData.intensityLvl !== undefined)
        data.intensityLvl = updateData.intensityLvl;
      if (updateData.focusArea !== undefined)
        data.focusArea = updateData.focusArea;
      if (updateData.notes !== undefined) data.notes = updateData.notes;
      if (updateData.classId !== undefined) data.classId = updateData.classId;

      await tx.trainingSession.update({
        where: { id },
        data,
      });

      if (metrics) {
        await tx.trainingMetric.deleteMany({ where: { sessionId: id } });
        if (metrics.length > 0) {
          await tx.trainingMetric.createMany({
            data: metrics.map((m) => ({
              sessionId: id,
              metricName: m.metricName,
              metricValue: m.metricValue,
              unit: m.unit ?? "",
            })),
          });
        }
      }

      return tx.trainingSession.findUnique({
        where: { id },
        select: {
          id: true,
          memberId: true,
          teamId: true,
          classId: true,
          sessionDate: true,
          durationMin: true,
          intensityLvl: true,
          focusArea: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          metrics: {
            select: {
              id: true,
              metricName: true,
              metricValue: true,
              unit: true,
            },
          },
        },
      });
    });

    return { message: "훈련 기록이 수정되었습니다.", session };
  }

  /**
   * 훈련 기록 삭제
   */
  async deleteSession(id: string) {
    const existing = await this.prisma.trainingSession.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("훈련 기록을 찾을 수 없습니다.");
    }

    await this.prisma.trainingSession.delete({ where: { id } });

    return { message: "훈련 기록이 삭제되었습니다." };
  }

  /**
   * 주간 훈련 통계 (최근 7일)
   */
  async getWeeklyStats(memberId: string) {
    return this.getPeriodStats(memberId, 7);
  }

  /**
   * 월간 훈련 통계 (최근 30일)
   */
  async getMonthlyStats(memberId: string) {
    return this.getPeriodStats(memberId, 30);
  }

  /**
   * 대시보드 전용 API — 프론트가 바로 사용할 수 있는 가공된 데이터 반환
   * GET /training-stats/member/:memberId/dashboard?period=weekly|monthly
   */
  async getDashboardStats(memberId: string, period: "weekly" | "monthly") {
    const days = period === "weekly" ? 7 : 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // 이전 기간 (향상도 계산용)
    const prevEnd = new Date(startDate);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days);

    // 현재 기간 + 이전 기간 세션 동시 조회
    const [currentSessions, prevSessions] = await Promise.all([
      this.prisma.trainingSession.findMany({
        where: { memberId, sessionDate: { gte: startDate, lte: endDate } },
        orderBy: { sessionDate: "asc" },
        select: {
          sessionDate: true,
          durationMin: true,
          intensityLvl: true,
          teamId: true,
          metrics: { select: { metricName: true, metricValue: true } },
        },
      }),
      this.prisma.trainingSession.findMany({
        where: { memberId, sessionDate: { gte: prevStart, lte: prevEnd } },
        select: {
          durationMin: true,
          metrics: { select: { metricName: true, metricValue: true } },
        },
      }),
    ]);

    // ─── 1. weeklyIntensity: 요일별 강도 (0-100) ───
    const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
    const today = new Date();
    const todayDow = today.getDay();

    // duration 기준 최대값 계산 (정규화용)
    const dayDurationMap = new Map<number, number>(); // dow → totalDuration
    for (const s of currentSessions) {
      const dow = s.sessionDate.getDay();
      dayDurationMap.set(dow, (dayDurationMap.get(dow) ?? 0) + s.durationMin);
    }
    const maxDayDuration = Math.max(1, ...dayDurationMap.values());

    const weeklyIntensity = DAY_NAMES.map((day, dow) => ({
      day,
      value: Math.round(
        ((dayDurationMap.get(dow) ?? 0) / maxDayDuration) * 100,
      ),
      isToday: dow === todayDow,
    }));

    // ─── 2. axes: 5축 능력치 (metricName 매핑) ───
    const METRIC_LABELS: Record<string, string> = {
      speed: "스케이팅",
      skating: "스케이팅",
      accuracy: "슈팅",
      shooting: "슈팅",
      endurance: "패스",
      passing: "패스",
      agility: "수비",
      defense: "수비",
      strength: "체력",
      stamina: "체력",
      fitness: "체력",
    };
    const AXIS_ORDER = ["스케이팅", "슈팅", "패스", "수비", "체력"];

    // 현재 기간 metricName별 평균
    // (메모리 집계 — Prisma 호출 없음. n-plus-one-check 도구의 false positive)
    const myMetricMap = new Map<string, { total: number; count: number }>();
    for (const s of currentSessions) {
      for (const m of s.metrics) {
        const label = METRIC_LABELS[m.metricName] ?? m.metricName;
        const existing = myMetricMap.get(label);
        if (existing) {
          existing.total += m.metricValue;
          existing.count += 1;
        } else {
          myMetricMap.set(label, { total: m.metricValue, count: 1 });
        }
      }
    }

    // 팀 평균: 같은 클럽 회원 전체의 같은 기간 평균
    const teamId = currentSessions[0]?.teamId;
    const teamMetricMap = new Map<string, { total: number; count: number }>();
    if (teamId) {
      const teamSessions = await this.prisma.trainingSession.findMany({
        where: {
          teamId,
          sessionDate: { gte: startDate, lte: endDate },
          memberId: { not: memberId }, // 본인 제외
        },
        select: {
          metrics: { select: { metricName: true, metricValue: true } },
        },
      });
      for (const s of teamSessions) {
        for (const m of s.metrics) {
          const label = METRIC_LABELS[m.metricName] ?? m.metricName;
          const existing = teamMetricMap.get(label);
          if (existing) {
            existing.total += m.metricValue;
            existing.count += 1;
          } else {
            teamMetricMap.set(label, { total: m.metricValue, count: 1 });
          }
        }
      }
    }

    const axes = AXIS_ORDER.map((label) => {
      const my = myMetricMap.get(label);
      const team = teamMetricMap.get(label);
      return {
        label,
        value: my ? Math.round(my.total / my.count) : 0,
        teamAvg: team ? Math.round(team.total / team.count) : 0,
      };
    });

    // ─── 3. improvement: 이전 기간 대비 향상도 ───
    const currentTotal = currentSessions.reduce((s, c) => s + c.durationMin, 0);
    const prevTotal = prevSessions.reduce((s, c) => s + c.durationMin, 0);
    const improvement =
      prevTotal > 0
        ? Math.round(((currentTotal - prevTotal) / prevTotal) * 100)
        : currentTotal > 0
          ? 100
          : 0;

    // 목표: 이전 기간 대비 120% (임의 기준)
    const target = Math.max(1, Math.round(prevTotal * 1.2));
    const improvementProgress = Math.min(
      100,
      Math.round((currentTotal / target) * 100),
    );

    // ─── 4. teamAvgIntensity ───
    let teamAvgIntensity = 0;
    if (teamId) {
      const teamTotalResult = await this.prisma.trainingSession.aggregate({
        where: {
          teamId,
          sessionDate: { gte: startDate, lte: endDate },
          memberId: { not: memberId },
        },
        _avg: { durationMin: true },
      });
      const teamAvgDuration = teamTotalResult._avg.durationMin ?? 0;
      teamAvgIntensity =
        maxDayDuration > 0
          ? Math.round((teamAvgDuration / maxDayDuration) * 100)
          : 0;
    }

    return {
      axes,
      improvement,
      improvementProgress,
      weeklyIntensity,
      teamAvgIntensity,
      totalDuration: currentTotal,
      sessionCount: currentSessions.length,
    };
  }

  /**
   * 기간별 통계 공통 로직
   */
  private async getPeriodStats(memberId: string, days: number) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const sessions = await this.prisma.trainingSession.findMany({
      where: {
        memberId,
        sessionDate: { gte: startDate, lte: endDate },
      },
      orderBy: { sessionDate: "asc" },
      select: {
        id: true,
        sessionDate: true,
        durationMin: true,
        intensityLvl: true,
        metrics: {
          select: {
            metricName: true,
            metricValue: true,
            unit: true,
          },
        },
      },
    });

    const totalDuration = sessions.reduce((sum, s) => sum + s.durationMin, 0);
    const sessionCount = sessions.length;

    // 일별 그룹핑
    const dayMap = new Map<
      string,
      { duration: number; intensity: string; count: number }
    >();
    for (const s of sessions) {
      const dateKey = s.sessionDate.toISOString().slice(0, 10);
      const existing = dayMap.get(dateKey);
      if (existing) {
        existing.duration += s.durationMin;
        existing.count += 1;
      } else {
        dayMap.set(dateKey, {
          duration: s.durationMin,
          intensity: s.intensityLvl,
          count: 1,
        });
      }
    }

    const dayByDay = Array.from(dayMap.entries()).map(([date, data]) => ({
      date,
      duration: data.duration,
      intensity: data.intensity,
      sessionCount: data.count,
    }));

    // metricName별 평균
    const metricAggMap = new Map<
      string,
      { total: number; count: number; unit: string }
    >();
    for (const s of sessions) {
      for (const m of s.metrics) {
        const existing = metricAggMap.get(m.metricName);
        if (existing) {
          existing.total += m.metricValue;
          existing.count += 1;
        } else {
          metricAggMap.set(m.metricName, {
            total: m.metricValue,
            count: 1,
            unit: m.unit,
          });
        }
      }
    }

    const metricAverages = Array.from(metricAggMap.entries()).map(
      ([metricName, data]) => ({
        metricName,
        average: Math.round((data.total / data.count) * 100) / 100,
        unit: data.unit,
        sampleCount: data.count,
      }),
    );

    return {
      totalDuration,
      sessionCount,
      periodDays: days,
      dayByDay,
      metricAverages,
    };
  }
}
