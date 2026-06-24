'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { verifyPaymentCompletion, getReceiptDownloadUrl } from '@/services/payment';
import { navigation } from '@/services/native-bridge';
import { api } from '@/services/api-client';
import type { Receipt } from '@/types/payment';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useBlockBackNavigation } from '@/hooks/useBlockBackNavigation';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardPathByUserType } from '@/lib/auth-routing';
import { MESSAGES } from '@/lib/messages';
import { usePageReady } from '@/hooks/usePageReady';

/**
 * Step 4: 결제 완료 페이지
 *
 * Design 7 Principles 적용:
 * 1. 화면 분석: 결제 플로우 4단계 - 결제 완료 확인
 * 2. 휴먼 디자인: 명확한 단계 표시와 친절한 안내
 * 3. AI 스타일 금지: 과도한 그라데이션 없음
 * 4. 페르소나 융합: frontend + analyzer + architect
 * 5. frontend-design 사용
 * 6. 결과 출력
 * 7. Tone & Manner: 존댓말, 친절한 안내
 */


function SuccessAnimation({
  creditsIssued,
  isPostpaid = false,
}: {
  creditsIssued: number;
  isPostpaid?: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center text-center mb-10"
      role="status"
      aria-live="assertive"
      aria-atomic="true"
    >
      {/* Animated checkmark - Primary Blue 색상 */}
      <div className="relative flex items-center justify-center mb-6" aria-hidden="true">
        {/* Main checkmark circle - Primary Blue */}
        <div className="w-20 h-20 rounded-w-pill bg-ice-500 flex items-center justify-center shadow-md relative z-10">
          <Icon name="check" className="text-white text-4xl" weight={700} />
        </div>
      </div>

      {/* Success message */}
      <h2 className="text-2xl font-extrabold text-wtext-1 dark:text-white mb-2 tracking-tight">
        {MESSAGES.payment2.completed}
      </h2>

      {/* Credits badge - Primary Blue. 후불(POSTPAID)은 사후 정산이라 결제권 발급 문구 대신 정산 완료 안내. */}
      <p className="text-card-emphasis text-ice-500 font-bold bg-ice-500/10 px-4 py-1.5 rounded-w-pill inline-block">
        {isPostpaid
          ? MESSAGES.postpaidPay.completedNote
          : MESSAGES.payment2.creditIssued(creditsIssued)}
      </p>
    </div>
  );
}

/**
 * PaymentAmountCard — 결제 금액 강조 카드 (신규 2026-05-18)
 *
 *  성공 메시지 ↔ 결제 상세 사이에 위치. 시각 위계 강화 목적.
 *  - 라벨: "최종 결제 금액" (text-card-meta)
 *  - 큰 금액: text-4xl + font-extrabold + text-ice-500 (Primary)
 *  - 주문번호: text-card-meta + font-mono (작은 회색 보조 정보)
 */
