'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar as AppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useDateTime } from '@/hooks/useDateTime';
import { useVenues } from '@/hooks/useClassForm';
import { MultiDatePickerModal, type MultiDateCommon } from '@/components/ui/MultiDatePickerModal';
import { ScheduleCalendarView } from '@/components/classes/ScheduleCalendarView';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { cn } from '@/lib/utils';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { getDashboardPathByUserType } from '@/lib/auth-routing';

/* ─────────────────────────── Types ─────────────────────────── */

interface ClassHeader {
  id: string;
  // 학원 수업은 teamId=null + academyId 보유. 둘 중 하나는 반드시 존재.
  teamId: string | null;
  academyId?: string | null;
  className: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  classDays?: string[];
  startTime?: string;
  endTime?: string;
}

interface ScheduleItem {
  id: string;
  scheduledDate: string;
  /** 회차별 시각(HH:mm) — 미니달력/오픈클래스로 추가된 일정에 저장됨. 없으면 scheduledDate 시각 폴백. */
  startTime?: string | null;
  endTime?: string | null;
  venue?: { id: string; name: string } | null;
  isCancelled: boolean;
  cancellationReason?: string | null;
  createdAt?: string;
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 일정 1건 라벨 — 회차 시각(startTime)이 있으면 그 시간을, 없으면 scheduledDate 시각을 표시. */
function formatScheduleLabel(s: ScheduleItem): string {
  const d = new Date(s.scheduledDate);
  if (isNaN(d.getTime())) return '-';
  const dateStr = `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} (${WEEKDAYS[d.getDay()]})`;
  if (s.startTime) {
    return `${dateStr} ${s.startTime}${s.endTime ? `~${s.endTime}` : ''}`;
  }
  return `${dateStr} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* ─────────────────────────── Component ─────────────────────────── */

export default function ClassSchedulesManagePage() {
  const params = useParams<{ id: string }>();
  const classId = params?.id ?? '';
  const { toast } = useToast();
  const { user } = useSessionAuth();
  const router = useRouter();

  // [hotfix 2026-05-13 D10] 이중 헤더 방지 — Web PageAppBar(forceNative) 단독 사용.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const [cls, setCls] = useState<ClassHeader | null>(null);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 등록된 일정 표시 방식 — 달력(기본) ⇄ 목록 토글.
  const [scheduleView, setScheduleView] = useState<'calendar' | 'list'>('calendar');

  // 풀스크린 로더 fast-path — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // 미니달력(복수 날짜 선택) — 정규/오픈 수업 일정 추가용
  const [multiDateOpen, setMultiDateOpen] = useState(false);
  const [isSubmittingDates, setIsSubmittingDates] = useState(false);
  const { venues } = useVenues();
  const { year: serverYear, month: serverMonth } = useDateTime();
  const initialYear = useMemo(() => {
    const y = Number(serverYear);
    return Number.isFinite(y) && y > 0 ? y : new Date().getFullYear();
  }, [serverYear]);
  const initialMonth = useMemo(() => {
    const m = Number(serverMonth);
    return Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
  }, [serverMonth]);

  const fetchClass = useCallback(async () => {
    if (!classId) return;
    const res = await api.get<ClassHeader>(`/classes/${classId}`);
    if (res.success && res.data) {
      setCls(res.data);
    } else if (res.error?.statusCode === 403) {
      // 비소속 매니저의 일정 관리 페이지 직접 접근 차단.
      toast.error(MESSAGES.class.accessDenied);
      const path = getDashboardPathByUserType(user?.userType) ?? '/';
      router.replace(path);
    }
  }, [classId, router, toast, user?.userType]);

  // 학원/팀 통합 owner 경로 헬퍼.
  //   - 학원 수업: /api/v1/academies/:academyId/classes/:classId/...
  //   - 팀 수업:   /api/v1/teams/:teamId/classes/:classId/...
  const getOwnerPath = useCallback((c: ClassHeader | null): string | null => {
    if (!c) return null;
    if (c.academyId) return `/academies/${c.academyId}/classes/${c.id}`;
    if (c.teamId) return `/teams/${c.teamId}/classes/${c.id}`;
    return null;
  }, []);

  const fetchSchedules = useCallback(async (target: ClassHeader) => {
    const basePath = getOwnerPath(target);
    if (!classId || !basePath) return;
    // 범위 미지정 — 해당 수업의 전체 회차를 조회 (특정 달이 아닌 전체 일정 관리).
    const res = await api.get<ScheduleItem[]>(`${basePath}/schedules`);
    if (res.success && Array.isArray(res.data)) {
      // 취소된 일정은 관리 화면에서 숨김 — 이력은 DB(isCancelled)에 그대로 보존.
      const sorted = res.data
        .filter((s) => !s.isCancelled)
        .sort(
          (a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime(),
        );
      setSchedules(sorted);
    }
  }, [classId, getOwnerPath]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await fetchClass();
      setIsLoading(false);
    })();
  }, [fetchClass]);

  useEffect(() => {
    if (cls && (cls.academyId || cls.teamId)) fetchSchedules(cls);
  }, [cls, fetchSchedules]);

  const isApproved = cls?.approvalStatus === 'APPROVED';

  // 이미 등록된(취소 제외) 날짜 — 미니달력에 선택 표시.
  const registeredDates = useMemo(
    () =>
      schedules
        .filter((s) => !s.isCancelled)
        .map((s) => {
          const d = new Date(s.scheduledDate);
          return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        }),
    [schedules],
  );

  // 미니달력 확인 — 선택 날짜 배열 + 공통 시간·장소를 일괄 일정 추가 API(dates 모드)로 전송.
  const handleConfirmDates = useCallback(
    async (dates: string[], common: MultiDateCommon) => {
      if (!cls || !isApproved || dates.length === 0) return;
      const basePath = getOwnerPath(cls);
      if (!basePath) {
        toast.error(MESSAGES.common.loadFailed);
        return;
      }
      setIsSubmittingDates(true);
      try {
        const res = await api.post<{
          created: number;
          skipped: number;
          schedules: ScheduleItem[];
        }>(`${basePath}/schedules/bulk`, {
          dates,
          startTime: common.startTime || undefined,
          endTime: common.endTime || undefined,
          venueId: common.venueId || undefined,
        });
        if (res.success && res.data) {
          if (res.data.created > 0) {
            toast.success(MESSAGES.class.scheduleBulkCreated(res.data.created));
          }
          await fetchSchedules(cls);
        } else {
          toast.error(res.error?.message ?? MESSAGES.common.loadFailed);
        }
      } finally {
        setIsSubmittingDates(false);
      }
    },
    [cls, isApproved, getOwnerPath, toast, fetchSchedules],
  );

  const handleUpdateSchedule = useCallback(
    async (
      scheduleId: string,
      payload: { startTime: string; endTime: string; venueId: string },
    ) => {
      if (!cls || !isApproved) return;
      const basePath = getOwnerPath(cls);
      if (!basePath) {
        toast.error(MESSAGES.common.loadFailed);
        return;
      }
      const res = await api.put(`${basePath}/schedules/${scheduleId}`, payload);
      if (res.success) {
        toast.success(MESSAGES.save.success);
        await fetchSchedules(cls);
      } else {
        toast.error(res.error?.message ?? MESSAGES.common.loadFailed);
      }
    },
    [cls, isApproved, getOwnerPath, toast, fetchSchedules],
  );

  async function handleCancel(scheduleId: string) {
    if (!cls || !isApproved) return;
    if (!window.confirm(MESSAGES.classesEdit.episodeCancelConfirm)) return;
    const basePath = getOwnerPath(cls);
    if (!basePath) {
      toast.error(MESSAGES.common.loadFailed);
      return;
    }
    const res = await api.put(
      `${basePath}/schedules/${scheduleId}/cancel`,
      { cancellationReason: '감독/코치 취소' },
    );
    if (res.success) {
      toast.success(MESSAGES.class.scheduleCancelled);
      await fetchSchedules(cls);
    } else {
      toast.error(res.error?.message ?? MESSAGES.common.loadFailed);
    }
  }

  /* ─────────────────────────── Render ─────────────────────────── */

  if (isLoading) return null;

  if (!cls) {
    return (
      <MobileContainer hasBottomNav={false}>
        <AppBar title="수업 일정 관리" onBack={() => router.back()} forceNative />
        <main className="flex-1 flex items-center justify-center p-6">
          <p className="text-wtext-2 dark:text-rink-300">수업을 찾을 수 없습니다.</p>
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <AppBar title="수업 일정 관리" forceNative />
      <main className="flex-1 overflow-y-auto pb-24" style={{ WebkitOverflowScrolling: 'touch' as never }}>
        {/* ─── 수업명 + 승인 상태 배너 ─── */}
        <section className="mx-5 mt-5">
          <h1 className="text-xl font-bold text-wtext-1 dark:text-white mb-3">{cls.className}</h1>
          <ApprovalBanner status={cls.approvalStatus} reason={cls.rejectionReason} />
        </section>

        {/* ─── 일정 추가 ─── */}
        <section className="mx-5 mt-6">
          <h2 className="text-card-body font-bold text-wtext-1 dark:text-white mb-3">일정 추가</h2>
          <div
            className={cn(
              'bg-white dark:bg-rink-800 rounded-2xl p-5 border border-wline-2 dark:border-rink-700 shadow-sm',
              !isApproved && 'opacity-60',
            )}
            aria-disabled={!isApproved}
          >
            {/* 미니달력으로 복수 날짜 + 공통 시간·장소 추가 */}
            <div className="space-y-3">
              <p className="text-card-meta text-wtext-3 dark:text-rink-300 leading-relaxed">
                달력에서 날짜를 선택하고 공통 시간·장소를 적용해 일정을 추가합니다.
                매달 단위로 필요할 때마다 계속 추가할 수 있어요.
              </p>
              <button
                type="button"
                onClick={() => setMultiDateOpen(true)}
                disabled={!isApproved || isSubmittingDates}
                className="w-full flex items-center justify-center gap-1.5 py-3 bg-ice-500 hover:bg-ice-700 disabled:bg-wline dark:disabled:bg-rink-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors motion-reduce:transition-none"
              >
                <Icon name="calendar_month" className="text-base" aria-hidden="true" />
                {isSubmittingDates ? '추가 중…' : '일정 추가'}
              </button>
            </div>
          </div>
        </section>

        {/* ─── 등록된 일정 목록 ─── */}
        <section className="mx-5 mt-6" aria-labelledby="registered-schedules-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="registered-schedules-heading"
              className="text-card-body font-bold text-wtext-1 dark:text-white"
            >
              등록된 일정
            </h2>
            <div className="flex items-center gap-2.5">
              <span
                className="text-card-meta text-wtext-3 dark:text-rink-300"
                aria-live="polite"
                aria-atomic="true"
              >
                {schedules.length}건
              </span>
              <div
                className="inline-flex rounded-lg bg-wline-2 dark:bg-rink-700 p-0.5"
                role="group"
                aria-label="일정 표시 방식"
              >
                {(['calendar', 'list'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setScheduleView(mode)}
                    aria-pressed={scheduleView === mode}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1 rounded-md text-card-meta font-bold transition-colors motion-reduce:transition-none',
                      scheduleView === mode
                        ? 'bg-white dark:bg-rink-800 text-wtext-1 dark:text-white shadow-sm'
                        : 'text-wtext-3 dark:text-rink-300',
                    )}
                  >
                    <Icon
                      name={mode === 'calendar' ? 'calendar_month' : 'list'}
                      className="text-sm"
                      aria-hidden="true"
                    />
                    {mode === 'calendar' ? '달력' : '목록'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden">
            {scheduleView === 'calendar' ? (
              <ScheduleCalendarView
                schedules={schedules}
                isApproved={isApproved}
                venues={venues.map((v) => ({ id: v.id, name: v.name }))}
                onCancel={handleCancel}
                onUpdate={handleUpdateSchedule}
              />
            ) : schedules.length === 0 ? (
              <p
                className="p-5 text-center text-card-body text-wtext-3 dark:text-rink-300"
                role="status"
              >
                등록된 일정이 없습니다.
              </p>
            ) : (
              <ul
                className="divide-y divide-slate-100 dark:divide-slate-700"
                role="list"
                aria-label={`등록된 일정 ${schedules.length}건`}
              >
                {schedules.map((s) => (
                  <li
                    key={s.id}
                    role="listitem"
                    className={cn(
                      'flex items-center justify-between px-4 py-3 gap-3',
                      s.isCancelled && 'opacity-50',
                    )}
                    aria-label={`${formatScheduleLabel(s)}${s.venue?.name ? `, ${s.venue.name}` : ''}${s.isCancelled ? ', 취소됨' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon
                        name={s.isCancelled ? 'event_busy' : 'event_available'}
                        className={cn(
                          'text-card-title shrink-0',
                          s.isCancelled ? 'text-wtext-3 dark:text-rink-300' : 'text-ice-500',
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <span
                          className={cn(
                            'block text-card-body text-wtext-1 dark:text-white tabular-nums truncate',
                            s.isCancelled && 'line-through',
                          )}
                        >
                          {formatScheduleLabel(s)}
                        </span>
                        {s.venue?.name && (
                          <span className="block text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                            {s.venue.name}
                          </span>
                        )}
                      </div>
                      {s.isCancelled && (
                        <span
                          className="text-card-meta font-bold px-2 py-0.5 rounded bg-wline dark:bg-rink-700 text-wtext-2 dark:text-rink-300 shrink-0"
                          role="status"
                        >
                          취소됨
                        </span>
                      )}
                    </div>
                    {!s.isCancelled && isApproved && (
                      <button
                        type="button"
                        onClick={() => handleCancel(s.id)}
                        className="text-card-meta font-bold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-2 py-1 rounded transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-red-500 focus:outline-none shrink-0"
                        aria-label={`${formatScheduleLabel(s)} 회차 취소하기`}
                      >
                        취소하기
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      {/* 미니달력 — 수업 일정 복수 추가 */}
      <MultiDatePickerModal
        isOpen={multiDateOpen}
        initialYear={initialYear}
        initialMonth={initialMonth}
        selected={[]}
        disabledDates={registeredDates}
        venues={venues.map((v) => ({ id: v.id, name: v.name }))}
        onConfirm={handleConfirmDates}
        onClose={() => setMultiDateOpen(false)}
      />
    </MobileContainer>
  );
}

/* ─────────────────────────── Subcomponents ─────────────────────────── */

function ApprovalBanner({ status, reason }: { status: ClassHeader['approvalStatus']; reason?: string | null }) {
  // 수업 자동 승인 정책상 APPROVED 는 기본 상태이므로 안내 배너 미표시.
  // PENDING/REJECTED 는 과거 데이터·예외 케이스 안전망으로 유지.
  if (status === 'PENDING') {
    return (
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
        role="alert"
      >
        <Icon name="hourglass_empty" className="text-card-title text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <p className="text-card-body text-amber-800 dark:text-amber-200 font-medium">
          감독 승인 대기중 · 승인 완료 후 일정 생성이 가능합니다.
        </p>
      </div>
    );
  }
  if (status === 'REJECTED') {
    return (
      <div
        className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
        role="alert"
      >
        <Icon name="cancel" className="text-card-title text-red-600 dark:text-red-400 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-card-body text-red-800 dark:text-red-200 font-medium">반려됨</p>
          {reason && (
            <p className="text-card-meta text-red-700 dark:text-red-300 mt-1 break-words">{reason}</p>
          )}
        </div>
      </div>
    );
  }
  return null;
}
