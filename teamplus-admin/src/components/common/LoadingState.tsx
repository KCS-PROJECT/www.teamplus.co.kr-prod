'use client';

/**
 * LoadingState - 스켈레톤/스피너 공통 로딩 상태 컴포넌트
 * 기존 LoadingSpinner를 래핑하여 일관된 인터페이스 제공
 */

import { LoadingSpinner, SkeletonTable, SkeletonCard } from '@/components/ui/loading-spinner';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
  /** 로딩 타입 */
  type?: 'spinner' | 'skeleton-table' | 'skeleton-card';
  /** 로딩 메시지 */
  message?: string;
  /** 스켈레톤 카드 수 */
  count?: number;
  /** 스켈레톤 테이블 행 수 */
  rows?: number;
  /** 스켈레톤 테이블 열 수 */
  columns?: number;
  /** 최소 높이 */
  minHeight?: number;
  /** 추가 클래스 */
  className?: string;
}

export function LoadingState({
  type = 'spinner',
  message = '로딩 중...',
  count = 3,
  rows = 5,
  columns = 4,
  minHeight = 300,
  className,
}: LoadingStateProps) {
  if (type === 'skeleton-table') {
    return (
      <div className={cn('rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden', className)}>
        <SkeletonTable rows={rows} columns={columns} />
      </div>
    );
  }

  if (type === 'skeleton-card') {
    return (
      <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
        <SkeletonCard count={count} />
      </div>
    );
  }

  return (
    <LoadingSpinner
      message={message}
      minHeight={minHeight}
      className={className}
    />
  );
}

export default LoadingState;
