'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

export interface TeamInfo {
  name: string;
  logoUrl?: string;
  role: 'HOME' | 'AWAY';
}

interface MatchHeroCardProps {
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  /** VS 아래 표시할 서브텍스트 (예: 매치 제목, '친선 경기') */
  subtitle?: string;
  className?: string;
}

/**
 * 매치 상세 상단의 VS 히어로 카드.
 *
 * HTML 소스의 VS 디스플레이 디자인 반영.
 */
export function MatchHeroCard({
  homeTeam,
  awayTeam,
  subtitle,
  className,
}: MatchHeroCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-6',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <TeamBlock team={homeTeam} />

        <div className="flex flex-col items-center justify-center px-2">
          <span
            className="flex h-10 items-center justify-center rounded-lg bg-rink-900 dark:bg-rink-700 px-4 text-sm font-black italic text-white shadow-sm"
            aria-label="대결"
          >
            VS
          </span>
          {subtitle && (
            <span className="mt-2 text-[11px] font-semibold text-wtext-3 dark:text-rink-300">
              {subtitle}
            </span>
          )}
        </div>

        <TeamBlock team={awayTeam} />
      </div>
    </div>
  );
}

function TeamBlock({ team }: { team: TeamInfo }) {
  const isHome = team.role === 'HOME';
  return (
    <div className="flex flex-col items-center w-1/3 gap-2">
      <div
        className={cn(
          'w-16 h-16 rounded-full border-2 flex items-center justify-center overflow-hidden',
          isHome
            ? 'bg-wline-2 border-wline dark:bg-rink-700 dark:border-rink-700'
            : 'bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800'
        )}
      >
        {resolveImageSrc(team.logoUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageSrc(team.logoUrl)}
            alt={`${team.name} 로고`}
            className="w-full h-full object-cover"
          />
        ) : (
          <Icon
            name={isHome ? 'groups' : 'sports_hockey'}
            className={cn(
              'text-3xl',
              isHome
                ? 'text-wtext-3 dark:text-rink-300'
                : 'text-blue-500 dark:text-blue-300'
            )}
          />
        )}
      </div>
      <span className="text-sm font-bold text-wtext-1 dark:text-white text-center break-keep">
        {team.name}
      </span>
      <span className="text-[10px] font-semibold tracking-wider text-wtext-3 dark:text-rink-300 uppercase">
        {team.role}
      </span>
    </div>
  );
}
