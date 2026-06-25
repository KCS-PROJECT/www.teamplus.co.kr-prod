"use client";

/**
 * Live Scoreboard Page — 실시간 스코어보드
 *
 * 레퍼런스: 사용자 제공 HTML "실시간 경기 스코어보드"
 *
 * 경로:
 *  - /hockey-matches/[id]/live
 *
 * 역할 동작:
 *  - DIRECTOR/COACH/ADMIN : 이벤트 입력 폼 + 이벤트 삭제 + 상태 전환 버튼
 *  - PARENT/TEEN/CHILD    : 실시간 피드 조회만 (5초 폴링)
 *
 * 데이터 동기화:
 *  - WebSocket이 없으므로 5초 폴링으로 실시간 반영 (관리자 입력 후 즉시 refetch)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useModal } from "@/components/ui/Modal";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useMatchSocket } from "@/hooks/useMatchSocket";
import { MESSAGES } from "@/lib/messages";
import {
  websocketBridge,
  WebSocketEventType,
} from "@/services/websocket-bridge";
import {
  LiveScoreHeader,
  MatchEventTimeline,
  MatchEventInputForm,
} from "@/components/tournament";
import {
  canManageMatch,
  createMatchEvent,
  deleteMatchEvent,
  getMatch,
  updateMatchLiveState,
  type CreateMatchEventInput,
  type MatchDetail,
  type MatchStatus,
} from "@/services/tournament.service";

/**
 * Socket.io 미연결 환경을 위한 안전망 폴링 간격 (60초)
 * TODO: Backend notifications.gateway에 match_update emit 추가 후 이 값을 0으로 낮추거나 제거 가능
 * 기존 5초 → 60초로 완화 (Socket.io 이벤트가 1차 업데이트 수단)
 */
const FALLBACK_POLL_INTERVAL_MS = 60_000;

type FilterKey = "all" | "goal" | "penalty";

