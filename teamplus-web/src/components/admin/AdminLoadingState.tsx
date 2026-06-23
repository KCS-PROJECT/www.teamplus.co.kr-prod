'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

interface AdminLoadingStateProps {
  /** 로딩 메시지 (기본: MESSAGES.loading) */
  message?: string;
  /** 스피너 크기 */
  size?: 'sm' | 'md' | 'lg';
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * Admin 로딩 상태 컴포넌트
 *
 * API 데이터 로딩 중 표시하는 공통 로딩 UI.
 * 거의 모든 admin 리스트 페이지에서 사용.
 *
 * @example
 * {isLoading ? <AdminLoadingState /> : <DataList />}
 */
export function AdminLoadingState({
  message,
  size = 'md',
  className = '',
}: AdminLoadingStateProps) {
  const sizeClasses = {
    sm: 'py-8',
    md: 'py-16',
    lg: 'py-24',
  };

  const iconSizeClasses = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-4xl',
  };

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${sizeClasses[size]} ${className}`}
    >
      <Icon
        name="progress_activity"
        className={`${iconSizeClasses[size]} text-wtext-3 dark:text-rink-300 animate-spin`}
        aria-hidden="true"
      />
      <p className="text-sm text-wtext-3 dark:text-rink-300">
        {message ?? MESSAGES.loading.waitMessage}
      </p>
    </div>
  );
}
