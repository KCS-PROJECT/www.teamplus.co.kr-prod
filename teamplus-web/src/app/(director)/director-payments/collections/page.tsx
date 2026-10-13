'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { UnpaidMemberCard } from '@/components/director/UnpaidMemberCard';
import {
  getTeamSettlementSummary,
  getTeamUnpaidMembers,
  sendTeamUnpaidReminder,
  getTeamUnpaidTotal,
  type TeamSettlementSummaryResponse,
  type TeamUnpaidMembersResponse,
  type TournamentSettlementSummary,
  type UnpaidMemberRow,
} from '@/services/payment';
import { formatCurrency } from '@/components/settlement/settlement-format';
import {
  SettlementItemCard,
  classToCardData,
  type SettlementCardData,
} from '@/components/settlement/SettlementItemCard';
import { InlineRetryError } from '@/components/settlement/InlineRetryError';
import { MonthStepper } from '@/components/settlement/MonthStepper';
import {
  EmptyState,
  SectionTitle,
  InitialErrorState,
  MonthLoadingState,
} from '@/components/settlement/SettlementStates';

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
    cancelled: item.cancelled,
  };
}

// ─── Main Component ──────────────────────────────────
export default function DirectorCollectionsPage() {
  const showWebUI = true; // 웹 UI 항상 사용 (네이티브 AppBar/BottomNav 제거됨)
  const { navigate } = useNavigation();
  const { toast } = useToast();

  const currentYm = useMemo(() => kstYearMonth(), []);
  // 결제 내역에서 보던 달로 진입(?yearMonth=YYYY-MM). 형식 오류·미래 월은 현재월로 연다.
  const searchParams = useSearchParams();
  const yearMonthParam = searchParams.get('yearMonth');
  const initialYm = useMemo(
    () =>
      yearMonthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonthParam) && yearMonthParam <= currentYm
        ? yearMonthParam
        : currentYm,
    // 진입 시 1회만 — 이후 월 이동은 스텝퍼 상태가 담당.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [yearMonth, setYearMonth] = useState<string>(initialYm);

  // 월인식 소계 (Hero + 훈련·대회 카드)
  const [settlement, setSettlement] = useState<TeamSettlementSummaryResponse | null>(null);
  // 월인식 인별 미수금 (상단 배너 — 선택 월 연동)
  const [unpaid, setUnpaid] = useState<TeamUnpaidMembersResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true); // 최초 풀스크린 로더 게이트
  const [isMonthLoading, setIsMonthLoading] = useState(false); // 월 전환 인라인 로딩
  const [isInitialRetrying, setIsInitialRetrying] = useState(false); // 최초 로드 재시도 진행 중
  // 실패 상태 분리 — 금융 화면: 로드 실패를 0/빈 결과로 위장하지 않는다.
  const [monthError, setMonthError] = useState(false); // 월 새로고침 실패(직전 유효월 데이터 보존)
  const [unpaidError, setUnpaidError] = useState(false); // 미수금 로드 실패
  const [isUnpaidRetrying, setIsUnpaidRetrying] = useState(false); // 미수금 재시도 진행 중

  // 전 기간 미납 항목 수 — 미납 칩 전용(월 무관 누적). 과거 달 미납이 달이 바뀌어도
  //   칩에 남도록 월 소계와 축을 분리한다. 실패는 0 취급(fail-closed).
  const [unpaidTotalCount, setUnpaidTotalCount] = useState(0);

  // 미수금 배너 펼침 (상단 — 기본 접힘)
  const [unpaidExpanded, setUnpaidExpanded] = useState(false);
  // 미수금 — 상세 시트 대상 회원 / 미납 안내 발송 중 회원
  const [detailMember, setDetailMember] = useState<UnpaidMemberRow | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  // 풀스크린 로더 fast-path — 소계·미수금 로드 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: MESSAGES.settlement.appBarTitle,
    showBottomNav: true,
    showBackButton: true,
  });

  // 요청 시퀀스 — 늦게 도착한 이전 월 응답이 최신 선택 월을 덮어쓰는 race 를 차단.
  // 로더별 독립 카운터: 소계=settlementSeq, 미수금=unpaidSeq.
  // 단독 재시도가 in-flight 다른 로드를 폐기하지 않도록 seq 를 분리(간섭 0).
  const settlementSeq = useRef(0);
  const unpaidSeq = useRef(0);

  // 전 기간 미납 칩 데이터 로드 — 마운트 1회. 월 전환과 무관해 월 로드와 분리.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getTeamUnpaidTotal();
        if (!cancelled) {
          setUnpaidTotalCount(res.success && res.data ? res.data.count : 0);
        }
      } catch {
        if (!cancelled) setUnpaidTotalCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 소계 로드 — 최신 요청(seq)만 반영. 실패 시 mode 별 에러 플래그 설정.
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

  // 인별 미수금 로드 — 선택 월 연동. 실패를 "미수금 0"으로 위장하지 않는다(strict throw 흡수).
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

  // 최초 로드 — 소계/인별 미수금 독립 처리(allSettled). 소계 실패면 settlement=null → 풀 에러 UI.
  // 미수금 실패는 loadUnpaid 내부에서 unpaidError 로 처리 → 배너 인라인 에러+재시도.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      // 두 로더 동시 트리거 — 각 seq 를 1회씩 증가시켜 각자 stale 폐기 판정에 주입.
      const sSeq = ++settlementSeq.current;
      const uSeq = ++unpaidSeq.current;
      await Promise.allSettled([
        loadNew(initialYm, 'initial', sSeq),
        loadUnpaid(initialYm, uSeq),
      ]);
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // 최초 1회만 — 이후 월 변경은 아래 effect 담당.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 월 변경 — 소계 + 인별 미수금 동시 재로드(선택 월 연동). 최초 로드는 건너뜀.
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
      setMonthError(false);
      // 각 seq 를 1회씩 증가시켜 늦은 이전월 응답이 최신 선택월을 덮지 않게 한다.
      const sSeq = ++settlementSeq.current;
      const uSeq = ++unpaidSeq.current;
      await Promise.allSettled([
        loadNew(yearMonth, 'month', sSeq),
        loadUnpaid(yearMonth, uSeq),
      ]);
      if (!cancelled) setIsMonthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [yearMonth, loadNew, loadUnpaid]);

  // 최초 로드 실패 재시도 — 풀스크린 로더 재게이트 없이 소계/미수금 재호출.
  const handleInitialRetry = useCallback(async () => {
    setIsInitialRetrying(true);
    const sSeq = ++settlementSeq.current;
    const uSeq = ++unpaidSeq.current;
    await Promise.allSettled([
      loadNew(initialYm, 'initial', sSeq),
      loadUnpaid(initialYm, uSeq),
    ]);
    setIsInitialRetrying(false);
  }, [initialYm, loadNew, loadUnpaid]);

  // 월 새로고침 실패 재시도 — 선택 월 유지, 소계 + 미수금 재호출(둘 다 월 스코프).
  const handleMonthRetry = useCallback(async () => {
    setIsMonthLoading(true);
    const sSeq = ++settlementSeq.current;
    const uSeq = ++unpaidSeq.current;
    await Promise.allSettled([
      loadNew(yearMonth, 'month', sSeq),
      loadUnpaid(yearMonth, uSeq),
    ]);
    setIsMonthLoading(false);
  }, [yearMonth, loadNew, loadUnpaid]);

  // 미수금 로드 실패 재시도 — 선택 월 인별 미수금 단독 재호출.
  // unpaidSeq 만 증가 → settlementSeq 불변 → in-flight loadNew(훈련/대회·Hero) 생존(폐기 안 함).
  const handleUnpaidRetry = useCallback(async () => {
    setIsUnpaidRetrying(true);
    const uSeq = ++unpaidSeq.current;
    await loadUnpaid(yearMonth, uSeq);
    setIsUnpaidRetrying(false);
  }, [yearMonth, loadUnpaid]);

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
        {showWebUI && <PageAppBar title={MESSAGES.settlement.collectionsTitle} forceNative />}
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

  // Hero 요약 (선택 월, 집계) — 선택 월과 응답 월 일치 시에만 수치 노출.
  const totalCollected =
    classes.reduce((a, c) => a + c.paidAmount, 0) +
    tournaments.reduce((a, t) => a + t.paidAmount, 0);
  const pendingSettlement =
    classes.reduce((a, c) => a + c.estimatedAmount, 0) +
    tournaments.reduce((a, t) => a + t.estimatedAmount, 0);
  const unpaidAmount = settlement.unpaid.amount;
  const hasUnpaid = showMonthData && unpaidAmount > 0;
  const amountDash = '—';

  const selM = Number(yearMonth.split('-')[1]);

  // 미수금 배너 — 응답 월과 선택 월 일치 시에만 렌더(전환 중 stale 방지).
  const unpaidMonthMatches = unpaid?.yearMonth === yearMonth;
  const unpaidCount = unpaid?.totalCount ?? 0;

  return (
    <MobileContainer hasBottomNav={showWebUI}>
      {showWebUI && <PageAppBar title={MESSAGES.settlement.collectionsTitle} forceNative />}

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={MESSAGES.settlement.ariaCenter}
      >
        {/* ── 수납 요약 — navy 밴드 Hero (ICETIMES flat) + 월 선택기 ──────── */}
        <section className="animate-fade-in bg-it-blue-800 px-5 pb-[22px] pt-5 motion-reduce:animate-none dark:bg-it-blue-900">
          {/* 상단 기준 문구 + 월 스텝퍼 */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-white/70">
              {MESSAGES.settlement.collectionsBasisNote(selM)}
            </p>
            <MonthStepper
              yearMonth={yearMonth}
              currentYm={currentYm}
              onChange={setYearMonth}
              label={MESSAGES.settlement.collectionsMonthLabel(selM)}
            />
          </div>

          {/* 수납 — 단일 히어로 숫자 (선택 월 == 응답 월일 때만 수치, 아니면 '—') */}
          <div className="mt-3.5" aria-busy={isMonthLoading}>
            <p className="text-[12.5px] text-white/70">{MESSAGES.settlement.collectedLabel}</p>
            <p className="mt-[3px] text-[34px] font-extrabold leading-none text-white tabular-nums">
              {showMonthData ? formatCurrency(totalCollected) : amountDash}
              {showMonthData && (
                <span className="ml-1 text-w-body font-semibold text-white/70">
                  {MESSAGES.settlement.won}
                </span>
              )}
            </p>
          </div>

          {/* 미수금 / 청구 예정 — 정의형 2열 (반투명 라인 구분) */}
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

          {/* 미납 칩 — 월 무관 전 기간 축(위 숫자들과 의도적 분리). 미납은 청구 후 유예(7일)
              경과분만 세는 연체 큐라 정산 확정 직후 전원 미납으로 점등되지 않는다.
              미납 0건은 각주 텍스트로 강등하되 상시 진입점으로 탭은 유지. */}
          <div className="mt-3.5 flex items-center justify-between border-t border-white/15 pt-3">
            {unpaidTotalCount > 0 ? (
              <button
                type="button"
                onClick={() => void navigate('/director-payments/unpaid')}
                className="inline-flex items-center gap-1.5 rounded-w-pill border border-white/25 bg-white/15 py-1.5 pl-3 pr-1.5 text-[13px] font-bold text-it-red-250 tabular-nums transition-colors hover:bg-white/25 active:brightness-95 motion-reduce:transition-none"
                aria-label={MESSAGES.settlement.overdueOpen}
              >
                <span className="size-1.5 rounded-w-pill bg-it-red-250" aria-hidden="true" />
                {MESSAGES.settlement.unpaidAllTimeChip(unpaidTotalCount)}
                <Icon name="chevron_right" className="text-[15px] text-white/70" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void navigate('/director-payments/unpaid')}
                className="text-[12.5px] font-bold text-white/70 tabular-nums active:brightness-95"
                aria-label={MESSAGES.settlement.overdueOpen}
              >
                {MESSAGES.settlement.unpaidAllTimeChip(0)}
              </button>
            )}
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 하단 여백은 MobileContainer 가 main 에 pb-30 자동 부여 → 중복 금지. */}
        <section
          aria-label={MESSAGES.settlement.collectionsTitle}
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
                aria-controls="director-collections-unpaid-banner"
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
                <div id="director-collections-unpaid-banner" className="px-5">
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
