"use client";

/**
 * LoadingRing (L2) — 결제·인증 등 신중한 작업 로딩
 *
 * 디자인 원본: app_screen_00/_ _ _offline_.html (babel_08.js `LoadingRingScreen` 라인 72-133)
 *
 * 라이트/다크 모드 (2026-04-29 — LOADING_THEME_SPEC §S1):
 * - **라이트**: 밝은 톤 표면 + primary 액센트 회전 링
 * - **다크**: #0e1726 솔리드 (NEW_DESIGN_ROLLOUT_PHASE2_SPEC §2.2 의도 보존)
 * - LoadingPuck 패턴(dark:hidden / hidden dark:flex) 듀얼 표면 적용
 */

import { memo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";

export interface LoadingRingProps {
  /** 메인 타이틀 — 기본: "결제 처리 중" */
  title?: string;
  /** 부제 (본문) — 기본: "페이지를 닫지 마세요" */
  message?: string;
  /** SSL 알약 표시 여부 — 기본: true */
  showSSLBadge?: boolean;
  className?: string;
}

const DARK_BG = "#0e1726";

export const LoadingRing = memo(function LoadingRing({
  title = "결제 처리 중",
  message = "페이지를 닫지 마세요",
  showSSLBadge = true,
  className,
}: LoadingRingProps) {
  // 스크롤 잠금 (FullScreenLoader 동일 패턴)
  useEffect(() => {
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, []);

  return (
    <>
      {/* Header / BottomNav 숨김 — 기존 FullScreenLoader 패턴 유지 */}
      <style jsx global>{`
        header,
        nav[aria-label="메인 네비게이션"] {
          display: none !important;
        }
      `}</style>

      {/* 라이트 모드 표면 */}
      <div
        data-loading-ring
        className={cn(
          "fixed inset-0 z-[9999]",
          "flex flex-col items-center justify-center overflow-hidden",
          "opacity-100",
          "dark:hidden bg-wbg",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        role="alert"
        aria-busy="true"
        aria-live="assertive"
        aria-label={title}
      >
        <RingBody title={title} message={message} showSSLBadge={showSSLBadge} />
      </div>

      {/* 다크 모드 표면 */}
      <div
        data-loading-ring
        className={cn(
          "fixed inset-0 z-[9999]",
          "flex-col items-center justify-center overflow-hidden",
          "opacity-100",
          "hidden dark:flex",
          className,
        )}
        style={{ background: DARK_BG }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        role="alert"
        aria-busy="true"
        aria-live="assertive"
        aria-label={title}
      >
        <RingBody
          title={title}
          message={message}
          showSSLBadge={showSSLBadge}
          dark
        />
      </div>
    </>
  );
});

// ─── 내부: 본문 (라이트/다크 공용) ────────────────────────────────────
interface RingBodyProps {
  title: string;
  message: string;
  showSSLBadge: boolean;
  dark?: boolean;
}

function RingBody({
  title,
  message,
  showSSLBadge,
  dark = false,
}: RingBodyProps) {
  return (
    <>
      {/* 상단 안전결제 미니 배지 (border + shadow 로 격상) */}
      <div className="absolute left-0 right-0 top-[88px] flex items-center justify-center">
        <div
          className="flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5"
          style={{
            background: dark ? "#1e293b" : "#ffffff",
            borderColor: dark ? "#334155" : "#dbe4f5",
            boxShadow: dark ? "none" : "0 1px 2px rgba(15,23,42,0.04)",
          }}
        >
          <div
            aria-hidden
            className="flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              background: "#1f47e6",
            }}
          >
            <span className="text-[12px] font-extrabold text-white">P</span>
          </div>
          <span
            className={cn(
              "text-[13px] font-bold tracking-tight",
              dark ? "text-white" : "text-wtext-2",
            )}
          >
            안전결제
          </span>
        </div>
      </div>

      {/* 가운데 로더 */}
      <div
        className="relative z-10 flex flex-col items-center"
        style={{ gap: 28, transform: 'translate3d(0, 0, 0)', willChange: 'transform' }}
      >
        <RingLoaderArt dark={dark} />
        <div className="flex flex-col items-center gap-2.5">
          <div
            className={cn(
              "text-[18px] font-bold tracking-tight",
              dark ? "text-white" : "text-wtext-1",
            )}
          >
            {title}
          </div>
          <div
            className={cn(
              "text-[13px] tracking-tight",
              dark ? "text-wtext-4" : "text-wtext-3",
            )}
          >
            {message}
          </div>
        </div>
      </div>

      {/* 하단 SSL 알약 + 예상 시간 안내 */}
      {showSSLBadge && (
        <div className="absolute bottom-16 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-full border px-4 py-2.5"
            style={{
              background: dark ? "#1e293b" : "#eef4ff",
              borderColor: dark ? "#334155" : "#c4d4ff",
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden
            >
              <path
                d="M3 6.5V5a4 4 0 018 0v1.5M2.5 6.5h9v6h-9z"
                stroke={dark ? "#cbd5e1" : "#1E3FAE"}
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
            </svg>
            <span
              className={cn(
                "text-[12px] font-semibold",
                dark ? "text-wtext-4" : "text-wtext-3",
              )}
            >
              SSL 256-bit 암호화 통신
            </span>
          </div>
          <span
            className={cn(
              "text-[11px] tracking-tight",
              dark ? "text-wtext-3" : "text-wtext-3",
            )}
          >
            평균 5~10초 소요됩니다
          </span>
        </div>
      )}
    </>
  );
}

// ─── 내부: 링 로더 아트워크 ──────────────────────────────────────────
/**
 * RingLoaderArt — 96x96 회전 링 + 중앙 자물쇠 카드
 * - 회전 링: stroke 3, dasharray 70/240, 1.6s linear
 * - 라이트: 트랙(#d6e0ff) + 회전 호(#1E3FAE primary)
 * - 다크: 트랙(#334155) + 회전 호(#ffffff)
 * - 중앙 36x36 카드 안쪽에 자물쇠 SVG (결제 신뢰성 강조)
 */
function RingLoaderArt({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className="relative"
      style={{
        width: 96,
        height: 96,
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
        transformOrigin: '50% 50%',
      }}
    >
      <svg
        viewBox="0 0 96 96"
        width={96}
        height={96}
        className="absolute inset-0 animate-loading-ring-rotate"
        style={{ transformOrigin: "50% 50%", willChange: "transform" }}
        aria-hidden
      >
        {/* 트랙 */}
        <circle
          cx={48}
          cy={48}
          r={40}
          fill="none"
          stroke={dark ? "#334155" : "#d6e0ff"}
          strokeWidth={3}
        />
        {/* 회전 호 */}
        <circle
          cx={48}
          cy={48}
          r={40}
          fill="none"
          stroke={dark ? "#ffffff" : "#1E3FAE"}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="70 240"
        />
      </svg>

      {/* 중앙 자물쇠 카드 (정지) */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center"
      >
        <div
          className="flex items-center justify-center rounded-full border"
          style={{
            width: 38,
            height: 38,
            background: dark ? "#1e293b" : "#ffffff",
            borderColor: dark ? "#334155" : "#dbe4f5",
            boxShadow: dark ? "none" : "0 1px 2px rgba(15,23,42,0.06)",
            transform: 'translate3d(0, 0, 0)',
            willChange: 'transform',
          }}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 7V5a4 4 0 018 0v2M3.5 7h9v7h-9z"
              stroke={dark ? "#cbd5e1" : "#1E3FAE"}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            <circle
              cx={8}
              cy={10.5}
              r={1}
              fill={dark ? "#cbd5e1" : "#1E3FAE"}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default LoadingRing;
