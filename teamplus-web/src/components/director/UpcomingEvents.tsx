'use client';

import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { UpcomingEvent } from '@/components/dashboard/DirectorEventItem';

interface UpcomingEventsProps {
  events: UpcomingEvent[];
  onMenuClick?: (eventId: string) => void;
  /** "자세히 보기" 링크 — 기본 /tournaments (대회 관리 페이지) */
  viewMoreHref?: string;
}

export function UpcomingEvents({
  events,
  onMenuClick,
  viewMoreHref = '/tournaments',
}: UpcomingEventsProps) {
  return (
    <section aria-label="대회/경기 현황">
      {/* [수정 2026-04-30] 사용자 요청 — "다가오는 주요 일정" → "대회/경기 현황" + 자세히 보기 */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-[19px] font-bold text-wtext-1 dark:text-white">대회/경기 현황</h3>
        <NavLink
          href={viewMoreHref}
          className="text-sm font-bold text-ice-500 dark:text-blue-400 flex items-center"
        >
          자세히 보기
          <Icon name="chevron_right" className="text-lg ml-0.5" aria-hidden="true" />
        </NavLink>
      </div>
      {events.length === 0 ? (
        <div className="bg-white dark:bg-rink-800 rounded-xl p-8 border border-wline-2 dark:border-rink-700 flex flex-col items-center justify-center gap-2">
          <div className="w-12 h-12 rounded-full bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
            <Icon name="emoji_events" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
          </div>
          <p className="text-sm text-wtext-3 dark:text-rink-300 text-center">
            등록된 대회/경기가 없습니다.
          </p>
        </div>
      ) : (
      <div className="flex flex-col gap-3" role="list" aria-label="주요 일정 목록">
        {events.map((event) => (
          <div
            key={event.id}
            role="listitem"
            className="bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline-2 dark:border-rink-700 flex items-center gap-4"
          >
            {/* 날짜 배지 */}
            <div className="flex flex-col items-center justify-center min-w-[56px] bg-wbg dark:bg-rink-700/50 rounded-xl py-2.5 border border-wline-2 dark:border-rink-700">
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider ${
                  event.isPriority ? 'text-ice-500 dark:text-blue-400' : 'text-wtext-3 dark:text-rink-300'
                }`}
              >
                {event.month}
              </span>
              <span className="text-xl font-extrabold text-wtext-1 dark:text-white mt-0.5">
                {event.day}
              </span>
            </div>

            {/* 이벤트 정보 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-bold text-wtext-1 dark:text-white truncate text-[15px]">
                  {event.title}
                </h4>
                <DdayBadge dDay={event.dDay} isPriority={event.isPriority} />
              </div>
              <p className="text-[13px] text-wtext-3 dark:text-rink-300 flex items-center gap-1 font-medium">
                <Icon name="location_on" className="text-[16px]" aria-hidden="true" />
                {event.location}
              </p>
            </div>

            {/* 메뉴 버튼 */}
            {onMenuClick && (
              <button
                onClick={() => onMenuClick(event.id)}
                className="text-wtext-4 dark:text-rink-500 hover:text-ice-500 dark:hover:text-ice-500 transition-colors shrink-0 p-1"
                aria-label="일정 메뉴"
              >
                <Icon name="more_vert" />
              </button>
            )}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}

// ─── D-day Badge ─────────────────────────────────────
function DdayBadge({ dDay, isPriority }: { dDay: number; isPriority: boolean }) {
  const colorClass = isPriority
    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800/30'
    : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300 border-wline dark:border-rink-700';

  return (
    <span
      className={`text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 ${colorClass}`}
    >
      D-{dDay}
    </span>
  );
}
