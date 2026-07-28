'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { NavLink } from '@/components/ui/NavLink';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { BottomSheetSelector } from '@/components/ui/BottomSheetSelector';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from '@/components/ui/Toast';
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
  createRefundRequest,
  getMyRefundRequests,
  type RefundRequestStatus,
} from '@/services/payment';
import { usePageReady } from '@/hooks/usePageReady';
import { api } from '@/services/api-client';
import {
  PendingPaymentsPanel,
  type PendingBilling,
} from '@/components/payment/PendingPaymentsPanel';
import type {
  PaymentHistoryItem,
  GroupedPaymentHistory,
} from '@/types/payment';

type PaymentTab = 'history' | 'pending';

/** "YYYY.MM.DD" → Date (월 1일 기준, 시각 0) */
function parseYmd(date: string): Date | null {
  const parts = date.split('.').map((n) => parseInt(n, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** "YYYY-MM" 정산월 → 후불 산정 근거 문구. 파싱 실패 시 null(라인 미표시). */
function formatBillingMonth(ym?: string): string | null {
  if (!ym) return null;
  const [y, m] = ym.split('-').map((n) => parseInt(n, 10));
  if (!y || !m) return null;
  return MESSAGES.payment2.settlementMonth(y, m);
}

/** 후불 산정 근거 세그먼트 — 자녀명 · 정산월 · 출석횟수 · 회당 단가 (있는 값만).
 *  잘림 방지를 위해 문자열 join 대신 배열로 반환 — 렌더에서 flex-wrap 으로
 *  세그먼트 경계 줄바꿈을 허용해 좁은 화면에서도 전체 값 표시를 보장한다. */
function buildPostpaidDetailSegments(item: PaymentHistoryItem): string[] {
  if (item.billingTiming !== 'POSTPAID') return [];
  return [
    item.childName,
    formatBillingMonth(item.billingYearMonth),
    item.attendanceCount ? MESSAGES.payment2.attendanceTimes(item.attendanceCount) : null,
    item.unitPrice ? MESSAGES.payment2.perSessionPrice(item.unitPrice) : null,
  ].filter((seg): seg is string => Boolean(seg));
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
        <SummaryStat dot="bg-mint-500" label="결제 완료" value={`${payment.completedCount}건`} />
        {payment.cancelledCount > 0 && (
          <SummaryStat dot="bg-it-red-500" label="결제 취소" value={`${payment.cancelledCount}건`} />
        )}
      </div>
    </section>
  );
}

/** 활성 환불 요청 상태(승인 대기/처리 중/실행 실패) — 버튼 대신 "환불 요청 중" 배지. */
const ACTIVE_REFUND_STATUSES: RefundRequestStatus[] = [
  'pending',
  'executing',
  'execution_failed',
];

/** 환불 요청 가능 기간(결제일 기준, 일) — 백엔드 create 가드와 동일 값. */
const REFUND_REQUEST_WINDOW_DAYS = 14;

/** 결제 시각이 요청 가능 기간 이내인지 — 원시 시각 부재/무효는 fail-closed(버튼 미노출, 백엔드 가드가 최종 판정). */
function isWithinRefundWindow(paidAtIso?: string): boolean {
  if (!paidAtIso) return false;
  const paidAt = new Date(paidAtIso).getTime();
  if (Number.isNaN(paidAt)) return false;
  return Date.now() - paidAt <= REFUND_REQUEST_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function PaymentHistoryCard({
  item,
  onRequestRefund,
  isRequesting,
  refundStatus,
}: {
  item: PaymentHistoryItem;
  onRequestRefund?: (paymentId: string, productName: string) => void;
  isRequesting?: boolean;
  /** 이 결제의 최신 환불 요청 상태(있으면). 활성=배지, 거절=배지+재요청 허용. */
  refundStatus?: RefundRequestStatus;
}) {
  // [수정 2026-05-13] 'cancelled' 또는 'refunded' 모두 환불 처리 — 토스 cancel 응답은 'refunded' 로 갱신됨.
  const isCancelled = item.status === 'cancelled' || item.status === 'refunded';
  const isCompleted = item.status === 'completed';
  // 환불 요청 상태 파생 — 활성(대기/처리중/실패)=요청 중 배지, 거절=배지+재요청 허용.
  const refundActive = refundStatus ? ACTIVE_REFUND_STATUSES.includes(refundStatus) : false;
  const refundRejected = refundStatus === 'rejected';
  // 카드 상단 라벨 — 선불 수업명(className) 우선, 없으면 대회명/후불 수업명(subjectName)
  const subjectLabel = item.className ?? item.subjectName;
  const postpaidSegments = buildPostpaidDetailSegments(item);

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
            {/* [추가 2026-05-13] 수업명/대회명 → 상품명 위에 작은 라벨로 노출 (후불·대회는 subjectName 폴백) */}
            {subjectLabel && (
              <span
                className={cn(
                  'truncate text-card-meta leading-tight',
                  isCancelled
                    ? 'text-it-ink-400 line-through decoration-it-ink-400/50'
                    : 'text-it-blue-500 dark:text-it-blue-300',
                )}
              >
                {subjectLabel}
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
            {/* 후불 산정 근거 — 자녀명 · 정산월 · 출석횟수 · 회당 단가 (있는 값만).
                truncate 금지 — 좁은 폭에서는 세그먼트 경계로 줄바꿈해 핵심 값이 잘리지 않게 한다. */}
            {postpaidSegments.length > 0 && (
              <span className="flex flex-wrap gap-x-1 gap-y-0.5 text-card-meta text-it-ink-500 dark:text-rink-300 tabular-nums">
                {postpaidSegments.map((seg, i) => (
                  <span key={`${i}-${seg}`} className="whitespace-nowrap">
                    {i < postpaidSegments.length - 1 ? `${seg} ·` : seg}
                  </span>
                ))}
              </span>
            )}
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
            className={cn('flex h-2 w-2 rounded-w-pill', isCancelled ? 'bg-it-red-500' : 'bg-mint-500')}
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
          <span className="text-card-meta text-it-ink-400">{item.refundStatus ?? MESSAGES.refund.status.executed}</span>
        ) : (
          <div className="flex items-center gap-3">
            <NavLink
              href={`/payment/receipt/${item.id}`}
              className="text-card-meta font-semibold text-success underline underline-offset-2"
            >
              영수증 보기
            </NavLink>
            {/* 환불 승인제 — 즉시 취소 폐기. 활성 요청은 배지, 거절은 배지+재요청, 그 외 결제완료는 요청 버튼. */}
            {refundActive ? (
              <span
                className="inline-flex items-center gap-1 rounded-w-pill bg-sun-100 px-2.5 py-1 text-card-meta font-bold text-it-ink-800 dark:bg-sun-500/15 dark:text-sun-500"
                aria-label={MESSAGES.refund.requestPendingBadge}
              >
                <Icon name="schedule" className="text-[13px]" aria-hidden="true" />
                {MESSAGES.refund.requestPendingBadge}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                {refundRejected && (
                  <span
                    className="inline-flex items-center gap-1 rounded-w-pill bg-it-red-50 px-2.5 py-1 text-card-meta font-bold text-it-red-600 dark:bg-it-red-500/15 dark:text-it-red-400"
                    aria-label={MESSAGES.refund.requestRejectedBadge}
                  >
                    <Icon name="block" className="text-[13px]" aria-hidden="true" />
                    {MESSAGES.refund.requestRejectedBadge}
                  </span>
                )}
                {isCompleted && isWithinRefundWindow(item.paidAtIso) && onRequestRefund && (
                  <button
                    type="button"
                    onClick={() => onRequestRefund(item.id, item.productName)}
                    disabled={isRequesting}
                    className="px-3 py-1 rounded-w-md border border-it-red-500 text-it-red-600 dark:text-it-red-200 text-card-meta font-semibold hover:bg-it-red-50 dark:hover:bg-it-red-500/15 active:brightness-95 transition-colors motion-reduce:transition-none disabled:opacity-60 disabled:cursor-not-allowed"
                    aria-label={MESSAGES.refund.requestButton}
                  >
                    {isRequesting ? MESSAGES.refund.requestProcessing : MESSAGES.refund.requestButton}
                  </button>
                )}
              </div>
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
  onRequestRefund,
  requestingId,
  refundMap,
}: {
  groupedPayments: GroupedPaymentHistory;
  isLoading: boolean;
  error: string | null;
  isFiltered: boolean;
  onRetry: () => void;
  onRequestRefund?: (paymentId: string, productName: string) => void;
  requestingId?: string | null;
  /** paymentId → 최신 환불 요청 상태. */
  refundMap?: Record<string, RefundRequestStatus>;
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
              onRequestRefund={onRequestRefund}
              isRequesting={requestingId === item.id}
              refundStatus={refundMap?.[item.id]}
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

function PaymentHistoryContent() {
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

  // 탭 — 결제 내역(기본) / 결제 대기. 미납 안내 알림 딥링크(?tab=pending) 초기 탭 지원.
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<PaymentTab>(
    searchParams?.get('tab') === 'pending' ? 'pending' : 'history',
  );

  // Payment history state — raw 배열 보관 후 기간 필터/그룹화는 파생으로 계산
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [isPaymentLoading, setIsPaymentLoading] = useState(true);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // 미납 후불 청구 — 탭 배지 건수 + 미납 탭 목록 공용. 대시보드 배너와 동일 규약
  // (orderNumber 없는 항목 제외 · 비학부모 403 은 빈 목록 처리).
  const [pendingBillings, setPendingBillings] = useState<PendingBilling[] | null>(null);
  const [pendingError, setPendingError] = useState(false);
  const isPendingLoading = pendingBillings === null && !pendingError;

  // v16 — 두 데이터(내역 + 미납) 로드 완료 시 풀스크린 로더 hide 신호
  usePageReady(!isPaymentLoading && !isPendingLoading);

  // 환불 요청 처리 + 내 환불 요청 상태 맵(버튼→배지 대체용)
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [refundMap, setRefundMap] = useState<Record<string, RefundRequestStatus>>({});
  // 환불 요청 사유 입력 시트 — 대상 결제 + 사유(필수).
  const [refundTarget, setRefundTarget] = useState<{ paymentId: string; productName: string } | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const { toast } = useToast();

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

  /** 내 환불 요청 조회 → paymentId 별 최신 상태 맵. 활성 우선, 그다음 거절(재요청 안내). */
  const loadMyRefunds = async () => {
    const res = await getMyRefundRequests();
    if (!res.success || !res.data) return;
    const map: Record<string, RefundRequestStatus> = {};
    for (const r of res.data) {
      if (r.status === 'unknown') continue; // 미지 상태는 배지 미표시(fail-closed)
      if (ACTIVE_REFUND_STATUSES.includes(r.status)) {
        map[r.paymentId] = r.status; // 활성은 항상 우선
      } else if (r.status === 'rejected' && !map[r.paymentId]) {
        map[r.paymentId] = 'rejected';
      }
      // executed/canceled 는 결제 자체가 refunded 표기 → 배지 불필요.
    }
    setRefundMap(map);
  };

  const fetchPendingBillings = async () => {
    setPendingError(false);
    const res = await api.get<PendingBilling[]>('/payments/postpaid/my-pending');
    if (res.success) {
      const list = Array.isArray(res.data) ? res.data : [];
      setPendingBillings(list.filter((b) => !!b.orderNumber));
    } else if (res.error?.statusCode === 403) {
      setPendingBillings([]);
    } else {
      setPendingBillings(null);
      setPendingError(true);
    }
  };

  useEffect(() => {
    fetchPaymentHistory();
    void loadMyRefunds();
    void fetchPendingBillings();
  }, []);

  /** 환불 요청 버튼 → 사유 입력 시트 오픈(사유는 감독 승인 판단 자료의 핵심이라 필수). */
  const openRefundSheet = (paymentId: string, productName: string) => {
    setRefundReason('');
    setRefundTarget({ paymentId, productName });
  };

  /** 환불 요청 제출 — 즉시 취소 폐기. RefundRequest(pending) 생성 후 감독/운영자 승인 대기.
   *  성공 시 결제 내역 + 내 환불 요청 상태 재조회(버튼→"환불 요청 중" 배지 전환).
   */
  const submitRefundRequest = async () => {
    if (!refundTarget) return;
    const reason = refundReason.trim();
    if (!reason) {
      toast.error(MESSAGES.refund.requestReasonRequired);
      return;
    }
    setRequestingId(refundTarget.paymentId);
    try {
      const res = await createRefundRequest({ paymentId: refundTarget.paymentId, reason });
      if (!res.success) {
        const code = res.error?.statusCode;
        if (code === 409) {
          toast.error(MESSAGES.refund.duplicateActive);
        } else if (code === 422) {
          toast.error(MESSAGES.refund.unsupportedPayment);
        } else {
          toast.error(res.error?.message ?? MESSAGES.refund.requestFailed);
        }
        await loadMyRefunds(); // 서버 상태와 재동기화(경쟁으로 이미 요청됨 등)
        return;
      }
      toast.success(MESSAGES.refund.requestSuccess);
      setRefundTarget(null);
      setRefundReason('');
      await Promise.all([fetchPaymentHistory(), loadMyRefunds()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : MESSAGES.refund.requestFailed);
    } finally {
      setRequestingId(null);
    }
  };

  const isFiltered = periodFilter !== 'all';
  const showSummary = !isPaymentLoading && !paymentError && paymentSummary.count > 0;

  const pendingCount = pendingBillings?.length ?? 0;
  const tabs: { key: PaymentTab; label: string; badge?: number }[] = [
    { key: 'history', label: MESSAGES.payment2.tabHistory },
    { key: 'pending', label: MESSAGES.payment2.tabPending, badge: pendingCount },
  ];

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
        {/* 탭 — 결제 내역 / 결제 대기 (정산 센터와 동일 패턴). 결제 대기 탭은 건수 배지 표기 */}
        <div
          role="tablist"
          aria-label={MESSAGES.payment2.tabsAria}
          className="flex border-b border-it-line bg-it-surface dark:border-rink-700 dark:bg-rink-800"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`payment-history-panel-${tab.key}`}
                id={`payment-history-tab-${tab.key}`}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'relative flex-1 px-1 pb-[13px] pt-[14px] text-[15px] transition-colors duration-200 motion-reduce:transition-none',
                  isActive
                    ? 'font-extrabold text-it-blue-600 dark:text-white'
                    : 'font-semibold text-it-ink-500 hover:text-it-ink-800 dark:text-wtext-4 dark:hover:text-white',
                )}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  {tab.label}
                  {(tab.badge ?? 0) > 0 && (
                    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-w-pill bg-it-red-500 px-1 text-[11px] font-bold leading-none tabular-nums text-white">
                      {tab.badge}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-x-0 -bottom-px h-[2.5px] rounded-sm',
                    isActive ? 'bg-it-blue-500' : 'bg-transparent',
                  )}
                />
              </button>
            );
          })}
        </div>

        {activeTab === 'history' ? (
          <div
            role="tabpanel"
            id="payment-history-panel-history"
            aria-labelledby="payment-history-tab-history"
            className="[&>*]:shrink-0"
          >
            {/* Summary Card — 기간 내 총 결제 금액 요약 (navy 히어로, 탭 바로 아래 최상단) */}
            {showSummary && <SummaryCard payment={paymentSummary} />}

            {/* Filter Bar — 조회 건수 + 기간 선택 칩. 히어로 하단·리스트 헤더 자리.
                항상 노출(빈 결과에서도 기간 변경 가능) — 히어로 미노출 시 탭 바로 아래로 붙는다. */}
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

            {/* History List — 하단 여백은 MobileContainer hasBottomNav(60px+safe-area 예약)가 담당 */}
            <div>
              <PaymentHistoryList
                groupedPayments={groupedPayments}
                isLoading={isPaymentLoading}
                error={paymentError}
                isFiltered={isFiltered}
                onRetry={fetchPaymentHistory}
                onRequestRefund={openRefundSheet}
                requestingId={requestingId}
                refundMap={refundMap}
              />
            </div>
          </div>
        ) : (
          <div
            role="tabpanel"
            id="payment-history-panel-pending"
            aria-labelledby="payment-history-tab-pending"
            className="[&>*]:shrink-0"
          >
            <PendingPaymentsPanel
              items={pendingBillings ?? []}
              isLoading={isPendingLoading}
              hasError={pendingError}
              onRetry={() => void fetchPendingBillings()}
            />
          </div>
        )}
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

      {/* 환불 요청 사유 입력 시트 — 사유 필수(1~500자). 즉시 취소 폐기 → 승인제. */}
      <BottomSheet
        isOpen={refundTarget !== null}
        onClose={() => {
          if (requestingId) return; // 제출 처리 중 닫기 방지
          setRefundTarget(null);
          setRefundReason('');
        }}
        title={MESSAGES.refund.requestModalTitle}
        footer={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setRefundTarget(null);
                setRefundReason('');
              }}
              disabled={requestingId !== null}
              className="h-12 flex-1 rounded-w-md bg-it-fill text-card-title font-semibold text-it-ink-700 transition-colors motion-reduce:transition-none hover:bg-it-line active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-it-blue-900/40 dark:text-it-ink-200 dark:hover:bg-it-blue-900/60"
            >
              {MESSAGES.refund.requestModalCancel}
            </button>
            <button
              type="button"
              onClick={() => void submitRefundRequest()}
              disabled={!refundReason.trim() || requestingId !== null}
              className="h-12 flex-1 rounded-w-md bg-it-red-500 text-card-title font-semibold text-white transition-colors motion-reduce:transition-none hover:bg-it-red-600 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {requestingId !== null ? MESSAGES.refund.requestProcessing : MESSAGES.refund.requestSubmit}
            </button>
          </div>
        }
      >
        <div className="mt-2 space-y-3 pb-2">
          <p className="text-card-body leading-relaxed text-it-ink-600 dark:text-rink-300">
            {MESSAGES.refund.requestModalBody}
          </p>
          <div>
            <label
              htmlFor="refund-request-reason"
              className="mb-1.5 block text-card-meta font-bold text-it-ink-500 dark:text-it-ink-300"
            >
              {MESSAGES.refund.requestReasonLabel}{' '}
              <span className="text-it-red-500 dark:text-it-red-400">*</span>
            </label>
            <textarea
              id="refund-request-reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder={MESSAGES.refund.requestReasonPlaceholder}
              rows={3}
              maxLength={500}
              disabled={requestingId !== null}
              className="w-full resize-none rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-4 py-3 text-card-body text-it-ink-800 transition-colors placeholder:text-it-ink-400 focus:border-it-blue-500 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 motion-reduce:transition-none disabled:opacity-60 dark:border-it-blue-900 dark:bg-it-blue-900/40 dark:text-white dark:placeholder:text-it-ink-300"
            />
            {/* 필수 안내 — 항상 자리 예약(min-h)으로 시트 높이 점프 방지 */}
            <p
              className={`mt-1 min-h-[18px] text-card-meta text-it-red-500 dark:text-it-red-400${refundReason.trim() ? ' invisible' : ''}`}
            >
              {MESSAGES.refund.requestReasonRequired}
            </p>
          </div>
        </div>
      </BottomSheet>

      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}

export default function PaymentHistoryPage() {
  // useSearchParams(?tab=pending 딥링크)는 Suspense 경계 내에서만 사용 가능.
  return (
    <Suspense fallback={null}>
      <PaymentHistoryContent />
    </Suspense>
  );
}
