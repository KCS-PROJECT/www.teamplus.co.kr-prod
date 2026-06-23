'use client';

/**
 * PageHeader - TEAMPLUS 표준 페이지 헤더 컴포넌트
 *
 * === Design 7 Principles ===
 * 1. 화면 분석: 업무관리 전체 화면의 헤더 일관성
 * 2. 휴먼 디자인: 제목 + 설명 + 액션 버튼
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 색상: Ice Blue (#1E40AF) 통일
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LucideIcon, Plus } from 'lucide-react';

// ============================================
// 타입 정의
// ============================================

interface PageHeaderAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'outline';
}

interface PageHeaderProps {
  /** 페이지 제목 */
  title: string;
  /** 페이지 설명 (subtitle 호환) */
  description?: string;
  /** 페이지 설명 (하위 호환성) */
  subtitle?: string;
  /** 추가 액션 버튼 */
  action?: PageHeaderAction;
  /** 여러 액션 버튼 */
  actions?: PageHeaderAction[];
  /** 배지 (예: 전체 12개) */
  badge?: string | number;
  /** 하위 컴포넌트 (탭 등) */
  children?: ReactNode;
  /** 추가 클래스 */
  className?: string;
}

// ============================================
// 버튼 스타일
// ============================================

const buttonVariants = {
  primary: 'bg-primary hover:bg-primary-dark text-white shadow-sm hover:shadow-md',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900',
  outline: 'border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-primary dark:hover:border-primary-light hover:text-primary dark:hover:text-primary-light hover:bg-primary/5 dark:hover:bg-primary/20',
};

// ============================================
// 메인 페이지 헤더 컴포넌트
// ============================================

export function PageHeader({
  title,
  description,
  subtitle,
  action,
  actions,
  badge,
  children,
  className,
}: PageHeaderProps) {
  const allActions = actions || (action ? [action] : []);
  const displayDescription = description || subtitle;

  // 액션 버튼이 없고 children만 있는 경우 (하위 호환성)
  const hasActionButtons = allActions.length > 0;

  return (
    <div className={cn('mb-8', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            {badge !== undefined && (
              <span className="px-3 py-1 text-sm font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full">
                {typeof badge === 'number' ? `${badge}개` : badge}
              </span>
            )}
          </div>
          {displayDescription && (
            <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
              {displayDescription}
            </p>
          )}
        </div>

        {hasActionButtons ? (
          <div className="flex gap-2">
            {allActions.map((btn, index) => {
              const Icon = btn.icon || Plus;
              const variant = btn.variant || 'primary';
              return (
                <Button
                  key={index}
                  onClick={btn.onClick}
                  className={cn(
                    'gap-2.5 h-12 px-6 text-base font-bold transition-all duration-150 active:scale-[0.98]',
                    buttonVariants[variant]
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {btn.label}
                </Button>
              );
            })}
          </div>
        ) : children ? (
          <div className="flex items-center gap-2">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

// ============================================
// 섹션 헤더 (카드 내부 등에서 사용)
// ============================================

interface SectionHeaderProps {
  /** 섹션 제목 */
  title: string;
  /** 섹션 설명 */
  description?: string;
  /** 아이콘 */
  icon?: LucideIcon;
  /** 아이콘 배경 색상 */
  iconBgColor?: string;
  /** 아이콘 텍스트 색상 */
  iconColor?: string;
  /** 액션 버튼 */
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  /** 추가 클래스 */
  className?: string;
}

export function SectionHeader({
  title,
  description,
  icon: Icon,
  iconBgColor = 'bg-primary/10',
  iconColor = 'text-primary dark:text-primary-light',
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-6', className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', iconBgColor)}>
            <Icon className={cn('w-5 h-5', iconColor)} />
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
          )}
        </div>
      </div>

      {action && (
        <Button
          variant="outline"
          onClick={action.onClick}
          className="gap-2 h-10 text-sm font-semibold dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {action.icon && <action.icon className="w-4 h-4" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}

// ============================================
// 통계 카드 그리드
// ============================================

interface StatCard {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconBgColor?: string;
  iconColor?: string;
  change?: {
    value: number;
    isPositive: boolean;
  };
}

interface StatsGridProps {
  stats: StatCard[];
  columns?: 2 | 3 | 4;
  className?: string;
}

const defaultIconBgColors = [
  'bg-blue-100 dark:bg-blue-900/30',
  'bg-emerald-100 dark:bg-emerald-900/30',
  'bg-amber-100 dark:bg-amber-900/30',
  'bg-purple-100 dark:bg-purple-900/30',
  'bg-cyan-100 dark:bg-cyan-900/30',
  'bg-rose-100 dark:bg-rose-900/30',
];

const defaultIconColors = [
  'text-primary dark:text-primary-light',
  'text-emerald-700 dark:text-emerald-400',
  'text-amber-700 dark:text-amber-400',
  'text-purple-700 dark:text-purple-400',
  'text-cyan-700 dark:text-cyan-400',
  'text-rose-700 dark:text-rose-400',
];

export function StatsGrid({ stats, columns = 4, className }: StatsGridProps) {
  const gridCols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-4',
  };

  return (
    <div className={cn('grid grid-cols-1 gap-4', gridCols[columns], className)}>
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        const bgColor = stat.iconBgColor || defaultIconBgColors[index % defaultIconBgColors.length];
        const color = stat.iconColor || defaultIconColors[index % defaultIconColors.length];

        return (
          <div
            key={index}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6"
          >
            <div className="flex items-center gap-3">
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', bgColor)}>
                <Icon className={cn('w-5 h-5', color)} />
              </div>
              <div>
                <p className="text-3xl font-black tabular-nums text-slate-900 dark:text-white leading-none">
                  {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                </p>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2">{stat.label}</p>
              </div>
              {stat.change && (
                <div className={cn(
                  'ml-auto text-xs font-bold px-2.5 py-1 rounded-full',
                  stat.change.isPositive
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                )}>
                  {stat.change.isPositive ? '+' : ''}{stat.change.value}%
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PageHeader;
