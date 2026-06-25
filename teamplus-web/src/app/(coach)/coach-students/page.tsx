'use client';

import { useState, useCallback, useEffect, memo, useId, useMemo } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { MESSAGES } from '@/lib/messages';
import { apiClient } from '@/services/api-client';

// ─── Types ──────────────────────────────────────────
interface StudentInfo {
  id: string;
  name: string;
  age: number;
  level: string;
  className: string;
  attendanceRate: number;
  lastClassDate: string | null;
  isActive: boolean;
}

type FilterTab = 'all' | 'beginner' | 'intermediate' | 'advanced';

// ICETIMES — 레벨 배지는 it-blue 단일 톤(soft) 통일
const LEVEL_MAP: Record<string, { label: string }> = {
  BEGINNER:     { label: '초급' },
  INTERMEDIATE: { label: '중급' },
  ADVANCED:     { label: '고급' },
};

const LEVEL_BADGE_CLASS = 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-900/30 dark:text-it-blue-300';

const LEVEL_TAB_MAP: Record<FilterTab, string | null> = {
  all: null,
  beginner: 'BEGINNER',
  intermediate: 'INTERMEDIATE',
  advanced: 'ADVANCED',
};

// ─── Student Row (ICETIMES flat — hairline 행) ───────
const StudentRow = memo(function StudentRow({ student, isLast }: { student: StudentInfo; isLast: boolean }) {
  const levelInfo = LEVEL_MAP[student.level] ?? { label: student.level };

  return (
    <NavLink
      href={`/coach-students/${student.id}`}
      className={cn(
        'flex w-full items-center gap-3 py-[13px] min-h-[56px] transition-colors motion-reduce:transition-none active:brightness-95',
        !isLast && 'border-b border-it-line dark:border-rink-700',
      )}
      aria-label={`${student.name} 학생 상세 보기`}
    >
      {/* 아바타 */}
      <div className="relative shrink-0">
        <div className="size-11 rounded-w-pill bg-it-line dark:bg-rink-700 flex items-center justify-center">
          <Icon name="person" className="text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
        </div>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 size-3 rounded-w-pill border-2 border-it-surface dark:border-rink-800',
            student.isActive ? 'bg-it-blue-500' : 'bg-it-ink-300 dark:bg-rink-500',
          )}
          aria-label={student.isActive ? '활성 학생' : '비활성 학생'}
        />
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white truncate">{student.name}</span>
          <span className="shrink-0 text-card-meta font-medium text-it-ink-500 dark:text-wtext-4">{student.age}세</span>
          <span className={cn('shrink-0 rounded-w-pill px-2 py-0.5 text-card-meta font-bold', LEVEL_BADGE_CLASS)}>
            {levelInfo.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-card-meta text-it-ink-500 dark:text-wtext-4">
          <span className="font-medium truncate">{student.className || '미배정'}</span>
          {student.lastClassDate && (
            <span className="shrink-0 font-num tabular-nums">최근 {student.lastClassDate}</span>
          )}
        </div>
      </div>

      {/* 출석률 */}
      <div className="text-right shrink-0">
        <p
          className={cn(
            'text-card-body font-bold font-num tabular-nums',
            student.attendanceRate >= 90
              ? 'text-it-blue-500'
              : student.attendanceRate >= 70
                ? 'text-it-ink-700 dark:text-wtext-3'
                : 'text-it-red-500',
          )}
        >
          {student.attendanceRate}%
        </p>
        <p className="text-card-meta text-it-ink-400 dark:text-wtext-4">출석률</p>
      </div>

      <Icon name="chevron_right" className="text-[18px] text-it-ink-300 dark:text-rink-500 shrink-0" aria-hidden="true" />
    </NavLink>
  );
});

