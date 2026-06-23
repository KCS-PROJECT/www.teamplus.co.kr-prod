'use client';

import { Icon } from '@/components/ui/Icon';

interface EmptyStateProps {
  /** Material Symbols 아이콘 이름 */
  icon: string;
  /** 빈 상태 안내 메시지 */
  message: string;
  /** 추가 설명 텍스트 (선택) */
  description?: string;
  /** 카드 배경 포함 여부 (기본: true) */
  withCard?: boolean;
  className?: string;
}

/**
 * 데이터가 없을 때 표시하는 빈 상태 컴포넌트
 * 아이콘 + 메시지 + 선택적 설명으로 구성
 */
export function EmptyState({
  icon,
  message,
  description,
  withCard = true,
  className = '',
}: EmptyStateProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-2 py-6">
      <div className="w-12 h-12 rounded-full bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
        <Icon
          name={icon}
          className="text-2xl text-wtext-3 dark:text-rink-300"
          aria-hidden="true"
        />
      </div>
      <p className="text-sm text-wtext-3 dark:text-rink-300 text-center">
        {message}
      </p>
      {description && (
        <p className="text-xs text-wtext-3 dark:text-rink-300 text-center">
          {description}
        </p>
      )}
    </div>
  );

  if (!withCard) {
    return <div className={className}>{content}</div>;
  }

  return (
    <div
      className={`bg-white dark:bg-rink-800 rounded-xl p-8 border border-wline-2 dark:border-rink-700 ${className}`}
    >
      {content}
    </div>
  );
}
