'use client';

export const dynamic = 'force-dynamic';

/**
 * Step 3: 결제수단 — 결제사(PG)별 분기. 활성 결제사는 **서버가 정한다**.
 *
 *  공통 1단계: GET /payments/active-provider → 'toss' | 'nice'
 *
 *  ─── 토스페이먼츠 (위젯, 2026-05-13) ───────────────────────────────
 *   1) POST /payments/initiate (paymentMethod='toss') → orderNumber
 *   2) GET /payments/toss/client-key
 *   3) TossPayments(clientKey).widgets({ customerKey }) → setAmount → render
 *   4) 결제 버튼 → widgets.requestPayment({ successUrl, failUrl })
 *   5) 토스가 successUrl 로 리다이렉트 → /payment/complete 가 /toss/confirm 호출
 *
 *  ─── 나이스페이먼츠 (결제창, 2026-08-27) ──────────────────────────
 *   1) POST /payments/initiate (paymentMethod='nice') → orderNumber
 *   2) GET /payments/nice/client-key
 *   3) https://pay.nicepay.co.kr/v1/js/ 스크립트 로드
 *   4) 결제 버튼 → AUTHNICE.requestPay({ clientId, method, orderId, amount, returnUrl })
 *   5) 나이스가 returnUrl(=백엔드 /payments/nice/authorize)로 **form POST**
 *   6) 백엔드가 서명 검증 + 승인까지 마치고 /payment/complete 로 303 리다이렉트
 *
 *  두 결제사의 UI 차이 (여기가 분기의 핵심):
 *   토스 위젯은 결제수단 선택 UI 와 약관 동의 UI 를 **SDK 가 그려준다**.
 *   나이스는 결제창만 띄우므로 두 UI 를 **우리가 직접 그려야 한다**.
 *   그래서 nice 분기에만 selectedMethod/agreed 상태와 전용 섹션이 존재한다.
 *
 *  보안:
 *   - 카드 데이터 서버 저장 절대 금지 — PG SDK 가 토큰화/3DS 위임
 *   - clientKey 만 브라우저 노출, secretKey 는 백엔드 .env 만
 *   - orderId 멱등성 — backend 가 24h Redis 락
 *   - 금액은 서버 보관값과 대조 — 화면이 보낸 amount 를 그대로 믿지 않는다
 */

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import nextDynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { PaymentStepIndicator, StepHeadline } from '@/components/payment/PaymentStepIndicator';
import { useToast } from '@/components/ui/Toast';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useBlockBackNavigation } from '@/hooks/useBlockBackNavigation';
import { useAuth } from '@/contexts/AuthContext';
import { MESSAGES } from '@/lib/messages';
import { env } from '@/lib/env';
import { isNativeApp } from '@/lib/environment';
import { loadNiceSdk } from '@/lib/nice-sdk';
import { api } from '@/services/api-client';
import { usePageReady } from '@/hooks/usePageReady';
import { TermsDocumentModal } from '@/components/legal/TermsDocumentModal';

const GlobalMenu = nextDynamic(
  () => import('@/components/layout/GlobalMenu').then((mod) => ({ default: mod.GlobalMenu })),
  { ssr: false },
);

// SSR safe — 클라이언트에서만 import 되도록 dynamic.
// @tosspayments/tosspayments-sdk 는 browser only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TossPaymentsInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TossWidgets = any;

/** 결제사 — 서버(AppSettings.paymentProvider)가 정하는 값. */
type PaymentProvider = 'toss' | 'nice';

/** 나이스 결제창 결제수단. 결제창 호출 시 method 로 그대로 전달된다. */
type NiceMethod = 'card' | 'bank' | 'vbank';

interface InitiateResponse {
  id: string;
  orderNumber: string;
  /** 서버가 해석한 결제사. 화면 분기는 이 값을 최종 기준으로 삼는다. */
  pgProvider?: PaymentProvider;
}

interface ClientKeyResponse {
  clientKey: string;
}

interface ActiveProviderResponse {
  provider: PaymentProvider;
}

