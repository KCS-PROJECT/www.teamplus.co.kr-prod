"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiRequest } from "@/services/api-client";
import { devWarn } from "@/lib/logger";
import type {
  ParentCalendarEvent,
  ParentCalendarEventType,
} from "@/components/parent/ParentMiniCalendar";

// ─── UI 인터페이스 ────────────────────────────────────────
export interface ChildInfo {
  id: string;
  name: string;
  grade: string;
  attendanceRate: number;
  nextClass: string;
  nextClassTime: string;
  profileEmoji: string;
  remainingCredits: number;
  /** Phase 1: 학습 레벨/진도 */
  currentLevel?: number;
  levelLabel?: string;
  progressPercent?: number;
  nextTestDate?: string | null;
  /**
   * 2026-04-23 회의 재설계 — 팀 내 그룹 이름(예: "블레이즈", "라이징").
   * Phase 1: DTO 필드만 세팅(화면 미노출). Phase 2 에서 소속팀 뱃지에 연동 예정.
   */
  teamName?: string | null;
  /** 2026-04-28: 자녀 카드 "이름 - 나이(출생년도)" 표기용 ISO 날짜 */
  birthDate?: string | null;
}

/**
 * 2026-04-27: 학부모 대시보드 "오늘 일정" 카드용 원본 데이터.
 * 백엔드 upcomingSchedules 응답을 표시 친화적 형태로 정규화.
 *  - dateKey: YYYY-MM-DD (오늘 필터/정렬 기준)
 *  - hhmm: HH:MM (UI 표시용 사전 포맷)
 *  - childIds: 자녀 슬라이드 필터링용 (전체 보기일 때는 무시)
 *
 * Phase 2 추가 필드:
 *  - scheduleId / classId: 학부모 출석 API 호출 키
 *  - attendanceByChild: 자녀별 출석 상태 — 카드 [출석하기] 버튼 분기용
 */
export interface ParentUpcomingSchedule {
  className: string;
  /** ISO 문자열 — 정렬/디테일 라우팅용 */
  scheduledDate: string;
  /** YYYY-MM-DD */
  dateKey: string;
  /** HH:MM */
  hhmm: string;
  /** "HH:mm" 회차 시작 시각 — scheduledDate 가 로컬 자정인 A 표준 일정의 출석 윈도우 합성용 */
  startTime: string | null;
  trainingType: string | null;
  /** [Phase B] 후불(POSTPAID) 여부 — 출석 모달 "결제권 차감" 문구 분기용. */
  billingMode: string | null;
  /** 2026-05-14: ClassCalendarSection 의 owner 분기용 (학원/팀) */
  teamId: string | null;
  academyId: string | null;
  childIds: string[];
  scheduleId: string;
  classId: string;
  /** { [childId]: 'present' | 'absent' | 'unchecked' } */
  attendanceByChild: Record<string, string>;
  /**
   * PR-D Hotfix #4 (v1.1): 자녀별 출석 가능 여부.
   * false 면 [출석하기] 대신 [수업권이 필요해요 + 결제하기] 분기 표시.
   * 만료 안 된 수업권 중 잔량 > 0 인 자녀만 true.
   * 백엔드 응답에 없는 경우 기본 true (하위 호환).
   */
  canCheckInByChild?: Record<string, boolean>;
}

export interface AttendanceDay {
  date: string;
  dayLabel: string;
  attended: boolean;
}

export interface NoticeItem {
  id: string;
  title: string;
  targetType?: string | null;
  createdAt: string;
  pinned?: boolean;
}

export interface AttendanceTrendItem {
  month: string;
  rate: number;
}

export interface RecentPaymentItem {
  id: string;
  description: string;
  amount: number;
  status: string;
  completedAt: string;
}

export interface CreditSummaryData {
  totalRemaining: number;
  expiringWithin30Days: number;
  usedThisMonth: number;
}

export interface ChildPerformanceData {
  childId: string;
  childName: string;
  attendanceRate: number;
  attendanceChange: number;
  totalClasses: number;
  attendedClasses: number;
  creditsUsed: number;
  creditsRemaining: number;
}

// W4: useDashboardData 통합용 파생 타입 (parent/page.tsx에서 사용)
export interface ParentCreditData {
  current: number;
  expiryDate: string;
}