// ─── Level Filter Chip (ICETIMES — h36 · border 1.5px · pill) ──
function LevelFilterChip({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={`${label} 레벨 학생 ${count}명${isActive ? ', 선택됨' : ''}`}
      onClick={onClick}
      className={cn(
        'flex-shrink-0 inline-flex h-9 items-center gap-1.5 rounded-w-pill border-[1.5px] px-4 text-card-body font-bold transition-colors whitespace-nowrap motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-it-blue-500/30 focus:outline-none active:brightness-95',
        isActive
          ? 'border-it-blue-500 bg-it-blue-500 text-white'
          : 'border-it-line-strong bg-it-surface text-it-ink-600 hover:bg-it-fill dark:border-rink-700 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700',
      )}
    >
      <span aria-hidden="true">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'min-w-[20px] h-5 px-1.5 rounded-w-pill text-card-meta font-bold flex items-center justify-center font-num tabular-nums',
          isActive ? 'bg-white/20 text-white' : 'bg-it-line dark:bg-rink-700 text-it-ink-500 dark:text-wtext-4',
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Stat Box (ICETIMES — inset it-fill, border 1.5px) ──
function StatBox({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 rounded-w-md border-[1.5px] px-2 py-3.5',
        highlight
          ? 'bg-it-blue-50 border-it-blue-500/30 dark:bg-it-blue-900/30 dark:border-it-blue-500/30'
          : 'bg-it-fill border-it-line dark:bg-rink-700/40 dark:border-rink-700/50',
      )}
    >
      <Icon
        name={icon}
        className={cn('text-xl', highlight ? 'text-it-blue-500' : 'text-it-ink-400 dark:text-wtext-4')}
        aria-hidden="true"
      />
      <p
        className={cn(
          'text-2xl font-black font-num tabular-nums',
          highlight ? 'text-it-blue-500' : 'text-it-ink-800 dark:text-white',
        )}
      >
        {value}
      </p>
      <p className="text-card-meta font-medium text-it-ink-500 dark:text-wtext-4">{label}</p>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────
export default function CoachStudentsPage() {
  const { toast } = useToast();
  const searchInputId = useId();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '담당 학생 관리',
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });

  // ─── 데이터 조회 ──────────────────────────────────
  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get('/members', {
        params: { role: 'CHILD,TEEN' },
      });
      const data = response.data?.data ?? response.data ?? [];
      setStudents(
        Array.isArray(data)
          ? data.map((m: Record<string, unknown>) => ({
              id: String(m.id ?? ''),
              name: String(m.name ?? ''),
              age: Number(m.age ?? 0),
              level: String(m.level ?? 'BEGINNER'),
              className: String(m.className ?? ''),
              attendanceRate: Number(m.attendanceRate ?? 0),
              lastClassDate: m.lastClassDate ? String(m.lastClassDate) : null,
              isActive: Boolean(m.isActive ?? true),
            }))
          : []
      );
    } catch {
      toast.error(MESSAGES.error.general);
      setStudents([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // ─── 필터 & 검색 ──────────────────────────────────
  const filtered = useMemo(() => {
    return students.filter(s => {
      const levelKey = LEVEL_TAB_MAP[activeTab];
      if (levelKey && s.level !== levelKey) return false;
      if (searchQuery && !s.name.includes(searchQuery)) return false;
      return true;
    });
  }, [students, activeTab, searchQuery]);

  const counts = useMemo(() => ({
    all: students.length,
    beginner: students.filter(s => s.level === 'BEGINNER').length,
    intermediate: students.filter(s => s.level === 'INTERMEDIATE').length,
    advanced: students.filter(s => s.level === 'ADVANCED').length,
  }), [students]);

  // ─── 통계 ──────────────────────────────────────────
  const stats = useMemo(() => {
    const active = students.filter(s => s.isActive);
    const avgRate = active.length > 0
      ? Math.round(active.reduce((sum, s) => sum + s.attendanceRate, 0) / active.length)
      : 0;
    return {
      total: students.length,
      active: active.length,
      avgRate,
    };
  }, [students]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="담당 학생 관리" />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck" role="main" aria-label="담당 학생 관리">
        {/* 통계 요약 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5" aria-label="학생 통계 요약">
          <div className="grid grid-cols-3 gap-3" role="list">
            <div role="listitem">
              <StatBox icon="groups" label={MESSAGES.dashboard.stats.totalMembers} value={stats.total} />
            </div>
            <div role="listitem">
              <StatBox icon="person_check" label="활성 학생" value={stats.active} />
            </div>
            <div role="listitem">
              <StatBox icon="trending_up" label="평균 출석률" value={`${stats.avgRate}%`} highlight />
            </div>
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 검색 + 필터 + 학생 배정 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-4" aria-label="학생 검색">
          <div className="relative">
            <label htmlFor={searchInputId} className="sr-only">학생 이름 검색</label>
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-it-ink-400 dark:text-wtext-4"
              aria-hidden="true"
            />
            <input
              id={searchInputId}
              type="search"
              placeholder={MESSAGES.placeholders.searchStudent}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="학생 이름 검색"
              autoComplete="off"
              className="h-12 w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 pl-11 pr-4 text-[15px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
            />
          </div>

          {/* 레벨 필터 칩 */}
          <div
            className="flex gap-2 py-3 overflow-x-auto hide-scrollbar"
            role="tablist"
            aria-label="학생 레벨 필터"
          >
            <LevelFilterChip label="전체" count={counts.all} isActive={activeTab === 'all'} onClick={() => setActiveTab('all')} />
            <LevelFilterChip label="초급" count={counts.beginner} isActive={activeTab === 'beginner'} onClick={() => setActiveTab('beginner')} />
            <LevelFilterChip label="중급" count={counts.intermediate} isActive={activeTab === 'intermediate'} onClick={() => setActiveTab('intermediate')} />
            <LevelFilterChip label="고급" count={counts.advanced} isActive={activeTab === 'advanced'} onClick={() => setActiveTab('advanced')} />
          </div>

          {/* 학생 배정 버튼 */}
          <NavLink
            href="/coach-members"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-w-md border-[1.5px] border-dashed border-it-line-strong bg-it-fill py-3 text-card-body font-bold text-it-blue-500 transition-colors motion-reduce:transition-none hover:border-it-blue-500 active:brightness-95 dark:border-rink-700 dark:bg-rink-800 dark:hover:border-it-blue-500"
          >
            <Icon name="person_add" className="text-card-title" aria-hidden="true" />
            <span>학생 배정하기</span>
          </NavLink>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 학생 목록 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-7" aria-labelledby="students-list-heading">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-baseline gap-2">
              <h2
                id="students-list-heading"
                className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white"
              >
                학생 목록
              </h2>
              <span
                className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500"
                aria-live="polite"
                aria-atomic="true"
              >
                {filtered.length}
              </span>
            </div>
          </div>

          {isLoading ? null : filtered.length > 0 ? (
            <ul
              className="flex flex-col list-none"
              role="list"
              aria-label="담당 학생 목록"
            >
              {filtered.map((student, idx) => (
                <li key={student.id} role="listitem">
                  <StudentRow student={student} isLast={idx === filtered.length - 1} />
                </li>
              ))}
            </ul>
          ) : (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              role="status"
            >
              <p className="text-card-body font-medium text-it-ink-700 dark:text-wtext-4">
                {searchQuery ? '검색 결과가 없습니다.' : MESSAGES.empty('학생')}
              </p>
            </div>
          )}
        </section>

        <div className="h-6 bg-it-canvas dark:bg-puck" aria-hidden="true" />
      </main>
    </MobileContainer>
  );
}
