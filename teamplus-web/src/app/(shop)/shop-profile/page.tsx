'use client';

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api-client';
import { usePageReady } from '@/hooks/usePageReady';

import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { ShopBusinessFooter } from '@/components/shop/ShopBusinessFooter';

interface WishlistItem {
  id: string;
  name: string;
  price: number;
  inStock: boolean;
  iconName: string;
}

interface DeliveryStatus {
  id: string;
  label: string;
  icon: string;
  count?: number;
}

interface UserProfile {
  name: string;
  grade: string;
  puckPoints: number;
  coupons: number;
  wishlistCount: number;
}

const deliveryStatuses: DeliveryStatus[] = [
  { id: 'paid', label: '결제완료', icon: 'shopping_bag' },
  { id: 'preparing', label: '장비준비', icon: 'ice_skating', count: 1 },
  { id: 'shipping', label: '배송중', icon: 'local_shipping' },
  { id: 'delivered', label: '배송완료', icon: 'sports_score' },
];

interface ShopMenuItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  disabled?: boolean;
}

const shoppingMenus: ShopMenuItem[] = [
  { id: 'orders', label: '주문 내역', icon: 'receipt_long', href: '/orders' },
  { id: 'reviews', label: '나의 리뷰', icon: 'rate_review', href: '/reviews', disabled: true },
  { id: 'recent', label: '최근 본 상품', icon: 'history', href: '/recent-products', disabled: true },
];

const accountMenus: ShopMenuItem[] = [
  { id: 'address', label: '배송지 관리', icon: 'home_pin', href: '/settings/address', disabled: true },
  { id: 'payment', label: '결제 수단', icon: 'credit_card', href: '/settings/payment', disabled: true },
];

const supportMenus: ShopMenuItem[] = [
  { id: 'notice', label: '공지사항', icon: 'campaign', href: '/notices' },
  { id: 'faq', label: '자주 묻는 질문', icon: 'help_center', href: '/faq' },
];

function StatCard({ icon, value, label, isHighlighted = false }: {
  icon: string;
  value: string | number;
  label: string;
  isHighlighted?: boolean;
}) {
  return (
    <div className={`flex-1 flex flex-col items-center gap-1 rounded-w-md p-4 border-[1.5px] ${isHighlighted ? 'bg-it-blue-50 border-it-blue-500/30 dark:bg-it-blue-900/30 dark:border-it-blue-500/30' : 'bg-it-fill border-it-line dark:bg-rink-700/40 dark:border-rink-700/50'}`}>
      <div className={`flex items-center gap-1 ${isHighlighted ? 'text-it-blue-500' : 'text-it-ink-800 dark:text-white'}`}>
        <Icon name={icon} className="text-card-title" />
        <p className="tracking-tight text-xl font-extrabold tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      </div>
      <p className="text-it-ink-500 dark:text-rink-300 text-card-meta font-medium">{label}</p>
    </div>
  );
}

function DeliveryStatusItem({ status }: { status: DeliveryStatus }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center group cursor-pointer">
      <div className="relative rounded-w-pill bg-it-blue-50 dark:bg-white/5 p-3 group-hover:bg-it-blue-100 transition-colors motion-reduce:transition-none">
        <Icon name={status.icon} className="text-it-ink-500 group-hover:text-it-blue-500 transition-colors motion-reduce:transition-none" />
        {status.count && status.count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-w-pill bg-it-blue-500 text-card-meta font-bold text-white ring-2 ring-it-surface dark:ring-rink-800">
            {status.count}
          </span>
        )}
      </div>
      <p className="text-card-meta font-medium text-it-ink-500 dark:text-rink-300 group-hover:text-it-blue-500 transition-colors motion-reduce:transition-none">
        {status.label}
      </p>
    </div>
  );
}

