'use client';

/**
 * DirectorClassCalendar — 감독 홈 전용 캘린더 (2026-05-09)
 *
 * 공유 `ClassCalendarSection` 와 동일한 fetch 로직(`/teams/:teamId/classes` +
 * `/teams/:teamId/classes/:classId/schedules`) 을 재사용하되, 참고자료 "05 · 감독 홈"
 * 의 시각 명세를 100% 적용한 director 전용 변형.
 *
 * 시각 명세 (DESIGN spec — 비공유):
 *   - 카드 : radius 18, border 1px wline, shadow 0 4px 14px rgba(20,24,38,.04), padding 14/12/12
 *   - Month nav: 가운데 정렬 gap 24, chevron 28×28 transparent
 *   - Month text: 15px / 800 / -0.02em
 *   - 요일 head: 11px / 800 · 일=danger · 토=ice-500 · 평일=text-2
 *   - 일자 셀 : 38px 높이, 24×24 box (radius 7), 12px / 600 font-num,
 *               오늘=ice-500 솔리드 + 흰 글자, 도트 4×4
 *   - Legend  : top border, gap 14, 10px / 700, 정규 success / 오픈 ice-500 / 대회 danger
 *
 * 데이터 의존: 기존 API 그대로 (기능 변경 0).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '@/services/api-client';
import { classifyClass } from '@/lib/class-categories';
import { WEEKDAY_HEADERS, weekColumnOf, colIsSaturday, colIsSunday } from '@/lib/calendar-week';

interface ApiDataWrapper<T> {
  success?: boolean;
  data?: T;
}

interface TeamClass {
  id: string;
  className: string;
  trainingType?: string | null;
  academyId?: string | null;
  teamId?: string | null;
  instructorName: string;
  startTime: string;
  endTime: string;
}

interface ClassSchedule {
  id: string;
  scheduledDate: string;
  isCancelled?: boolean;
}

export interface CalendarClass {
  id: string;
  classId: string;
  title: string;
  time: string;
  coach: string;
  location: string;
  type: string;
}

export interface CalendarSelection {
  dateKey: string | null;
  classes: CalendarClass[];
}

interface Props {
  teamIds: { id: string; name: string }[];
  onSelectionChange?: (payload: CalendarSelection) => void;
}

const WEEK_HEAD = WEEKDAY_HEADERS;

function getDateKey(value: Date | string): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTimeRange(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${fmt.format(start)} - ${fmt.format(end)}`;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return ((payload as ApiDataWrapper<T>).data ?? null) as T | null;
  }
  return (payload ?? null) as T | null;
}

function inferType(item: { academyId?: string | null }): 'REGULAR' | 'OPEN' {
  return classifyClass(item) === 'open' ? 'OPEN' : 'REGULAR';
}

// 도트 색상 — REGULAR=mint(success), OPEN=ice, TOURNAMENT=flame(danger)
function dotColor(type: string): string {
  if (type === 'OPEN') return 'var(--c-ice-500, #2f5fff)';
  if (type === 'TOURNAMENT') return 'var(--c-flame-500, #ff5a36)';
  return 'var(--c-mint-500, #00d4a8)';
}

export function DirectorClassCalendar({ teamIds, onSelectionChange }: Props) {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);
  const [classesMap, setClassesMap] = useState<Record<string, CalendarClass[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (teamIds.length === 0) {
      setClassesMap({});
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const classResults = await Promise.all(
      teamIds.map(async (team) => {
        const res = await api.get<TeamClass[] | ApiDataWrapper<TeamClass[]>>(
          `/teams/${team.id}/classes`,
          { retry: false },
        );
        const list = res.success ? unwrap<TeamClass[]>(res.data) : [];
        return Array.isArray(list)
          ? list.map((cls) => ({ ...cls, teamId: team.id, teamName: team.name }))
          : [];
      }),
    );
    const allClasses = classResults.flat();
    if (allClasses.length === 0) {
      setClassesMap({});
      setIsLoading(false);
      return;
    }

    const scheduleResults = await Promise.all(
      allClasses.map(async (cls) => {
        const res = await api.get<ClassSchedule[] | ApiDataWrapper<ClassSchedule[]>>(
          `/teams/${cls.teamId}/classes/${cls.id}/schedules`,
          {
            params: {
              startDate: monthStart.toISOString(),
              endDate: monthEnd.toISOString(),
            },
            retry: false,
          },
        );
        return { cls, schedules: res.success ? unwrap<ClassSchedule[]>(res.data) ?? [] : [] };
      }),
    );

    const next: Record<string, CalendarClass[]> = {};
    scheduleResults.forEach(({ cls, schedules }) => {
      if (!Array.isArray(schedules)) return;
      schedules.forEach((schedule) => {
        if (schedule.isCancelled) return;
        const key = getDateKey(schedule.scheduledDate);
        const item: CalendarClass = {
          id: schedule.id,
          classId: cls.id,
          title: cls.className,
          time: formatTimeRange(cls.startTime, cls.endTime),
          coach: cls.instructorName,
          location: cls.teamName,
          type: inferType(cls),
        };
        if (!next[key]) next[key] = [];
        next[key].push(item);
      });
    });
    Object.keys(next).forEach((k) => {
      next[k] = [...next[k]].sort((a, b) => a.time.localeCompare(b.time));
    });
    setClassesMap(next);
    setIsLoading(false);
  }, [teamIds, month, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!onSelectionChange) return;
    onSelectionChange({
      dateKey: selectedKey,
      classes: selectedKey ? classesMap[selectedKey] ?? [] : [],
    });
  }, [selectedKey, classesMap, onSelectionChange]);

  // 그리드: 첫째 주 빈 셀 + 1~말일 + 마지막 주 빈 셀 (총 6주, 42셀)
  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startOffset = weekColumnOf(firstDay);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const cells: { date: number | null; key: string | null; dow: number }[] = [];
    for (let i = 0; i < 42; i += 1) {
      const dayNum = i - startOffset + 1;
      if (dayNum < 1 || dayNum > lastDay) {
        cells.push({ date: null, key: null, dow: i % 7 });
      } else {
        const cur = new Date(year, month, dayNum);
        cells.push({ date: dayNum, key: getDateKey(cur), dow: i % 7 });
      }
    }
    return cells;
  }, [year, month]);

  const goPrev = useCallback(() => {
    setMonth((m) => (m === 0 ? 11 : m - 1));
    if (month === 0) setYear((y) => y - 1);
  }, [month]);
  const goNext = useCallback(() => {
    setMonth((m) => (m === 11 ? 0 : m + 1));
    if (month === 11) setYear((y) => y + 1);
  }, [month]);

  const monthLabel = `${year}년 ${month + 1}월`;

  return (
    <div
      className="bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700"
      style={{
        borderRadius: 18,
        boxShadow: '0 4px 14px rgba(20,24,38,0.04)',
        padding: '14px 12px 12px',
      }}
    >
      {/* Month nav — 가운데 정렬 */}
      <div
        className="flex items-center justify-center"
        style={{ gap: 24, padding: '4px 0 14px' }}
      >
        <button
          type="button"
          onClick={goPrev}
          aria-label="이전 달"
          style={{ width: 28, height: 28, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 3l-4 4 4 4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="text-wtext-2 dark:text-rink-100" />
          </svg>
        </button>
        <span
          className="text-wtext-1 dark:text-white tabular-nums"
          style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}
        >
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={goNext}
          aria-label="다음 달"
          style={{ width: 28, height: 28, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="text-wtext-2 dark:text-rink-100" />
          </svg>
        </button>
      </div>

      {/* 요일 head */}
      <div className="grid grid-cols-7" style={{ padding: '0 4px 6px' }}>
        {WEEK_HEAD.map((w, i) => (
          <div
            key={w}
            className={
              colIsSunday(i)
                ? 'text-flame-500'
                : colIsSaturday(i)
                ? 'text-ice-500'
                : 'text-wtext-2 dark:text-rink-200'
            }
            style={{ textAlign: 'center', fontSize: 11, fontWeight: 800 }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 일자 그리드 */}
      <div
        className="grid grid-cols-7"
        style={{ rowGap: 2, padding: '0 4px' }}
        role="grid"
        aria-label={monthLabel}
      >
        {grid.map((cell, idx) => {
          const isReal = cell.date !== null && cell.key !== null;
          const isToday = isReal && cell.key === todayKey;
          const isSelected = isReal && cell.key === selectedKey;
          const types = (isReal && cell.key && classesMap[cell.key]) || [];
          const isSun = colIsSunday(cell.dow);
          const isSat = colIsSaturday(cell.dow);

          return (
            <button
              type="button"
              key={`cell-${idx}`}
              onClick={() => isReal && cell.key && setSelectedKey(cell.key)}
              disabled={!isReal}
              aria-disabled={!isReal}
              aria-label={isReal ? `${month + 1}월 ${cell.date}일${isToday ? ' 오늘' : ''}` : undefined}
              style={{
                height: 38,
                background: 'transparent',
                border: 'none',
                cursor: isReal ? 'pointer' : 'default',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                position: 'relative',
              }}
            >
              <div
                className={
                  isToday || isSelected
                    ? 'bg-ice-500 text-white'
                    : isReal
                    ? isSun
                      ? 'text-flame-500'
                      : isSat
                      ? 'text-ice-500'
                      : 'text-wtext-1 dark:text-white'
                    : 'text-wtext-4 dark:text-rink-500'
                }
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: isToday || isSelected ? 800 : 600,
                  fontFamily: 'var(--font-num, inherit)',
                }}
              >
                {cell.date ?? ''}
              </div>
              <div style={{ display: 'flex', gap: 2, height: 4 }}>
                {types.slice(0, 3).map((c, i) => (
                  <span
                    key={`d-${i}`}
                    aria-hidden="true"
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: dotColor(c.type),
                    }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div
        className="border-t border-wline-2 dark:border-rink-700 flex items-center justify-center"
        style={{ marginTop: 10, paddingTop: 10, gap: 14 }}
      >
        {[
          { label: '정규훈련', color: 'var(--c-mint-500, #00d4a8)' },
          { label: '오픈클래스', color: 'var(--c-ice-500, #2f5fff)' },
          { label: '대회', color: 'var(--c-flame-500, #ff5a36)' },
        ].map((l) => (
          <div
            key={l.label}
            className="inline-flex items-center"
            style={{ gap: 5 }}
          >
            <span
              aria-hidden="true"
              style={{ width: 6, height: 6, borderRadius: '50%', background: l.color }}
            />
            <span
              className="text-wtext-2 dark:text-rink-200"
              style={{ fontSize: 10, fontWeight: 700 }}
            >
              {l.label}
            </span>
          </div>
        ))}
      </div>
      {/* (2026-05-11) dead code `{isLoading ? null : null}` 정리 — isLoading 은
          내부 fetch 상태로만 사용 (그리드 자체는 buildCalendarGrid 가 동기 생성하여
          isLoading 과 무관하게 항상 mount). 깜빡임 없음. */}
    </div>
  );
}

export default DirectorClassCalendar;
