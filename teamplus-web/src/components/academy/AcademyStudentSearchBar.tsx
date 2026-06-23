'use client';

/**
 * AcademyStudentSearchBar — 학원 수강생 검색바
 * SPEC_ACADEMY_STUDENTS_REDESIGN_V2.md (2026-05-18) §4.2
 *
 * v2: 정렬/필터 칩 제거. 검색 input + clear 버튼만 유지.
 *   - 학생 단위 단일 리스트로 전환되며 정렬은 기본(최근 등록순) 고정
 *   - 필터는 활성 수업의 paid enrollment 만 노출로 자동 처리
 *
 * 기존 `ChipOption` 타입 export 는 호환성을 위해 보존 (사용처 없음 — 향후 제거 가능).
 */

import { useId } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

/**
 * @deprecated v2 — 칩 옵션은 더 이상 사용되지 않습니다.
 * SearchBar 가 검색 input 만 노출하도록 단순화됨.
 */
export interface ChipOption<T extends string> {
  key: T;
  label: string;
}

interface AcademyStudentSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function AcademyStudentSearchBar({
  query,
  onQueryChange,
  placeholder,
  ariaLabel,
}: AcademyStudentSearchBarProps) {
  const inputId = useId();
  const hasQuery = query.length > 0;

  return (
    <div className="relative">
      <Icon
        name="search"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-wtext-3 dark:text-rink-300"
        aria-hidden="true"
      />
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder ?? MESSAGES.academy.students.searchStudentPlaceholder}
        aria-label={ariaLabel ?? MESSAGES.academy.students.searchAriaLabel}
        className={cn(
          'w-full h-11 pl-10 pr-10 rounded-w-pill',
          'bg-wsurface dark:bg-rink-800',
          'border border-wline dark:border-rink-700',
          'text-card-body font-medium text-wtext-1 dark:text-white',
          'placeholder:text-wtext-4 dark:placeholder:text-rink-500',
          'focus:outline-none focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20',
          'transition-colors duration-150 motion-reduce:transition-none',
        )}
      />
      {hasQuery && (
        <button
          type="button"
          onClick={() => onQueryChange('')}
          aria-label={MESSAGES.academy.students.clearSearch}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2',
            'inline-flex w-7 h-7 items-center justify-center rounded-w-pill',
            'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100',
            'hover:bg-wline dark:hover:bg-rink-500 active:brightness-95',
            'transition-colors duration-150 motion-reduce:transition-none',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500',
          )}
        >
          <Icon name="close" className="text-[16px]" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default AcademyStudentSearchBar;
