'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
import { useMatchPermissions } from '@/hooks/useMatchPermissions';
import { fetchMatches } from '@/services/matches-api';
import { MESSAGES } from '@/lib/messages';
import { useRefreshSubscription, REFRESH_KEYS } from '@/lib/refresh-bus';

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });
import {
  MatchCard,
  MatchFilterChip,
  MatchSegmentedTabs,
  MatchErrorState,
  type MatchCardData,
  type MatchStatus,
  type MatchTab,
} from '@/components/match';
import type { MatchListItem } from '@/types/match';

// ── 타입 ──────────────────────────────────────────────────
type FilterType = 'date' | 'level' | 'location' | null;
type ListViewMode = 'recruiting' | 'mine';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * Phase 4-C 성능 최적화:
 * - 한 번에 로드하는 매치 개수 상수화 (백엔드 safeLimit 캡 100 이하)
 * - 더보기 방식으로 점진적 로드하여 초기 렌더 비용/네트워크 페이로드 최소화
 */
const PAGE_SIZE = 20;

function toMatchStatus(raw: string): MatchStatus {
  if (raw === 'closing_soon' || raw === 'closed' || raw === 'cancelled') {
    return raw;
  }
  return 'recruiting';
}

function transformMatch(m: MatchListItem): MatchCardData {
  const dt = new Date(m.scheduledAt);
  const month = dt.getMonth() + 1;
  const day = dt.getDate();
  const hours = dt.getHours().toString().padStart(2, '0');
  const minutes = dt.getMinutes().toString().padStart(2, '0');

  return {
    id: m.id,
    title: m.title,
    time: `${hours}:${minutes}`,
    date: `${month}.${day}`,
    dayOfWeek: DAY_NAMES[dt.getDay()],
    location: m.rinkName,
    price: m.price,
    level: m.level,
    levelCode: m.levelCode ?? undefined,
    gender: m.gender,
    currentParticipants: m.currentParticipants ?? m.approvedCount ?? 0,
    maxParticipants: m.maxParticipants,
    status: toMatchStatus(m.status),
  };
}

