'use client';

/**
 * /dashboard/attendance — 수업 관리 페이지 (2026-05-08 재구성)
 *
 * 변경 이력
 *   - 기존: 회원 출석 history 테이블 위주
 *   - 신규: 팀별 수업 그룹 카드 — 각 팀의 활성 수업 + 등록 학생 수 + 빠른 진입
 *
 * 데이터 소스 (실데이터, mock 없음)
 *   - GET /teams (관리자) — 활성 팀 전체
 *   - GET /teams/:teamId/classes — 팀별 수업 목록
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  ClipboardCheck,
  Users,
  Calendar,
  ChevronRight,
  BarChart3,
  AlertCircle,
  GraduationCap,
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { api } from '@/services/api-client';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

interface Team {
  id: string;
  name: string;
  teamCode?: string | null;
  shortName?: string | null;
  isActive?: boolean;
  _count?: {
    members?: number;
    roster?: number;
    classes?: number;
  };
}

interface TeamClass {
  id: string;
  className: string;
  instructorName?: string;
  coach?: string;
  capacity?: number;
  maxStudents?: number;
  studentCount?: number;
  startTime?: string;
  endTime?: string;
  classDays?: string[];
  dayOfWeek?: string;
  trainingType?: string | null;
  category?: string | null;
  approvalStatus?: string;
  isActive?: boolean;
}

interface ApiWrap<T> { success?: boolean; data?: T }

function unwrap<T>(payload: unknown): T | null {
  if (Array.isArray(payload)) return payload as unknown as T;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return ((payload as ApiWrap<T>).data ?? null) as T | null;
  }
  return (payload ?? null) as T | null;
}

function formatTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const DAY_KO: Record<string, string> = {
  MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토', SUN: '일',
};

function formatDays(days?: string[] | string) {
  if (!days) return '';
  if (typeof days === 'string') return days;
  if (!Array.isArray(days) || days.length === 0) return '';
  return days.map((d) => DAY_KO[d] ?? d).join('·');
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function ClassManagementPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [classesByTeam, setClassesByTeam] = useState<Record<string, TeamClass[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const teamsRes = await api.get<Team[] | { data?: Team[] }>('/teams', { params: { limit: 100 } });
      const teamsList = Array.isArray(teamsRes)
        ? teamsRes
        : Array.isArray((teamsRes as ApiWrap<Team[]>)?.data)
          ? ((teamsRes as ApiWrap<Team[]>).data as Team[])
          : unwrap<Team[]>(teamsRes) ?? [];
      const activeTeams = teamsList.filter((t) => t.isActive !== false);
      setTeams(activeTeams);

      const all: Record<string, TeamClass[]> = {};
      await Promise.all(
        activeTeams.map(async (t) => {
          const res = await api.get<TeamClass[]>(`/teams/${t.id}/classes`);
          const list = Array.isArray(res) ? res : unwrap<TeamClass[]>(res) ?? [];
          all[t.id] = Array.isArray(list) ? list : [];
        }),
      );
      setClassesByTeam(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredTeams = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) =>
      (t.name?.toLowerCase().includes(q) ?? false) ||
      (t.teamCode?.toLowerCase().includes(q) ?? false) ||
      (classesByTeam[t.id] ?? []).some((c) => c.className?.toLowerCase().includes(q)),
    );
  }, [teams, classesByTeam, searchTerm]);

  const totalClasses = useMemo(
    () => Object.values(classesByTeam).reduce((sum, arr) => sum + arr.length, 0),
    [classesByTeam],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <section
        className="relative overflow-hidden rounded-2xl bg-primary text-white shadow-md"
        aria-label="수업 관리 헤더"
      >
        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                <GraduationCap className="w-3.5 h-3.5" aria-hidden="true" />
                수업 관리
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">수업 관리</h1>
              <p className="text-sm sm:text-base text-white/80">
                팀별로 등록된 수업을 한눈에 확인합니다
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/attendance/check"
                className="h-11 inline-flex items-center gap-2 px-4 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium motion-reduce:transition-none transition-colors"
              >
                <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
                출석 체크
              </Link>
              <Link
                href="/dashboard/attendance/statistics"
                className="h-11 inline-flex items-center gap-2 px-4 rounded-lg bg-white hover:bg-slate-100 text-primary text-sm font-semibold shadow-sm motion-reduce:transition-none transition-colors"
              >
                <BarChart3 className="w-4 h-4" aria-hidden="true" />
                통계 보기
              </Link>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Mini label="활성 팀" value={teams.length} />
            <Mini label="등록 수업" value={totalClasses} />
            <Mini
              label="평균 정원"
              value={
                totalClasses > 0
                  ? Math.round(
                      Object.values(classesByTeam).flat().reduce((s, c) => s + (c.capacity ?? c.maxStudents ?? 0), 0) /
                        totalClasses,
                    )
                  : 0
              }
            />
            <Mini
              label="총 등록 학생"
              value={Object.values(classesByTeam).flat().reduce((s, c) => s + (c.studentCount ?? 0), 0)}
            />
          </div>
        </div>
      </section>

      {/* Search */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <Search className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          placeholder="팀명, 팀코드, 수업명으로 검색"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          aria-label="팀/수업 검색"
        />
      </div>

      {/* Body */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-6 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-red-700 dark:text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
          >
            다시 시도
          </button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : filteredTeams.length === 0 ? (
        <EmptyState
          title={searchTerm ? '검색 결과가 없습니다' : '등록된 팀이 없습니다'}
          description={searchTerm ? '다른 키워드로 다시 검색해보세요' : '팀을 먼저 생성하면 수업을 등록할 수 있습니다'}
        />
      ) : (
        <div className="space-y-5">
          {filteredTeams.map((team) => {
            const classes = classesByTeam[team.id] ?? [];
            const teamLabel = team.teamCode ? `${team.name} (${team.teamCode})` : team.name;
            return (
              <section
                key={team.id}
                className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
                aria-label={`${team.name} 팀 수업 목록`}
              >
                {/* Team header */}
                <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Users className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">{teamLabel}</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {team._count?.members ?? team._count?.roster ?? 0}명 소속 · 수업 {classes.length}개
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/teams/${team.id}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    팀 상세 →
                  </Link>
                </header>

                {/* Class list */}
                {classes.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    등록된 수업이 없습니다
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {classes.map((c) => {
                      const cap = c.capacity ?? c.maxStudents ?? 0;
                      const enrolled = c.studentCount ?? 0;
                      const days = formatDays(c.classDays ?? c.dayOfWeek);
                      return (
                        <li key={c.id}>
                          <Link
                            href={`/dashboard/classes/${c.id}`}
                            className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                              <Calendar className="w-4 h-4" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                                {c.className}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                {days && <span>{days}</span>}
                                {(c.startTime || c.endTime) && (
                                  <span>{formatTime(c.startTime)}{c.endTime ? `-${formatTime(c.endTime)}` : ''}</span>
                                )}
                                {(c.coach || c.instructorName) && <span>· {c.coach ?? c.instructorName}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                                {enrolled}/{cap || '-'}
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/15 px-3 py-2.5">
      <p className="text-xs text-white/70">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-10 text-center">
      <GraduationCap className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <p className="mt-3 text-base font-bold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}
