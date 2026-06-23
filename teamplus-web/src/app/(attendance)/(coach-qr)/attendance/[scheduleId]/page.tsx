'use client';

/**
 * /attendance/[scheduleId] — 코치/감독 출석확인 페이지 (2026-05-12)
 *
 * - 등록 학생 전체 표시 (미체크 학생 포함)
 * - 3-state: 출석(present) / 결석(absent) / 미확인(unchecked)
 * - 시점 모드 자동 분기:
 *     - upcoming: 수업 시작 -60분 이전 — 명단 확인만, 상태 변경 불가
 *     - active:   -60분 ~ +120분 — 출석 처리 활성 (회의록 22:31 정합)
 *     - past:     +120분 이후 — 코치 보정 모드
 * - 미체크(unchecked)는 기본값으로 표기, 학생 본인 QR/parent-button 으로 체크되면 갱신
 * - 코치/감독/관리자만 강제 수정 권한
 * - 다중 선택 → 하단 고정 바(출석/결석 2버튼)로 선택 학생 전원 일괄 적용
 *   (회원 승인 페이지와 동일 패턴 — director-approvals 의 bottom-fab-safe 사용)
 * - 개별 학생 탭 → 단일 BottomSheet(출석/결석/처리 취소)
 *
 * DESIGN.md Pattern B (wallet-content) 적용. 토큰: wsurface · sh-1 · ice-500 · flame/mint.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
// RBAC: (coach-qr) layout 단일 가드 — useRequireRole 호출 제거 (2026-05-20)
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import {
  useCoachAttendanceMutations,
  type CoachAttendanceStatus,
} from '@/hooks/useCoachAttendanceManage';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { api } from '@/services/api-client';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

interface RosterStudent {
  registrationId: string;
  memberId: string;
  memberName: string;
  memberType: string;
  attendanceId: string | null;
  attendanceStatus: CoachAttendanceStatus;
  checkedInAt: string | null;
  checkedInVia: string | null;
  updatedAt: string | null;
}

interface RosterResponse {
  scheduleId: string;
  classId: string;
  className: string;
  teamName: string;
  teamCode: string;
  scheduledDate: string;
  /** 회차 시각 text "HH:mm" — 표시 시각 SoT(우선). 레거시 회차는 null → class* 폴백. */
  scheduleStartTime?: string | null;
  scheduleEndTime?: string | null;
  classStartTime: string;
  classEndTime: string;
  isCancelled: boolean;
  total: number;
  counts: {
    present: number;
    absent: number;
    unchecked: number;
  };
  students: RosterStudent[];
}

type ScheduleMode = 'upcoming' | 'active' | 'past';

// 일괄 처리 가능한 상태 — 미확인(unchecked) 제외
type BulkStatus = Exclude<CoachAttendanceStatus, 'unchecked'>;

// 회의록 22:31 정합 — 수업 시작 -60분 ~ +120분 윈도우.
const IN_PROGRESS_BEFORE_MS = 60 * 60_000;
const IN_PROGRESS_AFTER_MS = 120 * 60_000;

// 회차 시각 SoT — startTime("HH:mm")을 scheduledDate 날짜와 합성해 실제 수업 시작 시각으로 판정.
//   정규수업은 scheduledDate 가 로컬 자정이라 startTime 미합성 시 mode 가 past 로 오판됨.
//   합성 규칙은 attendance-window.ts getAttendanceWindowState 와 동일.
function getScheduleMode(
  scheduledDateISO: string,
  startTime?: string | null,
): ScheduleMode {
  const base = new Date(scheduledDateISO);
  if (Number.isNaN(base.getTime())) return 'past';
  let start: number;
  if (startTime && /^\d{2}:\d{2}$/.test(startTime)) {
    const [h, m] = startTime.split(':').map(Number);
    start = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      h,
      m,
      0,
      0,
    ).getTime();
  } else {
    start = base.getTime();
  }
  const now = Date.now();
  if (now < start - IN_PROGRESS_BEFORE_MS) return 'upcoming';
  if (now <= start + IN_PROGRESS_AFTER_MS) return 'active';
  return 'past';
}

const STATUS_META: Record<
  CoachAttendanceStatus,
  { label: string; chip: string; dot: string }
