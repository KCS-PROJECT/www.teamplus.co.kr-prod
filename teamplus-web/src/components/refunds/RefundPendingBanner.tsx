'use client';

/**
 * RefundPendingBanner — 환불 대기 조건부 배너(정산센터/아카데미 정산 상단)
 *
 * GET /refund-requests/pending-count 로 활성(pending) 건수를 조회해 > 0 일 때만
 * "환불 요청 N건 대기 중" 배너를 노출하고 목록으로 링크한다. 0건/실패 시 미노출.
 * 호스트(director-payments / AcademySettlementTab)는 이 컴포넌트 삽입만으로 최소 침습.
 */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { useNavigation } from '@/hooks/useNavigation';
import { getRefundPendingCount, type RefundScope } from '@/services/payment';
import { resolveBannerCount } from './refund-guards';

interface RefundPendingBannerProps {
  scope: RefundScope;
  /** academy scope 필수 — academyId. */
  scopeId?: string;
  /** 외곽 wrapper 여백 — 호스트별 레이아웃(예: "px-5 pt-3"). null 렌더 시 여백도 함께 사라진다. */
  className?: string;
}

export function RefundPendingBanner({
  scope,
  scopeId,
  className,
}: RefundPendingBannerProps) {
  const { navigate } = useNavigation();
  // 상태를 scopeKey 에 귀속 — render 시 현재 scopeKey 와 일치할 때만 count 를 표시(불일치=0 취급).
  //   scope/scopeId 전환의 render~passive-effect 구간에서도 이전 scope 의 count 가 새 scope 링크와
  //   결합되지 않도록 하는 render-time fail-closed. effect 초기화만으로는 이 구간을 막을 수 없다.
  const scopeKey = `${scope}:${scopeId ?? ''}`;
  const [state, setState] = useState<{ scopeKey: string; count: number }>({ scopeKey, count: 0 });

  useEffect(() => {
    let cancelled = false;
    setState({ scopeKey, count: 0 }); // 전환 즉시 fail-closed(현재 scope 귀속)
    (async () => {
      try {
        const res = await getRefundPendingCount({ scope, scopeId });
        if (cancelled) return; // 이전 scope 로 판정된 응답 — 새 scope 를 덮지 않는다.
        // 성공+데이터면 실제 건수, 그 외(success:false/빈 응답)는 0 으로 정리(현재 scope fail-closed).
        setState({ scopeKey, count: res.success && res.data ? res.data.count : 0 });
      } catch {
        // 조회 실패(네트워크/거부 등) — 현재 scope 요청이면 0 으로 정리. docstring 계약(0건/실패 시
        //   미노출). throw/reject 를 삼켜 호스트(정산센터/아카데미) 렌더를 깨지 않는다.
        if (!cancelled) setState({ scopeKey, count: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, scopeId, scopeKey]);

  // render-time fail-closed — state 가 현재 scopeKey 에 귀속됐을 때만 count 사용(전환 직후 렌더 포함).
  const count = resolveBannerCount(state, scopeKey);
  if (count <= 0) return null;

  const href =
    scope === 'academy'
      ? `/academy/${scopeId}/refunds`
      : '/director-payments/refunds';

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void navigate(href)}
        className="flex w-full items-center gap-2.5 rounded-w-md border border-it-red-100 bg-it-red-50 px-4 py-3 text-left transition-colors hover:bg-it-red-100/60 active:brightness-95 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-red-500/40 dark:border-it-red-500/30 dark:bg-it-red-500/10 dark:hover:bg-it-red-500/15"
        aria-label={MESSAGES.refund.bannerWaiting(count)}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-w-pill bg-it-red-100 dark:bg-it-red-500/20">
          <Icon name="currency_exchange" className="text-[18px] text-it-red-600 dark:text-it-red-400" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-card-body font-bold text-it-red-700 dark:text-it-red-200">
          {MESSAGES.refund.bannerWaiting(count)}
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-card-meta font-semibold text-it-red-600 dark:text-it-red-300">
          {MESSAGES.refund.bannerAction}
          <Icon name="chevron_right" className="text-[16px]" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

export default RefundPendingBanner;
