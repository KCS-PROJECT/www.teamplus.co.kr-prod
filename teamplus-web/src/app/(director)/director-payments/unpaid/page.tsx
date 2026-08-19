'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { PaymentSourceBadge } from '@/components/payment/PaymentSourceBadge';
import { UnpaidDetailSheet } from '@/components/director/UnpaidDetailSheet';
import { InlineRetryError } from '@/components/settlement/InlineRetryError';
import { formatCurrency } from '@/components/settlement/settlement-format';
import {
  getTeamUnpaidItems,
  sendTeamUnpaidReminder,
  type TeamUnpaidItemsResponse,
  type UnpaidOverdueItem,
  type UnpaidOverdueMemberLine,
} from '@/services/payment';

/** 상세 시트 대상 — 회원 + 해당 청구의 귀속 월(인별 상세 API 월 스코프). */
interface DetailTarget {
  memberId: string;
  yearMonth: string;
  name: string;
  amount: number;
}

/** "YYYY-MM" → 월 그룹 라벨. 형식 밖 값은 원문 그대로(방어). */
function monthGroupLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  return MESSAGES.settlement.monthLabel(Number(m[1]), Number(m[2]));
}

/**
 * 미납 관리 — /director-payments/unpaid
 *
 * 연체 미납 큐(청구 후 유예 경과분만, 월 무관 전 기간). 정산센터 Hero "미납 N건" 칩의
 * 착지 화면으로, 칩 건수 = 이 페이지 항목 수(동일 API 정의). 월(귀속 청구월)별 그룹,
 * 오래된 청구 우선. 선택 월 "전량" 미수 확인은 정산센터 정산 집계 탭 배너가 담당(장부 렌즈).
 */
