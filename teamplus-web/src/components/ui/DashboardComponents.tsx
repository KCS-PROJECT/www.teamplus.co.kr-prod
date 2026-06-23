'use client';

import React, { memo } from 'react';
import Image from 'next/image';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';
import { cn } from '@/lib/utils';

/**
 * Dashboard Components - TEAMPLUS Design System
 *
 * Design 7 Principles Applied:
 * 1. No gradients, solid colors only
 * 2. Consistent shadow patterns (shadow-card, shadow-card-hover)
 * 3. Unified spacing system (8px base)
 * 4. Human-centric design
 * 5. Reusable across all role dashboards
 */

// ============================================
// DashboardStatCard - 통합 통계 카드
// ============================================
export interface DashboardStatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  icon: string;
  iconBg?: string;
  iconColor?: string;
  trend?: { value: string; isPositive: boolean };
  alert?: boolean;
  isPrimary?: boolean;
  href?: string;
  className?: string;
}

export const DashboardStatCard = memo(function DashboardStatCard({
  title,
  value,
  unit,
  subtitle,
  icon,
  iconBg = 'bg-wline-2 dark:bg-rink-700',
  iconColor = 'text-wtext-3',
  trend,
  alert = false,
  isPrimary = false,
  href,
  className,
}: DashboardStatCardProps) {
  const content = (
    <div
      className={cn(
        'flex flex-col justify-between rounded-2xl p-5 min-h-[140px]',
        'transition-all duration-200 ease-out',
        'active:brightness-95 transform-gpu will-change-transform',
        isPrimary
          ? 'bg-ice-500 text-white shadow-card hover:shadow-card-hover'
          : 'bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-card hover:shadow-card-hover',
        alert && 'relative overflow-hidden',
        className
      )}
    >
      {/* Alert indicator */}
      {alert && (
        <div className="absolute right-0 top-0 h-full w-1 bg-error" />
      )}

      {/* Header: Icon & Trend/Alert Badge */}
      <div className="flex items-start justify-between">
        <div className={cn('rounded-lg p-2', isPrimary ? 'bg-white/20' : iconBg)}>
          <Icon
            name={icon}
            className={cn('text-xl', isPrimary ? 'text-white opacity-80' : iconColor)}
          />
        </div>

        {trend && (
          <span
            className={cn(
              'flex items-center text-xs font-semibold px-2 py-1 rounded-full',
              trend.isPositive
                ? 'text-success bg-success/10'
                : 'text-error bg-error/10'
            )}
          >
            <Icon
              name={trend.isPositive ? 'trending_up' : 'trending_down'}
              className="text-sm mr-0.5"
            />
            {trend.value}
          </span>
        )}

        {alert && !trend && (
          <span className="flex items-center text-xs font-semibold text-error bg-error/10 px-2 py-1 rounded-full">
            확인 필요
          </span>
        )}
      </div>

      {/* Content: Label & Value */}
      <div className="mt-4">
        <p className={cn(
          'text-sm font-medium',
          isPrimary ? 'opacity-90' : 'text-wtext-3 dark:text-rink-300'
        )}>
          {title}
        </p>
        <div className="flex items-baseline gap-1 mt-1">
          <span className={cn(
            'text-2xl font-bold tracking-tight',
            !isPrimary && 'text-wtext-1 dark:text-white'
          )}>
            <CountUp end={value} duration={1500} />
          </span>
          {unit && (
            <span className={cn(
              'text-base font-semibold',
              isPrimary ? 'opacity-80' : 'text-wtext-3 dark:text-rink-300'
            )}>
              {unit}
            </span>
          )}
        </div>
        {subtitle && (
          <p className={cn(
            'mt-1 text-xs',
            isPrimary ? 'opacity-80' : 'text-wtext-3 dark:text-rink-300'
          )}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return <NavLink href={href}>{content}</NavLink>;
  }
  return content;
});

// ============================================
// DashboardScheduleItem - 일정 타임라인 아이템
// ============================================
export interface DashboardScheduleItemProps {
  time: string;
  title: string;
  location: string;
  attendees?: number;
  status: 'completed' | 'current' | 'upcoming';
  onClick?: () => void;
}

export const DashboardScheduleItem = memo(function DashboardScheduleItem({
  time,
  title,
  location,
  attendees,
  status,
  onClick
}: DashboardScheduleItemProps) {
  const isCompleted = status === 'completed';
  const isCurrent = status === 'current';

  return (
    <div
      className={cn('group relative grid grid-cols-[44px_1fr] gap-x-3', onClick && 'cursor-pointer')}
      onClick={onClick}
    >
      {/* Timeline Dot */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full z-10 transition-colors',
            isCompleted && 'bg-wline-2 dark:bg-rink-800 border border-wline dark:border-rink-700',
            isCurrent && 'bg-ice-500 text-white shadow-md ring-4 ring-white dark:ring-rink-900',
            status === 'upcoming' && 'bg-wbg dark:bg-rink-800 border border-wline dark:border-rink-700'
          )}
        >
          {isCompleted ? (
            <Icon name="check" className="text-wtext-3 text-xl" />
          ) : isCurrent ? (
            <Icon name="sports_hockey" className="text-xl" />
          ) : (
            <span className="text-xs font-bold text-wtext-3">{time.split(':')[0]}</span>
          )}
        </div>
      </div>

      {/* Content Card */}
      <div
        className={cn(
          'flex flex-col rounded-xl p-4 transition-colors',
          isCompleted && 'bg-wbg dark:bg-white/5',
          isCurrent && 'bg-white dark:bg-rink-800 border border-ice-500/20 shadow-card relative overflow-hidden',
          status === 'upcoming' && 'bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700'
        )}
      >
        {isCurrent && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-ice-500" />
        )}

        <div className="flex justify-between items-start">
          <div className="flex-1">
            <span className={cn(
              'text-xs font-semibold',
              isCurrent ? 'text-ice-500' : 'text-wtext-3 dark:text-rink-300'
            )}>
              {time}
            </span>
            <h4 className={cn(
              'font-bold mt-1',
              isCompleted
                ? 'text-wtext-3 dark:text-rink-300 line-through'
                : 'text-wtext-1 dark:text-white'
            )}>
              {title}
            </h4>
          </div>
          {isCurrent && (
            <span className="text-[10px] font-bold text-white bg-ice-500 px-2 py-0.5 rounded">
              진행중
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className={cn(
            'text-sm flex items-center gap-1',
            isCompleted ? 'text-wtext-3' : 'text-wtext-3 dark:text-rink-300'
          )}>
            <Icon name="location_on" className="text-base" />
            {location}
          </span>
          {attendees !== undefined && (
            <span className={cn(
              'text-xs font-medium flex items-center gap-1',
              isCompleted ? 'text-wtext-3' : 'text-wtext-3'
            )}>
              <Icon name="group" className="text-base" />
              {attendees}명
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

// ============================================
// DashboardListItem - 목록 아이템 (결제 내역, 회원 등)
// ============================================
export interface DashboardListItemProps {
  avatar?: string;
  initials?: string;
  name: string;
  description: string;
  trailing?: React.ReactNode;
  trailingText?: string;
  subText?: string;
  status?: 'success' | 'pending' | 'warning' | 'error' | 'default';
  onClick?: () => void;
}

export const DashboardListItem = memo(function DashboardListItem({
  avatar,
  initials,
  name,
  description,
  trailing,
  trailingText,
  subText,
  status = 'default',
  onClick,
}: DashboardListItemProps) {
  const statusColors = {
    success: 'text-success',
    pending: 'text-warning',
    warning: 'text-warning',
    error: 'text-error',
    default: 'text-wtext-1 dark:text-white',
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between py-4 px-4',
        onClick && 'cursor-pointer hover:bg-wbg dark:hover:bg-rink-800/50 transition-colors'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar or Initials */}
        <div className="w-10 h-10 rounded-full bg-wline-2 dark:bg-rink-700 flex items-center justify-center shrink-0 overflow-hidden">
          {avatar ? (
            <Image src={avatar} alt={name} width={40} height={40} className="w-full h-full object-cover" />
          ) : initials ? (
            <span className="text-sm font-bold text-wtext-3 dark:text-rink-300">
              {initials}
            </span>
          ) : (
            <Icon name="person" className="text-wtext-3 text-xl" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-wtext-1 dark:text-white truncate">
            {name}
          </p>
          <p className="text-sm text-wtext-3 dark:text-rink-300 truncate">
            {description}
          </p>
        </div>
      </div>

      {/* Trailing */}
      <div className="flex flex-col items-end shrink-0 ml-3">
        {trailing}
        {trailingText && (
          <span className={cn('font-bold', statusColors[status])}>
            {trailingText}
          </span>
        )}
        {subText && (
          <span className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">
            {subText}
          </span>
        )}
      </div>
    </div>
  );
});

// ============================================
// DashboardSection - 섹션 컨테이너
// ============================================
export interface DashboardSectionProps {
  title: string;
  action?: { label: string; href?: string; onClick?: () => void };
  children: React.ReactNode;
  className?: string;
}

export const DashboardSection = memo(function DashboardSection({
  title,
  action,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section className={cn('mt-6 px-5', className)}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-wtext-1 dark:text-white">
          {title}
        </h2>
        {action && (
          action.href ? (
            <NavLink
              href={action.href}
              className="text-sm font-medium text-ice-500 hover:text-ice-700 transition-colors"
            >
              {action.label}
            </NavLink>
          ) : (
            <button type="button"               onClick={action.onClick}
              className="text-sm font-medium text-ice-500 hover:text-ice-700 transition-colors"
            >
              {action.label}
            </button>
          )
        )}
      </div>
      {children}
    </section>
  );
});

// DashboardHeader 는 PageAppBar 통합 (2026-05-07) 시 제거됨.
// 대시보드 헤더는 `<PageAppBar variant="main" title="..." />` 또는
// `<SubmainAppBar title="..." />` 사용. 사용자 아바타·역할 라벨 등의
// greeting 시각 요소는 페이지 hero 영역으로 이동.

// ============================================
// DashboardQuickActions - 빠른 작업 버튼
// ============================================
export interface QuickAction {
  id: string;
  icon: string;
  label: string;
  href?: string;
  onClick?: () => void;
  badge?: number;
}

export interface DashboardQuickActionsProps {
  actions: QuickAction[];
  className?: string;
}

export const DashboardQuickActions = memo(function DashboardQuickActions({
  actions,
  className,
}: DashboardQuickActionsProps) {
  return (
    <div className={cn('grid grid-cols-4 gap-3 px-5 py-4', className)}>
      {actions.map((action) => {
        const content = (
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-14 h-14 rounded-2xl bg-wbg dark:bg-rink-700 flex items-center justify-center transition-colors hover:bg-wline-2 dark:hover:bg-rink-500">
              <Icon name={action.icon} className="text-2xl text-wtext-2 dark:text-rink-100" />
              {action.badge !== undefined && action.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center">
                  {action.badge > 9 ? '9+' : action.badge}
                </span>
              )}
            </div>
            <span className="text-xs font-medium text-wtext-2 dark:text-rink-300 text-center">
              {action.label}
            </span>
          </div>
        );

        if (action.href) {
          return (
            <NavLink key={action.id} href={action.href}>
              {content}
            </NavLink>
          );
        }

        return (
          <button type="button" key={action.id} onClick={action.onClick} className="focus:outline-none">
            {content}
          </button>
        );
      })}
    </div>
  );
});
