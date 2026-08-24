'use client';

/**
 * /classes/[id]/students — 코치/감독/오픈클래스감독 선수정보 + 정산 확정 페이지
 *
 * 팀·학원 공용 단일 진입점 — 도메인 무관 `GET /classes/:classId/payments?yearMonth=` 단일 호출.
 * RBAC: 상위 (coach-access) layout 단일 가드 — coach/director/academy_director/admin.
 *   page 는 useRouteUser() 로 파생 user 를 소비만 하고 인증 훅을 재호출하지 않는다(#6).
 *
 * 2탭 구조 (ICETIMES flat — 네이비 히어로 + 밑줄 탭 + full-bleed 흰 섹션):
 *   ① 선수정보(roster): 이름·등록일·학부모·이번 달 출석 + 상태 칩
 *   ② 결제 현황(payment): 선택 월 축 + 행별 5-state·결제방식·금액·출석수 + 후불 정산 확정
 *
 * [정산 확정 통합] 결제 탭 하단에 후불 정산 확정 영역(PostpaidSettlementSection, controlled)을 이식.
 *   월(yearMonth)은 페이지가 소유(스텝퍼) → 섹션은 controlled. 확정 성공 시 재조회로 5-state 즉시 반영.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { PostpaidSettlementSection } from '@/components/attendance/PostpaidSettlementSection';
import { InlineRetryError } from '@/components/settlement/InlineRetryError';
import { Icon } from '@/components/ui/Icon';
// RBAC: (coach-access) layout 단일 가드 — useRequireRole 호출 제거. user 는 useRouteUser 소비.
import { useRouteUser } from '@/app/(class)/route-user-context';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal';
import { kstYearMonth } from '@/lib/kst-month';
import { shiftMonth } from '@/components/settlement/settlement-format';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { openDirectChat } from '@/services/chat';
import {
  fetchClassContacts,
  type ClassContact,
} from '@/services/community-notice.service';
import { useNavigation } from '@/components/ui/NavLink';

// ── 5-state / 결제방식 계약 (getClassPayments Dual Emit) ──
type BillingTiming = 'PREPAID' | 'POSTPAID' | 'UNASSIGNED';
type BillingStatus = 'UNSETTLED' | 'BILLED' | 'PAID' | 'CANCELLED' | 'REFUNDED';

interface PaymentStudent {
  registrationId: string;
  memberId: string;
  memberName: string;
  memberType: string;
  /** 명단 밖 확정 청구 합성 행(billing-*)은 null. */
  registrationDate: string | null;
  enrollmentId: string | null;
  enrollmentStatus: string | null;
  productName: string | null;
  amount: number | null;
  paymentMethod: string | null;
  paidAt: string | null;
  /** 결제자(학부모) 표시명 — 미결제 학생은 null */
  payerName?: string | null;
  /** 선택월 present 출석 횟수 */
  attendanceCount?: number;
  // ── 5-state 계약 ──
  billingTiming: BillingTiming;
  billingStatus: BillingStatus;
  billedAmount: number | null;
  estimatedAmount: number | null;
  paidAmount: number;
  outstandingAmount: number;
}

interface PaymentsResponse {
  classId: string;
  className: string;
  billingMode?: 'PREPAID' | 'POSTPAID' | 'BOTH' | string | null;
  /** 선택월 SoT(YYYY-MM) — 서버가 확정. 월 전환 race 가드 기준값. */
  yearMonth: string;
  /** 오픈클래스는 null. 팀 수업이면 teamId 존재. */
  teamId: string | null;
  teamName: string;
  teamCode: string;
  total: number;
  totalPaidAmount: number;
  /** [만료 회원] 결제가 끊겨 자동 해제된(expired) 선수 — 월 필터 무관 재등록 대상 목록. */
  expiredMembers?: {
    userId: string;
    memberName: string;
    lastPaidYearMonth: string | null;
  }[];
  students: PaymentStudent[];
  products?: {
    id: string;
    productName: string;
    price: number;
    feeType?: string | null;
    billingTiming?: string | null;
    feePerSession?: number | null;
  }[];
}

type TabKey = 'roster' | 'payment';
type PayFilter = 'all' | 'outstanding' | 'paid';
type RowBucket = 'paid' | 'outstanding' | 'neutral';

const ROW_STATUS_META: Record<
  BillingStatus,
  { label: string; chip: string; dot: string }
