'use client';

import { memo } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

/**
 * ChildErrorState - 아동 친화적 에러 상태 화면
 *
 * WCAG AAA: 72px 버튼, 7:1 대비율, 큰 텍스트(text-2xl),
 * 쉬운 한국어 메시지, 큰 이모지
 *
 * 사용처: child 대시보드, child 서브페이지 에러 상태
 */

interface ChildErrorStateProps {
  /** 재시도 핸들러 */
  onRetry: () => void;
  /** 제목 (기본: '앗, 문제가 생겼어!') */
  title?: string;
  /** 설명 메시지 (기본: MESSAGES.error.network) */
  message?: string;
  /** 이모지 (기본: 슬픈 얼굴) */
  emoji?: string;
  /** 재시도 버튼 텍스트 (기본: '다시 시도') */
  retryLabel?: string;
  /** BottomNav 포함 여부 */
  hasBottomNav?: boolean;
}

export const ChildErrorState = memo(function ChildErrorState({
  onRetry,
  title = '앗, 문제가 생겼어!',
  message,
  emoji = '\uD83D\uDE22',
  retryLabel = '다시 시도',
  hasBottomNav = false,
}: ChildErrorStateProps) {
  return (
    <MobileContainer hasBottomNav={hasBottomNav}>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
        <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <span className="text-5xl">{emoji}</span>
        </div>
        <div className="text-center">
          <h2 className="text-card-section-child mb-2">
            {title}
          </h2>
          <p className="text-card-title-child font-bold !text-wtext-3 dark:!text-rink-300">
            {message ?? MESSAGES.error.network}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="min-h-[72px] min-w-[72px] px-8 bg-ice-500 hover:bg-ice-700 text-white text-card-title-child font-bold rounded-2xl flex items-center justify-center gap-2 active:brightness-95 transition-colors"
          aria-label={retryLabel}
        >
          <Icon name="refresh" className="text-2xl" aria-hidden="true" />
          <span>{retryLabel}</span>
        </button>
      </div>
    </MobileContainer>
  );
});