function WishlistCard({ item, onRemove }: { item: WishlistItem; onRemove: (id: string) => void }) {
  return (
    <div className="min-w-[150px] w-[150px] flex-shrink-0 snap-start bg-it-surface dark:bg-rink-800 rounded-w-md border border-it-line dark:border-white/5 overflow-hidden relative group">
      <button type="button"         onClick={() => onRemove(item.id)}
        className="absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center bg-it-surface dark:bg-rink-800 border border-it-line rounded-w-pill text-it-ink-400 hover:text-it-red-500 transition-colors motion-reduce:transition-none"
      >
        <Icon name="close" className="text-card-body" />
      </button>
      <div className="aspect-square bg-it-fill dark:bg-white/5 flex items-center justify-center relative">
        <Icon name={item.iconName} className={`text-5xl ${item.inStock ? 'text-it-blue-200 dark:text-blue-900/50' : 'text-it-ink-400 dark:text-wtext-2'}`} />
        <div className={`absolute bottom-2 left-2 text-white text-card-meta font-bold px-1.5 py-0.5 rounded-w-md ${
          item.inStock ? 'bg-mint-500' : 'bg-it-red-500'
        }`}>
          {item.inStock ? '재고 있음' : '품절'}
        </div>
      </div>
      <div className="p-3">
        <h4 className={`text-card-meta font-medium line-clamp-1 mb-1 ${item.inStock ? 'text-it-ink-800 dark:text-white' : 'text-it-ink-400 dark:text-rink-300'}`}>
          {item.name}
        </h4>
        <p className={`text-card-body font-bold mb-3 tabular-nums ${item.inStock ? 'text-it-ink-800 dark:text-white' : 'text-it-ink-400 dark:text-rink-300'}`}>
          {item.price.toLocaleString()}원
        </p>
        <button type="button"           disabled={!item.inStock}
          className={`w-full flex items-center justify-center gap-1 py-2 rounded-w-md transition-all motion-reduce:transition-none text-card-meta font-bold ${
            item.inStock
              ? 'bg-it-blue-50 hover:bg-it-blue-500 text-it-blue-500 hover:text-white'
              : 'bg-it-fill dark:bg-white/5 text-it-ink-400 cursor-not-allowed'
          }`}
        >
          <Icon name={item.inStock ? 'shopping_cart' : 'notifications_active'} className="text-card-body" />
          {item.inStock ? '담기' : '입고알림'}
        </button>
      </div>
    </div>
  );
}

function MenuSection({ title, menus }: {
  title: string;
  menus: ShopMenuItem[];
}) {
  const { toast } = useToast();
  const handleDisabledClick = useCallback(
    (label: string) => {
      toast.info(`${label} 기능은 준비 중입니다.`);
    },
    [toast],
  );

  return (
    <section className="mb-2">
      <h4 className="text-card-body font-semibold text-it-ink-500 dark:text-rink-300 mb-2 px-5">{title}</h4>
      <div className="flex flex-col bg-it-surface dark:bg-rink-800">
        {menus.map((menu, index) => {
          const rowClass = `flex items-center justify-between p-4 px-5 w-full hover:bg-it-fill dark:hover:bg-white/5 transition-colors motion-reduce:transition-none group text-left ${
            index < menus.length - 1 ? 'border-b border-it-line dark:border-white/5' : ''
          }`;
          const iconClass = menu.disabled
            ? 'text-it-ink-400 dark:text-rink-500'
            : 'text-it-blue-500 group-hover:text-it-blue-600 dark:text-blue-400 dark:group-hover:text-blue-300 transition-colors motion-reduce:transition-none';
          const labelClass = menu.disabled
            ? 'text-card-body font-medium text-it-ink-400 dark:text-rink-300'
            : 'text-card-body font-medium text-it-ink-800 dark:text-rink-100';

          if (menu.disabled) {
            return (
              <button
                key={menu.id}
                type="button"
                onClick={() => handleDisabledClick(menu.label)}
                aria-label={`${menu.label} (준비 중)`}
                className={rowClass}
              >
                <div className="flex items-center gap-3">
                  <Icon name={menu.icon} className={iconClass} aria-hidden="true" />
                  <span className={labelClass}>{menu.label}</span>
                  <span className="inline-flex items-center rounded-w-pill bg-it-fill dark:bg-rink-700 px-2 py-0.5 text-card-meta font-semibold text-it-ink-500 dark:text-rink-300">
                    준비 중
                  </span>
                </div>
                <Icon name="schedule" className="text-it-ink-400 dark:text-rink-500 text-xl" aria-hidden="true" />
              </button>
            );
          }

          return (
            <NavLink
              key={menu.id}
              href={menu.href}
              className={rowClass}
            >
              <div className="flex items-center gap-3">
                <Icon name={menu.icon} className={iconClass} aria-hidden="true" />
                <span className={labelClass}>{menu.label}</span>
              </div>
              <Icon name="chevron_right" className="text-it-ink-400 text-xl group-hover:text-it-blue-500 dark:group-hover:text-blue-300 transition-colors motion-reduce:transition-none" aria-hidden="true" />
            </NavLink>
          );
        })}
      </div>
    </section>
  );
}

