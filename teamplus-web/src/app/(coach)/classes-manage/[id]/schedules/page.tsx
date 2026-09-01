'use client';

import { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar as AppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useDateTime } from '@/hooks/useDateTime';
import { MultiDatePickerModal, type MultiDateResolved } from '@/components/ui/MultiDatePickerModal';
import { ScheduleCalendarView } from '@/components/classes/ScheduleCalendarView';
import { TimePicker, addMinutes, nextFullHour } from '@/components/ui/TimePicker';
import { VenueSearchSheet } from '@/components/venue/VenueSearchSheet';
import { formatDaySchedulesFull, sortDaySchedules } from '@/lib/class-categories';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { cn } from '@/lib/utils';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { getDashboardPathByUserType } from '@/lib/auth-routing';

/* ─────────────────────────── Types ─────────────────────────── */

interface ClassHeader {
  id: string;
  // 학원 수업은 teamId=null + academyId 보유. 둘 중 하나는 반드시 존재.
  teamId: string | null;
  academyId?: string | null;
  className: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  /** regular | lesson | spot — spot(1회용)은 일정 1개 제한. */
  trainingType?: string | null;
  classDays?: string[];
  startTime?: string;
  endTime?: string;
  // 요일별 기본값(ClassDaySchedule 템플릿) — getClass 응답 매핑. 미니달력 "요일별 기본값 적용"에 사용.
  daySchedules?: {
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    venueId?: string | null;
    venueName?: string | null;
  }[];
  // [일정·판매 관리 승격] 수명주기 파생 상태(getClass 응답) — 판매 준비 섹션 분기.
  lifecycleStatus?: 'ON_SALE' | 'PENDING_SCHEDULE' | 'ENDED' | null;
  pendingReason?: 'NO_SCHEDULE' | 'UNAPPROVED_MONTH' | null;
  earliestRemainingMonth?: string | null;
  endedAt?: string | null;
}

/** 월 정기권(MONTHLY_FIXED) — 판매 준비 섹션의 월분 갱신 대상. */
interface MonthlyPkg {
  id: string;
  productName: string;
  description?: string | null;
  price: number;
  feeType?: string;
  isActive?: boolean;
  billingMonth?: string | null;
  durationDays?: number | null;
  sessionsPerMonth?: number | null;
  sessionsPerWeek?: number | null;
  /** 1회 수업료(후불 단가·선불 참고) — 갱신 제안 금액 계산에 사용. */
  feePerSession?: number | null;
}

interface ScheduleItem {
  id: string;
  scheduledDate: string;
  /** 회차별 시각(HH:mm) — 미니달력/오픈클래스로 추가된 일정에 저장됨. 없으면 scheduledDate 시각 폴백. */
  startTime?: string | null;
  endTime?: string | null;
  venue?: { id: string; name: string } | null;
  isCancelled: boolean;
  cancellationReason?: string | null;
  createdAt?: string;
  /** 낙관적 잠금 기준 버전(apply-draft baseUpdatedAt) — GET schedules 응답 포함. */
  updatedAt?: string;
}

/* ── [설계 v4.1 §3.1] 일정 draft reducer — 저장 전까지 서버 무접촉 ──
   invariant (reducer 가 강제):
     1) cancels 에 있는 id 는 edits 에 공존 불가 — toggleCancel ON 시 edits 제거,
        editServer/applyToAll 은 cancels 포함 id 를 대상에서 제외.
     2) edits 는 원본과 동일 값이면 항목을 갖지 않는다 (no-op 미기록).
     3) adds 는 중복 날짜·서버 활성 날짜와 겹치지 않는다 (addDates 에서 skip). */

interface DraftAdd {
  key: string;
  date: string; // YYYY-MM-DD
  startTime: string; // '' = 시간 미정
  endTime: string;
  venueId: string;
  venueName: string;
}
interface DraftEditVal {
  startTime: string;
  endTime: string;
  venueId: string;
  venueName: string;
  /** 저장 시 낙관적 잠금 기준 — 기록 시점 서버 row 의 updatedAt. */
  baseUpdatedAt: string;
}
interface DraftState {
  adds: DraftAdd[];
  edits: Record<string, DraftEditVal>;
  cancels: string[];
}
type DraftAction =
  | { type: "addDates"; items: Omit<DraftAdd, "key">[]; existingDates: string[] }
  | { type: "updateAdd"; key: string; patch: Partial<Omit<DraftAdd, "key" | "date">> }
  | { type: "removeAdd"; key: string }
  | {
      type: "editServer";
      id: string;
      edit: DraftEditVal;
      original: { startTime: string; endTime: string; venueId: string };
    }
  | { type: "toggleCancel"; id: string }
  | {
      type: "applyToAll";
      edit: Omit<DraftEditVal, "baseUpdatedAt">;
      targets: { id: string; baseUpdatedAt: string; original: { startTime: string; endTime: string; venueId: string } }[];
    }
  | { type: "dropConflicts"; scheduleIds: string[] } // 409 응답 — 충돌 항목만 제거 (Phase 3)
  | { type: "clearAll" };

let draftKeySeq = 0;
const EMPTY_DRAFT: DraftState = { adds: [], edits: {}, cancels: [] };

/** [설계 §3.4] 병합 목록 단일 SoT 의 행 — 건수·빈 상태·달력·월 그룹 전부 이것 기준. */
type RowItem =
  | { kind: 'server'; s: ScheduleItem }
  | { kind: 'draft'; d: DraftAdd };

function rowDate(row: RowItem): string {
  if (row.kind === 'draft') return row.d.date;
  const d = new Date(row.s.scheduledDate);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function sameAsOriginal(
  edit: { startTime: string; endTime: string; venueId: string },
  original: { startTime: string; endTime: string; venueId: string },
): boolean {
  return (
    edit.startTime === original.startTime &&
    edit.endTime === original.endTime &&
    edit.venueId === original.venueId
  );
}

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "addDates": {
      const taken = new Set([
        ...action.existingDates,
        ...state.adds.map((a) => a.date),
      ]);
      // [Codex R1-2] 수용한 날짜를 즉시 taken 에 추가 — 같은 액션 안의 중복 날짜도 skip.
      const fresh: DraftAdd[] = [];
      for (const it of action.items) {
        if (taken.has(it.date)) continue;
        taken.add(it.date);
        draftKeySeq += 1;
        fresh.push({ ...it, key: `da${draftKeySeq}` });
      }
      if (fresh.length === 0) return state;
      return { ...state, adds: [...state.adds, ...fresh] };
    }
    case "updateAdd":
      return {
        ...state,
        adds: state.adds.map((a) =>
          a.key === action.key ? { ...a, ...action.patch } : a,
        ),
      };
    case "removeAdd":
      return { ...state, adds: state.adds.filter((a) => a.key !== action.key) };
    case "editServer": {
      if (state.cancels.includes(action.id)) return state; // invariant 1
      const next = { ...state.edits };
      if (sameAsOriginal(action.edit, action.original)) {
        delete next[action.id]; // invariant 2 — 원복 시 dirty 소멸
      } else {
        next[action.id] = action.edit;
      }
      return { ...state, edits: next };
    }
    case "toggleCancel": {
      if (state.cancels.includes(action.id)) {
        return { ...state, cancels: state.cancels.filter((c) => c !== action.id) };
      }
      const nextEdits = { ...state.edits };
      delete nextEdits[action.id]; // invariant 1 — 취소 마킹 시 수정 draft 제거
      return { ...state, edits: nextEdits, cancels: [...state.cancels, action.id] };
    }
    case "applyToAll": {
      const nextEdits = { ...state.edits };
      for (const t of action.targets) {
        if (state.cancels.includes(t.id)) continue; // invariant 1 — 취소 예정 제외
        const edit: DraftEditVal = { ...action.edit, baseUpdatedAt: t.baseUpdatedAt };
        if (sameAsOriginal(edit, t.original)) {
          delete nextEdits[t.id];
        } else {
          nextEdits[t.id] = edit;
        }
      }
      const adds = state.adds.map((a) => ({
        ...a,
        startTime: action.edit.startTime,
        endTime: action.edit.endTime,
        venueId: action.edit.venueId,
        venueName: action.edit.venueName,
      }));
      return { ...state, edits: nextEdits, adds };
    }
    case "dropConflicts": {
      const drop = new Set(action.scheduleIds);
      const nextEdits = { ...state.edits };
      for (const id of drop) delete nextEdits[id];
      return {
        ...state,
        edits: nextEdits,
        cancels: state.cancels.filter((c) => !drop.has(c)),
      };
    }
    case "clearAll":
      return EMPTY_DRAFT;
    default:
      return state;
  }
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 회차 시간 스텝 — 달력 뷰 수정 시트(EDIT_STEP_MINUTES)·수정 폼(SCHEDULE_STEP_MINUTES)과 동일값.
const EDIT_STEP_MINUTES = 10;
// 아코디언 수정 패널 입력 공통 클래스 — 수정 폼 패널 필드와 동일 규격(it-surface 표면).
const EDIT_FIELD_CLASS =
  'w-full h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500';
// 제안 금액 요일 정보 노출 순서 — 월요일 시작 (가격 계산 도우미와 동일 관례).
const CALC_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
// 회차 스테퍼 ± 버튼 공통 골격.
const CALC_STEP_BTN =
  'w-9 h-9 flex items-center justify-center text-it-ink-800 dark:text-white disabled:opacity-40 active:brightness-95';

/** 금액 표시 — 저장값(숫자 문자열)을 콤마 표기로. 빈 값은 그대로. */
function formatPriceDisplay(raw: string): string {
  return raw === '' ? '' : Number(raw).toLocaleString();
}

