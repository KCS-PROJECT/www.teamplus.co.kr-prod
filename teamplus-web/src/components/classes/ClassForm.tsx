'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import {
  ClassFormData,
  DEFAULT_FORM_DATA,
  FormErrors,
  validateClassForm,
  DayOfWeek,
  DateScheduleItem,
  useSelectableTeams,
  useVenues,
} from '@/hooks/useClassForm';
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
import { MultiDatePickerModal, type MultiDateCommon } from '@/components/ui/MultiDatePickerModal';

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
  /** 수강료 섹션(수정 모드)에 렌더할 패키지 관리 노드. create 모드는 ClassForm 내부 1회권 입력을 사용. */
  pricingSection?: React.ReactNode;
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
      ? 'w-full bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 rounded-w-md text-sm h-12 px-4 focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 transition-colors motion-reduce:transition-none text-it-ink-800 dark:text-white placeholder:text-it-ink-400'
      : 'w-full bg-wbg dark:bg-rink-700 border border-wline-2 dark:border-rink-600 rounded-xl text-sm h-12 px-4 focus:border-ice-500 focus:ring-1 focus:ring-ice-500/20 transition-all text-wtext-1 dark:text-white placeholder:text-wtext-3',
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
  const [venueSearch, setVenueSearch] = useState('');
  const [venueSheetOpen, setVenueSheetOpen] = useState(false);
  // [2026-06-05] 장소 선택 BottomSheet 대상 — null: 단일 장소 / DayOfWeek: 해당 요일 행 장소.
  const [venueTargetDay, setVenueTargetDay] = useState<DayOfWeek | null>(null);
  // [2026-06-09] 오픈클래스 날짜별 일정 — 장소 시트 대상 일정 key + 신규 행 key 카운터.
  const [venueTargetDateKey, setVenueTargetDateKey] = useState<string | null>(null);
  const dateKeySeq = useMemo(() => ({ n: 0 }), []);
  // [2026-06-04] 코치 배정 UI 제거 — coachSearch/coachSheetOpen state 삭제.
  const [portalReady, setPortalReady] = useState(false);

  // [2026-06-04] 코치 배정 UI 제거 — useClubCoaches/useAcademyCoaches 코치 조회 훅 삭제.
  // [2026-05-15] 오픈클래스 노출 팀 후보 — academy 컨텍스트에서만 조회.
  const { teams: selectableTeams, isLoading: isTeamsLoading } = useSelectableTeams(isAcademy);
  // [2026-06-04] coaches — 코치 배정 UI 제거로 미사용.
  const { venues } = useVenues();

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

  // BottomSheet(장소 선택) 열릴 때 body 스크롤 잠금
  useEffect(() => {
    if (venueSheetOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [venueSheetOpen]);

  // [2026-05-12 → 2026-05-16 v2] 네이티브 status bar 영역만 dim — Sheet 패턴.
  //   장소 선택 BottomSheet (코치 선택 시트는 2026-06-04 제거). SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(venueSheetOpen, undefined, { bottom: false });

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
    setVenueSearch('');
    setVenueSheetOpen(false);
    setVenueTargetDay(null);
    setVenueTargetDateKey(null);
  };

  // [2026-06-05] 장소 BottomSheet 닫기 — 검색어·대상요일·대상일정 리셋 공통 처리.
  const closeVenueSheet = () => {
    setVenueSheetOpen(false);
    setVenueSearch('');
    setVenueTargetDay(null);
    setVenueTargetDateKey(null);
  };

  // [2026-06-09] 복수 날짜 선택 → 선택 날짜들로 일정 재구성. 공통 시간/장소(common)는
  //   입력된 값만 덮어쓰고, 미입력 값은 기존 행의 시간/장소를 보존.
  const applyMultiDates = (dates: string[], common: MultiDateCommon) => {
    setFormData(prev => {
      const existing = new Map(
        prev.dateSchedules.filter(s => s.date).map(s => [s.date, s] as const),
      );
      const next = dates.map(d => {
        const ex = existing.get(d);
        if (!ex) dateKeySeq.n += 1;
        const base: DateScheduleItem = ex ?? {
          key: `ds${dateKeySeq.n}`,
          date: d,
          startTime: '',
          endTime: '',
          venueId: '',
          venueName: '',
        };
        return {
          ...base,
          startTime: common.startTime || base.startTime,
          endTime: common.endTime || base.endTime,
          venueId: common.venueId || base.venueId,
          venueName: common.venueId ? common.venueName : base.venueName,
        };
      });
      return { ...prev, dateSchedules: next };
    });
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

  const filteredVenues = useMemo(() => {
    if (!venueSearch.trim()) return venues;
    const q = venueSearch.toLowerCase();
    return venues.filter(v =>
      v.name.toLowerCase().includes(q) || (v.address ?? '').toLowerCase().includes(q)
    );
  }, [venueSearch, venues]);

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
                  'flex items-center gap-2 px-3 py-2.5 rounded-w-md',
                  iceTheme
                    ? cn('bg-it-fill dark:bg-rink-900 border-[1.5px]', errors.capacity ? 'border-red-400' : 'border-it-line-strong dark:border-rink-700')
                    : cn('bg-wbg dark:bg-rink-900 border', errors.capacity ? 'border-red-400' : 'border-wline dark:border-rink-700')
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
                    ? 'w-full bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 rounded-w-md text-sm min-h-[120px] px-4 py-3 leading-relaxed focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 resize-none text-it-ink-800 dark:text-white placeholder:text-it-ink-400 transition-colors motion-reduce:transition-none'
                    : 'w-full bg-wsurface dark:bg-rink-700 border border-wline-2 dark:border-rink-600 rounded-xl text-sm min-h-[120px] px-4 py-3 leading-relaxed focus:border-ice-500 focus:ring-1 focus:ring-ice-500/20 resize-none text-wtext-1 dark:text-white placeholder:text-wtext-3'
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

            {/* [2026-06-09] 미니달력 날짜별 일정(날짜·시간·장소). 요일 토글 대체. */}
            {(
              <div className={cn(ic.card, 'space-y-3')}>
                <label className={cn('block text-sm font-bold', iceTheme ? 'text-it-ink-600 dark:text-rink-100' : 'text-wtext-2 dark:text-rink-100')}>
                  수업 일정
                </label>
                {formData.dateSchedules.length === 0 ? (
                  <p className={cn('text-xs px-1 py-1', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                    아래 버튼으로 일정을 추가하고 날짜·시간·장소를 지정하세요.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {formData.dateSchedules.map((s, idx) => (
                      <li
                        key={s.key}
                        className={
                          iceTheme
                            ? 'rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900/40 p-3 space-y-2'
                            : 'rounded-xl border border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900/40 p-3 space-y-2'
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('text-card-meta font-extrabold', iceTheme ? 'text-it-ink-600 dark:text-rink-100' : 'text-wtext-2 dark:text-rink-100')}>
                              {idx + 1}회차
                            </span>
                            {s.date && (
                              <span className={cn('text-card-meta font-bold', iceTheme ? 'text-it-blue-500 dark:text-it-blue-300' : 'text-ice-600 dark:text-ice-400')} aria-hidden="true">
                                ({getKoreanWeekday(s.date)})
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDateSchedule(s.key)}
                            className="rounded-md px-2 py-1 text-card-meta font-bold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                            aria-label={`${idx + 1}회차 삭제`}
                          >
                            삭제
                          </button>
                        </div>
                        <input
                          type="date"
                          value={s.date}
                          onChange={(e) => updateDateSchedule(s.key, { date: e.target.value })}
                          className={
                            iceTheme
                              ? 'w-full h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500'
                              : 'w-full h-10 px-3 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-sm font-medium text-wtext-1 dark:text-white focus:outline-none focus:border-ice-500'
                          }
                          aria-label={`${idx + 1}회차 날짜`}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="time"
                            value={s.startTime}
                            onChange={(e) => updateDateSchedule(s.key, { startTime: e.target.value })}
                            className={
                              iceTheme
                                ? 'h-10 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-sm font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500'
                                : 'h-10 px-3 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-sm font-medium text-wtext-1 dark:text-white focus:outline-none focus:border-ice-500'
                            }
                            aria-label={`${idx + 1}회차 시작 시간`}
                          />
                          <input
                            type="time"
                            value={s.endTime}
                            onChange={(e) => updateDateSchedule(s.key, { endTime: e.target.value })}
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
                        >
                          <Icon name="location_on" className={cn('text-base', iceTheme ? 'text-it-ink-400' : 'text-wtext-3')} aria-hidden="true" />
                          <span className={s.venueName ? '' : iceTheme ? 'text-it-ink-400' : 'text-wtext-3'}>
                            {s.venueName || '장소 선택'}
                          </span>
                          <Icon name="chevron_right" className={cn('text-base ml-auto', iceTheme ? 'text-it-ink-300' : 'text-wtext-4')} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => setMultiDateOpen(true)}
                  className={
                    iceTheme
                      ? 'mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded-w-md border border-dashed border-it-blue-500/50 text-sm font-bold text-it-blue-500 hover:bg-it-blue-500/[0.06] transition-colors motion-reduce:transition-none'
                      : 'mt-1 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-ice-500/50 text-sm font-bold text-ice-500 hover:bg-ice-500/[0.06] transition-colors'
                  }
                >
                  <Icon name="calendar_month" className="text-base" aria-hidden="true" />
                  일정 추가
                </button>
                {errors.dateSchedules && (
                  <p className="text-xs text-red-500 flex items-center gap-1" role="alert">
                    <Icon name="error_outline" className="text-xs" aria-hidden="true" />
                    {errors.dateSchedules}
                  </p>
                )}
              </div>
            )}


            {/* 훈련 장소 BottomSheet */}
            {portalReady && venueSheetOpen && createPortal(
              <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true" aria-label="훈련 장소 선택">
                {/* Overlay */}
                <div
                  className="absolute inset-0 bg-black/40 animate-[fadeIn_200ms_ease-out]"
                  onClick={closeVenueSheet}
                />
                {/* Sheet */}
                <div className={cn('absolute bottom-0 left-0 right-0 rounded-t-2xl shadow-md animate-[slideUp_300ms_ease-out] max-h-[75vh] flex flex-col', iceTheme ? 'bg-it-surface dark:bg-rink-800' : 'bg-white dark:bg-rink-800')}>
                  {/* Handle */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className={cn('w-10 h-1 rounded-full', iceTheme ? 'bg-it-line-strong dark:bg-rink-500' : 'bg-wline dark:bg-rink-500')} />
                  </div>

                  {/* Header */}
                  <div className={cn('flex items-center justify-between px-5 py-3 border-b', iceTheme ? 'border-it-line dark:border-rink-700' : 'border-wline-2 dark:border-rink-700')}>
                    <h3 className={cn('text-base font-bold', iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white')}>
                      {venueTargetDay ? `${venueTargetDay}요일 장소 선택` : '훈련 장소 선택'}
                    </h3>
                    <button
                      type="button"
                      onClick={closeVenueSheet}
                      className={cn('w-8 h-8 flex items-center justify-center rounded-full transition-colors motion-reduce:transition-none', iceTheme ? 'hover:bg-it-fill dark:hover:bg-rink-700' : 'hover:bg-wline-2 dark:hover:bg-rink-700')}
                      aria-label="닫기"
                    >
                      <Icon name="close" className={cn('text-lg', iceTheme ? 'text-it-ink-500' : 'text-wtext-3')} />
                    </button>
                  </div>

                  {/* Search */}
                  <div className="px-5 py-3">
                    <div className={cn('flex items-center gap-3 px-4 py-3 rounded-w-md transition-colors motion-reduce:transition-none', iceTheme ? 'bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600' : 'bg-wsurface dark:bg-rink-700 border border-wline-2 dark:border-rink-600')}>
                      <Icon name="search" className={cn('text-xl shrink-0', iceTheme ? 'text-it-ink-400' : 'text-wtext-3')} aria-hidden="true" />
                      <input
                        type="text"
                        value={venueSearch}
                        onChange={(e) => setVenueSearch(e.target.value)}
                        placeholder="장소명 또는 주소 검색"
                        className={cn('bg-transparent border-0 p-0 text-sm w-full focus:ring-0 focus:outline-none', iceTheme ? 'text-it-ink-800 dark:text-white placeholder:text-it-ink-400' : 'text-wtext-1 dark:text-white placeholder:text-wtext-3')}
                        autoFocus
                      />
                      {venueSearch && (
                        <button
                          type="button"
                          onClick={() => setVenueSearch('')}
                          className={cn('transition-colors motion-reduce:transition-none shrink-0', iceTheme ? 'text-it-ink-400 hover:text-it-ink-600' : 'text-wtext-3 hover:text-wtext-2')}
                          aria-label="검색어 지우기"
                        >
                          <Icon name="close" className="text-base" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Venue List */}
                  <div className="flex-1 overflow-y-auto px-5 pb-8">
                    {filteredVenues.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {filteredVenues.map(v => {
                          // 날짜 일정 모드: 해당 일정 행 venueId / 요일별 모드: 해당 요일 행 venueId / 단일 모드: 단일 venueId 기준.
                          const isSelected = venueTargetDateKey
                            ? formData.dateSchedules.find((s) => s.key === venueTargetDateKey)?.venueId === v.id
                            : venueTargetDay
                              ? formData.daySchedules.find((s) => s.dayOfWeek === venueTargetDay)?.venueId === v.id
                              : formData.venueId === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => handleVenueSelect(v.id, v.name, v.address ?? '')}
                              className={cn(
                                'w-full flex items-center gap-4 p-4 rounded-w-md text-left transition-colors motion-reduce:transition-none active:brightness-95',
                                iceTheme
                                  ? isSelected
                                    ? 'bg-it-blue-500/5 border-2 border-it-blue-500'
                                    : 'bg-it-fill dark:bg-rink-900/50 border-[1.5px] border-it-line-strong dark:border-rink-700 hover:border-it-blue-500/30'
                                  : isSelected
                                    ? 'bg-ice-500/5 border-2 border-ice-500'
                                    : 'bg-wbg dark:bg-rink-900/50 border border-wline-2 dark:border-rink-700 hover:border-ice-500/30',
                              )}
                            >
                              <div className={cn(
                                'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border',
                                iceTheme
                                  ? isSelected
                                    ? 'bg-it-blue-500/10 border-it-blue-500/20'
                                    : 'bg-it-surface dark:bg-rink-700 border-it-line dark:border-rink-700'
                                  : isSelected
                                    ? 'bg-ice-500/10 border-ice-500/20'
                                    : 'bg-white dark:bg-rink-700 border-wline dark:border-rink-700',
                              )}>
                                <Icon name="location_on" className={cn('text-xl', iceTheme ? (isSelected ? 'text-it-blue-500' : 'text-it-ink-400') : (isSelected ? 'text-ice-500' : 'text-wtext-3'))} aria-hidden="true" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={cn('text-sm font-bold', iceTheme ? (isSelected ? 'text-it-blue-500' : 'text-it-ink-800 dark:text-rink-100') : (isSelected ? 'text-ice-500' : 'text-wtext-1 dark:text-rink-100'))}>
                                  {v.name}
                                </p>
                                {v.address && (
                                  <p className={cn('text-card-meta mt-0.5 truncate', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>{v.address}</p>
                                )}
                              </div>
                              {isSelected && (
                                <Icon name="check_circle" className={cn('text-xl shrink-0', iceTheme ? 'text-it-blue-500' : 'text-ice-500')} aria-hidden="true" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12">
                        <div className={cn('w-14 h-14 rounded-full flex items-center justify-center mb-3', iceTheme ? 'bg-it-fill dark:bg-rink-700' : 'bg-wline-2 dark:bg-rink-700')}>
                          <Icon name="search_off" className={cn('text-2xl', iceTheme ? 'text-it-ink-400' : 'text-wtext-3')} aria-hidden="true" />
                        </div>
                        <p className={cn('text-sm font-medium', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                          {venueSearch ? `"${venueSearch}" 검색 결과가 없습니다` : '등록된 훈련 장소가 없습니다'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )}
          </section>
        </AnimatedSection>

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
                      <div className="grid grid-cols-2 gap-2">
                        {(['PREPAID', 'POSTPAID'] as const).map((bm) => {
                          const active = formData.billingMode === bm;
                          return (
                            <button
                              key={bm}
                              type="button"
                              onClick={() => {
                                handleChange('billingMode', bm);
                                // 후불 전환 시 담아둔 정기권 draft 제거 — 후불은 1회 수업료만 운영.
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
                              {bm === 'PREPAID'
                                ? MESSAGES.classProduct.billingModePrepaid
                                : MESSAGES.classProduct.billingModePostpaid}
                            </button>
                          );
                        })}
                      </div>
                      <p className={cn('text-card-caption', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                        {formData.billingMode === 'PREPAID'
                          ? MESSAGES.classProduct.billingModePrepaidHint
                          : MESSAGES.classProduct.billingModePostpaidHint}
                      </p>
                    </div>

                    {/* 1회 수강권 — 필수 (팀·오픈 공통) */}
                    <div className="col-span-2 space-y-2">
                          <label className={cn('block text-card-meta font-bold uppercase tracking-wider', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                            {formData.billingMode === 'POSTPAID'
                              ? MESSAGES.classProduct.feePerSessionLabel
                              : MESSAGES.classProduct.singlePriceLabel}{' '}
                            <span className={iceTheme ? 'text-it-red-500' : 'text-red-500'}>*</span>
                          </label>
                          <div className={cn(
                            'flex items-center gap-2 px-3 py-2.5 rounded-w-md',
                            iceTheme
                              ? cn('bg-it-fill dark:bg-rink-900 border-[1.5px]', errors.singlePrice ? 'border-red-400' : 'border-it-line-strong dark:border-rink-700')
                              : cn('bg-wbg dark:bg-rink-900 border', errors.singlePrice ? 'border-red-400' : 'border-wline dark:border-rink-700')
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
                                    총 수업료
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
                  {formData.billingMode === 'PREPAID' && onPackageDraftChange && (
                    <div className={cn('pt-4 border-t space-y-3', iceTheme ? 'border-it-line dark:border-rink-700' : 'border-wline-2 dark:border-rink-700')}>
                      <p className={cn('text-card-meta font-bold uppercase tracking-wider', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                        {MESSAGES.classProduct.embedSectionLabel}
                      </p>
                      <PackageManageSection
                        mode="deferred"
                        variant="embed"
                        excludePerSession
                        value={packageDraftValue ?? []}
                        onChange={onPackageDraftChange}
                        dirty={packageDirty}
                        classSessionsPerWeek={formData.classDays.length}
                        billingMode={formData.billingMode}
                        iceTheme={iceTheme}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              // edit 모드 — 통합된 수강료/패키지 관리(PackageManageSection 자체 헤더 포함).
              pricingSection
            )}
          </section>
        </AnimatedSection>

        {/* ── SECTION 4.5: 오픈클래스 노출 팀 선택 (academy 컨텍스트 전용) ──
            [2026-05-15] 오픈클래스 감독은 특정 팀 소속이 아니므로, 이 수업을 어느
            팀 소속자(감독·코치·학부모·학생)에게 노출할지 직접 선택한다.
            선택된 팀만 ClassTeamVisibility 로 저장 → 그 팀 사람에게만 수업목록/캘린더 노출. */}
        {isAcademy && (
          <AnimatedSection delay={325}>
            <section className="space-y-4">
              <h2 className={ic.head}>
                <span className={ic.headBar} aria-hidden="true" />
                노출 팀 선택
                {formData.selectedVisibleTeams.length > 0 && (
                  <span className={iceTheme ? 'text-it-blue-500' : 'text-ice-500'}>({formData.selectedVisibleTeams.length}개)</span>
                )}
              </h2>
              <div className={cn(ic.card, 'space-y-3')}>
                <p className={cn('text-card-meta leading-relaxed font-medium', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300')}>
                  이 오픈클래스를 어느 팀에 노출할지 선택하세요. 선택한 팀의 감독·코치·학부모·학생에게만
                  수업 목록과 캘린더에 표시됩니다.
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
                    팀을 선택하지 않으면 이 수업은 아무에게도 노출되지 않습니다.
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
        venues={venues.map(v => ({ id: v.id, name: v.name }))}
        onConfirm={applyMultiDates}
        onClose={() => setMultiDateOpen(false)}
        iceTheme={iceTheme}
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
