'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { MESSAGES } from '@/lib/messages';
// sortDaySchedules SoT — class-categories 의 제네릭 구현을 단일 출처로 사용.
//   ClassForm.tsx 등 기존 import 경로 호환을 위해 아래에서 re-export 한다.
import { sortDaySchedules } from '@/lib/class-categories';

// ─── 완료 페이지 데이터 전달 (모듈 스코프) ──────────
export interface ClassCompletePayload {
  mode: 'create' | 'edit';
  /** 신규 등록 시 백엔드 응답 id, 수정 시 useClassForm 입력 classId.
   *  complete 페이지에서 PackageManageSection 호출에 필요 (2026-05-22 옵션 A). */
  classId: string;
  className: string;
  instructorName: string;
  venue: string;
  venueAddress: string;
  classDays: string[];
  startDate: string;
  endDate: string;
  startTimeOnly: string;
  endTimeOnly: string;
  /** @deprecated 2026-05-22 옵션 A — 가격·패키지는 PackageManageSection 으로 이전. 표시 호환을 위해 필드만 유지. */
  singlePrice: number | '';
  /** @deprecated 동상. */
  monthlyPrice: number | '';
  capacity: number;
  ageMin?: number | '';
  ageMax?: number | '';
  targetBirthYears?: number[];
  // 정기 패키지 단위 (회의록 2026-04-23 정합) — complete 화면 동적 라벨 표시용
  packageWeeks?: number;
  packageTotalSessions?: number;
  packageSessionsPerWeek?: number;
  // [2026-06-05] 요일별 시간·장소 요약 — complete 화면에서 "월 17:00–18:00 A링크장" 표시용(선택).
  daySchedules?: { dayOfWeek: string; startTime: string; endTime: string; venueName?: string }[];
  // 개별 날짜 일정(미니달력) — complete 화면에서 날짜별 시간·장소 나열 + 기간(min~max·총 N회) 산출용.
  dateSchedules?: { date: string; startTime: string; endTime: string; venueName?: string }[];
  // [2026-06-22] 수강료 표시용 전체 패키지 목록(1회권 + 정기권 전부). 있으면 complete 화면이
  //   singlePrice/monthlyPrice 대신 이 목록을 우선 표시 — 다중 정기권·변경 가격 정확 반영.
  feeItems?: { name: string; price: number }[];
}

let _classCompleteData: ClassCompletePayload | null = null;

export function setClassCompleteData(data: ClassCompletePayload) {
  _classCompleteData = data;
}

export function getClassCompleteData(): ClassCompletePayload | null {
  const data = _classCompleteData;
  _classCompleteData = null;
  return data;
}

// ─── Types ──────────────────────────────────────────
export type DayOfWeek = '월' | '화' | '수' | '목' | '금' | '토' | '일';

export const DAY_OPTIONS: DayOfWeek[] = ['월', '화', '수', '목', '금', '토', '일'];

// ─── 요일별 시간·장소 (ClassDaySchedule) ───────────────
// [2026-06-05] 정규/레슨 수업의 요일마다 다른 시작/종료 시간·장소를 입력.
//   백엔드 DTO `daySchedules: [{ dayOfWeek, startTime, endTime, venueId? }]` 와 1:1 계약.
//   startTime/endTime 은 "HH:mm" 문자열. venueId 는 선택. venueName 은 폼 표시용(전송 제외).
export interface DayScheduleItem {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  venueId: string;
  venueName?: string;
}

// [2026-06-09] 오픈클래스(academy) 날짜별 일정 — 미니달력으로 날짜 선택 + 시간 + 장소.
//   요일(daySchedules) 대신 사용. key 는 렌더용 안정 키.
export interface DateScheduleItem {
  key: string;
  /** YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
  venueId: string;
  venueName?: string;
}

// daySchedules 정렬은 class-categories 의 제네릭 sortDaySchedules 를 SoT 로 사용.
//   기존 import 경로(`@/hooks/useClassForm`) 호환을 위해 re-export.
export { sortDaySchedules };

export interface ClassFormData {
  className: string;
  description: string;
  trainingType: string;
  instructorName: string;
  capacity: number;
  ageMin: number | '';
  ageMax: number | '';
  /** 대상 출생연도 개별 목록(SoT). 예: [2015, 2017, 2019] — 비연속 선택 가능. [] = 전 연령 대상.
   *  ageMin/ageMax 는 이 값에서 파생되는 한국나이 min/max (하위호환·표시용). */
  targetBirthYears: number[];
  levelRequired: string;
  startDate: string;
  endDate: string;
  startTimeOnly: string;
  endTimeOnly: string;
  classDays: DayOfWeek[];
  // [2026-06-05] 정규/레슨 — 요일별 시작/종료 시간·장소. 선택된 classDays 와 동기화.
  daySchedules: DayScheduleItem[];
  // [2026-06-09] 오픈클래스 날짜별 일정 (academy 전용). 팀 수업은 빈 배열.
  dateSchedules: DateScheduleItem[];
  totalClassDays: number | '';
  startTime: string;
  endTime: string;
  isActive: boolean;
  // 확장 필드
  coachId: string;
  selectedCoaches: CoachOption[];
  venueId: string;
  venue: string;
  venueAddress: string;
  singlePrice: number | '';
  monthlyPrice: number | '';
  // [Phase B-5/B-6] 결제 방식 — 감독 지정. 선불 PREPAID / 후불 POSTPAID / 선택형 BOTH(학부모 택1).
  billingMode: 'PREPAID' | 'POSTPAID' | 'BOTH';
  category: string;
  // 2026-05-12: 정규 수업 등록과 동시에 일정 자동 일괄 생성 (기본 ON).
  autoGenerateSchedules: boolean;
  // 2026-05-15: 오픈클래스(academy 컨텍스트) 전용 — 이 수업을 노출할 팀 목록.
  //   여기 선택된 팀 소속자(감독·코치·학부모·학생)에게만 수업목록·캘린더에 노출.
  //   team 컨텍스트에서는 사용 안 함 (payload 미전송).
  selectedVisibleTeams: TeamOption[];
  // PACKAGE_WEEKS_SPEC §3 옵션 A — 정기 패키지 주 수 명시 입력.
  //   packageMode='weeks': packageWeeks 입력값, endDate 자동 산출 (startDate + weeks*7 - 1일)
  //   packageMode='endDate': endDate 입력값, packageWeeks 자동 산출 (기존 흐름)
  packageWeeks: number | '';
  packageMode: 'weeks' | 'endDate';
}

