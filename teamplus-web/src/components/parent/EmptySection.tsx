'use client';

import { Icon } from '@/components/ui/Icon';

/**
 * EmptySection - 데이터가 없을 때 표시하는 빈 상태 카드
 *
 * 아이콘과 메시지를 받아 카드 형태로 보여줍니다.
 * MESSAGES.empty() 등과 함께 사용합니다.
 */
interface EmptySectionProps {
  /** Material Symbols 아이콘명 */
  icon: string;
  /** 표시할 메시지 (예: MESSAGES.empty('자녀')) */
  message: string;
  /** 추가 className */
  className?: string;
}

export function EmptySection({ icon, message, className = '' }: EmptySectionProps) {
  return (
    <div
      className={`bg-white dark:bg-rink-800 rounded-xl p-8 border border-wline-2 dark:border-rink-700 flex flex-col items-center justify-center gap-2 ${className}`}
    >
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
    </div>
  );
}
