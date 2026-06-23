'use client';

/**
 * AcademyStudentCard — 학원 학생 단위 카드 (Master 화면)
 * SPEC_ACADEMY_STUDENTS_REDESIGN_V2.md (2026-05-18) §5.1
 *
 * - 자녀 이름 / 학부모 이름 / 등록일(lastPaidAt)
 * - 수강 수업 칩 (클릭 시 /classes/{classId}/students 진입)
 *
 * Detail 화면(수업별 enrollment) 의 학생 카드는 `AcademyClassEnrollmentCard` 를 사용한다.
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { AcademyStudentEntry } from '@/hooks/useAcademyStudents';

interface AcademyStudentCardProps {
  student: AcademyStudentEntry;
}

function formatRegisteredAt(iso: string | null): string {
  if (!iso) return '';
  try {
    const formatted = new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return MESSAGES.academy.students.registeredAt(formatted);
  } catch {
    return '';
  }
}

export function AcademyStudentCard({ student }: AcademyStudentCardProps) {
  const router = useRouter();
  const { childName, parentName, parentPhone, enrolledClasses, lastPaidAt } = student;
  const registeredLabel = formatRegisteredAt(lastPaidAt);

  const handleChipClick = useCallback(
    (classId: string) => {
      router.push(`/classes/${classId}/students`);
    },
    [router],
  );

  return (
    <article
      className={cn(
        'rounded-w-lg bg-wsurface dark:bg-rink-800',
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
            {childName}
          </h4>
          <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-rink-300 truncate">
            {parentName}
            {registeredLabel ? <span className="ml-1">· {registeredLabel}</span> : null}
          </p>
        </div>

        {parentPhone && (
          <a
            href={`tel:${parentPhone.replace(/-/g, '')}`}
            aria-label={MESSAGES.academy.students.callParent}
            className={cn(
              'shrink-0 inline-flex w-9 h-9 items-center justify-center rounded-w-pill',
              'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100',
              'hover:bg-wline dark:hover:bg-rink-500 active:brightness-95',
              'transition-colors duration-150 motion-reduce:transition-none',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900',
            )}
          >
            <Icon name="call" className="text-[18px]" aria-hidden="true" />
          </a>
        )}
      </div>

      {enrolledClasses.length > 0 && (
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          role="group"
          aria-label={MESSAGES.academy.students.enrolledClasses}
        >
          {enrolledClasses.map((cls) => (
            <button
              key={cls.classId}
              type="button"
              onClick={() => handleChipClick(cls.classId)}
              aria-label={MESSAGES.academy.students.classChipAriaLabel(cls.className)}
              className={cn(
                'inline-flex items-center rounded-w-pill border border-wline dark:border-rink-700',
                'bg-wline-2 dark:bg-rink-700',
                'px-2.5 py-1 text-card-meta font-bold',
                'text-wtext-2 dark:text-rink-100',
                'hover:border-ice-500 hover:text-ice-500',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900',
                'transition-colors duration-150 motion-reduce:transition-none',
                'active:brightness-95',
              )}
            >
              {cls.className}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export default AcademyStudentCard;
