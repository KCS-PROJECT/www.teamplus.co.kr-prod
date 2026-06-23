'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export interface DrawerStatItem {
  icon: string;
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'warning' | 'error' | 'info';
}

interface DrawerStatsBentoProps {
  items: DrawerStatItem[];
  className?: string;
}

const TONE_STYLES: Record<DrawerStatItem['tone'], { iconBg: string; iconText: string; valueText: string }> = {
  primary: {
    iconBg: 'bg-ice-500/10 dark:bg-ice-500/20',
    iconText: 'text-ice-500',
    valueText: 'text-ice-500',
  },
  success: {
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    valueText: 'text-emerald-700 dark:text-emerald-400',
  },
  warning: {
    iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    iconText: 'text-amber-600 dark:text-amber-400',
    valueText: 'text-amber-700 dark:text-amber-400',
  },
  error: {
    iconBg: 'bg-rose-50 dark:bg-rose-900/30',
    iconText: 'text-rose-600 dark:text-rose-400',
    valueText: 'text-rose-700 dark:text-rose-400',
  },
  info: {
    iconBg: 'bg-sky-50 dark:bg-sky-900/30',
    iconText: 'text-sky-600 dark:text-sky-400',
    valueText: 'text-sky-700 dark:text-sky-400',
  },
};

/**
 * DrawerStatsBento — Drawer 메뉴 내부 Bento 스타일 통계 카드 (2 columns)
 * 역할별 주요 수치를 한눈에 보여준다.
 */
export function DrawerStatsBento({ items, className }: DrawerStatsBentoProps) {
  if (items.length === 0) return null;

  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      {items.slice(0, 4).map((item, idx) => {
        const tone = TONE_STYLES[item.tone];
        return (
          <div
            key={`${item.label}-${idx}`}
            className="bg-white dark:bg-rink-800 p-4 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm flex flex-col justify-between min-h-[108px]"
          >
            <span
              className={cn(
                'inline-flex items-center justify-center w-9 h-9 rounded-xl',
                tone.iconBg,
                tone.iconText,
              )}
            >
              <Icon name={item.icon} className="text-[20px]" aria-hidden="true" />
            </span>
            <div className="mt-3">
              <p className="text-[11px] text-wtext-3 dark:text-rink-300 font-medium">
                {item.label}
              </p>
              <p className={cn('text-xl font-bold mt-0.5', tone.valueText)}>
                {item.value}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
