'use client';

import { MESSAGES } from '@/lib/messages';

/**
 * RefreshSpinner - Pull to Refresh 인라인 로딩 표시
 *
 * 대시보드 새로고침 시 상단에 표시되는 컴팩트 로딩 인디케이터입니다.
 */
interface RefreshSpinnerProps {
  /** 표시 여부 */
  show: boolean;
  /** 로딩 텍스트 (기본: MESSAGES.loading) */
  text?: string;
}

export function RefreshSpinner({ show, text }: RefreshSpinnerProps) {
  if (!show) return null;

  return (
    <div className="flex justify-center py-2">
      <div className="flex items-center gap-2 text-sm text-wtext-3 dark:text-rink-300">
        <div className="w-4 h-4 border-2 border-wline dark:border-rink-700 border-t-primary rounded-full animate-spin" />
        <span>{text ?? MESSAGES.loading.waitMessage}</span>
      </div>
    </div>
  );
}
