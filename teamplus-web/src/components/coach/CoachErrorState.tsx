'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

/**
 * CoachErrorState - 코치 페이지 공통 에러 상태 (전체 화면)
 *
 * 사용처: coach 대시보드 등 데이터 로드 실패 시 전체 화면 에러
 * 패턴: 에러 아이콘 + 제목 + 설명 + 재시도 버튼
 */
export interface CoachErrorStateProps {
  /** 재시도 핸들러 */
  onRetry: () => void;
  /** 에러 제목 (기본: MESSAGES.dashboard.errorTitle) */
  title?: string;
  /** 에러 설명 (기본: MESSAGES.error.network) */
  description?: string;
  /** 재시도 버튼 라벨 (기본: MESSAGES.dashboard.errorRetry) */
  retryLabel?: string;
  /** MobileContainer hasBottomNav prop */
  hasBottomNav?: boolean;
  /** 추가 className */
  className?: string;
}

export const CoachErrorState = memo(function CoachErrorState({
  onRetry,
  title,
  description,
  retryLabel,
  hasBottomNav = false,
  className,
}: CoachErrorStateProps) {
  return (
    <MobileContainer hasBottomNav={hasBottomNav}>
      <div className={cn('flex-1 flex flex-col items-center justify-center px-6 gap-4', className)}>
        <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <Icon
            name="error_outline"
            className="text-3xl text-red-500 dark:text-red-400"
            aria-hidden="true"
          />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-wtext-1 dark:text-white mb-1">
            {title ?? MESSAGES.dashboard.errorTitle}
          </h2>
          <p className="text-sm text-wtext-3 dark:text-rink-300">
            {description ?? MESSAGES.error.network}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 px-6 py-3 bg-ice-500 hover:bg-ice-700 text-white font-semibold rounded-xl transition-colors motion-reduce:transition-none active:brightness-95"
        >
          {retryLabel ?? MESSAGES.dashboard.errorRetry}
        </button>
      </div>
    </MobileContainer>
  );
});
