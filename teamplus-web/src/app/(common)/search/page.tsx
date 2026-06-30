"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useKeyboardAvoidance } from "@/hooks/useKeyboardAvoidance";
import { api } from "@/services/api-client";
import { cn } from "@/lib/utils";
import { usePageReady } from "@/hooks/usePageReady";

// ─── 로컬스토리지 키 ─────────────────────────────────
const RECENT_SEARCHES_KEY = "teamplus_recent_searches";
const MAX_RECENT = 10;

// ─── 인기 검색어 ──────────────────────────────────────
type TrendType = "up" | "new" | "stable";

interface TrendKeyword {
  rank: number;
  keyword: string;
  trend: TrendType;
}

/** GET /api/v1/search/popular 응답 아이템 */
interface PopularKeywordApiItem {
  rank?: number;
  keyword: string;
  trend?: TrendType;
}

// ─── 추천 상품 타입 ─────────────────────────────────────
interface RecommendProduct {
  id: string;
  brand: string;
  name: string;
  price: number;
  imageUrl?: string;
}

/** 백엔드 GET /api/v1/shop/products 응답 아이템 */
interface ShopProductApiItem {
  id: string;
  productName?: string;
  name?: string;
  brand?: string;
  price?: number;
  sellingPrice?: number;
  thumbnailUrl?: string;
  imageUrl?: string;
}

/** 백엔드 상품을 추천 상품 UI로 변환 */
function toRecommendProduct(item: ShopProductApiItem): RecommendProduct {
  return {
    id: item.id,
    brand: item.brand ?? "",
    name: item.productName ?? item.name ?? "",
    price: item.sellingPrice ?? item.price ?? 0,
    imageUrl: item.thumbnailUrl ?? item.imageUrl,
  };
}

/** 추천 상품 정적 폴백 데이터 (API 실패 시) */
const FALLBACK_PRODUCTS: RecommendProduct[] = [
  { id: "1", brand: "BAUER", name: "넥서스 Sync 카본 스틱", price: 420000 },
  { id: "2", brand: "CCM", name: "Tacks 910 헬멧 프로", price: 285000 },
  { id: "3", brand: "WARRIOR", name: "QR6 프로 글러브", price: 189000 },
  { id: "4", brand: "TRUE", name: "AX9 시니어 스케이트", price: 650000 },
];

// ─── 트렌드 아이콘 ──────────────────────────────────────
function TrendIcon({ trend }: { trend: TrendType }) {
  if (trend === "up") {
    return (
      <Icon
        name="trending_up"
        className="text-w-body-lg text-it-red-500"
        aria-hidden="true"
      />
    );
  }
  if (trend === "new") {
    return (
      <span className="text-w-caption font-bold text-it-blue-600 px-1.5 py-0.5 rounded bg-it-blue-50 dark:bg-it-blue-500/15">
        NEW
      </span>
    );
  }
  return (
    <Icon
      name="horizontal_rule"
      className="text-w-body-lg text-it-ink-400 dark:text-rink-500"
      aria-hidden="true"
    />
  );
}

