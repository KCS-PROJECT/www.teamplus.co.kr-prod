'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { resolveImageSrc } from '@/lib/image-url';

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

type OrderStatus = 'all' | 'shipping' | 'delivered' | 'cancelled';

/**
 * 주문 표시 상태 — 백엔드 `ShopOrder.orderStatus` 실제 값과 1:1 대응한다.
 *
 * [2026-07-30 수정] 기존 `confirmed`/`shipping`/`returned` 는 백엔드에 존재하지 않는
 * 죽은 값이었고(`schema.prisma:1402` = pending|paid|preparing|shipped|delivered|cancelled|refunded),
 * 반대로 실제 값인 `paid`/`preparing`/`shipped`/`refunded` 는 매핑이 없어 모두
 * '결제대기' 로 오표시됐다. 특히 `returned: '반품완료'` 는 반품 기능 자체가
 * 미구현(모델·엔드포인트 0건)인데 완료 라벨을 노출하는 허위 표시였다.
 * 반품·교환 구현은 오픈 차단 조건 — docs/Planning/SHOP_LAUNCH_CHECKLIST.md (A-3).
 */
type OrderDisplayStatus =
  | 'pending'
  | 'paid'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'unknown';

interface DisplayOrder {
  id: string;
  orderDate: string;
  orderNumber: string;
  productName: string;
  imageUrl?: string;
  option: string;
  price: number;
  quantity: number;
  status: OrderDisplayStatus;
}

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
  items: ApiOrderItem[];
}

interface ApiOrdersResponse {
  data: ApiOrder[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

// 라벨 문구는 teamplus-admin `getOrderStatusLabel()` 과 동일 어휘를 사용한다(운영자↔구매자 동일 표기).
const statusConfig: Record<OrderDisplayStatus, { label: string; bgColor: string; textColor: string }> = {
  pending:   { label: '결제대기',   bgColor: 'bg-amber-100 dark:bg-amber-900/30',    textColor: 'text-amber-600 dark:text-amber-400' },
  paid:      { label: '결제완료',   bgColor: 'bg-it-blue-50 dark:bg-it-blue-900/30', textColor: 'text-it-blue-500' },
  preparing: { label: '상품준비중', bgColor: 'bg-it-blue-50 dark:bg-it-blue-900/30', textColor: 'text-it-blue-500' },
  shipped:   { label: '배송중',     bgColor: 'bg-it-blue-50 dark:bg-it-blue-900/30', textColor: 'text-it-blue-500' },
  delivered: { label: '배송완료',   bgColor: 'bg-blue-100 dark:bg-blue-900/30',      textColor: 'text-blue-600 dark:text-blue-400' },
  cancelled: { label: '주문취소',   bgColor: 'bg-it-fill dark:bg-rink-800',          textColor: 'text-it-ink-600 dark:text-rink-300' },
  refunded:  { label: '환불완료',   bgColor: 'bg-it-fill dark:bg-rink-800',          textColor: 'text-it-ink-600 dark:text-rink-300' },
  unknown:   { label: '미정',       bgColor: 'bg-it-fill dark:bg-rink-700',          textColor: 'text-it-ink-600 dark:text-rink-100' },
};

const filterTabs: { id: OrderStatus; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'shipping', label: '배송중' },
  { id: 'delivered', label: '배송완료' },
  // 반품 기능 미구현 — '취소/반품' → '취소·환불' (RULE-D04 가운뎃점)
  { id: 'cancelled', label: '취소·환불' },
];

function mapStatus(raw?: string): OrderDisplayStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'pending':   return 'pending';
    case 'paid':      return 'paid';
    case 'preparing': return 'preparing';
    case 'shipped':   return 'shipped';
    case 'delivered': return 'delivered';
    case 'cancelled':
    case 'canceled':  return 'cancelled';
    case 'refunded':  return 'refunded';
    // 미지의 값·누락은 '결제대기' 로 위장하지 않고 '미정' 으로 표시한다.
    default:          return 'unknown';
  }
}

