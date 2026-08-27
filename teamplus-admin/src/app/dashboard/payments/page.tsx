'use client';

/**
 * /dashboard/payments — 결제 관리 (팀 → 수업/대회 단위 결제 현황 조회)
 *
 * 변경 이력
 *   - 기존: 결제 거래(Payment) 단위 테이블
 *   - 2026-05-09: 수업관리/대회관리 페이지와 동일한 톤 — 팀별 카드 + 수업·대회 row
 *   - A+ v2: 아코디언 전면 폐기. 본문 = 팀 카드 목록(요약 칩)만.
 *     카드 클릭 → 공통 Modal(고정 높이) 안에서 좌측 수업·대회 목록 / 우측 결제 현황.
 *     좌·우 패널 독립 스크롤, md 미만은 목록 ↔ 현황 2단계 전환.
 *
 * 데이터 소스 (실데이터, mock 없음)
 *   - GET /teams — 활성 팀 전체
 *   - GET /payments/admin/team-summaries — 팀별 결제 대상/완료/환불/미납 (칩·헤더 합산)
 *   - GET /teams/:teamId/classes?status=ACTIVE — 모달 열 때 (종료 포함 토글 시 무필터)
 *   - GET /tournaments?teamId= — 모달 열 때 (종료·취소는 클라 필터)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  CreditCard,
  Users,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
  Dumbbell,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
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
  endedAt?: string | null;
  approvalStatus?: string;
  /** [추가 2026-05-14] 수업 형태 — 배지 색상/라벨 분기 (web 과 동일) */
  trainingType?: string | null;
}

/** 팀별 결제 요약 (GET /payments/admin/team-summaries) — 접힌 카드 칩 + 헤더 합산용.
 *  수치 계약: 팀을 펼쳤을 때 보이는 상세 행 집계와 일치 (정산 센터 미수금 정의와 다름). */
