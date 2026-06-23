'use client';

import { MESSAGES } from '@/lib/messages';

interface GradeBadgeProps {
  grade: 1 | 2 | 3;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const GRADE_STYLE = {
  1: {
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-400',
    borderColor: 'border-amber-300 dark:border-amber-700',
    dotColor: 'bg-amber-500',
  },
  2: {
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-ice-500 dark:text-blue-400',
    borderColor: 'border-blue-300 dark:border-blue-700',
    dotColor: 'bg-blue-500',
  },
  3: {
    bgColor: 'bg-wline-2 dark:bg-rink-800',
    textColor: 'text-wtext-2 dark:text-rink-300',
    borderColor: 'border-wline dark:border-rink-700',
    dotColor: 'bg-wtext-4',
  },
} as const;

const SIZE_CONFIG = {
  sm: { badge: 'px-1.5 py-0.5 text-xs', dot: 'w-1.5 h-1.5' },
  md: { badge: 'px-2 py-1 text-sm', dot: 'w-2 h-2' },
  lg: { badge: 'px-3 py-1.5 text-base', dot: 'w-2.5 h-2.5' },
} as const;

export function GradeBadge({ grade, size = 'md', showLabel = true }: GradeBadgeProps) {
  const style = GRADE_STYLE[grade];
  const sizeConfig = SIZE_CONFIG[size];
  const label = MESSAGES.grade[grade];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${style.bgColor} ${style.textColor} ${style.borderColor} ${sizeConfig.badge}`}
    >
      <span className={`rounded-full ${style.dotColor} ${sizeConfig.dot}`} />
      {showLabel && label}
    </span>
  );
}

interface GradeInfoProps {
  grade: 1 | 2 | 3;
  totalScore: number;
  percentile: number;
  evaluationCount: number;
}

export function GradeInfo({ grade, totalScore, percentile, evaluationCount }: GradeInfoProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-wbg dark:bg-rink-800">
      <GradeBadge grade={grade} size="lg" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-wtext-1 dark:text-white">
          {MESSAGES.grade.score(totalScore, percentile)}
        </p>
        <p className="text-xs text-wtext-3 dark:text-rink-300">
          {MESSAGES.grade.evaluationCount(evaluationCount)}
        </p>
      </div>
    </div>
  );
}
