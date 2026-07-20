'use client';

/**
 * InlineRetryError — 패널 인라인 로드 실패(에러 + 재시도) 공유 컴포넌트.
 *
 * 팀 허브(director-payments)와 오픈클래스(academy) 정산 탭이 재사용한다.
 * 금융 화면 원칙: 실패를 "0/빈 결과"로 위장하지 않고 명시적 에러 + 재시도 UI 로 표기한다.
 * (월 새로고침 실패의 stale 카드 렌더 금지, 초기/미수금 로드 실패 위장 금지 등에 공용.)
 *
 * ⚠️ director-payments 인라인 정의에서 기계적으로 추출 — 동작·스타일 100% 동일.
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

export function InlineRetryError({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center" role="alert">
      <div className="flex h-11 w-11 items-center justify-center rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15">
        <Icon name="error" className="text-xl text-it-red-500" aria-hidden="true" />
      </div>
      <p className="text-[13.5px] text-it-ink-700 dark:text-wtext-4">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex h-10 items-center justify-center rounded-w-md border-[1.5px] border-it-line-strong px-5 text-[13.5px] font-semibold text-it-blue-600 transition-colors hover:bg-it-fill active:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-rink-700 dark:text-wtext-4 dark:hover:bg-rink-700"
      >
        {MESSAGES.settlement.retry}
      </button>
    </div>
  );
}
