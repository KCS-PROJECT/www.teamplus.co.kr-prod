'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { SwipeBanner, BannerSlide } from '@/components/ui/SwipeBanner';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  imageUrl?: string;
  badge?: string;
  badgeColor?: 'primary' | 'gray' | 'red';
}

interface ApiProduct {
  id: string;
  name: string;
  brand?: string;
  price: number;
  salePrice?: number | null;
  discountRate?: number | null;
  isFeatured?: boolean;
  isActive?: boolean;
  images?: { imageUrl: string; isMain: boolean }[];
}

interface ApiCategory {
  id: string;
  name: string;
  slug?: string;
  displayOrder?: number;
}

/** API 카테고리 → 아이콘 매핑 (slug/이름 기반 fallback) */
const CATEGORY_ICON_MAP: Record<string, string> = {
  hockey: 'sports_hockey',
  skate: 'ice_skating',
  uniform: 'checkroom',
  protection: 'shield',
  accessory: 'style',
};

function mapApiProduct(p: ApiProduct): Product {
  const mainImage = p.images?.find((img) => img.isMain) ?? p.images?.[0];
  const originalPrice = p.salePrice && p.salePrice < p.price ? p.price : undefined;
  const finalPrice = p.salePrice && p.salePrice < p.price ? p.salePrice : p.price;
  const discount = p.discountRate
    ? p.discountRate
    : originalPrice
      ? Math.round(((originalPrice - finalPrice) / originalPrice) * 100)
      : undefined;

  return {
    id: p.id,
    name: p.name,
    brand: p.brand ?? 'TEAMPLUS',
    price: finalPrice,
    originalPrice,
    discount,
    imageUrl: mainImage?.imageUrl,
    badge: p.isFeatured ? '추천' : undefined,
    badgeColor: p.isFeatured ? 'primary' : undefined,
  };
}

interface Category {
  id: string;
  name: string;
  icon: string;
  href: string;
}

/** 정적 카테고리 fallback (API 실패 시 사용) */
const FALLBACK_CATEGORIES: Category[] = [
  { id: 'hockey', name: '하키 장비', icon: 'sports_hockey', href: '/products?category=hockey' },
  { id: 'skate', name: '스케이트', icon: 'ice_skating', href: '/products?category=skate' },
  { id: 'uniform', name: '유니폼', icon: 'checkroom', href: '/products?category=uniform' },
  { id: 'protection', name: '보호장비', icon: 'shield', href: '/products?category=protection' },
  { id: 'more', name: '더보기', icon: 'more_horiz', href: '/products' },
];

// 시즌 특별 할인 배너 데이터
const seasonBanners: BannerSlide[] = [
  {
    id: '1',
    tag: '시즌 특별 할인',
    title: '최대 50% 할인\n하키 장비 특가',
    buttonText: '지금 구경하기',
    href: '/products?sale=season',
    bgColor: 'bg-ice-500',
    overlayColor: 'bg-blue-800/50',
  },
  {
    id: '2',
    tag: '겨울 시즌 OPEN',
    title: '신규 회원 전용\n첫 구매 20% 할인',
    subtitle: '가입 후 7일 이내 적용',
    buttonText: '혜택 받기',
    href: '/products?promo=newmember',
    bgColor: 'bg-emerald-600',
    overlayColor: 'bg-emerald-800/40',
  },
  {
    id: '3',
    tag: '인기 브랜드',
    title: 'Bauer 전품목\n무료 배송',
    subtitle: '12월 한정 이벤트',
    buttonText: '바로가기',
    href: '/products?brand=bauer',
    bgColor: 'bg-rink-800',
    overlayColor: 'bg-puck/30',
  },
  {
    id: '4',
    tag: '주니어 특가',
    title: '아이들을 위한\n입문 장비 세트',
    subtitle: '스틱 + 헬멧 + 글러브 패키지',
    buttonText: '세트 보기',
    href: '/products?category=junior',
    bgColor: 'bg-orange-500',
    overlayColor: 'bg-orange-700/40',
  },
];

