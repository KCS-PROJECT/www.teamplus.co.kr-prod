'use client';

/**
 * WeekScheduleList — 대시보드 "이번주 일정" 공용 리스트 (감독/오픈클래스감독/학부모 홈).
 *  - weekGroups(일~토 수업 있는 날)를 받아 오늘 이전 날짜는 기본 접힘 처리.
 *  - 지난 날짜가 있으면 상단에 "지난 일정 N일 보기" 토글 — 펼치면 위에 그대로 노출.
 *  - 오늘 그룹 헤딩은 "오늘" 배지 + ice-500 강조로 시각 기준점 제공.
 *  - 날짜별 수업 행 렌더는 renderDayClasses 로 위임 — 페이지별
 *    SelectedDayClassList props(canManage / 출석 처리 콜백 등) 차이를 흡수.
 *  - 빈 그룹([]) 처리는 호출 페이지가 담당 (기존 EmptyCard 분기 유지).
 */

import { useState, type ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type { CalendarClass } from '@/components/dashboard/ClassCalendarSection';

interface WeekGroup {
  dateKey: string;
  classes: CalendarClass[];
}

interface Props {
  groups: WeekGroup[];
  /** YYYY-MM-DD. 미지정 시 내부에서 오늘로 계산. */
  todayKey?: string;
  /** 날짜 그룹 하나의 수업 리스트 렌더 (SelectedDayClassList ... bare) */
  renderDayClasses: (classes: CalendarClass[]) => ReactNode;
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayHeading(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${wd})`;
}

export function WeekScheduleList({ groups, todayKey: todayKeyProp, renderDayClasses }: Props) {
  const [showPast, setShowPast] = useState(false);
  const todayKey = todayKeyProp ?? getTodayKey();

  // dateKey 는 YYYY-MM-DD 고정 포맷 — 문자열 비교로 날짜 순서 판별 가능.
  const pastGroups = groups.filter((g) => g.dateKey < todayKey);
  const upcomingGroups = groups.filter((g) => g.dateKey >= todayKey);

  const renderGroup = (g: WeekGroup) => {
    const isToday = g.dateKey === todayKey;
    return (
      <div key={g.dateKey} className="pt-3 pb-1">
        <span
          className={cn(
            'flex items-center gap-1.5 px-4 mb-1 text-card-meta font-extrabold tracking-[-0.01em]',
            isToday ? 'text-ice-500' : 'text-wtext-2 dark:text-rink-100',
          )}
        >
          {isToday && (
            <span className="rounded-w-pill bg-ice-500/10 dark:bg-ice-500/15 px-1.5 py-0.5 text-[11px] font-bold text-ice-500">
              {MESSAGES.dashboard.weekSchedule.todayBadge}
            </span>
          )}
          {formatDayHeading(g.dateKey)}
        </span>
        {renderDayClasses(g.classes)}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-w-xl border border-wline bg-wsurface shadow-sh-1 divide-y divide-wline-2 dark:border-rink-700 dark:bg-rink-800 dark:divide-rink-700">
      {pastGroups.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          aria-expanded={showPast}
          className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-card-meta font-semibold text-wtext-3 dark:text-rink-300 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors duration-150 motion-reduce:transition-none"
        >
          <Icon
            name={showPast ? 'expand_less' : 'expand_more'}
            className="text-[18px]"
            aria-hidden="true"
          />
          {showPast
            ? MESSAGES.dashboard.weekSchedule.pastToggleHide
            : MESSAGES.dashboard.weekSchedule.pastToggleShow(pastGroups.length)}
        </button>
      )}
      {showPast && pastGroups.map(renderGroup)}
      {upcomingGroups.map(renderGroup)}
      {upcomingGroups.length === 0 && pastGroups.length > 0 && (
        <p className="px-4 py-4 text-center text-card-meta text-wtext-3 dark:text-rink-300">
          {MESSAGES.dashboard.weekSchedule.noRemaining}
        </p>
      )}
    </div>
  );
}
