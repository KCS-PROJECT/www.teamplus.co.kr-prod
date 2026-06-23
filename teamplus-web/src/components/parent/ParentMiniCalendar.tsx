'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';
import { WEEKDAY_HEADERS, weekColumnOf, colIsSaturday, colIsSunday } from '@/lib/calendar-week';

/**
 * ParentMiniCalendar — 학부모 대시보드 월별 미니 캘린더.
 *
 * 설계서 §4.1 ④ + §7.1 색상 반전 규칙:
 *  - team_training  → 🟢 emerald (정규 훈련)
 *  - team_tournament → 🔵 blue   (팀 대회)
 *  - open_lesson    → 🔴 rose   (레슨 일정)
 *
 * 전역 calendar-colors.ts 는 Phase 1 에서 건드리지 않고, 이 컴포넌트 전용
 * PARENT_CALENDAR_COLORS 상수를 파일 내부에 정의한다(영향 격리).
 */

export type ParentCalendarEventType =
  | 'team_training'
  | 'team_tournament'
  | 'open_lesson';

export interface ParentCalendarEvent {
  /** YYYY-MM-DD */
  date: string;
  type: ParentCalendarEventType;
  /**
   * 2026-04-27: 이 일정이 속한 자녀 ID 목록.
   * 형제자매가 같은 수업에 등록된 경우 다건. undefined 이면 필터링에서 제외하지 않음
   * (백엔드 응답에 누락된 레거시 데이터 보호용).
   */
  childIds?: string[];
}

interface ParentMiniCalendarProps {
  /** 이벤트 배열 — 빈 배열 OK(그리드만 렌더) */
  events?: ParentCalendarEvent[];
  /** 전체 캘린더 페이지 경로 */
  viewAllHref?: string;
  /**
   * 선택된 자녀 ID.
   *  - undefined/null = 전체 보기 (모든 일정 표시)
   *  - 문자열         = 해당 자녀가 등록된 수업 일정만 표시
   * 이벤트의 childIds 가 비어있으면 폴백으로 전체 표시 (레거시 데이터 안전장치).
   */
  childId?: string;
  /**
   * 2026-04-27 (방안 A · D-06): 선택된 날짜 키 YYYY-MM-DD.
   * 부모가 controlled 로 관리. 미지정 시 시각적 강조만 비활성 (오늘 표시는 유지).
   */
  selectedDateKey?: string;
  /** 셀 클릭 시 선택 변경 콜백. 동일 날짜 재클릭 시 null 로 호출하지 않음(현 셀 유지) */
  onDateSelect?: (dateKey: string) => void;
}

/** 설계서 §7.1 매핑 — 학부모 전용 캘린더 색상(파일 스코프 격리). */
const PARENT_CALENDAR_COLORS: Record<ParentCalendarEventType, string> = {
  team_training: 'bg-emerald-500',
  team_tournament: 'bg-blue-500',
  open_lesson: 'bg-rose-500',
};

const DAY_LABELS = WEEKDAY_HEADERS;