export default function LiveScoreboardPage() {
  // RULE-6: (common)/layout.tsx 가 useRequireAuth() 단일 호출. 여기서는 user 데이터만 읽음.
  const { user } = useSessionAuth();
  const params = useParams();
  const { toast } = useToast();
  const { modal } = useModal();
  const isManager = canManageMatch(user?.userType);

  const id = (params?.id ?? "") as string;
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false, // 몰입형 — BottomNav 숨김
    showBackButton: true,
  });

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!id) return;
      if (!opts.silent) setIsLoading(true);
      const res = await getMatch(id);
      if (res.success && res.data) {
        setMatch(res.data);
      } else if (!opts.silent) {
        toast.error(res.error?.message ?? MESSAGES.error.general);
      }
      if (!opts.silent) setIsLoading(false);
    },
    [id, toast],
  );

  // 초기 로드
  useEffect(() => {
    void load();
  }, [load]);

  // 라이브 상태 판정 — Match Scoreboard Gateway 구독 활성화 + 폴링 안전망
  const isLive =
    match?.status === "in_progress" ||
    match?.status === "warmup" ||
    match?.status === "intermission";

  // 1차 채널: Match Scoreboard 전용 namespace `/match-scoreboard`
  // - match:score-update / match:status-change 이벤트 수신 → 즉시 silent reload
  useMatchSocket({
    matchId: id,
    enabled: Boolean(id) && Boolean(isLive),
    onScoreUpdate: () => {
      void load({ silent: true });
    },
    onStatusChange: () => {
      void load({ silent: true });
    },
  });

  // 2차 채널(레거시 호환): notifications namespace `match_update` 이벤트
  // 3차 안전망: 60초 폴링 (Socket.io 미연결/네이티브 미지원 환경)
  useEffect(() => {
    if (!isLive) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const unsub = websocketBridge.subscribe(
      WebSocketEventType.MatchUpdate,
      (payload: Record<string, unknown>) => {
        const payloadMatchId = payload.matchId as string | undefined;
        if (!payloadMatchId || payloadMatchId === id) {
          void load({ silent: true });
        }
      },
    );

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
  }, [isLive, load, id]);

  const handleCreateEvent = useCallback(
    async (input: CreateMatchEventInput) => {
      if (!isManager || !id) return;
      setIsSubmitting(true);
      try {
        const res = await createMatchEvent(id, input);
        if (res.success) {
          toast.success(MESSAGES.matchEvent.created);
          await load({ silent: true });
        } else {
          toast.error(res.error?.message ?? MESSAGES.matchEvent.createFailed);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [id, isManager, load, toast],
  );

  const handleDeleteEvent = useCallback(
    async (eventId: string) => {
      if (!isManager || !id) return;
      const confirmed = await modal.confirm({
        title: "이벤트 삭제",
        message: MESSAGES.matchEvent.deleteConfirm,
        confirmText: "삭제하기",
        cancelText: "취소",
        variant: "danger",
      });
      if (!confirmed) return;
      const res = await deleteMatchEvent(id, eventId);
      if (res.success) {
        toast.success(MESSAGES.matchEvent.deleted);
        await load({ silent: true });
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.general);
      }
    },
    [id, isManager, load, modal, toast],
  );

  const handleChangeStatus = useCallback(
    async (status: MatchStatus, currentPeriod?: number) => {
      if (!isManager || !id) return;
      const res = await updateMatchLiveState(id, { status, currentPeriod });
      if (res.success) {
        toast.success(MESSAGES.match.liveStateChanged);
        await load({ silent: true });
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.general);
      }
    },
    [id, isManager, load, toast],
  );

  if (isLoading || !match) {
    return null;
  }

  const filteredEvents = match.events.filter((e) => {
    if (filter === "all") return true;
    if (filter === "goal") return e.eventType === "goal";
    if (filter === "penalty") return e.eventType === "penalty";
    return true;
  });

  return (
    <MobileContainer hasBottomNav={false} className="pb-10">
      <PageAppBar title="Live Score" />

      {/* 필터 탭 */}
      <div className="sticky top-14 z-40 border-b border-it-line bg-it-surface pb-4 pt-2 dark:border-rink-800 dark:bg-it-blue-950">
        <div className="no-scrollbar overflow-x-auto px-4">
          <div className="flex gap-2" role="tablist" aria-label="이벤트 필터">
            <FilterChip
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label="All Events"
            />
            <FilterChip
              active={filter === "goal"}
              onClick={() => setFilter("goal")}
              label="Goals"
            />
            <FilterChip
              active={filter === "penalty"}
              onClick={() => setFilter("penalty")}
              label="Penalties"
            />
          </div>
        </div>
      </div>

      <main className="flex flex-col gap-6 bg-it-canvas dark:bg-puck px-5 py-6">
        {/* 스코어 헤더 (공유 컴포넌트 — ICETIMES flat variant, 구조·로직 동결) */}
        <LiveScoreHeader match={match} iceTheme />

        {/* 관리자 전용: 상태 전환 버튼 — flat 흰 섹션(박스 → 무라운드 hairline) */}
        {isManager && (
          <section
            aria-labelledby="status-controls-title"
            className="-mx-5 bg-it-surface px-5 py-4 dark:bg-it-blue-950"
          >
            <h3
              id="status-controls-title"
              className="mb-3 text-w-small font-bold text-it-ink-800 dark:text-white"
            >
              경기 상태 전환
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { s: "scheduled", label: "예정", icon: "schedule" },
                  { s: "in_progress", label: "진행", icon: "play_circle" },
                  { s: "intermission", label: "휴식", icon: "pause_circle" },
                  { s: "completed", label: "종료", icon: "stop_circle" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.s}
                  type="button"
                  onClick={() => handleChangeStatus(opt.s as MatchStatus)}
                  className={`flex flex-col items-center gap-1 rounded-w-md border-[1.5px] px-2 py-3 text-w-caption font-bold transition-colors motion-reduce:transition-none ${
                    match.status === opt.s
                      ? "border-it-blue-500 bg-it-blue-500 text-white"
                      : "border-it-line-strong bg-it-fill text-it-ink-600 hover:bg-it-line dark:border-rink-700 dark:bg-rink-700 dark:text-rink-100"
                  }`}
                >
                  <Icon name={opt.icon} className="text-w-body-lg" />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            {/* 피리어드 전환 */}
            <div className="mt-3 flex items-center justify-between gap-2 rounded-w-md bg-it-fill p-2 dark:bg-rink-900">
              <span className="pl-2 text-w-caption font-bold text-it-ink-600 dark:text-rink-300">
                현재 피리어드
              </span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() =>
                      handleChangeStatus(
                        match.status === "scheduled"
                          ? "in_progress"
                          : match.status,
                        n,
                      )
                    }
                    className={`h-8 w-10 rounded-w-sm text-w-caption font-bold transition-colors motion-reduce:transition-none ${
                      match.currentPeriod === n
                        ? "bg-it-blue-500 text-white"
                        : "bg-it-surface text-it-ink-600 hover:bg-it-line dark:bg-rink-700 dark:text-rink-100"
                    }`}
                  >
                    {MESSAGES.match.periodLabel(n)}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 이벤트 타임라인 */}
        <section aria-labelledby="events-title">
          <h2
            id="events-title"
            className="mb-4 text-w-title font-bold text-it-ink-800 dark:text-white"
          >
            경기 이벤트
          </h2>
          <MatchEventTimeline
            events={filteredEvents}
            homeTeamId={match.homeTeam?.id}
            homeTeamName={match.homeTeam?.name}
            awayTeamName={match.awayTeam?.name}
            isManager={isManager}
            onDelete={handleDeleteEvent}
            iceTheme
          />
        </section>

        {/* 관리자 전용: 이벤트 입력 폼 */}
        {isManager && (
          <MatchEventInputForm
            match={match}
            onSubmit={handleCreateEvent}
            isSubmitting={isSubmitting}
            iceTheme
          />
        )}

        {!isManager && (
          <p className="rounded-w-md border border-it-line-strong bg-it-fill px-4 py-3 text-center text-w-caption text-it-ink-500 dark:border-rink-700 dark:bg-rink-800 dark:text-rink-300">
            {MESSAGES.tournament.viewOnlyHint}
          </p>
        )}
      </main>
    </MobileContainer>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-w-pill px-5 py-2 text-w-caption font-bold transition-colors motion-reduce:transition-none ${
        active
          ? "bg-it-blue-500 text-white shadow-sh-1"
          : "border-[1.5px] border-it-line-strong bg-it-surface text-it-ink-600 hover:bg-it-fill dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700"
      }`}
    >
      {label}
    </button>
  );
}