function PaymentAmountCard({ receipt }: { receipt: Receipt }) {
  return (
    <div
      className="w-full mb-5 bg-white dark:bg-rink-800 rounded-2xl border border-wline dark:border-rink-700 shadow-sm px-6 py-7 text-center"
      role="region"
      aria-label={MESSAGES.payment2.totalAmountLabel}
    >
      <p className="text-card-meta text-wtext-3 dark:text-rink-300 font-medium mb-2">
        {MESSAGES.payment2.totalAmountLabel}
      </p>
      <p
        className="text-4xl font-extrabold text-ice-500 tabular-nums tracking-tight mb-3"
        aria-label={`${receipt.totalAmount.toLocaleString()}원`}
      >
        {receipt.totalAmount.toLocaleString()}
        <span className="text-2xl font-bold ml-1 text-wtext-1 dark:text-white" aria-hidden="true">원</span>
      </p>
      <p className="text-card-meta text-wtext-3 dark:text-rink-300 font-mono tracking-wide">
        {MESSAGES.payment2.orderNumberLabel} {receipt.orderNumber}
      </p>
    </div>
  );
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {

  return (
    <div className="w-full" role="region" aria-label="결제 영수증">
      <div className="relative w-full bg-white dark:bg-rink-800 rounded-2xl p-6 shadow-sm border border-wline dark:border-rink-700">
        {/* Top notch decoration */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-wbg dark:bg-rink-900 rounded-w-pill border border-wline dark:border-rink-700 z-10" aria-hidden="true"></div>

        {/*
          정의 목록(dl/dt/dd) — 영수증 항목의 시맨틱 구조.
          [수정 2026-05-18] 항목 순서 변경: 수업명 → 수강생 → 결제 수단 → 결제 일시 → 할부유무.
            주문번호 / 최종 결제 금액은 상단 PaymentAmountCard 로 이동.
        */}
        <dl className="flex flex-col gap-5">
          {/* 1. 수업명 — enrollment 있을 때만 표시 */}
          {receipt.className && (
            <div className="flex justify-between items-center">
              <dt className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">
                {MESSAGES.payment2.classLabel}
              </dt>
              <dd className="text-card-body text-wtext-1 dark:text-white font-medium text-right max-w-[60%] truncate">
                {receipt.className}
              </dd>
            </div>
          )}

          {/* 2. 수강생 — enrollment 있을 때만 표시 */}
          {receipt.childName && (
            <div className="flex justify-between items-center">
              <dt className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">
                {MESSAGES.enrollment.studentLabel}
              </dt>
              <dd className="text-card-body text-wtext-1 dark:text-white font-medium">
                {receipt.childName}
              </dd>
            </div>
          )}

          {/*
            3. 결제 수단
            [수정 2026-05-18] 카카오페이 K 아이콘 하드코딩 제거 — 모든 결제에 카카오 아이콘이
              노출되던 placeholder 흔적 제거. PG SDK enum(card/easy/vbank/trans/phone/toss)을
              MESSAGES.payment2.paymentMethodMap 으로 한글 라벨 변환. fallback 으로 원본 코드 유지.
              공통코드화 미적용 사유: PG 스펙 종속 + 위젯 위임 구조 — 정적 매핑이 정답.
          */}
          <div className="flex justify-between items-center">
            <dt className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">{MESSAGES.payment2.paymentMethodLabel}</dt>
            <dd className="flex items-center gap-2">
              <Icon name="credit_card" className="text-wtext-3 dark:text-rink-300 text-base" aria-hidden="true" />
              <span className="text-card-body text-wtext-1 dark:text-white font-medium">
                {MESSAGES.payment2.paymentMethodMap[receipt.paymentMethod] ?? receipt.paymentMethod}
                {receipt.cardLastFour && ` (${receipt.cardLastFour})`}
              </span>
            </dd>
          </div>

          {/* 4. 결제 일시 */}
          <div className="flex justify-between items-center">
            <dt className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">{MESSAGES.payment2.paymentDateLabel}</dt>
            <dd className="text-card-body text-wtext-1 dark:text-white font-medium">
              {receipt.paymentDate}
            </dd>
          </div>

          {/* 5. 할부유무 — installment 응답 있을 때만 표시 (없으면 항목 자체 미노출) */}
          {receipt.installment && (
            <div className="flex justify-between items-center">
              <dt className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">
                {MESSAGES.payment2.installmentLabel}
              </dt>
              <dd className="text-card-body text-wtext-1 dark:text-white font-medium">
                {receipt.installment}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Security message */}
      <div className="mt-6 flex items-center justify-center gap-2 text-card-meta text-wtext-3 dark:text-rink-300">
        <Icon name="lock" className="text-[14px]" />
        <span>{MESSAGES.payment2.securePayment}</span>
      </div>
    </div>
  );
}

function PaymentCompleteContent() {
  const searchParams = useSearchParams();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [creditsIssued, setCreditsIssued] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  // [수정 2026-05-13] React 19 strict mode 더블 마운트 방지 — 토스 confirm 중복 호출 차단.
  //   백엔드 Redis 락(60s)이 두 번째 호출을 "결제 승인이 이미 진행 중입니다" 로 거절하므로
  //   클라이언트 ref 가드로 1회 보장.
  const confirmCalledRef = useRef(false);

  // [수정 2026-05-18] AppBar 숨김 — 결제 완료 화면은 헤더/스텝인디케이터 없이 영수증 집중.
  //   BottomNav는 유지 (홈·메뉴 이동 경로 보존). 뒤로가기 버튼 없음 (홈으로 이동 CTA 전용).
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: false,
  });

  // 기존 KG이니시스 콜백 파라미터
  const orderNumber = searchParams?.get('orderNumber') || '';
  const tid = searchParams?.get('tid') || undefined;
  const resultCode = searchParams?.get('resultCode') || undefined;

  // [추가 2026-05-13] 토스 결제위젯 successUrl 콜백 파라미터
  //  successUrl 형식: /payment/complete?provider=toss&paymentKey=...&orderId=...&amount=...
  const provider = searchParams?.get('provider') || '';
  const tossPaymentKey = searchParams?.get('paymentKey') || '';
  const tossOrderId = searchParams?.get('orderId') || '';
  const tossAmount = Number(searchParams?.get('amount') ?? '0');

  const [confirmError, setConfirmError] = useState<string | null>(null);
  // [2026-06-09] 오픈클래스 자녀 복수 결제 — 다음 자녀 순차 큐.
  const { navigate } = useNavigation();
  const { user } = useAuth();
  // 역할별 홈 경로 (parent → /parent, director → /director, admin → /admin 등)
  const homePath = getDashboardPathByUserType(user?.userType, '/parent');
  const [payQueue, setPayQueue] = useState<{
    classId: string;
    pairs: { childId: string; productId: string }[];
  } | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('openclass_pay_queue');
      if (raw) {
        const q = JSON.parse(raw);
        if (q && Array.isArray(q.pairs) && q.pairs.length > 0) {
          setPayQueue(q);
          return;
        }
      }
      // 큐 없음 = 단건 또는 마지막 건 완료 → 전체 내역 세션 정리.
      sessionStorage.removeItem('openclass_pay_session');
    } catch {
      /* ignore */
    }
  }, []);

  // 시스템 뒤로가기 차단 — 브라우저 뒤로가기/스와이프/Android 백키(popstate)로 토스
  // 결제창·checkout 에 되돌아가는 흐름을 막는다.
  //  - 복수 결제 큐 진행 중: 페이지 유지(null) — 순차 결제 흐름 보존.
  //  - 후불(POSTPAID) 정산 결제: 토스 위젯 successUrl redirect 로 history 에 결제창이
  //    남아, homePath 한 겹 차단 후 추가 뒤로가기로 결제창에 재진입할 수 있다.
  //    완전 차단(유지)으로 봉쇄하고, 홈 이동은 하단 "홈으로" CTA 로만 제공.
  //  - 그 외(선불): 기존대로 역할별 홈으로 replace.
  useBlockBackNavigation({
    getRedirectTarget: () => {
      if (payQueue && payQueue.pairs.length > 0) return null;
      if ((receipt?.orderNumber ?? '').startsWith('POSTPAID-')) return null;
      return homePath;
    },
  });

  useEffect(() => {
    // ── 토스 분기: provider=toss + paymentKey/orderId/amount 모두 있을 때 confirm 호출
    if (provider === 'toss' && tossPaymentKey && tossOrderId && tossAmount > 0) {
      if (confirmCalledRef.current) return; // strict mode 더블 마운트 방지
      confirmCalledRef.current = true;
      const confirmToss = async () => {
        interface TossConfirmRes {
          success: boolean;
          paymentId?: string;
          orderId?: string;
          amount?: number;
          method?: string;
          receiptUrl?: string | null;
          approvedAt?: string;
          idempotent?: boolean;
        }
        const res = await api.post<TossConfirmRes>('/payments/toss/confirm', {
          paymentKey: tossPaymentKey,
          orderId: tossOrderId,
          amount: tossAmount,
        });
        if (!res.success || !res.data) {
          setConfirmError(res.error?.message ?? MESSAGES.payment2.confirmFailed);
          return;
        }
        // 영수증·결제권 정보는 기존 verifyPaymentCompletion 으로 조회
        //  (Payment 완료 처리되었으므로 orderNumber 로 receipt/credit 조회 가능)
        const detail = await verifyPaymentCompletion({ orderNumber: tossOrderId });
        if (detail.success && detail.data) {
          setReceipt(detail.data.receipt);
          setCreditsIssued(detail.data.creditsIssued);
        }
      };
      void confirmToss();
      return;
    }
    // ── 기존 KG이니시스 분기
    if (!orderNumber) return;
    const load = async () => {
      const res = await verifyPaymentCompletion({ orderNumber, tid, resultCode });
      if (res.success && res.data) {
        setReceipt(res.data.receipt);
        setCreditsIssued(res.data.creditsIssued);
      }
    };
    void load();
  }, [orderNumber, tid, resultCode, provider, tossPaymentKey, tossOrderId, tossAmount]);

  const handleDownloadReceipt = async () => {
    if (!receipt) return;
    setIsDownloading(true);
    try {
      const res = await getReceiptDownloadUrl(receipt.id);
      if (res.success && res.data?.downloadUrl) {
        await navigation.openExternal(res.data.downloadUrl);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <MobileContainer>
      {/* Main content — 헤더·스텝인디케이터 제거 후 safe-area-top 여백으로 시작.
          [수정 2026-05-18] AppBar 제거로 상단 padding을 safe-area 기반으로 보강.
          [&>*]:shrink-0 으로 flex 자식 압축 방지. */}
      <main className="flex-1 flex flex-col items-center px-6 pt-[calc(var(--safe-area-inset-top,0px)+32px)] overflow-y-auto [&>*]:shrink-0">
        {confirmError && (
          <div className="w-full mb-4 rounded-xl border border-flame-200 bg-flame-50 dark:bg-flame-900/20 p-4 text-card-body text-flame-700 dark:text-flame-300">
            {MESSAGES.payment2.confirmFailed}: {confirmError}
          </div>
        )}
        {receipt ? (
          <>
            <SuccessAnimation
              creditsIssued={creditsIssued}
              isPostpaid={(receipt.orderNumber ?? '').startsWith('POSTPAID-')}
            />
            <PaymentAmountCard receipt={receipt} />
            <ReceiptCard receipt={receipt} />

            {/* Action buttons — inline (스크롤 마지막) */}
            <div className="w-full flex gap-3 pt-6">
              <button
                onClick={handleDownloadReceipt}
                disabled={isDownloading}
                className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-2 dark:text-rink-100 font-bold text-card-emphasis hover:bg-wbg dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50"
              >
                {isDownloading ? (
                  <div className="w-5 h-5 rounded-w-pill border-2 border-wline border-t-slate-600 animate-spin motion-reduce:animate-none"></div>
                ) : (
                  <Icon name="download" className="text-xl" />
                )}
                영수증
              </button>
              {payQueue && payQueue.pairs.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const [next, ...rest] = payQueue.pairs;
                    try {
                      if (rest.length > 0) {
                        sessionStorage.setItem(
                          'openclass_pay_queue',
                          JSON.stringify({ ...payQueue, pairs: rest }),
                        );
                      } else {
                        sessionStorage.removeItem('openclass_pay_queue');
                      }
                    } catch {
                      /* ignore */
                    }
                    navigate(
                      `/payment/options?classId=${payQueue.classId}&childId=${next.childId}${next.productId ? `&productId=${next.productId}` : ''}`,
                    );
                  }}
                  className="flex-[2] flex items-center justify-center h-14 rounded-xl bg-ice-500 text-white font-bold text-card-emphasis shadow-md hover:bg-ice-500/90 transition-all motion-reduce:transition-none active:brightness-95"
                >
                  다음 결제 진행 ({payQueue.pairs.length}건 남음)
                </button>
              ) : (
                <NavLink
                  href={homePath}
                  className="flex-[2] flex items-center justify-center h-14 rounded-xl bg-ice-500 text-white font-bold text-card-emphasis shadow-md hover:bg-ice-500/90 transition-all motion-reduce:transition-none active:brightness-95"
                >
                  홈으로 이동
                </NavLink>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-w-pill border-4 border-wline dark:border-rink-700 border-t-primary animate-spin mb-4 motion-reduce:animate-none"></div>
            <p className="text-wtext-3 dark:text-rink-300 text-card-body">{MESSAGES.loading.standard}</p>
          </div>
        )}
      </main>
    </MobileContainer>
  );
}

function LoadingFallback() {
  return (
    <MobileContainer hasBottomNav={false}>
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="w-12 h-12 rounded-w-pill border-4 border-wline dark:border-rink-700 border-t-primary animate-spin mb-4 motion-reduce:animate-none"></div>
        <p className="text-wtext-3 dark:text-rink-300 text-card-body">로딩 중...</p>
      </div>
    </MobileContainer>
  );
}

export default function PaymentCompletePage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PaymentCompleteContent />
    </Suspense>
  );
}
