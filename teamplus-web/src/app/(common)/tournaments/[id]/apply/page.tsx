'use client';

export const dynamic = 'force-dynamic';

/**
 * 대회 참가 결제 페이지 (2026-05-15 재작성).
 *
 * 기존: 자유 폼(팀명/연락처/메모) 기반 참가 신청.
 * 변경: 수업 결제(/payment/checkout) 와 동일한 결제사(PG)별 분기 결제 화면.
 *   결제사는 서버가 정하며(initiate 응답 pgProvider), 시작 시점에 고정된다.
 *
 * 공통 흐름:
 *   1) 대회 정보 조회 (getTournament) — 이름/일정/참가비/자녀 후보
 *   2) 자녀 선택 (학부모가 여러 자녀 보유 시) — selectedParticipantIds 매칭만 노출
 *   3) POST /tournaments/:id/payment/initiate → Payment + TournamentRegistration(PENDING) 생성
 *      응답의 orderNumber 를 PG orderId 로, pgProvider 를 분기 기준으로 사용
 *
 * ─── 토스페이먼츠 (위젯) ───────────────────────────────────────────
 *   4) GET /payments/toss/client-key → TossPayments.widgets({customerKey})
 *   5) setAmount + renderPaymentMethods + renderAgreement
 *   6) 결제 버튼 → widgets.requestPayment({orderId, orderName, successUrl, failUrl})
 *   7) 토스 → /payment/complete (수업 결제 공용) → POST /payments/toss/confirm
 *      → backend 가 TournamentRegistration.paymentStatus=PAID 갱신 → 캘린더 노출.
 *
 * ─── 나이스페이먼츠 (결제창) ──────────────────────────────────────
 *   4) GET /payments/nice/client-key + SDK(pay.nicepay.co.kr) 프리로드
 *   5) 결제수단 선택·약관 동의 UI 는 우리가 직접 그린다(위젯 없음 — checkout 과 동일)
 *   6) 결제 버튼 → AUTHNICE.requestPay({ clientId, method, orderId, amount, returnUrl })
 *   7) 나이스 → 백엔드 /payments/nice/authorize 가 서명 검증+승인 후
 *      /payment/complete 로 303 리다이렉트 (후처리는 토스와 공용).
 *
 * 테스트 결제(mock): 6) 대신 POST /payments/mock-confirm → /payment/complete?provider=mock
 *   으로 결제창 없이 동일 후처리를 태운다. 선불 대회만 해당(후불·무료는 결제 위젯 미진입).
 */

