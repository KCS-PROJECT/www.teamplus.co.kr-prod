'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import {
  useChildClassHistory,
  type ChildClassHistoryItem,
  type ChildClassHistoryMonth,
} from '@/hooks/useChildClassHistory';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

/**
 * Task #28 C-6 — 연간 수업 출석 이력 (아동별)
 * Endpoint: GET /api/v1/children/:childId/class-history?year=YYYY
 *
 * [2026-06-18 재설계] present(출석)만 표시.
 *   - 연간 총계는 "올해 출석 N회" 단일 타일로 단순화 (지각/결석/취소/결제권 제거).
 *   - 월별 섹션은 아코디언(기본 접힘, 현재 월만 펼침).
 *   - ClassRow 상태 배지·creditUsed 칩 제거 (전부 출석이라 무의미).
 */

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function isPresent(item: ChildClassHistoryItem): boolean {
  return item.status === 'present';
}

function presentClasses(
  month: ChildClassHistoryMonth,
): ChildClassHistoryItem[] {
  return month.classes.filter(isPresent);
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDay(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ────────────────────────────────────────────
// Class Row (present 전용 — 상태 배지 없음)
// ────────────────────────────────────────────

function ClassRow({ item }: { item: ChildClassHistoryItem }) {
  return (
    <div className="flex items-start gap-3 border-b border-it-line py-3 last:border-b-0 dark:border-it-blue-900">
      <span
        className="mt-1.5 size-2 shrink-0 rounded-w-pill bg-green-500 dark:bg-green-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-card-body font-semibold text-it-ink-900 dark:text-white">
          {item.name}
        </p>
        <div className="mt-1 flex items-center gap-3 text-card-meta text-it-ink-500 dark:text-wtext-4">
          <span className="tabular-nums flex items-center gap-1">
            <Icon name="event" className="text-[14px]" aria-hidden="true" />
            {formatDay(item.attendedAt)}
          </span>
          <span className="tabular-nums flex items-center gap-1">
            <Icon name="schedule" className="text-[14px]" aria-hidden="true" />
            {formatTime(item.attendedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// Month Section (아코디언)
// ────────────────────────────────────────────

function MonthSection({
  month,
  count,
  maxMonthCount,
  expanded,
  onToggle,
}: {
  month: ChildClassHistoryMonth;
  count: number;
  maxMonthCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const items = presentClasses(month);
  const barPercent =
    maxMonthCount > 0 ? Math.round((count / maxMonthCount) * 100) : 0;
  const panelId = `month-panel-${month.month}`;

  return (
    <div className="border-b border-it-line last:border-b-0 dark:border-it-blue-900">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 py-3.5 text-left transition-colors active:bg-it-fill motion-reduce:transition-none dark:active:bg-rink-900/40"
      >
        <span className="tabular-nums flex size-9 shrink-0 items-center justify-center rounded-w-pill bg-it-blue-50 text-card-body font-bold text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300">
          {month.month}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-card-body font-semibold text-it-ink-900 dark:text-white">
              {MESSAGES.calendar.historyMonthLabel(month.month)}
            </span>
            <span className="tabular-nums text-card-body font-semibold text-it-ink-700 dark:text-wtext-4">
              {MESSAGES.calendar.historyCount(count)}
            </span>
          </div>
          {/* 막대 그래프 — 월별 출석 횟수 추이 */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-w-pill bg-it-line dark:bg-it-blue-900">
            <div
              className="h-full rounded-w-pill bg-it-blue-500 transition-all duration-300 motion-reduce:transition-none"
              style={{ width: `${barPercent}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
        <Icon
          name="expand_more"
          className={cn(
            'shrink-0 text-xl text-it-ink-400 transition-transform motion-reduce:transition-none dark:text-wtext-4',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {/* 펼친 상태 — 수업 목록 */}
      {expanded && (
        <div id={panelId} className="pb-3 pl-12">
          {items.length > 0 ? (
            items.map((item, idx) => (
              <ClassRow
                key={`${month.month}-${idx}-${item.attendedAt}`}
                item={item}
              />
            ))
          ) : (
            <p className="py-3 text-center text-card-meta text-it-ink-400 dark:text-wtext-4">
              {MESSAGES.calendar.historyMonthEmpty}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Year Navigation
// ────────────────────────────────────────────

function YearNavigation({
  currentYear,
  thisYear,
  onPrev,
  onNext,
  onToday,
}: {
  currentYear: number;
  thisYear: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const isFuture = currentYear >= thisYear;

  return (
    <div className="flex items-center justify-between px-1">
      <button
        type="button"
        onClick={onPrev}
        className="flex size-10 items-center justify-center rounded-w-pill transition-colors hover:bg-it-fill active:brightness-95 motion-reduce:transition-none dark:hover:bg-rink-900/40"
        aria-label={MESSAGES.calendar.historyPrevYear}
      >
        <Icon
          name="chevron_left"
          className="text-xl text-it-ink-700 dark:text-wtext-4"
          aria-hidden="true"
        />
      </button>

      <div className="flex items-center gap-2">
        <h2 className="tabular-nums text-card-title font-bold text-it-ink-900 dark:text-white">
          {MESSAGES.calendar.historyYearLabel(currentYear)}
        </h2>
        {currentYear !== thisYear && (
          <button
            type="button"
            onClick={onToday}
            className="rounded-lg px-2 py-1 text-card-meta font-semibold text-it-blue-500 transition-colors hover:bg-it-blue-50 motion-reduce:transition-none dark:hover:bg-it-blue-900/30"
          >
            {MESSAGES.calendar.historyThisYear}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={isFuture}
        className="flex size-10 items-center justify-center rounded-w-pill transition-colors hover:bg-it-fill active:brightness-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent motion-reduce:transition-none dark:hover:bg-rink-900/40"
        aria-label={MESSAGES.calendar.historyNextYear}
      >
        <Icon
          name="chevron_right"
          className="text-xl text-it-ink-700 dark:text-wtext-4"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────

export default function ChildClassHistoryPage() {
  const params = useParams<{ childId: string }>();
  const childId = params?.childId ?? null;

  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const {
    currentYear,
    months,
    isLoading,
    errorMessage,
    goToPrevYear,
    goToNextYear,
    goToCurrentYear,
  } = useChildClassHistory({ childId });

  usePageReady(!isLoading);

  const thisYear = useMemo(() => new Date().getFullYear(), []);
  const thisMonth = useMemo(() => new Date().getMonth() + 1, []);

  // present 전용 월별 카운트 + 연간 총계 + 최대 월 카운트
  const { presentCounts, yearPresent, maxMonthCount } = useMemo(() => {
    const counts: Record<number, number> = {};
    let total = 0;
    let max = 0;
    for (const m of months) {
      const c = m.classes.reduce(
        (n, item) => (isPresent(item) ? n + 1 : n),
        0,
      );
      counts[m.month] = c;
      total += c;
      if (c > max) max = c;
    }
    return { presentCounts: counts, yearPresent: total, maxMonthCount: max };
  }, [months]);

  // 빈 상태 판정은 present 기준 — hook의 hasAny(absent 등 포함)와 분리.
  // present 0인데 absent만 있는 연도에 빈 월 카드가 노출되던 회귀 차단.
  const hasPresent = yearPresent > 0;

  // 기본 펼침 월 — 올해면 현재 월, 아니면 데이터 있는 첫 월
  const defaultExpandedMonth = useMemo(() => {
    if (currentYear === thisYear) return thisMonth;
    const first = months.find((m) => (presentCounts[m.month] ?? 0) > 0);
    return first?.month ?? null;
  }, [currentYear, thisYear, thisMonth, months, presentCounts]);

  // null = 기본값(defaultExpandedMonth) 사용, -1 = 전부 접힘, 그 외 = 해당 월 펼침.
  // 연도가 바뀌면 사용자 토글을 초기화해 기본 펼침 규칙을 다시 적용한다.
  const [expandedOverride, setExpandedOverride] = useState<{
    year: number;
    month: number;
  } | null>(null);

  const effectiveExpanded =
    expandedOverride && expandedOverride.year === currentYear
      ? expandedOverride.month
      : defaultExpandedMonth;

  const toggleMonth = (month: number) => {
    setExpandedOverride((prev) => {
      const current =
        prev && prev.year === currentYear ? prev.month : defaultExpandedMonth;
      return {
        year: currentYear,
        month: current === month ? -1 : month,
      };
    });
  };

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.calendar.historyTitle} forceNative />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8">
        {/* 연도 네비게이션 — full-bleed 흰 섹션 */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 py-2">
          <YearNavigation
            currentYear={currentYear}
            thisYear={thisYear}
            onPrev={goToPrevYear}
            onNext={goToNextYear}
            onToday={goToCurrentYear}
          />
        </section>

        {/* 에러 배너 */}
        {errorMessage && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4">
            <div
              className="flex items-start gap-2 rounded-[12px] border border-it-red-500/40 bg-it-red-50 px-4 py-3 text-card-body text-it-red-600 dark:border-it-red-500/40 dark:bg-it-red-500/15 dark:text-it-red-300"
              role="alert"
            >
              <Icon
                name="error_outline"
                className="mt-0.5 text-card-emphasis"
                aria-hidden="true"
              />
              <span>{errorMessage}</span>
            </div>
          </section>
        )}

        {/* 로딩 */}
        {isLoading ? null : (
          <>
            {/* 연간 총계 — "올해 출석 N회" 단일 타일 (흰 섹션) */}
            <section
              aria-label={MESSAGES.calendar.historyTotal}
              className="mt-2 flex items-center gap-4 bg-it-surface dark:bg-it-blue-950 px-5 py-5"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-w-pill bg-green-100 dark:bg-green-900/30">
                <Icon
                  name="check_circle"
                  className="text-2xl text-green-600 dark:text-green-400"
                  aria-hidden="true"
                />
              </span>
              <div className="flex flex-col">
                <span className="text-card-meta font-medium text-it-ink-500 dark:text-wtext-4">
                  {MESSAGES.childAttendance.yearLabel}
                </span>
                <span className="tabular-nums text-w-h2 font-extrabold text-it-ink-900 dark:text-white">
                  {MESSAGES.calendar.historyCount(yearPresent)}
                </span>
              </div>
            </section>

            {/* 월별 아코디언 또는 빈 상태 — full-bleed 흰 섹션 + hairline 행 */}
            {hasPresent ? (
              <section
                aria-label={`${currentYear}년 월별 수업 이력`}
                className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5"
              >
                {months.map((month) => (
                  <MonthSection
                    key={month.month}
                    month={month}
                    count={presentCounts[month.month] ?? 0}
                    maxMonthCount={maxMonthCount}
                    expanded={effectiveExpanded === month.month}
                    onToggle={() => toggleMonth(month.month)}
                  />
                ))}
              </section>
            ) : (
              <section className="mt-2 flex flex-col items-center justify-center gap-3 bg-it-surface dark:bg-it-blue-950 px-5 py-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-900">
                  <Icon
                    name="event_busy"
                    className="text-3xl text-it-ink-400 dark:text-wtext-4"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
                  {MESSAGES.calendar.historyEmpty}
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </MobileContainer>
  );
}