> = {
  PAID: {
    label: MESSAGES.settlement.rowStatusPaid,
    chip: 'bg-mint-100 text-rink-800 dark:bg-mint-500/20 dark:text-mint-100',
    dot: 'bg-mint-500',
  },
  BILLED: {
    label: MESSAGES.settlement.rowStatusBilled,
    chip: 'bg-it-blue-500/10 text-it-blue-600 dark:bg-it-blue-500/20 dark:text-it-blue-100',
    dot: 'bg-it-blue-500',
  },
  UNSETTLED: {
    label: MESSAGES.settlement.rowStatusUnsettled,
    chip: 'bg-it-fill text-it-ink-600 dark:bg-rink-700 dark:text-rink-100',
    dot: 'bg-it-ink-400',
  },
  CANCELLED: {
    label: MESSAGES.settlement.rowStatusCancelled,
    chip: 'bg-it-fill text-it-ink-400 dark:bg-rink-700 dark:text-rink-300',
    dot: 'bg-it-ink-300',
  },
  REFUNDED: {
    label: MESSAGES.settlement.rowStatusRefunded,
    chip: 'bg-it-fill text-it-ink-400 dark:bg-rink-700 dark:text-rink-300',
    dot: 'bg-it-ink-300',
  },
};

const TIMING_META: Record<BillingTiming, { label: string; cls: string }> = {
  PREPAID: {
    label: MESSAGES.settlement.prepaid,
    cls: 'bg-it-blue-500/10 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-100',
  },
  POSTPAID: {
    label: MESSAGES.settlement.postpaid,
    cls: 'bg-sun-500/15 text-rink-800 dark:bg-sun-500/20 dark:text-sun-100',
  },
  UNASSIGNED: {
    label: MESSAGES.settlement.unassigned,
    cls: 'bg-it-fill text-it-ink-400 dark:bg-rink-700 dark:text-rink-300',
  },
};

function rowBucket(s: PaymentStudent): RowBucket {
  if (s.billingStatus === 'PAID') return 'paid';
  if (s.billingStatus === 'UNSETTLED' || s.billingStatus === 'BILLED') return 'outstanding';
  return 'neutral';
}

function formatPrice(n?: number | null) {
  if (n == null) return '-';
  return `${n.toLocaleString('ko-KR')}${MESSAGES.settlement.won}`;
}

function formatDateKR(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}


/**
 * [1:1 문의 잠금 — 2026-08-21 사용자 결정] 1:1 채팅의 사용 시점·채팅 목록 배치가
 * 미결정이라 진입점을 숨긴다. 로직은 보존 — 결정되면 이 플래그만 복원.
 */
const SHOW_DIRECT_CHAT = false;

