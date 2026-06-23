"use client";

/**
 * LoadingSpinner - TEAMPLUS 표준 로딩 컴포넌트
 *
 * === Design 7 Principles ===
 * 1. 화면 분석: 업무관리 전체 화면의 로딩 일관성
 * 2. 휴먼 디자인: Precision Orbital — 3중 동심원 궤도 스피너
 * 3. AI 스타일 금지: gradient, blur 미사용, 단색 기반
 * 4. 색상: Primary #1E3FAE (라이트) / #6384DC (다크) 통일
 */

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { SkeletonBlock } from "@/components/ui/core/SkeletonCore";

// ============================================
// 타입 정의
// ============================================

interface LoadingSpinnerProps {
  /** 로딩 메시지 (기본: "로딩 중...") */
  message?: string;
  /** 스피너 크기 */
  size?: "sm" | "md" | "lg";
  /** 전체 화면 로딩 여부 */
  fullScreen?: boolean;
  /** 최소 높이 (기본: 400px) */
  minHeight?: number;
  /** 추가 클래스 */
  className?: string;
  /** 커스텀 아이콘 (지정 시 기본 스피너 대체) */
  icon?: LucideIcon;
}

interface LoadingOverlayProps {
  /** 로딩 중 여부 */
  isLoading: boolean;
  /** 로딩 메시지 */
  message?: string;
  /** 자식 요소 */
  children: React.ReactNode;
  /** 추가 클래스 */
  className?: string;
}

// ============================================
// 디자인 토큰 — 크기별 치수
// ============================================

const ringConfig = {
  sm: { outer: 28, mid: 17, dot: 7, stroke: 2, text: "text-xs", gap: "mt-2" },
  md: { outer: 44, mid: 28, dot: 11, stroke: 2, text: "text-sm", gap: "mt-3" },
  lg: {
    outer: 60,
    mid: 38,
    dot: 15,
    stroke: 3,
    text: "text-base",
    gap: "mt-4",
  },
};

// ============================================
// CSS 키프레임 (전역 1회 주입)
// ============================================

const ORBITAL_CSS = `
  @keyframes it-cw  { to { transform: rotate(360deg);  } }
  @keyframes it-ccw { to { transform: rotate(-360deg); } }
  @keyframes it-dot {
    0%, 100% { opacity: .2; transform: scale(.55); }
    50%      { opacity: .9; transform: scale(1);   }
  }

  .it-ring-outer { animation: it-cw  1.1s linear      infinite; }
  .it-ring-mid   { animation: it-ccw 1.7s linear      infinite; }
  .it-dot        { animation: it-dot 1.8s ease-in-out infinite; }

  /* 다크모드 컬러 오버라이드 */
  .dark .it-ring-outer {
    border-color:     rgba(99,131,220,.14) !important;
    border-top-color: #6384DC             !important;
  }
  .dark .it-ring-mid {
    border-color:     rgba(99,131,220,.08)    !important;
    border-top-color: rgba(99,131,220,.60)    !important;
  }
  .dark .it-dot { background-color: #6384DC !important; }
`;

// 클라이언트에서 한 번만 주입
let _injected = false;
function injectOrbitalStyles() {
  if (typeof window === "undefined" || _injected) return;
  _injected = true;
  const tag = document.createElement("style");
  tag.id = "teamplus-orbital-spinner";
  tag.textContent = ORBITAL_CSS;
  document.head.appendChild(tag);
}

// ============================================
// OrbitalRing — 핵심 시각 컴포넌트
// ============================================

function OrbitalRing({ size = "md" }: { size: "sm" | "md" | "lg" }) {
  const cfg = ringConfig[size];
  const half = cfg.outer / 2;

  // SSR 이후 클라이언트에서만 스타일 주입
  if (typeof window !== "undefined") injectOrbitalStyles();

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: cfg.outer, height: cfg.outer }}
      aria-hidden="true"
    >
      {/* ① 바깥 링 — 시계 방향, 1.1s */}
      <div
        className="it-ring-outer absolute rounded-full"
        style={{
          inset: 0,
          border: `${cfg.stroke}px solid rgba(30,63,174,.11)`,
          borderTopColor: "#1E3FAE",
        }}
      />

      {/* ② 중간 링 — 반시계 방향, 1.7s */}
      <div
        className="it-ring-mid absolute rounded-full"
        style={{
          width: cfg.mid,
          height: cfg.mid,
          top: half - cfg.mid / 2,
          left: half - cfg.mid / 2,
          border: `${cfg.stroke}px solid rgba(30,63,174,.07)`,
          borderTopColor: "rgba(30,63,174,.52)",
        }}
      />

      {/* ③ 중심 점 — 펄스, 1.8s */}
      <div
        className="it-dot absolute rounded-full"
        style={{
          width: cfg.dot,
          height: cfg.dot,
          top: half - cfg.dot / 2,
          left: half - cfg.dot / 2,
          backgroundColor: "#1E3FAE",
        }}
      />
    </div>
  );
}

