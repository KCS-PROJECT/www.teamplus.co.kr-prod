'use client';

/**
 * PostpaidSettlementSection (정산 확정 쓰기 통합 — controlled)
 *
 * 후불(POSTPAID·1회 수업료 설정) 수업의 월별 회원 출석×단가 검수 + "정산 확정".
 * 감독이 확정하면 회원별 결제 요청이 일괄 발송된다.
 *
 * [controlled 개조] 월(yearMonth)은 부모(students 결제 탭)가 소유한다.
 *   - 자체 월 스텝퍼 제거 → 페이지 월 스텝퍼와 단일화(중복 스텝퍼 금지).
 *   - `canWrite` 게이트: 오픈클래스 보조 코치는 view-only.
 *   - draft 로드 실패는 null 위장 대신 InlineRetryError(금융 화면 계약).
 *   - 확정 성공 시 onConfirmed 로 부모 재조회 트리거(행 5-state 즉시 반영).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { InlineRetryError } from '@/components/settlement/InlineRetryError';
import { kstYearMonth } from '@/lib/kst-month';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import {
  fetchPostpaidDraft,
  confirmPostpaidSettlementResult,
  type PostpaidDraft,
} from '@/services/postpaid-billing.service';

export function PostpaidSettlementSection({
  classId,
  yearMonth,
  canWrite,
  onConfirmed,
  iceTheme = false,
}: {
  classId: string;
  /** 선택 월(YYYY-MM) — 부모(students 결제 탭)가 소유하는 필수 prop. 누락은 컴파일 에러로 검출. */
  yearMonth: string;
  /** 확정 쓰기 게이트. 팀=팀관리자 true / 오픈클래스=감독·admin true / 보조코치 false(view-only). */
  canWrite: boolean;
  /** 확정 성공 후 부모 getClassPayments 재조회 트리거. */
  onConfirmed?: () => void;
  /**
   * [ICETIMES Phase 2] flat 테마. 기본 false = 기존 떠있는 rounded 카드 보존.
   *   true 시 full-bleed 흰 섹션 + hairline 행 (students 결제 탭에 정합).
   */
  iceTheme?: boolean;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<PostpaidDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 요청 시퀀스 — 늦게 도착한 이전 월 응답이 최신 선택 월을 덮는 race 차단(금융 쓰기 안전).
  const reqSeq = useRef(0);
  // 최신 선택 월 추적(확정 await 이후 월 변경 감지용) — 클로저 캡처값과 별개.
  const yearMonthRef = useRef(yearMonth);
  yearMonthRef.current = yearMonth;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const seq = ++reqSeq.current;
    const res = await fetchPostpaidDraft(classId, yearMonth);
    if (seq !== reqSeq.current) return; // 폐기 — 더 최신 요청 진행 중(state 갱신 금지)
    if (res.ok) {
      setDraft(res.data);
    } else {
      setLoadError(true);
    }
    setLoading(false);
  }, [classId, yearMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  // draft ↔ 선택 월 결합 — 렌더·확정은 선택 월과 일치하는 draft 만 사용.
  // 월 전환 중(이전 월 draft 잔존) 또는 stale 응답을 원천 차단.
  const activeDraft = draft && draft.yearMonth === yearMonth ? draft : null;

  // 후불 단가 미설정(=선불 수업) + 정산 이력 없음 → 섹션 자체 숨김(실패가 아닌 정상-null).
  // 월 일치 draft(activeDraft) 기준으로 판정 — 월 전환 중에는 숨기지 않고 loading 유지.
  if (
    !loading &&
    !loadError &&
    activeDraft &&
    activeDraft.unitPrice <= 0 &&
    activeDraft.status === 'none' &&
    activeDraft.items.length === 0
  ) {
    return null;
  }

  const isConfirmed = activeDraft?.status === 'confirmed';
  const isPastMonth = yearMonth < kstYearMonth(); // YYYY-MM 사전식 = 시간순
  const canConfirm =
    canWrite &&
    !isConfirmed &&
    !submitting &&
    !loading &&
    !!activeDraft &&
    activeDraft.items.length > 0 &&
    isPastMonth;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    // 확정 월 고정 — 클릭 시점 yearMonth 를 지역 캡처해 confirm·재조회·콜백이 그 월 기준.
    const targetYm = yearMonth;
    setSubmitting(true);
    const res = await confirmPostpaidSettlementResult(classId, targetYm);
    setSubmitting(false);
    if (!res.ok) {
      // 서버 메시지(과거월/권한/이미확정) 우선 노출, 없으면 권한 폴백.
      toast.error(res.error ?? MESSAGES.postpaidSettlement.confirmForbidden);
      return;
    }
    toast.success(MESSAGES.postpaidSettlement.confirmedToast);
    // 확정 완료 시 선택 월이 바뀌었으면(월 전환) 재조회/콜백 생략 — 다른 월 오염 방지.
    if (yearMonthRef.current !== targetYm) return;
    await load();
    onConfirmed?.();
  };

  const phase: 'error' | 'loading' | 'ready' = loadError
    ? 'error'
    : loading || !activeDraft
      ? 'loading'
      : 'ready';

  // ── 공통 서브 렌더 ──
  const renderConfirmArea = () => {
    if (!canWrite) {
      return (
        <p
          className={cn(
            'mt-3 text-card-caption leading-relaxed',
            iceTheme
              ? 'text-it-ink-500 dark:text-rink-300'
              : 'text-wtext-3 dark:text-rink-300',
          )}
        >
          {MESSAGES.postpaidSettlement.viewOnly}
        </p>
      );
    }
    return (
      <>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={cn(
            'mt-3 w-full h-12 rounded-xl font-bold text-card-title transition-colors motion-reduce:transition-none',
            iceTheme
              ? canConfirm
                ? 'bg-it-blue-500 text-white hover:bg-it-blue-600 active:brightness-95'
                : 'bg-it-fill dark:bg-rink-700 text-it-ink-400 cursor-not-allowed'
              : canConfirm
                ? 'bg-ice-500 text-white hover:bg-ice-500/90 active:brightness-95'
                : 'bg-wline dark:bg-rink-700 text-wtext-3 cursor-not-allowed',
          )}
        >
          {isConfirmed
            ? MESSAGES.postpaidSettlement.confirmedBadge
            : submitting
              ? MESSAGES.postpaidSettlement.confirming
              : MESSAGES.postpaidSettlement.confirmCta}
        </button>
        {!isConfirmed && (
          <p
            className={cn(
              'mt-2 text-card-caption leading-relaxed',
              iceTheme
                ? 'text-it-ink-500 dark:text-rink-300'
                : 'text-wtext-3 dark:text-rink-300',
            )}
          >
            {isPastMonth
              ? MESSAGES.postpaidSettlement.confirmHint
              : MESSAGES.postpaidSettlement.monthNotEndedHint}
          </p>
        )}
      </>
    );
  };

  // ── ICETIMES flat 레이아웃 (students 결제 탭 정합 · 유일 소비 경로) ──
  if (iceTheme) {
    return (
      <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
        <header className="flex items-center justify-between mb-3">
          <h2 className="text-card-title font-extrabold text-it-ink-800 dark:text-white">
            {MESSAGES.postpaidSettlement.title}
          </h2>
          {isConfirmed && (
            <span className="px-2 py-0.5 rounded-w-pill text-card-caption font-bold bg-mint-100 text-rink-800 dark:bg-mint-500/20 dark:text-mint-100">
              {MESSAGES.postpaidSettlement.confirmedBadge}
            </span>
          )}
        </header>

        {phase === 'error' ? (
          <InlineRetryError
            message={MESSAGES.settlement.monthLoadFailed}
            onRetry={() => void load()}
            retrying={loading}
          />
        ) : phase === 'loading' ? (
          <ul className="space-y-2" aria-busy="true">
            {[0, 1].map((i) => (
              <li
                key={i}
                className="h-14 rounded-w-md bg-it-fill dark:bg-rink-700 animate-pulse motion-reduce:animate-none"
              />
            ))}
          </ul>
        ) : activeDraft ? (
          <>
            {activeDraft.items.length === 0 ? (
              <p className="py-6 text-center text-card-meta text-it-ink-500 dark:text-rink-300">
                {MESSAGES.postpaidSettlement.empty}
              </p>
            ) : (
              <ul className="flex flex-col">
                {activeDraft.items.map((it, idx) => (
                  <li
                    key={it.userId}
                    className={cn(
                      'flex items-center justify-between py-3',
                      idx !== activeDraft.items.length - 1 &&
                        'border-b border-it-line dark:border-rink-700',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-card-body font-bold text-it-ink-800 dark:text-white truncate">
                        {it.name}
                      </p>
                      <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
                        {MESSAGES.postpaidSettlement.attendanceUnit(
                          it.attendanceCount,
                          activeDraft.unitPrice,
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-card-body font-bold text-it-ink-800 dark:text-white tabular-nums">
                      {it.amount.toLocaleString()}원
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex items-center justify-between rounded-w-md bg-it-fill dark:bg-rink-800 px-3.5 py-3">
              <span className="text-card-body font-semibold text-it-ink-500 dark:text-rink-300">
                {MESSAGES.postpaidSettlement.total}
              </span>
              <span className="text-card-emphasis font-extrabold text-it-blue-500 tabular-nums">
                {activeDraft.totalAmount.toLocaleString()}원
              </span>
            </div>

            {renderConfirmArea()}
          </>
        ) : null}
      </section>
    );
  }

  // ── 기존 rounded 카드 레이아웃 (현재 소비자 없음 · 컴파일/회귀 안전용 보존) ──
  return (
    <section className="mx-4 mt-3 rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm p-5">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">
          {MESSAGES.postpaidSettlement.title}
        </h2>
        {isConfirmed && (
          <span className="px-2 py-0.5 rounded-w-pill text-card-caption font-bold bg-mint/15 text-mint">
            {MESSAGES.postpaidSettlement.confirmedBadge}
          </span>
        )}
      </header>

      {phase === 'error' ? (
        <InlineRetryError
          message={MESSAGES.settlement.monthLoadFailed}
          onRetry={() => void load()}
          retrying={loading}
        />
      ) : phase === 'loading' ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <li
              key={i}
              className="h-14 rounded-w-lg bg-wline-2 dark:bg-rink-700 animate-pulse motion-reduce:animate-none"
            />
          ))}
        </ul>
      ) : activeDraft ? (
        <>
          {activeDraft.items.length === 0 ? (
            <p className="py-6 text-center text-card-meta text-wtext-3 dark:text-rink-300">
              {MESSAGES.postpaidSettlement.empty}
            </p>
          ) : (
            <ul className="space-y-2">
              {activeDraft.items.map((it) => (
                <li
                  key={it.userId}
                  className="flex items-center justify-between rounded-w-lg border border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900/40 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
                      {it.name}
                    </p>
                    <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                      {MESSAGES.postpaidSettlement.attendanceUnit(
                        it.attendanceCount,
                        activeDraft.unitPrice,
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
                    {it.amount.toLocaleString()}원
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-wline-2 dark:border-rink-700 pt-3">
            <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
              {MESSAGES.postpaidSettlement.total}
            </span>
            <span className="text-card-emphasis font-bold text-wtext-1 dark:text-white tabular-nums">
              {activeDraft.totalAmount.toLocaleString()}원
            </span>
          </div>

          {renderConfirmArea()}
        </>
      ) : null}
    </section>
  );
}

export default PostpaidSettlementSection;
