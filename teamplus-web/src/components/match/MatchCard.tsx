'use client';

import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MatchStatusBadge, type MatchStatus } from './MatchStatusBadge';
import { MatchProgressBar } from './MatchProgressBar';

export interface MatchCardData {
  id: string;
  title?: string;
  time: string;
  date: string;
  dayOfWeek: string;
  location: string;
  price: number;
  level: string;
  levelCode?: string;
  gender?: string;
  currentParticipants: number;
  maxParticipants: number;
  status: MatchStatus;
}

interface MatchCardProps {
  match: MatchCardData;
  /** 찜 버튼 활성/비활성 */
  favorited?: boolean;
  onFavoriteToggle?: () => void;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스(rounded-2xl·shadow) 제거 → flat hairline 타일 + it-* 토큰.
   */
  iceTheme?: boolean;
}

/**
 * 매치 목록 카드 — 시간/장소/가격/레벨/참가 현황.
 *
 * 마감 상태일 때 전체 opacity 감소 + '대기 등록' 오버레이.
 * AI 스타일 금지(그라디언트/블러 없음).
 */
export function MatchCard({ match, favorited, onFavoriteToggle, iceTheme = false }: MatchCardProps) {
  const isClosed = match.status === 'closed' || match.status === 'cancelled';

  // [ICETIMES] flat — 카드 박스(rounded-2xl·shadow) 제거. it-line hairline 타일 + it-* 토큰.
  if (iceTheme) {
    return (
      <NavLink href={`/matches/${match.id}`}>
        <article
          className={cn(
            'relative flex flex-col rounded-w-md p-4 border transition-colors duration-100 motion-reduce:transition-none',
            isClosed
              ? 'bg-it-fill dark:bg-rink-900 border-it-line dark:border-it-blue-900 opacity-70'
              : 'bg-it-surface dark:bg-rink-800 border-it-line dark:border-it-blue-900 active:bg-it-fill dark:active:bg-rink-700'
          )}
        >
          <div className="flex items-start justify-between mb-3">
            <MatchStatusBadge status={match.status} size="sm" iceTheme />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onFavoriteToggle?.();
              }}
              aria-label={favorited ? '찜 해제' : '찜하기'}
              className={cn(
                'transition-colors motion-reduce:transition-none',
                isClosed ? 'text-it-ink-400' : 'text-it-ink-400 hover:text-it-blue-500'
              )}
            >
              <Icon
                name={favorited ? 'favorite' : 'favorite_border'}
                filled={favorited}
                className="text-[22px]"
              />
            </button>
          </div>

          {/* 시간/장소 및 가격 */}
          <div className="flex justify-between items-end mb-4">
            <div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span
                  className={cn(
                    'text-2xl font-bold tracking-tight font-num tabular-nums',
                    isClosed
                      ? 'text-it-ink-400 dark:text-it-ink-300'
                      : 'text-it-ink-800 dark:text-white'
                  )}
                >
                  {match.time}
                </span>
                <span
                  className={cn(
                    'text-card-emphasis',
                    isClosed ? 'text-it-ink-400' : 'text-it-ink-500 dark:text-it-ink-300'
                  )}
                >
                  {match.date} ({match.dayOfWeek})
                </span>
              </div>
              <div
                className={cn(
                  'flex items-center gap-1.5',
                  isClosed ? 'text-it-ink-400' : 'text-it-ink-700 dark:text-it-ink-200'
                )}
              >
                <Icon
                  name="location_on"
                  className={cn('text-lg', isClosed ? 'text-it-ink-400' : 'text-it-blue-500')}
                />
                <span className="text-card-emphasis">{match.location}</span>
              </div>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  'text-card-section font-num tabular-nums',
                  isClosed ? 'text-it-ink-400 dark:text-it-ink-300' : 'text-it-blue-600 dark:text-it-blue-300'
                )}
              >
                {match.price.toLocaleString()}원
              </p>
              <p className="text-card-meta text-it-ink-500 dark:text-it-ink-300">1회 참가비</p>
            </div>
          </div>

          <div className="h-px w-full mb-4 bg-it-line dark:bg-it-blue-900" />

          <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 bg-it-fill dark:bg-rink-700 text-it-ink-700 dark:text-it-ink-200 px-2 py-1 rounded text-card-meta font-medium">
                <Icon name="leaderboard" className="text-sm" />
                {match.level}
                {match.levelCode && ` (${match.levelCode})`}
              </span>
              {!isClosed && match.gender && (
                <span className="inline-flex items-center gap-1 bg-it-fill dark:bg-rink-700 text-it-ink-700 dark:text-it-ink-200 px-2 py-1 rounded text-card-meta font-medium">
                  <Icon name="person" className="text-sm" />
                  {match.gender}
                </span>
              )}
            </div>
            <div className="w-32">
              <MatchProgressBar
                current={match.currentParticipants}
                total={match.maxParticipants}
                tone={isClosed ? 'muted' : 'primary'}
                iceTheme
              />
            </div>
          </div>
        </article>
      </NavLink>
    );
  }

  return (
    <NavLink href={`/matches/${match.id}`}>
      <article
        className={cn(
          'relative flex flex-col bg-white dark:bg-rink-800 rounded-2xl p-5 border shadow-sm transition-transform duration-100',
          isClosed
            ? 'border-wline dark:border-rink-700 opacity-70'
            : 'border-wline-2 dark:border-rink-700 hover:shadow-md active:brightness-95'
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <MatchStatusBadge status={match.status} size="sm" />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFavoriteToggle?.();
            }}
            aria-label={favorited ? '찜 해제' : '찜하기'}
            className={cn(
              'transition-colors',
              isClosed ? 'text-wtext-3' : 'text-wtext-3 hover:text-ice-500'
            )}
          >
            <Icon
              name={favorited ? 'favorite' : 'favorite_border'}
              filled={favorited}
              className="text-[22px]"
            />
          </button>
        </div>

        {/* 시간/장소 및 가격 */}
        <div className="flex justify-between items-end mb-4">
          <div>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span
                className={cn(
                  'text-2xl font-bold tracking-tight',
                  isClosed
                    ? 'text-wtext-3 dark:text-rink-300'
                    : 'text-wtext-1 dark:text-white'
                )}
              >
                {match.time}
              </span>
              <span
                className={cn(
                  'text-card-emphasis',
                  isClosed ? 'text-wtext-3' : 'text-wtext-3 dark:text-rink-300'
                )}
              >
                {match.date} ({match.dayOfWeek})
              </span>
            </div>
            <div
              className={cn(
                'flex items-center gap-1.5',
                isClosed ? 'text-wtext-3' : 'text-wtext-2 dark:text-rink-100'
              )}
            >
              <Icon
                name="location_on"
                className={cn(
                  'text-lg',
                  isClosed ? 'text-wtext-3' : 'text-ice-500'
                )}
              />
              <span className="text-card-emphasis">{match.location}</span>
            </div>
          </div>
          <div className="text-right">
            <p
              className={cn(
                'text-card-section',
                isClosed ? 'text-wtext-3 dark:text-rink-300' : 'text-ice-500'
              )}
            >
              {match.price.toLocaleString()}원
            </p>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300">1회 참가비</p>
          </div>
        </div>

        <div
          className={cn(
            'h-px w-full mb-4',
            isClosed ? 'bg-wline dark:bg-rink-700' : 'bg-wline-2 dark:bg-rink-700'
          )}
        />

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 px-2 py-1 rounded text-card-meta font-medium">
              <Icon name="leaderboard" className="text-sm" />
              {match.level}
              {match.levelCode && ` (${match.levelCode})`}
            </span>
            {!isClosed && match.gender && (
              <span className="inline-flex items-center gap-1 bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 px-2 py-1 rounded text-card-meta font-medium">
                <Icon name="person" className="text-sm" />
                {match.gender}
              </span>
            )}
          </div>
          <div className="w-32">
            <MatchProgressBar
              current={match.currentParticipants}
              total={match.maxParticipants}
              tone={isClosed ? 'muted' : 'primary'}
            />
          </div>
        </div>
      </article>
    </NavLink>
  );
}
