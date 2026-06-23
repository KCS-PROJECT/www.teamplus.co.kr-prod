import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  CreateMatchEventDto,
  UpdateMatchStatusDto,
} from "./dto/create-match-event.dto";
import { MatchScoreboardGateway } from "./match-scoreboard.gateway";

@Injectable()
export class MatchScoreboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MatchScoreboardGateway,
  ) {}

  /**
   * 실시간 스코어 조회 (피리어드별 점수 포함)
   */
  async getScoreboard(matchId: string) {
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        homeScore: true,
        awayScore: true,
        status: true,
        currentPeriod: true,
        scheduledAt: true,
        startedAt: true,
        endedAt: true,
        homeTeam: {
          select: { id: true, name: true },
        },
        awayTeam: {
          select: { id: true, name: true },
        },
        homeTeamId: true,
        awayTeamId: true,
        periods: {
          select: {
            periodNumber: true,
            homeScore: true,
            awayScore: true,
            homePenaltyMinutes: true,
            awayPenaltyMinutes: true,
            startedAt: true,
            endedAt: true,
          },
          orderBy: { periodNumber: "asc" },
        },
      },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    return match;
  }

  /**
   * 이벤트 타임라인 조회
   */
  async getEvents(matchId: string) {
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: { id: true },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    const events = await this.prisma.matchEvent.findMany({
      where: { matchId },
      select: {
        id: true,
        periodNumber: true,
        eventTime: true,
        eventType: true,
        description: true,
        isGameWinner: true,
        isPowerPlay: true,
        isShortHanded: true,
        penaltyType: true,
        penaltyMinutes: true,
        createdAt: true,
        // Phase 2 (2026-04-29) — TeamRoster 폐기, MatchEvent.player/assist relation 제거.
        // player_id / assist_player1_id / assist_player2_id 컬럼은 Phase 4 에서 정리. 임시 ID만 노출.
        playerId: true,
        assistPlayer1Id: true,
        assistPlayer2Id: true,
      },
      orderBy: [
        { periodNumber: "asc" },
        { eventTime: "asc" },
        { createdAt: "asc" },
      ],
    });

    return events;
  }

  /**
   * 이벤트 기록 - 골이면 스코어 자동 갱신
   */
  async createEvent(matchId: string, dto: CreateMatchEventDto) {
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
      },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    if (match.status === "completed" || match.status === "cancelled") {
      throw new BadRequestException(
        "종료되었거나 취소된 경기에는 이벤트를 기록할 수 없습니다.",
      );
    }

    const isGoal = dto.eventType === "goal";
    const isHomeGoal = isGoal && dto.teamId === match.homeTeamId;
    const isAwayGoal = isGoal && dto.teamId === match.awayTeamId;

    const result = await this.prisma.$transaction(async (tx) => {
      // 이벤트 생성
      const event = await tx.matchEvent.create({
        data: {
          matchId,
          periodNumber: dto.periodNumber,
          eventTime: dto.eventTime,
          eventType: dto.eventType,
          teamId: dto.teamId,
          playerId: dto.playerId,
          assistPlayer1Id: dto.assistPlayer1Id,
          assistPlayer2Id: dto.assistPlayer2Id,
          penaltyType: dto.penaltyType,
          penaltyMinutes: dto.penaltyMinutes,
          description: dto.description,
          isGameWinner: dto.isGameWinner ?? false,
          isPowerPlay: dto.isPowerPlay ?? false,
          isShortHanded: dto.isShortHanded ?? false,
        },
        select: {
          id: true,
          periodNumber: true,
          eventTime: true,
          eventType: true,
          description: true,
          createdAt: true,
        },
      });

      // 골이면 경기 스코어 + 피리어드 스코어 갱신
      if (isGoal) {
        // 경기 전체 스코어 갱신
        await tx.hockeyMatch.update({
          where: { id: matchId },
          data: {
            ...(isHomeGoal ? { homeScore: { increment: 1 } } : {}),
            ...(isAwayGoal ? { awayScore: { increment: 1 } } : {}),
          },
        });

        // 피리어드 스코어 갱신 (없으면 생성)
        await tx.matchPeriod.upsert({
          where: {
            matchId_periodNumber: {
              matchId,
              periodNumber: dto.periodNumber,
            },
          },
          update: {
            ...(isHomeGoal ? { homeScore: { increment: 1 } } : {}),
            ...(isAwayGoal ? { awayScore: { increment: 1 } } : {}),
          },
          create: {
            matchId,
            periodNumber: dto.periodNumber,
            homeScore: isHomeGoal ? 1 : 0,
            awayScore: isAwayGoal ? 1 : 0,
          },
        });
      }

      // 페널티면 피리어드 페널티 시간 갱신
      if (dto.eventType === "penalty" && dto.penaltyMinutes) {
        const isPenaltyHome = dto.teamId === match.homeTeamId;

        await tx.matchPeriod.upsert({
          where: {
            matchId_periodNumber: {
              matchId,
              periodNumber: dto.periodNumber,
            },
          },
          update: {
            ...(isPenaltyHome
              ? { homePenaltyMinutes: { increment: dto.penaltyMinutes } }
              : { awayPenaltyMinutes: { increment: dto.penaltyMinutes } }),
          },
          create: {
            matchId,
            periodNumber: dto.periodNumber,
            homePenaltyMinutes: isPenaltyHome ? dto.penaltyMinutes : 0,
            awayPenaltyMinutes: isPenaltyHome ? 0 : dto.penaltyMinutes,
          },
        });
      }

      return event;
    });

    // 골 발생 시 실시간 스코어 emit (room: match:${matchId})
    if (isGoal) {
      try {
        const latest = await this.prisma.hockeyMatch.findUnique({
          where: { id: matchId },
          select: {
            homeScore: true,
            awayScore: true,
            currentPeriod: true,
          },
        });
        if (latest) {
          this.gateway.emitScoreUpdate({
            matchId,
            homeScore: latest.homeScore,
            awayScore: latest.awayScore,
            currentPeriod: latest.currentPeriod,
            lastEvent: {
              id: result.id,
              eventType: result.eventType,
              periodNumber: result.periodNumber,
              eventTime: result.eventTime,
              description: result.description,
            },
          });
        }
      } catch {
        // emit 실패는 응답 성공에 영향 없음 (구독 클라이언트는 폴링 폴백)
      }
    }

    return {
      message: isGoal ? "골이 기록되었습니다." : "이벤트가 기록되었습니다.",
      event: result,
    };
  }

  /**
   * 경기 상태 변경
   */
  async updateStatus(matchId: string, dto: UpdateMatchStatusDto) {
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: { id: true, status: true },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: dto.status,
    };

    if (dto.currentPeriod !== undefined) {
      updateData.currentPeriod = dto.currentPeriod;
    }

    // 상태별 타임스탬프 자동 처리
    if (dto.status === "in_progress" && match.status !== "in_progress") {
      updateData.startedAt = now;
    }

    if (dto.status === "completed") {
      updateData.endedAt = now;
    }

    const updated = await this.prisma.hockeyMatch.update({
      where: { id: matchId },
      data: updateData,
      select: {
        id: true,
        status: true,
        currentPeriod: true,
        homeScore: true,
        awayScore: true,
        startedAt: true,
        endedAt: true,
      },
    });

    // 상태 전이 emit (room: match:${matchId})
    try {
      this.gateway.emitStatusChange({
        matchId,
        status: updated.status,
        currentPeriod: updated.currentPeriod,
        homeScore: updated.homeScore,
        awayScore: updated.awayScore,
        startedAt: updated.startedAt,
        endedAt: updated.endedAt,
      });
    } catch {
      // emit 실패는 응답 성공에 영향 없음
    }

    return {
      message: "경기 상태가 변경되었습니다.",
      match: updated,
    };
  }
}
