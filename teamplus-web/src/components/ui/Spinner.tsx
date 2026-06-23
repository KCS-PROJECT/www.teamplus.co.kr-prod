"use client";

import { memo, useEffect, useRef, useState, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";

/**
 * Spinner Component - TEAMPLUS Design System
 *
 * Design 7 Principles Applied:
 * 1. ✅ 원형 디자인 - 심플한 원형 스피너
 * 2. ✅ 화면 중앙 배치 - fixed + inset-0 + flex center
 * 3. ✅ 클릭 완전 차단 - pointer-events-none + overlay
 * 4. ✅ AI 스타일 금지 - NO gradient, NO backdrop-blur
 * 5. ✅ Solid colors only - Primary Blue (#1E3FAE)
 */

type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface SpinnerProps {
  size?: SpinnerSize;
  color?: "primary" | "white" | "slate";
  className?: string;
}

const sizeMap: Record<SpinnerSize, string> = {
  xs: "w-4 h-4",
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-12 h-12",
  xl: "w-16 h-16",
};

const strokeWidthMap: Record<SpinnerSize, number> = {
  xs: 4,
  sm: 4,
  md: 3,
  lg: 3,
  xl: 2.5,
};

const colorMap = {
  primary: {
    track: "stroke-primary/20 dark:stroke-primary/30",
    spinner: "stroke-primary",
  },
  white: {
    track: "stroke-white/20",
    spinner: "stroke-white",
  },
  slate: {
    track: "stroke-slate-200 dark:stroke-slate-700",
    spinner: "stroke-slate-600 dark:stroke-slate-300",
  },
};

/**
 * 기본 원형 스피너
 * - 심플한 원형 디자인
 * - 부드러운 회전 애니메이션
 */
export const Spinner = memo(function Spinner({
  size = "md",
  color = "primary",
  className,
}: SpinnerProps) {
  const sizeClass = sizeMap[size];
  const strokeWidth = strokeWidthMap[size];
  const colors = colorMap[color];

  return (
    <div
      className={cn(sizeClass, "relative", className)}
      role="status"
      aria-label="로딩 중"
    >
      <svg
        className="w-full h-full animate-spin"
        viewBox="0 0 50 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 배경 원 (트랙) */}
        <circle
          className={colors.track}
          cx="25"
          cy="25"
          r="20"
          fill="none"
          strokeWidth={strokeWidth}
        />
        {/* 회전하는 호 */}
        <circle
          className={colors.spinner}
          cx="25"
          cy="25"
          r="20"
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray="80 200"
          strokeDashoffset="0"
        />
      </svg>
      <span className="sr-only">로딩 중</span>
    </div>
  );
});

/**
 * FullScreenLoader - 전체 화면 로딩 오버레이
 *
 * 핵심 기능:
 * 1. 화면 정중앙에 원형 스피너 표시
 * 2. 모든 메뉴/버튼 클릭 완전 차단
 * 3. 스크롤 방지
 * 4. 로딩 중 Header/BottomNav 자동 숨김 (Native 앱에서도 동일)
 *
 * 사용법:
 * {isLoading && <FullScreenLoader />}
 */
interface FullScreenLoaderProps {
  message?: string;
  showMessage?: boolean;
  className?: string;
}

/**
 * 풀스크린 로딩 — 단순 Spinner + Safe Area 전체 커버 (2026-05-07 v3).
 * (구) LoadingPuck 일원화 → 단순 Spinner 회귀 → 사용자 추가 보고:
 *      "Status Bar / Bottom Safe Area / Home Indicator Area 까지 전부 가려져야 함"
 *      → iOS 노치·Dynamic Island·홈 인디케이터 영역까지 풀스크린 배경이 확장되도록
 *        viewport units(100vw/100dvh) + safe-area-inset 음수 외곽 + 양수 padding
 *        조합으로 "배경은 끝까지, 컨텐츠는 안전 영역 안" 패턴 구현.
 *
 * 핵심 동작:
 *   1. position: fixed; inset: 0; + 100vw/100dvh + 음수 inset(safe-area-inset-*)
 *      → viewport-fit=cover 환경에서 노치/홈 인디케이터 영역까지 배경 확장
 *   2. padding: env(safe-area-inset-*) → 컨텐츠(스피너/메시지)는 안전 영역 안 정중앙
 *   3. z-[9999] — Header/BottomNav/모달 등 모든 UI 위에 표시
 *   4. 모든 클릭/터치 stopPropagation — 메뉴/버튼 차단
 *   5. lockBodyScroll — 스크롤 잠금
 *   6. style jsx global — header / 메인 네비게이션 / iOS safe area BottomNav 자체
 *      자동 숨김 (잔여 그림자/보더 제거)
 *   7. AI 스타일 금지 (DESIGN.md §2-1) — gradient/blur/colored shadow 0
 */
export const FullScreenLoader = memo(function FullScreenLoader({
  message,
  showMessage = true,
  className,
}: FullScreenLoaderProps) {
  useEffect(() => {
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, []);

  return (
    <>
      {/* Header / BottomNav 및 잔여 시스템 UI 영역 자동 숨김 — 풀스크린 로더 공용 패턴 */}
      <style jsx global>{`
        header,
        nav[aria-label="메인 네비게이션"] {
          display: none !important;
        }
      `}</style>

      <div
        className={cn(
          "fixed inset-0 z-[9999]",
          "flex flex-col items-center justify-center gap-4 overflow-hidden",
          "bg-wbg dark:bg-puck",
          className,
        )}
        style={{
          // ── 배경 영역: viewport 전체 강제 (viewport-fit=cover 가 layout.tsx 에
          //    이미 설정되어 fixed inset-0 가 safe area 영역까지 확장됨). 일부
          //    Android WebView 가 100vh 를 안전영역 제외 값으로 보고하는 케이스를
          //    방어하기 위해 100dvh(dynamic) 사용 + 100vw 로 가로도 강제.
          width: '100vw',
          minHeight: '100dvh',
          // ── 컨텐츠는 안전 영역 안 정중앙 (스피너/메시지가 노치/홈 인디케이터에
          //    가리지 않도록). flex justify-center + items-center 가 padding-box
          //    기준 중앙 정렬되어 시각적으로 화면 정중앙에 위치.
          paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))',
          paddingRight: 'var(--safe-area-inset-right, env(safe-area-inset-right, 0px))',
          paddingBottom: 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))',
          paddingLeft: 'var(--safe-area-inset-left, env(safe-area-inset-left, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        role="alert"
        aria-busy="true"
        aria-live="assertive"
        aria-label={message ?? "로딩 중"}
      >
        <Spinner size="xl" color="primary" />
        {showMessage && message && (
          <p className="text-[14px] font-medium tracking-tight text-wtext-2 dark:text-rink-100">
            {message}
          </p>
        )}
      </div>
    </>
  );
});

