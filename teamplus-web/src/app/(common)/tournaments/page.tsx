"use client";

/**
 * Tournament List Page (공통 — 모든 인증 사용자 접근 가능)
 *
 * 레퍼런스: 사용자 제공 HTML "대회 및 경기 목록"
 *
 * 역할 동작:
 *  - DIRECTOR/COACH/ADMIN : "새 대회 등록" CTA + 카드에 수정/삭제 버튼 노출
 *  - PARENT/TEEN/CHILD/ACADEMY_DIRECTOR : 조회 전용 (신청/대진표/대기 등록)
 *
 * 구조:
 *  - Sticky Header (뒤로가기 + 제목 + 검색)
 *  - Segmented Control (진행 중인 대회 / 지난 대회)
 *  - TournamentListCard 리스트
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
// [BUG FIX 2026-05-19 W3 #10] SubmainAppBar → PageAppBar 교체 — SubmainAppBar 는 BottomNav 탭
//   허브 화면 전용 4-icon 헤더로 뒤로가기 미지원. 사용자가 "전체 메뉴 → 대회 관리" 로 진입 시
//   뒤로가기 필요. PageAppBar 사용 + showBack/onBack 으로 표준 뒤로가기 제공.
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useModal } from "@/components/ui/Modal";
import { useNativeUI } from "@/hooks/useNativeUI";
import { MESSAGES } from "@/lib/messages";
import { TournamentListCard } from "@/components/tournament";
import { cn } from "@/lib/utils";
import { useRefreshSubscription, REFRESH_KEYS } from "@/lib/refresh-bus";
import {
  canManageMatch,
  deleteTournament,
  listTournaments,
  mapTournamentUiStatus,
  type TournamentListItem,
  type TournamentUiStatus,
} from "@/services/tournament.service";

type Tab = "active" | "past";

export default function CommonTournamentsPage() {
  const { user } = useSessionAuth();
  const { navigate } = useNavigation();
  const router = useRouter();
  const { toast } = useToast();
  const { modal } = useModal();
  const isManager = canManageMatch(user?.userType);

  const [tab, setTab] = useState<Tab>("active");
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [search, setSearch] = useState("");

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await listTournaments();
      if (res.success && res.data) {
        setTournaments(res.data);
      } else {
        setTournaments([]);
      }
    } catch {
      setTournaments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // [추가 T07-H 2026-05-15] 대회 생성/수정/삭제 후 listing 갱신.
  //   create page 및 detail page 에서 emitRefresh(REFRESH_KEYS.TOURNAMENTS) 발화 시 자동 재 fetch.
  useRefreshSubscription(REFRESH_KEYS.TOURNAMENTS, () => {
    void load();
  });

  // 두 탭을 동시에 DOM에 렌더하여 carousel 스타일로 슬라이드하므로 각각 미리 계산
  const { activeList, pastList } = useMemo(() => {
    const now = new Date();
    const q = search.trim().toLowerCase();
    const active: TournamentListItem[] = [];
    const past: TournamentListItem[] = [];

    for (const t of tournaments) {
      if (q) {
        const matches =
          t.name.toLowerCase().includes(q) ||
          (t.club?.clubName?.toLowerCase().includes(q) ?? false) ||
          (t.rink?.name?.toLowerCase().includes(q) ?? false);
        if (!matches) continue;
      }
      const ui: TournamentUiStatus = mapTournamentUiStatus(
        t.status,
        t.endDate,
        now,
      );
      const isActive =
        ui === "recruiting" ||
        ui === "closing_soon" ||
        ui === "closed" ||
        ui === "in_progress";
      if (isActive) active.push(t);
      else past.push(t);
    }

    return { activeList: active, pastList: past };
  }, [tournaments, search]);

  const handleEdit = useCallback(
    (id: string) => {
      if (!isManager) return;
      navigate(`/tournaments/create?edit=${id}`);
    },
    [isManager, navigate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!isManager) return;
      const confirmed = await modal.confirm({
        title: "대회 삭제",
        message: MESSAGES.tournament.deleteConfirm,
        confirmText: "삭제하기",
        cancelText: "취소",
        variant: "danger",
      });
      if (!confirmed) return;
      const res = await deleteTournament(id);
      if (res.success) {
        toast.success(MESSAGES.tournament.deleted);
        setTournaments((prev) => prev.filter((t) => t.id !== id));
      } else {
        toast.error(res.error?.message ?? MESSAGES.tournament.deleteHasMatches);
      }
    },
    [isManager, modal, toast],
  );

  return (
    <MobileContainer hasBottomNav>
      {/* [BUG FIX 2026-05-19 W3 #10] PageAppBar showBack onBack forceNative —
          전체 메뉴 → 대회 관리 경유 진입 시 뒤로가기 버튼 노출. */}
      <PageAppBar
        title={isManager ? "대회관리" : "대회 및 경기 목록"}
        showBack
        onBack={() => router.back()}
        forceNative
      />

      <main className="flex-1 overflow-y-auto bg-it-canvas pb-30 dark:bg-puck">
        {/* 검색 + 필터 영역 — flat 흰 섹션(카드 박스 제거) */}
        <div className="border-b border-it-line bg-it-surface dark:border-rink-700 dark:bg-it-blue-950">
          {/* 검색창 */}
          <div className="px-5 pt-3">
            <label htmlFor="tournament-search" className="sr-only">
              대회 검색
            </label>
            <div className="group relative">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-it-ink-400 dark:text-wtext-4 transition-colors duration-150 ease-ios group-focus-within:text-it-blue-500">
                <Icon name="search" className="text-[20px]" aria-hidden="true" />
              </div>
              <input
                id="tournament-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="대회명, 팀, 장소 검색"
                className="h-11 w-full appearance-none rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill pl-10 pr-10 text-w-body text-it-ink-800 placeholder:text-it-ink-400 transition-colors duration-150 ease-ios focus:border-it-blue-500 focus:bg-it-surface focus:outline-none dark:border-rink-700 dark:bg-rink-700 dark:text-white dark:placeholder:text-wtext-4 dark:focus:bg-rink-800 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-w-pill text-it-ink-400 hover:bg-it-fill hover:text-it-ink-800 transition-colors motion-reduce:transition-none dark:text-wtext-4 dark:hover:bg-rink-600 dark:hover:text-white"
                  aria-label="검색어 지우기"
                >
                  <Icon name="close" className="text-w-body-lg" />
                </button>
              )}
            </div>
          </div>

          {/* Segmented Control — sliding pill 인디케이터 */}
          <div className="px-5 py-3">
            <div
              role="tablist"
              aria-label="대회 필터"
              className="relative flex h-11 w-full items-center rounded-w-md bg-it-fill border-[1.5px] border-it-line-strong p-1 dark:border-rink-700 dark:bg-rink-700"
            >
              {/* 탭 간 부드럽게 슬라이드하는 인디케이터 */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-1 top-1 left-1 w-[calc(50%-0.25rem)] rounded-w-sm bg-it-blue-500 transition-transform duration-300 ease-ios"
                style={{
                  transform:
                    tab === "active" ? "translateX(0%)" : "translateX(100%)",
                }}
              />
              <button
                role="tab"
                type="button"
                aria-selected={tab === "active"}
                onClick={() => setTab("active")}
                className={cn(
                  "relative z-10 flex h-full grow items-center justify-center rounded-w-sm px-2 text-w-small font-bold tracking-wide transition-colors duration-300 ease-ios motion-reduce:transition-none",
                  tab === "active"
                    ? "text-white"
                    : "text-it-ink-600 dark:text-wtext-4",
                )}
              >
                진행 중인 대회
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={tab === "past"}
                onClick={() => setTab("past")}
                className={cn(
                  "relative z-10 flex h-full grow items-center justify-center rounded-w-sm px-2 text-w-small font-bold tracking-wide transition-colors duration-300 ease-ios motion-reduce:transition-none",
                  tab === "past"
                    ? "text-white"
                    : "text-it-ink-600 dark:text-wtext-4",
                )}
              >
                지난 대회
              </button>
            </div>
          </div>
        </div>

        {/* Tournament List — 캐러셀 스타일: 두 탭이 가로로 이어져 함께 슬라이드 */}
        <div className="overflow-hidden pt-4">
          <div
            className="flex w-[200%] transition-transform duration-300 ease-ios"
            style={{
              transform: `translateX(${tab === "active" ? "0%" : "-50%"})`,
            }}
          >
            {/* 진행 중인 대회 패널 */}
            <div
              role="tabpanel"
              aria-hidden={tab !== "active"}
              className="flex w-1/2 shrink-0 flex-col gap-3 px-4 pb-30"
            >
              {/* 결과 카운트 — 로딩이 아니고 비어있지 않을 때만 */}
              {!isLoading && activeList.length > 0 && (
                <div
                  className="flex items-center gap-2 pt-1"
                  aria-live="polite"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-w-pill bg-it-blue-50 px-2.5 py-1 text-w-caption font-bold text-it-blue-500 dark:bg-it-blue-500/15">
                    <Icon
                      name="emoji_events"
                      className="text-[14px]"
                      aria-hidden="true"
                    />
                    <span>진행 중 <span className="font-num tabular-nums">{activeList.length}</span>건</span>
                  </span>
                </div>
              )}

              {isLoading ? null : activeList.length === 0 ? (
                <EmptyState
                  title={
                    search ? "검색 결과가 없어요" : "진행 중인 대회가 없어요"
                  }
                  description={
                    search
                      ? "다른 검색어로 시도해보세요."
                      : isManager
                        ? "우측 하단 버튼을 눌러 첫 대회를 등록해주세요."
                        : "새로운 대회가 열리면 이곳에서 확인하실 수 있습니다."
                  }
                />
              ) : (
                // ICETIMES — flat 카드는 full-bleed 흰 섹션 위에 hairline 행으로(회색 위 떠보임 방지).
                <section className="-mx-4 bg-it-surface px-4 dark:bg-it-blue-950">
                  {activeList.map((t) => (
                    <TournamentListCard
                      key={t.id}
                      tournament={t}
                      isManager={isManager}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      iceTheme
                    />
                  ))}
                </section>
              )}
            </div>
            {/* 지난 대회 패널 */}
            <div
              role="tabpanel"
              aria-hidden={tab !== "past"}
              className="flex w-1/2 shrink-0 flex-col gap-3 px-4 pb-30"
            >
              {!isLoading && pastList.length > 0 && (
                <div
                  className="flex items-center gap-2 pt-1"
                  aria-live="polite"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-w-pill bg-it-fill px-2.5 py-1 text-w-caption font-bold text-it-ink-600 dark:bg-rink-700 dark:text-wtext-4">
                    <Icon
                      name="history"
                      className="text-[14px]"
                      aria-hidden="true"
                    />
                    <span>지난 대회 <span className="font-num tabular-nums">{pastList.length}</span>건</span>
                  </span>
                </div>
              )}

              {isLoading ? null : pastList.length === 0 ? (
                <div
                  role="status"
                  className="flex flex-col items-center px-6 py-16 text-center"
                >
                  <Icon
                    name={search ? "search_off" : "emoji_events"}
                    className="mb-3 text-[40px] text-it-ink-300 dark:text-wtext-4"
                    aria-hidden="true"
                  />
                  <p className="text-w-body font-bold text-it-ink-800 dark:text-white">
                    {search ? "검색 결과가 없어요" : "지난 대회가 없어요"}
                  </p>
                  <p className="mt-2 mx-auto max-w-xs text-w-caption leading-relaxed text-it-ink-500 dark:text-wtext-4">
                    {search
                      ? "다른 검색어로 시도해보세요."
                      : "종료된 대회 기록이 쌓이면 이곳에 표시됩니다."}
                  </p>
                </div>
              ) : (
                // ICETIMES — flat 카드는 full-bleed 흰 섹션 위에 hairline 행으로(회색 위 떠보임 방지).
                <section className="-mx-4 bg-it-surface px-4 dark:bg-it-blue-950">
                  {pastList.map((t) => (
                    <TournamentListCard
                      key={t.id}
                      tournament={t}
                      isManager={isManager}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      iceTheme
                    />
                  ))}
                </section>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* [재작성 2026-05-29] 대회 등록 — full-width pill → 우측 하단 원형 floating action button(FAB).
          문구('대회등록') 제거하고 + 아이콘 단독. BottomNav 위로 띄우고 safe-area 보정.
          max-w-md 중앙 정렬 wrapper 내 우측 정렬(모바일·웹 동일 위치). */}
      {isManager && (
        <div
          className="fixed inset-x-0 z-30 pointer-events-none flex justify-center"
          style={{
            bottom:
              'calc(80px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 16px)',
          }}
        >
          <div className="pointer-events-auto flex w-full max-w-md justify-end px-5">
            <button
              type="button"
              onClick={() => navigate('/tournaments/create')}
              className="inline-flex h-14 w-14 items-center justify-center rounded-w-pill bg-it-blue-500 text-white shadow-sh-1 transition-all duration-200 ease-ios-spring motion-reduce:transition-none hover:bg-it-blue-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-puck"
              aria-label="새 대회 등록하기"
            >
              <Icon name="add" className="text-[28px]" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </MobileContainer>
  );
}

interface EmptyStateProps {
  title?: string;
  description?: string;
}

function EmptyState({ title, description }: EmptyStateProps = {}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 rounded-w-lg border border-dashed border-it-line-strong bg-it-surface px-6 py-16 text-center dark:border-rink-700 dark:bg-it-blue-950"
    >
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700">
        <Icon
          name="emoji_events"
          className="text-[36px] text-it-ink-400 dark:text-wtext-4"
          aria-hidden="true"
        />
      </div>
      <p className="text-w-body font-bold text-it-ink-800 dark:text-white">
        {title ?? MESSAGES.empty("대회")}
      </p>
      {description && (
        <p className="max-w-xs text-w-caption leading-relaxed text-it-ink-500 dark:text-wtext-4">
          {description}
        </p>
      )}
    </div>
  );
}
