'use client';

import { useState, useEffect, useCallback } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';

import { PageAppBar } from '@/components/layout/PageAppBar';
import { TabBar, type TabItem } from '@/components/director/TabBar';
import { EmptySection } from '@/components/director/EmptySection';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { Icon } from '@/components/ui/Icon';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

// ─── Types ─────────────────────────────────────────────
type LeagueStatus = 'draft' | 'active' | 'completed';
type AgeGroup = 'U9' | 'U12' | 'U15' | 'U18';

interface League {
  id: string;
  name: string;
  season: string;
  year: number;
  ageGroup: string | null;
  region: string | null;
  status: LeagueStatus;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  _count?: { divisions: number };
}

interface DivisionTeamRelation {
  id: string;
  teamId: string;
  seed: number | null;
  team: {
    id: string;
    name: string;
    division: string | null;
    club: { id: string; clubName: string };
  };
}

interface Division {
  id: string;
  leagueId: string;
  name: string;
  level: number;
  description: string | null;
  maxTeams: number | null;
  sortOrder: number;
  teamDivisions?: DivisionTeamRelation[];
}

// ─── Constants ─────────────────────────────────────────
const STATUS_MAP: Record<LeagueStatus, { label: string; className: string }> = {
  draft: {
    label: '준비중',
    className: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-wtext-4',
  },
  active: {
    label: '진행중',
    className: 'bg-blue-100 text-ice-500 dark:bg-ice-500/15 dark:text-ice-500',
  },
  completed: {
    label: '완료',
    className: 'bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-wtext-3',
  },
};

const AGE_GROUP_TABS: TabItem<'all' | AgeGroup>[] = [
  { key: 'all', label: '전체' },
  { key: 'U9', label: 'U9' },
  { key: 'U12', label: 'U12' },
  { key: 'U15', label: 'U15' },
  { key: 'U18', label: 'U18' },
];

function formatDateRange(start: string | null, end: string | null): string {
  const fmt = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return d;
    }
  };
  if (!start && !end) return '';
  if (start && end) return `${fmt(start)} ~ ${fmt(end)}`;
  if (start) return `${fmt(start)} ~`;
  return `~ ${fmt(end!)}`;
}

// ─── League Card ───────────────────────────────────────
const STATUS_ACCENT: Record<LeagueStatus, string> = {
  draft: 'bg-wline-2 dark:bg-rink-700',
  active: 'bg-ice-500',
  completed: 'bg-wline-2 dark:bg-rink-700',
};

