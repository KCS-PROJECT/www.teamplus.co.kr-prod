'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { classifyClass } from '@/lib/class-categories';
import { weekColumnOf } from '@/lib/calendar-week';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface CalendarClass {
  /** ClassSchedule.id (목록 키 용) */
  id: string;
  /** Class.id — 상세 페이지 라우팅에 사용 */
  classId: string;
  title: string;
  time: string;
  coach: string;
  location: string;
  type: string;
}

export interface CalendarDay {
  date: number;
  dateKey: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  classes: CalendarClass[];
  trainingTypes: string[];
}

interface ApiDataWrapper<T> {
  success?: boolean;
  data?: T;
}

interface UserClub {
  id: string;
  clubName: string;
}

interface ClubClass {
  id: string;
  className: string;
  trainingType?: string | null;
  /** 분류 SoT — 외래키 기반 (regular/open 식별) */
  academyId?: string | null;
  teamId?: string | null;
  instructorName: string;
  startTime: string | null;
  endTime: string | null;
}

interface ClassSchedule {
  id: string;
  scheduledDate: string;
  isCancelled?: boolean;
  // [2026-06-10] 오픈클래스 회차별 실제 시각("HH:mm") — 있으면 대표 시간보다 우선.
  startTime?: string | null;
  endTime?: string | null;
}

export type ClubFetchStrategy = 'my' | 'managed-with-fallback' | 'academy-only';

// ────────────────────────────────────────────
// Utility Functions
// ────────────────────────────────────────────

export function getDateKey(value: Date | string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function unwrapData<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiDataWrapper<T>).data ?? null;
  }
  return (payload as T) ?? null;
}

function formatMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const minutes = String(normalized % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function parseTimeLabel(value: string | null | undefined): number | null {
  if (!value) return null;

  const trimmed = value.trim();
  const timeOnlyMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (timeOnlyMatch) {
    const hours = Number(timeOnlyMatch[1]);
    const minutes = Number(timeOnlyMatch[2]);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getHours() * 60 + date.getMinutes();
}

function getFallbackTiming(
  cls: { academyId?: string | null },
  fallbackIndex: number,
): { startMinutes: number; endMinutes: number } {
  const inferredType = inferTrainingType(cls);

  // 분류별 시간 폴백 — 시작 시간이 응답에 없을 때 사용.
  const presets: Record<string, { startMinutes: number; durationMinutes: number; stepMinutes: number }> = {
    REGULAR: { startMinutes: 18 * 60, durationMinutes: 120, stepMinutes: 45 },
    OPEN: { startMinutes: 16 * 60 + 30, durationMinutes: 90, stepMinutes: 45 },
  };

  const preset = presets[inferredType] ?? presets.REGULAR;
  const startMinutes = preset.startMinutes + fallbackIndex * preset.stepMinutes;
  return {
    startMinutes,
    endMinutes: startMinutes + preset.durationMinutes,
  };
}

function formatTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  options: {
    /** 외래키 기반 분류 (academyId 유무로 시간 폴백 프리셋 결정) */
    cls: { academyId?: string | null };
    fallbackIndex?: number;
  },
): string {
  const fallback = getFallbackTiming(options.cls, options.fallbackIndex ?? 0);

  const startMinutes = parseTimeLabel(startTime);
  const endMinutes = parseTimeLabel(endTime);
  const hasPlaceholderMidnight = startMinutes === 0 && endMinutes === 0;

  if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes && !hasPlaceholderMidnight) {
    return `${formatMinutes(startMinutes)} ~ ${formatMinutes(endMinutes)}`;
  }

  if (startMinutes !== null && !hasPlaceholderMidnight) {
    const durationMinutes = fallback.endMinutes - fallback.startMinutes;
    return `${formatMinutes(startMinutes)} ~ ${formatMinutes(startMinutes + durationMinutes)}`;
  }

  if (endMinutes !== null && !hasPlaceholderMidnight) {
    const durationMinutes = fallback.endMinutes - fallback.startMinutes;
    return `${formatMinutes(endMinutes - durationMinutes)} ~ ${formatMinutes(endMinutes)}`;
  }

  return `${formatMinutes(fallback.startMinutes)} ~ ${formatMinutes(fallback.endMinutes)}`;
}

