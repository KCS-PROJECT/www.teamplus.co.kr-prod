'use client';

/**
 * 대회/경기 관리 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 대회 목록, 상태 필터, 등록/수정/삭제, 참가자 명단
 * 2. 휴먼 디자인: 탭 기반 리스트, 상태 배지
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. 명령어 필수: frontend-design 페르소나 적용
 * 6. 결과 출력: 7원칙 적용 완료
 * 7. Tone & Manner: 한글 존댓말, 액션 동사
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader, StatsGrid } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AdminTabs, FilterTabs } from '@/components/ui/admin-tabs';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import {
  useTournaments,
  useCreateTournament,
  useUpdateTournament,
  useDeleteTournament,
  useTournamentRegistrations,
  useConfirmTournamentSettlement,
} from '@/hooks/useTournaments';
import type {
  Tournament,
  TournamentStatus,
  TournamentFeeType,
  TournamentBillingMode,
  CreateTournamentRequest,
} from '@/services/tournament.service';
import { MESSAGES } from '@/lib/messages';
import {
  Trophy, Search, Plus, Calendar, MapPin, Users,
  Medal, Edit2, Trash2, Clock, ListChecks, AlertCircle, Wallet,
} from 'lucide-react';

interface TournamentFormState {
  name: string;
  description: string;
  clubId: string;
  startDate: string;
  endDate: string;
  status: TournamentStatus;
  billingMode: TournamentBillingMode;
  eligibleBirthYearFrom: string;
  eligibleBirthYearTo: string;
  feePerGame: string;
  totalGames: string;
  feeType: TournamentFeeType;
  maxParticipants: string;
  registrationDeadline: string;
}

const emptyForm: TournamentFormState = {
  name: '',
  description: '',
  clubId: '',
  startDate: '',
  endDate: '',
  status: 'scheduled',
  billingMode: 'PREPAID',
  eligibleBirthYearFrom: '',
  eligibleBirthYearTo: '',
  feePerGame: '',
  totalGames: '',
  feeType: 'PER_GAME',
  maxParticipants: '',
  registrationDeadline: '',
};

const statusLabels: Record<TournamentStatus, string> = {
  scheduled: '예정',
  ongoing: '진행중',
  finished: '종료',
  cancelled: '취소',
};

const statusColors: Record<TournamentStatus, string> = {
  scheduled: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  ongoing: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  finished: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  cancelled: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatDateForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

function TournamentsPageContent() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [selectedStatus, setSelectedStatus] = useState('전체');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRegistrationsModal, setShowRegistrationsModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementFee, setSettlementFee] = useState('');
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [form, setForm] = useState<TournamentFormState>(emptyForm);

  // TanStack Query hooks
  const { data: tournamentsData, isLoading, isError, error } = useTournaments();
  const tournaments = tournamentsData ?? [];

  const createMutation = useCreateTournament();
  const updateMutation = useUpdateTournament();
  const deleteMutation = useDeleteTournament();
  const settlementMutation = useConfirmTournamentSettlement();

  const isSaving =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  // 참가자 명단 조회 — 참가자 모달 또는 정산 모달 열렸을 때 fetch
  const { data: registrationsData, isLoading: isLoadingRegistrations } =
    useTournamentRegistrations(
      selectedTournament?.id ?? '',
      showRegistrationsModal || showSettlementModal,
    );
  const registrations = registrationsData ?? [];

  // 후불 정산 대상 — 미결제(UNPAID/PENDING)만, 그 외(PAID·CANCELLED·빈값 등) 제외.
  // 백엔드 confirmTournamentSettlement 청구 대상(paymentStatus IN ['UNPAID','PENDING'])과 정확히 일치.
  const settlementTargets = registrations.filter((reg) => {
    const ps = (reg.paymentStatus ?? '').toUpperCase();
    return ps === 'UNPAID' || ps === 'PENDING';
  });
  const settlementFeeNum = Number(settlementFee) || 0;
  const settlementTotal = settlementFeeNum * settlementTargets.length;

  const stats = {
    total: tournaments.length,
    scheduled: tournaments.filter((t) => t.status === 'scheduled').length,
    ongoing: tournaments.filter((t) => t.status === 'ongoing').length,
    totalRegistrations: tournaments.reduce(
      (sum, t) => sum + (t._count?.registrations || 0),
      0,
    ),
  };

  const statusFilters = ['전체', '예정', '진행중', '종료', '취소'];

  const filteredTournaments = tournaments.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      selectedStatus === '전체' || statusLabels[t.status] === selectedStatus;

    const matchesTab =
      activeTab === 'active'
        ? t.status !== 'finished' && t.status !== 'cancelled'
        : t.status === 'finished' || t.status === 'cancelled';

    return matchesSearch && matchesStatus && matchesTab;
  });

  // 2026-05-08: 팀별 그룹화 — 어느 팀에서 만든 대회인지 명확히 표시.
  // 백엔드 응답: team.name (relation) 우선, legacy club.* / teamName fallback.
  const tournamentsByTeam: Record<string, typeof filteredTournaments> = {};
  for (const t of filteredTournaments) {
    const teamLabel =
      ((t as { team?: { name?: string } | null }).team?.name) ||
      ((t as { club?: { clubName?: string; name?: string } | null }).club?.clubName) ||
      ((t as { club?: { clubName?: string; name?: string } | null }).club?.name) ||
      ((t as { teamName?: string | null }).teamName) ||
      '팀 미지정';
    if (!tournamentsByTeam[teamLabel]) tournamentsByTeam[teamLabel] = [];
    tournamentsByTeam[teamLabel].push(t);
  }
  // "팀 미지정" 그룹은 마지막에
  const teamGroupKeys = Object.keys(tournamentsByTeam).sort((a, b) => {
    if (a === '팀 미지정') return 1;
    if (b === '팀 미지정') return -1;
    return a.localeCompare(b, 'ko-KR');
  });

  const openCreateModal = () => {
    setForm(emptyForm);
    setShowCreateModal(true);
  };

  const openEditModal = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setForm({
      name: tournament.name,
      description: tournament.description || '',
      clubId: tournament.clubId || '',
      startDate: formatDateForInput(tournament.startDate),
      endDate: formatDateForInput(tournament.endDate),
      status: tournament.status,
      billingMode: tournament.billingMode ?? 'PREPAID',
      eligibleBirthYearFrom: tournament.eligibleBirthYearFrom?.toString() || '',
      eligibleBirthYearTo: tournament.eligibleBirthYearTo?.toString() || '',
      feePerGame: tournament.feePerGame?.toString() || '',
      totalGames: tournament.totalGames?.toString() || '',
      feeType: (tournament.feeType as TournamentFeeType) || 'PER_GAME',
      maxParticipants: tournament.maxParticipants?.toString() || '',
      registrationDeadline: formatDateForInput(tournament.registrationDeadline),
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setShowDeleteModal(true);
  };

  const openRegistrationsModal = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setShowRegistrationsModal(true);
  };

  const openSettlementModal = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setSettlementFee('');
    setShowSettlementModal(true);
  };

  const buildPayload = (): CreateTournamentRequest => {
    const isPostpaid = form.billingMode === 'POSTPAID';
    const payload: CreateTournamentRequest = {
      name: form.name,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      status: form.status,
      billingMode: form.billingMode,
      // 후불은 종료 후 정산에서 금액을 입력하므로 생성/수정 시 TOTAL_FIXED 고정.
      feeType: isPostpaid ? 'TOTAL_FIXED' : form.feeType,
    };
    if (form.description) payload.description = form.description;
    if (form.clubId) payload.clubId = form.clubId;
    if (form.eligibleBirthYearFrom)
      payload.eligibleBirthYearFrom = parseInt(form.eligibleBirthYearFrom, 10);
    if (form.eligibleBirthYearTo)
      payload.eligibleBirthYearTo = parseInt(form.eligibleBirthYearTo, 10);
    // 선불일 때만 금액/경기수 전송. 후불은 종료 후 일괄 청구에서 결정.
    if (!isPostpaid) {
      if (form.feePerGame) payload.feePerGame = parseFloat(form.feePerGame);
      if (form.totalGames) payload.totalGames = parseInt(form.totalGames, 10);
    }
    if (form.maxParticipants)
      payload.maxParticipants = parseInt(form.maxParticipants, 10);
    if (form.registrationDeadline)
      payload.registrationDeadline = new Date(form.registrationDeadline).toISOString();
    return payload;
  };

  const handleCreate = async () => {
    if (!form.name || !form.startDate || !form.endDate) {
      alert('대회명, 시작일, 종료일은 필수 항목입니다.');
      return;
    }
    try {
      await createMutation.mutateAsync(buildPayload());
      setShowCreateModal(false);
      setForm(emptyForm);
    } catch (err) {
      alert(err instanceof Error ? err.message : '대회 등록에 실패했습니다.');
    }
  };

  const handleUpdate = async () => {
    if (!selectedTournament || !form.name || !form.startDate || !form.endDate) {
      alert('대회명, 시작일, 종료일은 필수 항목입니다.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: selectedTournament.id,
        data: buildPayload(),
      });
      setShowEditModal(false);
      setSelectedTournament(null);
      setForm(emptyForm);
    } catch (err) {
      alert(err instanceof Error ? err.message : '대회 수정에 실패했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!selectedTournament) return;
    try {
      await deleteMutation.mutateAsync(selectedTournament.id);
      setShowDeleteModal(false);
      setSelectedTournament(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '대회 삭제에 실패했습니다.');
    }
  };

  const handleConfirmSettlement = async () => {
    if (!selectedTournament) return;
    if (settlementFeeNum < 1) {
      alert(MESSAGES.tournamentSettlement.feeRequired);
      return;
    }
    if (selectedTournament.status !== 'finished') {
      alert(MESSAGES.tournamentSettlement.notFinished);
      return;
    }
    if (settlementTargets.length === 0) {
      alert(MESSAGES.tournamentSettlement.noTarget);
      return;
    }
    if (
      !window.confirm(
        MESSAGES.tournamentSettlement.confirm(
          settlementTargets.length,
          settlementTotal,
        ),
      )
    ) {
      return;
    }
    try {
      const result = await settlementMutation.mutateAsync({
        tournamentId: selectedTournament.id,
        feePerPerson: settlementFeeNum,
      });
      alert(
        MESSAGES.tournamentSettlement.success(
          result.billedCount,
          result.totalAmount,
        ),
      );
      setShowSettlementModal(false);
      setSettlementFee('');
      setSelectedTournament(null);
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : MESSAGES.tournamentSettlement.error,
      );
    }
  };

  const updateForm = (field: keyof TournamentFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return <LoadingSpinner message="대회 정보를 불러오는 중..." />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-base font-medium text-slate-700 dark:text-slate-300">
          {error instanceof Error ? error.message : '대회 목록을 불러오지 못했습니다.'}
        </p>
      </div>
    );
  }

  // 참가 자격 출생연도 라벨 — 개별 집합(eligibleBirthYears) 우선, 비어있으면 범위(from/to) 폴백.
  const getAgeGroupLabel = (tournament: Tournament) => {
    const years = tournament.eligibleBirthYears;
    if (years && years.length > 0) {
      return MESSAGES.tournament.eligibleYearsLabel(years);
    }
    const from = tournament.eligibleBirthYearFrom;
    const to = tournament.eligibleBirthYearTo;
    if (!from && !to) return null;
    if (from && to) return MESSAGES.tournament.eligibleRangeLabel(from, to);
    if (from) return MESSAGES.tournament.eligibleFromLabel(from);
    return MESSAGES.tournament.eligibleToLabel(to as number);
  };

  const renderFormFields = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          대회명 <span className="text-red-500">*</span>
        </label>
        <Input
          value={form.name}
          onChange={(e) => updateForm('name', e.target.value)}
          placeholder="대회명을 입력하세요"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          설명
        </label>
        <Textarea
          value={form.description}
          onChange={(e) => updateForm('description', e.target.value)}
          placeholder="대회 설명을 입력하세요"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            시작일 <span className="text-red-500">*</span>
          </label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => updateForm('startDate', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            종료일 <span className="text-red-500">*</span>
          </label>
          <Input
            type="date"
            value={form.endDate}
            onChange={(e) => updateForm('endDate', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">상태</label>
          <select
            value={form.status}
            onChange={(e) => updateForm('status', e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          >
            <option value="scheduled">예정</option>
            <option value="ongoing">진행중</option>
            <option value="finished">종료</option>
            <option value="cancelled">취소</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">결제 방식</label>
          <div className="grid grid-cols-2 gap-2">
            {(['PREPAID', 'POSTPAID'] as const).map((mode) => {
              const active = form.billingMode === mode;
              const label = mode === 'PREPAID' ? '선불' : '후불';
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateForm('billingMode', mode)}
                  aria-pressed={active}
                  className={
                    active
                      ? 'h-10 rounded-md bg-primary text-white text-sm font-semibold'
                      : 'h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-700'
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {form.billingMode === 'POSTPAID' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
          <Wallet className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            후불 대회는 참가 신청 시 결제하지 않고, 대회 종료 후 1인당 참가비를 입력해 참가자에게 일괄 청구합니다.
          </p>
        </div>
      )}

      {form.billingMode === 'PREPAID' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">참가비 유형</label>
          <select
            value={form.feeType}
            onChange={(e) => updateForm('feeType', e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
          >
            <option value="PER_GAME">경기당</option>
            <option value="TOTAL_FIXED">정액제</option>
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">참가 자격 (출생연도 시작)</label>
          <Input
            type="number"
            value={form.eligibleBirthYearFrom}
            onChange={(e) => updateForm('eligibleBirthYearFrom', e.target.value)}
            placeholder="예: 2014"
            min={1990}
            max={2030}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">참가 자격 (출생연도 종료)</label>
          <Input
            type="number"
            value={form.eligibleBirthYearTo}
            onChange={(e) => updateForm('eligibleBirthYearTo', e.target.value)}
            placeholder="예: 2016"
            min={1990}
            max={2030}
          />
        </div>
      </div>

      <div className={form.billingMode === 'PREPAID' ? 'grid grid-cols-3 gap-4' : 'grid grid-cols-1 gap-4'}>
        {form.billingMode === 'PREPAID' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">참가비 (원)</label>
              <Input
                type="number"
                value={form.feePerGame}
                onChange={(e) => updateForm('feePerGame', e.target.value)}
                placeholder="30000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">총 경기 수</label>
              <Input
                type="number"
                value={form.totalGames}
                onChange={(e) => updateForm('totalGames', e.target.value)}
                placeholder="3"
              />
            </div>
          </>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">최대 참가 인원</label>
          <Input
            type="number"
            value={form.maxParticipants}
            onChange={(e) => updateForm('maxParticipants', e.target.value)}
            placeholder="50"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">등록 마감일</label>
        <Input
          type="date"
          value={form.registrationDeadline}
          onChange={(e) => updateForm('registrationDeadline', e.target.value)}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header — 수업관리 페이지 스타일 (2026-05-08) */}
      <section
        className="relative overflow-hidden rounded-2xl bg-primary text-white shadow-md"
        aria-label="대회 관리 헤더"
      >
        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                대회/경기 관리
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">대회/경기 관리</h1>
              <p className="text-sm sm:text-base text-white/80">팀별로 등록된 대회를 한눈에 확인합니다</p>
            </div>
            <Button
              onClick={openCreateModal}
              className="h-11 inline-flex items-center gap-2 px-4 rounded-lg bg-white hover:bg-slate-100 text-primary text-sm font-semibold shadow-sm motion-reduce:transition-none transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              대회 등록
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-xl bg-white/15 px-3 py-2.5">
              <p className="text-xs text-white/70">전체 대회</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{stats.total}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2.5">
              <p className="text-xs text-white/70">예정</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{stats.scheduled}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2.5">
              <p className="text-xs text-white/70">진행중</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{stats.ongoing}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2.5">
              <p className="text-xs text-white/70">참가자</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{stats.totalRegistrations}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {(['active', 'completed'] as const).map((id) => {
          const active = activeTab === id;
          const label = id === 'active' ? '진행중/예정' : '종료/취소';
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={
                active
                  ? 'inline-flex h-9 items-center px-3 rounded-md bg-primary text-white text-sm font-semibold'
                  : 'inline-flex h-9 items-center px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-50 dark:hover:bg-slate-700'
              }
              aria-pressed={active}
            >
              {label}
            </button>
          );
        })}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {statusFilters.map((s) => {
            const active = selectedStatus === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedStatus(s)}
                className={
                  active
                    ? 'inline-flex h-9 items-center px-3 rounded-md bg-slate-900 text-white text-xs font-semibold dark:bg-white dark:text-slate-900'
                    : 'inline-flex h-9 items-center px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-50 dark:hover:bg-slate-700'
                }
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <Search className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          placeholder="대회명, 설명으로 검색"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          aria-label="대회 검색"
        />
      </div>

      {/* Tournament List — 팀별 카드 (수업관리 스타일) */}
      <div className="space-y-5">
        {teamGroupKeys.map((teamName) => (
          <section
            key={teamName}
            className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
            aria-label={`${teamName} 팀 대회 목록`}
          >
            <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Trophy className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">{teamName}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    대회 {tournamentsByTeam[teamName].length}건
                  </p>
                </div>
              </div>
            </header>
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {tournamentsByTeam[teamName].map((tournament) => (
          <li key={tournament.id}><div
            className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Trophy className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{tournament.name}</p>
                <Badge className={`shrink-0 ${statusColors[tournament.status]}`}>
                  {statusLabels[tournament.status]}
                </Badge>
                {tournament.billingMode === 'POSTPAID' && (
                  <Badge className="shrink-0 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                    후불
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" aria-hidden="true" />
                  <span className="tabular-nums">{formatDate(tournament.startDate)} ~ {formatDate(tournament.endDate)}</span>
                </span>
                <span>·</span>
                <span>{getAgeGroupLabel(tournament) || MESSAGES.tournament.eligibleNone}</span>
                <span>·</span>
                {tournament.billingMode === 'POSTPAID' ? (
                  <span>종료 후 후불 정산</span>
                ) : (
                  <span className="tabular-nums">
                    {tournament.feePerGame ? `${Number(tournament.feePerGame).toLocaleString()}원` : '무료'}
                    {tournament.totalGames ? ` · ${tournament.totalGames}경기` : ''}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => openRegistrationsModal(tournament)}
                className="flex flex-col items-center min-w-[56px] rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                aria-label={`참가자 ${tournament._count?.registrations || 0}명 명단`}
              >
                <span className="text-[10px] text-slate-500 dark:text-slate-400">참가자</span>
                <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                  {tournament._count?.registrations || 0}
                </span>
              </button>
              {tournament.billingMode === 'POSTPAID' && tournament.status === 'finished' && (
                <button
                  type="button"
                  onClick={() => openSettlementModal(tournament)}
                  aria-label="후불 정산하기"
                  className="h-9 inline-flex items-center gap-1 px-3 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors motion-reduce:transition-none"
                >
                  <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                  정산하기
                </button>
              )}
              <button
                type="button"
                onClick={() => openEditModal(tournament)}
                aria-label="수정"
                className="h-9 w-9 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-600"
              >
                <Edit2 className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => openDeleteModal(tournament)}
                aria-label="삭제"
                className="h-9 w-9 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div></li>
              ))}
            </ul>
          </section>
        ))}

        {filteredTournaments.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              등록된 대회가 없습니다
            </p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} size="lg">
        <ModalHeader title="대회 등록" description="새로운 대회를 등록합니다" icon={Trophy} />
        <ModalBody>
          {renderFormFields()}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} disabled={isSaving}>
            취소
          </Button>
          <Button type="button" onClick={handleCreate} disabled={isSaving} className="bg-primary hover:bg-primary-dark text-white">
            {createMutation.isPending ? '등록 중...' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} size="lg">
        <ModalHeader title="대회 수정" description="대회 정보를 수정합니다" icon={Edit2} />
        <ModalBody>
          {renderFormFields()}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setShowEditModal(false)} disabled={isSaving}>
            취소
          </Button>
          <Button type="button" onClick={handleUpdate} disabled={isSaving} className="bg-primary hover:bg-primary-dark text-white">
            {updateMutation.isPending ? '수정 중...' : '수정하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="대회 삭제"
        description={`"${selectedTournament?.name}" 대회를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="삭제하기"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />

      {/* Registrations Modal */}
      <Modal
        isOpen={showRegistrationsModal}
        onClose={() => setShowRegistrationsModal(false)}
        size="lg"
      >
        <ModalHeader
          title="참가자 명단"
          description={selectedTournament?.name ?? ''}
          icon={ListChecks}
        />
        <ModalBody>
          {isLoadingRegistrations ? (
            <div className="py-12 flex items-center justify-center">
              <LoadingSpinner message="참가자 정보를 불러오는 중..." />
            </div>
          ) : registrations.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">
                아직 등록된 참가자가 없습니다
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3 text-sm text-slate-600 dark:text-slate-400">
                <span>총 {registrations.length}명</span>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr className="text-left">
                      <th className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                        이름
                      </th>
                      <th className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                        출생연도
                      </th>
                      <th className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                        소속 클럽
                      </th>
                      <th className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300 text-right">
                        참가비
                      </th>
                      <th className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                        결제 상태
                      </th>
                      <th className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300">
                        등록일
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {registrations.map((reg) => (
                      <tr
                        key={reg.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-2.5 text-slate-900 dark:text-white font-medium">
                          {reg.member?.name ?? '-'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                          {reg.member?.birthYear ?? '-'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                          {reg.member?.club?.clubName ?? '-'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-900 dark:text-white text-right tabular-nums font-semibold">
                          {reg.totalFee
                            ? `${Number(reg.totalFee).toLocaleString()}원`
                            : '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge
                            className={
                              reg.paymentStatus === 'PAID'
                                ? statusColors.ongoing
                                : reg.paymentStatus === 'PENDING'
                                  ? statusColors.scheduled
                                  : statusColors.finished
                            }
                          >
                            {reg.paymentStatus === 'PAID'
                              ? '결제 완료'
                              : reg.paymentStatus === 'PENDING'
                                ? '결제 대기'
                                : reg.paymentStatus ?? '-'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                          {formatDate(reg.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowRegistrationsModal(false)}
          >
            닫기
          </Button>
        </ModalFooter>
      </Modal>

      {/* Settlement Modal — 후불 대회 정산 (POSTPAID && finished) */}
      <Modal
        isOpen={showSettlementModal}
        onClose={() => setShowSettlementModal(false)}
        size="md"
      >
        <ModalHeader
          title="후불 대회 정산"
          description={selectedTournament?.name ?? ''}
          icon={Wallet}
        />
        <ModalBody>
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                미결제 참가자 전원에게 입력한 1인당 참가비를 일괄 청구합니다. 이미 결제 완료된 참가자는 청구 대상에서 제외됩니다.
              </p>
            </div>

            <div>
              <label
                htmlFor="settlement-fee"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                1인당 참가비 (원) <span className="text-red-500">*</span>
              </label>
              <Input
                id="settlement-fee"
                type="number"
                inputMode="numeric"
                min={1}
                value={settlementFee}
                onChange={(e) => setSettlementFee(e.target.value)}
                placeholder="30000"
              />
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-2">
              {isLoadingRegistrations ? (
                <div className="py-2 flex items-center justify-center">
                  <LoadingSpinner message="참가자 정보를 불러오는 중..." />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">청구 대상 참가자</span>
                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                      {settlementTargets.length}명
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">1인당 참가비</span>
                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                      {settlementFeeNum > 0 ? `${settlementFeeNum.toLocaleString()}원` : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-base">
                    <span className="font-medium text-slate-700 dark:text-slate-200">총 청구액</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                      {settlementTotal > 0 ? `${settlementTotal.toLocaleString()}원` : '-'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowSettlementModal(false)}
            disabled={settlementMutation.isPending}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleConfirmSettlement}
            disabled={
              settlementMutation.isPending ||
              isLoadingRegistrations ||
              settlementFeeNum < 1 ||
              settlementTargets.length === 0
            }
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {settlementMutation.isPending ? '정산 중...' : '정산하기'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ==================== Page ====================
// [2026-06-07 D-2] 페이지별 QueryClient 제거 → 루트 레이아웃 글로벌 QueryProvider 사용(캐시 공유)

export default function TournamentsPage() {
  return <TournamentsPageContent />;
}
