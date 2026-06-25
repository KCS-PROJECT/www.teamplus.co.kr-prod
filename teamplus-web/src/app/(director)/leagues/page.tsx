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
    className: 'bg-it-line text-it-ink-600 dark:bg-rink-700 dark:text-wtext-4',
  },
  active: {
    label: '진행중',
    className: 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-500',
  },
  completed: {
    label: '완료',
    className: 'bg-it-line text-it-ink-500 dark:bg-rink-700 dark:text-wtext-3',
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

// ─── League Row (flat · hairline) ──────────────────────
function LeagueCard({
  league,
  onClick,
  delay,
  isLast,
}: {
  league: League;
  onClick: () => void;
  delay: number;
  isLast: boolean;
}) {
  const status = STATUS_MAP[league.status];
  const dateRange = formatDateRange(league.startDate, league.endDate);
  const divisionCount = league._count?.divisions ?? 0;

  return (
    <AnimatedSection delay={delay}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full text-left px-1 py-[15px] min-h-[56px] active:brightness-95 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
          !isLast && 'border-b border-it-line dark:border-rink-700',
        )}
        aria-label={`${league.name} ${status.label}, 디비전 ${divisionCount}개`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="min-w-0 truncate text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white leading-snug">
                {league.name}
              </h3>
              <span
                className={cn(
                  'shrink-0 rounded-w-pill px-2.5 py-1 text-card-meta font-bold',
                  status.className,
                )}
              >
                {status.label}
              </span>
            </div>
            <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 mt-1 font-num tabular-nums">
              {league.season} {league.year}
            </p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1.5 self-center text-card-meta font-semibold text-it-ink-700 dark:text-white">
            <Icon name="layers" className="text-[15px] text-it-blue-500" aria-hidden="true" />
            디비전 <span className="font-num tabular-nums">{divisionCount}</span>개
            <Icon
              name="chevron_right"
              className="text-[18px] text-it-ink-400 dark:text-wtext-4"
              aria-hidden="true"
            />
          </span>
        </div>

        {/* Info row */}
        {(league.ageGroup || league.region || dateRange) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-card-meta text-it-ink-500 dark:text-wtext-4">
            {league.ageGroup && (
              <span className="inline-flex items-center gap-1">
                <Icon
                  name="child_care"
                  className="text-card-body text-it-ink-400 dark:text-wtext-4"
                  aria-hidden="true"
                />
                {league.ageGroup}
              </span>
            )}
            {league.region && (
              <span className="inline-flex items-center gap-1">
                <Icon
                  name="location_on"
                  className="text-card-body text-it-ink-400 dark:text-wtext-4"
                  aria-hidden="true"
                />
                {league.region}
              </span>
            )}
            {dateRange && (
              <span className="inline-flex items-center gap-1 font-num tabular-nums">
                <Icon
                  name="calendar_month"
                  className="text-card-body text-it-ink-400 dark:text-wtext-4"
                  aria-hidden="true"
                />
                {dateRange}
              </span>
            )}
          </div>
        )}
      </button>
    </AnimatedSection>
  );
}

