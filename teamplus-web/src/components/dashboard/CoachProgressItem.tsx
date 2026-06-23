'use client';

import { Icon } from '@/components/ui/Icon';

export interface CoachProgress {
  id: string;
  name: string;
  specialty: string;
  progress: number;
  color: string;
}

interface CoachProgressItemProps {
  coach: CoachProgress;
  isAnimated?: boolean;
  animationDelay?: number;
}

export function CoachProgressItem({ 
  coach, 
  isAnimated = true, 
  animationDelay = 0 
}: CoachProgressItemProps) {
  return (
    <div
      className="bg-white dark:bg-rink-800 rounded-xl p-4 shadow-sm border border-wline-2 dark:border-rink-700 flex items-center gap-4 transition-transform active:brightness-95"
    >
      <div className="relative shrink-0">
        <div className="size-12 rounded-full bg-wline dark:bg-rink-700 border border-wline-2 dark:border-rink-700 flex items-center justify-center">
          <Icon name="person" className="text-xl text-wtext-3" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <h4 className="font-bold text-wtext-1 dark:text-white truncate">
            {coach.name}{' '}
            <span className="text-xs font-normal text-wtext-3 dark:text-rink-300 ml-1">
              {coach.specialty}
            </span>
          </h4>
          <span
            className={`text-sm font-bold ${
              coach.progress >= 70
                ? 'text-ice-500 dark:text-blue-400'
                : 'text-wtext-1 dark:text-white'
            }`}
          >
            {coach.progress}%
          </span>
        </div>
        <div className="w-full bg-wline-2 dark:bg-rink-700 rounded-full h-2">
          <div
            className={`${coach.color} h-2 rounded-full transition-all duration-1000 ease-out`}
            style={{
              width: isAnimated ? `${coach.progress}%` : '0%',
              transitionDelay: `${animationDelay}ms`
            }}
          />
        </div>
      </div>
    </div>
  );
}