function getTimeSortValue(timeRange: string): number {
  const match = timeRange.match(/^(\d{2}):(\d{2})/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * 캘린더 색상 키 매핑.
 *
 * [2026-05-08] className 문자열 휴리스틱 제거. 외래키(`academyId`) 기반 명확한 분류로 교체.
 *  - academyId 있음 → 'OPEN'  (오픈클래스, 파랑)
 *  - 그 외          → 'REGULAR' (정규 수업, 초록)
 *
 * 'TOURNAMENT' (대회) 는 별 도메인(Tournament 모델) 에서 별도 페치 후 머지 — Phase 4-B.
 */
function inferTrainingType(item: {
  academyId?: string | null;
  trainingType?: string | null;
}): 'REGULAR' | 'OPEN' {
  if (classifyClass(item) === 'open') return 'OPEN';
  return 'REGULAR';
}

export function buildCalendarGrid(year: number, month: number, today: Date): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = weekColumnOf(firstDay);
  const gridStart = new Date(year, month, 1 - firstDayOfWeek);
  const days: CalendarDay[] = [];

  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);

    days.push({
      date: current.getDate(),
      dateKey: getDateKey(current),
      isCurrentMonth: current.getMonth() === month,
      isToday: getDateKey(current) === getDateKey(today),
      classes: [],
      trainingTypes: [],
    });
  }

  return days;
}

// ────────────────────────────────────────────
// Team Fetch Strategies
// ────────────────────────────────────────────

async function fetchClubsMy(): Promise<{ clubs: UserClub[] | null; errorMessage: string | null }> {
  const response = await api.get<UserClub[] | ApiDataWrapper<UserClub[]>>('/teams/my/list', {
    retry: false,
  });

  if (!response.success) {
    return {
      clubs: null,
      errorMessage: response.error?.message || MESSAGES.error.general,
    };
  }

  return { clubs: unwrapData<UserClub[]>(response.data), errorMessage: null };
}

interface UserAcademy {
  id: string;
  name: string;
}

// ACADEMY_DIRECTOR/COACH/DIRECTOR 가 운영하는 학원 목록.
// 대시보드 ClassCalendarSection 과 동일 동선 — /academies/my/list → /academies/{id}/classes.
async function fetchAcademiesManaged(): Promise<UserAcademy[]> {
  const res = await api.get<UserAcademy[] | ApiDataWrapper<UserAcademy[]>>('/academies/my/list', {
    retry: false,
  });
  if (!res.success) return [];
  const list = unwrapData<UserAcademy[]>(res.data);
  return Array.isArray(list) ? list : [];
}

async function fetchClubsManagedWithFallback(): Promise<{ clubs: UserClub[] | null; errorMessage: string | null }> {
  const managedRes = await api.get<UserClub[] | ApiDataWrapper<UserClub[]>>('/teams/managed/list', {
    retry: false,
  });

  if (managedRes.success) {
    const clubs = unwrapData<UserClub[]>(managedRes.data);
    if (Array.isArray(clubs) && clubs.length > 0) {
      return { clubs, errorMessage: null };
    }
  }

  // 폴백: /teams/my/list
  const myRes = await api.get<UserClub[] | ApiDataWrapper<UserClub[]>>('/teams/my/list', {
    retry: false,
  });

  if (myRes.success) {
    return { clubs: unwrapData<UserClub[]>(myRes.data), errorMessage: null };
  }

  return {
    clubs: null,
    errorMessage: managedRes.error?.message || MESSAGES.error.general,
  };
}

// ────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────

interface UseCalendarOptions {
  /** 팀 조회 전략: 'my' (학생/학부모) | 'managed-with-fallback' (코치) */
  clubFetchStrategy?: ClubFetchStrategy;
}

interface UseCalendarReturn {
  today: Date;
  todayKey: string;
  currentYear: number;
  currentMonth: number;
  monthLabel: string;
  selectedDateKey: string | null;
  setSelectedDateKey: (key: string | null) => void;
  calendarGrid: CalendarDay[];
  selectedClasses: CalendarClass[];
  selectedDateLabel: { month: number; day: number } | null;
  isLoading: boolean;
  errorMessage: string | null;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
}

