'use client';

import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';
import { cn } from '@/lib/utils';
import { AttendanceProgressBar } from './AttendanceProgressBar';

/**
 * WeeklyAttendanceGrid - 주간 출석 현황 카드
 *
 * 7일간의 출석/결석 현황을 그리드로 보여주고,
 * 하단에 출석률 프로그레스 바를 표시합니다.
 */

interface AttendanceDay {
  /** 날짜 문자열 (예: '3/4') */
  date: string;
  /** 요일 라벨 (예: '월') */
  dayLabel: string;
  /** 출석 여부 */
  attended: boolean;
}

interface WeeklyAttendanceGridProps {
  /** 주간 출석 데이터 (7일) */
  days: AttendanceDay[];
  /** 카드 타이틀 (기본: '이번 주 출석 현황') */
  title?: string;
  /** CountUp 애니메이션 활성화 */
  isAnimated?: boolean;
  /** 추가 className */
  className?: string;
}

export function WeeklyAttendanceGrid({
  days,
  title = '이번 주 출석 현황',
  isAnimated = true,
  className = '',
}: WeeklyAttendanceGridProps) {
  const attendedCount = days.filter((d) => d.attended).length;
  const rate = days.length > 0 ? Math.round((attendedCount / days.length) * 100) : 0;

  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 rounded-xl p-4 shadow-sm border border-wline-2 dark:border-rink-700',
        className
      )}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
            <Icon
              name="how_to_reg"
              className="text-emerald-600 text-base"
              aria-hidden="true"
            />
          </div>
          <span className="text-sm font-bold text-wtext-1 dark:text-white">
            {title}
          </span>
        </div>
        <span className="text-lg font-extrabold text-wtext-1 dark:text-white tabular-nums">
          {isAnimated ? <CountUp end={rate} duration={1800} /> : 0}%
        </span>
      </div>

      {/* 7일 그리드 */}
      <div
        className="flex gap-1.5 mb-3"
        role="list"
        aria-label="최근 7일 출석 현황"
      >
        {days.map((day, i) => (
          <div
            key={i}
            role="listitem"
            className="flex-1 flex flex-col items-center gap-1.5 py-2 rounded-lg"
            aria-label={`${day.date} ${day.dayLabel}요일 ${day.attended ? '출석' : '결석'}`}
          >
            <span className="text-[10px] text-wtext-3 dark:text-rink-300 font-medium">
              {day.dayLabel}
            </span>
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center',
                day.attended
                  ? 'bg-emerald-50 dark:bg-emerald-900/20'
                  : 'bg-red-50 dark:bg-red-900/20'
              )}
            >
              <Icon
                name={day.attended ? 'check' : 'close'}
                className={cn(
                  'text-lg',
                  day.attended ? 'text-emerald-500' : 'text-red-400'
                )}
                aria-hidden="true"
              />
            </div>
            <span className="text-[10px] text-wtext-3 dark:text-rink-300 tabular-nums">
              {day.date}
            </span>
          </div>
        ))}
      </div>

      {/* 출석률 프로그레스 바 */}
      <AttendanceProgressBar
        rate={rate}
        isAnimated={isAnimated}
        label={`주간 출석률 ${rate}%`}
      />
    </div>
  );
}

export type { AttendanceDay };
