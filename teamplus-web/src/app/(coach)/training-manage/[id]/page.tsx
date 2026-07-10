'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import {
  useTrainingDetail,
  TRAINING_TYPE_LABELS,
  TRAINING_TYPE_ICONS,
  deleteTraining,
  addTrainingSchedules,
  cancelTrainingSchedule,
  type TrainingSchedule,
  type TrainingType,
} from '@/hooks/useTraining';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { formatClassScheduleDisplay } from '@/lib/class-categories';
import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';

// [Lifecycle v4.1] 판매 승인 확인 플로우 — 월 패키지 항목 (감독용 전체 목록 응답).
interface MonthlyPkg {
  id: string;
  productName: string;
  description?: string | null;
  price: number;
  feeType?: string;
  isActive?: boolean;
  billingMonth?: string | null;
  /** 복제 생성 시 동일 내용 패스스루 (§9.2 — 파생식 왜곡 방지) */
  durationDays?: number | null;
  sessionsPerMonth?: number | null;
  sessionsPerWeek?: number | null;
}

// ─── Helpers ───────────────────────────────────────
function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function formatWeekday(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return WEEKDAYS[d.getDay()] ?? '';
}

// ─── Schedule Card ─────────────────────────────────
function ScheduleCard({
  schedule,
  trainingId,
  onCancel,
}: {
  schedule: TrainingSchedule;
  trainingId: string;
  onCancel: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const isPast = new Date(schedule.scheduledDate) < new Date();
  const attendanceCount = schedule._count?.attendances ?? 0;
  const rsvpCount = schedule._count?.rsvps ?? 0;

  const handleCancel = async () => {
    if (!confirm(MESSAGES.class.cancelConfirm)) return;
    setCancelling(true);
    try {
      const reason = prompt(MESSAGES.training.cancelReason);
      await cancelTrainingSchedule(trainingId, schedule.id, reason ?? undefined);
      onCancel();
    } catch {
      // 무시
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      className={cn(
        'px-4 sm:px-5 py-4 border-b border-it-line dark:border-rink-700 transition-colors motion-reduce:transition-none',
        schedule.isCancelled
          ? 'bg-it-red-50/40 dark:bg-it-red-700/10'
          : isPast
            ? 'opacity-70'
            : '',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'w-12 h-12 rounded-w-md flex flex-col items-center justify-center shrink-0',
              schedule.isCancelled
                ? 'bg-it-red-100 dark:bg-it-red-700/30 text-it-red-500 dark:text-it-red-300'
                : isPast
                  ? 'bg-it-fill dark:bg-rink-700 text-it-ink-500 dark:text-rink-300'
                  : 'bg-it-blue-50 dark:bg-it-blue-500/10 text-it-blue-500',
            )}
          >
            <span className="text-card-meta font-semibold leading-none">
              {formatWeekday(schedule.scheduledDate)}
            </span>
            <span className="text-card-emphasis font-bold leading-none mt-0.5">
              {new Date(schedule.scheduledDate).getDate()}
            </span>
          </div>

          <div className="min-w-0">
            <p className="text-card-body font-semibold text-it-ink-800 dark:text-white truncate">
              {formatDate(schedule.scheduledDate)}
              {schedule.startTime && (
                <span className="font-normal text-it-ink-500 dark:text-rink-300">
                  {' '}· {schedule.startTime}
                  {schedule.endTime ? ` ~ ${schedule.endTime}` : ''}
                </span>
              )}
            </p>
            <div className="flex gap-3 mt-1 text-card-meta text-it-ink-500 dark:text-rink-300">
              <span className="inline-flex items-center gap-1">
                <Icon name="how_to_reg" className="text-card-body" aria-hidden="true" />
                출석 <span className="font-semibold text-it-ink-800 dark:text-rink-100">{attendanceCount}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon name="thumb_up" className="text-card-body" aria-hidden="true" />
                RSVP <span className="font-semibold text-it-ink-800 dark:text-rink-100">{rsvpCount}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {schedule.isCancelled ? (
            <span className="inline-flex items-center h-7 px-2.5 text-card-meta text-it-red-500 dark:text-it-red-300 font-semibold bg-it-red-50 dark:bg-it-red-700/20 border border-it-red-200 dark:border-it-red-700 rounded-lg">
              취소됨
            </span>
          ) : !isPast ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              aria-label={`${formatDate(schedule.scheduledDate)} 일정 취소`}
              className="inline-flex items-center justify-center h-8 px-3 text-card-meta font-medium text-it-ink-500 dark:text-rink-300 hover:text-it-red-500 hover:bg-it-red-50 dark:hover:bg-it-red-700/20 rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50"
            >
              {cancelling ? '...' : '취소'}
            </button>
          ) : null}
        </div>
      </div>

      {schedule.cancellationReason && (
        <p className="mt-3 text-card-meta text-it-red-500 dark:text-it-red-300 bg-it-red-50 dark:bg-it-red-700/20 border border-it-red-100 dark:border-it-red-700 rounded-lg px-3 py-2">
          <span className="font-semibold">취소 사유 · </span>
          {schedule.cancellationReason}
        </p>
      )}
    </div>
  );
}

// ─── Page Component ────────────────────────────────
export default function TrainingDetailPage() {
  const params = useParams();
  const trainingId = params?.id as string;
  const { navigate } = useNavigation();

  const { data: training, isLoading, error, refresh } = useTrainingDetail(trainingId);
  const { toast } = useToast();

  usePageReady(!isLoading);

  // SPEC v2 §3: 모든 화면 status bar + AppBar 노출.
  //  isDataLoaded 가드는 fetch 실패 시 status bar 영구 숨김 회귀를 유발할 수 있으므로
  //  단순 상세 뷰에서는 의도적으로 생략한다 (SPEC §5 Step D).
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '훈련 상세',
    showBottomNav: true,
  });

  const [newScheduleDate, setNewScheduleDate] = useState('');
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 일정 추가
  const handleAddSchedule = useCallback(async () => {
    if (!newScheduleDate || !trainingId) return;
    setAddingSchedule(true);
    try {
      const response = await addTrainingSchedules(trainingId, [newScheduleDate]);
      if (response.success) {
        setNewScheduleDate('');
        refresh();
      }
    } catch {
      // 무시
    } finally {
      setAddingSchedule(false);
    }
  }, [newScheduleDate, trainingId, refresh]);

  // [Lifecycle v4.1 SS9.3] 판매 승인 사이클 확인 플로우 — 대기(UNAPPROVED_MONTH) 시
  //   월 패키지 확인(직전 분 복제 프리필 -> 금액 유지/수정 -> 대상월 row 생성) + [판매 시작].
  const [monthlyPkgs, setMonthlyPkgs] = useState<MonthlyPkg[] | null>(null);
  const [pkgPrices, setPkgPrices] = useState<Record<string, string>>({});
  const [pkgSubmitting, setPkgSubmitting] = useState<string | null>(null);
  const [openingSales, setOpeningSales] = useState(false);

  const isUnapprovedPending =
    training?.lifecycleStatus === 'PENDING_SCHEDULE' &&
    training?.pendingReason === 'UNAPPROVED_MONTH';
  const targetMonthIso = training?.earliestRemainingMonth ?? null;
  const targetMonthLabel = targetMonthIso
    ? new Date(targetMonthIso).getUTCMonth() + 1
    : null;
  const targetMonthKey = targetMonthIso ? targetMonthIso.slice(0, 7) : null;

  const fetchMonthlyPkgs = useCallback(async () => {
    if (!trainingId) return;
    const res = await api.get<MonthlyPkg[] | { data: MonthlyPkg[] }>(
      `/classes/${trainingId}/products`,
    );
    if (res.success && res.data) {
      const list = Array.isArray(res.data)
        ? res.data
        : ((res.data as { data?: MonthlyPkg[] }).data ?? []);
      setMonthlyPkgs(
        list.filter(
          (pkg) => pkg.feeType === 'MONTHLY_FIXED' && pkg.isActive !== false,
        ),
      );
    }
  }, [trainingId]);

  useEffect(() => {
    if (isUnapprovedPending) fetchMonthlyPkgs();
  }, [isUnapprovedPending, fetchMonthlyPkgs]);

  // 대상월 row 가 이미 있는 상품명 집합 — 같은 이름의 이전 분은 "갱신 완료" 취급.
  const updatedNames = new Set(
    (monthlyPkgs ?? [])
      .filter(
        (pkg) =>
          pkg.billingMonth && pkg.billingMonth.slice(0, 7) === targetMonthKey,
      )
      .map((pkg) => pkg.productName),
  );
  // 갱신 필요 목록 — 대상월이 아닌 분(무월 레거시 포함) 중 이름별 "최신 분" 1건.
  //   GET products 는 가격 오름차순이라 그대로 dedup 하면 옛 달 가격이 프리필될 수 있어
  //   (evaluator D3 — §9.3 ② 가격 오염 차단 지점 훼손) billingMonth 내림차순으로
  //   정렬 후 선별한다. 무월(null)은 가장 오래된 분 취급.
  const needsUpdate = (() => {
    const seen = new Set<string>();
    const byLatestMonth = [...(monthlyPkgs ?? [])].sort((a, b) =>
      (b.billingMonth ?? '').localeCompare(a.billingMonth ?? ''),
    );
    return byLatestMonth.filter((pkg) => {
      const isTarget = pkg.billingMonth?.slice(0, 7) === targetMonthKey;
      if (
        isTarget ||
        updatedNames.has(pkg.productName) ||
        seen.has(pkg.productName)
      ) {
        return false;
      }
      seen.add(pkg.productName);
      return true;
    });
  })();

  const handleCreateMonthPkg = useCallback(
    async (pkg: MonthlyPkg) => {
      if (!targetMonthKey) return;
      const raw = pkgPrices[pkg.id];
      const price = raw === undefined || raw === '' ? pkg.price : Number(raw);
      if (!Number.isFinite(price) || price < 0) {
        toast.error(MESSAGES.error.general);
        return;
      }
      setPkgSubmitting(pkg.id);
      try {
        // §9.2 "동일 내용 복제" — 단위 필드 3종을 원본에서 패스스루.
        //   durationDays 하드코딩·sessionsPerMonth 누락 시 백엔드 파생식이
        //   발급 수량·"주 N회" 라벨을 왜곡한다 (evaluator D2).
        const res = await api.post(`/classes/${trainingId}/products`, {
          productName: pkg.productName,
          description: pkg.description ?? undefined,
          price,
          feeType: 'MONTHLY_FIXED',
          durationDays: pkg.durationDays ?? 30,
          sessionsPerMonth: pkg.sessionsPerMonth ?? undefined,
          sessionsPerWeek: pkg.sessionsPerWeek ?? undefined,
          billingMonth: targetMonthKey,
        });
        if (res.success) {
          toast.success(MESSAGES.class.salesCycle.packageCreated);
          await fetchMonthlyPkgs();
        } else if (res.error?.message) {
          toast.error(res.error.message);
        }
      } finally {
        setPkgSubmitting(null);
      }
    },
    [trainingId, targetMonthKey, pkgPrices, toast, fetchMonthlyPkgs],
  );

  const handleOpenSales = useCallback(async () => {
    setOpeningSales(true);
    try {
      const res = await api.post(`/classes/${trainingId}/open-sales`);
      if (res.success) {
        toast.success(MESSAGES.class.salesCycle.openSalesSuccess);
        refresh();
      } else if (res.error?.message) {
        toast.error(res.error.message);
      }
    } finally {
      setOpeningSales(false);
    }
  }, [trainingId, toast, refresh]);

  // [Lifecycle v4.1] 수업 종료/재개 — 가드(일정0+잔여선불0)는 서버 판정, 실패 시 사유 토스트.
  const [lifecycleActing, setLifecycleActing] = useState(false);
  const handleEndClass = useCallback(async () => {
    if (!confirm(`${MESSAGES.class.endConfirmTitle}
${MESSAGES.class.endConfirmMessage}`)) return;
    setLifecycleActing(true);
    try {
      const response = await api.post(`/classes/${trainingId}/end`);
      if (response.success) {
        toast.success(MESSAGES.class.endSuccess);
        refresh();
      } else if (response.error?.message) {
        toast.error(response.error.message);
      }
    } finally {
      setLifecycleActing(false);
    }
  }, [trainingId, refresh, toast]);

  const handleReopenClass = useCallback(async () => {
    setLifecycleActing(true);
    try {
      const response = await api.post(`/classes/${trainingId}/reopen`);
      if (response.success) {
        toast.success(MESSAGES.class.reopenSuccess);
        refresh();
      } else if (response.error?.message) {
        toast.error(response.error.message);
      }
    } finally {
      setLifecycleActing(false);
    }
  }, [trainingId, refresh, toast]);

  // 삭제
  const handleDelete = useCallback(async () => {
    if (!confirm(MESSAGES.training.deleteConfirm)) return;
    setDeleting(true);
    try {
      const response = await deleteTraining(trainingId);
      if (response.success) {
        navigate('/training-manage');
      }
    } catch {
      // 무시
    } finally {
      setDeleting(false);
    }
  }, [trainingId, navigate]);


  if (isLoading) return null;

  if (error || !training) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="훈련 상세" showBack />
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-5 bg-it-canvas dark:bg-puck">
          <div className="w-16 h-16 bg-it-red-50 dark:bg-it-red-700/20 rounded-w-pill flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-3xl text-it-red-500" aria-hidden="true" />
          </div>
          <p className="text-card-body text-it-ink-800 dark:text-rink-100">
            {error ?? '훈련 세션을 찾을 수 없습니다.'}
          </p>
        </div>
      </MobileContainer>
    );
  }

  const typeInfo = TRAINING_TYPE_ICONS[training.trainingType as TrainingType] ?? TRAINING_TYPE_ICONS.REGULAR_TRAINING;
  const typeLabel = TRAINING_TYPE_LABELS[training.trainingType as TrainingType] ?? training.trainingType;
  const upcomingSchedules = training.schedules.filter(
    (s) => !s.isCancelled && new Date(s.scheduledDate) >= new Date(),
  );
  const pastSchedules = training.schedules.filter(
    (s) => !s.isCancelled && new Date(s.scheduledDate) < new Date(),
  );
  const cancelledSchedules = training.schedules.filter((s) => s.isCancelled);

  // 시간 표시 SoT: 요일별 기본 일정 패턴 > 다음 회차(날짜+회차 시간) > 미표시.
  // 대표값(Class.startTime)은 회차별 실제 시각과 다를 수 있어 표시에 사용하지 않는다.
  const scheduleDisplayLabel = formatClassScheduleDisplay({
    daySchedules: training.daySchedules?.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      startTime: d.startTime,
      endTime: d.endTime,
    })),
    nextSchedule: upcomingSchedules[0]
      ? {
          scheduledDate: upcomingSchedules[0].scheduledDate,
          startTime: upcomingSchedules[0].startTime,
          endTime: upcomingSchedules[0].endTime,
        }
      : null,
    totalScheduleCount: upcomingSchedules.length + pastSchedules.length,
    // 종료 훈련(다음 회차 없음) — 비취소 회차 첫~마지막 날짜로 기간 표기.
    firstScheduleDate:
      pastSchedules[0]?.scheduledDate ?? upcomingSchedules[0]?.scheduledDate ?? null,
    lastScheduleDate:
      upcomingSchedules[upcomingSchedules.length - 1]?.scheduledDate ??
      pastSchedules[pastSchedules.length - 1]?.scheduledDate ??
      null,
  });

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="훈련 상세" showBack />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-32">
        {/* 상단 정보 히어로 — navy 밴드 full-bleed (요약 강조) */}
        <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-6 pb-6" aria-label="훈련 정보">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-w-md flex items-center justify-center shrink-0 bg-white/15">
              <Icon name={typeInfo.icon} className="text-2xl text-white" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span className="text-card-meta font-bold uppercase tracking-widest text-white bg-white/15 px-2 py-0.5 rounded">
                  {typeLabel}
                </span>
                {!training.isActive && (
                  <span className="text-card-meta font-medium text-white bg-it-red-500/30 px-2 py-0.5 rounded">
                    비활성
                  </span>
                )}
              </div>
              <h2 className="text-[22px] font-extrabold tracking-[-0.01em] text-white leading-tight">
                {training.className}
              </h2>
            </div>
          </div>

          {training.description && (
            <p className="mt-4 text-card-body text-white/80 leading-relaxed bg-white/10 rounded-w-md px-4 py-3">
              {training.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-x-3 gap-y-3 mt-4 pt-4 border-t border-white/15">
            <div className="flex items-center gap-2 text-card-body text-white/90">
              <Icon name="person" className="text-card-emphasis text-white/60" aria-hidden="true" />
              <span className="truncate">{training.instructorName}</span>
            </div>
            <div className="flex items-center gap-2 text-card-body text-white/90">
              <Icon name="groups" className="text-card-emphasis text-white/60" aria-hidden="true" />
              <span>정원 {training.capacity}명</span>
            </div>
            {scheduleDisplayLabel && (
              <div className="flex items-center gap-2 text-card-body text-white/90">
                <Icon name="schedule" className="text-card-emphasis text-white/60" aria-hidden="true" />
                <span className="truncate">{scheduleDisplayLabel}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-card-body text-white/90">
              <Icon name="business" className="text-card-emphasis text-white/60" aria-hidden="true" />
              <span className="truncate">{training.club.clubName}</span>
            </div>
          </div>
        </section>

        {/* [Lifecycle v4.1 SS9.3] 판매 승인 배너 — 대기 상태에서만 노출 */}
        {training.lifecycleStatus === 'PENDING_SCHEDULE' && !training.endedAt && (
          <section
            className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 pt-5 pb-5"
            aria-label={MESSAGES.class.salesCycle.pendingBannerAria}
          >
            {training.pendingReason === 'NO_SCHEDULE' || !targetMonthLabel ? (
              <div className="flex items-start gap-3 rounded-w-md bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
                <Icon name="event_busy" className="text-xl text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-card-body text-amber-800 dark:text-amber-300">
                  {MESSAGES.class.salesCycle.pendingNoSchedule('일정 관리')}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name="storefront" className="text-xl text-it-blue-500" aria-hidden="true" />
                  <h2 className="text-card-emphasis font-bold text-it-ink-900 dark:text-white">
                    {MESSAGES.class.salesCycle.pendingTitle(targetMonthLabel)}
                  </h2>
                </div>
                <p className="text-card-meta text-it-ink-500 dark:text-rink-300 mb-4">
                  {MESSAGES.class.salesCycle.pendingGuide}
                </p>

                {monthlyPkgs !== null && monthlyPkgs.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-card-meta font-bold text-it-ink-600 dark:text-rink-200 mb-2">
                      {MESSAGES.class.salesCycle.packageSectionTitle}
                    </h3>
                    <ul className="space-y-2">
                      {Array.from(updatedNames).map((name) => (
                        <li
                          key={`done-${name}`}
                          className="flex items-center justify-between rounded-w-md border border-it-line dark:border-rink-700 px-4 py-3"
                        >
                          <span className="text-card-body font-semibold text-it-ink-800 dark:text-white truncate">
                            {name}
                          </span>
                          <span className="inline-flex items-center gap-1 text-card-meta font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                            <Icon name="check_circle" className="text-base" aria-hidden="true" />
                            {MESSAGES.class.salesCycle.packageUpToDate}
                          </span>
                        </li>
                      ))}
                      {needsUpdate.map((pkg) => (
                        <li
                          key={pkg.id}
                          className="rounded-w-md border border-amber-200 dark:border-amber-700/50 px-4 py-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-card-body font-semibold text-it-ink-800 dark:text-white truncate">
                              {pkg.productName}
                            </span>
                            <span className="text-card-meta font-bold text-amber-600 dark:text-amber-400 shrink-0">
                              {MESSAGES.class.salesCycle.packageNeedsUpdate}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={pkgPrices[pkg.id] ?? String(pkg.price)}
                              onChange={(e) =>
                                setPkgPrices((prev) => ({ ...prev, [pkg.id]: e.target.value }))
                              }
                              aria-label={MESSAGES.class.salesCycle.priceInputAria(pkg.productName, targetMonthLabel)}
                              className="flex-1 min-w-0 h-11 rounded-w-md bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 px-3 text-sm text-it-ink-800 dark:text-white focus:border-it-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleCreateMonthPkg(pkg)}
                              disabled={pkgSubmitting === pkg.id}
                              className="shrink-0 h-11 px-4 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-meta font-bold disabled:opacity-60 transition-colors motion-reduce:transition-none active:brightness-95"
                            >
                              {MESSAGES.class.salesCycle.keepPriceButton}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleOpenSales}
                  disabled={openingSales || needsUpdate.length > 0}
                  title={
                    needsUpdate.length > 0
                      ? MESSAGES.class.salesCycle.packageNeedsUpdate
                      : undefined
                  }
                  className="w-full h-12 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-body font-extrabold disabled:bg-it-line disabled:text-it-ink-400 dark:disabled:bg-rink-700 transition-colors motion-reduce:transition-none active:brightness-95"
                >
                  {MESSAGES.class.salesCycle.openSalesButton}
                </button>
              </>
            )}
          </section>
        )}

        {/* 일정 추가 — flat 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 pt-5 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="event_available" className="text-card-title text-it-blue-500" aria-hidden="true" />
            <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">일정 추가</h3>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={newScheduleDate}
              onChange={(e) => setNewScheduleDate(e.target.value)}
              aria-label="추가할 일정 날짜"
              className="flex-1 h-11 px-3 bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15px] font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 transition-colors motion-reduce:transition-none"
            />
            <button
              type="button"
              onClick={handleAddSchedule}
              disabled={addingSchedule || !newScheduleDate}
              className={cn(
                'h-11 px-5 rounded-w-md text-card-body font-bold text-white transition-colors motion-reduce:transition-none',
                addingSchedule || !newScheduleDate
                  ? 'bg-it-ink-300 dark:bg-rink-500 cursor-not-allowed'
                  : 'bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95',
              )}
            >
              {addingSchedule ? '...' : '추가'}
            </button>
          </div>
        </section>

        {/* 일정 목록 — flat 흰 섹션 (hairline 행) */}
        {/* 예정된 일정 */}
        {upcomingSchedules.length > 0 && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950" aria-label="예정된 일정">
            <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
              <h3 className="inline-flex items-center gap-1.5 text-card-meta font-bold text-it-blue-500 uppercase tracking-wider">
                <span className="inline-block w-1.5 h-1.5 rounded-w-pill bg-it-blue-500" aria-hidden="true" />
                예정
              </h3>
              <span className="text-card-meta text-it-ink-500 dark:text-rink-300 tabular-nums">{upcomingSchedules.length}건</span>
            </div>
            <div>
              {upcomingSchedules.map((s) => (
                <ScheduleCard
                  key={s.id}
                  schedule={s}
                  trainingId={trainingId}
                  onCancel={refresh}
                />
              ))}
            </div>
          </section>
        )}

        {/* 완료된 일정 */}
        {pastSchedules.length > 0 && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950" aria-label="완료된 일정">
            <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
              <h3 className="inline-flex items-center gap-1.5 text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider">
                <span className="inline-block w-1.5 h-1.5 rounded-w-pill bg-it-ink-300" aria-hidden="true" />
                완료
              </h3>
              <span className="text-card-meta text-it-ink-500 dark:text-rink-300 tabular-nums">{pastSchedules.length}건</span>
            </div>
            <div>
              {pastSchedules.map((s) => (
                <ScheduleCard
                  key={s.id}
                  schedule={s}
                  trainingId={trainingId}
                  onCancel={refresh}
                />
              ))}
            </div>
          </section>
        )}

        {/* 취소된 일정 */}
        {cancelledSchedules.length > 0 && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950" aria-label="취소된 일정">
            <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
              <h3 className="inline-flex items-center gap-1.5 text-card-meta font-bold text-it-red-500 dark:text-it-red-300 uppercase tracking-wider">
                <span className="inline-block w-1.5 h-1.5 rounded-w-pill bg-it-red-500" aria-hidden="true" />
                취소됨
              </h3>
              <span className="text-card-meta text-it-ink-500 dark:text-rink-300 tabular-nums">{cancelledSchedules.length}건</span>
            </div>
            <div>
              {cancelledSchedules.map((s) => (
                <ScheduleCard
                  key={s.id}
                  schedule={s}
                  trainingId={trainingId}
                  onCancel={refresh}
                />
              ))}
            </div>
          </section>
        )}

        {training.schedules.length === 0 && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-14 h-14 bg-it-fill dark:bg-rink-700 rounded-w-pill flex items-center justify-center mb-3">
                <Icon name="event_busy" className="text-2xl text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
              </div>
              <p className="text-card-body font-medium text-it-ink-800 dark:text-rink-100 mb-1">
                등록된 일정이 없습니다.
              </p>
              <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
                위 입력란에서 일정을 추가해보세요.
              </p>
            </div>
          </section>
        )}
      </main>

      {/* 하단 Sticky 액션 — [수업 종료]/[종료 취소] + 삭제 */}
      <div className="sticky bottom-0 left-0 right-0 bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-rink-700 px-5 py-4 flex gap-3">
        {/* [Lifecycle v4.1] 종료: endedAt 없으면 [수업 종료하기](가드는 서버 — 미충족 시 사유 안내),
            종료 상태면 [종료 취소하기]. 재개 후엔 '일정 등록 대기'부터 시작. */}
        {training.endedAt ? (
          <button
            type="button"
            onClick={handleReopenClass}
            disabled={lifecycleActing}
            className="flex-1 h-12 rounded-w-md border-[1.5px] border-it-line dark:border-rink-600 text-it-ink-600 dark:text-rink-200 text-card-body font-bold hover:bg-it-canvas dark:hover:bg-rink-800 disabled:opacity-60 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            {MESSAGES.class.reopenClassButton}
          </button>
        ) : (
          /* SPEC T4 — 잔여 일정 존재(ON_SALE) 시 비활성 + 사유 캡션 (title/aria).
             잔여 선불 가드는 서버 판정 → 400 사유 토스트 (이중 구조). */
          <button
            type="button"
            onClick={handleEndClass}
            disabled={lifecycleActing || training.lifecycleStatus === 'ON_SALE'}
            title={
              training.lifecycleStatus === 'ON_SALE'
                ? MESSAGES.class.endBlockedBySchedule
                : undefined
            }
            aria-disabled={training.lifecycleStatus === 'ON_SALE'}
            aria-label={
              training.lifecycleStatus === 'ON_SALE'
                ? MESSAGES.class.endBlockedBySchedule
                : MESSAGES.class.endClassButton
            }
            className="flex-1 h-12 rounded-w-md border-[1.5px] border-it-line dark:border-rink-600 text-it-ink-600 dark:text-rink-200 text-card-body font-bold hover:bg-it-canvas dark:hover:bg-rink-800 disabled:opacity-60 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            {MESSAGES.class.endClassButton}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="flex-1 h-12 rounded-w-md border-[1.5px] border-it-red-200 dark:border-it-red-700 text-it-red-500 dark:text-it-red-300 text-card-body font-bold hover:bg-it-red-50 dark:hover:bg-it-red-700/20 disabled:opacity-60 transition-colors motion-reduce:transition-none active:brightness-95"
        >
          {deleting ? '삭제 중...' : '삭제하기'}
        </button>
      </div>
    </MobileContainer>
  );
}