export interface ParentUpcomingClass {
  tag: string;
  title: string;
  time: string;
  teacher: string;
  location: string;
}

export interface ParentNextClass {
  tag: string;
  title: string;
  time: string;
  teacher: string;
}

export interface ParentDashboardDerivedData {
  parentName: string;
  creditData: ParentCreditData;
  nextClass: ParentNextClass;
  upcomingClasses: ParentUpcomingClass[];
  recentActivities: Array<{ [key: string]: unknown }>;
}

// ─── 백엔드 응답 타입 ────────────────────────────────────
interface ParentDashboardResponse {
  // W4: useDashboardData 통합용 필드
  nextClass?: ParentNextClass;
  recentActivities?: Array<{ [key: string]: unknown }>;
  creditData?: { current?: number; expiryDate?: string };
  credits?: number;
  credit?: number;
  expiryDate?: string;
  children?: Array<{
    id: string;
    name: string;
    clubName?: string;
    /** 팀 내 그룹 이름 (설계서 §4.5) — Phase 1 DTO 세팅 완료 */
    teamName?: string | null;
    /** ISO 날짜 — 한국나이/출생년도 계산용 (2026-04-28 추가) */
    birthDate?: string | null;
    className?: string;
    remainingCredits?: number;
    nextClass?: string; // ISO date
    attendanceRate?: number;
    currentLevel?: number;
    levelLabel?: string;
    progressPercent?: number;
    nextTestDate?: string | null;
  }>;
  attendance?: {
    monthPresent?: number;
    monthAbsent?: number;
    presentRate?: string;
  };
  payments?: {
    totalPaidThisMonth?: number;
  };
  upcomingSchedules?: Array<{
    scheduleId?: string;
    classId?: string;
    className?: string;
    scheduledDate?: string | Date;
    /** 표시 시각 SoT (text "HH:mm") — 입력 그대로. scheduledDate 의 시:분은 신뢰 불가. */
    startTime?: string | null;
    trainingType?: string;
    /** [Phase B] 후불(POSTPAID) 여부 — 출석 모달 문구 분기용. */
    billingMode?: string | null;
    /** 2026-05-14: ClassCalendarSection 의 owner 분기용 (학원/팀) */
    teamId?: string | null;
    academyId?: string | null;
    childIds?: string[];
    /** 자녀별 출석 상태 — Phase 2 학부모 출석 버튼 분기용 */
    attendanceByChild?: Record<string, string>;
    /** PR-D Hotfix #4 (v1.1): 자녀별 출석 가능 여부 */
    canCheckInByChild?: Record<string, boolean>;
    [key: string]: unknown;
  }>;
  upcomingClasses?: Array<Record<string, unknown>>;
  parentName?: string;
  name?: string;
  // creditData/credits/credit/expiryDate는 상단 W4 통합 필드로 이관됨
  // 신규 필드 (Phase 2-1 Backend 확장)
  monthlyChildPerformance?: Array<{
    childId: string;
    childName: string;
    attendanceRate: number;
    attendanceChange: number;
    totalClasses: number;
    attendedClasses: number;
    creditsUsed: number;
    creditsRemaining: number;
  }>;
  attendanceTrend?: Array<{ month: string; rate: number }>;
  recentPayments?: Array<{
    id: string;
    description: string;
    amount: number;
    status: string;
    completedAt: string;
  }>;
  creditSummary?: {
    totalRemaining: number;
    expiringWithin30Days: number;
    usedThisMonth: number;
  };
  // W6: 백엔드 /dashboard/parent에서 통합 제공 (별도 /notices 호출 제거)
  latestNotices?: Array<{
    id: string;
    title: string;
    targetType?: string | null;
    createdAt: string | Date;
    pinned?: boolean;
  }>;
  // ⚡ BFF: 첫 자녀의 최근 14건 출석. 백엔드(parent-dashboard.service.ts) 통합으로
  //    /attendance/member/:id?limit=14 직렬 호출 200~350ms 제거. 백엔드 미배포 환경에서는
  //    필드가 없을 수 있으므로 optional + sessionStorage 캐시 fallback 유지.
  weeklyAttendance?: Array<{
    scheduledDate?: string | null;
    attendanceStatus?: string | null;
  }>;
}

interface AttendanceRecord {
  scheduledDate?: string;
  attendanceStatus?: string;
}

