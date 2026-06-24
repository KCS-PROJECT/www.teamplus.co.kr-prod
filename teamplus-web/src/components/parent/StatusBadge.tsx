'use client';

import { cn } from '@/lib/utils';

/**
 * StatusBadge - 상태 표시 배지
 *
 * 수업 상태, 결제 상태, 결제권 상태 등의 배지를 표시합니다.
 * 미리 정의된 variant를 사용하거나 커스텀 className을 전달할 수 있습니다.
 */

type BadgeVariant =
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'pending'
  | 'available'
  | 'used'
  | 'expired';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  active:    'bg-blue-100 text-ice-500 dark:bg-blue-900/20 dark:text-blue-400',
  completed: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  pending:   'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  available: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  used:      'bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300',
  expired:   'bg-red-100 text-red-500 dark:bg-red-900/20 dark:text-red-400',
};

const VARIANT_LABELS: Record<BadgeVariant, string> = {
  active:    '진행중',
  completed: '완료',
  cancelled: '취소됨',
  pending:   '대기중',
  available: '사용 가능',
  used:      '사용됨',
  expired:   '만료됨',
};

interface StatusBadgeProps {
  /** 미리 정의된 variant */
  variant?: BadgeVariant;
  /** 표시할 텍스트 (variant 기본 라벨 오버라이드) */
  label?: string;
  /** 커스텀 className (variant 대신 사용) */
  badgeClassName?: string;
  /** 추가 className */
  className?: string;
  /** 도트 표시 여부 */
  showDot?: boolean;
}

export function StatusBadge({
  variant = 'active',
  label,
  badgeClassName,
  className = '',
  showDot = false,
}: StatusBadgeProps) {
  const displayLabel = label ?? VARIANT_LABELS[variant];
  const variantClass = badgeClassName ?? VARIANT_CLASSES[variant];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold',
        variantClass,
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            variant === 'active' || variant === 'available'
              ? 'bg-current'
              : 'bg-current opacity-60'
          )}
        />
      )}
      {displayLabel}
    </span>
  );
}

export { VARIANT_CLASSES as STATUS_BADGE_CLASSES };
export type { BadgeVariant };
