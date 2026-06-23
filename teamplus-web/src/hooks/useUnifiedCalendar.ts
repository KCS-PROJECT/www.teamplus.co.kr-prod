'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { weekColumnOf } from '@/lib/calendar-week';

/**
 * useUnifiedCalendar
 *
 * Backend: GET /api/v1/calendar?month=YYYY-MM
 * Response: CalendarDay[] = { date: 'YYYY-MM-DD', events: BackendCalendarEvent[] }
 *
 * BackendCalendarEvent = {
 *   type: 'TEAM_TRAINING' | 'PERSONAL_LESSON' | 'TOURNAMENT',
 *   color: '#DC2626' | '#16A34A' | '#0284C7',
 *   title, refId, refType: 'class_schedule' | 'tournament',
 *   timeStart: ISO, timeEnd: ISO
 * }
 *
 * Web 계층에서는 calendar-colors.ts 대분류 키(LESSON/REGULAR/GAME)로 매핑하여
 * 기존 UnifiedCalendarGrid 컴포넌트와 호환.
 */

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

type BackendEventType = 'TEAM_TRAINING' | 'PERSONAL_LESSON' | 'TOURNAMENT';
type WebEventType = 'REGULAR' | 'LESSON' | 'GAME';

interface BackendCalendarEvent {
  type: BackendEventType;
  color: string;
  title: string;
  refId: string;
  refType: 'class_schedule' | 'tournament';
  timeStart: string;
  timeEnd: string;
  /** 표시 시각 SoT (text "HH:mm") — ClassSchedule.start_time 입력 그대로. timeStart(ISO)는 호환용. */
  displayStart?: string | null;
  displayEnd?: string | null;
}

interface BackendCalendarDay {
  date: string;
  events: BackendCalendarEvent[];
}

/** 통합 캘린더 이벤트 (Web 계층 통합 모델) */
export interface CalendarEvent {
  id: string;
  /** calendar-colors.ts 키와 일치하는 대분류 타입 (LESSON / REGULAR / GAME) */
  type: WebEventType;
  /** 참조 종류 — 상세 라우팅에 사용 */
  refType: 'class_schedule' | 'tournament';
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  clubId: string | null;
  clubName: string | null;
}

/** 캘린더 그리드 날짜 셀 */
export interface UnifiedCalendarDay {
  date: number;
  dateKey: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  /** 해당 날짜의 고유 이벤트 타입 목록 (색상 점 렌더링용) */
  eventTypes: string[];
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

const BE_TO_WEB_TYPE: Record<BackendEventType, WebEventType> = {
  TEAM_TRAINING: 'REGULAR',
  PERSONAL_LESSON: 'LESSON',
  TOURNAMENT: 'GAME',
};

function getDateKey(value: Date | string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractHM(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildCalendarGrid(year: number, month: number, today: Date): UnifiedCalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = weekColumnOf(firstDay);
  const gridStart = new Date(year, month, 1 - firstDayOfWeek);
  const days: UnifiedCalendarDay[] = [];

  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);

    days.push({
      date: current.getDate(),
      dateKey: getDateKey(current),
      isCurrentMonth: current.getMonth() === month,
      isToday: getDateKey(current) === getDateKey(today),
      events: [],
      eventTypes: [],
    });
  }

  return days;
}

