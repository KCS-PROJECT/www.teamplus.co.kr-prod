'use client';

/**
 * /mypage/activity/receipts — 결제 영수증
 *
 * W2.C #7: 문서 탭 "활동 리포트 > 결제 영수증" 이 이전에는 `/payment/history` 로
 * 잘못 라우팅되어 홈으로 이동하는 회귀가 발생. 본 페이지는 본인 결제 중 영수증
 * 발급 가능한 항목(주로 status=completed)만 별도로 모아 노출.
 *
 * 데이터:    getPaymentHistory() (재활용 — 상태가 completed/refunded 인 항목만)
 * 빈 상태:   MESSAGES.empty('영수증')
 * 라우팅:    각 카드 → /payment/receipt/[id] (영수증 상세)
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
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
    label: '발급 완료',
    bg: 'bg-mint-100 dark:bg-mint-500/15',
    color: 'text-mint-500',
  },
  refunded: {
    label: '환불',
    bg: 'bg-sun-100 dark:bg-sun-500/15',
    color: 'text-sun-500',
  },
};

export default function MyReceiptsPage() {
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: true });
  const { navigate } = useNavigation();

  const [items, setItems] = useState<PaymentHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  usePageReady(!isLoading);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await getPaymentHistory();
      if (resp.success && resp.data) {
        // 영수증 발급 가능한 결제만 (취소·대기 제외)
        const eligible = (resp.data.payments ?? []).filter(
          (p) => p.status === 'completed' || p.status === 'refunded',
        );
        setItems(eligible);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 월별 그룹핑
  const grouped = useMemo(() => {
    const map: Record<string, PaymentHistoryItem[]> = {};
    items.forEach((p) => {
      const monthKey = p.date ? p.date.slice(0, 7) : '미분류';
      if (!map[monthKey]) map[monthKey] = [];
      map[monthKey].push(p);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="결제 영수증" forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck pb-8"
        role="main"
        aria-label="본인 결제 영수증 보관함"
      >
        {!isLoading && items.length > 0 && (
          <section className="px-5 pt-4" aria-label="영수증 요약">
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-sh-1">
              <div className="flex items-center justify-between">
                <span className="text-card-body font-bold text-wtext-1 dark:text-white">
                  보관된 영수증
                </span>
                <span className="text-card-section font-num font-bold tabular-nums text-ice-500">
                  {items.length}건
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
              <Icon name="folder_open" className="text-3xl text-wtext-4 dark:text-wtext-3" />
            </div>
            <p className="text-card-body text-wtext-2 dark:text-wtext-4 text-center">
              {MESSAGES.empty('영수증')}
            </p>
            <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300 text-center">
              결제 완료 시 자동으로 영수증이 발급됩니다.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5 pt-4">
            {grouped.map(([month, group]) => (
              <section
                key={month}
                className="px-5"
                aria-label={`${month} 영수증 ${group.length}건`}
              >
                <h2 className="mb-2 text-card-meta font-bold uppercase tracking-[0.12em] text-wtext-3 dark:text-wtext-4 font-num tabular-nums">
                  {month}
                </h2>
                <div className="flex flex-col gap-2.5">
                  {group.map((p) => {
                    const status = STATUS_META[p.status] ?? STATUS_META.completed;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => navigate(`/payment/receipt/${p.id}`)}
                        className="text-left rounded-w-lg bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-sh-1 transition-shadow duration-200 ease-wallet motion-reduce:transition-none hover:shadow-sh-2 active:brightness-95"
                        aria-label={`${p.productName} 영수증 상세 보기`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="shrink-0 size-11 rounded-w-md bg-ice-50 dark:bg-ice-500/15 flex items-center justify-center"
                            aria-hidden="true"
                          >
                            <Icon name="description" className="text-card-title text-ice-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="truncate text-card-title font-bold text-wtext-1 dark:text-white">
                                {p.productName ?? p.className ?? '영수증'}
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
                              {p.orderNumber ? ` · ${p.orderNumber}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-card-body font-num font-bold tabular-nums text-wtext-1 dark:text-white">
                            {(p.amount ?? 0).toLocaleString()}원
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </MobileContainer>
  );
}
