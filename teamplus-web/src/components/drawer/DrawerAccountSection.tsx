'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';

export interface DrawerAccountItem {
  href: string;
  icon: string;
  label: string;
}

interface DrawerAccountSectionProps {
  onNavigate: (entry: { href: string; label: string; icon: string }) => void;
  className?: string;
}

// [수정 2026-05-12] 회원 탈퇴 항목 제거 — 탈퇴/삭제는 어드민 전용 처리.
const ACCOUNT_ITEMS: DrawerAccountItem[] = [
  { href: '/mypage', icon: 'account_box', label: '마이페이지' },
  { href: '/profile/edit', icon: 'manage_accounts', label: '프로필 수정' },
  { href: '/profile/password', icon: 'lock', label: '비밀번호 변경' },
  { href: '/security', icon: 'security', label: '보안' },
];

/**
 * DrawerAccountSection — 계정 관련 메뉴 (Drawer 전용)
 *
 * 토글 아코디언이 아니라 "항상 펼친 상태" 의 단순 항목 리스트.
 * 시각 톤은 DrawerMenuSection 과 동일 (rounded-2xl 카드).
 */
export function DrawerAccountSection({
  onNavigate,
  className,
}: DrawerAccountSectionProps) {
  return (
    <section
      className={cn(
        'bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden',
        className,
      )}
      aria-label={MESSAGES.drawer.account}
    >
      <header className="px-5 py-4 flex items-center gap-3 border-b border-wline-2 dark:border-rink-700">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 shrink-0">
          <Icon name="account_circle" className="text-[20px]" aria-hidden="true" />
        </span>
        <h3 className="flex-1 text-[15px] font-bold text-wtext-1 dark:text-white">
          {MESSAGES.drawer.account}
        </h3>
      </header>

      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {ACCOUNT_ITEMS.map((item) => (
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
