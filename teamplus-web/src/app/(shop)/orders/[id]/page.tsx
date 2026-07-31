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

/**
 * 주문 표시 상태 — 백엔드 `ShopOrder.orderStatus` 실제 값과 1:1 대응한다.
 *
 * [2026-07-30 수정] 기존 `confirmed`/`shipping`/`returned` 는 백엔드에 없는 죽은 값이었고
 * (`schema.prisma:1402` = pending|paid|preparing|shipped|delivered|cancelled|refunded),
 * 실제 값 `paid`/`preparing`/`shipped`/`refunded` 는 매핑 누락으로 '결제 대기' 로
 * 오표시됐다. `returned: '반품 완료'` 는 반품 기능 미구현 상태의 허위 표시였다.
 * 반품·교환 구현은 오픈 차단 조건 — docs/Planning/SHOP_LAUNCH_CHECKLIST.md (A-3).
 */
type OrderStatus =
  | 'pending'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'unknown';

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
  /** 백엔드 canonical 키 (`ShopOrder.orderStatus`). */
  orderStatus?: string;
  /** 구 프론트 계약 잔재 — 백엔드는 이 키를 emit 하지 않는다(하위호환 폴백만). */
  status?: string;
  totalAmount: number;
  createdAt: string;
  recipientName?: string;
  recipientPhone?: string;
  shippingAddress?: string;
  shippingMemo?: string;
  items: ApiOrderItem[];
}

// 라벨 문구는 teamplus-admin `getOrderStatusLabel()` 과 동일 어휘를 사용한다(운영자↔구매자 동일 표기).
const STATUS_CONFIG: Record<OrderStatus, { label: string; bg: string; text: string }> = {
  pending: {
    label: '결제 대기',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-600 dark:text-amber-400',
  },
  paid: {
    label: '결제 완료',
    bg: 'bg-it-blue-50 dark:bg-it-blue-900/30',
    text: 'text-it-blue-500',
  },
  preparing: {
    label: '상품 준비중',
    bg: 'bg-it-blue-50 dark:bg-it-blue-900/30',
    text: 'text-it-blue-500',
  },
  shipped: {
    label: '배송 중',
    bg: 'bg-it-blue-50 dark:bg-it-blue-900/30',
    text: 'text-it-blue-500',
  },
  delivered: {
    label: '배송 완료',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
  },
  cancelled: {
    label: '주문 취소',
    bg: 'bg-it-fill dark:bg-rink-800',
    text: 'text-it-ink-600 dark:text-rink-300',
  },
  refunded: {
    label: '환불 완료',
    bg: 'bg-it-fill dark:bg-rink-800',
    text: 'text-it-ink-600 dark:text-rink-300',
  },
  unknown: {
    label: '미정',
    bg: 'bg-it-fill dark:bg-rink-700',
    text: 'text-it-ink-600 dark:text-rink-100',
  },
};

function mapStatus(raw?: string): OrderStatus {
  const s = (raw ?? '').toLowerCase();
  if (s === 'pending') return 'pending';
  if (s === 'paid') return 'paid';
  if (s === 'preparing') return 'preparing';
  if (s === 'shipped') return 'shipped';
  if (s === 'delivered') return 'delivered';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'refunded') return 'refunded';
  // 미지의 값·누락은 '결제 대기' 로 위장하지 않고 '미정' 으로 표시한다.
  return 'unknown';
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
        <main className="flex min-h-[calc(100vh-60px)] flex-col items-center justify-center px-5 py-10 text-w-small text-it-ink-400 dark:text-rink-300 bg-it-canvas dark:bg-puck">
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
        <main className="flex min-h-[calc(100vh-60px)] flex-col items-center justify-center gap-3 px-5 py-10 text-center bg-it-canvas dark:bg-puck">
          <Icon name="error" className="text-4xl text-it-red-500 dark:text-rose-400" aria-hidden="true" />
          <p className="text-w-small text-it-ink-700 dark:text-rink-100">
            {error ?? '주문 정보를 찾을 수 없습니다.'}
          </p>
          <button
            type="button"
            onClick={fetchOrder}
            className="mt-2 rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface px-4 py-2 text-w-small font-semibold text-it-ink-700 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700"
          >
            {MESSAGES.common.retry}
          </button>
        </main>
        <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      </MobileContainer>
    );
  }

  const status = mapStatus(order.orderStatus ?? order.status);
  const statusConf = STATUS_CONFIG[status];

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="주문 상세" />
      <main className="flex flex-col bg-it-canvas dark:bg-puck pb-[72px]">
        {/* 주문 요약 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-w-caption text-it-ink-400 dark:text-rink-300">
                주문번호 {order.orderNumber}
              </p>
              <p className="mt-1 text-w-small font-medium text-it-ink-800 dark:text-white">
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

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 상품 목록 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 py-5">
          <h2 className="mb-3 text-w-small font-bold text-it-ink-800 dark:text-white">주문 상품</h2>
          <ul className="flex flex-col">
            {order.items.map((item, idx) => {
              const mainImage =
                item.product.images.find((img) => img.isMain)?.imageUrl ??
                item.product.images[0]?.imageUrl;
              const isLast = idx === order.items.length - 1;
              return (
                <li key={item.id} className={`flex items-center gap-3 py-3 first:pt-0 ${!isLast ? 'border-b border-it-line dark:border-rink-700' : 'last:pb-0'}`}>
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-w-md bg-it-fill dark:bg-rink-700">
                    {resolveImageSrc(mainImage) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveImageSrc(mainImage)}
                        alt={item.product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-it-ink-400">
                        <Icon name="image" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-w-small font-semibold text-it-ink-800 dark:text-white">
                      {item.product.name}
                    </p>
                    {item.productOption && (
                      <p className="truncate text-w-caption text-it-ink-400 dark:text-rink-300">
                        {item.productOption}
                      </p>
                    )}
                    <p className="mt-1 text-w-small text-it-ink-600 dark:text-rink-100">
                      {formatPrice(item.unitPrice)} · {item.quantity}개
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 배송지 — flat 흰 섹션 */}
        {(order.recipientName || order.shippingAddress) && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 py-5">
              <h2 className="mb-3 text-w-small font-bold text-it-ink-800 dark:text-white">배송지</h2>
              <dl className="flex flex-col gap-2 text-w-small">
                {order.recipientName && (
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-it-ink-400 dark:text-rink-300">받는 분</dt>
                    <dd className="text-it-ink-800 dark:text-white">{order.recipientName}</dd>
                  </div>
                )}
                {order.recipientPhone && (
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-it-ink-400 dark:text-rink-300">연락처</dt>
                    <dd className="text-it-ink-800 dark:text-white">{order.recipientPhone}</dd>
                  </div>
                )}
                {order.shippingAddress && (
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-it-ink-400 dark:text-rink-300">주소</dt>
                    <dd className="text-it-ink-800 dark:text-white">{order.shippingAddress}</dd>
                  </div>
                )}
                {order.shippingMemo && (
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-it-ink-400 dark:text-rink-300">메모</dt>
                    <dd className="text-it-ink-800 dark:text-white">{order.shippingMemo}</dd>
                  </div>
                )}
              </dl>
            </section>
          </>
        )}

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 결제 금액 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 py-5">
          <h2 className="mb-3 text-w-small font-bold text-it-ink-800 dark:text-white">결제 금액</h2>
          <div className="flex items-center justify-between text-w-body-lg font-bold text-it-ink-800 dark:text-white">
            <span>총 결제금액</span>
            <span className="text-it-blue-500 tabular-nums">{formatPrice(order.totalAmount)}</span>
          </div>
        </section>
      </main>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
