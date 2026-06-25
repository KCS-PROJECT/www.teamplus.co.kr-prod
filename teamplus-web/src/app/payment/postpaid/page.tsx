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
import { Icon } from '@/components/ui/Icon';
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
      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck">
        {invalid ? (
          <p className="py-10 text-center text-card-body text-it-ink-500 dark:text-rink-300">
            {MESSAGES.postpaidPay.invalid}
          </p>
        ) : (
          <>
            {/* 청구 요약 — ICETIMES navy 히어로 밴드 (full-bleed, 카드 박스 제거) */}
            <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-[22px] pb-6">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
                <Icon name="receipt_long" className="text-[14px]" aria-hidden="true" />
                <span className="truncate">{orderName}</span>
              </div>
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