function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState({ hours: 2, minutes: 15, seconds: 30 });
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        let { hours, minutes, seconds } = prev;
        seconds--;
        if (seconds < 0) {
          seconds = 59;
          minutes--;
        }
        if (minutes < 0) {
          minutes = 59;
          hours--;
        }
        if (hours < 0) {
          hours = 23;
          minutes = 59;
          seconds = 59;
        }
        // 1시간 미만일 때 긴박감 강조
        setIsUrgent(hours === 0);
        return { hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <span
      className={`flex items-center justify-center gap-1 rounded-w-md px-3 py-1.5 text-card-meta font-bold uppercase tabular-nums ${
        isUrgent
          ? 'bg-it-red-500 text-white timer-urgent'
          : 'bg-it-red-50 text-it-red-500'
      }`}
    >
      <Icon name="timer" className="text-card-body" />
      <span className={isUrgent ? 'timer-flash' : ''}>
        {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
      </span>
    </span>
  );
}

function CategoryItem({ category }: { category: Category }) {
  return (
    <NavLink href={category.href} className="flex flex-col items-center gap-2.5 group">
      <div className="flex h-16 w-16 items-center justify-center rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30 border border-it-line dark:border-rink-700">
        <Icon
          name={category.icon}
          className="text-w-h2 text-it-blue-500 dark:text-it-blue-300 relative z-10 group-hover:scale-110 transition-transform motion-reduce:transition-none duration-300"
        />
      </div>
      <span className="text-card-meta font-semibold text-it-ink-600 dark:text-wtext-4 group-hover:text-it-blue-500 transition-colors motion-reduce:transition-none">
        {category.name}
      </span>
    </NavLink>
  );
}

function ProductCard({ product }: { product: Product }) {
  const [liked, setLiked] = useState(false);
  const [justLiked, setJustLiked] = useState(false);

  const handleLike = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setLiked(!liked);
    if (!liked) {
      setJustLiked(true);
      setTimeout(() => setJustLiked(false), 300);
    }
  }, [liked]);

  return (
    <NavLink
      href={`/products/${product.id}`}
      className="min-w-[160px] max-w-[160px] flex flex-col gap-2.5 rounded-w-md bg-it-surface dark:bg-rink-800 p-3 border border-it-line dark:border-rink-700 transition-transform motion-reduce:transition-none active:brightness-95"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-w-md bg-it-fill dark:bg-puck">
        <div className="h-full w-full bg-it-fill dark:bg-rink-800 flex items-center justify-center">
          <Icon name="sports_hockey" className="text-4xl text-it-ink-400 dark:text-wtext-3" />
        </div>
        {product.discount && (
          <div className="absolute top-2 left-2 rounded-w-md bg-it-red-500 px-2 py-1 text-card-meta font-bold text-white">
            -{product.discount}%
          </div>
        )}
        <button
          onClick={handleLike}
          className={`absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-w-pill bg-it-surface/95 dark:bg-rink-800/95 border border-it-line hover:scale-110 transition-all motion-reduce:transition-none ${justLiked ? 'heart-active' : ''}`}
          aria-label={liked ? '찜 해제' : '찜하기'}
        >
          <Icon
            name="favorite"
            filled={liked}
            className={`text-card-title ${liked ? 'text-it-red-500' : 'text-it-ink-400'}`}
          />
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-card-meta text-it-ink-400 dark:text-wtext-3 font-medium tracking-wide uppercase">
          {product.brand}
        </p>
        <p className="truncate text-card-body font-semibold text-it-ink-800 dark:text-white leading-snug">
          {product.name}
        </p>
        <div className="flex items-center gap-2 mt-1 justify-end">
          <span className="text-card-emphasis font-bold text-it-blue-500 tabular-nums">
            {product.price.toLocaleString()}원
          </span>
          {product.originalPrice && (
            <span className="text-card-meta text-it-ink-400 line-through tabular-nums">
              {product.originalPrice.toLocaleString()}원
            </span>
          )}
        </div>
      </div>
    </NavLink>
  );
}

