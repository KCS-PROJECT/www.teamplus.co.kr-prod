'use client';

import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import { HTMLAttributes, forwardRef } from 'react';

/**
 * Card Component - TEAMPLUS Design System
 * Design 7 Principles Applied:
 * - No gradients, solid colors only
 * - Clean shadow-card pattern
 * - Consistent border styling
 */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'elevated' | 'surface';
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = 'default',
      hover = false,
      padding = 'md',
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'rounded-xl transition-all duration-200';

    const variants = {
      default: cn(
        'bg-white dark:bg-rink-800',
        'border border-wline-2 dark:border-rink-700',
        'shadow-card'
      ),
      outlined: cn(
        'bg-transparent',
        'border border-wline dark:border-rink-700'
      ),
      elevated: cn(
        'bg-white dark:bg-rink-800',
        'shadow-md'
      ),
      surface: cn(
        'bg-white dark:bg-rink-800',
        'border border-wline-2 dark:border-rink-700'
      ),
    };

    const paddings = {
      none: '',
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-6',
    };

    const hoverStyles = hover
      ? 'hover:border-ice-500/20 hover:shadow-card-hover cursor-pointer active:brightness-95'
      : '';

    return (
      <div
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          paddings[padding],
          hoverStyles,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

/**
 * CreditCard Component - TEAMPLUS Design System
 * Displays user's credit balance with progress bar
 */
interface CreditCardProps {
  current: number;
  total: number;
  expiryDate: string;
  lastUsed?: string;
}

export function CreditCard({ current, total, expiryDate, lastUsed }: CreditCardProps) {
  const percentage = Math.min((current / total) * 100, 100);
  const isActive = current > 0;

  return (
    <Card variant="surface" padding="md" className="shadow-card">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-wtext-3 dark:text-rink-300 text-sm font-medium">
            자녀 보유 크레딧
          </p>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-4xl font-bold text-wtext-1 dark:text-white">
              {current}
            </span>
            <span className="text-lg text-wtext-3 dark:text-rink-300 font-medium">
              / {total}회
            </span>
          </div>
        </div>
        <span className={cn(
          'px-2 py-1 text-xs font-bold rounded',
          isActive
            ? 'bg-success/10 text-success'
            : 'bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300'
        )}>
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-wline-2 dark:bg-rink-700 h-2 rounded-full overflow-hidden">
        <div
          className="bg-ice-500 h-full rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-4 text-xs">
        <span className="text-wtext-3 dark:text-rink-300">
          {lastUsed ? `최근 사용: ${lastUsed}` : '사용 내역 없음'}
        </span>
        <span className="text-ice-500 font-medium">
          만료: {expiryDate}
        </span>
      </div>
    </Card>
  );
}

/**
 * StatCard Component - TEAMPLUS Design System
 * For displaying statistics with icon and optional trend
 */
interface StatCardProps {
  icon: React.ReactNode;
  iconBgColor?: string;
  label: string;
  value: string | number;
  unit?: string;
  change?: {
    value: string;
    positive: boolean;
  };
  alert?: boolean;
}

export function StatCard({
  icon,
  iconBgColor = 'bg-ice-500/10 text-ice-500',
  label,
  value,
  unit,
  change,
  alert
}: StatCardProps) {
  return (
    <Card variant="default" padding="md" className="relative overflow-hidden">
      {alert && (
        <div className="absolute right-0 top-0 h-full w-1 bg-ice-500" />
      )}
      <div className="flex items-start justify-between">
        <div className={cn('rounded-lg p-2', iconBgColor)}>
          {icon}
        </div>
        {change && (
          <span className={cn(
            'flex items-center text-xs font-semibold px-2 py-1 rounded-full',
            change.positive
              ? 'text-success bg-success/10'
              : 'text-error bg-error/10'
          )}>
            {change.value}
          </span>
        )}
        {alert && (
          <span className="flex items-center text-xs font-semibold text-ice-500 bg-error/10 px-2 py-1 rounded-full">
            확인 필요
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-wtext-3 dark:text-rink-300">
          {label}
        </p>
        <p className="text-2xl font-bold tracking-tight text-wtext-1 dark:text-white mt-1">
          {value}
          {unit && (
            <span className="text-base font-semibold text-wtext-3 dark:text-rink-300 ml-0.5">
              {unit}
            </span>
          )}
        </p>
      </div>
    </Card>
  );
}

/**
 * NextClassCard Component - TEAMPLUS Design System
 * For displaying upcoming class information
 */
interface NextClassCardProps {
  date: string;
  time: string;
  className: string;
  location: string;
  imageUrl?: string;
  onDetailClick?: () => void;
  onPrepareClick?: () => void;
}

export function NextClassCard({
  date,
  time,
  className: classTitle,
  location,
  imageUrl,
  onDetailClick,
  onPrepareClick,
}: NextClassCardProps) {
  return (
    <Card variant="default" padding="none" hover className="overflow-hidden">
      <div className="flex">
        {/* Image */}
        <div className="w-28 h-28 bg-wline dark:bg-rink-700 shrink-0">
          {resolveImageSrc(imageUrl) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              alt={classTitle}
              className="w-full h-full object-cover"
              src={resolveImageSrc(imageUrl)}
              width={112}
              height={112}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-wtext-3 text-4xl">🏒</span>
            </div>
          )}
        </div>
        {/* Content */}
        <div className="flex-1 p-4 flex flex-col justify-center">
          <span className="text-ice-500 font-bold text-sm mb-1">
            {date}, {time}
          </span>
          <h3 className="text-base font-bold text-wtext-1 dark:text-white mb-2">
            {classTitle}
          </h3>
          <div className="flex items-center gap-1 text-wtext-3 dark:text-rink-300 text-sm">
            <span className="material-symbols-outlined text-[16px]">location_on</span>
            <span>{location}</span>
          </div>
        </div>
      </div>
      {/* Action Buttons */}
      {(onDetailClick || onPrepareClick) && (
        <div className="flex gap-2 p-4 pt-0">
          {onDetailClick && (
            <button
              onClick={onDetailClick}
              className="flex-1 bg-wline-2 hover:bg-wline dark:bg-rink-700 dark:hover:bg-rink-500 text-wtext-1 dark:text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              상세 정보
            </button>
          )}
          {onPrepareClick && (
            <button
              onClick={onPrepareClick}
              className="flex-1 bg-ice-500 hover:bg-ice-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              준비물 확인
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * ListCard Component - TEAMPLUS Design System
 * Container for list items with dividers
 */
interface ListCardProps {
  children: React.ReactNode;
  className?: string;
}

export function ListCard({ children, className }: ListCardProps) {
  return (
    <Card variant="default" padding="none" className={className}>
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {children}
      </div>
    </Card>
  );
}

/**
 * ListItem Component - TEAMPLUS Design System
 * Individual list item with icon, title, subtitle, and trailing element
 */
interface ListItemProps {
  icon?: React.ReactNode;
  iconBgColor?: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  onClick?: () => void;
}

export function ListItem({
  icon,
  iconBgColor = 'bg-wline-2 dark:bg-rink-700',
  title,
  subtitle,
  trailing,
  showChevron = false,
  onClick
}: ListItemProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-3 px-4',
        onClick && 'cursor-pointer hover:bg-wbg dark:hover:bg-rink-800 active:bg-wline-2 dark:active:bg-rink-700 transition-colors'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        {icon && (
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            iconBgColor
          )}>
            {icon}
          </div>
        )}
        <div className="flex flex-col">
          <p className="text-[15px] font-semibold text-wtext-1 dark:text-white">
            {title}
          </p>
          {subtitle && (
            <p className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {trailing}
        {showChevron && (
          <span className="material-symbols-outlined text-wtext-4 dark:text-rink-500 text-[20px]">
            chevron_right
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * EventCard Component - TEAMPLUS Design System
 * For displaying upcoming events with date badge
 */
interface EventCardProps {
  month: string;
  day: string;
  title: string;
  location: string;
  dDay?: number;
  isPrimary?: boolean;
  onClick?: () => void;
}

export function EventCard({
  month,
  day,
  title,
  location,
  dDay,
  isPrimary = false,
  onClick,
}: EventCardProps) {
  return (
    <Card
      variant="default"
      padding="sm"
      hover={!!onClick}
      onClick={onClick}
      className="flex items-center gap-4"
    >
      <div className="flex flex-col items-center justify-center min-w-[56px] bg-wbg dark:bg-rink-700 rounded-xl py-2.5 border border-wline-2 dark:border-rink-700">
        <span className={cn(
          'text-[10px] font-extrabold uppercase',
          isPrimary ? 'text-ice-500' : 'text-wtext-3 dark:text-rink-300'
        )}>
          {month}
        </span>
        <span className="text-xl font-extrabold text-wtext-1 dark:text-white mt-0.5">
          {day}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-bold text-wtext-1 dark:text-white truncate text-[15px]">
            {title}
          </h4>
          {dDay !== undefined && (
            <span className={cn(
              'text-[10px] font-black px-1.5 py-0.5 rounded border',
              isPrimary
                ? 'bg-error/10 text-error border-error/20'
                : 'bg-wline-2 text-wtext-3 border-wline dark:bg-rink-700 dark:text-rink-300 dark:border-rink-700'
            )}>
              D-{dDay}
            </span>
          )}
        </div>
        <p className="text-[13px] text-wtext-3 dark:text-rink-300 flex items-center gap-1 font-medium">
          <span className="material-symbols-outlined text-[16px]">location_on</span>
          {location}
        </p>
      </div>
    </Card>
  );
}

/**
 * ProfileCard Component - TEAMPLUS Design System
 * For displaying user profile information
 */
interface ProfileCardProps {
  name: string;
  role: string;
  avatarUrl?: string;
  showBadge?: boolean;
}

export function ProfileCard({ name, role, avatarUrl, showBadge = true }: ProfileCardProps) {
  const roleLabels: Record<string, string> = {
    parent: '학부모',
    coach: '코치',
    admin: '관리자',
    child: '선수',
  };

  const roleBgColors: Record<string, string> = {
    parent: 'bg-ice-500/10 text-ice-500',
    coach: 'bg-success/10 text-success',
    admin: 'bg-warning/10 text-warning',
    child: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return (
    <div className="flex items-center gap-4">
      <div className="size-16 rounded-full overflow-hidden bg-wline-2 dark:bg-rink-700 ring-2 ring-wline dark:ring-rink-700 shrink-0">
        {resolveImageSrc(avatarUrl) ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            alt={name}
            className="size-full object-cover"
            src={resolveImageSrc(avatarUrl)}
            width={64}
            height={64}
          />
        ) : (
          <div className="size-full flex items-center justify-center">
            <span className="material-symbols-outlined text-wtext-3 text-2xl">person</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[18px] font-bold text-wtext-1 dark:text-white">
          {name}님, 환영합니다
        </span>
        {showBadge && (
          <span className={cn(
            'inline-flex w-fit items-center px-2.5 py-0.5 text-[11px] font-bold rounded',
            roleBgColors[role] || 'bg-wline-2 text-wtext-2'
          )}>
            {roleLabels[role] || role}
          </span>
        )}
      </div>
    </div>
  );
}
