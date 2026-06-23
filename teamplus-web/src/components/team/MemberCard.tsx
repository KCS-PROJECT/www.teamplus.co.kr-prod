'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface MemberCardProps {
  name: string;
  age: number;
  position: string;
  level: string;
  onClick?: () => void;
}

export function MemberCard({ name, age, position, level, onClick }: MemberCardProps) {
  const getLevelStyle = (lvl: string) => {
    switch (lvl) {
      case '초급': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case '중급': return 'bg-blue-100 text-ice-500 dark:bg-blue-900/30 dark:text-blue-400';
      case '고급': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      default: return 'bg-wline-2 text-wtext-2';
    }
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline dark:border-rink-700 shadow-sm active:brightness-95 transition-all cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-wline-2 dark:bg-rink-700 rounded-full flex items-center justify-center flex-shrink-0">
          <Icon name="person" className="text-xl text-wtext-3 dark:text-rink-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-wtext-1 dark:text-white">{name}</h4>
            <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full", getLevelStyle(level))}>
              {level}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-wtext-3 dark:text-rink-300 font-medium">
            <span>{age}세</span>
            <span className="text-wtext-4">•</span>
            <span>{position}</span>
          </div>
        </div>
        <Icon name="chevron_right" className="text-wtext-4" />
      </div>
    </div>
  );
}
