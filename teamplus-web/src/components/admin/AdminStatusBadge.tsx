'use client';

type BadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'live';

interface StatusConfig {
  bg: string;
  text: string;
  border?: string;
  dot?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, StatusConfig> = {
  success: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
    dot: 'bg-green-600',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  error: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    text: 'text-ice-500 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
  },
  neutral: {
    bg: 'bg-wline-2 dark:bg-rink-700',
    text: 'text-wtext-2 dark:text-rink-100',
    border: 'border-wline dark:border-rink-700',
    dot: 'bg-wtext-4',
  },
  live: {
    bg: 'bg-red-50 dark:bg-red-900/30',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-100 dark:border-red-800',
    dot: 'bg-red-500',
  },
};

interface AdminStatusBadgeProps {
  /** 배지에 표시할 텍스트 */
  label: string;
  /** 배지 색상 변형 */
  variant: BadgeVariant;
  /** 배지 크기 (기본: sm) */
  size?: 'xs' | 'sm';
  /** dot 표시 여부 */
  showDot?: boolean;
  /** 테두리 표시 여부 */
  showBorder?: boolean;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * Admin 상태 배지 컴포넌트
 *
 * match-manage, tournament-manage, settlements, popups, members 등
 * 관리 페이지에서 상태를 시각적으로 표시하는 배지.
 *
 * @example
 * // 기본 사용
 * <AdminStatusBadge label="모집 중" variant="success" />
 *
 * // dot 포함
 * <AdminStatusBadge label="정산 완료" variant="success" showDot />
 *
 * // 테두리 포함
 * <AdminStatusBadge label="LIVE" variant="live" showBorder />
 */
export function AdminStatusBadge({
  label,
  variant,
  size = 'sm',
  showDot = false,
  showBorder = false,
  className = '',
}: AdminStatusBadgeProps) {
  const style = VARIANT_STYLES[variant];

  const sizeClasses = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${style.bg} ${style.text} ${
        showBorder ? `border ${style.border}` : ''
      } ${sizeClasses} ${className}`}
    >
      {showDot && style.dot && (
        <span className={`size-2 rounded-full ${style.dot}`} />
      )}
      {label}
    </span>
  );
}

/**
 * 상태값을 variant 로 매핑하는 헬퍼 함수.
 * 각 페이지에서 자체 status -> variant 매핑에 활용 가능.
 */
export type { BadgeVariant };
