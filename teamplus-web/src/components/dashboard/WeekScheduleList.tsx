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
  /**
   * [ICETIMES Phase 2b] ICETIMES flat 테마. 기본 false = 기존 스타일 그대로.
   *   true 시 외부 카드 shadow 제거 + flat it-surface/it-line, 오늘 배지 it-blue 강조.
   */
  iceTheme?: boolean;
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

export function WeekScheduleList({ groups, todayKey: todayKeyProp, renderDayClasses, iceTheme = false }: Props) {
  const [showPast, setShowPast] = useState(false);
  const todayKey = todayKeyProp ?? getTodayKey();

  // dateKey 는 YYYY-MM-DD 고정 포맷 — 문자열 비교로 날짜 순서 판별 가능.
  const pastGroups = groups.filter((g) => g.dateKey < todayKey);
  const upcomingGroups = groups.filter((g) => g.dateKey >= todayKey);

  const renderGroup = (g: WeekGroup) => {
    const isToday = g.dateKey === todayKey;
    return (
      <div key={g.dateKey} className="pt-3 pb-1">
        {/* [ICETIMES] iceTheme DayGroup 날짜 — 14px/800. 시안 DayGroup: 날짜 라벨은 ink,
             '오늘' 강조는 red pill 로만 (일정화면 ScheduleRangeList 와 통일). */}
        <span
          className={cn(
            'flex items-center gap-1.5 px-4 mb-1 tracking-[-0.01em]',
            iceTheme ? 'text-[14px] font-extrabold' : 'text-card-meta font-extrabold',
            isToday
              ? iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-ice-500'
              : 'text-wtext-2 dark:text-rink-100',
          )}
        >
          {/* ICETIMES(시안): 날짜 → '오늘' pill 순서. 기존(false): pill → 날짜. */}
          {iceTheme && formatDayHeading(g.dateKey)}
          {isToday && (
            <span className={cn(
              iceTheme
                ? 'rounded-w-pill bg-it-red-500 px-2 py-[2px] text-[11px] font-extrabold text-white'
                : 'rounded-w-pill bg-ice-500/10 dark:bg-ice-500/15 px-1.5 py-0.5 text-[11px] font-bold text-ice-500',
            )}>
              {MESSAGES.dashboard.weekSchedule.todayBadge}
            </span>
          )}
          {!iceTheme && formatDayHeading(g.dateKey)}
        </span>
        {renderDayClasses(g.classes)}
      </div>
    );
  };

  return (
    <div className={cn(
      'divide-y',
      // ICETIMES flat: 카드 박스(rounded/border/shadow) 제거 → 상위 full-bleed 섹션의
      //   흰 배경을 그대로 사용. 행 사이 hairline(it-line)만 유지. 기본 테마는 기존 카드 유지.
      iceTheme
        ? 'divide-it-line dark:divide-it-blue-900'
        : 'overflow-hidden rounded-w-xl border border-wline bg-wsurface shadow-sh-1 divide-wline-2 dark:border-rink-700 dark:bg-rink-800 dark:divide-rink-700',
    )}>
      {pastGroups.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          aria-expanded={showPast}
          className={cn(
            'flex w-full items-center justify-center gap-1 px-4 py-2.5 text-card-meta font-semibold text-wtext-3 dark:text-rink-300 transition-colors duration-150 motion-reduce:transition-none',
            iceTheme ? 'hover:bg-it-fill dark:hover:bg-it-blue-900' : 'hover:bg-wline-2 dark:hover:bg-rink-700',
          )}
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
