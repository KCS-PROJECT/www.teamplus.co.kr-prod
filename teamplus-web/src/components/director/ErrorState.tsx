'use client';

import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { MESSAGES } from '@/lib/messages';

interface ErrorStateProps {
  /** 재시도 콜백 */
  onRetry: () => void;
  /** 제목 (기본: '데이터를 불러올 수 없습니다') */
  title?: string;
  /** 설명 메시지 (기본: MESSAGES.error.network) */
  description?: string;
  /** BottomNav 여백 포함 여부 */
  hasBottomNav?: boolean;
}

/**
 * 전체 화면 에러 상태 컴포넌트
 * API 호출 실패 등의 상황에서 사용합니다.
 */
export function ErrorState({
  onRetry,
  title = MESSAGES.dashboard.errorTitle,
  description = MESSAGES.error.network,
  hasBottomNav = true,
}: ErrorStateProps) {
  return (
    <MobileContainer hasBottomNav={hasBottomNav}>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <Icon
            name="error_outline"
            className="text-3xl text-red-500 dark:text-red-400"
            aria-hidden="true"
          />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-wtext-1 dark:text-white mb-1">
            {title}
          </h2>
          <p className="text-sm text-wtext-3 dark:text-rink-300">
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 px-6 py-3 bg-ice-500 hover:bg-ice-700 text-white font-semibold rounded-xl transition-colors motion-reduce:transition-none active:brightness-95"
        >
          {MESSAGES.dashboard.errorRetry}
        </button>
      </div>
    </MobileContainer>
  );
}