export default function ShopProfilePage() {
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [profile, setProfile] = useState<UserProfile>({
    name: '',
    grade: '',
    puckPoints: 0,
    coupons: 0,
    wishlistCount: 0,
  });
  const [isReady, setIsReady] = useState(false);
  usePageReady(isReady);

  useEffect(() => {
    const loadProfile = async () => {
      const res = await api.get<{
        name?: string; firstName?: string; lastName?: string;
        memberLevel?: string; level?: string;
        points?: number; puckPoints?: number;
        couponCount?: number; coupons?: number;
        wishlistCount?: number;
      }>('/auth/profile');
      if (res.success && res.data) {
        const d = res.data;
        setProfile({
          name: d.name ?? `${d.lastName ?? ''}${d.firstName ?? ''}`,
          grade: d.memberLevel ?? d.level ?? '일반 회원',
          puckPoints: d.puckPoints ?? d.points ?? 0,
          coupons: d.couponCount ?? d.coupons ?? 0,
          wishlistCount: d.wishlistCount ?? 0,
        });
      }
    };
    const loadWishlist = async () => {
      const res = await api.get<{
        items?: { id: string; product?: { id: string; name: string; price: number; stock?: number; category?: string } }[];
        data?: { id: string; product?: { id: string; name: string; price: number; stock?: number; category?: string } }[];
      }>('/shop/wishlist');
      if (res.success && res.data) {
        const raw = res.data.items ?? res.data.data ?? [];
        const mapped: WishlistItem[] = raw.map((item) => ({
          id: item.id,
          name: item.product?.name ?? '',
          price: item.product?.price ?? 0,
          inStock: (item.product?.stock ?? 0) > 0,
          iconName: 'sports_hockey',
        }));
        setWishlist(mapped);
      }
    };
    void Promise.all([loadProfile(), loadWishlist()]).finally(() => setIsReady(true));
  }, []);

  // 네이티브 앱에서 UI 설정 (Flutter BottomNav 숨김 → 웹 BottomNav만 사용)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const handleRemoveWishlistItem = (id: string) => {
    setWishlist(prev => prev.filter(item => item.id !== id));
  };

  return (
    <MobileContainer hasBottomNav={true}>
      <SubmainAppBar title="마이 페이지" />

      {/* Main Content */}
      <main className="flex flex-col w-full max-w-md mx-auto bg-it-canvas dark:bg-puck pb-30">
        {/* Profile Section — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-4 pt-2 pb-4">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-w-pill bg-it-fill dark:bg-rink-700 border-2 border-it-blue-500 p-0.5 flex items-center justify-center">
                <Icon name="person" className="text-4xl text-it-ink-400 dark:text-rink-300" />
              </div>
              <div className="absolute bottom-0 right-0 bg-it-blue-500 rounded-w-pill p-1 border-2 border-it-surface dark:border-background-dark flex items-center justify-center">
                <Icon name="edit_square" className="text-white text-[16px]" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold mb-1 text-it-ink-800 dark:text-white">{profile.name}</h3>
              <div className="inline-flex items-center gap-1 bg-it-blue-50 px-3 py-1 rounded-w-pill border border-it-blue-500/20">
                <Icon name="emoji_events" filled className="text-it-blue-500 text-card-body" />
                <span className="text-it-blue-500 text-card-body font-semibold">{profile.grade}</span>
              </div>
            </div>
            <button type="button" className="w-full mt-2 bg-it-blue-500 hover:bg-it-blue-600 text-white font-bold py-3 px-4 rounded-w-md transition-all motion-reduce:transition-none flex items-center justify-center gap-2 active:brightness-95">
              <span>프로필 수정</span>
            </button>
          </div>
        </section>

        {/* Stats Section — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 py-4">
          <div className="flex gap-3">
            <StatCard icon="toll" value={profile.puckPoints} label="퍽 포인트" isHighlighted />
            <StatCard icon="confirmation_number" value={profile.coupons} label="티켓 쿠폰" />
            <StatCard icon="favorite" value={profile.wishlistCount} label="관심 장비" />
          </div>
        </section>

        {/* Delivery Status Section — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 py-5">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-card-emphasis font-bold text-it-ink-800 dark:text-white">장비 배송 현황</h3>
            <NavLink href="/orders" className="text-card-meta text-it-ink-500 flex items-center gap-0.5 hover:text-it-blue-500 transition-colors motion-reduce:transition-none">
              전체보기 <Icon name="chevron_right" className="text-card-body" />
            </NavLink>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {deliveryStatuses.map(status => (
              <DeliveryStatusItem key={status.id} status={status} />
            ))}
          </div>
        </section>

        {/* Wishlist Section — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 py-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-card-emphasis font-bold text-it-ink-800 dark:text-white flex items-center gap-2">
              <Icon name="favorite" className="text-it-blue-500" />
              나의 위시리스트
            </h3>
          <NavLink href="/mypage" className="text-card-meta text-it-ink-500 flex items-center gap-0.5 hover:text-it-blue-500 transition-colors motion-reduce:transition-none">
            더보기 <Icon name="chevron_right" className="text-card-body" />
          </NavLink>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 snap-x">
            {wishlist.map(item => (
              <WishlistCard key={item.id} item={item} onRemove={handleRemoveWishlistItem} />
            ))}
          </div>
        </section>

        {/* Menu Sections */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        {/* [2026-06-09 심사 2.1] '준비 중'(disabled) 메뉴는 미완성 노출 회피 위해 렌더에서 제외.
            기능 완성 시 위 배열에서 해당 항목 disabled 제거하면 자동 노출됨. */}
        {shoppingMenus.some((m) => !m.disabled) && (
          <MenuSection
            title="쇼핑 정보"
            menus={shoppingMenus.filter((m) => !m.disabled)}
          />
        )}
        {accountMenus.some((m) => !m.disabled) && (
          <MenuSection
            title="계정 설정"
            menus={accountMenus.filter((m) => !m.disabled)}
          />
        )}
        <MenuSection title="고객 지원" menus={supportMenus} />

        {/* Footer — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 pt-5 pb-8">
          <div className="flex justify-center gap-4 text-card-body text-it-ink-500">
            <NavLink href="/terms" className="underline hover:text-it-ink-800 dark:hover:text-rink-100 transition-colors motion-reduce:transition-none">
              이용약관
            </NavLink>
            <NavLink href="/terms" className="underline hover:text-it-ink-800 dark:hover:text-rink-100 transition-colors motion-reduce:transition-none">
              개인정보처리방침
            </NavLink>
          </div>
          {/* 전자상거래법 §10 사업자정보 — 통신판매업 신고번호 포함 (쇼핑몰 전용) */}
          <div className="mt-4 border-t border-it-line dark:border-rink-700/60 pt-3.5">
            <ShopBusinessFooter iceTheme />
          </div>
          <p className="mt-2 text-center text-card-meta text-it-ink-400 dark:text-rink-300 pb-4">앱 버전 1.0.5</p>
        </section>
      </main>
    </MobileContainer>
  );
}
