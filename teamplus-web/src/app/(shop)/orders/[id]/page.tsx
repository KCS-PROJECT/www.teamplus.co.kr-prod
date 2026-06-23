'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';

const GlobalMenu = dynamic(
  () => import('@/components/layout/GlobalMenu').then((mod) => ({ default: mod.GlobalMenu })),
  { ssr: false },
);

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipping'
  | 'delivered'
  | 'cancelled'
  | 'returned';

interface ApiOrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  productOption?: string;
  product: {
    id: string;
    name: string;
    images: { imageUrl: string; isMain: boolean }[];
  };
}

interface ApiOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  recipientName?: string;
  recipientPhone?: string;
  shippingAddress?: string;
  shippingMemo?: string;
  items: ApiOrderItem[];
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; bg: string; text: string }> = {
  pending: {
    label: '결제 대기',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-600 dark:text-amber-400',
  },
  confirmed: {
    label: '주문 확인',
    bg: 'bg-ice-500/10',
    text: 'text-ice-500',
  },
  shipping: {
    label: '배송 중',
    bg: 'bg-ice-500/10',
    text: 'text-ice-500',
  },
  delivered: {
    label: '배송 완료',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
  },
  cancelled: {
    label: '취소 완료',
    bg: 'bg-wline-2 dark:bg-rink-800',
    text: 'text-wtext-2 dark:text-rink-300',
  },
  returned: {
    label: '반품 완료',
    bg: 'bg-rose-100 dark:bg-rose-900/30',
    text: 'text-rose-600 dark:text-rose-400',
  },
};

function mapStatus(raw: string): OrderStatus {
  const s = raw.toLowerCase();
  if (s === 'pending') return 'pending';
  if (s === 'confirmed') return 'confirmed';
  if (s === 'shipping') return 'shipping';
  if (s === 'delivered') return 'delivered';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'returned') return 'returned';
  return 'pending';
}

function formatPrice(value: number): string {
  return `${value.toLocaleString()}원`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '-';
  }
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';

  // 공통 PageAppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    appBarTitle: '주문 상세',
    showBackButton: true,
  });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiOrder>(`/shop/orders/${orderId}`);
      if (res.success && res.data) {
        setOrder(res.data);
      } else {
        setError(res.error?.message ?? MESSAGES.error.network);
      }
    } catch {
      setError(MESSAGES.error.network);
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  if (isLoading) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="주문 상세" />
        <main className="flex min-h-[calc(100vh-60px)] flex-col items-center justify-center px-5 py-10 text-w-small text-wtext-3 dark:text-rink-300">
          {MESSAGES.common.loading}
        </main>
        <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      </MobileContainer>
    );
  }

  if (error || !order) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="주문 상세" />
        <main className="flex min-h-[calc(100vh-60px)] flex-col items-center justify-center gap-3 px-5 py-10 text-center">
          <Icon name="error" className="text-4xl text-rose-500 dark:text-rose-400" aria-hidden="true" />
          <p className="text-w-small text-wtext-2 dark:text-rink-100">
            {error ?? '주문 정보를 찾을 수 없습니다.'}
          </p>
          <button
            type="button"
            onClick={fetchOrder}
            className="mt-2 rounded-lg border border-wline bg-white px-4 py-2 text-w-small font-semibold text-wtext-2 transition-colors motion-reduce:transition-none hover:bg-wbg dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700"
          >
            {MESSAGES.common.retry}
          </button>
        </main>
        <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      </MobileContainer>
    );
  }

  const status = mapStatus(order.status);
  const statusConf = STATUS_CONFIG[status];

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="주문 상세" />
      <main className="flex flex-col gap-4 px-5 py-5 pb-[72px]">
        {/* 주문 요약 */}
        <section className="rounded-2xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-w-caption text-wtext-3 dark:text-rink-300">
                주문번호 · {order.orderNumber}
              </p>
              <p className="mt-1 text-w-small font-medium text-wtext-1 dark:text-white">
                {formatDate(order.createdAt)}
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-w-pill px-3 py-1 text-w-caption font-semibold ${statusConf.bg} ${statusConf.text}`}
            >
              {statusConf.label}
            </span>
          </div>
        </section>

        {/* 상품 목록 */}
        <section className="rounded-2xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
          <h2 className="mb-3 text-w-small font-bold text-wtext-1 dark:text-white">주문 상품</h2>
          <ul className="flex flex-col gap-3">
            {order.items.map((item) => {
              const mainImage =
                item.product.images.find((img) => img.isMain)?.imageUrl ??
                item.product.images[0]?.imageUrl;
              return (
                <li key={item.id} className="flex items-center gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-wline-2 dark:bg-rink-700">
                    {resolveImageSrc(mainImage) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveImageSrc(mainImage)}
                        alt={item.product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-wtext-3">
                        <Icon name="image" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-w-small font-semibold text-wtext-1 dark:text-white">
                      {item.product.name}
                    </p>
                    {item.productOption && (
                      <p className="truncate text-w-caption text-wtext-3 dark:text-rink-300">
                        {item.productOption}
                      </p>
                    )}
                    <p className="mt-1 text-w-small text-wtext-2 dark:text-rink-100">
                      {formatPrice(item.unitPrice)} · {item.quantity}개
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 배송지 */}
        {(order.recipientName || order.shippingAddress) && (
          <section className="rounded-2xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
            <h2 className="mb-3 text-w-small font-bold text-wtext-1 dark:text-white">배송지</h2>
            <dl className="flex flex-col gap-2 text-w-small">
              {order.recipientName && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-wtext-3 dark:text-rink-300">받는 분</dt>
                  <dd className="text-wtext-1 dark:text-white">{order.recipientName}</dd>
                </div>
              )}
              {order.recipientPhone && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-wtext-3 dark:text-rink-300">연락처</dt>
                  <dd className="text-wtext-1 dark:text-white">{order.recipientPhone}</dd>
                </div>
              )}
              {order.shippingAddress && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-wtext-3 dark:text-rink-300">주소</dt>
                  <dd className="text-wtext-1 dark:text-white">{order.shippingAddress}</dd>
                </div>
              )}
              {order.shippingMemo && (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-wtext-3 dark:text-rink-300">메모</dt>
                  <dd className="text-wtext-1 dark:text-white">{order.shippingMemo}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* 결제 금액 */}
        <section className="rounded-2xl border border-wline-2 bg-white p-5 shadow-sm dark:border-rink-700 dark:bg-rink-800">
          <h2 className="mb-3 text-w-small font-bold text-wtext-1 dark:text-white">결제 금액</h2>
          <div className="flex items-center justify-between text-w-body-lg font-bold text-wtext-1 dark:text-white">
            <span>총 결제금액</span>
            <span className="text-ice-500">{formatPrice(order.totalAmount)}</span>
          </div>
        </section>
      </main>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
