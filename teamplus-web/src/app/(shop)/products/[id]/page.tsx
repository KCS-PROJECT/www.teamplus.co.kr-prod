"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from "@/hooks/useNativeUI";
import { api } from "@/services/api-client";
import { resolveImageSrc } from "@/lib/image-url";

const GlobalMenu = dynamic(
  () =>
    import("@/components/layout/GlobalMenu").then((mod) => ({
      default: mod.GlobalMenu,
    })),
  { ssr: false },
);

interface ApiProductImage {
  id: string;
  imageUrl: string;
  isMain: boolean;
  altText?: string;
  displayOrder: number;
}

interface ApiProductOption {
  id: string;
  optionName: string;
  optionValue: string;
  additionalPrice: number;
  stockCount: number;
  isActive: boolean;
}

interface ApiProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  originalPrice?: number;
  discountRate?: number;
  rating: number;
  reviewCount: number;
  images: ApiProductImage[];
  options: ApiProductOption[];
  category?: { id: string; name: string };
  brand?: string;
}

function StarRating({
  rating,
  size = "sm",
}: {
  rating: number;
  size?: "sm" | "lg";
}) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const iconSize = size === "lg" ? "text-card-title" : "text-card-body";

  return (
    <div className="flex text-yellow-400">
      {[...Array(fullStars)].map((_, i) => (
        <Icon key={i} name="star" filled className={iconSize} />
      ))}
      {hasHalfStar && <Icon name="star_half" filled className={iconSize} />}
      {[...Array(5 - fullStars - (hasHalfStar ? 1 : 0))].map((_, i) => (
        <Icon
          key={`empty-${i}`}
          name="star"
          className={`${iconSize} text-wtext-4`}
        />
      ))}
    </div>
  );
}

