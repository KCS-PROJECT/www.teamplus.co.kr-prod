'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

interface MatchPaymentSummaryProps {
  price: number;
  discount?: number;
  /** '카드 · KG이니시스' 등 부가 설명 */
  paymentMethod?: string;
  className?: string;
}

/**
 * 매치 결제 확인 페이지의 금액 요약 카드.
 *
 * HTML 목업 "매치 참가비 결제 확인" 반영:
 * - 참가비 / 할인 / 총 결제 금액 3행
 * - 총 결제 금액은 Primary 컬러 강조
 * - 하단에 취소/환불 정책 안내
 *
 * 할인 금액이 0이면 행을 숨깁니다.
 */
export function MatchPaymentSummary({
  price,
  discount = 0,
  paymentMethod,
  className,
}: MatchPaymentSummaryProps) {
  const total = Math.max(0, price - discount);

  return (
    <section
      className={cn(
        'bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 overflow-hidden',
        className
      )}
    >
      <div className="flex items-center gap-2 px-5 py-4 border-b border-wline-2 dark:border-rink-700">
        <Icon name="receipt_long" className="text-ice-500 text-lg" />
        <h3 className="text-card-section text-wtext-1 dark:text-white">
          {MESSAGES.match.payment.detail}
        </h3>
      </div>

      <dl className="px-5 py-4 space-y-3">
        <Row
          label={MESSAGES.match.payment.basePrice}
          value={`${price.toLocaleString('ko-KR')}원`}
        />
        {discount > 0 && (
          <Row
            label={MESSAGES.match.payment.discount}
            value={`-${discount.toLocaleString('ko-KR')}원`}
            tone="discount"
          />
        )}
        <div className="h-px bg-wline-2 dark:bg-rink-700" />
        <Row
          label={MESSAGES.match.payment.total}
          value={`${total.toLocaleString('ko-KR')}원`}
          tone="total"
        />
        {paymentMethod && (
          <p className="text-card-meta text-wtext-3 dark:text-rink-300 text-right pt-1">
            {paymentMethod}
          </p>
        )}
      </dl>

      {/* 환불/취소 정책 안내 */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-800/50 px-5 py-3 flex gap-2">
        <Icon
          name="info"
          className="text-amber-600 dark:text-amber-400 text-base mt-0.5 shrink-0"
          filled
        />
        <p className="text-card-meta leading-relaxed text-amber-800 dark:text-amber-200">
          {MESSAGES.match.payment.info}
        </p>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'discount' | 'total';
}) {
  return (
    <div className="flex items-center justify-between">
      <dt
        className={cn(
          'text-card-body',
          tone === 'total'
            ? 'text-wtext-1 dark:text-white font-bold'
            : 'text-wtext-3 dark:text-rink-300'
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          'text-card-body font-bold tabular-nums',
          tone === 'total' && 'text-ice-500 text-lg',
          tone === 'discount' && 'text-red-500 dark:text-red-400',
          tone === 'default' && 'text-wtext-1 dark:text-white'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
