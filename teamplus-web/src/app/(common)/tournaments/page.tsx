"use client";

/**
 * Tournament List Page (공통 — 모든 인증 사용자 접근 가능)
 *
 * 레퍼런스: 사용자 제공 HTML "대회 및 경기 목록"
 *
 * 역할 동작:
 *  - DIRECTOR/COACH/ADMIN : "새 대회 등록" FAB. 수정/삭제는 상세 하단에서 수행(카드 버튼 없음)
 *  - PARENT/TEEN/CHILD/ACADEMY_DIRECTOR : 조회 전용 (신청/대진표/대기 등록)
 *
 * 구조:
 *  - Sticky Header (뒤로가기 + 제목 + 검색)
 *  - Segmented Control (진행 중인 대회 / 지난 대회)
 *  - TournamentListCard 리스트
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/useDebounce";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
// [BUG FIX 2026-05-19 W3 #10] SubmainAppBar → PageAppBar 교체 — SubmainAppBar 는 BottomNav 탭
//   허브 화면 전용 4-icon 헤더로 뒤로가기 미지원. 사용자가 "전체 메뉴 → 대회 관리" 로 진입 시
//   뒤로가기 필요. PageAppBar 사용 + showBack/onBack 으로 표준 뒤로가기 제공.
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useNativeUI } from "@/hooks/useNativeUI";
import { MESSAGES } from "@/lib/messages";
import { TournamentListCard } from "@/components/tournament";
import { cn } from "@/lib/utils";
import { useRefreshSubscription, REFRESH_KEYS } from "@/lib/refresh-bus";
import {
  canManageMatch,
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
  const isManager = canManageMatch(user?.userType);

  const [tab, setTab] = useState<Tab>("active");
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [search, setSearch] = useState("");
  // 필터는 디바운스 값으로 — 한글 조합 중간 글자가 매 키마다 필터를 돌려
  //   빈 상태 화면이 번쩍이던 깜빡임 제거(입력창 자체는 즉시 반영).
  const debouncedSearch = useDebounce(search, 250);

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
    const q = debouncedSearch.trim().toLowerCase();
    const active: TournamentListItem[] = [];
    const past: TournamentListItem[] = [];

    for (const t of tournaments) {
      // 검색 대상 = 대회명 단일 — 기존 팀(club.clubName)·장소(rink.name)는 레거시 필드라
      //   실데이터와 어긋나 사실상 동작하지 않던 검색축이라 제거(placeholder 도 동기화).
      if (q && !t.name.toLowerCase().includes(q)) {
        continue;
      }
      const ui: TournamentUiStatus = mapTournamentUiStatus(
        t.status,
        t.endDate,
        now,
        t.startDate,
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
  }, [tournaments, debouncedSearch]);

  // 수정/삭제는 목록 카드가 아닌 상세 하단("대회 수정/대회 삭제")에서 수행 —
  //   행 사이에 낀 버튼의 소속 모호 문제 해소, 수업 관리 목록과 동일 동선.

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
        {/* 검색 + 탭 영역 — flat 흰 섹션. 하단 마감선은 밑줄형 탭의 border-b 가 겸한다. */}
        <div className="bg-it-surface dark:bg-it-blue-950">
          {/* 검색창 */}
          <div className="px-5 pt-3 pb-1">
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
                placeholder="대회명 검색"
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

          {/* 탭 — ICETIMES 표준 SegmentedTabs(밑줄형). director-payments 와 동일 패턴:
              활성 = extrabold it-blue-600 + 하단 2.5px 파란 밑줄, 컨테이너 border-b 가 섹션 마감선. */}
          <div
            role="tablist"
            aria-label="대회 필터"
            className="flex border-b border-it-line dark:border-rink-700"
          >
            {(
              [
                ["active", "진행 중인 대회"],
                ["past", "지난 대회"],
              ] as const
            ).map(([key, label]) => {
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(key)}
                  className={cn(
                    "relative flex-1 px-1 pb-[13px] pt-[14px] text-[15px] transition-colors duration-200 motion-reduce:transition-none",
                    isActive
                      ? "font-extrabold text-it-blue-600 dark:text-white"
                      : "font-semibold text-it-ink-500 hover:text-it-ink-800 dark:text-wtext-4 dark:hover:text-white",
                  )}
                >
                  {label}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-0 -bottom-px h-[2.5px] rounded-sm",
                      isActive ? "bg-it-blue-500" : "bg-transparent",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Tournament List — 캐러셀 스타일: 두 탭이 가로로 이어져 함께 슬라이드.
            ICETIMES — 탭 패널은 목록/빈 상태와 무관하게 항상 full-bleed 흰 섹션 1개로
            고정(레이아웃 출렁임 방지), 검색 섹션과는 표준 8px 회색 갭(pt-2). */}
        <div className="overflow-hidden pt-2">
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
              className="w-1/2 shrink-0"
            >
              {!isLoading && (
                <section className="bg-it-surface px-4 pb-2 dark:bg-it-blue-950">
                  {activeList.length === 0 ? (
                    <EmptyState
                      icon={debouncedSearch ? "search_off" : "emoji_events"}
                      title={
                        debouncedSearch
                          ? "검색 결과가 없어요"
                          : "진행 중인 대회가 없어요"
                      }
                      description={
                        debouncedSearch
                          ? "다른 검색어로 시도해보세요."
                          : isManager
                            ? "우측 하단 버튼을 눌러 첫 대회를 등록해주세요."
                            : "새로운 대회가 열리면 이곳에서 확인하실 수 있습니다."
                      }
                    />
                  ) : (
                    <>
                      {/* 결과 카운트 — 흰 섹션 내부 상단 */}
                      <div
                        className="flex items-center gap-2 pt-4 pb-2"
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
                      {activeList.map((t) => (
                        <TournamentListCard
                          key={t.id}
                          tournament={t}
                          isManager={isManager}
                          iceTheme
                        />
                      ))}
                    </>
                  )}
                </section>
              )}
            </div>
            {/* 지난 대회 패널 */}
            <div
              role="tabpanel"
              aria-hidden={tab !== "past"}
              className="w-1/2 shrink-0"
            >
              {!isLoading && (
                <section className="bg-it-surface px-4 pb-2 dark:bg-it-blue-950">
                  {pastList.length === 0 ? (
                    <EmptyState
                      icon={debouncedSearch ? "search_off" : "emoji_events"}
                      title={
                        debouncedSearch
                          ? "검색 결과가 없어요"
                          : "지난 대회가 없어요"
                      }
                      description={
                        debouncedSearch
                          ? "다른 검색어로 시도해보세요."
                          : "종료된 대회 기록이 쌓이면 이곳에 표시됩니다."
                      }
                    />
                  ) : (
                    <>
                      <div
                        className="flex items-center gap-2 pt-4 pb-2"
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
                      {pastList.map((t) => (
                        <TournamentListCard
                          key={t.id}
                          tournament={t}
                          isManager={isManager}
                          iceTheme
                        />
                      ))}
                    </>
                  )}
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
  icon?: string;
  title?: string;
  description?: string;
}

// ICETIMES flat — 점선 카드 박스 제거, 흰 섹션 내부 플레인 빈 상태. 두 탭 공용.
function EmptyState({ icon = "emoji_events", title, description }: EmptyStateProps = {}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center"
    >
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700">
        <Icon
          name={icon}
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