// ─── Division Card (expanded with teams) ───────────────
function DivisionCard({
  division,
  delay,
  isLast,
}: {
  division: Division;
  delay: number;
  isLast: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const teams = division.teamDivisions ?? [];
  const teamCount = teams.length;
  const maxTeams = division.maxTeams;

  return (
    <AnimatedSection delay={delay}>
      <div className={cn(!isLast && 'border-b border-it-line dark:border-rink-700')}>
        {/* Division Header */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-controls={`division-${division.id}-teams`}
          className="w-full text-left px-1 py-[15px] min-h-[56px] flex items-center justify-between active:brightness-95 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 w-10 h-10 rounded-w-md bg-it-blue-50 dark:bg-it-blue-500/20 flex items-center justify-center">
              <span className="text-card-body font-bold font-num text-it-blue-500">
                D{division.level}
              </span>
            </span>
            <div className="min-w-0">
              <h4 className="text-[15px] font-bold text-it-ink-800 dark:text-white truncate">
                {division.name}
              </h4>
              {division.description && (
                <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 truncate mt-0.5">
                  {division.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-card-meta font-num tabular-nums text-it-ink-500 dark:text-wtext-4">
              {teamCount}{maxTeams ? `/${maxTeams}` : ''}팀
            </span>
            <Icon
              name={isExpanded ? 'expand_less' : 'expand_more'}
              className="text-xl text-it-ink-400 dark:text-wtext-4"
            />
          </div>
        </button>

        {/* Teams List — 펼침 시 인셋 박스 */}
        {isExpanded && (
          <div
            id={`division-${division.id}-teams`}
            className="mb-3 rounded-w-md bg-it-fill dark:bg-rink-900/40"
          >
            {teams.length === 0 ? (
              <div className="px-4 py-6 text-center text-card-body text-it-ink-500 dark:text-wtext-4">
                {MESSAGES.empty('소속 팀')}
              </div>
            ) : (
              <div className="flex flex-col">
                {teams
                  .slice()
                  .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
                  .map((td, ti, arr) => (
                    <div
                      key={td.id}
                      className={cn(
                        'flex items-center justify-between px-4 py-3',
                        ti !== arr.length - 1 && 'border-b border-it-line dark:border-rink-700',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0 w-7 h-7 rounded-w-pill bg-it-line dark:bg-rink-700 flex items-center justify-center text-card-meta font-bold font-num tabular-nums text-it-ink-700 dark:text-wtext-4">
                          {td.seed ?? '-'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-card-body font-semibold text-it-ink-800 dark:text-white truncate">
                            {td.team.name}
                          </p>
                          <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 truncate">
                            {td.team.club.clubName}
                          </p>
                        </div>
                      </div>
                      {td.team.division && (
                        <span className="shrink-0 text-card-meta text-it-ink-500 dark:text-wtext-4">
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

        <main
          className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
          role="main"
          aria-label="디비전 목록"
        >
          {/* League Summary — flat 흰 섹션 (구분 점으로 분리, 파이프 제거) */}
          <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-4" aria-label="리그 요약">
            <div className="flex items-center gap-2 flex-wrap text-card-body text-it-ink-700 dark:text-wtext-4">
              <span className="font-semibold font-num tabular-nums">{selectedLeague.season} {selectedLeague.year}</span>
              {selectedLeague.ageGroup && (
                <span className="inline-flex items-center gap-2">
                  <span className="size-1 rounded-full bg-it-ink-300 dark:bg-rink-700" aria-hidden="true" />
                  {selectedLeague.ageGroup}
                </span>
              )}
              {selectedLeague.region && (
                <span className="inline-flex items-center gap-2">
                  <span className="size-1 rounded-full bg-it-ink-300 dark:bg-rink-700" aria-hidden="true" />
                  {selectedLeague.region}
                </span>
              )}
            </div>
            {selectedLeague.description && (
              <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 mt-1.5">
                {selectedLeague.description}
              </p>
            )}
          </section>

          {/* flat 섹션 사이 8px 회색 갭 */}
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

          {/* Division List — flat 흰 섹션 (헤더 + hairline 행) */}
          <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-7" aria-label="디비전 목록">
            {isDivisionLoading ? null : sortedDivisions.length === 0 ? (
              <EmptySection icon="layers" message={MESSAGES.empty('디비전')} />
            ) : (
              <>
                <div className="flex items-baseline gap-2 pb-1">
                  <h2 className="text-it-ink-800 dark:text-white tracking-[-0.02em] font-extrabold text-[17px]">
                    디비전
                  </h2>
                  <span className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500">
                    {sortedDivisions.length}
                  </span>
                </div>
                <div className="flex flex-col">
                  {sortedDivisions.map((division, idx) => (
                    <DivisionCard
                      key={division.id}
                      division={division}
                      delay={idx * 60}
                      isLast={idx === sortedDivisions.length - 1}
                    />
                  ))}
                </div>
              </>
            )}
            <div className="h-6" />
          </section>
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

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
        role="main"
        aria-label="리그 목록"
      >
        {/* Age Group Filter — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-4 pt-3 pb-2" aria-label="연령 그룹 필터">
          <TabBar
            tabs={AGE_GROUP_TABS}
            activeTab={ageGroupFilter}
            onChange={setAgeGroupFilter}
            variant="pill"
          />
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* League List — flat 흰 섹션 (헤더 + hairline 행) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-7" aria-label="리그 목록">
          {isLeagueLoading ? null : filteredLeagues.length === 0 ? (
            <EmptySection
              icon="emoji_events"
              message={MESSAGES.empty('리그')}
            />
          ) : (
            <>
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-it-ink-800 dark:text-white tracking-[-0.02em] font-extrabold text-[17px]">
                    리그 목록
                  </h2>
                  <span className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500">
                    {filteredLeagues.length}
                  </span>
                </div>
                {ageGroupFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-w-pill bg-it-blue-50 dark:bg-it-blue-500/15 px-2.5 py-1 text-card-meta font-bold text-it-blue-500">
                    <Icon name="filter_alt" className="text-[12px]" aria-hidden="true" />
                    {ageGroupFilter}
                  </span>
                )}
              </div>
              <div className="flex flex-col">
                {filteredLeagues.map((league, idx) => (
                  <LeagueCard
                    key={league.id}
                    league={league}
                    onClick={() => handleLeagueClick(league)}
                    delay={idx * 80}
                    isLast={idx === filteredLeagues.length - 1}
                  />
                ))}
              </div>
            </>
          )}
          <div className="h-6" />
        </section>
      </main>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
