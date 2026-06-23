'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import type { AcademyCoach } from '@/hooks/useAcademy';

interface AcademyCoachListProps {
  coaches: AcademyCoach[];
  onRemove?: (coachId: string) => void;
  isLoading?: boolean;
}

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  HEAD_COACH: {
    label: '수석 코치',
    className: 'bg-ice-500/10 dark:bg-ice-500/20 text-ice-500',
  },
  ASSISTANT_COACH: {
    label: '보조 코치',
    className: 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100',
  },
};

/**
 * AcademyCoachList - 오픈클래스 코치 목록 + 제거
 */
export function AcademyCoachList({ coaches, onRemove, isLoading = false }: AcademyCoachListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-7 h-7 border-2 border-ice-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (coaches.length === 0) {
    return (
      <div className="text-center py-10">
        <Icon name="person_off" className="text-4xl text-wtext-4 dark:text-rink-500 mb-2" />
        <p className="text-sm text-wtext-3 dark:text-rink-300">
          {MESSAGES.empty('코치')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {coaches.map((coach) => {
        const roleBadge = ROLE_BADGE[coach.role.toUpperCase()] ?? ROLE_BADGE.ASSISTANT_COACH;
        const displayName = `${coach.user.lastName}${coach.user.firstName}`;

        return (
          <div
            key={coach.id}
            className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-ice-500/10 dark:bg-ice-500/20 flex items-center justify-center shrink-0">
                  <Icon name="sports" className="text-base text-ice-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-wtext-1 dark:text-white truncate">
                      {displayName}
                    </span>
                    <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', roleBadge.className)}>
                      {roleBadge.label}
                    </span>
                  </div>
                  <p className="text-xs text-wtext-3 dark:text-rink-300 truncate">
                    {coach.user.email}
                  </p>
                </div>
              </div>

              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(coach.id)}
                  className={cn(
                    'shrink-0 p-2 rounded-lg',
                    'text-wtext-3 dark:text-rink-300 hover:text-red-500 dark:hover:text-red-400',
                    'hover:bg-red-50 dark:hover:bg-red-900/10',
                    'transition-colors focus:outline-none focus:ring-2 focus:ring-red-400'
                  )}
                  aria-label={`${displayName} 코치 제거`}
                >
                  <Icon name="person_remove" className="text-lg" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default AcademyCoachList;