import { useEffect, useMemo, useRef, useState, Suspense, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
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
import { useBlockBackNavigation } from '@/hooks/useBlockBackNavigation';
import { usePageReady } from '@/hooks/usePageReady';
import { useAuth } from '@/contexts/AuthContext';
import { MESSAGES } from '@/lib/messages';
import { env } from '@/lib/env';
import { isNativeApp } from '@/lib/environment';
import { loadNiceSdk } from '@/lib/nice-sdk';
import { api } from '@/services/api-client';
import { TermsDocumentModal } from '@/components/legal/TermsDocumentModal';
import {
  getTournament,
  initiateTournamentPayment,
  registerTournament,
  buildTournamentChildOptions,
  isTournamentChildApplicable,
  type TournamentChildInput,
  type TournamentChildOption,
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

/** 결제사 — 서버(initiate 응답 pgProvider)가 정하는 값. */
type PaymentProvider = 'toss' | 'nice';

/** 나이스 결제창 결제수단. 결제창 호출 시 method 로 그대로 전달된다. */
type NiceMethod = 'card' | 'bank' | 'vbank';

/** 신청 선수 옵션 — 판정 SoT 는 tournament.service 의 공용 util(상세 CTA 와 공유). */
type ChildOption = TournamentChildOption;

interface ClientKeyResponse {
  clientKey: string;
}

function formatDateRange(start: string | null, end: string | null): string {
  // 기간 null = 일정 미정 대회 — "일정" 라벨 행에 표시되므로 중복 없는 값 문구 사용.
  if (!start || !end) return MESSAGES.tournament.datesTbdValue;
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
  // 결제사 — 확정 전에는 null 이라 어떤 결제 UI 도 그리지 않는다(토스 위젯 자리 깜빡임 방지).
  const [provider, setProvider] = useState<PaymentProvider | null>(null);
  const [niceClientKey, setNiceClientKey] = useState<string | null>(null);
  // 나이스 전용 — 토스 위젯이 대신 그려주던 두 가지를 직접 관리한다.
  const [niceMethod, setNiceMethod] = useState<NiceMethod>('card');
  const [niceAgreed, setNiceAgreed] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initStarted, setInitStarted] = useState(false);
  // [2026-06-16] 후불(POSTPAID) 대회 — 결제 위젯 없이 참가 신청만 처리 중 플래그.
  const [isRegistering, setIsRegistering] = useState(false);
  // 환불 규정 '보기' — 결제 흐름 이탈 방지를 위해 모달로 표시(checkout 과 동일).
  const [policyModalType, setPolicyModalType] = useState<string | null>(null);

  usePageReady(!isLoading);

  // 토스 결제창에서 취소/실패로 복귀한 재진입(failUrl) 여부.
  //   토스는 같은 창을 문서 이동으로 쓰므로 만료된 결제창 URL 이 히스토리에 남는다.
  //   되돌아가면 토스가 "이미 종료된 세션입니다"(버튼 없는 토스 소유 화면)를 띄우므로,
  //   이 상태에서는 히스토리 되짚기 대신 대회 상세로 내보낸다.
  const searchParams = useSearchParams();
  const isTossReturn = (searchParams?.get('error') ?? '') === 'fail';
  useBlockBackNavigation({
    enabled: isTossReturn && Boolean(tournamentId),
    getRedirectTarget: () => `/tournaments/${tournamentId}`,
  });

  const renderedRef = useRef(false);
  const initRef = useRef(false);

  // 1) 대회 정보 + 자녀 목록 조회
  const loadInitial = useCallback(async () => {
    if (!tournamentId || !user?.id) return;
    setIsLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        getTournament(tournamentId),
        api.get<{ children: TournamentChildInput[] } | TournamentChildInput[]>(
          '/children',
        ),
      ]);
      if (tRes.success && tRes.data) {
        setTournament(tRes.data);
      } else {
        setError(tRes.error?.message ?? MESSAGES.error.network);
        return;
      }
      // 자녀 옵션 — 지정 명단 + 주최 팀 승인 멤버십 기준으로 걸러진다.
      const childrenList = cRes.success && cRes.data
        ? Array.isArray(cRes.data)
          ? cRes.data
          : ((cRes.data as { children?: TournamentChildInput[] }).children ?? [])
        : [];
      // 자녀별 신청 가능 판정 — 상세 CTA 와 공유하는 공용 규칙(tournament.service).
      const filtered = buildTournamentChildOptions(tRes.data, childrenList);
      setChildOptions(filtered);
      // 기본 선택은 신청 가능한(미신청 + 미결제 + 자격 충족) 첫 선수로.
      const firstSelectable = filtered.find(isTournamentChildApplicable);
      if (firstSelectable) setSelectedChildId(firstSelectable.id);
    } finally {
      setIsLoading(false);
    }
  }, [tournamentId, user?.id]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

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

  // 주최 팀 승인 대기 자녀가 섞여 있으면 목록 아래에 사유 안내 1줄을 덧붙인다.
  const hasPendingApprovalChild = useMemo(
    () => childOptions.some((c) => c.teamMembership === 'pending'),
    [childOptions],
  );

  // 2) 결제 시작 — 자녀 선택 후 사용자가 '결제 진행' 누르면 결제사 확정 + 결제 UI 준비.
  const startPayment = useCallback(async () => {
    if (initRef.current) return;
    if (!tournament || !selectedChildId || amount <= 0 || !user?.id) return;
    initRef.current = true;
    setInitStarted(true);
    try {
      // a) initiate — Payment + TournamentRegistration(PENDING).
      //    결제사는 서버가 시작 시점에 고정해 pgProvider 로 되돌려준다.
      const initRes = await initiateTournamentPayment(tournamentId, {
        childId: selectedChildId,
        amount,
        gamesCount: tournament.feeType === 'TOTAL_FIXED' ? 1 : (tournament.totalGames ?? 1),
      });
      if (!initRes.success || !initRes.data) {
        throw new Error(initRes.error?.message ?? MESSAGES.payment2.initFailed);
      }
      setOrderId(initRes.data.orderNumber);
      const resolved: PaymentProvider =
        initRes.data.pgProvider === 'nice' ? 'nice' : 'toss';
      setProvider(resolved);

      if (resolved === 'nice') {
        // b-N) 나이스 — clientKey 조회 + SDK 프리로드. 결제창은 버튼 클릭 시 연다.
        const ckRes = await api.get<ClientKeyResponse>('/payments/nice/client-key');
        if (!ckRes.success || !ckRes.data?.clientKey) {
          throw new Error('클라이언트키 조회 실패');
        }
        setNiceClientKey(ckRes.data.clientKey);
        await loadNiceSdk();
        setIsReady(true);
        return;
      }

      // b-T) 토스 — clientKey 조회
      const ckRes = await api.get<ClientKeyResponse>('/payments/toss/client-key');
      if (!ckRes.success || !ckRes.data?.clientKey) {
        throw new Error('클라이언트키 조회 실패');
      }
      const clientKey = ckRes.data.clientKey;

      // c-T) SDK 로드 + 위젯 + setAmount + render
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
  }, [tournament, selectedChildId, amount, user?.id, tournamentId, toast]);

  /**
   * 나이스 결제창 호출 — checkout 과 동일 패턴.
   *  returnUrl 은 **백엔드 절대 URL**. 나이스는 인증 결과를 form POST 로 보내는데
   *  Next.js 페이지는 POST 를 받을 수 없다. 백엔드가 서명 검증 + 승인 후
   *  /payment/complete 로 303 리다이렉트한다(성공/실패 모두).
   *  requestPay 는 결제창을 열고 즉시 반환하므로 await 하지 않는다.
   */
  const handleNicePayment = useCallback(() => {
    if (!orderId || !niceClientKey || isPaying) return;
    if (!niceAgreed) {
      toast.error(MESSAGES.payment2.agreementNotChecked);
      return;
    }
    const authnice = typeof window !== 'undefined' ? window.AUTHNICE : undefined;
    if (!authnice) {
      const msg = MESSAGES.payment2.windowOpenFailed;
      setError(msg);
      toast.error(msg);
      return;
    }
    setIsPaying(true);
    try {
      authnice.requestPay({
        clientId: niceClientKey,
        method: niceMethod,
        orderId,
        amount,
        goodsName: orderName,
        returnUrl: `${env.NEXT_PUBLIC_API_URL}/api/v1/payments/nice/authorize`,
        // buyerEmail 미전달 — users.email 은 이메일이 아니라 로그인 ID 라 PG 에 보내지 않는다.
        buyerName: user?.name ?? undefined,
        // [필수] 함수 타입이 아니면 SDK 가 alert 후 결제창을 열지 않는다.
        //   결제창을 띄우기 전 단계의 오류만 여기로 온다.
        fnError: (result: { errorMsg?: string; resultMsg?: string }) => {
          const msg =
            result?.errorMsg ?? result?.resultMsg ?? MESSAGES.payment2.requestFailed;
          setError(msg);
          toast.error(msg);
          setIsPaying(false);
        },
        // 가상계좌 채번 시 필수 — 입금자에게 표시될 예금주명.
        ...(niceMethod === 'vbank'
          ? { vbankHolder: user?.name ?? '팀플러스' }
          : {}),
        // 앱 WebView 에서 카드사 앱 인증 후 우리 앱으로 복귀시키는 스킴.
        ...(isNativeApp() ? { appScheme: 'teamplus://' } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : MESSAGES.payment2.requestFailed;
      setError(msg);
      toast.error(msg);
      setIsPaying(false);
    }
  }, [orderId, niceClientKey, isPaying, niceAgreed, niceMethod, amount, orderName, user?.name, toast]);

  const handlePayment = useCallback(async () => {
    if (provider === 'nice') {
      handleNicePayment();
      return;
    }
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
        // customerEmail 미전달 — users.email 은 이메일이 아니라 로그인 ID.
        customerName: user?.name,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : MESSAGES.payment2.requestFailed;
      setError(msg);
      toast.error(msg);
      setIsPaying(false);
    }
  }, [provider, handleNicePayment, widgets, orderId, isPaying, orderName, tournamentId, user?.name, toast]);

  // 토스 위젯을 열지 않고 백엔드가 결제 완료 처리(mock). orderId 만 있으면 동작(위젯 isReady 무관).
  // 수업 결제(/payment/checkout)와 동일한 경로 — 완료 후처리도 공용(applyApprovedPayment)이라
  // TournamentRegistration 이 PAID 로 전환된다.
  // ⚠️ 오픈 전 임시 노출 — 정식 서비스 오픈 시 이 핸들러와 "테스트 결제" 버튼을 제거해야 한다(0원 결제 경로).
  const handleMockPayment = useCallback(async () => {
    if (!orderId || isPaying) return;
    setIsPaying(true);
    try {
      const res = await api.post('/payments/mock-confirm', { orderId });
      if (!res.success) {
        throw new Error(res.error?.message ?? MESSAGES.payment2.mockPayFailed);
      }
      navigate(`/payment/complete?provider=mock&orderId=${encodeURIComponent(orderId)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : MESSAGES.payment2.mockPayFailed;
      toast.error(msg);
      setIsPaying(false);
    }
  }, [orderId, isPaying, navigate, toast]);

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

      <main className="flex-1 flex flex-col bg-it-canvas dark:bg-puck gap-2 overflow-y-auto !pb-8" role="main">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : !tournament ? (
          <div className="mx-5 mt-4 rounded-w-md border border-it-red-200 bg-it-red-50 dark:bg-it-red-500/10 p-4 text-w-small text-it-red-700 dark:text-it-red-300">
            {error ?? '대회 정보를 불러올 수 없습니다.'}
          </div>
        ) : (
          <>
            {/* 대회 정보 — navy 히어로(요약 강조) */}
            <section
              aria-labelledby="tournament-info"
              className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-5 pb-5"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 shrink-0 rounded-w-md bg-it-red-500 text-white grid place-items-center">
                  <Icon name="emoji_events" className="text-[24px]" aria-hidden="true" filled />
                </div>
                <div className="flex-1 min-w-0">
                  <p id="tournament-info" className="text-w-caption font-bold uppercase tracking-wider text-it-red-300 mb-0.5">
                    대회
                  </p>
                  <h2 className="text-w-title font-extrabold text-white truncate">
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

            {/* 자녀 선택 — flat 흰 섹션 */}
            {childOptions.length > 0 ? (
              <section aria-labelledby="child-select" className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4">
                <p id="child-select" className="text-w-small font-bold text-it-ink-600 dark:text-rink-100 mb-2">
                  신청 선수
                </p>
                <div className="flex flex-col gap-2">
                  {childOptions.map((c) => {
                    const active = selectedChildId === c.id;
                    // [2026-06-17] 이미 신청/결제한 선수 — 자녀별 결제내역과 동일한 행으로 표시(선택 불가).
                    //   결제 화면에서는 읽기 전용(상태 배지 + 후불결제)으로만 두고 onCancel 을 넘기지 않는다.
                    //   참가/결제 취소 진입점은 대회 상세(/tournaments/[id]) 단일 — 결제 중 오조작 방지.
                    if (c.isPaid || c.isRegistered) {
                      return (
                        <ChildPaymentRow
                          key={c.id}
                          name={c.name}
                          amount={c.amount ?? 0}
                          paymentStatus={c.isPaid ? 'PAID' : (c.paymentStatus ?? 'UNPAID')}
                          orderNumber={c.orderNumber ?? null}
                          iceTheme
                          onPay={() => {
                            const params = new URLSearchParams({
                              orderNumber: c.orderNumber ?? '',
                              amount: String(c.amount ?? 0),
                              name: `${tournament.name} 참가비`,
                            });
                            navigate(`/payment/postpaid?${params.toString()}`);
                          }}
                        />
                      );
                    }
                    // 선택 가능 = 출생연도 자격 + 주최 팀 가입 승인 완료.
                    //   승인 대기(pending)는 사유를 알려야 하므로 숨기지 않고 배지로 표시한다.
                    const selectable = c.isEligible && c.isTeamMember;
                    const blockedLabel = !c.isEligible
                      ? '참가 대상 아님'
                      : c.teamMembership === 'pending'
                        ? MESSAGES.tournament.applyPendingApproval
                        : null;
                    const disabled = isReady || !selectable;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (!isReady && selectable) setSelectedChildId(c.id);
                        }}
                        disabled={disabled}
                        aria-label={
                          blockedLabel ? `${c.name} ${blockedLabel}` : c.name
                        }
                        className={`flex items-center justify-between gap-3 px-4 py-3 rounded-w-md border-[1.5px] transition-colors motion-reduce:transition-none ${
                          !selectable
                            ? 'border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900/40'
                            : active
                              ? 'border-it-blue-500 bg-it-blue-50 dark:bg-it-blue-500/10'
                              : 'border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800'
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon name="person" className={`text-[20px] ${active && selectable ? 'text-it-blue-500' : 'text-it-ink-400'}`} aria-hidden="true" />
                          <span className="font-bold text-it-ink-800 dark:text-white truncate">{c.name}</span>
                        </span>
                        {blockedLabel ? (
                          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-w-pill bg-it-fill text-it-ink-400 dark:bg-rink-700 dark:text-rink-300 text-w-caption font-bold">
                            {blockedLabel}
                          </span>
                        ) : active ? (
                          <Icon name="check_circle" className="text-it-blue-500 text-[20px]" filled aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {hasPendingApprovalChild && (
                  <p className="mt-2 text-w-caption font-medium text-it-ink-500 dark:text-rink-300">
                    {MESSAGES.tournament.applyPendingApprovalNote}
                  </p>
                )}
              </section>
            ) : (
              <div className="mx-5 mt-2 rounded-w-md border border-it-red-200 bg-it-red-50 dark:bg-it-red-500/10 p-4 text-w-small text-it-red-700 dark:text-it-red-300">
                이 대회에 참가 가능한 자녀가 없습니다. 코치/감독에게 참가 대상 등록을 문의하세요.
              </div>
            )}

            {/* 결제 금액 요약 — flat 흰 섹션. 후불 대회는 감독이 사전 입력한 예상 금액(있으면) 표시. */}
            {isPostpaid ? (
              <section aria-labelledby="amount-label" className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5">
                <p id="amount-label" className="text-w-small font-medium text-it-ink-500 dark:text-rink-300 mb-1">
                  참가비
                </p>
                {amount > 0 ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-w-title font-bold text-it-ink-800 dark:text-white tabular-nums font-num">
                        {amount.toLocaleString('ko-KR')}
                      </span>
                      <span className="text-w-body font-medium text-it-ink-800 dark:text-white">원</span>
                    </div>
                    <p className="mt-1 text-w-small font-medium text-it-ink-500 dark:text-rink-300">
                      {MESSAGES.tournament.postpaidEstimateNote}
                    </p>
                  </>
                ) : (
                  <p className="text-w-title font-bold text-it-ink-800 dark:text-white">
                    {MESSAGES.tournament.postpaidFeeLabel}
                  </p>
                )}
              </section>
            ) : (
              <section aria-labelledby="amount-label" className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5">
                <p id="amount-label" className="text-w-small font-medium text-it-ink-500 dark:text-rink-300 mb-1">
                  총 결제 금액
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-it-ink-800 dark:text-white tracking-tight tabular-nums font-num">
                    {amount.toLocaleString('ko-KR')}
                  </span>
                  <span className="text-xl font-medium text-it-ink-800 dark:text-white">원</span>
                </div>
              </section>
            )}

            {/* 후불 대회 — 결제 위젯 없이 참가 신청만. 안내 + 신청 버튼. */}
            {isPostpaid && (
              <div className="bg-it-surface dark:bg-it-blue-950 px-5 pb-2 flex flex-col gap-5">
                <div className="rounded-w-md border-[1.5px] border-it-blue-500/30 bg-it-blue-50 dark:bg-it-blue-500/10 p-4 flex items-start gap-2.5 text-w-small text-it-ink-600 dark:text-rink-100">
                  <Icon name="info" className="text-[18px] text-it-blue-500 shrink-0 mt-0.5" aria-hidden="true" filled />
                  <span>{MESSAGES.tournament.postpaidNotice}</span>
                </div>
                {error && (
                  <div className="rounded-w-md border border-it-red-200 bg-it-red-50 dark:bg-it-red-500/10 p-4 text-w-small text-it-red-700 dark:text-it-red-300">
                    {error}
                  </div>
                )}
                <div className="flex flex-col gap-3 pt-2 pb-6">
                  <button
                    type="button"
                    onClick={handlePostpaidRegister}
                    disabled={!selectedChildId || childOptions.length === 0 || isRegistering}
                    className="w-full bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none text-white rounded-w-md py-4 px-6 shadow-sh-1 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed font-bold text-w-title"
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
                    className="w-full bg-it-fill dark:bg-rink-700 text-it-ink-600 dark:text-rink-100 rounded-w-md py-3 font-semibold text-w-small"
                  >
                    돌아가기
                  </button>
                </div>
              </div>
            )}

            {/* 토스 위젯 (initStarted 후에만 렌더 — 무료/후불 대회는 표시 안 함) */}
            {!isFree && !isPostpaid && (
              <div className="bg-it-surface dark:bg-it-blue-950 px-5 pt-2 pb-2 flex flex-col gap-5">
                {!initStarted && (
                  <button
                    type="button"
                    onClick={startPayment}
                    disabled={!selectedChildId || childOptions.length === 0}
                    className="w-full bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none text-white rounded-w-md py-4 px-6 shadow-sh-1 font-bold text-w-title disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    결제 진행하기
                  </button>
                )}
                {initStarted && (
                  <>
                    {/* ── 나이스 분기: 결제수단 선택 (토스 위젯이 그려주던 것을 직접 구현 — checkout 동일) ── */}
                    {provider === 'nice' && (
                      <section aria-label={MESSAGES.payment2.methodSectionTitle}>
                        <h2 className="text-w-small font-bold text-it-ink-600 dark:text-rink-100">
                          {MESSAGES.payment2.methodSectionTitle}
                        </h2>
                        <div className="mt-2 flex flex-col" role="radiogroup" aria-label={MESSAGES.payment2.methodSectionTitle}>
                          {(
                            [
                              { value: 'card', label: MESSAGES.payment2.methodCard, icon: 'credit_card' },
                              { value: 'bank', label: MESSAGES.payment2.methodBank, icon: 'account_balance' },
                              { value: 'vbank', label: MESSAGES.payment2.methodVbank, icon: 'receipt_long' },
                            ] as { value: NiceMethod; label: string; icon: string }[]
                          ).map((m) => {
                            const selected = niceMethod === m.value;
                            return (
                              <button
                                key={m.value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setNiceMethod(m.value)}
                                disabled={isPaying}
                                className="flex w-full items-center gap-3 border-b border-it-line dark:border-rink-700 py-3.5 text-left last:border-b-0 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 rounded"
                              >
                                <span
                                  aria-hidden="true"
                                  className={
                                    selected
                                      ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[6px] border-it-blue-500'
                                      : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-it-line-strong dark:border-rink-600'
                                  }
                                />
                                <Icon
                                  name={m.icon}
                                  className="text-[18px] text-it-ink-500 dark:text-rink-300"
                                  aria-hidden="true"
                                />
                                <span className="text-w-small font-semibold text-it-ink-800 dark:text-white">
                                  {m.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {niceMethod === 'vbank' && (
                          <p className="mt-2 text-w-caption text-it-ink-500 dark:text-rink-300">
                            {MESSAGES.payment2.methodVbankHint}
                          </p>
                        )}
                      </section>
                    )}

                    {/* ── 나이스 분기: 약관 동의 (토스 renderAgreement 대체) ── */}
                    {provider === 'nice' && (
                      <section aria-label={MESSAGES.payment2.agreementTitle}>
                        <h2 className="text-w-small font-bold text-it-ink-600 dark:text-rink-100">
                          {MESSAGES.payment2.agreementTitle}
                        </h2>
                        <label className="mt-2 flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={niceAgreed}
                            onChange={(e) => setNiceAgreed(e.target.checked)}
                            disabled={isPaying}
                            className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-it-line-strong dark:border-rink-600 text-it-blue-500 focus:ring-2 focus:ring-it-blue-500/40"
                          />
                          <span className="text-w-small text-it-ink-600 dark:text-rink-100">
                            {MESSAGES.payment2.agreementRequiredPrefix}
                            {/* 라벨 속 링크 — preventDefault 로 체크박스 토글 없이 규정 모달만 연다. */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPolicyModalType('refund');
                              }}
                              className="underline underline-offset-2 font-semibold text-it-blue-500 dark:text-it-blue-300 hover:text-it-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 rounded"
                            >
                              {MESSAGES.payment2.agreementRequiredLink}
                            </button>
                            {MESSAGES.payment2.agreementRequiredSuffix}
                          </span>
                        </label>
                      </section>
                    )}

                    {/* 토스 위젯 호스트 — nice 일 때만 숨긴다(checkout 과 동일한 이유:
                        조건을 `provider === 'toss'` 로 뒤집으면 위젯 render 시점에 컨테이너가
                        아직 없어 iframe 이 높이 0 으로 굳을 수 있다). */}
                    <section aria-label="결제 수단 선택" className={provider === 'nice' ? 'hidden' : undefined}>
                      <div id="payment-method" className="min-h-[240px] overflow-visible" data-toss-widget-host />
                    </section>
                    <section aria-label="약관 동의" className={provider === 'nice' ? 'hidden' : undefined}>
                      <div id="agreement" className="min-h-[80px]" />
                    </section>
                    {!isReady && !error && (
                      <div className="flex items-center justify-center py-2 gap-2 text-it-ink-400 dark:text-rink-300">
                        <Spinner className="w-4 h-4" />
                        <span className="text-w-caption">{MESSAGES.loading.paymentWidget}</span>
                      </div>
                    )}
                    {error && (
                      <div className="rounded-w-md border border-it-red-200 bg-it-red-50 dark:bg-it-red-500/10 p-4 text-w-small text-it-red-700 dark:text-it-red-300">
                        {error}
                      </div>
                    )}
                    <div className="flex flex-col gap-3 pt-2 pb-6">
                      <div className="flex items-center justify-center gap-1.5 text-it-ink-400 dark:text-rink-300">
                        <Icon name="lock" filled className="text-w-small" />
                        <span className="text-w-caption font-medium">
                          {MESSAGES.payment2.securePayment} (
                          {provider === 'nice' ? 'NICEPAY' : 'TossPayments'})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handlePayment}
                        // 나이스는 필수 동의 체크 전까지 비활성 — 토스는 위젯이 자체 검증한다.
                        disabled={
                          !isReady ||
                          isPaying ||
                          !!error ||
                          (provider === 'nice' && !niceAgreed)
                        }
                        className="w-full bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none text-white rounded-w-md py-4 px-6 shadow-sh-1 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed font-bold text-w-title"
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
                        onClick={handleMockPayment}
                        disabled={!orderId || isPaying}
                        className="w-full rounded-w-md border border-dashed border-it-line-strong dark:border-rink-600 bg-it-fill dark:bg-rink-800 text-it-ink-500 dark:text-rink-200 py-3 font-semibold text-w-small transition-colors motion-reduce:transition-none hover:bg-it-line dark:hover:bg-rink-700 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {MESSAGES.payment2.mockPayButton}
                      </button>
                      <button
                        type="button"
                        onClick={() => back()}
                        className="w-full bg-it-fill dark:bg-rink-700 text-it-ink-600 dark:text-rink-100 rounded-w-md py-3 font-semibold text-w-small"
                      >
                        돌아가기
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {isFree && (
              <div className="mx-5 mt-2 rounded-w-md border border-mint/30 bg-mint/10 dark:bg-mint/15 p-4 text-w-small text-mint">
                무료 대회입니다. 결제 없이 참가 신청 가능합니다. 자세한 신청 방법은 코치/감독에게 문의하세요.
              </div>
            )}
          </>
        )}
      </main>

      <TermsDocumentModal
        policyType={policyModalType}
        onClose={() => setPolicyModalType(null)}
      />
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} className="text-[18px] text-white/60" aria-hidden="true" />
      <span className="text-w-small font-semibold text-white/60 min-w-[56px]">{label}</span>
      <span className="text-w-small font-bold text-white truncate">{value}</span>
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
