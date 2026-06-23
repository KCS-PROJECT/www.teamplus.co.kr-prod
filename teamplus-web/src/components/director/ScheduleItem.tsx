'use client';

import { Icon } from '@/components/ui/Icon';

export interface ScheduleData {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
}

interface ScheduleItemProps {
  item: ScheduleData;
  /** 클릭 핸들러 */
  onClick?: (id: string) => void;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 감독 일정 아이템 컴포넌트
 * 감독 일정 관리 페이지에서 사용합니다.
 *
 * @example
 * <ScheduleItem
 *   item={{ id: '1', title: '감독 회의', date: '1월 16일', time: '09:00', location: '팀 라운지' }}
 *   onClick={(id) => navigate(`/director-schedules/${id}`)}
 * />
 */
export function ScheduleItem({ item, onClick, className = '' }: ScheduleItemProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(item.id)}
      className={`w-full text-left bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline-2 dark:border-rink-700 shadow-sm hover:border-wline dark:hover:border-rink-700 transition-colors motion-reduce:transition-none active:brightness-95 ${className}`}
    >
      <div className="space-y-1">
        <h2 className="text-base font-bold text-wtext-1 dark:text-white">
          {item.title}
        </h2>
        <p className="text-xs text-wtext-3 dark:text-rink-300 flex items-center gap-1">
          <Icon name="schedule" className="text-sm" aria-hidden="true" />
          {item.date} {item.time}
        </p>
        <p className="text-xs text-wtext-3 dark:text-rink-300 flex items-center gap-1">
          <Icon name="location_on" className="text-sm" aria-hidden="true" />
          {item.location}
        </p>
      </div>
    </button>
  );
}
