'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * CoachSearchInput - 코치 페이지 공통 검색 입력 필드
 *
 * 사용처: coach-members, attendance-manage 등
 * 패턴: 왼쪽 검색 아이콘 + 텍스트 입력 + 선택적 오른쪽 클리어 버튼
 */
export interface CoachSearchInputProps {
  /** 검색어 값 */
  value: string;
  /** 검색어 변경 핸들러 */
  onChange: (value: string) => void;
  /** placeholder 텍스트 */
  placeholder?: string;
  /** 클리어 버튼 표시 여부 (기본: true, 값이 있을 때만 노출) */
  showClear?: boolean;
  /** 추가 className */
  className?: string;
}

export const CoachSearchInput = memo(function CoachSearchInput({
  value,
  onChange,
  placeholder = '이름으로 검색',
  showClear = true,
  className,
}: CoachSearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
        <Icon name="search" className="text-wtext-3 text-lg" aria-hidden="true" />
      </div>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
        className={cn(
          'w-full pl-11 pr-4 py-3',
          'bg-white dark:bg-rink-800',
          'border border-wline dark:border-rink-700',
          'rounded-xl text-sm text-wtext-1 dark:text-white',
          'placeholder:text-wtext-3 dark:placeholder:text-wtext-3',
          'focus:outline-none focus:ring-2 focus:ring-ice-500/20 focus:border-ice-500',
          'transition-all',
          showClear && value && 'pr-10'
        )}
      />
      {showClear && value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-3 flex items-center text-wtext-3 hover:text-wtext-2 dark:hover:text-rink-100 transition-colors"
          aria-label="검색어 지우기"
        >
          <Icon name="close" className="text-lg" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
