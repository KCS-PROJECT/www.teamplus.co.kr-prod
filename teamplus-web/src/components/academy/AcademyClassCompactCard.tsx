'use client';

/**
 * AcademyClassCompactCard — 학원 수업 카드 (Master 화면용, 64px compact)
 *
 * SPEC v3 2026-05-18 — 수업 카드 IA 재활성화. 클릭 시 `/classes/{cls.id}/students` 진입.
 *   `/academy/{academyId}?tab=students` 기본 모드(검색어 없음) 에서 수업 카드 리스트 렌더.
 *   onClick 동선은 v2 Detail 페이지 (`/classes/[id]/students`) 와 통일.
 *   디자인 토큰은 v1 (rounded-w-xl · shadow-sh-1 · dark: 변형 · focus-visible:ring-ice-500) 그대로 유지.
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { AcademyClassSummary } from '@/hooks/useAcademyStudents';

interface AcademyClassCompactCardProps {
  classData: AcademyClassSummary;
  onClick: (classId: string) => void;
}

export function AcademyClassCompactCard({
  classData,
  onClick,
}: AcademyClassCompactCardProps) {
  const {
    id,
    className,
    scheduleSummary,
    durationMinutes,
    status,
    enrollmentCount,
    pendingCount,
  } = classData;

  const isEnded = status === 'ended';
  const meta = [
    scheduleSummary || null,
    durationMinutes > 0 ? MESSAGES.academy.students.durationMinutes(durationMinutes) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      aria-label={MESSAGES.academy.students.classCardAriaLabel(className, enrollmentCount)}
      className={cn(
        'w-full rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1',
        'border border-wline dark:border-rink-700',
        'px-4 py-3 flex items-center gap-3 text-left',
        'hover:bg-wline-2 dark:hover:bg-rink-700 active:brightness-95',
        'transition-colors duration-150 motion-reduce:transition-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-card-title font-extrabold text-wtext-1 dark:text-white truncate">
            {className}
          </h3>
          {isEnded && (
            <span
              className="shrink-0 rounded-w-pill bg-wline-2 dark:bg-rink-700 px-2 py-0.5 text-card-meta font-bold text-wtext-3 dark:text-rink-300"
              aria-label={MESSAGES.academy.students.statusEnded}
            >
              {MESSAGES.academy.students.statusEnded}
            </span>
          )}
        </div>
        {meta && (
          <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-rink-300 truncate">
            {meta}
          </p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-2">
        <span
          className="rounded-w-pill bg-wline-2 dark:bg-rink-700 px-2.5 py-1 text-card-meta font-bold text-wtext-1 dark:text-white tabular-nums"
          aria-label={MESSAGES.academy.students.enrollmentCount(enrollmentCount)}
        >
          {MESSAGES.academy.students.enrollmentCount(enrollmentCount)}
        </span>
        {pendingCount > 0 && (
          <span
            className="rounded-w-pill bg-sun-100 text-rink-800 px-2 py-0.5 text-card-meta font-bold tabular-nums"
            aria-label={MESSAGES.academy.students.pendingBadge(pendingCount)}
          >
            {MESSAGES.academy.students.pendingBadge(pendingCount)}
          </span>
        )}
        <Icon
          name="chevron_right"
          className="text-[20px] text-wtext-4 dark:text-rink-500"
          aria-hidden="true"
        />
      </div>
    </button>
  );
}

export default AcademyClassCompactCard;
