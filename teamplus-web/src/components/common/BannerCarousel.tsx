"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { api } from "@/services/api-client";
import { resolveImageSrc } from "@/lib/image-url";

interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string | null;
  linkType: "none" | "internal" | "external";
  sortOrder: number;
  displayLocations?: string[];
  displayLocationsJson?: string;
}

// ============================================================
// 캐시 레이어 1: 인메모리 (5분 TTL, 탭 세션 동안 유지)
// 캐시 레이어 2: localStorage (오프라인 폴백, 만료 없음)
// ============================================================
const bannerCache = new Map<string, { data: Banner[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5분
const LS_KEY_PREFIX = "teamplus_banners_";

function readLocalCache(role: string): Banner[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY_PREFIX + role);
    if (!raw) return null;
    return JSON.parse(raw) as Banner[];
  } catch {
    return null;
  }
}

function writeLocalCache(role: string, data: Banner[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY_PREFIX + role, JSON.stringify(data));
  } catch {
    // localStorage quota 초과 등 무시
  }
}

// C-1: javascript: 프로토콜 주입 차단
function isSafeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^(https?:\/\/|\/)/.test(url);
}

interface BannerCarouselProps {
  role: "PARENT" | "COACH" | "TEEN" | "CHILD" | "DIRECTOR" | "ADMIN";
  position?: "top" | "middle" | "bottom";
  className?: string;
  /**
   * 우측 하단 카운터(예: `2/5`) 노출 여부. 기본 true.
   * - 코치 메인 대시보드는 false (사용자 요구사항).
   */
  showCounter?: boolean;
  /**
   * [개선 2026-05-16] CHILD variant — WCAG AAA 어린이 UI 대응.
   *   · autoplay 3000ms → 5000ms (4-7세 시선 추적 여유 확보)
   *   · counter / indicator dot 18px+ 가독성 (text-card-meta-child)
   *   · indicator dot 6px → 10px (터치/시인성 강화)
   * 미지정 시 'default' — 기존 동작 유지.
   */
  variant?: "default" | "child";
}

