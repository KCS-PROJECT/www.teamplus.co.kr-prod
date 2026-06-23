'use client';

import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { Button } from '@/components/ui/Button';

interface CreditSectionProps {
  current: number;
  expiryDate: string;
}

export function CreditSection({ current, expiryDate }: CreditSectionProps) {
  return (
    <section className="relative w-full overflow-hidden rounded-2xl bg-white dark:bg-rink-800 shadow-sm border border-wline-2 dark:border-rink-700 p-6">
      <div className="relative z-10 flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-wtext-3 dark:text-rink-300 text-sm font-medium flex items-center gap-1.5">
              <Icon name="stars" className="text-base text-ice-500" aria-hidden="true" />
              보유 크레딧
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-wtext-1 dark:text-white tracking-tight leading-none">
                {current}
              </span>
              <span className="text-xl font-bold text-wtext-1 dark:text-white">회</span>
            </div>
          </div>
          <div className="h-11 w-11 rounded-full bg-ice-500/10 flex items-center justify-center text-ice-500">
            <Icon name="account_balance_wallet" className="text-2xl" aria-hidden="true" />
          </div>
        </div>

        <div className="w-full h-px bg-wline-2 dark:bg-rink-700" />

        <div className="flex items-center justify-between">
          <p className="text-xs text-wtext-3 dark:text-rink-300 font-medium bg-wbg dark:bg-rink-700 px-2.5 py-1.5 rounded-md">
            {expiryDate} 만료 예정
          </p>
          <NavLink href="/payment/select">
            <Button variant="primary" size="sm" className="gap-1.5 shadow-md">
              <Icon name="add" className="text-[18px]" aria-hidden="true" />
              충전하기
            </Button>
          </NavLink>
        </div>
      </div>
    </section>
  );
}
