'use client';

/**
 * /classes/[id]/students — 코치/감독/오픈클래스감독 선수정보 페이지
 *
 * 팀·학원 공용 단일 진입점 — 도메인 무관 `GET /classes/:classId/payments` 단일 호출.
 * 학원 전용 수강생 페이지(AcademyClassStudentList)를 흡수 통합.
 * RBAC: 상위 (coach-access) layout 단일 가드 — coach/director/academy_director/admin.
 *
 * 2탭 구조 (DESIGN.md Pattern A wallet-tabs):
 *   ① 선수정보(roster, 기본): 이름·등록일·학부모 + 결제상태 칩 — "이 수업 누가 있나"
 *   ② 결제 현황(payment): 총수금·완납/미납 요약 + 미납 필터·우선 정렬 — "누가 냈나"
 *
 * 결제는 현재 완납/미납 2-state. 모드 분기(선불/후불)·정산 확정·출석 횟수는
 * 결제 재설계 Phase A~C 산출물에 의존 — 자리만 예약(미구현).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
// RBAC: (coach-access) layout 단일 가드 — useRequireRole 호출 제거.
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';

/** 결제 표시 — paid / unpaid 2-state. backend 의 pending/cancelled/refunded 도 모두 "미납". */
type PaymentState = 'paid' | 'unpaid';
type RawPaymentState = 'paid' | 'pending' | 'unpaid' | 'cancelled' | 'refunded';

function normalizePaymentState(raw: string | null | undefined): PaymentState {
  return raw === 'paid' ? 'paid' : 'unpaid';
}

interface PaymentStudent {
  registrationId: string;
  memberId: string;
  memberName: string;
  memberType: string;
  registrationDate: string;
  enrollmentId: string | null;
  enrollmentStatus: string | null;
  productName: string | null;
  amount: number | null;
  paymentMethod: string | null;
  paidAt: string | null;
  paymentState: RawPaymentState;
  /** 결제자(학부모) 표시명 — 미결제 학생은 null */
  payerName?: string | null;
  /** [Phase C] 당월(이번 달) present 출석 횟수 */
  attendanceCount?: number;
}

interface PaymentsResponse {
  classId: string;
  className: string;
  teamId: string;
  teamName: string;
  teamCode: string;
  total: number;
  counts: Record<RawPaymentState, number>;
  totalPaidAmount: number;
  students: PaymentStudent[];
  products?: {
    id: string;
    productName: string;
    price: number;
    feeType?: string | null;
    billingTiming?: string | null;
    feePerSession?: number | null;
  }[];
  /** [Phase B 연동] 결제 방식 — PREPAID(선불) / POSTPAID(후불). 미지정 시 선불 폴백. */
  billingMode?: 'PREPAID' | 'POSTPAID' | string | null;
}

type TabKey = 'roster' | 'payment';
type PayFilter = 'all' | 'paid' | 'unpaid';

const STATE_META: Record<PaymentState, { label: string; chip: string; dot: string }> = {
  paid: { label: '완납', chip: 'bg-mint-100 text-rink-800 dark:bg-mint-500/20 dark:text-mint-100', dot: 'bg-mint-500' },
  unpaid: { label: '미납', chip: 'bg-flame-100 text-flame-500 dark:bg-flame-500/20 dark:text-flame-100', dot: 'bg-flame-500' },
};

function formatPrice(n?: number | null) {
  if (n == null) return '-';
  return `${n.toLocaleString('ko-KR')}원`;
}

