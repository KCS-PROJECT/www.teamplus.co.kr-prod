'use client';

import { memo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';

/**
 * LoadingState - 공통 로딩 상태 컴포넌트
 *
 * 데이터를 불러오는 중일 때 사용하는 표준 컴포넌트입니다.
 * Spinner + 메시지 조합으로, 페이지 전체 또는 섹션 내부에서 사용합니다.
 *
 * 기존 Spinner/FullScreenLoader와의 차이:
 * - Spinner: 단독 아이콘만 표시
 * - FullScreenLoader: 전체 화면 오버레이 + 스크롤 잠금
 * - LoadingState: 섹션/컨텐츠 영역 내 로딩 표시 (메시지 포함)
 *
 * @example
 * // 기본 사용
 * <LoadingState />
 *
 * // 커스텀 메시지
 * <LoadingState message="수업 목록을 불러오는 중..." />
 *
 * // 작은 크기 (카드 내부)
 * <LoadingState size="sm" />
 *
 * // 큰 크기 (전체 페이지)
 * <LoadingState size="lg" message="잠시만 기다려주세요..." />
 */

type LoadingStateSize = 'sm' | 'md' | 'lg';

interface LoadingStateProps {
  /** 로딩 메시지 (기본: MESSAGES.loading) */
  message?: string;
  /** 크기: sm | md | lg */
  size?: LoadingStateSize;
  /** 추가 CSS 클래스 */
  className?: string;
}

const sizeConfig: Record<LoadingStateSize, {
  container: string;
  spinner: 'sm' | 'md' | 'lg';
  text: string;
}> = {
  sm: {
    container: 'py-8 gap-2',
    spinner: 'sm',
    text: 'text-xs',
  },
  md: {
    container: 'py-12 gap-3',
    spinner: 'md',
    text: 'text-sm',
  },
  lg: {
    container: 'py-20 gap-4',
    spinner: 'lg',
    text: 'text-base',
  },
};

export const LoadingState = memo(function LoadingState({
  message = MESSAGES.loading.waitMessage,
  size = 'md',
  className,
}: LoadingStateProps) {
  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-4',
        config.container,
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <Spinner size={config.spinner} color="primary" />
      {message && (
        <p className={cn(config.text, 'font-medium text-wtext-3 dark:text-rink-300')}>
          {message}
        </p>
      )}
    </div>
  );
});

export default LoadingState;
