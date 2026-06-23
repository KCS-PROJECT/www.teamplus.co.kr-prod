'use client';

import { NavLink } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  href?: string;
  linkText?: string;
  /**
   * 우측 요약 수치 (예: 차트 섹션의 총합, 전월 대비 지표 등).
   * href 와 함께 쓰면 링크가 우선하고 value 는 제목 바로 옆으로 붙는다.
   */
  value?: string;
  /**
   * 트렌드 지표 (예: "+12%", "-3%").
   * positive/negative 자동 색상 분류 (value 유무와 무관하게 단독 사용 가능).
   */
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'flat';
  };
}

export function SectionHeader({ title, href, linkText, value, trend }: SectionHeaderProps) {
  const hasSummary = value !== undefined || trend !== undefined;

  return (
    <div className="flex items-center justify-between mb-4 gap-2">
      <div className="flex items-baseline gap-2 min-w-0">
        <h3 className="text-card-section truncate">{title}</h3>
        {value !== undefined && (
          <span className="text-card-title tabular-nums shrink-0">
            {value}
          </span>
        )}
        {trend && (
          <span
            className={cn(
              'text-card-meta font-bold tabular-nums shrink-0',
              trend.direction === 'up' && '!text-success',
              trend.direction === 'down' && '!text-error',
            )}
          >
            {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '−'} {trend.value}
          </span>
        )}
      </div>
      {href && !hasSummary ? (
        <NavLink
          href={href}
          className="text-card-meta hover:text-ice-500 transition-colors font-medium py-1 px-2 shrink-0"
        >
          {linkText || '전체보기'}
        </NavLink>
      ) : href ? (
        <NavLink
          href={href}
          className="text-card-meta hover:text-ice-500 transition-colors font-medium py-1 px-2 shrink-0"
        >
          {linkText || '전체보기'}
        </NavLink>
      ) : null}
    </div>
  );
}
