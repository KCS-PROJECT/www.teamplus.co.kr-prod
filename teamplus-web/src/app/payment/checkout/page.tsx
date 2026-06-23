'use client';

export const dynamic = 'force-dynamic';

/**
 * Step 3: 결제수단 — 토스페이먼츠 결제위젯 (v2 SDK, 2026-05-13 신규).
 *
 *  흐름:
 *   1) POST /payments/initiate 호출 → Payment row 생성 + orderNumber 반환 (paymentMethod='toss')
 *   2) GET /payments/toss/client-key 로 클라이언트키 조회
 *   3) TossPayments(clientKey).widgets({ customerKey: userId }) — 위젯 인스턴스
 *   4) widgets.setAmount({ currency: 'KRW', value: amount })
 *   5) widgets.renderPaymentMethods({ selector: '#payment-method' })
 *      widgets.renderAgreement({ selector: '#agreement' })
 *   6) 결제 버튼 → widgets.requestPayment({ orderId, orderName, successUrl, failUrl })
 *   7) 토스가 결제 처리 후 successUrl 로 paymentKey/orderId/amount 쿼리와 함께 리다이렉트
 *   8) /payment/complete 에서 POST /payments/toss/confirm 호출
 *
 *  보안:
 *   - 카드 데이터 서버 저장 절대 금지 — 토스 SDK 가 토큰화/3DS 위임
 *   - clientKey 만 브라우저 노출, secretKey/webhookSecret 은 백엔드 .env 만
 *   - orderId 멱등성 — backend 가 24h Redis 락
 */

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import nextDynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { PaymentStepIndicator, StepHeadline } from '@/components/payment/PaymentStepIndicator';
import { useToast } from '@/components/ui/Toast';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useAuth } from '@/contexts/AuthContext';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { usePageReady } from '@/hooks/usePageReady';

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

interface InitiateResponse {
  id: string;
  orderNumber: string;
}

interface ClientKeyResponse {
  clientKey: string;
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

  const { back } = useNavigation();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const productId = searchParams?.get('productId') ?? '';
  const childId = searchParams?.get('childId') ?? '';
  const classId = searchParams?.get('classId') ?? '';
  const amount = Number(searchParams?.get('amount') ?? '0');
  const orderName = searchParams?.get('orderName') ?? '팀플러스 수업 결제';

  const [orderId, setOrderId] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<TossWidgets | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 위젯 중복 렌더 방지
  const renderedRef = useRef(false);
  const initRef = useRef(false);

  /**
   * 1) 결제 시작 — backend 에 Payment row 생성 + orderNumber 발급
   * 2) 토스 클라이언트키 조회
   * 3) 토스 SDK 로드 → widgets 인스턴스 + setAmount + render
   */
  useEffect(() => {
    if (initRef.current) return;
    if (!productId || !amount || !user?.id) return;
    initRef.current = true;

    const init = async () => {
      try {
        // 1) initiate — Payment row + orderNumber
        const initiateRes = await api.post<InitiateResponse>('/payments/initiate', {
          productId,
          childId,
          classId,
          amount,
          paymentMethod: 'toss',
        });
        if (!initiateRes.success || !initiateRes.data) {
          throw new Error(initiateRes.error?.message ?? MESSAGES.payment2.initFailed);
        }
        const newOrderId = initiateRes.data.orderNumber;
        setOrderId(newOrderId);

        // 2) clientKey
        const ckRes = await api.get<ClientKeyResponse>('/payments/toss/client-key');
        if (!ckRes.success || !ckRes.data?.clientKey) {
          throw new Error('클라이언트키 조회 실패');
        }
        const clientKey = ckRes.data.clientKey;

        // 3) SDK 로드 + 위젯 인스턴스
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

  const handlePayment = async () => {
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
        customerEmail: user?.email,
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

  const cancelLabel = useMemo(() => '돌아가기', []);

  return (
    <MobileContainer>
      {/* [2026-05-14 v2] forceNative — App/Web 동일 AppBar (공통 컴포넌트 단일 노출).
          Flutter Native AppBar 는 useNativeUI({showAppBar:false}) 로 꺼서 이중 헤더 차단. */}
      <PageAppBar title="수업 결제" forceNative />

      {/* Stepper */}
      <div className="px-6 py-4">
        <PaymentStepIndicator currentStep={3} />
      </div>

      <main
        className="flex-1 flex flex-col px-5 space-y-5 overflow-y-auto [&>*]:shrink-0"
        role="main"
      >
        <StepHeadline currentStep={3} />

        {/* 결제 금액 요약 */}
        <section aria-labelledby="payment-amount-label">
          <div className="bg-white dark:bg-rink-800 rounded-2xl p-6 shadow-sm border border-wline-2 dark:border-rink-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Icon name="receipt_long" className="text-6xl text-ice-500" aria-hidden="true" />
            </div>
            <div className="relative z-10">
              <p
                id="payment-amount-label"
                className="text-wtext-3 dark:text-rink-300 text-card-body font-medium mb-1"
              >
                총 결제 금액
              </p>
              <div className="flex items-baseline gap-1">
                <span
                  className="text-3xl font-bold text-wtext-1 dark:text-white tracking-tight tabular-nums"
                  aria-label={`${amount.toLocaleString()}원`}
                >
                  {amount.toLocaleString()}
                </span>
                <span className="text-xl font-medium text-wtext-1 dark:text-white" aria-hidden="true">
                  원
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 토스 결제수단 위젯 */}
        <section aria-label="결제 수단 선택">
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

        {/* 토스 약관 위젯 */}
        <section aria-label="약관 동의">
          <div id="agreement" className="min-h-[80px]" />
        </section>

        {/* 위젯 로딩 / 에러 안내 */}
        {!isReady && !error && (
          <div className="flex items-center justify-center py-4 gap-2 text-wtext-3 dark:text-rink-300">
            <Spinner className="w-4 h-4" />
            <span className="text-card-meta">{MESSAGES.loading.paymentWidget}</span>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-flame-200 bg-flame-50 dark:bg-flame-900/20 p-4 text-card-body text-flame-700 dark:text-flame-300">
            {error}
          </div>
        )}

        {/* CTA */}
        <section className="flex flex-col gap-3 pt-2 pb-6">
          <div className="flex items-center justify-center gap-1.5 text-wtext-3 dark:text-rink-300">
            <Icon name="lock" filled className="text-card-body" />
            <span className="text-[11px] font-medium">
              {MESSAGES.payment2.securePayment} (TossPayments)
            </span>
          </div>
          {/* [추가] 환불 규정 보기 — 결제 전 환불 정책 고지 (앱 심사 Task 3) */}
          <NavLink
            href="/terms?section=refund"
            className="inline-flex items-center justify-center gap-1 self-center text-[12px] font-medium text-wtext-2 dark:text-rink-100 underline underline-offset-2 hover:text-ice-500 dark:hover:text-blue-300 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 rounded"
          >
            <Icon name="receipt_long" className="text-[14px]" aria-hidden="true" />
            {MESSAGES.payment2.viewRefundPolicy}
          </NavLink>
          <button
            type="button"
            onClick={handlePayment}
            disabled={!isReady || isPaying || !!error}
            className="w-full bg-ice-500 hover:bg-ice-500/90 active:brightness-95 transition-all motion-reduce:transition-none text-white rounded-xl py-4 px-6 shadow-md flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed font-bold text-card-title"
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
            onClick={() => back()}
            className="w-full bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 rounded-xl py-3 font-semibold text-card-body"
          >
            {cancelLabel}
          </button>
        </section>
      </main>

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
