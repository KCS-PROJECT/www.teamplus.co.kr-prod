'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

/** 빈 상태 — 체크 아이콘 + 안내 (기존 톤 재사용). */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-12" role="status">
      <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-mint-100 dark:bg-mint-500/15">
        <Icon name="check_circle" className="text-2xl text-mint-500" aria-hidden="true" />
      </div>
      <p className="text-card-body text-it-ink-700 dark:text-wtext-4">{message}</p>
    </div>
  );
}

/** 훈련/대회 소계 섹션 헤더. */
export function SectionTitle({ label }: { label: string }) {
  return (
    <h3 className="pb-1 pt-4 text-[12.5px] font-extrabold text-it-ink-400 dark:text-wtext-3">
      {label}
    </h3>
  );
}

/** 최초 로드 실패 — 풀 화면 명시적 에러 + 재시도(0원 Hero 렌더 금지). */
export function InitialErrorState({
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
export function MonthLoadingState() {
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
