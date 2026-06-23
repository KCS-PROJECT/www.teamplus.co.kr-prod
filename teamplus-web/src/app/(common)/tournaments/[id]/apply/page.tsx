'use client';

export const dynamic = 'force-dynamic';

/**
 * 대회 참가 결제 페이지 (2026-05-15 재작성).
 *
 * 기존: 자유 폼(팀명/연락처/메모) 기반 참가 신청.
 * 변경: 수업 결제(/payment/checkout) 와 동일한 토스 위젯 결제 화면.
 *
 * 흐름:
 *   1) 대회 정보 조회 (getTournament) — 이름/일정/참가비/자녀 후보
 *   2) 자녀 선택 (학부모가 여러 자녀 보유 시) — selectedParticipantIds 매칭만 노출
 *   3) POST /tournaments/:id/payment/initiate → Payment + TournamentRegistration(PENDING) 생성
 *      응답의 orderNumber 를 토스 위젯 orderId 로 사용
 *   4) GET /payments/toss/client-key → TossPayments.widgets({customerKey})
 *   5) setAmount + renderPaymentMethods + renderAgreement
 *   6) 결제 버튼 → widgets.requestPayment({orderId, orderName, successUrl, failUrl})
 *   7) 토스 → /payment/complete (수업 결제 공용) → POST /payments/toss/confirm
 *      → backend 가 TournamentRegistration.paymentStatus=PAID 갱신 → 캘린더 노출.
 */

import { useEffect, useMemo, useRef, useState, Suspense, useCallback } from 'react';
import { useParams } from 'next/navigation';
import nextDynamic from 'next/dynamic';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { ChildPaymentRow } from '@/components/tournament';
import { useNavigation } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useAuth } from '@/contexts/AuthContext';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import {
  getTournament,
  initiateTournamentPayment,
  registerTournament,
  cancelTournamentRegistration,
  type TournamentDetail,
} from '@/services/tournament.service';

