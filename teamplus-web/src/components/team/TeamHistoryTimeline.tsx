'use client';

/**
 * TeamHistoryTimeline — 팀 주요 약력 타임라인
 *
 * 레퍼런스: 사용자 제공 HTML "팀 상세 정보" Team History/Timeline 섹션
 *
 * 데이터 출처:
 *  - TeamAward (백엔드 teamAwards select)
 *  - 각 항목을 시간 내림차순으로 표시
 *  - 가장 최근 항목은 primary 컬러 dot, 나머지는 회색 dot
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { awardTypeLabel, type TeamAwardSummary } from '@/services/team.service';
import { cn } from '@/lib/utils';

interface TeamHistoryTimelineProps {
  awards: readonly TeamAwardSummary[];
  /** 최대 표시 개수 (기본 5) */
  limit?: number;
  /** 감독/코치에게 "더 보기" 버튼 노출 여부 */
  onSeeAll?: () => void;
}

function formatAwardDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function TeamHistoryTimeline({
  awards,
  limit = 5,
  onSeeAll,
}: TeamHistoryTimelineProps) {
  const hasData = awards.length > 0;
  const sliced = hasData ? awards.slice(0, limit) : [];

  return (
    <section aria-label={MESSAGES.team.ariaHistoryRegion}>
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-6 w-1 rounded-full bg-ice-500"
            aria-hidden="true"
          />
          <h3 className="text-card-section text-wtext-1 dark:text-white">
            {MESSAGES.team.history}
          </h3>
        </div>
        {onSeeAll && hasData && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-card-meta font-bold text-ice-500 hover:text-ice-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 focus-visible:ring-offset-2 rounded"
          >
            {MESSAGES.team.seeAll}
          </button>
        )}
      </header>

      {!hasData ? (
        <div className="rounded-2xl border border-wline-2 bg-white p-6 text-center dark:border-rink-700 dark:bg-rink-800">
          <Icon
            name="emoji_events"
            className="mx-auto text-3xl text-wtext-4 dark:text-rink-500"
            aria-hidden="true"
          />
          <p className="mt-2 text-card-emphasis font-semibold text-wtext-2 dark:text-rink-100">
            {MESSAGES.team.historyEmpty}
          </p>
          <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300">
            {MESSAGES.team.historyEmptyHint}
          </p>
        </div>
      ) : (
        <ol
          className="relative space-y-6 pl-8 before:absolute before:inset-y-0 before:left-[11px] before:w-0.5 before:bg-wline-2 dark:before:bg-rink-700"
          aria-label={MESSAGES.team.history}
        >
          {sliced.map((award, idx) => (
            <li key={award.id} className="relative">
              {/* Dot */}
              <span
                className={cn(
                  'absolute -left-8 top-1 flex size-6 items-center justify-center rounded-full border-4',
                  idx === 0
                    ? 'border-white bg-ice-500 shadow dark:border-rink-900'
                    : 'border-white bg-wline dark:border-rink-900 dark:bg-rink-500',
                )}
                aria-hidden="true"
              />
              {/* Date */}
              <time
                dateTime={award.awardedAt}
                className={cn(
                  'text-card-meta font-bold',
                  idx === 0
                    ? 'text-ice-500'
                    : 'text-wtext-3 dark:text-rink-300',
                )}
              >
                {formatAwardDate(award.awardedAt)}
                {award.season && (
                  <span className="ml-1.5 font-medium text-wtext-3">
                    · {award.season}
                  </span>
                )}
              </time>
              {/* Title */}
              <p className="mt-0.5 text-card-title text-wtext-1 dark:text-white">
                {award.awardName}
              </p>
              {/* Type badge */}
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-ice-500/10 px-2 py-0.5 text-[10px] font-bold text-ice-500 dark:bg-ice-500/20">
                  <Icon
                    name="emoji_events"
                    className="text-[11px]"
                    aria-hidden="true"
                  />
                  {awardTypeLabel(award.awardType)}
                </span>
                {award.description && (
                  <span className="text-card-meta text-wtext-3 dark:text-rink-300 line-clamp-1">
                    {award.description}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