function formatDateKR(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function ClassStudentsPage() {
  const params = useParams();
  const classId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : (raw ?? '');
  }, [params]);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: true,
  });

  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>('roster');
  const [payFilter, setPayFilter] = useState<PayFilter>('all');

  // 풀스크린 로더 fast-path — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const load = useCallback(async () => {
    if (!classId) return;
    setIsLoading(true);
    setError(null);
    // 도메인-무관 단일 엔드포인트 — owner(팀/학원) 분기 불필요. 가드는 (coach-access) layout.
    const res = await api.get<PaymentsResponse>(`/classes/${classId}/payments`);
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error?.message ?? '선수 정보를 불러올 수 없습니다.');
    }
    setIsLoading(false);
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 미납 합산 (paid 외 전부)
  const unpaidCount = useMemo(() => {
    if (!data) return 0;
    const c = data.counts;
    return (c.pending ?? 0) + (c.unpaid ?? 0) + (c.cancelled ?? 0) + (c.refunded ?? 0);
  }, [data]);

  // [Phase B] 결제 방식 — 후불(POSTPAID) 여부 + 회당 단가 (출석 × 단가 정산 안내용)
  const isPostpaid = data?.billingMode === 'POSTPAID';
  const postpaidFee = useMemo(() => {
    if (!data?.products) return null;
    const byTiming = data.products.find((p) => p.billingTiming === 'POSTPAID' && p.feePerSession != null);
    if (byTiming?.feePerSession != null) return byTiming.feePerSession;
    const anyFee = data.products.find((p) => p.feePerSession != null);
    return anyFee?.feePerSession ?? null;
  }, [data]);

  // 결제 탭 — 미납 우선 정렬 후 필터
  const paymentList = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.students].sort((a, b) => {
      const ra = normalizePaymentState(a.paymentState) === 'unpaid' ? 0 : 1;
      const rb = normalizePaymentState(b.paymentState) === 'unpaid' ? 0 : 1;
      return ra - rb;
    });
    if (payFilter === 'all') return sorted;
    return sorted.filter((s) => normalizePaymentState(s.paymentState) === payFilter);
  }, [data, payFilter]);

  const M = MESSAGES.academy.students;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={M.playersTitle} forceNative />
      <main
        className="flex-1 min-h-0 overflow-y-auto bg-wbg dark:bg-puck"
        role="main"
        aria-label={M.playersTitle}
      >
        {/* Hero — 탭 공통 (수업명·팀명·등록 인원) */}
        <section className="px-4 pt-4">
          <div className="rounded-w-xl bg-rink-800 dark:bg-rink-900 shadow-sh-rink p-5 text-white">
            <div className="text-w-caption font-extrabold tracking-[0.08em] text-mint-100">
              PLAYERS
            </div>
            {isLoading || !data ? null : (
              <>
                <h1 className="mt-2 text-w-h3 font-extrabold tracking-tight break-keep">
                  {data.className}
                </h1>
                <p className="mt-1 text-w-caption font-semibold text-mint-100/80">
                  {data.teamName}
                  {data.teamCode ? ` (${data.teamCode})` : ''}
                  <span className="ml-1.5 font-num tabular-nums">· {M.rosterCount(data.total)}</span>
                </p>
              </>
            )}
          </div>
        </section>

        {/* 탭 — DESIGN Pattern A wallet-tabs */}
        {data && !isLoading && (
          <section className="px-4 pt-3">
            <div
              role="tablist"
              aria-label={M.playersTitle}
              className="flex gap-1 rounded-w-md bg-wline-2 dark:bg-rink-800 p-1"
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
                    'flex-1 h-9 rounded-w-sm text-card-body font-bold transition-colors duration-150 motion-reduce:transition-none',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500',
                    tab === t.key
                      ? 'bg-wsurface dark:bg-rink-700 text-wtext-1 dark:text-white shadow-sh-1'
                      : 'text-wtext-3 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 에러 */}
        {error ? (
          <section className="px-4 pt-3 pb-8">
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 p-6 text-center">
              <Icon name="error_outline" className="text-3xl text-flame-500" aria-hidden="true" />
              <p className="mt-2 text-w-body font-semibold text-wtext-1 dark:text-white">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-w-md bg-ice-500 text-white text-w-small font-bold hover:bg-ice-600"
              >
                {M.retry}
              </button>
            </div>
          </section>
        ) : isLoading || !data ? null : tab === 'roster' ? (
          /* ── 탭 ① 선수정보 ── */
          <section className="px-4 pt-3 pb-8">
            {data.students.length === 0 ? (
              <EmptyCard icon="group_off" text={M.emptyRoster} />
            ) : (
              <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 overflow-hidden">
                <ul className="divide-y divide-wline-2 dark:divide-rink-700">
                  {data.students.map((s) => (
                    <StudentRow key={s.registrationId} student={s} variant="roster" />
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          /* ── 탭 ② 결제 현황 ── */
          <section className="px-4 pt-3 pb-8 flex flex-col gap-3">
            {/* 요약 — 선불: 총수금 / 후불: 후불 정산 배지 + 회당 단가 */}
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 p-4">
              {isPostpaid ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-w-pill bg-ice-500/10 dark:bg-ice-500/15 px-2.5 py-1 text-w-caption font-extrabold text-ice-500">
                    <Icon name="schedule" className="text-[15px]" aria-hidden="true" />
                    {M.billingPostpaid}
                  </span>
                  {postpaidFee != null && (
                    <span className="text-w-caption font-semibold text-wtext-2 dark:text-rink-100 font-num tabular-nums text-right break-keep">
                      {M.postpaidPerSessionNote(postpaidFee)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-baseline justify-between">
                  <span className="text-w-caption font-semibold text-wtext-3 dark:text-rink-300">
                    {M.paymentSummaryTotal}
                  </span>
                  <span className="text-w-h3 font-extrabold font-num text-wtext-1 dark:text-white tabular-nums">
                    {data.totalPaidAmount.toLocaleString('ko-KR')}
                    <span className="ml-0.5 text-w-body">원</span>
                  </span>
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <CountBlock label={STATE_META.paid.label} value={data.counts.paid ?? 0} dotClass="bg-mint-500" />
                <CountBlock label={STATE_META.unpaid.label} value={unpaidCount} dotClass="bg-flame-500" />
              </div>
              {isPostpaid && (
                <p className="mt-3 text-w-caption text-wtext-3 dark:text-rink-300 break-keep">
                  {M.postpaidNotice}
                </p>
              )}
            </div>

            {/* 미납 필터 칩 */}
            <div className="flex gap-1.5" role="group" aria-label={M.tabPayment}>
              {([
                { key: 'all' as const, label: M.filterAllPay, count: data.total },
                { key: 'paid' as const, label: STATE_META.paid.label, count: data.counts.paid ?? 0 },
                { key: 'unpaid' as const, label: STATE_META.unpaid.label, count: unpaidCount },
              ]).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={payFilter === f.key}
                  onClick={() => setPayFilter(f.key)}
                  className={cn(
                    'inline-flex items-center gap-1 h-8 px-3 rounded-w-pill text-card-meta font-bold transition-colors duration-150 motion-reduce:transition-none',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500',
                    payFilter === f.key
                      ? 'bg-ice-500 text-white'
                      : 'bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-700',
                  )}
                >
                  {f.label}
                  <span className="font-num tabular-nums opacity-80">{f.count}</span>
                </button>
              ))}
            </div>

            {/* 결제 리스트 (미납 우선 정렬) */}
            {paymentList.length === 0 ? (
              <EmptyCard icon="receipt_long" text={M.emptyPaymentFilter} />
            ) : (
              <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 overflow-hidden">
                <ul className="divide-y divide-wline-2 dark:divide-rink-700">
                  {paymentList.map((s) => (
                    <StudentRow key={s.registrationId} student={s} variant="payment" />
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>
    </MobileContainer>
  );
}

/** 학생 행 — variant 로 메타만 분기 (roster: 등록일·학부모 / payment: 금액·상품·결제일). */
function StudentRow({ student, variant }: { student: PaymentStudent; variant: 'roster' | 'payment' }) {
  const state = normalizePaymentState(student.paymentState);
  const meta = STATE_META[state];
  const M = MESSAGES.academy.students;
  return (
    <li className="px-4 py-3 flex items-center gap-3">
      <div className="h-9 w-9 shrink-0 rounded-w-pill flex items-center justify-center bg-wline-2 dark:bg-rink-700">
        <Icon name="person" className="text-[18px] text-wtext-2 dark:text-rink-100" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-w-body font-bold text-wtext-1 dark:text-white">
          {student.memberName}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-w-caption text-wtext-3 dark:text-rink-300">
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
              <span className="font-num tabular-nums text-ice-500 dark:text-ice-400">
                · {M.attendanceThisMonth(student.attendanceCount ?? 0)}
              </span>
            </>
          ) : (
            <>
              <span className="font-num tabular-nums">{formatPrice(student.amount)}</span>
              {student.productName && <span className="truncate">· {student.productName}</span>}
              {student.paidAt && (
                <span className="font-num tabular-nums">· {formatDateKR(student.paidAt)}</span>
              )}
            </>
          )}
        </div>
      </div>
      <span
        className={cn(
          'shrink-0 inline-flex items-center gap-1 rounded-w-pill px-2 py-1 text-w-caption font-extrabold',
          meta.chip,
        )}
      >
        <span className={cn('h-1.5 w-1.5 rounded-w-pill', meta.dot)} />
        {meta.label}
      </span>
    </li>
  );
}

function EmptyCard({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
        <Icon name={icon} className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
      </div>
      <p className="mt-2 text-w-body font-semibold text-wtext-2 dark:text-rink-100">{text}</p>
    </div>
  );
}

function CountBlock({ label, value, dotClass }: { label: string; value: number; dotClass: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <span className={cn('h-1.5 w-1.5 rounded-w-pill', dotClass)} aria-hidden="true" />
        <span className="text-w-caption font-semibold text-wtext-3 dark:text-rink-300">{label}</span>
      </div>
      <span className="text-w-h3 font-extrabold font-num text-wtext-1 dark:text-white tabular-nums">
        {value}
      </span>
    </div>
  );
}