export default function MatchListPage() {
  const { navigate, back } = useNavigation();
  const permissions = useMatchPermissions();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ListViewMode>('recruiting');
  const [activeFilter, setActiveFilter] = useState<FilterType>('date');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useDefaultUI();

  // 초기 로드 — 1페이지만 받아와서 빠르게 첫 화면을 그립니다.
  const loadMatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMatches({ page: 1, limit: PAGE_SIZE });
      setMatches(data.items.map(transformMatch));
      setPage(1);
      setTotal(data.total ?? data.items.length);
    } catch {
      setError(MESSAGES.error.network);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 더보기 — 기존 목록에 다음 페이지를 이어 붙입니다.
  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore) return;
    const nextPage = page + 1;
    setIsLoadingMore(true);
    try {
      const data = await fetchMatches({ page: nextPage, limit: PAGE_SIZE });
      setMatches((prev) => [...prev, ...data.items.map(transformMatch)]);
      setPage(nextPage);
      if (typeof data.total === 'number') {
        setTotal(data.total);
      }
    } catch {
      setError(MESSAGES.error.network);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoading, isLoadingMore, page]);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  // [추가 W2.D 2026-05-18 #7] 매치 등록/수정/삭제 신호 수신 시 자동 재 fetch.
  //   matches/create 페이지 성공 시 emitRefresh(REFRESH_KEYS.MATCHES) 호출.
  //   기존: 사용자가 매치 등록 후 list 로 돌아와도 stale 데이터가 표시되던 회귀.
  useRefreshSubscription(REFRESH_KEYS.MATCHES, () => {
    void loadMatches();
  });

  const hasMore = useMemo(() => matches.length < total, [matches.length, total]);

  const tabs: MatchTab<ListViewMode>[] = useMemo(() => {
    const base: MatchTab<ListViewMode>[] = [
      { value: 'recruiting', label: MESSAGES.match.tabs.active },
    ];
    if (permissions.isAuthenticated) {
      base.push({ value: 'mine', label: MESSAGES.match.tabs.mine });
    }
    return base;
  }, [permissions.isAuthenticated]);

  const handleFilterClick = (filter: FilterType) => {
    setActiveFilter(activeFilter === filter ? null : filter);
  };

  const handleResetFilters = () => setActiveFilter(null);

  const handleCreateMatch = () => navigate('/matches/create');

  const filteredMatches = useMemo(() => {
    if (!searchQuery.trim()) return matches;
    const q = searchQuery.toLowerCase();
    return matches.filter(
      (m) =>
        m.location.toLowerCase().includes(q) ||
        m.level.toLowerCase().includes(q) ||
        (m.title?.toLowerCase().includes(q) ?? false)
    );
  }, [matches, searchQuery]);

  const sectionTitle =
    viewMode === 'recruiting'
      ? MESSAGES.match.list.weekendSection
      : MESSAGES.match.list.mineSection;

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [appbar-harness-v4 §3 분류 A] rightAction → extraActions 변환.
          기존: rightAction 단독 → 시계/종/메뉴 3 액션 모두 대체.
          변경: extraActions → [search] + [☰] (메뉴 유지, SPEC §1 우측 액션 통일성 ↑).
          [수정 W2.D 2026-05-18 #11] forceNative — Native(Flutter WebView) 환경에서도
            PageAppBar 가 렌더되도록 강제. 종전: Native 에서 매치 관리 페이지 상단바가
            null 반환되어 헤더가 사라지던 회귀. */}
      <PageAppBar
        title={MESSAGES.match.list.headerTitle}
        forceNative
        extraActions={[
          {
            icon: 'search',
            label: MESSAGES.match.list.searchAriaLabel,
            onClick: () => setShowSearch((v) => !v),
          },
        ]}
      />

      <div className="sticky top-14 z-29 bg-white/95 dark:bg-puck/95 border-b border-wline-2 dark:border-rink-700">
        {/* 역할 기반 탭 */}
        <div className="px-4 pb-3">
          <MatchSegmentedTabs
            tabs={tabs}
            value={viewMode}
            onChange={(next) => {
              setViewMode(next);
              if (next === 'mine') {
                navigate('/matches/pickup');
              }
            }}
          />
        </div>

        {/* 검색 */}
        {showSearch && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Icon
                name="search"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-wtext-3 text-[20px]"
              />
              <input
                type="text"
                placeholder={MESSAGES.match.list.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-wline-2 dark:bg-rink-700 border-none rounded-w-md text-card-body text-wtext-1 dark:text-white placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500"
              />
            </div>
          </div>
        )}

        {/* Filter Chips */}
        <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
          <MatchFilterChip
            active={activeFilter === 'date'}
            icon="calendar_today"
            label={MESSAGES.match.list.filters.date}
            onClick={() => handleFilterClick('date')}
          />
          <MatchFilterChip
            active={activeFilter === 'level'}
            icon="leaderboard"
            label={MESSAGES.match.list.filters.level}
            onClick={() => handleFilterClick('level')}
          />
          <MatchFilterChip
            active={activeFilter === 'location'}
            icon="location_on"
            label={MESSAGES.match.list.filters.location}
            onClick={() => handleFilterClick('location')}
          />
          <button
            type="button"
            onClick={handleResetFilters}
            aria-label={MESSAGES.match.list.resetFilterAriaLabel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
          >
            <Icon name="refresh" className="text-[20px] text-wtext-3 dark:text-wtext-4" />
          </button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto pb-30">
        {/* Section Header — accent bar + title + count chip */}
        <div className="flex items-center gap-2 mt-2">
          <span className="h-6 w-1 bg-ice-500 rounded-w-pill" aria-hidden="true" />
          <h2 className="text-wtext-1 dark:text-white font-bold text-card-title tracking-tight">
            {sectionTitle}
          </h2>
          {!isLoading && !error && filteredMatches.length > 0 && (
            <span
              className="ml-auto inline-flex items-center rounded-w-pill bg-ice-500/15 px-2.5 py-1 text-[11px] font-bold text-ice-500 dark:bg-ice-500/20"
              aria-live="polite"
            >
              {MESSAGES.match.list.countLabel(filteredMatches.length)}
            </span>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div
            className="flex flex-col items-center justify-center gap-3 py-16"
            role="status"
            aria-live="polite"
          >
            <div
              className="w-8 h-8 border-2 border-ice-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="text-card-meta text-wtext-3 dark:text-wtext-4">
              {MESSAGES.common.loading}
            </span>
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <MatchErrorState message={error} onRetry={() => void loadMatches()} />
        )}

        {/* Empty */}
        {!isLoading && !error && filteredMatches.length === 0 && (
          <div
            role="status"
            className="flex flex-col items-center justify-center gap-2 rounded-w-lg border border-dashed border-wline-2 bg-white px-6 py-16 text-center dark:border-rink-700 dark:bg-rink-800"
          >
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
              <Icon
                name="sports_hockey"
                className="text-4xl text-wtext-3 dark:text-wtext-4"
                aria-hidden="true"
              />
            </div>
            <p className="text-[15px] font-bold text-wtext-1 dark:text-white">
              {searchQuery.trim()
                ? '검색 결과가 없어요'
                : MESSAGES.empty('매치')}
            </p>
            <p className="max-w-xs text-[13px] leading-relaxed text-wtext-3 dark:text-wtext-4">
              {searchQuery.trim()
                ? '다른 검색어로 다시 시도해보세요.'
                : permissions.canCreate
                ? '우측 하단 버튼을 눌러 첫 매치를 만들어보세요.'
                : '새로운 매치가 열리면 이곳에서 바로 확인하실 수 있습니다.'}
            </p>
          </div>
        )}

        {/* Match cards */}
        {!isLoading && !error && filteredMatches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}

        {/* 더보기 버튼 — 검색어가 없고 추가 페이지가 남아있을 때만 노출 */}
        {!isLoading && !error && !searchQuery.trim() && hasMore && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={loadMore}
              disabled={isLoadingMore}
              className="flex items-center gap-2 px-5 py-2.5 text-card-body font-semibold text-ice-500 border border-ice-500 rounded-w-pill hover:bg-ice-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none"
              aria-label={MESSAGES.match.list.loadMoreAriaLabel}
            >
              {isLoadingMore ? (
                <>
                  <span className="w-4 h-4 border-2 border-ice-500 border-t-transparent rounded-w-pill animate-spin" />
                  {MESSAGES.match.list.loadingMore}
                </>
              ) : (
                <>
                  <Icon name="expand_more" className="text-card-title" />
                  {MESSAGES.match.list.loadMore(matches.length, total)}
                </>
              )}
            </button>
          </div>
        )}
      </main>

      {/* FAB - 매치 생성 (역할 기반)
          [수정 W2.D 2026-05-18 #12] 종전 `fixed bottom-24 right-4` 는 메인 영역(max-w-md)
          밖에 위치하여 데스크탑 뷰포트에서는 화면 밖으로 벗어났고 모바일에서는 BottomNav(68px) +
          safe-area 와 겹치는 회귀가 발생. max-w-md 중앙 정렬 wrapper 안에 두고 BottomNav 위
          + safe-area-inset-bottom 폴백 패턴으로 정렬. */}
      {permissions.canCreate && (
        <div
          className="fixed inset-x-0 z-30 pointer-events-none flex justify-center"
          style={{
            bottom:
              'calc(80px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 16px)',
          }}
        >
          <div className="pointer-events-auto w-full max-w-md flex justify-end px-4">
            <button
              type="button"
              onClick={handleCreateMatch}
              aria-label={MESSAGES.match.list.createFab}
              className="flex items-center gap-2 h-14 pl-4 pr-5 rounded-w-pill bg-ice-500 text-white shadow-sh-blue hover:bg-ice-600 active:brightness-95 transition-colors motion-reduce:transition-none"
            >
              <Icon name="add" className="text-2xl" />
              <span className="text-card-body font-bold">
                {MESSAGES.match.list.createFab}
              </span>
            </button>
          </div>
        </div>
      )}
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
