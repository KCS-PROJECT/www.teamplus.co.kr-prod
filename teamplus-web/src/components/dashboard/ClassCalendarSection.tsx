'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CalendarDot, CalendarLegend } from '@/components/calendar/CalendarDot';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useModal } from '@/components/ui/Modal/ModalContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import {
  CLASS_CATEGORIES,
  TRAINING_TYPE_LABEL,
  classifyClass,
  getDayScheduleForDate,
  type DaySchedule,
} from '@/lib/class-categories';
import { getTrainingColor } from '@/lib/calendar-colors';
import { WEEKDAY_HEADERS, weekColumnOf, colIsSaturday, colIsSunday, getWeekStart } from '@/lib/calendar-week';
import {
  getAttendanceWindowState,
  type AttendanceWindowState,
} from '@/lib/attendance-window';

interface ApiDataWrapper<T> {
  success?: boolean;
  data?: T;
}

interface TeamClass {
  id: string;
  className: string;
  trainingType?: string | null;
  /** 분류 SoT — 외래키 기반 (regular/open 식별) */
  academyId?: string | null;
  teamId?: string | null;
  instructorName: string;
  startTime: string;
  endTime: string;
  /** 단일 대표 장소 — daySchedules 에 요일 규칙이 없을 때 폴백. */
  venue?: { id?: string | null; name?: string | null } | null;
  /** [2026-06-05] 요일별 시간·장소 규칙 — 회차 요일에 맞는 시각 표시용. 없으면 단일 시간 폴백. */
  daySchedules?: DaySchedule[];
}

interface ClassSchedule {
  id: string;
  scheduledDate: string;
  isCancelled?: boolean;
  // [2026-06-10] 오픈클래스 회차별 실제 시각("HH:mm") — 있으면 대표 시간보다 우선.
  startTime?: string | null;
  endTime?: string | null;
}

export interface CalendarClass {
  /** ClassSchedule.id (선택일 목록에서 키로만 사용) */
  id: string;
  /** Class.id — 상세 페이지 라우팅용 */
  classId: string;
  title: string;
  time: string;
  /** ISO — 시간 윈도우 계산(getAttendanceWindowState) 및 학부모/학생 출석 버튼 분기용 */
  scheduledDate: string;
  /** "HH:mm" 회차 시작 시각 — scheduledDate 가 로컬 자정인 A 표준 일정의 출석 윈도우 합성용 */
  startTime?: string | null;
  /** "HH:mm" 회차 종료 시각 — 출석 윈도우 종료 기준. 없으면 시작+120min 폴백. */
  endTime?: string | null;
  coach: string;
  location: string;
  type: string;
  /** [2026-06-16] 대회/경기 결제 자녀 id 목록 — 자녀별 탭 필터용(수업은 classId 로 필터). */
  childIds?: string[];
  /** [2026-06-16] 대회/경기의 대회 id — 선수정보(참가자) 페이지 라우팅용(classId 없음). */
  tournamentId?: string;
}

interface CalendarDay {
  date: number;
  dateKey: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  classes: CalendarClass[];
  trainingTypes: string[];
}

const DAY_LABELS = WEEKDAY_HEADERS;

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return ((payload as ApiDataWrapper<T>).data ?? null) as T | null;
  }
  return (payload ?? null) as T | null;
}

