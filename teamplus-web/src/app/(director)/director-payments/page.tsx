'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useNavigation } from '@/hooks/useNavigation';
import { cn } from '@/lib/utils';
import { devError } from '@/lib/logger';
import { MESSAGES } from '@/lib/messages';
import { kstYearMonth } from '@/lib/kst-month';
import {
  getTeamTransactions,
  getRefundPendingCount,
  type TeamTransactionsResponse,
} from '@/services/payment';
import { formatCurrency } from '@/components/settlement/settlement-format';
import { InlineRetryError } from '@/components/settlement/InlineRetryError';
import { MonthStepper } from '@/components/settlement/MonthStepper';
import {
  EmptyState,
  InitialErrorState,
  MonthLoadingState,
} from '@/components/settlement/SettlementStates';
import {
  TransactionRow,
  TxnDateHeader,
  groupTxnsByDate,
} from '@/components/settlement/TransactionRow';

// ─── Main Component ──────────────────────────────────
// 결제 내역 — 결제일(완료일) 기준 건별 장부. 청구 월 기준 납부·미수금은 하위 화면 /director-payments/collections.
export default function DirectorPaymentsPage() {
  const showWebUI = true; // 웹 UI 항상 사용 (네이티브 AppBar/BottomNav 제거됨)
  const { navigate } = useNavigation();

  const currentYm = useMemo(() => kstYearMonth(), []);
  const [yearMonth, setYearMonth] = useState<string>(currentYm);

  // 결제 1건=1행 장부 — 선택 월 완료 기준
  const [transactions, setTransactions] = useState<TeamTransactionsResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true); // 최초 풀스크린 로더 게이트
  const [isMonthLoading, setIsMonthLoading] = useState(false); // 월 전환 인라인 로딩
  const [isInitialRetrying, setIsInitialRetrying] = useState(false); // 최초 로드 재시도 진행 중
  // 실패 상태 분리 — 금융 화면: 로드 실패를 0/빈 결과로 위장하지 않는다.
  const [txnError, setTxnError] = useState(false); // 월 전환 후 거래 로드 실패
  const [isTxnRetrying, setIsTxnRetrying] = useState(false); // 거래 재시도 진행 중

  // 환불 대기 건수 — 월 스코프와 무관한 전체 대기 건수(> 0 일 때만 칩 노출).
  //   실패/빈 응답은 0 취급(fail-closed) — 칩 미노출로 화면을 깨지 않는다.
  const [refundPendingCount, setRefundPendingCount] = useState(0);

  // 풀스크린 로더 fast-path — 거래 로드 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: MESSAGES.settlement.appBarTitle,
    showBottomNav: true,
    showBackButton: true,
  });

  // 요청 시퀀스 — 늦게 도착한 이전 월 응답이 최신 선택 월을 덮어쓰는 race 를 차단.
  const txnSeq = useRef(0);

  // 환불 대기 칩 데이터 로드 — 마운트 1회. 월 전환과 무관해 월 로드와 분리.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getRefundPendingCount({ scope: 'team' });
        if (!cancelled) {
          setRefundPendingCount(res.success && res.data ? res.data.count : 0);
        }
      } catch {
        if (!cancelled) setRefundPendingCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 거래 내역 로드 — 선택 월 완료 결제(환불·취소 포함) 건별 장부. 실패 위장 금지.
  // seq 는 호출부에서 txnSeq 를 1회 증가시켜 주입 → 늦은 이전월 응답 폐기.
  const loadTransactions = useCallback(async (ym: string, seq: number) => {
    try {
      const data = await getTeamTransactions({ yearMonth: ym });
      if (seq !== txnSeq.current) return; // 폐기 — 더 최신 거래 요청이 진행 중
      setTransactions(data);
      setTxnError(false);
    } catch (err) {
      if (seq !== txnSeq.current) return;
      devError(MESSAGES.common.loadFailed, err);
      setTxnError(true);
    }
  }, []);

  // 최초 로드 — 실패면 transactions=null 로 유지 → 렌더 게이트가 풀 에러 UI 표시.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      await loadTransactions(currentYm, ++txnSeq.current);
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // 최초 1회만 — 이후 월 변경은 아래 effect 담당.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 월 변경 — 거래 재로드. 최초 로드는 건너뜀.
  const isFirstMonthEffect = useRef(true);
  useEffect(() => {
    if (isFirstMonthEffect.current) {
      isFirstMonthEffect.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      setIsMonthLoading(true);
      // 이전 월의 실패 상태를 지워 새 월 로딩 중에 엉뚱한 재시도 오류가 보이지 않게 한다.
      setTxnError(false);
      await loadTransactions(yearMonth, ++txnSeq.current);
      if (!cancelled) setIsMonthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [yearMonth, loadTransactions]);

  // 최초 로드 실패 재시도 — 풀스크린 로더 재게이트 없이 거래 재호출.
  const handleInitialRetry = useCallback(async () => {
    setIsInitialRetrying(true);
    await loadTransactions(currentYm, ++txnSeq.current);
    setIsInitialRetrying(false);
  }, [currentYm, loadTransactions]);

  // 월 전환 후 거래 로드 실패 재시도 — 선택 월 유지.
  const handleTxnRetry = useCallback(async () => {
    setIsTxnRetrying(true);
    await loadTransactions(yearMonth, ++txnSeq.current);
    setIsTxnRetrying(false);
  }, [yearMonth, loadTransactions]);

  // 최초 풀스크린 로더는 usePageReady 가 처리 — 로딩 중엔 null.
  if (isLoading) return null;

  // 최초 로드 실패 — transactions 가 null. 0원 요약/빈 목록 렌더 금지, 풀 에러 UI + 재시도.
  if (!transactions) {
    return (
      <MobileContainer hasBottomNav={showWebUI}>
        {showWebUI && <PageAppBar title={MESSAGES.settlement.ledgerTitle} forceNative />}
        <main
          className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
          role="main"
          aria-label={MESSAGES.settlement.ariaCenter}
        >
          <InitialErrorState onRetry={handleInitialRetry} retrying={isInitialRetrying} />
        </main>
      </MobileContainer>
    );
  }

  const selM = Number(yearMonth.split('-')[1]);

  // 응답 월과 선택 월 일치 여부 — 불일치(전환 중/실패)면 stale 목록/수치 렌더 금지.
  const txnMonthMatches = transactions.yearMonth === yearMonth;
  const summary = txnMonthMatches && !txnError ? transactions.summary : null;
  // summary 미도착(전환 중·실패·구버전 서버) — 0 으로 위장하지 않고 대시만('원' 없음).
  const amountDash = '—';

  return (
    <MobileContainer hasBottomNav={showWebUI}>
      {showWebUI && <PageAppBar title={MESSAGES.settlement.ledgerTitle} forceNative />}

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={MESSAGES.settlement.ariaCenter}
      >
        {/* ── 결제 요약 밴드 — navy (ICETIMES flat) + 월 선택기 ──────── */}
        <section className="animate-fade-in bg-it-blue-800 px-5 pb-[22px] pt-5 motion-reduce:animate-none dark:bg-it-blue-900">
          {/* 상단 기준 문구 + 월 스텝퍼 */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-white/70">
              {MESSAGES.settlement.ledgerBasisNote}
            </p>
            <MonthStepper
              yearMonth={yearMonth}
              currentYm={currentYm}
              onChange={setYearMonth}
              label={MESSAGES.settlement.ledgerMonthLabel(selM)}
            />
          </div>

          {/* 환불 차감 후 결제 금액 — 결제일 기준 월 합계, 매출 리포트 총 매출과 같은 축 */}
          <div className="mt-3.5" aria-busy={isMonthLoading}>
            <p className="text-[12.5px] text-white/70">{MESSAGES.settlement.ledgerNetLabel}</p>
            <p className="mt-[3px] text-[34px] font-extrabold leading-none text-white tabular-nums">
              {summary ? formatCurrency(summary.netAmount) : amountDash}
              {summary && (
                <span className="ml-1 text-w-body font-semibold text-white/70">
                  {MESSAGES.settlement.won}
                </span>
              )}
            </p>
          </div>

          {/* 결제 / 환불 — 정의형 2열 (반투명 라인 구분) */}
          <div className="mt-4 grid grid-cols-2 gap-6 border-t border-white/15 pt-3.5">
            <div>
              <p className="text-[12px] text-white/70 tabular-nums">
                {summary
                  ? MESSAGES.settlement.ledgerPaymentLabelCount(summary.paymentCount)
                  : MESSAGES.settlement.ledgerPaymentLabel}
              </p>
              <p className="mt-[3px] text-[17px] font-extrabold text-white tabular-nums">
                {summary ? formatCurrency(summary.paymentAmount) : amountDash}
                {summary && (
                  <span className="ml-0.5 text-[12px] font-medium text-white/70">
                    {MESSAGES.settlement.won}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-white/70 tabular-nums">
                {summary
                  ? MESSAGES.settlement.ledgerRefundLabelCount(summary.refundCount)
                  : MESSAGES.settlement.ledgerRefundLabel}
              </p>
              <p className="mt-[3px] text-[17px] font-extrabold text-white tabular-nums">
                {summary ? formatCurrency(summary.refundAmount) : amountDash}
                {summary && (
                  <span className="ml-0.5 text-[12px] font-medium text-white/70">
                    {MESSAGES.settlement.won}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* 환불 대기 칩(전 기간) + 보던 달의 N월분 납부 확인 */}
          <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-white/15 pt-3">
            {refundPendingCount > 0 ? (
              <button
                type="button"
                onClick={() => void navigate('/director-payments/refunds')}
                className="inline-flex items-center gap-1.5 rounded-w-pill border border-white/25 bg-white/15 py-1.5 pl-3 pr-1.5 text-[13px] font-bold text-white tabular-nums transition-colors hover:bg-white/25 active:brightness-95 motion-reduce:transition-none"
                aria-label={MESSAGES.refund.bannerWaiting(refundPendingCount)}
              >
                <Icon name="currency_exchange" className="text-[15px] text-white/85" aria-hidden="true" />
                {MESSAGES.refund.heroPendingBadge(refundPendingCount)}
                <Icon name="chevron_right" className="text-[15px] text-white/70" aria-hidden="true" />
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
            <button
              type="button"
              onClick={() =>
                void navigate(`/director-payments/collections?yearMonth=${yearMonth}`)
              }
              className="inline-flex items-center gap-0.5 text-[13px] font-bold text-white/85 active:brightness-95"
            >
              {MESSAGES.settlement.collectionsCheck(selM)}
              <Icon name="chevron_right" className="text-[16px] text-white/70" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 하단 여백은 MobileContainer 가 main 에 pb-30 자동 부여 → 중복 금지. */}
        <section
          aria-label={MESSAGES.settlement.ledgerTitle}
          aria-busy={isMonthLoading}
          className={cn(
            'bg-it-surface transition-opacity dark:bg-rink-800',
            isMonthLoading && 'opacity-60',
          )}
        >
          {/* 거래 목록 — 결제 1건=1행 최신순 (선택 월 완료 기준) */}
          <div className="px-5">
            {txnError ? (
              <InlineRetryError
                message={MESSAGES.settlement.transactionsLoadFailed}
                onRetry={handleTxnRetry}
                retrying={isTxnRetrying}
              />
            ) : !txnMonthMatches ? (
              <MonthLoadingState />
            ) : transactions.items.length > 0 ? (
              <>
                {groupTxnsByDate(transactions.items).map((group, gi) => (
                  <div key={`${group.dateLabel}-${gi}`}>
                    <TxnDateHeader label={group.dateLabel} />
                    {group.items.map((item, i) => (
                      <TransactionRow
                        key={item.paymentId}
                        item={item}
                        index={i}
                        last={i === group.items.length - 1}
                      />
                    ))}
                  </div>
                ))}
                {transactions.totalCount > transactions.items.length && (
                  <p className="py-3 text-center text-card-meta text-it-ink-400 dark:text-wtext-4">
                    {MESSAGES.settlement.txnCapNotice(
                      transactions.items.length,
                      transactions.totalCount,
                    )}
                  </p>
                )}
              </>
            ) : (
              <EmptyState message={MESSAGES.settlement.emptyTransactions} />
            )}
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
