'use client';

import { Icon } from '@/components/ui/Icon';

interface EmptySectionProps {
  /** Material Symbols 아이콘 이름 */
  icon: string;
  /** 빈 상태 안내 메시지 */
  message: string;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 데이터가 없을 때 표시하는 빈 상태 컴포넌트
 * MESSAGES.empty() 함수와 함께 사용합니다.
 *
 * @example
 * <EmptySection icon="emoji_events" message={MESSAGES.empty('대회/이벤트')} />
 */
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
