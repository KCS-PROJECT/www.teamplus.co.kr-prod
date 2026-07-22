'use client';

/**
 * PaymentSourceBadge — 결제 출처(수업/대회) · 선후불 배지
 *
 * 결제 5화면(history/receipt/complete/postpaid)에서 공용. 백엔드 파생 필드
 * sourceType·billingTiming 이 **둘 다 non-null 일 때만** 렌더한다(무관계 결제
 * 매치·쇼핑 오라벨 방지). 세로 구분선(pipe) 대신 중점(·)으로 두 라벨을 결합.
 * 후불(POSTPAID)은 it-blue 액센트로 강조.
 */

import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type { PaymentSourceType, PaymentBillingTiming } from '@/types/payment';

export interface PaymentSourceBadgeProps {
  sourceType?: PaymentSourceType | null;
  billingTiming?: PaymentBillingTiming | null;
  className?: string;
}

export function PaymentSourceBadge({
  sourceType,
  billingTiming,
  className,
}: PaymentSourceBadgeProps) {
  // 무관계 결제(매치·쇼핑 등)는 둘 중 하나라도 없으면 배지 미표시.
  if (!sourceType || !billingTiming) return null;

  const sourceLabel =
    sourceType === 'TOURNAMENT'
      ? MESSAGES.payment2.sourceTournament
      : MESSAGES.payment2.sourceClass;
  const timingLabel =
    billingTiming === 'POSTPAID'
      ? MESSAGES.payment2.postpaid
      : MESSAGES.payment2.prepaid;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-w-pill bg-it-fill dark:bg-rink-700 px-2 py-0.5 text-card-meta font-semibold',
        className,
      )}
    >
      <span className="text-it-ink-600 dark:text-rink-100">{sourceLabel}</span>
      <span aria-hidden="true" className="text-it-ink-300 dark:text-rink-300">
        ·
      </span>
      <span
        className={
          billingTiming === 'POSTPAID'
            ? 'text-it-blue-500 dark:text-it-blue-300'
            : 'text-it-ink-600 dark:text-rink-100'
        }
      >
        {timingLabel}
      </span>
    </span>
  );
}

export default PaymentSourceBadge;