function FeaturedProductCard({ product }: { product: Product }) {
  const [liked, setLiked] = useState(false);
  const [justLiked, setJustLiked] = useState(false);

  const handleLike = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setLiked(!liked);
    if (!liked) {
      setJustLiked(true);
      setTimeout(() => setJustLiked(false), 300);
    }
  }, [liked]);

  return (
    <NavLink
      href={`/products/${product.id}`}
      className="group flex flex-col gap-2.5 rounded-w-md bg-it-surface dark:bg-rink-800 p-3 border border-it-line dark:border-rink-700 transition-transform motion-reduce:transition-none active:brightness-95"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-w-md bg-it-fill dark:bg-puck">
        <div className="h-full w-full bg-it-fill dark:bg-rink-800 flex items-center justify-center">
          <Icon name="sports_hockey" className="text-5xl text-it-ink-400 dark:text-wtext-3 group-hover:scale-110 transition-transform motion-reduce:transition-none duration-500" />
        </div>
        <button
          onClick={handleLike}
          className={`absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-w-pill bg-black/30 hover:bg-black/50 transition-all motion-reduce:transition-none ${justLiked ? 'heart-active' : ''}`}
          aria-label={liked ? '찜 해제' : '찜하기'}
        >
          <Icon
            name="favorite"
            filled={liked}
            className={`text-card-title ${liked ? 'text-it-red-500' : 'text-white'}`}
          />
        </button>
        {product.badge && (
          <div className="absolute top-2.5 left-2.5 rounded-w-md bg-it-blue-500 px-2.5 py-1 text-card-meta font-bold text-white uppercase tracking-wider">
            {product.badge}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-card-meta uppercase font-bold tracking-wider text-it-ink-400 dark:text-wtext-3">
          {product.brand}
        </span>
        <h4 className="line-clamp-2 text-card-body font-semibold text-it-ink-800 dark:text-white leading-snug">
          {product.name}
        </h4>
        <div className="mt-1.5 flex items-baseline justify-end">
          <span className="text-card-emphasis font-bold text-it-ink-800 dark:text-white tabular-nums">
            {product.price.toLocaleString()}
            <span className="text-card-meta font-normal text-it-ink-400 ml-0.5">원</span>
          </span>
        </div>
      </div>
    </NavLink>
  );
}

export default function ShopHomePage() {
  const { navigate } = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [timeDealProducts, setTimeDealProducts] = useState<Product[]>([]);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // 네이티브 앱에서 UI 설정 (Flutter BottomNav 숨김 → 웹 BottomNav만 사용)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  /** 카테고리, 상품, 장바구니 데이터를 병렬 로드 */
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [catRes, saleRes, featuredRes, cartRes] = await Promise.all([
        api.get<ApiCategory[]>('/shop/categories'),
        api.get<{ products?: ApiProduct[]; data?: ApiProduct[] }>('/shop/products?limit=6&isActive=true'),
        api.get<{ products?: ApiProduct[]; data?: ApiProduct[] }>('/shop/products?limit=8&isFeatured=true&isActive=true'),
        api.get<{ totalItems?: number }>('/shop/cart'),
      ]);

      // 카테고리
      if (catRes.success && Array.isArray(catRes.data) && catRes.data.length > 0) {
        const mapped = catRes.data.map((c) => ({
          id: c.id,
          name: c.name,
          icon: CATEGORY_ICON_MAP[c.slug ?? ''] ?? 'category',
          href: `/products?category=${c.id}`,
        }));
        mapped.push({ id: 'more', name: '더보기', icon: 'more_horiz', href: '/products' });
        setCategories(mapped);
      }

      // 타임특가 (할인 상품)
      if (saleRes.success && saleRes.data) {
        const raw = Array.isArray(saleRes.data)
          ? saleRes.data
          : (saleRes.data.products ?? saleRes.data.data ?? []);
        const saleProducts = (raw as ApiProduct[])
          .filter((p) => p.salePrice && p.salePrice < p.price)
          .slice(0, 6);
        setTimeDealProducts(saleProducts.map(mapApiProduct));
      }

      // 추천 상품
      if (featuredRes.success && featuredRes.data) {
        const raw = Array.isArray(featuredRes.data)
          ? featuredRes.data
          : (featuredRes.data.products ?? featuredRes.data.data ?? []);
        setRecommendedProducts((raw as ApiProduct[]).slice(0, 8).map(mapApiProduct));
      }

      // 장바구니 수
      if (cartRes.success && cartRes.data) {
        setCartCount((cartRes.data as { totalItems?: number }).totalItems ?? 0);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <MobileContainer hasBottomNav={true}>
      {/* [appbar-harness-v3 분류 C → A] 커스텀 header-frost 헤더를 PageAppBar SoT 로 흡수.
          extraActions: [검색, 장바구니] → ≡ 메뉴 자동.
          cartCount 배지는 본문 첫 섹션의 cart-floating-badge 패턴으로 분리하여 AppBar 시각 통일성 유지. */}
      <PageAppBar
        title="TEAMPLUS Shop"
        extraActions={[
          {
            icon: 'search',
            label: '검색',
            onClick: () => navigate('/search', { message: '로딩중...' }),
          },
          {
            icon: 'shopping_bag',
            label: cartCount > 0 ? `장바구니 (${cartCount}개)` : '장바구니',
            onClick: () => navigate('/cart', { message: '로딩중...' }),
            className: cartCount > 0 ? 'relative after:content-[""] after:absolute after:top-1 after:right-1 after:h-2 after:w-2 after:rounded-full after:bg-it-blue-500' : undefined,
          },
        ]}
        onMenu={() => setIsMenuOpen(true)}
      />

      <main className="flex-1 flex flex-col overflow-y-auto bg-it-canvas dark:bg-puck pb-30">
        {/* Season Special Swipe Banner — 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-4 pt-5 pb-5">
          <SwipeBanner
            slides={seasonBanners}
            autoPlayInterval={4000}
            height="h-48"
            iceTheme
          />
        </section>

        {/* Categories — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 pt-5 pb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
              카테고리
            </h3>
            <NavLink
              href="/products"
              className="text-card-meta font-semibold text-it-blue-500 hover:text-it-blue-600 transition-colors motion-reduce:transition-none flex items-center gap-0.5"
            >
              전체보기
              <Icon name="chevron_right" className="text-card-body" />
            </NavLink>
          </div>
          <div className="flex gap-5 overflow-x-auto hide-scrollbar pb-2 -mx-4 px-4">
            {categories.map((category) => (
              <CategoryItem key={category.id} category={category} />
            ))}
          </div>
        </section>

        {/* Time Sale — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 pt-5 pb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                타임 특가
              </h3>
              <CountdownTimer />
            </div>
          </div>
          {isLoading ? null : timeDealProducts.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto hide-scrollbar -mx-4 px-4 pb-2">
              {timeDealProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="text-card-body text-it-ink-400 dark:text-wtext-3 text-center py-6">
              {MESSAGES.empty('타임 특가 상품')}
            </p>
          )}
        </section>

        {/* Recommended Products — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-4 pt-5 pb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
              회원님을 위한 추천
            </h3>
          </div>
          {isLoading ? null : recommendedProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {recommendedProducts.map((product) => (
                <FeaturedProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="text-card-body text-it-ink-400 dark:text-wtext-3 text-center py-6">
              {MESSAGES.empty('추천 상품')}
            </p>
          )}

          {/* Load More Button */}
          <div className="flex justify-center pt-6">
            <NavLink
              href="/products"
              className="rounded-w-pill bg-it-fill dark:bg-rink-800 px-7 py-3.5 text-card-body font-semibold text-it-ink-700 dark:text-white hover:bg-it-line dark:hover:bg-rink-700 transition-all motion-reduce:transition-none active:brightness-95 border-[1.5px] border-it-line-strong dark:border-rink-700 flex items-center gap-2"
              loadingMessage="로딩중..."
            >
              상품 더보기
              <Icon name="expand_more" className="text-card-title" />
            </NavLink>
          </div>
        </section>
      </main>

      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
