'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * CoachStatCard - 코치 통계 카드 (단일)
 *
 * 사용처: coach 대시보드 통계 영역
 * 패턴: 아이콘 + 라벨 + 숫자 + 선택적 접미사
 *
 * NOTE: 대시보드의 스와이프형 통계는 SwipeStatCards를 사용하지만,
 *       개별 표시가 필요한 경우 이 컴포넌트를 사용합니다.
 */
export interface CoachStatCardProps {
  /** Material Symbols 아이콘 이름 */
  icon: string;
  /** 라벨 텍스트 */
  label: string;
  /** 숫자 값 */
  value: number;
  /** 접미사 (예: '명', '건', '%') */
  suffix?: string;
  /** 아이콘 배경색 클래스 */
  iconBg?: string;
  /** 아이콘 텍스트 색상 클래스 */
  iconColor?: string;
  /** 변동값 (양수=증가, 음수=감소) */
  change?: number;
  /** 추가 className */
  className?: string;
}

export const CoachStatCard = memo(function CoachStatCard({
  icon,
  label,
  value,
  suffix = '',
  iconBg = 'bg-blue-50 dark:bg-blue-900/20',
  iconColor = 'text-ice-500',
  change,
  className,
}: CoachStatCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 rounded-xl p-4',
        'border border-wline-2 dark:border-rink-700',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
            iconBg
          )}
        >
          <Icon name={icon} className={cn('text-xl', iconColor)} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-wtext-3 dark:text-rink-300 font-medium truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl font-extrabold text-wtext-1 dark:text-white tabular-nums">
              {value}
            </span>
            {suffix && (
              <span className="text-sm text-wtext-3 dark:text-rink-300 font-medium">
                {suffix}
              </span>
            )}
            {change !== undefined && change !== 0 && (
              <span
                className={cn(
                  'text-[10px] font-bold ml-1',
                  change > 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {change > 0 ? '+' : ''}{change}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