// ─── 헬퍼 ────────────────────────────────────────────────
const PROFILE_EMOJIS = ["⛸️", "🏒", "🥅", "🧊", "⭐"];
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatNextClassTime(isoDate?: string): string {
  if (!isoDate) return "예정 없음";
  const d = new Date(isoDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (diffDays === 0) return `오늘 ${hhmm}`;
  if (diffDays === 1) return `내일 ${hhmm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
}

/**
 * 2026-04-23 회의 재설계 §7.1 — Class.trainingType 을 학부모 미니 캘린더
 * 이벤트 타입으로 변환.
 *
 *  - lesson                                 → open_lesson    (🔴 레슨 일정)
 *  - 그 외 (regular 및 training 도메인) → team_training  (🟢 정규 훈련)
 *  - team_tournament (파란 dot) 은 Tournament 별도 모델이라 Phase 2 에서 추가
 *
 * deprecated 키(academy_lesson/game_lesson)도 과거 데이터 호환을 위해 lesson 계열로 인식.
 * training 도메인(REGULAR_TRAINING/GAME/FUN/CAMP/PICKUP)은 toLowerCase 후 fallback → team_training.
 */
function mapTrainingTypeToEventType(
  trainingType: string | undefined | null,
): ParentCalendarEventType {
  const t = String(trainingType ?? "").toLowerCase();
  if (t === "lesson" || t === "academy_lesson" || t === "game_lesson") {
    return "open_lesson";
  }
  return "team_training";
}

export function isNewNotice(isoDate?: string | Date): boolean {
  if (!isoDate) return false;
  const d = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return d > sevenDaysAgo;
}

function buildWeekDays(records: AttendanceRecord[]): AttendanceDay[] {
  const now = new Date();
  const result: AttendanceDay[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const record = records.find((r) => r.scheduledDate?.startsWith(dateStr));
    const attended = record
      ? record.attendanceStatus === "present" ||
        record.attendanceStatus === "late"
      : false;

    result.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      dayLabel: DAY_LABELS[d.getDay()],
      attended,
    });
  }

  return result;
}

// ─── Hook ────────────────────────────────────────────────
export function useParentHome() {
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [weeklyAttendance, setWeeklyAttendance] = useState<AttendanceDay[]>([]);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceTrendItem[]>(
    [],
  );
  const [recentPayments, setRecentPayments] = useState<RecentPaymentItem[]>([]);
  const [creditSummary, setCreditSummary] = useState<CreditSummaryData | null>(
    null,
  );
  const [childPerformance, setChildPerformance] = useState<
    ChildPerformanceData[]
  >([]);
  // 2026-04-23 회의 재설계 §4.1 ④ — 미니 캘린더 이벤트 배열 (날짜별 dot)
  const [calendarEvents, setCalendarEvents] = useState<ParentCalendarEvent[]>(
    [],
  );
  // 2026-04-27: "오늘 일정" 카드용 원본 (className/시간 포함, ParentCalendarEvent 와 같은 origin)
  const [upcomingSchedules, setUpcomingSchedules] = useState<
    ParentUpcomingSchedule[]
  >([]);
  // W4: useDashboardData 통합 — 동일 응답에서 파생 필드 추출
  const [derivedData, setDerivedData] =
    useState<ParentDashboardDerivedData | null>(null);
  // 섹션별 독립 로딩 플래그 (단일 isLoading 대체)
  const [dashLoading, setDashLoading] = useState(true); // 대시보드(메인) 로딩
  const [attendanceLoading, setAttendanceLoading] = useState(true); // 주간 출석 별도 로딩
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setDashLoading(true);
    setAttendanceLoading(true);
    setError(null);

    // ⚡ 직렬 → 병렬 최적화: 이전 세션의 첫 자녀 ID 를 sessionStorage 에서 읽어
    //    /dashboard/parent 와 /attendance/member 를 동시 시작. 두 번째 마운트부터
    //    200~350ms 단축. 첫 마운트는 캐시 미스로 기존 직렬 fallback (아래 #3 참조).
    //
    //    ⚠️ 자녀 변경 시 stale ID 위험: dashboard 응답의 firstChildId 와 비교 후
    //    불일치하면 캐시된 응답을 무시하고 새로 fetch. 갱신은 새 ID 로 sessionStorage 덮어씀.
    const PRIMARY_CHILD_KEY = "teamplus_primary_child_id";
    const cachedChildId =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(PRIMARY_CHILD_KEY)
        : null;

    // W6: 대시보드 단일 호출 — latestNotices는 백엔드가 함께 반환 (별도 /notices 호출 제거)
    const dashPromise = apiRequest<ParentDashboardResponse>({
      method: "GET",
      url: "/dashboard/parent",
      retry: false,
    });
    const optimisticAttPromise = cachedChildId
      ? apiRequest<AttendanceRecord[]>({
          method: "GET",
          url: `/attendance/member/${cachedChildId}?limit=14`,
          retry: false,
        })
      : Promise.resolve(null);

    const [dashRes, optimisticAttRes] = await Promise.all([
      dashPromise,
      optimisticAttPromise,
    ]);

    let firstChildId: string | null = null;

    // 2) 자녀 데이터 매핑
    if (dashRes.success && dashRes.data) {
      const api = dashRes.data;
      const rawChildren = api.children ?? [];

      const mappedChildren: ChildInfo[] = rawChildren.map((c, idx) => ({
        id: c.id,
        name: c.name,
        // 2026-04-23 회의 재설계: 승인된 자녀만 반환되므로 clubName 은 항상 존재.
        // 이론상 null 이면 폴백으로 빈 문자열 — UI 측에서 trim 기준으로 뱃지 숨김.
        grade: c.clubName ?? "",
        attendanceRate:
          typeof c.attendanceRate === "number"
            ? c.attendanceRate
            : Math.round(Number(api.attendance?.presentRate ?? 0)),
        nextClass: c.className ?? "예정된 수업 없음",
        nextClassTime: formatNextClassTime(c.nextClass),
        profileEmoji: PROFILE_EMOJIS[idx % PROFILE_EMOJIS.length],
        remainingCredits: c.remainingCredits ?? 0,
        currentLevel: c.currentLevel,
        levelLabel: c.levelLabel,
        progressPercent: c.progressPercent,
        nextTestDate: c.nextTestDate ?? null,
        // Phase 1: DTO 세팅만 (화면 미노출). 설계서 §2.2 용어 정책 준수.
        teamName: c.teamName ?? null,
        // 2026-04-28: 자녀 카드 "이름 - 나이(출생년도)" 표기용
        birthDate: c.birthDate ?? null,
      }));

      setChildren(mappedChildren);

      // 2-b) 신규 데이터 매핑
      setAttendanceTrend(api.attendanceTrend ?? []);
      setRecentPayments(api.recentPayments ?? []);
      setCreditSummary(api.creditSummary ?? null);
      setChildPerformance(api.monthlyChildPerformance ?? []);

      // 2-c) 미니 캘린더 이벤트 매핑 — 설계서 §4.1 ④ · §7.1 색상 규칙
      // 2026-04-27: 자녀 슬라이드 변경 시 캘린더 필터링을 위해 childIds 함께 전파.
      const events: ParentCalendarEvent[] = (api.upcomingSchedules ?? [])
        .map((s): ParentCalendarEvent | null => {
          const scheduled = s.scheduledDate;
          if (scheduled == null) return null;
          const d = scheduled instanceof Date ? scheduled : new Date(scheduled);
          if (Number.isNaN(d.getTime())) return null;
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return {
            date: `${y}-${m}-${day}`,
            type: mapTrainingTypeToEventType(s.trainingType),
            childIds: Array.isArray(s.childIds) ? s.childIds : undefined,
          };
        })
        .filter((e): e is ParentCalendarEvent => e !== null);
      setCalendarEvents(events);

      // 2-d) "오늘 일정" 카드용 원본 매핑 — Phase 2 출석 버튼 분기용 필드 포함.
      // scheduleId/classId 가 없는 레거시 응답 (백엔드 미재시작 또는 Redis 캐시) 도
      // 일정 표시는 살리고 출석 버튼만 자동 비활성화 (빈 문자열 폴백).
      const schedulesForList: ParentUpcomingSchedule[] = (
        api.upcomingSchedules ?? []
      )
        .map((s): ParentUpcomingSchedule | null => {
          const scheduled = s.scheduledDate;
          if (scheduled == null) return null;
          const d = scheduled instanceof Date ? scheduled : new Date(scheduled);
          if (Number.isNaN(d.getTime())) return null;
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const hh = String(d.getHours()).padStart(2, "0");
          const mm = String(d.getMinutes()).padStart(2, "0");
          // 표시 시각은 백엔드가 준 startTime(text "HH:mm") 우선 — 입력 그대로.
          //   scheduledDate.getHours() 폴백은 timestamp 기반이라 부정확(레거시 회귀 방지용).
          const startTimeText =
            typeof s.startTime === "string" && s.startTime ? s.startTime : null;
          return {
            scheduleId: typeof s.scheduleId === "string" ? s.scheduleId : "",
            classId: typeof s.classId === "string" ? s.classId : "",
            className: s.className ?? "수업",
            scheduledDate: d.toISOString(),
            dateKey: `${y}-${m}-${day}`,
            hhmm: startTimeText ?? `${hh}:${mm}`,
            startTime: startTimeText,
            trainingType: s.trainingType ?? null,
            // [Phase B] 후불 여부 — 출석 모달 "결제권 차감" 문구 분기용.
            billingMode:
              typeof s.billingMode === "string" ? s.billingMode : null,
            // 2026-05-14: BE 응답 그대로 전파 — 대시보드 캘린더의 owner 분기에서 사용.
            teamId: typeof s.teamId === "string" ? s.teamId : null,
            academyId: typeof s.academyId === "string" ? s.academyId : null,
            childIds: Array.isArray(s.childIds) ? s.childIds : [],
            attendanceByChild:
              typeof s.attendanceByChild === "object" &&
              s.attendanceByChild !== null
                ? (s.attendanceByChild as Record<string, string>)
                : {},
            // PR-D Hotfix #4 (v1.1): 백엔드 응답에 없으면 undefined → 컴포넌트에서 기본 true 처리
            canCheckInByChild:
              typeof s.canCheckInByChild === "object" &&
              s.canCheckInByChild !== null
                ? (s.canCheckInByChild as Record<string, boolean>)
                : undefined,
          };
        })
        .filter((s): s is ParentUpcomingSchedule => s !== null);
      setUpcomingSchedules(schedulesForList);

      // W6: 공지사항 — 대시보드 응답에서 직접 추출 (아동/감독과 동일 패턴)
      const latestNotices: NoticeItem[] = (api.latestNotices ?? []).map(
        (n) => ({
          id: n.id,
          title: n.title,
          targetType: n.targetType ?? null,
          createdAt:
            typeof n.createdAt === "string"
              ? n.createdAt
              : n.createdAt instanceof Date
                ? n.createdAt.toISOString()
                : new Date().toISOString(),
          pinned: n.pinned ?? false,
        }),
      );
      setNotices(latestNotices);

      // W4: useDashboardData 통합 파생 데이터 매핑
      setDerivedData({
        // 폴백 문자열에 "님" 포함 금지 — AppBar 가 "{name}님" 자동 부착
        parentName: api.parentName ?? api.name ?? "회원",
        creditData: {
          current: api.creditData?.current ?? api.credits ?? api.credit ?? 0,
          expiryDate: api.creditData?.expiryDate ?? api.expiryDate ?? "-",
        },
        nextClass: api.nextClass ?? {
          tag: "수업",
          title: "예정된 수업이 없습니다",
          time: "-",
          teacher: "-",
        },
        upcomingClasses: (api.upcomingSchedules ?? api.upcomingClasses ?? [])
          .slice(0, 5)
          .map((s: Record<string, unknown>) => ({
            tag: (s.tag as string) ?? "수업",
            title: (s.className as string) ?? (s.title as string) ?? "수업",
            time:
              (s.time as string) ??
              (s.scheduledDate
                ? new Date(s.scheduledDate as string).toLocaleDateString(
                    "ko-KR",
                    {
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )
                : "-"),
            teacher: (s.teacher as string) ?? (s.coachName as string) ?? "-",
            location: (s.location as string) ?? "",
          })),
        recentActivities: api.recentActivities ?? [],
      });

      if (mappedChildren.length > 0) firstChildId = mappedChildren[0].id;
    } else {
      devWarn("Parent dashboard API unavailable, using empty data");
    }

    // 대시보드 단계 완료 → 즉시 플래그 해제 (주간 출석은 별도 로딩)
    setDashLoading(false);

    // 3) 주간 출석 우선순위:
    //    a) BFF: dashboard 응답의 weeklyAttendance — RTT 추가 0회 (최우선)
    //    b) 캐시 hit: cachedChildId === firstChildId 인 경우 병렬 fetch 결과 사용
    //    c) Fallback: 직렬 fetch (첫 마운트 + 백엔드 미배포 환경)
    try {
      const bffAttendance =
        dashRes.success &&
        dashRes.data &&
        Array.isArray(
          (dashRes.data as ParentDashboardResponse).weeklyAttendance,
        )
          ? ((dashRes.data as ParentDashboardResponse)
              .weeklyAttendance as Array<{
              scheduledDate?: string | null;
              attendanceStatus?: string | null;
            }>)
          : null;

      const cacheHit =
        optimisticAttRes &&
        optimisticAttRes.success &&
        Array.isArray(optimisticAttRes.data) &&
        cachedChildId === firstChildId;

      if (bffAttendance) {
        // BFF 응답 → AttendanceRecord 호환 매핑 (null → undefined 보정)
        const records: AttendanceRecord[] = bffAttendance.map((a) => ({
          scheduledDate: a.scheduledDate ?? undefined,
          attendanceStatus: a.attendanceStatus ?? undefined,
        }));
        setWeeklyAttendance(buildWeekDays(records));
      } else if (cacheHit) {
        setWeeklyAttendance(buildWeekDays(optimisticAttRes!.data!));
      } else if (firstChildId) {
        const attRes = await apiRequest<AttendanceRecord[]>({
          method: "GET",
          url: `/attendance/member/${firstChildId}?limit=14`,
          retry: false,
        });
        if (attRes.success && Array.isArray(attRes.data)) {
          setWeeklyAttendance(buildWeekDays(attRes.data));
        } else {
          setWeeklyAttendance(buildWeekDays([]));
        }
      } else {
        setWeeklyAttendance(buildWeekDays([]));
      }

      // ⚡ 다음 마운트 병렬 fetch 를 위해 firstChildId 캐시.
      //    null 이면 캐시 제거(자녀 전체 삭제 케이스).
      if (typeof window !== "undefined") {
        if (firstChildId) {
          window.sessionStorage.setItem(PRIMARY_CHILD_KEY, firstChildId);
        } else {
          window.sessionStorage.removeItem(PRIMARY_CHILD_KEY);
        }
      }
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  // Strict Mode dev 환경 useEffect 더블 호출로 인한 중복 fetch 차단.
  // production 환경에서는 useEffect가 1회만 실행되므로 영향이 없다.
  const initialFetchedRef = useRef(false);
  useEffect(() => {
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    fetchAll();
  }, [fetchAll]);

  /**
   * 2026-04-27 (Phase 2 · D-A~E): 학부모가 자녀 출석을 대리 체크하는 mutation.
   * 성공 시 fetchAll() 로 잔량/출석 상태 즉시 갱신.
   */
  const checkInChild = useCallback(
    async (
      scheduleId: string,
      childId: string,
    ): Promise<
      | { ok: true; remainingSessions: number; className: string }
      | { ok: false; message: string }
    > => {
      const res = await apiRequest<{
        id: string;
        scheduleId: string;
        childId: string;
        className: string;
        remainingSessions: number;
      }>({
        method: "POST",
        url: "/attendance/parent-check-in",
        data: { scheduleId, childId },
        retry: false,
      });
      if (res.success && res.data) {
        // 출석 상태/결제권 잔량 즉시 갱신
        await fetchAll();
        return {
          ok: true,
          remainingSessions: res.data.remainingSessions,
          className: res.data.className,
        };
      }
      return {
        ok: false,
        message: res.error?.message ?? "출석 체크에 실패했습니다.",
      };
    },
    [fetchAll],
  );

  return {
    children,
    weeklyAttendance,
    notices,
    attendanceTrend,
    recentPayments,
    creditSummary,
    childPerformance,
    calendarEvents,
    upcomingSchedules,
    derivedData,
    dashLoading,
    attendanceLoading,
    isLoading: dashLoading || attendanceLoading,
    error,
    refresh: fetchAll,
    checkInChild, // Phase 2: 학부모 자녀 대리 출석 mutation
  };
}
