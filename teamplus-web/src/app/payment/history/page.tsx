'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { NavLink } from '@/components/ui/NavLink';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { BottomSheetSelector } from '@/components/ui/BottomSheetSelector';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal/ModalContext';
import { api } from '@/services/api-client';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { PaymentSourceBadge } from '@/components/payment/PaymentSourceBadge';

type PeriodFilter = 'all' | 'thisMonth' | 'lastMonth' | 'last3Months';
const PERIOD_LABEL: Record<PeriodFilter, string> = {
  all: '전체',
  thisMonth: '이번 달',
  lastMonth: '지난 달',
  last3Months: '최근 3개월',
};

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });
import {
  getPaymentHistory,
  groupPaymentsByMonth,
} from '@/services/payment';
import { usePageReady } from '@/hooks/usePageReady';
import type {
  PaymentHistoryItem,
  GroupedPaymentHistory,
} from '@/types/payment';

/** "YYYY.MM.DD" → Date (월 1일 기준, 시각 0) */
function parseYmd(date: string): Date | null {
  const parts = date.split('.').map((n) => parseInt(n, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** 선택된 기간으로 내역을 클라이언트 필터링 (date 필드 'YYYY.MM.DD' 기준) */
function filterByPeriod<T extends { date: string }>(items: T[], period: PeriodFilter): T[] {
  if (period === 'all') return items;
  const now = new Date();
  return items.filter((it) => {
    const dt = parseYmd(it.date);
    if (!dt) return false;
    if (period === 'thisMonth') {
      return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
    }
    if (period === 'lastMonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return dt.getFullYear() === lm.getFullYear() && dt.getMonth() === lm.getMonth();
    }
    // last3Months — 이번 달 포함 직전 3개월(시작점: 2개월 전 1일)
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return dt >= start;
  });
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Spinner size="lg" />
      <p className="text-it-ink-500 dark:text-rink-300 text-card-body mt-3">{MESSAGES.loading.data}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-16 h-16 rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15 flex items-center justify-center mb-4">
        <Icon name="error" className="text-it-red-500 text-3xl" />
      </div>
      <h2 className="text-card-section text-it-ink-900 dark:text-white mb-2">
        데이터를 불러올 수 없습니다
      </h2>
      <p className="text-card-body text-it-ink-500 dark:text-rink-300 text-center mb-6">{message}</p>
      <button
        onClick={onRetry}
        className="px-6 py-2.5 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95 text-white font-bold text-card-body transition-colors motion-reduce:transition-none"
      >
        다시 시도
      </button>
    </div>
  );
}

function EmptyState({ filtered }: { filtered?: boolean }) {
  return (
    <div className="bg-it-surface dark:bg-rink-800 flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700 mb-3">
        <Icon
          name="receipt_long"
          className="text-it-ink-400 dark:text-wtext-3 text-[28px]"
        />
      </div>
      <h2 className="text-card-section text-it-ink-900 dark:text-white mb-2">
        {filtered ? '해당 기간 내역이 없습니다' : '결제 내역이 없습니다'}
      </h2>
      <p className="text-card-body text-it-ink-500 dark:text-rink-300">
        {filtered ? '다른 기간을 선택해보세요.' : MESSAGES.payment2.emptyDesc}
      </p>
    </div>
  );
}

/** 요약 카드 내부 통계 한 줄 (점 + 라벨 + 값) — navy 히어로 위 light 텍스트 */
function SummaryStat({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <span className={cn('flex h-2 w-2 rounded-w-pill', dot)} aria-hidden="true" />
      <span className="text-card-meta text-white/60">{label}</span>
      <span className="text-card-meta font-bold tabular-nums text-white">{value}</span>
    </div>
  );
}

interface PaymentSummary {
  count: number;
  completedCount: number;
  cancelledCount: number;
  totalAmount: number;
}

/** 기간 요약 카드 — 총 결제 금액 + 완료/취소 건수 */
function SummaryCard({ payment }: { payment: PaymentSummary }) {
  return (
    <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-[22px] pb-6">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
        <Icon name="payments" className="text-[14px]" aria-hidden="true" />
        기간 내 총 결제 금액
      </div>
      <p className="mt-2 truncate whitespace-nowrap text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] tabular-nums text-white">
        {`${payment.totalAmount.toLocaleString()}원`}
      </p>

      <div className="mt-[18px] flex items-center gap-x-4 overflow-x-auto border-t border-white/[0.14] pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SummaryStat dot="bg-mint" label="결제 완료" value={`${payment.completedCount}건`} />
        {payment.cancelledCount > 0 && (
          <SummaryStat dot="bg-it-red-500" label="결제 취소" value={`${payment.cancelledCount}건`} />
        )}
      </div>
    </section>
  );
}

function PaymentHistoryCard({
  item,
  onCancel,
  isCancelling,
}: {
  item: PaymentHistoryItem;
  onCancel?: (paymentId: string, productName: string) => void;
  isCancelling?: boolean;
}) {
  // [수정 2026-05-13] 'cancelled' 또는 'refunded' 모두 환불 처리 — 토스 cancel 응답은 'refunded' 로 갱신됨.
  const isCancelled = item.status === 'cancelled' || item.status === 'refunded';
  const isCompleted = item.status === 'completed';

  const getIcon = () => {
    if (isCancelled) return 'remove_shopping_cart';
    if (item.type === 'trial') return 'local_activity';
    return 'confirmation_number';
  };

  const getIconBgColor = () => {
    if (isCancelled) return 'bg-it-fill dark:bg-rink-700 text-it-ink-400';
    if (item.type === 'trial')
      return 'bg-it-blue-50 dark:bg-it-blue-500/15 text-it-blue-500';
    return 'bg-it-blue-50 dark:bg-it-blue-500/15 text-it-blue-500';
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-it-line dark:border-rink-700 py-3.5 last:border-b-0',
        isCancelled && 'opacity-70'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-w-md',
              getIconBgColor()
            )}
          >
            <Icon name={getIcon()} className="text-[22px]" />
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-0.5">
            {/* [추가 2026-05-13] 수업명 (className) → 상품명 위에 작은 라벨로 노출 */}
            {item.className && (
              <span
                className={cn(
                  'truncate text-card-meta leading-tight',
                  isCancelled
                    ? 'text-it-ink-400 line-through decoration-it-ink-400/50'
                    : 'text-it-blue-500 dark:text-it-blue-300',
                )}
              >
                {item.className}
              </span>
            )}
            <h4
              className={cn(
                'truncate text-[15px] font-bold leading-tight',
                isCancelled
                  ? 'text-it-ink-500 dark:text-rink-300 line-through decoration-it-ink-400/50'
                  : 'text-it-ink-900 dark:text-white'
              )}
            >
              {item.productName}
            </h4>
            <span className="truncate whitespace-nowrap text-[12.5px] text-it-ink-500 dark:text-rink-300 tabular-nums">
              {item.date} {'·'} {item.time}
            </span>
            {/* 출처·선후불 배지 — sourceType·billingTiming 둘 다 있을 때만(무관계 결제 미표시). */}
            <PaymentSourceBadge
              sourceType={item.sourceType}
              billingTiming={item.billingTiming}
              className="mt-1 self-start"
            />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              'text-[15px] font-extrabold tabular-nums tracking-tight',
              isCancelled
                ? 'text-it-ink-400 line-through decoration-it-ink-300/50'
                : 'text-it-ink-900 dark:text-white'
            )}
          >
            {item.amount.toLocaleString()}원
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={cn('flex h-2 w-2 rounded-w-pill', isCancelled ? 'bg-it-red-500' : 'bg-mint')}
          />
          <span
            className={cn(
              'text-card-meta font-semibold',
              isCancelled ? 'text-it-red-500' : 'text-success'
            )}
          >
            {isCancelled ? '결제 취소' : '결제 완료'}
          </span>
        </div>

        {isCancelled ? (
          <span className="text-card-meta text-it-ink-400">{item.refundStatus ?? '환불 완료'}</span>
        ) : (
          <div className="flex items-center gap-3">
            <NavLink
              href={`/payment/receipt/${item.id}`}
              className="text-card-meta font-semibold text-success underline underline-offset-2"
            >
              영수증 보기
            </NavLink>
            {/* [추가 2026-05-13] 결제완료 상태일 때만 결제취소 버튼 노출.
                onCancel 핸들러 → 토스/KG 분기 처리는 backend PaymentRefundService 가 담당. */}
            {isCompleted && onCancel && (
              <button
                type="button"
                onClick={() => onCancel(item.id, item.productName)}
                disabled={isCancelling}
                className="px-3 py-1 rounded-w-md border border-it-red-500 text-it-red-600 dark:text-it-red-200 text-card-meta font-semibold hover:bg-it-red-50 dark:hover:bg-it-red-500/15 active:brightness-95 transition-colors motion-reduce:transition-none disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label="결제취소"
              >
                {isCancelling ? '취소 중...' : '결제취소'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MonthGroupHeader({ month }: { month: string; count?: number }) {
  // [ICETIMES] 월 헤더 — fs12.5/800/faint (총N건 pill 제거)
  return (
    <h3 className="mb-1 truncate text-[12.5px] font-extrabold text-it-ink-400 dark:text-wtext-3">
      {month}
    </h3>
  );
}

function PaymentHistoryList({
  groupedPayments,
  isLoading,
  error,
  isFiltered,
  onRetry,
  onCancel,
  cancellingId,
}: {
  groupedPayments: GroupedPaymentHistory;
  isLoading: boolean;
  error: string | null;
  isFiltered: boolean;
  onRetry: () => void;
  onCancel?: (paymentId: string, productName: string) => void;
  cancellingId?: string | null;
}) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  const entries = Object.entries(groupedPayments);

  if (entries.length === 0) {
    return <EmptyState filtered={isFiltered} />;
  }

  return (
    <main className="flex flex-col gap-2 py-2">
      {entries.map(([month, items]) => (
        <section key={month} className="bg-it-surface dark:bg-rink-800 px-4 pt-3.5 pb-1.5">
          <MonthGroupHeader month={month} />

          {items.map((item) => (
            <PaymentHistoryCard
              key={item.id}
              item={item}
              onCancel={onCancel}
              isCancelling={cancellingId === item.id}
            />
          ))}
        </section>
      ))}

      {/* Footer Note */}
      <div className="mt-2 px-4 text-center">
        <p className="text-w-caption leading-relaxed text-it-ink-400 dark:text-rink-300">
          결제 내역은 최근 1년까지 조회 가능합니다.
          <br />
          문의사항이 있으시면 고객센터를 이용해 주세요.
        </p>
      </div>
    </main>
  );
}

export default function PaymentHistoryPage() {
  // [appbar-harness-v2] Status bar + Native AppBar 명시 (v2 회귀 차단).
  //   - PageAppBar 가 Web DOM 헤더를 그리는 동안 Flutter 측은 native AppBar 로 동일 영역 채움.
  //   - showAppBar:false + <PageAppBar forceNative /> → 앱/웹 동일 헤더(back·알림·메뉴) 노출.
  //     (기존 showAppBar:true 는 앱에서 네이티브 타이틀만 남고 버튼이 사라지는 회귀였음.)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: '결제내역',
    showBottomNav: true,
    showBackButton: true,
  });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // Payment history state — raw 배열 보관 후 기간 필터/그룹화는 파생으로 계산
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [isPaymentLoading, setIsPaymentLoading] = useState(true);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // v16 — 데이터 로드 완료 시 풀스크린 로더 hide 신호
  usePageReady(!isPaymentLoading);

  // [추가 2026-05-13] 결제취소 처리
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { modal } = useModal();

  // ── 기간 필터 적용 + 월별 그룹화 (파생) ─────────────────────────
  const filteredPayments = useMemo(
    () => filterByPeriod(payments, periodFilter),
    [payments, periodFilter],
  );
  const groupedPayments = useMemo(
    () => groupPaymentsByMonth(filteredPayments),
    [filteredPayments],
  );

  // ── 요약 통계 (기간 필터 반영) ──────────────────────────────────
  const paymentSummary = useMemo<PaymentSummary>(() => {
    let completedCount = 0;
    let cancelledCount = 0;
    let totalAmount = 0;
    for (const p of filteredPayments) {
      if (p.status === 'cancelled' || p.status === 'refunded') {
        cancelledCount += 1;
      } else {
        completedCount += 1;
        totalAmount += p.amount;
      }
    }
    return { count: filteredPayments.length, completedCount, cancelledCount, totalAmount };
  }, [filteredPayments]);

  const fetchPaymentHistory = async () => {
    setIsPaymentLoading(true);
    setPaymentError(null);

    const response = await getPaymentHistory();

    if (response.success && response.data) {
      setPayments(response.data.payments ?? []);
    } else {
      setPaymentError(response.error?.message || MESSAGES.payment2.loadError);
    }

    setIsPaymentLoading(false);
  };

  useEffect(() => {
    fetchPaymentHistory();
  }, []);

  /** [추가 2026-05-13] 결제취소 — 토스/KG 분기는 backend PaymentRefundService 가 처리.
   *  성공 시 결제 내역 재조회.
   */
  const handleCancelPayment = async (paymentId: string, productName: string) => {
    const ok = await modal.confirm({
      title: '결제를 취소할까요?',
      message: `${productName} 결제를 취소합니다. 진행하시겠어요?`,
      confirmText: '결제취소',
      cancelText: '돌아가기',
    });
    if (!ok) return;
    setCancellingId(paymentId);
    try {
      const res = await api.post(`/payments/${paymentId}/cancel`, {
        cancelReason: '학부모 요청 (결제내역에서 결제취소)',
      });
      if (!res.success) {
        toast.error(res.error?.message ?? MESSAGES.payment2.cancelFailed);
        return;
      }
      toast.success(MESSAGES.payment2.cancelSuccess);
      await fetchPaymentHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : MESSAGES.payment2.cancelFailed);
    } finally {
      setCancellingId(null);
    }
  };

  const isFiltered = periodFilter !== 'all';
  const showSummary = !isPaymentLoading && !paymentError && paymentSummary.count > 0;

  return (
    <MobileContainer hasBottomNav>
      {/* [appbar-harness-v4 · parent-agent · 2026-05-12] rightAction 제거 —
          기존 "도움말" 아이콘은 onClick 핸들러가 비어 있는 죽은 버튼이었으며 우측 3 액션을 통째로
          대체하여 시계/종/메뉴 접근성을 차단했음. SPEC §3 분류 C 가이드에 따라 제거하고
          default 3 액션(시계/종/메뉴) 자동 노출로 복원. 도움말 진입이 필요하면 별도 entry
          (예: `/help` 링크 카드)를 페이지 body 영역에 추가 권장. */}
      <PageAppBar title="결제내역" forceNative />

      {/* 스크롤 영역 — MobileContainer 직계 자식(overflow-y-auto)만 momentum 스크롤 대상.
          PageAppBar 는 영역 밖(고정 헤더)에 유지하고, 본문 전체를 이 컨테이너가 스크롤. */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-it-canvas dark:bg-puck [&>*]:shrink-0">
        {/* Filter Bar — 조회 건수 + 기간 선택 칩 (항상 노출, 빈 결과에서도 기간 변경 가능) */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <span className="shrink-0 whitespace-nowrap text-card-meta text-it-ink-500 dark:text-rink-300 tabular-nums">
            {isPaymentLoading || paymentError ? PERIOD_LABEL[periodFilter] : `${paymentSummary.count}건 조회`}
          </span>
          <button
            type="button"
            onClick={() => setIsFilterSheetOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-w-pill bg-it-surface dark:bg-rink-800 border border-it-line-strong dark:border-rink-700 px-3 py-1.5 text-card-meta font-semibold text-it-ink-600 dark:text-rink-100 hover:bg-it-fill dark:hover:bg-rink-700/50 transition-colors motion-reduce:transition-none active:brightness-95"
            aria-label="기간 필터 변경"
          >
            <Icon name="calendar_month" className="text-base" aria-hidden="true" />
            {PERIOD_LABEL[periodFilter]}
            <Icon name="expand_more" className="text-base" aria-hidden="true" />
          </button>
        </div>

        {/* Summary Card — 기간 내 총 결제 금액 요약 (navy 히어로) */}
        {showSummary && (
          <div className="mt-2">
            <SummaryCard payment={paymentSummary} />
          </div>
        )}

        {/* History List — 하단 여백은 MobileContainer hasBottomNav(60px+safe-area 예약)가 담당 */}
        <div>
          <PaymentHistoryList
            groupedPayments={groupedPayments}
            isLoading={isPaymentLoading}
            error={paymentError}
            isFiltered={isFiltered}
            onRetry={fetchPaymentHistory}
            onCancel={handleCancelPayment}
            cancellingId={cancellingId}
          />
        </div>
      </div>

      <BottomSheetSelector<PeriodFilter>
        isOpen={isFilterSheetOpen}
        title="기간 선택"
        items={[
          { id: 'all', name: '전체', selected: periodFilter === 'all' },
          { id: 'thisMonth', name: '이번 달', selected: periodFilter === 'thisMonth' },
          { id: 'lastMonth', name: '지난 달', selected: periodFilter === 'lastMonth' },
          { id: 'last3Months', name: '최근 3개월', selected: periodFilter === 'last3Months' },
        ]}
        onSelect={(id) => {
          setPeriodFilter(id);
          setIsFilterSheetOpen(false);
        }}
        onClose={() => setIsFilterSheetOpen(false)}
      />

      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
