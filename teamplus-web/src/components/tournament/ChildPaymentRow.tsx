'use client';

/**
 * [2026-06-17] 대회 자녀별 결제/신청 상태 행 — 공용 컴포넌트.
 *  대회 상세(자녀별 결제내역)와 참가결제(신청선수) 화면에서 동일한 내용을 표시하기 위한 SoT.
 *
 * 상태별 표기:
 *  · PAID                      → "결제완료" 배지 + [결제취소]
 *  · PENDING + orderNumber     → [후불결제] (감독 정산 완료 → 결제 가능)
 *  · 그 외(UNPAID 등, 정산 전) → [참가취소] + "정산 대기" 배지
 */

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export interface ChildPaymentRowProps {
  name: string;
  amount: number;
  paymentStatus: string;
  orderNumber: string | null;
  cancelling: boolean;
  onPay: () => void;
  onCancel: () => void;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스 → flat hairline 행, 색만 it-* 치환(상태 분기 로직 동결).
   */
  iceTheme?: boolean;
}

export function ChildPaymentRow({
  name,
  amount,
  paymentStatus,
  orderNumber,
  cancelling,
  onPay,
  onCancel,
  iceTheme = false,
}: ChildPaymentRowProps) {
  const isPaid = paymentStatus === 'PAID';
  // 후불 정산 완료(PENDING + orderNumber) → 결제 가능. 그 전(UNPAID 등) → 정산 대기.
  const canPay = !isPaid && paymentStatus === 'PENDING' && !!orderNumber;

  // 취소(참가/결제) 버튼 — 상태별 2곳 공용. iceTheme=true 시 it-red 톤.
  const cancelBtnCls = iceTheme
    ? 'inline-flex items-center px-3 py-1.5 rounded-w-md border-[1.5px] border-it-red-200 text-it-red-500 dark:border-it-red-500/40 dark:text-it-red-300 text-w-caption font-bold hover:bg-it-red-50 dark:hover:bg-it-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed'
    : 'inline-flex items-center px-3 py-1.5 rounded-lg border border-red-200 text-red-600 dark:border-red-500/40 dark:text-red-400 text-w-caption font-bold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-3',
        iceTheme
          ? // ICETIMES flat — 카드 박스(rounded-xl/border) 제거, hairline 행.
            'border-b border-it-line dark:border-rink-700'
          : 'rounded-xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800',
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon
          name="person"
          className={cn('text-[20px]', iceTheme ? 'text-it-ink-400' : 'text-wtext-3')}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span
            className={cn(
              'block font-bold truncate',
              iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
            )}
          >
            {name}
          </span>
          {amount > 0 && (
            <span
              className={cn(
                'block text-w-caption font-num tabular-nums',
                iceTheme ? 'text-it-ink-400 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
              )}
            >
              {new Intl.NumberFormat('ko-KR').format(amount)}원
            </span>
          )}
        </span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {isPaid ? (
          <>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-w-caption font-bold',
                iceTheme
                  ? 'bg-mint-500/10 text-mint-600 dark:bg-mint-500/15 dark:text-mint-500'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
              )}
            >
              결제완료
            </span>
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className={cancelBtnCls}
            >
              {cancelling ? '취소 중...' : '결제취소'}
            </button>
          </>
        ) : canPay ? (
          <button
            type="button"
            onClick={onPay}
            className={cn(
              'inline-flex items-center px-3 py-1.5 text-white text-w-caption font-bold',
              iceTheme
                ? 'rounded-w-md bg-it-blue-500 hover:bg-it-blue-600'
                : 'rounded-lg bg-ice-500 hover:bg-ice-700',
            )}
          >
            후불결제
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className={cancelBtnCls}
            >
              {cancelling ? '취소 중...' : '참가취소'}
            </button>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-w-caption font-bold',
                iceTheme
                  ? 'bg-it-fill text-it-ink-600 dark:bg-rink-700 dark:text-rink-100'
                  : 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
              )}
            >
              정산 대기
            </span>
          </>
        )}
      </div>
    </div>
  );
}
