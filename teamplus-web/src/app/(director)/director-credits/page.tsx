'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useScreenMetrics } from '@/hooks/useScreenMetrics';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import {
  getCreditStatus,
  getPaymentHistory,
  getUsageHistory,
  groupPaymentsByMonth,
  groupUsagesByMonth,
} from '@/services/payment';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import type {
  CreditStatus,
  PaymentHistoryItem,
  UsageHistoryItem,
} from '@/types/payment';

/**
 * Director Credits Page — 감독 개인의 "결제 및 크레딧 현황" 페이지.
 *
 * 기존 /director-payments (팀 전체 결제 관리)와는 용도가 다르다:
 *   - /director-payments: 팀 전체 수입/미수금/팀별 결제 관리 (관리자 view)
 *   - /director-credits : 감독 본인의 크레딧 현황 + 결제·사용 내역 (마이페이지 view)
 *
 * 디자인 원칙 — AI 스타일 금지 규칙 엄수:
 *   - gradient / backdrop-blur / colored-shadow 일절 사용 금지
 *   - 솔리드 컬러 + 표준 shadow-sh-1 만 사용
 *   - 헤더 스크롤 blur 예외도 PageAppBar가 이미 표준 배경으로 처리
 *
 * 인증/권한:
 *   - DIRECTOR 롤 가드는 (director)/layout.tsx 에서 단 한 번만 수행 (중복 호출 금지)
 */

type TabType = 'payment' | 'usage';

// ─── Fallback 데이터 (API 실패 시 UI 유지용) ───────────────────────
const FALLBACK_CREDIT: CreditStatus = {
  currentCredits: 0,
  totalCredits: 0,
  usedCredits: 0,
  expiringCredits: 0,
  expiresIn: 0,
};

// ─── 아이콘/색상 매핑 ──────────────────────────────────────────────
function getPaymentIcon(type: PaymentHistoryItem['type']): {
  icon: string;
  bg: string;
  text: string;
} {
  switch (type) {
    case 'trial':
      return {
        icon: 'local_activity',
        bg: 'bg-ice-50 dark:bg-ice-500/15',
        text: 'text-ice-500 dark:text-ice-500',
      };
    case 'cancelled':
      return {
        icon: 'remove_shopping_cart',
        bg: 'bg-wline-2 dark:bg-rink-700',
        text: 'text-wtext-3 dark:text-wtext-4',
      };
    case 'regular':
    default:
      return {
        icon: 'confirmation_number',
        bg: 'bg-ice-50 dark:bg-ice-500/15',
        text: 'text-ice-500 dark:text-ice-500',
      };
  }
}

function getUsageIcon(status: UsageHistoryItem['status']): {
  icon: string;
  bg: string;
  text: string;
} {
  switch (status) {
    case 'absent':
      return {
        icon: 'event_busy',
        bg: 'bg-sun-100 dark:bg-sun-500/15',
        text: 'text-sun-500 dark:text-sun-500',
      };
    case 'cancelled':
      return {
        icon: 'cancel',
        bg: 'bg-wline-2 dark:bg-rink-700',
        text: 'text-wtext-3 dark:text-wtext-4',
      };
    case 'attended':
    default:
      return {
        icon: 'check_circle',
        bg: 'bg-mint-100 dark:bg-mint-500/15',
        text: 'text-mint-500 dark:text-mint-500',
      };
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount);
}

