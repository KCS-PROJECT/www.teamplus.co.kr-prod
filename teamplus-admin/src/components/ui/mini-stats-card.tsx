'use client';

/**
 * MiniStatsCard - TEAMPLUS Admin Modern Bold 공통 통계 카드
 *
 * === Design 7 Principles ===
 * 1. 화면 분석: 대시보드/통계/분류 화면의 반복 카드 패턴 통합
 * 2. 휴먼 디자인: 아이콘 + 값 + 라벨 + 선택 트렌드
 * 3. AI 스타일 금지: gradient, backdrop-blur 미사용, 솔리드 컬러만
 * 4. Modern Bold: text-3xl font-black tabular-nums, rounded-2xl, border
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

// ============================================
// 타입 정의
// ============================================

export type MiniStatsCardVariant = 'primary' | 'success' | 'warning' | 'info' | 'neutral';

export interface MiniStatsCardTrend {
  /** 변화량 (예: 12.5 → "+12.5%") */
  value: number;
  /** 라벨 (예: "전월 대비") */
  label?: string;
  /** 방향 — 미지정 시 value 부호로 자동 판정 */
  direction?: 'up' | 'down' | 'neutral';
}

export interface MiniStatsCardProps {
  /** 카드 제목 (라벨) */
  title: string;
  /** 값 — number는 자동 toLocaleString */
  value: string | number;
  /** 아이콘 (LucideIcon 인스턴스 또는 JSX) */
  icon?: ReactNode;
  /** 트렌드 정보 (선택) */
  trend?: MiniStatsCardTrend;
  /** 보조 설명 텍스트 (예: "1건당 평균", "10건 완료") */
  description?: string;
  /** 색상 변형 */
  variant?: MiniStatsCardVariant;
  /** 추가 클래스 */
  className?: string;
}

// ============================================
// Variant 스타일 매핑
// ============================================

const variantStyles: Record<MiniStatsCardVariant, { bg: string; text: string }> = {
  primary: {
    bg: 'bg-primary/10 dark:bg-primary/20',
    text: 'text-primary dark:text-primary-light',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    text: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
  },
  neutral: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-600 dark:text-gray-400',
  },
};

// ============================================
// 메인 컴포넌트
// ============================================

export function MiniStatsCard({
  title,
  value,
  icon,
  trend,
  description,
  variant = 'primary',
  className,
}: MiniStatsCardProps) {
  const { bg: iconBg, text: iconText } = variantStyles[variant];

  // 트렌드 방향 자동 판정
  const direction = trend?.direction ?? (
    trend === undefined
      ? 'neutral'
      : trend.value > 0
        ? 'up'
        : trend.value < 0
          ? 'down'
          : 'neutral'
  );

  const trendStyles = {
    up: {
      icon: ArrowUpRight,
      pill: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    },
    down: {
      icon: ArrowDownRight,
      pill: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    },
    neutral: {
      icon: Minus,
      pill: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    },
  };

  const TrendIcon = trendStyles[direction].icon;
  const displayValue = typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <div
      className={cn(
        'rounded-2xl shadow-sm p-5 border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
            {title}
          </p>
          <p className="mt-2 text-3xl font-black tabular-nums leading-none text-gray-900 dark:text-white">
            {displayValue}
          </p>
        </div>
        {icon && (
          <div
            className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
              iconBg,
              iconText
            )}
          >
            {icon}
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
              trendStyles[direction].pill
            )}
          >
            <TrendIcon className="w-3 h-3" />
            {trend.value > 0 ? '+' : ''}
            {trend.value}%
          </span>
          {trend.label && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{trend.label}</span>
          )}
        </div>
      )}

      {description && !trend && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{description}</p>
      )}
    </div>
  );
}

export default MiniStatsCard;