function LeagueCard({
  league,
  onClick,
  delay,
}: {
  league: League;
  onClick: () => void;
  delay: number;
}) {
  const status = STATUS_MAP[league.status];
  const accent = STATUS_ACCENT[league.status];
  const dateRange = formatDateRange(league.startDate, league.endDate);
  const divisionCount = league._count?.divisions ?? 0;

  return (
    <AnimatedSection delay={delay}>
      <button
        type="button"
        onClick={onClick}
        className="relative w-full text-left bg-wsurface dark:bg-rink-800 rounded-w-md border border-wline-2 dark:border-rink-700 p-4 pl-5 min-h-[44px] shadow-sh-1 hover:shadow-sh-1 active:brightness-95 transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
        aria-label={`${league.name} ${status.label}, 디비전 ${divisionCount}개`}
      >
        {/* Left accent bar (status) */}
        <span
          className={cn(
            'absolute left-0 top-4 bottom-4 w-1 rounded-r-full',
            accent,
          )}
          aria-hidden="true"
        />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-card-title font-bold text-wtext-1 dark:text-white truncate leading-snug">
              {league.name}
            </h3>
            <p className="text-card-meta text-wtext-3 dark:text-wtext-4 mt-1 tabular-nums">
              {league.season} {league.year}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-w-pill px-2.5 py-1 text-card-meta font-bold',
              status.className,
            )}
          >
            {status.label}
          </span>
        </div>

        {/* Info row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-card-meta text-wtext-3 dark:text-wtext-4">
          {league.ageGroup && (
            <span className="inline-flex items-center gap-1">
              <Icon
                name="child_care"
                className="text-card-body text-wtext-3 dark:text-wtext-4"
                aria-hidden="true"
              />
              {league.ageGroup}
            </span>
          )}
          {league.region && (
            <span className="inline-flex items-center gap-1">
              <Icon
                name="location_on"
                className="text-card-body text-wtext-3 dark:text-wtext-4"
                aria-hidden="true"
              />
              {league.region}
            </span>
          )}
          {dateRange && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Icon
                name="calendar_month"
                className="text-card-body text-wtext-3 dark:text-wtext-4"
                aria-hidden="true"
              />
              {dateRange}
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-wline-2 dark:border-rink-700 pt-3">
          <span className="inline-flex items-center gap-1.5 text-card-meta font-semibold text-wtext-1 dark:text-white">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-ice-500/15 text-ice-500">
              <Icon name="layers" className="text-[14px]" aria-hidden="true" />
            </span>
            디비전 <span className="tabular-nums">{divisionCount}</span>개
          </span>
          <Icon
            name="chevron_right"
            className="text-xl text-wtext-3 dark:text-wtext-4"
            aria-hidden="true"
          />
        </div>
      </button>
    </AnimatedSection>
  );
}

// ─── Division Card (expanded with teams) ───────────────
function DivisionCard({
  division,
  delay,
}: {
  division: Division;
  delay: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const teams = division.teamDivisions ?? [];
  const teamCount = teams.length;
  const maxTeams = division.maxTeams;

  return (
    <AnimatedSection delay={delay}>
      <div className="bg-wsurface dark:bg-rink-800 rounded-w-md border border-wline-2 dark:border-rink-700 overflow-hidden">
        {/* Division Header */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-controls={`division-${division.id}-teams`}
          className="w-full text-left px-4 py-3.5 min-h-[44px] flex items-center justify-between active:brightness-95 transition-all motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 w-10 h-10 rounded-lg bg-ice-500/15 dark:bg-ice-500/20 flex items-center justify-center">
              <span className="text-card-body font-bold text-ice-500">
                D{division.level}
              </span>
            </span>
            <div className="min-w-0">
              <h4 className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
                {division.name}
              </h4>
              {division.description && (
                <p className="text-card-meta text-wtext-3 dark:text-wtext-4 truncate mt-0.5">
                  {division.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-card-meta text-wtext-3 dark:text-wtext-4">
              {teamCount}{maxTeams ? `/${maxTeams}` : ''}팀
            </span>
            <Icon
              name={isExpanded ? 'expand_less' : 'expand_more'}
              className="text-xl text-wtext-3 dark:text-wtext-4"
            />
          </div>
        </button>

        {/* Teams List */}
        {isExpanded && (
          <div
            id={`division-${division.id}-teams`}
            className="border-t border-wline-2 dark:border-rink-700"
          >
            {teams.length === 0 ? (
              <div className="px-4 py-6 text-center text-card-body text-wtext-3 dark:text-wtext-4">
                {MESSAGES.empty('소속 팀')}
              </div>
            ) : (
              <div className="divide-y divide-wline-2/50 dark:divide-rink-700/50">
                {teams
                  .slice()
                  .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
                  .map((td) => (
                    <div
                      key={td.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0 w-7 h-7 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center text-card-meta font-bold text-wtext-2 dark:text-wtext-4">
                          {td.seed ?? '-'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-card-body font-semibold text-wtext-1 dark:text-white truncate">
                            {td.team.name}
                          </p>
                          <p className="text-card-meta text-wtext-3 dark:text-wtext-4 truncate">
                            {td.team.club.clubName}
                          </p>
                        </div>
                      </div>
                      {td.team.division && (
                        <span className="shrink-0 text-card-meta text-wtext-3 dark:text-wtext-4">
                          {td.team.division}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AnimatedSection>
  );
}

// ─── Main Page Component ───────────────────────────────
export default function DirectorLeaguesPage() {
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [view, setView] = useState<'leagues' | 'divisions'>('leagues');
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [ageGroupFilter, setAgeGroupFilter] = useState<'all' | AgeGroup>('all');

  const [leagues, setLeagues] = useState<League[]>([]);
  const [isLeagueLoading, setIsLeagueLoading] = useState(true);

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [isDivisionLoading, setIsDivisionLoading] = useState(false);

  usePageReady(!isLeagueLoading);

  // ─── Data fetching ────────────────────────────────────
  const loadLeagues = useCallback(async () => {
    setIsLeagueLoading(true);
    try {
      const response = await api.get<League[]>('/leagues');
      if (response.success && Array.isArray(response.data)) {
        setLeagues(response.data);
      } else {
        setLeagues([]);
      }
    } catch {
      setLeagues([]);
    } finally {
      setIsLeagueLoading(false);
    }
  }, []);

  const loadDivisions = useCallback(async (leagueId: string) => {
    setIsDivisionLoading(true);
    try {
      const response = await api.get<Division[]>(`/leagues/${leagueId}/divisions`);
      if (response.success && Array.isArray(response.data)) {
        setDivisions(response.data);
      } else {
        setDivisions([]);
      }
    } catch {
      setDivisions([]);
    } finally {
      setIsDivisionLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeagues();
  }, [loadLeagues]);

  // ─── Navigation ───────────────────────────────────────
  const handleLeagueClick = (league: League) => {
    setSelectedLeague(league);
    setView('divisions');
    loadDivisions(league.id);
  };

  const handleBackToLeagues = () => {
    setView('leagues');
    setSelectedLeague(null);
    setDivisions([]);
  };

  // ─── Filter ───────────────────────────────────────────
  const filteredLeagues = leagues.filter((league) => {
    if (ageGroupFilter === 'all') return true;
    return league.ageGroup === ageGroupFilter;
  });

  // ─── Divisions View ───────────────────────────────────
  if (view === 'divisions' && selectedLeague) {
    const sortedDivisions = divisions
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return (
      <MobileContainer hasBottomNav>
        {/* [appbar-harness-v4 · 2026-05-12] rightActions → extraActions 변환:
            시계/종/메뉴 우측 3 액션 SoT 보존하면서 새로고침 액션 추가. */}
        <PageAppBar
          title={selectedLeague.name}
          onBack={handleBackToLeagues}
          forceNative
          extraActions={[
            { icon: 'refresh', onClick: () => loadDivisions(selectedLeague.id), label: '새로고침' },
          ]}
        />

        {/* League Summary */}
        <div className="px-4 py-3 bg-wsurface dark:bg-rink-800 border-b border-wline-2 dark:border-rink-700">
          <div className="flex items-center gap-2 flex-wrap text-card-body text-wtext-2 dark:text-wtext-4">
            <span className="font-semibold">{selectedLeague.season} {selectedLeague.year}</span>
            {selectedLeague.ageGroup && (
              <>
                <span className="text-wtext-3 dark:text-wtext-4">|</span>
                <span>{selectedLeague.ageGroup}</span>
              </>
            )}
            {selectedLeague.region && (
              <>
                <span className="text-wtext-3 dark:text-wtext-4">|</span>
                <span>{selectedLeague.region}</span>
              </>
            )}
          </div>
          {selectedLeague.description && (
            <p className="text-card-meta text-wtext-3 dark:text-wtext-4 mt-1">
              {selectedLeague.description}
            </p>
          )}
        </div>

        {/* Division List */}
        <main
          className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto hide-scrollbar"
          role="main"
          aria-label="디비전 목록"
        >
          {isDivisionLoading ? null : sortedDivisions.length === 0 ? (
            <EmptySection icon="layers" message={MESSAGES.empty('디비전')} />
          ) : (
            <>
              <p className="px-1 text-card-meta font-semibold text-wtext-3 dark:text-wtext-4">
                총 <span className="tabular-nums text-wtext-1 dark:text-white">{sortedDivisions.length}</span>개 디비전
              </p>
              {sortedDivisions.map((division, idx) => (
                <DivisionCard
                  key={division.id}
                  division={division}
                  delay={idx * 60}
                />
              ))}
            </>
          )}
          <div className="h-8" />
        </main>
        <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      </MobileContainer>
    );
  }

  // ─── Leagues View (default) ───────────────────────────
  // 로딩 중에도 PageAppBar 는 항상 렌더 — 페이지 전체 `return null` 시 AppBar 가 사라져
  // 사용자에게 빈 화면으로 보이는 회귀 차단 (다른 (director) 페이지 — director-credits/
  // consultations 등 — 와 동일 패턴: AppBar 고정 + 컨텐츠만 조건부 렌더).
  // showBack 은 default(true) — 좌측 ← 백버튼 자동 노출 (다른 director 페이지와 일관).
  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="리그 관리" forceNative />

      {/* Age Group Filter */}
      <div className="px-4 pt-2 pb-1">
        <TabBar
          tabs={AGE_GROUP_TABS}
          activeTab={ageGroupFilter}
          onChange={setAgeGroupFilter}
          variant="pill"
        />
      </div>

      {/* League List */}
      <main
        className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-y-auto hide-scrollbar"
        role="main"
        aria-label="리그 목록"
      >
        {isLeagueLoading ? null : filteredLeagues.length === 0 ? (
          <EmptySection
            icon="emoji_events"
            message={MESSAGES.empty('리그')}
          />
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-card-meta font-semibold text-wtext-3 dark:text-wtext-4">
                총 <span className="tabular-nums text-wtext-1 dark:text-white">{filteredLeagues.length}</span>개 리그
              </p>
              {ageGroupFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-w-pill bg-ice-500/15 px-2 py-0.5 text-card-meta font-bold text-ice-500">
                  <Icon name="filter_alt" className="text-[12px]" aria-hidden="true" />
                  {ageGroupFilter}
                </span>
              )}
            </div>
            {filteredLeagues.map((league, idx) => (
              <LeagueCard
                key={league.id}
                league={league}
                onClick={() => handleLeagueClick(league)}
                delay={idx * 80}
              />
            ))}
          </>
        )}
        <div className="h-8" />
      </main>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