interface TeamSummary {
  teamId: string;
  targetCount: number;
  paidCount: number;
  refundedCount: number;
  unpaidCount: number;
  /** 진행 중 수업/대회 개수 — 카드 부제 "수업 N건 · 대회 N건" */
  classCount: number;
  tournamentCount: number;
  /** 선택월 소속 대회 id (기간 겹침 ∪ 일정 미정 ∪ 미납 이월) — 목록 필터의 단일 SoT */
  monthTournamentIds: string[];
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

// ─── 월(KST) 유틸 — 조회 기준 월(YYYY-MM) ───
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function kstYearMonth(d: Date): string {
  const t = new Date(d.getTime() + KST_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
const currentYearMonth = () => kstYearMonth(new Date());
function shiftYearMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** 선택월에 진행한 수업인가 — 백엔드 classActiveForMonth 와 동일 판정. */
function classActiveForMonth(c: TeamClass, ym: string): boolean {
  if (c.endedAt) return kstYearMonth(new Date(c.endedAt)) >= ym;
  return c.isActive !== false;
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function PaymentsManagementPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [summaries, setSummaries] = useState<Record<string, TeamSummary>>({});
  const [classesByTeam, setClassesByTeam] = useState<Record<string, TeamClass[]>>({});
  const [tournamentsByTeam, setTournamentsByTeam] = useState<Record<string, Tournament[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEnded, setShowEnded] = useState(false);
  /** 조회 기준 월 — 요약·상세 모두 이 월 기준 (기본: 이번 달). */
  const [yearMonth, setYearMonth] = useState(currentYearMonth());

  // ─── 결제 현황 모달 — 팀 카드 클릭 → 좌 목록 / 우 현황 (아코디언 폐기) ───
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [loadedTeamIds, setLoadedTeamIds] = useState<Set<string>>(new Set());
  const [loadingTeamIds, setLoadingTeamIds] = useState<Set<string>>(new Set());
  const [teamLoadError, setTeamLoadError] = useState<Record<string, string>>({});
  /** 모달 우측에 표시할 항목 — kind 로 수업/대회 구분 */
  const [selectedItem, setSelectedItem] = useState<{ kind: 'class' | 'tour'; id: string } | null>(
    null,
  );
  /** 좁은 화면(md 미만) 2단계 전환 — 목록 ↔ 현황 */
  const [mobilePane, setMobilePane] = useState<'list' | 'detail'>('list');

  // ─── 결제 현황 캐시 (수업/대회 단위 — 한 번 받으면 재요청 없음) ───
  const [classPayments, setClassPayments] = useState<Record<string, ClassPaymentData>>({});
  const [loadingClassId, setLoadingClassId] = useState<string | null>(null);
  const [classPaymentError, setClassPaymentError] = useState<Record<string, string>>({});
  const [tourPayments, setTourPayments] = useState<Record<string, TournamentPaymentData>>({});
  const [loadingTourId, setLoadingTourId] = useState<string | null>(null);
  const [tourPaymentError, setTourPaymentError] = useState<Record<string, string>>({});

  const loadClassPayments = useCallback(
    async (teamId: string, classId: string) => {
      if (classPayments[classId]) return;
      setLoadingClassId(classId);
      setClassPaymentError((prev) => ({ ...prev, [classId]: '' }));
      try {
        const res = await api.get<ClassPaymentData>(
          `/teams/${teamId}/classes/${classId}/payments`,
          { params: { yearMonth } },
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
    [classPayments, yearMonth],
  );

  const loadTournamentPayments = useCallback(
    async (tournamentId: string) => {
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
    [tourPayments],
  );

  // 진입 시 요청 2건 — 팀 목록 + 팀별 결제 요약. 수업/대회는 모달을 열 때 지연 로딩.
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [teamsRes, summaryRes] = await Promise.all([
        api.get<Team[] | { data?: Team[] }>('/teams', { params: { limit: 100 } }),
        api.get<TeamSummary[]>('/payments/admin/team-summaries', { params: { yearMonth } }),
      ]);
      const teamsList = Array.isArray(teamsRes)
        ? teamsRes
        : Array.isArray((teamsRes as ApiWrap<Team[]>)?.data)
          ? ((teamsRes as ApiWrap<Team[]>).data as Team[])
          : unwrap<Team[]>(teamsRes) ?? [];
      setTeams(teamsList.filter((t) => t.isActive !== false));

      const summaryList = Array.isArray(summaryRes)
        ? summaryRes
        : unwrap<TeamSummary[]>(summaryRes) ?? [];
      const summaryMap: Record<string, TeamSummary> = {};
      (Array.isArray(summaryList) ? summaryList : []).forEach((s) => {
        summaryMap[s.teamId] = s;
      });
      setSummaries(summaryMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => { void load(); }, [load]);

  // 팀 1개의 수업·대회 로딩 — 수업은 서버 필터(status=ACTIVE), 대회는 종료·취소 클라 필터.
  const loadTeamData = useCallback(async (teamId: string, includeEnded: boolean) => {
    setLoadingTeamIds((prev) => new Set(prev).add(teamId));
    setTeamLoadError((prev) => ({ ...prev, [teamId]: '' }));
    try {
      const [clsRes, tourRes] = await Promise.all([
        // 선택월 기준이라 서버 ACTIVE 필터를 쓰지 않는다 — 지난달 조회 시
        //   그 달에 진행했고 지금은 종료된 수업도 보여야 한다.
        api.get<TeamClass[]>(`/teams/${teamId}/classes`),
        api.get<Tournament[] | { data?: Tournament[] }>('/tournaments', {
          params: { teamId },
        }),
      ]);
      const clsListRaw = Array.isArray(clsRes) ? clsRes : unwrap<TeamClass[]>(clsRes) ?? [];
      const clsList = (Array.isArray(clsListRaw) ? clsListRaw : []).filter(
        (c) => includeEnded || classActiveForMonth(c, yearMonth),
      );
      const tourListRaw = Array.isArray(tourRes)
        ? tourRes
        : unwrap<Tournament[]>(tourRes) ?? [];
      // 대회 월 소속 판정은 백엔드 요약(monthTournamentIds)이 단일 SoT —
      //   기간 겹침 ∪ 일정 미정 ∪ 미납 이월. 규칙을 프론트에 중복 구현하지 않는다.
      //   "종료 항목 포함" 토글은 월 소속과 무관하게 전체(취소 포함)를 보여준다.
      const monthIds = new Set(summaries[teamId]?.monthTournamentIds ?? []);
      const tourList = (Array.isArray(tourListRaw) ? tourListRaw : []).filter((t) =>
        includeEnded ? true : monthIds.has(t.id),
      );
      setClassesByTeam((prev) => ({ ...prev, [teamId]: clsList }));
      setTournamentsByTeam((prev) => ({ ...prev, [teamId]: tourList }));
      setLoadedTeamIds((prev) => new Set(prev).add(teamId));
    } catch (e) {
      setTeamLoadError((prev) => ({
        ...prev,
        [teamId]: e instanceof Error ? e.message : '수업·대회 목록을 불러오지 못했습니다.',
      }));
    } finally {
      setLoadingTeamIds((prev) => {
        const next = new Set(prev);
        next.delete(teamId);
        return next;
      });
    }
  }, [summaries, yearMonth]);

  const openTeamModal = useCallback(
    (teamId: string) => {
      setOpenTeamId(teamId);
      setSelectedItem(null);
      setMobilePane('list');
      if (!loadedTeamIds.has(teamId)) void loadTeamData(teamId, showEnded);
    },
    [loadedTeamIds, loadTeamData, showEnded],
  );

  const closeTeamModal = useCallback(() => {
    setOpenTeamId(null);
    setSelectedItem(null);
  }, []);

  // 종료 포함 토글 — 받은 팀 데이터를 비우고, 열린 모달의 팀만 새 조건으로 다시 요청.
  const handleShowEndedChange = useCallback(
    (next: boolean) => {
      setShowEnded(next);
      setLoadedTeamIds(new Set());
      setClassesByTeam({});
      setTournamentsByTeam({});
      setSelectedItem(null);
      if (openTeamId) void loadTeamData(openTeamId, next);
    },
    [openTeamId, loadTeamData],
  );

  // 월 이동 — 모든 캐시가 월 종속이라 비우고, 열린 모달의 팀만 다시 요청.
  const changeMonth = useCallback(
    (delta: number) => {
      const next = shiftYearMonth(yearMonth, delta);
      if (next > currentYearMonth()) return;
      setYearMonth(next);
      setLoadedTeamIds(new Set());
      setClassesByTeam({});
      setTournamentsByTeam({});
      setClassPayments({});
      setTourPayments({});
      setSelectedItem(null);
    },
    [yearMonth],
  );

  // 월이 바뀌면 열린 모달의 팀 데이터를 새 월 기준으로 재로딩.
  useEffect(() => {
    if (openTeamId && !loadedTeamIds.has(openTeamId) && !loadingTeamIds.has(openTeamId)) {
      void loadTeamData(openTeamId, showEnded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearMonth]);

  const selectItem = useCallback(
    (teamId: string, kind: 'class' | 'tour', id: string) => {
      setSelectedItem({ kind, id });
      setMobilePane('detail');
      if (kind === 'class') void loadClassPayments(teamId, id);
      else void loadTournamentPayments(id);
    },
    [loadClassPayments, loadTournamentPayments],
  );

  // 모달 데이터 도착 시 첫 항목 자동 선택 — 우측 패널이 비지 않게 (모바일은 목록 유지).
  useEffect(() => {
    if (!openTeamId || selectedItem || !loadedTeamIds.has(openTeamId)) return;
    const classes = classesByTeam[openTeamId] ?? [];
    const tournaments = tournamentsByTeam[openTeamId] ?? [];
    const first = classes[0]
      ? { kind: 'class' as const, id: classes[0].id }
      : tournaments[0]
        ? { kind: 'tour' as const, id: tournaments[0].id }
        : null;
    if (!first) return;
    setSelectedItem(first);
    if (first.kind === 'class') void loadClassPayments(openTeamId, first.id);
    else void loadTournamentPayments(first.id);
  }, [
    openTeamId,
    selectedItem,
    loadedTeamIds,
    classesByTeam,
    tournamentsByTeam,
    loadClassPayments,
    loadTournamentPayments,
  ]);

  // 지연 로딩이라 안 받은 팀의 수업·대회명은 알 수 없다 — 검색은 팀명·팀코드만.
  const filteredTeams = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) =>
      (t.name?.toLowerCase().includes(q) ?? false) ||
      (t.teamCode?.toLowerCase().includes(q) ?? false),
    );
  }, [teams, searchTerm]);

  // 헤더 통계 — 팀별 결제 요약 합산 (추가 요청 0회).
  const stats = useMemo(() => {
    const list = Object.values(summaries);
    return {
      targetCount: list.reduce((s, x) => s + x.targetCount, 0),
      paidCount: list.reduce((s, x) => s + x.paidCount, 0),
      unpaidCount: list.reduce((s, x) => s + x.unpaidCount, 0),
    };
  }, [summaries]);

  // ─── 모달 파생값 ───
  const openTeam = openTeamId ? teams.find((t) => t.id === openTeamId) ?? null : null;
  const openTeamClasses = openTeamId ? classesByTeam[openTeamId] ?? [] : [];
  const openTeamTours = openTeamId ? tournamentsByTeam[openTeamId] ?? [] : [];
  const isOpenTeamLoading = openTeamId ? loadingTeamIds.has(openTeamId) : false;
  const openTeamError = openTeamId ? teamLoadError[openTeamId] : '';
  const selectedClass =
    selectedItem?.kind === 'class'
      ? openTeamClasses.find((c) => c.id === selectedItem.id) ?? null
      : null;
  const selectedTour =
    selectedItem?.kind === 'tour'
      ? openTeamTours.find((t) => t.id === selectedItem.id) ?? null
      : null;

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
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
            <Mini label="결제 대상" value={stats.targetCount} suffix="건" />
            <Mini label="결제 완료" value={stats.paidCount} suffix="건" />
            <Mini label="미납" value={stats.unpaidCount} suffix="건" />
          </div>
        </div>
      </section>

      {/* 조회 월 + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center justify-between sm:justify-start gap-1 px-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="이전 달"
            className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="min-w-[7rem] text-center text-sm font-bold text-slate-900 dark:text-white tabular-nums">
            {yearMonth.slice(0, 4)}년 {Number(yearMonth.slice(5))}월
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            disabled={yearMonth >= currentYearMonth()}
            aria-label="다음 달"
            className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-1 items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <Search className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="팀명, 팀코드로 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            aria-label="팀 검색"
          />
        </div>
      </div>

      {/* Body — 팀 카드 목록 (카드 클릭 = 결제 현황 모달) */}
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
        <div className="space-y-3">
          {filteredTeams.map((team) => {
            const teamLabel = team.teamCode ? `${team.name} (${team.teamCode})` : team.name;
            const summary = summaries[team.id];
            return (
              <div
                key={team.id}
                role="button"
                tabIndex={0}
                onClick={() => openTeamModal(team.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openTeamModal(team.id);
                  }
                }}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm px-5 py-4 cursor-pointer hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors motion-reduce:transition-none"
                aria-label={`${team.name} 결제 현황 열기`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">{teamLabel}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    수업 {summary?.classCount ?? 0}건 · 대회 {summary?.tournamentCount ?? 0}건
                  </p>
                </div>
                {/* 결제 요약 칩 — 좁은 화면에선 flex-wrap 으로 팀명 아래 줄로 내려간다. */}
                <span className="flex w-full sm:w-auto flex-wrap items-center gap-1.5 pl-[52px] sm:pl-0 shrink-0">
                  {summary && summary.targetCount > 0 ? (
                    <>
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-bold tabular-nums">
                        결제 {summary.paidCount}/{summary.targetCount}
                        {summary.unpaidCount === 0 && summary.refundedCount === 0 ? ' ✓' : ''}
                      </span>
                      {summary.unpaidCount > 0 && (
                        <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2.5 py-0.5 text-xs font-bold tabular-nums">
                          미납 {summary.unpaidCount}
                        </span>
                      )}
                      {summary.refundedCount > 0 && (
                        <span className="rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2.5 py-0.5 text-xs font-bold tabular-nums">
                          환불 {summary.refundedCount}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 px-2.5 py-0.5 text-xs font-medium">
                      결제 대상 없음
                    </span>
                  )}
                </span>
                <Link
                  href={`/dashboard/teams/${team.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-semibold text-slate-400 hover:text-primary shrink-0"
                >
                  팀 상세 →
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 결제 현황 모달 — 좌 수업/대회 목록 · 우 결제 현황 (고정 높이, 각자 스크롤) ─── */}
      <Modal
        isOpen={!!openTeam}
        onClose={closeTeamModal}
        size="full"
        className="h-[min(40rem,85vh)]"
      >
        {openTeam && (
          <>
            {/* 헤더 — 제목 + 종료 토글 + 닫기 */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="w-4 h-4" aria-hidden="true" />
              </div>
              <h2 className="flex-1 min-w-0 truncate text-base font-bold text-slate-900 dark:text-white">
                {openTeam.teamCode ? `${openTeam.name} (${openTeam.teamCode})` : openTeam.name}{' '}
                {Number(yearMonth.slice(5))}월 결제 현황
              </h2>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showEnded}
                  onChange={(e) => handleShowEndedChange(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary"
                />
                종료 항목 포함
              </label>
              <button
                type="button"
                onClick={closeTeamModal}
                aria-label="닫기"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* 본문 — md 이상 좌우 분할, 미만은 목록 ↔ 현황 2단계 전환 */}
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[264px_1fr]">
              {/* 좌: 수업/대회 목록 */}
              <div
                className={`${
                  mobilePane === 'detail' ? 'hidden md:block' : 'block'
                } overflow-y-auto min-h-0 md:border-r border-slate-200 dark:border-slate-700`}
              >
                {isOpenTeamLoading ? (
                  <div className="flex justify-center py-10">
                    <LoadingSpinner />
                  </div>
                ) : openTeamError ? (
                  <div className="flex flex-col items-start gap-2 px-4 py-5 text-sm text-red-600 dark:text-red-400">
                    <span className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" aria-hidden="true" />
                      {openTeamError}
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadTeamData(openTeam.id, showEnded)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : openTeamClasses.length + openTeamTours.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    {showEnded
                      ? '등록된 수업/대회가 없습니다'
                      : `${Number(yearMonth.slice(5))}월에 진행한 수업/대회가 없습니다`}
                  </p>
                ) : (
                  <ul>
                    {openTeamClasses.map((c) => {
                      const isSel = selectedItem?.kind === 'class' && selectedItem.id === c.id;
                      const isEnded = !classActiveForMonth(c, yearMonth);
                      const badge = trainingTypeBadge(c.trainingType);
                      return (
                        <li key={`cls-${c.id}`}>
                          <button
                            type="button"
                            onClick={() => selectItem(openTeam.id, 'class', c.id)}
                            aria-current={isSel}
                            className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-b border-slate-100 dark:border-slate-700 transition-colors motion-reduce:transition-none ${
                              isSel
                                ? 'bg-primary/10'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                          >
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                isEnded
                                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                                  : badge.cls
                              }`}
                            >
                              {isEnded ? '종료' : badge.label}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-bold text-slate-900 dark:text-white">
                                {c.className}
                              </span>
                              <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 tabular-nums">
                                등록 {c.studentCount ?? 0} / 정원 {c.capacity ?? c.maxStudents ?? '-'}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {openTeamTours.map((t) => {
                      const isSel = selectedItem?.kind === 'tour' && selectedItem.id === t.id;
                      return (
                        <li key={`tour-${t.id}`}>
                          <button
                            type="button"
                            onClick={() => selectItem(openTeam.id, 'tour', t.id)}
                            aria-current={isSel}
                            className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-b border-slate-100 dark:border-slate-700 transition-colors motion-reduce:transition-none ${
                              isSel
                                ? 'bg-primary/10'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                          >
                            <span className="shrink-0 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-bold">
                              대회
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-bold text-slate-900 dark:text-white">
                                {t.name}
                              </span>
                              <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 tabular-nums">
                                참가 {t._count?.registrations ?? 0}명
                                {t.status ? ` · ${TOUR_STATUS_LABEL[t.status] ?? t.status}` : ''}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* 우: 결제 현황 */}
              <div
                className={`${
                  mobilePane === 'list' ? 'hidden md:flex' : 'flex'
                } flex-col min-h-0`}
              >
                <button
                  type="button"
                  onClick={() => setMobilePane('list')}
                  className="md:hidden flex items-center gap-1 px-5 pt-3 text-xs font-bold text-primary"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  수업·대회 목록
                </button>
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                  {!selectedItem ? (
                    // 항목이 있으면 자동 선택되므로 이 분기는 로딩 중이거나 목록이 빈 경우 —
                    //   "선택하세요" 안내는 모순이라 좌측 패널의 상태 표시에 맡기고 비워 둔다.
                    null
                  ) : selectedItem.kind === 'class' ? (
                    loadingClassId === selectedItem.id ? (
                      <div className="flex justify-center py-10">
                        <LoadingSpinner />
                      </div>
                    ) : classPaymentError[selectedItem.id] ? (
                      <div className="flex items-center gap-2 py-4 text-sm text-red-600 dark:text-red-400">
                        <AlertCircle className="w-4 h-4" aria-hidden="true" />
                        {classPaymentError[selectedItem.id]}
                      </div>
                    ) : classPayments[selectedItem.id] ? (
                      <div className="space-y-3">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {selectedClass?.className ?? classPayments[selectedItem.id].className}
                        </p>
                        <ClassPaymentPanel data={classPayments[selectedItem.id]} />
                      </div>
                    ) : null
                  ) : loadingTourId === selectedItem.id ? (
                    <div className="flex justify-center py-10">
                      <LoadingSpinner />
                    </div>
                  ) : tourPaymentError[selectedItem.id] ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-red-600 dark:text-red-400">
                      <AlertCircle className="w-4 h-4" aria-hidden="true" />
                      {tourPaymentError[selectedItem.id]}
                    </div>
                  ) : tourPayments[selectedItem.id] ? (
                    <div className="space-y-3">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {selectedTour?.name ?? '대회'}
                      </p>
                      <TournamentPaymentPanel data={tourPayments[selectedItem.id]} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
function Mini({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl bg-white/15 px-3 py-2.5">
      <p className="text-xs text-white/70">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">
        {value.toLocaleString()}
        {suffix && <span className="ml-0.5 text-sm font-semibold text-white/80">{suffix}</span>}
      </p>
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

      {/* 선수/결제자 테이블 */}
      {students.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
          등록된 선수가 없습니다
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white dark:bg-slate-800 text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2 font-semibold">선수</th>
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
                    {s.payerName ?? <span className="text-slate-300 dark:text-slate-600">-</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    {s.productName ?? <span className="text-slate-300 dark:text-slate-600">-</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900 dark:text-white">
                    {s.amount != null ? `${Number(s.amount).toLocaleString()}원` : <span className="text-slate-300 dark:text-slate-600">-</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                    {s.paidAt ? new Date(s.paidAt).toLocaleDateString('ko-KR') : <span className="text-slate-300 dark:text-slate-600">-</span>}
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
    if (c) return `${c.lastName ?? ''}${c.firstName ?? ''}`.trim() || '-';
    const u = r.user;
    if (u) return `${u.lastName ?? ''}${u.firstName ?? ''}`.trim() || '-';
    return '-';
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
                      {r.gamesCount ?? <span className="text-slate-300 dark:text-slate-600">-</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900 dark:text-white">
                      {fee > 0 ? `${fee.toLocaleString()}원` : <span className="text-slate-300 dark:text-slate-600">-</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                      {r.registeredAt ? new Date(r.registeredAt).toLocaleDateString('ko-KR') : <span className="text-slate-300 dark:text-slate-600">-</span>}
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
