'use client';

import { Icon } from '@/components/ui/Icon';

interface StatItem {
  /** Material Symbols 아이콘 이름 */
  icon?: string;
  /** 통계 값 */
  value: number | string;
  /** 통계 레이블 */
  label: string;
  /** 값 색상 클래스 (옵션, 예: 'text-ice-500', 'text-red-500') */
  valueColor?: string;
  /** 아이콘 배경/색상 (옵션) */
  iconBg?: string;
  iconColor?: string;
}

interface AdminStatGridProps {
  /** 통계 항목 배열 */
  stats: StatItem[];
  /** 그리드 컬럼 수 (기본: stats 길이, 최대 4) */
  columns?: 2 | 3 | 4;
  /** variant: card(개별 카드) | inline(한 카드 안에 분할) */
  variant?: 'card' | 'inline';
  /** 추가 CSS 클래스 */
  className?: string;
}

const GRID_COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

/**
 * Admin 통계 그리드 컴포넌트
 *
 * tournament-manage(3칸 요약), coach-manage(2칸 요약) 등에서
 * 핵심 수치를 그리드로 표시.
 *
 * @example
 * // 카드형 (개별 카드)
 * <AdminStatGrid
 *   stats={[
 *     { value: tournaments.length, label: '전체 대회' },
 *     { value: ongoingCount, label: '진행 중', valueColor: 'text-red-500' },
 *     { value: totalMatches, label: '총 경기', valueColor: 'text-ice-500' },
 *   ]}
 * />
 *
 * // 인라인형 (한 카드 안에 분할)
 * <AdminStatGrid
 *   variant="inline"
 *   stats={[
 *     { value: totalCoaches, label: '총 등록 코치' },
 *     { value: totalClasses, label: '배정된 수업' },
 *   ]}
 * />
 */
export function AdminStatGrid({
  stats,
  columns,
  variant = 'card',
  className = '',
}: AdminStatGridProps) {
  const cols = columns ?? Math.min(stats.length, 4) as 2 | 3 | 4;

  if (variant === 'inline') {
    return (
      <div
        className={`bg-white dark:bg-rink-800 rounded-xl p-5 border border-wline-2 dark:border-rink-700 shadow-sm ${className}`}
      >
        <div className="flex items-center justify-around gap-3">
          {stats.map((stat, i) => (
            <div key={i} className="flex-1 text-center">
              {stat.icon && (
                <div className="flex justify-center mb-2">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      stat.iconBg ?? 'bg-wline-2 dark:bg-rink-700'
                    }`}
                  >
                    <Icon
                      name={stat.icon}
                      className={`text-xl ${stat.iconColor ?? 'text-wtext-3'}`}
                    />
                  </div>
                </div>
              )}
              <p className="text-xs text-wtext-3 dark:text-rink-300 font-medium mb-1">
                {stat.label}
              </p>
              <p
                className={`text-2xl font-extrabold ${
                  stat.valueColor ?? 'text-wtext-1 dark:text-white'
                }`}
              >
                {typeof stat.value === 'number'
                  ? stat.value.toLocaleString()
                  : stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // card variant (기본)
  return (
    <div className={`grid ${GRID_COLS[cols]} gap-3 ${className}`}>
      {stats.map((stat, i) => (
        <div
          key={i}
          className="bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline-2 dark:border-rink-700 text-center"
        >
          {stat.icon && (
            <div className="flex justify-center mb-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  stat.iconBg ?? 'bg-wline-2 dark:bg-rink-700'
                }`}
              >
                <Icon
                  name={stat.icon}
                  className={`text-lg ${stat.iconColor ?? 'text-wtext-3'}`}
                />
              </div>
            </div>
          )}
          <p
            className={`text-2xl font-extrabold ${
              stat.valueColor ?? 'text-wtext-1 dark:text-white'
            }`}
          >
            {typeof stat.value === 'number'
              ? stat.value.toLocaleString()
              : stat.value}
          </p>
          <p className="text-xs text-wtext-3 dark:text-rink-300 font-medium mt-1">
            {stat.label}
          </p>
        </div>
      ))}
    </div>
  );
}

export type { StatItem };
