'use client';

import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { useNavigation } from '@/components/ui/NavLink';
import { MESSAGES } from '@/lib/messages';

/** 미납 후불 청구 항목 — GET /payments/postpaid/my-pending 응답(orderNumber 있는 행만 사용). */
export interface PendingBilling {
  kind: 'CLASS' | 'TOURNAMENT';
  title: string;
  amount: number;
  orderNumber: string | null;
  paymentName: string;
  /** 청구 대상 자녀 이름 — 백엔드 append(child null 이면 미제공). */
  childName?: string | null;
}

/** 후불 결제 페이지 딥링크 — 백엔드 결제요청 알림 linkUrl 과 동일 포맷.
 *  금액·상태 SoT 는 결제 페이지의 서버 주문 조회이므로 쿼리 amount 는 표시용 스냅샷. */
export function postpaidPayLink(b: PendingBilling): string {
  return `/payment/postpaid?orderNumber=${encodeURIComponent(b.orderNumber ?? '')}&amount=${b.amount}&name=${encodeURIComponent(b.paymentName)}`;
}

/**
 * 결제 대기 탭 패널 (/payment/history?tab=pending)
 *
 *  미납 후불 청구(수업 정산 + 후불 대회 참가비)를 합계 히어로 + 행 리스트로 표시하고,
 *  행 탭 시 후불 결제 페이지로 이동한다. 데이터 fetch 는 페이지가 담당(탭 배지 건수 공유).
 *  선불 미납(주문 미생성)은 이 목록에 포함되지 않는다 — 수업 결제 플로우에서 처리.
 */
export function PendingPaymentsPanel({
  items,
  isLoading,
  hasError,
  onRetry,
}: {
  items: PendingBilling[];
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
}) {
  const { navigate } = useNavigation();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16" role="status">
        <Spinner />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16" role="alert">
        <p className="text-card-body text-it-ink-500 dark:text-rink-300">
          {MESSAGES.payment2.pendingLoadFailed}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-w-pill border border-it-line-strong px-4 py-2 text-card-meta font-semibold text-it-blue-600 transition-colors hover:bg-it-fill active:brightness-95 motion-reduce:transition-none dark:border-rink-700 dark:text-wtext-4 dark:hover:bg-rink-700"
        >
          {MESSAGES.payment2.pendingRetry}
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    // 알림을 늦게 열어 이미 결제한 경우의 정상 착지 — 0원 히어로 대신 완료 상태로 표시.
    return (
      <div className="flex flex-col items-center gap-2.5 py-16" role="status">
        <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-mint-100 dark:bg-mint-500/15">
          <Icon
            name="check_circle"
            className="text-[26px] text-mint-600 dark:text-mint-500"
            aria-hidden="true"
          />
        </div>
        <p className="text-card-title font-bold text-it-ink-800 dark:text-white">
          {MESSAGES.payment2.pendingEmpty}
        </p>
        <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
          {MESSAGES.payment2.pendingEmptyDesc}
        </p>
      </div>
    );
  }

  const totalAmount = items.reduce((sum, b) => sum + b.amount, 0);

  return (
    <>
      {/* 합계 히어로 — 결제 내역 탭 SummaryCard 와 동일 navy 밴드 톤. 탭 바로 아래 밀착(mt 금지 — 탭 대칭) */}
      <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-[22px] pb-6">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
          <Icon name="payments" className="text-[14px]" aria-hidden="true" />
          {MESSAGES.payment2.pendingSummaryLabel}
        </div>
        <p className="mt-2 truncate whitespace-nowrap text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] tabular-nums text-white">
          {`${totalAmount.toLocaleString()}원`}
        </p>
        <div className="mt-[18px] flex items-center gap-1.5 border-t border-white/[0.14] pt-4">
          <span className="flex h-2 w-2 rounded-w-pill bg-sun-500" aria-hidden="true" />
          <span className="text-card-meta text-white/60">{MESSAGES.payment2.tabPending}</span>
          <span className="text-card-meta font-bold tabular-nums text-white">
            {MESSAGES.payment2.pendingSummaryCount(items.length)}
          </span>
        </div>
      </section>

      {/* 결제 대기 행 리스트 — 학부모 대시보드 결제요청 바텀시트 행 구성 이관 */}
      <section className="mt-2 bg-it-surface dark:bg-rink-800 px-4 pt-3.5 pb-1.5">
        <h3 className="pb-1 text-card-meta font-bold text-it-ink-500 dark:text-rink-300">
          {MESSAGES.payment2.pendingListTitle}
        </h3>
        <ul className="flex flex-col" role="list">
          {items.map((b) => (
            <li
              key={b.orderNumber}
              className="border-b border-it-line dark:border-rink-700 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => navigate(postpaidPayLink(b))}
                className="w-full flex items-center gap-3 py-3.5 text-left active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500"
                aria-label={`${b.paymentName} ${b.amount.toLocaleString()}원 ${MESSAGES.payment2.pendingPayCta}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-card-body font-semibold text-it-ink-800 dark:text-white truncate">
                    {b.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="inline-flex shrink-0 items-center rounded-w-pill bg-it-fill dark:bg-rink-700 px-2 py-0.5 text-card-meta font-semibold text-it-ink-600 dark:text-rink-100">
                      {b.kind === 'TOURNAMENT'
                        ? MESSAGES.payment2.sourceTournament
                        : MESSAGES.payment2.sourceClass}
                    </span>
                    {b.childName && (
                      <span className="text-card-meta text-it-ink-500 dark:text-rink-300 truncate">
                        {b.childName}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-card-meta text-it-ink-500 dark:text-rink-300 truncate">
                    {b.paymentName}
                  </p>
                </div>
                <span className="shrink-0 text-card-body font-extrabold text-it-ink-800 dark:text-white tabular-nums">
                  {`${b.amount.toLocaleString()}원`}
                </span>
                <Icon
                  name="chevron_right"
                  className="shrink-0 text-[20px] text-it-ink-400 dark:text-rink-300"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
