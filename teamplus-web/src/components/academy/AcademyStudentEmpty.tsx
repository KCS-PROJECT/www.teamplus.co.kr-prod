'use client';

/**
 * AcademyStudentEmpty — 학원 수강생 화면 빈 상태 컴포넌트
 *
 * SPEC v3 2026-05-18 — variant 보강
 *   - no-classes: 진행중인 수업이 없습니다 (기본 모드, 활성 수업 0개)
 *   - no-students: 아직 수강생이 없습니다 (Detail 공용)
 *   - no-search-results: 검색 결과 없음
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

export type AcademyStudentEmptyVariant =
  | 'no-classes'
  | 'no-students'
  | 'no-search-results';

interface AcademyStudentEmptyProps {
  variant: AcademyStudentEmptyVariant;
  query?: string;
}

const ICON_MAP: Record<AcademyStudentEmptyVariant, string> = {
  'no-classes': 'school',
  'no-students': 'group_off',
  'no-search-results': 'search_off',
};

function resolveMessage(variant: AcademyStudentEmptyVariant, query?: string): string {
  switch (variant) {
    case 'no-classes':
      return MESSAGES.academy.students.emptyClasses;
    case 'no-students':
      return MESSAGES.academy.students.noStudents;
    case 'no-search-results':
      return MESSAGES.academy.students.noSearchResults(query ?? '');
  }
}

export function AcademyStudentEmpty({ variant, query }: AcademyStudentEmptyProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <div className="w-16 h-16 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center mb-4">
        <Icon
          name={ICON_MAP[variant]}
          className="text-[32px] text-wtext-4 dark:text-rink-500"
          aria-hidden="true"
        />
      </div>
      <p className="text-card-body font-semibold text-wtext-3 dark:text-rink-300 leading-relaxed max-w-[260px]">
        {resolveMessage(variant, query)}
      </p>
    </div>
  );
}

export default AcademyStudentEmpty;