// ─── 빈 상태 ──────────────────────────────────────────────────────
function EmptyState({
  icon,
  message,
  hint,
}: {
  icon: string;
  message: string;
  hint?: string;
}) {
  return (
    <div role="status" className="flex flex-col items-center px-4 py-14 text-center">
      <Icon
        name={icon}
        className="mb-3 text-5xl text-wtext-3 dark:text-wtext-4"
        aria-hidden="true"
      />
      <p className="text-card-body font-semibold text-wtext-2 dark:text-wtext-4">{message}</p>
      {hint && (
        <p className="mt-1.5 max-w-[240px] text-card-meta font-medium leading-relaxed text-wtext-3 dark:text-wtext-4">
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────
export default function DirectorCreditsPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  const { navigate } = useNavigation();

  // [hotfix 2026-05-13 D15] 이중 헤더 방지 — Flutter Native AppBar 명시 비활성화.
  //   Web PageAppBar(forceNative)가 단독 헤더 역할 (SPEC §0 정상 패턴 준수).
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const [activeTab, setActiveTab] = useState<TabType>('payment');

  // ─── 탭 슬라이딩 인디케이터 ──────────────────────
  const tabsNavRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<TabType, HTMLButtonElement | null>>({
    payment: null,
    usage: null,
  });
  const [tabIndicator, setTabIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const updateTabIndicator = useCallback(() => {
    const btn = tabRefs.current[activeTab];
    const nav = tabsNavRef.current;
    if (!btn || !nav) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setTabIndicator({ left: btnRect.left - navRect.left, width: btnRect.width });
  }, [activeTab]);

  const [isLoading, setIsLoading] = useState(true);


  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF

  usePageReady(!isLoading);
  const [creditStatus, setCreditStatus] = useState<CreditStatus>(FALLBACK_CREDIT);
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [usages, setUsages] = useState<UsageHistoryItem[]>([]);

  // 화면 폭 변경(회전·키보드·접힘 포함) 시 인디케이터 재측정 — SoT 단일 구독자
  // (2026-05-11) window.addEventListener('resize') 제거 — useScreenMetrics 사용
  const { width: screenWidth } = useScreenMetrics();

  // 로딩 종료(탭 DOM 렌더) 직후 + 화면 폭 변경 시 인디케이터 재측정
  useLayoutEffect(() => {
    updateTabIndicator();
  }, [updateTabIndicator, isLoading, screenWidth]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [creditRes, paymentRes, usageRes] = await Promise.all([
        getCreditStatus(),
        getPaymentHistory({ limit: 50 }),
        getUsageHistory({ limit: 50 }),
      ]);

      if (creditRes.success && creditRes.data?.creditStatus) {
        setCreditStatus(creditRes.data.creditStatus);
      }

      if (paymentRes.success && Array.isArray(paymentRes.data?.payments)) {
        setPayments(paymentRes.data.payments);
      } else {
        setPayments([]);
      }

      if (usageRes.success && Array.isArray(usageRes.data?.usages)) {
        setUsages(usageRes.data.usages);
      } else {
        setUsages([]);
      }
    } catch {
      setErrorMessage(MESSAGES.error.network);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 월별 그룹화 (서비스 레이어 공용 유틸 재사용)
  const groupedPayments = useMemo(() => groupPaymentsByMonth(payments), [payments]);
  const groupedUsages = useMemo(() => groupUsagesByMonth(usages), [usages]);

  const paymentMonthKeys = useMemo(
    () => Object.keys(groupedPayments).sort((a, b) => b.localeCompare(a, 'ko-KR')),
    [groupedPayments],
  );
  const usageMonthKeys = useMemo(
    () => Object.keys(groupedUsages).sort((a, b) => b.localeCompare(a, 'ko-KR')),
    [groupedUsages],
  );

  const handleCharge = useCallback(() => {
    // 크레딧 충전 → 상품 선택 페이지 이동
    navigate('/products');
  }, [navigate]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="결제권 관리" forceNative />

      <main
        className="hide-scrollbar flex-1 overflow-y-auto pb-10"
        role="main"
        aria-label="결제권 현황 및 내역"
      >
        {!isLoading && (
          <>
            {/* ─── 결제권 Hero 카드 (밝은 흰 카드 — director-payments 와 톤 통일) ──
                  타이포·라인·그림자(sh-2)로 위계. 장식 SVG·stars·닷 제거.
                  보유 결제권을 34px KPI 로 격상하고, 충전 CTA 는 ice 강조 유지. */}
            <section className="px-4 pt-4" aria-label="보유 결제권 현황">
              <div className="animate-fade-in rounded-w-xl border border-wline-2 bg-wsurface p-6 shadow-sh-2 motion-reduce:animate-none dark:border-rink-700 dark:bg-rink-800">
                {/* 보유 결제권 KPI */}
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-wtext-3 dark:text-wtext-4">
                  보유 결제권
                </p>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span
                    className="text-[34px] font-extrabold leading-none tracking-tight tabular-nums text-wtext-1 dark:text-white"
                    aria-live="polite"
                  >
                    {creditStatus.currentCredits}
                  </span>
                  <span className="text-w-h3 font-bold text-wtext-3 dark:text-wtext-4">회</span>
                </div>
                {creditStatus.expiringCredits > 0 && (
                  <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-w-pill bg-flame-100 px-2.5 py-1 text-card-meta font-bold text-flame-500 dark:bg-flame-500/15 dark:text-flame-500">
                    <Icon name="schedule" className="text-card-meta" aria-hidden="true" />
                    {creditStatus.expiresIn}일 내 {creditStatus.expiringCredits}회 만료
                  </span>
                )}

                {/* 누적 발급 / 사용 — 정의형 2열 (라인 구분, 닷 제거) */}
                <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-wline-2 pt-5 dark:border-rink-700">
                  <div>
                    <dt className="text-card-meta text-wtext-3 dark:text-wtext-4">누적 발급</dt>
                    <dd className="mt-1 text-w-title font-bold tabular-nums text-wtext-1 dark:text-white">
                      {creditStatus.totalCredits}
                      <span className="ml-0.5 text-card-meta font-medium text-wtext-3 dark:text-wtext-4">회</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-card-meta text-wtext-3 dark:text-wtext-4">누적 사용</dt>
                    <dd className="mt-1 text-w-title font-bold tabular-nums text-wtext-1 dark:text-white">
                      {creditStatus.usedCredits}
                      <span className="ml-0.5 text-card-meta font-medium text-wtext-3 dark:text-wtext-4">회</span>
                    </dd>
                  </div>
                </dl>

                {/* 충전 CTA — 흰 카드 위 인디고 강조 */}
                <button
                  type="button"
                  onClick={handleCharge}
                  className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-w-md bg-ice-500 py-3.5 text-white shadow-sh-1 transition-colors motion-reduce:transition-none hover:bg-ice-600 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-wsurface dark:focus-visible:ring-offset-rink-800"
                  aria-label="결제권 충전하기"
                >
                  <Icon name="add_card" className="text-card-title" aria-hidden="true" />
                  <span className="text-card-body font-bold tracking-wide">결제권 충전하기</span>
                </button>
              </div>
            </section>

            {errorMessage && (
              <div
                role="alert"
                className="mx-4 mt-4 rounded-w-md border border-flame-100 bg-flame-100/40 px-4 py-3 text-card-body text-flame-500 dark:border-flame-500/30 dark:bg-flame-500/15 dark:text-flame-500"
              >
                {errorMessage}
              </div>
            )}

            {/* ─── 탭 네비게이션 (슬라이딩 인디케이터) ───────────── */}
            <section className="sticky top-[56px] z-10 bg-wbg px-4 pb-2 pt-5 dark:bg-puck">
              <div
                ref={tabsNavRef}
                role="tablist"
                aria-label="내역 종류 선택"
                className="relative flex rounded-w-md bg-wline-2 p-1 dark:bg-rink-800"
              >
                {/* 슬라이딩 흰색 카드 */}
                <span
                  aria-hidden="true"
                  className="absolute top-1 bottom-1 rounded-w-sm bg-wsurface dark:bg-rink-700 shadow-sh-1 transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
                  style={{
                    left: `${tabIndicator.left}px`,
                    width: `${tabIndicator.width}px`,
                    opacity: tabIndicator.width > 0 ? 1 : 0,
                  }}
                />

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'payment'}
                  aria-controls="tab-panel-payment"
                  id="tab-payment"
                  ref={(el) => {
                    tabRefs.current.payment = el;
                  }}
                  onClick={() => setActiveTab('payment')}
                  className={cn(
                    'relative z-[1] flex-1 rounded-w-sm py-2.5 text-card-body font-bold transition-colors duration-200 motion-reduce:transition-none',
                    activeTab === 'payment'
                      ? 'text-ice-500 dark:text-white'
                      : 'text-wtext-3 dark:text-wtext-4 hover:text-wtext-1 dark:hover:text-wtext-4',
                  )}
                >
                  결제 내역
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'usage'}
                  aria-controls="tab-panel-usage"
                  id="tab-usage"
                  ref={(el) => {
                    tabRefs.current.usage = el;
                  }}
                  onClick={() => setActiveTab('usage')}
                  className={cn(
                    'relative z-[1] flex-1 rounded-w-sm py-2.5 text-card-body font-bold transition-colors duration-200 motion-reduce:transition-none',
                    activeTab === 'usage'
                      ? 'text-ice-500 dark:text-white'
                      : 'text-wtext-3 dark:text-wtext-4 hover:text-wtext-1 dark:hover:text-wtext-4',
                  )}
                >
                  사용 내역
                </button>
              </div>
            </section>

            {/* ─── 리스트 ──────────────────────────────────────── */}
            <section
              id={activeTab === 'payment' ? 'tab-panel-payment' : 'tab-panel-usage'}
              role="tabpanel"
              aria-labelledby={activeTab === 'payment' ? 'tab-payment' : 'tab-usage'}
              className="flex flex-col gap-6 px-4 pt-4"
              aria-label={activeTab === 'payment' ? '결제 내역 목록' : '사용 내역 목록'}
            >
              {activeTab === 'payment' ? (
                paymentMonthKeys.length > 0 ? (
                  paymentMonthKeys.map((monthKey) => {
                    const items = groupedPayments[monthKey];
                    return (
                      <div key={monthKey} className="flex flex-col gap-3">
                        <div className="flex items-center justify-between px-1">
                          <h3 className="flex items-center gap-1.5 text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-wtext-4">
                            <span className="h-1 w-1 rounded-w-pill bg-ice-500" aria-hidden="true" />
                            {monthKey}
                          </h3>
                          <span className="rounded-w-pill bg-wline-2 px-2 py-0.5 text-card-meta font-medium text-wtext-3 dark:bg-rink-700 dark:text-wtext-3 tabular-nums">
                            총 {items.length}건
                          </span>
                        </div>
                        {items.map((item) => (
                          <PaymentItemCard key={item.id} item={item} />
                        ))}
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    icon="receipt_long"
                    message={MESSAGES.payment2.emptyPaymentHistory}
                    hint={MESSAGES.payment2.paymentHistoryHint}
                  />
                )
              ) : usageMonthKeys.length > 0 ? (
                usageMonthKeys.map((monthKey) => {
                  const items = groupedUsages[monthKey];
                  return (
                    <div key={monthKey} className="flex flex-col gap-3">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="flex items-center gap-1.5 text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-wtext-4">
                          <span className="h-1 w-1 rounded-w-pill bg-ice-500" aria-hidden="true" />
                          {monthKey}
                        </h3>
                        <span className="rounded-w-pill bg-wline-2 px-2 py-0.5 text-card-meta font-medium text-wtext-3 tabular-nums dark:bg-rink-700 dark:text-wtext-3">
                          총 {items.length}건
                        </span>
                      </div>
                      {items.map((item) => (
                        <UsageItemCard key={item.id} item={item} />
                      ))}
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  icon="history"
                  message={MESSAGES.payment2.emptyUsageHistory}
                  hint={MESSAGES.payment2.usageHistoryHint}
                />
              )}
            </section>

          </>
        )}
      </main>
    </MobileContainer>
  );
}

// ─── Sub Components ──────────────────────────────────────────────

function PaymentItemCard({ item }: { item: PaymentHistoryItem }) {
  const { icon, bg, text } = getPaymentIcon(item.type);
  const isCancelled = item.status === 'cancelled' || item.type === 'cancelled';

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-w-lg border border-wline-2 bg-wsurface p-4 shadow-sh-1 transition-colors motion-reduce:transition-none dark:border-rink-700 dark:bg-rink-800',
        isCancelled && 'opacity-70',
      )}
      aria-label={`${item.productName} 결제 내역`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-4">
          <div
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-w-md',
              bg,
              text,
            )}
            aria-hidden="true"
          >
            <Icon name={icon} />
          </div>
          <div className="flex flex-col justify-center gap-0.5">
            <h4
              className={cn(
                'text-card-emphasis font-bold leading-tight',
                isCancelled
                  ? 'text-wtext-3 line-through decoration-wtext-3/60 dark:text-wtext-3'
                  : 'text-wtext-1 dark:text-white',
              )}
            >
              {item.productName}
            </h4>
            <span className="text-card-meta font-medium text-wtext-3 dark:text-wtext-4">
              {item.date}
              {item.time ? ` · ${item.time}` : ''}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p
            className={cn(
              'text-card-emphasis font-bold tabular-nums',
              isCancelled
                ? 'text-wtext-3 line-through decoration-wtext-3/60'
                : 'text-wtext-1 dark:text-white',
            )}
          >
            {formatCurrency(item.amount)}원
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-wline-2 pt-3 dark:border-rink-700">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex size-2 rounded-w-pill',
              isCancelled ? 'bg-flame-500' : 'bg-mint-500',
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              'text-card-meta font-semibold',
              isCancelled ? 'text-flame-500' : 'text-mint-500 dark:text-mint-500',
            )}
          >
            {isCancelled ? '결제 취소' : '결제 완료'}
          </span>
        </div>
        {isCancelled ? (
          <span className="text-card-meta font-medium text-wtext-3">
            {item.refundStatus ?? '환불 완료'}
          </span>
        ) : (
          <NavLink
            href={`/payment/receipt/${item.id}`}
            className="text-card-meta font-medium text-wtext-3 underline underline-offset-2 transition-colors motion-reduce:transition-none hover:text-wtext-2 dark:hover:text-wtext-4"
            aria-label={`${item.productName} 영수증 보기`}
          >
            영수증 보기
          </NavLink>
        )}
      </div>
    </article>
  );
}

function UsageItemCard({ item }: { item: UsageHistoryItem }) {
  const { icon, bg, text } = getUsageIcon(item.status);
  const isNegative = item.status === 'cancelled' || item.status === 'absent';

  return (
    <article
      className={cn(
        'flex items-center justify-between gap-3 rounded-w-lg border border-wline-2 bg-wsurface p-4 shadow-sh-1 dark:border-rink-700 dark:bg-rink-800',
        isNegative && 'opacity-75',
      )}
      aria-label={`${item.className} 사용 내역`}
    >
      <div className="flex gap-4">
        <div
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-w-md',
            bg,
            text,
          )}
          aria-hidden="true"
        >
          <Icon name={icon} />
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-0.5">
          <h4 className="truncate text-card-emphasis font-bold leading-tight text-wtext-1 dark:text-white">
            {item.className}
          </h4>
          <span className="text-card-meta font-medium text-wtext-3 dark:text-wtext-4">
            {item.date}
            {item.time ? ` · ${item.time}` : ''}
          </span>
        </div>
      </div>
      <div className="text-right">
        <p
          className={cn(
            'text-card-body font-bold tabular-nums',
            item.status === 'attended'
              ? 'text-ice-500 dark:text-ice-500'
              : item.status === 'cancelled'
                ? 'text-mint-500 dark:text-mint-500'
                : 'text-wtext-3 dark:text-wtext-4',
          )}
        >
          {item.status === 'cancelled' ? '+' : '-'}
          {item.creditsUsed}회
        </p>
        <p className="text-card-meta font-medium text-wtext-3 dark:text-wtext-4">
          {item.status === 'attended'
            ? '출석 차감'
            : item.status === 'cancelled'
              ? '취소 복원'
              : '결석'}
        </p>
      </div>
    </article>
  );
}
