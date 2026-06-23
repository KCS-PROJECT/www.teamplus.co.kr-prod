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
  getUsageHistory,
  groupPaymentsByMonth,
  groupUsagesByMonth,
} from '@/services/payment';
import { usePageReady } from '@/hooks/usePageReady';
import type {
  PaymentHistoryItem,
  UsageHistoryItem,
  GroupedPaymentHistory,
  GroupedUsageHistory,
} from '@/types/payment';

type TabType = 'payment' | 'usage';

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
      <p className="text-wtext-3 dark:text-rink-300 text-card-body mt-3">{MESSAGES.loading.data}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-16 h-16 rounded-w-pill bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
        <Icon name="error" className="text-red-500 text-3xl" />
      </div>
      <h2 className="text-card-section text-wtext-1 dark:text-white mb-2">
        데이터를 불러올 수 없습니다
      </h2>
      <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center mb-6">{message}</p>
      <button
        onClick={onRetry}
        className="px-6 py-2.5 rounded-w-md bg-ice-500 hover:bg-ice-600 active:bg-ice-700 text-white font-bold text-card-body transition-colors motion-reduce:transition-none"
      >
        다시 시도
      </button>
    </div>
  );
}

function EmptyState({ type, filtered }: { type: 'payment' | 'usage'; filtered?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-16 h-16 rounded-w-pill bg-wbg dark:bg-rink-800 flex items-center justify-center mb-4">
        <Icon
          name={type === 'payment' ? 'receipt_long' : 'history'}
          className="text-wtext-4 text-3xl"
        />
      </div>
      <h2 className="text-card-section text-wtext-1 dark:text-white mb-2">
        {filtered
          ? '해당 기간 내역이 없습니다'
          : type === 'payment'
            ? '결제 내역이 없습니다'
            : '사용 내역이 없습니다'}
      </h2>
      <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center">
        {filtered
          ? '다른 기간을 선택해보세요.'
          : type === 'payment'
            ? '아직 결제 내역이 없어요. 크레딧을 충전해보세요!'
            : '아직 사용 내역이 없어요. 수업에 출석해보세요!'}
      </p>
    </div>
  );
}

function TabNavigation({
  activeTab,
  onTabChange,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}) {
  return (
    <section className="sticky top-0 z-40 bg-wbg dark:bg-puck px-4 pb-2 pt-3">
      <div className="flex gap-1 rounded-w-md bg-wline-2 dark:bg-rink-900/50 p-1">
        <button
          onClick={() => onTabChange('payment')}
          className={cn(
            'flex-1 relative isolate flex items-center justify-center rounded-w-md py-2.5 text-card-body font-bold transition-all motion-reduce:transition-none duration-200',
            activeTab === 'payment'
              ? 'text-ice-500 dark:text-white shadow-sh-1 bg-wsurface dark:bg-rink-800'
              : 'text-wtext-3 hover:text-wtext-2 dark:text-rink-300 dark:hover:text-rink-200'
          )}
        >
          결제 내역
        </button>
        <button
          onClick={() => onTabChange('usage')}
          className={cn(
            'flex-1 flex items-center justify-center rounded-w-md py-2.5 text-card-body font-bold transition-all motion-reduce:transition-none duration-200',
            activeTab === 'usage'
              ? 'text-ice-500 dark:text-white shadow-sh-1 bg-wsurface dark:bg-rink-800'
              : 'text-wtext-3 hover:text-wtext-2 dark:text-rink-300 dark:hover:text-rink-200'
          )}
        >
          사용 내역
        </button>
      </div>
    </section>
  );
}

/** 요약 카드 내부 통계 한 줄 (점 + 라벨 + 값) */
function SummaryStat({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <span className={cn('flex h-2 w-2 rounded-w-pill', dot)} aria-hidden="true" />
      <span className="text-card-meta text-wtext-3 dark:text-rink-300">{label}</span>
      <span className="text-card-meta font-bold tabular-nums text-wtext-1 dark:text-white">{value}</span>
    </div>
  );
}

