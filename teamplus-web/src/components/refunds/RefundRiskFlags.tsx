'use client';

/**
 * RefundRiskFlags — 승인 판단 위험 표식(이용 내역 / 후불 정산 / 대회 참가비)
 *
 * 감독이 전액 환불을 승인하기 전 "이미 이용/정산된 결제"를 시각적으로 인지하도록
 * 위험 신호를 칩으로 표기한다. 색 + 아이콘 + 텍스트(색만 구분 금지).
 */

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type { RefundRiskFlags as RefundRiskFlagsData } from '@/services/payment';

interface RefundRiskFlagsProps {
  flags: RefundRiskFlagsData;
  className?: string;
}

interface FlagMeta {
  key: keyof RefundRiskFlagsData;
  label: string;
  icon: string;
  className: string;
}

const FLAG_META: FlagMeta[] = [
  {
    key: 'used',
    label: MESSAGES.refund.riskUsed,
    icon: 'event_available',
    className:
      'bg-it-red-50 text-it-red-600 dark:bg-it-red-500/15 dark:text-it-red-400',
  },
  {
    key: 'postpaid',
    label: MESSAGES.refund.riskPostpaid,
    icon: 'schedule',
    className:
      'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-900/30 dark:text-it-blue-300',
  },
  {
    key: 'tournament',
    label: MESSAGES.refund.riskTournament,
    icon: 'emoji_events',
    className: 'bg-sun-100 text-it-ink-800 dark:bg-sun-500/15 dark:text-sun-500',
  },
];

export function RefundRiskFlags({ flags, className }: RefundRiskFlagsProps) {
  const active = FLAG_META.filter((meta) => flags[meta.key]);
  if (active.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {active.map((meta) => (
        <span
          key={meta.key}
          className={cn(
            'inline-flex items-center gap-0.5 rounded-w-sm px-1.5 py-0.5 text-[11.5px] font-bold',
            meta.className,
          )}
        >
          <Icon name={meta.icon} className="text-[12px]" aria-hidden="true" />
          {meta.label}
        </span>
      ))}
    </div>
  );
}

export default RefundRiskFlags;
