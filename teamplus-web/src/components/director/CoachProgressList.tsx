'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { CountUp } from '@/components/ui/CountUp';
import { CoachProgress } from '@/components/dashboard/CoachProgressItem';

interface CoachProgressListProps {
  coaches: CoachProgress[];
  isAnimated: boolean;
}

function getProgressBarColor(progress: number): string {
  if (progress < 50) return 'bg-orange-400';
  return 'bg-ice-500';
}

function getProgressTextColor(progress: number): string {
  if (progress >= 80) return 'text-ice-500 dark:text-blue-400';
  if (progress < 50) return 'text-orange-500 dark:text-orange-400';
  return 'text-wtext-2 dark:text-rink-100';
}

export function CoachProgressList({ coaches, isAnimated }: CoachProgressListProps) {
  const [visibleCards, setVisibleCards] = useState<boolean[]>([]);

  useEffect(() => {
    if (!isAnimated) {
      setVisibleCards([]);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    coaches.forEach((_, index) => {
      const timer = setTimeout(() => {
        setVisibleCards((prev) => {
          const next = [...prev];
          next[index] = true;
          return next;
        });
      }, 100 + index * 200);
      timers.push(timer);
    });

    return () => timers.forEach(clearTimeout);
  }, [isAnimated, coaches.length]);

  return (
    <section aria-label="코치별 수업 현황">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-[19px] font-bold text-wtext-1 dark:text-white">코치별 수업 현황</h3>
        <NavLink
          href="/director-coaches"
          className="text-sm font-bold text-ice-500 dark:text-blue-400 flex items-center"
        >
          자세히 보기
          <Icon name="chevron_right" className="text-lg ml-0.5" aria-hidden="true" />
        </NavLink>
      </div>
      <div className="flex flex-col gap-3" role="list" aria-label="코치별 수업 진행률">
        {coaches.map((coach, index) => {
          const isCardVisible = visibleCards[index] ?? false;

          return (
            <div
              key={coach.id}
              role="listitem"
              className="bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline-2 dark:border-rink-700 flex items-center gap-4 transition-all duration-500 ease-out"
              style={{
                opacity: isCardVisible ? 1 : 0,
                transform: isCardVisible ? 'translateX(0)' : 'translateX(-16px)',
              }}
            >
              {/* 프로필 아이콘 */}
              <div className="shrink-0">
                <div
                  className="size-12 rounded-2xl bg-wline dark:bg-rink-700 border border-wline-2 dark:border-rink-700 flex items-center justify-center overflow-hidden transition-transform duration-500 ease-out"
                  style={{
                    transform: isCardVisible ? 'scale(1)' : 'scale(0.5)',
                    transitionDelay: isCardVisible ? '150ms' : '0ms',
                  }}
                >
                  <Icon name="person" className="text-xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-wtext-1 dark:text-white truncate text-[15px]">
                      {coach.name}
                    </h4>
                    <span className="text-xs font-medium text-wtext-3 dark:text-rink-300">
                      {coach.specialty}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-bold tabular-nums ml-3 ${getProgressTextColor(coach.progress)}`}
                  >
                    {isCardVisible ? <CountUp end={coach.progress} duration={1000} /> : 0}%
                  </span>
                </div>
                {/* 프로그레스 바 */}
                <div className="w-full bg-wline-2 dark:bg-rink-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`${getProgressBarColor(coach.progress)} h-1.5 rounded-full transition-all duration-1000 ease-out`}
                    style={{
                      width: isCardVisible ? `${coach.progress}%` : '0%',
                      transitionDelay: '200ms',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
