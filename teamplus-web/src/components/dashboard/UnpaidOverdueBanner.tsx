'use client';

/**
 * UnpaidOverdueBanner — 감독·코치 홈 미수금 배너.
 *  - 팀 정산 센터의 연체 미납 건수(확정 청구 후 유예 기간 경과·미결제)를 "미수금 N건" 배너로 노출.
 *    팀 홈 "처리 필요"·정산 센터 히어로 칩·미납 관리 페이지와 같은 정의라 숫자가 일치한다.
 *  - 탭하면 /director-payments/unpaid 로 이동. 0건·실패·권한 없음이면 숨김(fail-closed).
 *  - 승인 대기 배너(DirectorPendingApprovals)와 같은 attention 행 규격.
 */

import { useEffect, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { getTeamUnpaidTotal } from '@/services/payment';

interface Props {
  /** ICETIMES flat 테마 — full-bleed 흰 섹션 안의 attention 행. 기본 false = rounded 배너. */
  iceTheme?: boolean;
}

export function UnpaidOverdueBanner({ iceTheme = false }: Props) {
  const { navigate } = useNavigation();
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // teamId 미지정 → 백엔드가 요청자의 관리 팀 범위로 해석
        const res = await getTeamUnpaidTotal();
        if (!cancelled) setCount(res.success && res.data ? res.data.count : 0);
      } catch {
        if (!cancelled) setCount(0);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading || count === 0) return null;

  const label = MESSAGES.dashboard.unpaidOverdueBanner(count);
  const go = () => navigate('/director-payments/unpaid');

  if (iceTheme) {
    return (
      <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
        <button
          type="button"
          onClick={go}
          className="w-full flex items-center gap-2.5 px-4 sm:px-5 py-3.5 text-left bg-it-red-500/[0.07] dark:bg-it-red-500/[0.12] hover:bg-it-red-500/[0.12] transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-red-500"
          aria-label={`${label} — ${MESSAGES.dashboard.viewAll}`}
        >
          <Icon name="receipt_long" className="text-[20px] shrink-0 text-it-red-500" aria-hidden="true" />
          <span className="flex-1 min-w-0 text-card-body font-semibold text-wtext-1 dark:text-white">
            {label}
          </span>
          <Icon name="chevron_right" className="text-[20px] shrink-0 text-it-red-500" aria-hidden="true" />
        </button>
      </section>
    );
  }

  return (
    <div className="px-4 sm:px-5 pt-3">
      <button
        type="button"
        onClick={go}
        className={cn(
          'w-full flex items-center gap-2.5 rounded-w-xl border px-4 py-3.5 text-left transition-colors duration-150 motion-reduce:transition-none focus:outline-none focus-visible:ring-2',
          'bg-flame-500/10 dark:bg-flame-500/15 border-flame-500/20 dark:border-flame-500/25 hover:bg-flame-500/[0.14] focus-visible:ring-flame-500',
        )}
        aria-label={`${label} — ${MESSAGES.dashboard.viewAll}`}
      >
        <Icon name="receipt_long" className="text-[20px] shrink-0 text-flame-500" aria-hidden="true" />
        <span className="flex-1 min-w-0 text-card-body font-semibold text-wtext-1 dark:text-white">
          {label}
        </span>
        <Icon name="chevron_right" className="text-[20px] shrink-0 text-flame-500" aria-hidden="true" />
      </button>
    </div>
  );
}

export default UnpaidOverdueBanner;
