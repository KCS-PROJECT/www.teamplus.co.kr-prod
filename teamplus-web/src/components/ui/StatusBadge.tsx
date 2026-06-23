import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { STATUS_BADGE_CLASS, type StatusVariant } from '@/lib/status-colors';

export interface StatusBadgeProps {
  /** 의미 변형 — success/error/warning/info/neutral/primary */
  variant?: StatusVariant;
  /** Material Symbols 아이콘 이름 (선택) */
  icon?: string;
  /** 라벨 텍스트 */
  children: React.ReactNode;
  className?: string;
  /** ARIA 라벨(아이콘 전용 사용 시) */
  'aria-label'?: string;
}

/**
 * StatusBadge — 의미 색상 배지(pill) 공용 컴포넌트.
 *
 * `lib/status-colors.ts` 의 SoT 매핑을 사용하므로 모든 화면에서 동일한 색·다크 변형을 얻는다.
 * 출석/결제/승인/알림 등 상태 라벨에 일관 사용한다.
 */
export function StatusBadge({
  variant = 'neutral',
  icon,
  children,
  className,
  'aria-label': ariaLabel,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
        STATUS_BADGE_CLASS[variant],
        className,
      )}
      aria-label={ariaLabel}
    >
      {icon && <Icon name={icon} className="text-[14px]" aria-hidden="true" />}
      {children}
    </span>
  );
}
