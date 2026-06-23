"use client";

/**
 * Live Scoreboard Hub Page — 모든 진행/예정/종료 매치를 한 눈에 보는 허브
 *
 * 레퍼런스: 사용자 제공 HTML "실시간 경기 스코어보드"
 *
 * 경로:
 *  - /scoreboard
 *
 * 역할 동작:
 *  - 모든 인증 사용자 접근 가능 (조회 전용 허브)
 *  - DIRECTOR/COACH/ADMIN: 카드 우측에 "입력" 배지 → /hockey-matches/[id]/live 이동
 *  - PARENT/TEEN/CHILD   : 카드 탭 → /hockey-matches/[id] (읽기 전용 상세)
 *
 * 특징:
 *  - tournament.service 의 listMatches() 사용 (직접 api.get 호출 제거)
 *  - 5초 폴링 (in_progress / warmup / intermission 매치가 있을 때만)
 *  - LiveIndicator 컴포넌트 재사용
 *  - MobileContainer + RoleBottomNav 자동 사용
 *  - MESSAGES 상수 사용 (하드코딩 금지)
 *  - dark mode 완전 지원
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRequireAuth } from "@/contexts/AuthContext";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNavigation, NavLink } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useNativeUI } from "@/hooks/useNativeUI";
import { resolveImageSrc } from "@/lib/image-url";
import { cn } from "@/lib/utils";
import { MESSAGES } from "@/lib/messages";
import dynamic from "next/dynamic";
const GlobalMenu = dynamic(
  () =>
    import("@/components/layout/GlobalMenu").then((mod) => ({
      default: mod.GlobalMenu,
    })),
  { ssr: false },
);
import { LiveIndicator } from "@/components/tournament";
import {
  websocketBridge,
  WebSocketEventType,
} from "@/services/websocket-bridge";
import {
  canManageMatch,
  listMatches,
  type MatchStatus,
  type MatchSummary,
} from "@/services/tournament.service";

type FilterKey = "all" | "live" | "upcoming" | "finished";

const FILTER_BUTTONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "live", label: "진행 중" },
  { key: "upcoming", label: "예정" },
  { key: "finished", label: "종료" },
];

/**
 * Socket.io 미연결 환경을 위한 안전망 폴링 간격 (60초)
 * TODO: Backend notifications.gateway에 match_update emit 추가 후 이 값을 0으로 낮추거나 제거 가능
 * 기존 5초 → 60초로 완화 (Socket.io 이벤트가 1차 업데이트 수단)
 */
const FALLBACK_POLL_INTERVAL_MS = 60_000;

function classifyStatus(status: MatchStatus): FilterKey {
  if (
    status === "in_progress" ||
    status === "warmup" ||
    status === "intermission"
  ) {
    return "live";
  }
  if (status === "scheduled") return "upcoming";
  return "finished";
}

