'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import {
  classifyClass,
  getDayScheduleForDate,
  type DaySchedule,
} from '@/lib/class-categories';
import { weekColumnOf, getWeekStart } from '@/lib/calendar-week';

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
  /** 요일별 기본 일정 — 회차 시각·장소 없는 회차의 요일 폴백. */
  daySchedules?: DaySchedule[];
  /** 수업 대표 장소명(venue.name) — 목록 응답의 location 필드. 회차/요일 장소 없을 때 폴백. */
  location?: string | null;
}

interface ClassSchedule {
  id: string;
  scheduledDate: string;
  isCancelled?: boolean;
  // [2026-06-10] 오픈클래스 회차별 실제 시각("HH:mm") — 있으면 대표 시간보다 우선.
  startTime?: string | null;
  endTime?: string | null;
  /** 회차별 장소 — 있으면 요일 기본일정·대표 장소보다 우선. */
  venue?: { id: string; name: string } | null;
}

/** 배치 일정 조회(`/classes/schedules/batch`) 응답 행 — 수업별 재분배용 classId 포함. */
interface BatchSchedule extends ClassSchedule {
  classId?: string | null;
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
  /** 날짜별 일정 조회 — 화면에 보이는 달 밖(예: 이번 주)도 조회 가능. */
  getClassesForDate: (dateKey: string) => CalendarClass[];
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
    // '이번 주' 목록은 보고 있는 달과 무관하게 오늘 기준 주를 표시하므로, 그 주가
    //   이 달 밖으로 걸치면 함께 조회한다 (대시보드 getDashboardCalendarQueryRange 와 동일 규칙).
    if (
      currentYear === today.getFullYear() &&
      currentMonth === today.getMonth()
    ) {
      const weekStart = getWeekStart(today);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      if (weekStart < monthStart) monthStart.setTime(weekStart.getTime());
      if (weekEnd > monthEnd) monthEnd.setTime(weekEnd.getTime());
    }

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
      /** 수업 대표 장소 — /classes 응답의 venue 조인. */
      venue?: { id?: string; name?: string | null } | null;
      daySchedules?: DaySchedule[];
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
        daySchedules: o.daySchedules,
        location: o.venue?.name ?? null,
        // 오픈클래스: clubId=null sentinel, clubName=학원명
        clubId: '__open__',
        clubName: o.academy?.name ?? '오픈클래스',
      } as ClubClass & { clubId: string; clubName: string; academyId: string | null }));

    // [수정 2026-04-30] allClasses 가 비어도 tournament/match 는 fetch 하도록 early return 제거.
    // 수업별 스케줄 조회 (팀 수업 + 오픈클래스 통합)
    const mergedClasses = [...allClasses, ...openClassesAsClub];
    // 일정은 수업 수와 무관하게 요청 1건 — 수업마다 단건 조회를 돌면 월 전환 1회에
    //   수업 수만큼 요청이 나가 rate limit(100req/min)을 소진해 429 가 발생한다.
    //   배치는 classId 만으로 조회하므로 owner(팀/학원/오픈)별 경로 분기도 필요 없다.
    const batchResponse = mergedClasses.length === 0
      ? null
      : await api.get<BatchSchedule[] | ApiDataWrapper<BatchSchedule[]>>(
          '/classes/schedules/batch',
          {
            params: {
              classIds: mergedClasses.map((cls) => cls.id).join(','),
              startDate: monthStart.toISOString(),
              endDate: monthEnd.toISOString(),
            },
            retry: false,
          },
        );
    const batchRows = batchResponse?.success
      ? (unwrapData<BatchSchedule[]>(batchResponse.data) ?? [])
      : [];
    const schedulesByClassId = new Map<string, ClassSchedule[]>();
    if (Array.isArray(batchRows)) {
      batchRows.forEach((row) => {
        if (!row?.classId) return;
        const list = schedulesByClassId.get(row.classId);
        if (list) list.push(row);
        else schedulesByClassId.set(row.classId, [row]);
      });
    }
    const scheduleResults = mergedClasses.map((cls) => ({
      cls,
      schedules: schedulesByClassId.get(cls.id) ?? [],
    }));

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
        const daySchedule = getDayScheduleForDate(
          cls.daySchedules,
          schedule.scheduledDate,
        );
        const mappedClass: CalendarClass = {
          id: schedule.id,
          classId: cls.id,
          title: cls.className,
          // 회차 시각 SoT — ClassSchedule.start_time(text "HH:mm") 입력 그대로 우선 표시.
          //   없으면 그 요일의 기본 일정(daySchedules) 시각, 그것도 없으면 미표시('').
          //   대표값(Class.startTime)·가상 프리셋 시간은 실제 시각과 달라 사용하지 않는다.
          time: schedule.startTime
            ? schedule.endTime
              ? `${schedule.startTime} - ${schedule.endTime}`
              : schedule.startTime
            : daySchedule
              ? `${daySchedule.startTime} - ${daySchedule.endTime}`
              : '',
          coach: cls.instructorName,
          // 장소 — 회차 venue > 그 요일 기본일정 venue > 수업 대표 venue. 없으면 미표시.
          //   팀/학원명(clubName)은 장소가 아니므로 폴백으로 쓰지 않는다.
          location:
            schedule.venue?.name ?? daySchedule?.venueName ?? cls.location ?? '',
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
      /** null = 일정 미정 대회 — 달력에 놓을 날짜가 없어 미표시. */
      startDate: string | null;
      endDate?: string | null;
      status?: string;
      /** 장소 폴백 체인 소스 — location(보조 텍스트) > venue.name > rink.location > rink.name. */
      location?: string | null;
      venue?: { name?: string | null } | null;
      rink?: { name?: string | null; location?: string | null } | null;
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
      venue?: { name?: string | null } | null;
      rink?: { name?: string | null } | null;
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
          location: m.venue?.name ?? m.rink?.name ?? '',
          type: 'GAME',
        });
      }
    }

    // 경기일정이 없는 대회만 시작일에 1회 노출(폴백). 경기일정 있으면 위 경기 이벤트로 대체.
    for (const t of tournamentList) {
      if (matchedTournamentIds.has(t.id)) continue;
      // 일정 미정(startDate null) 대회는 달력 배치 불가 — 명시 제외.
      //   (new Date(null)은 NaN 이 아니라 epoch 라 아래 가드를 통과해 버림.)
      if (!t.startDate) continue;
      const start = new Date(t.startDate);
      if (Number.isNaN(start.getTime())) continue;
      if (start.toISOString() < rangeStart || start.toISOString() > rangeEnd) continue;
      pushItem(getDateKey(start), {
        id: `tournament-${t.id}`,
        classId: '',
        title: t.name,
        time: '종일',
        coach: '',
        // getAvailableTournaments 의 장소 해석 체인과 동일 — 팀명 폴백 없음.
        location:
          t.location || t.venue?.name || t.rink?.location || t.rink?.name || '',
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

    // 조회한 기간만 교체하고 그 밖(이전에 받아둔 달·이번 주)은 남긴다.
    //   통째 교체하면 다른 달로 넘겼을 때 '이번 주' 목록이 빈 채로 표시된다.
    const rangeStartKey = getDateKey(monthStart);
    const rangeEndKey = getDateKey(monthEnd);
    setClassesMap((prev) => {
      const retained = Object.fromEntries(
        Object.entries(prev).filter(
          ([dateKey]) => dateKey < rangeStartKey || dateKey > rangeEndKey,
        ),
      );
      return { ...retained, ...nextMap };
    });
    setIsLoading(false);
  }, [currentMonth, currentYear, clubFetchStrategy, today]);

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

  // 달력 그리드는 보고 있는 달만 담으므로, 그리드에서 찾으면 이번 주가 다른 달로
  //   넘어갔을 때 빈 결과가 된다. 전체 맵에서 직접 찾는다.
  const getClassesForDate = useCallback(
    (dateKey: string) => classesMap[dateKey] ?? [],
    [classesMap],
  );

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
    getClassesForDate,
    selectedClasses,
    selectedDateLabel,
    isLoading,
    errorMessage,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
  };
}
