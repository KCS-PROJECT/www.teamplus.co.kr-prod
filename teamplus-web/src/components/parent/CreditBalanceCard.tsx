'use client';

import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';
import { NavLink } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';

/**
 * CreditBalanceCard - 크레딧 잔액 카드
 *
 * 보유 크레딧 수치, 프로그레스 바, 만료 안내를 표시합니다.
 * 대시보드와 크레딧 페이지에서 공통으로 사용합니다.
 */
interface CreditBalanceCardProps {
  /** 현재 보유 크레딧 수 */
  current: number;
  /** 프로그레스 바 최대값 (기본: 12) */
  max?: number;
  /** 만료 예정일 (예: '2024.03.15') */
  expiryDate?: string;
  /** 충전 페이지 링크 (기본: '/payment/select') */
  chargeHref?: string;
  /** CountUp 애니메이션 활성화 여부 */
  isAnimated?: boolean;
  /** 추가 className */
  className?: string;
}

function getCreditColor(current: number): string {
  if (current > 5) return 'bg-ice-500';
  if (current > 2) return 'bg-amber-400';
  return 'bg-red-400';
}

export function CreditBalanceCard({
  current,
  max = 12,
  expiryDate,
  chargeHref = '/payment/select',
  isAnimated = true,
  className = '',
}: CreditBalanceCardProps) {
  const percentage = Math.min(100, (current / max) * 100);

  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 rounded-xl p-4 shadow-sm border border-wline-2 dark:border-rink-700',
        className
      )}
    >
      {/* 헤더: 라벨 + 충전 버튼 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
            <Icon
              name="account_balance_wallet"
              className="text-indigo-500 text-base"
              aria-hidden="true"
            />
          </div>
          <span className="text-sm font-bold text-wtext-1 dark:text-white">
            보유 크레딧
          </span>
        </div>
        <NavLink
          href={chargeHref}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ice-500 hover:bg-ice-700 text-white text-xs font-bold transition-colors active:brightness-95"
        >
          <Icon name="add" className="text-sm" aria-hidden="true" />
          <span>충전하기</span>
        </NavLink>
      </div>

      {/* 크레딧 수치 */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-extrabold text-wtext-1 dark:text-white tracking-tight tabular-nums">
          {isAnimated ? <CountUp end={current} duration={1800} /> : 0}
        </span>
        <span className="text-lg font-bold text-wtext-3 dark:text-rink-300">
          회
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div className="mt-3">
        <div
          className="w-full h-2 bg-wline-2 dark:bg-rink-700 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={`보유 크레딧 ${current}회`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-1000 ease-out',
              getCreditColor(current)
            )}
            style={{
              width: isAnimated ? `${percentage}%` : '0%',
            }}
          />
        </div>
      </div>

      {/* 만료 안내 */}
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-wtext-3 dark:text-rink-300">
          {expiryDate ?? '-'} 만료 예정
        </p>
        {current <= 3 && (
          <span className="text-xs font-medium text-amber-500 dark:text-amber-400">
            해당 수업 미결제 상태입니다
          </span>
        )}
      </div>
    </div>
  );
}