export interface CoachOption {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role?: string;
  email?: string;
  phone?: string;
}

export interface TeamOption {
  id: string;
  name: string;
  teamCode?: string | null;
}

// [2026-05-21] AGE_GROUP_OPTIONS(U8~U12 칩) 제거 — 대상 연령 선택은 ClassForm 의
//   출생연도 범위 슬라이더(BirthYearRangeSlider)로 통일. ageMin/ageMax(한국나이)
//   백엔드 스키마는 그대로 두고 UI·변환만 출생연도 기준으로 전환.

// 분류 SoT 는 @/lib/class-categories 로 일원화 (2026-05-08).
// 폼·페이지·캘린더가 모두 같은 파일을 바라보도록 통합.
// 폼 코드는 @/lib/class-categories 에서 직접 import 한다.

export const LEVEL_OPTIONS = [
  { value: '', label: '선택 안함' },
  { value: '초급', label: '초급' },
  { value: '중급', label: '중급' },
  { value: '고급', label: '고급' },
  { value: '엘리트', label: '엘리트' },
] as const;

export interface VenueOption {
  id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export const DEFAULT_FORM_DATA: ClassFormData = {
  className: '',
  description: '',
  // classes 도메인 SoT 기본값 — 정규/레슨 카테고리.
  trainingType: 'regular',
  instructorName: '',
  // [2026-06-04] 정원 입력란 제거 — 기본 0(무제한)으로 저장.
  capacity: 0,
  ageMin: '',
  ageMax: '',
  targetBirthYears: [],
  levelRequired: '',
  startDate: '',
  endDate: '',
  startTimeOnly: '',
  endTimeOnly: '',
  classDays: [],
  daySchedules: [],
  dateSchedules: [],
  totalClassDays: '',
  startTime: '',
  endTime: '',
  isActive: true,
  coachId: '',
  selectedCoaches: [],
  venueId: '',
  venue: '',
  venueAddress: '',
  singlePrice: '',
  monthlyPrice: '',
  // [Phase B-6] 기본 결제방식 = 선택형(BOTH). 학부모가 결제 시 선·후불 택1.
  billingMode: 'BOTH',
  category: '',
  autoGenerateSchedules: true,
  selectedVisibleTeams: [],
  packageWeeks: '',
  packageMode: 'weeks',
};

// ─── Validation ─────────────────────────────────────
export interface FormErrors {
  className?: string;
  instructorName?: string;
  capacity?: string;
  ageMax?: string;
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
  startTimeOnly?: string;
  endTimeOnly?: string;
  classDays?: string;
  // [2026-06-05] 요일별 시간 검증 에러 — 행 단위 에러는 dayScheduleErrors 로 분리(요일→메시지 맵).
  daySchedules?: string;
  dateSchedules?: string;
  dayScheduleErrors?: Partial<Record<DayOfWeek, string>>;
  singlePrice?: string;
  monthlyPrice?: string;
  packageWeeks?: string;
  // [Phase B-6] 선불·선택형 정액 패키지 ≥1 강제 — 미충족 시 등록 차단.
  packages?: string;
}

/** 날짜별 일정 변경 여부 판정 — 키/표시필드(venueName) 제외, date·시간·장소만 순서 무관 비교. */
export function dateSchedulesEqual(
  a: Pick<DateScheduleItem, 'date' | 'startTime' | 'endTime' | 'venueId'>[],
  b: Pick<DateScheduleItem, 'date' | 'startTime' | 'endTime' | 'venueId'>[],
): boolean {
  const norm = (arr: Pick<DateScheduleItem, 'date' | 'startTime' | 'endTime' | 'venueId'>[]) =>
    arr.map((s) => `${s.date}|${s.startTime}|${s.endTime}|${s.venueId ?? ''}`).sort();
  const na = norm(a);
  const nb = norm(b);
  if (na.length !== nb.length) return false;
  return na.every((v, i) => v === nb[i]);
}

export function validateClassForm(
  data: ClassFormData,
  options?: {
    skipPriceValidation?: boolean;
    isAcademy?: boolean;
    skipScheduleValidation?: boolean;
    // [Phase B-6] 선불·선택형 등록 시 정액(MONTHLY_FIXED) 패키지 ≥1 강제.
    //   드래프트는 ClassForm 이 보유하므로 충족 개수를 주입받아 검증한다(훅 결합 회피).
    requireMonthlyFixedPackage?: boolean;
    monthlyFixedPackageCount?: number;
  },
): FormErrors {
  const errors: FormErrors = {};

  if (!data.className.trim()) {
    errors.className = MESSAGES.class.nameRequired;
  } else if (data.className.length > 50) {
    errors.className = MESSAGES.class.nameMaxLength;
  }

  // [2026-06-09] 오픈클래스(academy)는 정원(최대 인원) 필수.
  if (options?.isAcademy) {
    const cap = Number(data.capacity);
    if (!Number.isFinite(cap) || cap <= 0) {
      errors.capacity = MESSAGES.classesEdit.validation.capacityRequired;
    }
  }
  // [2026-06-04] 강사명 입력란 제거 — 검증 스킵 (미입력 시 빈 값으로 저장).

  if (data.ageMin !== '' && data.ageMax !== '' && Number(data.ageMax) < Number(data.ageMin)) {
    errors.ageMax = MESSAGES.class.ageMaxInvalid;
  }

  // 날짜별 일정(dateSchedules) 검증.
  //   등록(create) 시 1개 이상 필수, 입력된 일정은 날짜·시간 유효성(존재 + start<end) 검증.
  //   수정 모드에서 일정을 변경하지 않은 경우 skipScheduleValidation=true 로 전체 스킵 —
  //   prefill 된 빈 시간(시간 미저장 회차)이 사용자가 건드리지 않았는데도 검증에 걸리고,
  //   백엔드 일정 전체 교체로 유실되는 문제를 방지한다(변경 시에만 검증·전송).
  if (!options?.skipScheduleValidation) {
    if (!options?.skipPriceValidation && data.dateSchedules.length === 0) {
      errors.dateSchedules = MESSAGES.classesEdit.validation.dateScheduleRequired;
    } else if (data.dateSchedules.length > 0) {
      const invalid = data.dateSchedules.some(
        (s) => !s.date || !s.startTime || !s.endTime || s.startTime >= s.endTime,
      );
      if (invalid) {
        errors.dateSchedules =
          MESSAGES.classesEdit.validation.dateScheduleTimeRequired;
      }
    }
  }

  // 1회 수강료(singlePrice)는 팀·오픈 공통 필수. create 모드에서만 검증.
  //   - edit 모드: 가격 영역이 ClassForm에 노출되지 않으므로 검증 스킵 (skipPriceValidation=true).
  if (!options?.skipPriceValidation) {
    if (data.singlePrice === '' || data.singlePrice === 0) {
      errors.singlePrice = MESSAGES.classesEdit.validation.singlePriceRequired;
    }
  }

  // [Phase B-6] 선불(PREPAID)·선택형(BOTH) 등록 시 정액(MONTHLY_FIXED) 패키지 1개 이상 필수.
  //   "아무 패키지"가 아니라 정액이어야 함(1회권으로 충족 방지) — 충족 개수는 호출처가 주입.
  if (
    options?.requireMonthlyFixedPackage &&
    (options?.monthlyFixedPackageCount ?? 0) === 0
  ) {
    errors.packages = MESSAGES.classProduct.validationMonthlyFixedRequired;
  }

  return errors;
}

// PACKAGE_WEEKS_SPEC §3 — 정기 패키지 파생 계산 헬퍼.
//   ClassForm 미리보기, payload 생성, complete 화면이 동일 로직을 공유한다.
export function derivePackageMetrics(data: Pick<
  ClassFormData,
  'packageMode' | 'packageWeeks' | 'totalClassDays' | 'classDays' | 'startDate' | 'endDate' | 'monthlyPrice'
>) {
  const perWeek = data.classDays.length;
  const inputWeeks = data.packageWeeks === '' ? 0 : Number(data.packageWeeks);
  const inputTotal = data.totalClassDays === '' ? 0 : Number(data.totalClassDays);

  let weeks = 0;
  if (data.packageMode === 'weeks' && inputWeeks > 0) {
    weeks = inputWeeks;
  } else if (inputTotal > 0 && perWeek > 0) {
    weeks = Math.ceil(inputTotal / perWeek);
  }

  const totalSessions =
    data.packageMode === 'weeks' && weeks > 0 && perWeek > 0
      ? weeks * perWeek
      : inputTotal;

  const price = data.monthlyPrice === '' ? 0 : Number(data.monthlyPrice);
  const perSession = price > 0 && totalSessions > 0 ? Math.round(price / totalSessions) : 0;

  // weeks 모드일 때 endDate 자동 산출 (startDate + weeks*7 - 1일).
  let autoEndDate = '';
  if (data.packageMode === 'weeks' && data.startDate && weeks > 0) {
    const start = new Date(data.startDate);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setDate(end.getDate() + weeks * 7 - 1);
      autoEndDate = end.toISOString().slice(0, 10);
    }
  }