/**
 * OverlayLoader - 특정 영역 위에 로딩 표시
 *
 * 부모 요소에 position: relative 필요
 * 해당 영역 내 클릭 차단
 */
interface OverlayLoaderProps {
  message?: string;
  className?: string;
}

export const OverlayLoader = memo(function OverlayLoader({
  message,
  className,
}: OverlayLoaderProps) {
  return (
    <div
      className={cn(
        // 부모 요소 기준 전체 커버
        "absolute inset-0",
        // 높은 z-index
        "z-50",
        // 중앙 배치
        "flex flex-col items-center justify-center gap-3",
        // Design 7: NO backdrop-blur, semi-transparent solid background
        "bg-white/95 dark:bg-rink-900/95",
        className,
      )}
      // 클릭 이벤트 차단
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      role="alert"
      aria-busy="true"
    >
      <Spinner size="lg" color="primary" />
      {message && (
        <p className="text-sm font-medium text-wtext-2 dark:text-rink-100">
          {message}
        </p>
      )}
    </div>
  );
});

/**
 * LoadingCore - 내부 로딩 컴포넌트
 */
interface LoadingCoreProps {
  className?: string;
  icon: ReactNode;
  label?: string;
  labelClassName?: string;
  size?: "sm" | "md" | "lg";
}

function LoadingCore({
  className = "",
  icon,
  label,
  labelClassName = "",
}: LoadingCoreProps) {
  return (
    <div className={className}>
      {icon}
      {label && <span className={labelClassName}>{label}</span>}
    </div>
  );
}

/**
 * InlineLoader - 인라인 로딩
 * 버튼 내부나 텍스트 옆에 사용
 */
interface InlineLoaderProps {
  text?: string;
  size?: SpinnerSize;
  color?: SpinnerProps["color"];
  className?: string;
}

export const InlineLoader = memo(function InlineLoader({
  text = "처리 중...",
  size = "sm",
  color = "primary",
  className,
}: InlineLoaderProps) {
  return (
    <LoadingCore
      className={cn("inline-flex items-center gap-2", className)}
      icon={<Spinner size={size} color={color} />}
      label={text}
      labelClassName={cn(
        "text-sm font-medium",
        color === "white" ? "text-white" : "text-wtext-2 dark:text-rink-100",
      )}
      size={size === "xs" ? "sm" : size === "lg" || size === "xl" ? "lg" : "md"}
    />
  );
});

/**
 * NavigationLoader - 상단 프로그레스 바
 * 토스/카카오 스타일: 빠르게 시작 → 느리게 증가 → 완료 시 fade-out
 */
interface NavigationLoaderProps {
  isLoading?: boolean;
  className?: string;
}

export const NavigationLoader = memo(function NavigationLoader({
  isLoading = true,
  className,
}: NavigationLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLoading) {
      setProgress(15); // 즉시 15%에서 시작 (바가 보이도록)
      setVisible(true);

      // 빠른 시작 → 점차 느리게
      let current = 15;
      intervalRef.current = setInterval(() => {
        current += current < 40 ? 6 : current < 70 ? 3 : current < 85 ? 1 : 0.3;
        if (current > 95) current = 95;
        setProgress(current);
      }, 120);
    } else {
      // 완료: 100%로 채우고 fade-out
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);
      const fadeTimer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(fadeTimer);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLoading]);

  if (!visible && !isLoading) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[9999]",
        "h-[3px]",
        "transition-opacity duration-300",
        !isLoading && progress >= 100 ? "opacity-0" : "opacity-100",
        className,
      )}
      role="progressbar"
      aria-label="페이지 로딩 중"
      aria-valuenow={Math.round(progress)}
    >
      <div
        className="h-full bg-ice-500 rounded-r-full relative overflow-hidden"
        style={{
          width: `${progress}%`,
          transition: isLoading
            ? "width 150ms ease-out"
            : "width 200ms ease-in",
        }}
      >
        <div className="absolute inset-0 bg-white/30 dark:bg-white/20 motion-reduce:hidden" />
      </div>
    </div>
  );
});

// 이전 버전 호환성을 위한 alias
export const PageLoader = FullScreenLoader;

export default Spinner;