function ImageGallery({
  images,
  currentIndex,
  onIndexChange,
}: {
  images: ApiProductImage[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}) {
  const count = Math.max(images.length, 1);
  return (
    <div className="relative w-full aspect-[4/5] bg-it-fill dark:bg-rink-800">
      <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar h-full w-full">
        {count > 0 && images.length > 0 ? (
          images.map((img) => (
            <div
              key={img.id}
              className="snap-center shrink-0 w-full h-full relative"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageSrc(img.imageUrl)}
                alt={img.altText ?? ""}
                className="w-full h-full object-cover"
              />
            </div>
          ))
        ) : (
          <div className="snap-center shrink-0 w-full h-full flex items-center justify-center">
            <Icon
              name="checkroom"
              className="text-8xl text-it-ink-400 dark:text-rink-500"
            />
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {images.map((_, index) => (
            <button
              type="button"
              key={index}
              onClick={() => onIndexChange(index)}
              className={`w-2 h-2 rounded-w-pill transition-colors motion-reduce:transition-none ${
                index === currentIndex ? "bg-white shadow-sm" : "bg-white/60"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OptionSelector({
  optionName,
  values,
  selectedValue,
  onSelect,
}: {
  optionName: string;
  values: { id: string; value: string; available: boolean }[];
  selectedValue: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="text-card-body font-semibold text-it-ink-800 dark:text-white mb-3">
        {optionName}
      </h3>
      <div className="flex flex-wrap gap-3">
        {values.map((opt) => (
          <button
            type="button"
            key={opt.id}
            onClick={() => opt.available && onSelect(opt.id)}
            disabled={!opt.available}
            className={`flex items-center justify-center min-w-[3rem] h-10 px-3 rounded-w-md border-[1.5px] text-card-body font-medium transition-all motion-reduce:transition-none ${
              !opt.available
                ? "opacity-40 cursor-not-allowed border-it-line dark:border-rink-700 text-it-ink-400"
                : selectedValue === opt.id
                  ? "border-it-blue-500 bg-it-blue-50 text-it-blue-500"
                  : "border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-white/5 text-it-ink-800 dark:text-white hover:border-it-blue-400"
            }`}
          >
            {opt.value}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const { navigate } = useNavigation();
  const params = useParams();
  const productId = params?.id as string;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});
  const [isFavorite, setIsFavorite] = useState(false);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  useEffect(() => {
    if (!productId) return;
    if (/^\d+$/.test(productId)) {
      setProduct(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      const res = await api.get<ApiProduct>(`/shop/products/${productId}`, {
        retry: false,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setProduct(res.data);
        // 옵션별 첫 번째 값 기본 선택
        const defaults: Record<string, string> = {};
        const groups = groupOptions(res.data.options);
        Object.entries(groups).forEach(([name, opts]) => {
          const available = opts.find((o) => o.available);
          if (available) defaults[name] = available.id;
        });
        setSelectedOptions(defaults);
      } else {
        setProduct(null);
        setSelectedOptions({});
      }
      setIsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // 옵션을 optionName별로 그룹핑
  function groupOptions(options: ApiProductOption[]) {
    return options.reduce<
      Record<string, { id: string; value: string; available: boolean }[]>
    >((acc, opt) => {
      if (!acc[opt.optionName]) acc[opt.optionName] = [];
      acc[opt.optionName].push({
        id: opt.id,
        value: opt.optionValue,
        available: opt.isActive && opt.stockCount > 0,
      });
      return acc;
    }, {});
  }

  const discount = product?.discountRate
    ? product.discountRate
    : product?.originalPrice && product.originalPrice > product.price
      ? Math.round(
          ((product.originalPrice - product.price) / product.originalPrice) *
            100,
        )
      : 0;

  if (isLoading) {
    return (
      <MobileContainer hasBottomNav={false}>
        <div className="flex-1 flex items-center justify-center bg-it-canvas dark:bg-puck">
          <div className="w-8 h-8 border-2 border-it-blue-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
        </div>
      </MobileContainer>
    );
  }

  if (!product) {
    return (
      <MobileContainer hasBottomNav={false}>
        {/* [appbar-harness-v3 분류 C → A] 빈 상태도 PageAppBar SoT 사용 (variant='detail') */}
        {/* [2026-05-26 Track D B6] showAppBar:false → forceNative 로 Native/Web 동일 AppBar(뒤로가기 포함) 노출 */}
        <PageAppBar variant="detail" title="상품 상세" forceNative />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-it-canvas dark:bg-puck">
          <Icon name="inventory_2" className="text-5xl text-it-ink-400" />
          <p className="text-it-ink-500">상품을 찾을 수 없습니다.</p>
        </div>
      </MobileContainer>
    );
  }

  const optionGroups = groupOptions(product.options);

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [appbar-harness-v3 분류 C → A] 커스텀 floating bg-black/40 헤더를 PageAppBar SoT 로 흡수.
          variant='detail' + extraActions [공유/장바구니] → ≡ 메뉴 자동. 시각 통일성. */}
      {/* [2026-05-26 Track D B6] showAppBar:false → forceNative 로 Native/Web 동일 AppBar(뒤로가기 포함) 노출 */}
      <PageAppBar
        variant="detail"
        title={product.name}
        forceNative
        extraActions={[
          {
            icon: 'share',
            label: '공유하기',
            onClick: () => {
              if (typeof navigator !== 'undefined' && navigator.share) {
                void navigator.share({ title: product.name, url: typeof window !== 'undefined' ? window.location.href : '' });
              }
            },
          },
          {
            icon: 'shopping_bag',
            label: '장바구니',
            onClick: () => navigate('/cart'),
          },
        ]}
        onMenu={() => setIsMenuOpen(true)}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-30 no-scrollbar bg-it-canvas dark:bg-puck">
        {/* Image Gallery */}
        <ImageGallery
          images={product.images}
          currentIndex={currentImageIndex}
          onIndexChange={setCurrentImageIndex}
        />

        {/* Product Info — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-6 pb-6 flex flex-col gap-2">
          <div className="flex justify-between items-start gap-4">
            <h1 className="text-2xl font-bold leading-tight text-it-ink-800 dark:text-white">
              {product.name}
            </h1>
            <button
              type="button"
              onClick={() => setIsFavorite(!isFavorite)}
              className="text-it-ink-400 dark:text-rink-300 hover:text-it-blue-500 transition-colors motion-reduce:transition-none pt-1"
            >
              <Icon
                name="favorite"
                filled={isFavorite}
                className={`text-[28px] ${isFavorite ? "text-it-red-500" : ""}`}
              />
            </button>
          </div>
          {(product.rating > 0 || product.reviewCount > 0) && (
            <div className="flex items-center gap-2 text-card-body">
              <StarRating rating={product.rating} size="lg" />
              <span className="font-bold text-it-ink-800 dark:text-white">
                {product.rating.toFixed(1)}
              </span>
              <span className="text-it-ink-400 dark:text-rink-300 underline decoration-it-line-strong dark:decoration-slate-600">
                ({product.reviewCount}개의 리뷰)
              </span>
            </div>
          )}
          <div className="mt-2 flex items-baseline gap-2 justify-end">
            <h2 className="text-2xl font-bold text-it-blue-500 tabular-nums">
              {product.price.toLocaleString()}원
            </h2>
            {product.originalPrice && product.originalPrice > product.price && (
              <>
                <span className="text-it-ink-400 line-through text-card-body tabular-nums">
                  {product.originalPrice.toLocaleString()}원
                </span>
                {discount > 0 && (
                  <span className="bg-it-red-50 text-it-red-500 text-card-meta font-bold px-2 py-1 rounded-w-md">
                    {discount}% 할인
                  </span>
                )}
              </>
            )}
          </div>
        </section>

        {/* Options — flat 흰 섹션 */}
        {Object.keys(optionGroups).length > 0 && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 py-6 space-y-6">
              {Object.entries(optionGroups).map(([optionName, values]) => (
                <OptionSelector
                  key={optionName}
                  optionName={optionName}
                  values={values}
                  selectedValue={selectedOptions[optionName] ?? ""}
                  onSelect={(id) =>
                    setSelectedOptions((prev) => ({ ...prev, [optionName]: id }))
                  }
                />
              ))}
            </section>
          </>
        )}

        {/* Product Description — flat 흰 섹션 */}
        {product.description && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 py-6">
              <h3 className="text-card-body font-semibold text-it-ink-800 dark:text-white mb-3">
                상품 정보
              </h3>
              <p className="text-it-ink-700 dark:text-rink-100 text-card-body leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </section>
          </>
        )}

        {/* Reviews Summary — flat 흰 섹션 */}
        {product.reviewCount > 0 && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 py-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-card-title font-bold text-it-ink-800 dark:text-white">
                  리뷰{" "}
                  <span className="text-it-ink-400 font-normal text-card-body ml-1">
                    ({product.reviewCount})
                  </span>
                </h3>
              </div>
              <div className="flex items-center gap-4 p-4 bg-it-fill dark:bg-rink-800/50 rounded-w-md border border-it-line dark:border-rink-700">
                <StarRating rating={product.rating} size="lg" />
                <span className="text-2xl font-bold text-it-ink-800 dark:text-white tabular-nums">
                  {product.rating.toFixed(1)}
                </span>
                <span className="text-card-body text-it-ink-400 dark:text-rink-300">
                  / 5.0
                </span>
              </div>
            </section>
          </>
        )}

        {/* Shipping Info — flat 흰 섹션 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <section className="bg-it-surface dark:bg-rink-800 px-5 py-6 space-y-3">
          <div className="flex items-start gap-3 p-4 bg-it-blue-50 dark:bg-it-blue-900/10 rounded-w-md border border-it-blue-100 dark:border-it-blue-900/20">
            <Icon name="local_shipping" className="text-it-blue-500 mt-0.5" />
            <div>
              <div className="text-card-body font-bold text-it-ink-800 dark:text-white">
                무료 배송
              </div>
              <div className="text-card-meta text-it-ink-500 dark:text-rink-300 mt-0.5">
                주문 후 2~4일 이내 도착 예정
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-it-blue-50 dark:bg-it-blue-900/10 rounded-w-md border border-it-blue-100 dark:border-it-blue-900/20">
            <Icon name="verified_user" className="text-it-blue-500 mt-0.5" />
            <div>
              <div className="text-card-body font-bold text-it-ink-800 dark:text-white">
                정품 보증
              </div>
              <div className="text-card-meta text-it-ink-500 dark:text-rink-300 mt-0.5">
                100% 정품을 보장하며 가품일 시 200% 환불
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-0 fixed-center-x p-4 bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-rink-800 z-40">
        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1 h-12 rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill text-it-blue-500 font-bold flex items-center justify-center gap-2 hover:bg-it-blue-50 transition-colors motion-reduce:transition-none"
          >
            <Icon name="add_shopping_cart" />
            장바구니
          </button>
          <button
            type="button"
            className="flex-[2] h-12 rounded-w-md bg-it-blue-500 text-white font-bold flex items-center justify-center gap-2 hover:bg-it-blue-600 active:brightness-95 transition-all motion-reduce:transition-none"
          >
            구매하기
          </button>
        </div>
      </div>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
