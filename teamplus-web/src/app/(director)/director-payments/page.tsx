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
import { useToast } from '@/components/ui/Toast';
import { UnpaidDetailSheet } from '@/components/director/UnpaidDetailSheet';
import {
  getTeamSettlementSummary,
  getTeamUnpaidMembers,
  getTeamTransactions,
  sendTeamUnpaidReminder,
  type TeamSettlementSummaryResponse,
  type TeamUnpaidMembersResponse,
  type TeamTransactionsResponse,
  type TeamTransactionItem,
  type TournamentSettlementSummary,
  type UnpaidMemberRow,
} from '@/services/payment';
import { PaymentSourceBadge } from '@/components/payment/PaymentSourceBadge';
import {
  formatCurrency,
  staggerDelay,
  shiftMonth,
} from '@/components/settlement/settlement-format';
import {
  SettlementItemCard,
  classToCardData,
  type SettlementCardData,
} from '@/components/settlement/SettlementItemCard';
import { InlineRetryError } from '@/components/settlement/InlineRetryError';
import { RefundPendingBanner } from '@/components/refunds/RefundPendingBanner';

// ─── Types ──────────────────────────────────────────
// 거래 내역(건별 장부·기본) / 정산 집계(훈련·대회 소계) — 업계 관행(거래 vs 정산) 2분법.
type TabType = 'transactions' | 'settlement';

// formatCurrency · staggerDelay · shiftMonth 는 공유 모듈(components/settlement/settlement-format)로 이동.
// SettlementCardData · SETTLEMENT_STATUS_BADGE · BLOCKED_REASON_LABEL · classToCardData ·
// SettlementItemCard · InlineRetryError 는 공유 모듈(components/settlement)로 이동해 academy 정산 탭과 공유.

/** 대회 소계 → 카드 데이터(결제방식 인원 축 없음). 팀 전용 — 공유 SettlementCardData 타입 사용. */
function tournamentToCardData(item: TournamentSettlementSummary): SettlementCardData {
  return {
    title: item.tournamentName,
    subtitle: item.teamName,
    settlementStatus: item.settlementStatus,
    total: item.total,
    paidCount: item.paidCount,
    billedAmount: item.billedAmount,
    paidAmount: item.paidAmount,
    outstandingAmount: item.outstandingAmount,
    estimatedAmount: item.estimatedAmount,
    mixedBilling: item.mixedBilling,
    timingParts: [],
    blockedReasonCode: item.blockedReasonCode,
    detailPath: item.detailPath,
  };
}

