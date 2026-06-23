'use client';

import { Icon } from '@/components/ui/Icon';

interface SkillStatCardProps {
  icon: string;
  label: string;
  score: number;
  highlight?: string;
}

export function SkillStatCard({
  icon,
  label,
  score,
  highlight,
}: SkillStatCardProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-white dark:bg-rink-800 rounded-lg border border-wline-2 dark:border-rink-700 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="bg-blue-50 dark:bg-ice-500/20 p-1.5 rounded text-ice-500">
          <Icon name={icon} className="text-[18px]" />
        </div>
        <span className="text-sm font-medium text-wtext-2 dark:text-rink-100">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {highlight && (
          <span className="text-xs text-ice-500 bg-ice-500/10 px-1.5 py-0.5 rounded font-medium">
            {highlight}
          </span>
        )}
        <span className="text-sm font-bold text-wtext-1 dark:text-white">{score}</span>
      </div>
    </div>
  );
}