interface PaymentSummary {
  count: number;
  completedCount: number;
  cancelledCount: number;
  totalAmount: number;
}
interface UsageSummary {
  count: number;
  attended: number;
  absent: number;
  cancelled: number;
  creditsUsed: number;
}

/** 활성 탭 기준 기간 요약 카드 — 결제: 총 결제 금액 / 사용: 사용한 크레딧 */
function SummaryCard({
  activeTab,
  payment,
  usage,
}: {
  activeTab: TabType;
  payment: PaymentSummary;
  usage: UsageSummary;
}) {
  const isPayment = activeTab === 'payment';
  return (
    <section className="px-4 pt-3">
      <div className="rounded-w-lg bg-wsurface dark:bg-rink-800 p-4 shadow-sh-1">
        <span className="text-card-meta text-wtext-3 dark:text-rink-300">
          {isPayment ? '기간 내 총 결제 금액' : '기간 내 사용한 크레딧'}
        </span>
        <p className="mt-1.5 truncate whitespace-nowrap font-num text-w-h2 font-bold tabular-nums text-wtext-1 dark:text-white">
          {isPayment
            ? `${payment.totalAmount.toLocaleString()}원`
            : `${usage.creditsUsed}회`}
        </p>

        <div className="mt-3 flex items-center gap-x-3 overflow-x-auto border-t border-wline-2 dark:border-rink-700 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {isPayment ? (
            <>
              <SummaryStat dot="bg-emerald-500" label="결제 완료" value={`${payment.completedCount}건`} />
              {payment.cancelledCount > 0 && (
                <SummaryStat dot="bg-red-500" label="결제 취소" value={`${payment.cancelledCount}건`} />
              )}
            </>
          ) : (
            <>
              <SummaryStat dot="bg-emerald-500" label="출석" value={`${usage.attended}회`} />
              {usage.absent > 0 && (
                <SummaryStat dot="bg-red-500" label="결석" value={`${usage.absent}회`} />
              )}
              {usage.cancelled > 0 && (
                <SummaryStat dot="bg-wtext-4" label="수업 취소" value={`${usage.cancelled}회`} />
              )}
            </>
          )}
        </div>
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
    if (isCancelled) return 'bg-wbg dark:bg-rink-800 text-wtext-4';
    if (item.type === 'trial')
      return 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400';
    return 'bg-ice-50 dark:bg-ice-500/10 text-ice-500';
  };

  return (
    <div
      className={cn(
        'group flex flex-col gap-3 rounded-w-lg bg-wsurface dark:bg-rink-800 p-4 shadow-sh-1 border border-transparent hover:border-ice-500/10 transition-colors motion-reduce:transition-none',
        isCancelled && 'opacity-80 hover:opacity-100'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-4">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-w-md',
              getIconBgColor()
            )}
          >
            <Icon name={getIcon()} className="text-2xl" />
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-0.5">
            {/* [추가 2026-05-13] 수업명 (className) → 상품명 위에 작은 라벨로 노출 */}
            {item.className && (
              <span
                className={cn(
                  'truncate text-card-meta leading-tight',
                  isCancelled
                    ? 'text-wtext-4 line-through decoration-wtext-4/50'
                    : 'text-ice-500 dark:text-ice-400',
                )}
              >
                {item.className}
              </span>
            )}
            <h4
              className={cn(
                'truncate text-card-title leading-tight',
                isCancelled
                  ? 'text-wtext-3 dark:text-rink-300 line-through decoration-wtext-4/50'
                  : 'text-wtext-1 dark:text-white'
              )}
            >
              {item.productName}
            </h4>
            <span className="truncate whitespace-nowrap text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums">
              {item.date} · {item.time}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              'text-card-emphasis font-bold font-num tabular-nums',
              isCancelled
                ? 'text-wtext-4 line-through decoration-wtext-4/50'
                : 'text-wtext-1 dark:text-white'
            )}
          >
            {item.amount.toLocaleString()}원
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-wline-2 dark:border-rink-700 pt-3">
        <div className="flex items-center gap-1.5">
          <span
            className={cn('flex h-2 w-2 rounded-w-pill', isCancelled ? 'bg-red-500' : 'bg-emerald-500')}
          />
          <span
            className={cn(
              'text-card-meta font-semibold',
              isCancelled ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {isCancelled ? '결제 취소' : '결제 완료'}
          </span>
        </div>

        {isCancelled ? (
          <span className="text-card-meta text-wtext-4">{item.refundStatus ?? '환불 완료'}</span>
        ) : (
          <div className="flex items-center gap-3">
            <NavLink
              href={`/payment/receipt/${item.id}`}
              className="text-card-meta text-wtext-4 hover:text-wtext-3 dark:hover:text-rink-300 underline underline-offset-2"
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
                className="px-3 py-1 rounded-w-md border border-red-500 text-red-600 dark:text-red-400 text-card-meta font-semibold hover:bg-red-50 dark:hover:bg-red-900/10 active:brightness-95 transition-colors motion-reduce:transition-none disabled:opacity-60 disabled:cursor-not-allowed"
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

function UsageHistoryCard({ item }: { item: UsageHistoryItem }) {
  const isCancelled = item.status === 'cancelled';

  const getStatusText = () => {
    if (item.status === 'attended') return '출석';
    if (item.status === 'absent') return '결석';
    return '수업 취소';
  };

  const getStatusColor = () => {
    if (item.status === 'attended') return 'bg-emerald-500';
    if (item.status === 'absent') return 'bg-red-500';
    return 'bg-wtext-4';
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-w-lg bg-wsurface dark:bg-rink-800 p-4 shadow-sh-1 border border-transparent',
        isCancelled && 'opacity-80'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-w-md bg-wbg dark:bg-rink-700 text-wtext-2 dark:text-rink-200">
            <Icon name="school" className="text-2xl" />
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-0.5">
            <h4 className="truncate text-card-title text-wtext-1 dark:text-white leading-tight">
              {item.className}
            </h4>
            <span className="truncate whitespace-nowrap text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums">
              {item.date} · {item.time}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-card-emphasis font-bold font-num tabular-nums text-wtext-1 dark:text-white">
            {isCancelled ? '0회' : `-${item.creditsUsed}회`}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-wline-2 dark:border-rink-700 pt-3">
        <div className="flex items-center gap-1.5">
          <span className={cn('flex h-2 w-2 rounded-w-pill', getStatusColor())} />
          <span
            className={cn(
              'text-card-meta font-semibold',
              item.status === 'attended' && 'text-emerald-600 dark:text-emerald-400',
              item.status === 'absent' && 'text-red-500',
              item.status === 'cancelled' && 'text-wtext-3'
            )}
          >
            {getStatusText()}
          </span>
        </div>
        {isCancelled && (
          <span className="text-card-meta text-wtext-4">크레딧 복구됨</span>
        )}
      </div>
    </div>
  );
}

function MonthGroupHeader({ month, count }: { month: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h3 className="truncate text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
        {month}
      </h3>
      <span className="shrink-0 whitespace-nowrap text-w-caption font-medium text-wtext-4 bg-wsurface dark:bg-rink-800 px-2 py-0.5 rounded-w-pill tabular-nums">
        총 {count}건
      </span>
    </div>
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
    return <EmptyState type="payment" filtered={isFiltered} />;
  }

  return (
    <main className="flex flex-col gap-6 px-4 py-2">
      {entries.map(([month, items]) => (
        <div key={month} className="flex flex-col gap-3">
          <MonthGroupHeader month={month} count={items.length} />

          {items.map((item) => (
            <PaymentHistoryCard
              key={item.id}
              item={item}
              onCancel={onCancel}
              isCancelling={cancellingId === item.id}
            />
          ))}
        </div>
      ))}

      {/* Footer Note */}
      <div className="mt-4 px-2 text-center">
        <p className="text-w-caption leading-relaxed text-wtext-4 dark:text-rink-300">
          결제 내역은 최근 1년까지 조회 가능합니다.
          <br />
          문의사항이 있으시면 고객센터를 이용해 주세요.
        </p>
      </div>
    </main>
  );
}

function UsageHistoryList({
  groupedUsages,
  isLoading,
  error,
  isFiltered,
  onRetry,
}: {
  groupedUsages: GroupedUsageHistory;
  isLoading: boolean;
  error: string | null;
  isFiltered: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  const entries = Object.entries(groupedUsages);

  if (entries.length === 0) {
    return <EmptyState type="usage" filtered={isFiltered} />;
  }

  return (
    <main className="flex flex-col gap-6 px-4 py-2">
      {entries.map(([month, items]) => (
        <div key={month} className="flex flex-col gap-3">
          <MonthGroupHeader month={month} count={items.length} />

          {items.map((item) => (
            <UsageHistoryCard key={item.id} item={item} />
          ))}
        </div>
      ))}

      {/* Footer Note */}
      <div className="mt-4 px-2 text-center">
        <p className="text-w-caption leading-relaxed text-wtext-4 dark:text-rink-300">
          사용 내역은 최근 1년까지 조회 가능합니다.
          <br />
          수업 취소 시 크레딧이 자동으로 복구됩니다.
        </p>
      </div>
    </main>
  );
}

export default function PaymentHistoryPage() {
  // [appbar-harness-v2] Status bar + Native AppBar 명시 (v2 회귀 차단).
  //   - PageAppBar 가 Web DOM 헤더를 그리는 동안 Flutter 측은 native AppBar 로 동일 영역 채움.
  //   - showAppBar:true → 이중 헤더 방지 위해 PageAppBar 가 native 환경에선 null 반환(기존 로직).
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '결제내역',
    showBottomNav: false,
    showBackButton: true,
  });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('payment');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // Payment history state — raw 배열 보관 후 기간 필터/그룹화는 파생으로 계산
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [isPaymentLoading, setIsPaymentLoading] = useState(true);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Usage history state
  const [usages, setUsages] = useState<UsageHistoryItem[]>([]);
  const [isUsageLoading, setIsUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  // v16 — 활성 탭의 데이터 로드 완료 시 풀스크린 로더 hide 신호
  usePageReady(activeTab === 'payment' ? !isPaymentLoading : !isUsageLoading);

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
  const filteredUsages = useMemo(
    () => filterByPeriod(usages, periodFilter),
    [usages, periodFilter],
  );
  const groupedUsages = useMemo(
    () => groupUsagesByMonth(filteredUsages),
    [filteredUsages],
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

  const usageSummary = useMemo<UsageSummary>(() => {
    let attended = 0;
    let absent = 0;
    let cancelled = 0;
    let creditsUsed = 0;
    for (const u of filteredUsages) {
      if (u.status === 'attended') attended += 1;
      else if (u.status === 'absent') absent += 1;
      else cancelled += 1;
      if (u.status !== 'cancelled') creditsUsed += u.creditsUsed;
    }
    return { count: filteredUsages.length, attended, absent, cancelled, creditsUsed };
  }, [filteredUsages]);

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

  const fetchUsageHistory = async () => {
    setIsUsageLoading(true);
    setUsageError(null);

    const response = await getUsageHistory();

    if (response.success && response.data) {
      setUsages(response.data.usages ?? []);
    } else {
      setUsageError(response.error?.message || MESSAGES.payment2.usageLoadError);
    }

    setIsUsageLoading(false);
  };

  useEffect(() => {
    fetchPaymentHistory();
    fetchUsageHistory();
  }, []);

  /** [추가 2026-05-13] 결제취소 — 토스/KG 분기는 backend PaymentRefundService 가 처리.
   *  성공 시 결제 내역 + 크레딧 잔액 동시 재조회 (refund 시 크레딧 복원되므로).
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
      await Promise.all([fetchPaymentHistory(), fetchUsageHistory()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : MESSAGES.payment2.cancelFailed);
    } finally {
      setCancellingId(null);
    }
  };

  // 활성 탭 기준 상태 (필터 바 / 요약 카드 노출 제어)
  const isActiveLoading = activeTab === 'payment' ? isPaymentLoading : isUsageLoading;
  const activeError = activeTab === 'payment' ? paymentError : usageError;
  const activeCount = activeTab === 'payment' ? paymentSummary.count : usageSummary.count;
  const isFiltered = periodFilter !== 'all';
  const showSummary = !isActiveLoading && !activeError && activeCount > 0;

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [appbar-harness-v4 · parent-agent · 2026-05-12] rightAction 제거 —
          기존 "도움말" 아이콘은 onClick 핸들러가 비어 있는 죽은 버튼이었으며 우측 3 액션을 통째로
          대체하여 시계/종/메뉴 접근성을 차단했음. SPEC §3 분류 C 가이드에 따라 제거하고
          default 3 액션(시계/종/메뉴) 자동 노출로 복원. 도움말 진입이 필요하면 별도 entry
          (예: `/help` 링크 카드)를 페이지 body 영역에 추가 권장. */}
      <PageAppBar title="결제내역" />

      {/* 스크롤 영역 — MobileContainer 직계 자식(overflow-y-auto)만 momentum 스크롤 대상.
          PageAppBar 는 영역 밖(고정 헤더)에 유지하고, 본문 전체를 이 컨테이너가 스크롤. */}
      <div className="flex-1 min-h-0 overflow-y-auto [&>*]:shrink-0">
        {/* Tabs Navigation — 스크롤 영역 상단 sticky */}
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Filter Bar — 조회 건수 + 기간 선택 칩 (항상 노출, 빈 결과에서도 기간 변경 가능) */}
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
          <span className="shrink-0 whitespace-nowrap text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums">
            {isActiveLoading || activeError ? PERIOD_LABEL[periodFilter] : `${activeCount}건 조회`}
          </span>
          <button
            type="button"
            onClick={() => setIsFilterSheetOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-w-pill bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 px-3 py-1.5 text-card-meta font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors motion-reduce:transition-none active:brightness-95"
            aria-label="기간 필터 변경"
          >
            <Icon name="calendar_month" className="text-base" aria-hidden="true" />
            {PERIOD_LABEL[periodFilter]}
            <Icon name="expand_more" className="text-base" aria-hidden="true" />
          </button>
        </div>

        {/* Summary Card — 기간 내 결제 금액 / 사용 크레딧 요약 */}
        {showSummary && (
          <SummaryCard activeTab={activeTab} payment={paymentSummary} usage={usageSummary} />
        )}

        {/* History List — hasBottomNav=false 이므로 safe-area-inset-bottom 반영 유틸로 하단 여백 처리 */}
        <div className="pb-safe-8">
          {activeTab === 'payment' ? (
            <PaymentHistoryList
              groupedPayments={groupedPayments}
              isLoading={isPaymentLoading}
              error={paymentError}
              isFiltered={isFiltered}
              onRetry={fetchPaymentHistory}
              onCancel={handleCancelPayment}
              cancellingId={cancellingId}
            />
          ) : (
            <UsageHistoryList
              groupedUsages={groupedUsages}
              isLoading={isUsageLoading}
              error={usageError}
              isFiltered={isFiltered}
              onRetry={fetchUsageHistory}
            />
          )}
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
