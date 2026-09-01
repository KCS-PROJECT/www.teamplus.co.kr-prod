'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { formatDaySchedulesFull } from '@/lib/class-categories';
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
// 제안 금액 요일 칩 노출 순서 — 월요일 시작 (가격 계산 도우미와 동일 관례).
const CALC_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** 금액 표시 — 저장값(숫자 문자열)을 콤마 표기로. 빈 값은 그대로. */
function formatPriceDisplay(raw: string): string {
  return raw === '' ? '' : Number(raw).toLocaleString();
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
  const { navigate } = useNavigation();

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
  const [isSubmittingDates, setIsSubmittingDates] = useState(false);
  const { year: serverYear, month: serverMonth } = useDateTime();
  const initialYear = useMemo(() => {
    const y = Number(serverYear);
    return Number.isFinite(y) && y > 0 ? y : new Date().getFullYear();
  }, [serverYear]);
  const initialMonth = useMemo(() => {
    const m = Number(serverMonth);
    return Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getMonth() + 1;
  }, [serverMonth]);

  const fetchClass = useCallback(async () => {
    if (!classId) return;
    const res = await api.get<ClassHeader>(`/classes/${classId}`);
    if (res.success && res.data) {
      setCls(res.data);
    } else if (res.error?.statusCode === 403) {
      // 비소속 매니저의 일정 관리 페이지 직접 접근 차단.
      toast.error(MESSAGES.class.accessDenied);
      const path = getDashboardPathByUserType(user?.userType) ?? '/';
      router.replace(path);
    }
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
  const isSpot = cls?.trainingType === 'spot';
  const spotLimitReached = isSpot && schedules.length >= 1;

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
  const [pkgPrices, setPkgPrices] = useState<Record<string, string>>({});
  const [pkgNames, setPkgNames] = useState<Record<string, string>>({});
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
      setMonthlyPkgs(
        list.filter(
          (pkg) => pkg.feeType === 'MONTHLY_FIXED' && pkg.isActive !== false,
        ),
      );
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
  // 갱신 필요 목록 — 이름별 "최신 분"(billingMonth 내림차순, 무월=가장 오래됨) 1건.
  const needsUpdate = (() => {
    const seen = new Set<string>();
    const byLatestMonth = [...(monthlyPkgs ?? [])].sort((a, b) =>
      (b.billingMonth ?? '').localeCompare(a.billingMonth ?? ''),
    );
    return byLatestMonth.filter((pkg) => {
      const isTarget = pkg.billingMonth?.slice(0, 7) === targetMonthKey;
      if (
        isTarget ||
        updatedNames.has(pkg.productName) ||
        seen.has(pkg.productName)
      ) {
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
      try {
        // §9.2 "동일 내용 복제" — 단위 필드 3종 패스스루.
        const res = await api.post(`/classes/${classId}/products`, {
          productName: name,
          description: pkg.description ?? undefined,
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
    [classId, targetMonthKey, pkgPrices, pkgNames, toast, fetchMonthlyPkgs, retireSourceRow],
  );

  // [이번 달 구성에서 제외] — 새 행을 만들지 않고 원본만 소진. 이번 달부터 팔지 않을
  //   항목을 갱신 목록에서 정리하는 정식 경로 (예전 이름 매칭 잔재 행 정리도 겸용).
  const handleExcludePkg = useCallback(
    async (pkg: MonthlyPkg) => {
      if (targetMonthLabel === null) return;
      const ok = await modal.confirm({
        title: MESSAGES.class.salesCycle.excludeTitle,
        message: MESSAGES.class.salesCycle.excludeConfirm(
          pkg.productName,
          targetMonthLabel,
        ),
      });
      if (!ok) return;
      setPkgSubmitting(pkg.id);
      try {
        if (await retireSourceRow(pkg.id)) {
          toast.success(
            MESSAGES.class.salesCycle.excludeSuccess(pkg.productName),
          );
          await fetchMonthlyPkgs();
        }
      } finally {
        setPkgSubmitting(null);
      }
    },
    [modal, targetMonthLabel, retireSourceRow, toast, fetchMonthlyPkgs],
  );

  // ── 등록 완료(대상월분) 항목 수정 — [등록하기] 즉시 확정 이후의 정정 경로.
  //    판매 시작 전에는 대상월분이 가격 잠금 대상이 아니라 이름·금액 PATCH 가능.
  const targetMonthRows = (monthlyPkgs ?? []).filter(
    (p) => p.billingMonth && p.billingMonth.slice(0, 7) === targetMonthKey,
  );
  const [editingDoneId, setEditingDoneId] = useState<string | null>(null);
  const [doneName, setDoneName] = useState('');
  const [donePrice, setDonePrice] = useState('');
  const [doneSaving, setDoneSaving] = useState(false);
  const startEditDone = (pkg: MonthlyPkg) => {
    setEditingDoneId(pkg.id);
    setDoneName(pkg.productName);
    setDonePrice(String(pkg.price));
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
  }, [classId, toast, modal, navigate, needsUpdate, targetMonthLabel]);

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
  // 헤더 기본 일정 요약 — "월 17:00~18:00 A링크장 / 수 …" (정규 요일 템플릿이 있을 때만).
  const dayTemplateLabel = useMemo(
    () =>
      formatDaySchedulesFull(
        activeDayDefaults.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          startTime: d.startTime,
          endTime: d.endTime,
          venueName: d.venueName ?? undefined,
        })),
      ),
    [activeDayDefaults],
  );
  const monthFill = useMemo(() => {
    if (isSpot || activeDayDefaults.length === 0) return null;
    const weekdaySet = new Set(activeDayDefaults.map((s) => s.dayOfWeek));
    const existing = new Set(registeredDates);
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
    // 잔여 일정이 있으면 대상월 고정 — 판매 준비 섹션과 동일 달을 가리킨다.
    //   잔여 일정은 오늘 이후이므로 대상월은 이번 달 이상: 이번 달이면 오늘부터, 미래 달이면 1일부터.
    if (targetMonthKey) {
      const [ty, tm] = targetMonthKey.split('-').map(Number);
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
  }, [isSpot, activeDayDefaults, registeredDates, targetMonthKey]);

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

  // 다가오는 회차 월 그룹 — 오름차순이라 첫 그룹 = 가장 가까운 달(잔여 최이른 회차의 달,
  //   판매 준비 대상월과 동일 정의). 한 달뿐이면 그룹 UI 없이 현행 flat 목록 유지.
  const upcomingMonthGroups = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const s of listUpcoming) {
      const d = new Date(s.scheduledDate);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    const nowYear = new Date().getFullYear();
    return Array.from(map.entries()).map(([key, items]) => {
      const [y, m] = key.split('-').map(Number);
      return {
        key,
        label: y === nowYear ? `${m}월` : `${y}년 ${m}월`,
        items,
      };
    });
  }, [listUpcoming]);

  // 미니달력 확인 — 날짜별 확정값(resolved)을 시간·장소가 같은 그룹으로 묶어 bulk 호출.
  //   요일별 기본값을 적용하면 요일마다 시간/장소가 달라질 수 있어, bulk API(단일 시간/장소)를
  //   그룹 수만큼 분리 호출한다(보통 1~3회). 미적용 시 전부 공통값이라 1회 호출.
  const handleConfirmDates = useCallback(
    async (dates: string[], resolved: MultiDateResolved[]) => {
      if (!cls || !isApproved || dates.length === 0) return;
      // spot(1회용) — 기존 활성 일정 + 신규 합계 1개 초과 차단 (백엔드 가드와 동일 정책, 이중 방어).
      if (isSpot && schedules.length + dates.length > 1) {
        toast.error(MESSAGES.class.spotSingleScheduleLimit);
        return;
      }
      const basePath = getOwnerPath(cls);
      if (!basePath) {
        toast.error(MESSAGES.common.loadFailed);
        return;
      }

      // 시간/장소 동일 그룹으로 묶기(요일별 기본값 주입으로 그룹이 갈릴 수 있음 — 빈 시간 그룹 포함).
      const groups = new Map<
        string,
        { startTime?: string; endTime?: string; venueId?: string; dates: string[] }
      >();
      for (const r of resolved) {
        const key = `${r.startTime}|${r.endTime}|${r.venueId}`;
        const g =
          groups.get(key) ??
          {
            startTime: r.startTime || undefined,
            endTime: r.endTime || undefined,
            venueId: r.venueId || undefined,
            dates: [],
          };
        g.dates.push(r.date);
        groups.set(key, g);
      }

      setIsSubmittingDates(true);
      try {
        let totalCreated = 0;
        // 실패는 "일정(건)" 단위로 합산 — 메시지 ok/fail 단위 일치(그룹 수 아님).
        let failedDates = 0;
        let lastError: string | undefined;
        for (const g of groups.values()) {
          const res = await api.post<{
            created: number;
            skipped: number;
            schedules: ScheduleItem[];
          }>(`${basePath}/schedules/bulk`, {
            dates: g.dates,
            startTime: g.startTime,
            endTime: g.endTime,
            venueId: g.venueId,
          });
          if (res.success && res.data) {
            totalCreated += res.data.created;
          } else {
            failedDates += g.dates.length;
            lastError = res.error?.message ?? MESSAGES.common.loadFailed;
          }
        }
        // 일부 그룹 성공 + 일부 실패 시 성공·경고 토스트 병행 노출(부분 실패 은닉 방지).
        if (totalCreated > 0) {
          toast.success(MESSAGES.class.scheduleBulkCreated(totalCreated));
          if (failedDates > 0) {
            toast.error(
              MESSAGES.class.scheduleBulkPartialFailed(totalCreated, failedDates),
            );
          }
        } else if (lastError) {
          toast.error(lastError);
        }
        // 수업 재조회 — cls 갱신이 일정 refetch 를 유발하고, 파생 상태(NO_SCHEDULE →
        //   UNAPPROVED_MONTH)가 바뀌며 판매 준비 섹션이 같은 화면에서 열린다.
        await fetchClass();
      } finally {
        setIsSubmittingDates(false);
      }
    },
    [cls, isApproved, isSpot, schedules.length, getOwnerPath, toast, fetchClass],
  );

  // [월 일괄 생성] 즉시 등록이 아니라 미니달력을 대상월·프리필 선택 상태로 연다 —
  //   등록은 달력의 [확인](handleConfirmDates)에서만 일어난다(검토 단계 통일).
  const handleFillMonth = useCallback(() => {
    if (!monthFill || monthFill.dates.length === 0) return;
    setFillPrefill(monthFill);
    setMultiDateOpen(true);
  }, [monthFill]);

  const handleUpdateSchedule = useCallback(
    async (
      scheduleId: string,
      payload: { startTime: string; endTime: string; venueId: string },
    ) => {
      if (!cls || !isApproved) return;
      const basePath = getOwnerPath(cls);
      if (!basePath) {
        toast.error(MESSAGES.common.loadFailed);
        return;
      }
      const res = await api.put(`${basePath}/schedules/${scheduleId}`, payload);
      if (res.success) {
        toast.success(MESSAGES.save.success);
        await fetchClass();
      } else {
        toast.error(res.error?.message ?? MESSAGES.common.loadFailed);
      }
    },
    [cls, isApproved, getOwnerPath, toast, fetchClass],
  );

  async function handleCancel(scheduleId: string) {
    if (!cls || !isApproved) return;
    if (!window.confirm(MESSAGES.classesEdit.episodeCancelConfirm)) return;
    const basePath = getOwnerPath(cls);
    if (!basePath) {
      toast.error(MESSAGES.common.loadFailed);
      return;
    }
    const res = await api.put(
      `${basePath}/schedules/${scheduleId}/cancel`,
      { cancellationReason: '감독/코치 취소' },
    );
    if (res.success) {
      toast.success(MESSAGES.class.scheduleCancelled);
      // 마지막 잔여 회차 취소 시 파생 상태가 되돌아가므로 수업까지 재조회.
      await fetchClass();
    } else {
      toast.error(res.error?.message ?? MESSAGES.common.loadFailed);
    }
  }

  /* ─────────────────────────── Render ─────────────────────────── */

  // ── 목록 뷰 아코디언 개별 수정 — 수정 폼 패널 디자인 이식(탭하여 펼침 → 시간·장소
  //    수정 → [저장하기]에서만 반영). 날짜 변경은 정책상 취소+재등록이라 미제공. ──
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editVenueName, setEditVenueName] = useState('');
  const [venueSheetOpen, setVenueSheetOpen] = useState(false);
  const [rowSaving, setRowSaving] = useState(false);
  // 종료가 시작보다 이르거나 같으면 저장 불가 — 달력 뷰 수정 시트와 동일 규칙
  //   (시간 미정 회차의 장소만 수정은 허용).
  const isEditTimeInvalid = !!editStart && !!editEnd && editStart >= editEnd;
  const toggleExpand = (s: ScheduleItem) => {
    if (expandedId === s.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(s.id);
    setEditStart(s.startTime ?? '');
    setEditEnd(s.endTime ?? '');
    setEditVenue(s.venue?.id ?? '');
    setEditVenueName(s.venue?.name ?? '');
  };
  const handleRowSave = async (scheduleId: string) => {
    if (rowSaving || isEditTimeInvalid) return;
    setRowSaving(true);
    try {
      await handleUpdateSchedule(scheduleId, {
        startTime: editStart,
        endTime: editEnd,
        venueId: editVenue,
      });
      setExpandedId(null);
    } finally {
      setRowSaving(false);
    }
  };

  // 모든 회차에 적용 — 패널의 시간·장소를 다가오는 전 회차에 일괄 반영(수정 폼 기능 이식).
  //   즉시 반영이므로 확인창을 거치고, 지난·취소 회차는 대상에서 제외(불가침).
  const [applyingAll, setApplyingAll] = useState(false);
  const handleApplyToAll = async () => {
    if (applyingAll || rowSaving || isEditTimeInvalid) return;
    const basePath = getOwnerPath(cls);
    if (!basePath || listUpcoming.length === 0) return;
    const ok = await modal.confirm({
      title: MESSAGES.class.dayDefaults.applyToAllDates,
      message: MESSAGES.class.salesCycle.applyAllConfirm(listUpcoming.length),
      confirmText: MESSAGES.class.dayDefaults.applyToAllDates,
    });
    if (!ok) return;
    setApplyingAll(true);
    try {
      let okCount = 0;
      let failCount = 0;
      for (const t of listUpcoming) {
        const res = await api.put(`${basePath}/schedules/${t.id}`, {
          startTime: editStart,
          endTime: editEnd,
          venueId: editVenue,
        });
        if (res.success) okCount += 1;
        else failCount += 1;
      }
      // 부분 실패 병행 노출 — bulk 일정 추가와 동일한 은닉 방지 규칙.
      if (okCount > 0) {
        toast.success(MESSAGES.class.salesCycle.applyAllDone(okCount));
      }
      if (failCount > 0) {
        toast.error(MESSAGES.class.salesCycle.applyAllPartialFailed(failCount));
      }
      setExpandedId(null);
      await fetchClass();
    } finally {
      setApplyingAll(false);
    }
  };

  // 목록 뷰 회차 행 — 수정 폼 일정 목록의 정보 구조를 이식(회차 번호 + MM/DD(요일) +
  //   시간·장소 2줄). 지난 회차(isPast)는 흐림 처리 + 취소·수정 미노출.
  const renderScheduleRow = (s: ScheduleItem, isPast: boolean, seq?: number) => {
    const d = new Date(s.scheduledDate);
    const dateLabel = isNaN(d.getTime())
      ? '-'
      : `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}(${WEEKDAYS[d.getDay()]})`;
    const timeLabel = s.startTime
      ? `${s.startTime}${s.endTime ? `-${s.endTime}` : ''}`
      : MESSAGES.class.dayDefaults.timeUndecided;
    const canEdit = !s.isCancelled && !isPast && isApproved && !isEnded;
    const expanded = canEdit && expandedId === s.id;
    return (
      <li
        key={s.id}
        role="listitem"
        className={cn(
          // 수정 폼 회차 박스 디자인 1:1 — it-fill 박스 + 1.5px 테두리 + 둥근 모서리.
          'rounded-w-md border-[1.5px] bg-it-fill dark:bg-rink-900/40 overflow-hidden',
          canEdit
            ? 'border-it-line-strong dark:border-rink-700'
            : 'border-it-line dark:border-rink-700 opacity-55',
        )}
      >
        <div
          className="flex items-center gap-2 pl-3 pr-2 py-2.5"
          aria-label={`${dateLabel} ${timeLabel}${s.venue?.name ? `, ${s.venue.name}` : ''}${s.isCancelled ? ', 취소됨' : ''}`}
        >
          {/* 본문 — 수정 가능 회차는 탭하여 개별 수정 패널 펼침 (수정 폼 아코디언 이식). */}
          {canEdit ? (
            <button
              type="button"
              onClick={() => toggleExpand(s)}
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
                {s.venue?.name && (
                  <span className="flex items-center gap-1 mt-0.5 min-w-0 text-card-meta font-medium text-it-ink-500 dark:text-rink-300">
                    <Icon name="location_on" className="text-sm shrink-0" aria-hidden="true" />
                    <span className="truncate">{s.venue.name}</span>
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
                  s.isCancelled && 'line-through',
                )}
              >
                {dateLabel}
              </span>
              <div className="flex flex-1 flex-col min-w-0">
                <span className="text-card-meta font-medium tabular-nums truncate text-it-ink-500 dark:text-rink-300">
                  {timeLabel}
                </span>
                {s.venue?.name && (
                  <span className="flex items-center gap-1 mt-0.5 min-w-0 text-card-meta font-medium text-it-ink-500 dark:text-rink-300">
                    <Icon name="location_on" className="text-sm shrink-0" aria-hidden="true" />
                    <span className="truncate">{s.venue.name}</span>
                  </span>
                )}
              </div>
            </>
          )}
          {s.isCancelled && (
            <span
              className="text-card-meta font-bold px-2 py-0.5 rounded bg-it-line dark:bg-rink-700 text-it-ink-500 dark:text-rink-300 shrink-0"
              role="status"
            >
              취소됨
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => handleCancel(s.id)}
              className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 shrink-0"
              aria-label={`${dateLabel} ${timeLabel} 회차 취소하기`}
              title="회차 취소하기"
            >
              <Icon name="event_busy" className="text-lg" aria-hidden="true" />
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
            {/* 모든 회차에 적용 — 다가오는 회차 2개 이상 + 값이 있을 때만 (수정 폼과 동일 조건). */}
            {listUpcoming.length > 1 && (editStart || editEnd || editVenue) && (
              <button
                type="button"
                onClick={handleApplyToAll}
                disabled={applyingAll || rowSaving || isEditTimeInvalid}
                className="self-start rounded-md px-2 py-1 text-card-meta font-bold text-it-blue-500 hover:bg-it-blue-50 dark:text-it-blue-300 dark:hover:bg-it-blue-500/10 disabled:opacity-50"
                aria-label={MESSAGES.class.dayDefaults.applyToAllDatesAria(seq ?? 0)}
              >
                {applyingAll ? '적용 중…' : MESSAGES.class.dayDefaults.applyToAllDates}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleRowSave(s.id)}
              disabled={rowSaving || applyingAll || isEditTimeInvalid}
              className="w-full h-10 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-meta font-bold disabled:opacity-50 transition-colors motion-reduce:transition-none active:brightness-95"
            >
              {rowSaving ? '저장 중…' : '저장하기'}
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
        <AppBar title={MESSAGES.class.salesCycle.managePageTitle} onBack={() => router.back()} forceNative />
        <main className="flex-1 flex items-center justify-center p-6 bg-it-canvas dark:bg-puck">
          <p className="text-it-ink-500 dark:text-rink-300">수업을 찾을 수 없습니다.</p>
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <AppBar title={MESSAGES.class.salesCycle.managePageTitle} forceNative />
      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck pb-24" style={{ WebkitOverflowScrolling: 'touch' as never }}>
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
          {/* 기본 일정(정규 요일 템플릿) 요약 — 요일·시간·장소가 등록돼 있을 때만. */}
          {dayTemplateLabel && (
            <p className="-mt-1.5 mb-3 flex items-center gap-1 text-card-meta text-it-ink-500 dark:text-rink-300 tabular-nums">
              <Icon name="event_repeat" className="text-sm shrink-0" aria-hidden="true" />
              <span>{dayTemplateLabel}</span>
            </p>
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
                disabled={
                  !isApproved ||
                  isEnded ||
                  isSubmittingDates ||
                  monthFill.dates.length === 0
                }
                className="w-full flex items-center justify-center gap-1.5 py-3 bg-it-blue-500 hover:bg-it-blue-600 disabled:bg-it-line dark:disabled:bg-rink-700 disabled:cursor-not-allowed text-white font-bold rounded-w-md transition-colors motion-reduce:transition-none active:brightness-95"
              >
                <Icon name="event_repeat" className="text-base" aria-hidden="true" />
                {isSubmittingDates
                  ? '추가 중…'
                  : monthFill.dates.length > 0
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
              disabled={!isApproved || isEnded || isSubmittingDates || spotLimitReached}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 py-3 font-bold rounded-w-md transition-colors motion-reduce:transition-none active:brightness-95 disabled:cursor-not-allowed',
                monthFill !== null
                  ? // 보조 액션(점선) — 예외/불규칙 날짜 직접 추가.
                    'border border-dashed border-it-blue-500/50 text-it-blue-500 hover:bg-it-blue-500/[0.06] disabled:opacity-40 disabled:hover:bg-transparent'
                  : 'bg-it-blue-500 hover:bg-it-blue-600 disabled:bg-it-line dark:disabled:bg-rink-700 text-white',
              )}
            >
              <Icon name="calendar_month" className="text-base" aria-hidden="true" />
              {isSubmittingDates
                ? '추가 중…'
                : monthFill !== null
                  ? MESSAGES.class.scheduleAddSingle
                  : '일정 추가'}
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
              {schedules.length}건
            </span>
          </div>
          {/* 달력 — 조망 전용(월 배치 확인·셀 강조). 내장 "전체 일정" 목록은 아래 이식된
              박스 목록이 대체하므로 part="calendar" + readOnly (실행 표면 단일화). */}
          {schedules.length > 0 && (
            <div className="-mx-5 mb-3">
              <ScheduleCalendarView
                schedules={schedules}
                isApproved={isApproved}
                readOnly
                part="calendar"
                iceTheme
              />
            </div>
          )}
          {schedules.length === 0 ? (
            <p
              className="py-5 text-center text-card-body text-it-ink-500 dark:text-rink-300"
              role="status"
            >
              등록된 일정이 없습니다.
            </p>
          ) : (
            // 수정 폼 일정 목록 디자인 1:1 — 지난 일정 접힘 그룹(상단) + 박스 행 목록.
            <div aria-label={`등록된 일정 ${schedules.length}건`}>
              {listPast.length > 0 && (
                <div className={listUpcoming.length > 0 ? 'mb-2' : undefined}>
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
                      {listPast.map((s) => renderScheduleRow(s, true))}
                    </ul>
                  )}
                </div>
              )}
              {upcomingMonthGroups.length <= 1 ? (
                // 한 달치뿐 — 그룹 헤더 없이 flat 목록 (평상시 화면 불변).
                <ul className="flex flex-col gap-2 list-none" role="list">
                  {listUpcoming.map((s, i) => renderScheduleRow(s, false, i + 1))}
                </ul>
              ) : (
                // 복수 달(선등록) — 월 그룹 접힘. 가장 가까운 달만 기본 펼침,
                //   이후 달은 헤더("10월 8회")로 존재만 알리고 접어 스크롤 상한 유지.
                <div className="space-y-2">
                  {upcomingMonthGroups.map((g, gi) => {
                    const open = expandedMonths[g.key] ?? gi === 0;
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
                            {g.items.map((s, i) => renderScheduleRow(s, false, i + 1))}
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
        {isUnapprovedPending && !isSpot && !isEnded && targetMonthLabel !== null && (
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
                      {/* 제안 금액 — 대상월 요일별 회차 × 1회 수업료. 탭하면 입력에 적용. */}
                      {unitPriceRef > 0 &&
                        targetMonthCalc !== null &&
                        targetMonthCalc.total > 0 && (
                          <div className="mt-2.5">
                            {/* text-card-caption 은 미정의 클래스(크기 무효) — 12px meta 사용. */}
                            <p className="text-card-meta text-it-ink-500 dark:text-rink-300 mb-1.5">
                              {MESSAGES.class.salesCycle.renewCalcHint(
                                targetMonthLabel,
                                unitPriceRef.toLocaleString(),
                              )}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {CALC_DAY_ORDER.filter(
                                (dow) => (targetMonthCalc.counts.get(dow) ?? 0) > 0,
                              ).map((dow) => {
                                const count = targetMonthCalc.counts.get(dow) ?? 0;
                                const amount = count * unitPriceRef;
                                return (
                                  <button
                                    key={dow}
                                    type="button"
                                    onClick={() =>
                                      setPkgPrices((prev) => ({
                                        ...prev,
                                        [pkg.id]: String(amount),
                                      }))
                                    }
                                    className="h-8 px-2.5 rounded-w-pill border-[1.5px] border-it-line-strong dark:border-rink-600 bg-it-fill dark:bg-rink-700 text-card-meta font-semibold text-it-ink-800 dark:text-white tabular-nums hover:border-it-blue-500 transition-colors motion-reduce:transition-none active:brightness-95"
                                  >
                                    {MESSAGES.class.salesCycle.renewCalcDayChip(
                                      WEEKDAYS[dow],
                                      count,
                                      amount.toLocaleString(),
                                    )}
                                  </button>
                                );
                              })}
                              {targetMonthCalc.counts.size > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPkgPrices((prev) => ({
                                      ...prev,
                                      [pkg.id]: String(
                                        targetMonthCalc.total * unitPriceRef,
                                      ),
                                    }))
                                  }
                                  className="h-8 px-2.5 rounded-w-pill border-[1.5px] border-it-line-strong dark:border-rink-600 bg-it-fill dark:bg-rink-700 text-card-meta font-semibold text-it-ink-800 dark:text-white tabular-nums hover:border-it-blue-500 transition-colors motion-reduce:transition-none active:brightness-95"
                                >
                                  {MESSAGES.class.salesCycle.renewCalcAllChip(
                                    targetMonthCalc.total,
                                    (
                                      targetMonthCalc.total * unitPriceRef
                                    ).toLocaleString(),
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      <div className="flex gap-2 mt-2.5">
                        {/* 보조: 새 행 없이 원본만 소진 — 이번 달부터 안 파는 항목 정리. */}
                        <button
                          type="button"
                          onClick={() => handleExcludePkg(pkg)}
                          disabled={pkgSubmitting === pkg.id}
                          className="flex-1 h-11 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-600 text-it-ink-800 dark:text-rink-100 text-card-meta font-bold disabled:opacity-60 transition-colors motion-reduce:transition-none active:brightness-95"
                        >
                          {MESSAGES.class.salesCycle.excludeButton}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCreateMonthPkg(pkg)}
                          disabled={pkgSubmitting === pkg.id}
                          className="flex-1 h-11 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-meta font-bold disabled:opacity-60 transition-colors motion-reduce:transition-none active:brightness-95"
                        >
                          {MESSAGES.class.salesCycle.renewRegisterButton}
                        </button>
                      </div>
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

      {/* 미니달력 — 수업 일정 복수 추가. 월 일괄 생성 진입 시(fillPrefill) 대상월·정규
          요일 날짜가 미리 선택된 채 열리고, [확인]에서만 등록된다. */}
      <MultiDatePickerModal
        isOpen={multiDateOpen}
        initialYear={fillPrefill?.year ?? initialYear}
        initialMonth={fillPrefill?.month ?? initialMonth}
        selected={fillPrefill?.dates ?? []}
        disabledDates={registeredDates}
        // spot(1회용) — 요일 빠른 선택 칩 차단 + 단일 선택 모드 (ClassForm 동일 패턴).
        daySchedules={isSpot ? [] : cls.daySchedules ?? []}
        singleSelect={isSpot}
        onConfirm={handleConfirmDates}
        onClose={() => {
          setMultiDateOpen(false);
          setFillPrefill(null);
        }}
        iceTheme
        requireCommonTime
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