// ─── 추천 상품 카드 ─────────────────────────────────────
//
// 외곽 컨테이너는 `<div role="button">` — `<button>` 으로 감싸면 내부 찜하기 `<button>`
// 과 nesting 위반(`<button> cannot be a descendant of <button>`)이 발생하므로
// 카드는 `div + role/tabIndex/onKeyDown` 으로 키보드 접근성을 유지하며 클릭 가능하게 처리.
function ProductCard({ product }: { product: RecommendProduct }) {
  const { navigate } = useNavigation();

  const goToDetail = () => {
    void navigate(`/products/${product.id}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDetail();
        }
      }}
      aria-label={`${product.brand} ${product.name}`}
      className="flex flex-col bg-it-surface dark:bg-rink-800 rounded-w-md border border-it-line-strong dark:border-rink-700 overflow-hidden text-left active:brightness-95 transition-colors motion-reduce:transition-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500"
    >
      {/* 상품 이미지 영역 */}
      <div className="relative aspect-square bg-it-fill dark:bg-rink-700 flex items-center justify-center">
        <Icon
          name="sports_hockey"
          className="text-4xl text-it-ink-400 dark:text-rink-300"
          aria-hidden="true"
        />
        {/* 찜 버튼 — 카드 클릭과 분리 (stopPropagation) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-w-pill bg-it-surface/80 dark:bg-rink-800/80 flex items-center justify-center"
          aria-label="찜하기"
        >
          <Icon
            name="favorite_border"
            className="text-w-title text-it-ink-400 dark:text-rink-300"
            aria-hidden="true"
          />
        </button>
      </div>
      {/* 상품 정보 */}
      <div className="p-3">
        <span className="text-w-caption text-it-ink-500 dark:text-rink-300">
          {product.brand}
        </span>
        <h3 className="text-w-small font-bold text-it-ink-800 dark:text-white mt-0.5 line-clamp-2 leading-snug">
          {product.name}
        </h3>
        <p className="text-w-body font-bold text-it-ink-800 dark:text-white mt-1.5 tabular-nums">
          {product.price.toLocaleString()}원
        </p>
      </div>
    </div>
  );
}

// ─── 메인 검색 페이지 ───────────────────────────────────
export default function SearchPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { navigate } = useNavigation();
  const inputRef = useRef<HTMLInputElement>(null);
  // 키보드 회피 — 검색 input focus 시 viewport 자동 스크롤 (SCREEN_METRICS §5.4)
  useKeyboardAvoidance();

  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [popularKeywords, setPopularKeywords] = useState<TrendKeyword[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [recommendProducts, setRecommendProducts] =
    useState<RecommendProduct[]>(FALLBACK_PRODUCTS);
  const [isProductsLoading, setIsProductsLoading] = useState(true);

  // Native UI 설정
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: "검색",
    showBottomNav: true,
  });

  // 최근 검색어 로드
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch {
      // 로컬스토리지 접근 실패 시 무시
    }
    setIsReady(true);
  }, []);

  // 인기 검색어 API 로드
  useEffect(() => {
    let cancelled = false;

    async function fetchPopularKeywords() {
      try {
        const response = await api.get<{
          keywords?: PopularKeywordApiItem[];
          items?: PopularKeywordApiItem[];
          data?: PopularKeywordApiItem[];
        }>("/search/popular");

        if (cancelled) return;

        if (response.success && response.data) {
          const raw =
            response.data.keywords ??
            response.data.items ??
            response.data.data ??
            (Array.isArray(response.data) ? response.data : []);
          if (raw.length > 0) {
            setPopularKeywords(
              (raw as PopularKeywordApiItem[]).map((item, idx) => ({
                rank: item.rank ?? idx + 1,
                keyword: item.keyword,
                trend: item.trend ?? "stable",
              })),
            );
          }
        }
      } catch {
        // 네트워크 오류 등으로 인기 검색어 조회 실패 시 빈 배열 유지 (섹션 자동 숨김)
      }
    }

    fetchPopularKeywords();
    return () => {
      cancelled = true;
    };
  }, []);

  // 추천 상품 API 로드 (isFeatured=true)
  useEffect(() => {
    let cancelled = false;

    async function fetchFeaturedProducts() {
      setIsProductsLoading(true);
      try {
        const response = await api.get<{
          products?: ShopProductApiItem[];
          items?: ShopProductApiItem[];
          data?: ShopProductApiItem[];
        }>("/shop/products", {
          params: { isFeatured: "true", limit: "4", page: "1" },
        });

        if (cancelled) return;

        if (response.success && response.data) {
          const data = response.data;
          const items =
            data.products ??
            data.items ??
            data.data ??
            (Array.isArray(data) ? data : []);
          if (items.length > 0) {
            setRecommendProducts(items.map(toRecommendProduct));
          }
          // items.length === 0 이면 FALLBACK_PRODUCTS 유지
        }
      } catch {
        // API 실패 시 폴백 데이터 유지
      } finally {
        if (!cancelled) setIsProductsLoading(false);
      }
    }

    fetchFeaturedProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  // 최근 검색어 저장
  const saveRecentSearch = useCallback((keyword: string) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter((item) => item !== keyword);
      const updated = [keyword, ...filtered].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {
        // 저장 실패 시 무시
      }
      return updated;
    });
  }, []);

  // 최근 검색어 개별 삭제
  const removeRecentSearch = useCallback((keyword: string) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((item) => item !== keyword);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {
        // 삭제 실패 시 무시
      }
      return updated;
    });
  }, []);

  // 최근 검색어 전체 삭제
  const clearAllRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // 삭제 실패 시 무시
    }
  }, []);

  // 검색 실행
  const executeSearch = useCallback(
    (keyword: string) => {
      const trimmed = keyword.trim();
      if (!trimmed) return;
      saveRecentSearch(trimmed);
      navigate(`/search/results?q=${encodeURIComponent(trimmed)}`);
    },
    [navigate, saveRecentSearch],
  );

  // 폼 제출
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      executeSearch(query);
    },
    [query, executeSearch],
  );

  // 입력 초기화
  const handleClear = useCallback(() => {
    setQuery("");
    inputRef.current?.focus();
  }, []);

  // 현재 시각 (인기 검색어 기준시간)
  const now = new Date();
  const timeLabel = `${String(now.getHours()).padStart(2, "0")}:00 기준`;

  if (!isReady) {
    return null;
  }

  return (
    <MobileContainer hasBottomNav>
      {/* 검색 페이지 — 뒤로가기 버튼 노출 (default variant 자동 ← + 타이틀 inline) */}
      <PageAppBar title="검색" forceNative />

      {/* ─── 검색바 ──────────────────────────────── */}
      <div className="sticky top-14 z-40 bg-it-surface dark:bg-it-blue-950 px-4 py-3">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl text-it-ink-500 dark:text-rink-300"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onCompositionStart={() => {
                /* IME 조합 시작 — 자동 검색 방지 */
              }}
              onCompositionEnd={() => {
                /* IME 조합 종료 — submit 은 명시적 사용자 액션 */
              }}
              placeholder="장비, 매치, 팀 등을 입력하세요"
              className={cn(
                "w-full h-11 pl-10 pr-10 rounded-w-pill",
                "bg-it-fill dark:bg-rink-800",
                "border-[1.5px] border-it-line-strong dark:border-rink-700",
                "text-w-small text-it-ink-800 dark:text-white",
                "placeholder-it-ink-400 dark:placeholder-rink-300",
                "focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500",
                "transition-colors motion-reduce:transition-none",
              )}
              autoComplete="off"
              aria-label="검색어 입력"
              enterKeyHint="search"
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-w-pill bg-it-line-strong dark:bg-rink-500 flex items-center justify-center"
                aria-label="검색어 지우기"
              >
                <Icon
                  name="close"
                  className="text-w-caption text-it-ink-500 dark:text-rink-100"
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ─── 본문 — 회색 캔버스 ────────────────────────── */}
      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck">
        <div className="flex flex-col gap-6 px-5 pt-4">
          {/* ─── 최근 검색어 ───────────────────────────── */}
          {recentSearches.length > 0 && (
            <section aria-labelledby="recent-heading">
              <div className="flex items-center justify-between mb-3">
                <h2
                  id="recent-heading"
                  className="text-w-body-lg font-bold text-it-ink-800 dark:text-white"
                >
                  최근 검색어
                </h2>
                <button
                  type="button"
                  onClick={clearAllRecentSearches}
                  className="text-w-caption text-it-blue-600 hover:text-it-blue-700 transition-colors motion-reduce:transition-none"
                >
                  전체 삭제
                </button>
              </div>
              <div
                className="flex flex-wrap gap-2"
                role="list"
                aria-label="최근 검색어 목록"
              >
                {recentSearches.map((keyword) => (
                  <div
                    key={keyword}
                    role="listitem"
                    className="flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-w-pill bg-it-surface dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700"
                  >
                    <button
                      type="button"
                      onClick={() => executeSearch(keyword)}
                      className="text-w-small text-it-ink-700 dark:text-rink-100 hover:text-it-ink-800 dark:hover:text-white transition-colors motion-reduce:transition-none"
                    >
                      {keyword}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRecentSearch(keyword)}
                      className="w-5 h-5 rounded-w-pill flex items-center justify-center hover:bg-it-fill dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
                      aria-label={`${keyword} 삭제`}
                    >
                      <Icon
                        name="close"
                        className="text-w-caption text-it-ink-400 dark:text-rink-300"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── 인기 검색어 ───────────────────────────── */}
          {popularKeywords.length > 0 && (
            <section aria-labelledby="popular-heading">
              <div className="flex items-center justify-between mb-3">
                <h2
                  id="popular-heading"
                  className="text-w-body-lg font-bold text-it-ink-800 dark:text-white"
                >
                  인기 검색어
                </h2>
                <span className="text-w-caption text-it-blue-600 tabular-nums">
                  {timeLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0">
                {popularKeywords.map((item) => (
                  <button
                    key={item.rank}
                    type="button"
                    onClick={() => executeSearch(item.keyword)}
                    className="flex items-center gap-2.5 py-2.5 hover:bg-it-surface dark:hover:bg-rink-800 rounded-lg px-1 transition-colors motion-reduce:transition-none"
                  >
                    <span
                      className={cn(
                        "w-5 text-center text-w-small font-bold tabular-nums",
                        item.rank <= 3
                          ? "text-it-blue-600"
                          : "text-it-ink-400 dark:text-rink-300",
                      )}
                    >
                      {item.rank}
                    </span>
                    <span className="flex-1 text-w-small text-it-ink-700 dark:text-rink-100 text-left truncate">
                      {item.keyword}
                    </span>
                    <TrendIcon trend={item.trend} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ─── 구분선 ──────────────────────────────── */}
          <div className="h-px bg-it-line dark:bg-rink-800" />

          {/* ─── 추천 상품 ───────────────────────────── */}
          <section aria-labelledby="recommend-heading">
            <h2
              id="recommend-heading"
              className="text-w-body-lg font-bold text-it-ink-800 dark:text-white mb-3"
            >
              플레이어를 위한 추천
            </h2>
            {!isProductsLoading && (
              <div className="grid grid-cols-2 gap-3">
                {recommendProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </MobileContainer>
  );
}
