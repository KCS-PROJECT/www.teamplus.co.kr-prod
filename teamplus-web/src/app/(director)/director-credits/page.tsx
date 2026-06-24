'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
 * Director Credits Page — 감독 개인의 "결제 및 수업권 현황" 페이지.
 *
 * 기존 /director-payments (팀 전체 결제 관리)와는 용도가 다르다:
 *   - /director-payments: 팀 전체 수입/미수금/팀별 결제 관리 (관리자 view)
 *   - /director-credits : 감독 본인의 결제권 현황 + 결제·사용 내역 (마이페이지 view)
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
        bg: 'bg-it-blue-50 dark:bg-it-blue-900/30',
        text: 'text-it-blue-500 dark:text-it-blue-300',
      };
    case 'cancelled':
      return {
        icon: 'remove_shopping_cart',
        bg: 'bg-it-line dark:bg-rink-700',
        text: 'text-it-ink-500 dark:text-wtext-4',
      };
    case 'regular':
    default:
      return {
        icon: 'confirmation_number',
        bg: 'bg-it-blue-50 dark:bg-it-blue-900/30',
        text: 'text-it-blue-500 dark:text-it-blue-300',
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
        bg: 'bg-it-line dark:bg-rink-700',
        text: 'text-it-ink-500 dark:text-wtext-4',
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
        className="mb-3 text-5xl text-it-ink-400 dark:text-wtext-4"
        aria-hidden="true"
      />
      <p className="text-card-body font-semibold text-it-ink-700 dark:text-wtext-4">{message}</p>
      {hint && (
        <p className="mt-1.5 max-w-[240px] text-card-meta font-medium leading-relaxed text-it-ink-400 dark:text-wtext-4">
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

  const [isLoading, setIsLoading] = useState(true);


  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF

  usePageReady(!isLoading);
  const [creditStatus, setCreditStatus] = useState<CreditStatus>(FALLBACK_CREDIT);
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [usages, setUsages] = useState<UsageHistoryItem[]>([]);
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
    // 결제권 충전 → 상품 선택 페이지 이동
    navigate('/products');
  }, [navigate]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="결제권 관리" forceNative />

      <main
        className="hide-scrollbar flex-1 overflow-y-auto bg-it-canvas pb-10 dark:bg-puck"
        role="main"
        aria-label="결제권 현황 및 내역"
      >
        {!isLoading && (
          <>
            {/* ─── 결제권 Hero — navy 밴드 (ICETIMES flat, full-bleed 카드 박스 제거) ──
                  보유 결제권 34px KPI · 만료 칩 · 누적 발급/사용 2열 · 충전 CTA(red 강조). */}
            <section
              className="animate-fade-in bg-it-blue-800 px-5 pb-6 pt-[22px] motion-reduce:animate-none dark:bg-it-blue-900"
              aria-label="보유 결제권 현황"
            >
              {/* 보유 결제권 KPI */}
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">
                보유 결제권
              </p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span
                  className="text-[38px] font-extrabold leading-none tracking-tight tabular-nums text-white"
                  aria-live="polite"
                >
                  {creditStatus.currentCredits}
                </span>
                <span className="text-[19px] font-bold text-white/70">회</span>
              </div>
              {creditStatus.expiringCredits > 0 && (
                <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-w-pill bg-white/12 px-[11px] py-[5px] text-[12.5px] font-bold text-it-red-200">
                  <Icon name="schedule" className="text-[15px]" aria-hidden="true" />
                  {creditStatus.expiresIn}일 내 {creditStatus.expiringCredits}회 만료
                </span>
              )}

              {/* 누적 발급 / 사용 — 정의형 2열 (반투명 라인 구분) */}
              <dl className="mt-[18px] grid grid-cols-2 gap-6 border-t border-white/15 pt-4">
                <div>
                  <dt className="text-[12px] text-white/70">누적 발급</dt>
                  <dd className="mt-[3px] text-[18px] font-extrabold tabular-nums text-white">
                    {creditStatus.totalCredits}
                    <span className="ml-0.5 text-[12px] font-medium text-white/70">회</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] text-white/70">누적 사용</dt>
                  <dd className="mt-[3px] text-[18px] font-extrabold tabular-nums text-white">
                    {creditStatus.usedCredits}
                    <span className="ml-0.5 text-[12px] font-medium text-white/70">회</span>
                  </dd>
                </div>
              </dl>

              {/* 충전 CTA — navy 밴드 위 red 강조 (시안 Button lg h54) */}
              <button
                type="button"
                onClick={handleCharge}
                className="mt-[18px] flex h-[54px] w-full items-center justify-center gap-2 rounded-w-md bg-it-red-500 text-white transition-colors motion-reduce:transition-none hover:bg-it-red-600 active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-it-blue-800"
                aria-label="결제권 충전하기"
              >
                <Icon name="add_card" className="text-[21px]" aria-hidden="true" />
                <span className="text-[16px] font-bold tracking-wide">결제권 충전하기</span>
              </button>
            </section>

            {errorMessage && (
              <div
                role="alert"
                className="mx-4 mt-4 rounded-w-md border border-it-red-100 bg-it-red-50 px-4 py-3 text-card-body text-it-red-500 dark:border-it-red-500/30 dark:bg-it-red-500/15 dark:text-it-red-400"
              >
                {errorMessage}
              </div>
            )}

            {/* ─── 탭 네비게이션 (시안 SegmentedTabs — 밑줄형) ───────────── */}
            <section className="sticky top-[56px] z-10 mt-2 bg-it-surface dark:bg-rink-800">
              <div
                role="tablist"
                aria-label="내역 종류 선택"
                className="flex border-b border-it-line dark:border-rink-700"
              >
                {([
                  { key: 'payment' as TabType, label: '결제 내역' },
                  { key: 'usage' as TabType, label: '사용 내역' },
                ]).map((t) => {
                  const isActive = activeTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`tab-panel-${t.key}`}
                      id={`tab-${t.key}`}
                      onClick={() => setActiveTab(t.key)}
                      className={cn(
                        'relative flex-1 px-1 pb-[13px] pt-[14px] text-[15px] tracking-[-0.01em] transition-colors duration-200 motion-reduce:transition-none',
                        isActive
                          ? 'font-extrabold text-it-blue-600 dark:text-white'
                          : 'font-semibold text-it-ink-500 dark:text-wtext-4 hover:text-it-ink-800',
                      )}
                    >
                      {t.label}
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
            </section>

            {/* ─── 리스트 ──────────────────────────────────────── */}
            <section
              id={activeTab === 'payment' ? 'tab-panel-payment' : 'tab-panel-usage'}
              role="tabpanel"
              aria-labelledby={activeTab === 'payment' ? 'tab-payment' : 'tab-usage'}
              className="mt-2 flex flex-col gap-2 bg-it-surface px-4 pb-4 pt-3 dark:bg-rink-800"
              aria-label={activeTab === 'payment' ? '결제 내역 목록' : '사용 내역 목록'}
            >
              {activeTab === 'payment' ? (
                paymentMonthKeys.length > 0 ? (
                  paymentMonthKeys.map((monthKey) => {
                    const items = groupedPayments[monthKey];
                    return (
                      <div key={monthKey} className="flex flex-col">
                        <div className="flex items-center justify-between pb-1 pt-2">
                          <h3 className="text-card-meta font-extrabold tracking-[0.04em] text-it-ink-400 dark:text-wtext-4">
                            {monthKey}
                          </h3>
                          <span className="text-card-meta font-medium text-it-ink-400 dark:text-wtext-3 tabular-nums">
                            총 {items.length}건
                          </span>
                        </div>
                        {items.map((item, i) => (
                          <PaymentItemCard key={item.id} item={item} last={i === items.length - 1} />
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
                    <div key={monthKey} className="flex flex-col">
                      <div className="flex items-center justify-between pb-1 pt-2">
                        <h3 className="text-card-meta font-extrabold tracking-[0.04em] text-it-ink-400 dark:text-wtext-4">
                          {monthKey}
                        </h3>
                        <span className="text-card-meta font-medium text-it-ink-400 tabular-nums dark:text-wtext-3">
                          총 {items.length}건
                        </span>
                      </div>
                      {items.map((item, i) => (
                        <UsageItemCard key={item.id} item={item} last={i === items.length - 1} />
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

function PaymentItemCard({ item, last }: { item: PaymentHistoryItem; last?: boolean }) {
  const { icon, bg, text } = getPaymentIcon(item.type);
  const isCancelled = item.status === 'cancelled' || item.type === 'cancelled';

  return (
    <article
      className={cn(
        'flex items-center gap-3 py-[13px] transition-colors motion-reduce:transition-none',
        !last && 'border-b border-it-line dark:border-rink-700',
        isCancelled && 'opacity-60',
      )}
      aria-label={`${item.productName} 결제 내역`}
    >
      <div
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-w-md',
          bg,
          text,
        )}
        aria-hidden="true"
      >
        <Icon name={icon} className="text-[22px]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <h4
          className={cn(
            'truncate text-[15px] font-bold leading-tight',
            isCancelled
              ? 'text-it-ink-500 line-through decoration-it-ink-400/60 dark:text-wtext-3'
              : 'text-it-ink-800 dark:text-white',
          )}
        >
          {item.productName}
        </h4>
        <span className="text-[12.5px] font-medium text-it-ink-500 dark:text-wtext-4 tabular-nums">
          {item.date}
          {item.time ? ` · ${item.time}` : ''}
        </span>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            'text-[15px] font-extrabold tabular-nums',
            isCancelled
              ? 'text-it-ink-500 line-through decoration-it-ink-400/60'
              : 'text-it-ink-800 dark:text-white',
          )}
        >
          {formatCurrency(item.amount)}원
        </p>
        {isCancelled ? (
          <span className="mt-0.5 block text-[11.5px] font-semibold text-it-red-500">
            {item.refundStatus ?? '환불 완료'}
          </span>
        ) : (
          <NavLink
            href={`/payment/receipt/${item.id}`}
            className="mt-0.5 block text-[11.5px] font-medium text-it-ink-400 underline underline-offset-2 transition-colors motion-reduce:transition-none hover:text-it-ink-700 dark:hover:text-wtext-4"
            aria-label={`${item.productName} 영수증 보기`}
          >
            영수증 보기
          </NavLink>
        )}
      </div>
    </article>
  );
}

function UsageItemCard({ item, last }: { item: UsageHistoryItem; last?: boolean }) {
  const { icon, bg, text } = getUsageIcon(item.status);
  const isNegative = item.status === 'cancelled' || item.status === 'absent';

  return (
    <article
      className={cn(
        'flex items-center justify-between gap-3 py-[13px]',
        !last && 'border-b border-it-line dark:border-rink-700',
        isNegative && 'opacity-75',
      )}
      aria-label={`${item.className} 사용 내역`}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-w-md',
            bg,
            text,
          )}
          aria-hidden="true"
        >
          <Icon name={icon} className="text-[22px]" />
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-0.5">
          <h4 className="truncate text-[15px] font-bold leading-tight text-it-ink-800 dark:text-white">
            {item.className}
          </h4>
          <span className="text-[12.5px] font-medium text-it-ink-500 dark:text-wtext-4 tabular-nums">
            {item.date}
            {item.time ? ` · ${item.time}` : ''}
          </span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            'text-[15px] font-extrabold tabular-nums',
            item.status === 'attended'
              ? 'text-it-blue-600 dark:text-it-blue-300'
              : item.status === 'cancelled'
                ? 'text-mint-500 dark:text-mint-500'
                : 'text-it-ink-500 dark:text-wtext-4',
          )}
        >
          {item.status === 'cancelled' ? '+' : '-'}
          {item.creditsUsed}회
        </p>
        <p className="text-[11.5px] font-medium text-it-ink-400 dark:text-wtext-4">
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
