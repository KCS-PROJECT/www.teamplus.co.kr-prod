import { Prisma } from "@prisma/client";
import { instantToKstDateOnly, kstTodayUtcMidnight } from "./kst-date.util";

/**
 * 대회 "이용 개시" 판정 SoT — 대회 참가취소(tournaments.service)와 환불 엔진이 공유한다.
 *
 * 개시일 = 대회 시작일(`Tournament.startDate`). 시작일 미정(null)이면 취소·연기를 제외한
 * 첫 경기의 KST 날짜로 대신하고, 경기도 없으면 대회 상태(ongoing/finished)로만 판정한다.
 * 개시일 당일 0시(KST)부터 개시 — 전날(D-1)까지 본인 취소 가능. 선불 수강의 "첫 회차
 * 당일" 기준과 같다.
 *
 * 순수 함수 모듈 — PrismaService / Prisma.TransactionClient 모두 대입 가능.
 */

/** 개시일 폴백에서 제외하는 경기 상태 — 취소·연기된 경기는 치러진 것이 아니다. */
export const TOURNAMENT_INACTIVE_MATCH_STATUSES = ["cancelled", "postponed"];

/** 시작일·경기 없이도 "이미 시작됨"으로 보는 대회 상태. */
export const TOURNAMENT_STARTED_STATUSES = ["ongoing", "finished"];

export type TournamentMatchLookupDb = {
  hockeyMatch: {
    findFirst(args: {
      where: Prisma.HockeyMatchWhereInput;
      orderBy: { scheduledAt: "asc" };
      select: { scheduledAt: true };
    }): Promise<{ scheduledAt: Date } | null>;
  };
};

export interface TournamentUsageStart {
  /** 개시일(UTC 자정값, `@db.Date` 규약). null = 시작일·경기 모두 없음. */
  usageStartDayUtc: Date | null;
  /** 시작일·경기 없이 상태(ongoing/finished)만으로 개시 판정된 경우. */
  startedByStatus: boolean;
}

export async function resolveTournamentUsageStart(
  db: TournamentMatchLookupDb,
  tournament: { id: string; startDate: Date | null; status: string },
): Promise<TournamentUsageStart> {
  if (tournament.startDate != null) {
    return {
      usageStartDayUtc: new Date(tournament.startDate),
      startedByStatus: false,
    };
  }
  if (TOURNAMENT_STARTED_STATUSES.includes(tournament.status)) {
    return { usageStartDayUtc: null, startedByStatus: true };
  }
  const first = await db.hockeyMatch.findFirst({
    where: {
      tournamentId: tournament.id,
      status: { notIn: TOURNAMENT_INACTIVE_MATCH_STATUSES },
    },
    orderBy: { scheduledAt: "asc" },
    select: { scheduledAt: true },
  });
  return {
    usageStartDayUtc: first ? instantToKstDateOnly(first.scheduledAt) : null,
    startedByStatus: false,
  };
}

/** 개시일 당일(KST)부터 true. day-level 비교 — UTC 자정값끼리. */
export function isTournamentUsageStarted(
  usage: TournamentUsageStart,
  todayUtc: Date = kstTodayUtcMidnight(),
): boolean {
  if (usage.startedByStatus) return true;
  return (
    usage.usageStartDayUtc !== null &&
    usage.usageStartDayUtc.getTime() <= todayUtc.getTime()
  );
}
