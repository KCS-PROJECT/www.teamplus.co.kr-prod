'use client';

import { Icon } from '@/components/ui/Icon';
import { useCountUp } from '@/hooks/useCountUp';

interface TeamStats {
  attendanceRate: number;
  attendanceChange: number;
  totalMembers: number;
  presentMembers: number;
  absentMembers: number;
}

export function AttendanceCard({ stats, isAnimated = true }: { stats: TeamStats; isAnimated?: boolean }) {
  const animatedRate = useCountUp(stats.attendanceRate, 2000, 0, isAnimated);

  return (
    <div
      className="bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700 flex flex-col justify-between min-h-[220px]"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-card-emphasis font-medium">
            오늘의 출석률
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold text-wtext-1 dark:text-white tracking-tight tabular-nums">
              {animatedRate}%
            </span>
            <span className="text-card-meta font-semibold !text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded flex items-center">
              <Icon name="trending_up" className="text-[14px] mr-0.5" />+
              {stats.attendanceChange}%
            </span>
          </div>
          <p className="text-card-meta mt-1">
            총원 {stats.totalMembers}명 중 {stats.presentMembers}명 출석
          </p>
        </div>
        <div className="bg-ice-500/10 p-2 rounded-lg">
          <Icon name="groups" className="text-ice-500" />
        </div>
      </div>

      <div className="space-y-3 mt-auto">
        <div className="flex justify-between text-card-meta font-semibold">
          <span>출석 ({stats.presentMembers})</span>
          <span>결석 ({stats.absentMembers})</span>
        </div>
        <div className="relative h-3 w-full bg-wline-2 dark:bg-rink-700 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-ice-500 transition-all duration-1000 ease-out"
            style={{ width: isAnimated ? `${stats.attendanceRate}%` : '0%' }}
          />
          <div
            className="h-full bg-red-400 transition-all duration-1000 ease-out"
            style={{
              width: isAnimated ? `${100 - stats.attendanceRate}%` : '0%',
              transitionDelay: '200ms'
            }}
          />
        </div>
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-ice-500" />
            <span className="text-card-meta">출석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-red-400" />
            <span className="text-card-meta">
              결석/지각
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