function formatMonthParam(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function mapBackendDaysToEvents(days: BackendCalendarDay[]): Record<string, CalendarEvent[]> {
  const map: Record<string, CalendarEvent[]> = {};

  for (const day of days) {
    const list: CalendarEvent[] = [];
    for (const be of day.events) {
      list.push({
        id: `${be.refType}:${be.refId}`,
        type: BE_TO_WEB_TYPE[be.type],
        refType: be.refType,
        title: be.title,
        date: day.date,
        // 표시 시각 — 백엔드 displayStart(text "HH:mm") 우선. 없으면 기존 ISO 폴백(extractHM).
        startTime: be.displayStart ?? extractHM(be.timeStart),
        endTime: be.displayEnd ?? extractHM(be.timeEnd),
        venue: null,
        clubId: null,
        clubName: null,
      });
    }
    if (list.length > 0) {
      map[day.date] = list;
    }
  }

  return map;
}

// ────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────

interface UseUnifiedCalendarOptions {
  /** 현재 미지원 — BE가 소속 팀 기준 필터를 수행. 향후 멀티 팀 UI 대비 예약. */
  clubId?: string;
  /**
   * 최초 진입 시 오늘 날짜를 자동 선택할지 여부 (기본 true).
   * 하단에 기간(주/달) 통합 리스트를 그리는 화면(parent-calendar)은 false 로
   * 두어 선택일 없이 기간 전체가 기본 노출되도록 한다.
   */
  defaultSelectToday?: boolean;
  /**
   * 학부모 자녀 선택 스코프 — 선택 자녀의 등록 수업 일정만 필터(parent-calendar).
   * 미지정/null 이면 미전송(백엔드 전체 자녀 통합 폴백). 학생 화면은 전달하지 않는다.
   */
  childId?: string | null;
}

interface UseUnifiedCalendarReturn {
  today: Date;
  todayKey: string;
  currentYear: number;
  currentMonth: number;
  monthLabel: string;
  selectedDateKey: string | null;
  setSelectedDateKey: (key: string | null) => void;
  calendarGrid: UnifiedCalendarDay[];
  selectedEvents: CalendarEvent[];
  selectedDateLabel: { month: number; day: number } | null;
  isLoading: boolean;
  errorMessage: string | null;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
}

export function useUnifiedCalendar(
  options: UseUnifiedCalendarOptions = {},
): UseUnifiedCalendarReturn {
  const { clubId: _clubId, defaultSelectToday = true, childId = null } = options;
  void _clubId; // 예약 — BE 필터 확장 시 사용

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [eventsMap, setEventsMap] = useState<Record<string, CalendarEvent[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(
    defaultSelectToday ? todayKey : null,
  );

  const fetchCalendarData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const monthParam = formatMonthParam(currentYear, currentMonth);

    const response = await api.get<BackendCalendarDay[]>('/calendar', {
      params: { month: monthParam, ...(childId ? { childId } : {}) },
      retry: false,
    });

    if (!response.success) {
      setEventsMap({});
      setErrorMessage(response.error?.message || MESSAGES.calendar.loadError);
      setIsLoading(false);
      return;
    }

    const days = Array.isArray(response.data) ? response.data : [];
    setEventsMap(mapBackendDaysToEvents(days));
    setIsLoading(false);
  }, [currentMonth, currentYear, childId]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const calendarGrid = useMemo(() => {
    const grid = buildCalendarGrid(currentYear, currentMonth, today);

    return grid.map((day) => {
      const events = eventsMap[day.dateKey] ?? [];
      const eventTypes = [...new Set(events.map((e) => e.type))];

      return {
        ...day,
        events,
        eventTypes,
      };
    });
  }, [eventsMap, currentMonth, currentYear, today]);

  const selectedEvents = useMemo(() => {
    if (!selectedDateKey) return [];
    return eventsMap[selectedDateKey] ?? [];
  }, [eventsMap, selectedDateKey]);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDateKey) return null;
    const date = new Date(selectedDateKey);
    return {
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  }, [selectedDateKey]);

  // [2026-05-18 BUG FIX] setCurrentMonth updater 안에서 setCurrentYear 호출 시
  // React 18 Strict Mode가 updater를 2회 실행하여 year가 2씩 증가 (2026/12 → 2028/01).
  // 분기를 외부로 옮겨 단일 호출 보장.
  const goToPrevMonth = useCallback(() => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDateKey(null);
  }, [currentMonth]);

  const goToNextMonth = useCallback(() => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDateKey(null);
  }, [currentMonth]);

  const goToToday = useCallback(() => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDateKey(todayKey);
  }, [today, todayKey]);

  const monthLabel = `${currentYear}년 ${currentMonth + 1}월`;

  return {
    today,
    todayKey,
    currentYear,
    currentMonth,
    monthLabel,
    selectedDateKey,
    setSelectedDateKey,
    calendarGrid,
    selectedEvents,
    selectedDateLabel,
    isLoading,
    errorMessage,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
  };
}
