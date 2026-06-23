'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';

export interface DrawerSupportItem {
  href: string;
  icon: string;
  label: string;
}

interface DrawerSupportSectionProps {
  onNavigate: (entry: { href: string; label: string; icon: string }) => void;
  className?: string;
}

const SUPPORT_ITEMS: DrawerSupportItem[] = [
  { href: '/help', icon: 'help', label: '도움말' },
  { href: '/faq', icon: 'quiz', label: '자주 묻는 질문' },
  { href: '/notices', icon: 'campaign', label: '공지사항' },
  { href: '/feedback', icon: 'support_agent', label: '고객센터' },
  { href: '/terms', icon: 'description', label: '약관 및 정책' },
  { href: '/notification-settings', icon: 'notifications_active', label: '알림 설정' },
];

/**
 * DrawerSupportSection — 고객 지원 메뉴 (Drawer 전용)
 *
 * 토글 아코디언이 아니라 "항상 펼친 상태" 의 단순 항목 리스트.
 */
export function DrawerSupportSection({
  onNavigate,
  className,
}: DrawerSupportSectionProps) {
  return (
    <section
      className={cn(
        'bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden',
        className,
      )}
      aria-label={MESSAGES.drawer.support}
    >
      <header className="px-5 py-4 flex items-center gap-3 border-b border-wline-2 dark:border-rink-700">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 shrink-0">
          <Icon name="support" className="text-[20px]" aria-hidden="true" />
        </span>
        <h3 className="flex-1 text-[15px] font-bold text-wtext-1 dark:text-white">
          {MESSAGES.drawer.support}
        </h3>
      </header>

      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {SUPPORT_ITEMS.map((item) => (
          <li key={item.href}>
            <button
              type="button"
              onClick={() => onNavigate(item)}
              className={cn(
                'group w-full flex items-center gap-3 px-5 py-3.5 text-left',
                'hover:bg-wbg dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none',
                'focus-visible:ring-2 focus-visible:ring-ice-500/40 focus-visible:outline-none',
              )}
            >
              <Icon
                name={item.icon}
                className="text-[18px] text-wtext-3 dark:text-rink-300 group-hover:text-ice-500 shrink-0 transition-colors motion-reduce:transition-none"
                aria-hidden="true"
              />
              <span className="flex-1 text-sm font-medium text-wtext-2 dark:text-rink-100 group-hover:text-wtext-1 dark:group-hover:text-white">
                {item.label}
              </span>
              <Icon
                name="chevron_right"
                className="text-[16px] text-wtext-4 dark:text-rink-500 group-hover:text-wtext-3 dark:group-hover:text-rink-300 shrink-0 transition-colors motion-reduce:transition-none"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
