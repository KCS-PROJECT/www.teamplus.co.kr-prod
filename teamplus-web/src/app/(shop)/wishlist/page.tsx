'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { FilterTabs } from '@/components/shared/FilterTabs';
import { WishlistItemCard } from '@/components/shared/WishlistItemCard';
import { EmptyStateAction } from '@/components/shared/EmptyStateAction';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

type WishlistTab = 'all' | 'class' | 'match';

interface WishlistItem {
  id: number;
  name: string;
  subtitle?: string;
  price: number;
  originalPrice?: number;
  imageUrl: string | null;
  type: 'class' | 'match' | 'product';
  tag?: { label: string; tone: 'primary' | 'success' | 'warning' | 'error' };
}

/** 백엔드 위시리스트 아이템 응답 */
interface WishlistApiItem {
  id: number;
  productId?: number;
  productName?: string;
  name?: string;
  brand?: string;
  price?: number;
  sellingPrice?: number;
  originalPrice?: number;
  listPrice?: number;
  thumbnailUrl?: string;
  imageUrl?: string;
  inStock?: boolean;
  stockQuantity?: number;
  category?: string;
  categoryName?: string;
  type?: string;
  status?: string;
  subtitle?: string;
  createdAt?: string;
  addedAt?: string;
}

function toWishlistItem(item: WishlistApiItem): WishlistItem {
  const type = item.type === 'match' ? 'match' : item.type === 'class' ? 'class' : 'product';
  const tag = item.status === 'recruiting'
    ? { label: MESSAGES.match.status.recruiting, tone: 'primary' as const }
    : item.status === 'closing_soon'
    ? { label: MESSAGES.match.status.closingSoon, tone: 'warning' as const }
    : undefined;

  return {
    id: item.productId ?? item.id,
    name: item.productName ?? item.name ?? '',
    subtitle: item.subtitle ?? item.brand,
    price: item.sellingPrice ?? item.price ?? 0,
    originalPrice: item.listPrice ?? item.originalPrice,
    imageUrl: item.thumbnailUrl ?? item.imageUrl ?? null,
    type,
    tag,
  };
}

const FILTER_TABS = [
  { key: 'all', label: '전체' },
  { key: 'class', label: '수업' },
  { key: 'match', label: '매치' },
];

export default function WishlistPage() {
  const { toast } = useToast();
  const { navigate } = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [activeTab, setActiveTab] = useState<WishlistTab>('all');

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  // 위시리스트 API 로드
  useEffect(() => {
    let cancelled = false;

    async function loadWishlist() {
      setIsLoading(true);
      try {
        const res = await api.get<{
          data?: WishlistApiItem[];
          items?: WishlistApiItem[];
          wishlist?: WishlistApiItem[];
        }>('/shop/wishlist');

        if (cancelled) return;

        if (res.success && res.data) {
          const raw = (res.data as { data?: WishlistApiItem[] }).data
            ?? (res.data as { items?: WishlistApiItem[] }).items
            ?? (res.data as { wishlist?: WishlistApiItem[] }).wishlist
            ?? (Array.isArray(res.data) ? res.data : []);
          setWishlistItems((raw as WishlistApiItem[]).map(toWishlistItem));
        } else {
          setWishlistItems([]);
        }
      } catch {
        setWishlistItems([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadWishlist();
    return () => { cancelled = true; };
  }, []);

  const filteredItems = wishlistItems.filter((item) => {
    if (activeTab === 'all') return true;
    return item.type === activeTab;
  });

  const handleRemoveItem = (id: number) => {
    setWishlistItems((prev) => prev.filter((item) => item.id !== id));
    toast.success(MESSAGES.delete.success);
  };

  const handleCtaClick = (item: WishlistItem) => {
    if (item.type === 'class') {
      navigate(`/classes/${item.id}`);
    } else if (item.type === 'match') {
      navigate(`/matches/${item.id}`);
    } else {
      navigate(`/products/${item.id}`);
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title={MESSAGES.wishlist.title} />

      {/* Filter Tabs — flat 흰 섹션 (hairline 하단) */}
      <div className="sticky top-14 z-9 bg-it-surface dark:bg-rink-900 border-b border-it-line dark:border-rink-800 px-4">
        <FilterTabs
          tabs={FILTER_TABS}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as WishlistTab)}
          ariaLabel="찜 목록 필터"
          iceTheme
        />
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck">
        {filteredItems.length === 0 ? (
          <EmptyStateAction
            icon="favorite"
            title={MESSAGES.wishlist.emptyTitle}
            description={MESSAGES.wishlist.emptyHint}
            actionLabel={MESSAGES.wishlist.browseClasses}
            actionHref="/home"
            variant="illustrated"
            iceTheme
          />
        ) : (
          <section className="bg-it-surface dark:bg-rink-800 mt-2 px-4 pt-2 pb-30 flex flex-col divide-y divide-it-line dark:divide-it-blue-900">
            {filteredItems.map((item) => (
              <div key={item.id} className="py-4">
                <WishlistItemCard
                  type={item.type}
                  imageUrl={item.imageUrl ?? undefined}
                  title={item.name}
                  subtitle={item.subtitle}
                  originalPrice={item.originalPrice}
                  price={item.price}
                  tag={item.tag}
                  ctaLabel="신청하기"
                  onRemove={() => handleRemoveItem(item.id)}
                  onCtaClick={() => handleCtaClick(item)}
                  iceTheme
                />
              </div>
            ))}
          </section>
        )}
      </main>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
