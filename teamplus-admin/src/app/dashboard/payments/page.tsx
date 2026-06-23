'use client';

/**
 * /dashboard/payments — 결제 관리 (2026-05-09 재구성)
 *
 * 변경 이력
 *   - 기존: 결제 거래(Payment) 단위 테이블
 *   - 신규: 수업관리/대회관리 페이지와 동일한 톤 — 팀별 카드 + 수업·대회 row,
 *           각 row 클릭 시 해당 항목 결제 상세로 이동
 *
 * 데이터 소스 (실데이터, mock 없음)
 *   - GET /teams (admin) — 활성 팀 전체
 *   - GET /teams/:teamId/classes — 팀별 수업 목록
 *   - GET /tournaments — 전체 대회 (team 필터링 client-side)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  CreditCard,
  Users,
  GraduationCap,
  Trophy,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Dumbbell,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
  _count?: { members?: number; roster?: number };
}

interface TeamClass {
  id: string;
  className: string;
  capacity?: number;
  maxStudents?: number;
  studentCount?: number;
  isActive?: boolean;
  approvalStatus?: string;
  /** [추가 2026-05-14] 수업 형태 — 배지 색상/라벨 분기 (web 과 동일) */
  trainingType?: string | null;
}

// [추가 2026-05-14] 수업 형태별 배지 라벨/색상/아이콘 — web class-categories.ts 와 동일 규칙.
//   regular=초록+GraduationCap, lesson=파랑+Dumbbell.
interface TrainingTypeBadge {
  label: string;
  /** 배지(텍스트 칩) 색상 */
  cls: string;
  /** 행 좌측 아이콘 */
  icon: LucideIcon;
  /** 아이콘 래퍼 배경/텍스트 색상 */
  iconCls: string;
}
const TRAINING_TYPE_BADGE: Record<string, TrainingTypeBadge> = {
  regular: {
    label: '수업',
    cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    icon: GraduationCap,
    iconCls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  lesson: {
    label: '레슨',
    cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    icon: Dumbbell,
    iconCls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  },
};
function trainingTypeBadge(type?: string | null): TrainingTypeBadge {
  return (type ? TRAINING_TYPE_BADGE[type] : undefined) ?? TRAINING_TYPE_BADGE.regular;
}

interface Tournament {
  id: string;
  name: string;
  status?: string;
  teamId?: string | null;
  team?: { id?: string; name?: string } | null;
  feePerGame?: number | string | null;
  _count?: { registrations?: number };
}

interface ApiWrap<T> { success?: boolean; data?: T }
function unwrap<T>(payload: unknown): T | null {
  if (Array.isArray(payload)) return payload as unknown as T;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return ((payload as ApiWrap<T>).data ?? null) as T | null;
  }
  return (payload ?? null) as T | null;
}

// ─── 수업별 결제 현황 (GET /teams/:teamId/classes/:classId/payments) ───
// [수정 2026-05-14] 수업 결제는 "미납/결제완료" 2-state — 'pending'(승인대기) 제거.
type PaymentState = 'paid' | 'unpaid' | 'cancelled' | 'refunded';

interface ClassPaymentStudent {
  registrationId: string;
  memberId: string;
  memberName: string;
  memberType?: string;
  productName?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
  paymentState: PaymentState;
  payerId?: string | null;
  payerName?: string | null;
}

interface ClassPaymentData {
  classId: string;
  className: string;
  total: number;
  counts: Record<PaymentState, number>;
  totalPaidAmount: number;
  students: ClassPaymentStudent[];
}

const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  paid: '결제완료',
  unpaid: '미납',
  cancelled: '취소',
  refunded: '환불',
};

