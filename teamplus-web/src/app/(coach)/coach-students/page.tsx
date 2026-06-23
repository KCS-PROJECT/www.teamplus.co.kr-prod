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
type ClassFilter = 'all' | string;

const LEVEL_MAP: Record<string, { label: string; className: string }> = {
  BEGINNER:     { label: '초급', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  INTERMEDIATE: { label: '중급', className: 'bg-blue-100 text-ice-500 dark:bg-blue-900/20 dark:text-blue-400' },
  ADVANCED:     { label: '고급', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' },
};

const LEVEL_TAB_MAP: Record<FilterTab, string | null> = {
  all: null,
  beginner: 'BEGINNER',
  intermediate: 'INTERMEDIATE',
  advanced: 'ADVANCED',
};

// ─── Student Card ──────────────────────────────────
const StudentCard = memo(function StudentCard({ student }: { student: StudentInfo }) {
  const levelInfo = LEVEL_MAP[student.level] ?? { label: student.level, className: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-300' };

  return (
    <NavLink
      href={`/coach-students/${student.id}`}
      className="flex items-center gap-3 p-4 bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 hover:border-ice-500/40 hover:shadow-md transition-all motion-reduce:transition-none active:brightness-95 min-h-[64px]"
      aria-label={`${student.name} 학생 상세 보기`}
    >
      {/* 아바타 */}
      <div className="relative">
        <div className="h-11 w-11 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
          <Icon name="person" className="text-wtext-3 dark:text-rink-300" aria-hidden="true" />
        </div>
        <div
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-w-pill border-2 border-white dark:border-rink-800',
            student.isActive ? 'bg-emerald-500' : 'bg-wtext-4'
          )}
          aria-label={student.isActive ? '활성 학생' : '비활성 학생'}
        />
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-card-body font-bold text-wtext-1 dark:text-white truncate">{student.name}</span>
          <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300 shrink-0">{student.age}세</span>
          <span className={cn('text-card-meta font-bold px-2 py-0.5 rounded-w-pill shrink-0', levelInfo.className)}>
            {levelInfo.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-card-meta text-wtext-3 dark:text-rink-300">
          <span className="font-medium truncate">{student.className || '미배정'}</span>
          {student.lastClassDate && (
            <span className="shrink-0 tabular-nums">최근 {student.lastClassDate}</span>
          )}
        </div>
      </div>

      {/* 출석률 */}
      <div className="text-right shrink-0">
        <p className={cn(
          'text-card-body font-bold tabular-nums',
          student.attendanceRate >= 90 ? 'text-emerald-600 dark:text-emerald-400'
            : student.attendanceRate >= 70 ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400'
        )}>
          {student.attendanceRate}%
        </p>
        <p className="text-card-meta text-wtext-3 dark:text-rink-300">출석률</p>
      </div>

      <Icon name="chevron_right" className="text-wtext-4 dark:text-rink-500 shrink-0" aria-hidden="true" />
    </NavLink>
  );
});

// ─── Level Filter Tab ────────────────────────────────
function LevelFilterTab({
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
        'flex items-center gap-1.5 px-4 py-2 rounded-w-pill text-card-body font-medium transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none',
        isActive
          ? 'bg-ice-500 text-white'
          : 'bg-wline-2 dark:bg-rink-800 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-700'
      )}
    >
      <span aria-hidden="true">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'min-w-[20px] h-5 px-1.5 rounded-w-pill text-card-meta font-bold flex items-center justify-center',
          isActive ? 'bg-white/20 text-white' : 'bg-wline dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Stats Card ──────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  iconColor,
}: {
  icon: string;
  label: string;
  value: string | number;
  iconColor: string;
}) {
  return (
    <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-3 flex flex-col items-center gap-1">
      <Icon name={icon} className={cn('text-xl', iconColor)} aria-hidden="true" />
      <p className="text-2xl font-black text-wtext-1 dark:text-white tabular-nums">{value}</p>
      <p className="text-card-meta text-wtext-3 dark:text-rink-300 font-medium">{label}</p>
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

      <main className="flex-1 overflow-y-auto hide-scrollbar px-5 py-4 pb-30">
        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-5" role="list" aria-label="학생 통계 요약">
          <div role="listitem">
            <StatCard icon="groups" label={MESSAGES.dashboard.stats.totalMembers} value={stats.total} iconColor="text-blue-600 dark:text-blue-400" />
          </div>
          <div role="listitem">
            <StatCard icon="person_check" label="활성 학생" value={stats.active} iconColor="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div role="listitem">
            <StatCard icon="trending_up" label="평균 출석률" value={`${stats.avgRate}%`} iconColor="text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        {/* 검색 */}
        <div className="relative mb-4">
          <label htmlFor={searchInputId} className="sr-only">학생 이름 검색</label>
          <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-wtext-3 text-card-title" aria-hidden="true" />
          <input
            id={searchInputId}
            type="search"
            placeholder={MESSAGES.placeholders.searchStudent}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="학생 이름 검색"
            autoComplete="off"
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-xl text-card-body placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500/20 focus:border-ice-500"
          />
        </div>

        {/* 레벨 필터 탭 */}
        <div
          className="flex gap-2 mb-4 overflow-x-auto hide-scrollbar"
          role="tablist"
          aria-label="학생 레벨 필터"
        >
          <LevelFilterTab label="전체" count={counts.all} isActive={activeTab === 'all'} onClick={() => setActiveTab('all')} />
          <LevelFilterTab label="초급" count={counts.beginner} isActive={activeTab === 'beginner'} onClick={() => setActiveTab('beginner')} />
          <LevelFilterTab label="중급" count={counts.intermediate} isActive={activeTab === 'intermediate'} onClick={() => setActiveTab('intermediate')} />
          <LevelFilterTab label="고급" count={counts.advanced} isActive={activeTab === 'advanced'} onClick={() => setActiveTab('advanced')} />
        </div>

        {/* 학생 배정 버튼 */}
        <div className="mb-4">
          <NavLink
            href="/coach-members"
            className="flex items-center justify-center gap-2 w-full min-h-[44px] py-3 bg-white dark:bg-rink-800 border border-dashed border-wline dark:border-rink-700 rounded-xl text-card-body font-semibold text-ice-500 hover:border-ice-500 hover:bg-ice-500/5 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            <Icon name="person_add" className="text-card-title" aria-hidden="true" />
            <span>학생 배정하기</span>
          </NavLink>
        </div>

        {/* 학생 목록 */}
        <section aria-labelledby="students-list-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="students-list-heading"
              className="text-card-emphasis font-bold text-wtext-1 dark:text-white"
            >
              학생 목록
            </h2>
            <span
              className="text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums"
              aria-live="polite"
              aria-atomic="true"
            >
              {filtered.length}명
            </span>
          </div>

          {isLoading ? null : filtered.length > 0 ? (
            <ul
              className="flex flex-col gap-3 list-none"
              role="list"
              aria-label="담당 학생 목록"
            >
              {filtered.map(student => (
                <li key={student.id} role="listitem">
                  <StudentCard student={student} />
                </li>
              ))}
            </ul>
          ) : (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              role="status"
            >
              <div className="w-14 h-14 rounded-2xl bg-wline-2 dark:bg-rink-800 flex items-center justify-center mb-3">
                <Icon name="person_search" className="text-3xl text-wtext-4 dark:text-rink-500" aria-hidden="true" />
              </div>
              <p className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">
                {searchQuery ? '검색 결과가 없습니다.' : MESSAGES.empty('학생')}
              </p>
            </div>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
