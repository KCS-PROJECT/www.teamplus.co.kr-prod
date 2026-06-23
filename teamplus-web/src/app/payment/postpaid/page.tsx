'use client';

export const dynamic = 'force-dynamic';

/**
 * 후불(POSTPAID) 수업료 결제 화면 (Phase B-5-4)
 *
 * 감독이 정산 확정 시 학부모에게 발송한 "수업료 결제 요청" 알림의 deep-link 진입점.
 *   /payment/postpaid?orderNumber=POSTPAID-...&amount=...&name=...
 * 이미 생성된 pending Payment(orderNumber)를 토스 위젯으로 결제 → /payment/complete → confirm.
 * (별도 미납 목록 화면 없이 알림→결제 단일 흐름)
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useAuth } from '@/contexts/AuthContext';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TossWidgets = any;
interface ClientKeyResponse {
  clientKey: string;
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
  const amount = Number(searchParams?.get('amount') ?? '0');
  const orderName = searchParams?.get('name') || MESSAGES.postpaidPay.title;

  const [widgets, setWidgets] = useState<TossWidgets | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);
  const renderedRef = useRef(false);

  const invalid = !orderNumber || !Number.isFinite(amount) || amount <= 0;

  usePageReady(isReady || !!error || invalid);

  const init = useCallback(async () => {
    if (initRef.current || invalid || !user?.id) return;
    initRef.current = true;
    try {
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
  }, [invalid, amount, user?.id, toast]);

  useEffect(() => {
    void init();
  }, [init]);

  const handlePay = useCallback(async () => {
    if (!widgets || !orderNumber || isPaying) return;
    setIsPaying(true);
    try {
      const successUrl = `${window.location.origin}/payment/complete?provider=toss`;
      const failUrl = `${window.location.origin}/payment/postpaid?orderNumber=${encodeURIComponent(orderNumber)}&amount=${amount}&error=fail`;
      await widgets.requestPayment({
        orderId: orderNumber,
        orderName,
        successUrl,
        failUrl,
        customerEmail: user?.email,
        customerName: user?.name,
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : MESSAGES.payment2.requestFailed;
      setError(msg);
      toast.error(msg);
      setIsPaying(false);
    }
  }, [widgets, orderNumber, amount, isPaying, orderName, user?.email, user?.name, toast]);

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title={MESSAGES.postpaidPay.title} forceNative />
      <main className="flex-1 overflow-y-auto bg-wbg dark:bg-puck px-5 py-5">
        {invalid ? (
          <p className="py-10 text-center text-card-body text-wtext-3 dark:text-rink-300">
            {MESSAGES.postpaidPay.invalid}
          </p>
        ) : (
          <>
            {/* 청구 요약 */}
            <section className="rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sm p-5 mb-4">
              <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                {orderName}
              </p>
              <p className="mt-1 text-2xl font-bold text-ice-500 tabular-nums">
                {amount.toLocaleString()}원
              </p>
            </section>

            {/* 상태 */}
            {error ? (
              <p
                role="alert"
                className="py-6 text-center text-card-meta text-error-600 dark:text-error-400"
              >
                {error}
              </p>
            ) : !isReady ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size="lg" />
              </div>
            ) : null}

            {/* 토스 위젯 호스트 */}
            <div
              id="payment-method"
              className="min-h-[240px] overflow-visible"
            />
            <div id="agreement" className="mt-2" />

            {isReady && !error && (
              <button
                type="button"
                onClick={handlePay}
                disabled={isPaying}
                className="mt-5 w-full h-12 rounded-xl bg-ice-500 text-white font-bold text-card-title shadow-md transition-colors motion-reduce:transition-none hover:bg-ice-500/90 active:brightness-95 disabled:opacity-60"
              >
                {isPaying
                  ? MESSAGES.postpaidPay.paying
                  : MESSAGES.postpaidPay.payCta(amount)}
              </button>
            )}
          </>
        )}
      </main>
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
