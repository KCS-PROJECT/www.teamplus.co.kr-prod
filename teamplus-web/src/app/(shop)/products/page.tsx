'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import type { StatusVariant } from '@/lib/status-colors';

const PRODUCT_BADGE_VARIANT: Record<string, StatusVariant> = {
  BEST: 'primary',
  NEW: 'success',
  SALE: 'error',
};


interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  badge?: string;
  isFavorite?: boolean;
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
}

function mapApiToProduct(p: ApiProduct): Product {
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
    badge: p.isFeatured ? 'BEST' : undefined,
  };
}

function ProductCard({ product, onFavorite }: { product: Product; onFavorite: (id: string) => void }) {
  const productLabel = `${product.brand} ${product.name}, ${product.price.toLocaleString()}원${
    product.discount ? `, ${product.discount}% 할인` : ''
  }`;
  return (
    <article
      role="group"
      aria-labelledby={`product-${product.id}-name`}
      aria-describedby={`product-${product.id}-price`}
    >
      <NavLink
        href={`/products/${product.id}`}
        className="group block"
        aria-label={`${productLabel} 상세 보기`}
      >
        <div className="relative aspect-[3/4] rounded-w-md overflow-hidden bg-it-fill dark:bg-rink-800 mb-2 border border-it-line dark:border-rink-700">
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon name="checkroom" className="text-5xl text-it-ink-400 dark:text-rink-500" aria-hidden="true" />
          </div>
          {product.badge && (
            <StatusBadge
              variant={PRODUCT_BADGE_VARIANT[product.badge] ?? 'neutral'}
              className="absolute top-2 left-2"
              iceTheme
            >
              {product.badge}
            </StatusBadge>
          )}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onFavorite(product.id); }}
            className="absolute top-2 right-2 p-1.5 bg-it-surface/90 dark:bg-rink-900/80 rounded-w-pill transition-colors motion-reduce:transition-none"
            aria-label={product.isFavorite ? `${product.name} 찜 해제` : `${product.name} 찜하기`}
            aria-pressed={Boolean(product.isFavorite)}
          >
            <Icon
              name="favorite"
              filled={product.isFavorite}
              className={`text-card-title ${product.isFavorite ? 'text-it-red-500' : 'text-it-ink-400 hover:text-it-red-500'}`}
              aria-hidden="true"
            />
          </button>
        </div>
        <div className="px-1">
          <p className="text-card-meta text-it-ink-400 dark:text-rink-300 mb-0.5">{product.brand}</p>
          <h3
            id={`product-${product.id}-name`}
            className="text-card-body font-medium text-it-ink-800 dark:text-white line-clamp-2 mb-1 group-hover:text-it-blue-500 transition-colors motion-reduce:transition-none"
          >
            {product.name}
          </h3>
          <div
            id={`product-${product.id}-price`}
            className="flex items-baseline gap-2"
          >
            {product.discount && (
              <span className="text-card-body font-bold text-it-red-500" aria-label={`할인율 ${product.discount} 퍼센트`}>{product.discount}%</span>
            )}
            <span className="text-card-body font-bold text-it-ink-800 dark:text-white tabular-nums">
              {product.price.toLocaleString()}원
            </span>
          </div>
          {product.originalPrice && (
            <span
              className="text-card-meta text-it-ink-400 line-through tabular-nums"
              aria-label={`정가 ${product.originalPrice.toLocaleString()}원`}
            >
              {product.originalPrice.toLocaleString()}원
            </span>
          )}
        </div>
      </NavLink>
    </article>
  );
}

const PAGE_SIZE = 20;

