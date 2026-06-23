'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export interface ScheduleItemProps {
  time: string;
  /** 수업 시작 시각 ISO — attendance-window 헬퍼와 연동 (옵셔널) */
  scheduledDate?: string;
  title: string;
  location: string;
  attendees?: number;
  status: 'completed' | 'current' | 'upcoming';
}

export const ScheduleItem = memo(function ScheduleItem({ 
  time, 
  title, 
  location, 
  attendees, 
  status 
}: ScheduleItemProps) {
  const isCompleted = status === 'completed';
  const isCurrent = status === 'current';

  return (
    <div className="group relative grid grid-cols-[44px_1fr] gap-x-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full z-10',
            isCompleted && 'bg-wline-2 dark:bg-rink-800 border border-wline dark:border-rink-700',
            isCurrent && 'bg-ice-500 text-white shadow-md ring-4 ring-white dark:ring-rink-900',
            status === 'upcoming' && 'bg-wbg dark:bg-rink-800 border border-wline dark:border-rink-700'
          )}
        >
          {isCompleted ? (
            <Icon name="check" className="text-wtext-3 text-xl" />
          ) : isCurrent ? (
            <Icon name="sports_hockey" className="text-xl" />
          ) : (
            <span className="text-xs font-bold text-wtext-3">PM</span>
          )}
        </div>
      </div>

      <div
        className={cn(
          'flex flex-col rounded-xl p-4 transition-colors',
          isCompleted && 'bg-wbg dark:bg-white/5',
          isCurrent && 'bg-white dark:bg-rink-800 border border-ice-500/20 shadow-sm relative overflow-hidden',
          status === 'upcoming' && 'bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700'
        )}
      >
        {isCurrent && <div className="absolute left-0 top-0 bottom-0 w-1 bg-ice-500" />}
        <div className="flex justify-between items-start">
          <div>
            <span
              className={cn(
                'text-card-meta font-semibold',
                isCurrent && '!text-ice-500 font-bold',
              )}
            >
              {time}
            </span>
            <h4
              className={cn(
                'text-card-title mt-1',
                isCompleted && 'line-through decoration-slate-400',
              )}
            >
              {title}
            </h4>
          </div>
          {isCurrent && (
            <span className="rounded-full bg-ice-500/10 px-2 py-1 text-card-meta font-bold !text-ice-500">진행 예정</span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Icon name="location_on" className="text-sm" />
            <span className="text-card-meta font-medium">{location}</span>
          </div>
          {attendees !== undefined && (
            <div className="flex items-center gap-1">
              <Icon name="group" className="text-sm" />
              <span className="text-card-meta font-medium">{attendees}명 참석</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