function mapApiOrder(o: ApiOrder): DisplayOrder {
  const firstItem = o.items[0];
  const extraCount = o.items.length - 1;
  const baseName = firstItem?.product.name ?? '상품 없음';
  const mainImage = firstItem?.product.images.find((img) => img.isMain)?.imageUrl
    ?? firstItem?.product.images[0]?.imageUrl;

  return {
    id: o.id,
    orderDate: new Date(o.createdAt).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }),
    orderNumber: o.orderNumber,
    productName: extraCount > 0 ? `${baseName} 외 ${extraCount}건` : baseName,
    imageUrl: mainImage,
    option: firstItem?.productOption ?? '-',
    price: firstItem ? firstItem.unitPrice * firstItem.quantity : o.totalAmount,
    quantity: firstItem?.quantity ?? 1,
    status: mapStatus(o.orderStatus ?? o.status),
  };
}

const STATUS_FALLBACK = statusConfig.unknown;

function StatusBadge({ status }: { status: OrderDisplayStatus }) {
  const config = statusConfig[status] ?? STATUS_FALLBACK;
  return (
    <span className={`px-2.5 py-1 rounded-w-pill text-card-meta font-bold ${config.bgColor} ${config.textColor}`}>
      {config.label}
    </span>
  );
}

function OrderCard({ order }: { order: DisplayOrder }) {
  const { navigate } = useNavigation();

  // [2026-07-30] 배송조회·리뷰쓰기·재구매 3개 버튼은 onClick 핸들러가 없는 상태다.
  //   쇼핑몰 미오픈 중이라 도달 불가하지만, 동작하지 않는 버튼을 활성 상태로
  //   노출하는 것은 표시 리스크이므로 disabled 로 고정한다.
  //   실제 배선은 오픈 작업 항목 — docs/Planning/SHOP_LAUNCH_CHECKLIST.md (C-2).
  const OUTLINE_CLASS =
    'flex-1 py-2.5 text-card-body font-medium text-it-ink-700 dark:text-rink-100 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md disabled:opacity-50 disabled:cursor-not-allowed';
  const PRIMARY_CLASS =
    'flex-1 py-2.5 text-card-body font-medium text-white bg-it-blue-500 rounded-w-md disabled:opacity-50 disabled:cursor-not-allowed';

  const getActionButtons = () => {
    switch (order.status) {
      case 'shipped':
        return (
          <button type="button" disabled aria-disabled="true" className="flex-1 py-2.5 text-card-body font-medium text-it-blue-500 border-[1.5px] border-it-blue-500 rounded-w-md disabled:opacity-50 disabled:cursor-not-allowed">
            배송조회
          </button>
        );
      case 'delivered':
        return (
          <>
            <button type="button" disabled aria-disabled="true" className={OUTLINE_CLASS}>
              리뷰쓰기
            </button>
            <button type="button" disabled aria-disabled="true" className={PRIMARY_CLASS}>
              재구매
            </button>
          </>
        );
      case 'cancelled':
      case 'refunded':
        return (
          <button type="button" disabled aria-disabled="true" className={OUTLINE_CLASS}>
            재구매
          </button>
        );
      default:
        return null;
    }
  };

  const actionButtons = getActionButtons();

  return (
    <div className="bg-it-surface dark:bg-rink-800 p-4 border-b border-it-line dark:border-rink-700 last:border-b-0">
      {/* Order Header — 파이프 제거 (RULE-D04) → 날짜·주문번호 위계 분리 */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-it-line dark:border-white/10">
        <div className="flex items-baseline gap-2">
          <span className="text-card-body font-bold text-it-ink-800 dark:text-white">{order.orderDate}</span>
          <span className="text-card-meta text-it-ink-400 dark:text-rink-300">{order.orderNumber}</span>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/orders/${order.id}`)}
          className="flex items-center text-card-meta text-it-ink-500 dark:text-rink-300 hover:text-it-blue-500 transition-colors motion-reduce:transition-none"
        >
          주문상세
          <Icon name="chevron_right" className="text-card-emphasis" />
        </button>
      </div>

      {/* Product Info */}
      <div className="flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-w-md bg-it-fill dark:bg-rink-700 border border-it-line dark:border-white/5 flex items-center justify-center">
          {resolveImageSrc(order.imageUrl) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img loading="lazy" decoding="async" src={resolveImageSrc(order.imageUrl)} alt={order.productName} className="w-full h-full object-cover" />
          ) : (
            <Icon name="checkroom" className="text-3xl text-it-ink-400 dark:text-rink-300" />
          )}
        </div>
        <div className="flex flex-1 flex-col">
          <div className="mb-2">
            <StatusBadge status={order.status} />
          </div>
          <h3 className="text-it-ink-800 dark:text-white text-card-body font-medium line-clamp-2 mb-1">{order.productName}</h3>
          <p className="text-it-ink-500 dark:text-rink-300 text-card-meta">옵션: {order.option}</p>
          <div className="flex items-center gap-2 mt-auto pt-2">
            <span className="text-it-ink-800 dark:text-white font-bold tabular-nums">{order.price.toLocaleString()}원</span>
            <span className="text-it-ink-400 text-card-body">/ {order.quantity}개</span>
          </div>
        </div>
      </div>

      {/* Action Buttons — 표시할 액션이 없으면 빈 구분선 행을 만들지 않는다 */}
      {actionButtons ? (
        <div className="flex gap-2 mt-4 pt-4 border-t border-it-line dark:border-white/10">
          {actionButtons}
        </div>
      ) : null}
    </div>
  );
}

export default function OrdersPage() {
  const { navigate } = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<OrderStatus>('all');
  const [orders, setOrders] = useState<DisplayOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const res = await api.get<ApiOrdersResponse>('/shop/orders/my');
      if (res.success && res.data) {
        setOrders(res.data.data.map(mapApiOrder));
      }
      setIsLoading(false);
    };
    void load();
  }, []);

  const filteredOrders = orders.filter((order) => {
    if (activeFilter === 'all') return true;
    // 배송중 탭 = 결제 후 배송 진행 구간 (paid → preparing → shipped)
    if (activeFilter === 'shipping')
      return order.status === 'paid' || order.status === 'preparing' || order.status === 'shipped';
    if (activeFilter === 'delivered') return order.status === 'delivered';
    if (activeFilter === 'cancelled') return order.status === 'cancelled' || order.status === 'refunded';
    return true;
  });

  return (
    <MobileContainer hasBottomNav={true}>
      <PageAppBar
        title="주문 내역"
        // [appbar-harness-v4 분류 C→A] rightAction(JSX) 사용 시 우측 3 액션이 모두 사라짐.
        //   icon-based 액션은 extraActions 로 변환하여 ☰ 메뉴는 항상 노출 (PageAppBar v2.3 SoT 정책).
        extraActions={[
          { icon: "shopping_bag", label: "장바구니", onClick: () => navigate("/cart") },
        ]}
      />

      {/* Filter Tabs — flat 흰 섹션 (hairline 하단) */}
      <div className="sticky top-14 z-49 bg-it-surface dark:bg-rink-900 border-b border-it-line dark:border-white/5 flex px-4 py-2 gap-2">
        {filterTabs.map((tab) => (
          <button type="button"               key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={`h-9 px-4 rounded-w-pill border-[1.5px] text-card-body font-bold transition-all motion-reduce:transition-none ${
              activeFilter === tab.id
                ? 'bg-it-blue-500 border-it-blue-500 text-white'
                : 'bg-it-surface dark:bg-rink-800 border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-rink-100 active:brightness-95'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="flex-1 bg-it-canvas dark:bg-puck pb-30">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-it-blue-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
          </div>
        ) : filteredOrders.length > 0 ? (
          <section className="flex flex-col bg-it-surface dark:bg-rink-800 mt-2 px-4">
            {filteredOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </section>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Icon name="receipt_long" className="text-6xl text-it-ink-400 dark:text-rink-500 mb-4" />
            <p className="text-it-ink-500 dark:text-rink-300 text-card-title font-medium">
              주문 내역이 없습니다
            </p>
            <NavLink
              href="/products"
              className="mt-4 px-6 py-3 bg-it-blue-500 text-white rounded-w-md font-bold hover:bg-it-blue-600 transition-colors motion-reduce:transition-none"
            >
              쇼핑하러 가기
            </NavLink>
          </div>
        )}
      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
