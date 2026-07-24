'use client';

/**
 * AcademySettlementTab — 오픈클래스(academy) 정산 탭 본체
 *
 * `/academy/[id]` 의 4번째 [정산] 탭. 오픈클래스 감독이 자기 수업의 청구/수납/미수·정산
 * 상태를 선택 월 기준으로 보고 수업 상세로 드릴다운한다. 팀 허브(director-payments) 와
 * 카드/배지/에러재시도 UI 를 공유(components/settlement)한다. 대회 축은 없다(오픈클래스 scope).
 *
 * AcademyStudentsTab 패턴을 따른다(별도 컴포넌트 · usePageReady 위임). 페이지는 activeTab
 * === 'settlement' 일 때 이 컴포넌트에 풀스크린 로더 게이트를 위임한다.
 *
 * 금융 화면 원칙: 로드 실패를 0/빈 결과로 위장하지 않고 명시적 에러 + 재시도로 처리한다.
 * 월 전환 race 는 요청 시퀀스(useRef) 로 방어하며, 응답 월과 선택 월 불일치 시 stale 수치를
 * 렌더하지 않는다. 월은 KST 기준(kstYearMonth) 이다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { devError } from '@/lib/logger';
import { MESSAGES } from '@/lib/messages';
import { kstYearMonth } from '@/lib/kst-month';
import { useNavigation } from '@/hooks/useNavigation';
import { usePageReady } from '@/hooks/usePageReady';
import {
  getAcademySettlementSummary,
  type AcademySettlementSummaryResponse,
} from '@/services/payment';
import {
  SettlementItemCard,
  classToCardData,
} from '@/components/settlement/SettlementItemCard';
import { InlineRetryError } from '@/components/settlement/InlineRetryError';
import { formatCurrency, shiftMonth } from '@/components/settlement/settlement-format';
import { RefundPendingBanner } from '@/components/refunds/RefundPendingBanner';

interface AcademySettlementTabProps {
  academyId: string;
}

export function AcademySettlementTab({ academyId }: AcademySettlementTabProps) {
  const { navigate } = useNavigation();

  const currentYm = useMemo(() => kstYearMonth(), []);
  const [yearMonth, setYearMonth] = useState<string>(currentYm);

  const [data, setData] = useState<AcademySettlementSummaryResponse | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true); // 최초 로드 게이트
  const [isMonthLoading, setIsMonthLoading] = useState(false); // 월 전환 인라인 로딩
  const [isInitialRetrying, setIsInitialRetrying] = useState(false); // 최초 로드 재시도 진행 중
  const [monthError, setMonthError] = useState(false); // 월 새로고침 실패(직전 유효월 보존)

  // 풀스크린 로더 위임 — 최초 로드 시도 완료(성공/실패) 시 ready.
  //  실패여도 아래 에러+재시도 UI 가 "셋팅 완료" 상태이므로 로더를 무한 홀드하지 않는다
  //  (director-payments 와 동일 계약 — LOADING_TIMING_POLICY §11).
  usePageReady(!isInitialLoading);

  // 요청 시퀀스 — 늦게 도착한 이전 월 응답이 최신 선택 월을 덮는 race 를 차단.
  const requestSeq = useRef(0);

  const loadData = useCallback(
    async (ym: string, mode: 'initial' | 'month') => {
      const seq = ++requestSeq.current;
      try {
        const res = await getAcademySettlementSummary({ academyId, yearMonth: ym });
        if (seq !== requestSeq.current) return; // 폐기 — 더 최신 요청 진행 중
        setData(res);
        if (mode === 'month') setMonthError(false);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        devError(MESSAGES.common.loadFailed, err);
        if (mode === 'month') {
          // 직전 유효월 데이터를 빈 데이터로 덮지 않는다 — 인라인 에러로만 표기.
          setMonthError(true);
        }
        // mode==='initial' 은 data 가 null 로 유지 → 렌더 게이트가 풀 에러 UI 표시.
      }
    },
    [academyId],
  );

  // 최초 로드 — 1회.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsInitialLoading(true);
      await loadData(currentYm, 'initial');
      if (!cancelled) setIsInitialLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // 최초 1회만 — 이후 월 변경은 아래 effect 담당.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 월 변경 — 최초 로드는 건너뜀.
  const isFirstMonthEffect = useRef(true);
  useEffect(() => {
    if (isFirstMonthEffect.current) {
      isFirstMonthEffect.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      setIsMonthLoading(true);
      await loadData(yearMonth, 'month');
      if (!cancelled) setIsMonthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [yearMonth, loadData]);

  const handleInitialRetry = useCallback(async () => {
    setIsInitialRetrying(true);
    await loadData(currentYm, 'initial');
    setIsInitialRetrying(false);
  }, [currentYm, loadData]);

  const handleMonthRetry = useCallback(async () => {
    setIsMonthLoading(true);
    await loadData(yearMonth, 'month');
    setIsMonthLoading(false);
  }, [yearMonth, loadData]);

  const handleOpenDetail = useCallback(
    (path: string) => {
      void navigate(path);
    },
    [navigate],
  );

  // 최초 풀스크린 로더는 usePageReady 가 처리 — 로딩 중엔 null.
  if (isInitialLoading) return null;

  // 최초 로드 실패 — data 가 null. 0원 요약/빈 카드 렌더 금지, 풀 에러 UI + 재시도.
  if (!data) {
    return (
      <div className="pt-4">
        <InlineRetryError
          message={MESSAGES.settlement.loadFailedTitle}
          onRetry={handleInitialRetry}
          retrying={isInitialRetrying}
        />
      </div>
    );
  }

  // 응답 월과 선택 월 일치 여부 — 불일치(전환 중/실패)면 stale 카드/수치 렌더 금지.
  const monthMatches = data.yearMonth === yearMonth;
  const showMonthData = monthMatches && !monthError;

  const classes = data.classes;
  const totalCollected = classes.reduce((a, c) => a + c.paidAmount, 0);
  const pendingSettlement = classes.reduce((a, c) => a + c.estimatedAmount, 0);
  const unpaidAmount = data.unpaid.amount;
  const unpaidItemCount = data.unpaid.count;
  const hasUnpaid = showMonthData && unpaidAmount > 0;
  const amountDash = '—';

  const [selY, selM] = yearMonth.split('-').map(Number);
  const nextMonthDisabled = yearMonth >= currentYm;

  return (
    <div className="flex flex-col">
      {/* 환불 대기 조건부 배너 — pending > 0 일 때만 노출(0건이면 wrapper 째 미렌더). */}
      <RefundPendingBanner scope="academy" scopeId={academyId} className="pb-3" />

      {/* ── 월 선택 + 요약 (flat 흰 섹션 — 페이지에 이미 navy Hero 있으므로 navy 금지) ── */}
      <section aria-label={MESSAGES.settlement.heroLabel} className="pt-1">
        {/* 상단 라벨 + 월 스텝퍼 */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase text-it-ink-500 dark:text-wtext-4">
            {MESSAGES.settlement.heroLabel}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setYearMonth((ym) => shiftMonth(ym, -1))}
              aria-label={MESSAGES.settlement.prevMonth}
              className="grid h-7 w-7 place-items-center rounded-w-pill text-it-ink-500 transition-colors hover:bg-it-fill active:brightness-95 motion-reduce:transition-none dark:text-wtext-4 dark:hover:bg-rink-700"
            >
              <Icon name="chevron_left" className="text-[18px]" aria-hidden="true" />
            </button>
            <span className="min-w-[92px] rounded-w-pill bg-it-fill px-2.5 py-1 text-center text-[12px] font-bold text-it-ink-800 tabular-nums dark:bg-rink-700 dark:text-white">
              {MESSAGES.settlement.monthLabel(selY, selM)}
            </span>
            <button
              type="button"
              onClick={() => setYearMonth((ym) => shiftMonth(ym, 1))}
              disabled={nextMonthDisabled}
              aria-label={MESSAGES.settlement.nextMonth}
              className="grid h-7 w-7 place-items-center rounded-w-pill text-it-ink-500 transition-colors hover:bg-it-fill active:brightness-95 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none dark:text-wtext-4 dark:hover:bg-rink-700"
            >
              <Icon name="chevron_right" className="text-[18px]" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 요약 인셋 박스 (it-fill, flat) */}
        <div
          className="mt-3 rounded-w-md border-[1.5px] border-it-line bg-it-fill px-4 py-4 dark:border-it-blue-900 dark:bg-it-blue-900/40"
          aria-busy={isMonthLoading}
        >
          {/* 총 수납 — 단일 히어로 숫자 */}
          <div>
            <p className="text-[12.5px] text-it-ink-500 dark:text-wtext-4">
              {MESSAGES.settlement.totalCollected}
            </p>
            <p className="mt-[3px] text-[30px] font-extrabold leading-none text-it-ink-800 tabular-nums dark:text-white">
              {showMonthData ? formatCurrency(totalCollected) : amountDash}
              {showMonthData && (
                <span className="ml-1 text-w-body font-semibold text-it-ink-500 dark:text-wtext-4">
                  {MESSAGES.settlement.won}
                </span>
              )}
            </p>
          </div>

          {/* 미수금 / 정산 예정 — 정의형 2열 */}
          <div className="mt-4 grid grid-cols-2 gap-6 border-t border-it-line pt-3.5 dark:border-it-blue-900">
            <div>
              <p className="text-[12px] text-it-ink-500 dark:text-wtext-4">
                {MESSAGES.settlement.unpaidAmount}
              </p>
              <p
                className={cn(
                  'mt-[3px] text-[17px] font-extrabold tabular-nums',
                  hasUnpaid ? 'text-it-red-500' : 'text-it-ink-800 dark:text-white',
                )}
              >
                {showMonthData ? formatCurrency(unpaidAmount) : amountDash}
                {showMonthData && (
                  <span className="ml-0.5 text-[12px] font-medium text-it-ink-500 dark:text-wtext-4">
                    {MESSAGES.settlement.won}
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-it-ink-500 dark:text-wtext-4">
                {MESSAGES.settlement.pendingSettlement}
              </p>
              <p className="mt-[3px] text-[17px] font-extrabold text-it-ink-800 tabular-nums dark:text-white">
                {showMonthData ? formatCurrency(pendingSettlement) : amountDash}
                {showMonthData && (
                  <span className="ml-0.5 text-[12px] font-medium text-it-ink-500 dark:text-wtext-4">
                    {MESSAGES.settlement.won}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* 미납 건수 */}
          <div className="mt-3.5 border-t border-it-line pt-3 text-[12.5px] dark:border-it-blue-900">
            <span
              className={cn(
                'font-bold tabular-nums',
                hasUnpaid ? 'text-it-red-500' : 'text-it-ink-500 dark:text-wtext-4',
              )}
            >
              {showMonthData
                ? MESSAGES.settlement.unpaidCountBadge(unpaidItemCount)
                : amountDash}
            </span>
          </div>
        </div>
      </section>

      {/* ── 수업 목록 ─────────────────────────────────────────────── */}
      <section
        aria-busy={isMonthLoading}
        className={cn('mt-2 transition-opacity', isMonthLoading && 'opacity-60')}
      >
        {monthError ? (
          <InlineRetryError
            message={MESSAGES.settlement.monthLoadFailed}
            onRetry={handleMonthRetry}
            retrying={isMonthLoading}
          />
        ) : !monthMatches ? (
          <AcademySettlementMonthLoading />
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
          <AcademySettlementEmpty message={MESSAGES.settlement.emptyTraining} />
        )}
      </section>
    </div>
  );
}

/** 빈 상태 — 체크 아이콘 + 안내. */
function AcademySettlementEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-12" role="status">
      <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-mint-100 dark:bg-mint-500/15">
        <Icon name="check_circle" className="text-2xl text-mint-500" aria-hidden="true" />
      </div>
      <p className="text-card-body text-it-ink-700 dark:text-wtext-4">{message}</p>
    </div>
  );
}

/** 월 전환 로딩 — 응답 대기 중 stale 카드 대신 스피너 표기. */
function AcademySettlementMonthLoading() {
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

export default AcademySettlementTab;
