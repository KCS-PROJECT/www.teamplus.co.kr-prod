'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';
// Backend 와 완전 정합 (tournament.service.ts TournamentStatus)
type TournamentStatusKey = 'scheduled' | 'ongoing' | 'finished' | 'cancelled';

interface Tournament {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
  status: TournamentStatusKey;
  // 백엔드 응답에서 누락될 수 있음 (tournament 신규 등록 직후 집계 지연 등) → UI 사용 시 ?? 0 필수
  participantsCount?: number;
  maxParticipants?: number;
  matchesCount?: number;
  /** [추가 2026-05-11] 코치/감독이 사전 선택한 참가 선수 수 — 정원 표기에 사용 */
  selectedParticipantsCount?: number;
}


type TabType = 'all' | 'ongoing' | 'scheduled' | 'finished';

const tabs: { key: TabType; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'ongoing', label: '진행 중' },
  { key: 'scheduled', label: '예정' },
  { key: 'finished', label: '완료' },
];

interface StatusConfigItem {
  bg: string;
  text: string;
  border: string;
  dot: string;
  label: string;
}

const TOURNAMENT_STATUS_CONFIG: Record<TournamentStatusKey, StatusConfigItem> = {
  ongoing: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-600 dark:text-red-300',
    border: 'border-red-100 dark:border-red-800/50',
    dot: 'bg-red-500',
    label: 'LIVE',
  },
  scheduled: {
    bg: 'bg-ice-500/10 dark:bg-ice-500/20',
    text: 'text-ice-500 dark:text-blue-300',
    border: 'border-ice-500/20 dark:border-ice-500/30',
    dot: 'bg-ice-500',
    label: '예정',
  },
  finished: {
    bg: 'bg-wline-2 dark:bg-rink-700',
    text: 'text-wtext-2 dark:text-rink-100',
    border: 'border-wline dark:border-rink-700',
    dot: 'bg-wtext-4',
    label: '완료',
  },
  cancelled: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-100 dark:border-amber-800/50',
    dot: 'bg-amber-500',
    label: '취소',
  },
};

// 알 수 없는 status 값(백엔드 추가 enum·오타 등)에 대비한 fallback
const STATUS_FALLBACK: StatusConfigItem = {
  bg: 'bg-wline-2 dark:bg-rink-700',
  text: 'text-wtext-2 dark:text-rink-100',
  border: 'border-wline dark:border-rink-700',
  dot: 'bg-wtext-4',
  label: '미정',
};

function StatusBadge({ status }: { status: Tournament['status'] }) {
  const c = TOURNAMENT_STATUS_CONFIG[status] ?? STATUS_FALLBACK;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-w-pill ${c.bg} ${c.text} text-card-meta font-bold border ${c.border}`}
    >
      <span className={`size-1.5 rounded-w-pill ${c.dot}`} aria-hidden="true" />
      {c.label}
    </span>
  );
}

function getProgressValue(status: Tournament['status']): number {
  if (status === 'finished') return 100;
  if (status === 'scheduled') return 0;
  if (status === 'cancelled') return 0;
  return 42; // ongoing
}

function TournamentCard({
  tournament,
  onEdit,
  onDelete,
}: {
  tournament: Tournament;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const progress = getProgressValue(tournament.status);
  const isCancelled = tournament.status === 'cancelled';

  return (
    <article
      className={`group relative overflow-hidden bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700 transition-shadow motion-reduce:transition-none hover:shadow-md ${
        isCancelled ? 'opacity-90' : ''
      }`}
    >
      {/* Status Badge */}
      <div className="absolute top-4 right-4">
        <StatusBadge status={tournament.status} />
      </div>

      {/* Header */}
      <div className="flex flex-col mb-4 pr-16">
        {tournament.description && (
          <p className="text-card-meta text-wtext-3 dark:text-rink-300 font-bold tracking-widest uppercase mb-1">
            {tournament.description}
          </p>
        )}
        <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white leading-snug">
          {tournament.name}
        </h3>
        <p className="text-card-meta text-wtext-3 dark:text-rink-300 mt-1 tabular-nums">
          {tournament.startDate} ~ {tournament.endDate}
        </p>
      </div>

      {/* Location */}
      <div className="flex items-center gap-2 mb-4">
        <Icon name="location_on" className="text-wtext-3 dark:text-rink-300 text-[18px]" aria-hidden="true" />
        <span className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">
          {tournament.location}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 pt-4 border-t border-wline-2 dark:border-rink-700">
        <div className="text-center">
          {/* [수정 2026-05-11] "참가팀 N/M" → "참가인원 N/M명" 변경 (M = 사전 선정 선수 수). */}
          <p className="text-card-meta text-wtext-3 dark:text-rink-300 font-bold uppercase tracking-wider">참가인원</p>
          <p className="mt-0.5 text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
            {tournament.participantsCount ?? 0}
            {(tournament.selectedParticipantsCount ?? 0) > 0
              ? `/${tournament.selectedParticipantsCount}`
              : ''}
            명
          </p>
        </div>
        <div className="text-center border-x border-wline-2 dark:border-rink-700">
          <p className="text-card-meta text-wtext-3 dark:text-rink-300 font-bold uppercase tracking-wider">경기</p>
          <p className="mt-0.5 text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
            {tournament.matchesCount ?? 0}
          </p>
        </div>
        <div className="text-center">
          <p className="text-card-meta text-wtext-3 dark:text-rink-300 font-bold uppercase tracking-wider">진행률</p>
          <p className="mt-0.5 text-card-body font-bold text-ice-500 dark:text-blue-300 tabular-nums">
            {progress}%
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        className="mt-4"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${tournament.name} 진행률`}
      >
        <div className="w-full bg-wline-2 dark:bg-rink-700 h-1.5 rounded-w-pill overflow-hidden">
          <div
            className="bg-ice-500 h-full transition-all motion-reduce:transition-none duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-wline-2 dark:border-rink-700">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 h-11 rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 text-card-body font-semibold flex items-center justify-center gap-1.5 hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
        >
          <Icon name="edit" className="text-[18px]" aria-hidden="true" />
          수정하기
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex-1 h-11 rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 text-card-body font-semibold flex items-center justify-center gap-1.5 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <Icon name="delete_outline" className="text-[18px]" aria-hidden="true" />
          삭제하기
        </button>
        <button
          type="button"
          className="flex-1 h-11 rounded-xl bg-ice-500 hover:bg-ice-700 text-white text-card-body font-bold flex items-center justify-center gap-1.5 transition-colors motion-reduce:transition-none active:brightness-95 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-800"
        >
          <Icon name="visibility" className="text-[18px]" aria-hidden="true" />
          상세
        </button>
      </div>
    </article>
  );
}

function CreateTournamentModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const tNameId = useId();
  const tDescId = useId();
  const tStartDateId = useId();
  const tEndDateId = useId();
  const tLocationId = useId();
  const tMaxParticipantsId = useId();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-create-title"
    >
      <button
        type="button"
        aria-label="대회 등록 창 배경 영역 — 클릭 시 닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-inset"
      />
      <div className="relative w-full max-w-md bg-white dark:bg-rink-800 rounded-t-3xl p-6 pb-[calc(2.5rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))]">
        <div className="flex items-center justify-between mb-6">
          <h2
            id="tournament-create-title"
            className="text-card-title font-bold text-wtext-1 dark:text-white"
          >
            새 대회 등록
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="대회 등록 창 닫기"
            className="w-11 h-11 rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-700 flex items-center justify-center transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
          >
            <Icon name="close" className="text-wtext-3 dark:text-rink-300" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Tournament Name */}
          <div className="flex flex-col gap-2">
            <label htmlFor={tNameId} className="text-card-body font-medium text-wtext-2 dark:text-rink-100">
              대회명
            </label>
            <input
              id={tNameId}
              type="text"
              placeholder="예: 2024 스프링 아이스하키 리그"
              required
              aria-required="true"
              className="w-full h-12 px-4 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <label htmlFor={tDescId} className="text-card-body font-medium text-wtext-2 dark:text-rink-100">
              설명
            </label>
            <input
              id={tDescId}
              type="text"
              placeholder="예: 예선 A조 경기"
              className="w-full h-12 px-4 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body"
            />
          </div>

          {/* Date Range
              [hotfix 2026-05-15 T06-H] xs(≤359px) 폭에서 시작일/종료일 박스 겹침 회귀.
                · flex gap-3 + flex-1 두 input 이 좁은 폭에서 calendar 아이콘과 placeholder
                  영역이 인접 박스로 침범. 각 박스 min-w-0 + xs 폭에서 세로 스택. */}
          <div className="flex gap-3 [[data-screen-bp='xs']_&]:flex-col [[data-screen-bp='xs']_&]:gap-2">
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <label htmlFor={tStartDateId} className="text-card-body font-medium text-wtext-2 dark:text-rink-100">
                시작일
              </label>
              <div className="relative">
                <input
                  id={tStartDateId}
                  type="text"
                  placeholder="YYYY.MM.DD"
                  aria-label="대회 시작일"
                  className="w-full h-12 pl-4 pr-10 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body min-w-0 box-border"
                />
                <Icon
                  name="calendar_today"
                  className="absolute right-3 top-3 text-wtext-3 text-xl pointer-events-none"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <label htmlFor={tEndDateId} className="text-card-body font-medium text-wtext-2 dark:text-rink-100">
                종료일
              </label>
              <div className="relative">
                <input
                  id={tEndDateId}
                  type="text"
                  placeholder="YYYY.MM.DD"
                  aria-label="대회 종료일"
                  className="w-full h-12 pl-4 pr-10 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body min-w-0 box-border"
                />
                <Icon
                  name="calendar_today"
                  className="absolute right-3 top-3 text-wtext-3 text-xl pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="flex flex-col gap-2">
            <label htmlFor={tLocationId} className="text-card-body font-medium text-wtext-2 dark:text-rink-100">
              장소
            </label>
            <input
              id={tLocationId}
              type="text"
              placeholder="예: 고척 스카이돔"
              className="w-full h-12 px-4 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body"
            />
          </div>

          {/* Max Participants */}
          <div className="flex flex-col gap-2">
            <label htmlFor={tMaxParticipantsId} className="text-card-body font-medium text-wtext-2 dark:text-rink-100">
              최대 참가팀 수
            </label>
            <input
              id={tMaxParticipantsId}
              type="number"
              placeholder="24"
              min={1}
              className="w-full h-12 px-4 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 font-bold hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
          >
            취소
          </button>
          <button
            type="button"
            className="flex-[2] h-12 rounded-xl bg-ice-500 hover:bg-ice-700 text-white font-bold shadow-md transition-colors motion-reduce:transition-none active:brightness-95 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-800"
          >
            <Icon name="check" className="text-[20px]" aria-hidden="true" />
            등록하기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TournamentsPage() {
  const { toast } = useToast();
  const { modal } = useModal();
  const searchId = useId();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const loadTournaments = useCallback(async () => {
    setIsLoading(true);
    try {
      // [수정 2026-05-11] 백엔드 응답 shape → 화면 Tournament 타입 매핑.
      //  · _count.registrations → participantsCount (현재 신청 수)
      //  · _count.matches → matchesCount
      //  · selectedParticipantIds.length → selectedParticipantsCount (정원)
      type BackendTournament = {
        id: string;
        name?: string;
        description?: string;
        startDate?: string;
        endDate?: string;
        status?: string;
        maxParticipants?: number | null;
        selectedParticipantIds?: string[] | null;
        team?: { name?: string } | null;
        rink?: { location?: string | null; name?: string | null } | null;
        _count?: { registrations?: number; matches?: number };
      };
      const res = await api.get<BackendTournament[]>('/tournaments');
      const list = Array.isArray(res.data) ? res.data : [];
      setTournaments(
        list.map((t) => ({
          id: t.id,
          name: t.name ?? '',
          description: t.description ?? '',
          startDate: t.startDate ?? '',
          endDate: t.endDate ?? '',
          location:
            t.rink?.location ?? t.rink?.name ?? t.team?.name ?? '장소 미정',
          status: (t.status as TournamentStatusKey) ?? 'scheduled',
          participantsCount: t._count?.registrations ?? 0,
          maxParticipants: t.maxParticipants ?? undefined,
          matchesCount: t._count?.matches ?? 0,
          selectedParticipantsCount: Array.isArray(t.selectedParticipantIds)
            ? t.selectedParticipantIds.length
            : 0,
        })),
      );
    } catch {
      setTournaments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);

  const filteredTournaments = tournaments.filter((t) => {
    const matchesTab =
      activeTab === 'all' ||
      t.status === activeTab ||
      (activeTab === 'ongoing' && t.status === 'ongoing');
    const matchesSearch =
      searchQuery === '' ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const ongoingCount = tournaments.filter((t) => t.status === 'ongoing').length;

  const handleEdit = (id: string): void => {
    const tournament = tournaments.find((t) => t.id === id);
    if (tournament) {
      setEditingTournament({ ...tournament });
    }
  };

  const handleEditSave = async () => {
    if (!editingTournament) return;
    try {
      const response = await api.patch(`/tournaments/${editingTournament.id}`, {
        name: editingTournament.name,
        description: editingTournament.description,
        startDate: editingTournament.startDate,
        endDate: editingTournament.endDate,
        location: editingTournament.location,
        maxParticipants: editingTournament.maxParticipants,
        status: editingTournament.status,
      });
      if (response.success) {
        setTournaments((prev) =>
          prev.map((t) => (t.id === editingTournament.id ? editingTournament : t))
        );
        toast.success(MESSAGES.tournament.updated);
        setEditingTournament(null);
      } else {
        toast.error(response.error?.message ?? MESSAGES.save.error);
      }
    } catch {
      toast.error(MESSAGES.save.error);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await modal.confirm({
      title: '대회 삭제',
      message: MESSAGES.tournament.deleteConfirm,
      confirmText: '삭제하기',
      cancelText: '취소',
      variant: 'danger',
    });
    if (confirmed) {
      try {
        const response = await api.delete(`/tournaments/${id}`);
        if (response.success) {
          setTournaments((prev) => prev.filter((t) => t.id !== id));
          toast.success(MESSAGES.tournament.deleted);
        } else {
          toast.error(response.error?.message ?? MESSAGES.save.error);
        }
      } catch {
        toast.error(MESSAGES.save.error);
      }
    }
  };

  return (
    <MobileContainer hasBottomNav>
      {/* AppBar */}
      <PageAppBar title="대회 관리" className="z-40" />

      {/* Search Bar */}
      <div className="sticky top-14 z-30 bg-wbg dark:bg-rink-900 px-5 py-4 border-b border-wline dark:border-rink-700">
        <div className="relative">
          <Icon
            name="search"
            className="absolute left-4 top-3 text-wtext-3 text-xl"
          />
          <label htmlFor={searchId} className="sr-only">대회 검색</label>
          <input
            id={searchId}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="대회명, 장소 검색..."
            aria-label="대회명 또는 장소 검색"
            className="w-full h-12 pl-12 pr-4 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-white dark:bg-rink-800 text-card-body"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-[124px] z-30 bg-wbg dark:bg-rink-900 px-5 py-3 border-b border-wline dark:border-rink-700">
        <div
          className="flex p-1 bg-wline/70 dark:bg-rink-700 rounded-xl"
          role="tablist"
          aria-label="대회 상태 필터"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 min-h-[44px] px-3 rounded-lg text-card-body transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 ${
                  isActive
                    ? 'bg-white dark:bg-rink-800 text-ice-500 dark:text-blue-300 shadow-sm font-bold'
                    : 'text-wtext-3 dark:text-rink-300 font-semibold hover:text-wtext-2 dark:hover:text-rink-100'
                }`}
              >
                {tab.label}
                {tab.key === 'ongoing' && ongoingCount > 0 && (
                  <span
                    className={`ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-w-pill text-card-meta font-bold tabular-nums ${
                      isActive
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {ongoingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-5 py-5">
        {/* Stats Summary */}
        <dl className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline-2 dark:border-rink-700 text-center">
            <dt className="text-card-meta text-wtext-3 dark:text-rink-300 font-bold uppercase tracking-wider">
              전체 대회
            </dt>
            <dd className="mt-1 text-2xl font-black text-wtext-1 dark:text-white tabular-nums">
              {tournaments.length}
            </dd>
          </div>
          <div className="bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline-2 dark:border-rink-700 text-center">
            <dt className="text-card-meta text-wtext-3 dark:text-rink-300 font-bold uppercase tracking-wider">
              진행 중
            </dt>
            <dd className="mt-1 text-2xl font-black text-red-500 dark:text-red-400 tabular-nums">
              {ongoingCount}
            </dd>
          </div>
          <div className="bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline-2 dark:border-rink-700 text-center">
            <dt className="text-card-meta text-wtext-3 dark:text-rink-300 font-bold uppercase tracking-wider">
              총 경기
            </dt>
            <dd className="mt-1 text-2xl font-black text-ice-500 dark:text-blue-300 tabular-nums">
              {tournaments.reduce((sum, t) => sum + (t.matchesCount ?? 0), 0)}
            </dd>
          </div>
        </dl>

        {/* Tournament List */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
            대회 목록
          </h2>
          <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
            총 {filteredTournaments.length}개
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {filteredTournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              onEdit={() => handleEdit(tournament.id)}
              onDelete={() => handleDelete(tournament.id)}
            />
          ))}

          {isLoading && (
            <div className="flex items-center justify-center py-16 text-wtext-3 dark:text-rink-300">
              <span className="text-card-body font-semibold">{MESSAGES.common.loading}</span>
            </div>
          )}
          {!isLoading && filteredTournaments.length === 0 && (
            <div className="rounded-2xl border border-dashed border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-10 text-center">
              <Icon
                name="emoji_events"
                className="text-[40px] text-wtext-3 dark:text-rink-300"
                aria-hidden="true"
              />
              <p className="mt-3 text-card-body font-bold text-wtext-2 dark:text-rink-100">
                등록된 대회가 없습니다
              </p>
              <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300">
                아래 버튼을 눌러 새 대회를 등록해보세요.
              </p>
            </div>
          )}

          {/* 새 대회 등록 버튼 — body 내부(스크롤 가능 영역)에 배치 */}
          <div className="mt-5 px-1 pb-6">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full h-14 rounded-2xl bg-ice-500 hover:bg-ice-700 text-white font-bold shadow-md transition-colors motion-reduce:transition-none active:brightness-95 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
            >
              <Icon name="add" className="text-[22px]" aria-hidden="true" />
              새 대회 등록하기
            </button>
          </div>
        </div>
      </main>

      {/* Create Modal */}
      <CreateTournamentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

    </MobileContainer>
  );
}
