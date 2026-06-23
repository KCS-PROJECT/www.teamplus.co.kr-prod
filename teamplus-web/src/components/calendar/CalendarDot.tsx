'use client';

import { cn } from '@/lib/utils';
import { getTrainingColor, CALENDAR_LEGEND, ACADEMY_CALENDAR_LEGEND, TEAM_ONLY_CALENDAR_LEGEND } from '@/lib/calendar-colors';

/**
 * CalendarDot - 캘린더 날짜 셀 색상 점 컴포넌트
 * TEAMPLUS Design System
 *
 * 날짜별 수업/훈련 유형을 색상 점으로 구분 표시
 * - 최대 4개까지 표시 (초과 시 +N 표기)
 * - AI 스타일 금지: 솔리드 컬러만 사용
 */

interface CalendarDotProps {
  /** 해당 날짜의 훈련 유형 목록 */
  types: string[];
  /** 점 크기 */
  size?: 'sm' | 'md';
  /** 선택 상태 톤 */
  tone?: 'default' | 'selected';
  className?: string;
}

export function CalendarDot({
  types,
  size = 'sm',
  tone = 'default',
  className,
}: CalendarDotProps) {
  // 2026-05-16: types.length === 0 일 때도 mount 유지 — 빈 placeholder 영역(h-3 sm / h-4 md)
  //   reserve 하여 캘린더 셀 안에서 날짜 숫자 위치가 일정 유무와 상관없이 일관되게 정렬되도록 보장.
  //   `flex-col items-center justify-center` 셀 안에서 contents 총 높이를 항상 동일하게 유지.
  const uniqueTypes = [...new Set(types)];
  const displayTypes = uniqueTypes.slice(0, 4);
  const overflow = uniqueTypes.length - 4;

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const reserveHeight = size === 'sm' ? 'h-3' : 'h-4';
  const overlapSpace = size === 'sm' ? '-space-x-[2px]' : '-space-x-[3px]';
  const overflowTextClass =
    tone === 'selected'
      ? 'text-card-meta text-white/90 font-bold leading-none tabular-nums'
      : 'text-card-meta text-wtext-3 dark:text-rink-300 font-bold leading-none tabular-nums';

  return (
    <div
      className={cn('inline-flex items-center justify-center', reserveHeight, className)}
      aria-hidden={types.length === 0}
    >
      <div className={cn('inline-flex items-center justify-center', overlapSpace)}>
        {displayTypes.map((type, index) => {
          const color = getTrainingColor(type);
          return (
            <span
              key={type}
              className={cn('relative rounded-full shrink-0', dotSize, color.bg, color.darkBg)}
              style={{ zIndex: displayTypes.length - index }}
              aria-label={color.label}
            />
          );
        })}
      </div>
      {overflow > 0 && (
        <span className={cn('ml-0.5', overflowTextClass)}>
          +{overflow}
        </span>
      )}
    </div>
  );
}

/**
 * CalendarLegend - 캘린더 범례 컴포넌트
 * 대분류 훈련 유형별 색상 설명
 *
 * variant 별 노출 키 분기:
 *   'team' (default): 정규/오픈/대회 3분류 — 학생·학부모 (결제한 오픈클래스 노출)
 *   'team-only': 정규/대회 2분류 — 코치·감독 (팀↔오픈 도메인 분리)
 *   'academy': 오픈 1분류 — 오픈클래스 감독 (/academy-schedules · /academy-director)
 */
interface CalendarLegendProps {
  className?: string;
  /** 노출할 범례 키 집합. 기본 'team' (정규/오픈/대회 3분류) */
  variant?: 'team' | 'team-only' | 'academy';
}

export function CalendarLegend({ className, variant = 'team' }: CalendarLegendProps) {
  const legend =
    variant === 'academy'
      ? ACADEMY_CALENDAR_LEGEND
      : variant === 'team-only'
        ? TEAM_ONLY_CALENDAR_LEGEND
        : CALENDAR_LEGEND;
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {legend.map((item) => (
        <div key={item.key} className="flex items-center gap-1.5">
          <span
            className={cn('w-2.5 h-2.5 rounded-full shrink-0', item.bg, item.darkBg)}
          />
          <span className="text-xs text-wtext-2 dark:text-rink-300 font-medium">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