function buildMonthGrid(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = weekColumnOf(firstDay);
  const totalDays = lastDay.getDate();

  const cells: Array<Date | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function ParentMiniCalendar({
  events = [],
  viewAllHref = '/parent-calendar',
  childId,
  selectedDateKey,
  onDateSelect,
}: ParentMiniCalendarProps) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayKey = toDateKey(now);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  /**
   * 날짜별 이벤트 타입 모음(중복 제거).
   * 2026-04-27: childId 가 주어지면 해당 자녀가 등록된 일정만 포함.
   * childIds 가 비어있는 이벤트는 안전장치로 표시(레거시 데이터 호환).
   */
  const eventMap = useMemo(() => {
    const map = new Map<string, Set<ParentCalendarEventType>>();
    for (const ev of events) {
      if (childId && ev.childIds && ev.childIds.length > 0) {
        if (!ev.childIds.includes(childId)) continue;
      }
      const set = map.get(ev.date) ?? new Set();
      set.add(ev.type);
      map.set(ev.date, set);
    }
    return map;
  }, [events, childId]);

  return (
    <section
      aria-label="월별 일정 미니 캘린더"
      className="rounded-2xl border border-wline-2 bg-white p-4 shadow-sm dark:border-rink-700 dark:bg-rink-800"
    >
      {/* 헤더 */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-wtext-1 dark:text-white">
          {year}년 {month + 1}월
        </h2>
        <NavLink
          href={viewAllHref}
          className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold text-wtext-3 hover:text-ice-500 dark:text-rink-300"
          aria-label="전체 캘린더 보기"
        >
          전체 캘린더
          <Icon name="chevron_right" className="text-base" aria-hidden="true" />
        </NavLink>
      </div>

      {/* 범례 — 설계서 §7.1 */}
      <div className="mb-3 flex items-center gap-3 text-[11px] text-wtext-3 dark:text-rink-300">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          정규훈련
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
          팀 대회
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />
          레슨
        </span>
      </div>

      {/* 요일 행 */}
      <div
        className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-wtext-3 dark:text-rink-300"
        role="row"
      >
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            role="columnheader"
            className={cn(
              colIsSunday(i) && 'text-rose-500',
              colIsSaturday(i) && 'text-blue-500',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 그리드 */}
      <div
        role="grid"
        aria-label={`${year}년 ${month + 1}월 일정`}
        className="grid grid-cols-7 gap-1"
      >
        {cells.map((cell, idx) => {
          if (!cell) {
            return (
              <div
                key={`empty-${idx}`}
                role="gridcell"
                aria-hidden="true"
                className="aspect-square"
              />
            );
          }
          const key = toDateKey(cell);
          const isToday = key === todayKey;
          const isSelected = key === selectedDateKey;
          const dow = cell.getDay();
          const eventTypes = eventMap.get(key);

          // 2026-04-27 방안 A: 셀을 button 으로 변환하여 클릭 가능.
          // 선택일 강조는 ring-2 ring-ice-500 (오늘 bg-ice-500/10 과 시각적 구분).
          // onDateSelect 미제공 시 button 은 유지하되 onClick 무동작 (controlled 만 비활성).
          const cellClassName = cn(
            'relative flex aspect-square w-full flex-col items-center justify-start rounded-lg py-1 text-xs transition-colors motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/50',
            isSelected && 'ring-2 ring-ice-500',
            isToday
              ? 'bg-ice-500/10 font-bold text-ice-500'
              : cn(
                  'text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700/50',
                  dow === 0 && 'text-rose-500 dark:text-rose-400',
                  dow === 6 && 'text-blue-500 dark:text-blue-400',
                ),
          );

          const cellContent = (
            <>
              <span className="tabular-nums">{cell.getDate()}</span>
              {eventTypes && eventTypes.size > 0 && (
                <div className="mt-0.5 flex gap-0.5" aria-hidden="true">
                  {Array.from(eventTypes).map((type) => (
                    <span
                      key={type}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        PARENT_CALENDAR_COLORS[type],
                      )}
                    />
                  ))}
                </div>
              )}
            </>
          );

          const ariaLabel = `${cell.getMonth() + 1}월 ${cell.getDate()}일${isToday ? ' (오늘)' : ''}${isSelected ? ' (선택됨)' : ''}`;

          return (
            <div key={key} role="gridcell" className="contents">
              <button
                type="button"
                aria-label={ariaLabel}
                aria-pressed={isSelected}
                onClick={() => onDateSelect?.(key)}
                className={cellClassName}
              >
                {cellContent}
              </button>
            </div>
          );
        })}
      </div>

      {/* 빈 상태 안내 — 필터 적용 후 0건일 때(자녀 슬라이드 변경 케이스 포함) */}
      {eventMap.size === 0 && (
        <p className="mt-3 text-center text-[11px] text-wtext-3 dark:text-rink-300">
          이번 달 일정이 아직 연동되지 않았어요
        </p>
      )}
    </section>
  );
}

export default ParentMiniCalendar;
