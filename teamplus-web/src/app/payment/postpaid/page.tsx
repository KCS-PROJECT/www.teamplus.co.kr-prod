'use client';

export const dynamic = 'force-dynamic';

/**
 * 후불(POSTPAID) 수업료·대회 참가비 결제 화면 (Phase B-5-4)
 *
 * 감독이 정산 확정 시 학부모에게 발송한 "결제 요청" 알림의 deep-link 진입점.
 *   /payment/postpaid?orderNumber=POSTPAID-...&amount=...&name=...
 * 이미 생성된 pending Payment(orderNumber)를 활성 결제사(PG)로 결제 → /payment/complete → confirm.
 * (별도 미납 목록 화면 없이 알림→결제 단일 흐름)
 *
 * 결제사 분기 (checkout 과 동일):
 *   GET /payments/active-provider → 'toss'(위젯 렌더) | 'nice'(결제창 — 수단선택·약관 직접 렌더).
 *   후불 Payment 는 청구 확정 시점에 만들어져 결제사 미정이므로, 결제 시점의 활성
 *   결제사를 따른다. 실제 사용된 PG 는 승인 시 백엔드가 pgProvider 에 기록한다.
 *   나이스는 AUTHNICE.requestPay → 백엔드 /payments/nice/authorize 가 서명 검증+승인 후
 *   /payment/complete 로 303 리다이렉트한다(성공/실패 모두).
 *
 * 금액·상태 SoT = 서버 주문 조회(GET /payments/postpaid/order/:orderNumber).
 *   쿼리스트링 amount 는 발송 시점 스냅샷이라 재정산(금액 변경)·요청 취소를 반영하지
 *   못하므로 무시한다. completed/cancelled 주문은 위젯 없이 안내만 표시.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
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
import { PaymentSourceBadge } from '@/components/payment/PaymentSourceBadge';
import type { PaymentSourceType, PaymentBillingTiming } from '@/types/payment';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TossWidgets = any;

/** 결제사 — 서버(AppSettings.paymentProvider)가 정하는 값. */
type PaymentProvider = 'toss' | 'nice';

/** 나이스 결제창 결제수단. 결제창 호출 시 method 로 그대로 전달된다. */
type NiceMethod = 'card' | 'bank' | 'vbank';

interface ClientKeyResponse {
  clientKey: string;
}
interface ActiveProviderResponse {
  provider: PaymentProvider;
}
interface PostpaidOrder {
  orderNumber: string;
  amount: number;
  paymentStatus: string;
  paymentName: string | null;
  /** 결제 출처 파생 append — 연결 끊김 시 null. */
  sourceType?: PaymentSourceType | null;
  /** 선후불 파생 append — 연결 끊김 시 null. */
  billingTiming?: PaymentBillingTiming | null;
}

