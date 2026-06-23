import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";

const TIER_NAMES: Record<number, string> = {
  1: "하위",
  2: "중위",
  3: "상위",
};

const AWARD_POINTS: Record<string, number> = {
  mvp: 100,
  best_scorer: 80,
  best_goalie: 80,
  most_improved: 60,
  skill: 60,
  sportsmanship: 50,
  special: 50,
  attendance: 40,
};

@Injectable()
export class LevelCalculatorService {
  private readonly logger = new Logger(LevelCalculatorService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron("0 0 1 * *", { timeZone: "Asia/Seoul" })
  async runMonthlyCalculation(): Promise<{ processed: number; total: number }> {
    const season = this.getCurrentSeason();
    this.logger.log(`[LevelCalc] 월간 등급 계산 시작: season=${season}`);

    // roleInTeam: PLAYER 명시 — 월간 등급 계산은 선수(PLAYER)만 대상
    // PARENT 도입 후 학부모가 등급 계산 대상에 포함되지 않도록 방어
    const members = await this.prisma.teamMember.findMany({
      where: { roleInTeam: "PLAYER", approvalStatus: "approved" },
      select: { id: true, userId: true },
    });

    let processed = 0;
    for (const member of members) {
      try {
        await this.calculateAndStorePending(member.id, member.userId, season);
        processed++;
      } catch (e) {
        this.logger.warn(
          `[LevelCalc] 계산 실패 memberId=${member.id}: ${(e as Error).message}`,
        );
      }
    }

    this.logger.log(`[LevelCalc] 완료: ${processed}/${members.length}명`);
    return { processed, total: members.length };
  }

  async calculateAndStorePending(
    memberId: string,
    userId: string,
    season: string,
  ): Promise<void> {
    const { composite, attendance, tournament, coach } =
      await this.calculateScore(memberId, userId);
    const newTier = this.scoreToTier(composite);

    const current = await this.prisma.playerSkillLevel.findUnique({
      where: { userId },
      select: { tier: true, tierName: true },
    });

    await this.prisma.memberLevelHistory.create({
      data: {
        userId,
        previousLevel: current?.tier ?? 1,
        newLevel: newTier,
        previousName: current?.tierName ?? TIER_NAMES[1],
        newName: TIER_NAMES[newTier],
        status: "PENDING_APPROVAL",
        reason: `score=${composite.toFixed(1)}:att=${attendance.toFixed(1)}:tour=${tournament.toFixed(1)}:coach=${coach.toFixed(1)}:memberId=${memberId}`,
        season,
      },
    });
  }

  async calculateScore(
    memberId: string,
    userId: string,
  ): Promise<{
    composite: number;
    attendance: number;
    tournament: number;
    coach: number;
  }> {
    const [attendance, tournament, coach] = await Promise.all([
      this.calcAttendanceRate(userId),
      this.calcTournamentScore(memberId),
      this.calcCoachScore(memberId),
    ]);

    const composite = attendance * 0.4 + tournament * 0.4 + coach * 0.2;
    return { composite, attendance, tournament, coach };
  }

  async getPendingApprovals(season?: string) {
    return this.prisma.memberLevelHistory.findMany({
      where: {
        status: "PENDING_APPROVAL",
        ...(season ? { season } : {}),
      },
      orderBy: { changedAt: "desc" },
      select: {
        id: true,
        userId: true,
        previousLevel: true,
        newLevel: true,
        previousName: true,
        newName: true,
        status: true,
        reason: true,
        season: true,
        changedAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }

  async approveLevel(historyId: string, approverId: string): Promise<void> {
    const history = await this.prisma.memberLevelHistory.findUnique({
      where: { id: historyId },
    });

    if (!history) throw new NotFoundException("이력을 찾을 수 없습니다.");
    if (history.status !== "PENDING_APPROVAL") {
      throw new ForbiddenException("이미 처리된 이력입니다.");
    }

    await this.prisma.$transaction([
      this.prisma.playerSkillLevel.upsert({
        where: { userId: history.userId },
        create: {
          userId: history.userId,
          tier: history.newLevel,
          tierName: history.newName,
          season: history.season ?? undefined,
        },
        update: {
          tier: history.newLevel,
          tierName: history.newName,
          season: history.season ?? undefined,
        },
      }),
      this.prisma.memberLevelHistory.update({
        where: { id: historyId },
        data: {
          status: "APPROVED",
          reason: `${history.reason ?? ""}:approvedBy=${approverId}`,
        },
      }),
    ]);
  }

  async overrideLevel(
    historyId: string,
    approverId: string,
    newLevel: number,
  ): Promise<void> {
    if (newLevel < 1 || newLevel > 3) {
      throw new ForbiddenException("등급은 1~3 사이여야 합니다.");
    }

    const history = await this.prisma.memberLevelHistory.findUnique({
      where: { id: historyId },
    });

    if (!history) throw new NotFoundException("이력을 찾을 수 없습니다.");
    if (history.status !== "PENDING_APPROVAL") {
      throw new ForbiddenException("이미 처리된 이력입니다.");
    }

    const newName = TIER_NAMES[newLevel];

    await this.prisma.$transaction([
      this.prisma.playerSkillLevel.upsert({
        where: { userId: history.userId },
        create: {
          userId: history.userId,
          tier: newLevel,
          tierName: newName,
          season: history.season ?? undefined,
        },
        update: {
          tier: newLevel,
          tierName: newName,
          season: history.season ?? undefined,
        },
      }),
      this.prisma.memberLevelHistory.update({
        where: { id: historyId },
        data: {
          status: "DIRECTOR_OVERRIDE",
          newLevel,
          newName,
          reason: `overriddenBy=${approverId}:original=${history.newLevel}`,
        },
      }),
    ]);
  }

  private async calcAttendanceRate(userId: string): Promise<number> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const [attended, total] = await Promise.all([
      this.prisma.classAttendance.count({
        where: {
          memberId: userId,
          attendanceStatus: "present",
          schedule: {
            scheduledDate: { gte: threeMonthsAgo },
            isCancelled: false,
          },
        },
      }),
      this.prisma.classAttendance.count({
        where: {
          memberId: userId,
          schedule: {
            scheduledDate: { gte: threeMonthsAgo },
            isCancelled: false,
          },
        },
      }),
    ]);

    if (total === 0) return 50;
    return (attended / total) * 100;
  }

  private async calcTournamentScore(memberId: string): Promise<number> {
    const awards = await this.prisma.playerAward.findMany({
      where: { memberId },
      select: { awardType: true },
    });

    if (awards.length === 0) return 0;

    const total = awards.reduce(
      (sum, a) => sum + (AWARD_POINTS[a.awardType] ?? 40),
      0,
    );
    return Math.min(100, total / awards.length);
  }

  private async calcCoachScore(memberId: string): Promise<number> {
    const evaluation = await this.prisma.skillEvaluation.findFirst({
      where: { memberId, status: "published" },
      orderBy: { evaluationDate: "desc" },
      select: { overallScore: true },
    });

    return evaluation?.overallScore ?? 50;
  }

  private scoreToTier(score: number): number {
    if (score >= 70) return 3;
    if (score >= 40) return 2;
    return 1;
  }

  private getCurrentSeason(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  }
}
