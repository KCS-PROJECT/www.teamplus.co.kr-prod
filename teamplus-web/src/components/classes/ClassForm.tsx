'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { BottomSheetSelector } from '@/components/ui/BottomSheetSelector';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import {
  ClassFormData,
  DEFAULT_FORM_DATA,
  FormErrors,
  validateClassForm,
  DayOfWeek,
  DAY_OPTIONS,
  DateScheduleItem,
  DayScheduleItem,
  sortDaySchedules,
  useSelectableTeams,
  localTodayISO,
  isPastScheduleDate,
} from '@/hooks/useClassForm';
import type { ClassVisibility } from '@/lib/class-visibility';
// [2026-08-04] 수업 지역 SoT — 백엔드 regions.constant.ts 와 값 동기화 필수.
import { REGIONS, districtsOf, SHOW_CLASS_REGION_SECTION } from '@/lib/regions';
import { VenueSearchSheet } from '@/components/venue/VenueSearchSheet';
import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { Toggle } from '@/components/ui/Toggle';
import {
  PackageManageSection,
  type DraftProduct,
} from '@/components/classes/PackageManageSection';
import {
  getCurrentYear,
  birthYearToKoreanAge,
} from '@/lib/gradeToBirthYear';
// [2026-06-04] 대상 연령 선택을 출생연도 체크박스로 전환.
//   · 선택 가능 출생연도는 useDateTime(서버 Asia/Seoul 기준 연도)로 동적 산출 →
//     매년 1월 1일 최신 출생연도(currentYear-6)가 자동 추가된다. (예: 2026→2020, 2027→2021)
import { useDateTime } from '@/hooks/useDateTime';
import { MultiDatePickerModal, type MultiDateResolved } from '@/components/ui/MultiDatePickerModal';
import { TimePicker, addMinutes, nextFullHour } from '@/components/ui/TimePicker';

/* ────────────────────────────────────────────
   공개 범위 옵션 (2026-08-04)
   ──────────────────────────────────────────── */
// CLASS_VISIBILITY_DISABLED — 정책상 공개 범위 선택 미사용(기능은 존치, 화면 노출만 차단).
//   모든 수업이 비공개(소속 팀 전용)로 저장된다 — 폼이 값을 보내지 않아 서버 기본값 TEAM_ONLY 로 수렴.
//   이 플래그를 true 로 되돌리면 그대로 복원된다. 절차: claudedocs/class-visibility-disable-2026-08-12.md §5
const SHOW_VISIBILITY_SECTION: boolean = false;

/**
 * 일정 시각 선택 간격(분) — TimePicker stepMinutes 이자 종료 시각 하한 계산 단위.
 * 종료는 "시작 + 1스텝" 이상만 고를 수 있다(0분짜리 일정 차단 · 자정 넘김 불허).
 */
const SCHEDULE_STEP_MINUTES = 10;

// 넓은 범위 → 좁은 범위 순서. 감독이 위에서부터 읽으며 필요한 만큼 좁히도록 배치한다.
// 값은 백엔드 Prisma ClassVisibility enum 과 1:1 — src/lib/class-visibility.ts 참조.
//
// ⚠️ 함수로 감싼다 — 모듈 최상위에서 `MESSAGES.*` 를 평가하면 webpack 모듈 초기화 순서에 따라
//   messages 모듈보다 먼저 실행되어 `Cannot read properties of undefined` 로 페이지가 죽는다
//   (2026-08-04 ExploreFilterSheet 에서 실측). 렌더 시점에 호출할 것.
const buildVisibilityOptions = (): ReadonlyArray<{
  value: ClassVisibility;
  label: string;
  hint: string;
}> => [
  {
    value: 'PUBLIC',
    label: MESSAGES.class.visibility.public,
    hint: MESSAGES.class.visibility.publicHint,
  },
  {
    value: 'PARENTS_ONLY',
    label: MESSAGES.class.visibility.parentsOnly,
    hint: MESSAGES.class.visibility.parentsOnlyHint,
  },
  {
    value: 'SELECTED_TEAMS',
    label: MESSAGES.class.visibility.selectedTeams,
    hint: MESSAGES.class.visibility.selectedTeamsHint,
  },
  {
    value: 'TEAM_ONLY',
    label: MESSAGES.class.visibility.teamOnly,
    hint: MESSAGES.class.visibility.teamOnlyHint,
  },
];

/* ────────────────────────────────────────────
   TotalClassDays — 교육기간 + 요일로 자동 계산
   ──────────────────────────────────────────── */
// [2026-06-04] countClassDays / TotalClassDays / DAY_INDEX_MAP 제거 — 교육 시작/종료일 입력 삭제로 미사용.

/* ────────────────────────────────────────────
   날짜 → 한글 요일 (표시 전용)
   ──────────────────────────────────────────── */
// "YYYY-MM-DD" → "월" 등. 표시만을 위한 헬퍼로, dateSchedules 로직과 무관.
// TZ 시프트 방지를 위해 로컬 기준으로 파싱.
function getKoreanWeekday(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return '';
  return ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
}

/* ────────────────────────────────────────────
   Props
   ──────────────────────────────────────────── */
interface ClassFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<ClassFormData>;
  onSubmit: (data: ClassFormData) => Promise<FormErrors | null>;
  onDelete?: () => Promise<void>;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  enrollmentCount?: number;
  // 등록 컨텍스트 — 'team'(기본): 팀 정규 수업 / 'academy': 오픈클래스 레슨.
  // academy 컨텍스트에서는 trainingType='lesson' 강제,
  // 코치 목록 source 도 오픈클래스 소속으로 분기.
  context?: 'team' | 'academy';
  // academy 컨텍스트일 때 코치 목록 조회용 오픈클래스 ID (team 모드에서는 무시).
  academyId?: string;
  /** 수강료 섹션(수정 모드)에 렌더할 패키지 관리 노드. create 모드는 ClassForm 내부 1회권 입력을 사용.
   *  함수형이면 폼 draft 일정에서 계산한 대상월(renewalTargetMonth)을 받아 렌더한다 —
   *  판매 승인 대기 수업의 월 결제 월분 갱신 UI 용. */
  pricingSection?:
    | React.ReactNode
    | ((ctx: {
        renewalTargetMonth: string | null;
        salesPending: boolean;
        /** [가격 계산 도우미] 폼 draft 일정 날짜("YYYY-MM-DD") — 월 결제 시트 회차 집계용. */
        scheduleDates: string[];
      }) => React.ReactNode);
  /** [Lifecycle v4.1 §9.2] 판매 승인 대기(PENDING_SCHEDULE) 수업 여부 — 대상월 계산 게이트. */
  salesPending?: boolean;
  /** [등록 모드] 추가 패키지(정기권 등) deferred draft 목록. 선불일 때만 노출. */
  packageDraftValue?: DraftProduct[];
  /** [등록 모드] 추가 패키지 draft 변경 콜백. 미전달 시 등록 패키지 섹션 미노출. */
  onPackageDraftChange?: (next: DraftProduct[]) => void;
  /** [등록 모드] 추가 패키지 보류 변경 존재 여부. */
  packageDirty?: boolean;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스 제거(flat) + it-* 토큰(it-blue 헤더·it-fill 입력)으로 교체.
   */
  iceTheme?: boolean;
}

