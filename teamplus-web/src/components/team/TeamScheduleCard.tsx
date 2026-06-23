'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface TeamScheduleCardProps {
  date: string;
  day: string;
  time: string;
  title: string;
  location: string;
  type: 'training' | 'match' | 'competition' | string;
}

export function TeamScheduleCard({ 
  date, 
  day, 
  time, 
  title, 
  location, 
  type 
}: TeamScheduleCardProps) {
  const getStyle = (t: string) => {
    switch (t) {
      case 'training': return 'bg-blue-100 text-ice-500 dark:bg-blue-900/30 dark:text-blue-400';
      case 'match': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'competition': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      default: return 'bg-wline-2 text-wtext-2';
    }
  };

  const getLabel = (t: string) => {
    switch (t) {
      case 'training': return '훈련';
      case 'match': return '경기';
      case 'competition': return '대회';
      default: return '기타';
    }
  };

  const formattedDate = date.split('-').slice(1).join('/');

  return (
    <div className="bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline dark:border-rink-700 shadow-sm">
      <div className="flex gap-4">
        <div className="flex flex-col items-center justify-center w-14 h-14 bg-wbg dark:bg-rink-700 rounded-lg shrink-0">
          <span className="text-[10px] text-wtext-3 dark:text-rink-300 font-bold">{formattedDate}</span>
          <span className="text-lg font-black text-wtext-1 dark:text-white leading-tight">{day}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full", getStyle(type))}>
              {getLabel(type)}
            </span>
          </div>
          <h4 className="font-bold text-wtext-1 dark:text-white mt-1 truncate">
            {title}
          </h4>
          <div className="flex flex-col gap-0.5 mt-1.5">
            <div className="flex items-center gap-1.5 text-xs text-wtext-3 dark:text-rink-300 font-medium">
              <Icon name="schedule" className="text-sm" />
              {time}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-wtext-3 dark:text-rink-300 font-medium">
              <Icon name="location_on" className="text-sm" />
              {location}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