// ============================================
// 메인 로딩 스피너 컴포넌트
// ============================================

export function LoadingSpinner({
  message = "로딩 중...",
  size = "md",
  fullScreen = false,
  minHeight = 400,
  className,
  icon: CustomIcon,
}: LoadingSpinnerProps) {
  const cfg = ringConfig[size];

  const containerCls = cn(
    "flex flex-col items-center justify-center gap-0",
    fullScreen ? "fixed inset-0 bg-white/80 dark:bg-slate-900/80 z-50" : "",
    className,
  );

  const containerStyle = !fullScreen
    ? { minHeight: `${minHeight}px` }
    : undefined;

  return (
    <div
      className={containerCls}
      style={containerStyle}
      suppressHydrationWarning
    >
      {/* 스피너 */}
      {CustomIcon ? (
        <CustomIcon
          className={cn(
            "animate-spin text-primary dark:text-primary-light",
            size === "sm"
              ? "w-6 h-6"
              : size === "lg"
                ? "w-14 h-14"
                : "w-10 h-10",
          )}
        />
      ) : (
        <OrbitalRing size={size} />
      )}

      {/* 메시지 */}
      {message && (
        <p
          className={cn(
            "text-slate-500 dark:text-slate-400 font-medium tracking-wide",
            cfg.gap,
            cfg.text,
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}

// ============================================
// 인라인 스피너 (버튼·테이블 내 소형)
// ============================================

interface InlineSpinnerProps {
  size?: "xs" | "sm" | "md";
  className?: string;
}

const inlineDim = {
  xs: { outer: 14, mid: 9, dot: 4, stroke: 1.5 },
  sm: { outer: 18, mid: 11, dot: 5, stroke: 1.5 },
  md: { outer: 22, mid: 14, dot: 6, stroke: 2 },
};

export function InlineSpinner({ size = "sm", className }: InlineSpinnerProps) {
  if (typeof window !== "undefined") injectOrbitalStyles();

  const cfg = inlineDim[size];
  const half = cfg.outer / 2;

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center flex-shrink-0",
        className,
      )}
      style={{ width: cfg.outer, height: cfg.outer }}
      aria-hidden="true"
    >
      <div
        className="it-ring-outer absolute rounded-full"
        style={{
          inset: 0,
          border: `${cfg.stroke}px solid rgba(30,63,174,.11)`,
          borderTopColor: "#1E3FAE",
        }}
      />
      <div
        className="it-ring-mid absolute rounded-full"
        style={{
          width: cfg.mid,
          height: cfg.mid,
          top: half - cfg.mid / 2,
          left: half - cfg.mid / 2,
          border: `${cfg.stroke}px solid rgba(30,63,174,.07)`,
          borderTopColor: "rgba(30,63,174,.5)",
        }}
      />
      <div
        className="it-dot absolute rounded-full"
        style={{
          width: cfg.dot,
          height: cfg.dot,
          top: half - cfg.dot / 2,
          left: half - cfg.dot / 2,
          backgroundColor: "#1E3FAE",
        }}
      />
    </div>
  );
}

// ============================================
// 로딩 오버레이 (콘텐츠 위에 표시)
// ============================================

export function LoadingOverlay({
  isLoading,
  message = "처리 중...",
  children,
  className,
}: LoadingOverlayProps) {
  return (
    <div className={cn("relative", className)}>
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 flex flex-col items-center justify-center gap-3 z-10 rounded-xl">
          <OrbitalRing size="md" />
          {message && (
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wide">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// 스켈레톤 로더 (카드용)
// ============================================

interface SkeletonCardProps {
  count?: number;
  className?: string;
}

export function SkeletonCard({ count = 1, className }: SkeletonCardProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 animate-pulse",
            className,
          )}
        >
          <div className="flex items-center gap-3 mb-4">
            <SkeletonBlock className="w-10 h-10 rounded-lg" />
            <div className="flex-1">
              <SkeletonBlock className="h-4 rounded w-3/4 mb-2" />
              <SkeletonBlock className="h-3 rounded w-1/2" />
            </div>
          </div>
          <div className="space-y-2">
            <SkeletonBlock className="h-3 rounded w-full" />
            <SkeletonBlock className="h-3 rounded w-5/6" />
          </div>
        </div>
      ))}
    </>
  );
}

// ============================================
// 스켈레톤 로더 (테이블용)
// ============================================

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: SkeletonTableProps) {
  return (
    <div className={cn("animate-pulse", className)}>
      <div className="flex gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBlock key={i} className="flex-1 h-4 rounded" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-4 p-4 border-b border-slate-100 dark:border-slate-700"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <SkeletonBlock
              key={colIndex}
              className={cn(
                "flex-1 h-4 rounded",
                colIndex === 0 && "w-2/3",
                colIndex === columns - 1 && "w-1/3",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default LoadingSpinner;
