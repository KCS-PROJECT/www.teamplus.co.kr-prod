'use client';

import { Icon } from '@/components/ui/Icon';
import { useCountUp } from '@/hooks/useCountUp';

interface TrainingStats {
  trainingRate: number;
  trainingChange: number;
}

export function TrainingRateCard({ stats, isAnimated = true }: { stats: TrainingStats; isAnimated?: boolean }) {
  const animatedRate = useCountUp(stats.trainingRate, 2000, 0, isAnimated);

  return (
    <div
      className="bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700 flex flex-col min-h-[220px]"
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-wtext-3 dark:text-rink-300 text-sm font-medium">
            이번 달 훈련 이수율
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold text-wtext-1 dark:text-white tracking-tight">
              {animatedRate}%
            </span>
            <span className="text-sm font-semibold text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded flex items-center">
              <Icon name="trending_up" className="text-[14px] mr-0.5" />+
              {stats.trainingChange}%
            </span>
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
          <Icon name="fitness_center" className="text-blue-600 dark:text-blue-400" />
        </div>
      </div>

      <div className="relative flex-1 min-h-[100px] w-full mt-4 flex items-end">
        <svg
          className="w-full h-full"
          viewBox="0 0 400 120"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0 80 C 40 80, 40 40, 80 40 C 120 40, 120 90, 160 90 C 200 90, 200 30, 240 30 C 280 30, 280 70, 320 70 C 360 70, 360 20, 400 20 V 120 H 0 V 80 Z"
            fill="var(--color-primary)"
            fillOpacity="0.1"
            className="transition-opacity duration-1000 ease-out"
            style={{
              opacity: isAnimated ? 1 : 0,
              transitionDelay: '300ms'
            }}
          />
          <path
            d="M0 80 C 40 80, 40 40, 80 40 C 120 40, 120 90, 160 90 C 200 90, 200 30, 240 30 C 280 30, 280 70, 320 70 C 360 70, 360 20, 400 20"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="600"
            className="transition-all duration-1500 ease-out"
            style={{
              strokeDashoffset: isAnimated ? 0 : 600
            }}
          />
          <circle
            cx="320"
            cy="70"
            r="5"
            fill="var(--color-primary)"
            className="animate-pulse transition-opacity duration-500"
            style={{
              opacity: isAnimated ? 1 : 0,
              transitionDelay: '1200ms'
            }}
          />
        </svg>
      </div>
      <div className="flex justify-between px-2 mt-2">
        {['1주', '2주', '3주', '4주'].map(week => (
          <span key={week} className="text-card-meta text-wtext-3 dark:text-rink-300 font-bold uppercase tracking-wider">
            {week}
          </span>
        ))}
      </div>
    </div>
  );
}
