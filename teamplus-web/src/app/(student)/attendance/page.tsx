'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { STATUS_DOT_CLASS, STATUS_BAR_CLASS, type StatusVariant } from '@/lib/status-colors';

// ─── Types ──────────────────────────────────────────────
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

interface AttendanceRecord {
  id: string;
  date: string;
  className: string;
  status: AttendanceStatus;
  checkInTime?: string;
  coach: string;
}

interface MonthlySummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number;
}

// ─── Status Config ──────────────────────────────────────
// 색상은 lib/status-colors.ts SoT 가 담당. 여기서는 의미 매핑만 정의.
type AttendanceStatusConfig = { label: string; icon: string; variant: StatusVariant };

const STATUS_CONFIG: Record<AttendanceStatus, AttendanceStatusConfig> = {
  PRESENT: { label: '출석', icon: 'check_circle', variant: 'success' },
  ABSENT:  { label: '결석', icon: 'cancel',       variant: 'error'   },
  LATE:    { label: '지각', icon: 'schedule',     variant: 'warning' },
  EXCUSED: { label: '공결', icon: 'info',         variant: 'info'    },
};

// 알 수 없는 status 값(백엔드 신규 enum·대소문자 변형) fallback
const STATUS_FALLBACK: AttendanceStatusConfig = {
  label: '미정',
  icon: 'help_outline',
  variant: 'neutral',
};

// ─── SummaryCard Component ──────────────────────────────
function SummaryCard({ summary, month }: { summary: MonthlySummary; month: string }) {
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (summary.rate / 100) * circumference;
  const rateLabel = summary.rate >= 90 ? '아주 잘하고 있어요' : summary.rate >= 75 ? '꾸준히 잘 오고 있어요' : summary.rate > 0 ? '조금만 더 힘내요' : '이번 달 출석 기록이 없어요';

  return (
    <div className="rounded-2xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-card-body font-bold text-wtext-3 dark:text-rink-300">{month} 출석 요약</h3>
        <span className="rounded-w-pill bg-ice-500/10 px-2.5 py-0.5 text-[11px] font-bold text-ice-500">
          총 {summary.total}회
        </span>
      </div>

      <div className="flex items-center gap-5">
        {/* 원형 프로그레스 */}
        <div className="relative flex-shrink-0">
          <svg width="96" height="96" viewBox="0 0 88 88" aria-label={`출석률 ${summary.rate}%`} role="img">
            <circle
              cx="44"
              cy="44"
              r="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
              className="text-white dark:text-wtext-2"
            />
            <circle
              cx="44"
              cy="44"
              r="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="text-ice-500 transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
              transform="rotate(-90 44 44)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-wtext-1 dark:text-white tabular-nums leading-none">
              {summary.rate}
              <span className="text-card-body font-semibold text-wtext-3">%</span>
            </span>
            <span className="text-[10px] font-semibold text-wtext-3 dark:text-rink-300 mt-0.5">출석률</span>
          </div>
        </div>

        {/* 상세 수치 */}
        <div className="grid flex-1 grid-cols-2 gap-y-2.5 gap-x-4">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-w-pill', STATUS_DOT_CLASS.success)} aria-hidden="true" />
            <span className="text-card-meta text-wtext-3 dark:text-rink-300">출석</span>
            <span className="ml-auto text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">{summary.present}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-w-pill', STATUS_DOT_CLASS.error)} aria-hidden="true" />
            <span className="text-card-meta text-wtext-3 dark:text-rink-300">결석</span>
            <span className="ml-auto text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">{summary.absent}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-w-pill', STATUS_DOT_CLASS.warning)} aria-hidden="true" />
            <span className="text-card-meta text-wtext-3 dark:text-rink-300">지각</span>
            <span className="ml-auto text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">{summary.late}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 shrink-0 rounded-w-pill', STATUS_DOT_CLASS.info)} aria-hidden="true" />
            <span className="text-card-meta text-wtext-3 dark:text-rink-300">공결</span>
            <span className="ml-auto text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">{summary.excused}</span>
          </div>
        </div>
      </div>

      {summary.total > 0 && (
        <p className="mt-4 flex items-center gap-1.5 border-t border-wline-2 pt-3 text-card-meta text-wtext-3 dark:border-rink-700 dark:text-rink-300">
          <Icon name="insights" className="text-[14px] text-ice-500" aria-hidden="true" />
          {rateLabel}
        </p>
      )}
    </div>
  );
}

