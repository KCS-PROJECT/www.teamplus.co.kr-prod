'use client';

import { Icon } from '@/components/ui/Icon';

export interface UpcomingEvent {
  id: string;
  title: string;
  location: string;
  month: string;
  day: string;
  dDay: number;
  isPriority: boolean;
}

interface DirectorEventItemProps {
  event: UpcomingEvent;
  onMenuClick: (eventId: string) => void;
}

export function DirectorEventItem({ event, onMenuClick }: DirectorEventItemProps) {
  return (
    <div
      className="relative bg-white dark:bg-rink-800 rounded-xl shadow-sm border border-wline-2 dark:border-rink-700 overflow-hidden flex"
    >
      <div className="flex-1 flex items-center p-4 gap-4">
        <div className="flex flex-col items-center justify-center min-w-[52px] bg-wbg dark:bg-rink-700 rounded-lg py-2 border border-wline-2 dark:border-rink-700">
          <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
            {event.month}
          </span>
          <span className="text-xl font-extrabold text-wtext-1 dark:text-white leading-none mt-0.5">
            {event.day}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="font-bold text-wtext-1 dark:text-white truncate">
              {event.title}
            </h4>
            <span
              className={`text-card-meta font-bold px-1.5 py-0.5 rounded border ${
                event.isPriority
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/30'
                  : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 border-wline dark:border-rink-700'
              }`}
            >
              D-{event.dDay}
            </span>
          </div>
          <p className="text-sm text-wtext-3 dark:text-rink-300 flex items-center gap-1">
            <Icon name="location_on" className="text-[14px]" />
            {event.location}
          </p>
        </div>
        <button
          onClick={() => onMenuClick(event.id)}
          className="text-wtext-4 dark:text-rink-500 hover:text-ice-500 transition-colors"
          aria-label="일정 메뉴"
        >
          <Icon name="more_vert" />
        </button>
      </div>
    </div>
  );
}