export default function BannerCarousel({
  role,
  position,
  className = "",
  showCounter = true,
  variant = "default",
}: BannerCarouselProps) {
  const isChild = variant === "child";
  // [개선 2026-05-16] CHILD variant — autoplay 5000ms (어린이 시선 추적 여유).
  const autoplayMs = isChild ? 5000 : 3000;
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const loadBanners = useCallback(async () => {
    const cacheKey = position ? `${role}_${position}` : role;
    // L1: 인메모리 캐시 히트 → 즉시 반환 (API 호출 없음)
    const cached = bannerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setBanners(cached.data);
      setIsLoading(false);
      return;
    }

    try {
      const params: Record<string, string | boolean> = { role, isActive: true };
      if (position) params.displayLocation = position;
      const res = await api.get<Banner[]>("/app/banners", { params });
      if (res.success && Array.isArray(res.data)) {
        // 위치 필터 (서버 필터 미지원 시 클라이언트 폴백)
        let filtered = res.data;
        if (position) {
          filtered = res.data.filter((b) => {
            const locs =
              b.displayLocations ??
              (b.displayLocationsJson
                ? (() => {
                    try {
                      return JSON.parse(b.displayLocationsJson as string);
                    } catch {
                      return [];
                    }
                  })()
                : []);
            return locs.length === 0 || locs.includes(position);
          });
        }
        bannerCache.set(cacheKey, { data: filtered, timestamp: Date.now() });
        writeLocalCache(cacheKey, filtered);
        setBanners(filtered);
      } else {
        setBanners([]);
      }
    } catch {
      const offline = readLocalCache(position ? `${role}_${position}` : role);
      setBanners(offline ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [role, position]);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  // Auto-slide — default 3s / child 5s (WCAG AAA — 어린이 시선 추적 여유)
  useEffect(() => {
    if (banners.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, autoplayMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [banners.length, autoplayMs]);

  // Touch swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    // Pause auto-slide during touch
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const handleTouchEnd = useCallback(() => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // swipe left -> next
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      } else {
        // swipe right -> prev
        setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
      }
    }
    // Resume auto-slide — variant 별 autoplayMs 적용
    if (banners.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      }, autoplayMs);
    }
  }, [banners.length, autoplayMs]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  // 다음 슬라이드 이미지 Prefetch — 브라우저 캐시에 미리 적재
  useEffect(() => {
    if (banners.length <= 1 || typeof window === "undefined") return;
    const nextIndex = (currentIndex + 1) % banners.length;
    const nextBanner = banners[nextIndex];
    if (nextBanner?.imageUrl) {
      const img = new window.Image();
      img.src = nextBanner.imageUrl;
    }
  }, [currentIndex, banners]);

  // No banners -> render nothing
  if (!isLoading && banners.length === 0) return null;

  // Loading state -> render nothing
  if (isLoading) return null;

  const banner = banners[currentIndex];
  if (!banner) return null;

  const bannerImage = (
    <div
      className={`relative aspect-[25/9] overflow-hidden rounded-xl bg-wline-2 dark:bg-rink-800 ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-roledescription="carousel"
      aria-label="promotional banners"
    >
      {resolveImageSrc(banner.imageUrl) && !imgErrors[banner.id] ? (
        // next/image 는 런타임 외부 호스트를 허용하지 않고, 백엔드 `/uploads/...` 상대 경로는
        // 페이지 호스트로 잘못 해석되므로 일반 img + resolveImageSrc 절대화로 통일.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveImageSrc(banner.imageUrl)}
          alt={banner.title}
          className="absolute inset-0 h-full w-full object-cover"
          loading={currentIndex === 0 ? "eager" : "lazy"}
          onError={() =>
            setImgErrors((prev) => ({ ...prev, [banner.id]: true }))
          }
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/placeholder.svg"
          alt={banner.title}
          className="absolute inset-0 h-full w-full object-cover"
          loading={currentIndex === 0 ? "eager" : "lazy"}
        />
      )}
      {/* Indicator dots — CHILD: WCAG AAA 가독성 강화 (10px dot, gap 확대) */}
      {banners.length > 1 && (
        <div
          className={`absolute bottom-2 left-1/2 -translate-x-1/2 flex ${isChild ? "gap-2" : "gap-1.5"}`}
        >
          {banners.map((banner, i) => (
            <button
              key={banner.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentIndex(i);
              }}
              className={
                isChild
                  ? `h-2.5 rounded-full transition-all ${i === currentIndex ? "w-6 bg-white" : "w-2.5 bg-white/70"}`
                  : `h-1.5 rounded-full transition-all ${i === currentIndex ? "w-4 bg-white" : "w-1.5 bg-white/60"}`
              }
              aria-label={`${i + 1}/${banners.length} ${banners[i]?.title ?? ""}`}
            ></button>
          ))}
        </div>
      )}
      {/* Counter badge — coach 메인은 showCounter=false 로 숨김. CHILD: 18px+ 가독성. */}
      {showCounter && banners.length > 1 && (
        <div
          className={
            isChild
              ? "absolute bottom-2 right-2 px-2.5 py-1 rounded-full bg-black/40 text-white text-card-title-child font-bold tabular-nums"
              : "absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/40 text-white text-[10px] font-medium tabular-nums"
          }
        >
          {currentIndex + 1}/{banners.length}
        </div>
      )}
    </div>
  );

  // Wrap with link based on linkType (C-1: isSafeUrl 검증)
  if (
    banner.linkUrl &&
    isSafeUrl(banner.linkUrl) &&
    banner.linkType === "internal"
  ) {
    return (
      <Link href={banner.linkUrl} scroll={false}>
        {bannerImage}
      </Link>
    );
  }
  if (
    banner.linkUrl &&
    isSafeUrl(banner.linkUrl) &&
    banner.linkType === "external"
  ) {
    return (
      <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer">
        {bannerImage}
      </a>
    );
  }
  return bannerImage;
}
