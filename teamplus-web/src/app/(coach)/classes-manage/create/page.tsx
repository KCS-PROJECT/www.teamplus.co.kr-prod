'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, usePathname, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useClassForm, ClassFormData } from '@/hooks/useClassForm';
import { useAuth } from '@/contexts/AuthContext';
import { useMyAcademies } from '@/hooks/useAcademy';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import {
  listClassProducts,
  bulkUpsertClassProducts,
  type BulkUpsertItem,
} from '@/services/class-product.service';
import type { DraftProduct } from '@/components/classes/PackageManageSection';

// [추가 2026-05-11] 요일 표기 한글 통일 + 월요일 시작 정렬 — DB EN/KR 혼재 정정.
const DAY_NORMALIZE_MAP: Record<string, string> = {
  '일': '일', '월': '월', '화': '화', '수': '수', '목': '목', '금': '금', '토': '토',
  SUN: '일', SUNDAY: '일', MON: '월', MONDAY: '월',
  TUE: '화', TUES: '화', TUESDAY: '화', WED: '수', WEDNESDAY: '수',
  THU: '목', THUR: '목', THURSDAY: '목', FRI: '금', FRIDAY: '금',
  SAT: '토', SATURDAY: '토',
};
const DAY_ORDER_MON_FIRST: Record<string, number> = {
  '월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5, '일': 6,
};
function normalizeDaysKR(input: unknown): import('@/hooks/useClassForm').DayOfWeek[] {
  if (!Array.isArray(input)) return [];
  const k = input
    .map((d) => {
      const t = String(d ?? '').trim();
      return DAY_NORMALIZE_MAP[t] ?? DAY_NORMALIZE_MAP[t.toUpperCase()] ?? '';
    })
    .filter((d): d is string => Boolean(d));
  const uniq = Array.from(new Set(k));
  uniq.sort((a, b) => (DAY_ORDER_MON_FIRST[a] ?? 99) - (DAY_ORDER_MON_FIRST[b] ?? 99));
  return uniq as import('@/hooks/useClassForm').DayOfWeek[];
}


// [2026-05-09] 사용자 요청 — 중복 loading bar 제거.
//   글로벌 LoadingProvider/LoadingPuck 가 페이지 전환 로딩을 이미 처리하므로
//   inline spinner 는 시각 중복. loading: null 로 설정해 깜빡임 차단.
const ClassForm = dynamic(() => import('@/components/classes/ClassForm').then(mod => ({ default: mod.ClassForm })), {
  ssr: false,
  loading: () => null,
});

// [2026-06-04] 수업 수정 모드 전용 — 수강료(패키지) 추가·수정·삭제 섹션.
//   ClassForm edit 모드는 가격 입력을 숨기므로, 비용 관리는 본 섹션에서 수행한다.
//   (그동안 어디에서도 렌더되지 않아 "수업수정 비용 수정 안됨" 회귀가 있었음.)
// [2026-06-22] 수업 수정 수강료 카드 — 선불/후불 공통.
//   1회 수강료/수업료(PER_SESSION) 단가 입력 + 선불일 때 정기 패키지(embed) 관리.
const FeeEditCard = dynamic(
  () =>
    import('@/components/classes/FeeEditCard').then(mod => ({
      default: mod.FeeEditCard,
    })),
  { ssr: false, loading: () => null },
);

/* ────────────────────────────────────────────
   Inner — useSearchParams는 Suspense 내부에서 사용
   ──────────────────────────────────────────── */