function getDateKey(value: Date | string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 출석 윈도우 종료 계산용 "HH:mm" 정규화.
 *  - 이미 "HH:mm" 이면 그대로.
 *  - ISO/timestamp(Class.endTime, UTC naive 저장)면 UTC 시:분 추출 — 백엔드
 *    resolveScheduleEndTime 의 getUTCHours/Minutes 와 동일 규칙으로 정합 보장.
 */
function toHHmm(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function formatTimeRange(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

/**
 * [2026-06-05] 회차(날짜)의 요일에 맞는 시각 라벨 산출.
 *  - daySchedules 에 그 요일 규칙이 있으면 "HH:mm - HH:mm" (문자열 그대로).
 *  - 없으면 수업 대표 startTime/endTime(ISO) 기반 formatTimeRange 폴백.
 */
function resolveScheduleTime(
  cls: { startTime: string; endTime: string; daySchedules?: DaySchedule[] },
  scheduledDate: string,
): string {
  const match = getDayScheduleForDate(cls.daySchedules, scheduledDate);
  if (match) {
    return match.endTime
      ? `${match.startTime} - ${match.endTime}`
      : match.startTime;
  }
  return formatTimeRange(cls.startTime, cls.endTime);
}

/**
 * 회차(날짜)의 요일에 맞는 장소 라벨 산출.
 *  - daySchedules 에 그 요일 규칙이 있으면 그 규칙의 venueName.
 *  - 없으면 수업 대표 장소(venue.name) 폴백.
 *  - 둘 다 없으면 '' (카드에서 장소 줄 미표시).
 */
function resolveScheduleLocation(
  cls: { venue?: { name?: string | null } | null; daySchedules?: DaySchedule[] },
  scheduledDate: string,
): string {
  const match = getDayScheduleForDate(cls.daySchedules, scheduledDate);
  if (match?.venueName) return match.venueName;
  return cls.venue?.name ?? '';
}

/**
 * [2026-05-08] className 휴리스틱 제거. 외래키(`academyId`) 기반 명확한 분류.
 * 분류 SoT: lib/class-categories.ts. (Phase 4-B 에서 Tournament 머지 예정)
 */
function inferTrainingType(item: {
  academyId?: string | null;
  trainingType?: string | null;
}): 'REGULAR' | 'OPEN' {
  if (classifyClass(item) === 'open') return 'OPEN';
  return 'REGULAR';
}

function buildCalendarGrid(year: number, month: number, today: Date): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = weekColumnOf(firstDay);
  const gridStart = new Date(year, month, 1 - firstDayOfWeek);
  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const cur = new Date(gridStart);
    cur.setDate(gridStart.getDate() + i);
    days.push({
      date: cur.getDate(),
      dateKey: getDateKey(cur),
      isCurrentMonth: cur.getMonth() === month,
      isToday: getDateKey(cur) === getDateKey(today),
      classes: [],
      trainingTypes: [],
    });
  }
  return days;
}

interface SelectedClassesPayload {
  dateKey: string | null;
  classes: CalendarClass[];
  // [2026-06-09] 이번주(일~토) 수업 있는 날 그룹 — 홈 '이번주 일정' 표시용.
  weekGroups: { dateKey: string; classes: CalendarClass[] }[];
}

interface Props {
  /** 일정 데이터를 조회할 팀 ID 목록 */
  teamIds: { id: string; name: string }[];
  /**
   * 2026-05-14: 학원(오픈클래스) ID 목록 — 학부모 대시보드에서 자녀가 결제한 학원의 수업도
   *   캘린더에 함께 노출하기 위해 추가. 팀과 동일 패턴으로 `/academies/:id/classes` +
   *   `/academies/:id/classes/:classId/schedules` 호출. 미지정(undefined/[]) 시 학원 분기 skip.
   */
  academies?: { id: string; name: string }[];
  /** 선택일/수업 변경 콜백 (페이지에서 별도 섹션 렌더용) */
  onSelectionChange?: (payload: SelectedClassesPayload) => void;
  /**
   * 지정 시 이 Set 에 포함되는 classId 의 schedule 만 캘린더/선택일 목록에 노출.
   * 미지정(undefined) 시 팀 전체 수업 표시 (감독/coach/director 패턴).
   * 부모 페이지: 자녀별 실제 수강 수업으로 좁힐 때 사용.
   */
  enabledClassIds?: Set<string>;
  /**
   * [2026-06-16] 자녀별 탭 선택 시 그 자녀 id. null/undefined = 전체.
   *   대회/경기(classId 없음)는 이 값으로 필터 — 해당 자녀가 결제한 대회만 노출.
   */
  enabledChildId?: string | null;
  /**
   * v16 (2026-05-16) — 첫 fetch + 첫 paint 완료 시점에 ready=true 발화.
   *
   * 부모 페이지가 자체 데이터 ready 와 calendarReady 를 AND 합성하여
   * `usePageReady(parentReady && calendarReady)` 호출에 사용한다.
   * (LOADING_TIMING_POLICY v16 §11 — "데이터 로딩 + 화면 셋팅 완료 전 hide 절대 금지")
   *
   * 발화 시점:
   *   1. setIsLoading(false) → useEffect 트리거
   *   2. requestAnimationFrame × 2 (React commit → layout → paint 사이클 보장)
   *   3. onReady(true) 1회 호출 (멱등 — readyFiredRef 로 중복 방지)
   *
   * 호출 없으면 무시 — 기존 페이지(감독/coach 등) backward compat.
   */
  onReady?: (ready: boolean) => void;
  /**
   * 캘린더 하단 범례 노출 모드.
   *   'team' (default): 정규/오픈/대회 3분류 — 학생·학부모 (결제한 오픈클래스 노출)
   *   'team-only': 정규/대회 2분류 — 코치·감독 (팀↔오픈 도메인 분리)
   *   'academy': 오픈 1분류 — 오픈클래스 감독 대시보드(/academy-director)
   */
  legendVariant?: 'team' | 'team-only' | 'academy';
  /**
   * 헤드리스 모드 — 달력 UI(월 헤더·그리드·범례)는 렌더하지 않고
   * 데이터 fetch·onSelectionChange(오늘)·onReady 신호 로직만 수행한다.
   * 대시보드에서 달력은 일정 페이지로 분리하고 "오늘 일정"만 표시할 때 사용.
   * selectedDateKey 초기값이 오늘(todayKey)이므로 onSelectionChange 는 오늘 수업을 공급한다.
   */
  headless?: boolean;
  /**
   * [ICETIMES Phase 2b] ICETIMES flat 테마 적용 여부. 기본 false = 기존 스타일 그대로.
   *   true 시 흰 카드 박스(shadow) → flat it-surface 섹션 + hairline(it-line)으로 전환.
   *   미전달 화면은 영향 0 (기존 픽셀 동일 보장).
   */
  iceTheme?: boolean;
}

export function ClassCalendarSection({ teamIds, academies, onSelectionChange, enabledClassIds, enabledChildId, onReady, legendVariant = 'team', headless = false, iceTheme = false }: Props) {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(todayKey);
  const [rawClassesMap, setRawClassesMap] = useState<Record<string, CalendarClass[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  // 첫 fetch 완료 추적 — 월 변경 시 그리드를 unmount 하지 않고 stale 데이터 유지(깜빡임 방지).
  // (2026-05-11) 이전 패턴 `{isLoading ? null : <grid>}` 는 fetch 마다 그리드를 unmount/remount 하여
  //   < > 버튼 클릭 시 1~2초간 빈 화면이 노출되는 깜빡임을 유발. 첫 로딩만 풀스크린 로더에 양보하고
  //   이후는 transition-opacity 로 부드럽게 갱신.
  const hasLoadedOnceRef = useRef(false);

  // v16 (2026-05-16) — onReady 발화 추적 (T8).
  //   onReady prop 은 부모가 매 렌더마다 새 함수로 전달할 수 있으므로 ref 로 mirror 해
  //   useEffect deps 에서 제거 → 발화는 isLoading 전환 시점에만 1회 보장.
  //   readyFiredRef 가 멱등 가드 — 같은 마운트 안에서 중복 발화 차단.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  const readyFiredRef = useRef(false);

  // enabledClassIds 지정 시 raw 데이터에서 필터링한 derived map.
  // 미지정 시 raw 그대로 노출 (감독/coach/director 페이지 backward compat).
  const classesMap = useMemo<Record<string, CalendarClass[]>>(() => {
    if (!enabledClassIds) return rawClassesMap;
    const out: Record<string, CalendarClass[]> = {};
    Object.entries(rawClassesMap).forEach(([key, list]) => {
      const filtered = list.filter((c) => {
        // 수업: 자녀가 등록(결제)한 classId 로 필터.
        if (c.classId) return enabledClassIds.has(c.classId);
        // [2026-06-16] 대회/경기(classId 없음): 자녀 탭 선택 시 그 자녀가 결제한 대회만 노출.
        //   전체(enabledChildId 없음)면 모두 노출. childIds 정보 없는 레거시 항목은 노출.
        if (c.childIds && c.childIds.length > 0) {
          if (!enabledChildId) return true;
          return c.childIds.includes(enabledChildId);
        }
        return true;
      });
      if (filtered.length > 0) out[key] = filtered;
    });
    return out;
  }, [rawClassesMap, enabledClassIds, enabledChildId]);

  // [2026-05-13 수정] teamIds 안정화 — 부모가 `teams ?? []` 처럼 매 렌더마다 새 빈 배열을
  //   전달해도 동일한 ID 집합이면 fetchData 재생성을 피한다. 이전에는 새 [] → fetchData 재생성
  //   → useEffect 발화 → setRawClassesMap({}) (새 ref) → classesMap useMemo 재계산
  //   → onSelectionChange useEffect 재발화 → 부모 setState → 무한 루프.
  const teamIdsKey = useMemo(
    () => teamIds.map((t) => t.id).sort().join('|'),
    [teamIds],
  );
  const teamIdsRef = useRef(teamIds);
  teamIdsRef.current = teamIds;

  // 2026-05-14: 학원 ID 안정화 — teamIds 와 동일 패턴.
  const academiesKey = useMemo(
    () => (academies ?? []).map((a) => a.id).sort().join('|'),
    [academies],
  );
  const academiesRef = useRef(academies ?? []);
  academiesRef.current = academies ?? [];

  // [2026-05-14] 같은 (teamIdsKey, year, month) 조합 in-flight 가드.
  //   React StrictMode 가 development 에서 effect 를 두 번 실행하는 동작 +
  //   부모 리렌더에 의해 동일 fetchData 가 짧은 시간 안에 다시 호출되는 경우,
  //   `/teams/:teamId/classes` 등 모든 GET 이 중복 발사되어 네트워크/DB 부담이
  //   2배로 증가했다. 같은 fetchKey 가 진행 중이면 즉시 skip 한다.
  //   완료(success/실패) 후에는 ref 를 비워 다음 month 전환·refresh 는 정상 동작.
  const inFlightKeyRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    const ids = teamIdsRef.current;
    const academyIds = academiesRef.current;
    // 2026-05-14: 학원 owner 도 fetchKey 에 포함 — 학원 추가/제거 시에도 fetch 재발화.
    // 2026-05-18: legendVariant 도 fetchKey 에 포함 — academy 모드 전환 시 tournament
    //   fetch 분기가 바뀌므로 in-flight 가드가 동일 키로 stale 데이터를 유지하지 않도록 보장.
    const fetchKey = `${teamIdsKey}|${academiesKey}|${currentYear}|${currentMonth}|${ids.length}|${academyIds.length}|${legendVariant}|${enabledChildId ?? 'all'}`;
    if (inFlightKeyRef.current === fetchKey) {
      // 같은 fetch 가 이미 진행 중 — 중복 발사 차단 (StrictMode double-invoke 대응).
      return;
    }

    if (ids.length === 0 && academyIds.length === 0) {
      // 빈 객체 {} 를 새로 set 하면 ref 가 변해 downstream useMemo/useEffect 가 발화한다.
      // 이미 비어있다면 동일 참조를 유지해 무한 루프를 차단한다.
      setRawClassesMap((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setIsLoading(false);
      return;
    }

    inFlightKeyRef.current = fetchKey;
    setIsLoading(true);

    try {
      const monthStart = new Date(currentYear, currentMonth, 1);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

      // [성능 2026-05-28 P0-B] 직렬 워터폴 → 독립 fetch 병렬화.
      //   기존: teamClasses → academyClasses → openClasses → schedules → tournaments (5단계 직렬).
      //   변경: 서로 독립인 team/academy/open/tournament 를 동시 발사하고, classes 에
      //   의존하는 schedules 만 그 뒤 1회 실행. 결과 맵은 동일하며 reveal 지배 신호
      //   (calendarReady) 도달을 앞당긴다. (open dedup 은 academy 결과 의존이라 그 후 수행.)
      type RawTournament = { id: string; name: string; startDate: string; endDate?: string | null; status?: string; paidChildIds?: string[] | null };
      type TournamentApiList = RawTournament[] | { data?: RawTournament[] };
      // [2026-06-15] 대회 경기일정(HockeyMatch) — 시작일 단일 대신 실제 경기 날짜/시간 표시.
      type RawTMatch = {
        id: string;
        tournamentId?: string | null;
        scheduledAt: string;
        status?: string | null;
        opponentName?: string | null;
        matchOrder?: number | null;
        awayTeam?: { name?: string | null } | null;
        tournament?: { name?: string | null } | null;
      };
      type TMatchApiList = RawTMatch[] | { data?: RawTMatch[] };

      const shouldFetchOpen = ids.length > 0 && legendVariant === 'team';
      // [수정 2026-05-18] 오픈클래스 감독(legendVariant='academy') 은 대회/매치 미등록 (사용자 명시) → 스킵.
      const shouldFetchTournaments = legendVariant !== 'academy';

      // 대회(Tournament) 는 classes 와 완전 독립 → 가장 먼저 발사하고 await 는 매핑 직전에.
      //   backend 가 역할별 가시성(PARENT=자녀 매칭, COACH/DIRECTOR=팀 주최) 을 이미 필터링.
      //   [2026-06-17] 선택 자녀(enabledChildId) 를 childId 로 전달 — 학부모가 특정 자녀를 선택하면
      //   그 자녀 자격 대회만 조회. 미전송(전체 슬라이드) 시 백엔드가 모든 자녀 기준으로 반환.
      //   (누락 시 형제의 미결제 자격 대회가 소속 없는 자녀 화면에도 노출되던 버그 수정.)
      const tournamentPromise = shouldFetchTournaments
        ? api
            .get<TournamentApiList | ApiDataWrapper<TournamentApiList>>('/tournaments', {
              retry: false,
              ...(enabledChildId ? { params: { childId: enabledChildId } } : {}),
            })
            .catch(() => null)
        : Promise.resolve(null);
      // 노출 대회의 실제 경기일정(HockeyMatch).
      const tMatchesPromise = shouldFetchTournaments
        ? api
            .get<TMatchApiList | ApiDataWrapper<TMatchApiList>>('/tournaments/matches/list', { retry: false })
            .catch(() => null)
        : Promise.resolve(null);

      // 팀 수업 · 학원 수업 · 오픈클래스(raw) 동시 발사.
      const [teamClassResults, academyClassResults, openRes] = await Promise.all([
        // 팀 수업 목록
        Promise.all(
          ids.map(async (team) => {
            const res = await api.get<TeamClass[] | ApiDataWrapper<TeamClass[]>>(`/teams/${team.id}/classes`, { retry: false });
            const list = res.success ? unwrap<TeamClass[]>(res.data) : [];
            return Array.isArray(list)
              ? list.map((cls) => ({
                  ...cls,
                  teamId: team.id,
                  teamName: team.name,
                  ownerKind: 'team' as const,
                }))
              : [];
          }),
        ),
        // 2026-05-14: 학원 수업 목록 — 학부모 대시보드에 오픈클래스 노출 (GET /academies/:id/classes).
        Promise.all(
          academyIds.map(async (academy) => {
            const res = await api.get<TeamClass[] | ApiDataWrapper<TeamClass[]>>(`/academies/${academy.id}/classes`, { retry: false });
            const list = res.success ? unwrap<TeamClass[]>(res.data) : [];
            return Array.isArray(list)
              ? list.map((cls) => ({
                  ...cls,
                  // teamId 자리는 그대로 두되 academyId 로 라우팅 분기.
                  teamId: null,
                  academyId: academy.id,
                  teamName: academy.name,
                  ownerKind: 'academy' as const,
                }))
              : [];
          }),
        ),
        // visibility 매칭 오픈클래스 — 학부모/자녀(legendVariant='team') 시야 한정.
        //   backend `/classes?category=open` 이 viewerTeamIds 기반 필터링. limit 50 (DTO 상한).
        //   코치/감독(legendVariant='team-only') 은 팀↔오픈 도메인 분리로 스킵.
        shouldFetchOpen
          ? api.get<TeamClass[] | ApiDataWrapper<TeamClass[]> | { data?: TeamClass[] }>(
              '/classes',
              { params: { category: 'open', limit: 50 }, retry: false },
            )
          : Promise.resolve(null),
      ]);

      // 오픈클래스 dedup — academyClassResults 와 동일 id 제거 (academy 결과 의존).
      let visibilityOpenClasses: Array<TeamClass & { teamId: null; academyId: string; teamName: string; ownerKind: 'open' }> = [];
      if (openRes && openRes.success) {
        const inner = unwrap<TeamClass[] | { data?: TeamClass[] }>(openRes.data);
        const list: TeamClass[] = Array.isArray(inner) ? inner : ((inner as { data?: TeamClass[] })?.data ?? []);
        const dupIds = new Set(academyClassResults.flat().map((c) => c.id));
        visibilityOpenClasses = list
          .filter((cls) => !dupIds.has(cls.id))
          .map((cls) => ({
            ...cls,
            teamId: null,
            academyId: ((cls as unknown as { academyId?: string }).academyId) ?? '',
            teamName: ((cls as unknown as { academy?: { name?: string } }).academy?.name) ?? '오픈클래스',
            ownerKind: 'open' as const,
          }));
      }

      const allClasses = [...teamClassResults.flat(), ...academyClassResults.flat(), ...visibilityOpenClasses];
      if (allClasses.length === 0) {
        setRawClassesMap((prev) => (Object.keys(prev).length === 0 ? prev : {}));
        setIsLoading(false);
        // 부유 promise 방지 — 이미 .catch 가 달려 있어 reject 위험은 없으나 명시적으로 소비.
        void tournamentPromise;
        return;
      }

      const scheduleResults = await Promise.all(
        allClasses.map(async (cls) => {
          // 2026-05-14: owner 종류별 endpoint 분기.
          //  [추가 2026-05-15] ownerKind='open' (visibility 매칭) → 단축 엔드포인트 사용.
          const basePath =
            cls.ownerKind === 'open'
              ? `/classes/${cls.id}/schedules`
              : cls.ownerKind === 'academy'
                ? `/academies/${cls.academyId}/classes/${cls.id}/schedules`
                : `/teams/${cls.teamId}/classes/${cls.id}/schedules`;
          const res = await api.get<ClassSchedule[] | ApiDataWrapper<ClassSchedule[]>>(
            basePath,
            {
              params: { startDate: monthStart.toISOString(), endDate: monthEnd.toISOString() },
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
          const dateKey = getDateKey(schedule.scheduledDate);
          const mapped: CalendarClass = {
            id: schedule.id,
            classId: cls.id,
            title: cls.className,
            // 회차 시각 SoT — ClassSchedule.start_time(text "HH:mm") 입력 그대로 우선 표시.
            //   정규/오픈클래스 모두 동일(실측: 정규수업도 회차 start_time 정상 저장).
            //   회차 시각이 없을 때만 요일 규칙(text)/대표 시간 폴백.
            time:
              schedule.startTime
                ? schedule.endTime
                  ? `${schedule.startTime} - ${schedule.endTime}`
                  : schedule.startTime
                : resolveScheduleTime(cls, schedule.scheduledDate),
            scheduledDate: schedule.scheduledDate,
            startTime: schedule.startTime ?? null,
            // 출석 윈도우 종료 기준 — schedule.endTime(text) 우선, 없으면 Class.endTime 폴백.
            //   백엔드 resolveScheduleEndTime(schedule.endTime, class.endTime) 과 동일 규칙.
            endTime: schedule.endTime ?? toHHmm(cls.endTime),
            coach: cls.instructorName,
            location: resolveScheduleLocation(cls, schedule.scheduledDate),
            type: inferTrainingType(cls),
          };
          if (!next[dateKey]) next[dateKey] = [];
          next[dateKey].push(mapped);
        });
      });

      // 대회 매핑 — 위에서 병렬로 미리 받아둔 promise 소비.
      //   [수정 2026-06-15] 대회는 실제 경기일정(HockeyMatch)을 각 경기 날짜/시간에 표시.
      //   경기일정이 있는 대회는 시작일 단일 이벤트를 생략하고, 없는 대회만 시작일 1회 폴백.
      const tournamentsRes = await tournamentPromise;
      const tMatchesRes = await tMatchesPromise;
      const tournamentList: RawTournament[] =
        tournamentsRes && tournamentsRes.success
          ? (() => {
              const inner = unwrap<TournamentApiList>(tournamentsRes.data);
              return Array.isArray(inner) ? inner : (inner?.data ?? []);
            })()
          : [];
      const visibleTournamentIds = new Set(tournamentList.map((t) => t.id));
      // [2026-06-16] 대회별 결제 자녀 id — 매치/대회 항목에 부여하여 자녀별 탭 필터에 사용.
      const paidChildByTournament = new Map<string, string[]>(
        tournamentList.map((t) => [t.id, t.paidChildIds ?? []]),
      );
      const matchedTournamentIds = new Set<string>();
      if (tMatchesRes && tMatchesRes.success) {
        const innerM = unwrap<TMatchApiList>(tMatchesRes.data);
        const mList: RawTMatch[] = Array.isArray(innerM) ? innerM : (innerM?.data ?? []);
        for (const m of mList) {
          if (!m.tournamentId || !visibleTournamentIds.has(m.tournamentId)) continue;
          if (m.status === 'cancelled') continue;
          const at = new Date(m.scheduledAt);
          if (Number.isNaN(at.getTime())) continue;
          if (at < monthStart || at > monthEnd) continue;
          matchedTournamentIds.add(m.tournamentId);
          const hh = String(at.getHours()).padStart(2, '0');
          const mm = String(at.getMinutes()).padStart(2, '0');
          const opponent = m.awayTeam?.name ?? m.opponentName ?? '상대팀 미정';
          const order = m.matchOrder ? `${m.matchOrder}경기 ` : '';
          const dateKey = getDateKey(at);
          if (!next[dateKey]) next[dateKey] = [];
          next[dateKey].push({
            id: `tmatch-${m.id}`,
            classId: '',
            title: `${m.tournament?.name ?? '대회'} ${order}vs ${opponent}`.trim(),
            time: `${hh}:${mm}`,
            scheduledDate: at.toISOString(),
            coach: '',
            location: '',
            type: 'GAME',
            childIds: paidChildByTournament.get(m.tournamentId) ?? [],
            tournamentId: m.tournamentId,
          });
        }
      }
      for (const t of tournamentList) {
        if (t.status === 'cancelled') continue;
        if (matchedTournamentIds.has(t.id)) continue;
        const startDt = new Date(t.startDate);
        if (Number.isNaN(startDt.getTime())) continue;
        if (startDt < monthStart || startDt > monthEnd) continue;
        const dateKey = getDateKey(startDt);
        if (!next[dateKey]) next[dateKey] = [];
        next[dateKey].push({
          id: `tournament-${t.id}`,
          classId: '',
          title: t.name,
          time: '종일',
          scheduledDate: startDt.toISOString(),
          coach: '',
          location: '',
          type: 'GAME',
          childIds: t.paidChildIds ?? [],
          tournamentId: t.id,
        });
      }

      Object.keys(next).forEach((k) => {
        next[k] = [...next[k]].sort((a, b) => a.time.localeCompare(b.time));
      });

      setRawClassesMap(next);
      setIsLoading(false);
      hasLoadedOnceRef.current = true;
    } finally {
      // 동일 key 일 때만 리셋 — 사이에 month 가 바뀌어 다른 fetch 가 새로 잡았다면 그 값 유지.
      if (inFlightKeyRef.current === fetchKey) {
        inFlightKeyRef.current = null;
      }
    }
  }, [teamIdsKey, academiesKey, currentMonth, currentYear, legendVariant, enabledChildId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // v16 (2026-05-16) — 첫 fetch 완료 + 첫 paint 보장 후 onReady(true) 발화 (T8).
  //   isLoading 이 false 로 전환되는 시점은 React commit 직전이므로 즉시 호출하면
  //   부모 LoadingProvider 가 hide → 그리드 첫 paint 전에 빈 캘린더가 노출되는 갭이 발생.
  //   requestAnimationFrame × 2 로 React commit → layout → paint 사이클을 보장한 뒤 발화.
  //
  //   1차 rAF: 다음 frame 직전 — React 가 DOM 을 commit 했지만 아직 paint 전
  //   2차 rAF: paint 사이클 진입 직후 — 실제 픽셀이 화면에 그려진 다음 frame
  //
  //   readyFiredRef 멱등 가드 — 같은 마운트 안에서 1회만 발화. 월 전환 (fetchData 재실행)
  //   시에는 다시 발화하지 않음 (부모는 첫 paint 1회만 신뢰).
  useEffect(() => {
    if (isLoading) return;
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;
    if (typeof window === 'undefined') {
      onReadyRef.current?.(true);
      return;
    }
    // v16.2 (2026-05-16) — rAF × 3 + setTimeout 추가 안정화.
    // 사용자 추가 지시 #3: "여전히 hide 시점에 화면 렌더링이 보임".
    // [2026-05-30 perf] setTimeout 200 → 80ms 단축. 부모 LoadingProvider 가 ready
    //   신호 수신 후 자체 POST_READY hold(rAF×3 + 120ms)를 또 추가하므로, 캘린더의
    //   200ms 는 이중 floor 였다. rAF×3 는 캘린더 그리드 paint 보장으로 유지하고
    //   setTimeout 만 최소화 — page 전체 안정화는 부모의 POST_READY hold 가 담당.
    let raf2 = 0;
    let raf3 = 0;
    let stabilizeTimer: ReturnType<typeof setTimeout> | null = null;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        raf3 = window.requestAnimationFrame(() => {
          stabilizeTimer = setTimeout(() => {
            stabilizeTimer = null;
            onReadyRef.current?.(true);
          }, 80);
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      if (raf3) window.cancelAnimationFrame(raf3);
      if (stabilizeTimer) clearTimeout(stabilizeTimer);
    };
  }, [isLoading]);

  useEffect(() => {
    if (!onSelectionChange) return;
    // 이번주(월~일) 수업 있는 날 그룹 계산 — 홈 '이번주 일정' 표시용.
    const weekStart = getWeekStart(new Date(today));
    const weekGroups: { dateKey: string; classes: CalendarClass[] }[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const cls = classesMap[key] ?? [];
      if (cls.length > 0) weekGroups.push({ dateKey: key, classes: cls });
    }
    onSelectionChange({
      dateKey: selectedDateKey,
      classes: selectedDateKey ? classesMap[selectedDateKey] ?? [] : [],
      weekGroups,
    });
  }, [selectedDateKey, classesMap, onSelectionChange, today]);

  const calendarGrid = useMemo(() => {
    const grid = buildCalendarGrid(currentYear, currentMonth, today);
    return grid.map((day) => {
      const classes = classesMap[day.dateKey] ?? [];
      return { ...day, classes, trainingTypes: classes.map((c) => c.type) };
    });
  }, [classesMap, currentMonth, currentYear, today]);

  // [BUG FIX 2026-05-19 W3 #2] React StrictMode 더블 invoke 버그 — setState updater
  //   함수 내부에서 또 다른 setState (setCurrentYear) 를 호출하면, StrictMode dev 모드에서
  //   updater 가 두 번 실행되어 setCurrentYear((y) => y + 1) 가 2회 호출 → year 가 2번 증가.
  //   결과: 2026년 12월 → 다음 클릭 → 2028년 1월 (정상은 2027년 1월).
  //   해결: updater 함수 안에서 다른 setState 호출하지 않고, 외부에서 currentMonth 값을
   //   기반으로 분기. useCallback deps 에 currentMonth 추가.
  const goToPrevMonth = useCallback(() => {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
    setSelectedDateKey(null);
  }, [currentMonth]);

  const goToNextMonth = useCallback(() => {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
    setSelectedDateKey(null);
  }, [currentMonth]);

  const monthLabel = `${currentYear}년 ${currentMonth + 1}월`;

  // 헤드리스 모드 — 위 hook(데이터 fetch·onReady·onSelectionChange)은 모두 실행된 뒤
  // 달력 UI 만 렌더하지 않는다. (early return 은 hook 호출 이후라 Rules of Hooks 준수)
  if (headless) return null;

  return (
    <div
      className={cn(
        // ICETIMES flat: 카드 박스(rounded/border/shadow) 제거 → 상위 full-bleed 섹션의
        //   흰 배경을 그대로 사용. 기본 테마는 기존 카드 박스 유지(픽셀 동일).
        iceTheme
          ? ''
          : 'rounded-w-xl border overflow-hidden bg-wsurface dark:bg-rink-800 shadow-sh-1 border-wline dark:border-rink-700',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between py-3 border-b',
          // ICETIMES flat: 좌우 패딩은 상위 섹션이 담당 → px 제거. 구분선 hairline(it-line).
          iceTheme ? 'border-it-line dark:border-it-blue-900' : 'px-4 border-wline-2 dark:border-rink-700',
        )}
      >
        <button
          type="button"
          onClick={goToPrevMonth}
          className="flex size-9 items-center justify-center rounded-w-pill text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors duration-150 motion-reduce:transition-none"
          aria-label="이전 달"
        >
          <Icon name="chevron_left" className="text-xl" />
        </button>
        <h2 className="text-card-title font-extrabold text-wtext-1 dark:text-white tabular-nums tracking-tight">
          {monthLabel}
        </h2>
        <button
          type="button"
          onClick={goToNextMonth}
          className="flex size-9 items-center justify-center rounded-w-pill text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors duration-150 motion-reduce:transition-none"
          aria-label="다음 달"
        >
          <Icon name="chevron_right" className="text-xl" />
        </button>
      </div>

      <div className={cn('pt-3 pb-2', iceTheme ? '' : 'px-4')}>
        <div className="mb-1 grid grid-cols-7" role="row">
          {DAY_LABELS.map((day, idx) => (
            <div
              key={day}
              className={cn(
                'py-1 text-center text-card-meta font-semibold',
                colIsSunday(idx)
                  ? iceTheme ? 'text-it-red-500' : 'text-flame-500'
                  : colIsSaturday(idx)
                  ? iceTheme ? 'text-it-blue-500' : 'text-ice-500'
                  : 'text-wtext-3 dark:text-rink-300',
              )}
              role="columnheader"
            >
              {day}
            </div>
          ))}
        </div>

        {/* (2026-05-11) 깜빡임 방지 패턴:
            - 첫 fetch 완료 전(`hasLoadedOnceRef.current === false`)에만 null — 풀스크린 로더에 양보
            - 이후 월 변경 시 그리드 mount 유지 + transition-opacity 로 부드러운 갱신
              · isLoading=true 시 opacity-60 (stale 데이터 유지, 로딩 중임을 시각 신호로 제공)
              · isLoading=false 시 opacity-100 (정상) */}
        {!hasLoadedOnceRef.current && isLoading ? null : (
          <div
            className={cn(
              'grid grid-cols-7 gap-y-0.5 transition-opacity duration-200 motion-reduce:transition-none transform-gpu',
              isLoading && 'opacity-60',
            )}
            style={{ willChange: 'opacity', contain: 'layout style' }}
            role="grid"
            aria-label={monthLabel}
            aria-busy={isLoading}
          >
            {calendarGrid.map((day, index) => {
              const isSelected = day.isCurrentMonth && day.dateKey === selectedDateKey;
              const hasClasses = day.trainingTypes.length > 0;
              const dayOfWeek = index % 7;
              return (
                <button
                  type="button"
                  key={`cell-${index}`}
                  onClick={() => day.isCurrentMonth && setSelectedDateKey(day.dateKey)}
                  disabled={!day.isCurrentMonth}
                  className={cn(
                    // [2026-05-16] 키보드 포커스 가시성 — focus-visible:ring-2 추가
                    //  마우스 클릭 시 ring 노이즈 없이 키보드 사용자에게만 명확한 포커스 표시.
                    // [ICETIMES] iceTheme 시 셀(button)은 배경/ring 없이 칩(아래 span)이
                    //   시안 KitCalendar 의 28×28 칩 시각요소(bg/inset-ring)를 담당한다.
                    'relative flex min-h-[48px] flex-col items-center justify-center rounded-w-md py-1.5 transition-colors duration-150 motion-reduce:transition-none',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-1 focus-visible:ring-offset-wsurface dark:focus-visible:ring-offset-rink-800',
                    day.isCurrentMonth
                      ? iceTheme ? 'hover:bg-it-fill dark:hover:bg-it-blue-900' : 'hover:bg-wline-2 dark:hover:bg-rink-700'
                      : 'cursor-default opacity-30',
                    !iceTheme && isSelected && 'bg-ice-500 hover:bg-ice-600',
                    !iceTheme && day.isToday && !isSelected && 'ring-2 ring-inset ring-ice-500',
                  )}
                  aria-label={`${currentMonth + 1}월 ${day.date}일${day.isToday ? ' 오늘' : ''}${hasClasses ? ` 수업 ${day.classes.length}개` : ''}`}
                  aria-selected={isSelected}
                  aria-pressed={isSelected}
                  role="gridcell"
                >
                  <span
                    className={cn(
                      iceTheme
                        // 시안 KitCalendar 칩 — 28×28 rounded-8px, 13.5px/700.
                        //   선택=it-blue-500 bg 흰글자, 오늘=inset ring 2px it-blue-400.
                        ? 'flex h-7 w-7 items-center justify-center rounded-lg text-[13.5px] font-bold leading-none tracking-[-0.02em] tabular-nums'
                        : 'text-card-title font-semibold leading-none tabular-nums',
                      iceTheme && isSelected && 'bg-it-blue-500 text-white',
                      iceTheme && day.isToday && !isSelected && 'ring-2 ring-inset ring-it-blue-400',
                      isSelected
                        ? 'text-white'
                        : day.isCurrentMonth
                        ? colIsSunday(dayOfWeek)
                          ? iceTheme ? 'text-it-red-500' : 'text-flame-500'
                          : colIsSaturday(dayOfWeek)
                          ? iceTheme ? 'text-it-blue-500' : 'text-ice-500'
                          : 'text-wtext-1 dark:text-white'
                        : 'text-wtext-4 dark:text-rink-500',
                    )}
                  >
                    {day.date}
                  </span>
                  {/* 2026-05-16: CalendarDot 을 모든 셀에 항상 렌더 — 빈 일정도 동일 높이
                       reserve 하여 날짜 숫자 위치가 셀마다 시프트되지 않도록 보장.
                       이전/다음 달 셀도 동일 placeholder 영역 차지. */}
                  <CalendarDot
                    types={day.isCurrentMonth && hasClasses ? day.trainingTypes : []}
                    size="sm"
                    tone={isSelected ? 'selected' : 'default'}
                    iceTheme={iceTheme}
                    className={cn(iceTheme ? 'mt-0.5' : 'mt-1', isSelected && '[&_span]:bg-white/85')}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <CalendarLegend
        className={cn(
          'justify-center py-3 border-t',
          // ICETIMES flat: 좌우 패딩 상위 섹션 담당 → px 제거. 구분선 hairline(it-line).
          iceTheme ? 'border-it-line dark:border-it-blue-900' : 'px-4 border-wline-2 dark:border-rink-700',
        )}
        variant={legendVariant}
      />
    </div>
  );
}

/**
 * 선택된 날짜의 수업 목록 카드 — 페이지에서 SectionHead 다음에 별도 배치.
 *
 * Phase 1 (2026-05-11) — 학부모/학생 [출석하기] 버튼 4-state 분기:
 *   ① 출석 완료 (present)   → "출석 완료" 칩
 *   ② 출석 가능 (open)      → [출석하기] 버튼 → confirm → onCheckIn API
 *   ③ 수업 시작 전 (before) → "수업 전" 칩
 *   ④ 체크 종료 (closed)    → "체크 종료" 칩
 *
 * 자녀 선택:
 *   - selectedChildId 지정: 그 자녀로 즉시 confirm
 *   - selectedChildId === null + 미체크 자녀 1명: 그 자녀로 즉시 confirm
 *   - selectedChildId === null + 미체크 자녀 2명 이상: BottomSheet 자녀 선택
 */
interface SelectedDayClassListProps {
  classes: CalendarClass[];
  /** 출석/결제 관리 버튼 노출 여부 (코치/감독/관리자만 true 권장) */
  canManage?: boolean;

  // ─── Phase 1 신규: 학부모/학생 출석 처리 ───
  /** scheduleId → 등록된 자녀 ID 배열 (학부모 multi-child 분기용) */
  scheduleIdToChildIds?: Map<string, string[]>;
  /** scheduleId → { childId → attendanceStatus } */
  attendanceMap?: Map<string, Record<string, string>>;
  /** childId → name 매핑 (BottomSheet 라벨 + confirm 메시지) */
  childIdToName?: Map<string, string>;
  /** 자녀 칩 선택값 (학부모) 또는 본인 ID (학생). null = "전체" 슬라이드 */
  selectedChildId?: string | null;
  /** YYYY-MM-DD (오늘 키). 미지정 시 오늘로 계산. */
  todayKey?: string;
  /** 학부모: useParentHome.checkInChild / 학생: checkInSelf 등. 미지정 시 출석 버튼 비활성. */
  onCheckIn?: (
    scheduleId: string,
    childId: string,
  ) => Promise<
    | { ok: true; remainingSessions: number; className: string }
    | { ok: false; message: string }
  >;
  /**
   * [2026-05-11 Phase 2] 시각 강조 모드.
   *  - 'default': 학부모/teen 일반 카드
   *  - 'child':   WCAG AAA — 72×72dp 출석 버튼, 폰트 18px+, 대비 7:1, 카드 패딩/간격 확장
   */
  variant?: 'default' | 'child';
  /** 외부 박스(카드) 제거 — 상위에서 통합 박스로 감쌀 때 사용(주간 일정 통합 리스트). */
  bare?: boolean;
  /**
   * [ICETIMES Phase 2b] ICETIMES flat 테마. 기본 false = 기존 스타일 그대로.
   *   true 시 카드 박스 shadow 제거 + flat it-surface/it-line, 행 hover/구분선 it 톤 적용.
   *   강조색(출석 버튼 ice-500 등)은 it-blue 로 매핑. child variant 의 WCAG AAA 규격은 불변.
   */
  iceTheme?: boolean;
  /**
   * [Phase B] 후불(POSTPAID) 일정의 scheduleId 집합 — 출석 모달 "결제권 차감" 문구 분기용.
   * 포함된 scheduleId(=CalendarClass.id)는 차감 안내·잔여 결제권 표기를 생략한다(사후 정산).
   */
  postpaidScheduleIds?: Set<string>;
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SelectedDayClassList({
  classes,
  canManage = false,
  scheduleIdToChildIds,
  attendanceMap,
  childIdToName,
  selectedChildId,
  todayKey: todayKeyProp,
  onCheckIn,
  variant = 'default',
  bare = false,
  postpaidScheduleIds,
  iceTheme = false,
}: SelectedDayClassListProps) {
  const { navigate } = useNavigation();
  const { modal } = useModal();
  const { toast } = useToast();
  const todayKey = todayKeyProp ?? getTodayKey();
  const isChild = variant === 'child';

  // 자녀 선택 BottomSheet 상태 (다중 자녀 동시 등록 + 전체 보기 모드)
  const [pickerSchedule, setPickerSchedule] = useState<CalendarClass | null>(null);
  // 진행 중 상태 (중복 클릭 방지) — `${scheduleId}:${childId}`
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  const performCheckIn = useCallback(
    async (
      scheduleId: string,
      targetChildId: string,
      childName: string | null,
      className: string,
    ) => {
      if (!onCheckIn) return;
      const submitKey = `${scheduleId}:${targetChildId}`;
      if (submittingKey) return;

      // [Phase B] 후불(POSTPAID) 수업은 출석 시 결제권 차감이 없으므로(사후 정산)
      //   "결제권 차감" 안내·"잔여 결제권" 표기를 생략한다.
      const isPostpaid = postpaidScheduleIds?.has(scheduleId) ?? false;
      const subject = childName
        ? `${childName}의 '${className}'`
        : `'${className}'`;
      const ok = await modal.confirm({
        title: '출석 처리',
        message: isPostpaid
          ? `${subject} 출석을 처리할까요?`
          : `${subject} 출석을 처리할까요?\n결제권 1회가 차감됩니다.`,
        confirmText: '출석하기',
        cancelText: '취소',
        variant: 'default',
      });
      if (!ok) return;

      setSubmittingKey(submitKey);
      try {
        const result = await onCheckIn(scheduleId, targetChildId);
        if (result.ok) {
          toast.success(
            isPostpaid
              ? '출석 완료'
              : `출석 완료 · 잔여 결제권 ${result.remainingSessions}회`,
          );
        } else {
          toast.error(result.message);
        }
      } finally {
        setSubmittingKey(null);
      }
    },
    [onCheckIn, submittingKey, modal, toast, postpaidScheduleIds],
  );

  const handleCheckInClick = useCallback(
    (cls: CalendarClass) => {
      if (!onCheckIn) return;
      const childIds = scheduleIdToChildIds?.get(cls.id) ?? [];
      const attendance = attendanceMap?.get(cls.id) ?? {};

      // 특정 자녀 / 본인 — 즉시 confirm
      if (selectedChildId) {
        const name = childIdToName?.get(selectedChildId) ?? null;
        performCheckIn(cls.id, selectedChildId, name, cls.title);
        return;
      }

      // 전체 보기 — 미체크 자녀 추출
      const eligible = childIds.filter((cid) => attendance[cid] !== 'present');
      if (eligible.length === 0) {
        toast.info('이미 모든 자녀가 출석 완료되었습니다.');
        return;
      }
      if (eligible.length === 1) {
        const onlyChildId = eligible[0];
        const name = childIdToName?.get(onlyChildId) ?? null;
        performCheckIn(cls.id, onlyChildId, name, cls.title);
        return;
      }
      // 자녀 ≥ 2 + 모두 미체크 → 자녀 선택 BottomSheet
      setPickerSchedule(cls);
    },
    [
      onCheckIn,
      scheduleIdToChildIds,
      attendanceMap,
      selectedChildId,
      childIdToName,
      performCheckIn,
      toast,
    ],
  );

  if (classes.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-1.5 p-5',
          // ICETIMES flat: 카드 박스(rounded/border/shadow) 제거 → 상위 흰 섹션 면 사용.
          //   기본 테마는 기존 카드 박스 유지(픽셀 동일 — 타 역할 회귀 0).
          iceTheme
            ? ''
            : 'rounded-w-xl border bg-wsurface dark:bg-rink-800 shadow-sh-1 border-wline dark:border-rink-700',
        )}
      >
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-w-pill',
          iceTheme ? 'bg-it-fill dark:bg-it-blue-900' : 'bg-wline-2 dark:bg-rink-700',
        )}>
          <Icon name="event_busy" className="text-xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
        </div>
        <p className="text-card-title text-wtext-3 dark:text-rink-300">{MESSAGES.dashboard.noSchedule}</p>
      </div>
    );
  }

  // 색상·라벨 SoT 통일 — calendar-colors + class-categories 정합.
  //   resolveTypeStyle 헬퍼 (아래) 가 모든 type(REGULAR/OPEN/LESSON/GAME/EVENT/TOURNAMENT)을
  //   캘린더 dot 과 동일 색으로 반환해, 캘린더(CalendarDot)와 리스트(stripe/pill) 색을 일치시킨다.

  // 통합 색상/라벨 헬퍼 — 카드 stripe + 배지 클래스 일관 SoT.
  //   stripe: getTrainingColor(type).bg (캘린더 dot 과 동일 솔리드 컬러)
  //   pill bg: text-{color}-700 + bg-{color}-50 (calendar-colors 의 text 클래스 활용)
  //   pill label: getTrainingColor(type).label (캘린더 legend SoT)
  function resolveTypeStyle(type: string): { stripe: string; pillBg: string; pillText: string; label: string } {
    const c = getTrainingColor(type);
    // CLASS_CATEGORIES SoT 우선 (학부모/감독 컨벤션 정합)
    const upper = String(type ?? '').toUpperCase();
    if (upper === 'REGULAR') {
      return {
        stripe: CLASS_CATEGORIES.regular.color.solidBg,
        pillBg: 'bg-emerald-100 dark:bg-emerald-900/20',
        pillText: 'text-emerald-700 dark:text-emerald-400',
        label: CLASS_CATEGORIES.regular.shortLabel,
      };
    }
    if (upper === 'OPEN') {
      return {
        stripe: CLASS_CATEGORIES.open.color.solidBg,
        pillBg: 'bg-blue-100 dark:bg-blue-900/20',
        pillText: 'text-blue-700 dark:text-blue-400',
        // 다른 수업 목록 카드와 라벨 통일 — 오픈클래스 = '레슨' (TRAINING_TYPE_LABEL SoT).
        label: TRAINING_TYPE_LABEL.lesson,
      };
    }
    if (upper === 'TOURNAMENT' || upper === 'GAME') {
      return {
        stripe: CLASS_CATEGORIES.tournament.color.solidBg,
        pillBg: 'bg-red-100 dark:bg-red-900/20',
        pillText: 'text-red-700 dark:text-red-400',
        label: CLASS_CATEGORIES.tournament.shortLabel,
      };
    }
    if (upper === 'LESSON') {
      return {
        stripe: 'bg-blue-500',
        pillBg: 'bg-blue-100 dark:bg-blue-900/20',
        pillText: 'text-blue-700 dark:text-blue-400',
        label: '레슨',
      };
    }
    if (upper === 'EVENT') {
      return {
        stripe: 'bg-amber-500',
        pillBg: 'bg-amber-100 dark:bg-amber-900/20',
        pillText: 'text-amber-700 dark:text-amber-400',
        label: '행사',
      };
    }
    // 알려지지 않은 type — calendar-colors fallback (slate)로 통일.
    return {
      stripe: c.bg,
      pillBg: 'bg-slate-100 dark:bg-slate-800',
      pillText: 'text-slate-700 dark:text-slate-300',
      label: c.label,
    };
  }

  return (
    <div
      className={
        bare
          ? undefined
          : cn(
              // ICETIMES flat: 카드 박스 제거 → 상위 흰 섹션 면 사용. 기본 테마는 기존 카드 유지.
              iceTheme
                ? ''
                : 'rounded-w-xl border overflow-hidden bg-wsurface dark:bg-rink-800 shadow-sh-1 border-wline dark:border-rink-700',
            )
      }
    >
      <ul className={cn(
        'divide-y',
        iceTheme ? 'divide-it-line dark:divide-it-blue-900' : 'divide-wline-2 dark:divide-rink-700',
      )}>
        {classes.map((cls) => {
          // ─── Phase 1: 출석 상태 4-state 분기 ───
          const dateKey = cls.scheduledDate
            ? `${new Date(cls.scheduledDate).getFullYear()}-${String(
                new Date(cls.scheduledDate).getMonth() + 1,
              ).padStart(2, '0')}-${String(new Date(cls.scheduledDate).getDate()).padStart(2, '0')}`
            : null;
          const isToday = dateKey === todayKey;
          const childIds = scheduleIdToChildIds?.get(cls.id) ?? [];
          const attendance = attendanceMap?.get(cls.id) ?? {};

          // present 판별 — selectedChildId 가 있으면 그 자녀, 없으면 등록 자녀 전원
          const isAllPresent =
            childIds.length > 0 &&
            childIds.every((cid) => attendance[cid] === 'present');
          const isSelectedChildPresent =
            !!selectedChildId && attendance[selectedChildId] === 'present';
          const isPresent = selectedChildId ? isSelectedChildPresent : isAllPresent;

          // [2026-05-12 옵션 D] absent 잠금 — 코치/감독이 결석 처리한 일정은
          //   학부모/학생이 출석 처리할 수 없다 (백엔드 ForbiddenException 정합).
          //   UI는 출석 버튼을 숨기고 "결석 처리됨" 안내 chip 으로 대체한다.
          const isAllAbsent =
            childIds.length > 0 &&
            childIds.every((cid) => attendance[cid] === 'absent');
          const isSelectedChildAbsent =
            !!selectedChildId && attendance[selectedChildId] === 'absent';
          const isAbsent = selectedChildId ? isSelectedChildAbsent : isAllAbsent;

          // 시간 윈도우 — 오늘 일정에만 적용, 미래/과거 일정은 'before' 처리
          const windowState: AttendanceWindowState = isToday && cls.scheduledDate
            ? getAttendanceWindowState(cls.scheduledDate, cls.startTime, cls.endTime)
            : 'before';

          const canShowCheckInButton =
            !!onCheckIn && isToday && !isPresent && !isAbsent && windowState === 'open';

          const submitKeyPrefix = `${cls.id}:`;
          const isSubmittingThisCard =
            submittingKey != null && submittingKey.startsWith(submitKeyPrefix);

          // [2026-05-11 UX 정정] onCheckIn 있는 컨텍스트(학부모/학생 출석 처리)는 카드 본체
          //  클릭을 비활성화한다. 이미 수강 중인 사용자가 "등록하기" 페이지(/classes/:id)로
          //  잘못 진입하는 UX를 차단. 코치/감독(canManage 또는 onCheckIn 없음) 모드는 기존
          //  카드 클릭 → 수업 상세 흐름 유지.
          // 대회/매치/행사(isTournamentLike)는 수업 전용 출석/관리 흐름 대상이 아니다.
          //   출석 컨텍스트(onCheckIn)에서도 대회 카드 클릭은 살려 /tournaments 로 이동시킨다.
          const normType = String(cls.type ?? '').toUpperCase();
          const isTournamentLike =
            normType === 'TOURNAMENT' || normType === 'GAME' || normType === 'EVENT';
          const isCardClickable = !onCheckIn || isTournamentLike;
          // 캘린더 dot 색상 = 리스트 stripe/pill 색상 통일 (SoT).
          //   resolveTypeStyle 헬퍼 (위 정의) 가 모든 type 을 calendar-colors SoT 와 정합시킨다.
          const typeStyle = resolveTypeStyle(cls.type);
          const cardBody = (
            <>
              {/* 행 디자인 — 통합캘린더 ScheduleRow 토큰과 일치(default). child 는 WCAG AAA 유지.
                   [ICETIMES] iceTheme 시 시안 KitScheduleRow colorbar — w-1 rounded-[3px]. */}
              <div className={cn(
                'mt-1 w-1 shrink-0',
                !isChild && iceTheme ? 'rounded-[3px]' : 'rounded-full',
                isChild ? 'h-14' : 'min-h-[44px]',
                typeStyle.stripe,
              )} />
              <div className="min-w-0 flex-1">
                <div className={cn(
                  'flex items-center',
                  isChild ? 'gap-2 mb-2' : !isChild && iceTheme ? 'gap-[7px] mb-[3px]' : 'gap-2 mb-1',
                )}>
                  {/* [ICETIMES] iceTheme chip — 11.5px/700 tint14%(pillBg/pillText 토큰 유지). */}
                  <span className={cn(
                    'rounded-full',
                    isChild
                      ? 'px-2.5 py-1 text-card-body font-semibold'
                      : !isChild && iceTheme
                        ? 'px-[7px] py-0.5 text-[11.5px] font-bold'
                        : 'px-2 py-0.5 text-xs font-semibold',
                    typeStyle.pillBg,
                    typeStyle.pillText,
                  )}>
                    {typeStyle.label}
                  </span>
                  {/* [ICETIMES] iceTheme time — 13px/700. */}
                  <span className={cn(
                    'tabular-nums',
                    isChild
                      ? 'font-num font-semibold text-card-body text-wtext-2 dark:text-rink-100'
                      : !isChild && iceTheme
                        ? 'text-[13px] font-bold text-wtext-2 dark:text-rink-100'
                        : 'text-xs text-wtext-3 dark:text-rink-300',
                  )}>
                    {cls.time}
                  </span>
                </div>
                {/* [ICETIMES] iceTheme title — 15px/700. */}
                <p className={cn(
                  'truncate text-wtext-1 dark:text-white',
                  isChild
                    ? 'text-card-title font-black'
                    : !isChild && iceTheme
                      ? 'text-[15px] font-bold'
                      : 'text-sm font-bold',
                )}>
                  {cls.title}
                </p>
                {/* [ICETIMES] iceTheme location — place icon 14 + 12.5px text. */}
                <div className={cn(
                  'flex items-center gap-3',
                  isChild
                    ? 'mt-1.5 text-card-body font-medium text-wtext-2 dark:text-rink-100'
                    : !isChild && iceTheme
                      ? 'mt-0.5 text-[12.5px] text-wtext-3 dark:text-rink-300'
                      : 'mt-1 text-xs text-wtext-3 dark:text-rink-300',
                )}>
                  {cls.coach && (
                    <span className="flex items-center gap-1 truncate">
                      <Icon name="person" className={isChild ? 'text-[18px]' : 'text-[14px]'} aria-hidden="true" />
                      {cls.coach}
                    </span>
                  )}
                  {cls.location && (
                    <span className="flex items-center gap-1 truncate">
                      <Icon name="location_on" className={isChild ? 'text-[18px]' : 'text-[14px]'} aria-hidden="true" />
                      {cls.location}
                    </span>
                  )}
                </div>
              </div>
              {isCardClickable && (
                <Icon
                  name="chevron_right"
                  className={cn(
                    'mt-2 shrink-0 text-wtext-4 dark:text-rink-500',
                    isChild ? 'text-[22px]' : 'text-[18px]',
                  )}
                  aria-hidden="true"
                />
              )}
            </>
          );

          // [추가 W2.A-2 2026-05-18] 대회/매치 일정 클릭 → /tournaments (대회 및 경기 목록) 이동.
          //   isTournamentLike 는 위(출석 가드)에서 계산. classId 가 없거나 'tournament' 어댑팅 케이스 모두 흡수.
          const cardHref = isTournamentLike ? '/tournaments' : `/classes/${cls.classId}`;
          const cardAriaLabel = isTournamentLike
            ? `${cls.title} 대회 및 경기 목록 보기`
            : `${cls.title} 수업 상세 보기`;

          return (
            <li key={cls.id} className={cn(isChild ? 'px-5 py-4' : 'px-4 py-3')}>
              {isCardClickable ? (
                <button
                  type="button"
                  onClick={() => navigate(cardHref)}
                  className={cn(
                    'w-full flex items-start gap-3 text-left rounded-w-md transition-colors duration-150 motion-reduce:transition-none',
                    iceTheme ? 'hover:bg-it-fill dark:hover:bg-it-blue-900' : 'hover:bg-wline-2/50 dark:hover:bg-rink-700/50',
                    isChild ? '-mx-1.5 px-1.5 py-1.5' : '-mx-1 px-1 py-1',
                  )}
                  aria-label={cardAriaLabel}
                >
                  {cardBody}
                </button>
              ) : (
                <div className={cn(
                  'w-full flex items-start gap-3',
                  isChild ? '-mx-1.5 px-1.5 py-1.5' : '-mx-1 px-1 py-1',
                )}>
                  {cardBody}
                </div>
              )}

              {/* ─── Phase 1: 학부모/학생 출석 4-state — onCheckIn 있을 때만 노출
                   [Phase 2] variant='child' 시 WCAG AAA: 72×72dp 버튼, 폰트 18px+, 대비 7:1
                   대회/매치/행사는 수업 전용 출석 흐름 대상이 아니므로 제외 ─── */}
              {onCheckIn && !isTournamentLike && (
                <div className={cn(
                  'flex',
                  isChild ? 'mt-4 justify-stretch' : 'mt-2 justify-end',
                )}>
                  {/* ① 출석 완료 (최우선)
                       [2026-05-11 child 가독성 보강] text-card-emphasis → text-base (표준 Tailwind 16px).
                         tailwind-merge 가 text-w-* 커스텀 토큰을 color 로 잘못 인식해 다른 색상 클래스를
                         제거하는 충돌 회피. 색상 클래스를 분기 클래스에 명시 반복. */}
                  {isToday && isPresent && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-w-md bg-emerald-50 dark:bg-emerald-900/20',
                        isChild
                          ? 'w-full min-h-[72px] justify-center px-4 py-3 text-card-title-child font-bold !text-emerald-700 dark:!text-emerald-300 border-2 border-emerald-200 dark:border-emerald-800'
                          : 'px-2.5 py-1.5 text-card-meta font-extrabold text-emerald-700 dark:text-emerald-300',
                      )}
                      role="status"
                    >
                      <Icon
                        name="check_circle"
                        className={isChild ? 'text-3xl' : 'text-[14px]'}
                        filled={isChild}
                        aria-hidden="true"
                      />
                      출석 완료
                    </span>
                  )}
                  {/* ② 출석 가능 — 시간 윈도우 OPEN + 미체크
                       [2026-05-11 가독성 보강] text-white 를 분기 클래스에 반복해 tailwind-merge 충돌
                       방지 + text-base 표준 토큰 사용 (text-card-emphasis 회피). */}
                  {canShowCheckInButton && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCheckInClick(cls);
                      }}
                      disabled={isSubmittingThisCard}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-w-md shadow-sm',
                        // [ICETIMES] 시안 ParentHome 출석하기 = accent(it-red) sm.
                        //   child 는 WCAG AAA 메인 CTA 로 it-blue 유지(시안에 child 정의 없음).
                        iceTheme
                          ? isChild ? 'bg-it-blue-500 hover:bg-it-blue-600' : 'bg-it-red-500 hover:bg-it-red-600'
                          : 'bg-ice-500 hover:bg-ice-700',
                        'active:brightness-95 transition-colors motion-reduce:transition-none',
                        'disabled:cursor-not-allowed disabled:opacity-60',
                        isChild
                          ? 'w-full min-h-[72px] justify-center px-4 py-3 text-card-title-child font-bold !text-white gap-2'
                          : 'h-9 px-4 text-xs font-extrabold text-white',
                      )}
                      aria-label={`${cls.title} 출석하기`}
                    >
                      <Icon
                        name="how_to_reg"
                        className={isChild ? 'text-3xl' : 'text-[16px]'}
                        aria-hidden="true"
                      />
                      {isSubmittingThisCard ? '처리 중…' : '출석하기'}
                    </button>
                  )}
                  {/* [2026-05-12 옵션 D] 결석 처리됨 — 코치가 명시적으로 결석 처리한 일정.
                       학부모/학생은 변경 불가, 정정 요청 안내. 출석 완료/체크인 가능 보다 우선. */}
                  {isAbsent && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-w-md bg-flame-100 dark:bg-flame-500/20',
                        isChild
                          ? 'w-full min-h-[72px] justify-center px-4 py-3 text-card-title-child font-bold !text-flame-500 dark:!text-flame-100 border-2 border-flame-100 dark:border-flame-500/30'
                          : 'px-2.5 py-1.5 text-card-meta font-extrabold text-flame-500 dark:text-flame-100',
                      )}
                      role="status"
                      aria-label="코치 결석 처리됨"
                      title="코치가 결석 처리한 일정입니다. 정정이 필요하면 코치에게 문의해주세요."
                    >
                      <Icon
                        name="block"
                        className={isChild ? 'text-3xl' : 'text-[14px]'}
                        aria-hidden="true"
                      />
                      결석 처리됨
                    </span>
                  )}
                  {/* ③ 수업 시작 전 — 윈도우 미진입 */}
                  {isToday && !isPresent && !isAbsent && windowState === 'before' && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-w-md bg-wline-2 dark:bg-rink-700',
                        isChild
                          ? 'w-full min-h-[72px] justify-center px-4 py-3 text-card-title-child font-bold !text-wtext-2 dark:!text-rink-100 border-2 border-wline dark:border-rink-600'
                          : 'px-2.5 py-1.5 text-card-meta font-bold text-wtext-2 dark:text-rink-100',
                      )}
                      role="status"
                    >
                      <Icon
                        name="schedule"
                        className={isChild ? 'text-3xl' : 'text-[14px]'}
                        aria-hidden="true"
                      />
                      수업 시작 전
                    </span>
                  )}
                  {/* ④ 체크 종료 — 윈도우 경과 + 미체크 */}
                  {isToday && !isPresent && !isAbsent && windowState === 'closed' && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-w-md bg-wline-2 dark:bg-rink-700',
                        isChild
                          ? 'w-full min-h-[72px] justify-center px-4 py-3 text-card-title-child font-bold !text-wtext-2 dark:!text-rink-100 border-2 border-wline dark:border-rink-600'
                          : 'px-2.5 py-1.5 text-card-meta font-bold text-wtext-2 dark:text-rink-100',
                      )}
                      role="status"
                    >
                      <Icon
                        name="timer_off"
                        className={isChild ? 'text-3xl' : 'text-[14px]'}
                        aria-hidden="true"
                      />
                      체크 종료
                    </span>
                  )}
                </div>
              )}

              {/* 코치/감독 액션 — [출석 확인] [선수정보]
                  [2026-05-09] AI slop 톤(ice-50/mint-100 pastel) 제거.
                    중립 outline + 솔리드 보더 스타일로 통일 — DESIGN.md "정제된 핀테크 휴먼".
                  대회/매치/행사: 출석 흐름인 [출석 확인]만 제외, [선수정보](관리)는 노출 유지. */}
              {canManage && (
                <div className="mt-3 flex gap-2">
                  {!isTournamentLike && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/attendance/${cls.id}`);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-w-md bg-wbg dark:bg-rink-700 border border-wline-2 dark:border-rink-600 text-wtext-1 dark:text-white text-card-body font-bold hover:bg-wline-2 dark:hover:bg-rink-600 transition-colors motion-reduce:transition-none active:brightness-95"
                      aria-label={`${cls.title} ${MESSAGES.dashboard.calendarAction.attendance}`}
                    >
                      <Icon name="how_to_reg" className="text-[16px] text-wtext-2 dark:text-rink-200" aria-hidden="true" />
                      {MESSAGES.dashboard.calendarAction.attendance}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // [2026-06-16] 대회/경기는 classId 가 없으므로 대회 선수정보 페이지로 분기.
                      if (isTournamentLike && cls.tournamentId) {
                        navigate(`/tournaments/${cls.tournamentId}/students`);
                      } else {
                        navigate(`/classes/${cls.classId}/students`);
                      }
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-w-md bg-wbg dark:bg-rink-700 border border-wline-2 dark:border-rink-600 text-wtext-1 dark:text-white text-card-body font-bold hover:bg-wline-2 dark:hover:bg-rink-600 transition-colors motion-reduce:transition-none active:brightness-95"
                    aria-label={`${cls.title} ${MESSAGES.dashboard.calendarAction.players}`}
                  >
                    <Icon name="group" className="text-[16px] text-wtext-2 dark:text-rink-200" aria-hidden="true" />
                    {MESSAGES.dashboard.calendarAction.players}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* ─── Phase 1: 다중 자녀 선택 BottomSheet (학부모 전체 보기 + 자녀 ≥2 미체크) ─── */}
      <BottomSheet
        isOpen={!!pickerSchedule}
        onClose={() => setPickerSchedule(null)}
        title="어느 자녀의 출석을 처리할까요?"
        footer={
          <button
            type="button"
            onClick={() => setPickerSchedule(null)}
            className="w-full rounded-xl bg-wline-2 py-2.5 text-sm font-semibold text-wtext-2 hover:bg-wline dark:bg-rink-700 dark:text-rink-100 dark:hover:bg-rink-500"
          >
            취소
          </button>
        }
      >
        {pickerSchedule && (
          <>
            <p className="mb-3 text-xs text-wtext-3 dark:text-rink-300">
              {pickerSchedule.title} · {pickerSchedule.time}
            </p>
            <ul className="flex flex-col gap-2">
              {(scheduleIdToChildIds?.get(pickerSchedule.id) ?? [])
                .filter((cid) => (attendanceMap?.get(pickerSchedule.id) ?? {})[cid] !== 'present')
                .map((cid) => {
                  const name = childIdToName?.get(cid) ?? '자녀';
                  return (
                    <li key={cid}>
                      <button
                        type="button"
                        onClick={() => {
                          const s = pickerSchedule;
                          setPickerSchedule(null);
                          performCheckIn(s.id, cid, name, s.title);
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-wline px-4 py-3 text-left text-sm font-semibold text-wtext-1 hover:border-ice-500 hover:bg-ice-500/5 dark:border-rink-700 dark:text-white"
                      >
                        <span>{name}</span>
                        <Icon
                          name="chevron_right"
                          className="text-base text-wtext-3"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