function PostpaidPayContent() {
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    showBackButton: true,
  });
  const { toast } = useToast();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const orderNumber = searchParams?.get('orderNumber') ?? '';
  const queryName = searchParams?.get('name') || MESSAGES.postpaidPay.title;

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
  // 환불 규정 '보기' — 결제 흐름 이탈 방지를 위해 모달로 표시(checkout 과 동일).
  const [policyModalType, setPolicyModalType] = useState<string | null>(null);
  const initRef = useRef(false);
  const renderedRef = useRef(false);

  // 서버 주문 조회 — 금액·상태 SoT (쿼리스트링 amount 불신).
  const [order, setOrder] = useState<PostpaidOrder | null>(null);
  const [orderNotFound, setOrderNotFound] = useState(false);

  useEffect(() => {
    if (!orderNumber || !user?.id) return;
    void (async () => {
      const res = await api.get<PostpaidOrder>(
        `/payments/postpaid/order/${encodeURIComponent(orderNumber)}`,
      );
      if (res.success && res.data) {
        setOrder(res.data);
      } else {
        setOrderNotFound(true);
      }
    })();
  }, [orderNumber, user?.id]);

  const amount = order?.amount ?? 0;
  const orderName = order?.paymentName ?? queryName;
  const payable = order?.paymentStatus === 'pending' && amount > 0;
  // 결제 불가 사유 — 위젯 없이 안내만 표시.
  const blockedMessage = !orderNumber
    ? MESSAGES.postpaidPay.invalid
    : orderNotFound
      ? MESSAGES.postpaidPay.invalid
      : order && order.paymentStatus === 'completed'
        ? MESSAGES.postpaidPay.alreadyCompleted
        : order && order.paymentStatus === 'cancelled'
          ? MESSAGES.postpaidPay.requestCancelled
          : order && !payable
            ? MESSAGES.postpaidPay.invalid
            : null;

  usePageReady(isReady || !!error || !!blockedMessage);

  // 토스 결제창에서 취소/실패로 복귀한 재진입(failUrl) 여부.
  //   토스는 같은 창을 문서 이동으로 쓰므로 만료된 결제창 URL 이 히스토리에 남는다.
  //   되돌아가면 토스가 "이미 종료된 세션입니다"(버튼 없는 토스 소유 화면)를 띄운다.
  //   이 화면은 결제 요청 알림 딥링크로도 진입해 "이전 화면"이 없을 수 있어,
  //   수업·대회 후불을 모두 담는 미납 목록으로 내보낸다.
  const isTossReturn = (searchParams?.get('error') ?? '') === 'fail';
  useBlockBackNavigation({
    enabled: isTossReturn,
    getRedirectTarget: () => '/payment/history?tab=pending',
  });

  const init = useCallback(async () => {
    if (initRef.current || !payable || !user?.id) return;
    initRef.current = true;
    try {
      // 0) 활성 결제사 — 실패 시 토스로 폴백한다(기존 동작 유지, 결제 시작을 막지 않음).
      const provRes = await api.get<ActiveProviderResponse>(
        '/payments/active-provider',
      );
      const resolved: PaymentProvider =
        provRes.success && provRes.data?.provider === 'nice' ? 'nice' : 'toss';
      setProvider(resolved);

      if (resolved === 'nice') {
        // N) 나이스 — clientKey 조회 + SDK 프리로드. 결제창은 버튼 클릭 시 연다.
        const ckRes = await api.get<ClientKeyResponse>('/payments/nice/client-key');
        if (!ckRes.success || !ckRes.data?.clientKey) {
          throw new Error(MESSAGES.payment2.widgetInitFailed);
        }
        setNiceClientKey(ckRes.data.clientKey);
        await loadNiceSdk();
        setIsReady(true);
        return;
      }

      // T) 토스 — clientKey 조회 + 위젯 렌더
      const ckRes = await api.get<ClientKeyResponse>('/payments/toss/client-key');
      if (!ckRes.success || !ckRes.data?.clientKey) {
        throw new Error(MESSAGES.payment2.widgetInitFailed);
      }
      const { loadTossPayments, ANONYMOUS } = await import(
        '@tosspayments/tosspayments-sdk'
      );
      const customerKey = user.id || ANONYMOUS;
      const tossPayments = await loadTossPayments(ckRes.data.clientKey);
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
      const msg =
        e instanceof Error ? e.message : MESSAGES.payment2.widgetInitFailed;
      setError(msg);
      toast.error(msg);
    }
  }, [payable, amount, user?.id, toast]);

  useEffect(() => {
    void init();
  }, [init]);

  /**
   * 나이스 결제창 호출 — checkout 과 동일 패턴.
   *  returnUrl 은 백엔드 절대 URL(나이스 인증 결과는 form POST 라 Next.js 페이지가 못 받는다).
   *  requestPay 는 결제창을 열고 즉시 반환하므로 await 하지 않는다.
   */
  const handleNicePay = useCallback(() => {
    if (!orderNumber || !niceClientKey || isPaying) return;
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
        orderId: orderNumber,
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
      const msg =
        e instanceof Error ? e.message : MESSAGES.payment2.requestFailed;
      setError(msg);
      toast.error(msg);
      setIsPaying(false);
    }
  }, [orderNumber, niceClientKey, isPaying, niceAgreed, niceMethod, amount, orderName, user?.name, toast]);

  const handlePay = useCallback(async () => {
    if (provider === 'nice') {
      handleNicePay();
      return;
    }
    if (!widgets || !orderNumber || isPaying) return;
    setIsPaying(true);
    try {
      const successUrl = `${window.location.origin}/payment/complete?provider=toss`;
      // 금액은 재진입 시 서버 조회로 확정되므로 실패 복귀 링크에 싣지 않는다.
      const failUrl = `${window.location.origin}/payment/postpaid?orderNumber=${encodeURIComponent(orderNumber)}&error=fail`;
      await widgets.requestPayment({
        orderId: orderNumber,
        orderName,
        successUrl,
        failUrl,
        // customerEmail 미전달 — users.email 은 이메일이 아니라 로그인 ID.
        customerName: user?.name,
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : MESSAGES.payment2.requestFailed;
      setError(msg);
      toast.error(msg);
      setIsPaying(false);
    }
  }, [provider, handleNicePay, widgets, orderNumber, isPaying, orderName, user?.name, toast]);

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title={MESSAGES.postpaidPay.title} forceNative />
      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck">
        {blockedMessage ? (
          <p className="py-10 text-center text-card-body text-it-ink-500 dark:text-rink-300">
            {blockedMessage}
          </p>
        ) : !order ? (
          // 주문 조회 중 — 서버 금액 확정 전에는 위젯/금액을 렌더하지 않는다.
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {/* 청구 요약 — ICETIMES navy 히어로 밴드 (full-bleed, 카드 박스 제거) */}
            <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-[22px] pb-6">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
                <Icon name="receipt_long" className="text-[14px]" aria-hidden="true" />
                <span className="truncate">{orderName}</span>
              </div>
              {/* 출처·선후불 배지 — 파생 필드 둘 다 있을 때만(연결 끊김 시 미표시). */}
              <PaymentSourceBadge
                sourceType={order.sourceType}
                billingTiming={order.billingTiming}
                className="mt-2"
              />
              <div className="mt-2 flex items-baseline gap-[3px]">
                <span className="text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] text-white tabular-nums">
                  {amount.toLocaleString()}
                </span>
                <span className="text-[19px] font-bold text-white">원</span>
              </div>
            </section>

            {/* 결제 수단 + 상태 — 흰 섹션 (8px 회색 갭) */}
            <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5">
              {/* 상태 */}
              {error ? (
                <p
                  role="alert"
                  className="py-6 text-center text-card-meta text-it-red-600 dark:text-it-red-200"
                >
                  {error}
                </p>
              ) : !isReady ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner size="lg" />
                </div>
              ) : null}

              {/* ── 나이스 분기: 결제수단 선택 (토스 위젯이 그려주던 것을 직접 구현 — checkout 동일) ── */}
              {provider === 'nice' && (
                <div aria-label={MESSAGES.payment2.methodSectionTitle}>
                  <h2 className="text-card-title font-bold text-it-ink-900 dark:text-white">
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
                          <span className="text-card-body font-semibold text-it-ink-900 dark:text-white">
                            {m.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {niceMethod === 'vbank' && (
                    <p className="mt-2 text-card-meta text-it-ink-500 dark:text-rink-300">
                      {MESSAGES.payment2.methodVbankHint}
                    </p>
                  )}

                  {/* 약관 동의 (토스 renderAgreement 대체) */}
                  <h2 className="mt-5 text-card-title font-bold text-it-ink-900 dark:text-white">
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
                </div>
              )}

              {/* 토스 위젯 호스트 — nice 일 때만 숨긴다(위젯 render 시점에 컨테이너가
                  display:none 이면 iframe 이 높이 0 으로 굳는다 — checkout 과 동일 이유). */}
              <div
                id="payment-method"
                className={
                  provider === 'nice' ? 'hidden' : 'min-h-[240px] overflow-visible'
                }
              />
              <div id="agreement" className={provider === 'nice' ? 'hidden' : 'mt-2'} />

              {isReady && !error && (
                <button
                  type="button"
                  onClick={handlePay}
                  // 나이스는 필수 동의 체크 전까지 비활성 — 토스는 위젯이 자체 검증한다.
                  disabled={isPaying || (provider === 'nice' && !niceAgreed)}
                  className="mt-5 w-full h-12 rounded-w-md bg-it-blue-500 text-white font-bold text-card-title shadow-sh-1 transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 disabled:opacity-60"
                >
                  {isPaying
                    ? MESSAGES.postpaidPay.paying
                    : MESSAGES.postpaidPay.payCta(amount)}
                </button>
              )}
            </section>
          </>
        )}
      </main>
      <TermsDocumentModal
        policyType={policyModalType}
        onClose={() => setPolicyModalType(null)}
      />
    </MobileContainer>
  );
}

export default function PostpaidPayPage() {
  return (
    <Suspense
      fallback={
        <MobileContainer hasBottomNav={false}>
          <div className="flex items-center justify-center h-screen">
            <Spinner size="lg" />
          </div>
        </MobileContainer>
      }
    >
      <PostpaidPayContent />
    </Suspense>
  );
}