const PAYMENT_STATE_CLASS: Record<PaymentState, string> = {
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  unpaid: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  cancelled: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  refunded: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

// ─── 대회별 참가자 결제 현황 (GET /tournaments/:id/registrations) ───
interface TournamentRegistration {
  id: string;
  gamesCount?: number | null;
  calculatedFee?: number | string | null;
  paymentStatus: string; // PENDING | PAID | CANCELLED | REFUNDED
  registeredAt?: string;
  user?: { id: string; firstName?: string; lastName?: string } | null;
  child?: { id: string; firstName?: string; lastName?: string } | null;
  payment?: {
    id: string;
    orderNumber?: string;
    paymentStatus?: string;
    amount?: number;
  } | null;
}

interface TournamentPaymentData {
  tournamentId: string;
  total: number;
  registrations: TournamentRegistration[];
}

// 대회 paymentStatus(PENDING/PAID/...) → 표시 라벨/색상
const TOUR_PAY_LABEL: Record<string, string> = {
  PAID: '결제완료',
  PENDING: '미납',
  CANCELLED: '취소',
  REFUNDED: '환불',
};
const TOUR_PAY_CLASS: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  CANCELLED: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  REFUNDED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const TOUR_STATUS_LABEL: Record<string, string> = {
  scheduled: '예정',
  ongoing: '진행중',
  finished: '종료',
  cancelled: '취소',
};

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function PaymentsManagementPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [classesByTeam, setClassesByTeam] = useState<Record<string, TeamClass[]>>({});
  const [tournamentsByTeam, setTournamentsByTeam] = useState<Record<string, Tournament[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ─── 수업 row accordion ───
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [classPayments, setClassPayments] = useState<Record<string, ClassPaymentData>>({});
  const [loadingClassId, setLoadingClassId] = useState<string | null>(null);
  const [classPaymentError, setClassPaymentError] = useState<Record<string, string>>({});

  // ─── 대회 row accordion ───
  const [expandedTourId, setExpandedTourId] = useState<string | null>(null);
  const [tourPayments, setTourPayments] = useState<Record<string, TournamentPaymentData>>({});
  const [loadingTourId, setLoadingTourId] = useState<string | null>(null);
  const [tourPaymentError, setTourPaymentError] = useState<Record<string, string>>({});

  const toggleClass = useCallback(
    async (teamId: string, classId: string) => {
      // 이미 열린 수업 → 닫기
      if (expandedClassId === classId) {
        setExpandedClassId(null);
        return;
      }
      setExpandedClassId(classId);
      // 이미 로드된 데이터 있으면 재요청 안 함
      if (classPayments[classId]) return;
      setLoadingClassId(classId);
      setClassPaymentError((prev) => ({ ...prev, [classId]: '' }));
      try {
        const res = await api.get<ClassPaymentData>(
          `/teams/${teamId}/classes/${classId}/payments`,
        );
        const data = unwrap<ClassPaymentData>(res) ?? (res as ClassPaymentData);
        if (data && Array.isArray(data.students)) {
          setClassPayments((prev) => ({ ...prev, [classId]: data }));
        } else {
          setClassPaymentError((prev) => ({
            ...prev,
            [classId]: '결제 현황을 불러오지 못했습니다.',
          }));
        }
      } catch (e) {
        setClassPaymentError((prev) => ({
          ...prev,
          [classId]: e instanceof Error ? e.message : '결제 현황을 불러오지 못했습니다.',
        }));
      } finally {
        setLoadingClassId(null);
      }
    },
    [expandedClassId, classPayments],
  );

  const toggleTournament = useCallback(
    async (tournamentId: string) => {
      if (expandedTourId === tournamentId) {
        setExpandedTourId(null);
        return;
      }
      setExpandedTourId(tournamentId);
      if (tourPayments[tournamentId]) return;
      setLoadingTourId(tournamentId);
      setTourPaymentError((prev) => ({ ...prev, [tournamentId]: '' }));
      try {
        const res = await api.get<TournamentPaymentData>(
          `/tournaments/${tournamentId}/registrations`,
        );
        const data = unwrap<TournamentPaymentData>(res) ?? (res as TournamentPaymentData);
        if (data && Array.isArray(data.registrations)) {
          setTourPayments((prev) => ({ ...prev, [tournamentId]: data }));
        } else {
          setTourPaymentError((prev) => ({
            ...prev,
            [tournamentId]: '참가자 결제 현황을 불러오지 못했습니다.',
          }));
        }
      } catch (e) {
        setTourPaymentError((prev) => ({
          ...prev,
          [tournamentId]:
            e instanceof Error ? e.message : '참가자 결제 현황을 불러오지 못했습니다.',
        }));
      } finally {
        setLoadingTourId(null);
      }
    },
    [expandedTourId, tourPayments],
  );

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

      const classMap: Record<string, TeamClass[]> = {};
      await Promise.all(
        activeTeams.map(async (t) => {
          const res = await api.get<TeamClass[]>(`/teams/${t.id}/classes`);
          const list = Array.isArray(res) ? res : unwrap<TeamClass[]>(res) ?? [];
          classMap[t.id] = Array.isArray(list) ? list : [];
        }),
      );
      setClassesByTeam(classMap);

      const tourRes = await api.get<Tournament[] | { data?: Tournament[] }>('/tournaments');
      const tourList = Array.isArray(tourRes)
        ? tourRes
        : unwrap<Tournament[]>(tourRes) ?? [];
      const tourMap: Record<string, Tournament[]> = {};
      (Array.isArray(tourList) ? tourList : []).forEach((t) => {
        const tid = t.teamId ?? t.team?.id ?? null;
        if (!tid) return;
        if (!tourMap[tid]) tourMap[tid] = [];
        tourMap[tid].push(t);
      });
      setTournamentsByTeam(tourMap);
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
      (classesByTeam[t.id] ?? []).some((c) => c.className?.toLowerCase().includes(q)) ||
      (tournamentsByTeam[t.id] ?? []).some((tr) => tr.name?.toLowerCase().includes(q)),
    );
  }, [teams, classesByTeam, tournamentsByTeam, searchTerm]);

  const stats = useMemo(() => {
    const totalClasses = Object.values(classesByTeam).reduce((s, a) => s + a.length, 0);
    const totalTournaments = Object.values(tournamentsByTeam).reduce((s, a) => s + a.length, 0);
    const enrolledStudents = Object.values(classesByTeam)
      .flat()
      .reduce((s, c) => s + (c.studentCount ?? 0), 0);
    return { totalClasses, totalTournaments, enrolledStudents };
  }, [classesByTeam, tournamentsByTeam]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <section
        className="relative overflow-hidden rounded-2xl bg-primary text-white shadow-md"
        aria-label="결제 관리 헤더"
      >
        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
                결제 관리
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">결제 관리</h1>
              <p className="text-sm sm:text-base text-white/80">
                팀별 수업·대회 결제 현황을 한눈에 확인합니다
              </p>
            </div>
            <Link
              href="/dashboard/payments/statistics"
              className="h-11 inline-flex items-center gap-2 px-4 rounded-lg bg-white hover:bg-slate-100 text-primary text-sm font-semibold shadow-sm motion-reduce:transition-none transition-colors"
            >
              <CreditCard className="w-4 h-4" aria-hidden="true" />
              통계 보기
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Mini label="활성 팀" value={teams.length} />
            <Mini label="등록 수업" value={stats.totalClasses} />
            <Mini label="등록 대회" value={stats.totalTournaments} />
            <Mini label="총 등록 학생" value={stats.enrolledStudents} />
          </div>
        </div>
      </section>

      {/* Search */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <Search className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          placeholder="팀명, 팀코드, 수업명, 대회명으로 검색"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          aria-label="결제 검색"
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
          description={searchTerm ? '다른 키워드로 다시 검색해보세요' : '팀을 먼저 생성하면 수업/대회 결제가 표시됩니다'}
        />
      ) : (
        <div className="space-y-5">
          {filteredTeams.map((team) => {
            // 수업(regular/lesson) → 대회 순으로 렌더. tournaments 는 항상 classes 다음.
            const classes = classesByTeam[team.id] ?? [];
            const tournaments = tournamentsByTeam[team.id] ?? [];
            const teamLabel = team.teamCode ? `${team.name} (${team.teamCode})` : team.name;
            const totalCount = classes.length + tournaments.length;
            return (
              <section
                key={team.id}
                className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
                aria-label={`${team.name} 팀 결제 현황`}
              >
                <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Users className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">{teamLabel}</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        수업 {classes.length}건 · 대회 {tournaments.length}건
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

                {totalCount === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    등록된 수업/대회가 없습니다
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {classes.map((c) => {
                      const isExpanded = expandedClassId === c.id;
                      const cp = classPayments[c.id];
                      const cpError = classPaymentError[c.id];
                      const isLoadingCp = loadingClassId === c.id;
                      return (
                        <li key={`cls-${c.id}`}>
                          <button
                            type="button"
                            onClick={() => void toggleClass(team.id, c.id)}
                            aria-expanded={isExpanded}
                            className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none"
                          >
                            {(() => {
                              const badge = trainingTypeBadge(c.trainingType);
                              const BadgeIcon = badge.icon;
                              return (
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${badge.iconCls}`}>
                                  <BadgeIcon className="w-4 h-4" aria-hidden="true" />
                                </div>
                              );
                            })()}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                {(() => {
                                  const badge = trainingTypeBadge(c.trainingType);
                                  return (
                                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                                      {badge.label}
                                    </span>
                                  );
                                })()}
                                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{c.className}</p>
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                등록 {c.studentCount ?? 0}명 / 정원 {c.capacity ?? c.maxStudents ?? '-'}명
                                {c.isActive === false && ' · 비활성'}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-primary shrink-0">
                              {isExpanded ? '접기' : '결제 확인'}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                            )}
                          </button>

                          {/* Accordion 펼침 — 수업별 결제 현황 */}
                          {isExpanded && (
                            <div className="bg-slate-50 dark:bg-slate-900/40 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
                              {isLoadingCp ? (
                                <div className="flex justify-center py-6">
                                  <LoadingSpinner />
                                </div>
                              ) : cpError ? (
                                <div className="flex items-center gap-2 py-4 text-sm text-red-600 dark:text-red-400">
                                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                                  {cpError}
                                </div>
                              ) : cp ? (
                                <ClassPaymentPanel data={cp} />
                              ) : null}
                            </div>
                          )}
                        </li>
                      );
                    })}
                    {tournaments.map((t) => {
                      const isTourExpanded = expandedTourId === t.id;
                      const tp = tourPayments[t.id];
                      const tpError = tourPaymentError[t.id];
                      const isLoadingTp = loadingTourId === t.id;
                      return (
                        <li key={`tour-${t.id}`}>
                          <button
                            type="button"
                            onClick={() => void toggleTournament(t.id)}
                            aria-expanded={isTourExpanded}
                            className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                              <Trophy className="w-4 h-4" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-bold">
                                  대회
                                </span>
                                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{t.name}</p>
                                {t.status && (
                                  <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
                                    {TOUR_STATUS_LABEL[t.status] ?? t.status}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                참가자 {t._count?.registrations ?? 0}명
                                {t.feePerGame ? ` · 참가비 ${Number(t.feePerGame).toLocaleString()}원` : ''}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-primary shrink-0">
                              {isTourExpanded ? '접기' : '결제 확인'}
                            </span>
                            {isTourExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                            )}
                          </button>

                          {/* Accordion 펼침 — 대회 참가자 결제 현황 */}
                          {isTourExpanded && (
                            <div className="bg-slate-50 dark:bg-slate-900/40 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
                              {isLoadingTp ? (
                                <div className="flex justify-center py-6">
                                  <LoadingSpinner />
                                </div>
                              ) : tpError ? (
                                <div className="flex items-center gap-2 py-4 text-sm text-red-600 dark:text-red-400">
                                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                                  {tpError}
                                </div>
                              ) : tp ? (
                                <TournamentPaymentPanel data={tp} />
                              ) : null}
                            </div>
                          )}
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

// ─── 수업별 결제 현황 패널 (accordion 내부) ───
function ClassPaymentPanel({ data }: { data: ClassPaymentData }) {
  const { counts, totalPaidAmount, students } = data;
  return (
    <div className="space-y-3">
      {/* 요약 — 수업 결제는 미납/결제완료 2-state (+환불) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-1 text-xs font-bold">
          결제완료 {counts.paid}명
        </span>
        <span className="rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 text-xs font-bold">
          미납 {counts.unpaid}명
        </span>
        {counts.refunded > 0 && (
          <span className="rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-1 text-xs font-bold">
            환불 {counts.refunded}명
          </span>
        )}
        <span className="ml-auto text-sm font-bold text-slate-900 dark:text-white tabular-nums">
          총 결제액 {totalPaidAmount.toLocaleString()}원
        </span>
      </div>

      {/* 학생/결제자 테이블 */}
      {students.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
          등록된 학생이 없습니다
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white dark:bg-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2 font-semibold">학생</th>
                <th className="px-3 py-2 font-semibold">결제한 부모</th>
                <th className="px-3 py-2 font-semibold">상품</th>
                <th className="px-3 py-2 font-semibold text-right">금액</th>
                <th className="px-3 py-2 font-semibold">결제일</th>
                <th className="px-3 py-2 font-semibold text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {students.map((s) => (
                <tr key={s.registrationId} className="bg-white dark:bg-slate-800">
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                    {s.memberName}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    {s.payerName ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    {s.productName ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900 dark:text-white">
                    {s.amount != null ? `${Number(s.amount).toLocaleString()}원` : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                    {s.paidAt ? new Date(s.paidAt).toLocaleDateString('ko-KR') : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${PAYMENT_STATE_CLASS[s.paymentState]}`}
                    >
                      {PAYMENT_STATE_LABEL[s.paymentState]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── 대회별 참가자 결제 현황 패널 (accordion 내부) ───
function TournamentPaymentPanel({ data }: { data: TournamentPaymentData }) {
  const { registrations } = data;
  const paidCount = registrations.filter((r) => r.paymentStatus === 'PAID').length;
  const pendingCount = registrations.filter((r) => r.paymentStatus === 'PENDING').length;
  const totalPaidAmount = registrations
    .filter((r) => r.paymentStatus === 'PAID')
    .reduce((sum, r) => sum + (r.payment?.amount ?? Number(r.calculatedFee ?? 0)), 0);

  const participantName = (r: TournamentRegistration): string => {
    const c = r.child;
    if (c) return `${c.lastName ?? ''}${c.firstName ?? ''}`.trim() || '—';
    const u = r.user;
    if (u) return `${u.lastName ?? ''}${u.firstName ?? ''}`.trim() || '—';
    return '—';
  };

  return (
    <div className="space-y-3">
      {/* 요약 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-1 text-xs font-bold">
          결제완료 {paidCount}명
        </span>
        {pendingCount > 0 && (
          <span className="rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-1 text-xs font-bold">
            미납 {pendingCount}명
          </span>
        )}
        <span className="ml-auto text-sm font-bold text-slate-900 dark:text-white tabular-nums">
          총 결제액 {totalPaidAmount.toLocaleString()}원
        </span>
      </div>

      {/* 참가자 테이블 */}
      {registrations.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
          참가 신청자가 없습니다
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white dark:bg-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2 font-semibold">참가자</th>
                <th className="px-3 py-2 font-semibold text-right">경기 수</th>
                <th className="px-3 py-2 font-semibold text-right">참가비</th>
                <th className="px-3 py-2 font-semibold">신청일</th>
                <th className="px-3 py-2 font-semibold text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {registrations.map((r) => {
                const fee = r.payment?.amount ?? Number(r.calculatedFee ?? 0);
                return (
                  <tr key={r.id} className="bg-white dark:bg-slate-800">
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                      {participantName(r)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {r.gamesCount ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900 dark:text-white">
                      {fee > 0 ? `${fee.toLocaleString()}원` : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                      {r.registeredAt ? new Date(r.registeredAt).toLocaleDateString('ko-KR') : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                          TOUR_PAY_CLASS[r.paymentStatus] ??
                          'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {TOUR_PAY_LABEL[r.paymentStatus] ?? r.paymentStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-10 text-center">
      <CreditCard className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <p className="mt-3 text-base font-bold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}