function ClassCreatePageInner() {
  const searchParams = useSearchParams();
  const routeParams = useParams();
  // [수정 2026-05-15] editClassId 출처 — ?edit= 쿼리(팀 수업) 또는 [id] 동적 라우트(오픈클래스 수정).
  //   /academy-classes/edit/[id] 라우트가 이 컴포넌트를 재사용하므로 params.id 도 fallback.
  const editClassId =
    searchParams?.get('edit') ?? (routeParams?.id as string | undefined) ?? null;
  const isEditMode = !!editClassId;

  // [수정 2026-05-13 P2] 분기 결정 기준을 userType → URL 로 변경.
  //  /classes-manage/create → 팀 모드, /academy-classes/create → 오픈클래스 모드.
  //  오픈클래스 감독이 /classes-manage/create 직접 진입 시 안전망 redirect 로 표준 URL 동선 유도.
  //  회의 정책 (2026-04-23): 오픈클래스 감독 1명 = 오픈클래스 1개 운영. academies[0] 자동 사용.
  const pathname = usePathname();
  const { user } = useAuth();
  const { replace, back } = useNavigation();
  const isAcademyMode = (pathname ?? '').startsWith('/academy-classes');
  const { academies, isLoading: isLoadingAcademies } = useMyAcademies();
  const myAcademyId = isAcademyMode ? (academies[0]?.id ?? null) : null;
  const hasNoAcademy = isAcademyMode && !isLoadingAcademies && !myAcademyId;

  useEffect(() => {
    if (
      user?.userType?.toLowerCase() === 'academy_director' &&
      !isAcademyMode
    ) {
      // [2026-06-09] replace 로 교체 — 안전망 redirect 가 history 에 classes-manage/create 를
      //   남겨, 오픈클래스 등록 화면에서 뒤로가기 시 팀 수업등록 화면이 보이던 회귀 수정.
      replace('/academy-classes/create');
    }
  }, [user, isAcademyMode, replace]);

  const pageTitle = isEditMode ? '수업 수정' : '수업 등록';

  // [2026-05-09] Android/Native 환경에서 AppBar 영역 비어 보이는 버그 수정.
  //   기존: showAppBar:true + <PageAppBar>(forceNative 없음)
  //     → 직전 /classes-manage 페이지가 Native AppBar OFF 였고, 진입 직후 브릿지
  //       비동기 호출로 Native AppBar 켜지기 전까지 잔존 OFF 유지. 동시에
  //       PageAppBar 는 isNative 자동 숨김 → 양쪽 모두 안 보이는 빈 영역 발생.
  //   수정: 형제 목록 페이지와 동일하게 Native AppBar OFF + DOM PageAppBar forceNative.
  //     /team/create 와 동일 패턴으로 통일.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const { toast } = useToast();

  // [패키지 일괄 반영] 수정 모드 — 패키지(ClassProduct)를 로컬 보류했다가 '수정하기'에
  //   bulk 엔드포인트로 일괄 반영한다. (기존: 시트 저장 시 즉시 단건 API → 저장 시점 이원화 문제)
  const [draftProducts, setDraftProducts] = useState<DraftProduct[]>([]);
  const [productsDirty, setProductsDirty] = useState(false);

  // 폼 PUT 성공 후 호출 — draft diff 를 bulk 로 반영. 실패 시 false 반환(완료 이동 차단).
  const handleAfterSubmit = useCallback(
    async (cid: string): Promise<boolean> => {
      // 변경이 없으면 호출 자체를 생략(no-op).
      if (!productsDirty) return true;
      const upserts: BulkUpsertItem[] = draftProducts
        .filter((d) => !d._deleted)
        .map((d) => ({
          ...(d.serverId ? { id: d.serverId } : {}),
          productName: d.productName,
          price: d.price,
          feeType: d.feeType,
          sessionsPerMonth: d.sessionsPerMonth,
          ...(d.sessionsPerWeek != null
            ? { sessionsPerWeek: d.sessionsPerWeek }
            : {}),
          ...(d.durationDays != null ? { durationDays: d.durationDays } : {}),
          ...(d.description ? { description: d.description } : {}),
        }));
      const deleteIds = draftProducts
        .filter((d) => d._deleted && d.serverId)
        .map((d) => d.serverId as string);

      if (upserts.length === 0 && deleteIds.length === 0) return true;

      const result = await bulkUpsertClassProducts(cid, { upserts, deleteIds });
      if (!result) {
        // 폼은 저장됐으나 패키지 반영 실패 — 명확히 안내하고 완료 이동을 막아 재시도 유도.
        toast.error(MESSAGES.classProduct.bulkSaveFailed);
        return false;
      }
      setProductsDirty(false);
      return true;
    },
    [draftProducts, productsDirty, toast],
  );

  // [2026-06-22] 완료 페이지 수강료 목록 — 수정: draft 전체(1회권+정기권) / 등록: 폼 1회권 + 추가 정기권.
  //   PER_SESSION → 정기권(회차 오름차순) 순으로 정렬. 변경 가격·다중 정기권을 정확히 반영한다.
  const buildCompleteFeeItems = useCallback(
    (formSinglePrice: number | '') => {
      const active = draftProducts.filter((d) => !d._deleted);
      const order = (d: DraftProduct) =>
        d.feeType === 'PER_SESSION'
          ? -1
          : d.feeType === 'MONTHLY_FIXED'
            ? d.sessionsPerMonth ?? 0
            : 1_000_000;
      const sorted = [...active].sort((a, b) => order(a) - order(b));
      if (isEditMode) {
        return sorted.map((d) => ({ name: d.productName, price: d.price }));
      }
      // 등록 — 1회권은 폼 입력값(백엔드 자동 생성), 정기권은 추가 draft.
      const items: { name: string; price: number }[] = [];
      if (formSinglePrice !== '' && Number(formSinglePrice) > 0) {
        items.push({
          name: MESSAGES.classProduct.singlePriceLabel,
          price: Number(formSinglePrice),
        });
      }
      sorted
        .filter((d) => d.feeType !== 'PER_SESSION')
        .forEach((d) => items.push({ name: d.productName, price: d.price }));
      return items;
    },
    [draftProducts, isEditMode],
  );

  // 수정 모드: 기존 수업 데이터 로딩 (useClassForm 일정 변경 감지에 initialData.dateSchedules 사용)
  const [initialData, setInitialData] = useState<Partial<ClassFormData> | undefined>(undefined);

  const { submitClass, deleteClass, isSubmitting, isDeleting } = useClassForm({
    mode: isEditMode ? 'edit' : 'create',
    classId: editClassId ?? undefined,
    // 오픈클래스 감독 — academyId 전달 시 useClassForm 이
    // POST /academies/{id}/classes 로 분기하고 trainingType='lesson' 강제.
    academyId: myAcademyId ?? undefined,
    // 패키지 일괄 반영 — 수정/등록 공통. 등록도 수업 생성 후 추가 패키지(정기권 등)를 bulk 반영.
    //   변경 없으면 handleAfterSubmit 가 no-op 이므로 기존 등록 흐름(1회권만)과 동일.
    onAfterSubmit: handleAfterSubmit,
    // 일정 변경 감지 — prefill 스냅샷과 비교해 미변경 시 일정 전송·검증을 스킵(기존 일정 보존).
    initialDateSchedules: initialData?.dateSchedules,
    // 완료 페이지 수강료 목록 — 변경된 패키지 가격·다중 정기권을 정확히 표시.
    buildCompleteFeeItems,
  });
  const [isLoadingData, setIsLoadingData] = useState(isEditMode);
  const [enrollmentCount, setEnrollmentCount] = useState(0);
  const [clubId, setClubId] = useState('');

  usePageReady(!isLoadingData && !(isAcademyMode && isLoadingAcademies));

  const fetchClassData = useCallback(async () => {
    if (!editClassId) return;
    setIsLoadingData(true);
    try {
      // [수정 2026-05-11] 본인 관리 팀 중 첫 번째를 무조건 사용하던 버그 수정.
      //  · 본인이 관리하는 팀이 여러 개일 때, 수정하려는 클래스가 두 번째 이후 팀 소속이면
      //    "수업을 찾을 수 없습니다" 404 발생 (예: 임감독이 [타이탄스, 블리자드] 관리,
      //    5월 정규수업(블리자드) 수정 시도 → 타이탄스에서 검색 → 404).
      //  · 해결: 공용 `/classes/{classId}` 로 먼저 클래스 정보 조회 → 응답의 clubId/teamId 사용.
      type ClassWithTeam = {
        clubId?: string;
        teamId?: string;
        club?: { id?: string };
        team?: { id?: string };
        [k: string]: unknown;
      };
      const baseRes = await api.get<ClassWithTeam>(`/classes/${editClassId}`);
      if (!baseRes.success || !baseRes.data) {
        setIsLoadingData(false);
        return;
      }
      // [수정 2026-05-15] 오픈클래스(academyId, teamId 없음) 분기.
      //   /classes/{id} (getClass) 응답이 이미 전체 필드 + visibleTeams 를 포함하므로
      //   팀 수업처럼 /teams/.../classes/... 2차 호출이 필요 없다.
      const isAcademyClass = !!baseRes.data.academyId && !baseRes.data.teamId;
      let d: Record<string, unknown> | null = null;

      if (isAcademyClass) {
        d = baseRes.data as Record<string, unknown>;
      } else {
        const fetchedClubId =
          baseRes.data.teamId ??
          baseRes.data.clubId ??
          baseRes.data.team?.id ??
          baseRes.data.club?.id ??
          '';
        if (!fetchedClubId) {
          setIsLoadingData(false);
          return;
        }
        setClubId(fetchedClubId);
        const res = await api.get<Record<string, unknown>>(
          `/teams/${fetchedClubId}/classes/${editClassId}`,
        );
        d = res.success && res.data ? res.data : null;
      }

      if (d) {
        // startTime/endTime에서 날짜·시간 분리
        let startDate = '';
        let endDate = '';
        let startTimeOnly = '';
        let endTimeOnly = '';

        if (d.startTime) {
          const st = new Date(d.startTime as string);
          if (!isNaN(st.getTime())) {
            startDate = st.toISOString().slice(0, 10);
            startTimeOnly = `${String(st.getHours()).padStart(2, '0')}:${String(st.getMinutes()).padStart(2, '0')}`;
          }
        }
        if (d.endTime) {
          const et = new Date(d.endTime as string);
          if (!isNaN(et.getTime())) {
            endDate = et.toISOString().slice(0, 10);
            endTimeOnly = `${String(et.getHours()).padStart(2, '0')}:${String(et.getMinutes()).padStart(2, '0')}`;
          }
        }

        // 수강생 수 저장
        setEnrollmentCount(
          (d.currentEnrollment as number) ??
          (Array.isArray(d.enrollments) ? (d.enrollments as unknown[]).length : 0)
        );

        // 날짜별 일정(ClassSchedule) prefill — 수정 화면에 등록 일정 복원.
        let dateSchedulesPrefill: Array<{
          key: string;
          date: string;
          startTime: string;
          endTime: string;
          venueId: string;
          venueName?: string;
        }> = [];
        // 모든 수업(팀 정규·레슨·오픈)이 등록 일정을 복원한다.
        {
          const schedRes = await api.get<
            Array<{
              scheduledDate: string;
              startTime?: string | null;
              endTime?: string | null;
              venueId?: string | null;
              venue?: { name?: string } | null;
              isCancelled?: boolean;
            }>
          >(`/classes/${editClassId}/schedules`);
          if (schedRes.success && Array.isArray(schedRes.data)) {
            dateSchedulesPrefill = schedRes.data
              .filter((s) => !s.isCancelled)
              .map((s, i) => ({
                key: `ds-edit-${i}`,
                // [2026-06-09] toISOString(UTC)은 KST 자정을 전날로 밀어버리므로 로컬 기준으로 추출.
                date: (() => {
                  const dt = new Date(s.scheduledDate);
                  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                })(),
                startTime: s.startTime ?? '',
                endTime: s.endTime ?? '',
                venueId: s.venueId ?? '',
                venueName: s.venue?.name ?? '',
              }));
          }
        }

        setInitialData({
          className: (d.className ?? d.name ?? '') as string,
          description: (d.description ?? '') as string,
          trainingType: (d.trainingType ?? d.programCategory ?? '') as string,
          instructorName: (d.instructorName ?? d.coachName ?? '') as string,
          capacity: (d.capacity as number) ?? 15,
          ageMin: (d.ageMin as number) ?? '',
          ageMax: (d.ageMax as number) ?? '',
          // [대상 출생연도 SoT] 수정 모드 복원 — 개별/비연속 선택 그대로 체크 표시.
          targetBirthYears: Array.isArray(d.targetBirthYears)
            ? (d.targetBirthYears as number[])
            : [],
          levelRequired: (d.levelRequired ?? '') as string,
          startDate,
          endDate,
          startTimeOnly,
          endTimeOnly,
          // [수정 2026-05-11] 영어/한글 혼재 정규화 + 월요일 시작 정렬.
          classDays: normalizeDaysKR(d.classDays),
          startTime: (d.startTime ?? '') as string,
          endTime: (d.endTime ?? '') as string,
          isActive: d.isActive !== false,
          coachId: (d.coachId ?? '') as string,
          // [2026-05-12] 다중 코치 배정 복원 — coachAssignments 우선, fallback 으로 coachId 단일.
          selectedCoaches: Array.isArray(d.coachAssignments) &&
            (d.coachAssignments as unknown[]).length > 0
            ? (d.coachAssignments as Array<{
                coachUserId: string;
                coachName: string;
                role: string;
                coachUserType?: string | null;
              }>).map((a) => ({
                id: a.coachUserId,
                name: a.coachName,
                role:
                  a.coachUserType === 'DIRECTOR'
                    ? '감독'
                    : a.coachUserType === 'ACADEMY_DIRECTOR'
                      ? '감독'
                      : '코치',
              }))
            : d.coachId && (d.instructorName || d.coachName)
              ? [{ id: d.coachId as string, name: ((d.instructorName ?? d.coachName) as string) }]
              : [],
          venueId: (d.venueId ?? '') as string,
          venue: (d.venueName ?? d.venue ?? '') as string,
          venueAddress: (d.venueAddress ?? d.venueSub ?? '') as string,
          singlePrice: (d.products as Array<{ feeType?: string; price?: number }>)?.find(p => p.feeType === 'PER_SESSION' || p.feeType === 'single')?.price ?? (d.price as number) ?? '',
          monthlyPrice: (d.products as Array<{ feeType?: string; price?: number }>)?.find(p => p.feeType === 'MONTHLY_FIXED')?.price ?? '',
          // PACKAGE_WEEKS_SPEC §3 — 응답의 packageWeeks 복원 (durationDays 폴백).
          packageWeeks: (() => {
            const flat = (d as { packageWeeks?: number }).packageWeeks;
            if (typeof flat === 'number' && flat > 0) return flat;
            const monthlyProduct = (d.products as Array<{ feeType?: string; durationDays?: number }>)?.find(
              (p) => p.feeType === 'MONTHLY_FIXED',
            );
            if (monthlyProduct?.durationDays) return Math.max(1, Math.round(monthlyProduct.durationDays / 7));
            return '' as const;
          })(),
          packageMode: 'weeks' as const,
          // [Phase B-5] 결제 방식 복원 — 후불 수업은 PackageManageSection 패키지 추가 차단에 사용.
          billingMode: (d.billingMode === 'POSTPAID' ? 'POSTPAID' : 'PREPAID') as
            | 'PREPAID'
            | 'POSTPAID',
          category: (d.category ?? '') as string,
          // [2026-05-15] 오픈클래스 노출 팀 복원 — getClass 응답의 visibleTeams 매핑.
          selectedVisibleTeams: Array.isArray(d.visibleTeams)
            ? (d.visibleTeams as Array<{ id: string; name: string; teamCode?: string | null }>).map(
                (t) => ({ id: t.id, name: t.name, teamCode: t.teamCode ?? null }),
              )
            : [],
          // [2026-06-05] 요일별 시간·장소(daySchedules) prefill — getClass 응답의
          //   { dayOfWeek, startTime("HH:mm"), endTime, venueId, venueName } 를 폼 상태로 매핑.
          //   요일은 한글로 정규화. venueId/venueName 미존재 시 빈/undefined 폴백.
          daySchedules: Array.isArray(d.daySchedules)
            ? (d.daySchedules as Array<{
                dayOfWeek: string;
                startTime: string;
                endTime: string;
                venueId?: string | null;
                venueName?: string | null;
              }>)
                .map((s) => {
                  const dow = normalizeDaysKR([s.dayOfWeek])[0];
                  if (!dow) return null;
                  return {
                    dayOfWeek: dow,
                    startTime: s.startTime ?? '',
                    endTime: s.endTime ?? '',
                    venueId: s.venueId ?? '',
                    venueName: s.venueName ?? undefined,
                  };
                })
                .filter(
                  (s): s is NonNullable<typeof s> => s !== null,
                )
            : [],
          // [2026-06-09] 오픈클래스 날짜별 일정 prefill.
          dateSchedules: dateSchedulesPrefill,
        });
      }
    } catch {
      // 에러 시 빈 폼으로 유지
    } finally {
      setIsLoadingData(false);
    }
  }, [editClassId]);

  useEffect(() => {
    if (isEditMode) fetchClassData();
  }, [isEditMode, fetchClassData]);

  // [패키지 일괄 반영] 수정 모드 진입 시 기존 패키지를 draft 로 로딩(serverId 채움).
  useEffect(() => {
    if (!isEditMode || !editClassId) return;
    let mounted = true;
    (async () => {
      const list = await listClassProducts(editClassId);
      if (!mounted) return;
      setDraftProducts(
        list.map((p, i) => ({
          localKey: `init-${i}`,
          serverId: p.id,
          productName: p.productName,
          price: p.price,
          feeType: p.feeType ?? 'MONTHLY_FIXED',
          sessionsPerMonth: p.sessionsPerMonth ?? 1,
          sessionsPerWeek: p.sessionsPerWeek ?? undefined,
          durationDays: p.durationDays ?? undefined,
          description: p.description ?? undefined,
        })),
      );
      setProductsDirty(false);
    })();
    return () => {
      mounted = false;
    };
  }, [isEditMode, editClassId]);

  const handleProductsChange = useCallback((next: DraftProduct[]) => {
    setDraftProducts(next);
    setProductsDirty(true);
  }, []);

  // 1회 수강료/수업료 단가 — draft 의 PER_SESSION 항목 price 를 직접 갱신(선불·후불 공통).
  //   기존 handleAfterSubmit bulk(update, id 포함)로 단가가 반영된다.
  const perSessionProduct = draftProducts.find(
    (d) => d.feeType === 'PER_SESSION' && !d._deleted,
  );
  const perSessionPrice: number | '' = perSessionProduct?.price ?? '';
  const handlePerSessionPriceChange = useCallback(
    (price: number | '') => {
      setDraftProducts((prev) =>
        prev.map((d) =>
          d.feeType === 'PER_SESSION' && !d._deleted
            ? { ...d, price: typeof price === 'number' ? price : 0 }
            : d,
        ),
      );
      setProductsDirty(true);
    },
    [],
  );

  // [이탈 가드 1/2] 브라우저 새로고침·탭 닫기 — 보류된 패키지 변경 유실 경고.
  useEffect(() => {
    if (!productsDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [productsDirty]);

  // [이탈 가드 2/2] 앱 내 명시적 이탈(AppBar 뒤로가기) — dirty 면 확인 후 진행.
  //   ※ Flutter 네이티브 하드웨어 뒤로가기는 DOM AppBar 를 거치지 않아 가로채지 못한다
  //     (전역 route-change 인터셉트는 과도하여 미적용). beforeunload + 본 가드 + dirty 배너로
  //     명시적 이탈 경로를 커버한다.
  const handleBack = useCallback(() => {
    if (productsDirty && typeof window !== 'undefined') {
      const ok = window.confirm(MESSAGES.classProduct.unsavedLeaveConfirm);
      if (!ok) return;
    }
    back();
  }, [productsDirty, back]);


  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar
        title={pageTitle}
        forceNative
        titleClassName="text-card-section font-bold"
        onBack={handleBack}
      />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck px-5 pt-4 pb-[100px]"
        role="main"
        aria-label={pageTitle}
        aria-busy={isLoadingData}
      >
        {isLoadingData || (isAcademyMode && isLoadingAcademies) ? (
          <div className="sr-only" role="status" aria-live="polite">
            수업 정보를 불러오는 중입니다.
          </div>
        ) : hasNoAcademy ? (
          /* 오픈클래스 감독인데 운영 중인 오픈클래스이 0개 — 오픈클래스 생성 페이지로 안내. */
          <section
            className="rounded-[20px] bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sh-1 p-8 mt-4 flex flex-col items-center text-center"
            role="status"
            aria-live="polite"
          >
            <div className="w-16 h-16 rounded-full bg-wline-2 dark:bg-rink-700 flex items-center justify-center mb-4">
              <Icon name="school" className="text-3xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
            </div>
            <h2 className="text-card-title font-extrabold text-wtext-1 dark:text-white tracking-[-0.02em] mb-2">
              {MESSAGES.academy.noAcademyTitle}
            </h2>
            <p className="text-card-body text-wtext-3 dark:text-rink-300 leading-relaxed mb-6">
              {MESSAGES.academy.noAcademyDescription}
            </p>
            <NavLink
              href="/academy/create"
              className="h-12 px-6 rounded-xl bg-ice-500 hover:bg-ice-700 text-white text-card-body font-extrabold tracking-[-0.02em] inline-flex items-center justify-center transition-colors active:brightness-90"
            >
              {MESSAGES.academy.createAcademyCta}
            </NavLink>
          </section>
        ) : (
          <>
            {/* [2026-06] 수강료 통합 — 수정 모드의 패키지 관리(PackageManageSection)를 ClassForm
                'SECTION 4: 수강료' 자리에 임베드한다. create 모드는 ClassForm 내부 1회권 입력 사용.
                동일 ClassProduct 도메인을 한 자리에서 관리(기존 '디렉터 전용 설정' + 별도 패키지 영역 통합). */}
            <ClassForm
              mode={isEditMode ? 'edit' : 'create'}
              initialData={initialData}
              onSubmit={submitClass}
              onDelete={isEditMode ? deleteClass : undefined}
              isSubmitting={isSubmitting}
              isDeleting={isDeleting}
              enrollmentCount={enrollmentCount}
              context={isAcademyMode ? 'academy' : 'team'}
              academyId={myAcademyId ?? undefined}
              // 등록 모드 추가 패키지(선불) — ClassForm 내부에서 PackageManageSection 렌더에 사용.
              packageDraftValue={draftProducts}
              onPackageDraftChange={handleProductsChange}
              packageDirty={productsDirty}
              pricingSection={
                isEditMode && editClassId ? (
                  // 선불/후불 공통 수강료 카드 — 1회 단가 입력 + (선불) 정기 패키지 embed.
                  <FeeEditCard
                    billingMode={
                      initialData?.billingMode === 'POSTPAID'
                        ? 'POSTPAID'
                        : 'PREPAID'
                    }
                    perSessionPrice={perSessionPrice}
                    onPerSessionPriceChange={handlePerSessionPriceChange}
                    classId={editClassId}
                    packageValue={draftProducts}
                    onPackageChange={handleProductsChange}
                    packageDirty={productsDirty}
                    classSessionsPerWeek={initialData?.classDays?.length}
                  />
                ) : undefined
              }
            />
            {/* 코치 배정은 /coach-assignments 페이지에서 관리 */}
          </>
        )}
      </main>
    </MobileContainer>
  );
}

/* ────────────────────────────────────────────
   Page Export — Suspense 경계로 useSearchParams 보호
   ──────────────────────────────────────────── */

export default function ClassCreatePage() {
  return (
    <Suspense fallback={
      <MobileContainer hasBottomNav={false}>
        <PageAppBar
          title="수업"
          forceNative
          titleClassName="text-card-section font-bold"
        />
      </MobileContainer>
    }>
      <ClassCreatePageInner />
    </Suspense>
  );
}