/** apply-draft 멱등 키 — RFC4122 v4 (crypto.randomUUID 미지원 구형 WebView 폴백 포함). */
function newOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 오늘(로컬) "YYYY-MM-DD" — 지난 회차 경계 판정 공용. */
function todayKeyOf(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

/** "YYYY-MM-DD" → 한글 요일 ("월"~"일") — TZ 시프트 방지 로컬 파싱 (ClassForm 과 동일 규칙). */
function weekdayOfDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

// scheduledDate(@db.Date)엔 시각 성분이 없어(항상 UTC 자정) 시각은 startTime 필드만 신뢰한다.

/* ─────────────────────────── Component ─────────────────────────── */

export default function ClassSchedulesManagePage() {
  const params = useParams<{ id: string }>();
  const classId = params?.id ?? '';
  const { toast } = useToast();
  const { modal } = useModal();
  const { user } = useSessionAuth();
  const router = useRouter();
  const { navigate, back } = useNavigation();

  // [hotfix 2026-05-13 D10] 이중 헤더 방지 — Web PageAppBar(forceNative) 단독 사용.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const [cls, setCls] = useState<ClassHeader | null>(null);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 지난 일정 접기 — 기본 접힘(다가오는 회차만), 토글로 펼침.
  const [showPastList, setShowPastList] = useState(false);
  // 월 그룹 펼침 상태 — 사용자가 명시 토글한 달만 기록. 미기록 달의 기본값은
  //   "가장 가까운 달(첫 그룹)만 펼침" (아래 렌더에서 판정).
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  // 풀스크린 로더 fast-path — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // 미니달력(복수 날짜 선택) — 정규/오픈 수업 일정 추가용
  const [multiDateOpen, setMultiDateOpen] = useState(false);

  // [설계 v4.1 §3.1] 일정 draft — 추가·수정·취소 전부 로컬로 쌓이고 [저장하기]에서
  //   apply-draft 로 일괄 반영된다 (Phase 3). 저장 전까지 서버 무접촉.
  const [draft, dispatchDraft] = useReducer(draftReducer, EMPTY_DRAFT);
  // [설계 §3.5] dirty 판정 — 저장 바 노출·판매 준비 잠금·이탈 가드 공용.
  const dirtyCount =
    draft.adds.length + Object.keys(draft.edits).length + draft.cancels.length;
  // [설계 §3.3] 저장 재진입 차단 + saving 동안 모든 draft mutator 잠금.
  const [saving, setSaving] = useState(false);
  // operationId 수명: 저장 시 생성 → draft 내용 변경 시 폐기(아래 effect).
  //   내용이 안 바뀐 실패 재시도는 같은 id 재사용 → 서버 멱등 replay (§4.1-2).
  const operationIdRef = useRef<string | null>(null);
  useEffect(() => {
    operationIdRef.current = null;
  }, [draft]);
  const { year: serverYear, month: serverMonth } = useDateTime();
  const initialYear = useMemo(() => {
    const y = Number(serverYear);
    return Number.isFinite(y) && y > 0 ? y : new Date().getFullYear();
  }, [serverYear]);
  const initialMonth = useMemo(() => {
    const m = Number(serverMonth);
    return Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
  }, [serverMonth]);

  const fetchClass = useCallback(async (): Promise<ClassHeader | null> => {
    if (!classId) return null;
    const res = await api.get<ClassHeader>(`/classes/${classId}`);
    if (res.success && res.data) {
      setCls(res.data);
      return res.data;
    } else if (res.error?.statusCode === 403) {
      // 비소속 매니저의 일정 관리 페이지 직접 접근 차단.
      toast.error(MESSAGES.class.accessDenied);
      const path = getDashboardPathByUserType(user?.userType) ?? '/';
      router.replace(path);
    }
    return null;
  }, [classId, router, toast, user?.userType]);

  // 학원/팀 통합 owner 경로 헬퍼.
  //   - 학원 수업: /api/v1/academies/:academyId/classes/:classId/...
  //   - 팀 수업:   /api/v1/teams/:teamId/classes/:classId/...
  const getOwnerPath = useCallback((c: ClassHeader | null): string | null => {
    if (!c) return null;
    if (c.academyId) return `/academies/${c.academyId}/classes/${c.id}`;
    if (c.teamId) return `/teams/${c.teamId}/classes/${c.id}`;
    return null;
  }, []);

  const fetchSchedules = useCallback(async (target: ClassHeader) => {
    const basePath = getOwnerPath(target);
    if (!classId || !basePath) return;
    // 범위 미지정 — 해당 수업의 전체 회차를 조회 (특정 달이 아닌 전체 일정 관리).
    const res = await api.get<ScheduleItem[]>(`${basePath}/schedules`);
    if (res.success && Array.isArray(res.data)) {
      // 취소된 일정은 관리 화면에서 숨김 — 이력은 DB(isCancelled)에 그대로 보존.
      const sorted = res.data
        .filter((s) => !s.isCancelled)
        .sort(
          (a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime(),
        );
      setSchedules(sorted);
    }
  }, [classId, getOwnerPath]);

  // [설계 §3.3 Codex M2] class·schedules 재조회를 둘 다 명시적으로 await —
  //   effect 연쇄(cls 변경 → 별도 effect)에 기대면 저장 직후 화면 갱신 완료가 미보장.
  const refreshAll = useCallback(async () => {
    const fresh = await fetchClass();
    if (fresh && (fresh.academyId || fresh.teamId)) await fetchSchedules(fresh);
  }, [fetchClass, fetchSchedules]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await fetchClass();
      setIsLoading(false);
    })();
  }, [fetchClass]);

  useEffect(() => {
    if (cls && (cls.academyId || cls.teamId)) fetchSchedules(cls);
  }, [cls, fetchSchedules]);

  const isApproved = cls?.approvalStatus === 'APPROVED';

  // [Lifecycle v4.1 §7.1] spot(1회용) — 활성 일정 1개 제한 (schedules 는 취소 제외 상태).
  //   병합 기준: 서버 활성 − 취소 예정 draft + 추가 draft (handleConfirmDates 가드와 동일 공식).
  const isSpot = cls?.trainingType === 'spot';
  const spotLimitReached =
    isSpot && schedules.length - draft.cancels.length + draft.adds.length >= 1;

  /* ── [일정·판매 관리 승격] 판매 준비 플로우 — 상세 배너에서 이관 ──
     ① 일정 등록 → ② 월 정기권 월분 확인 → ③ 판매 시작 단일 플로우.
     상태(NO_SCHEDULE/UNAPPROVED_MONTH)에 따라 ②③이 잠기고 풀린다. */
  const isEnded = Boolean(cls?.endedAt);
  const isNoSchedulePending =
    cls?.lifecycleStatus === 'PENDING_SCHEDULE' &&
    cls?.pendingReason === 'NO_SCHEDULE';
  const isUnapprovedPending =
    cls?.lifecycleStatus === 'PENDING_SCHEDULE' &&
    cls?.pendingReason === 'UNAPPROVED_MONTH';
  const targetMonthIso = cls?.earliestRemainingMonth ?? null;
  // @db.Date ISO 직렬화(UTC 자정) — UTC getter 로 월 추출 (상세 페이지와 동일 규칙).
  const targetMonthLabel = targetMonthIso
    ? new Date(targetMonthIso).getUTCMonth() + 1
    : null;
  const targetMonthKey = targetMonthIso ? targetMonthIso.slice(0, 7) : null;

  const [monthlyPkgs, setMonthlyPkgs] = useState<MonthlyPkg[] | null>(null);
  // 소진(isActive:false) 포함 전체 월정액 행 — 앵커 달(가장 가까운 스냅샷 달) 판정 전용.
  //   감독 조회는 서버가 비활성 행도 내려준다(shouldHideInactiveFor 는 학부모 계열만 숨김).
  const [monthlyRowsAll, setMonthlyRowsAll] = useState<MonthlyPkg[] | null>(null);
  const [pkgPrices, setPkgPrices] = useState<Record<string, string>>({});
  // 제안 금액 회차 스테퍼 — 항목별 선택 회수의 원시 입력 문자열
  //   (미지정 = 대상월 전체 회차 기본값 · '' = 입력 중 임시 빈 값 허용).
  const [calcCounts, setCalcCounts] = useState<Record<string, string>>({});
  const [pkgNames, setPkgNames] = useState<Record<string, string>>({});
  // 미등록 행 설명 편집 — 미지정 = 원본 설명 승계 (학부모 결제 화면 노출 텍스트).
  const [pkgDescs, setPkgDescs] = useState<Record<string, string>>({});
  const [pkgSubmitting, setPkgSubmitting] = useState<string | null>(null);
  const [openingSales, setOpeningSales] = useState(false);
  // 1회 수업료(참고 단가) — 갱신 제안 금액 계산용. 산출값은 프리필에만 쓰고 서버 미전송.
  const [unitPriceRef, setUnitPriceRef] = useState(0);

  const fetchMonthlyPkgs = useCallback(async () => {
    if (!classId) return;
    const res = await api.get<MonthlyPkg[] | { data: MonthlyPkg[] }>(
      `/classes/${classId}/products`,
    );
    if (res.success && res.data) {
      const list = Array.isArray(res.data)
        ? res.data
        : ((res.data as { data?: MonthlyPkg[] }).data ?? []);
      const monthlyOnly = list.filter((pkg) => pkg.feeType === 'MONTHLY_FIXED');
      setMonthlyRowsAll(monthlyOnly);
      setMonthlyPkgs(monthlyOnly.filter((pkg) => pkg.isActive !== false));
      // 1회 수업료 — PER_SESSION 상품(선불 참고·1회권) 우선, 없으면 단가 보유 상품 폴백.
      const perSession = list.find((p) => p.feeType === 'PER_SESSION');
      const anyUnit = list.find((p) => p.feePerSession != null);
      setUnitPriceRef(
        Number(perSession?.feePerSession ?? perSession?.price ?? anyUnit?.feePerSession ?? 0) || 0,
      );
    }
  }, [classId]);

  useEffect(() => {
    if (isUnapprovedPending && !isSpot) fetchMonthlyPkgs();
  }, [isUnapprovedPending, isSpot, fetchMonthlyPkgs]);

  // 대상월 row 가 이미 있는 상품명 집합 — 과거 데이터 보호용 보조 가드.
  //   갱신 소진 판정은 원본 행(id) 판매 중지가 SoT 이고, 이 이름 필터는 예전
  //   이름 매칭 방식으로 갱신되어 원본이 살아있는 기존 행의 중복 제안만 막는다.
  const updatedNames = new Set(
    (monthlyPkgs ?? [])
      .filter(
        (pkg) =>
          pkg.billingMonth && pkg.billingMonth.slice(0, 7) === targetMonthKey,
      )
      .map((pkg) => pkg.productName),
  );
  // 갱신 제안(미등록) 목록 — [앵커 규칙 2026-09-01] 대상월보다 앞선 "가장 가까운
  //   스냅샷 달" 한 달치만 복사 소스로 제안한다.
  //   · 앵커 판정 = 행 존재 기준(소진 포함 — monthlyRowsAll): 그 달이 전부 처리됐어도
  //     더 과거 달로 내려가지 않는다 (전전월 잔재의 승격 재등장 차단).
  //   · 표시 = 앵커 달의 살아있는(active) 행만.
  //   · 월분 행이 아예 없던 수업만 무월(레거시) 행을 제안 — 월 체계 이관 전 소스.
  const needsUpdate = (() => {
    if (!targetMonthKey) return [] as MonthlyPkg[];
    const monthsBefore = (monthlyRowsAll ?? [])
      .map((pkg) => pkg.billingMonth?.slice(0, 7))
      .filter((m): m is string => !!m && m < targetMonthKey);
    const anchorMonth =
      monthsBefore.length > 0
        ? monthsBefore.reduce((a, b) => (a > b ? a : b))
        : null;
    const seen = new Set<string>();
    return (monthlyPkgs ?? []).filter((pkg) => {
      const month = pkg.billingMonth?.slice(0, 7) ?? null;
      const inWindow =
        anchorMonth !== null ? month === anchorMonth : month === null;
      if (!inWindow) return false;
      if (updatedNames.has(pkg.productName) || seen.has(pkg.productName)) {
        return false;
      }
      seen.add(pkg.productName);
      return true;
    });
  })();

  // [사전 차단] 월 상품 이력이 있는 수업이 대상월 등록 0건이면 판매 시작 불가 —
  //   서버 400("판매 대상 달의 월 상품 없음") 가드의 FE 미러. 무월 레거시만 있는
  //   수업(폴백 판매)과 월 상품 자체가 없는 수업(후불·회차권)은 차단하지 않는다.
  const salesBlockedNoPkg =
    monthlyPkgs !== null &&
    monthlyPkgs.some((p) => p.billingMonth != null) &&
    updatedNames.size === 0;

  // 갱신 제안 금액 — 대상월 실제 일정(비취소)의 요일별 회차 수 × 1회 수업료.
  //   산출값은 가격 input 프리필에만 쓰고 서버로 보내지 않는다(가격 확정은 감독).
  const targetMonthCalc = useMemo(() => {
    if (!targetMonthKey) return null;
    const counts = new Map<number, number>();
    let total = 0;
    for (const s of schedules) {
      const d = new Date(s.scheduledDate);
      if (isNaN(d.getTime())) continue;
      if (`${d.getFullYear()}-${pad2(d.getMonth() + 1)}` !== targetMonthKey) continue;
      counts.set(d.getDay(), (counts.get(d.getDay()) ?? 0) + 1);
      total++;
    }
    return { counts, total };
  }, [schedules, targetMonthKey]);

  // 갱신 원본 행 소진 — 등록·제외 시 해당 행(id)만 판매 중지. 이름 매칭 승계 없음.
  //   지난 월분도 판매 중지 단독 변경은 서버가 허용한다(지난 월분 잠금의 유일한 예외).
  //   실패는 경고 토스트로 노출 (조용한 실패 금지 — 실패 시 행이 갱신 목록에 남는다).
  const retireSourceRow = useCallback(
    async (pkgId: string) => {
      const res = await api.patch(`/classes/${classId}/products/${pkgId}`, {
        isActive: false,
      });
      if (!res.success) {
        toast.error(
          res.error?.message ?? MESSAGES.class.salesCycle.retireFailed,
        );
      }
      return res.success;
    },
    [classId, toast],
  );

  const handleCreateMonthPkg = useCallback(
    async (pkg: MonthlyPkg) => {
      if (!targetMonthKey) return;
      const raw = pkgPrices[pkg.id];
      const price = raw === undefined || raw === '' ? pkg.price : Number(raw);
      if (!Number.isFinite(price) || price < 0) {
        toast.error(MESSAGES.error.general);
        return;
      }
      // 이름 — 입력값(공백 제거) 우선, 비우면 원래 이름 유지.
      const rawName = pkgNames[pkg.id];
      const name =
        (rawName === undefined ? pkg.productName : rawName).trim() ||
        pkg.productName;
      setPkgSubmitting(pkg.id);
      // 설명 — 편집값 우선, 미편집 시 원본 승계. 비우면 미전송(설명 없음).
      const rawDesc = pkgDescs[pkg.id];
      const desc = (rawDesc === undefined ? (pkg.description ?? '') : rawDesc).trim();
      try {
        // §9.2 "동일 내용 복제" — 단위 필드 3종 패스스루.
        const res = await api.post(`/classes/${classId}/products`, {
          productName: name,
          description: desc || undefined,
          price,
          feeType: 'MONTHLY_FIXED',
          durationDays: pkg.durationDays ?? 30,
          sessionsPerMonth: pkg.sessionsPerMonth ?? undefined,
          sessionsPerWeek: pkg.sessionsPerWeek ?? undefined,
          billingMonth: targetMonthKey,
        });
        if (res.success) {
          // 원본 행 소진(id 기반) — 이름 변경 여부와 무관하게 방금 누른 행만 중지.
          //   무월(레거시) 원본의 월 필터 우회 중복 노출 방지도 이 한 번으로 겸한다.
          await retireSourceRow(pkg.id);
          toast.success(MESSAGES.class.salesCycle.packageCreated);
          await fetchMonthlyPkgs();
        } else if (res.error?.message) {
          toast.error(res.error.message);
        }
      } finally {
        setPkgSubmitting(null);
      }
    },
    [classId, targetMonthKey, pkgPrices, pkgNames, pkgDescs, toast, fetchMonthlyPkgs, retireSourceRow],
  );

  // [이번 달 제외] 버튼은 앵커 규칙 도입으로 제거(2026-09-01) — 안 팔 항목은 등록하지
  //   않으면 다음 달 앵커 이동으로 자동 소멸. 영구 정리는 수정 폼의 항목 삭제 경로.

  // ── 등록 완료(대상월분) 항목 수정 — [등록하기] 즉시 확정 이후의 정정 경로.
  //    판매 시작 전에는 대상월분이 가격 잠금 대상이 아니라 이름·금액 PATCH 가능.
  const targetMonthRows = (monthlyPkgs ?? []).filter(
    (p) => p.billingMonth && p.billingMonth.slice(0, 7) === targetMonthKey,
  );
  const [editingDoneId, setEditingDoneId] = useState<string | null>(null);
  const [doneName, setDoneName] = useState('');
  const [donePrice, setDonePrice] = useState('');
  const [doneDesc, setDoneDesc] = useState('');
  const [doneSaving, setDoneSaving] = useState(false);
  const startEditDone = (pkg: MonthlyPkg) => {
    setEditingDoneId(pkg.id);
    setDoneName(pkg.productName);
    setDonePrice(String(pkg.price));
    setDoneDesc(pkg.description ?? '');
  };
  const handleSaveDone = async (pkg: MonthlyPkg) => {
    if (doneSaving) return;
    const name = doneName.trim() || pkg.productName;
    const price = donePrice === '' ? pkg.price : Number(donePrice);
    if (!Number.isFinite(price) || price < 0) {
      toast.error(MESSAGES.error.general);
      return;
    }
    setDoneSaving(true);
    try {
      const res = await api.patch(`/classes/${classId}/products/${pkg.id}`, {
        productName: name,
        price,
        // 빈 값 전송 = 설명 비우기 (감독이 지운 의도 반영).
        description: doneDesc.trim(),
      });
      if (res.success) {
        toast.success(MESSAGES.save.success);
        setEditingDoneId(null);
        await fetchMonthlyPkgs();
      } else if (res.error?.message) {
        toast.error(res.error.message);
      }
    } finally {
      setDoneSaving(false);
    }
  };

  const handleOpenSales = useCallback(async () => {
    // [설계 §3.5] dirty 게이트 방어 — 버튼 자체가 잠금 섹션으로 대체되지만 이중 방어.
    if (dirtyCount > 0) return;
    setOpeningSales(true);
    try {
      // [Phase 2] 미갱신 선불 선수 해제 사전 고지 — dryRun으로 대상을 먼저 조회하고,
      //   해제 대상이 있으면 감독 확인 후에만 실제 판매 시작을 실행한다.
      const preview = await api.post<{
        releaseCandidates?: { userId: string; name: string }[];
      }>(`/classes/${classId}/open-sales`, { dryRun: true });
      if (!preview.success) {
        if (preview.error?.message) toast.error(preview.error.message);
        return;
      }
      const candidates = preview.data?.releaseCandidates ?? [];
      // [고지형 게이트] 미갱신 월 수강권은 판매 시작을 막지 않고 "이번 달 미판매"로 고지 —
      //   선수 해제 고지와 확인창 하나로 합쳐 표시(자동결제 없는 접수형 모델).
      const notices: string[] = [];
      if (needsUpdate.length > 0 && targetMonthLabel !== null) {
        notices.push(
          MESSAGES.class.salesCycle.openSalesUnrenewedNotice(
            needsUpdate.map((p) => p.productName).join(', '),
            targetMonthLabel,
          ),
        );
      }
      if (candidates.length > 0) {
        notices.push(
          MESSAGES.class.salesCycle.openSalesReleaseNotice(
            candidates.map((c) => c.name).join(', '),
            candidates.length,
          ),
        );
      }
      if (notices.length > 0) {
        const ok = await modal.confirm({
          title: MESSAGES.class.salesCycle.openSalesReleaseTitle,
          // 선수 해제 고지는 문구 끝에 질문을 포함하므로, 미갱신 고지만 있을 때만 질문을 덧붙인다.
          message:
            candidates.length > 0
              ? notices.join('\n\n')
              : `${notices[0]}\n\n${MESSAGES.class.salesCycle.openSalesConfirmAsk}`,
          confirmText: MESSAGES.class.salesCycle.openSalesButton,
        });
        if (!ok) return;
      }
      const res = await api.post<{ releasedCount?: number }>(
        `/classes/${classId}/open-sales`,
      );
      if (res.success) {
        if (targetMonthLabel !== null) {
          toast.success(MESSAGES.class.salesCycle.openSalesSuccess(targetMonthLabel));
        }
        if ((res.data?.releasedCount ?? 0) > 0) {
          toast.info(
            MESSAGES.class.salesCycle.openSalesReleasedToast(
              res.data!.releasedCount!,
            ),
          );
        }
        // 판매 시작 완결 — 준비 절차가 끝났으므로 훈련 상세로 이동해 결과를 보여준다.
        navigate(`/classes/${classId}`);
      } else if (res.error?.message) {
        toast.error(res.error.message);
      }
    } finally {
      setOpeningSales(false);
    }
  }, [classId, dirtyCount, toast, modal, navigate, needsUpdate, targetMonthLabel]);

  // 이미 등록된(취소 제외) 날짜 — 미니달력에 선택 표시.
  const registeredDates = useMemo(
    () =>
      schedules
        .filter((s) => !s.isCancelled)
        .map((s) => {
          const d = new Date(s.scheduledDate);
          return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        }),
    [schedules],
  );

  // [월 일괄 생성] 정규 요일 템플릿(시간 채워진 요일)로 대상월 날짜를 즉시 등록 —
  //   대상월: 잔여 일정이 있으면 판매 준비 대상월(earliestRemainingMonth)에 고정 — 그 달이
  //   가득 차도 다음 달로 넘어가지 않는다(생명주기와 무관하게 달이 앞서가는 혼동 방지).
  //   다음 달 선등록은 잔여 일정이 모두 끝나 일정 등록 대기가 된 뒤에만 열린다.
  //   수정 폼의 동일 기능(로컬 draft)과 달리 여기서는 bulk API 로 바로 저장된다.
  const activeDayDefaults = useMemo(
    () => (cls?.daySchedules ?? []).filter((s) => s.startTime && s.endTime),
    [cls?.daySchedules],
  );
  // 헤더 기본 일정 요약 — 요일별 한 줄씩("월 17:00 ~ 18:00 A링크장") 세로 스택.
  //   " / " 이어붙임(formatDaySchedulesFull 전체 호출)은 요일 2개 이상에서 임의 줄바꿈으로
  //   가독성이 떨어져 이 페이지만 줄 단위로 렌더 — 포맷 자체는 공용 유틸을 단건 재사용.
  const dayTemplateLines = useMemo(
    () =>
      sortDaySchedules(activeDayDefaults)
        .map(
          (d) =>
            formatDaySchedulesFull([
              {
                dayOfWeek: d.dayOfWeek,
                startTime: d.startTime,
                endTime: d.endTime,
                venueName: d.venueName ?? undefined,
              },
            ]) ?? '',
        )
        .filter(Boolean),
    [activeDayDefaults],
  );
  // 서버 활성 + draft 추가 날짜 합집합 — 미니달력 disabledDates·monthFill existing 의
  //   단일 기준 (draft 로 담은 날짜를 다시 제안/선택하지 않도록 — 설계 §3.4).
  const allTakenDates = useMemo(
    () => [...registeredDates, ...draft.adds.map((a) => a.date)],
    [registeredDates, draft.adds],
  );
  // [설계 §5-9] 대상월 고정의 "잔여" 판정에 draft adds 포함 — 서버 잔여 0 이어도
  //   draft 로 9월 행을 담았다면 일괄 생성은 9월에 고정되어야 화면 전체가 한 달을 가리킨다.
  const draftEarliestMonthKey = useMemo(() => {
    const future = draft.adds
      .map((a) => a.date)
      .filter((d) => d >= todayKeyOf())
      .sort();
    return future.length > 0 ? future[0].slice(0, 7) : null;
  }, [draft.adds]);
  const effectiveTargetMonthKey = targetMonthKey ?? draftEarliestMonthKey;

  const monthFill = useMemo(() => {
    if (isSpot || activeDayDefaults.length === 0) return null;
    const weekdaySet = new Set(activeDayDefaults.map((s) => s.dayOfWeek));
    const existing = new Set(allTakenDates);
    const collect = (y: number, m0: number, fromDay: number): string[] => {
      const mm = pad2(m0 + 1);
      const daysInMonth = new Date(y, m0 + 1, 0).getDate();
      const out: string[] = [];
      for (let d = fromDay; d <= daysInMonth; d += 1) {
        const iso = `${y}-${mm}-${pad2(d)}`;
        if (weekdaySet.has(weekdayOfDateStr(iso)) && !existing.has(iso)) out.push(iso);
      }
      return out;
    };
    const now = new Date();
    // 잔여 일정(서버 또는 draft)이 있으면 대상월 고정 — 판매 준비 섹션과 동일 달.
    //   잔여 일정은 오늘 이후이므로 대상월은 이번 달 이상: 이번 달이면 오늘부터, 미래 달이면 1일부터.
    if (effectiveTargetMonthKey) {
      const [ty, tm] = effectiveTargetMonthKey.split('-').map(Number);
      const fromDay =
        ty === now.getFullYear() && tm - 1 === now.getMonth() ? now.getDate() : 1;
      return { year: ty, month: tm, dates: collect(ty, tm - 1, fromDay) };
    }
    // 일정 등록 대기 — 이번 달 남은 날짜가 있으면 이번 달, 소진됐으면 다음 달(월말 선등록).
    const thisMonth = collect(now.getFullYear(), now.getMonth(), now.getDate());
    if (thisMonth.length > 0) {
      return { year: now.getFullYear(), month: now.getMonth() + 1, dates: thisMonth };
    }
    const nextY = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const nextM0 = (now.getMonth() + 1) % 12;
    return { year: nextY, month: nextM0 + 1, dates: collect(nextY, nextM0, 1) };
  }, [isSpot, activeDayDefaults, allTakenDates, effectiveTargetMonthKey]);

  // [검토 단계] 월 일괄 생성 프리필 — 미니달력을 대상월·해당 날짜 선택 상태로 열고,
  //   감독이 가감 후 [확인]을 눌러야 등록된다(즉시 커밋 아님).
  const [fillPrefill, setFillPrefill] = useState<{
    year: number;
    month: number;
    dates: string[];
  } | null>(null);

  // 지난 회차(오늘 이전) 분리 — 목록 뷰 접기 + 취소 버튼 숨김 판정.
  //   지난 회차는 사실 기록이라 취소 불가(백엔드 가드와 이중 방어). 로컬 날짜 기준
  //   판정은 수업 수정 폼의 지난 회차 잠금과 동일 경계.
  const todayKey = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
  }, []);
  const { listUpcoming, listPast } = useMemo(() => {
    const keyOf = (s: ScheduleItem) => {
      const d = new Date(s.scheduledDate);
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    };
    return {
      // 다가오는 회차는 가까운 날짜부터(회차 번호 1 = 다음 일정) — 수정 폼 목록과 동일 순서.
      listUpcoming: schedules
        .filter((s) => keyOf(s) >= todayKey)
        .slice()
        .reverse(),
      listPast: schedules.filter((s) => keyOf(s) < todayKey),
    };
  }, [schedules, todayKey]);

  // [설계 §3.4] 병합 목록 단일 SoT — 서버 잔여 회차 + draft 추가분(날짜 오름차순 삽입).
  //   건수·빈 상태·달력·월 그룹은 전부 이 목록 기준(이중 SoT 금지).
  const displayUpcoming = useMemo<RowItem[]>(() => {
    const rows: RowItem[] = [
      ...listUpcoming.map((s) => ({ kind: 'server' as const, s })),
      ...draft.adds.map((d) => ({ kind: 'draft' as const, d })),
    ];
    rows.sort((a, b) => rowDate(a).localeCompare(rowDate(b)));
    return rows;
  }, [listUpcoming, draft.adds]);

  // 달력 조망·건수용 병합 — draft 추가분을 유사 회차로 투영해 서버 목록에 합침.
  //   [Codex R1-1] 서버 행에도 edits 오버레이 적용 — 목록과 달력의 표시값 단일화(§3.4).
  const calendarSchedules = useMemo<ScheduleItem[]>(
    () => [
      ...schedules.map((s) => {
        const e = draft.edits[s.id];
        return e
          ? {
              ...s,
              startTime: e.startTime || null,
              endTime: e.endTime || null,
              venue: e.venueId ? { id: e.venueId, name: e.venueName } : null,
            }
          : s;
      }),
      ...draft.adds.map((d) => ({
        id: d.key,
        scheduledDate: `${d.date}T00:00:00`,
        startTime: d.startTime || null,
        endTime: d.endTime || null,
        venue: d.venueId ? { id: d.venueId, name: d.venueName } : null,
        isCancelled: false,
      })),
    ],
    [schedules, draft.adds, draft.edits],
  );

  // 다가오는 회차 월 그룹 — 오름차순이라 첫 그룹 = 가장 가까운 달(잔여 최이른 회차의 달,
  //   판매 준비 대상월과 동일 정의). 한 달뿐이면 그룹 UI 없이 현행 flat 목록 유지.
  //   draft 추가분을 담은 달은 기본 펼침(§5-10) — 사용자가 명시적으로 접으면 존중.
  const upcomingMonthGroups = useMemo(() => {
    const map = new Map<string, RowItem[]>();
    for (const row of displayUpcoming) {
      const key = rowDate(row).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    }
    const nowYear = new Date().getFullYear();
    return Array.from(map.entries()).map(([key, items]) => {
      const [y, m] = key.split('-').map(Number);
      return {
        key,
        label: y === nowYear ? `${m}월` : `${y}년 ${m}월`,
        items,
        hasDraft: items.some((r) => r.kind === 'draft'),
      };
    });
  }, [displayUpcoming]);

  // 미니달력 확인 — 날짜별 확정값(resolved)을 시간·장소가 같은 그룹으로 묶어 bulk 호출.
  //   요일별 기본값을 적용하면 요일마다 시간/장소가 달라질 수 있어, bulk API(단일 시간/장소)를
  //   그룹 수만큼 분리 호출한다(보통 1~3회). 미적용 시 전부 공통값이라 1회 호출.
  // [설계 v4.1 §3.2] 미니달력 [확인] — 서버 호출 없이 draft adds 로 담는다.
  //   반영은 [저장하기](apply-draft) 시점 (Phase 3).
  const handleConfirmDates = useCallback(
    (dates: string[], resolved: MultiDateResolved[]) => {
      if (!cls || !isApproved || saving || dates.length === 0) return;
      // spot(1회용) — 활성(취소 예정 차감) + 기존 draft + 신규 합산 1개 초과 차단.
      if (
        isSpot &&
        schedules.length - draft.cancels.length + draft.adds.length + dates.length > 1
      ) {
        toast.error(MESSAGES.class.spotSingleScheduleLimit);
        return;
      }
      dispatchDraft({
        type: 'addDates',
        items: resolved.map((r) => ({
          date: r.date,
          startTime: r.startTime,
          endTime: r.endTime,
          venueId: r.venueId,
          venueName: r.venueName,
        })),
        existingDates: registeredDates,
      });
    },
    [cls, isApproved, saving, isSpot, schedules.length, draft.cancels.length, draft.adds.length, registeredDates, toast],
  );

  // [월 일괄 생성] 즉시 등록이 아니라 미니달력을 대상월·프리필 선택 상태로 연다 —
  //   등록은 달력의 [확인](handleConfirmDates)에서만 일어난다(검토 단계 통일).
  const handleFillMonth = useCallback(() => {
    if (!monthFill || saving || monthFill.dates.length === 0) return;
    setFillPrefill(monthFill);
    setMultiDateOpen(true);
  }, [monthFill, saving]);

  // [설계 v4.1 §3.2] 회차 취소 — draft 토글(로컬·가역). 확인창 불필요 — 저장 전까지
  //   서버 무접촉이고 [취소 해제]로 되돌릴 수 있다. 실제 취소(부수효과 포함)는
  //   [저장하기]의 apply-draft cancellations 가 수행 (Phase 3).
  const handleCancelToggle = (scheduleId: string) => {
    if (!cls || !isApproved || saving) return;
    dispatchDraft({ type: 'toggleCancel', id: scheduleId });
  };

  /* ─────────────────────────── Render ─────────────────────────── */

  // ── 목록 뷰 아코디언 개별 수정 — 탭하여 펼침 → 시간·장소 수정 → [적용하기]로
  //    draft 에 기록(로컬). 날짜 변경은 정책상 취소+재등록이라 미제공. ──
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editVenueName, setEditVenueName] = useState('');
  const [venueSheetOpen, setVenueSheetOpen] = useState(false);
  // 종료가 시작보다 이르거나 같으면 적용 불가 — 달력 뷰 수정 시트와 동일 규칙
  //   (시간 미정 회차의 장소만 수정은 허용).
  const isEditTimeInvalid = !!editStart && !!editEnd && editStart >= editEnd;
  // 펼친 행 — 서버 행은 id, draft 행은 key 로 식별 (접두사로 구분 불필요: 둘 다 유일).
  const toggleExpandServer = (s: ScheduleItem) => {
    if (expandedId === s.id) {
      setExpandedId(null);
      return;
    }
    // draft 수정본이 있으면 그 값을, 없으면 서버 값을 패널에 프리필.
    const pending = draft.edits[s.id];
    setExpandedId(s.id);
    setEditStart(pending?.startTime ?? s.startTime ?? '');
    setEditEnd(pending?.endTime ?? s.endTime ?? '');
    setEditVenue(pending?.venueId ?? s.venue?.id ?? '');
    setEditVenueName(pending?.venueName ?? s.venue?.name ?? '');
  };
  const toggleExpandDraft = (a: DraftAdd) => {
    if (expandedId === a.key) {
      setExpandedId(null);
      return;
    }
    setExpandedId(a.key);
    setEditStart(a.startTime);
    setEditEnd(a.endTime);
    setEditVenue(a.venueId);
    setEditVenueName(a.venueName);
  };
  // [적용하기] — 서버 행이면 edits 기록(원본 동일 시 자동 소멸), draft 행이면 갱신.
  const handleRowApply = (row: RowItem) => {
    if (isEditTimeInvalid || saving) return;
    if (row.kind === 'server') {
      dispatchDraft({
        type: 'editServer',
        id: row.s.id,
        edit: {
          startTime: editStart,
          endTime: editEnd,
          venueId: editVenue,
          venueName: editVenueName,
          baseUpdatedAt: row.s.updatedAt ?? '',
        },
        original: {
          startTime: row.s.startTime ?? '',
          endTime: row.s.endTime ?? '',
          venueId: row.s.venue?.id ?? '',
        },
      });
    } else {
      dispatchDraft({
        type: 'updateAdd',
        key: row.d.key,
        patch: {
          startTime: editStart,
          endTime: editEnd,
          venueId: editVenue,
          venueName: editVenueName,
        },
      });
    }
    setExpandedId(null);
  };

  // 모든 회차에 적용 — 로컬 draft 일괄 기록(가역이라 확인창 불필요 — 설계 §3.2).
  //   취소 예정 행은 invariant 로 제외, draft 추가 행도 함께 갱신.
  const handleApplyToAll = () => {
    if (isEditTimeInvalid || saving) return;
    dispatchDraft({
      type: 'applyToAll',
      edit: {
        startTime: editStart,
        endTime: editEnd,
        venueId: editVenue,
        venueName: editVenueName,
      },
      targets: listUpcoming.map((s) => ({
        id: s.id,
        baseUpdatedAt: s.updatedAt ?? '',
        original: {
          startTime: s.startTime ?? '',
          endTime: s.endTime ?? '',
          venueId: s.venue?.id ?? '',
        },
      })),
    });
    toast.success(MESSAGES.class.dayDefaults.appliedToAllDates);
    setExpandedId(null);
  };

  // [설계 §3.3] [저장하기] — apply-draft 단일 요청(all-or-nothing).
  //   성공 = clearAll + refreshAll / 409 DRAFT_CONFLICT = 충돌 항목만 제거 + 재조회 /
  //   그 외 실패 = draft 전체 유지(동일 operationId 재시도 → 서버 멱등 replay).
  const handleSaveDraft = useCallback(async () => {
    if (!cls || saving || dirtyCount === 0) return;
    const basePath = getOwnerPath(cls);
    if (!basePath) {
      toast.error(MESSAGES.common.loadFailed);
      return;
    }
    const SC = MESSAGES.class.salesCycle;

    // [§3.7] 시간 미정 고지 — 추가·수정 draft 중 시작 시각이 빈 값인 회차 (저장은 허용).
    const undecided =
      draft.adds.filter((a) => !a.startTime).length +
      Object.values(draft.edits).filter((e) => !e.startTime).length;
    if (undecided > 0) {
      const ok = await modal.confirm({
        title: SC.saveTimeUndecidedTitle,
        message: SC.saveTimeUndecidedConfirm(undecided),
      });
      if (!ok) return;
    }

    // 서버 목록에서 이미 사라진(다른 곳에서 취소·삭제) 회차의 취소 지시는 보내기 전에
    //   충돌로 정리 — baseUpdatedAt 소스가 없어 서버 400(형식) 루프에 갇히는 것 방지.
    const missingCancels = draft.cancels.filter(
      (id) => !schedules.find((s) => s.id === id)?.updatedAt,
    );
    if (missingCancels.length > 0) {
      dispatchDraft({ type: 'dropConflicts', scheduleIds: missingCancels });
      toast.error(SC.saveConflict(missingCancels.length));
      await refreshAll();
      return;
    }

    const operationId = operationIdRef.current ?? newOperationId();
    operationIdRef.current = operationId;
    const savedCount = dirtyCount;

    // additions 는 날짜 오름차순 정렬(§3.3-1) + 방어적 dedupe [Codex R1-3] —
    //   reducer 가 유일성을 보장하지만 payload 경계에서 한 번 더 걸러 계약을 자체 완결.
    const seenDates = new Set<string>();
    const additions = draft.adds
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((a) => {
        if (seenDates.has(a.date)) return false;
        seenDates.add(a.date);
        return true;
      })
      .map((a) => ({
        date: a.date,
        ...(a.startTime && { startTime: a.startTime }),
        ...(a.endTime && { endTime: a.endTime }),
        ...(a.venueId && { venueId: a.venueId }),
      }));
    // edits 는 빈 문자열 그대로 전송 — 서버 계약상 '' = 시간/장소 해제.
    const edits = Object.entries(draft.edits).map(([scheduleId, e]) => ({
      scheduleId,
      baseUpdatedAt: e.baseUpdatedAt,
      startTime: e.startTime,
      endTime: e.endTime,
      venueId: e.venueId,
    }));
    const cancellations = draft.cancels.map((scheduleId) => ({
      scheduleId,
      baseUpdatedAt:
        schedules.find((s) => s.id === scheduleId)?.updatedAt ?? '',
      reason: SC.draftCancelReason,
    }));

    setSaving(true);
    try {
      const res = await api.post(`${basePath}/schedules/apply-draft`, {
        operationId,
        additions,
        edits,
        cancellations,
      });
      if (res.success) {
        dispatchDraft({ type: 'clearAll' });
        setExpandedId(null);
        toast.success(SC.saveDone(savedCount));
        await refreshAll();
        return;
      }
      if (res.error?.code === 'DRAFT_CONFLICT') {
        // 충돌 항목(다른 곳에서 먼저 변경/취소/삭제)만 stale 로 제거, 나머지 draft 유지.
        const conflicts =
          (res.error.details as
            | { conflicts?: { scheduleId: string }[] }
            | undefined)?.conflicts ?? [];
        dispatchDraft({
          type: 'dropConflicts',
          scheduleIds: conflicts.map((c) => c.scheduleId),
        });
        toast.error(SC.saveConflict(conflicts.length || 1));
        await refreshAll();
        return;
      }
      // OPERATION_MISMATCH 포함 그 외 — 서버 메시지 우선하되 [Codex R1-4]
      //   draft 유지·재시도 가능 안내를 항상 함께 전달.
      toast.error(
        res.error?.message
          ? `${res.error.message} ${SC.saveKeptHint}`
          : SC.saveFailed,
      );
    } finally {
      setSaving(false);
    }
  }, [
    cls,
    saving,
    dirtyCount,
    draft,
    schedules,
    getOwnerPath,
    modal,
    toast,
    refreshAll,
  ]);

  // [설계 §3.6] [모두 되돌리기] — 확인창 후 draft 전체 clear (서버 무접촉).
  const handleDiscardAll = useCallback(async () => {
    if (saving || dirtyCount === 0) return;
    const SC = MESSAGES.class.salesCycle;
    const ok = await modal.confirm({
      title: SC.discardAllTitle,
      message: SC.discardAllConfirm(dirtyCount),
    });
    if (!ok) return;
    dispatchDraft({ type: 'clearAll' });
    setExpandedId(null);
  }, [saving, dirtyCount, modal]);

  // [설계 §3.6] 뒤로가기 이탈 가드 — dirty 면 확인 후 공통 back()(히스토리 소진·로더 처리).
  const handleBack = useCallback(async () => {
    if (dirtyCount > 0) {
      const SC = MESSAGES.class.salesCycle;
      const ok = await modal.confirm({
        title: SC.leaveTitle,
        message: SC.leaveConfirm(dirtyCount),
      });
      if (!ok) return;
    }
    back();
  }, [dirtyCount, modal, back]);

  // [설계 §3.6] 브라우저 새로고침/닫기 방어 — dirty 일 때만 등록.
  useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyCount]);

  // 목록 뷰 회차 행 — 병합 목록(RowItem) 단일 렌더. 서버 행은 draft 수정·취소 예정
  //   오버레이를 얹고, draft 추가 행은 "저장 전" 상태로 표시(X 로 즉시 제거 가능).
  //   지난 회차(isPast)는 흐림 처리 + 취소·수정 미노출.
  const renderScheduleRow = (row: RowItem, isPast: boolean, seq?: number) => {
    const isDraftRow = row.kind === 'draft';
    const s = isDraftRow ? null : row.s;
    const dateKey = rowDate(row);
    const d = new Date(`${dateKey}T00:00:00`);
    const dateLabel = isNaN(d.getTime())
      ? '-'
      : `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}(${WEEKDAYS[d.getDay()]})`;
    // 표시값 = draft 오버레이 우선(수정본이 있으면 수정본이 곧 화면 값 — 설계 §3.4).
    const pending = s ? draft.edits[s.id] : undefined;
    const cancelMarked = !!s && draft.cancels.includes(s.id);
    const effStart = isDraftRow ? row.d.startTime : (pending?.startTime ?? s?.startTime ?? '');
    const effEnd = isDraftRow ? row.d.endTime : (pending?.endTime ?? s?.endTime ?? '');
    const effVenueName = isDraftRow
      ? row.d.venueName
      : (pending?.venueName ?? s?.venue?.name ?? '');
    const timeLabel = effStart
      ? `${effStart}${effEnd ? `-${effEnd}` : ''}`
      : MESSAGES.class.dayDefaults.timeUndecided;
    const canEdit =
      isApproved &&
      !isEnded &&
      !isPast &&
      (isDraftRow || (!s?.isCancelled && !cancelMarked));
    const rowKey = isDraftRow ? row.d.key : (s?.id ?? '');
    const expanded = canEdit && expandedId === rowKey;
    const SC = MESSAGES.class.salesCycle;
    return (
      <li
        key={rowKey}
        role="listitem"
        className={cn(
          // 수정 폼 회차 박스 디자인 1:1 — it-fill 박스 + 1.5px 테두리 + 둥근 모서리.
          'rounded-w-md border-[1.5px] bg-it-fill dark:bg-rink-900/40 overflow-hidden',
          canEdit
            ? 'border-it-line-strong dark:border-rink-700'
            : 'border-it-line dark:border-rink-700',
          !canEdit && !cancelMarked && 'opacity-55',
        )}
      >
        <div
          className="flex items-center gap-2 pl-3 pr-2 py-2.5"
          aria-label={`${dateLabel} ${timeLabel}${effVenueName ? `, ${effVenueName}` : ''}${
            isDraftRow
              ? `, ${SC.draftNewChip}`
              : cancelMarked
                ? `, ${SC.draftCancelChip}`
                : s?.isCancelled
                  ? ', 취소됨'
                  : pending
                    ? `, ${SC.draftEditedChip}`
                    : ''
          }`}
        >
          {/* 본문 — 수정 가능 회차는 탭하여 개별 수정 패널 펼침 (수정 폼 아코디언 이식). */}
          {canEdit ? (
            <button
              type="button"
              onClick={() => (isDraftRow ? toggleExpandDraft(row.d) : toggleExpandServer(row.s))}
              aria-expanded={expanded}
              aria-label={`${dateLabel} ${timeLabel} 회차 수정 펼치기`}
              className="flex flex-1 items-center gap-2 min-w-0 text-left"
            >
              {seq !== undefined && (
                <span className="text-card-meta font-extrabold shrink-0 tabular-nums text-it-blue-500 dark:text-it-blue-300">
                  {seq}
                </span>
              )}
              <span className="text-sm font-bold tabular-nums shrink-0 text-it-ink-800 dark:text-white">
                {dateLabel}
              </span>
              <span className="flex flex-1 flex-col min-w-0">
                <span className="text-card-meta font-medium tabular-nums truncate text-it-ink-500 dark:text-rink-300">
                  {timeLabel}
                </span>
                {effVenueName && (
                  <span className="flex items-center gap-1 mt-0.5 min-w-0 text-card-meta font-medium text-it-ink-500 dark:text-rink-300">
                    <Icon name="location_on" className="text-sm shrink-0" aria-hidden="true" />
                    <span className="truncate">{effVenueName}</span>
                  </span>
                )}
              </span>
              <Icon
                name="expand_more"
                className={cn(
                  'text-base ml-auto shrink-0 text-it-ink-400 transition-transform motion-reduce:transition-none',
                  expanded && 'rotate-180',
                )}
                aria-hidden="true"
              />
            </button>
          ) : (
            <>
              <span
                className={cn(
                  'text-sm font-bold tabular-nums shrink-0 text-it-ink-800 dark:text-white',
                  (s?.isCancelled || cancelMarked) && 'line-through',
                )}
              >
                {dateLabel}
              </span>
              <div className="flex flex-1 flex-col min-w-0">
                <span
                  className={cn(
                    'text-card-meta font-medium tabular-nums truncate text-it-ink-500 dark:text-rink-300',
                    cancelMarked && 'line-through',
                  )}
                >
                  {timeLabel}
                </span>
                {effVenueName && (
                  <span className="flex items-center gap-1 mt-0.5 min-w-0 text-card-meta font-medium text-it-ink-500 dark:text-rink-300">
                    <Icon name="location_on" className="text-sm shrink-0" aria-hidden="true" />
                    <span className="truncate">{effVenueName}</span>
                  </span>
                )}
              </div>
            </>
          )}
          {/* 상태 칩 — 저장 전(draft 추가) / 수정됨(draft 수정) / 취소 예정(draft 취소) / 취소됨(서버 확정). */}
          {isDraftRow && (
            <span
              className="text-card-meta font-bold px-2 py-0.5 rounded bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300 shrink-0"
              role="status"
            >
              {SC.draftNewChip}
            </span>
          )}
          {!isDraftRow && pending && !cancelMarked && (
            <span
              className="text-card-meta font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 shrink-0"
              role="status"
            >
              {SC.draftEditedChip}
            </span>
          )}
          {cancelMarked && (
            <span
              className="text-card-meta font-bold px-2 py-0.5 rounded bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 shrink-0"
              role="status"
            >
              {SC.draftCancelChip}
            </span>
          )}
          {s?.isCancelled && (
            <span
              className="text-card-meta font-bold px-2 py-0.5 rounded bg-it-line dark:bg-rink-700 text-it-ink-500 dark:text-rink-300 shrink-0"
              role="status"
            >
              취소됨
            </span>
          )}
          {/* 트레일링 액션 — 서버 행: 취소 마킹 토글 / draft 행: 목록에서 제거(즉시·가역 아님이라 X). */}
          {canEdit && !isDraftRow && (
            <button
              type="button"
              onClick={() => handleCancelToggle(row.s.id)}
              disabled={saving}
              className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 shrink-0 disabled:opacity-50"
              aria-label={`${dateLabel} ${timeLabel} 회차 취소하기`}
              title="회차 취소하기"
            >
              <Icon name="event_busy" className="text-lg" aria-hidden="true" />
            </button>
          )}
          {cancelMarked && !isPast && isApproved && !isEnded && (
            <button
              type="button"
              onClick={() => s && handleCancelToggle(s.id)}
              disabled={saving}
              className="rounded-md px-2 py-1 text-card-meta font-bold text-it-blue-500 hover:bg-it-blue-50 dark:text-it-blue-300 dark:hover:bg-it-blue-500/10 shrink-0 disabled:opacity-50"
              aria-label={`${dateLabel} ${timeLabel} ${SC.draftCancelUndo}`}
            >
              {SC.draftCancelUndo}
            </button>
          )}
          {isDraftRow && (
            <button
              type="button"
              onClick={() => dispatchDraft({ type: 'removeAdd', key: row.d.key })}
              disabled={saving}
              className="rounded-md p-1.5 text-it-ink-400 hover:bg-it-line/60 dark:text-rink-300 dark:hover:bg-rink-700/60 shrink-0 disabled:opacity-50"
              aria-label={SC.draftRemoveAria(`${dateLabel} ${timeLabel}`)}
              title={SC.draftRemoveAria(`${dateLabel} ${timeLabel}`)}
            >
              <Icon name="close" className="text-lg" aria-hidden="true" />
            </button>
          )}
        </div>
        {/* 개별 수정 패널 — 시간·장소만(날짜 변경=취소+재등록 정책). [저장하기]에서만 반영. */}
        {expanded && (
          <div className="px-3 pb-3 space-y-2 border-t border-it-line dark:border-rink-700">
            <div className="grid grid-cols-2 gap-2 mt-2">
              <TimePicker
                value={editStart}
                // 시작을 뒤로 옮기면 무효해진 종료는 비운다.
                onChange={(time) => {
                  setEditStart(time);
                  setEditEnd((prev) => (prev && prev <= time ? '' : prev));
                }}
                startHour={0}
                defaultHour={9}
                stepMinutes={EDIT_STEP_MINUTES}
                placeholder={MESSAGES.class.dayDefaults.startTime}
                sheetTitle={MESSAGES.class.dayDefaults.startTime}
                className={cn(EDIT_FIELD_CLASS, 'tabular-nums')}
                aria-label={`${dateLabel} 시작 시간`}
              />
              <TimePicker
                value={editEnd}
                onChange={setEditEnd}
                disabled={!editStart}
                onDisabledClick={() =>
                  toast.error(MESSAGES.common.timePicker.startTimeFirst)
                }
                minTime={
                  editStart
                    ? (addMinutes(editStart, EDIT_STEP_MINUTES) ?? undefined)
                    : undefined
                }
                defaultTime={
                  editStart ? (nextFullHour(editStart) ?? undefined) : undefined
                }
                startHour={0}
                defaultHour={9}
                stepMinutes={EDIT_STEP_MINUTES}
                placeholder={MESSAGES.class.dayDefaults.endTime}
                sheetTitle={MESSAGES.class.dayDefaults.endTime}
                className={cn(EDIT_FIELD_CLASS, 'tabular-nums')}
                aria-label={`${dateLabel} 종료 시간`}
              />
            </div>
            {/* 장소 선택 — 수정 폼과 동일한 검색 시트(VenueSearchSheet) 진입 버튼. */}
            <button
              type="button"
              onClick={() => setVenueSheetOpen(true)}
              className="w-full flex items-center gap-2 h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-left text-it-ink-800 dark:text-white hover:border-it-blue-500/40 transition-colors motion-reduce:transition-none"
              aria-label={`${dateLabel} 장소 선택`}
            >
              <Icon name="location_on" className="text-base text-it-ink-400" aria-hidden="true" />
              <span className={editVenueName ? '' : 'text-it-ink-400'}>
                {editVenueName || '장소 선택'}
              </span>
              <Icon name="chevron_right" className="text-base ml-auto text-it-ink-300" aria-hidden="true" />
            </button>
            {/* 모든 회차에 적용 — 다가오는 회차(병합 기준) 2개 이상 + 값이 있을 때만. 로컬 draft 일괄 기록. */}
            {displayUpcoming.length > 1 && (editStart || editEnd || editVenue) && (
              <button
                type="button"
                onClick={handleApplyToAll}
                disabled={isEditTimeInvalid || saving}
                className="self-start rounded-md px-2 py-1 text-card-meta font-bold text-it-blue-500 hover:bg-it-blue-50 dark:text-it-blue-300 dark:hover:bg-it-blue-500/10 disabled:opacity-50"
                aria-label={MESSAGES.class.dayDefaults.applyToAllDatesAria(seq ?? 0)}
              >
                {MESSAGES.class.dayDefaults.applyToAllDates}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleRowApply(row)}
              disabled={isEditTimeInvalid || saving}
              className="w-full h-10 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-meta font-bold disabled:opacity-50 transition-colors motion-reduce:transition-none active:brightness-95"
            >
              {SC.rowApplyButton}
            </button>
          </div>
        )}
      </li>
    );
  };

  if (isLoading) return null;

  if (!cls) {
    return (
      <MobileContainer hasBottomNav={false}>
        <AppBar title={MESSAGES.class.salesCycle.managePageTitle} onBack={() => back()} forceNative />
        <main className="flex-1 flex items-center justify-center p-6 bg-it-canvas dark:bg-puck">
          <p className="text-it-ink-500 dark:text-rink-300">수업을 찾을 수 없습니다.</p>
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <AppBar
        title={MESSAGES.class.salesCycle.managePageTitle}
        onBack={handleBack}
        forceNative
      />
      <main
        className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck pb-24"
        style={{
          WebkitOverflowScrolling: 'touch' as never,
          // 고정 저장 바(≈72px) + BottomNav(60px) + safe-area 만큼 여백 확보 (상세 선례 150px).
          ...(dirtyCount > 0 && {
            paddingBottom:
              'calc(150px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
          }),
        }}
      >
        {/* ─── 수업명 + 수명주기 상태 칩 + 승인 상태 배너 — full-bleed 흰 섹션 ─── */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h1 className="text-xl font-bold text-it-ink-800 dark:text-white min-w-0">{cls.className}</h1>
            <LifecycleChip
              isEnded={isEnded}
              lifecycleStatus={cls.lifecycleStatus}
              pendingReason={cls.pendingReason}
              targetMonthLabel={targetMonthLabel}
            />
          </div>
          {/* 기본 일정(정규 요일 템플릿) 요약 — 요일·시간·장소가 등록돼 있을 때만, 요일별 한 줄. */}
          {dayTemplateLines.length > 0 && (
            <div className="mb-3 flex gap-1 text-card-meta text-it-ink-500 dark:text-rink-300 tabular-nums">
              <Icon name="event_repeat" className="text-sm shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex flex-col gap-0.5 min-w-0">
                {dayTemplateLines.map((line) => (
                  <span key={line} className="truncate">
                    {line}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* 상태별 안내 — 종료 > 일정 없음 순 (spot 은 판매 승인 사이클 미적용이라 제외). */}
          {isEnded ? (
            <p className="text-card-meta text-it-ink-500 dark:text-rink-300" role="status">
              {MESSAGES.class.salesCycle.endedManageNotice}
            </p>
          ) : isNoSchedulePending && !isSpot ? (
            <p className="text-card-meta text-it-ink-500 dark:text-rink-300" role="status">
              {MESSAGES.class.salesCycle.pageIntroNoSchedule}
            </p>
          ) : null}
          <ApprovalBanner status={cls.approvalStatus} reason={cls.rejectionReason} />
        </section>

        {/* ─── 일정 추가 — full-bleed 흰 섹션 (카드 박스 제거) ─── */}
        <section
          className={cn(
            'mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5',
            (!isApproved || isEnded) && 'opacity-60',
          )}
          aria-disabled={!isApproved || isEnded}
        >
          <h2 className="text-card-section font-bold text-it-ink-800 dark:text-white mb-3">일정 추가</h2>
          {/* 미니달력으로 복수 날짜 + 공통 시간·장소 추가 */}
          <div className="space-y-3">
            <p className="text-card-meta text-it-ink-500 dark:text-rink-300 leading-relaxed">
              달력에서 날짜를 선택하고 공통 시간·장소를 적용해 일정을 추가합니다.
              매달 단위로 필요할 때마다 계속 추가할 수 있어요.
            </p>
            {/* 주 액션: 정규 요일 기반 월 일괄 생성 — 대상월은 잔여 일정의 달에 고정,
                일정 등록 대기일 때만 이번 달→다음 달 선등록. */}
            {monthFill !== null && (
              <button
                type="button"
                onClick={handleFillMonth}
                disabled={!isApproved || isEnded || saving || monthFill.dates.length === 0}
                className="w-full flex items-center justify-center gap-1.5 py-3 bg-it-blue-500 hover:bg-it-blue-600 disabled:bg-it-line dark:disabled:bg-rink-700 disabled:cursor-not-allowed text-white font-bold rounded-w-md transition-colors motion-reduce:transition-none active:brightness-95"
              >
                <Icon name="event_repeat" className="text-base" aria-hidden="true" />
                {monthFill.dates.length > 0
                  ? MESSAGES.class.rangeGen.fillMonthCount(
                      monthFill.month,
                      monthFill.dates.length,
                    )
                  : MESSAGES.class.rangeGen.fillMonth(monthFill.month)}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMultiDateOpen(true)}
              disabled={!isApproved || isEnded || saving || spotLimitReached}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 py-3 font-bold rounded-w-md transition-colors motion-reduce:transition-none active:brightness-95 disabled:cursor-not-allowed',
                monthFill !== null
                  ? // 보조 액션(점선) — 예외/불규칙 날짜 직접 추가.
                    'border border-dashed border-it-blue-500/50 text-it-blue-500 hover:bg-it-blue-500/[0.06] disabled:opacity-40 disabled:hover:bg-transparent'
                  : 'bg-it-blue-500 hover:bg-it-blue-600 disabled:bg-it-line dark:disabled:bg-rink-700 text-white',
              )}
            >
              <Icon name="calendar_month" className="text-base" aria-hidden="true" />
              {monthFill !== null ? MESSAGES.class.scheduleAddSingle : '일정 추가'}
            </button>
            {/* 대상월이 가득 차 일괄 생성이 비활성일 때 이유 안내 — 다음 달로 넘어가지 않는 정책. */}
            {monthFill !== null &&
              monthFill.dates.length === 0 &&
              targetMonthKey !== null && (
                <p className="text-card-meta text-it-ink-500 dark:text-rink-300" role="status">
                  {MESSAGES.class.rangeGen.fillMonthFull(monthFill.month)}
                </p>
              )}
            {spotLimitReached && (
              <p className="text-card-meta text-it-ink-500 dark:text-rink-300" role="status">
                {MESSAGES.class.spotSingleScheduleLimit}
              </p>
            )}
          </div>
        </section>

        {/* ─── 등록된 일정 목록 — full-bleed 흰 섹션 ─── */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5" aria-labelledby="registered-schedules-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="registered-schedules-heading"
              className="text-card-section font-bold text-it-ink-800 dark:text-white"
            >
              등록된 일정
            </h2>
            <span
              className="text-card-meta text-it-ink-500 dark:text-rink-300"
              aria-live="polite"
              aria-atomic="true"
            >
              {calendarSchedules.length}건
            </span>
          </div>
          {/* 달력 — 조망 전용(월 배치 확인·셀 강조). draft 추가분 포함 병합 기준(§3.4).
              내장 "전체 일정" 목록은 아래 이식된 박스 목록이 대체하므로
              part="calendar" + readOnly (실행 표면 단일화). */}
          {calendarSchedules.length > 0 && (
            <div className="-mx-5 mb-3">
              <ScheduleCalendarView
                schedules={calendarSchedules}
                isApproved={isApproved}
                readOnly
                part="calendar"
                iceTheme
              />
            </div>
          )}
          {calendarSchedules.length === 0 ? (
            <p
              className="py-5 text-center text-card-body text-it-ink-500 dark:text-rink-300"
              role="status"
            >
              등록된 일정이 없습니다.
            </p>
          ) : (
            // 수정 폼 일정 목록 디자인 1:1 — 지난 일정 접힘 그룹(상단) + 박스 행 목록.
            <div aria-label={`등록된 일정 ${calendarSchedules.length}건`}>
              {listPast.length > 0 && (
                <div className={displayUpcoming.length > 0 ? 'mb-2' : undefined}>
                  <button
                    type="button"
                    onClick={() => setShowPastList((v) => !v)}
                    aria-expanded={showPastList}
                    className="flex items-center gap-1.5 text-xs font-bold px-1 py-1 text-it-ink-500 dark:text-rink-300"
                  >
                    <Icon
                      name="expand_more"
                      className={cn(
                        'text-base transition-transform motion-reduce:transition-none',
                        showPastList && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                    {showPastList ? '지난 일정 접기' : `지난 일정 ${listPast.length}개 보기`}
                  </button>
                  {showPastList && (
                    <ul
                      className="mt-1 flex flex-col gap-2 list-none"
                      role="list"
                      aria-label={`지난 일정 ${listPast.length}건 (읽기 전용)`}
                    >
                      {listPast.map((s) => renderScheduleRow({ kind: 'server', s }, true))}
                    </ul>
                  )}
                </div>
              )}
              {upcomingMonthGroups.length <= 1 ? (
                // 한 달치뿐 — 그룹 헤더 없이 flat 목록 (평상시 화면 불변).
                <ul className="flex flex-col gap-2 list-none" role="list">
                  {displayUpcoming.map((row, i) => renderScheduleRow(row, false, i + 1))}
                </ul>
              ) : (
                // 복수 달(선등록) — 월 그룹 접힘. 가장 가까운 달만 기본 펼침,
                //   이후 달은 헤더("10월 8회")로 존재만 알리고 접어 스크롤 상한 유지.
                <div className="space-y-2">
                  {upcomingMonthGroups.map((g, gi) => {
                    // draft 추가분을 담은 달은 기본 펼침(§5-10) — 명시적으로 접으면 존중.
                    const open = expandedMonths[g.key] ?? (gi === 0 || g.hasDraft);
                    return (
                      <div key={g.key}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMonths((prev) => ({ ...prev, [g.key]: !open }))
                          }
                          aria-expanded={open}
                          className="flex w-full items-center gap-1.5 px-1 py-1.5 text-sm font-bold text-it-ink-800 dark:text-white"
                        >
                          <Icon
                            name="expand_more"
                            className={cn(
                              'text-base transition-transform motion-reduce:transition-none text-it-ink-400',
                              open && 'rotate-180',
                            )}
                            aria-hidden="true"
                          />
                          {g.label}
                          <span className="text-card-meta font-semibold tabular-nums text-it-ink-500 dark:text-rink-300">
                            {g.items.length}회
                          </span>
                        </button>
                        {open && (
                          <ul
                            className="mt-1 flex flex-col gap-2 list-none"
                            role="list"
                            aria-label={`${g.label} 일정 ${g.items.length}건`}
                          >
                            {g.items.map((row, i) => renderScheduleRow(row, false, i + 1))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ─── 판매 준비 — 대상월 확정(UNAPPROVED_MONTH) 시에만 활성 ───
            ② 월 정기권 월분 확인 → ③ 판매 시작. 일정 등록(①) 직후 재조회로 이 섹션이
            같은 화면에서 열린다. spot 은 판매 승인 사이클 미적용(§7.2)이라 제외. */}
        {/* [설계 §3.5] dirty 게이트 — 미저장 draft 가 있는 동안 구성 확인·판매 시작 잠금.
            저장 후 서버 파생 상태 기준으로만 판매 준비를 진행한다. */}
        {isUnapprovedPending &&
          !isSpot &&
          !isEnded &&
          targetMonthLabel !== null &&
          dirtyCount > 0 && (
            <section
              className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5"
              aria-label={MESSAGES.class.salesCycle.pendingBannerAria}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon name="storefront" className="text-xl text-it-blue-500" aria-hidden="true" />
                <h2 className="text-[15px] font-extrabold text-it-ink-800 dark:text-white tracking-tight">
                  {MESSAGES.class.salesCycle.pendingTitle(targetMonthLabel)}
                </h2>
              </div>
              <p className="text-card-meta text-it-ink-500 dark:text-rink-300" role="status">
                {MESSAGES.class.salesCycle.prepLockedHint}
              </p>
            </section>
          )}
        {isUnapprovedPending &&
          !isSpot &&
          !isEnded &&
          targetMonthLabel !== null &&
          dirtyCount === 0 && (
          <section
            className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5"
            aria-label={MESSAGES.class.salesCycle.pendingBannerAria}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon name="storefront" className="text-xl text-it-blue-500" aria-hidden="true" />
              <h2 className="text-[15px] font-extrabold text-it-ink-800 dark:text-white tracking-tight">
                {MESSAGES.class.salesCycle.pendingTitle(targetMonthLabel)}
              </h2>
            </div>
            <p className="text-card-meta text-it-ink-500 dark:text-rink-300 mb-3">
              {MESSAGES.class.salesCycle.pendingGuide}
            </p>

            {monthlyPkgs !== null && monthlyPkgs.length > 0 && (
              <div className="mb-3">
                <h3 className="text-card-meta font-bold text-it-ink-600 dark:text-rink-200 mb-2">
                  {MESSAGES.class.salesCycle.packageSectionTitle}
                </h3>
                <ul className="space-y-2">
                  {targetMonthRows.map((pkg) => {
                    const editing = editingDoneId === pkg.id;
                    return (
                      <li
                        key={`done-${pkg.id}`}
                        className="rounded-w-md bg-it-fill dark:bg-rink-800 px-3.5 py-2.5"
                      >
                        {!editing ? (
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="block text-card-body font-semibold text-it-ink-800 dark:text-white truncate">
                                {pkg.productName}
                              </span>
                              <span className="block text-card-meta tabular-nums text-it-ink-500 dark:text-rink-300 mt-0.5">
                                {pkg.price.toLocaleString()}원
                              </span>
                              {pkg.description && (
                                <span className="block text-card-meta text-it-ink-400 dark:text-rink-400 mt-0.5 truncate">
                                  {pkg.description}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="inline-flex items-center gap-1 text-card-meta font-bold text-emerald-600 dark:text-emerald-400">
                                <Icon name="check_circle" className="text-base" aria-hidden="true" />
                                {MESSAGES.class.salesCycle.packageUpToDate}
                              </span>
                              <button
                                type="button"
                                onClick={() => startEditDone(pkg)}
                                className="h-8 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-600 bg-it-surface dark:bg-rink-800 text-card-meta font-semibold text-it-ink-800 dark:text-white transition-colors motion-reduce:transition-none active:brightness-95"
                              >
                                {MESSAGES.classProduct.rowEdit}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* 정정 폼 — 미등록 행과 동일 레이아웃(라벨·콤마·원 접미). */
                          <div>
                            <div className="space-y-1 mb-2">
                              <label
                                htmlFor={`done-name-${pkg.id}`}
                                className="block text-w-caption font-bold text-it-ink-500 dark:text-rink-300"
                              >
                                {MESSAGES.class.salesCycle.renewNameLabel}
                              </label>
                              <input
                                id={`done-name-${pkg.id}`}
                                type="text"
                                value={doneName}
                                onChange={(e) => setDoneName(e.target.value)}
                                maxLength={50}
                                className="w-full h-11 rounded-w-md bg-it-surface dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 px-3 text-sm text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500"
                              />
                            </div>
                            <div className="space-y-1 mb-2">
                              <label
                                htmlFor={`done-desc-${pkg.id}`}
                                className="block text-w-caption font-bold text-it-ink-500 dark:text-rink-300"
                              >
                                {MESSAGES.class.salesCycle.renewDescLabel}
                              </label>
                              <input
                                id={`done-desc-${pkg.id}`}
                                type="text"
                                value={doneDesc}
                                onChange={(e) => setDoneDesc(e.target.value)}
                                placeholder={MESSAGES.class.salesCycle.renewDescPlaceholder}
                                maxLength={200}
                                className="w-full h-11 rounded-w-md bg-it-surface dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 px-3 text-sm text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:border-it-blue-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label
                                htmlFor={`done-price-${pkg.id}`}
                                className="block text-w-caption font-bold text-it-ink-500 dark:text-rink-300"
                              >
                                {MESSAGES.class.salesCycle.renewPriceLabel(targetMonthLabel)}
                              </label>
                              <div className="relative">
                                <input
                                  id={`done-price-${pkg.id}`}
                                  type="text"
                                  inputMode="numeric"
                                  value={formatPriceDisplay(donePrice)}
                                  onChange={(e) =>
                                    setDonePrice(e.target.value.replace(/[^0-9]/g, ''))
                                  }
                                  className="w-full h-11 rounded-w-md bg-it-surface dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 pl-3 pr-9 text-sm text-right tabular-nums text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500"
                                />
                                <span
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-it-ink-500 dark:text-rink-300"
                                  aria-hidden="true"
                                >
                                  원
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-2.5">
                              <button
                                type="button"
                                onClick={() => setEditingDoneId(null)}
                                className="flex-1 h-10 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-600 text-it-ink-800 dark:text-rink-100 text-card-meta font-bold transition-colors motion-reduce:transition-none active:brightness-95"
                              >
                                취소
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveDone(pkg)}
                                disabled={doneSaving}
                                className="flex-1 h-10 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-meta font-bold disabled:opacity-60 transition-colors motion-reduce:transition-none active:brightness-95"
                              >
                                {doneSaving ? '저장 중…' : '저장하기'}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {needsUpdate.map((pkg) => (
                    <li
                      key={pkg.id}
                      className="rounded-w-md border border-amber-200 dark:border-amber-700/50 px-3.5 py-2.5"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-card-body font-semibold text-it-ink-800 dark:text-white truncate">
                          {pkg.productName}
                        </span>
                        <span className="text-card-meta font-bold text-amber-600 dark:text-amber-400 shrink-0">
                          {MESSAGES.class.salesCycle.packageNeedsUpdate}
                        </span>
                      </div>
                      {/* 이름 — 새 달분으로 등록될 항목 이름(수정 가능, 비우면 원래 이름). */}
                      <div className="space-y-1 mb-2">
                        <label
                          htmlFor={`renew-name-${pkg.id}`}
                          className="block text-w-caption font-bold text-it-ink-500 dark:text-rink-300"
                        >
                          {MESSAGES.class.salesCycle.renewNameLabel}
                        </label>
                        <input
                          id={`renew-name-${pkg.id}`}
                          type="text"
                          value={pkgNames[pkg.id] ?? pkg.productName}
                          onChange={(e) =>
                            setPkgNames((prev) => ({ ...prev, [pkg.id]: e.target.value }))
                          }
                          maxLength={50}
                          className="w-full h-11 rounded-w-md bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 px-3 text-sm text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500"
                        />
                      </div>
                      {/* 설명 — 학부모 결제 화면 노출 텍스트. 원본 설명 프리필, 비우면 미기재. */}
                      <div className="space-y-1 mb-2">
                        <label
                          htmlFor={`renew-desc-${pkg.id}`}
                          className="block text-w-caption font-bold text-it-ink-500 dark:text-rink-300"
                        >
                          {MESSAGES.class.salesCycle.renewDescLabel}
                        </label>
                        <input
                          id={`renew-desc-${pkg.id}`}
                          type="text"
                          value={pkgDescs[pkg.id] ?? pkg.description ?? ''}
                          onChange={(e) =>
                            setPkgDescs((prev) => ({ ...prev, [pkg.id]: e.target.value }))
                          }
                          placeholder={MESSAGES.class.salesCycle.renewDescPlaceholder}
                          maxLength={200}
                          className="w-full h-11 rounded-w-md bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 px-3 text-sm text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:outline-none focus:border-it-blue-500"
                        />
                      </div>
                      {/* 금액 — 우측 정렬 + "원" 접미로 이름 칸과 형태 구분. */}
                      <div className="space-y-1">
                        <label
                          htmlFor={`renew-price-${pkg.id}`}
                          className="block text-w-caption font-bold text-it-ink-500 dark:text-rink-300"
                        >
                          {MESSAGES.class.salesCycle.renewPriceLabel(targetMonthLabel)}
                        </label>
                        <div className="relative">
                          <input
                            id={`renew-price-${pkg.id}`}
                            // 콤마 표기 — number 타입은 콤마 불가라 text+inputMode
                            //   (PackageEditSheet 가격 입력과 동일 패턴). 저장값은 숫자만.
                            type="text"
                            inputMode="numeric"
                            value={formatPriceDisplay(pkgPrices[pkg.id] ?? String(pkg.price))}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              setPkgPrices((prev) => ({ ...prev, [pkg.id]: raw }));
                            }}
                            className="w-full h-11 rounded-w-md bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 pl-3 pr-9 text-sm text-right tabular-nums text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500"
                          />
                          <span
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-it-ink-500 dark:text-rink-300"
                            aria-hidden="true"
                          >
                            원
                          </span>
                        </div>
                      </div>
                      {/* 제안 금액 — 회차 스테퍼(단가 × 회수). 요일별 회차는 정보 텍스트로만.
                          일정 수와 무관하게 레이아웃 고정 — 회수는 화면 계산용, 서버 미전송. */}
                      {unitPriceRef > 0 &&
                        targetMonthCalc !== null &&
                        targetMonthCalc.total > 0 &&
                        (() => {
                          const total = targetMonthCalc.total;
                          const raw = calcCounts[pkg.id];
                          // '' = 입력 중 임시 상태(금액 0·적용 비활성), 미지정 = 전체 회차.
                          const count =
                            raw === undefined
                              ? total
                              : Math.min(parseInt(raw, 10) || 0, total);
                          const amount = count * unitPriceRef;
                          const commitCount = (n: number) =>
                            setCalcCounts((prev) => ({
                              ...prev,
                              [pkg.id]: String(Math.min(Math.max(n, 1), total)),
                            }));
                          const dayInfo = CALC_DAY_ORDER.filter(
                            (dow) => (targetMonthCalc.counts.get(dow) ?? 0) > 0,
                          )
                            .map((dow) =>
                              MESSAGES.class.salesCycle.renewCalcDayLabel(
                                WEEKDAYS[dow],
                                targetMonthCalc.counts.get(dow) ?? 0,
                              ),
                            )
                            .join(' · ');
                          return (
                            <div className="mt-2.5">
                              {/* text-card-caption 은 미정의 클래스(크기 무효) — 12px meta 사용. */}
                              <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
                                {MESSAGES.class.salesCycle.renewCalcHint(
                                  targetMonthLabel,
                                  unitPriceRef.toLocaleString(),
                                )}
                              </p>
                              <p className="text-card-meta text-it-ink-500 dark:text-rink-300 mb-1.5 tabular-nums">
                                {MESSAGES.class.salesCycle.renewCalcScheduleInfo(
                                  targetMonthLabel,
                                )}
                                : {dayInfo}
                              </p>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-600 bg-it-fill dark:bg-rink-700 overflow-hidden shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => commitCount(count - 1)}
                                    disabled={count <= 1}
                                    aria-label={MESSAGES.class.salesCycle.renewCalcDecAria}
                                    className={CALC_STEP_BTN}
                                  >
                                    <Icon name="remove" className="text-base" aria-hidden="true" />
                                  </button>
                                  {/* 회수 직접 입력 — 큰 변경은 타이핑, ± 는 미세 조정. */}
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={raw ?? String(total)}
                                    onChange={(e) => {
                                      const digits = e.target.value.replace(/\D/g, '');
                                      setCalcCounts((prev) => ({
                                        ...prev,
                                        [pkg.id]:
                                          digits === ''
                                            ? ''
                                            : String(
                                                Math.min(
                                                  parseInt(digits, 10),
                                                  total,
                                                ),
                                              ),
                                      }));
                                    }}
                                    onBlur={() => {
                                      if (count < 1) commitCount(1);
                                    }}
                                    aria-label={MESSAGES.class.salesCycle.renewCalcCountInputAria}
                                    className="w-9 bg-transparent text-center text-sm font-bold tabular-nums text-it-ink-800 dark:text-white focus:outline-none"
                                  />
                                  <span className="pr-2 text-sm font-bold text-it-ink-800 dark:text-white">
                                    {MESSAGES.class.salesCycle.renewCalcCountUnit}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => commitCount(count + 1)}
                                    disabled={count >= total}
                                    aria-label={MESSAGES.class.salesCycle.renewCalcIncAria}
                                    className={CALC_STEP_BTN}
                                  >
                                    <Icon name="add" className="text-base" aria-hidden="true" />
                                  </button>
                                </div>
                                <span className="flex-1 text-right text-sm font-bold tabular-nums text-it-ink-800 dark:text-white truncate">
                                  {MESSAGES.class.salesCycle.renewCalcAmount(
                                    amount.toLocaleString(),
                                  )}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPkgPrices((prev) => ({
                                      ...prev,
                                      [pkg.id]: String(amount),
                                    }))
                                  }
                                  disabled={count < 1}
                                  aria-label={MESSAGES.class.salesCycle.renewCalcApplyAria(
                                    count,
                                    amount.toLocaleString(),
                                  )}
                                  className="h-9 px-3 rounded-w-md border-[1.5px] border-it-blue-500 text-it-blue-500 dark:text-it-blue-300 text-card-meta font-bold hover:bg-it-blue-50 dark:hover:bg-it-blue-500/10 disabled:opacity-40 transition-colors motion-reduce:transition-none active:brightness-95 shrink-0"
                                >
                                  {MESSAGES.class.salesCycle.renewCalcApplyButton}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      {/* 안 팔 항목은 등록하지 않으면 다음 달 자동 소멸(앵커 규칙) — 제외 버튼 불필요. */}
                      <button
                        type="button"
                        onClick={() => handleCreateMonthPkg(pkg)}
                        disabled={pkgSubmitting === pkg.id}
                        className="w-full h-11 mt-2.5 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-meta font-bold disabled:opacity-60 transition-colors motion-reduce:transition-none active:brightness-95"
                      >
                        {MESSAGES.class.salesCycle.renewRegisterButton}
                      </button>
                    </li>
                  ))}
                </ul>
                {/* 미갱신 = 이번 달 안 받는 옵션이라는 의미 안내 (접수형 모델). */}
                {needsUpdate.length > 0 && (
                  <p className="mt-2 text-card-meta text-it-ink-500 dark:text-rink-300">
                    {MESSAGES.class.salesCycle.unrenewedInlineHint(targetMonthLabel)}
                  </p>
                )}
              </div>
            )}

            {/* [고지형 게이트] 미등록이 있어도 활성 — 확인창에서 "이번 달 미판매" 고지 후
                진행. 단 대상월 등록 0건(팔 항목 없음)은 사전 차단(서버 400 미러). */}
            {salesBlockedNoPkg && (
              <p
                className="mb-2 text-card-meta text-amber-700 dark:text-amber-400"
                role="status"
              >
                {MESSAGES.class.salesCycle.openSalesNeedOnePkg}
              </p>
            )}
            <button
              type="button"
              onClick={handleOpenSales}
              disabled={openingSales || salesBlockedNoPkg}
              className="w-full h-12 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-body font-extrabold disabled:bg-it-line disabled:text-it-ink-400 dark:disabled:bg-rink-700 transition-colors motion-reduce:transition-none active:brightness-95"
            >
              {MESSAGES.class.salesCycle.openSalesButton}
            </button>
          </section>
        )}

      </main>

      {/* [설계 §3.6] 하단 고정 저장 바 — 미저장 변경이 있을 때만. sticky 는 바닥 스크롤 시
          본래 위치로 복귀해 바 아래 틈으로 컨텐츠가 비치는 문제가 있어, 상세 페이지 액션바와
          동일 패턴: absolute 고정을 BottomNav(60px, fixed z-40) 위에 얹고 main 여백 확보. */}
      {dirtyCount > 0 && (
        <div
          className="absolute left-0 right-0 z-30 bg-it-surface dark:bg-it-blue-950 border-t border-it-line dark:border-rink-700 px-5 py-3"
          style={{
            bottom:
              'calc(60px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
          }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscardAll}
              disabled={saving}
              className="h-12 px-4 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 text-sm font-bold text-it-ink-500 dark:text-rink-300 disabled:opacity-50 transition-colors motion-reduce:transition-none active:brightness-95"
            >
              {MESSAGES.class.salesCycle.discardAllButton}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex-1 h-12 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-sm font-bold disabled:opacity-50 transition-colors motion-reduce:transition-none active:brightness-95"
            >
              {saving
                ? MESSAGES.common.saving
                : MESSAGES.class.salesCycle.saveBarButton(dirtyCount)}
            </button>
          </div>
        </div>
      )}

      {/* 미니달력 — 수업 일정 복수 추가. 월 일괄 생성 진입 시(fillPrefill) 대상월·정규
          요일 날짜가 미리 선택된 채 열리고, [확인]에서만 등록된다. */}
      <MultiDatePickerModal
        isOpen={multiDateOpen}
        initialYear={fillPrefill?.year ?? initialYear}
        initialMonth={fillPrefill?.month ?? initialMonth}
        selected={fillPrefill?.dates ?? []}
        disabledDates={allTakenDates}
        // spot(1회용) — 요일 빠른 선택 칩 차단 + 단일 선택 모드 (ClassForm 동일 패턴).
        daySchedules={isSpot ? [] : cls.daySchedules ?? []}
        singleSelect={isSpot}
        onConfirm={handleConfirmDates}
        onClose={() => {
          setMultiDateOpen(false);
          setFillPrefill(null);
        }}
        iceTheme
      />

      {/* 회차 장소 선택 — 수정 폼과 동일한 검색 시트 (아코디언 수정 패널 전용). */}
      <VenueSearchSheet
        isOpen={venueSheetOpen}
        onClose={() => setVenueSheetOpen(false)}
        title="훈련 장소 선택"
        selectedVenueId={editVenue}
        initialQuery={editVenueName}
        iceTheme
        onSelectVenue={(v) => {
          setEditVenue(v.id);
          setEditVenueName(v.name);
          setVenueSheetOpen(false);
        }}
      />
    </MobileContainer>
  );
}

/* ─────────────────────────── Subcomponents ─────────────────────────── */

/** 수명주기 상태 칩 — 목록 배지(classes-manage)와 동일 의미·색상 체계. */
function LifecycleChip({
  isEnded,
  lifecycleStatus,
  pendingReason,
  targetMonthLabel,
}: {
  isEnded: boolean;
  lifecycleStatus?: ClassHeader['lifecycleStatus'];
  pendingReason?: ClassHeader['pendingReason'];
  targetMonthLabel: number | null;
}) {
  let label: string | null = null;
  let tone = '';
  if (isEnded || lifecycleStatus === 'ENDED') {
    label = MESSAGES.class.salesCycle.ctaEnded;
    tone = 'bg-it-fill text-it-ink-500 dark:bg-rink-700 dark:text-rink-300';
  } else if (lifecycleStatus === 'PENDING_SCHEDULE') {
    label =
      pendingReason === 'UNAPPROVED_MONTH'
        ? MESSAGES.class.salesOpenNeededBadge
        : MESSAGES.class.pendingScheduleBadge;
    tone = 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400';
  } else if (lifecycleStatus === 'ON_SALE' && targetMonthLabel !== null) {
    label = MESSAGES.class.salesCycle.onSaleChip(targetMonthLabel);
    tone = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400';
  }
  if (!label) return null;
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-card-meta font-bold',
        tone,
      )}
      role="status"
    >
      {label}
    </span>
  );
}

function ApprovalBanner({ status, reason }: { status: ClassHeader['approvalStatus']; reason?: string | null }) {
  // 수업 자동 승인 정책상 APPROVED 는 기본 상태이므로 안내 배너 미표시.
  // PENDING/REJECTED 는 과거 데이터·예외 케이스 안전망으로 유지.
  if (status === 'PENDING') {
    return (
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-w-md bg-sun-500/10"
        role="alert"
      >
        <Icon name="hourglass_empty" className="text-card-title text-sun-500" aria-hidden="true" />
        <p className="text-card-body text-it-ink-800 dark:text-rink-100 font-medium">
          감독 승인 대기중 · 승인 완료 후 일정 생성이 가능합니다.
        </p>
      </div>
    );
  }
  if (status === 'REJECTED') {
    return (
      <div
        className="flex items-start gap-2 px-4 py-3 rounded-w-md bg-it-red-50 dark:bg-it-red-700/15"
        role="alert"
      >
        <Icon name="cancel" className="text-card-title text-it-red-500 dark:text-it-red-300 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-card-body text-it-red-500 dark:text-it-red-300 font-medium">반려됨</p>
          {reason && (
            <p className="text-card-meta text-it-red-500/80 dark:text-it-red-300/80 mt-1 break-words">{reason}</p>
          )}
        </div>
      </div>
    );
  }
  return null;
}
