'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { kstYearMonth } from '@/lib/kst-month';
import type { EndedChildSummary } from '@/lib/ended-class-children';

interface EndedClassChildrenSectionProps {
  summaries: EndedChildSummary[];
  /** 자녀 목록·수강 이력 조회 실패 — "수강한 자녀 없음"으로 단정하지 않는다. */
  loadFailed?: boolean;
}

/** 올해가 아닌 달은 연도를 붙인다 — 해를 넘긴 수업에서 같은 달이 겹쳐 보이지 않게. */
function monthLabel(yearMonth: string, currentYear: string): string {
  const year = yearMonth.slice(0, 4);
  const month = Number(yearMonth.slice(5, 7));
  return year === currentYear
    ? MESSAGES.enrollment.endedMonthLabel(month)
    : MESSAGES.enrollment.endedYearMonthLabel(Number(year), month);
}

/** 종료된 훈련 상세(학부모) — 신청 영역 대신 내 자녀의 수강 이력(월별 출석)을 보여준다. */
export function EndedClassChildrenSection({
  summaries,
  loadFailed = false,
}: EndedClassChildrenSectionProps) {
  const currentYear = kstYearMonth().slice(0, 4);
  return (
    <section
      aria-label={MESSAGES.enrollment.endedChildrenTitle}
      className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4"
    >
      <h2 className="mb-3 text-[15px] font-extrabold text-wtext-1 dark:text-white tracking-tight">
        {MESSAGES.enrollment.endedChildrenTitle}
      </h2>

      {loadFailed ? (
        <p className="text-card-meta text-wtext-3 dark:text-rink-300 px-1">
          {MESSAGES.enrollment.endedChildrenLoadFailed}
        </p>
      ) : summaries.length === 0 ? (
        <p className="text-card-meta text-wtext-3 dark:text-rink-300 px-1">
          {MESSAGES.enrollment.endedChildrenEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {summaries.map((s) => (
            <li
              key={s.childId}
              className="rounded-[14px] border border-wline-2 dark:border-rink-700 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-w-pill bg-it-blue-500/10 text-it-blue-600 dark:text-it-blue-300"
                  aria-hidden="true"
                >
                  <Icon name="person" className="text-[20px]" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                  {s.name}
                </span>
                <span className="flex shrink-0 gap-1">
                  {s.hasPrepaid && (
                    <span className="rounded-w-pill bg-it-red-500/10 px-2 py-0.5 text-[12px] font-semibold text-it-red-500 dark:text-it-red-300">
                      {MESSAGES.enrollment.endedPrepaidLabel}
                    </span>
                  )}
                  {s.hasPostpaid && (
                    <span className="rounded-w-pill bg-it-blue-500/10 px-2 py-0.5 text-[12px] font-semibold text-it-blue-600 dark:text-it-blue-300">
                      {MESSAGES.enrollment.endedPostpaidLabel}
                    </span>
                  )}
                </span>
              </div>

              {s.months.length > 0 && (
                <ul className="mt-3">
                  {s.months.map((m) => (
                    <li
                      key={m.yearMonth}
                      className="flex items-center justify-between border-t border-wline dark:border-rink-700 py-2 text-card-body"
                    >
                      <span className="text-wtext-2 dark:text-rink-100">
                        {monthLabel(m.yearMonth, currentYear)}
                      </span>
                      {!s.attendanceUnavailable && (
                        <span className="font-num tabular-nums font-semibold text-wtext-1 dark:text-white">
                          {MESSAGES.enrollment.endedAttendanceCount(m.presentCount)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {s.attendanceUnavailable && (
                <p className="mt-2 text-card-meta text-wtext-3 dark:text-rink-300">
                  {MESSAGES.enrollment.endedAttendanceLoadFailed}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