> = {
  present: {
    label: '출석',
    chip: 'bg-mint-100 text-rink-800 dark:bg-mint-500/20 dark:text-mint-100',
    dot: 'bg-mint-500',
  },
  absent: {
    label: '결석',
    chip: 'bg-flame-100 text-flame-500 dark:bg-flame-500/20 dark:text-flame-100',
    dot: 'bg-flame-500',
  },
  unchecked: {
    label: '미확인',
    chip: 'bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300',
    dot: 'bg-wtext-4',
  },
};

function formatDateKR(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function formatTimeRange(start?: string, end?: string) {
  if (!start) return '';
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return end ? `${fmt(start)} - ${fmt(end)}` : fmt(start);
}

function dayKR(iso?: string) {
  if (!iso) return '';
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(iso).getDay()];
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function AttendanceCheckPage() {
  const params = useParams();
  const scheduleId = useMemo(() => {
    const raw = params?.scheduleId;
    return Array.isArray(raw) ? raw[0] : (raw ?? '');
  }, [params]);

  // RBAC: (coach-qr) layout 가드 — 본 페이지 진입 시 isAllowed=true 가 보장됨 (2026-05-20)
  const { toast } = useToast();
  const { navigate } = useNavigation();

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: true,
  });

  const [data, setData] = useState<RosterResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState<string | null>(null);
  // 단일 상태 변경 시트 대상 (개별 학생 탭)
  const [editStudent, setEditStudent] = useState<RosterStudent | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 다중 선택 — Set<memberId>
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 일괄 처리용 bulk mutation
  const { markBulk } = useCoachAttendanceMutations();

  const load = useCallback(async () => {
    if (!scheduleId) return;
    setIsLoading(true);
    setError(null);
    const res = await api.get<RosterResponse>(
      `/attendance/schedule/${scheduleId}/roster`,
    );
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error?.message || MESSAGES.error.general);
    }
    setIsLoading(false);
  }, [scheduleId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 시점 모드 — upcoming/active/past (회의록 22:31 정합)
  const mode: ScheduleMode = useMemo(() => {
    if (!data) return 'past';
    return getScheduleMode(data.scheduledDate, data.scheduleStartTime);
  }, [data]);

  // 체크박스 선택 토글
  const toggleSelect = useCallback((memberId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }, []);

  // 전체 선택 토글
  const toggleSelectAll = useCallback(() => {
    if (!data) return;
    setSelectedIds((prev) => {
      if (prev.size === data.students.length) return new Set();
      return new Set(data.students.map((s) => s.memberId));
    });
  }, [data]);

  // 단일 상태 변경 — 개별 학생 탭 → BottomSheet
  const handleSingleSelect = useCallback(
    async (next: CoachAttendanceStatus, reason?: string) => {
      if (!editStudent || !data) return;
      setSubmitting(true);
      try {
        if (next === 'unchecked') {
          if (!editStudent.attendanceId) {
            toast.error(MESSAGES.attendance.alreadyUnchecked);
            return;
          }
          const res = await api.delete(
            `/attendance/coach/${editStudent.attendanceId}`,
          );
          if (!res.success) {
            toast.error(res.error?.message || MESSAGES.error.general);
            return;
          }
        } else {
          const res = await api.post('/attendance/coach/manual-mark', {
            scheduleId: data.scheduleId,
            memberId: editStudent.memberId,
            attendanceStatus: next,
            modifiedReason: reason,
          });
          if (!res.success) {
            toast.error(res.error?.message || MESSAGES.error.general);
            return;
          }
        }
        toast.success(MESSAGES.attendance.statusChanged);
        setEditStudent(null);
        await load();
      } finally {
        setSubmitting(false);
      }
    },
    [editStudent, data, toast, load],
  );

  // 일괄 처리 — 하단 바 출석/결석 버튼 → 선택 학생 전원에 즉시 적용
  const handleBulkMark = useCallback(
    async (next: BulkStatus) => {
      if (!data || selectedIds.size === 0 || submitting) return;
      setSubmitting(true);
      try {
        const memberIds = Array.from(selectedIds);
        const result = await markBulk(data.scheduleId, memberIds, next);
        if (result.failedCount === 0) {
          toast.success(`${result.successCount}명 처리되었습니다.`);
        } else if (result.successCount > 0) {
          toast.error(
            `${result.successCount}명 처리 · ${result.failedCount}명 실패`,
          );
        } else {
          toast.error(result.failures[0]?.message ?? MESSAGES.error.general);
        }
        // 성공한 학생만 선택 해제 (실패는 재시도 위해 유지)
        const failedSet = new Set(result.failures.map((f) => f.memberId));
        setSelectedIds(new Set(memberIds.filter((id) => failedSet.has(id))));
        await load();
      } finally {
        setSubmitting(false);
      }
    },
    [data, selectedIds, submitting, markBulk, toast, load],
  );

  // [v16 2026-05-16] 이중 로더 제거 — LoadingProvider 풀스크린 로더가 usePageReady 신호로 종료.
  // RBAC: (coach-qr) layout 단일 가드 — 페이지 도달 시 isAllowed=true 보장.

  const hasSelection = selectedIds.size > 0;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="출석 확인" forceNative />
      <main
        className="flex-1 min-h-0 overflow-y-auto bg-wbg dark:bg-puck"
        role="main"
        aria-label="출석 확인"
      >
        {/* Hero — 수업/일정 요약 + 시점 모드 배지 */}
        <section className="px-4 pt-4">
          <div className="rounded-w-xl bg-rink-800 dark:bg-rink-900 shadow-sh-rink p-5 text-white">
            <div className="flex items-center gap-2">
              <div className="text-card-meta font-extrabold tracking-[0.08em] text-ice-100/90">
                ATTENDANCE
              </div>
              {data && !isLoading && (
                <ModeBadge mode={mode} />
              )}
            </div>
            {isLoading || !data ? null : (
              <>
                <h1 className="mt-2 text-card-section font-extrabold tracking-tight break-keep text-white">
                  {data.className}
                </h1>
                <p className="mt-1 text-card-body font-num text-rink-100 tabular-nums">
                  {formatDateKR(data.scheduledDate)} ({dayKR(data.scheduledDate)}){' '}
                  ·{' '}
                  {data.scheduleStartTime
                    ? data.scheduleEndTime
                      ? `${data.scheduleStartTime} - ${data.scheduleEndTime}`
                      : data.scheduleStartTime
                    : formatTimeRange(data.classStartTime, data.classEndTime)}
                </p>
                <p className="mt-1 text-card-meta font-semibold text-ice-100/80">
                  {data.teamName}
                  {data.teamCode ? ` (${data.teamCode})` : ''}
                </p>
              </>
            )}
          </div>
        </section>

        {/* 카운트 요약 (3-state) */}
        {data && !isLoading && (
          <section className="px-4 pt-3">
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 p-4">
              <div className="grid grid-cols-3 gap-2">
                <CountBlock label="출석" value={data.counts.present} dotClass="bg-mint-500" />
                <CountBlock label="결석" value={data.counts.absent} dotClass="bg-flame-500" />
                <CountBlock label="미확인" value={data.counts.unchecked} dotClass="bg-wtext-4" />
              </div>
            </div>
          </section>
        )}

        {/* QR 출석 생성 — 이 회차(scheduleId)를 넘겨 해당 일정 QR 을 바로 생성.
             종료(past)된 수업은 QR 출석이 무의미하므로 숨김. */}
        {data && !isLoading && mode !== 'past' && (
          <section className="px-4 pt-3">
            <button
              type="button"
              onClick={() => navigate(`/qr-generate?scheduleId=${scheduleId}`)}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[52px] rounded-w-xl bg-ice-500 text-white text-card-title font-bold shadow-sm hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              aria-label={MESSAGES.attendance.generateQr}
            >
              <Icon name="qr_code_scanner" className="text-xl text-white" aria-hidden="true" />
              {MESSAGES.attendance.generateQr}
            </button>
          </section>
        )}

        {/* 학생 명단 — 선택 시 하단 바 높이만큼 추가 여백(pb-28) */}
        <section className={cn('px-4 pt-3', hasSelection ? 'pb-28' : 'pb-8')}>
          {error ? (
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 p-6 text-center">
              <Icon name="error_outline" className="text-3xl text-flame-500" aria-hidden="true" />
              <p className="mt-2 text-card-title text-wtext-1 dark:text-white">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-w-md bg-ice-500 text-white text-card-body font-bold hover:bg-ice-600"
              >
                다시 시도
              </button>
            </div>
          ) : isLoading || !data ? null : data.students.length === 0 ? (
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                <Icon name="group_off" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
              </div>
              <p className="mt-2 text-card-title text-wtext-2 dark:text-rink-100">
                등록된 학생이 없습니다
              </p>
            </div>
          ) : (
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 overflow-hidden">
              {/* 전체 선택 토글 — 2명 이상일 때만 노출. 일괄 적용 액션은 하단 고정 바가 담당.
                  · 좌측 체크박스: 전체 선택/해제 토글
                  · 좌측 라벨: 선택 없을 때 "전체 선택" / 1명+ 일 때 "N명 선택" */}
              {data.students.length >= 2 && (
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-wline-2 dark:border-rink-700">
                  <button
                    type="button"
                    onClick={() => {
                      if (mode === 'upcoming') {
                        toast.error(MESSAGES.attendance.notYetActive);
                        return;
                      }
                      toggleSelectAll();
                    }}
                    className="flex-1 min-w-0 flex items-center gap-3 px-1 py-1 rounded-w-sm hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                    aria-label={
                      selectedIds.size === data.students.length
                        ? '전체 선택 해제'
                        : '전체 선택'
                    }
                    aria-pressed={selectedIds.size > 0}
                  >
                    <span
                      className={cn(
                        'shrink-0 size-7 rounded-w-sm flex items-center justify-center border',
                        selectedIds.size === data.students.length
                          ? 'bg-ice-500 border-ice-500 text-white'
                          : selectedIds.size > 0
                            ? 'bg-ice-500/40 border-ice-500 text-white'
                            : 'bg-wsurface border-wline dark:bg-rink-800 dark:border-rink-700 text-transparent',
                      )}
                    >
                      <Icon
                        name={selectedIds.size > 0 && selectedIds.size < data.students.length ? 'remove' : 'check'}
                        className="text-card-emphasis"
                        aria-hidden="true"
                      />
                    </span>
                    <span
                      className={cn(
                        'text-card-body font-semibold tabular-nums',
                        selectedIds.size > 0
                          ? 'text-ice-500'
                          : 'text-wtext-2 dark:text-rink-100',
                      )}
                    >
                      {selectedIds.size > 0
                        ? `${selectedIds.size}명 선택`
                        : '전체 선택'}
                    </span>
                  </button>
                </div>
              )}
              <ul className="divide-y divide-wline-2 dark:divide-rink-700">
                {data.students.map((s) => {
                  const meta = STATUS_META[s.attendanceStatus] ?? STATUS_META.unchecked;
                  const isLocked = mode === 'upcoming';
                  const isSelected = selectedIds.has(s.memberId);
                  return (
                    <li key={s.registrationId} className="flex items-stretch">
                      {/* 체크박스 — 좌측, 선택만 담당 */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isLocked) {
                            toast.error(MESSAGES.attendance.notYetActive);
                            return;
                          }
                          toggleSelect(s.memberId);
                        }}
                        className={cn(
                          'shrink-0 pl-4 pr-2 flex items-center transition-colors motion-reduce:transition-none',
                          isLocked && 'cursor-not-allowed opacity-70',
                        )}
                        aria-label={`${s.memberName} ${isSelected ? '선택 해제' : '선택'}`}
                        aria-pressed={isSelected}
                      >
                        <span
                          className={cn(
                            'size-7 rounded-w-sm flex items-center justify-center border',
                            isSelected
                              ? 'bg-ice-500 border-ice-500 text-white'
                              : 'bg-wsurface border-wline dark:bg-rink-800 dark:border-rink-700 text-transparent',
                          )}
                        >
                          <Icon name="check" className="text-card-emphasis" aria-hidden="true" />
                        </span>
                      </button>
                      {/* 학생 정보 — 클릭 시 단일 Sheet */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isLocked) {
                            toast.error(MESSAGES.attendance.notYetActive);
                            return;
                          }
                          setEditStudent(s);
                        }}
                        className={cn(
                          'flex-1 min-w-0 flex items-center gap-3 pr-4 py-3 text-left transition-colors duration-150 motion-reduce:transition-none',
                          isLocked
                            ? 'cursor-not-allowed opacity-70'
                            : 'hover:bg-wline-2 dark:hover:bg-rink-700',
                        )}
                        aria-label={`${s.memberName} 출석 상태 변경`}
                      >
                        <div className={cn('h-9 w-9 shrink-0 rounded-w-pill flex items-center justify-center bg-wline-2 dark:bg-rink-700')}>
                          <Icon name="person" className="text-[18px] text-wtext-2 dark:text-rink-100" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-card-title font-bold text-wtext-1 dark:text-white">
                            {s.memberName}
                          </p>
                          {s.checkedInAt && (
                            <p className="text-card-meta font-num text-wtext-3 dark:text-rink-300 tabular-nums">
                              체크인 {new Date(s.checkedInAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                              {s.checkedInVia ? ` · ${s.checkedInVia === 'qr_scan' ? 'QR' : s.checkedInVia === 'coach_manual' ? '코치' : '학부모'}` : ''}
                            </p>
                          )}
                        </div>
                        <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-w-pill px-2 py-1 text-card-meta font-extrabold', meta.chip)}>
                          <span className={cn('h-1.5 w-1.5 rounded-w-pill', meta.dot)} />
                          {meta.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

      </main>

      {/* 일괄 처리 하단 고정 바 — 선택 1명+ 시 노출, 선택 학생 전원에 즉시 적용.
          director-approvals 와 동일하게 globals.css `.bottom-fab-safe` 로 BottomNav 위 고정.
          `-translate-x-1/2` 는 WebView 우측 치우침 회귀가 있어 회피하고
          `flex justify-center` + `--mobile-shell-width` 로 컨테이너 폭과 일치시킨다. */}
      {hasSelection && (
        <div className="fixed bottom-fab-safe inset-x-0 z-40 flex justify-center px-4">
          <div
            role="toolbar"
            aria-label={`${selectedIds.size}명 선택됨 — 일괄 출석 처리`}
            className="flex w-full min-w-0 items-center gap-2 rounded-w-lg border border-ice-500/40 bg-wsurface dark:bg-rink-800 px-3 py-2.5 shadow-sh-3"
            style={{ maxWidth: 'calc(var(--mobile-shell-width, 448px) - 2rem)' }}
          >
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={submitting}
              aria-label="선택 해제"
              className="flex size-8 shrink-0 items-center justify-center rounded-w-sm text-wtext-3 transition-colors motion-reduce:transition-none hover:bg-wbg hover:text-wtext-2 focus:outline-none focus:ring-2 focus:ring-ice-500/40 disabled:opacity-50 dark:text-rink-300 dark:hover:bg-rink-700 dark:hover:text-rink-100"
            >
              <Icon name="close" className="text-card-emphasis" aria-hidden="true" />
            </button>
            <span className="shrink-0 inline-flex items-center gap-1 text-card-body font-bold text-ice-500 tabular-nums">
              {selectedIds.size}명
            </span>
            <button
              type="button"
              onClick={() => void handleBulkMark('absent')}
              disabled={submitting}
              aria-label={`선택한 ${selectedIds.size}명 일괄 결석 처리`}
              className="ml-auto inline-flex h-9 items-center gap-1 rounded-w-md bg-flame-500 px-4 text-card-meta font-bold text-white transition-colors motion-reduce:transition-none hover:brightness-95 active:brightness-95 focus:outline-none focus:ring-2 focus:ring-flame-500/40 disabled:opacity-60"
            >
              <Icon name="cancel" className="text-card-emphasis" aria-hidden="true" />
              일괄 결석
            </button>
            <button
              type="button"
              onClick={() => void handleBulkMark('present')}
              disabled={submitting}
              aria-label={`선택한 ${selectedIds.size}명 일괄 출석 처리`}
              className="inline-flex h-9 items-center gap-1 rounded-w-md bg-mint-500 px-4 text-card-meta font-bold text-white transition-colors motion-reduce:transition-none hover:brightness-95 active:brightness-95 focus:outline-none focus:ring-2 focus:ring-mint-500/40 disabled:opacity-60"
            >
              <Icon name="check_circle" className="text-card-emphasis" aria-hidden="true" />
              일괄 출석
            </button>
          </div>
        </div>
      )}

      {/* 단일 상태 변경 시트 — 개별 학생 탭 */}
      {data && (
        <StatusEditSheet
          student={editStudent}
          className={data.className}
          submitting={submitting}
          onClose={() => !submitting && setEditStudent(null)}
          onSelect={(next) => void handleSingleSelect(next)}
        />
      )}
    </MobileContainer>
  );
}

// ────────────────────────────────────────────
// 단일 학생 상태 변경 시트 (페이지 전용)
// ────────────────────────────────────────────

const STATUS_OPTIONS: {
  value: BulkStatus;
  label: string;
  desc: string;
  icon: string;
  chip: string;
}[] = [
  { value: 'present', label: '출석', desc: '수업 참석', icon: 'check_circle', chip: 'bg-mint-500 text-white' },
  { value: 'absent',  label: '결석', desc: '수업 미참석', icon: 'cancel',       chip: 'bg-flame-500 text-white' },
];

function StatusEditSheet({
  student,
  className,
  submitting,
  onClose,
  onSelect,
}: {
  student: RosterStudent | null;
  className: string;
  submitting: boolean;
  onClose: () => void;
  onSelect: (next: CoachAttendanceStatus) => void;
}) {
  const open = Boolean(student);

  return (
    <BottomSheet isOpen={open} onClose={onClose} title="출석 상태 변경">
      {student && (
        <div className="px-5 pt-2 pb-6">
          {/* 컨텍스트 — 수업명 + 학생 + 현재 상태 */}
          <div className="rounded-w-md bg-wline-2 dark:bg-rink-700 px-3 py-2.5 mb-4">
            <p className="text-card-meta text-wtext-3 dark:text-rink-300">{className}</p>
            <p className="text-card-title font-bold text-wtext-1 dark:text-white truncate">
              {student.memberName}{' '}
              <span className="ml-1 text-card-meta text-wtext-3 dark:text-rink-300">
                현재: {STATUS_META[student.attendanceStatus]?.label ?? '미확인'}
              </span>
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {STATUS_OPTIONS.map((opt) => {
              // 현재 상태 옵션은 disabled
              const isCurrent = student.attendanceStatus === opt.value;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    disabled={submitting || isCurrent}
                    onClick={() => onSelect(opt.value)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-w-md border px-4 py-3 text-left transition-colors duration-150 motion-reduce:transition-none',
                      'border-wline dark:border-rink-700 bg-wsurface dark:bg-rink-800 hover:bg-wline-2 dark:hover:bg-rink-700',
                      isCurrent && 'opacity-50 cursor-not-allowed',
                      submitting && 'cursor-wait',
                    )}
                  >
                    <span className={cn('h-9 w-9 shrink-0 rounded-w-pill flex items-center justify-center', opt.chip)}>
                      <Icon name={opt.icon} className="text-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-card-title font-bold text-wtext-1 dark:text-white">
                        {opt.label}
                        {isCurrent && (
                          <span className="ml-2 rounded-w-pill bg-wline-2 dark:bg-rink-700 px-2 py-0.5 text-card-meta font-extrabold text-wtext-3 dark:text-rink-300">현재</span>
                        )}
                      </span>
                      <span className="block text-card-meta text-wtext-3 dark:text-rink-300">
                        {opt.desc}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}

            {/* 처리 취소(미확인) — attendance 레코드가 있을 때만 노출 */}
            {student.attendanceId && (
              <li>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => onSelect('unchecked' as CoachAttendanceStatus)}
                  className="w-full flex items-center gap-3 rounded-w-md border border-dashed border-wline dark:border-rink-700 px-4 py-3 text-left text-card-body font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-700 disabled:cursor-wait"
                >
                  <Icon name="undo" className="text-[18px] text-wtext-3 dark:text-rink-300" aria-hidden="true" />
                  처리 취소 (미확인으로)
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </BottomSheet>
  );
}

function CountBlock({ label, value, dotClass }: { label: string; value: number; dotClass: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <span className={cn('h-1.5 w-1.5 rounded-w-pill', dotClass)} aria-hidden="true" />
        <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">{label}</span>
      </div>
      <span className="text-card-section font-extrabold font-num text-wtext-1 dark:text-white tabular-nums">
        {value}
      </span>
    </div>
  );
}

// 시점 모드 배지 — Hero 우측, 회의록 22:31 정합
function ModeBadge({ mode }: { mode: ScheduleMode }) {
  if (mode === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-w-pill bg-mint-500/20 px-2 py-0.5 text-card-meta font-extrabold text-mint-100">
        <span className="h-1.5 w-1.5 rounded-w-pill bg-mint-500 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
        진행 중
      </span>
    );
  }
  if (mode === 'upcoming') {
    return (
      <span className="inline-flex items-center gap-1 rounded-w-pill bg-rink-700/60 px-2 py-0.5 text-card-meta font-extrabold text-rink-100">
        예정
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-w-pill bg-rink-700/60 px-2 py-0.5 text-card-meta font-extrabold text-rink-100">
      완료
    </span>
  );
}