  return { weeks, perWeek, totalSessions, perSession, autoEndDate };
}

// ─── Academy Coaches Hook ──────────────────────────
// 오픈클래스 감독용 — AcademyCoach 응답을 CoachOption 으로 어댑팅.
// useClubCoaches 와 동일 인터페이스(coaches/isLoading) 반환하여 ClassForm 에서 그대로 사용.
//
// [2026-05-13] 오픈클래스 감독(directorId)은 AcademyCoach 행에 없으므로 별도 조회 후 첫 번째로 prepend.
//   - 호칭은 회의록 정합성에 따라 "감독" (회의록 L985 "오픈클래스 감독" 표현).
//   - 오픈클래스에 코치 0명이어도 본인 배정 가능 (BE createAcademyClass 가 directorId 허용).
export function useAcademyCoaches(academyId: string | null) {
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!academyId) {
      setCoaches([]);
      setIsLoading(false);
      return;
    }

    async function fetchCoaches() {
      try {
        interface AcademyCoachResponse {
          id: string;
          userId: string;
          role: string;
          isActive?: boolean;
          user: {
            id?: string;
            firstName?: string;
            lastName?: string;
            email?: string;
            phone?: string;
          };
        }
        interface AcademyDetailResponse {
          id: string;
          director?: {
            id: string;
            firstName?: string;
            lastName?: string;
            email?: string;
            phone?: string;
          };
        }

        // 오픈클래스 정보(감독) + 코치 목록 병렬 조회.
        const [coachesRes, academyRes] = await Promise.all([
          api.get<{ data?: AcademyCoachResponse[] } | AcademyCoachResponse[]>(
            `/academies/${academyId}/coaches`,
          ),
          api.get<AcademyDetailResponse>(`/academies/${academyId}`),
        ]);

        const result: CoachOption[] = [];

        // 1. 오픈클래스 감독(본인) 을 첫 번째로 prepend — AcademyCoach 행에 없으므로 누락 방지.
        const director = academyRes.success ? academyRes.data?.director : null;
        const directorId = director?.id;
        if (director && directorId) {
          result.push({
            id: directorId,
            name:
              `${director.lastName ?? ''}${director.firstName ?? ''}`.trim() || '감독',
            role: '감독',
            email: director.email ?? '',
            phone: director.phone ?? '',
          });
        }

        // 2. AcademyCoach 목록 — 감독 본인 중복 제거 + 활성만 + 가나다순 정렬.
        if (coachesRes.success && coachesRes.data) {
          const list = Array.isArray(coachesRes.data)
            ? coachesRes.data
            : ((coachesRes.data as { data?: AcademyCoachResponse[] }).data ?? []);
          const active = list
            .filter((c) => c.isActive !== false)
            .filter((c) => {
              // 감독 본인이 우연히 AcademyCoach 행에 있어도 중복 방지.
              const uid = c.userId ?? c.user?.id ?? c.id;
              return uid !== directorId;
            })
            .sort((a, b) => {
              const an = `${a.user?.lastName ?? ''}${a.user?.firstName ?? ''}`;
              const bn = `${b.user?.lastName ?? ''}${b.user?.firstName ?? ''}`;
              return an.localeCompare(bn, 'ko');
            });
          for (const c of active) {
            result.push({
              id: c.userId ?? c.user?.id ?? c.id,
              name:
                `${c.user?.lastName ?? ''}${c.user?.firstName ?? ''}`.trim() || '코치',
              role: c.role === 'HEAD_COACH' ? '수석 코치' : '코치',
              email: c.user?.email ?? '',
              phone: c.user?.phone ?? '',
            });
          }
        }

        setCoaches(result);
      } catch {
        setCoaches([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchCoaches();
  }, [academyId]);

  return { coaches, isLoading };
}

// ─── 전체 활성 팀 목록 Hook (2026-05-15) ──────────────────────────────────
// 오픈클래스 감독이 수업을 노출할 팀을 고를 때 사용. GET /teams (ACADEMY_DIRECTOR 허용).
export function useSelectableTeams(enabled: boolean) {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setTeams([]);
      setIsLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        interface ApiTeam {
          id: string;
          name: string;
          teamCode?: string | null;
          isActive?: boolean;
        }
        const res = await api.get<ApiTeam[] | { data?: ApiTeam[] }>('/teams', {
          params: { limit: 200 },
        });
        if (!mounted) return;
        // GET /teams 는 배열 직접 반환 (admin client 계약). envelope 케이스도 대응.
        const list = Array.isArray(res.data)
          ? res.data
          : (res.data as { data?: ApiTeam[] })?.data ?? [];
        const mapped: TeamOption[] = (Array.isArray(list) ? list : [])
          .filter((t) => t.isActive !== false)
          .map((t) => ({ id: t.id, name: t.name, teamCode: t.teamCode ?? null }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        setTeams(mapped);
      } catch {
        if (mounted) setTeams([]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [enabled]);

  return { teams, isLoading };
}

// ─── Coaches Hook ──────────────────────────────────
export function useClubCoaches() {
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchCoaches() {
      try {
        const clubRes = await api.get<Array<{ id: string }>>('/teams/managed/list');
        if (!clubRes.success || !clubRes.data?.[0]) {
          setCoaches([]);
          return;
        }
        const clubId = clubRes.data[0].id;

        // 팀 멤버 목록에서 COACH만 필터 (감독 본인 제외)
        interface MemberResponse {
          id: string;
          userId?: string;
          playerName?: string;
          approvalStatus?: string;
          user?: { id?: string; firstName?: string; lastName?: string; email?: string; phone?: string; userType?: string };
        }
        const res = await api.get<{ total?: number; members?: MemberResponse[] }>(`/teams/${clubId}/members`);

        if (res.success && res.data) {
          const members = (res.data as { members?: MemberResponse[] }).members ?? [];
          // [수정 2026-05-12] 코치 + 감독 모두 포함 (DIRECTOR/COACH/ACADEMY_DIRECTOR).
          //  · 사용자 요청: 수업 배정 시 팀 소속 감독/코치 전체 리스트 노출.
          //  · [추가 2026-05-12] 정렬 우선순위: 팀 감독(DIRECTOR) → 오픈클래스 감독(ACADEMY_DIRECTOR) → 코치(COACH).
          const staffTypes = new Set(['COACH', 'DIRECTOR', 'ACADEMY_DIRECTOR']);
          const ROLE_PRIORITY: Record<string, number> = {
            DIRECTOR: 0,
            ACADEMY_DIRECTOR: 1,
            COACH: 2,
          };
          const staffMembers = members
            .filter((m) => {
              const type = (m.user?.userType ?? '').toUpperCase();
              return staffTypes.has(type) && m.approvalStatus === 'approved';
            })
            .sort((a, b) => {
              const ap = ROLE_PRIORITY[(a.user?.userType ?? '').toUpperCase()] ?? 99;
              const bp = ROLE_PRIORITY[(b.user?.userType ?? '').toUpperCase()] ?? 99;
              if (ap !== bp) return ap - bp;
              // 동일 역할 내 이름 가나다순
              const an = `${a.user?.lastName ?? ''}${a.user?.firstName ?? ''}`;
              const bn = `${b.user?.lastName ?? ''}${b.user?.firstName ?? ''}`;
              return an.localeCompare(bn, 'ko');
            });
          setCoaches(
            staffMembers.map((m) => {
              const utype = (m.user?.userType ?? '').toUpperCase();
              const role =
                utype === 'DIRECTOR'
                  ? '감독'
                  : utype === 'ACADEMY_DIRECTOR'
                    ? '감독'
                    : '코치';
              const name =
                `${m.user?.lastName ?? ''}${m.user?.firstName ?? ''}`.trim() ||
                m.playerName ||
                role;
              return {
                id: m.userId ?? m.user?.id ?? m.id,
                name,
                role,
                email: m.user?.email ?? '',
                phone: m.user?.phone ?? '',
              };
            }),
          );
        }
      } catch {
        setCoaches([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchCoaches();
  }, []);

  return { coaches, isLoading };
}

// ─── Venues Hook ──────────────────────────────────
export function useVenues() {
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchVenues() {
      try {
        const res = await api.get<{
          data?: Array<{
            id: string;
            name: string;
            address?: string;
            latitude?: number | string;
            longitude?: number | string;
          }>;
        } | Array<{
          id: string;
          name: string;
          address?: string;
          latitude?: number | string;
          longitude?: number | string;
        }>>('/venues?limit=100');

        if (res.success && res.data) {
          const list = Array.isArray(res.data) ? res.data : (res.data as { data?: Array<unknown> }).data;
          if (Array.isArray(list)) {
            setVenues(list.map((v) => {
              const item = v as Record<string, unknown>;
              return {
                id: item.id as string,
                name: item.name as string,
                address: (item.address as string) ?? undefined,
                latitude: item.latitude ? Number(item.latitude) : undefined,
                longitude: item.longitude ? Number(item.longitude) : undefined,
              };
            }));
          }
        }
      } catch {
        setVenues([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchVenues();
  }, []);

  return { venues, isLoading };
}

// ─── Main Hook ──────────────────────────────────────
interface UseClassFormOptions {
  mode: 'create' | 'edit';
  classId?: string;
  // 오픈클래스 감독(ACADEMY_DIRECTOR) 등록 분기 — academyId 전달 시
  // POST 엔드포인트가 /academies/{academyId}/classes 로 전환되고
  // trainingType 이 'lesson' 으로 강제된다. 미전달 시 기존 팀 흐름 유지.
  academyId?: string;
  // 폼 PUT 성공 후·완료 페이지 이동 전에 호출되는 후처리 훅.
  //   수정 페이지가 패키지(ClassProduct) 일괄 반영(bulk)을 연결하는 용도.
  //   true 반환 시 정상 완료(이동), false 반환 시 이동을 막고 부분 실패로 처리한다.
  //   미전달 시 기존 흐름(즉시 이동) 그대로.
  onAfterSubmit?: (classId: string) => Promise<boolean>;
  // 수정 모드 일정 변경 감지용 — prefill 시점의 dateSchedules 스냅샷.
  //   제출 시 현재 값과 비교해 변경이 없으면 일정 전송·검증을 스킵(기존 일정 보존).
  initialDateSchedules?: DateScheduleItem[];
  // [2026-06-22] 완료 페이지 수강료 목록 빌더 — 폼 1회 수강료 입력값을 받아 전체 항목 배열 반환.
  //   수정: draftProducts(1회권+정기권) 기준 / 등록: 폼 1회권 + 추가 정기권. 미전달 시 기존 표시.
  buildCompleteFeeItems?: (
    formSinglePrice: number | '',
  ) => { name: string; price: number }[];
}

export function useClassForm({
  mode,
  classId,
  academyId,
  onAfterSubmit,
  initialDateSchedules,
  buildCompleteFeeItems,
}: UseClassFormOptions) {
  const { toast } = useToast();
  const { navigate } = useNavigation();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // 연타 가드 — isSubmitting state 는 비동기라 빠른 연타에 두 번째 제출이 통과할 수 있어
  //   동기 ref 로 실제 제출(POST) 진입을 1회로 제한한다.
  const submittingRef = useRef(false);

  const getClubId = useCallback(async (): Promise<string | null> => {
    // [수정 2026-05-11] edit/delete 모드에서 classId 가 주어진 경우, 정확한 teamId 를 클래스 본인에서 추출.
    //  · 기존엔 /teams/managed/list 의 첫 팀을 무조건 사용 → 본인이 관리하는 팀이 여러 개일 때
    //    다른 팀 소속 클래스 수정/삭제 시 404 (잘못된 팀에서 검색).
    //  · 해결: classId 가 있으면 /classes/{classId} 로 정확한 teamId 조회.
    if (classId) {
      type ClassWithTeam = {
        clubId?: string;
        teamId?: string;
        club?: { id?: string };
        team?: { id?: string };
      };
      const baseRes = await api.get<ClassWithTeam>(`/classes/${classId}`);
      if (baseRes.success && baseRes.data) {
        const id =
          baseRes.data.teamId ??
          baseRes.data.clubId ??
          baseRes.data.team?.id ??
          baseRes.data.club?.id ??
          null;
        if (id) return id;
      }
    }
    // create 모드 또는 fallback — 본인 관리 팀의 첫 팀 사용 (단일 팀 코치 호환)
    const clubRes = await api.get<Array<{ id: string }>>('/teams/managed/list');
    if (!clubRes.success || !clubRes.data?.[0]) {
      toast.error(MESSAGES.error.general);
      return null;
    }
    return clubRes.data[0].id;
  }, [classId, toast]);

  const submitClass = useCallback(async (data: ClassFormData) => {
    const isAcademyContext = !!academyId;
    // 2026-05-22 옵션 E' — 수정 모드는 가격 영역이 ClassForm 에 없으므로 가격 검증 스킵.
    // [2026-06-09] 오픈클래스(isAcademy)는 singlePrice 대신 회차별 수강료를 쓰므로 isAcademy 를
    //   반드시 전달. 미전달 시 singlePrice 필수로 판정돼 toast 없이 return errors → 개설 버튼
    //   무반응 버그 발생(오픈클래스는 singlePrice 입력칸이 없어 화면 에러도 안 보임).
    // 수정 모드에서 일정을 변경하지 않았으면 일정 검증·전송을 스킵해 기존 일정을 보존한다.
    //   (create 는 항상 dirty — 신규 일정 전송·검증)
    const schedulesDirty =
      mode === 'create' ||
      !dateSchedulesEqual(initialDateSchedules ?? [], data.dateSchedules);
    const errors = validateClassForm(data, {
      skipPriceValidation: mode === 'edit',
      isAcademy: isAcademyContext,
      skipScheduleValidation: !schedulesDirty,
    });
    if (Object.keys(errors).length > 0) return errors;

    // 2026-05-14: 오픈클래스(academy) + 일정 자동 생성 + 등록 모드 → 4개 필드 모두 필수.
    //   [2026-06-09] 날짜별 일정(dateSchedules)을 SoT 로 사용하므로 일정이 입력되면
    //   요일 기반 자동생성 4필드 검증을 스킵한다(dateSchedules.length === 0 일 때만 동작).
    if (
      isAcademyContext &&
      mode === 'create' &&
      data.autoGenerateSchedules &&
      data.dateSchedules.length === 0
    ) {
      const academyErrors: FormErrors = {};
      if (!data.startDate) {
        academyErrors.startDate = MESSAGES.classesEdit.validation.academyAutoGenStartDate;
      }
      if (!data.endDate) {
        academyErrors.endDate = MESSAGES.classesEdit.validation.academyAutoGenEndDate;
      }
      if (!data.classDays?.length) {
        academyErrors.classDays = MESSAGES.classesEdit.validation.academyAutoGenClassDays;
      }
      if (!data.startTimeOnly && !data.startTime) {
        academyErrors.startTimeOnly = MESSAGES.classesEdit.validation.academyAutoGenStartTime;
      }
      if (Object.keys(academyErrors).length > 0) {
        toast.error(MESSAGES.classesEdit.validation.academyAutoGenRequiredToast);
        return academyErrors;
      }
    }

    // 연타 가드 — 이미 제출 진행 중이면 무시 (검증 통과 후, POST 직전).
    if (submittingRef.current) return null;
    submittingRef.current = true;
    setIsSubmitting(true);
    // 성공 시 완료 페이지로 전환되는데 replace 는 비동기라 전환 지연 구간이 생긴다.
    //   그 사이 재클릭으로 중복 생성되지 않도록, 전환을 시작한 경우엔 ref 를 풀지 않는다.
    let navigated = false;
    try {
      // 오픈클래스 감독은 팀이 없으므로 getClubId 스킵 (academyId 만으로 등록 가능).
      const isAcademy = isAcademyContext;
      const clubId = isAcademy ? '' : await getClubId();
      if (!isAcademy && !clubId) return null;

      // 오픈클래스 등록은 항상 'lesson'.
      const effectiveTrainingType = isAcademy ? 'lesson' : data.trainingType;
      // [2026-06-09] 날짜별 일정(dateSchedules)을 SoT 로 사용. 일정이 있으면 요일 기반
      //   자동생성(startDate/endDate/classDays/daySchedules/autoGenerateSchedules)을 비활성화한다.
      //   백엔드가 dateSchedules 에서 classDays 를 파생하므로 classDays 강제 전송도 불필요.
      const usesDateSchedules = data.dateSchedules.length > 0;

      // [2026-06-05] 정규/레슨 — 요일별 시간·장소(daySchedules) 전송.
      //   백엔드가 대표값(가장 이른 요일)으로 Class.startTime/endTime/classDays/venueId 를
      //   자동 산출하지만, 하위호환을 위해 프론트도 대표값을 함께 채워 전송한다.
      //   selectedDaySchedules: 현재 선택된 요일(classDays)에 해당하는 행만 추려 정렬.
      const selectedDaySchedules: DayScheduleItem[] = sortDaySchedules(
        data.daySchedules.filter((s) => data.classDays.includes(s.dayOfWeek)),
      );
      // 대표(가장 이른 요일) 행 — startTimeOnly/endTimeOnly/venueId 파생 기준.
      const repDay = selectedDaySchedules[0];
      const effStartTimeOnly = repDay ? repDay.startTime : data.startTimeOnly;
      const effEndTimeOnly = repDay ? repDay.endTime : data.endTimeOnly;
      const effVenueId = repDay && repDay.venueId
        ? repDay.venueId
        : (data.venueId || '');

      // startDate/endDate + startTimeOnly/endTimeOnly 조합으로 ISO 변환
      let startISO = data.startTime;
      let endISO = data.endTime;

      if (data.startDate && effStartTimeOnly) {
        startISO = new Date(`${data.startDate}T${effStartTimeOnly}`).toISOString();
      } else if (startISO) {
        startISO = new Date(startISO).toISOString();
      }

      // 종료 일시: endDate가 있으면 사용, 없으면 startDate 사용
      const endDateStr = data.endDate || data.startDate;
      if (endDateStr && effEndTimeOnly) {
        endISO = new Date(`${endDateStr}T${effEndTimeOnly}`).toISOString();
      } else if (endISO) {
        endISO = new Date(endISO).toISOString();
      } else if (startISO) {
        // 폴백: 시작 1시간 후
        const fallback = new Date(startISO);
        fallback.setHours(fallback.getHours() + 1);
        endISO = fallback.toISOString();
      }

      // start<end 유효 범위일 때만 Class 레벨 시간 전송. 잘못된 범위(또는 start===end)면
      //   미전송(undefined)하여 기존값 유지 → 백엔드 updateAcademyClass start>=end 400 방지.
      const hasValidTimeRange =
        !!startISO && !!endISO && new Date(startISO) < new Date(endISO);

      const payload = {
        className: data.className.trim(),
        description: data.description.trim() || undefined,
        // 수정 모드에서는 trainingType 미전송 (BE 가드: 변경 시 BadRequest). 등록 모드에서만 전송.
        trainingType: mode === 'create' ? (effectiveTrainingType || undefined) : undefined,
        instructorName: data.selectedCoaches.length > 0
          ? data.selectedCoaches.map(c => c.name).join(', ')
          : data.instructorName.trim(),
        capacity: Number(data.capacity),
        // targetBirthYears(SoT) 전송 — 서버가 ageMin/ageMax 를 한국나이 파생값으로 기록.
        //   ageMin/ageMax 도 함께 전송해 서버 자동배치(ageChanged 감지)·하위호환 유지.
        targetBirthYears: data.targetBirthYears ?? [],
        ageMin: data.ageMin !== '' ? Number(data.ageMin) : undefined,
        ageMax: data.ageMax !== '' ? Number(data.ageMax) : undefined,
        levelRequired: data.levelRequired || undefined,
        startTime: hasValidTimeRange ? startISO : undefined,
        endTime: hasValidTimeRange ? endISO : undefined,
        isActive: data.isActive,
        coachId: data.selectedCoaches[0]?.id || data.coachId || undefined,
        // 2026-05-12: 다중 배정 코치 ID 배열 — ClassCoachAssignment 동기화 (등록=신규 생성, 수정=제거/추가).
        //   - undefined 전송 시: 변경 없음 (기존 배정 유지)
        //   - [] 전송 시: 모든 배정 제거 (코치 미지정)
        //   - 배열 전송 시: 동기화 (1번째 = LEAD)
        coachUserIds:
          data.selectedCoaches.length > 0
            ? data.selectedCoaches.map((c) => c.id)
            : undefined,
        // [2026-06-05] 대표 장소 — 정규/레슨이면 가장 이른 요일의 venueId(없으면 단일 venueId) 파생.
        venueId: effVenueId || undefined,
        // [2026-06-09] dateSchedules 사용 시 classDays 미전송 — 백엔드가 일정 날짜에서 파생.
        classDays: usesDateSchedules
          ? undefined
          : (data.classDays?.length > 0 ? data.classDays : undefined),
        // [2026-06-05] 요일별 시간·장소. 정규/레슨이고 행이 있을 때만 전송(백엔드 DTO 와 1:1).
        //   venueName 은 표시 전용이라 전송 제외. dateSchedules 사용·빈 배열이면 undefined.
        daySchedules:
          !usesDateSchedules && selectedDaySchedules.length > 0
            ? selectedDaySchedules.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                venueId: s.venueId || undefined,
              }))
            : undefined,
        // [2026-06-09] 날짜별 일정 — 팀 정규·레슨·오픈클래스 공통 전송.
        //   백엔드가 각 날짜를 ClassSchedule(scheduledDate + startTime/endTime/venueId)로 생성하고
        //   dateSchedules 에서 classDays 를 파생하므로 요일 기반 자동생성 경로와 병행하지 않는다.
        // 일정 미변경(schedulesDirty=false) 시 미전송(undefined) → 백엔드가 기존 ClassSchedule 보존.
        //   변경 시에만 전송 — 빈 배열도 전송해 "전부 삭제" 의도를 반영(백엔드 전체 교체).
        dateSchedules: schedulesDirty
          ? data.dateSchedules
              .filter((s) => s.date && s.startTime && s.endTime)
              .map((s) => ({
                date: s.date,
                startTime: s.startTime,
                endTime: s.endTime,
                venueId: s.venueId || undefined,
              }))
          : undefined,
        // [2026-05-22 옵션 F-2] 가격 페이로드.
        //   - create: 1회 수강료(singlePrice)만 전송 → 백엔드 자동 PER_SESSION 1건 생성.
        //   - edit  : 모든 가격 필드 미전송 → 기존 ClassProduct 보존.
        //   정기 패키지·다중 패키지는 수업 상세 페이지의 "수강 플랜" 섹션에서 별도 등록.
        singlePrice:
          mode === 'create' && data.singlePrice !== ''
            ? Number(data.singlePrice)
            : undefined,
        // [Phase B-5] 결제 방식 — create 모드에서만 전송 (감독 지정).
        billingMode: mode === 'create' ? data.billingMode : undefined,
        monthlyPrice: undefined,
        packageTotalSessions: undefined,
        packageWeeks: undefined,
        category: data.category || undefined,
        // 정규 수업 일정 자동 일괄 생성 폐기 — startDate/endDate/autoGenerateSchedules 미전송.
        //   일정은 등록 후 일정 관리 화면(미니달력)에서 누적 추가한다. (오픈클래스는 별도 경로)
        // 2026-05-15: 오픈클래스 노출 팀 — academy 컨텍스트에서만 전송.
        //   여기 선택된 팀 소속자에게만 이 오픈클래스가 노출된다 (ClassTeamVisibility).
        visibleTeamIds: isAcademy
          ? data.selectedVisibleTeams.map((t) => t.id)
          : undefined,
      };

      let res;
      if (isAcademy) {
        // 오픈클래스 분기 — 등록 + 수정 모두 지원 (2026-05-15 BE PUT 엔드포인트 추가).
        if (mode === 'create') {
          res = await api.post(`/academies/${academyId}/classes`, payload);
        } else {
          res = await api.put(`/academies/${academyId}/classes/${classId}`, payload);
        }
      } else if (mode === 'create') {
        res = await api.post(`/teams/${clubId}/classes`, payload);
      } else {
        res = await api.put(`/teams/${clubId}/classes/${classId}`, payload);
      }

      if (res.success) {
        // 신규 등록 시 응답 id 추출, 수정 시 입력 classId 사용. complete 페이지에서
        // PackageManageSection 호출에 필요 (2026-05-22 옵션 A).
        const createdClassId =
          (res.data as { id?: string } | undefined)?.id ?? classId ?? '';

        // 완료 페이지에 object 형태로 전달 (모듈 스코프 변수)
        const _totalSessions =
          data.totalClassDays !== '' && Number(data.totalClassDays) > 0
            ? Number(data.totalClassDays)
            : undefined;
        const _perWeek = data.classDays.length > 0 ? data.classDays.length : undefined;
        const _weeks =
          _totalSessions && _perWeek
            ? Math.ceil(_totalSessions / _perWeek)
            : undefined;
        setClassCompleteData({
          mode,
          classId: createdClassId,
          className: data.className,
          instructorName: data.instructorName,
          venue: data.venue,
          venueAddress: data.venueAddress,
          classDays: data.classDays,
          startDate: data.startDate,
          endDate: data.endDate,
          // [2026-06-05] 정규/레슨이면 대표(가장 이른 요일) 시각을 표시값으로 사용.
          startTimeOnly: effStartTimeOnly,
          endTimeOnly: effEndTimeOnly,
          daySchedules:
            selectedDaySchedules.length > 0
              ? selectedDaySchedules.map((s) => ({
                  dayOfWeek: s.dayOfWeek,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  venueName: s.venueName,
                }))
              : undefined,
          // 개별 날짜 일정(미니달력) — complete 화면에서 일정별 시간·장소 나열·기간 산출.
          dateSchedules:
            data.dateSchedules.length > 0
              ? data.dateSchedules
                  .filter((s) => s.date)
                  .map((s) => ({
                    date: s.date,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    venueName: s.venueName,
                  }))
              : undefined,
          singlePrice: data.singlePrice,
          monthlyPrice: data.monthlyPrice,
          // 완료 화면 수강료 — 전체 패키지 목록(빌더 제공 시). 변경 가격·다중 정기권 정확 반영.
          feeItems: buildCompleteFeeItems?.(data.singlePrice),
          capacity: data.capacity,
          ageMin: data.ageMin,
          ageMax: data.ageMax,
          targetBirthYears: data.targetBirthYears,
          packageWeeks: _weeks,
          packageTotalSessions: _totalSessions,
          packageSessionsPerWeek: _perWeek,
        });
        // 폼 PUT 성공 후 패키지(ClassProduct) 일괄 반영 — 수정 페이지가 연결한 경우만.
        //   패키지 bulk 실패 시 완료 페이지로 이동하지 않고 부분 실패로 처리(재시도 유도).
        if (onAfterSubmit && createdClassId) {
          const afterOk = await onAfterSubmit(createdClassId);
          if (!afterOk) return null;
        }
        // replace — 등록/수정 폼 엔트리를 완료 페이지로 교체. 뒤로가기 시 빈 폼으로
        // 복귀해 재등록(중복 생성)을 유도하던 흐름을 차단하고 수업 관리 목록으로 보낸다.
        navigated = true;
        router.replace('/classes-manage/complete');
        return null;
      } else {
        toast.error(res.error?.message ?? MESSAGES.save.error);
        return null;
      }
    } catch {
      toast.error(MESSAGES.error.general);
      return null;
    } finally {
      setIsSubmitting(false);
      // 완료 페이지로 전환을 시작한 경우엔 ref 를 유지 — 전환 지연 구간의 재클릭 중복 생성 차단.
      //   실패(전환 안 함) 시에만 해제해 재시도를 허용한다.
      if (!navigated) submittingRef.current = false;
    }
  }, [mode, classId, academyId, getClubId, toast, router, onAfterSubmit, initialDateSchedules, buildCompleteFeeItems]);

  const deleteClass = useCallback(async () => {
    if (!classId) return;

    setIsDeleting(true);
    try {
      // PR-E C3: 학원(오픈클래스) 분기 — DELETE /academies/:academyId/classes/:classId
      let res;
      if (academyId) {
        res = await api.delete(`/academies/${academyId}/classes/${classId}`);
      } else {
        const clubId = await getClubId();
        if (!clubId) return;
        res = await api.delete(`/teams/${clubId}/classes/${classId}`);
      }

      if (res.success) {
        toast.success(MESSAGES.delete.success);
        navigate('/classes-manage');
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsDeleting(false);
    }
  }, [classId, academyId, getClubId, toast, navigate]);

  return {
    submitClass,
    deleteClass,
    isSubmitting,
    isDeleting,
  };
}
