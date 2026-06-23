'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * CoachEmptyState - 코치 페이지 공통 빈 상태 표시
 *
 * 사용처: 모든 코치 페이지 목록이 비어있을 때
 * 패턴: 아이콘 + 메시지 (+ 선택적 액션 버튼)
 *
 * 변형:
 * - variant="card": 카드 형태 (bg-white 배경, 테두리)
 * - variant="inline": 인라인 (배경 없음, 패딩만)
 */
export interface CoachEmptyStateProps {
  /** Material Symbols 아이콘 이름 */
  icon: string;
  /** 표시 메시지 */
  message: string;
  /** 보조 설명 (선택) */
  description?: string;
  /** 변형: card(카드 형태) | inline(인라인) */
  variant?: 'card' | 'inline';
  /** 액션 버튼 라벨 (선택) */
  actionLabel?: string;
  /** 액션 버튼 클릭 핸들러 */
  onAction?: () => void;
  /** 추가 className */
  className?: string;
}

export const CoachEmptyState = memo(function CoachEmptyState({
  icon,
  message,
  description,
  variant = 'card',
  actionLabel,
  onAction,
  className,
}: CoachEmptyStateProps) {
  const isCard = variant === 'card';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2',
        isCard
          ? 'bg-white dark:bg-rink-800 rounded-xl p-8 border border-wline-2 dark:border-rink-700'
          : 'py-16',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full',
          isCard ? 'w-12 h-12 bg-wline-2 dark:bg-rink-700' : 'w-14 h-14 bg-wbg dark:bg-rink-800'
        )}
      >
        <Icon
          name={icon}
          className={cn(
            isCard ? 'text-2xl text-wtext-3 dark:text-rink-300' : 'text-3xl text-wtext-4 dark:text-rink-500'
          )}
          aria-hidden="true"
        />
      </div>
      <p className="text-sm text-wtext-3 dark:text-rink-300 text-center font-medium mt-1">
        {message}
      </p>
      {description && (
        <p className="text-xs text-wtext-3 dark:text-rink-300 text-center max-w-[240px]">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 px-5 py-2.5 bg-ice-500 hover:bg-ice-700 text-white text-sm font-semibold rounded-xl transition-colors active:brightness-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
});
