'use client';

import { useState, useEffect, useCallback, useRef, TouchEvent } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';

/**
 * SwipeBanner Component - TEAMPLUS Design System
 *
 * Design 7 Principles Applied:
 * 1. NO gradient backgrounds - solid colors only
 * 2. NO backdrop-blur effects
 * 3. Human-made design feel
 * 4. Clean, professional appearance
 *
 * Features:
 * - Touch swipe support
 * - Auto-play with pause on interaction
 * - Dot pagination
 * - Accessible (ARIA labels)
 */

export interface BannerSlide {
  id: string;
  tag?: string;
  title: string;
  subtitle?: string;
  buttonText?: string;
  href: string;
  bgColor: string; // Tailwind class (e.g., 'bg-ice-500', 'bg-red-500')
  overlayColor?: string; // Tailwind class for overlay
  textColor?: string; // 'white' | 'dark'
}

interface SwipeBannerProps {
  slides: BannerSlide[];
  autoPlayInterval?: number; // ms, 0 to disable
  transitionDuration?: number; // ms, slide transition speed
  height?: string; // Tailwind class (e.g., 'h-48', 'h-56')
  className?: string;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 컨테이너 둘레를 hairline(it-line)으로 정리하고 tag/버튼을 it-* 토큰으로 교체.
   *   슬라이드 bgColor/overlayColor 는 데이터 구동 골격이라 유지(§3 규칙).
   */
  iceTheme?: boolean;
}

export function SwipeBanner({
  slides,
  autoPlayInterval = 5000,
  transitionDuration = 500,
  height = 'h-48',
  className = '',
  iceTheme = false,
}: SwipeBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(autoPlayInterval > 0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-play logic
  useEffect(() => {
    if (!isAutoPlaying || autoPlayInterval <= 0) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, autoPlayInterval);

    return () => clearInterval(timer);
  }, [isAutoPlaying, autoPlayInterval, slides.length]);

  // Touch handlers
  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsAutoPlaying(false);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swipe left - next
        setCurrentIndex((prev) => (prev + 1) % slides.length);
      } else {
        // Swipe right - prev
        setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
      }
    }

    // Resume auto-play after 5 seconds
    setTimeout(() => setIsAutoPlaying(true), 5000);
  }, [slides.length]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
      }
    },
    [slides.length]
  );

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 5000);
  }, []);

  if (slides.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden ${
        iceTheme
          ? 'rounded-w-md border border-it-line dark:border-it-blue-900'
          : 'rounded-xl'
      } ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="프로모션 배너"
      aria-roledescription="carousel"
    >
      {/* Slides Container */}
      <div
        className="flex transition-transform ease-out"
        style={{
          transform: `translateX(-${currentIndex * 100}%)`,
          transitionDuration: `${transitionDuration}ms`,
        }}
      >
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`relative ${height} w-full flex-shrink-0 ${slide.bgColor} overflow-hidden`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${slides.length}: ${slide.title}`}
            aria-hidden={index !== currentIndex}
          >
            {/* Overlay - Solid color, no gradient */}
            {slide.overlayColor && (
              <div className={`absolute inset-0 ${slide.overlayColor}`} />
            )}

            {/* Content */}
            <div className="absolute bottom-0 left-0 p-5 z-10">
              {slide.tag && (
                <span className="inline-block rounded-md bg-white/30 px-2 py-1 text-xs font-bold uppercase tracking-wider text-white mb-2">
                  {slide.tag}
                </span>
              )}
              <h2
                className={`text-2xl font-bold leading-tight ${
                  slide.textColor === 'dark' ? 'text-wtext-1' : 'text-white'
                }`}
              >
                {slide.title}
              </h2>
              {slide.subtitle && (
                <p
                  className={`mt-1 text-sm ${
                    slide.textColor === 'dark'
                      ? 'text-wtext-2'
                      : 'text-white/80'
                  }`}
                >
                  {slide.subtitle}
                </p>
              )}
              {slide.buttonText && (
                <NavLink
                  href={slide.href}
                  className={`mt-3 inline-flex items-center gap-1 text-sm font-semibold ${
                    slide.textColor === 'dark'
                      ? iceTheme
                        ? 'text-it-blue-500 hover:text-it-blue-600'
                        : 'text-ice-500 hover:text-ice-700'
                      : 'text-white hover:underline'
                  }`}
                  loadingMessage="로딩중..."
                >
                  {slide.buttonText}
                  <Icon name="arrow_forward" className="text-[18px]" />
                </NavLink>
              )}
            </div>

            {/* Decorative Icon */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20">
              <Icon
                name="sports_hockey"
                className={`text-8xl ${
                  slide.textColor === 'dark' ? 'text-wtext-1' : 'text-white'
                }`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Dot Pagination */}
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20"
        role="tablist"
        aria-label="배너 페이지"
      >
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            onClick={() => goToSlide(index)}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === currentIndex
                ? 'w-6 bg-white'
                : 'w-2 bg-white/50 hover:bg-white/70'
            }`}
            role="tab"
            aria-selected={index === currentIndex}
            aria-label={`배너 ${index + 1}`}
          />
        ))}
      </div>

      {/* Navigation Arrows (visible on hover for desktop) */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() =>
              setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length)
            }
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 hidden md:flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
            aria-label="이전 배너"
          >
            <Icon name="chevron_left" className="text-xl" />
          </button>
          <button
            onClick={() =>
              setCurrentIndex((prev) => (prev + 1) % slides.length)
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 hidden md:flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
            aria-label="다음 배너"
          >
            <Icon name="chevron_right" className="text-xl" />
          </button>
        </>
      )}
    </div>
  );
}

export default SwipeBanner;
