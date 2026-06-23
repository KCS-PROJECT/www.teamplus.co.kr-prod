'use client';

import { cn } from '@/lib/utils';

interface NotificationBadgeProps {
  /** Show or hide the badge */
  show?: boolean;
  /** Display count instead of just a dot (max 99) */
  count?: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Position of the badge */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  /** Animate the badge with pulse effect */
  animate?: boolean;
  /** Custom className for additional styling */
  className?: string;
}

/**
 * Unified notification badge component for consistent styling across all user dashboards.
 *
 * Usage:
 * - Dot badge: <NotificationBadge show />
 * - Count badge: <NotificationBadge show count={5} />
 * - Animated: <NotificationBadge show animate />
 */
export function NotificationBadge({
  show = true,
  count,
  size = 'md',
  position = 'top-right',
  animate = false,
  className,
}: NotificationBadgeProps) {
  if (!show) return null;

  // Size classes
  const sizeClasses = {
    sm: count !== undefined ? 'min-w-4 h-4 text-[9px] px-1' : 'w-1.5 h-1.5',
    md: count !== undefined ? 'min-w-5 h-5 text-[10px] px-1.5' : 'w-2 h-2',
    lg: count !== undefined ? 'min-w-6 h-6 text-xs px-2' : 'w-2.5 h-2.5',
  };

  // Position classes
  const positionClasses = {
    'top-right': '-top-0.5 -right-0.5',
    'top-left': '-top-0.5 -left-0.5',
    'bottom-right': '-bottom-0.5 -right-0.5',
    'bottom-left': '-bottom-0.5 -left-0.5',
  };

  // Format count (max 99+)
  const displayCount = count !== undefined ? (count > 99 ? '99+' : count.toString()) : undefined;

  return (
    <span
      className={cn(
        'absolute rounded-full bg-red-500 border-2 border-white dark:border-rink-900',
        sizeClasses[size],
        positionClasses[position],
        count !== undefined && 'flex items-center justify-center font-bold text-white',
        animate && 'animate-pulse',
        className
      )}
      aria-label={count !== undefined ? `${count}개의 알림` : '새 알림 있음'}
    >
      {displayCount}
    </span>
  );
}

/**
 * Wrapper component to position notification badge relative to its children
 */
interface NotificationBadgeWrapperProps {
  children: React.ReactNode;
  show?: boolean;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  animate?: boolean;
  className?: string;
}

export function NotificationBadgeWrapper({
  children,
  show,
  count,
  size,
  position,
  animate,
  className,
}: NotificationBadgeWrapperProps) {
  return (
    <div className={cn('relative inline-flex', className)}>
      {children}
      <NotificationBadge
        show={show}
        count={count}
        size={size}
        position={position}
        animate={animate}
      />
    </div>
  );
}

export default NotificationBadge;
