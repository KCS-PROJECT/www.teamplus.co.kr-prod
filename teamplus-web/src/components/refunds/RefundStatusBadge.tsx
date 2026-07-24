'use client';

/**
 * RefundStatusBadge — 환불 요청 상태 배지(도메인 6종)
 *
 * 색만으로 구분하지 않는다 — 색 + 아이콘 + 텍스트 3중 표기(접근성).
 * ICETIMES flat it-* 토큰만 사용(gradient/blur/컬러그림자 금지).
 */

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type { RefundDisplayStatus } from '@/services/payment';

interface StatusMeta {
  label: string;
  icon: string;
  className: string;
}

const STATUS_META: Record<RefundDisplayStatus, StatusMeta> = {
  pending: {
    label: MESSAGES.refund.status.pending,
    icon: 'schedule',
    className: 'bg-sun-100 text-it-ink-800 dark:bg-sun-500/15 dark:text-sun-500',
  },
  executing: {
    label: MESSAGES.refund.status.executing,
    icon: 'sync',
    className:
      'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-900/30 dark:text-it-blue-300',
  },
  executed: {
    label: MESSAGES.refund.status.executed,
    icon: 'check_circle',
    className:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  },
  execution_failed: {
    label: MESSAGES.refund.status.executionFailed,
    icon: 'error',
    className:
      'bg-it-red-50 text-it-red-600 dark:bg-it-red-500/15 dark:text-it-red-400',
  },
  rejected: {
    label: MESSAGES.refund.status.rejected,
    icon: 'block',
    className:
      'bg-it-line text-it-ink-600 dark:bg-it-blue-900/40 dark:text-it-ink-200',
  },
  canceled: {
    label: MESSAGES.refund.status.canceled,
    icon: 'undo',
    className:
      'bg-it-line text-it-ink-600 dark:bg-it-blue-900/40 dark:text-it-ink-200',
  },
  // 미지 상태(fail-closed) — 중립 배지. 조작 가능한 상태로 오인되지 않게 표기.
  unknown: {
    label: MESSAGES.refund.status.unknown,
    icon: 'help',
    className:
      'bg-it-line text-it-ink-500 dark:bg-rink-700 dark:text-wtext-3',
  },
};

interface RefundStatusBadgeProps {
  status: RefundDisplayStatus;
  className?: string;
}

export function RefundStatusBadge({ status, className }: RefundStatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-w-pill px-2.5 py-1 text-[12px] font-bold',
        meta.className,
        className,
      )}
    >
      <Icon name={meta.icon} className="text-[13px]" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export default RefundStatusBadge;
