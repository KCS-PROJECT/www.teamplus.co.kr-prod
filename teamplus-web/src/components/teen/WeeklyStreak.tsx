'use client';

import { Icon } from '@/components/ui/Icon';

export interface WeekDay {
  dayOfWeek: string;
  date: number;
  attended: boolean | null;
}

interface WeeklyStreakProps {
  /** 요일별 출석 데이터 */
  weekDays: WeekDay[];
  /** 연속 출석 일수 */
  streakCount: number;
  /** 애니메이션 적용 상태 */
  isAnimated?: boolean;
  className?: string;
}

/**
 * 주간 출석 스트릭 컴포넌트
 * 7일 출석 현황을 원형 아이콘 그리드로 표시
 * 출석/결석/예정 3가지 상태를 시각적으로 구분
 */
export function WeeklyStreak({
  weekDays,
  streakCount,
  isAnimated = true,
  className = '',
}: WeeklyStreakProps) {
  return (
    <div
      className={`bg-white dark:bg-rink-800 rounded-xl p-4 shadow-sm border border-wline-2 dark:border-rink-700 ${className}`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-wtext-1 dark:text-white flex items-center gap-1.5">
          <Icon
            name="calendar_month"
            className="text-ice-500 text-base"
            aria-hidden="true"
          />
          이번 주 출석
        </h3>
        {streakCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-900/20">
            <Icon
              name="local_fire_department"
              className="text-orange-500 text-sm"
              aria-hidden="true"
            />
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
              {streakCount}일 연속
            </span>
          </div>
        )}
      </div>

      {/* 요일 그리드 */}
      <div
        className="grid grid-cols-7 gap-2"
        role="list"
        aria-label="이번 주 출석 현황"
      >
        {weekDays.map((day, i) => {
          const statusLabel =
            day.attended === true
              ? '출석'
              : day.attended === false
                ? '결석'
                : '예정';

          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1"
              role="listitem"
              style={{
                opacity: isAnimated ? 1 : 0,
                transform: isAnimated ? 'translateY(0)' : 'translateY(8px)',
                transition: `opacity 400ms ease-out ${i * 50}ms, transform 400ms ease-out ${i * 50}ms`,
              }}
            >
              <span className="text-[10px] font-medium text-wtext-3 dark:text-rink-300">
                {day.dayOfWeek}
              </span>
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  day.attended === true
                    ? 'bg-ice-500 text-white'
                    : day.attended === false
                      ? 'bg-wline dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
                      : 'bg-wline-2 dark:bg-rink-800 text-wtext-4 dark:text-rink-500 border border-dashed border-wline dark:border-rink-700'
                }`}
                role="img"
                aria-label={`${day.date}일 ${day.dayOfWeek}요일 ${statusLabel}`}
              >
                {day.attended === true ? (
                  <Icon
                    name="check"
                    className="text-[14px] text-white"
                    aria-hidden="true"
                  />
                ) : (
                  day.date
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