function PaymentCheckoutContent() {
  // [수정 2026-05-14 v2] 공통 컴포넌트 단일 노출 패턴 (사용자 요청).
  //   `<PageAppBar forceNative />` 가 Web/Native 모두에서 동일 AppBar 를 그리도록 하고,
  //   Flutter Native AppBar 는 비활성(`showAppBar:false`) — 이중 헤더 0, 시각 일관성 100%.
  //
  //   참고 동일 패턴: stickers, calendar, equipment-inspection, gift 등
  //   (`useDefaultUI()` 또는 `useNativeUI({showAppBar:false})` + `<PageAppBar forceNative />`).
  //
  //   회귀 방지: forceNative 가 있어야 Native(Android APK / iOS WebView)에서도 Web AppBar
  //   가 강제 렌더링됨. 없으면 PageAppBar.tsx:234 의 `if (isNative && !forceNative) return null`
  //   로 인해 Native 에서 사라짐.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    showBackButton: true,
  });

  const { back, navigate } = useNavigation();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const productId = searchParams?.get('productId') ?? '';
  const childId = searchParams?.get('childId') ?? '';
  const classId = searchParams?.get('classId') ?? '';
  const amount = Number(searchParams?.get('amount') ?? '0');
  const orderName = searchParams?.get('orderName') ?? '팀플러스 수업 결제';

  // 토스 결제창에서 취소/실패로 복귀한 재진입(failUrl) 여부.
  //   토스는 같은 창을 문서 이동으로 쓰므로 만료된 결제창 URL 이 히스토리에 남는다.
  //   되돌아가면 토스가 "이미 종료된 세션입니다"(버튼 없는 토스 소유 화면)를 띄우므로,
  //   이 상태에서는 히스토리 되짚기 대신 수업 상세로 내보낸다.
  const isTossReturn = (searchParams?.get('error') ?? '') === 'fail';
  useBlockBackNavigation({
    enabled: isTossReturn,
    getRedirectTarget: () => (classId ? `/classes/${classId}` : '/payment/select'),
  });

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
  // 환불 규정 '보기' — 결제 흐름 이탈 방지를 위해 모달로 표시.
  const [policyModalType, setPolicyModalType] = useState<string | null>(null);

  // 위젯 중복 렌더 방지
  const renderedRef = useRef(false);
  const initRef = useRef(false);

  /**
   * 0) 활성 결제사 조회 — 어느 PG 로 결제할지는 서버가 정한다.
   * 1) 결제 시작 — backend 에 Payment row 생성 + orderNumber 발급
   * 2) 결제사별 준비 (토스: 위젯 렌더 / 나이스: clientKey + SDK 프리로드)
   */
  useEffect(() => {
    if (initRef.current) return;
    if (!productId || !amount || !user?.id) return;
    initRef.current = true;

    const init = async () => {
      try {
        // 0) 활성 결제사 — 실패 시 토스로 폴백한다(기존 동작 유지, 결제 시작을 막지 않음).
        const provRes = await api.get<ActiveProviderResponse>(
          '/payments/active-provider',
        );
        const activeProvider: PaymentProvider =
          provRes.success && provRes.data?.provider === 'nice' ? 'nice' : 'toss';

        // 1) initiate — Payment row + orderNumber.
        //    paymentMethod 로 결제사를 넘겨야 백엔드가 KG 결제 URL 생성을 건너뛴다.
        const initiateRes = await api.post<InitiateResponse>('/payments/initiate', {
          productId,
          childId,
          classId,
          amount,
          paymentMethod: activeProvider,
        });
        if (!initiateRes.success || !initiateRes.data) {
          throw new Error(initiateRes.error?.message ?? MESSAGES.payment2.initFailed);
        }
        const newOrderId = initiateRes.data.orderNumber;
        setOrderId(newOrderId);

        // 서버가 되돌려준 pgProvider 를 최종 기준으로 삼는다 — 조회와 initiate 사이에
        //   관리자가 결제사를 바꿨다면 이 결제는 initiate 시점 값으로 고정되기 때문이다.
        const resolved: PaymentProvider = initiateRes.data.pgProvider ?? activeProvider;
        setProvider(resolved);

        if (resolved === 'nice') {
          // 2-N) 나이스 — clientKey 조회 + SDK 프리로드. 결제창은 버튼 클릭 시 연다.
          const ckRes = await api.get<ClientKeyResponse>('/payments/nice/client-key');
          if (!ckRes.success || !ckRes.data?.clientKey) {
            throw new Error('클라이언트키 조회 실패');
          }
          setNiceClientKey(ckRes.data.clientKey);
          await loadNiceSdk();
          setIsReady(true);
          return;
        }

        // 2-T) 토스 — clientKey 조회 + 위젯 렌더
        const ckRes = await api.get<ClientKeyResponse>('/payments/toss/client-key');
        if (!ckRes.success || !ckRes.data?.clientKey) {
          throw new Error('클라이언트키 조회 실패');
        }
        const clientKey = ckRes.data.clientKey;

        const { loadTossPayments, ANONYMOUS } = await import(
          '@tosspayments/tosspayments-sdk'
        );
        const customerKey = user.id || ANONYMOUS;
        const tossPayments: TossPaymentsInstance = await loadTossPayments(clientKey);
        const w: TossWidgets = tossPayments.widgets({ customerKey });
        await w.setAmount({ currency: 'KRW', value: amount });
        // [수정 2026-05-13] variantKey 옵션 제거 — 토스 대시보드 결제위젯 설정 미적용 상태에서
        //  'DEFAULT'/'AGREEMENT' 호출 시 결제수단 토글 비활성 문제. SDK 기본 흐름 사용.
        await Promise.all([
          w.renderPaymentMethods({ selector: '#payment-method' }),
          w.renderAgreement({ selector: '#agreement' }),
        ]);
        setWidgets(w);
        setIsReady(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : MESSAGES.payment2.widgetInitFailed;
        setError(msg);
        toast.error(msg);
      }
    };
    void init();
  }, [productId, childId, classId, amount, user?.id, toast]);

  /**
   * 나이스 결제창 호출.
   *
   *  returnUrl 을 **백엔드 절대 URL** 로 지정하는 게 핵심이다. 나이스는 인증 결과를
   *  form POST 로 보내는데 Next.js 페이지는 POST 를 받을 수 없다. 백엔드가 받아 서명 검증 +
   *  승인까지 마친 뒤 /payment/complete 로 리다이렉트한다.
   *
   *  requestPay 는 Promise 를 반환하지 않는다 — 결제창을 열고 즉시 반환하며, 이후 흐름은
   *  브라우저 문서 이동이다. 따라서 await 하지 않고 isPaying 도 되돌리지 않는다.
   */
  const handleNicePayment = () => {
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
        // [필수] SDK 가 함수 타입이 아니면 "필수 파라미터 fnError Funtion 누락되었습니다"
        //   alert 를 띄우고 결제창을 아예 열지 않는다.
        //   결제창을 띄우기 전 단계의 오류(파라미터 검증·통신 실패)만 여기로 온다.
        //   결제 자체의 성공/실패는 returnUrl POST → 백엔드 승인 경로로 처리된다.
        fnError: (result: { errorMsg?: string; resultMsg?: string }) => {
          const msg =
            result?.errorMsg ?? result?.resultMsg ?? MESSAGES.payment2.requestFailed;
          setError(msg);
          toast.error(msg);
          // 결제창이 닫힌 상태이므로 버튼을 되살려 재시도할 수 있게 한다.
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
  };

  const handlePayment = async () => {
    if (provider === 'nice') {
      handleNicePayment();
      return;
    }
    if (!widgets || !orderId || isPaying) return;
    setIsPaying(true);
    try {
      const successUrl = `${window.location.origin}/payment/complete?provider=toss`;
      const failUrl = `${window.location.origin}/payment/checkout?error=fail&productId=${encodeURIComponent(productId)}&childId=${encodeURIComponent(childId)}&classId=${encodeURIComponent(classId)}&amount=${amount}`;
      await widgets.requestPayment({
        orderId,
        orderName,
        successUrl,
        failUrl,
        // customerEmail 미전달 — users.email 은 이메일이 아니라 로그인 ID.
        customerName: user?.name,
      });
      // 토스가 successUrl 로 리다이렉트 → 이 코드 라인 이후는 도달하지 않음
    } catch (e) {
      const msg = e instanceof Error ? e.message : MESSAGES.payment2.requestFailed;
      setError(msg);
      toast.error(msg);
      setIsPaying(false);
    }
  };

  // 토스 위젯을 열지 않고 백엔드가 결제 완료 처리(mock). orderId 만 있으면 동작(위젯 isReady 무관).
  // ⚠️ 오픈 전 임시 노출 — 정식 서비스 오픈 시 이 핸들러와 아래 "테스트 결제" 버튼을 제거해야 한다(0원 결제 경로).
  const handleMockPayment = async () => {
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
  };

  const cancelLabel = useMemo(() => '돌아가기', []);

  return (
    <MobileContainer>
      {/* [2026-05-14 v2] forceNative — App/Web 동일 AppBar (공통 컴포넌트 단일 노출).
          Flutter Native AppBar 는 useNativeUI({showAppBar:false}) 로 꺼서 이중 헤더 차단. */}
      <PageAppBar title="수업 결제" forceNative />

      {/* Stepper */}
      <div className="px-6 py-4 bg-it-canvas dark:bg-puck">
        <PaymentStepIndicator currentStep={3} iceTheme />
      </div>

      <main
        className="flex-1 flex flex-col overflow-y-auto bg-it-canvas dark:bg-puck [&>*]:shrink-0"
        role="main"
      >
        {/* 결제 금액 요약 — ICETIMES navy 히어로 밴드 (full-bleed, 카드 박스 제거) */}
        <section
          className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-[22px] pb-6"
          aria-labelledby="payment-amount-label"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
            <Icon name="receipt_long" className="text-[14px]" aria-hidden="true" />
            <span id="payment-amount-label">총 결제 금액</span>
          </div>
          <div className="mt-2 flex items-baseline gap-[3px]">
            <span
              className="text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] text-white tabular-nums"
              aria-label={`${amount.toLocaleString()}원`}
            >
              {amount.toLocaleString()}
            </span>
            <span className="text-[19px] font-bold text-white" aria-hidden="true">원</span>
          </div>
        </section>

        {/* Step Headline — 흰 섹션 시작 (8px 회색 갭) */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-1">
          <StepHeadline currentStep={3} iceTheme />
        </section>

        {/* ── 나이스 분기: 결제수단 선택 (토스 위젯이 그려주던 것을 직접 구현) ── */}
        {provider === 'nice' && (
          <section
            className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5"
            aria-label={MESSAGES.payment2.methodSectionTitle}
          >
            <h2 className="text-card-title font-bold text-it-ink-900 dark:text-white">
              {MESSAGES.payment2.methodSectionTitle}
            </h2>
            <div className="mt-3 flex flex-col" role="radiogroup" aria-label={MESSAGES.payment2.methodSectionTitle}>
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
                    <span className="text-card-body font-semibold text-it-ink-900 dark:text-white">
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {niceMethod === 'vbank' && (
              <p className="mt-3 text-[12px] text-it-ink-500 dark:text-rink-300">
                {MESSAGES.payment2.methodVbankHint}
              </p>
            )}
          </section>
        )}

        {/* ── 나이스 분기: 약관 동의 (토스 renderAgreement 대체) ── */}
        {provider === 'nice' && (
          <section
            className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5"
            aria-label={MESSAGES.payment2.agreementTitle}
          >
            <h2 className="text-card-title font-bold text-it-ink-900 dark:text-white">
              {MESSAGES.payment2.agreementTitle}
            </h2>
            <label className="mt-3 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={niceAgreed}
                onChange={(e) => setNiceAgreed(e.target.checked)}
                disabled={isPaying}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-it-line-strong dark:border-rink-600 text-it-blue-500 focus:ring-2 focus:ring-it-blue-500/40"
              />
              <span className="text-card-body text-it-ink-700 dark:text-rink-100">
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
            {!isReady && !error && (
              <div className="flex items-center justify-center py-4 gap-2 text-it-ink-500 dark:text-rink-300">
                <Spinner className="w-4 h-4" />
                <span className="text-card-meta">{MESSAGES.loading.paymentWidget}</span>
              </div>
            )}
            {error && (
              <div className="mt-3 rounded-w-md border border-it-red-500/30 bg-it-red-50 dark:bg-it-red-500/15 p-4 text-card-body text-it-red-600 dark:text-it-red-200">
                {error}
              </div>
            )}
          </section>
        )}

        {/* 토스 결제수단 위젯 — 흰 섹션.
            ⚠️ nice 일 때만 숨긴다(provider === null 인 초기에는 보인다). 조건을
            `provider === 'toss'` 로 뒤집으면, 토스 위젯 render 시점에 컨테이너가 아직
            display:none 이라 iframe 이 높이 0 으로 굳는다 — setProvider 리렌더가
            renderPaymentMethods 호출보다 늦게 반영되기 때문이다. */}
        <section
          className={
            provider === 'nice'
              ? 'hidden'
              : 'mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5'
          }
          aria-label="결제 수단 선택"
        >
          {/* [수정 2026-05-13] overflow-hidden 제거 — 토스 위젯 내부 dropdown/모달 펼침 시
              컨테이너에 잘려 클릭이 비활성으로 보이던 문제. 토스 SDK 가 자체 스타일을 가지므로
              wrapper 는 min-height 만 유지.
              [수정 2026-05-14 Task #10] overflow-visible 명시 + 충분한 min-height 확보 (퀵계좌이체
              "30% 소득공제" 배지 하단 잘림 방지 · Android WebView 360px 폭에서 위젯 내부 badge
              line-height 부족 + 부모 overflow 클리핑이 동시 발생). 추가로 globals.css 에 토스
              위젯 badge 가독성 보강 규칙(`#payment-method` descendant 의 overflow-visible 폴백)
              을 함께 적용 — 두 곳을 같이 손대야 360px·xs breakpoint 에서도 안전. */}
          <div
            id="payment-method"
            className="min-h-[240px] overflow-visible"
            data-toss-widget-host
          />
        </section>

        {/* 토스 약관 위젯 — 흰 섹션. 숨김 조건은 위 결제수단 섹션과 동일한 이유로 nice 기준. */}
        <section
          className={
            provider === 'nice'
              ? 'hidden'
              : 'mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4'
          }
          aria-label="약관 동의"
        >
          <div id="agreement" className="min-h-[80px]" />

          {/* 위젯 로딩 / 에러 안내 */}
          {!isReady && !error && (
            <div className="flex items-center justify-center py-4 gap-2 text-it-ink-500 dark:text-rink-300">
              <Spinner className="w-4 h-4" />
              <span className="text-card-meta">{MESSAGES.loading.paymentWidget}</span>
            </div>
          )}
          {error && (
            <div className="rounded-w-md border border-it-red-500/30 bg-it-red-50 dark:bg-it-red-500/15 p-4 text-card-body text-it-red-600 dark:text-it-red-200">
              {error}
            </div>
          )}
        </section>

        {/* CTA — 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-4 pb-6 flex flex-col gap-3">
          <div className="flex items-center justify-center gap-1.5 text-it-ink-400 dark:text-rink-300">
            <Icon name="lock" filled className="text-card-body" />
            <span className="text-[11px] font-medium">
              {MESSAGES.payment2.securePayment} (
              {provider === 'nice' ? 'NICEPAY' : 'TossPayments'})
            </span>
          </div>
          {/* [추가] 환불 규정 보기 — 결제 전 환불 정책 고지 (앱 심사 Task 3).
                결제 진행 중 이탈하면 선택 상태가 사라지므로 페이지 이동 대신 모달로 연다. */}
          <button
            type="button"
            onClick={() => setPolicyModalType('refund')}
            className="inline-flex items-center justify-center gap-1 self-center text-[12px] font-medium text-it-ink-600 dark:text-rink-100 underline underline-offset-2 hover:text-it-blue-500 dark:hover:text-it-blue-300 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 rounded"
          >
            <Icon name="receipt_long" className="text-[14px]" aria-hidden="true" />
            {MESSAGES.payment2.viewRefundPolicy}
          </button>
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
            className="w-full bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none text-white rounded-w-md py-4 px-6 shadow-sh-1 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed font-bold text-card-title"
          >
            {isPaying ? (
              <span className="flex items-center gap-2">
                <Spinner className="w-4 h-4 text-white" />
                결제 진행 중...
              </span>
            ) : (
              `${amount.toLocaleString()}원 결제하기`
            )}
          </button>
          <button
            type="button"
            onClick={handleMockPayment}
            disabled={!orderId || isPaying}
            className="w-full rounded-w-md border border-dashed border-it-line-strong dark:border-rink-600 bg-it-fill dark:bg-rink-800 text-it-ink-500 dark:text-rink-200 py-3 font-semibold text-card-body transition-colors motion-reduce:transition-none hover:bg-it-line dark:hover:bg-rink-700 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {MESSAGES.payment2.mockPayButton}
          </button>
          <button
            type="button"
            onClick={() => back()}
            className="w-full bg-it-fill dark:bg-rink-700 text-it-ink-600 dark:text-rink-100 rounded-w-md py-3 font-semibold text-card-body transition-colors motion-reduce:transition-none hover:bg-it-line active:brightness-95"
          >
            {cancelLabel}
          </button>
        </section>
      </main>

      <TermsDocumentModal
        policyType={policyModalType}
        onClose={() => setPolicyModalType(null)}
      />
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}

export default function PaymentCheckoutPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Spinner />
        </div>
      }
    >
      <PaymentCheckoutContent />
    </Suspense>
  );
}
