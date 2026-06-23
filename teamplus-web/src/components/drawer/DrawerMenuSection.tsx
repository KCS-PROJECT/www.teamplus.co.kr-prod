'use client';

import { type MouseEvent } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export interface DrawerSubMenuItem {
  href: string;
  icon: string;
  label: string;
  badge?: boolean;
}

interface DrawerMenuSectionProps {
  id: string;
  icon: string;
  title: string;
  subItems: DrawerSubMenuItem[];
  isOpen: boolean;
  onToggle: (id: string) => void;
  /** 서브메뉴 클릭 시 호출 — href 와 클릭 이벤트를 전달해 상위에서 replace 네비게이션 + drawer 닫기를 수행한다. */
  onNavigate: (href: string, e: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}

/**
 * DrawerMenuSection — Drawer 아코디언 메뉴 섹션
 * 카드형 디자인 + 확장형 아코디언 + 서브메뉴 리스트
 * TEAMPLUS 디자인 시스템 (solid color, no gradient/blur)
 */
export function DrawerMenuSection({
  id,
  icon,
  title,
  subItems,
  isOpen,
  onToggle,
  onNavigate,
  className,
}: DrawerMenuSectionProps) {
  if (subItems.length === 0) return null;

  return (
    <section
      className={cn(
        'bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden',
        className,
      )}
    >
      {/* 섹션 헤더 (펼침 토글) */}
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={cn(
          'w-full px-5 py-4 flex items-center justify-between gap-3',
          'transition-colors motion-reduce:transition-none text-left',
          isOpen
            ? 'bg-wbg dark:bg-rink-700/50'
            : 'hover:bg-wbg dark:hover:bg-rink-700/30',
        )}
        aria-expanded={isOpen}
        aria-controls={`drawer-section-${id}`}
      >
        <span
          className={cn(
            'inline-flex items-center justify-center w-9 h-9 shrink-0',
            'transition-colors motion-reduce:transition-none',
            isOpen
              ? 'text-ice-500'
              : 'text-wtext-2 dark:text-rink-100',
          )}
        >
          <Icon name={icon} className="text-[20px]" aria-hidden="true" />
        </span>

        <h3
          className={cn(
            'flex-1 text-[15px] font-bold transition-colors motion-reduce:transition-none',
            isOpen ? 'text-ice-500' : 'text-wtext-1 dark:text-white',
          )}
        >
          {title}
        </h3>

        <Icon
          name="expand_more"
          className={cn(
            'text-[20px] shrink-0 transition-transform duration-200 motion-reduce:transition-none',
            isOpen
              ? 'rotate-180 text-ice-500'
              : 'rotate-0 text-wtext-3 dark:text-rink-300',
          )}
          aria-hidden="true"
        />
      </button>

      {/* 서브메뉴 (펼침 상태) */}
      <div
        id={`drawer-section-${id}`}
        className={cn(
          'overflow-hidden transition-all duration-200 ease-in-out motion-reduce:transition-none',
          isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <ul className="divide-y divide-slate-100 dark:divide-slate-700 border-t border-wline-2 dark:border-rink-700">
          {subItems.map((sub, idx) => (
            <li key={`${sub.href}-${idx}`}>
              <NavLink
                href={sub.href}
                onClick={(e) => onNavigate(sub.href, e)}
                className={cn(
                  'group flex items-center gap-3 px-5 py-3.5',
                  'hover:bg-wbg dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none',
                )}
              >
                <Icon
                  name={sub.icon}
                  className="text-[18px] text-wtext-3 dark:text-rink-300 group-hover:text-ice-500 shrink-0 transition-colors motion-reduce:transition-none"
                  aria-hidden="true"
                />
                <span className="flex-1 text-sm font-medium text-wtext-2 dark:text-rink-100 group-hover:text-wtext-1 dark:group-hover:text-white">
                  {sub.label}
                </span>
                {sub.badge && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
                    aria-label="새로운 알림"
                  />
                )}
                <Icon
                  name="chevron_right"
                  className="text-[16px] text-wtext-4 dark:text-rink-500 group-hover:text-wtext-3 dark:group-hover:text-rink-300 shrink-0 transition-colors motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
