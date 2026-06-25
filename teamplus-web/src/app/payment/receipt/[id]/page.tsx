'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { BackHeader } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { ReceiptCard } from '@/components/shared/ReceiptCard';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { getReceipt, getReceiptDownloadUrl } from '@/services/payment';
import { navigation } from '@/services/native-bridge';
import { MESSAGES } from '@/lib/messages';
import type { Receipt } from '@/types/payment';
import type { ReceiptStatus } from '@/components/shared/ReceiptCard';

/**
 * 영수증 상세 페이지
 * - 상단 성공/실패 상태 아이콘
 * - ReceiptCard 공통 컴포넌트 사용
 * - 하단: 이미지 저장 + 목록 돌아가기
 */

function mapReceiptStatus(status: string): ReceiptStatus {
  switch (status) {
    case 'completed': return 'paid';
    case 'cancelled': return 'cancelled';
    case 'refunded': return 'refunded';
    case 'pending': return 'pending';
    default: return 'paid';
  }
}

const STATUS_ICON_MAP: Record<string, { icon: string; bg: string; color: string; label: string }> = {
  completed: { icon: 'check_circle', bg: 'bg-it-blue-50 dark:bg-it-blue-500/15', color: 'text-it-blue-600 dark:text-it-blue-300', label: '결제 완료' },
  cancelled: { icon: 'cancel', bg: 'bg-it-red-50 dark:bg-it-red-500/15', color: 'text-it-red-600 dark:text-it-red-200', label: '결제 취소' },
  refunded:  { icon: 'replay', bg: 'bg-it-fill dark:bg-rink-700', color: 'text-it-ink-500 dark:text-rink-300', label: '환불 완료' },
  pending:   { icon: 'schedule', bg: 'bg-it-blue-50 dark:bg-it-blue-500/15', color: 'text-it-blue-500 dark:text-it-blue-300', label: '결제 대기중' },
};

function StatusHeader({ status }: { status: string }) {
  const meta = STATUS_ICON_MAP[status] ?? STATUS_ICON_MAP.completed;

  return (
    <div
      className="flex flex-col items-center pt-6 pb-4"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={`w-16 h-16 rounded-w-pill ${meta.bg} flex items-center justify-center mb-3`}
        aria-hidden="true"
      >
        <Icon name={meta.icon} className={`text-[32px] ${meta.color}`} weight={600} />
      </div>
      <h2 className={`text-xl font-bold tracking-tight ${meta.color}`}>
        {meta.label}
      </h2>
    </div>
  );
}

export default function ReceiptDetailPage() {
  const { back } = useNavigation();
  const params = useParams();
  const receiptId = (params?.id ?? '') as string;

  const [isLoading, setIsLoading] = useState(true);


  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF

  usePageReady(!isLoading);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '영수증 상세',
    showBottomNav: false,
    showBackButton: true,
    onBackPress: () => back(),
  });

  const fetchReceipt = async () => {
    if (!receiptId) {
      setError(MESSAGES.error.general);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const response = await getReceipt(receiptId);

    if (response.success && response.data) {
      setReceipt(response.data.receipt);
    } else {
      setError(response.error?.message || MESSAGES.error.general);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchReceipt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  const handleDownloadImage = async () => {
    if (!receiptId) return;

    setIsDownloading(true);
    const response = await getReceiptDownloadUrl(receiptId);

    if (response.success && response.data?.downloadUrl) {
      await navigation.openExternal(response.data.downloadUrl);
    }
    setIsDownloading(false);
  };

  return (
    <MobileContainer hasBottomNav={false} className="selectable-text">
      <BackHeader title="영수증 상세" onBack={() => back()} />

      <main className="flex-1 overflow-y-auto hide-scrollbar pb-30 bg-it-canvas dark:bg-puck">
        {isLoading ? null : error ? (
          /* 에러 상태 */
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-16 h-16 rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15 flex items-center justify-center mb-4">
              <Icon name="error" className="text-3xl text-it-red-500 dark:text-it-red-200" />
            </div>
            <h2 className="text-card-title font-bold text-it-ink-900 dark:text-white mb-2">
              {MESSAGES.error.title}
            </h2>
            <p className="text-card-body text-it-ink-500 dark:text-rink-300 text-center mb-6">{error}</p>
            <Button onClick={fetchReceipt} variant="outline">
              다시 시도
            </Button>
          </div>
        ) : receipt ? (
          <>
            {/* 상태 아이콘 — 흰 섹션 (full-bleed) */}
            <section className="bg-it-surface dark:bg-it-blue-950">
              <StatusHeader status={receipt.status} />
            </section>

            {/* 영수증 카드 - 공통 컴포넌트 (8px 회색 갭 위 흰 섹션) */}
            <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4">
              <ReceiptCard
                merchantName={receipt.storeName}
                orderNumber={receipt.orderNumber}
                paymentDate={receipt.paymentDate}
                method={`${receipt.paymentMethod}${receipt.cardLastFour ? ` (${receipt.cardLastFour})` : ''}`}
                productName={receipt.productName}
                totalAmount={receipt.totalAmount}
                status={mapReceiptStatus(receipt.status)}
                iceTheme
              />

              {/* 결제권 발급 정보 */}
              {receipt.creditsIssued > 0 && (
                <div className="mt-4 flex items-center gap-3 bg-it-blue-50 dark:bg-it-blue-500/15 rounded-w-md p-4">
                  <div className="w-10 h-10 rounded-w-pill bg-it-blue-500/10 flex items-center justify-center shrink-0">
                    <Icon name="toll" className="text-xl text-it-blue-500 dark:text-it-blue-300" />
                  </div>
                  <div>
                    <p className="text-card-body font-bold text-it-ink-900 dark:text-white">결제권 발급</p>
                    <p className="text-card-body text-it-blue-600 dark:text-it-blue-300 font-semibold">{receipt.creditsIssued}회</p>
                  </div>
                </div>
              )}
            </section>

            {/* 안내 텍스트 */}
            <div className="text-center mt-4 px-5">
              <p className="text-card-meta text-it-ink-400 dark:text-rink-300 leading-relaxed">
                전자영수증은 소득공제 및 증빙용으로 사용할 수 있습니다.
              </p>
            </div>
          </>
        ) : null}
      </main>

      {/* 하단 액션 고정 바 */}
      {!isLoading && !error && receipt && (
        <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-rink-800 px-5 pt-4 pb-8 z-20">
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleDownloadImage}
              disabled={isDownloading}
              fullWidth
              className="flex items-center justify-center gap-2"
            >
              {isDownloading ? (
                <div className="w-5 h-5 rounded-w-pill border-2 border-white/30 border-t-white animate-spin motion-reduce:animate-none" />
              ) : (
                <Icon name="download" className="text-xl" />
              )}
              이미지로 저장하기
            </Button>

            <Button
              variant="ghost"
              onClick={() => back()}
              fullWidth
            >
              목록으��� 돌아가기
            </Button>
          </div>
        </footer>
      )}
    </MobileContainer>
  );
}