export default function DirectorUnpaidPage() {
  const { toast } = useToast();
  const [data, setData] = useState<TeamUnpaidItemsResponse | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  // 발송 중 상태 키 = 항목+자녀 복합키 — 같은 자녀가 여러 청구 항목에 걸쳐도 누른 행만 표시.
  const [remindingKey, setRemindingKey] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);

  usePageReady(data !== null || hasError);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: MESSAGES.settlement.overdueTitle,
    showBottomNav: true,
    showBackButton: true,
  });

  const load = useCallback(async () => {
    try {
      const res = await getTeamUnpaidItems();
      setData(res);
      setHasError(false);
    } catch {
      setHasError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      await load();
    } finally {
      setIsRetrying(false);
    }
  }, [load]);

  const handleRemind = useCallback(
    async (
      member: UnpaidOverdueMemberLine,
      yearMonth: string,
      rowKey: string,
    ) => {
      setRemindingKey(rowKey);
      try {
        const res = await sendTeamUnpaidReminder({
          memberId: member.memberId,
          yearMonth,
        });
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
        setRemindingKey(null);
      }
    },
    [toast],
  );

  // 월(귀속 청구월)별 그룹 — 항목 정렬(오래된 청구 우선)을 보존한 채 순서대로 묶는다.
  const monthGroups = useMemo(() => {
    const groups: { yearMonth: string; items: UnpaidOverdueItem[] }[] = [];
    for (const item of data?.items ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.yearMonth === item.yearMonth) last.items.push(item);
      else groups.push({ yearMonth: item.yearMonth, items: [item] });
    }
    return groups;
  }, [data]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.settlement.overdueTitle} forceNative />
      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={MESSAGES.settlement.overdueTitle}
      >
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {hasError ? (
          <div className="bg-it-surface px-5 py-6 dark:bg-rink-800">
            <InlineRetryError
              message={MESSAGES.settlement.overdueLoadFailed}
              onRetry={handleRetry}
              retrying={isRetrying}
            />
          </div>
        ) : data === null ? null : (
          <>
            {/* 요약 헤더 — 칩 "미납 N건"과 1:1 (동일 API 정의) */}
            <section className="bg-it-surface px-5 py-4 dark:bg-rink-800">
              <div className="flex items-center justify-between">
                <p className="text-card-body font-semibold text-it-ink-600 dark:text-rink-100">
                  {MESSAGES.settlement.overdueTotalLabel}
                </p>
                <p
                  className={cn(
                    'text-card-title font-black tabular-nums',
                    data.count > 0
                      ? 'text-it-red-500'
                      : 'text-it-ink-600 dark:text-rink-100',
                  )}
                >
                  {MESSAGES.settlement.unpaidCountBadge(data.count)}
                  {data.count > 0 && (
                    <span className="ml-1.5">
                      {formatCurrency(data.totalAmount)}
                      {MESSAGES.settlement.won}
                    </span>
                  )}
                </p>
              </div>
              <p className="mt-1 text-card-meta text-it-ink-500 dark:text-wtext-4">
                {MESSAGES.settlement.overdueGraceCaption(data.graceDays)}
              </p>
            </section>

            {data.items.length === 0 ? (
              <section className="mt-2 bg-it-surface px-5 py-12 text-center dark:bg-rink-800">
                <Icon
                  name="task_alt"
                  className="text-[32px] text-it-ink-400 dark:text-wtext-4"
                  aria-hidden="true"
                />
                <p className="mt-2 text-card-body text-it-ink-500 dark:text-wtext-4">
                  {MESSAGES.settlement.overdueEmpty}
                </p>
              </section>
            ) : (
              monthGroups.map((group) => (
                <section
                  key={group.yearMonth}
                  className="mt-2 bg-it-surface px-5 py-4 dark:bg-rink-800"
                >
                  <h2 className="text-card-meta font-bold uppercase text-it-ink-500 dark:text-wtext-4">
                    {monthGroupLabel(group.yearMonth)}
                  </h2>
                  {group.items.map((item) => (
                    <div
                      key={item.key}
                      className="mt-3 border-t border-it-line pt-3 first:mt-2 dark:border-rink-700"
                    >
                      {/* 항목 헤더 — 출처 배지 + 이름 + 합계 + 경과일 */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <PaymentSourceBadge
                              sourceType={item.sourceType}
                              billingTiming="POSTPAID"
                            />
                            <span className="truncate text-card-body font-bold text-it-ink-900 dark:text-white">
                              {item.sourceName}
                            </span>
                          </div>
                          <p className="mt-0.5 text-card-meta text-it-red-500">
                            {MESSAGES.settlement.overdueDaysBadge(item.overdueDays)}
                            {' · '}
                            {MESSAGES.settlement.overdueMemberCount(
                              item.members.length,
                            )}
                          </p>
                        </div>
                        <p className="shrink-0 text-card-body font-black tabular-nums text-it-ink-900 dark:text-white">
                          {formatCurrency(item.amount)}
                          {MESSAGES.settlement.won}
                        </p>
                      </div>

                      {/* 인별 라인 — 행 탭=상세 시트, 우측=안내 발송 */}
                      {item.members.map((member) => (
                        <div
                          key={`${item.key}:${member.memberId}`}
                          className="mt-2 flex items-center gap-2"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setDetailTarget({
                                memberId: member.memberId,
                                yearMonth: item.yearMonth,
                                name: member.memberName,
                                amount: member.amount,
                              })
                            }
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-w-lg bg-it-fill px-3 py-2.5 text-left transition-colors hover:bg-it-line/60 active:brightness-95 motion-reduce:transition-none dark:bg-rink-700 dark:hover:bg-rink-600"
                            aria-label={MESSAGES.settlement.viewDetail}
                          >
                            <span className="truncate text-card-body font-semibold text-it-ink-900 dark:text-white">
                              {member.memberName}
                            </span>
                            <span className="shrink-0 text-card-body font-bold tabular-nums text-it-ink-600 dark:text-rink-100">
                              {formatCurrency(member.amount)}
                              {MESSAGES.settlement.won}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleRemind(
                                member,
                                item.yearMonth,
                                `${item.key}:${member.memberId}`,
                              )
                            }
                            disabled={
                              remindingKey === `${item.key}:${member.memberId}`
                            }
                            className="shrink-0 rounded-w-pill border border-it-blue-500/40 px-3 py-2 text-card-meta font-bold text-it-blue-500 transition-colors hover:bg-it-blue-50 active:brightness-95 disabled:opacity-50 motion-reduce:transition-none dark:hover:bg-it-blue-500/15"
                          >
                            {/* 라벨 겹침 렌더 — 짧은 "발송 중"으로 바뀌어도 버튼 폭이 긴 라벨 기준으로
                                고정되어 좌측 flex 영역이 당겨지는 레이아웃 시프트가 생기지 않는다. */}
                            <span className="grid text-center">
                              <span
                                className={cn(
                                  'col-start-1 row-start-1',
                                  remindingKey ===
                                    `${item.key}:${member.memberId}` &&
                                    'invisible',
                                )}
                                aria-hidden={
                                  remindingKey ===
                                  `${item.key}:${member.memberId}`
                                }
                              >
                                {MESSAGES.settlement.sendReminder}
                              </span>
                              {remindingKey ===
                                `${item.key}:${member.memberId}` && (
                                <span className="col-start-1 row-start-1">
                                  {MESSAGES.director2.sending}
                                </span>
                              )}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              ))
            )}
          </>
        )}
        <div className="h-6" aria-hidden="true" />
      </main>

      <UnpaidDetailSheet
        isOpen={detailTarget !== null}
        memberId={detailTarget?.memberId ?? null}
        yearMonth={detailTarget?.yearMonth ?? ''}
        fallbackName={detailTarget?.name}
        fallbackAmount={detailTarget?.amount}
        onClose={() => setDetailTarget(null)}
      />
    </MobileContainer>
  );
}