export default function ProductListPage() {
  const { navigate } = useNavigation();
  const searchParams = useSearchParams();
  const categoryParam = searchParams?.get('category') ?? '';

  const [categoryList, setCategoryList] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [productList, setProductList] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 네이티브 앱에서 UI 설정 (Flutter BottomNav 숨김 → 웹 BottomNav만 사용)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });
  const [showFilter, setShowFilter] = useState(false);

  /** 카테고리 목록 로드 */
  useEffect(() => {
    const loadCategories = async () => {
      const res = await api.get<ApiCategory[]>('/shop/categories');
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        setCategoryList(res.data.map((c) => ({ id: c.id, name: c.name })));
        // URL에 category 파라미터가 있으면 해당 카테고리 선택
        if (categoryParam) {
          const idx = res.data.findIndex((c) => c.id === categoryParam || c.slug === categoryParam);
          if (idx >= 0) setSelectedCategory(idx + 1); // +1 for '전체'
        }
      }
    };
    loadCategories();
  }, [categoryParam]);

  /** 상품 목록 로드 */
  const fetchProducts = useCallback(async (pageNum: number, categoryId?: string) => {
    if (pageNum === 1) setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_SIZE), isActive: 'true' });
      if (categoryId) params.set('categoryId', categoryId);

      const res = await api.get<{ products?: ApiProduct[]; data?: ApiProduct[]; total?: number } | ApiProduct[]>(
        `/shop/products?${params.toString()}`
      );

      if (res.success && res.data) {
        const raw = Array.isArray(res.data)
          ? res.data
          : (res.data.products ?? res.data.data ?? []);
        const mapped = (raw as ApiProduct[]).map(mapApiToProduct);
        if (pageNum === 1) setProductList(mapped);
        else setProductList((prev) => [...prev, ...mapped]);
        setHasMore(mapped.length >= PAGE_SIZE);
      } else {
        if (pageNum === 1) setProductList([]);
        setHasMore(false);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  /** 카테고리 변경 시 리로드 */
  useEffect(() => {
    setPage(1);
    const catId = selectedCategory > 0 ? categoryList[selectedCategory - 1]?.id : undefined;
    fetchProducts(1, catId);
  }, [selectedCategory, categoryList, fetchProducts]);

  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    const catId = selectedCategory > 0 ? categoryList[selectedCategory - 1]?.id : undefined;
    fetchProducts(nextPage, catId);
  }, [page, selectedCategory, categoryList, fetchProducts]);

  const handleFavorite = (id: string) => {
    setProductList(prev => prev.map(p =>
      p.id === id ? { ...p, isFavorite: !p.isFavorite } : p
    ));
  };

  const selectedProducts = productList.filter(p => p.isFavorite);
  const totalSelected = selectedProducts.length;
  const categories = ['전체', ...categoryList.map((c) => c.name)];

  return (
    <MobileContainer hasBottomNav={true}>
      {/* [2026-05-26 Track D B9] 기존 SubmainAppBar(탭 허브용·뒤로가기 없음) → DefaultAppBar 로 교체.
          /products 는 BottomNav 탭이 아닌 쇼핑 하위 페이지라 "뒤로 가기"가 필요하다.
          variant='default'(기본) → ← 뒤로가기 + 타이틀 + 우측 액션. showAppBar:false 이므로 forceNative 필수. */}
      <PageAppBar title="상품 목록" forceNative />

      {/* Filter & Category — flat 흰 섹션 (hairline 하단) */}
      <div className="sticky top-14 z-40 bg-it-surface dark:bg-rink-900 border-b border-it-line dark:border-rink-800 flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setShowFilter(!showFilter)}
          className="shrink-0 flex items-center gap-1 px-3 py-2 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 active:brightness-95 rounded-w-md text-card-body font-medium text-it-ink-800 dark:text-white transition-colors motion-reduce:transition-none"
        >
          <Icon name="tune" className="text-card-title text-it-ink-600 dark:text-rink-300" aria-hidden="true" />
          필터
        </button>
        <div
          className="flex-1 flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory overscroll-x-contain hide-scrollbar"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {categories.map((cat, index) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(index)}
              className={`shrink-0 snap-start h-9 px-4 rounded-w-pill border-[1.5px] text-card-body font-bold transition-all motion-reduce:transition-none ${
                selectedCategory === index
                  ? 'bg-it-blue-500 border-it-blue-500 text-white'
                  : 'bg-it-surface dark:bg-rink-800 border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-rink-100 active:brightness-95'
              }`}
            >
              {cat}
            </button>
          ))}
          <div className="shrink-0 w-4" aria-hidden="true" />
        </div>
      </div>

      {/* Product Grid — flat 흰 섹션 */}
      <main className="flex-1 bg-it-canvas dark:bg-puck pb-30">
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-4 py-4">
          {isLoading ? null : productList.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {productList.map((product) => (
                <ProductCard key={product.id} product={product} onFavorite={handleFavorite} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <Icon name="inventory_2" className="text-5xl text-it-ink-400 dark:text-rink-500 mb-4" />
              <p className="text-it-ink-500 dark:text-rink-300">{MESSAGES.empty('상품')}</p>
            </div>
          )}

          {/* Load More */}
          {!isLoading && hasMore && productList.length > 0 && (
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="w-full mt-6 py-3 text-card-body text-it-ink-500 dark:text-rink-300 font-medium flex items-center justify-center gap-1 hover:text-it-blue-500 transition-colors motion-reduce:transition-none disabled:opacity-50"
            >
              {isLoadingMore ? (
                <>
                  <div className="w-4 h-4 border-2 border-it-line-strong border-t-it-blue-500 rounded-w-pill animate-spin motion-reduce:animate-none" />
                  <span>{MESSAGES.loading.waitMessage}</span>
                </>
              ) : (
                <>
                  더 많은 상품 보기
                  <Icon name="expand_more" className="text-card-title" aria-hidden="true" />
                </>
              )}
            </button>
          )}
        </section>
      </main>

      {/* Floating Checkout Button */}
      {totalSelected > 0 && (
        <div className="fixed bottom-[calc(5rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] left-0 right-0 px-4 max-w-md mx-auto z-40">
          <button
            onClick={() => navigate('/cart')}
            className="w-full bg-it-blue-500 hover:bg-it-blue-600 text-white py-4 rounded-w-md flex items-center justify-center gap-2 transition-all motion-reduce:transition-none active:brightness-95"
          >
            <Icon name="shopping_bag" className="text-xl" aria-hidden="true" />
            <span className="font-bold">선택상품 {totalSelected}개 담기</span>
          </button>
        </div>
      )}
    </MobileContainer>
  );
}