const GlobalMenu = nextDynamic(
  () => import('@/components/layout/GlobalMenu').then((mod) => ({ default: mod.GlobalMenu })),
  { ssr: false },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TossPaymentsInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TossWidgets = any;

interface ChildOption {
  id: string;
  name: string;
  birthDate?: string | null;
  /** [2026-06-15] 이미 이 대회를 결제 완료한 선수 — 선택 비활성화(중복 결제 방지) */
  isPaid?: boolean;
  /** [2026-06-17] 이미 참가신청한 선수(미결제 포함) — 선택 비활성화. 자녀별 결제내역과 동일 표시. */
  isRegistered?: boolean;
  /** [2026-06-17] 등록 상태/금액/주문번호/등록ID — 신청완료 선수의 결제내역 행 표시용. */
  paymentStatus?: string;
  amount?: number;
  orderNumber?: string | null;
  registrationId?: string;
  /** [2026-06-15] 대회 대상 출생연도 자격 충족 여부 — 미달 시 선택 비활성화 */
  isEligible?: boolean;
}

interface ClientKeyResponse {
  clientKey: string;
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  if (s.toDateString() === e.toDateString()) return fmt(s);
  return `${fmt(s)} ~ ${fmt(e)}`;
}

function TournamentApplyContent() {
  const params = useParams<{ id: string }>();
  const tournamentId = params?.id ?? '';
  const { navigate, back } = useNavigation();
  const { toast } = useToast();
  const { modal } = useModal();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { user } = useAuth();

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    showBackButton: true,
  });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [childOptions, setChildOptions] = useState<ChildOption[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<TossWidgets | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initStarted, setInitStarted] = useState(false);
  // [2026-06-16] 후불(POSTPAID) 대회 — 결제 위젯 없이 참가 신청만 처리 중 플래그.
  const [isRegistering, setIsRegistering] = useState(false);

  usePageReady(!isLoading);

  const renderedRef = useRef(false);
  const initRef = useRef(false);

  // 1) 대회 정보 + 자녀 목록 조회
  const loadInitial = useCallback(async () => {
    if (!tournamentId || !user?.id) return;
    setIsLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        getTournament(tournamentId),
        api.get<{ children: Array<{ id: string; firstName?: string; lastName?: string; birthDate?: string | null }> } | Array<{ id: string; firstName?: string; lastName?: string; birthDate?: string | null }>>(
          '/children',
        ),
      ]);
      if (tRes.success && tRes.data) {
        setTournament(tRes.data);
      } else {
        setError(tRes.error?.message ?? MESSAGES.error.network);
        return;
      }
      // 자녀 옵션 — selectedParticipantIds 매칭만 노출.
      const childrenList = cRes.success && cRes.data
        ? Array.isArray(cRes.data)
          ? cRes.data
          : ((cRes.data as { children?: Array<{ id: string; firstName?: string; lastName?: string; birthDate?: string | null }> }).children ?? [])
        : [];
      const participantIds = Array.isArray(tRes.data?.selectedParticipantIds)
        ? (tRes.data?.selectedParticipantIds as unknown as string[])
        : [];
      // [2026-06-15] 이미 결제 완료(PAID)한 선수 — 선택 비활성화.
      const paidIds = Array.isArray(tRes.data?.paidParticipantIds)
        ? tRes.data.paidParticipantIds
        : [];
      // [2026-06-17] 내 자녀별 등록 상태(미결제 신청 포함) — 자녀별 결제내역과 동일하게 표시.
      const myRegs = Array.isArray(tRes.data?.myRegistrations)
        ? tRes.data.myRegistrations
        : [];
      const regByParticipant = new Map(
        myRegs.map((r) => [r.participantId, r]),
      );
      // [2026-06-15] 대회 대상 출생연도 자격 — 미달 선수는 선택 비활성화.
      //   감독이 명시 선택(selectedParticipantIds)한 선수는 자격 무관 허용.
      // [2026-06-16] 개별 연도 집합(eligibleBirthYears) 우선 — 정확 매칭(birthYear ∈ 배열).
      //   배열 없으면 기존 from/to 범위 폴백. 개별연도 대회에서 사이 연도 오허용 방지.
      const eligYears = Array.isArray(tRes.data?.eligibleBirthYears)
        ? tRes.data.eligibleBirthYears
        : null;
      const eligFrom = tRes.data?.eligibleBirthYearFrom ?? null;
      const eligTo = tRes.data?.eligibleBirthYearTo ?? null;
      const isChildEligible = (c: { id: string; birthDate?: string | null }) => {
        if (participantIds.includes(c.id)) return true; // 감독 명시 선택
        const by = c.birthDate ? new Date(c.birthDate).getFullYear() : null;
        if (by == null) return true; // 출생연도 불명 → 막지 않음(회귀 방지)
        if (eligYears && eligYears.length > 0) return eligYears.includes(by);
        if (eligFrom != null && by < eligFrom) return false;
        if (eligTo != null && by > eligTo) return false;
        return true;
      };
      const filtered: ChildOption[] = childrenList
        .map((c) => {
          const reg = regByParticipant.get(c.id);
          return {
            id: c.id,
            name: `${c.lastName ?? ''}${c.firstName ?? ''}`.trim() || '자녀',
            birthDate: c.birthDate ?? null,
            isPaid: paidIds.includes(c.id),
            // 결제완료(PAID)는 isPaid 로 별도 처리 → isRegistered 는 후불(POSTPAID) 미결제 신청만.
            //   선불의 결제 중단(PENDING)은 신청완료로 보지 않음(다시 결제 진행 가능해야 함).
            isRegistered:
              !!reg &&
              reg.paymentStatus !== 'PAID' &&
              tRes.data?.billingMode === 'POSTPAID',
            paymentStatus: reg?.paymentStatus,
            amount: reg?.amount ?? 0,
            orderNumber: reg?.orderNumber ?? null,
            registrationId: reg?.registrationId,
            isEligible: isChildEligible(c),
          };
        })
        .filter((c) => participantIds.length === 0 || participantIds.includes(c.id));
      setChildOptions(filtered);
      // 기본 선택은 신청 가능한(미신청 + 미결제 + 자격 충족) 첫 선수로.
      const firstSelectable = filtered.find(
        (c) => !c.isPaid && !c.isRegistered && c.isEligible,
      );
      if (firstSelectable) setSelectedChildId(firstSelectable.id);
    } finally {
      setIsLoading(false);
    }
  }, [tournamentId, user?.id]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // [2026-06-17] 대회 참가 취소 — 결제완료(환불)·미결제 신청 공통. registrationId 직접 사용.
  const handleCancelPayment = useCallback(
    async (childId: string, childName: string, registrationId?: string) => {
      if (!registrationId) return;
      const ok = await modal.confirm({
        title: '대회 참가 취소',
        message: `${childName} 선수의 대회 참가를 취소하시겠습니까?\n결제 완료된 건은 환불 처리됩니다.`,
        confirmText: '참가 취소',
        cancelText: '닫기',
        variant: 'danger',
      });
      if (!ok) return;
      setCancellingId(childId);
      const res = await cancelTournamentRegistration(
        tournamentId,
        registrationId,
      );
      if (res.success) {
        toast.success('대회 참가가 취소되었습니다.');
        await loadInitial();
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.general);
      }
      setCancellingId(null);
    },
    [tournamentId, modal, toast, loadInitial],
  );

  // 서버 계산과 일치한 금액 — feeType=TOTAL_FIXED 는 1회 단가, PER_GAME 은 totalGames 곱.
  const amount = useMemo(() => {
    if (!tournament) return 0;
    const fee = tournament.feePerGame ? Number(tournament.feePerGame) : 0;
    if (fee <= 0) return 0;
    if (tournament.feeType === 'TOTAL_FIXED') return fee;
    const games = tournament.totalGames ?? 1;
    return fee * Math.max(1, games);
  }, [tournament]);

  const orderName = useMemo(
    () => (tournament ? `${tournament.name} 참가 결제` : '대회 참가 결제'),
    [tournament],
  );

  // 2) 결제 시작 — 자녀 선택 후 사용자가 '결제 진행' 누르면 위젯 init.
  const startPayment = useCallback(async () => {
    if (initRef.current) return;
    if (!tournament || !selectedChildId || amount <= 0 || !user?.id) return;
    initRef.current = true;
    setInitStarted(true);
    try {
      // a) initiate — Payment + TournamentRegistration(PENDING)
      const initRes = await initiateTournamentPayment(tournamentId, {
        childId: selectedChildId,
        amount,
        gamesCount: tournament.feeType === 'TOTAL_FIXED' ? 1 : (tournament.totalGames ?? 1),
      });
      if (!initRes.success || !initRes.data) {
        throw new Error(initRes.error?.message ?? MESSAGES.payment2.initFailed);
      }
      setOrderId(initRes.data.orderNumber);

      // b) clientKey
      const ckRes = await api.get<ClientKeyResponse>('/payments/toss/client-key');
      if (!ckRes.success || !ckRes.data?.clientKey) {
        throw new Error('클라이언트키 조회 실패');
      }
      const clientKey = ckRes.data.clientKey;

      // c) SDK 로드 + 위젯 + setAmount + render
      const { loadTossPayments, ANONYMOUS } = await import('@tosspayments/tosspayments-sdk');
      const customerKey = user.id || ANONYMOUS;
      const tossPayments: TossPaymentsInstance = await loadTossPayments(clientKey);
      const w: TossWidgets = tossPayments.widgets({ customerKey });
      await w.setAmount({ currency: 'KRW', value: amount });
      if (!renderedRef.current) {
        await Promise.all([
          w.renderPaymentMethods({ selector: '#payment-method' }),
          w.renderAgreement({ selector: '#agreement' }),
        ]);
        renderedRef.current = true;
      }
      setWidgets(w);
      setIsReady(true);
    } catch (e) {
      initRef.current = false;
      const msg = e instanceof Error ? e.message : MESSAGES.payment2.widgetInitFailed;
      setError(msg);
      toast.error(msg);
    }
  }, [tournament, selectedChildId, amount, user?.id, user?.email, tournamentId, toast]);

  const handlePayment = useCallback(async () => {
    if (!widgets || !orderId || isPaying) return;
    setIsPaying(true);
    try {
      const successUrl = `${window.location.origin}/payment/complete?provider=toss`;
      const failUrl = `${window.location.origin}/tournaments/${tournamentId}/apply?error=fail`;
      await widgets.requestPayment({
        orderId,
        orderName,
        successUrl,
        failUrl,
        customerEmail: user?.email,
        customerName: user?.name,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : MESSAGES.payment2.requestFailed;
      setError(msg);
      toast.error(msg);
      setIsPaying(false);
    }
  }, [widgets, orderId, isPaying, orderName, tournamentId, user?.email, user?.name, toast]);

  // [2026-06-16] 후불(POSTPAID) 대회 — 결제 위젯 미진입, 참가 신청만 처리.
  const isPostpaid = tournament?.billingMode === 'POSTPAID';

  // 무료 대회 — 결제 흐름 미진입. 안내만 표시. (후불 대회는 별도 분기로 제외)
  const isFree = tournament != null && !isPostpaid && amount === 0;

  // 후불 대회 참가 신청 — 토스 위젯 없이 register 만 호출 → 안내 후 상세 복귀.
  const handlePostpaidRegister = useCallback(async () => {
    if (!tournament || !selectedChildId || isRegistering) return;
    setIsRegistering(true);
    setError(null);
    try {
      const res = await registerTournament(tournamentId, {
        childId: selectedChildId,
        gamesCount: tournament.totalGames ?? 1,
      });
      if (!res.success) {
        throw new Error(res.error?.message ?? MESSAGES.tournament.registerFailed);
      }
      await modal.alert({
        title: MESSAGES.tournament.registered,
        message: MESSAGES.tournament.postpaidNotice,
        buttonText: MESSAGES.common.confirm,
        variant: 'success',
      });
      navigate(`/tournaments/${tournamentId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : MESSAGES.tournament.registerFailed;
      setError(msg);
      toast.error(msg);
      setIsRegistering(false);
    }
  }, [tournament, selectedChildId, isRegistering, tournamentId, modal, navigate, toast]);

  return (
    <MobileContainer>
      <PageAppBar title="대회 참가 결제" forceNative />

      <main className="flex-1 flex flex-col px-5 py-4 gap-5 overflow-y-auto" role="main">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : !tournament ? (
          <div className="rounded-xl border border-flame-200 bg-flame-50 dark:bg-flame-900/20 p-4 text-w-small text-flame-700 dark:text-flame-300">
            {error ?? '대회 정보를 불러올 수 없습니다.'}
          </div>
        ) : (
          <>
            {/* 대회 정보 카드 */}
            <section
              aria-labelledby="tournament-info"
              className="bg-white dark:bg-rink-800 rounded-2xl p-5 border border-wline-2 dark:border-rink-700"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 shrink-0 rounded-xl bg-red-500 text-white grid place-items-center">
                  <Icon name="emoji_events" className="text-[24px]" aria-hidden="true" filled />
                </div>
                <div className="flex-1 min-w-0">
                  <p id="tournament-info" className="text-w-caption font-bold uppercase tracking-wider text-red-500 mb-0.5">
                    대회
                  </p>
                  <h2 className="text-w-title font-extrabold text-wtext-1 dark:text-white truncate">
                    {tournament.name}
                  </h2>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 text-w-small">
                {/* [2026-06-15] 카드박스 — 일정 + 장소 표시 (주최·참가비는 제외). */}
                <Row icon="calendar_today" label="일정" value={formatDateRange(tournament.startDate, tournament.endDate)} />
                <Row
                  icon="place"
                  label="장소"
                  value={
                    tournament.location ??
                    tournament.rink?.name ??
                    tournament.rink?.location ??
                    tournament.venue?.name ??
                    '장소 미정'
                  }
                />
              </div>
            </section>

            {/* 자녀 선택 */}
            {childOptions.length > 0 ? (
              <section aria-labelledby="child-select">
                <p id="child-select" className="text-w-small font-bold text-wtext-2 dark:text-rink-100 mb-2">
                  신청 선수
                </p>
                <div className="flex flex-col gap-2">
                  {childOptions.map((c) => {
                    const active = selectedChildId === c.id;
                    // [2026-06-17] 이미 신청/결제한 선수 — 자녀별 결제내역과 동일한 행으로 표시(선택 불가).
                    //   결제완료/후불결제/정산 대기 + 참가취소를 ChildPaymentRow 공용 컴포넌트로 통일.
                    if (c.isPaid || c.isRegistered) {
                      return (
                        <ChildPaymentRow
                          key={c.id}
                          name={c.name}
                          amount={c.amount ?? 0}
                          paymentStatus={c.isPaid ? 'PAID' : (c.paymentStatus ?? 'UNPAID')}
                          orderNumber={c.orderNumber ?? null}
                          cancelling={cancellingId === c.id}
                          onPay={() => {
                            const params = new URLSearchParams({
                              orderNumber: c.orderNumber ?? '',
                              amount: String(c.amount ?? 0),
                              name: `${tournament.name} 참가비`,
                            });
                            navigate(`/payment/postpaid?${params.toString()}`);
                          }}
                          onCancel={() =>
                            handleCancelPayment(c.id, c.name, c.registrationId)
                          }
                        />
                      );
                    }
                    const disabled = isReady || !c.isEligible;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (!isReady && c.isEligible) setSelectedChildId(c.id);
                        }}
                        disabled={disabled}
                        aria-label={
                          !c.isEligible ? `${c.name} 참가 대상 아님` : c.name
                        }
                        className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors motion-reduce:transition-none ${
                          !c.isEligible
                            ? 'border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900/40'
                            : active
                              ? 'border-ice-500 bg-ice-500/5 dark:bg-ice-500/10'
                              : 'border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800'
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon name="person" className={`text-[20px] ${active && c.isEligible ? 'text-ice-500' : 'text-wtext-3'}`} aria-hidden="true" />
                          <span className="font-bold text-wtext-1 dark:text-white truncate">{c.name}</span>
                        </span>
                        {!c.isEligible ? (
                          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300 text-w-caption font-bold">
                            참가 대상 아님
                          </span>
                        ) : active ? (
                          <Icon name="check_circle" className="text-ice-500 text-[20px]" filled aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              <div className="rounded-xl border border-flame-200 bg-flame-50 dark:bg-flame-900/20 p-4 text-w-small text-flame-700 dark:text-flame-300">
                이 대회에 참가 가능한 자녀가 없습니다. 코치/감독에게 참가 대상 등록을 문의하세요.
              </div>
            )}

            {/* 결제 금액 요약 — 후불 대회는 금액 미확정이므로 안내 문구로 대체. */}
            {isPostpaid ? (
              <section aria-labelledby="amount-label" className="bg-white dark:bg-rink-800 rounded-2xl p-5 border border-wline-2 dark:border-rink-700">
                <p id="amount-label" className="text-w-small font-medium text-wtext-3 dark:text-rink-300 mb-1">
                  참가비
                </p>
                <p className="text-w-title font-bold text-wtext-1 dark:text-white">
                  {MESSAGES.tournament.postpaidFeeLabel}
                </p>
              </section>
            ) : (
              <section aria-labelledby="amount-label" className="bg-white dark:bg-rink-800 rounded-2xl p-5 border border-wline-2 dark:border-rink-700">
                <p id="amount-label" className="text-w-small font-medium text-wtext-3 dark:text-rink-300 mb-1">
                  총 결제 금액
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-wtext-1 dark:text-white tracking-tight tabular-nums font-num">
                    {amount.toLocaleString('ko-KR')}
                  </span>
                  <span className="text-xl font-medium text-wtext-1 dark:text-white">원</span>
                </div>
              </section>
            )}

            {/* 후불 대회 — 결제 위젯 없이 참가 신청만. 안내 + 신청 버튼. */}
            {isPostpaid && (
              <>
                <div className="rounded-xl border border-ice-500/30 bg-ice-500/5 dark:bg-ice-500/10 p-4 flex items-start gap-2.5 text-w-small text-wtext-2 dark:text-rink-100">
                  <Icon name="info" className="text-[18px] text-ice-500 shrink-0 mt-0.5" aria-hidden="true" filled />
                  <span>{MESSAGES.tournament.postpaidNotice}</span>
                </div>
                {error && (
                  <div className="rounded-xl border border-flame-200 bg-flame-50 dark:bg-flame-900/20 p-4 text-w-small text-flame-700 dark:text-flame-300">
                    {error}
                  </div>
                )}
                <div className="flex flex-col gap-3 pt-2 pb-6">
                  <button
                    type="button"
                    onClick={handlePostpaidRegister}
                    disabled={!selectedChildId || childOptions.length === 0 || isRegistering}
                    className="w-full bg-ice-500 hover:bg-ice-500/90 active:brightness-95 transition-all text-white rounded-xl py-4 px-6 shadow-md flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed font-bold text-w-title"
                  >
                    {isRegistering ? (
                      <span className="flex items-center gap-2">
                        <Spinner className="w-4 h-4 text-white" />
                        {MESSAGES.common.processing}
                      </span>
                    ) : (
                      MESSAGES.tournament.postpaidApplyCta
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => back()}
                    className="w-full bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 rounded-xl py-3 font-semibold text-w-small"
                  >
                    돌아가기
                  </button>
                </div>
              </>
            )}

            {/* 토스 위젯 (initStarted 후에만 렌더 — 무료/후불 대회는 표시 안 함) */}
            {!isFree && !isPostpaid && (
              <>
                {!initStarted && (
                  <button
                    type="button"
                    onClick={startPayment}
                    disabled={!selectedChildId || childOptions.length === 0}
                    className="w-full bg-ice-500 hover:bg-ice-500/90 active:brightness-95 transition-all text-white rounded-xl py-4 px-6 shadow-md font-bold text-w-title disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    결제 진행하기
                  </button>
                )}
                {initStarted && (
                  <>
                    <section aria-label="결제 수단 선택">
                      <div id="payment-method" className="min-h-[240px] overflow-visible" data-toss-widget-host />
                    </section>
                    <section aria-label="약관 동의">
                      <div id="agreement" className="min-h-[80px]" />
                    </section>
                    {!isReady && !error && (
                      <div className="flex items-center justify-center py-2 gap-2 text-wtext-3 dark:text-rink-300">
                        <Spinner className="w-4 h-4" />
                        <span className="text-w-caption">{MESSAGES.loading.paymentWidget}</span>
                      </div>
                    )}
                    {error && (
                      <div className="rounded-xl border border-flame-200 bg-flame-50 dark:bg-flame-900/20 p-4 text-w-small text-flame-700 dark:text-flame-300">
                        {error}
                      </div>
                    )}
                    <div className="flex flex-col gap-3 pt-2 pb-6">
                      <div className="flex items-center justify-center gap-1.5 text-wtext-3 dark:text-rink-300">
                        <Icon name="lock" filled className="text-w-small" />
                        <span className="text-w-caption font-medium">
                          {MESSAGES.payment2.securePayment} (TossPayments)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handlePayment}
                        disabled={!isReady || isPaying || !!error}
                        className="w-full bg-ice-500 hover:bg-ice-500/90 active:brightness-95 transition-all text-white rounded-xl py-4 px-6 shadow-md flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed font-bold text-w-title"
                      >
                        {isPaying ? (
                          <span className="flex items-center gap-2">
                            <Spinner className="w-4 h-4 text-white" />
                            결제 진행 중...
                          </span>
                        ) : (
                          `${amount.toLocaleString('ko-KR')}원 결제하기`
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => back()}
                        className="w-full bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 rounded-xl py-3 font-semibold text-w-small"
                      >
                        돌아가기
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {isFree && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-w-small text-emerald-700 dark:text-emerald-300">
                무료 대회입니다. 결제 없이 참가 신청 가능합니다. 자세한 신청 방법은 코치/감독에게 문의하세요.
              </div>
            )}
          </>
        )}
      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} className="text-[18px] text-wtext-3 dark:text-rink-300" aria-hidden="true" />
      <span className="text-w-small font-semibold text-wtext-3 dark:text-rink-300 min-w-[56px]">{label}</span>
      <span className="text-w-small font-bold text-wtext-1 dark:text-white truncate">{value}</span>
    </div>
  );
}

export default function TournamentApplyPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Spinner /></div>}>
      <TournamentApplyContent />
    </Suspense>
  );
}