export function ClassForm({
  mode,
  initialData,
  onSubmit,
  onDelete,
  isSubmitting = false,
  isDeleting = false,
  enrollmentCount = 0,
  context = 'team',
  // [2026-06-04] academyId — 코치 조회 훅 제거로 현재 미사용 (prop 인터페이스는 호출처 호환 위해 유지).
  pricingSection,
  salesPending = false,
  packageDraftValue,
  onPackageDraftChange,
  packageDirty = false,
  iceTheme = false,
}: ClassFormProps) {
  const isAcademy = context === 'academy';
  // [ICETIMES] flat 토큰 헬퍼 — iceTheme=true 일 때만 it-* 스타일 적용(회귀 0).
  //   sectionHead: it-blue 세로바 헤더 / card: 카드 박스 제거(flat) / input·textarea: it-fill.
  const ic = {
    head: iceTheme
      ? 'flex items-center gap-2.5 text-card-title font-extrabold text-it-blue-500 dark:text-it-blue-300 tracking-[-0.02em] pb-1'
      : 'flex items-center gap-2.5 text-card-title font-extrabold text-ice-600 dark:text-ice-400 tracking-[-0.02em] pb-1',
    headBar: iceTheme ? 'w-1 h-4 rounded-sm bg-it-blue-500' : 'w-1 h-4 rounded-sm bg-ice-500',
    // 카드 박스 — iceTheme 은 flat(흰 배경·hairline 1.5px·무그림자), 기본은 카드.
    card: iceTheme
      ? 'bg-it-surface dark:bg-rink-800 p-5 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700'
      : 'bg-white dark:bg-rink-800 p-5 rounded-xl shadow-sm border border-wline dark:border-rink-700',
    label: iceTheme
      ? 'block text-card-meta font-bold mb-2 text-it-ink-600 dark:text-rink-200 tracking-[-0.01em]'
      : 'block text-card-meta font-bold mb-2 text-wtext-2 dark:text-rink-200 tracking-[-0.01em]',
    input: iceTheme
      ? 'w-full bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 rounded-w-md text-sm h-12 px-4 focus:outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 transition-colors motion-reduce:transition-none text-it-ink-800 dark:text-white placeholder:text-it-ink-400'
      : 'w-full bg-wbg dark:bg-rink-700 border border-wline-2 dark:border-rink-600 rounded-xl text-sm h-12 px-4 focus:outline-none focus:border-ice-500 focus:ring-1 focus:ring-ice-500/20 transition-all text-wtext-1 dark:text-white placeholder:text-wtext-3',
    required: iceTheme ? 'text-it-red-500 ml-1' : 'text-flame-500 ml-1',
  };
  const [formData, setFormData] = useState<ClassFormData>({
    ...DEFAULT_FORM_DATA,
    // academy 컨텍스트는 항상 'lesson' 강제.
    ...(isAcademy ? { trainingType: 'lesson' } : {}),
    ...initialData,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  // [대상 연령] 전체 연령 대상(기본) vs 개별 출생연도 선택. 초기값은 initialData 기준(수정 모드 복원).
  //   restrictAge=false → 전체(targetBirthYears=[]) · true → 출생연도 그리드 노출.
  const [restrictAge, setRestrictAge] = useState<boolean>(
    (initialData?.targetBirthYears?.length ?? 0) > 0,
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { toast } = useToast();
  const { back } = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  // [spot 선불 단건] 체크 전 결제방식 기억 — 해제 시 복원(월 결제 draft 와 같은 보존 원칙).
  const prevBillingModeRef = useRef<ClassFormData['billingMode'] | null>(null);
  const [venueSheetOpen, setVenueSheetOpen] = useState(false);
  // [2026-06-05] 장소 선택 BottomSheet 대상 — null: 단일 장소 / DayOfWeek: 해당 요일 행 장소.
  const [venueTargetDay, setVenueTargetDay] = useState<DayOfWeek | null>(null);
  // [2026-06-09] 오픈클래스 날짜별 일정 — 장소 시트 대상 일정 key + 신규 행 key 카운터.
  const [venueTargetDateKey, setVenueTargetDateKey] = useState<string | null>(null);
  const dateKeySeq = useMemo(() => ({ n: 0 }), []);
  // [2026-08-05] 수업 지역 시/도·시군구 — select 대신 BottomSheet 로 선택.
  const [regionCitySheetOpen, setRegionCitySheetOpen] = useState(false);
  const [regionDistrictSheetOpen, setRegionDistrictSheetOpen] = useState(false);
  // [2026-06-04] 코치 배정 UI 제거 — coachSearch/coachSheetOpen state 삭제.
  const [portalReady, setPortalReady] = useState(false);

  // [2026-06-04] 코치 배정 UI 제거 — useClubCoaches/useAcademyCoaches 코치 조회 훅 삭제.
  // [2026-05-15 → 2026-08-04] 노출 팀 후보 — '지정 팀에만'(SELECTED_TEAMS) 선택 시에만 조회.
  //   기존엔 academy 컨텍스트에서만 조회했으나, 공개범위 도입으로 팀 수업도 지정 노출이 가능해졌다.
  //   선택 시점에 지연 로딩해 불필요한 팀 목록 호출(200건)을 피한다.
  const { teams: selectableTeams, isLoading: isTeamsLoading } = useSelectableTeams(
    formData.visibility === 'SELECTED_TEAMS',
  );

  // 수정 모드: initialData 변경 시 반영
  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({ ...prev, ...initialData }));
      // 복원된 대상 출생연도가 있으면 개별 선택 모드로 전환.
      if ((initialData.targetBirthYears?.length ?? 0) > 0) {
        setRestrictAge(true);
      }
    }
  }, [initialData]);

  // createPortal 준비 (SSR 방지)
  useEffect(() => { setPortalReady(true); }, []);

  // 장소 선택은 공용 VenueSearchSheet — scroll lock/scrim/ESC 는 BottomSheet 쉘이 내장 처리.

  const handleChange = (field: keyof ClassFormData, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof FormErrors];
        return next;
      });
    }
  };

  const isEditMode = mode === 'edit';

  const handleVenueSelect = (venueId: string, venueName: string, address: string) => {
    if (venueTargetDateKey) {
      // [2026-06-09] 오픈클래스 날짜별 일정 행의 장소 지정.
      setFormData(prev => ({
        ...prev,
        dateSchedules: prev.dateSchedules.map(s =>
          s.key === venueTargetDateKey ? { ...s, venueId, venueName } : s,
        ),
      }));
    } else if (venueTargetDay) {
      // [2026-06-05] 특정 요일 행의 장소 지정 — daySchedules 해당 행 venue 업데이트.
      setFormData(prev => ({
        ...prev,
        daySchedules: prev.daySchedules.map(s =>
          s.dayOfWeek === venueTargetDay ? { ...s, venueId, venueName } : s,
        ),
      }));
    } else {
      // 단일 장소 — 기존 동작 유지.
      setFormData(prev => ({ ...prev, venueId, venue: venueName, venueAddress: address }));
    }
    setVenueSheetOpen(false);
    setVenueTargetDay(null);
    setVenueTargetDateKey(null);
  };

  // [2026-06-05] 장소 BottomSheet 닫기 — 대상요일·대상일정 리셋 공통 처리.
  const closeVenueSheet = () => {
    setVenueSheetOpen(false);
    setVenueTargetDay(null);
    setVenueTargetDateKey(null);
  };

  // [2026-06-30 §9] 요일 우선 흐름 — 모달이 고른 날짜들로 일정 재구성.
  //   · 기존 일정(이미 추가된 날짜): 개별 수정값 그대로 보존(요일 기본값 소급 없음).
  //   · 신규 일정(새로 고른 날짜): resolved(요일 기본값 있으면 그 값, 없으면 빈 시간) 주입 →
  //     기본값 없는 요일은 일정 목록 아코디언에서 개별 수정.
  // [Lifecycle v4.1 §7.1] spot(1회용 수업) — 일정을 단일로 제한 (마지막 선택 1개만 유지).
  const isSpot = formData.trainingType === 'spot';
  const applyMultiDates = (dates: string[], resolved: MultiDateResolved[]) => {
    if (isSpot && dates.length > 1) {
      dates = dates.slice(-1);
    }
    const resolvedMap = new Map(resolved.map(r => [r.date, r] as const));
    // 시트와 동일 기준(로컬 오늘)의 지난 날짜 판정 — 시트는 지난 날짜를 선택 대상에서 제외하므로,
    //   지난 회차 행은 확인 결과로 재구성하지 않고 그대로 보존한다(미보존 시 확인할 때마다 유실).
    const now = new Date();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setFormData(prev => {
      const existing = new Map(
        prev.dateSchedules.filter(s => s.date).map(s => [s.date, s] as const),
      );
      // spot 은 단일 일정 유지 정책상 보존 없이 교체(마지막 선택 1개만 남긴다).
      const past = isSpot
        ? []
        : prev.dateSchedules.filter(s => s.date && s.date < todayISO);
      const pastDates = new Set(past.map(s => s.date));
      const next = dates
        .filter(d => !pastDates.has(d))
        .map(d => {
          const ex = existing.get(d);
          if (ex) return ex; // 기존 일정 — 개별 수정값 보존
          // 신규 일정 — 요일 기본값 주입(없으면 빈 시간).
          dateKeySeq.n += 1;
          const r = resolvedMap.get(d);
          return {
            key: `ds${dateKeySeq.n}`,
            date: d,
            startTime: r?.startTime ?? '',
            endTime: r?.endTime ?? '',
            venueId: r?.venueId ?? '',
            venueName: r?.venueName ?? '',
          };
        });
      return { ...prev, dateSchedules: [...past, ...next] };
    });
  };

  // [이번 달 채우기] 정규 요일(daySchedules) 기준으로 이달 남은 날짜를 로컬 draft(dateSchedules)에만 생성.
  //   · API 호출 없음 — 실제 저장은 등록/수정 제출 시점. applyMultiDates 재사용(추가+기존/지난 회차 보존).
  //   · 시간이 채워진 요일만 대상(모달 validDayDefaults와 동일 기준). 다음 달은 다음 달에 다시(월 단위 운영).
  const activeDayDefaults = useMemo(
    () => formData.daySchedules.filter((s) => s.startTime && s.endTime),
    [formData.daySchedules],
  );
  const computeThisMonthDates = useCallback((): string[] => {
    const weekdays = new Set<string>(activeDayDefaults.map((s) => s.dayOfWeek));
    if (weekdays.size === 0) return [];
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-based
    const mm = String(m + 1).padStart(2, '0');
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const existing = new Set(
      formData.dateSchedules.filter((s) => s.date).map((s) => s.date),
    );
    const out: string[] = [];
    // 오늘부터 이달 말까지 — 정규 요일에 해당하고 아직 없는 날짜만.
    for (let d = now.getDate(); d <= daysInMonth; d += 1) {
      const iso = `${y}-${mm}-${String(d).padStart(2, '0')}`;
      if (weekdays.has(getKoreanWeekday(iso)) && !existing.has(iso)) out.push(iso);
    }
    return out;
  }, [activeDayDefaults, formData.dateSchedules]);
  const thisMonthFillCount = useMemo(
    () => computeThisMonthDates().length,
    [computeThisMonthDates],
  );
  const handleFillThisMonth = () => {
    const newDates = computeThisMonthDates();
    if (newDates.length === 0) {
      toast.error(MESSAGES.class.rangeGen.emptyResult);
      return;
    }
    const now = new Date();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // 추가+보존 병합: 지난·개별 수정 회차는 applyMultiDates가 그대로 유지, 신규 날짜만 union.
    const existingFuture = formData.dateSchedules
      .filter((s) => s.date && s.date >= todayISO)
      .map((s) => s.date);
    const union = Array.from(new Set([...existingFuture, ...newDates])).sort();
    const resolved: MultiDateResolved[] = union.map((d) => {
      const def = activeDayDefaults.find((s) => s.dayOfWeek === getKoreanWeekday(d));
      return {
        date: d,
        startTime: def?.startTime ?? '',
        endTime: def?.endTime ?? '',
        venueId: def?.venueId ?? '',
        venueName: def?.venueName ?? '',
      };
    });
    applyMultiDates(union, resolved);
    toast.success(MESSAGES.class.rangeGen.success(newDates.length));
  };

  // [2026-06-30] 요일별 기본값(ClassDaySchedule 템플릿) — 요일 토글 + 시간·장소 입력.
  //   토글 켜면 빈 행 추가, 끄면 제거. 시간/장소는 updateDaySchedule 로 갱신.
  //   sortDaySchedules 로 월 시작 정렬해 렌더.
  const sortedDaySchedules = useMemo(
    () => sortDaySchedules(formData.daySchedules),
    [formData.daySchedules],
  );
  const toggleDaySchedule = (day: DayOfWeek) => {
    setFormData(prev => {
      const exists = prev.daySchedules.some(s => s.dayOfWeek === day);
      // 새 요일은 이미 입력된 행의 시간·장소를 상속해 반복 입력을 줄인다.
      const template = prev.daySchedules.find(s => s.startTime || s.endTime || s.venueId);
      return {
        ...prev,
        daySchedules: exists
          ? prev.daySchedules.filter(s => s.dayOfWeek !== day)
          : [
              ...prev.daySchedules,
              {
                dayOfWeek: day,
                startTime: template?.startTime ?? '',
                endTime: template?.endTime ?? '',
                venueId: template?.venueId ?? '',
                venueName: template?.venueName ?? '',
              },
            ],
      };
    });
  };
  // 회차 전체 적용 — 정규 요일 applyDayScheduleToAll 과 동일 패턴.
  //   지난 회차는 읽기 전용 잠금(출석·정산 근거)이라 복사 대상에서 제외한다.
  const applyDateScheduleToAll = (key: string) => {
    const todayISO = localTodayISO();
    setFormData(prev => {
      const source = prev.dateSchedules.find(s => s.key === key);
      if (!source) return prev;
      return {
        ...prev,
        dateSchedules: prev.dateSchedules.map(s =>
          s.key === key || isPastScheduleDate(s.date, todayISO)
            ? s
            : {
                ...s,
                startTime: source.startTime,
                endTime: source.endTime,
                venueId: source.venueId,
                venueName: source.venueName,
              },
        ),
      };
    });
  };

  const applyDayScheduleToAll = (day: DayOfWeek) => {
    setFormData(prev => {
      const source = prev.daySchedules.find(s => s.dayOfWeek === day);
      if (!source) return prev;
      return {
        ...prev,
        daySchedules: prev.daySchedules.map(s =>
          s.dayOfWeek === day
            ? s
            : {
                ...s,
                startTime: source.startTime,
                endTime: source.endTime,
                venueId: source.venueId,
                venueName: source.venueName,
              },
        ),
      };
    });
  };
  const updateDaySchedule = (day: DayOfWeek, patch: Partial<DayScheduleItem>) => {
    setFormData(prev => ({
      ...prev,
      daySchedules: prev.daySchedules.map(s => (s.dayOfWeek === day ? { ...s, ...patch } : s)),
    }));
  };
  const removeDateSchedule = (key: string) => {
    setFormData(prev => ({ ...prev, dateSchedules: prev.dateSchedules.filter(s => s.key !== key) }));
  };
  const updateDateSchedule = (key: string, patch: Partial<DateScheduleItem>) => {
    setFormData(prev => ({
      ...prev,
      dateSchedules: prev.dateSchedules.map(s => (s.key === key ? { ...s, ...patch } : s)),
    }));
  };

  // [2026-06-04] 코치 배정 UI 제거 — handleCoachToggle/handleCoachRemove 삭제.

  // [2026-05-15] 오픈클래스 노출 팀 토글 — academy 컨텍스트 전용.
  const handleVisibleTeamToggle = (team: { id: string; name: string; teamCode?: string | null }) => {
    setFormData(prev => {
      const exists = prev.selectedVisibleTeams.some(t => t.id === team.id);
      return {
        ...prev,
        selectedVisibleTeams: exists
          ? prev.selectedVisibleTeams.filter(t => t.id !== team.id)
          : [...prev.selectedVisibleTeams, team],
      };
    });
  };

  // ── 대상 연령(출생연도 체크박스) ──────────────────────────────
  //   · 선택 가능 출생연도는 useDateTime(서버 Asia/Seoul 기준 연도)로 동적 산출.
  //     매년 1월 1일 최신 출생연도(currentYear-6)가 자동 추가된다. (2026→2020, 2027→2021)
  //   · 백엔드 스키마(ageMin/ageMax 한국나이 범위)는 유지하고, 선택된 출생연도들의
  //     한국나이 min/max 로 변환해 저장한다. (비연속 선택 시 min~max 범위로 채워짐)
  const { year: serverYear, month: serverMonth } = useDateTime();
  const currentYear = useMemo(
    () => Number(serverYear) || getCurrentYear(),
    [serverYear],
  );
  // [2026-06-09] 오픈클래스 복수 날짜 선택 미니달력 — 초기 표시 월 + 열림 상태.
  const currentMonth = useMemo(() => {
    const m = Number(serverMonth);
    // 서버 월 우선, 미로딩/무효 시 클라이언트 현재 월로 폴백(미니달력이 항상 현재 월로 열리도록).
    return Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
  }, [serverMonth]);
  const [multiDateOpen, setMultiDateOpen] = useState(false);
  // [2026-06-30] 일정 목록 — 한 줄 압축 + 아코디언. 탭한 회차만 개별 수정 펼침.
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  // 지난 회차 — 출석·정산이 물린 사실 기록이라 읽기 전용 잠금(기본 접힘·수정/삭제 불가).
  //   제출 payload·시간 검증에서도 제외되며(useClassForm), 백엔드 diff 가 불가침으로 보존한다.
  const [showPastSchedules, setShowPastSchedules] = useState(false);
  const todayISO = localTodayISO();
  const pastSchedules = formData.dateSchedules.filter((s) =>
    isPastScheduleDate(s.date, todayISO),
  );
  // memo — 파생 배열/객체(scheduleDatesForCalc·createPriceContext)의 참조 안정화 기점.
  const editableSchedules = useMemo(
    () =>
      formData.dateSchedules.filter(
        (s) => !isPastScheduleDate(s.date, todayISO),
      ),
    [formData.dateSchedules, todayISO],
  );
  // [Lifecycle v4.1 §9.2] 판매 대상월 — draft 잔여 일정(지난 회차 제외)의 가장 이른 달.
  //   서버 earliestRemainingMonth 파생과 동일 규칙(비취소·미래 일정 기준)을 draft 로 선계산해,
  //   판매 승인 대기 수업의 수강료 섹션에 "N월분으로 갱신하기"를 즉시 노출한다.
  const renewalTargetMonth = (() => {
    if (mode !== 'edit' || !salesPending) return null;
    const dates = editableSchedules
      .map((s) => s.date)
      .filter(Boolean)
      .sort();
    return dates.length > 0 ? dates[0].slice(0, 7) : null;
  })();
  // [가격 계산 도우미] 폼 draft 일정 날짜 — 월 결제 시트의 귀속월 회차·요일 집계용.
  //   renewalTargetMonth 파생과 동일하게 지난 회차를 제외한다 — 기준이 어긋나면
  //   같은 달의 지난 회차가 섞여 회차·가격이 과다 산출된다(판매 대상 = 잔여 일정).
  const scheduleDatesForCalc = useMemo(
    () => editableSchedules.map((s) => s.date).filter(Boolean),
    [editableSchedules],
  );
  // 등록 모드 컨텍스트 — BE 는 첫 비취소 일정의 달을 salesOpenMonth·정액 귀속월로 기록하므로
  //   동일 규칙(가장 이른 일정의 달)으로 첫 판매월을 선계산한다.
  const createPriceContext = useMemo(
    () =>
      mode === 'create' && scheduleDatesForCalc.length > 0
        ? {
            unitPrice: Number(formData.singlePrice) || 0,
            targetMonth: [...scheduleDatesForCalc].sort()[0].slice(0, 7),
            scheduleDates: scheduleDatesForCalc,
          }
        : null,
    [mode, scheduleDatesForCalc, formData.singlePrice],
  );
  // 최신(currentYear-6) → 오래된(currentYear-12) 순. 미취학~초등 6학년 범위.
  const selectableBirthYears = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 6; y >= currentYear - 12; y -= 1) years.push(y);
    return years;
  }, [currentYear]);

  // 해당 출생연도가 선택되어 있는지 — targetBirthYears(SoT) 개별 포함 여부.
  //   범위가 아닌 개별 집합이므로 비연속 선택(2015·2017만)도 정확히 반영된다.
  const isBirthYearChecked = (birthYear: number): boolean =>
    (formData.targetBirthYears ?? []).includes(birthYear);

  // 출생연도 토글 → targetBirthYears 갱신 + ageMin/ageMax 한국나이 파생값 동시 기록.
  //   ageMin/ageMax 는 하위호환(검증·서버 자동배치 감지)용 파생값일 뿐, SoT 는 targetBirthYears.
  const toggleBirthYear = (birthYear: number) => {
    const current = new Set<number>(formData.targetBirthYears ?? []);
    if (current.has(birthYear)) current.delete(birthYear);
    else current.add(birthYear);
    const years = Array.from(current).sort((a, b) => a - b);

    if (years.length === 0) {
      setFormData(prev => ({
        ...prev,
        targetBirthYears: [],
        ageMin: '',
        ageMax: '',
      }));
      return;
    }
    const ages = years.map(y => birthYearToKoreanAge(y, currentYear));
    setFormData(prev => ({
      ...prev,
      targetBirthYears: years,
      ageMin: Math.min(...ages),
      ageMax: Math.max(...ages),
    }));
  };

  // 선택 요약 라벨 — 연속이면 "2014~2020년생", 비연속이면 "2015·2017·2019년생".
  const birthYearSummaryLabel = useMemo(() => {
    const years = [...(formData.targetBirthYears ?? [])].sort((a, b) => a - b);
    if (years.length === 0) return null;
    const isContiguous = years.every(
      (y, i) => i === 0 || y === years[i - 1] + 1,
    );
    return isContiguous && years.length > 1
      ? `${years[0]}~${years[years.length - 1]}년생`
      : `${years.join('·')}년생`;
  }, [formData.targetBirthYears]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 2026-05-22 옵션 E' — 수정 모드는 가격 영역이 숨겨지므로 가격 검증 스킵.
    const validationErrors = validateClassForm(formData, {
      skipPriceValidation: mode === 'edit',
      isAcademy,
      // [Phase B-6] 선불·선택형 시 정액 패키지 ≥1 강제 — draft 의 MONTHLY_FIXED 개수로 검증.
      //   [2026-06-29] 생성뿐 아니라 수정에서도 강제 — 선불/선택형 수업의 정기 패키지 전체 삭제 차단(팀·오픈 공통).
      // [spot 선불 단건] 1회용은 정기권 미사용 — 정액 필수 강제에서 면제.
      requireMonthlyFixedPackage:
        (formData.billingMode === 'PREPAID' || formData.billingMode === 'BOTH') &&
        formData.trainingType !== 'spot',
      monthlyFixedPackageCount: (packageDraftValue ?? []).filter(
        (d) => !d._deleted && d.feeType === 'MONTHLY_FIXED',
      ).length,
    });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      // 토스트 알림 — dayScheduleErrors(행 단위 맵)는 카운트·문구에서 제외(문자열 daySchedules 로 안내).
      const messageEntries = Object.entries(validationErrors).filter(
        ([key, val]) => key !== 'dayScheduleErrors' && typeof val === 'string',
      );
      const errorCount = messageEntries.length;
      const firstError = messageEntries[0]?.[1] as string | undefined;
      toast.error(errorCount > 1 ? `입력하지 않은 항목이 ${errorCount}개 있습니다.` : firstError ?? '필수 항목을 입력해주세요.');
      // 첫 번째 에러 필드로 스크롤
      setTimeout(() => {
        const firstErrorEl = formRef.current?.querySelector('[aria-invalid="true"]');
        if (firstErrorEl) {
          firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }
    const serverErrors = await onSubmit(formData);
    if (serverErrors) setErrors(serverErrors);
  };

  const handleDeleteConfirm = async () => {
    setShowDeleteModal(false);
    if (onDelete) await onDelete();
  };

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" noValidate>

        {/* ── SECTION 1: 클래스 기본 정보 ──
              [2026-05-09 v2] 사용자 직접 시각 명세(스크린샷) 적용:
                · 3개 필드(수업 명칭/대상 연령/권장 숙련도) 단일 카드로 wrapping
                · 각 라벨 우측 빨간 별표(*) 필수 표시
                · 카드 스타일: bg-wsurface · radius 18 · border-wline-2 · shadow-sh-1 · p-5
                · 필드 간 spacing: mt-5 (20px) */}
        <AnimatedSection delay={0}>
          <section className="space-y-3">
            <h2 className={ic.head}>
              <span className={ic.headBar} aria-hidden="true" />
              수업 기본 정보
            </h2>

            <div
              className={
                iceTheme
                  ? 'rounded-w-md bg-it-surface dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 p-5'
                  : 'rounded-[18px] bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sh-1 p-5'
              }
            >
              {/* 수업 명칭 */}
              <div>
                <label className={ic.label}>
                  수업 명칭<span className={ic.required} aria-hidden="true">*</span>
                </label>
                <input
                  type="text"
                  value={formData.className}
                  onChange={(e) => handleChange('className', e.target.value)}
                  placeholder="예: 토요일 오전 파워 스케이팅"
                  maxLength={50}
                  className={cn(
                    ic.input,
                    errors.className && 'border-red-400 focus:border-red-400'
                  )}
                  aria-label="수업 명칭"
                  aria-required="true"
                  aria-invalid={!!errors.className}
                  aria-describedby={errors.className ? 'className-error' : undefined}
                />
                {errors.className && (
                  <p id="className-error" className="text-xs text-red-500 mt-1 flex items-center gap-1" role="alert">
                    <Icon name="error" className="text-xs" aria-hidden="true" />
                    {errors.className}
                  </p>
                )}
              </div>

              {/* 대상 연령 — 전체 연령 대상(기본) 토글. 끄면 출생연도 개별 선택 그리드 노출. */}
              <div className="mt-5">
                <label className={ic.label}>
                  대상 연령
                </label>
                <div
                  className={
                    iceTheme
                      ? 'rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-600 bg-it-fill dark:bg-rink-700 px-3.5 py-3'
                      : 'rounded-xl border border-wline-2 dark:border-rink-600 bg-wbg dark:bg-rink-700 px-3.5 py-3'
                  }
                >
                  <Toggle
                    checked={!restrictAge}
                    onChange={(allAges) => {
                      if (allAges) {
                        // 전체 연령 대상 — 개별 출생연도 선택 초기화.
                        setRestrictAge(false);
                        setFormData((prev) => ({
                          ...prev,
                          targetBirthYears: [],
                          ageMin: '',
                          ageMax: '',
                        }));
                      } else {
                        // 개별 선택 모드 진입 — 아래 출생연도 그리드 노출.
                        setRestrictAge(true);
                      }
                    }}
                    label="전체 연령 대상"
                    description={
                      restrictAge
                        ? '아래에서 대상 출생연도를 선택하세요'
                        : '모든 연령이 신청할 수 있어요'
                    }
                  />
                </div>

                {restrictAge && (
                  <>
                    <div
                      className="grid grid-cols-2 gap-2 mt-3"
                      role="group"
                      aria-label="대상 출생연도"
                    >
                      {selectableBirthYears.map((birthYear) => {
                        const checked = isBirthYearChecked(birthYear);
                        return (
                          <button
                            key={birthYear}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => toggleBirthYear(birthYear)}
                            className={cn(
                              'flex items-center gap-2.5 px-3.5 h-12 rounded-w-md border-[1.5px] text-sm font-bold transition-colors motion-reduce:transition-none',
                              iceTheme
                                ? checked
                                  ? 'bg-it-blue-50 border-it-blue-500 text-it-blue-500 dark:bg-it-blue-500/15 dark:border-it-blue-300 dark:text-it-blue-300'
                                  : 'bg-it-fill dark:bg-rink-700 border-it-line-strong dark:border-rink-600 text-it-ink-600 dark:text-rink-200 hover:bg-it-line dark:hover:bg-rink-600'
                                : checked
                                  ? 'bg-ice-100 border-ice-500 text-ice-700 dark:bg-ice-500/15 dark:border-ice-400 dark:text-ice-300'
                                  : 'bg-wbg dark:bg-rink-700 border-wline-2 dark:border-rink-600 text-wtext-2 dark:text-rink-200 hover:bg-wline-2 dark:hover:bg-rink-600'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors motion-reduce:transition-none',
                                iceTheme
                                  ? checked
                                    ? 'bg-it-blue-500 border-it-blue-500 text-white'
                                    : 'bg-it-surface dark:bg-rink-800 border-it-line-strong dark:border-rink-500'
                                  : checked
                                    ? 'bg-ice-500 border-ice-500 text-white'
                                    : 'bg-wsurface dark:bg-rink-800 border-wline-2 dark:border-rink-500'
                              )}
                              aria-hidden="true"
                            >
                              {checked && <Icon name="check" className="text-sm" />}
                            </span>
                            <span>{birthYear}년생</span>
                          </button>
                        );
                      })}
                    </div>
                    {birthYearSummaryLabel && (
                      <p className={cn('mt-2 text-xs font-bold tabular-nums', iceTheme ? 'text-it-blue-500 dark:text-it-blue-300' : 'text-ice-600 dark:text-ice-400')}>
                        {birthYearSummaryLabel}
                      </p>
                    )}
                    <p className={cn('mt-1.5 text-xs', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                      대상 출생연도를 선택해주세요 (복수 선택 가능)
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
        </AnimatedSection>

        {/* [2026-06-09] 오픈클래스 정원 — academy 전용 · 필수. */}
        {isAcademy && (
          <AnimatedSection delay={90}>
            <section className="space-y-4">
              <h2 className={ic.head}>
                <span className={ic.headBar} aria-hidden="true" />
                정원
              </h2>
              <div className={cn(ic.card, 'space-y-2')}>
                <label className={cn('block text-card-meta font-bold uppercase tracking-wider', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                  최대 인원 <span className={iceTheme ? 'text-it-red-500' : 'text-red-500'}>*</span>
                </label>
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-w-md transition-colors',
                  iceTheme
                    ? cn('bg-it-fill dark:bg-rink-900 border-[1.5px]', errors.capacity ? 'border-red-400' : 'border-it-line-strong dark:border-rink-700 focus-within:border-it-blue-500')
                    : cn('bg-wbg dark:bg-rink-900 border', errors.capacity ? 'border-red-400' : 'border-wline dark:border-rink-700 focus-within:border-ice-500')
                )}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.capacity === 0 ? '' : String(formData.capacity)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      handleChange('capacity', raw === '' ? 0 : Math.min(parseInt(raw), 100));
                    }}
                    placeholder="예: 10"
                    className={cn('w-full bg-transparent border-0 p-0 text-sm font-extrabold focus:ring-0 focus:outline-none', iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white')}
                    aria-label="최대 인원"
                    aria-invalid={!!errors.capacity}
                  />
                  <span className={cn('text-xs font-bold shrink-0', iceTheme ? 'text-it-ink-500' : 'text-wtext-3')}>명</span>
                </div>
                {errors.capacity && (
                  <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
                    <Icon name="error" className="text-xs" aria-hidden="true" />
                    {errors.capacity}
                  </p>
                )}
              </div>
            </section>
          </AnimatedSection>
        )}

        {/* ── SECTION 2: 수업 상세 설명 ──
              [2026-06-05] 수업 기본 정보 바로 아래로 이동 (기존 일정·장소 다음 → 위로). */}
        <AnimatedSection delay={100}>
          <section className="space-y-4">
            <h2 className={ic.head}>
              <span className={ic.headBar} aria-hidden="true" />
              수업 상세 설명
            </h2>
            <div className={ic.card}>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="수업에 대한 상세 내용이나 수강생이 알아야 할 주의사항을 입력해 주세요."
                maxLength={500}
                rows={5}
                className={
                  iceTheme
                    ? 'w-full bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 rounded-w-md text-sm min-h-[120px] px-4 py-3 leading-relaxed focus:outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 resize-none text-it-ink-800 dark:text-white placeholder:text-it-ink-400 transition-colors motion-reduce:transition-none'
                    : 'w-full bg-wsurface dark:bg-rink-700 border border-wline-2 dark:border-rink-600 rounded-xl text-sm min-h-[120px] px-4 py-3 leading-relaxed focus:outline-none focus:border-ice-500 focus:ring-1 focus:ring-ice-500/20 resize-none text-wtext-1 dark:text-white placeholder:text-wtext-3'
                }
                aria-label="수업 설명"
              />
            </div>
          </section>
        </AnimatedSection>

        {/* ── SECTION 3: 일정 및 장소 설정 ── */}
        <AnimatedSection delay={200}>
          <section className="space-y-4">
            <h2 className={ic.head}>
              <span className={ic.headBar} aria-hidden="true" />
              일정 및 장소 설정
            </h2>

            {/* [Lifecycle v4.1 §7.1] 1회용 수업(spot) — 팀 수업 전용 하위 옵션.
                · 체크 시 trainingType='spot' + 일정 단일 제한 · 표시상 정규 취급
                · 오픈클래스(isAcademy)는 숨김(lesson 강제) · 수정 모드 읽기 전용(유형 전환 금지) */}
            {!isAcademy && (
              <div>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isSpot}
                  disabled={isEditMode}
                  onClick={() =>
                    setFormData(prev => {
                      const turningOn = prev.trainingType !== 'spot';
                      // [spot 선불 단건] 체크 시 선불 고정, 해제 시 이전 결제방식 복원.
                      //   월 결제 draft 는 지우지 않는다(보존+숨김) — 제출 시 spot 이면 미전송.
                      if (turningOn) prevBillingModeRef.current = prev.billingMode;
                      return {
                        ...prev,
                        trainingType: turningOn ? 'spot' : 'regular',
                        billingMode: turningOn
                          ? 'PREPAID'
                          : (prevBillingModeRef.current ?? 'BOTH'),
                        // 단일 제한 규칙 통일 — 항상 "마지막에 선택한 날짜 1개" 유지 (applyMultiDates 와 동일).
                        dateSchedules: turningOn
                          ? prev.dateSchedules.slice(-1)
                          : prev.dateSchedules,
                      };
                    })
                  }
                  className={cn(
                    'flex items-center gap-2.5 px-3.5 h-12 rounded-w-md border-[1.5px] text-sm font-bold transition-colors motion-reduce:transition-none disabled:opacity-60',
                    iceTheme
                      ? isSpot
                        ? 'bg-it-blue-50 border-it-blue-500 text-it-blue-500 dark:bg-it-blue-500/15 dark:border-it-blue-300 dark:text-it-blue-300'
                        : 'bg-it-fill dark:bg-rink-700 border-it-line-strong dark:border-rink-600 text-it-ink-600 dark:text-rink-200'
                      : isSpot
                        ? 'bg-ice-100 border-ice-500 text-ice-700 dark:bg-ice-500/15 dark:border-ice-400 dark:text-ice-300'
                        : 'bg-wbg dark:bg-rink-700 border-wline-2 dark:border-rink-600 text-wtext-2 dark:text-rink-200'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors motion-reduce:transition-none',
                      isSpot
                        ? iceTheme
                          ? 'bg-it-blue-500 border-it-blue-500 text-white'
                          : 'bg-ice-500 border-ice-500 text-white'
                        : iceTheme
                          ? 'bg-it-surface dark:bg-rink-800 border-it-line-strong dark:border-rink-500'
                          : 'bg-wsurface dark:bg-rink-800 border-wline-2 dark:border-rink-500'
                    )}
                    aria-hidden="true"
                  >
                    {isSpot && <Icon name="check" className="text-sm" />}
                  </span>
                  <span>{MESSAGES.class.spotCheckboxLabel}</span>
                </button>
                {isSpot && (
                  <p className="text-xs text-wtext-3 dark:text-rink-300 mt-1.5">
                    {MESSAGES.class.spotCheckboxHint}
                  </p>
                )}
              </div>
            )}

            {/* [2026-06-30] 요일별 기본 시간·장소(ClassDaySchedule 템플릿) — 선택.
                미리 정해두면 아래 '일정 추가' 시 요일에 맞춰 시간·장소가 자동으로 채워진다.
                단일 일정(spot)은 회차가 1개뿐이라 요일 템플릿이 무의미하므로 숨긴다. */}
            {!isSpot && (
            <div className={cn(ic.card, 'space-y-3')}>
              <div>
                <label className={cn('block text-sm font-bold', iceTheme ? 'text-it-ink-600 dark:text-rink-100' : 'text-wtext-2 dark:text-rink-100')}>
                  {MESSAGES.class.dayDefaults.title}
                  <span className={cn('ml-1.5 text-card-meta font-medium', iceTheme ? 'text-it-ink-400 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                    ({MESSAGES.class.dayDefaults.optional})
                  </span>
                </label>
                <p className={cn('mt-1 text-xs leading-relaxed', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                  {MESSAGES.class.dayDefaults.hint}
                </p>
              </div>

              {/* 요일 토글 (월~일) */}
              <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={MESSAGES.class.dayDefaults.title}>
                {DAY_OPTIONS.map((day) => {
                  const selected = formData.daySchedules.some((s) => s.dayOfWeek === day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDaySchedule(day)}
                      aria-pressed={selected}
                      className={cn(
                        'h-10 rounded-w-md border-[1.5px] text-sm font-bold transition-colors motion-reduce:transition-none active:brightness-95',
                        iceTheme
                          ? selected
                            ? 'bg-it-blue-50 border-it-blue-500 text-it-blue-500 dark:bg-it-blue-500/15 dark:border-it-blue-300 dark:text-it-blue-300'
                            : 'bg-it-fill dark:bg-rink-700 border-it-line-strong dark:border-rink-600 text-it-ink-600 dark:text-rink-200'
                          : selected
                            ? 'bg-ice-100 border-ice-500 text-ice-700 dark:bg-ice-500/15 dark:border-ice-400 dark:text-ice-300'
                            : 'bg-wbg dark:bg-rink-700 border-wline-2 dark:border-rink-600 text-wtext-2 dark:text-rink-200',
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* 선택된 요일별 시간·장소 입력 */}
              {sortedDaySchedules.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {sortedDaySchedules.map((s) => (
                    <li
                      key={s.dayOfWeek}
                      className={
                        iceTheme
                          ? 'rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900/40 p-3 space-y-2'
                          : 'rounded-xl border border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900/40 p-3 space-y-2'
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className={cn('text-card-meta font-extrabold', iceTheme ? 'text-it-blue-500 dark:text-it-blue-300' : 'text-ice-600 dark:text-ice-400')}>
                          {MESSAGES.class.dayDefaults.weekdayLabel(s.dayOfWeek)}
                        </span>
                        <div className="flex items-center gap-1">
                          {sortedDaySchedules.length > 1 && (s.startTime || s.endTime || s.venueId) && (
                            <button
                              type="button"
                              onClick={() => {
                                applyDayScheduleToAll(s.dayOfWeek);
                                toast.success(MESSAGES.class.dayDefaults.appliedToAll);
                              }}
                              className={cn(
                                'rounded-md px-2 py-1 text-card-meta font-bold',
                                iceTheme
                                  ? 'text-it-blue-500 hover:bg-it-blue-50 dark:text-it-blue-300 dark:hover:bg-it-blue-500/10'
                                  : 'text-ice-600 hover:bg-ice-50 dark:text-ice-400 dark:hover:bg-ice-500/10',
                              )}
                              aria-label={MESSAGES.class.dayDefaults.applyToAllAria(s.dayOfWeek)}
                            >
                              {MESSAGES.class.dayDefaults.applyToAll}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleDaySchedule(s.dayOfWeek)}
                            className="rounded-md px-2 py-1 text-card-meta font-bold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                            aria-label={MESSAGES.class.dayDefaults.removeDayAria(s.dayOfWeek)}
                          >
                            {MESSAGES.class.dayDefaults.removeDay}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <TimePicker
                          value={s.startTime}
                          // 시작을 뒤로 옮기면 무효해진 종료는 비운다 — 잘못된 조합을 남기지 않는다.
                          onChange={(time) =>
                            updateDaySchedule(s.dayOfWeek, {
                              startTime: time,
                              ...(s.endTime && s.endTime <= time ? { endTime: '' } : {}),
                            })
                          }
                          startHour={0}
                          defaultHour={9}
                          stepMinutes={SCHEDULE_STEP_MINUTES}
                          placeholder={MESSAGES.class.dayDefaults.startTime}
                          sheetTitle={`${s.dayOfWeek}요일 ${MESSAGES.class.dayDefaults.startTime}`}
                          className={
                            iceTheme
                              ? 'h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500'
                              : 'h-10 px-3 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-sm font-medium text-wtext-1 dark:text-white focus:outline-none focus:border-ice-500'
                          }
                          aria-label={`${s.dayOfWeek}요일 ${MESSAGES.class.dayDefaults.startTime}`}
                        />
                        <TimePicker
                          value={s.endTime}
                          onChange={(time) => updateDaySchedule(s.dayOfWeek, { endTime: time })}
                          // 시작 미입력이면 잠그고, 입력되면 "시작 + 1스텝" 을 하한으로 연다.
                          disabled={!s.startTime}
                          onDisabledClick={() => toast.error(MESSAGES.common.timePicker.startTimeFirst)}
                          minTime={
                            s.startTime
                              ? (addMinutes(s.startTime, SCHEDULE_STEP_MINUTES) ?? undefined)
                              : undefined
                          }
                          // 기본값은 시작의 다음 정시(09:30→10:00) — 하한(시작+1스텝)은 그대로.
                          defaultTime={
                            s.startTime ? (nextFullHour(s.startTime) ?? undefined) : undefined
                          }
                          startHour={0}
                          defaultHour={9}
                          stepMinutes={SCHEDULE_STEP_MINUTES}
                          placeholder={MESSAGES.class.dayDefaults.endTime}
                          sheetTitle={`${s.dayOfWeek}요일 ${MESSAGES.class.dayDefaults.endTime}`}
                          className={
                            iceTheme
                              ? 'h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500'
                              : 'h-10 px-3 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-sm font-medium text-wtext-1 dark:text-white focus:outline-none focus:border-ice-500'
                          }
                          aria-label={`${s.dayOfWeek}요일 ${MESSAGES.class.dayDefaults.endTime}`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setVenueTargetDay(s.dayOfWeek);
                          setVenueSheetOpen(true);
                        }}
                        className={
                          iceTheme
                            ? 'w-full flex items-center gap-2 h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-left text-it-ink-800 dark:text-white hover:border-it-blue-500/40 transition-colors motion-reduce:transition-none'
                            : 'w-full flex items-center gap-2 h-10 px-3 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-sm font-medium text-left text-wtext-1 dark:text-white hover:border-ice-500/40 transition-colors'
                        }
                        aria-label={`${s.dayOfWeek}요일 ${MESSAGES.class.dayDefaults.venueSelect}`}
                      >
                        <Icon name="location_on" className={cn('text-base', iceTheme ? 'text-it-ink-400' : 'text-wtext-3')} aria-hidden="true" />
                        <span className={s.venueName ? '' : iceTheme ? 'text-it-ink-400' : 'text-wtext-3'}>
                          {s.venueName || MESSAGES.class.dayDefaults.venueSelect}
                        </span>
                        <Icon name="chevron_right" className={cn('text-base ml-auto', iceTheme ? 'text-it-ink-300' : 'text-wtext-4')} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            )}

            {/* [2026-06-09] 미니달력 날짜별 일정(날짜·시간·장소). 요일 토글 대체. */}
            {(
              <div className={cn(ic.card, 'space-y-3')}>
                <label className={cn('block text-sm font-bold', iceTheme ? 'text-it-ink-600 dark:text-rink-100' : 'text-wtext-2 dark:text-rink-100')}>
                  수업 일정
                </label>
                {/* 날짜 추가 액션 그룹 — 주:정규 요일로 이번 달 채우기(①입력 시), 보조:날짜 직접 추가(예외/불규칙). */}
                <div className="flex flex-col gap-2">
                  {!isSpot && activeDayDefaults.length > 0 && (
                    <button
                      type="button"
                      onClick={handleFillThisMonth}
                      disabled={thisMonthFillCount === 0}
                      className={
                        iceTheme
                          ? 'flex h-11 w-full items-center justify-center gap-1.5 rounded-w-md bg-it-blue-500 text-white text-sm font-bold hover:bg-it-blue-600 transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed'
                          : 'flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-ice-500 text-white text-sm font-bold hover:bg-ice-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
                      }
                    >
                      <Icon name="calendar_month" className="text-base" aria-hidden="true" />
                      {thisMonthFillCount > 0
                        ? MESSAGES.class.rangeGen.fillThisMonthCount(thisMonthFillCount)
                        : MESSAGES.class.rangeGen.fillThisMonth}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMultiDateOpen(true)}
                    // spot(1회용) — 지난 회차가 있으면 이미 1개 제한 소진(지난 회차는 교체 불가) → 추가 차단.
                    disabled={isSpot && pastSchedules.length > 0}
                    className={
                      iceTheme
                        ? 'flex h-10 w-full items-center justify-center gap-1.5 rounded-w-md border border-dashed border-it-blue-500/50 text-sm font-bold text-it-blue-500 hover:bg-it-blue-500/[0.06] transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent'
                        : 'flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-ice-500/50 text-sm font-bold text-ice-500 hover:bg-ice-500/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent'
                    }
                  >
                    <Icon name="calendar_month" className="text-base" aria-hidden="true" />
                    {MESSAGES.class.scheduleAddSingle}
                  </button>
                  {isSpot && pastSchedules.length > 0 && (
                    <p className={cn('text-xs px-1', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')} role="status">
                      {MESSAGES.class.spotSingleScheduleLimit}
                    </p>
                  )}
                </div>
                {/* 지난 회차 — 읽기 전용 잠금(기본 접힘). 수정·삭제 버튼 미노출. */}
                {pastSchedules.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowPastSchedules((v) => !v)}
                      aria-expanded={showPastSchedules}
                      className={cn(
                        'flex items-center gap-1.5 text-xs font-bold px-1 py-1',
                        iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
                      )}
                    >
                      <Icon
                        name="expand_more"
                        className={cn('text-base transition-transform motion-reduce:transition-none', showPastSchedules && 'rotate-180')}
                        aria-hidden="true"
                      />
                      {showPastSchedules
                        ? MESSAGES.class.pastSchedulesHide
                        : MESSAGES.class.pastSchedulesShow(pastSchedules.length)}
                    </button>
                    {showPastSchedules && (
                      <>
                        <ul
                          className="mt-1 flex flex-col gap-2"
                          aria-label={`지난 일정 ${pastSchedules.length}건 (읽기 전용)`}
                        >
                          {pastSchedules.map((s) => {
                            const timeLabel = s.startTime
                              ? `${s.startTime}${s.endTime ? `-${s.endTime}` : ''}`
                              : MESSAGES.class.dayDefaults.timeUndecided;
                            const dateLabel = `${s.date.slice(5).replace('-', '/')}(${getKoreanWeekday(s.date)})`;
                            return (
                              <li
                                key={s.key}
                                className={cn(
                                  'flex items-center gap-2 px-3 py-2.5 opacity-55',
                                  iceTheme
                                    ? 'rounded-w-md border-[1.5px] border-it-line dark:border-rink-700 bg-it-fill dark:bg-rink-900/40'
                                    : 'rounded-xl border border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900/40',
                                )}
                              >
                                <span className={cn('text-sm font-bold tabular-nums shrink-0', iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white')}>
                                  {dateLabel}
                                </span>
                                <div className="flex flex-1 flex-col min-w-0">
                                  <span className={cn('text-card-meta font-medium tabular-nums truncate', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                                    {timeLabel}
                                  </span>
                                  {s.venueName && (
                                    <span className={cn('flex items-center gap-1 mt-0.5 min-w-0 text-card-meta font-medium', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                                      <Icon name="location_on" className="text-sm shrink-0" aria-hidden="true" />
                                      <span className="truncate">{s.venueName}</span>
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        <p className={cn('mt-1 text-xs px-1', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                          {MESSAGES.class.pastSchedulesLockedHint}
                        </p>
                      </>
                    )}
                  </div>
                )}
                {editableSchedules.length === 0 ? (
                  <p className={cn('text-xs px-1 py-1', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                    위 버튼으로 일정을 추가하고 날짜·시간·장소를 지정하세요.
                  </p>
                ) : (
                  // [2026-06-30] 한 줄 압축 + 아코디언 — 탭하면 해당 회차만 개별 수정 펼침.
                  <ul className="flex flex-col gap-2">
                    {editableSchedules.map((s, idx) => {
                      const expanded = expandedDateKey === s.key;
                      const timeLabel = s.startTime
                        ? `${s.startTime}${s.endTime ? `-${s.endTime}` : ''}`
                        : MESSAGES.class.dayDefaults.timeUndecided;
                      const dateLabel = s.date
                        ? `${s.date.slice(5).replace('-', '/')}(${getKoreanWeekday(s.date)})`
                        : MESSAGES.class.dayDefaults.dateUndecided;
                      return (
                        <li
                          key={s.key}
                          className={
                            iceTheme
                              ? 'rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900/40 overflow-hidden'
                              : 'rounded-xl border border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900/40 overflow-hidden'
                          }
                        >
                          {/* 한 줄 요약 — 탭하면 개별 수정 패널 펼침 */}
                          <div className="flex items-center gap-2 pl-3 pr-2 py-2.5">
                            <button
                              type="button"
                              onClick={() => setExpandedDateKey(expanded ? null : s.key)}
                              aria-expanded={expanded}
                              className="flex flex-1 items-center gap-2 min-w-0 text-left"
                            >
                              <span className={cn('text-card-meta font-extrabold shrink-0 tabular-nums', iceTheme ? 'text-it-blue-500 dark:text-it-blue-300' : 'text-ice-600 dark:text-ice-400')}>
                                {idx + 1}
                              </span>
                              <span className={cn('text-sm font-bold tabular-nums shrink-0', iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white')}>
                                {dateLabel}
                              </span>
                              <span className="flex flex-1 flex-col min-w-0">
                                <span className={cn('text-card-meta font-medium tabular-nums truncate', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                                  {timeLabel}
                                </span>
                                {s.venueName && (
                                  <span className={cn('flex items-center gap-1 mt-0.5 min-w-0 text-card-meta font-medium', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                                    <Icon name="location_on" className="text-sm shrink-0" aria-hidden="true" />
                                    <span className="truncate">{s.venueName}</span>
                                  </span>
                                )}
                              </span>
                              <Icon
                                name="expand_more"
                                className={cn('text-base ml-auto shrink-0 transition-transform motion-reduce:transition-none', expanded && 'rotate-180', iceTheme ? 'text-it-ink-400' : 'text-wtext-3')}
                                aria-hidden="true"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                removeDateSchedule(s.key);
                                if (expanded) setExpandedDateKey(null);
                              }}
                              className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 shrink-0"
                              aria-label={`${idx + 1}회차 삭제`}
                            >
                              <Icon name="delete_outline" className="text-lg" aria-hidden="true" />
                            </button>
                          </div>

                          {/* 개별 수정 패널 */}
                          {expanded && (
                            <div className={cn('px-3 pb-3 space-y-2 border-t', iceTheme ? 'border-it-line dark:border-rink-700' : 'border-wline-2 dark:border-rink-700')}>
                              <input
                                type="date"
                                value={s.date}
                                // 지난 날짜로 변경 금지 — 잠금 그룹으로 빠져 수정 불가·payload 제외되는 것 방지.
                                min={todayISO}
                                onChange={(e) => updateDateSchedule(s.key, { date: e.target.value })}
                                className={
                                  iceTheme
                                    ? 'mt-2 w-full h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500'
                                    : 'mt-2 w-full h-10 px-3 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-sm font-medium text-wtext-1 dark:text-white focus:outline-none focus:border-ice-500'
                                }
                                aria-label={`${idx + 1}회차 날짜`}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <TimePicker
                                  value={s.startTime}
                                  // 시작을 뒤로 옮기면 무효해진 종료는 비운다.
                                  onChange={(time) =>
                                    updateDateSchedule(s.key, {
                                      startTime: time,
                                      ...(s.endTime && s.endTime <= time ? { endTime: '' } : {}),
                                    })
                                  }
                                  startHour={0}
                                  defaultHour={9}
                                  stepMinutes={SCHEDULE_STEP_MINUTES}
                                  placeholder={MESSAGES.class.dayDefaults.startTime}
                                  sheetTitle={`${idx + 1}회차 시작 시간`}
                                  className={
                                    iceTheme
                                      ? 'h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500'
                                      : 'h-10 px-3 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-sm font-medium text-wtext-1 dark:text-white focus:outline-none focus:border-ice-500'
                                  }
                                  aria-label={`${idx + 1}회차 시작 시간`}
                                />
                                <TimePicker
                                  value={s.endTime}
                                  onChange={(time) => updateDateSchedule(s.key, { endTime: time })}
                                  disabled={!s.startTime}
                                  onDisabledClick={() => toast.error(MESSAGES.common.timePicker.startTimeFirst)}
                                  minTime={
                                    s.startTime
                                      ? (addMinutes(s.startTime, SCHEDULE_STEP_MINUTES) ?? undefined)
                                      : undefined
                                  }
                                  defaultTime={
                                    s.startTime ? (nextFullHour(s.startTime) ?? undefined) : undefined
                                  }
                                  startHour={0}
                                  defaultHour={9}
                                  stepMinutes={SCHEDULE_STEP_MINUTES}
                                  placeholder={MESSAGES.class.dayDefaults.endTime}
                                  sheetTitle={`${idx + 1}회차 종료 시간`}
                                  className={
                                    iceTheme
                                      ? 'h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500'
                                      : 'h-10 px-3 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-sm font-medium text-wtext-1 dark:text-white focus:outline-none focus:border-ice-500'
                                  }
                                  aria-label={`${idx + 1}회차 종료 시간`}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setVenueTargetDateKey(s.key);
                                  setVenueSheetOpen(true);
                                }}
                                className={
                                  iceTheme
                                    ? 'w-full flex items-center gap-2 h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-left text-it-ink-800 dark:text-white hover:border-it-blue-500/40 transition-colors motion-reduce:transition-none'
                                    : 'w-full flex items-center gap-2 h-10 px-3 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-sm font-medium text-left text-wtext-1 dark:text-white hover:border-ice-500/40 transition-colors'
                                }
                                aria-label={`${idx + 1}회차 장소 선택`}
                              >
                                <Icon name="location_on" className={cn('text-base', iceTheme ? 'text-it-ink-400' : 'text-wtext-3')} aria-hidden="true" />
                                <span className={s.venueName ? '' : iceTheme ? 'text-it-ink-400' : 'text-wtext-3'}>
                                  {s.venueName || '장소 선택'}
                                </span>
                                <Icon name="chevron_right" className={cn('text-base ml-auto', iceTheme ? 'text-it-ink-300' : 'text-wtext-4')} aria-hidden="true" />
                              </button>
                              {formData.dateSchedules.length > 1 &&
                                (s.startTime || s.endTime || s.venueId) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      applyDateScheduleToAll(s.key);
                                      toast.success(MESSAGES.class.dayDefaults.appliedToAllDates);
                                    }}
                                    className={cn(
                                      'self-start rounded-md px-2 py-1 text-card-meta font-bold',
                                      iceTheme
                                        ? 'text-it-blue-500 hover:bg-it-blue-50 dark:text-it-blue-300 dark:hover:bg-it-blue-500/10'
                                        : 'text-ice-600 hover:bg-ice-50 dark:text-ice-400 dark:hover:bg-ice-500/10',
                                    )}
                                    aria-label={MESSAGES.class.dayDefaults.applyToAllDatesAria(idx + 1)}
                                  >
                                    {MESSAGES.class.dayDefaults.applyToAllDates}
                                  </button>
                                )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {errors.dateSchedules && (
                  <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
                    <Icon name="error_outline" className="text-xs" aria-hidden="true" />
                    {errors.dateSchedules}
                  </p>
                )}
              </div>
            )}


            {/* 훈련 장소 BottomSheet */}
            {/* 훈련 장소 선택 — 공용 VenueSearchSheet (FK 전용: 자유 텍스트 [적용] 미노출) */}
            <VenueSearchSheet
              isOpen={venueSheetOpen}
              onClose={closeVenueSheet}
              title={venueTargetDay ? `${venueTargetDay}요일 장소 선택` : '훈련 장소 선택'}
              selectedVenueId={
                venueTargetDateKey
                  ? formData.dateSchedules.find((s) => s.key === venueTargetDateKey)?.venueId
                  : venueTargetDay
                    ? formData.daySchedules.find((s) => s.dayOfWeek === venueTargetDay)?.venueId
                    : formData.venueId
              }
              initialQuery={
                (venueTargetDateKey
                  ? formData.dateSchedules.find((s) => s.key === venueTargetDateKey)?.venueName
                  : venueTargetDay
                    ? formData.daySchedules.find((s) => s.dayOfWeek === venueTargetDay)?.venueName
                    : formData.venue) ?? ''
              }
              iceTheme={iceTheme}
              onSelectVenue={(v) => handleVenueSelect(v.id, v.name, v.address ?? '')}
            />
          </section>
        </AnimatedSection>

        {/* ── SECTION 3.5: 수업 지역 ──
            [2026-08-04] 사용자 지시: "서울에서 하는 수업을 부산 학부모가 신청하면 매주 올라오겠다는 소리"
            → 감독/코치가 등록 시 시/도 + 시군구를 직접 고르고, 목록 카드에 그대로 표시한다.
            장소(Venue)에 의존하지 않는 이유: Class.venueId 가 nullable 이라 커버리지가 낮고,
            Venue 에는 시군구 필드 자체가 없다.
            CLASS_REGION_DISABLED — 현재 미노출(SHOW_CLASS_REGION_SECTION=false).
            전국 노출 중단으로 위 근거가 사라졌고 목록 표시도 제거돼 소비처가 상세 1곳만 남았다.
            폼 상태·BottomSheet·검증은 삭제하지 않았다 — 플래그만 되돌리면 그대로 동작한다. */}
        {SHOW_CLASS_REGION_SECTION && (
        <AnimatedSection delay={290}>
          <section className="space-y-4">
            <h2 className={ic.head}>
              <span className={ic.headBar} aria-hidden="true" />
              {MESSAGES.class.region.sectionTitle}
              <span className={ic.required} aria-hidden="true">*</span>
            </h2>
            <div className={cn(ic.card, 'space-y-4')}>
              <p className={cn('text-card-meta leading-relaxed font-medium', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                {MESSAGES.class.region.sectionHint}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="class-region-city" className={ic.label}>
                    {MESSAGES.class.region.cityLabel}
                    <span className={ic.required}>*</span>
                  </label>
                  <button
                    type="button"
                    id="class-region-city"
                    onClick={() => setRegionCitySheetOpen(true)}
                    aria-haspopup="dialog"
                    className={cn(ic.input, 'flex items-center justify-between gap-2 text-left')}
                  >
                    <span
                      className={cn(
                        'truncate',
                        !formData.regionCity && (iceTheme ? 'text-it-ink-400' : 'text-wtext-3'),
                      )}
                    >
                      {formData.regionCity || MESSAGES.class.region.cityPlaceholder}
                    </span>
                    <Icon
                      name="expand_more"
                      className={cn(
                        'shrink-0 text-[20px]',
                        iceTheme ? 'text-it-ink-400 dark:text-it-ink-300' : 'text-wtext-3 dark:text-rink-300',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                <div>
                  <label htmlFor="class-region-district" className={ic.label}>
                    {MESSAGES.class.region.districtLabel}
                    <span className={ic.required}>*</span>
                  </label>
                  <button
                    type="button"
                    id="class-region-district"
                    disabled={!formData.regionCity}
                    onClick={() => setRegionDistrictSheetOpen(true)}
                    aria-haspopup="dialog"
                    className={cn(
                      ic.input,
                      'flex items-center justify-between gap-2 text-left',
                      !formData.regionCity && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <span
                      className={cn(
                        'truncate',
                        !formData.regionDistrict && (iceTheme ? 'text-it-ink-400' : 'text-wtext-3'),
                      )}
                    >
                      {/* 시/도 미선택 상태도 같은 문구를 쓴다 — 별도 안내문("시/도를 먼저…")은
                          좁은 2열 칸에서 잘려 읽히지 않았고, 비활성 여부는 opacity·disabled 로
                          이미 드러난다. */}
                      {formData.regionDistrict ||
                        MESSAGES.class.region.districtPlaceholder}
                    </span>
                    <Icon
                      name="expand_more"
                      className={cn(
                        'shrink-0 text-[20px]',
                        iceTheme ? 'text-it-ink-400 dark:text-it-ink-300' : 'text-wtext-3 dark:text-rink-300',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>

              <BottomSheetSelector
                isOpen={regionCitySheetOpen}
                title={MESSAGES.class.region.cityPlaceholder}
                items={REGIONS.map((r) => ({
                  id: r,
                  name: r,
                  selected: formData.regionCity === r,
                }))}
                onSelect={(city) => {
                  // 시/도가 바뀌면 시군구는 반드시 초기화한다 —
                  //   남겨두면 "부산 강남구" 같은 불가능한 조합이 저장 요청으로 나간다.
                  setFormData((prev) => ({
                    ...prev,
                    regionCity: city,
                    regionDistrict: '',
                  }));
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.regionCity;
                    return next;
                  });
                  setRegionCitySheetOpen(false);
                }}
                onClose={() => setRegionCitySheetOpen(false)}
              />

              <BottomSheetSelector
                isOpen={regionDistrictSheetOpen}
                title={MESSAGES.class.region.districtPlaceholder}
                items={districtsOf(formData.regionCity).map((d) => ({
                  id: d,
                  name: d,
                  selected: formData.regionDistrict === d,
                }))}
                onSelect={(district) => {
                  handleChange('regionDistrict', district);
                  setRegionDistrictSheetOpen(false);
                }}
                onClose={() => setRegionDistrictSheetOpen(false)}
              />

              {(errors.regionCity || errors.regionDistrict) && (
                <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
                  <Icon name="error" className="text-xs" aria-hidden="true" />
                  {errors.regionCity ?? errors.regionDistrict}
                </p>
              )}
            </div>
          </section>
        </AnimatedSection>
        )}

        {/* ── SECTION 4: 수강료 ──
            [2026-06] '디렉터 전용 설정' + '수업 패키지' 영역 통합. 동일 ClassProduct 도메인이므로
            한 자리에서 관리한다.
              · create 모드 → 아래 1회권 수강료 입력 (생성 시 ClassProduct PER_SESSION 1개 생성)
              · edit  모드 → pricingSection(PackageManageSection) 임베드 — 전체 패키지 CRUD */}
        <AnimatedSection delay={300}>
          <section className="space-y-4">
            {mode === 'create' ? (
              <>
                <h2 className={ic.head}>
                  <span className={ic.headBar} aria-hidden="true" />
                  {MESSAGES.classProduct.feeSectionTitle}
                </h2>
                <div className={cn(ic.card, 'space-y-6')}>
                  <div className="grid grid-cols-2 gap-4">
                    {/* [Phase B-5] 결제 방식 — 선불/후불 (팀·오픈 공통) */}
                    <div className="col-span-2 space-y-2">
                      <label className={cn('block text-card-meta font-bold uppercase tracking-wider', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                        {MESSAGES.classProduct.billingModeLabel}
                      </label>
                      {/* [spot 선불 단건] 1회용은 선택 숨김 — 선불 단건 고정 안내로 대체. */}
                      {isSpot ? (
                        <p className={cn('text-card-caption font-medium', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                          {MESSAGES.classProduct.spotSingleNotice}
                        </p>
                      ) : (
                      <>
                      <div className="grid grid-cols-3 gap-2">
                        {(['PREPAID', 'POSTPAID', 'BOTH'] as const).map((bm) => {
                          const active = formData.billingMode === bm;
                          const label =
                            bm === 'PREPAID'
                              ? MESSAGES.classProduct.billingModePrepaid
                              : bm === 'POSTPAID'
                                ? MESSAGES.classProduct.billingModePostpaid
                                : MESSAGES.classProduct.billingModeBoth;
                          return (
                            <button
                              key={bm}
                              type="button"
                              onClick={() => {
                                handleChange('billingMode', bm);
                                // 후불 전환 시 담아둔 정기권 draft 제거 — 후불 전용은 1회 수업료만 운영.
                                //   선택형(BOTH)은 정액 패키지를 함께 운영하므로 유지.
                                if (bm === 'POSTPAID') onPackageDraftChange?.([]);
                              }}
                              aria-pressed={active}
                              className={cn(
                                'h-11 rounded-w-md border-[1.5px] text-sm font-bold transition-colors motion-reduce:transition-none',
                                iceTheme
                                  ? active
                                    ? 'border-it-blue-500 bg-it-blue-50 text-it-blue-500 dark:bg-rink-700 dark:text-it-blue-300 dark:border-it-blue-500'
                                    : 'border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-it-ink-600 dark:text-rink-200'
                                  : active
                                    ? 'border-ice-500 bg-ice-50 text-ice-600 dark:bg-rink-700 dark:text-ice-400 dark:border-ice-500'
                                    : 'border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-2 dark:text-rink-200',
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <p className={cn('text-card-caption', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                        {formData.billingMode === 'PREPAID'
                          ? MESSAGES.classProduct.billingModePrepaidHint
                          : formData.billingMode === 'POSTPAID'
                            ? MESSAGES.classProduct.billingModePostpaidHint
                            : MESSAGES.classProduct.billingModeBothHint}
                      </p>
                      </>
                      )}
                      {/* [가격 잠금 §3-3] 제출 전 고지 — 등록 제출 즉시 선불 첫 월분 확정
                          (A안, 결제 여부 무관). 후불 전용은 선불 월분이 없어 미노출.
                          text-card-caption 은 미정의 유령 클래스(상속 크기)라 실존 토큰 사용. */}
                      {formData.billingMode !== 'POSTPAID' && (
                        <p
                          role="note"
                          className={cn('text-card-meta', iceTheme ? 'text-it-ink-400 dark:text-rink-300' : 'text-wtext-4 dark:text-rink-300')}
                        >
                          {MESSAGES.classProduct.saleStartNotice}
                        </p>
                      )}
                    </div>

                    {/* 1회 수강권 — 필수 (팀·오픈 공통) */}
                    <div className="col-span-2 space-y-2">
                          <label className={cn('block text-card-meta font-bold uppercase tracking-wider', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                            {/* [Phase B-6] 선불 전용은 참고·판매 안 함 라벨, 후불·선택형은 판매되는 1회 수업료.
                                [spot 선불 단건] 1회용은 이 금액이 실제 판매가 — 참고 라벨 제외. */}
                            {formData.billingMode === 'PREPAID' && !isSpot
                              ? MESSAGES.classProduct.singlePriceRefLabel
                              : MESSAGES.classProduct.feePerSessionLabel}{' '}
                            <span className={iceTheme ? 'text-it-red-500' : 'text-red-500'}>*</span>
                          </label>
                          <div className={cn(
                            'flex items-center gap-2 px-3 py-2.5 rounded-w-md transition-colors',
                            iceTheme
                              ? cn('bg-it-fill dark:bg-rink-900 border-[1.5px]', errors.singlePrice ? 'border-red-400' : 'border-it-line-strong dark:border-rink-700 focus-within:border-it-blue-500')
                              : cn('bg-wbg dark:bg-rink-900 border', errors.singlePrice ? 'border-red-400' : 'border-wline dark:border-rink-700 focus-within:border-ice-500')
                          )}>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formData.singlePrice === '' ? '' : Number(formData.singlePrice).toLocaleString('ko-KR')}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                if (raw === '') { handleChange('singlePrice', ''); return; }
                                const num = Math.min(parseInt(raw), 10000000);
                                handleChange('singlePrice', num);
                              }}
                              placeholder={MESSAGES.classProduct.singlePricePlaceholder}
                              className={cn('w-full bg-transparent border-0 p-0 text-sm font-extrabold focus:ring-0 focus:outline-none placeholder:font-light placeholder:italic', iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white')}
                              aria-label={
                                formData.billingMode === 'POSTPAID'
                                  ? MESSAGES.classProduct.feePerSessionLabel
                                  : MESSAGES.classProduct.singlePriceLabel
                              }
                              aria-invalid={!!errors.singlePrice}
                            />
                            <span className={cn('text-xs font-bold shrink-0', iceTheme ? 'text-it-ink-500' : 'text-wtext-3')}>원</span>
                          </div>
                          {/* [Phase B-6] 선불 전용 — 1회 수업료는 참고용(판매 안 함) 안내.
                              [spot 선불 단건] 1회용은 판매가라 제외 — 상단 spotSingleNotice 가 안내를 대신한다. */}
                          {formData.billingMode === 'PREPAID' && !isSpot && (
                            <p className={cn('text-card-caption', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                              {MESSAGES.classProduct.singlePriceRefHint}
                            </p>
                          )}
                          {errors.singlePrice && (
                            <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
                              <Icon name="error" className="text-xs" aria-hidden="true" />
                              {errors.singlePrice}
                            </p>
                          )}
                          {/* 총 수업료 자동 계산 — 1회권 수강료 × 등록한 회차 수.
                              회차(일정)가 있을 때만 노출. 회차 미입력 시 영역 숨김. */}
                          {formData.singlePrice !== '' &&
                            Number(formData.singlePrice) > 0 &&
                            formData.dateSchedules.length > 0 && (
                              <div className={cn('mt-2 rounded-w-md border px-3 py-2', iceTheme ? 'border-it-blue-100 dark:border-rink-700 bg-it-blue-50 dark:bg-rink-700/40' : 'border-ice-100 dark:border-rink-700 bg-ice-50 dark:bg-rink-700/40')}>
                                <div className="flex items-center justify-between">
                                  <span className={cn('text-card-meta font-bold', iceTheme ? 'text-it-ink-600 dark:text-rink-100' : 'text-wtext-2 dark:text-rink-100')}>
                                    {MESSAGES.classProduct.allSessionsRefTitle}
                                  </span>
                                  <span className={cn('text-sm font-extrabold tabular-nums', iceTheme ? 'text-it-blue-500 dark:text-it-blue-300' : 'text-ice-600 dark:text-ice-400')}>
                                    {(
                                      Number(formData.singlePrice) *
                                      formData.dateSchedules.length
                                    ).toLocaleString('ko-KR')}
                                    원
                                  </span>
                                </div>
                                <p className={cn('mt-0.5 text-card-caption tabular-nums', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                                  1회권 {Number(formData.singlePrice).toLocaleString('ko-KR')}원 ×{' '}
                                  {formData.dateSchedules.length}회차
                                </p>
                              </div>
                            )}
                        </div>
                        {/* [2026-06-18] '정기권·다중 패키지' 안내 문구 삭제 (사용자 직접 지시) */}
                  </div>
                  {/* [2026-06-22] 등록 시 추가 패키지(정기권 등) — 수강료 카드 안에 통합. 선불 한정.
                      1회권은 위 1회 수강료 입력으로 자동 생성되고, 여기서 추가하는 신규 패키지는
                      PackageEditSheet 설계상 항상 정기권(MONTHLY_FIXED)이라 1회권과 중복되지 않는다.
                      저장 시 부모(create/page)가 수업 생성 후 bulk 로 일괄 반영한다. */}
                  {/* [Phase B-6] 정액 패키지 — 선불·선택형에서 노출(후불 전용은 1회 수업료만).
                      [spot 선불 단건] 1회용은 숨김 — draft 는 보존(체크 해제 시 복원)·제출 시 미전송. */}
                  {!isSpot &&
                    (formData.billingMode === 'PREPAID' ||
                      formData.billingMode === 'BOTH') &&
                    onPackageDraftChange && (
                    <div className={cn('pt-4 border-t space-y-3', iceTheme ? 'border-it-line dark:border-rink-700' : 'border-wline-2 dark:border-rink-700')}>
                      <p className={cn('text-card-meta font-bold uppercase tracking-wider', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                        {MESSAGES.classProduct.embedSectionLabel}
                      </p>
                      {/* [Phase B-6] 정액 패키지 ≥1 미충족 시 검증 에러 표시. */}
                      {errors.packages && (
                        <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
                          <Icon name="error" className="text-xs" aria-hidden="true" />
                          {errors.packages}
                        </p>
                      )}
                      <PackageManageSection
                        mode="deferred"
                        variant="embed"
                        excludePerSession
                        value={packageDraftValue ?? []}
                        onChange={onPackageDraftChange}
                        dirty={packageDirty}
                        billingMode={formData.billingMode}
                        priceContext={createPriceContext}
                        iceTheme={iceTheme}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              // edit 모드 — 통합된 수강료/패키지 관리(PackageManageSection 자체 헤더 포함).
              //   [2026-06-29] 선불·선택형 정액 패키지 ≥1 미충족 시 검증 에러 인라인 표시(저장 차단과 짝).
              <>
                {errors.packages && (
                  <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
                    <Icon name="error" className="text-xs" aria-hidden="true" />
                    {errors.packages}
                  </p>
                )}
                {typeof pricingSection === 'function'
                  ? pricingSection({
                      renewalTargetMonth,
                      salesPending,
                      scheduleDates: scheduleDatesForCalc,
                    })
                  : pricingSection}
              </>
            )}
          </section>
        </AnimatedSection>

        {/* ── SECTION 4.5: 공개 범위 ──
            [2026-08-04] 수업 단위 공개범위 신설. 기존 "노출 팀 선택"(2026-06-29 폐지)을
            SELECTED_TEAMS 옵션으로 흡수해 팀 수업·오픈클래스 공통으로 노출한다.
            SoT: docs/Planning/SPEC_CLASS_VISIBILITY.md
            CLASS_VISIBILITY_DISABLED — 현재 미노출(SHOW_VISIBILITY_SECTION=false). */}
        {SHOW_VISIBILITY_SECTION && (
        <AnimatedSection delay={325}>
          <section className="space-y-4">
            <h2 className={ic.head}>
              <span className={ic.headBar} aria-hidden="true" />
              {MESSAGES.class.visibility.sectionTitle}
            </h2>
            <div className={cn(ic.card, 'space-y-3')}>
              <p className={cn('text-card-meta leading-relaxed font-medium', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                {MESSAGES.class.visibility.sectionHint}
              </p>

              <div role="radiogroup" aria-label={MESSAGES.class.visibility.sectionTitle} className="space-y-2">
                {buildVisibilityOptions().map(opt => {
                  const selected = formData.visibility === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => handleChange('visibility', opt.value)}
                      className={cn(
                        'w-full flex items-start gap-3 p-3.5 rounded-w-md text-left transition-colors motion-reduce:transition-none active:brightness-95',
                        iceTheme
                          ? selected
                            ? 'bg-it-blue-500/5 border-2 border-it-blue-500'
                            : 'bg-it-fill dark:bg-rink-900/50 border-[1.5px] border-it-line-strong dark:border-rink-700 hover:border-it-blue-500/30'
                          : selected
                            ? 'bg-ice-500/5 border-2 border-ice-500'
                            : 'bg-wbg dark:bg-rink-900/50 border border-wline-2 dark:border-rink-700 hover:border-ice-500/30',
                      )}
                    >
                      <span
                        className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors motion-reduce:transition-none',
                          iceTheme
                            ? selected ? 'border-it-blue-500' : 'border-it-line-strong dark:border-rink-500'
                            : selected ? 'border-ice-500' : 'border-wline dark:border-rink-500',
                        )}
                      >
                        {selected && (
                          <span className={cn('w-2.5 h-2.5 rounded-full', iceTheme ? 'bg-it-blue-500' : 'bg-ice-500')} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className={cn(
                          'block text-card-body font-bold',
                          selected
                            ? (iceTheme ? 'text-it-blue-500' : 'text-ice-500')
                            : (iceTheme ? 'text-it-ink-600 dark:text-rink-100' : 'text-wtext-1 dark:text-rink-100'),
                        )}>
                          {opt.label}
                        </span>
                        <span className={cn('block text-card-meta font-medium mt-0.5', iceTheme ? 'text-it-ink-400 dark:text-rink-400' : 'text-wtext-3 dark:text-rink-400')}>
                          {opt.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {errors.visibility && (
                <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
                  <Icon name="error" className="text-xs" aria-hidden="true" />
                  {errors.visibility}
                </p>
              )}
            </div>
          </section>
        </AnimatedSection>
        )}

        {/* ── SECTION 4.6: 노출 팀 선택 — visibility='SELECTED_TEAMS' 일 때만 ──
            CLASS_VISIBILITY_DISABLED — 4.5 미노출로 SELECTED_TEAMS 선택 경로가 없어 도달 불가. */}
        {SHOW_VISIBILITY_SECTION && formData.visibility === 'SELECTED_TEAMS' && (
          <AnimatedSection delay={330}>
            <section className="space-y-4">
              <h2 className={ic.head}>
                <span className={ic.headBar} aria-hidden="true" />
                {MESSAGES.class.visibility.selectTeamsButton}
                {formData.selectedVisibleTeams.length > 0 && (
                  <span className={iceTheme ? 'text-it-blue-500' : 'text-ice-500'}>
                    ({MESSAGES.class.visibility.selectedTeamsCount(formData.selectedVisibleTeams.length)})
                  </span>
                )}
              </h2>
              <div className={cn(ic.card, 'space-y-3')}>
                <p className={cn('text-card-meta leading-relaxed font-medium', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                  {MESSAGES.class.visibility.selectedTeamsHint}
                </p>
                {isTeamsLoading ? (
                  <div className="py-6 text-center text-sm text-wtext-3 dark:text-rink-300">
                    팀 목록을 불러오는 중...
                  </div>
                ) : selectableTeams.length === 0 ? (
                  <div className="py-6 text-center text-sm text-wtext-3 dark:text-rink-300">
                    등록된 팀이 없습니다.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectableTeams.map(team => {
                      const selected = formData.selectedVisibleTeams.some(t => t.id === team.id);
                      return (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => handleVisibleTeamToggle(team)}
                          aria-pressed={selected}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-2 rounded-w-md text-card-body font-bold transition-colors motion-reduce:transition-none active:brightness-95',
                            iceTheme
                              ? selected
                                ? 'bg-it-blue-500/5 border-2 border-it-blue-500 text-it-blue-500'
                                : 'bg-it-fill dark:bg-rink-900/50 border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-rink-200 hover:border-it-blue-500/30'
                              : selected
                                ? 'bg-ice-500/5 border-2 border-ice-500 text-ice-500'
                                : 'bg-wbg dark:bg-rink-900/50 border border-wline-2 dark:border-rink-700 text-wtext-2 dark:text-rink-200 hover:border-ice-500/30',
                          )}
                        >
                          <span
                            className={cn(
                              'w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors motion-reduce:transition-none',
                              iceTheme
                                ? selected ? 'bg-it-blue-500 border-it-blue-500' : 'border-it-line-strong dark:border-rink-500'
                                : selected ? 'bg-ice-500 border-ice-500' : 'border-wline dark:border-rink-500',
                            )}
                          >
                            {selected && <Icon name="check" className="text-[10px] text-white" aria-hidden="true" />}
                          </span>
                          {team.name}
                          {team.teamCode && (
                            <span className={cn('text-card-meta font-medium', iceTheme ? 'text-it-ink-400 dark:text-rink-400' : 'text-wtext-3 dark:text-rink-400')}>
                              {team.teamCode}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!isTeamsLoading && selectableTeams.length > 0 && formData.selectedVisibleTeams.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                    <Icon name="warning" className="text-sm" aria-hidden="true" />
                    {MESSAGES.class.visibility.selectTeamsRequired}
                  </p>
                )}
              </div>
            </section>
          </AnimatedSection>
        )}

        {/* ── SECTION 5: 팀 운영 정책 안내 ── */}
        <AnimatedSection delay={350}>
          <div className={cn('p-5 rounded-w-md relative overflow-hidden', iceTheme ? 'bg-it-blue-50 dark:bg-rink-800 border-[1.5px] border-it-blue-100 dark:border-rink-700' : 'bg-blue-50 dark:bg-rink-800 border border-blue-100 dark:border-rink-700')}>
            <div className="relative z-10 flex gap-4">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', iceTheme ? 'bg-it-blue-500/10 dark:bg-white/10' : 'bg-ice-500/10 dark:bg-white/10')}>
                <Icon name="info" className={cn('text-xl', iceTheme ? 'text-it-blue-500 dark:text-blue-400' : 'text-ice-500 dark:text-blue-400')} aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <p className={cn('text-sm font-bold', iceTheme ? 'text-it-blue-500 dark:text-blue-400' : 'text-ice-500 dark:text-blue-400')}>팀 운영 정책 안내</p>
                <p className={cn('text-card-meta leading-relaxed font-medium', iceTheme ? 'text-it-ink-600 dark:text-rink-300' : 'text-wtext-2 dark:text-rink-300')}>
                  수업 개설 정보는 실시간으로 학부모 앱에 공지됩니다.
                  모든 정산 및 취소는 팀 표준 약관을 준수합니다.
                </p>
              </div>
            </div>
            <div className={cn('absolute -right-4 -top-4 w-16 h-16 rounded-full', iceTheme ? 'bg-it-blue-500/5 dark:bg-white/5' : 'bg-ice-500/5 dark:bg-white/5')} aria-hidden="true" />
          </div>
        </AnimatedSection>

        {/* ── 활성 상태 토글 — [2026-06-09] 숨김 처리 (사용자 요청). ── */}
        {false && (
          <AnimatedSection delay={400}>
            <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="toggle_on" className="text-ice-500 text-lg" aria-hidden="true" />
                  <span className="text-sm font-bold text-wtext-1 dark:text-white">수업 활성화</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.isActive}
                  aria-label="수업 활성화 토글"
                  disabled
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-not-allowed opacity-50',
                    formData.isActive ? 'bg-ice-500' : 'bg-wline dark:bg-rink-500'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      formData.isActive ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>
            </div>
          </AnimatedSection>
        )}

        {/* ── 제출 버튼 ── */}
        <AnimatedSection delay={mode === 'edit' ? 450 : 400}>
          {mode === 'edit' && onDelete ? (
            // [2026-05-12] 수정 모드 — 항상 [삭제하기]+[수정하기] 노출.
            //   수강생이 있으면 [삭제하기] disabled + 안내 (결제·출석 데이터 보존 정책).
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                disabled={isDeleting || enrollmentCount > 0}
                title={
                  enrollmentCount > 0
                    ? '수강생이 있어 삭제할 수 없습니다'
                    : '수업 삭제하기'
                }
                className={cn(
                  'flex-1 py-4 rounded-2xl font-bold text-base border transition-colors active:scale-[0.98]',
                  enrollmentCount > 0
                    ? 'text-wtext-3 dark:text-wtext-4 border-wline-2 dark:border-rink-700 bg-wline-2/30 dark:bg-rink-700/30 cursor-not-allowed'
                    : 'text-red-500 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20',
                )}
                aria-label={
                  enrollmentCount > 0
                    ? '수강생이 있어 삭제할 수 없습니다'
                    : '수업 삭제하기'
                }
              >
                {isDeleting ? '삭제 중...' : '삭제하기'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  'flex-[1.5] py-4 rounded-2xl font-bold text-base text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2',
                  isSubmitting
                    ? 'bg-wtext-4 dark:bg-rink-500 cursor-not-allowed'
                    : iceTheme
                      ? 'bg-it-blue-500 hover:bg-it-blue-600'
                      : 'bg-ice-500 hover:bg-ice-700 shadow-md'
                )}
                aria-label="수정 저장하기"
              >
                {isSubmitting ? '처리 중...' : '수정 저장하기'}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => back()}
                disabled={isSubmitting}
                className="flex-1 py-4 rounded-2xl font-bold text-base text-wtext-2 dark:text-rink-100 border border-wline dark:border-rink-700 hover:bg-wbg dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="취소"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  'flex-[1.5] py-4 rounded-2xl font-bold text-base text-white transition-all motion-reduce:transition-none active:scale-[0.98] flex items-center justify-center gap-2',
                  isSubmitting
                    ? 'bg-wtext-4 dark:bg-rink-500 cursor-not-allowed'
                    : iceTheme
                      ? 'bg-it-blue-500 hover:bg-it-blue-600'
                      : 'bg-ice-500 hover:bg-ice-700 shadow-md'
                )}
                aria-label={isEditMode ? '수정 저장하기' : '개설'}
              >
                {isSubmitting ? (
                  <>
                    <Icon name="hourglass_empty" className="text-lg animate-spin" aria-hidden="true" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <Icon name={isEditMode ? 'edit' : 'add_task'} className="text-lg" aria-hidden="true" />
                    {isEditMode ? '수정 저장하기' : '개설'}
                  </>
                )}
              </button>
            </div>
          )}
        </AnimatedSection>
      </form>

      {/* [2026-06-09] 복수 날짜 선택 미니달력 — 선택 날짜들로 일정 일괄 생성. */}
      <MultiDatePickerModal
        isOpen={multiDateOpen}
        initialYear={currentYear}
        initialMonth={currentMonth}
        selected={formData.dateSchedules.map(s => s.date).filter(Boolean)}
        // 1회용 수업(spot) — 잔존 요일 템플릿의 빠른 선택 칩 차단 + 단일 선택 모드.
        daySchedules={isSpot ? [] : formData.daySchedules}
        singleSelect={isSpot}
        onConfirm={applyMultiDates}
        onClose={() => setMultiDateOpen(false)}
        iceTheme={iceTheme}
        // 팝업은 날짜만 고른다 — 시간·장소는 아래 회차 목록에서 입력한다
        //   (행의 "모든 회차에 적용" 버튼으로 일괄 채움). requireCommonTime 미전달이라
        //   요일 기본값 없는 날짜는 빈 시간으로 추가되고, 제출 검증이 미입력을 막는다.
      />

      {/* ── 삭제 확인 모달 (Portal) ── */}
      {showDeleteModal && portalReady && createPortal(
        <div
          className="overlay-fullscreen-wrapper items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="삭제 확인"
        >
          <div className="overlay-fullscreen-dim" aria-hidden="true" />
          <div className="relative pointer-events-auto z-10 bg-white dark:bg-rink-800 rounded-2xl p-6 mx-6 max-w-sm w-full shadow-md">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mx-auto mb-4">
              <Icon name="delete" className="text-2xl text-red-500" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-wtext-1 dark:text-white text-center mb-2">
              수업 삭제
            </h3>
            <p className="text-sm text-wtext-3 dark:text-rink-300 text-center mb-6">
              {MESSAGES.delete.confirm}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-wtext-2 dark:text-rink-100 bg-wline-2 dark:bg-rink-700 hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none"
                aria-label="취소"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors motion-reduce:transition-none"
                aria-label="삭제 확인"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