export function useCalendar(options: UseCalendarOptions = {}): UseCalendarReturn {
  const { clubFetchStrategy = 'my' } = options;

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(todayKey);
  const [classesMap, setClassesMap] = useState<Record<string, CalendarClass[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchCalendarData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

    // 역할별 데이터 조회 — 'my' (학생/학부모) · 'managed-with-fallback' (코치/감독)
    //   둘 다 팀만 (팀↔오픈 도메인 분리). 'academy-only' (ACADEMY_DIRECTOR) 는 학원만.
    //   팀 감독은 학원을 운영할 수 없어 academies 응답이 항상 0건이므로 호출 자체를 스킵.
    const isManagedStrategy = clubFetchStrategy === 'managed-with-fallback';
    const isAcademyOnly = clubFetchStrategy === 'academy-only';
    const [clubsResult, managedAcademies] = await Promise.all([
      isAcademyOnly
        ? Promise.resolve({ clubs: [], errorMessage: null } as { clubs: UserClub[] | null; errorMessage: string | null })
        : isManagedStrategy
          ? fetchClubsManagedWithFallback()
          : fetchClubsMy(),
      isAcademyOnly ? fetchAcademiesManaged() : Promise.resolve([]),
    ]);
    const { clubs, errorMessage: clubError } = clubsResult;

    if (clubError) {
      setErrorMessage(clubError);
    }
    const safeClubs = Array.isArray(clubs) ? clubs : [];

    // 팀별 수업 목록 조회 (clubs 가 없으면 빈 배열)
    const classResults = safeClubs.length === 0
      ? [] as Array<Array<ClubClass & { clubId: string; clubName: string }>>
      : await Promise.all(
          safeClubs.map(async (club) => {
            const response = await api.get<ClubClass[] | ApiDataWrapper<ClubClass[]>>(
              `/teams/${club.id}/classes`,
              { retry: false }
            );
            const classes = response.success ? unwrapData<ClubClass[]>(response.data) : [];
            return Array.isArray(classes)
              ? classes.map((cls) => ({ ...cls, clubId: club.id, clubName: club.clubName }))
              : [];
          })
        );

    // 학원별 수업 목록 — 대시보드(ClassCalendarSection) 와 동일 동선. clubId='__academy__' sentinel.
    const academyClassResults = managedAcademies.length === 0
      ? [] as Array<Array<ClubClass & { clubId: string; clubName: string }>>
      : await Promise.all(
          managedAcademies.map(async (academy) => {
            const response = await api.get<ClubClass[] | ApiDataWrapper<ClubClass[]>>(
              `/academies/${academy.id}/classes`,
              { retry: false }
            );
            const classes = response.success ? unwrapData<ClubClass[]>(response.data) : [];
            return Array.isArray(classes)
              ? classes.map((cls) => ({
                  ...cls,
                  // academyId 는 응답 페이로드에 이미 포함됨 — 누락 시 폴백
                  academyId: cls.academyId ?? academy.id,
                  clubId: '__academy__',
                  clubName: academy.name,
                }))
              : [];
          })
        );

    const allClasses = [...classResults.flat(), ...academyClassResults.flat()];

    // [추가 2026-05-15] 오픈클래스(teamId=null, academyId 보유) 도 캘린더에 노출.
    //  · `/classes?category=open` → backend 가 ClassTeamVisibility 매칭 처리.
    //  · 코치/감독이 학원에 직접 소속되지 않아도 본인 팀이 visibility 등록된 오픈클래스
    //    일정이 캘린더에 표시되도록 머지. (수업목록 / dashboard/calendar 정합)
    interface OpenClassRow {
      id: string;
      className: string;
      instructorName?: string;
      startTime: string;
      endTime: string;
      trainingType?: string;
      academyId?: string | null;
      academy?: { name?: string } | null;
    }
    // ClassTeamVisibility 매칭 오픈클래스 fetch — 학부모/자녀('my') 시야에만 한정.
    //   코치/감독에는 노출하지 않음 (팀↔오픈 도메인 분리). 'academy-only' 도 viewer
    //   TEAM 이 없어 호출 무의미 — 동일하게 스킵.
    const shouldFetchVisibilityOpenClasses = clubFetchStrategy === 'my' && safeClubs.length > 0;
    const openClassRes = shouldFetchVisibilityOpenClasses
      ? await api.get<OpenClassRow[] | ApiDataWrapper<OpenClassRow[]> | { data?: OpenClassRow[] }>(
          '/classes',
          // [수정 2026-05-15] limit 50 — backend DTO 가 50 이하만 허용 (100 → 400 에러).
          { params: { category: 'open', limit: 50 }, retry: false },
        )
      : { success: false as const, data: undefined };
    const openClassesRaw: OpenClassRow[] = openClassRes.success
      ? (() => {
          const inner = unwrapData<OpenClassRow[] | { data?: OpenClassRow[] }>(openClassRes.data);
          if (Array.isArray(inner)) return inner;
          return (inner as { data?: OpenClassRow[] })?.data ?? [];
        })()
      : [];
    // [수정 2026-05-15] academyId 필수 매핑 — classifyClass 가 academyId 유무로
    //  'open' 분류하므로 누락 시 'regular' 로 폴백되어 캘린더 초록색 표시 회귀.
    // [수정 2026-05-18] managedAcademies 에 이미 포함된 학원의 오픈클래스는 제외 —
    //  ACADEMY_DIRECTOR 가 본인 학원 수업을 `__academy__` 경로로 이미 가져온 뒤
    //  같은 클래스가 `__open__` 경로로 재유입되어 schedule.id 가 중복되는 React key 충돌 차단.
    const managedAcademyIds = new Set(managedAcademies.map((a) => a.id));
    const openClassesAsClub: Array<ClubClass & { clubId: string; clubName: string; academyId: string | null }> = openClassesRaw
      .filter((o) => !o.academyId || !managedAcademyIds.has(o.academyId))
      .map((o) => ({
        id: o.id,
        className: o.className,
        instructorName: o.instructorName ?? '',
        startTime: o.startTime,
        endTime: o.endTime,
        trainingType: o.trainingType ?? 'lesson',
        academyId: o.academyId ?? null,
        // 오픈클래스: clubId=null sentinel, clubName=학원명
        clubId: '__open__',
        clubName: o.academy?.name ?? '오픈클래스',
      } as ClubClass & { clubId: string; clubName: string; academyId: string | null }));

    // [수정 2026-04-30] allClasses 가 비어도 tournament/match 는 fetch 하도록 early return 제거.
    // 수업별 스케줄 조회 (팀 수업 + 오픈클래스 통합)
    const mergedClasses = [...allClasses, ...openClassesAsClub];
    const scheduleResults = mergedClasses.length === 0
      ? [] as Array<{ cls: ClubClass & { clubId: string; clubName: string }; schedules: ClassSchedule[] }>
      : await Promise.all(
      mergedClasses.map(async (cls) => {
        // 스케줄 엔드포인트 분기 — 대시보드 ClassCalendarSection ownerKind 패턴과 동일.
        //   __open__   : visibility 매칭 오픈클래스 (단축 endpoint)
        //   __academy__: 운영자 본인 학원 수업 (학원 직조회)
        //   기본       : 팀 수업
        const url = cls.clubId === '__open__'
          ? `/classes/${cls.id}/schedules`
          : cls.clubId === '__academy__' && cls.academyId
            ? `/academies/${cls.academyId}/classes/${cls.id}/schedules`
            : `/teams/${cls.clubId}/classes/${cls.id}/schedules`;
        const response = await api.get<ClassSchedule[] | ApiDataWrapper<ClassSchedule[]>>(
          url,
          {
            params: {
              startDate: monthStart.toISOString(),
              endDate: monthEnd.toISOString(),
            },
            retry: false,
          }
        );
        return {
          cls,
          schedules: response.success ? unwrapData<ClassSchedule[]>(response.data) ?? [] : [],
        };
      })
    );

    // 날짜별 수업 매핑
    const nextMap: Record<string, CalendarClass[]> = {};

    scheduleResults.forEach(({ cls, schedules }) => {
      if (!Array.isArray(schedules)) {
        return;
      }

      schedules.forEach((schedule) => {
        if (schedule.isCancelled) {
          return;
        }

        const dateKey = getDateKey(schedule.scheduledDate);
        const fallbackIndex = nextMap[dateKey]?.length ?? 0;
        const mappedClass: CalendarClass = {
          id: schedule.id,
          classId: cls.id,
          title: cls.className,
          // 회차 시각 SoT — ClassSchedule.start_time(text "HH:mm") 입력 그대로 우선 표시.
          //   정규/오픈클래스 모두 동일(실측: 정규수업도 회차 start_time 정상 저장).
          //   회차 시각이 없을 때만 대표 시간(formatTimeRange) 폴백.
          time:
            schedule.startTime
              ? schedule.endTime
                ? `${schedule.startTime} - ${schedule.endTime}`
                : schedule.startTime
              : formatTimeRange(cls.startTime, cls.endTime, {
                  cls,
                  fallbackIndex,
                }),
          coach: cls.instructorName,
          location: cls.clubName,
          type: inferTrainingType(cls),
        };

        if (!nextMap[dateKey]) {
          nextMap[dateKey] = [];
        }

        nextMap[dateKey].push(mappedClass);
      });
    });

    // [추가 2026-04-30] 전체 일정 — Tournament + PickupMatch 도 함께 표시
    // 사용자 요청: 수업(정규/레슨) + 대회/경기 + 이벤트 통합 노출
    interface RawTournament {
      id: string;
      name: string;
      startDate: string;
      endDate?: string | null;
      status?: string;
    }
    interface RawMatch {
      id: string;
      title: string;
      scheduledAt: string;
      rinkName?: string | null;
      status?: string;
    }
    // [2026-06-15] 대회 경기일정(HockeyMatch) — 대회 시작일 단일 대신 실제 경기 날짜/시간 표시.
    interface RawTMatch {
      id: string;
      tournamentId?: string | null;
      scheduledAt: string;
      status?: string | null;
      opponentName?: string | null;
      matchOrder?: number | null;
      awayTeam?: { name?: string | null } | null;
      tournament?: { name?: string | null } | null;
    }
    const rangeStart = monthStart.toISOString();
    const rangeEnd = monthEnd.toISOString();
    // 픽업 매치 목록 — 백엔드 라우트는 `/api/v1/matches` (PickupMatchesController, base URL `/api/v1/matches`).
    // 응답은 `{ matches: RawMatch[], total, page, limit }` 또는 ApiDataWrapper 로 래핑될 수 있음.
    type MatchesPayload = RawMatch[] | { matches: RawMatch[] };
    // [수정 2026-05-18] 오픈클래스 감독(academy-only) 은 대회/매치를 등록하지 않음 (사용자 명시) —
    //  /tournaments · /matches fetch 자체를 스킵. 캘린더 dot · 일정 리스트 모두에서 제거.
    const [tournamentsRes, matchesRes, tMatchesRes] = isAcademyOnly
      ? [
          { success: false as const, data: undefined },
          { success: false as const, data: undefined },
          { success: false as const, data: undefined },
        ]
      : await Promise.all([
          api.get<RawTournament[] | ApiDataWrapper<RawTournament[]>>('/tournaments', { retry: false }),
          api.get<MatchesPayload | ApiDataWrapper<MatchesPayload>>('/matches', { retry: false }).catch(() => ({ success: false as const, data: undefined })),
          api.get<RawTMatch[] | ApiDataWrapper<RawTMatch[]>>('/tournaments/matches/list', { retry: false }).catch(() => ({ success: false as const, data: undefined })),
        ]);

    const pushItem = (dateKey: string, item: CalendarClass) => {
      if (!nextMap[dateKey]) nextMap[dateKey] = [];
      nextMap[dateKey].push(item);
    };

    // 노출 대회 목록 + id 집합
    const tournamentList = tournamentsRes.success
      ? unwrapData<RawTournament[]>(tournamentsRes.data) ?? []
      : [];
    const visibleTournamentIds = new Set(tournamentList.map((t) => t.id));

    // [2026-06-15] 대회 경기일정(HockeyMatch) — 노출 대회의 실제 경기 날짜/시간에 표시.
    const matchedTournamentIds = new Set<string>();
    if (tMatchesRes.success) {
      const tmList = unwrapData<RawTMatch[]>(tMatchesRes.data) ?? [];
      for (const m of tmList) {
        if (!m.tournamentId || !visibleTournamentIds.has(m.tournamentId)) continue;
        if (m.status === 'cancelled') continue;
        const at = new Date(m.scheduledAt);
        if (Number.isNaN(at.getTime())) continue;
        if (at.toISOString() < rangeStart || at.toISOString() > rangeEnd) continue;
        matchedTournamentIds.add(m.tournamentId);
        const hh = String(at.getHours()).padStart(2, '0');
        const mm = String(at.getMinutes()).padStart(2, '0');
        const opponent = m.awayTeam?.name ?? m.opponentName ?? '상대팀 미정';
        const order = m.matchOrder ? `${m.matchOrder}경기 ` : '';
        pushItem(getDateKey(at), {
          id: `tmatch-${m.id}`,
          classId: '',
          title: `${m.tournament?.name ?? '대회'} ${order}vs ${opponent}`.trim(),
          time: `${hh}:${mm}`,
          coach: '',
          location: '',
          type: 'GAME',
        });
      }
    }

    // 경기일정이 없는 대회만 시작일에 1회 노출(폴백). 경기일정 있으면 위 경기 이벤트로 대체.
    for (const t of tournamentList) {
      if (matchedTournamentIds.has(t.id)) continue;
      const start = new Date(t.startDate);
      if (Number.isNaN(start.getTime())) continue;
      if (start.toISOString() < rangeStart || start.toISOString() > rangeEnd) continue;
      pushItem(getDateKey(start), {
        id: `tournament-${t.id}`,
        classId: '',
        title: t.name,
        time: '종일',
        coach: '',
        location: '',
        type: 'GAME',
      });
    }
    if (matchesRes.success) {
      const inner = unwrapData<RawMatch[] | { matches: RawMatch[] }>(matchesRes.data);
      const list: RawMatch[] = Array.isArray(inner) ? inner : (inner?.matches ?? []);
      for (const m of list) {
        const at = new Date(m.scheduledAt);
        if (Number.isNaN(at.getTime())) continue;
        if (at.toISOString() < rangeStart || at.toISOString() > rangeEnd) continue;
        const hh = String(at.getHours()).padStart(2, '0');
        const mm = String(at.getMinutes()).padStart(2, '0');
        pushItem(getDateKey(at), {
          id: `match-${m.id}`,
          classId: '',
          title: m.title,
          time: `${hh}:${mm}`,
          coach: '',
          location: m.rinkName ?? '',
          type: 'GAME',
        });
      }
    }

    // [수정 2026-05-18] dateKey 별 schedule.id 중복 제거 (방어망) —
    //  복수 ownerKind (`__academy__` / `__open__` / `__team__`) 가 동일 schedule 을
    //  중복 반환하는 미래 회귀 시에도 React key 충돌이 발생하지 않도록 보장.
    Object.keys(nextMap).forEach((key) => {
      const seen = new Set<string>();
      nextMap[key] = nextMap[key]
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        })
        .sort((left, right) => getTimeSortValue(left.time) - getTimeSortValue(right.time));
    });

    setClassesMap(nextMap);
    setIsLoading(false);
  }, [currentMonth, currentYear, clubFetchStrategy]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const calendarGrid = useMemo(() => {
    const grid = buildCalendarGrid(currentYear, currentMonth, today);

    return grid.map((day) => {
      const classes = classesMap[day.dateKey] ?? [];

      return {
        ...day,
        classes,
        trainingTypes: classes.map((item) => item.type),
      };
    });
  }, [classesMap, currentMonth, currentYear, today]);

  const selectedClasses = useMemo(() => {
    if (!selectedDateKey) {
      return [];
    }

    return classesMap[selectedDateKey] ?? [];
  }, [classesMap, selectedDateKey]);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDateKey) {
      return null;
    }

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
    selectedClasses,
    selectedDateLabel,
    isLoading,
    errorMessage,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
  };
}