export default function ClassStudentsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const classId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : (raw ?? '');
  }, [params]);

  const user = useRouteUser();
  const { navigate } = useNavigation();
  const { toast } = useToast();

  // [Codex R1 H-02] 참가자 명단 행 [1:1 문의] — 부모 우선 연락 대상 (관할 전용 API,
  //   실패는 무해: 버튼만 미노출). 정산 응답(getClassPayments 5-state)은 건드리지 않는다.
  const [contactByMember, setContactByMember] = useState<
    Map<string, ClassContact>
  >(new Map());
  const [chatOpeningId, setChatOpeningId] = useState<string | null>(null);
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchClassContacts(classId);
        if (cancelled || !res.success || !res.data) return;
        setContactByMember(
          new Map(res.data.contacts.map((c) => [c.memberId, c])),
        );
      } catch {
        /* 버튼 미노출로 폴백 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const handleOpenChat = useCallback(
    async (contactUserId: string) => {
      if (chatOpeningId) return;
      setChatOpeningId(contactUserId);
      try {
        const roomId = await openDirectChat(contactUserId);
        if (roomId) navigate(`/chat/${roomId}`);
        else toast.error(MESSAGES.unitNotice.askDirectFailed);
      } catch {
        toast.error(MESSAGES.unitNotice.askDirectFailed);
      } finally {
        setChatOpeningId(null);
      }
    },
    [chatOpeningId, navigate, toast],
  );

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: true,
  });

  // ── 초기값 (드릴다운 소비) ──
  const initialYm = useMemo(() => {
    const q = searchParams.get('yearMonth');
    return q && /^\d{4}-\d{2}$/.test(q) ? q : kstYearMonth();
  }, [searchParams]);
  const initialTab = useMemo<TabKey>(() => {
    const t = searchParams.get('tab');
    if (t === 'payment' || t === 'roster') return t;
    // ?yearMonth 만 있고 tab 없음 = 정산 허브 드릴다운 → payment 로 오픈.
    if (searchParams.get('yearMonth')) return 'payment';
    return 'roster';
  }, [searchParams]);

  const [yearMonth, setYearMonth] = useState<string>(initialYm);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [payFilter, setPayFilter] = useState<PayFilter>('all');

  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true); // 초기 로드 게이트
  const [isMonthLoading, setIsMonthLoading] = useState(false); // 월 전환 인라인 로딩
  const [error, setError] = useState<string | null>(null); // 초기 실패(풀 에러)
  const [monthError, setMonthError] = useState(false); // 월 새로고침 실패(직전월 보존)
  const [isRetrying, setIsRetrying] = useState(false);
  // [만료 회원] 접이식 섹션 — 복귀는 학부모 재결제 자동 복구, 정리는 명단제외(expired→inactive)
  const [expiredOpen, setExpiredOpen] = useState(false);
  const [excludingId, setExcludingId] = useState<string | null>(null);
  const { modal } = useModal();

  // 풀스크린 로더 fast-path — 초기 로드 시도 완료(성공/실패) 시 ready.
  usePageReady(!isLoading);

  // 요청 시퀀스 — 늦게 도착한 이전 월 응답이 최신 선택 월을 덮는 race 차단.
  const requestSeq = useRef(0);

  const loadData = useCallback(
    async (ym: string, mode: 'initial' | 'month') => {
      if (!classId) return;
      const seq = ++requestSeq.current;
      if (mode === 'initial') setError(null);
      const res = await api.get<PaymentsResponse>(
        `/classes/${classId}/payments?yearMonth=${encodeURIComponent(ym)}`,
      );
      if (seq !== requestSeq.current) return; // 폐기 — 더 최신 요청 진행 중
      if (res.success && res.data) {
        if (res.data.yearMonth !== ym) {
          // 서버 확정월 ≠ 요청월 → stale echo. 직전 데이터 보존.
          if (mode === 'month') setMonthError(true);
          else setError(MESSAGES.settlement.loadFailedTitle);
          return;
        }
        setData(res.data);
        if (mode === 'month') setMonthError(false);
      } else if (mode === 'month') {
        // 직전 유효월 데이터를 빈 데이터로 덮지 않는다 — 인라인 에러로만 표기.
        setMonthError(true);
      } else {
        setError(res.error?.message ?? MESSAGES.settlement.loadFailedTitle);
      }
    },
    [classId],
  );

  // 최초 로드 — 1회.
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      await loadData(initialYm, 'initial');
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // 최초 1회만 — 이후 월 변경은 아래 effect. initialYm 은 마운트 시 고정.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // 월 변경 — 최초 로드는 건너뜀.
  const isFirstMonthEffect = useRef(true);
  useEffect(() => {
    if (isFirstMonthEffect.current) {
      isFirstMonthEffect.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      setIsMonthLoading(true);
      await loadData(yearMonth, 'month');
      if (!cancelled) setIsMonthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [yearMonth, loadData]);

  const handleInitialRetry = useCallback(async () => {
    setIsRetrying(true);
    await loadData(yearMonth, 'initial');
    setIsRetrying(false);
  }, [loadData, yearMonth]);

  // 확정 성공 후 현재 월 재조회(행 5-state 즉시 반영).
  const reloadCurrentMonth = useCallback(async () => {
    setIsMonthLoading(true);
    await loadData(yearMonth, 'month');
    setIsMonthLoading(false);
  }, [loadData, yearMonth]);

  // [만료 회원] 명단제외 — expired → inactive 정리(기존 배치 해제 API 재사용).
  //   재결제 시 자동 복귀는 유지되므로 되돌릴 수 없는 액션은 아님.
  const handleExclude = useCallback(
    async (userId: string, name: string) => {
      const M2 = MESSAGES.academy.students;
      const ok = await modal.confirm({
        title: M2.excludeConfirmTitle,
        message: M2.excludeConfirmMessage(name),
        confirmText: M2.excludeButton,
        variant: 'danger',
      });
      if (!ok) return;
      setExcludingId(userId);
      try {
        const res = await api.delete(
          `/classes/${classId}/registrations/${userId}`,
        );
        if (res.success) {
          toast.success(M2.excludeSuccess(name));
          await reloadCurrentMonth();
        } else if (res.error?.message) {
          toast.error(res.error.message);
        }
      } finally {
        setExcludingId(null);
      }
    },
    [classId, modal, toast, reloadCurrentMonth],
  );

  // ── 월 스텝퍼 ──
  const nextMonthDisabled = yearMonth >= kstYearMonth();
  const goPrevMonth = useCallback(() => setYearMonth((ym) => shiftMonth(ym, -1)), []);
  const goNextMonth = useCallback(() => {
    setYearMonth((ym) => (ym >= kstYearMonth() ? ym : shiftMonth(ym, 1)));
  }, []);
  const [ymY, ymM] = useMemo(() => yearMonth.split('-').map(Number), [yearMonth]);

  // ── 파생 집계 ──
  const timingCounts = useMemo(() => {
    const c: Record<BillingTiming, number> = { PREPAID: 0, POSTPAID: 0, UNASSIGNED: 0 };
    data?.students.forEach((s) => {
      c[s.billingTiming] = (c[s.billingTiming] ?? 0) + 1;
    });
    return c;
  }, [data]);

  const bucketCounts = useMemo(() => {
    const c: Record<RowBucket, number> = { paid: 0, outstanding: 0, neutral: 0 };
    data?.students.forEach((s) => {
      c[rowBucket(s)] += 1;
    });
    return c;
  }, [data]);

  const outstandingTotal = useMemo(
    () => data?.students.reduce((a, s) => a + (s.outstandingAmount ?? 0), 0) ?? 0,
    [data],
  );
  const estimatedTotal = useMemo(
    () => data?.students.reduce((a, s) => a + (s.estimatedAmount ?? 0), 0) ?? 0,
    [data],
  );

  const hasPostpaidTarget = useMemo(
    () => data?.students.some((s) => s.billingTiming === 'POSTPAID') ?? false,
    [data],
  );

  // 응답 월 ↔ 선택 월 일치 여부 — 불일치(월 전환 중/실패)면 결제 탭 금융 데이터 stale 렌더 금지.
  // roster 탭은 월 종속이 아니므로 게이트 대상 아님.
  const monthMatches = data != null && data.yearMonth === yearMonth;

  // FE 쓰기 게이트 — 팀=팀관리자 / 오픈클래스=감독·admin (보조코치 view-only).
  const isTeamClass = !!data?.teamId;
  const canWrite = data
    ? isTeamClass
      ? true
      : user?.userType === 'academy_director' || user?.userType === 'admin'
    : false;

  // 결제 탭 — 미납·미정산 우선 정렬 후 필터.
  const paymentList = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.students].sort((a, b) => {
      const ra = rowBucket(a) === 'outstanding' ? 0 : 1;
      const rb = rowBucket(b) === 'outstanding' ? 0 : 1;
      return ra - rb;
    });
    if (payFilter === 'all') return sorted;
    return sorted.filter((s) => rowBucket(s) === payFilter);
  }, [data, payFilter]);

  const M = MESSAGES.academy.students;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={M.playersTitle} forceNative />
      <main
        className="flex-1 min-h-0 overflow-y-auto bg-it-canvas dark:bg-puck"
        role="main"
        aria-label={M.playersTitle}
      >
        {/* Hero — 네이비 full-bleed 밴드, 탭 공통 (수업명·팀명·등록 인원) */}
        <section
          className="bg-it-blue-800 dark:bg-it-blue-950 px-4 sm:px-5 pt-5 pb-5"
          aria-label={M.playersTitle}
        >
          <span className="inline-flex items-center rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-white/90">
            PLAYERS
          </span>
          {!data ? null : (
            <>
              <h1 className="mt-3 text-[22px] font-extrabold tracking-[-0.01em] leading-[1.18] text-white break-keep">
                {data.className}
              </h1>
              <p className="mt-1.5 text-[13px] font-semibold text-white/80">
                {data.teamName}
                {data.teamCode ? ` (${data.teamCode})` : ''}
                <span className="ml-1.5 font-num tabular-nums">· {M.rosterCount(data.total)}</span>
              </p>
            </>
          )}
        </section>

        {/* 탭 — ICETIMES SegmentedTabs (밑줄형, flat 흰 섹션) */}
        {data && (
          <div className="mt-2 bg-it-surface dark:bg-it-blue-950">
            <div
              role="tablist"
              aria-label={M.playersTitle}
              className="flex border-b border-it-line dark:border-rink-700"
            >
              {([
                { key: 'roster' as const, label: M.tabRoster },
                { key: 'payment' as const, label: M.tabPayment },
              ]).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'relative flex-1 px-1 pb-[13px] pt-[14px] text-[15px] transition-colors duration-200 motion-reduce:transition-none',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500',
                    tab === t.key
                      ? 'font-extrabold text-it-blue-600 dark:text-white'
                      : 'font-semibold text-it-ink-500 hover:text-it-ink-800 dark:text-wtext-4 dark:hover:text-white',
                  )}
                >
                  {t.label}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-x-0 -bottom-px h-[2.5px] rounded-sm',
                      tab === t.key ? 'bg-it-blue-500' : 'bg-transparent',
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 에러 (초기 로드 실패) */}
        {error ? (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-8 text-center">
            <Icon name="error_outline" className="text-3xl text-it-red-500" aria-hidden="true" />
            <p className="mt-2 text-card-body font-semibold text-it-ink-800 dark:text-white">{error}</p>
            <button
              type="button"
              onClick={() => void handleInitialRetry()}
              disabled={isRetrying}
              className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-w-md bg-it-blue-500 text-white text-w-small font-bold hover:bg-it-blue-600 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {M.retry}
            </button>
          </section>
        ) : !data ? null : tab === 'roster' ? (
          /* ── 탭 ① 선수정보 — 탭 바에 이어지는 flat 흰 섹션 + hairline 행 ── */
          <>
            <section className="bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 pb-8">
              {data.students.length === 0 ? (
                <EmptyState icon="group_off" text={M.emptyRoster} />
              ) : (
                <ul className="divide-y divide-it-line dark:divide-rink-700">
                  {data.students.map((s) => (
                    <StudentRow
                      key={s.registrationId}
                      student={s}
                      variant="roster"
                      contact={contactByMember.get(s.memberId) ?? null}
                      isChatOpening={chatOpeningId !== null}
                      onChat={handleOpenChat}
                    />
                  ))}
                </ul>
              )}
            </section>

            {/* ── 만료 회원 — 결제가 끊겨 자동 해제된 선수의 재등록 관리 목록 (월 무관) ── */}
            {(data.expiredMembers?.length ?? 0) > 0 && (
              <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
                <button
                  type="button"
                  onClick={() => setExpiredOpen((v) => !v)}
                  aria-expanded={expiredOpen}
                  className="flex w-full items-center justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 rounded-w-sm"
                >
                  <span className="text-card-title font-extrabold text-it-ink-800 dark:text-white">
                    {M.expiredSectionTitle(data.expiredMembers!.length)}
                  </span>
                  <Icon
                    name={expiredOpen ? 'expand_less' : 'expand_more'}
                    className="text-it-ink-400 dark:text-rink-300"
                    aria-hidden="true"
                  />
                </button>
                {expiredOpen && (
                  <ul className="mt-2 divide-y divide-it-line dark:divide-rink-700">
                    {data.expiredMembers!.map((m) => {
                      const ym = m.lastPaidYearMonth
                        ?.split('-')
                        .map(Number) as [number, number] | undefined;
                      return (
                        <li
                          key={m.userId}
                          className="py-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-card-body font-bold text-it-ink-800 dark:text-white">
                              {m.memberName}
                            </p>
                            <p className="mt-0.5 text-card-meta text-it-ink-500 dark:text-rink-300 font-num tabular-nums">
                              {ym
                                ? M.expiredLastPaid(ym[0], ym[1])
                                : M.expiredNoPayment}
                            </p>
                          </div>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleExclude(m.userId, m.memberName)
                              }
                              disabled={excludingId === m.userId}
                              className="shrink-0 h-9 px-3 rounded-w-md bg-it-fill dark:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-600 text-card-meta font-bold text-it-ink-600 dark:text-rink-100 hover:border-it-blue-500/40 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none"
                            >
                              {M.excludeButton}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </>
        ) : (
          /* ── 탭 ② 결제 현황 ── */
          <>
            <section className="bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 pt-2 pb-4 flex flex-col gap-3">
              {/* 월 스텝퍼 — flat 행 + hairline */}
              <div className="flex items-center justify-between py-1 border-b border-it-line dark:border-rink-700">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  aria-label={MESSAGES.settlement.prevMonth}
                  className="flex size-9 items-center justify-center rounded-w-md text-it-ink-600 dark:text-rink-100 hover:bg-it-fill dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                >
                  <Icon name="chevron_left" aria-hidden="true" />
                </button>
                <span className="flex items-center gap-2 text-card-body font-bold text-it-ink-800 dark:text-white tabular-nums">
                  {MESSAGES.settlement.monthLabel(ymY, ymM)}
                  {isMonthLoading && (
                    <span
                      className="h-3.5 w-3.5 rounded-w-pill border-2 border-it-blue-500 border-t-transparent animate-spin motion-reduce:animate-none"
                      role="status"
                      aria-label={MESSAGES.settlement.monthLoading}
                    />
                  )}
                </span>
                <button
                  type="button"
                  onClick={goNextMonth}
                  disabled={nextMonthDisabled}
                  aria-label={MESSAGES.settlement.nextMonth}
                  className="flex size-9 items-center justify-center rounded-w-md text-it-ink-600 dark:text-rink-100 hover:bg-it-fill dark:hover:bg-rink-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none"
                >
                  <Icon name="chevron_right" aria-hidden="true" />
                </button>
              </div>

              {/*
                월 종속 본문(요약·5-state 행·정산 확정) 게이트.
                금융 화면 원칙 — 선택 월과 응답 월 불일치/전환 중에는 이전 월 데이터를 표시하지 않는다.
                  · monthError    → InlineRetryError (stale 데이터 미표시)
                  · 전환 중/불일치 → 월 로딩 스켈레톤 (빈0/스테일 위장 금지)
                  · monthMatches  → 실데이터
              */}
              {monthError ? (
                <InlineRetryError
                  message={MESSAGES.settlement.monthLoadFailed}
                  onRetry={() => void reloadCurrentMonth()}
                  retrying={isMonthLoading}
                />
              ) : !monthMatches || isMonthLoading ? (
                <PaymentMonthSkeleton />
              ) : (
                <>
                  {/* 요약 압축 — inset fill 패널 (총 수납 + 선불/후불/미설정 인원 + 미수·정산예정) */}
                  <div className="rounded-w-md bg-it-fill dark:bg-rink-800 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-card-meta font-semibold text-it-ink-500 dark:text-rink-300">
                        {MESSAGES.settlement.totalCollected}
                      </span>
                      <span className="text-w-h3 font-extrabold font-num text-it-ink-800 dark:text-white tabular-nums">
                        {data.totalPaidAmount.toLocaleString('ko-KR')}
                        <span className="ml-0.5 text-w-body">{MESSAGES.settlement.won}</span>
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <CountBlock label={MESSAGES.settlement.prepaid} value={timingCounts.PREPAID} dotClass="bg-it-blue-500" />
                      <CountBlock label={MESSAGES.settlement.postpaid} value={timingCounts.POSTPAID} dotClass="bg-sun-500" />
                      <CountBlock label={MESSAGES.settlement.unassigned} value={timingCounts.UNASSIGNED} dotClass="bg-it-ink-400" />
                    </div>
                    {(outstandingTotal > 0 || estimatedTotal > 0) && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-it-line-strong dark:border-rink-700 pt-3">
                        {outstandingTotal > 0 && (
                          <span className="text-card-meta text-it-ink-600 dark:text-rink-100">
                            {MESSAGES.settlement.outstanding}{' '}
                            <span className="font-num tabular-nums font-bold text-it-red-500">
                              {outstandingTotal.toLocaleString('ko-KR')}
                              {MESSAGES.settlement.won}
                            </span>
                          </span>
                        )}
                        {estimatedTotal > 0 && (
                          <span className="text-card-meta text-it-ink-600 dark:text-rink-100">
                            {MESSAGES.settlement.pendingSettlement}{' '}
                            <span className="font-num tabular-nums font-bold text-it-blue-500">
                              {estimatedTotal.toLocaleString('ko-KR')}
                              {MESSAGES.settlement.won}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 필터 칩 (5-state 기준) */}
                  <div className="flex gap-1.5" role="group" aria-label={M.tabPayment}>
                    {([
                      { key: 'all' as const, label: M.filterAllPay, count: data.total },
                      { key: 'outstanding' as const, label: MESSAGES.settlement.outstanding, count: bucketCounts.outstanding },
                      { key: 'paid' as const, label: MESSAGES.settlement.rowStatusPaid, count: bucketCounts.paid },
                    ]).map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        aria-pressed={payFilter === f.key}
                        onClick={() => setPayFilter(f.key)}
                        className={cn(
                          'inline-flex items-center gap-1 h-8 px-3 rounded-w-pill text-card-meta font-bold transition-colors duration-150 motion-reduce:transition-none',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500',
                          payFilter === f.key
                            ? 'bg-it-blue-500 text-white'
                            : 'bg-it-fill dark:bg-rink-800 border border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-rink-100 hover:border-it-blue-500/40',
                        )}
                      >
                        {f.label}
                        <span className="font-num tabular-nums opacity-80">{f.count}</span>
                      </button>
                    ))}
                  </div>

                  {/* 결제 리스트 (미납·미정산 우선 정렬) — hairline 행 */}
                  {paymentList.length === 0 ? (
                    <EmptyState icon="receipt_long" text={M.emptyPaymentFilter} />
                  ) : (
                    <ul className="divide-y divide-it-line dark:divide-rink-700 border-t border-it-line dark:border-rink-700">
                      {paymentList.map((s) => (
                        <StudentRow key={s.registrationId} student={s} variant="payment" />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            {/*
              후불 정산 확정 영역 — 후불 대상 ≥1 + 월 일치 + 전환 중 아님일 때만 (full-bleed, controlled).
              섹션 자체도 HIGH-1 월 게이트를 갖지만, 페이지도 monthMatches 아닐 때 렌더 보류로 일관.
            */}
            {monthMatches && !isMonthLoading && hasPostpaidTarget && (
              <PostpaidSettlementSection
                classId={classId}
                yearMonth={yearMonth}
                canWrite={canWrite}
                onConfirmed={reloadCurrentMonth}
                iceTheme
              />
            )}

            <div className="h-8" aria-hidden="true" />
          </>
        )}
      </main>
    </MobileContainer>
  );
}

/** 학생 행 — variant 로 메타 분기. roster: 등록일·학부모·출석 / payment: 결제방식·금액·출석·상태. */
function StudentRow({
  student,
  variant,
  contact = null,
  isChatOpening = false,
  onChat,
}: {
  student: PaymentStudent;
  variant: 'roster' | 'payment';
  /** [H-02] 부모 우선 연락 대상 — roster variant 전용, null 이면 버튼 미노출 */
  contact?: ClassContact | null;
  isChatOpening?: boolean;
  onChat?: (contactUserId: string) => void;
}) {
  // 선불 UNSETTLED 는 "미정산"(후불 용어)이 아니라 "미구매" — 월권은 그 달만 유효하므로
  //   선택월에 거래 없는 선불 학생의 사실 상태는 재구매 전이다.
  const status =
    student.billingTiming === 'PREPAID' && student.billingStatus === 'UNSETTLED'
      ? { ...ROW_STATUS_META.UNSETTLED, label: MESSAGES.settlement.rowStatusUnpurchased }
      : (ROW_STATUS_META[student.billingStatus] ?? ROW_STATUS_META.UNSETTLED);
  const timing = TIMING_META[student.billingTiming] ?? TIMING_META.UNASSIGNED;
  const M = MESSAGES.academy.students;
  return (
    <li className="py-3 flex items-center gap-3">
      <div className="h-9 w-9 shrink-0 rounded-w-pill flex items-center justify-center bg-it-fill dark:bg-rink-700">
        <Icon name="person" className="text-[18px] text-it-ink-500 dark:text-rink-100" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-card-body font-bold text-it-ink-800 dark:text-white">
            {student.memberName}
          </p>
          {variant === 'payment' && (
            <span
              className={cn(
                'shrink-0 inline-flex items-center rounded-w-pill px-1.5 py-0.5 text-w-caption font-extrabold',
                timing.cls,
              )}
            >
              {timing.label}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-card-meta text-it-ink-500 dark:text-rink-300">
          {variant === 'roster' ? (
            <>
              {student.registrationDate && (
                <span className="font-num tabular-nums">
                  {M.playersEnrolledOn(formatDateKR(student.registrationDate))}
                </span>
              )}
              {student.payerName && (
                <span className="truncate">· {M.payerLabel(student.payerName)}</span>
              )}
              <span className="font-num tabular-nums text-it-blue-500 dark:text-it-blue-300">
                · {M.attendanceThisMonth(student.attendanceCount ?? 0)}
              </span>
            </>
          ) : (
            <>
              <span className="font-num tabular-nums">
                {M.attendanceThisMonth(student.attendanceCount ?? 0)}
              </span>
              {student.billingStatus === 'PAID' && student.paidAt && (
                <span className="font-num tabular-nums">· {formatDateKR(student.paidAt)}</span>
              )}
              {student.productName && <span className="truncate">· {student.productName}</span>}
            </>
          )}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        {SHOW_DIRECT_CHAT && variant === 'roster' && contact?.contactUserId && onChat && (
          <button
            type="button"
            onClick={() => onChat(contact.contactUserId!)}
            disabled={isChatOpening}
            aria-label={`${contact.contactName ?? student.memberName} ${MESSAGES.unitNotice.askDirect}`}
            className="inline-flex items-center gap-1 rounded-w-pill border-[1.5px] border-it-blue-500/40 px-2.5 py-1 text-w-caption font-bold text-it-blue-600 dark:text-it-blue-300 hover:bg-it-blue-50 dark:hover:bg-it-blue-900/40 transition-colors motion-reduce:transition-none disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
          >
            <Icon name="chat_bubble" className="text-[12px]" aria-hidden="true" />
            {MESSAGES.unitNotice.askDirect}
          </button>
        )}
        {variant === 'payment' && <AmountCell student={student} />}
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-w-pill px-2 py-0.5 text-w-caption font-extrabold',
            status.chip,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-w-pill', status.dot)} aria-hidden="true" />
          {status.label}
        </span>
      </div>
    </li>
  );
}

/** 결제 탭 금액 셀 — 확정=billedAmount / 후불 미확정=estimatedAmount+"예상" / UNASSIGNED=미표기. */
function AmountCell({ student }: { student: PaymentStudent }) {
  if (
    (student.billingStatus === 'PAID' ||
      student.billingStatus === 'BILLED' ||
      student.billingStatus === 'REFUNDED') &&
    student.billedAmount != null
  ) {
    return (
      <span className="text-card-body font-bold font-num text-it-ink-800 dark:text-white tabular-nums">
        {formatPrice(student.billedAmount)}
      </span>
    );
  }
  if (
    student.billingTiming === 'POSTPAID' &&
    student.billingStatus === 'UNSETTLED' &&
    student.estimatedAmount != null
  ) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-card-body font-bold font-num text-it-ink-600 dark:text-rink-100 tabular-nums">
          {formatPrice(student.estimatedAmount)}
        </span>
        <span className="rounded-w-pill bg-it-blue-500/10 px-1.5 py-0.5 text-w-caption font-extrabold text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-100">
          {MESSAGES.settlement.estimated}
        </span>
      </span>
    );
  }
  return (
    <span className="text-w-caption font-num text-it-ink-400 dark:text-rink-300 tabular-nums">-</span>
  );
}

/** 월 전환/불일치 중 결제 탭 본문 자리 — 스테일 데이터 대신 노출하는 로딩 스켈레톤. */
function PaymentMonthSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">{MESSAGES.settlement.monthLoading}</span>
      <div className="h-28 rounded-w-md bg-it-fill dark:bg-rink-800 animate-pulse motion-reduce:animate-none" />
      <div className="h-8 w-1/2 rounded-w-pill bg-it-fill dark:bg-rink-800 animate-pulse motion-reduce:animate-none" />
      <div className="h-40 rounded-w-md bg-it-fill dark:bg-rink-800 animate-pulse motion-reduce:animate-none" />
    </div>
  );
}

/** flat 빈 상태 — 흰 섹션 내부 중앙 정렬 (카드 박스 없음). */
function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700">
        <Icon name={icon} className="text-2xl text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
      </div>
      <p className="mt-2 text-card-body font-semibold text-it-ink-500 dark:text-rink-100">{text}</p>
    </div>
  );
}

function CountBlock({ label, value, dotClass }: { label: string; value: number; dotClass: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <span className={cn('h-1.5 w-1.5 rounded-w-pill', dotClass)} aria-hidden="true" />
        <span className="text-w-caption font-semibold text-it-ink-500 dark:text-rink-300">{label}</span>
      </div>
      <span className="text-w-h3 font-extrabold font-num text-it-ink-800 dark:text-white tabular-nums">
        {value}
      </span>
    </div>
  );
}