// ─── YearlyTrend Component ──────────────────────────────
function YearlyTrend({ data }: { data: { month: string; rate: number }[] }) {
  const maxRate = 100;

  return (
    <div className="rounded-2xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-card-body font-bold text-wtext-3 dark:text-rink-300">최근 6개월 추이</h3>
        <div className="flex items-center gap-3 text-[10px] font-semibold text-wtext-3 dark:text-rink-300">
          <span className="flex items-center gap-1"><span className={cn('h-2 w-2 rounded-w-pill', STATUS_DOT_CLASS.primary)} aria-hidden="true" />80% 이상</span>
          <span className="flex items-center gap-1"><span className={cn('h-2 w-2 rounded-w-pill', STATUS_DOT_CLASS.warning)} aria-hidden="true" />60%+</span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-24" role="img" aria-label="연간 출석률 바 차트">
        {data.map((item) => (
          <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-wtext-3 dark:text-rink-300 tabular-nums">
              {item.rate > 0 ? `${item.rate}%` : ''}
            </span>
            <div className="w-full bg-wline-2 dark:bg-rink-700 rounded-t-sm overflow-hidden" style={{ height: '64px' }}>
              <div
                className={cn(
                  'w-full rounded-t-sm transition-all motion-reduce:transition-none duration-500',
                  item.rate >= 80 ? STATUS_BAR_CLASS.primary : item.rate >= 60 ? STATUS_BAR_CLASS.warning : STATUS_BAR_CLASS.error
                )}
                style={{ height: `${(item.rate / maxRate) * 100}%`, marginTop: 'auto' }}
              />
            </div>
            <span className="text-[10px] text-wtext-3 dark:text-rink-300 font-medium">{item.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AttendanceItem Component ───────────────────────────
function AttendanceItem({ record }: { record: AttendanceRecord }) {
  const config = STATUS_CONFIG[record.status] ?? STATUS_FALLBACK;
  const dateObj = new Date(record.date);
  const dateLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayLabel = dayNames[dateObj.getDay()];

  return (
    <div className="flex items-center gap-3 border-b border-wline-2 py-3.5 last:border-b-0 dark:border-rink-700">
      {/* 날짜 */}
      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-wbg py-1.5 dark:bg-rink-700/50">
        <span className="text-card-body font-bold text-wtext-1 dark:text-white tabular-nums leading-none">{dateLabel}</span>
        <span className="mt-0.5 text-[10px] font-medium text-wtext-3 dark:text-rink-300">{dayLabel}</span>
      </div>

      {/* 수업명 + 코치 */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-card-body font-semibold text-wtext-1 dark:text-white">{record.className}</p>
        <p className="mt-0.5 flex items-center gap-1 text-card-meta text-wtext-3 dark:text-rink-300">
          <Icon name="person" className="text-[13px]" aria-hidden="true" />
          {record.coach}
          {record.checkInTime && (
            <>
              <span className="text-wtext-4 dark:text-rink-500" aria-hidden="true">·</span>
              <Icon name="schedule" className="text-[13px]" aria-hidden="true" />
              <span className="tabular-nums">{record.checkInTime}</span>
            </>
          )}
        </p>
      </div>

      {/* 상태 뱃지 — StatusBadge SoT 사용 */}
      <StatusBadge variant={config.variant} icon={config.icon}>
        {config.label}
      </StatusBadge>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────
export default function StudentAttendancePage() {
  const today = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // 공통 PageAppBar 를 사용하므로 Flutter 네이티브 AppBar 는 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  // 백엔드 `/attendance/my` 엔드포인트 신설 전까지 샘플 데이터 사용
  // TODO: 백엔드에 CHILD/TEEN 본인 출석 조회 엔드포인트 추가 후 apiRequest 복원
  const fetchAttendance = useCallback(async () => {
    setIsLoading(true);
    const year = parseInt(selectedMonth.split('-')[0]);
    const month = parseInt(selectedMonth.split('-')[1]) - 1;
    const sampleRecords: AttendanceRecord[] = [];
    const statuses: AttendanceStatus[] = ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'LATE', 'EXCUSED', 'ABSENT'];
    for (let d = 1; d <= 15; d++) {
      const date = new Date(year, month, d * 2 > 28 ? 28 : d * 2);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      sampleRecords.push({
        id: `att-${d}`,
        date: date.toISOString(),
        className: d % 2 === 0 ? '초등부 정규훈련' : '스케이팅 레슨',
        status: statuses[d % statuses.length],
        checkInTime: d % 7 === 4 ? '16:15' : '15:55',
        coach: d % 2 === 0 ? '김코치' : '이코치',
      });
    }
    setRecords(sampleRecords);
    setIsLoading(false);
  }, [selectedMonth]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // 월별 요약 계산
  const summary: MonthlySummary = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.status === 'PRESENT').length;
    const absent = records.filter((r) => r.status === 'ABSENT').length;
    const late = records.filter((r) => r.status === 'LATE').length;
    const excused = records.filter((r) => r.status === 'EXCUSED').length;
    return { total, present, absent, late, excused, rate: total > 0 ? Math.round((present / total) * 100) : 0 };
  }, [records]);

  // 연간 추이 샘플
  const yearlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        month: `${d.getMonth() + 1}월`,
        rate: Math.floor(Math.random() * 20) + 75,
      });
    }
    return months;
  }, [today]);

  const monthLabel = `${selectedMonth.split('-')[0]}년 ${parseInt(selectedMonth.split('-')[1])}월`;

  // 현재 월 또는 미래 월인지 판단 — 다음 달 이동 금지 가드용
  // 초기 진입 시 selectedMonth=현재 월 → 다음 달 버튼 비활성화
  // 과거로 돌아간 뒤에는 현재 월까지만 다음 이동 허용
  const cannotGoNext = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return y > today.getFullYear() || (y === today.getFullYear() && m - 1 >= today.getMonth());
  }, [selectedMonth, today]);

  const goToPrevMonth = useCallback(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  }, [selectedMonth]);

  const goToNextMonth = useCallback(() => {
    if (cannotGoNext) return; // 현재 월에서는 미래로 이동 금지
    const [y, m] = selectedMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }, [selectedMonth, cannotGoNext]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="출석 내역" />

      <main className="flex-1 overflow-y-auto hide-scrollbar px-5 py-5 pb-30" role="main" aria-label="출석 내역">
        {/* ── 월 선택 ────────────────── */}
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-wline-2 bg-white px-3 py-2 shadow-sm dark:border-rink-700 dark:bg-rink-800">
          <button
            type="button"
            onClick={goToPrevMonth}
            className="flex h-11 w-11 items-center justify-center rounded-w-pill text-wtext-2 transition-colors hover:bg-wline-2 active:brightness-95 motion-reduce:transition-none dark:text-rink-100 dark:hover:bg-rink-700"
            aria-label="이전 달"
          >
            <Icon name="chevron_left" className="text-card-title" aria-hidden="true" />
          </button>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300">출석 내역</span>
            <h2 className="text-card-emphasis font-bold text-wtext-1 dark:text-white tabular-nums">{monthLabel}</h2>
          </div>
          <button
            type="button"
            onClick={goToNextMonth}
            disabled={cannotGoNext}
            className="flex h-11 w-11 items-center justify-center rounded-w-pill text-wtext-2 transition-colors hover:bg-wline-2 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none dark:text-rink-100 dark:hover:bg-rink-700"
            aria-label="다음 달"
          >
            <Icon name="chevron_right" className="text-card-title" aria-hidden="true" />
          </button>
        </div>

        {isLoading ? null : (
          <div className="flex flex-col gap-5">
            {/* ── 월간 요약 ──────────── */}
            <SummaryCard summary={summary} month={monthLabel} />

            {/* ── 연간 추이 ──────────── */}
            <YearlyTrend data={yearlyData} />

            {/* ── 출석 기록 리스트 ───── */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-card-body font-bold text-wtext-3 dark:text-rink-300">상세 기록</h3>
                {records.length > 0 && (
                  <span className="text-[11px] font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
                    {records.length}건
                  </span>
                )}
              </div>
              {records.length > 0 ? (
                <div className="rounded-2xl border border-wline-2 bg-white px-4 shadow-sm dark:border-rink-700 dark:bg-rink-800">
                  {records.map((record) => (
                    <AttendanceItem key={record.id} record={record} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-wline-2 bg-white p-10 shadow-sm dark:border-rink-700 dark:bg-rink-800">
                  <div className="flex h-14 w-14 items-center justify-center rounded-w-pill bg-ice-500/10">
                    <Icon name="event_busy" className="text-2xl text-ice-500" aria-hidden="true" />
                  </div>
                  <div className="text-center">
                    <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">이번 달에는 출석 기록이 없어요</p>
                    <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300">다음 수업에 꼭 만나요!</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </MobileContainer>
  );
}
