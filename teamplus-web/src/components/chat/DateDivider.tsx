'use client';

import { cn } from '@/lib/utils';

/**
 * DateDivider Component - TEAMPLUS Chat Design System
 * Design 7 Principles Applied:
 * - Solid colors, no gradients
 * - Clean pill-shaped badge
 * - Subtle shadow for depth
 */

interface DateDividerProps {
  date: string;
  className?: string;
}

export function DateDivider({ date, className }: DateDividerProps) {
  return (
    <div className={cn('flex justify-center py-2', className)}>
      <span
        className={cn(
          'px-3 py-1 rounded-full',
          'bg-wline-2 dark:bg-rink-800',
          'text-card-meta font-medium',
          'text-wtext-3 dark:text-rink-300',
          'shadow-sm',
          'border border-wline-2 dark:border-rink-700/50'
        )}
      >
        {date}
      </span>
    </div>
  );
}

/**
 * SystemMessage Component
 * For system notifications within chat (e.g., user joined, settings changed)
 */
interface SystemMessageProps {
  message: string;
  icon?: string;
  className?: string;
}

export function SystemMessage({ message, icon, className }: SystemMessageProps) {
  return (
    <div className={cn('flex justify-center py-2', className)}>
      <span
        className={cn(
          'px-3 py-1.5 rounded-lg',
          'bg-wbg dark:bg-rink-800/50',
          'text-card-meta font-medium',
          'text-wtext-3 dark:text-rink-300',
          'flex items-center gap-1.5'
        )}
      >
        {icon && (
          <span className="material-symbols-outlined text-sm">{icon}</span>
        )}
        {message}
      </span>
    </div>
  );
}

/**
 * UnreadDivider Component
 * Shows where unread messages start
 */
interface UnreadDividerProps {
  count?: number;
  className?: string;
}

export function UnreadDivider({ count, className }: UnreadDividerProps) {
  return (
    <div className={cn('flex items-center gap-3 py-3', className)}>
      <div className="flex-1 h-px bg-ice-500/20 dark:bg-ice-500/30" />
      <span
        className={cn(
          'px-3 py-1 rounded-full',
          'bg-ice-500/10 dark:bg-ice-500/20',
          'text-card-meta font-semibold',
          'text-ice-500 dark:text-ice-500-light'
        )}
      >
        {count ? `${count}개의 새 메시지` : '새 메시지'}
      </span>
      <div className="flex-1 h-px bg-ice-500/20 dark:bg-ice-500/30" />
    </div>
  );
}
