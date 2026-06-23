'use client';

/**
 * BracketVisualizer — 8강→4강→결승 대진표 시각화
 *
 * 레퍼런스: 사용자 제공 HTML "Bracket Visualization Container"
 *
 * 기능:
 *  - 가로 스크롤 지원(hide-scrollbar)
 *  - 경기 데이터를 round 필드로 자동 분류
 *  - 커넥터 라인 포함
 *  - 경기가 없는 라운드는 플레이스홀더 표시
 */

import type { MatchSummary } from '@/services/tournament.service';
import { BracketConnector, BracketMatchCard } from './BracketMatchCard';

interface Props {
  matches: MatchSummary[];
  /** 섹션 타이틀 (예: "8강 대진표") */
  title?: string;
  updatedAt?: string;
}

export function BracketVisualizer({
  matches,
  title = '대진표',
  updatedAt,
}: Props) {
  const quarterFinals = matches.filter((m) => m.round === 'quarter');
  const semiFinals = matches.filter((m) => m.round === 'semi');
  const finalMatch = matches.find((m) => m.round === 'final') ?? null;

  const hasQuarter = quarterFinals.length > 0;
  const hasSemi = semiFinals.length > 0;
  const hasFinal = !!finalMatch;

  if (!hasQuarter && !hasSemi && !hasFinal) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-wtext-3">
        <span className="text-sm">등록된 대진이 없습니다</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 타이틀 */}
      <div className="flex items-center justify-between px-4 pb-2 pt-6">
        <h2 className="text-lg font-bold text-wtext-1 dark:text-white">
          {title}
        </h2>
        {updatedAt && (
          <span
            className="rounded bg-ice-500/10 px-2 py-1 text-xs font-medium text-ice-500"
            aria-label={`마지막 업데이트: ${updatedAt}`}
          >
            Update: {updatedAt}
          </span>
        )}
      </div>

      {/* 가로 스크롤 컨테이너 */}
      <div
        className="no-scrollbar w-full overflow-x-auto pb-8 pl-4 pt-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex min-w-max gap-4 pr-4">
          {/* 라운드 1: 8강 */}
          <div className="flex flex-col gap-6 pt-0">
            <div className="pb-2 text-center text-xs font-bold uppercase tracking-widest text-wtext-3">
              Quarter Finals
            </div>
            {quarterFinals.map((match) => (
              <BracketMatchCard key={match.id} match={match} />
            ))}
            {!hasQuarter && <BracketPlaceholder />}
          </div>

          {/* 커넥터 */}
          {hasQuarter && (
            <div className="flex flex-col justify-around pb-[60px] pt-[60px]">
              <BracketConnector height={148} />
              <div className="h-8" />
              <BracketConnector height={148} />
            </div>
          )}

          {/* 라운드 2: 4강 */}
          {(hasSemi || hasQuarter) && (
            <div className="flex flex-col justify-around pt-0">
              <div className="mb-[100px] pb-2 text-center text-xs font-bold uppercase tracking-widest text-wtext-3">
                Semi Finals
              </div>
              <div className="flex flex-col gap-[120px]">
                {semiFinals.map((match) => (
                  <BracketMatchCard key={match.id} match={match} />
                ))}
                {!hasSemi && (
                  <>
                    <BracketPlaceholder />
                    <BracketPlaceholder />
                  </>
                )}
              </div>
            </div>
          )}

          {/* 커넥터 2 */}
          {(hasFinal || hasSemi) && (
            <div className="flex flex-col justify-center">
              <BracketConnector height={290} />
            </div>
          )}

          {/* 결승 */}
          <div className="flex flex-col justify-center pt-0">
            <div className="mb-2 pb-2 text-center text-xs font-bold uppercase tracking-widest text-ice-500">
              Final
            </div>
            {finalMatch ? (
              <BracketMatchCard match={finalMatch} isFinal />
            ) : (
              <BracketPlaceholder variant="final" />
            )}
          </div>

          <div className="w-4" />
        </div>
      </div>
    </div>
  );
}

function BracketPlaceholder({
  variant = 'standard',
}: {
  variant?: 'standard' | 'final';
}) {
  if (variant === 'final') {
    return (
      <div className="flex w-48 flex-col overflow-hidden rounded-xl border border-dashed border-wline bg-white dark:border-rink-700 dark:bg-rink-800">
        <div className="border-b border-wline-2 bg-wbg px-3 py-2 dark:border-rink-700 dark:bg-rink-900/50">
          <span className="text-[10px] font-bold text-wtext-3">
            결승 대기
          </span>
        </div>
        <div className="p-4">
          <p className="text-center text-xs text-wtext-3">TBD</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex w-48 flex-col overflow-hidden rounded-xl border border-dashed border-wline bg-white dark:border-rink-700 dark:bg-rink-800">
      <div className="border-b border-wline-2 bg-wbg px-3 py-2 dark:border-rink-700 dark:bg-rink-900/50">
        <span className="text-[10px] font-medium text-wtext-3">-</span>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm italic text-wtext-3">TBD</span>
          <span className="text-sm text-wtext-3">-</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm italic text-wtext-3">TBD</span>
          <span className="text-sm text-wtext-3">-</span>
        </div>
      </div>
    </div>
  );
}
