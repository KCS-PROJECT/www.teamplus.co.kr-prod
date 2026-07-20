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
  getDirectorPaymentSummary,
  getTeamSettlementSummary,
  sendDirectorUnpaidReminder,
  type DirectorPaymentSummary as PaymentSummary,
  type DirectorUnpaidMember as UnpaidMember,
  type TeamSettlementSummaryResponse,
  type TournamentSettlementSummary,
} from '@/services/payment';
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

// ─── Types ──────────────────────────────────────────
type TabType = 'training' | 'tournament' | 'unpaid';

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
  const [activeTab, setActiveTab] = useState<TabType>('training');

  // 신규 월인식 소계 (훈련/대회 탭 + Hero)
  const [settlement, setSettlement] = useState<TeamSettlementSummaryResponse | null>(null);
  // 레거시 per-member (미수금 탭 A안 — 당월 기준)
  const [legacySummary, setLegacySummary] = useState<PaymentSummary | null>(null);
  const [unpaidMembers, setUnpaidMembers] = useState<UnpaidMember[]>([]);

  const [isLoading, setIsLoading] = useState(true); // 최초 풀스크린 로더 게이트
  const [isMonthLoading, setIsMonthLoading] = useState(false); // 월 전환 인라인 로딩
  const [isInitialRetrying, setIsInitialRetrying] = useState(false); // 최초 로드 재시도 진행 중
  // 실패 상태 분리 — 금융 화면: 로드 실패를 0/빈 결과로 위장하지 않는다.
  const [monthError, setMonthError] = useState(false); // 월 새로고침 실패(직전 유효월 데이터 보존)
  const [legacyError, setLegacyError] = useState(false); // 미수금(레거시) 로드 실패
  const [isLegacyRetrying, setIsLegacyRetrying] = useState(false); // 미수금 재시도 진행 중

  // 미수금 탭 — 상세 시트 대상 회원 / 미납 안내 발송 중 회원
  const [detailMember, setDetailMember] = useState<UnpaidMember | null>(null);
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
  // 초기 로드와 월 변경 모두 동일 카운터를 공유해, 초기 요청 vs 이른 월 변경 race 도 방어.
  const requestSeq = useRef(0);

  // 신규 소계 로드 — 최신 요청(seq)만 반영. 실패 시 mode 별 에러 플래그 설정.
  const loadNew = useCallback(async (ym: string, mode: 'initial' | 'month') => {
    const seq = ++requestSeq.current;
    try {
      const data = await getTeamSettlementSummary({ yearMonth: ym });
      if (seq !== requestSeq.current) return; // 폐기 — 더 최신 요청이 진행 중
      setSettlement(data);
      if (mode === 'month') setMonthError(false);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      devError(MESSAGES.common.loadFailed, err);
      if (mode === 'month') {
        // 직전 유효 월 데이터를 빈 데이터로 덮지 않는다 — 인라인 에러로만 표기.
        setMonthError(true);
      }
      // mode==='initial' 은 settlement 이 null 로 유지 → 렌더 게이트가 풀 에러 UI 표시.
    }
  }, []);

  // 레거시 미수금 로드 — 실패를 "미수금 0"으로 위장하지 않는다(strict throw 를 여기서 흡수).
  // 성공 시 데이터 세팅+에러 해제, 실패 시 legacyError 만 세우고 직전 데이터는 덮지 않는다.
  const loadLegacy = useCallback(async () => {
    try {
      const result = await getDirectorPaymentSummary();
      setLegacySummary(result.summary);
      setUnpaidMembers(result.unpaidMembers);
      setLegacyError(false);
    } catch (err) {
      devError(MESSAGES.common.loadFailed, err);
      setLegacyError(true);
    }
  }, []);

  // 최초 로드 — 신규/레거시 독립 처리(allSettled). 신규 실패면 settlement=null → 풀 에러 UI.
  // 레거시 실패는 loadLegacy 내부에서 legacyError 로 처리 → 미수금 탭 인라인 에러+재시도.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      await Promise.allSettled([loadNew(currentYm, 'initial'), loadLegacy()]);
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // 최초 1회만 — 이후 월 변경은 아래 effect 담당.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 월 변경 — 신규 소계만 재로드(레거시 미수금 탭은 당월 고정). 최초 로드는 건너뜀.
  const isFirstMonthEffect = useRef(true);
  useEffect(() => {
    if (isFirstMonthEffect.current) {
      isFirstMonthEffect.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      setIsMonthLoading(true);
      await loadNew(yearMonth, 'month');
      if (!cancelled) setIsMonthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [yearMonth, loadNew]);

  // 최초 로드 실패 재시도 — 풀스크린 로더 재게이트 없이 신규/레거시 재호출.
  const handleInitialRetry = useCallback(async () => {
    setIsInitialRetrying(true);
    await Promise.allSettled([loadNew(currentYm, 'initial'), loadLegacy()]);
    setIsInitialRetrying(false);
  }, [currentYm, loadNew, loadLegacy]);

  // 월 새로고침 실패 재시도 — 선택 월 유지, 신규 소계만 재호출.
  const handleMonthRetry = useCallback(async () => {
    setIsMonthLoading(true);
    await loadNew(yearMonth, 'month');
    setIsMonthLoading(false);
  }, [yearMonth, loadNew]);

  // 미수금(레거시) 로드 실패 재시도 — 당월 per-member 재호출.
  const handleLegacyRetry = useCallback(async () => {
    setIsLegacyRetrying(true);
    await loadLegacy();
    setIsLegacyRetrying(false);
  }, [loadLegacy]);

  // 미납 안내 발송 — 미납 자녀의 보호자에게 인앱+푸시 (백엔드 24h 쿨다운)
  const handleRemind = useCallback(
    async (member: UnpaidMember) => {
      setRemindingId(member.id);
      try {
        const res = await sendDirectorUnpaidReminder(member.id);
        if (res.success && res.data) {
          if (res.data.cooldown) {
            toast.info(MESSAGES.director2.remindCooldown);
          } else if (res.data.sent) {
            toast.success(MESSAGES.director2.remindSuccess(res.data.recipientCount));
          } else {
            toast.info(MESSAGES.director2.remindNoParent);
          }
        } else {
          toast.error(MESSAGES.director2.remindFailed);
        }
      } catch {
        toast.error(MESSAGES.director2.remindFailed);
      } finally {
        setRemindingId(null);
      }
    },
    [toast],
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

  // 미수금 탭(레거시) 배지 카운트 — per-member 목록 길이와 정합.
  const legacyUnpaidCount = legacySummary?.unpaidCount ?? unpaidMembers.length;
  const isCurrentMonth = yearMonth === currentYm;

  // 미수금 탭 라벨 — 레거시 실패 시 카운트(0)를 그대로 노출하지 않고 실패 표식으로 대체.
  const unpaidTabLabel = legacyError
    ? `${MESSAGES.settlement.tabUnpaid} ${MESSAGES.settlement.tabErrorMark}`
    : `${MESSAGES.settlement.tabUnpaid} ${legacyUnpaidCount}`;
  const tabs: { key: TabType; label: string }[] = [
    { key: 'training', label: MESSAGES.settlement.tabTraining },
    { key: 'tournament', label: MESSAGES.settlement.tabTournament },
    { key: 'unpaid', label: unpaidTabLabel },
  ];

  return (
    <MobileContainer hasBottomNav={showWebUI}>
      {showWebUI && <PageAppBar title={MESSAGES.settlement.pageTitle} forceNative />}

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={MESSAGES.settlement.ariaCenter}
      >
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

          {/* 미납 건수 */}
          <div className="mt-3.5 border-t border-white/15 pt-3 text-[12.5px]">
            <span
              className={cn('font-bold tabular-nums', hasUnpaid ? 'text-it-red-250' : 'text-white/70')}
            >
              {showMonthData ? MESSAGES.settlement.unpaidCountBadge(unpaidItemCount) : amountDash}
            </span>
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
          {activeTab === 'training' && (
            <section
              role="tabpanel"
              id="director-payments-panel-training"
              aria-labelledby="director-payments-tab-training"
              aria-busy={isMonthLoading}
              className={cn(
                'bg-it-surface px-5 transition-opacity dark:bg-rink-800',
                isMonthLoading && 'opacity-60',
              )}
            >
              {monthError ? (
                <InlineRetryError
                  message={MESSAGES.settlement.monthLoadFailed}
                  onRetry={handleMonthRetry}
                  retrying={isMonthLoading}
                />
              ) : !monthMatches ? (
                <MonthLoadingState />
              ) : classes.length > 0 ? (
                classes.map((item, i) => (
                  <SettlementItemCard
                    key={item.classId}
                    data={classToCardData(item)}
                    index={i}
                    last={i === classes.length - 1}
                    onOpen={handleOpenDetail}
                  />
                ))
              ) : (
                <EmptyState message={MESSAGES.settlement.emptyTraining} />
              )}
            </section>
          )}

          {activeTab === 'tournament' && (
            <section
              role="tabpanel"
              id="director-payments-panel-tournament"
              aria-labelledby="director-payments-tab-tournament"
              aria-busy={isMonthLoading}
              className={cn(
                'bg-it-surface px-5 transition-opacity dark:bg-rink-800',
                isMonthLoading && 'opacity-60',
              )}
            >
              {monthError ? (
                <InlineRetryError
                  message={MESSAGES.settlement.monthLoadFailed}
                  onRetry={handleMonthRetry}
                  retrying={isMonthLoading}
                />
              ) : !monthMatches ? (
                <MonthLoadingState />
              ) : tournaments.length > 0 ? (
                tournaments.map((item, i) => (
                  <SettlementItemCard
                    key={item.tournamentId}
                    data={tournamentToCardData(item)}
                    index={i}
                    last={i === tournaments.length - 1}
                    onOpen={handleOpenDetail}
                  />
                ))
              ) : (
                <EmptyState message={MESSAGES.settlement.emptyTournament} />
              )}
            </section>
          )}

          {activeTab === 'unpaid' && (
            <section
              role="tabpanel"
              id="director-payments-panel-unpaid"
              aria-labelledby="director-payments-tab-unpaid"
              className="bg-it-surface px-5 dark:bg-rink-800"
            >
              {legacyError ? (
                // 금융 화면 — 실패를 "미수금 없음"으로 위장하지 않는다. 에러 + 재시도.
                <InlineRetryError
                  message={MESSAGES.settlement.unpaidLoadFailed}
                  onRetry={handleLegacyRetry}
                  retrying={isLegacyRetrying}
                />
              ) : (
                <>
                  {/* 선택 월이 당월이 아니면 안내 문구 — 미수금 탭은 당월 per-member 고정 */}
                  {!isCurrentMonth && (
                    <p className="flex items-center gap-1.5 border-b border-it-line py-3 text-[12.5px] text-it-ink-500 dark:border-rink-700 dark:text-wtext-4">
                      <Icon name="info" className="text-[15px] text-it-blue-500" aria-hidden="true" />
                      {MESSAGES.settlement.unpaidCurrentMonthOnly}
                    </p>
                  )}
                  {unpaidMembers.length > 0 ? (
                    unpaidMembers.map((member, i) => (
                      <UnpaidMemberCard
                        key={member.id}
                        member={member}
                        index={i}
                        last={i === unpaidMembers.length - 1}
                        isReminding={remindingId === member.id}
                        onRemind={handleRemind}
                        onDetail={setDetailMember}
                      />
                    ))
                  ) : (
                    <EmptyState message={MESSAGES.settlement.emptyUnpaid} />
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </main>

      <UnpaidDetailSheet
        isOpen={detailMember !== null}
        memberId={detailMember?.id ?? null}
        fallbackName={detailMember?.name}
        fallbackAmount={detailMember?.amount}
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
  member: UnpaidMember;
  index?: number;
  last?: boolean;
  isReminding?: boolean;
  onRemind: (member: UnpaidMember) => void;
  onDetail: (member: UnpaidMember) => void;
}) {
  const billingLabel =
    member.billingType === 'POSTPAID'
      ? MESSAGES.settlement.billingPostpaid
      : MESSAGES.settlement.billingPrepaid;
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
          {/* 시안 Avatar(red tone, 이니셜) — 44px */}
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15">
            <span className="text-[16px] font-extrabold text-it-red-500 dark:text-it-red-300">
              {member.name?.charAt(0) || '?'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[15px] font-bold text-it-ink-800 truncate dark:text-white">{member.name}</h4>
            <p className="text-[13px] text-it-ink-500 truncate dark:text-wtext-4">{member.teamName}</p>
            <div className="mt-1.5">
              <span className="inline-flex items-center rounded-w-sm bg-it-blue-50 px-1.5 py-0.5 text-[11.5px] font-bold text-it-blue-600 dark:bg-it-blue-900/30 dark:text-it-blue-300">
                {billingLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11.5px] font-medium text-it-ink-400 dark:text-wtext-4">
            {MESSAGES.settlement.unpaidLabel}
          </p>
          <p className="mt-0.5 text-[15px] font-extrabold text-it-red-500 tabular-nums">
            {formatCurrency(member.amount)}
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
