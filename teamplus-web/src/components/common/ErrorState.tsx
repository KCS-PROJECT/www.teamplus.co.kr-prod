'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';

/**
 * ErrorState - 공통 에러 상태 컴포넌트
 *
 * API 호출 실패 등 에러 발생 시 사용하는 표준 컴포넌트입니다.
 * 에러 아이콘 + 제목 + 설명 + 재시도 버튼 구성.
 *
 * 이전 중복: parent/ErrorState, teen/ErrorState, director/ErrorState
 *   → 이 컴포넌트로 통합 권장
 *
 * 기존 도메인별 ErrorState와의 차이:
 * - MobileContainer 래핑 없음 (호출 측에서 결정)
 * - onRetry 선택적 (재시도 불필요한 경우 대응)
 * - 커스텀 아이콘 지원
 *
 * @example
 * // 기본 사용
 * <ErrorState onRetry={refetch} />
 *
 * // 커스텀 메시지
 * <ErrorState
 *   title="수업 정보를 불러올 수 없습니다"
 *   message="네트워크 연결을 확인해주세요."
 *   onRetry={refetch}
 * />
 *
 * // 재시도 버튼 없이
 * <ErrorState
 *   title="접근 권한이 없습니다"
 *   message="관리자에게 문의해주세요."
 * />
 *
 * // 컴팩트 (카드 내부)
 * <ErrorState size="sm" onRetry={refetch} />
 */

type ErrorStateSize = 'sm' | 'md' | 'lg';

interface ErrorStateProps {
  /** 에러 제목 (기본: MESSAGES.error.title) */
  title?: string;
  /** 에러 설명 메시지 (기본: MESSAGES.error.network) */
  message?: string;
  /** 재시도 콜백 (선택, 없으면 재시도 버튼 미표시) */
  onRetry?: () => void;
  /** 재시도 버튼 라벨 (기본: MESSAGES.dashboard.errorRetry) */
  retryLabel?: string;
  /** Material Symbols 아이콘 이름 (기본: 'error_outline') */
  icon?: string;
  /** 크기: sm | md | lg */
  size?: ErrorStateSize;
  /** 추가 CSS 클래스 */
  className?: string;
}

const sizeConfig: Record<ErrorStateSize, {
  container: string;
  iconWrapper: string;
  iconSize: string;
  title: string;
  message: string;
  button: string;
}> = {
  sm: {
    container: 'py-8 gap-3',
    iconWrapper: 'w-12 h-12',
    iconSize: 'text-2xl',
    title: 'text-sm font-semibold',
    message: 'text-xs',
    button: 'px-4 py-2 text-xs',
  },
  md: {
    container: 'py-12 gap-4',
    iconWrapper: 'w-16 h-16',
    iconSize: 'text-3xl',
    title: 'text-lg font-bold',
    message: 'text-sm',
    button: 'px-6 py-3 text-sm',
  },
  lg: {
    container: 'py-20 gap-4',
    iconWrapper: 'w-20 h-20',
    iconSize: 'text-4xl',
    title: 'text-xl font-bold',
    message: 'text-base',
    button: 'px-8 py-3.5 text-base',
  },
};

export const ErrorState = memo(function ErrorState({
  title = MESSAGES.error.title,
  message = MESSAGES.error.network,
  onRetry,
  retryLabel = MESSAGES.dashboard.errorRetry,
  icon = 'error_outline',
  size = 'md',
  className,
}: ErrorStateProps) {
  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        config.container,
        className,
      )}
      role="alert"
    >
      <div
        className={cn(
          config.iconWrapper,
          'rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center',
        )}
      >
        <Icon
          name={icon}
          className={cn(config.iconSize, 'text-red-500 dark:text-red-400')}
          aria-hidden="true"
        />
      </div>
      <div className="text-center">
        <h2 className={cn(config.title, 'text-wtext-1 dark:text-white mb-1')}>
          {title}
        </h2>
        <p className={cn(config.message, 'text-wtext-3 dark:text-rink-300')}>
          {message}
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            config.button,
            'bg-ice-500 hover:bg-ice-700 text-white font-semibold rounded-xl transition-colors active:brightness-95',
          )}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
});

export default ErrorState;
