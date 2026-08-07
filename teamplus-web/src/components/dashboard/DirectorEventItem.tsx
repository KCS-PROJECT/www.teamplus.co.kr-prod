'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

export interface UpcomingEvent {
  id: string;
  title: string;
  location: string;
  /** null = 일정 미정 대회 — 날짜 배지 대신 "일정 미정" 표기, D-day 미표시. */
  month: string | null;
  day: string | null;
  dDay: number | null;
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
          {event.month != null && event.day != null ? (
            <>
              <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
                {event.month}
              </span>
              <span className="text-xl font-extrabold text-wtext-1 dark:text-white leading-none mt-0.5">
                {event.day}
              </span>
            </>
          ) : (
            <span className="px-1 text-center text-card-meta font-bold leading-tight text-wtext-3 dark:text-rink-300">
              {MESSAGES.tournament.datesTbd}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="font-bold text-wtext-1 dark:text-white truncate">
              {event.title}
            </h4>
            {event.dDay != null && (
              <span
                className={`text-card-meta font-bold px-1.5 py-0.5 rounded border ${
                  event.isPriority
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/30'
                    : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 border-wline dark:border-rink-700'
                }`}
              >
                D-{event.dDay}
              </span>
            )}
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
