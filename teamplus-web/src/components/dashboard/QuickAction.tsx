'use client';

import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';

export interface QuickActionProps {
  icon: string;
  label: string;
  href: string;
  /** @deprecated 사용되지 않음. 하위 호환성을 위해 유지. */
  iconBg?: string;
  iconColor: string;
  /** 아이콘 옆 빨간 알림 dot 표시 */
  showDot?: boolean;
}

export function QuickAction({ icon, label, href, iconColor, showDot }: QuickActionProps) {
  return (
    <NavLink href={href} aria-label={label}>
      <div className="group flex flex-col items-center justify-center gap-3 rounded-2xl bg-white dark:bg-rink-800 p-6 shadow-sm border border-wline dark:border-rink-700 hover:shadow-md transition-shadow duration-200 ease-out active:brightness-95 transform-gpu">
        <div className={`flex items-center justify-center ${iconColor} group-hover:scale-110 transition-transform duration-200 ease-out transform-gpu will-change-transform`}>
          <Icon name={icon} className="text-[42px]" filled weight={300} size={42} aria-hidden="true" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-wtext-1 dark:text-rink-100 font-bold text-card-title">{label}</span>
          {showDot && (
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" aria-label="새 알림" />
          )}
        </div>
      </div>
    </NavLink>
  );
}
