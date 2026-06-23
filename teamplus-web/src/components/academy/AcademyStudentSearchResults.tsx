'use client';

/**
 * AcademyStudentSearchResults — 학원 학생 통합 검색 결과
 * SPEC_ACADEMY_STUDENTS_REDESIGN v1.0 (2026-05-18)
 *
 * 자녀 단위 카드 + 해당 자녀가 수강 중인 수업 칩 리스트.
 * 칩 클릭 시 해당 수업 Detail 화면으로 이동.
 *
 * @deprecated 2026-05-18 SPEC v2 — 학생 단위 단일 리스트 메인 화면에 검색이 통합되어
 *   별도 결과 컴포넌트가 더 이상 필요하지 않습니다. 사용처가 0이 된 시점에 제거 예정.
 *   대체: `AcademyStudentsTab` + `AcademyStudentCard`.
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { AcademyStudentSearchEntry } from '@/hooks/useAcademyStudents';
import { AcademyStudentEmpty } from './AcademyStudentEmpty';

interface AcademyStudentSearchResultsProps {
  query: string;
  results: AcademyStudentSearchEntry[];
  isLoading: boolean;
  errorMessage?: string | null;
  onClassClick: (classId: string) => void;
  onRetry?: () => void;
}

function StatusDot({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower === 'paid') {
    return (
      <span
        aria-label={MESSAGES.academy.students.statusPaid}
        className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"
      />
    );
  }
  return (
    <span
      aria-label={MESSAGES.academy.students.statusPending}
      className="inline-block w-1.5 h-1.5 rounded-full bg-sun-500"
    />
  );
}

export function AcademyStudentSearchResults({
  query,
  results,
  isLoading,
  errorMessage,
  onClassClick,
  onRetry,
}: AcademyStudentSearchResultsProps) {
  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex items-center justify-center py-10"
      >
        <div className="w-6 h-6 border-2 border-ice-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-10 text-center"
      >
        <p className="text-card-body font-semibold text-wtext-2 dark:text-rink-100">
          {MESSAGES.error.general}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              'inline-flex h-10 items-center gap-1 rounded-w-pill px-4',
              'bg-ice-500 text-white text-card-body font-bold',
              'hover:bg-ice-700 active:brightness-95',
              'transition-colors duration-150 motion-reduce:transition-none',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900',
            )}
          >
            {MESSAGES.academy.students.retry}
          </button>
        )}
      </div>
    );
  }

  if (results.length === 0) {
    return <AcademyStudentEmpty variant="no-search-results" query={query} />;
  }

  return (
    <section aria-live="polite" className="flex flex-col gap-3">
      <p className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 tabular-nums">
        {MESSAGES.academy.students.searchResultCount(results.length)}
      </p>
      <ul className="flex flex-col gap-2.5">
        {results.map((entry) => (
          <li
            key={entry.childId}
            className={cn(
              'rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1',
              'border border-wline dark:border-rink-700',
              'px-4 py-3',
            )}
          >
            <div className="flex items-center gap-3">
              <div className="shrink-0 w-10 h-10 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
                <Icon
                  name="person"
                  className="text-[22px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-card-body font-extrabold text-wtext-1 dark:text-white truncate">
                  {entry.childName}
                </h4>
                <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                  {entry.parentName}
                  {entry.parentPhone ? (
                    <span className="ml-1 tabular-nums">· {entry.parentPhone}</span>
                  ) : null}
                </p>
              </div>
            </div>

            {entry.enrolledClasses.length > 0 && (
              <div className="mt-3 pt-3 border-t border-wline-2 dark:border-rink-700">
                <p className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 mb-2">
                  {MESSAGES.academy.students.enrolledClasses}
                </p>
                <div className="flex flex-wrap gap-2">
                  {entry.enrolledClasses.map((cls) => (
                    <button
                      key={cls.classId}
                      type="button"
                      onClick={() => onClassClick(cls.classId)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-w-pill px-3 py-1.5',
                        'bg-wline-2 dark:bg-rink-700',
                        'text-card-meta font-bold text-wtext-2 dark:text-rink-100',
                        'hover:bg-wline dark:hover:bg-rink-500 active:brightness-95',
                        'transition-colors duration-150 motion-reduce:transition-none',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900',
                      )}
                    >
                      <StatusDot status={cls.status} />
                      <span className="max-w-[180px] truncate">{cls.className}</span>
                      <Icon
                        name="chevron_right"
                        className="text-[14px]"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AcademyStudentSearchResults;
