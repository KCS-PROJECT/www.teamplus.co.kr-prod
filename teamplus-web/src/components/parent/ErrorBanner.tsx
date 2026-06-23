'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

/**
 * ErrorBanner - 인라인 에러 배너
 *
 * 전체 화면을 가리지 않고, 섹션 내에서 에러를 표시합니다.
 * 재시도 버튼으로 데이터를 다시 불러올 수 있습니다.
 */
interface ErrorBannerProps {
  /** 에러 메시지 (기본: MESSAGES.error.network) */
  message?: string;
  /** 재시도 콜백 */
  onRetry?: () => void;
  /** 추가 className */
  className?: string;
}

export function ErrorBanner({
  message,
  onRetry,
  className = '',
}: ErrorBannerProps) {
  return (
    <div
      className={`rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 flex items-center gap-3 ${className}`}
    >
      <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
        <Icon
          name="error_outline"
          className="text-red-500 text-lg"
          aria-hidden="true"
        />
      </div>
      <p className="text-sm text-red-700 dark:text-red-400 flex-1">
        {message ?? MESSAGES.error.network}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm font-semibold text-red-600 dark:text-red-400 hover:text-red-700 shrink-0 px-3 py-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          aria-label="다시 시도"
        >
          재시도
        </button>
      )}
    </div>
  );
}