export default function ScoreboardPage() {
  useRequireAuth();
  const { user } = useSessionAuth();
  const { toast } = useToast();
  const { back } = useNavigation();
  const isManager = canManageMatch(user?.userType);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // [C3 fix 2026-05-14] 앱 상단바 미표시 이슈 해결.
  //   기존: showAppBar:false + PageAppBar(forceNative 미설정) 조합 →
  //         Flutter WebView 에서 PageAppBar 가 null 반환(isNative 가드) +
  //         네이티브 AppBar 도 꺼져 있어 헤더가 통째로 사라짐.
  //   수정: 네이티브 AppBar 도 꺼두지만 PageAppBar 에 forceNative=true 부여하여
  //         DOM 기반 헤더가 Flutter 환경에서도 항상 렌더되도록 함 (SubmainAppBar 패턴 동일).
  useNativeUI({
    showStatusBar: true,
    showAppBar: false, // 커스텀 헤더(DOM PageAppBar forceNative) 사용
    showBottomNav: true,
    showBackButton: true,
  });

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setIsLoading(true);
      try {
        const res = await listMatches();
        if (res.success && res.data) {
          // 최근 일정 순으로 정렬 (scheduled > in_progress 를 섞어서 볼 수 있게)
          const sorted = [...res.data].sort((a, b) => {
            const ta = new Date(a.scheduledAt).getTime();
            const tb = new Date(b.scheduledAt).getTime();
            return tb - ta;
          });
          setMatches(sorted);
        } else if (!opts.silent) {
          toast.error(res.error?.message ?? MESSAGES.error.general);
          setMatches([]);
        }
      } catch {
        if (!opts.silent) {
          toast.error(MESSAGES.error.network);
        }
      } finally {
        if (!opts.silent) setIsLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Socket.io match_update 이벤트 구독 — 라이브 매치 업데이트 즉시 반영
  useEffect(() => {
    const hasLive = matches.some((m) => classifyStatus(m.status) === "live");
    if (!hasLive) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    // 1차: Socket.io 이벤트 수신 시 목록 재조회
    const unsub = websocketBridge.subscribe(
      WebSocketEventType.MatchUpdate,
      () => {
        void load({ silent: true });
      },
    );

    // 2차 안전망: Socket.io 미연결/Backend emit 미구현 환경 대비 60초 폴링
    // TODO: Backend match_update emit 구현 완료 후 아래 fallback 제거 가능
    pollRef.current = setInterval(() => {
      void load({ silent: true });
    }, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      unsub();
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [matches, load]);

  const filteredMatches = useMemo(() => {
    if (filter === "all") return matches;
    return matches.filter((m) => classifyStatus(m.status) === filter);
  }, [matches, filter]);

  const liveCount = useMemo(
    () => matches.filter((m) => classifyStatus(m.status) === "live").length,
    [matches],
  );

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar
        title="실시간 스코어"
        // [C3 fix 2026-05-14] forceNative=true — Flutter WebView 에서도 DOM PageAppBar 가
        //   렌더되도록 보장 (SubmainAppBar 와 동일 정책). useNativeUI showAppBar:false 와 짝.
        forceNative
        // [수정 2026-05-30] 사용자 요청 — 커스텀 새로고침(refresh) extraActions 제거.
        //   PageAppBar detail variant 의 표준 공통 우측 액션(알림 🔔 + 메뉴 ≡)을 그대로 사용한다.
        //   (실시간 갱신은 WebSocket match_update + polling 으로 자동 처리되므로 수동 새로고침 불필요.)
      />

      {/* Match List — 라이브 점수 변경 시 SR 즉시 알림 (assertive)
          [C3 fix 2026-05-14] 필터 탭을 main 스크롤 컨테이너 내부로 이동 (sticky top-0 적용).
            기존: 필터가 main 외부 → sticky 동작 불가 + 경기 카드가 필터 영역 침범.
            수정: 필터를 main 내부 첫 요소로 두고 sticky top-0 z-10 처리. 카드는 sticky 헤더
                  아래로 안전하게 스크롤. py-5 제거하고 카드 영역에 pb-5 만 적용. */}
      <main
        className="flex-1 overflow-y-auto"
        role="region"
        aria-label={liveCount > 0 ? `라이브 경기 ${liveCount}건 진행 중` : '경기 목록'}
        aria-live={liveCount > 0 ? 'assertive' : 'polite'}
        aria-atomic="false"
        aria-relevant="additions text"
      >
        {/* 필터 탭 (sticky) — overflow-x-auto + snap-x mandatory + 4-tab 너비 px-5→px-4 축소 */}
        <div className="sticky top-0 z-10 border-b border-wline-2 bg-white px-4 pb-3 pt-3 dark:border-rink-700 dark:bg-puck">
          <div
            role="tablist"
            aria-label="스코어보드 필터"
            className="no-scrollbar flex gap-2 overflow-x-auto snap-x snap-mandatory"
          >
            {FILTER_BUTTONS.map((btn) => {
              const active = filter === btn.key;
              return (
                <button
                  key={btn.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(btn.key)}
                  className={cn(
                    "flex-shrink-0 snap-start whitespace-nowrap rounded-w-pill px-4 py-2 text-card-meta font-bold tracking-wide transition-colors motion-reduce:transition-none",
                    active
                      ? "bg-ice-500 text-white shadow-sh-1"
                      : "border border-wline-2 bg-white text-wtext-2 hover:bg-wbg dark:border-rink-700 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700",
                  )}
                >
                  {btn.label}
                  {btn.key === "live" && liveCount > 0 && (
                    <span
                      className={cn(
                        "ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-w-pill px-1 text-[9px] font-bold tabular-nums",
                        active
                          ? "bg-white/20 text-white"
                          : "bg-red-100 text-flame-500 dark:bg-flame-500/15 dark:text-flame-500",
                      )}
                    >
                      {liveCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 경기 카드 목록 */}
        <div className="px-4 pt-4 pb-5">
          {isLoading ? null : filteredMatches.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <ul className="space-y-4" aria-label="경기 목록">
              {filteredMatches.map((match) => (
                <li key={match.id}>
                  <ScoreboardMatchCard match={match} isManager={isManager} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}

// ============================================
// ScoreboardMatchCard - 스코어보드 전용 매치 카드
// ============================================

function ScoreboardMatchCard({
  match,
  isManager,
}: {
  match: MatchSummary;
  isManager: boolean;
}) {
  const classification = classifyStatus(match.status);
  const isLive = classification === "live";
  const isUpcoming = classification === "upcoming";
  const isFinished = classification === "finished";
  const statusLabel = MESSAGES.match.statusLabel[match.status] ?? match.status;

  // 관리자는 라이브 입력 화면으로, 일반 사용자는 상세로
  const href =
    isManager && isLive
      ? `/hockey-matches/${match.id}/live`
      : `/hockey-matches/${match.id}`;

  const scheduled = new Date(match.scheduledAt);
  const scheduledTime = scheduled.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <NavLink
      href={href}
      className={cn(
        "relative block overflow-hidden rounded-w-lg border bg-white shadow-sh-1 transition-all motion-reduce:transition-none hover:shadow-sh-1 dark:bg-rink-800",
        isLive
          ? "border-ice-500/30 ring-2 ring-ice-500/10"
          : "border-wline-2 dark:border-rink-700",
      )}
      aria-label={`${match.homeTeam?.name ?? "홈팀"} vs ${match.awayTeam?.name ?? "원정팀"} 경기 상세 보기`}
    >
      <div className="flex items-center p-4">
        <TeamColumn team={match.homeTeam} fallback="HOME" />

        <div className="flex w-[40%] shrink-0 flex-col items-center justify-center px-2">
          {isUpcoming ? (
            <>
              <span className="mb-1 text-card-meta font-medium text-wtext-3 dark:text-wtext-4">
                {scheduledTime}
              </span>
              <span className="text-card-title font-bold text-wtext-2 dark:text-wtext-4">
                VS
              </span>
              <span className="mt-1 truncate text-card-meta text-wtext-3">
                {match.rink?.name ?? match.venue?.name ?? "경기장 미정"}
              </span>
            </>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-center gap-3">
                <span className="text-4xl font-bold tabular-nums text-wtext-1 dark:text-white">
                  {match.homeScore}
                </span>
                <span className="text-2xl font-light text-wtext-3 dark:text-wtext-4">
                  :
                </span>
                <span className="text-4xl font-bold tabular-nums text-wtext-1 dark:text-white">
                  {match.awayScore}
                </span>
              </div>
              {isLive && (
                <>
                  <LiveIndicator isLive statusLabel={statusLabel} />
                  {match.currentPeriod != null && (
                    <span className="mt-1 text-[11px] font-semibold text-ice-500">
                      {MESSAGES.match.periodLabel(match.currentPeriod)}
                    </span>
                  )}
                </>
              )}
              {isFinished && (
                <span className="rounded bg-wline-2 px-2 py-0.5 text-[10px] font-bold text-wtext-2 dark:bg-rink-700 dark:text-wtext-4">
                  {statusLabel}
                </span>
              )}
            </>
          )}
        </div>

        <TeamColumn team={match.awayTeam} fallback="AWAY" />
      </div>

      {/* 하단 메타 (라운드, 장소) */}
      {(match.round || match.rink?.name || match.venue?.name) &&
        !isUpcoming && (
          <div className="flex items-center justify-between border-t border-wline-2 bg-wbg/50 px-4 py-2 text-[11px] text-wtext-3 dark:border-rink-700 dark:bg-puck/40 dark:text-wtext-3">
            <span className="flex items-center gap-1">
              <Icon name="emoji_events" className="text-card-body" />
              {match.round ? MESSAGES.match.roundLabel[match.round] : "경기"}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="location_on" className="text-card-body" />
              {match.rink?.name ?? match.venue?.name ?? "-"}
            </span>
            {isManager && isLive && (
              <span className="flex items-center gap-0.5 rounded-w-pill bg-ice-500/15 px-2 py-0.5 text-[10px] font-bold text-ice-500">
                <Icon name="edit_square" className="text-card-meta" />
                입력
              </span>
            )}
          </div>
        )}
    </NavLink>
  );
}

function TeamColumn({
  team,
  fallback,
}: {
  team: MatchSummary["homeTeam"];
  fallback: string;
}) {
  const name = team?.name ?? fallback;
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex w-[30%] shrink-0 flex-col items-center gap-2">
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-w-pill border border-wline-2 bg-wline-2 dark:border-rink-700 dark:bg-rink-700">
        {resolveImageSrc(team?.logoUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageSrc(team?.logoUrl)}
            alt={`${name} 로고`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-card-title font-black text-ice-500" aria-hidden="true">
            {initial}
          </span>
        )}
      </div>
      <span className="line-clamp-1 max-w-[80px] text-center text-card-meta font-bold tracking-wide text-wtext-1 dark:text-white">
        {name}
      </span>
    </div>
  );
}

function EmptyState({ filter }: { filter: FilterKey }) {
  const message =
    filter === "live"
      ? MESSAGES.scoreboard.noLive
      : filter === "upcoming"
        ? MESSAGES.scoreboard.noUpcoming
        : filter === "finished"
          ? MESSAGES.scoreboard.noFinished
          : MESSAGES.empty("경기");

  return (
    <div className="flex flex-col items-center justify-center rounded-w-lg border border-dashed border-wline-2 bg-white py-16 dark:border-rink-700 dark:bg-rink-800">
      <Icon name="sports_hockey" className="mb-3 text-5xl text-wtext-4" />
      <p className="text-card-body text-wtext-3 dark:text-wtext-4">{message}</p>
    </div>
  );
}
