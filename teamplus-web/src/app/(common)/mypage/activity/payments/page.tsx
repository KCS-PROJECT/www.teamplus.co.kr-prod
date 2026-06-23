'use client';

/**
 * /mypage/activity/payments — 결제 이력
 *
 * W2.C #5: 마이페이지 활동 탭의 "결제 이력" 이 이전에는 `/payment/history` 로
 * 잘못 라우팅되어 권한·역할 분기에 따라 홈으로 이동하는 회귀가 발생.
 * 본 페이지는 (common) 그룹 내 모든 인증 사용자가 접근 가능한 본인 결제 이력 화면.
 *
 * 데이터:    getPaymentHistory() (기존 services/payment 재활용)
 * 빈 상태:   MESSAGES.empty('결제 내역')
 * 라우팅:    카드 클릭 → /payment/receipt/[id]
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { getPaymentHistory } from '@/services/payment';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { PaymentHistoryItem } from '@/types/payment';

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  completed: {
    label: '결제 완료',
    bg: 'bg-mint-100 dark:bg-mint-500/15',
    color: 'text-mint-500',
  },
  refunded: {
    label: '환불 완료',
    bg: 'bg-sun-100 dark:bg-sun-500/15',
    color: 'text-sun-500',
  },
  cancelled: {
    label: '결제 취소',
    bg: 'bg-wline-2 dark:bg-rink-700',
    color: 'text-wtext-3 dark:text-wtext-4',
  },
  pending: {
    label: '대기',
    bg: 'bg-ice-50 dark:bg-ice-500/15',
    color: 'text-ice-500',
  },
};

export default function MyPaymentsHistoryPage() {
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: true });
  const { navigate } = useNavigation();

  const [items, setItems] = useState<PaymentHistoryItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  usePageReady(!isLoading);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await getPaymentHistory();
      if (resp.success && resp.data) {
        setItems(resp.data.payments ?? []);
        setTotalCount(resp.data.totalCount ?? (resp.data.payments?.length ?? 0));
      } else {
        setItems([]);
        setTotalCount(0);
      }
    } catch {
      setItems([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="결제 이력" forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck pb-8"
        role="main"
        aria-label="본인 결제 이력"
      >
        {!isLoading && items.length > 0 && (
          <section className="px-5 pt-4" aria-label="결제 요약">
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-sh-1">
              <div className="flex items-center justify-between">
                <span className="text-card-body font-bold text-wtext-1 dark:text-white">
                  전체 결제
                </span>
                <span className="text-card-section font-num font-bold tabular-nums text-ice-500">
                  {totalCount}건
                </span>
              </div>
            </div>
          </section>
        )}

        {isLoading ? null : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div
              className="w-16 h-16 rounded-w-pill bg-wsurface dark:bg-rink-800 flex items-center justify-center mb-4"
              aria-hidden="true"
            >
              <Icon name="receipt_long" className="text-3xl text-wtext-4 dark:text-wtext-3" />
            </div>
            <p className="text-card-body text-wtext-2 dark:text-wtext-4 text-center">
              {MESSAGES.empty('결제 내역')}
            </p>
            <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300 text-center">
              수업·쇼핑 결제 시 여기에 표시됩니다.
            </p>
          </div>
        ) : (
          <section
            className="px-5 pt-4 flex flex-col gap-2.5"
            aria-label={`총 ${items.length}건의 결제 내역`}
          >
            {items.map((p) => {
              const status = STATUS_META[p.status] ?? STATUS_META.completed;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/payment/receipt/${p.id}`)}
                  className="text-left rounded-w-lg bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-sh-1 transition-shadow duration-200 ease-wallet motion-reduce:transition-none hover:shadow-sh-2 active:brightness-95"
                  aria-label={`${p.productName} 영수증 보기`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'shrink-0 size-11 rounded-w-md flex items-center justify-center',
                        status.bg,
                      )}
                      aria-hidden="true"
                    >
                      <Icon name="receipt_long" className={cn('text-card-title', status.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate text-card-title font-bold text-wtext-1 dark:text-white">
                          {p.productName ?? p.className ?? '결제'}
                        </h3>
                        <span
                          className={cn(
                            'shrink-0 inline-flex items-center rounded-w-xs px-1.5 py-0.5 text-card-meta font-bold',
                            status.bg,
                            status.color,
                          )}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300 font-num tabular-nums">
                        {p.date}
                        {p.time ? ` · ${p.time}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-card-section font-num font-bold tabular-nums text-wtext-1 dark:text-white">
                      {(p.amount ?? 0).toLocaleString()}원
                    </span>
                  </div>
                </button>
              );
            })}
          </section>
        )}
      </main>
    </MobileContainer>
  );
}