// ─── Main Component ──────────────────────────────────
export default function DirectorPaymentsPage() {
  const showWebUI = true; // 웹 UI 항상 사용 (네이티브 AppBar/BottomNav 제거됨)
  const { navigate } = useNavigation();
  const { toast } = useToast();

  const currentYm = useMemo(() => kstYearMonth(), []);
  const [yearMonth, setYearMonth] = useState<string>(currentYm);
  const [activeTab, setActiveTab] = useState<TabType>('transactions');

  // 신규 월인식 소계 (정산 집계 탭 + Hero)
  const [settlement, setSettlement] = useState<TeamSettlementSummaryResponse | null>(null);
  // 신규 월인식 인별 미수금 (정산 집계 탭 상단 배너 — 선택 월 연동)
  const [unpaid, setUnpaid] = useState<TeamUnpaidMembersResponse | null>(null);
  // 거래 내역 (결제 1건=1행 장부 — 선택 월 완료 기준)
  const [transactions, setTransactions] = useState<TeamTransactionsResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true); // 최초 풀스크린 로더 게이트
  const [isMonthLoading, setIsMonthLoading] = useState(false); // 월 전환 인라인 로딩
  const [isInitialRetrying, setIsInitialRetrying] = useState(false); // 최초 로드 재시도 진행 중
  // 실패 상태 분리 — 금융 화면: 로드 실패를 0/빈 결과로 위장하지 않는다.
  const [monthError, setMonthError] = useState(false); // 월 새로고침 실패(직전 유효월 데이터 보존)
  const [unpaidError, setUnpaidError] = useState(false); // 미수금 로드 실패
  const [isUnpaidRetrying, setIsUnpaidRetrying] = useState(false); // 미수금 재시도 진행 중
  const [txnError, setTxnError] = useState(false); // 거래 내역 로드 실패
  const [isTxnRetrying, setIsTxnRetrying] = useState(false); // 거래 내역 재시도 진행 중

  // 미수금 배너 펼침 (정산 집계 탭 상단 — 기본 접힘)
  const [unpaidExpanded, setUnpaidExpanded] = useState(false);
  // 미수금 — 상세 시트 대상 회원 / 미납 안내 발송 중 회원
  const [detailMember, setDetailMember] = useState<UnpaidMemberRow | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  // 풀스크린 로더 fast-path — 두 API 로드 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: MESSAGES.settlement.appBarTitle,
    showBottomNav: true,
    showBackButton: true,
  });

  // 요청 시퀀스 — 늦게 도착한 이전 월 응답이 최신 선택 월을 덮어쓰는 race 를 차단.
  // 로더별 독립 카운터: 소계=settlementSeq, 미수금=unpaidSeq, 거래=txnSeq.
  // 단독 재시도가 in-flight 다른 로드를 폐기하지 않도록 seq 를 분리(간섭 0).
  const settlementSeq = useRef(0);
  const unpaidSeq = useRef(0);
  const txnSeq = useRef(0);

  // 신규 소계 로드 — 최신 요청(seq)만 반영. 실패 시 mode 별 에러 플래그 설정.
  // seq 는 호출부(트리거)에서 settlementSeq 를 1회 증가시켜 주입 → 늦은 이전월 응답 폐기.
  const loadNew = useCallback(async (ym: string, mode: 'initial' | 'month', seq: number) => {
    try {
      const data = await getTeamSettlementSummary({ yearMonth: ym });
      if (seq !== settlementSeq.current) return; // 폐기 — 더 최신 소계 요청이 진행 중
      setSettlement(data);
      if (mode === 'month') setMonthError(false);
    } catch (err) {
      if (seq !== settlementSeq.current) return;
      devError(MESSAGES.common.loadFailed, err);
      if (mode === 'month') {
        // 직전 유효 월 데이터를 빈 데이터로 덮지 않는다 — 인라인 에러로만 표기.
        setMonthError(true);
      }
      // mode==='initial' 은 settlement 이 null 로 유지 → 렌더 게이트가 풀 에러 UI 표시.
    }
  }, []);

  // 신규 인별 미수금 로드 — 선택 월 연동. 실패를 "미수금 0"으로 위장하지 않는다(strict throw 흡수).
  // 성공 시 데이터 세팅+에러 해제, 실패 시 unpaidError 만 세우고 직전 데이터는 덮지 않는다.
  const loadUnpaid = useCallback(async (ym: string, seq: number) => {
    try {
      const data = await getTeamUnpaidMembers({ yearMonth: ym });
      if (seq !== unpaidSeq.current) return; // 폐기 — 더 최신 미수금 요청이 진행 중
      setUnpaid(data);
      setUnpaidError(false);
    } catch (err) {
      if (seq !== unpaidSeq.current) return;
      devError(MESSAGES.common.loadFailed, err);
      setUnpaidError(true);
    }
  }, []);

  // 거래 내역 로드 — 선택 월 완료 결제(환불·취소 포함) 건별 장부. 실패 위장 금지(동일 규약).
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

  // 최초 로드 — 신규 소계/인별 미수금 독립 처리(allSettled). 소계 실패면 settlement=null → 풀 에러 UI.
  // 미수금 실패는 loadUnpaid 내부에서 unpaidError 로 처리 → 미수금 탭 인라인 에러+재시도.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      // 세 로더 동시 트리거 — 각 seq 를 1회씩 증가시켜 각자 stale 폐기 판정에 주입.
      const sSeq = ++settlementSeq.current;
      const uSeq = ++unpaidSeq.current;
      const tSeq = ++txnSeq.current;
      await Promise.allSettled([
        loadNew(currentYm, 'initial', sSeq),
        loadUnpaid(currentYm, uSeq),
        loadTransactions(currentYm, tSeq),
      ]);
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // 최초 1회만 — 이후 월 변경은 아래 effect 담당.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 월 변경 — 신규 소계 + 인별 미수금 동시 재로드(선택 월 연동). 최초 로드는 건너뜀.
  const isFirstMonthEffect = useRef(true);
  useEffect(() => {
    if (isFirstMonthEffect.current) {
      isFirstMonthEffect.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      setIsMonthLoading(true);
      // 세 로더 동시 트리거 — 각 seq 를 1회씩 증가시켜 늦은 이전월 응답이 최신 선택월을 덮지 않게 한다.
      const sSeq = ++settlementSeq.current;
      const uSeq = ++unpaidSeq.current;
      const tSeq = ++txnSeq.current;
      await Promise.allSettled([
        loadNew(yearMonth, 'month', sSeq),
        loadUnpaid(yearMonth, uSeq),
        loadTransactions(yearMonth, tSeq),
      ]);
      if (!cancelled) setIsMonthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [yearMonth, loadNew, loadUnpaid, loadTransactions]);

  // 최초 로드 실패 재시도 — 풀스크린 로더 재게이트 없이 신규 소계/미수금 재호출.
  const handleInitialRetry = useCallback(async () => {
    setIsInitialRetrying(true);
    const sSeq = ++settlementSeq.current;
    const uSeq = ++unpaidSeq.current;
    const tSeq = ++txnSeq.current;
    await Promise.allSettled([
      loadNew(currentYm, 'initial', sSeq),
      loadUnpaid(currentYm, uSeq),
      loadTransactions(currentYm, tSeq),
    ]);
    setIsInitialRetrying(false);
  }, [currentYm, loadNew, loadUnpaid, loadTransactions]);

  // 월 새로고침 실패 재시도 — 선택 월 유지, 소계 + 미수금 + 거래 재호출(셋 다 월 스코프).
  const handleMonthRetry = useCallback(async () => {
    setIsMonthLoading(true);
    const sSeq = ++settlementSeq.current;
    const uSeq = ++unpaidSeq.current;
    const tSeq = ++txnSeq.current;
    await Promise.allSettled([
      loadNew(yearMonth, 'month', sSeq),
      loadUnpaid(yearMonth, uSeq),
      loadTransactions(yearMonth, tSeq),
    ]);
    setIsMonthLoading(false);
  }, [yearMonth, loadNew, loadUnpaid, loadTransactions]);

  // 미수금 로드 실패 재시도 — 선택 월 인별 미수금 단독 재호출.
  // unpaidSeq 만 증가 → settlementSeq 불변 → in-flight loadNew(훈련/대회·Hero) 생존(폐기 안 함).
  const handleUnpaidRetry = useCallback(async () => {
    setIsUnpaidRetrying(true);
    const uSeq = ++unpaidSeq.current;
    await loadUnpaid(yearMonth, uSeq);
    setIsUnpaidRetrying(false);
  }, [yearMonth, loadUnpaid]);

  // 거래 내역 로드 실패 재시도 — 선택 월 거래 단독 재호출(txnSeq 만 증가, 타 로더 생존).
  const handleTxnRetry = useCallback(async () => {
    setIsTxnRetrying(true);
    const tSeq = ++txnSeq.current;
    await loadTransactions(yearMonth, tSeq);
    setIsTxnRetrying(false);
  }, [yearMonth, loadTransactions]);

  // 미납 안내 발송 — 미납 자녀의 보호자에게 인앱+푸시 (선택 월, 월별 쿨다운)
  const handleRemind = useCallback(
    async (member: UnpaidMemberRow) => {
      setRemindingId(member.memberId);
      try {
        const res = await sendTeamUnpaidReminder({ memberId: member.memberId, yearMonth });
        if (res.cooldown) {
          toast.info(MESSAGES.director2.remindCooldown);
        } else if (res.sent) {
          toast.success(MESSAGES.director2.remindSuccess(res.recipientCount));
        } else {
          toast.info(MESSAGES.director2.remindNoParent);
        }
      } catch {
        toast.error(MESSAGES.director2.remindFailed);
      } finally {
        setRemindingId(null);
      }
    },
    [toast, yearMonth],
  );

  const handleOpenDetail = useCallback(
    (path: string) => {
      void navigate(path);
    },
    [navigate],
  );

  // 최초 풀스크린 로더는 usePageReady 가 처리 — 로딩 중엔 null.
  if (isLoading) return null;

  // 최초 로드 실패 — settlement 이 null. 0원 Hero/빈 카드 렌더 금지, 풀 에러 UI + 재시도.
  if (!settlement) {
    return (
      <MobileContainer hasBottomNav={showWebUI}>
        {showWebUI && <PageAppBar title={MESSAGES.settlement.pageTitle} forceNative />}
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

  // 응답 월과 선택 월 일치 여부 — 불일치(전환 중/실패)면 stale 카드/수치 렌더 금지.
  const monthMatches = settlement.yearMonth === yearMonth;
  const showMonthData = monthMatches && !monthError;

  const classes = settlement.classes;
  const tournaments = settlement.tournaments;

  // Hero 요약 (선택 월, 신규 API 집계) — 선택 월과 응답 월 일치 시에만 수치 노출.
  const totalCollected =
    classes.reduce((a, c) => a + c.paidAmount, 0) +
    tournaments.reduce((a, t) => a + t.paidAmount, 0);
  const pendingSettlement =
    classes.reduce((a, c) => a + c.estimatedAmount, 0) +
    tournaments.reduce((a, t) => a + t.estimatedAmount, 0);
  const unpaidAmount = settlement.unpaid.amount;
  const unpaidItemCount = settlement.unpaid.count;
  const hasUnpaid = showMonthData && unpaidAmount > 0;
  const amountDash = '—';

  const [selY, selM] = yearMonth.split('-').map(Number);
  const nextMonthDisabled = yearMonth >= currentYm;

  // 미수금 배너 — 응답 월과 선택 월 일치 시에만 렌더(전환 중 stale 방지).
  const unpaidMonthMatches = unpaid?.yearMonth === yearMonth;
  const unpaidCount = unpaid?.totalCount ?? 0;
  // 거래 내역 — 동일 stale 가드.
  const txnMonthMatches = transactions?.yearMonth === yearMonth;

  const tabs: { key: TabType; label: string }[] = [
    { key: 'transactions', label: MESSAGES.settlement.tabTransactions },
    { key: 'settlement', label: MESSAGES.settlement.tabSettlementAgg },
  ];

  return (
    <MobileContainer hasBottomNav={showWebUI}>
      {showWebUI && <PageAppBar title={MESSAGES.settlement.pageTitle} forceNative />}

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={MESSAGES.settlement.ariaCenter}
      >
        {/* 환불 대기 조건부 배너 — pending > 0 일 때만 노출(0건이면 wrapper 째 미렌더). */}
        <RefundPendingBanner scope="team" className="px-5 pt-3" />

        {/* ── 정산 요약 — navy 밴드 Hero (ICETIMES flat) + 월 선택기 ──────── */}
        <section className="animate-fade-in bg-it-blue-800 px-5 pb-[22px] pt-5 motion-reduce:animate-none dark:bg-it-blue-900">
          {/* 상단 라벨 + 월 스텝퍼 */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase text-white/70">
              {MESSAGES.settlement.heroLabel}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setYearMonth((ym) => shiftMonth(ym, -1))}
                aria-label={MESSAGES.settlement.prevMonth}
                className="grid h-7 w-7 place-items-center rounded-w-pill text-white/80 transition-colors hover:bg-white/12 active:brightness-95 motion-reduce:transition-none"
              >
                <Icon name="chevron_left" className="text-[18px]" aria-hidden="true" />
              </button>
              <span className="min-w-[92px] rounded-w-pill bg-white/12 px-2.5 py-1 text-center text-[12px] font-bold text-white tabular-nums">
                {MESSAGES.settlement.monthLabel(selY, selM)}
              </span>
              <button
                type="button"
                onClick={() => setYearMonth((ym) => shiftMonth(ym, 1))}
                disabled={nextMonthDisabled}
                aria-label={MESSAGES.settlement.nextMonth}
                className="grid h-7 w-7 place-items-center rounded-w-pill text-white/80 transition-colors hover:bg-white/12 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
              >
                <Icon name="chevron_right" className="text-[18px]" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* 총 수납 — 단일 히어로 숫자 (선택 월 == 응답 월일 때만 수치, 아니면 '—') */}
          <div className="mt-3.5" aria-busy={isMonthLoading}>
            <p className="text-[12.5px] text-white/70">{MESSAGES.settlement.totalCollected}</p>
            <p className="mt-[3px] text-[34px] font-extrabold leading-none text-white tabular-nums">
              {showMonthData ? formatCurrency(totalCollected) : amountDash}
              {showMonthData && (
                <span className="ml-1 text-w-body font-semibold text-white/70">
                  {MESSAGES.settlement.won}
                </span>
              )}
            </p>
          </div>

          {/* 미수금 / 정산 예정 — 정의형 2열 (반투명 라인 구분) */}
          <div className="mt-4 grid grid-cols-2 gap-6 border-t border-white/15 pt-3.5">
            <div>
              <p className="text-[12px] text-white/70">{MESSAGES.settlement.unpaidAmount}</p>
              <p
                className={cn(
                  'mt-[3px] text-[17px] font-extrabold tabular-nums',
                  hasUnpaid ? 'text-it-red-250' : 'text-white',
                )}
              >
                {showMonthData ? formatCurrency(unpaidAmount) : amountDash}
                {showMonthData && (
                  <span className="ml-0.5 text-[12px] font-medium text-white/70">
                    {MESSAGES.settlement.won}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-white/70">
                {MESSAGES.settlement.pendingSettlement}
              </p>
              <p className="mt-[3px] text-[17px] font-extrabold text-white tabular-nums">
                {showMonthData ? formatCurrency(pendingSettlement) : amountDash}
                {showMonthData && (
                  <span className="ml-0.5 text-[12px] font-medium text-white/70">
                    {MESSAGES.settlement.won}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* 미납 건수 — 탭하면 정산 집계 탭의 미수금 배너를 펼친다 */}
          <div className="mt-3.5 border-t border-white/15 pt-3 text-[12.5px]">
            <button
              type="button"
              onClick={() => {
                setActiveTab('settlement');
                setUnpaidExpanded(true);
              }}
              className={cn(
                'font-bold tabular-nums active:brightness-95',
                hasUnpaid ? 'text-it-red-250' : 'text-white/70',
              )}
              aria-label={MESSAGES.settlement.unpaidBannerOpen}
            >
              {showMonthData ? MESSAGES.settlement.unpaidCountBadge(unpaidItemCount) : amountDash}
            </button>
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* ── 탭 — 시안 SegmentedTabs(밑줄형, flat 흰 섹션) ──────────────────────── */}
        <div className="bg-it-surface dark:bg-rink-800">
          <div
            role="tablist"
            aria-label={MESSAGES.settlement.ariaFilter}
            className="flex border-b border-it-line dark:border-rink-700"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`director-payments-panel-${tab.key}`}
                  id={`director-payments-tab-${tab.key}`}
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'relative flex-1 px-1 pb-[13px] pt-[14px] text-[15px] transition-colors duration-200 motion-reduce:transition-none',
                    isActive
                      ? 'font-extrabold text-it-blue-600 dark:text-white'
                      : 'font-semibold text-it-ink-500 hover:text-it-ink-800 dark:text-wtext-4 dark:hover:text-white',
                  )}
                >
                  {tab.label}
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
        </div>

        {/* ── 탭 컨텐츠 ─────────────────────────────────────────────────── */}
        {/* 하단 여백은 MobileContainer 가 main 에 pb-30 자동 부여 → 중복 금지. */}
        <div>
          {activeTab === 'transactions' && (
            <section
              role="tabpanel"
              id="director-payments-panel-transactions"
              aria-labelledby="director-payments-tab-transactions"
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
                ) : transactions && transactions.items.length > 0 ? (
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
          )}

          {activeTab === 'settlement' && (
            <section
              role="tabpanel"
              id="director-payments-panel-settlement"
              aria-labelledby="director-payments-tab-settlement"
              aria-busy={isMonthLoading}
              className={cn(
                'bg-it-surface transition-opacity dark:bg-rink-800',
                isMonthLoading && 'opacity-60',
              )}
            >
              {/* 미수금 접이식 배너 — 미수 0이면 미노출. 실패는 배너로 노출(0 위장 금지). */}
              {(unpaidError || (unpaidMonthMatches && unpaidCount > 0)) && (
                <div className="border-b border-it-line dark:border-rink-700">
                  <button
                    type="button"
                    onClick={() => setUnpaidExpanded((v) => !v)}
                    aria-expanded={unpaidExpanded}
                    aria-controls="director-payments-unpaid-banner"
                    className="flex w-full items-center gap-2 bg-it-red-50/60 px-5 py-3 text-left active:brightness-95 dark:bg-it-red-500/10"
                  >
                    <Icon
                      name="error"
                      className="text-[18px] text-it-red-500"
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-[14px] font-bold text-it-ink-800 dark:text-white">
                      {unpaidError
                        ? MESSAGES.settlement.unpaidLoadFailed
                        : `${MESSAGES.settlement.unpaidAmount} ${formatCurrency(unpaid?.totalOutstanding ?? 0)}${MESSAGES.settlement.won} · ${MESSAGES.settlement.unpaidMemberCount(unpaidCount)}`}
                    </span>
                    <Icon
                      name={unpaidExpanded ? 'expand_less' : 'expand_more'}
                      className="text-[20px] text-it-ink-500 dark:text-wtext-4"
                      aria-hidden="true"
                    />
                  </button>
                  {unpaidExpanded && (
                    <div id="director-payments-unpaid-banner" className="px-5">
                      {unpaidError ? (
                        <InlineRetryError
                          message={MESSAGES.settlement.unpaidLoadFailed}
                          onRetry={handleUnpaidRetry}
                          retrying={isUnpaidRetrying}
                        />
                      ) : !unpaidMonthMatches ? (
                        <MonthLoadingState />
                      ) : (
                        (unpaid?.members ?? []).map((member, i, arr) => (
                          <UnpaidMemberCard
                            key={member.memberId}
                            member={member}
                            index={i}
                            last={i === arr.length - 1}
                            isReminding={remindingId === member.memberId}
                            onRemind={handleRemind}
                            onDetail={setDetailMember}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="px-5">
                {monthError ? (
                  <InlineRetryError
                    message={MESSAGES.settlement.monthLoadFailed}
                    onRetry={handleMonthRetry}
                    retrying={isMonthLoading}
                  />
                ) : !monthMatches ? (
                  <MonthLoadingState />
                ) : classes.length === 0 && tournaments.length === 0 ? (
                  // 둘 다 없을 때만 통합 빈 상태 — 한쪽만 없으면 그 섹션은 통째로 숨김.
                  <EmptyState message={MESSAGES.settlement.emptySettlement} />
                ) : (
                  <>
                    {/* 훈련 소계 섹션 */}
                    {classes.length > 0 && (
                      <>
                        <SectionTitle label={MESSAGES.settlement.tabTraining} />
                        {classes.map((item, i) => (
                          <SettlementItemCard
                            key={item.classId}
                            data={classToCardData(item)}
                            index={i}
                            last={i === classes.length - 1}
                            onOpen={handleOpenDetail}
                          />
                        ))}
                      </>
                    )}

                    {/* 대회 소계 섹션 */}
                    {tournaments.length > 0 && (
                      <>
                        <SectionTitle label={MESSAGES.settlement.tabTournament} />
                        {tournaments.map((item, i) => (
                          <SettlementItemCard
                            key={item.tournamentId}
                            data={tournamentToCardData(item)}
                            index={i}
                            last={i === tournaments.length - 1}
                            onOpen={handleOpenDetail}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      <UnpaidDetailSheet
        isOpen={detailMember !== null}
        memberId={detailMember?.memberId ?? null}
        yearMonth={yearMonth}
        fallbackName={detailMember?.name}
        fallbackAmount={detailMember?.outstandingAmount}
        onClose={() => setDetailMember(null)}
      />
    </MobileContainer>
  );
}

// ─── Sub Components ──────────────────────────────────

/** 빈 상태 — 체크 아이콘 + 안내 (기존 톤 재사용). */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-12" role="status">
      <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-mint-100 dark:bg-mint-500/15">
        <Icon name="check_circle" className="text-2xl text-mint-500" aria-hidden="true" />
      </div>
      <p className="text-card-body text-it-ink-700 dark:text-wtext-4">{message}</p>
    </div>
  );
}

/** 정산 집계 탭 — 훈련/대회 소계 섹션 헤더. */
function SectionTitle({ label }: { label: string }) {
  return (
    <h3 className="pb-1 pt-4 text-[12.5px] font-extrabold text-it-ink-400 dark:text-wtext-3">
      {label}
    </h3>
  );
}

/** 거래 상태 표시 — completed/refunded(부분 포함)/cancelled 3분류. */
const TXN_STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  completed: {
    label: MESSAGES.settlement.txnStatusCompleted,
    cls: 'text-success',
    dot: 'bg-mint-500',
  },
  refunded: {
    label: MESSAGES.settlement.txnStatusRefunded,
    cls: 'text-it-red-500',
    dot: 'bg-it-red-500',
  },
  partially_refunded: {
    label: MESSAGES.settlement.txnStatusRefunded,
    cls: 'text-it-red-500',
    dot: 'bg-it-red-500',
  },
  cancelled: {
    label: MESSAGES.settlement.txnStatusCancelled,
    cls: 'text-it-red-500',
    dot: 'bg-it-red-500',
  },
};

/** KST 일시 파트 — 일자 헤더("MM.DD (요일)" — 연월 문맥은 Hero 월 선택기가 제공)와
 *  행 시각("HH:mm") 분리 표기용. */
function txnKstParts(iso: string): { dateLabel: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? '';
  return {
    dateLabel: `${g('month')}.${g('day')} (${g('weekday')})`,
    time: `${g('hour')}:${g('minute')}`,
  };
}

/** 거래를 KST 일자별로 그룹핑 — 은행앱 거래내역 패턴(최신순 유지, 연속 동일 일자 묶음). */
function groupTxnsByDate(
  items: TeamTransactionItem[],
): { dateLabel: string; items: TeamTransactionItem[] }[] {
  const groups: { dateLabel: string; items: TeamTransactionItem[] }[] = [];
  for (const item of items) {
    const dateLabel = txnKstParts(item.completedAt)?.dateLabel ?? '';
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.dateLabel === dateLabel) {
      lastGroup.items.push(item);
    } else {
      groups.push({ dateLabel, items: [item] });
    }
  }
  return groups;
}

/** 일자 그룹 헤더 — "YYYY.MM.DD (요일)" (결제내역 월 헤더와 동일 톤). */
function TxnDateHeader({ label }: { label: string }) {
  return (
    <h3 className="pb-1 pt-4 font-num text-[12.5px] font-extrabold tabular-nums text-it-ink-400 dark:text-wtext-3">
      {label}
    </h3>
  );
}

/** 거래 내역 행 — 결제 1건. 타이틀 줄=출처 배지+선수명(볼드)+결제 보호자(옅은 톤),
 *  메타 줄=상품명·시각(구분 기호 없이 간격 구분). 선수 연결이 없으면 상품명이 타이틀로 승격. */
function TransactionRow({
  item,
  index = 0,
  last,
}: {
  item: TeamTransactionItem;
  index?: number;
  last?: boolean;
}) {
  const status = TXN_STATUS[item.paymentStatus] ?? TXN_STATUS.completed;
  const struck =
    item.paymentStatus === 'refunded' || item.paymentStatus === 'cancelled';
  const subjectAsTitle = !item.childName && !!item.subjectName;
  const title = item.childName ?? item.subjectName ?? item.payerName ?? '';
  const payer = item.payerName === title ? null : item.payerName;
  const metaSubject = subjectAsTitle ? null : item.subjectName;
  const time = txnKstParts(item.completedAt)?.time ?? null;
  return (
    <article
      className={cn(
        'animate-slide-up py-[14px] motion-reduce:animate-none',
        !last && 'border-b border-it-line dark:border-rink-700',
      )}
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <PaymentSourceBadge
              sourceType={item.sourceType}
              billingTiming={item.billingTiming}
              className="shrink-0 self-center"
            />
            <p className="min-w-0 truncate text-[15px] font-bold text-it-ink-800 dark:text-white">
              {title}
            </p>
            {payer && (
              <span className="shrink-0 text-[13px] text-it-ink-500 dark:text-wtext-4">
                {payer}
              </span>
            )}
          </div>
          {/* 시각 선행 — 일자 헤더와 세로 스캔축 일치 + 고정폭이라 유사 컬럼 정렬. */}
          <p className="mt-0.5 flex items-center gap-x-3 font-num text-[13px] tabular-nums text-it-ink-500 dark:text-wtext-4">
            {time && <span className="shrink-0">{time}</span>}
            {metaSubject && (
              <span className="min-w-0 truncate">{metaSubject}</span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              'text-[15px] font-extrabold tabular-nums',
              struck
                ? 'text-it-ink-400 line-through decoration-it-ink-300/50'
                : 'text-it-ink-800 dark:text-white',
            )}
          >
            {formatCurrency(item.amount)}
            <span className="ml-0.5 text-[12px] font-medium">
              {MESSAGES.settlement.won}
            </span>
          </p>
          <span
            className={cn(
              'mt-0.5 inline-flex items-center gap-1 text-card-meta font-semibold',
              status.cls,
            )}
          >
            <span
              className={cn('h-1.5 w-1.5 rounded-w-pill', status.dot)}
              aria-hidden="true"
            />
            {status.label}
          </span>
        </div>
      </div>
    </article>
  );
}

/** 최초 로드 실패 — 풀 화면 명시적 에러 + 재시도(0원 Hero 렌더 금지). */
function InitialErrorState({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-20 text-center" role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15">
        <Icon name="error" className="text-2xl text-it-red-500" aria-hidden="true" />
      </div>
      <div>
        <p className="text-[15px] font-bold text-it-ink-800 dark:text-white">
          {MESSAGES.settlement.loadFailedTitle}
        </p>
        <p className="mt-1 text-[13px] text-it-ink-500 dark:text-wtext-4">
          {MESSAGES.settlement.loadFailedDesc}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-1 inline-flex h-11 items-center justify-center rounded-w-md bg-it-blue-500 px-6 text-[14px] font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
      >
        {MESSAGES.settlement.retry}
      </button>
    </div>
  );
}

/** 월 전환 로딩 — 응답 대기 중 stale 카드 대신 스피너 표기. */
function MonthLoadingState() {
  return (
    <div
      className="flex flex-col items-center gap-2.5 py-12"
      role="status"
      aria-label={MESSAGES.settlement.monthLoading}
    >
      <div
        className="h-8 w-8 animate-spin rounded-w-pill border-2 border-it-line border-t-it-blue-500 motion-reduce:animate-none dark:border-rink-700 dark:border-t-it-blue-500"
        aria-hidden="true"
      />
      <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
        {MESSAGES.settlement.monthLoading}
      </p>
    </div>
  );
}

function UnpaidMemberCard({
  member,
  index = 0,
  last,
  isReminding = false,
  onRemind,
  onDetail,
}: {
  member: UnpaidMemberRow;
  index?: number;
  last?: boolean;
  isReminding?: boolean;
  onRemind: (member: UnpaidMemberRow) => void;
  onDetail: (member: UnpaidMemberRow) => void;
}) {
  // 회원이 수업·대회를 동시에 미납할 수 있어 출처별 건수 메타로 표기 — 미납액이
  //   여러 건의 합산임을 카드에서 바로 읽히게 한다.
  const hasClass = member.sources.includes('CLASS');
  const hasTournament = member.sources.includes('TOURNAMENT');
  const sourceCountText = [
    hasClass ? MESSAGES.settlement.sourceClassCount(member.classCount) : null,
    hasTournament
      ? MESSAGES.settlement.sourceTournamentCount(member.tournamentCount)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <article
      className={cn(
        'animate-slide-up py-[14px] motion-reduce:animate-none',
        !last && 'border-b border-it-line dark:border-rink-700',
      )}
      style={{ animationDelay: staggerDelay(index) }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* 시안 Avatar(red tone) — 44px. 인물 자리이므로 이니셜 대신 person 아이콘. */}
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15">
            <Icon
              name="person"
              className="text-[24px] text-it-red-500 dark:text-it-red-300"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[15px] font-bold text-it-ink-800 truncate dark:text-white">{member.name}</h4>
            {member.teamName && (
              <p className="text-[13px] text-it-ink-500 truncate dark:text-wtext-4">{member.teamName}</p>
            )}
            {sourceCountText && (
              <p className="mt-1 text-[13px] text-it-ink-500 truncate dark:text-wtext-4">
                {sourceCountText}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11.5px] font-medium text-it-ink-400 dark:text-wtext-4">
            {MESSAGES.settlement.unpaidLabel}
          </p>
          <p className="mt-0.5 text-[15px] font-extrabold text-it-red-500 tabular-nums">
            {formatCurrency(member.outstandingAmount)}
            <span className="ml-0.5 text-[12px] font-medium">{MESSAGES.settlement.won}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onRemind(member)}
          disabled={isReminding}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-w-md bg-it-blue-500 text-[13.5px] font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          {isReminding ? MESSAGES.director2.sending : MESSAGES.settlement.sendReminder}
        </button>
        <button
          type="button"
          onClick={() => onDetail(member)}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-w-md border-[1.5px] border-it-line-strong text-[13.5px] font-semibold text-it-blue-600 transition-colors hover:bg-it-fill active:brightness-[0.98] motion-reduce:transition-none dark:border-rink-700 dark:text-wtext-4 dark:hover:bg-rink-700"
        >
          {MESSAGES.settlement.viewDetail}
        </button>
      </div>
    </article>
  );
}
