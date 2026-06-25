"use client";

/**
 * Hockey Match Detail Page
 *
 * 레퍼런스: 사용자 제공 HTML "대회 및 경기 관리 (웹)" - 매치 상세 정보
 *
 * 경로:
 *  - /hockey-matches/[id]
 *
 * 역할 동작:
 *  - DIRECTOR/COACH/ADMIN : "실시간 스코어 입력" CTA 노출 → /hockey-matches/[id]/live 로 이동
 *  - PARENT/TEEN/CHILD    : 통계 및 타임라인 조회만
 *
 * 구조:
 *  - Sticky Header
 *  - LiveScoreHeader (양팀 로고/스코어/피리어드/통계)
 *  - Section: 실시간 경기 기록 (MatchEventTimeline)
 *  - Section: 경기 통계 (MatchStatsGrid)
 *  - Sticky Bottom CTA
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useNativeUI } from "@/hooks/useNativeUI";
import { MESSAGES } from "@/lib/messages";
import {
  LiveScoreHeader,
  MatchEventTimeline,
  MatchStatsGrid,
} from "@/components/tournament";
import {
  canManageMatch,
  getMatch,
  type MatchDetail,
  type MatchEventRecord,
} from "@/services/tournament.service";

export default function HockeyMatchDetailPage() {
  // RULE-6: (common)/layout.tsx 가 useRequireAuth() 단일 호출. 여기서는 user 데이터만 읽음.
  const { user } = useSessionAuth();
  const params = useParams();
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const isManager = canManageMatch(user?.userType);

  const id = (params?.id ?? "") as string;
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: true,
  });

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const res = await getMatch(id);
    if (res.success && res.data) {
      setMatch(res.data);
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.general);
    }
    setIsLoading(false);
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stats 집계 (LiveScoreHeader 용)
  const stats = useMemo(() => {
    if (!match) return undefined;
    const computeSide = (
      events: MatchEventRecord[],
      teamId: string | null | undefined,
    ) => {
      if (!teamId) {
        return { shots: 0, penaltyMinutes: 0, saves: 0 };
      }
      const shots = events.filter(
        (e) =>
          e.teamId === teamId &&
          (e.eventType === "shot" || e.eventType === "goal"),
      ).length;
      const penaltyMinutes = events
        .filter((e) => e.teamId === teamId && e.eventType === "penalty")
        .reduce((sum, e) => sum + (e.penaltyMinutes ?? 0), 0);
      const saves = events.filter(
        (e) => e.teamId === teamId && e.eventType === "save",
      ).length;
      return { shots, penaltyMinutes, saves };
    };
    const home = computeSide(match.events, match.homeTeam?.id);
    const away = computeSide(match.events, match.awayTeam?.id);
    return {
      homeShots: home.shots,
      awayShots: away.shots,
      homePenaltyMinutes: home.penaltyMinutes,
      awayPenaltyMinutes: away.penaltyMinutes,
      homeSaves: home.saves,
      awaySaves: away.saves,
    };
  }, [match]);

  if (isLoading || !match) {
    return null;
  }

  const isUpcoming =
    match.status === "scheduled" || match.status === "postponed";

  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const opponentLabel =
    match.opponentName ?? match.awayTeam?.name ?? "상대팀 미정";
  const venueLabel = match.rink?.name ?? match.venue?.name ?? "장소 미정";
  const feeNum = match.fee != null ? Number(match.fee) : 0;
  const feeLabel = feeNum > 0 ? `${feeNum.toLocaleString("ko-KR")}원` : "무료";

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar
        title="매치 상세 정보"
        // [appbar-harness-v4 분류 C→A] rightActions 단독 사용 시 우측 3 액션(시계/종/메뉴)이 모두 사라짐.
        //   extraActions 로 변환하여 ☰ 메뉴는 항상 노출 (PageAppBar v2.3 SoT 정책).
        extraActions={[{ icon: "share", label: "공유하기", onClick: () => {} }]}
      />

      <main className="flex flex-col bg-it-canvas dark:bg-puck pb-30 pt-0">
        {isUpcoming ? (
          // [2026-06-15] 예정 경기 — 라이브 스코어 대신 실제 일정 정보 표시.
          //   ICETIMES — 헤더는 navy 히어로, 정보는 flat 흰 섹션 hairline 행.
          <>
            <section
              aria-label="경기 정보"
              className="bg-it-blue-800 dark:bg-it-blue-950 px-5 py-5"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-w-md bg-it-red-500 text-white">
                  <Icon name="emoji_events" className="text-[24px]" aria-hidden="true" filled />
                </div>
                <div className="min-w-0">
                  {match.tournament?.name && (
                    <p className="truncate text-w-caption font-bold text-it-red-300">
                      {match.tournament.name}
                    </p>
                  )}
                  <h2 className="truncate text-w-title font-extrabold text-white">
                    {match.matchOrder ? `${match.matchOrder}경기 ` : ""}vs {opponentLabel}
                  </h2>
                </div>
              </div>
            </section>
            <dl className="mt-2 flex flex-col bg-it-surface dark:bg-it-blue-950 px-5 py-2">
              <div className="flex items-center gap-3 border-b border-it-line py-3.5 dark:border-rink-700">
                <Icon name="calendar_today" className="text-[18px] text-it-ink-400" aria-hidden="true" />
                <dt className="w-16 shrink-0 text-w-small text-it-ink-500 dark:text-rink-300">일정</dt>
                <dd className="text-w-small font-bold text-it-ink-800 dark:text-white tabular-nums">
                  {fmtDateTime(match.scheduledAt)}
                </dd>
              </div>
              <div className="flex items-center gap-3 border-b border-it-line py-3.5 dark:border-rink-700">
                <Icon name="place" className="text-[18px] text-it-ink-400" aria-hidden="true" />
                <dt className="w-16 shrink-0 text-w-small text-it-ink-500 dark:text-rink-300">장소</dt>
                <dd className="min-w-0 truncate text-w-small font-bold text-it-ink-800 dark:text-white">
                  {venueLabel}
                </dd>
              </div>
              <div className="flex items-center gap-3 py-3.5">
                <Icon name="payments" className="text-[18px] text-it-ink-400" aria-hidden="true" />
                <dt className="w-16 shrink-0 text-w-small text-it-ink-500 dark:text-rink-300">참가비</dt>
                <dd className="text-w-small font-bold text-it-ink-800 dark:text-white tabular-nums">
                  {feeLabel}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <section className="mt-2 flex flex-col gap-6 bg-it-surface dark:bg-it-blue-950 px-5 py-5">
            {/* Live Score Header (공유 컴포넌트 — ICETIMES flat variant) */}
            <LiveScoreHeader match={match} stats={stats} iceTheme />

            {/* 실시간 경기 기록 */}
            <div aria-labelledby="events-title">
              <div className="mb-4 flex items-center justify-between">
                <h2
                  id="events-title"
                  className="text-w-title font-bold text-it-ink-800 dark:text-white"
                >
                  실시간 경기 기록
                </h2>
                <span className="text-w-caption text-it-ink-400">
                  총 {match.events.length}건
                </span>
              </div>
              <MatchEventTimeline
                events={match.events}
                homeTeamId={match.homeTeam?.id}
                homeTeamName={match.homeTeam?.name}
                awayTeamName={match.opponentName ?? match.awayTeam?.name}
                isManager={false}
                iceTheme
              />
            </div>

            {/* 경기 통계 (공유 컴포넌트 — ICETIMES flat variant) */}
            <MatchStatsGrid match={match} iceTheme />
          </section>
        )}

        {/* 권한 안내 (일반 사용자) */}
        {!isManager && (
          <div className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4">
            <p className="rounded-w-md border border-it-line-strong bg-it-fill px-4 py-3 text-center text-w-caption text-it-ink-500 dark:border-rink-700 dark:bg-rink-800 dark:text-rink-300">
              {MESSAGES.tournament.viewOnlyHint}
            </p>
          </div>
        )}
      </main>

      {/* Sticky Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-it-line bg-it-surface/90 p-5 pb-8 dark:border-rink-700 dark:bg-it-blue-950/90">
        <div className="mx-auto flex max-w-md gap-3">
          <button
            type="button"
            onClick={() => navigate("/tournaments")}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface text-w-small font-bold text-it-ink-800 hover:bg-it-fill dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700"
          >
            <Icon name="history" className="text-xl" />
            전체 일정
          </button>
          {isManager ? (
            <button
              type="button"
              onClick={() => navigate(`/hockey-matches/${id}/live`)}
              className="flex h-14 flex-[2] items-center justify-center gap-2 rounded-w-md bg-it-blue-500 text-w-small font-bold text-white shadow-sh-1 transition-transform motion-reduce:transition-none hover:bg-it-blue-600 active:scale-95"
            >
              <Icon name="edit_square" className="text-xl" />
              실시간 스코어 입력
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate(`/hockey-matches/${id}/live`)}
              className="flex h-14 flex-[2] items-center justify-center gap-2 rounded-w-md bg-it-blue-500 text-w-small font-bold text-white shadow-sh-1 transition-transform motion-reduce:transition-none hover:bg-it-blue-600 active:scale-95"
            >
              <Icon name="scoreboard" className="text-xl" />
              실시간 스코어보드
            </button>
          )}
        </div>
      </div>
    </MobileContainer>
  );
}
