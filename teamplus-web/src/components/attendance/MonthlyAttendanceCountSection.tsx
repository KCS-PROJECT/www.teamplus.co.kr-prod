'use client';

/**
 * MonthlyAttendanceCountSection (Phase C)
 *
 * attendance-manage 페이지 내 "회원별 출석 횟수" 섹션 — 선불(PREPAID) 수업에서 노출.
 * 후불은 PostpaidSettlementSection(정산)을 쓰고, 선불은 본 컴포넌트로 출석 횟수만
 * 읽기 전용 표시(정산·금액 없음). 감독/코치가 주 N회 참여를 출석으로 수동 확인.
 */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import {
  getMonthlyAttendanceCounts,
  type MonthlyAttendanceCounts,
} from '@/services/attendance-count.service';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function MonthlyAttendanceCountSection({ classId }: { classId: string }) {
  const [yearMonth, setYearMonth] = useState<string>(() => currentYearMonth());
  const [data, setData] = useState<MonthlyAttendanceCounts | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await getMonthlyAttendanceCounts(classId, yearMonth);
    setData(d);
    setLoading(false);
  }, [classId, yearMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];
  const nominal = data?.nominalSessions ?? null;

  return (
    <section className="mx-4 mt-3 rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm p-5">
      <header className="mb-3">
        <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">
          {MESSAGES.monthlyAttendance.title}
        </h2>
      </header>

      {/* 월 선택 */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setYearMonth((ym) => shiftMonth(ym, -1))}
          aria-label={MESSAGES.monthlyAttendance.prevMonth}
          className="flex size-9 items-center justify-center rounded-w-lg border border-wline-2 dark:border-rink-700 text-wtext-2 dark:text-rink-200"
        >
          <Icon name="chevron_left" aria-hidden="true" />
        </button>
        <span className="text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
          {MESSAGES.monthlyAttendance.monthLabel(yearMonth)}
        </span>
        <button
          type="button"
          onClick={() => setYearMonth((ym) => shiftMonth(ym, 1))}
          disabled={yearMonth >= currentYearMonth()}
          aria-label={MESSAGES.monthlyAttendance.nextMonth}
          className="flex size-9 items-center justify-center rounded-w-lg border border-wline-2 dark:border-rink-700 text-wtext-2 dark:text-rink-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="chevron_right" aria-hidden="true" />
        </button>
      </div>

      {/* 회원별 출석 횟수 */}
      {loading ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <li
              key={i}
              className="h-14 rounded-w-lg bg-wline-2 dark:bg-rink-700 animate-pulse motion-reduce:animate-none"
            />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-card-meta text-wtext-3 dark:text-rink-300">
          {MESSAGES.monthlyAttendance.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.userId}
              className="flex items-center justify-between rounded-w-lg border border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900/40 px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
                  {it.name}
                </p>
                {nominal !== null && (
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                    {MESSAGES.monthlyAttendance.nominalNote(nominal)}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-card-body font-bold text-ice-500 tabular-nums">
                {MESSAGES.monthlyAttendance.countUnit(it.attendanceCount)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 합계 */}
      {!loading && items.length > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-wline-2 dark:border-rink-700 pt-3">
          <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
            {MESSAGES.monthlyAttendance.total}
          </span>
          <span className="text-card-emphasis font-bold text-wtext-1 dark:text-white tabular-nums">
            {MESSAGES.monthlyAttendance.countUnit(data?.totalPresent ?? 0)}
          </span>
        </div>
      )}

      <p className="mt-3 text-card-caption text-wtext-3 dark:text-rink-300 leading-relaxed">
        {MESSAGES.monthlyAttendance.hint}
      </p>
    </section>
  );
}

export default MonthlyAttendanceCountSection;
