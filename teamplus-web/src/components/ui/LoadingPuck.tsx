"use client";

/**
 * LoadingPuck (L1) — 페이지 전환 로딩 (기본)
 *
 * 디자인 원본: app_screen_00/_ _ _offline_.html (babel_08.js `LoadingPuckScreen` 라인 9-68)
 *
 * 핵심 기능:
 * 1. 화면 정중앙에 퍽 로더 + 타이틀/부제 표시
 * 2. 모든 클릭/터치 차단 (`stopPropagation`)
 * 3. 스크롤 잠금 (`lockBodyScroll`)
 * 4. Header / BottomNav 자동 숨김 (기존 FullScreenLoader 패턴 유지)
 */

import { memo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";

export interface LoadingPuckProps {
  /**
   * (deprecated) 시각적 텍스트는 더 이상 표시하지 않습니다.
   * 단일 fullsize 팝업 정책에 따라 "이동중 → 로딩중" 등 단계 변화를 보이지 않도록
   * 그래픽(puck + ring + rink)만 렌더합니다.
   * prop 자체는 호환성을 위해 남겨두지만 무시됩니다.
   */
  title?: string;
  /** (deprecated) — 동상. 렌더되지 않습니다. */
  message?: string;
  className?: string;
}

export const LoadingPuck = memo(function LoadingPuck({
  className,
}: LoadingPuckProps) {
  // 스크롤 잠금 (FullScreenLoader 동일 패턴)
  useEffect(() => {
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, []);

  return (
    <>
      {/*
        [v17 anti-flicker, 2026-05-17] 기존엔 <header>, BottomNav 를
        `display: none !important` 로 강제 숨겼으나, 로더 fade-out 동안 LoadingPuck 은
        아직 mount 상태 → 스타일이 살아있음 → 페이드 완료 후 unmount 되는 시점에
        display:none → display:flex 로 헤더가 "팝" 하고 갑자기 나타나면서 사용자가
        "확확 나오는" 깜빡임으로 인지하는 회귀 발생.

        해결: 로더가 이미 `position: fixed; inset: 0; z-index: 9999` 로 전체 화면을
        덮으므로 추가 display:none 은 불필요. 헤더/BottomNav 는 자연스럽게 로더 아래
        가려진 상태로 유지되며, 로더 fade-out 시 opacity 1→0 와 함께 점진적으로
        드러나 jarring snap 없이 부드럽게 등장.

        a11y: 로더의 role="alert" + aria-busy="true" + aria-live="assertive" 로
        스크린리더에 로딩 상태가 충분히 전달되므로 헤더 가시성을 추가로 차단할 필요 없음.
      */}

      {/* 라이트 모드 표면 */}
      <div
        data-loading-puck
        className={cn(
          "fixed inset-0 z-[9999]",
          "flex flex-col items-center justify-center overflow-hidden",
          "opacity-100",
          "dark:hidden bg-wbg",
          className,
        )}
        style={fullScreenSurfaceStyle}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label="로딩 중"
      >
        <PuckBody />
      </div>

      {/* 다크 모드 표면 */}
      <div
        data-loading-puck
        className={cn(
          "fixed inset-0 z-[9999]",
          "flex-col items-center justify-center overflow-hidden",
          "opacity-100",
          "hidden dark:flex bg-puck",
          className,
        )}
        style={fullScreenSurfaceStyle}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label="로딩 중"
      >
        <PuckBody dark />
      </div>
    </>
  );
});

// ─── 풀스크린 표면 공통 style ────────────────────────────────────────
// (2026-05-07 v8) Android Chrome toolbar 자동 표시/숨김에 따른 visualViewport
// 변동으로 인한 "스피너 위/아래/좌우 흔들림" 방어 + Status Bar / Home Indicator
// safe area 영역까지 동일 배경 확장.
//
// (2026-05-20 v9 — 사용자 직접 지시) "fullsize 팝업 화면에서 스피너 부분이
// 아래 위치하다가 위로 올라가는 현상" 회귀 수정. 원인: 컨테이너에 적용된
// `padding: var(--safe-area-inset-*)` 가 Native Bridge 응답 (`applyDeviceInsetsToCss`,
// native-bridge.ts:2735-2744) 전후로 값이 변하면서 flex `justify-center` 기준
// 콘텐츠 위치가 재계산 → iOS 노치 기기에서 약 20~24px 위로 점프.
//   · 초기 (globals.css:163-167): paddingTop=env(safe-area-inset-top, 0px)
//       ≈ 47px (iOS notch), paddingBottom=max(16px, env(...))
//   · Bridge 응답 후: paddingTop=0 (Flutter Scaffold 가 status bar 예약),
//       paddingBottom=24~34px (실제 디바이스)
//   · 차이만큼 flex center 가 위로 이동 → 사용자 인지 jank.
// 수정: padding 제거. 배경은 inset:0 + bg-wbg/bg-puck 가 풀스크린 커버,
//       콘텐츠(PuckBody ≈ 250×196px)는 viewport 정중앙 → 노치·홈 인디케이터
//       어느 것과도 겹치지 않음 (콘텐츠 크기 작음). safe-area 변수 변화에
//       콘텐츠 위치 무관 → 시프트 0.
//
// 핵심:
//   1. width: 100vw / height: 100lvh
//      - 100lvh = "Large Viewport Height" (toolbar 숨겨진 상태 기준 일관)
//      - 100dvh(dynamic) 사용 시 Android Chrome toolbar 슬라이드에 따라 박스
//        크기가 미세 변동 → flex 정중앙 컨텐츠 위치도 따라 흔들림 → 사용자
//        체감 jank. 100lvh 는 변동 무관 일관 → 컨텐츠 위치 안정.
//   2. transform: translateZ(0)
//      - GPU 레이어 promote → flex 컨텐츠 재배치 시 sub-pixel jitter 방지.
const fullScreenSurfaceStyle: React.CSSProperties = {
  width: '100vw',
  height: '100lvh',
  transform: 'translateZ(0)',
};

// ─── 내부: 본문 (라이트/다크 공용) ────────────────────────────────────
// v18 (2026-05-22): 텍스트 렌더 완전 제거.
//   사용자 직접 지시 — "fullsize 팝업 하나만, 어떤 화면도 추가되어서는 안 됨".
//   기존엔 title/message 가 표시되어 popstate("이동 중...") ↔ navigate("로딩중...") 의
//   문구 변화가 두 화면처럼 인지됐고, 폰트 미로드 시 텍스트가 `?` 박스로 노출되는
//   잔상이 발생. 그래픽(로고 + 퍽 + 링)만 표시하여 단계 변화 시각적으로 불가능.
//   a11y 는 컨테이너의 role="status" + aria-label="로딩 중" 으로 1회 전달.
interface PuckBodyProps {
  dark?: boolean;
}

function PuckBody({ dark = false }: PuckBodyProps) {
  // 로고/워드마크(상단)·"로딩중..." 문구(하단) 제거 — 퍽 스피너만 화면 정중앙에 표시.
  //   a11y 는 컨테이너의 role="status" + aria-label="로딩 중" 으로 전달된다.
  return (
    <div
      className="relative z-10 flex flex-col items-center"
      style={{ transform: 'translate3d(0, 0, 0)' }}
    >
      <PuckLoaderArt dark={dark} />
    </div>
  );
}

// ─── 내부: 퍽 로더 아트워크 ──────────────────────────────────────────
/**
 * PuckLoaderArt — 회전 링 + 떠오르는 퍽 + 빙판 표면
 * 96x96 컨테이너, 다층 구성으로 깊이감 강화:
 * 1. 빙판 베이스: 단색 토큰 표면
 * 2. 빙판 표면 라인 3개 (퍽 아래 미세 점선)
 * 3. 동기화된 그림자 (puckShadow keyframe — 퍽 떠오름에 맞춰 축소·페이드)
 * 4. 퍽 본체 (48x16, puckBob keyframe)
 * 5. 회전 링 (4px stroke + 12시 강조점)
 */
function PuckLoaderArt({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className="relative"
      style={{
        width: 96,
        height: 96,
        transform: 'translate3d(0, 0, 0)',
        // v16 (2026-05-16 T9): will-change 제거 — 컨테이너 자체는 transform 변경 없음.
        //   내부 puck-bob/shadow 자식 요소가 개별 transform 애니메이션 보유 →
        //   해당 자식에만 will-change: transform 명시 (이미 적용됨).
        transformOrigin: '50% 50%',
      }}
    >
      {/* 빙판 베이스 */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-full",
          dark ? "bg-rink-800" : "bg-wline-2",
        )}
      />
      {/* 빙판 표면 라인 (점선 3개) */}
      <svg
        viewBox="0 0 96 96"
        width={96}
        height={96}
        className="absolute inset-0"
        aria-hidden
      >
        <line
          x1={20}
          y1={62}
          x2={76}
          y2={62}
          stroke={dark ? "#3a4358" : "#cfd9ee"}
          strokeWidth={0.6}
          strokeDasharray="2 3"
          opacity={0.65}
        />
        <line
          x1={24}
          y1={68}
          x2={72}
          y2={68}
          stroke={dark ? "#3a4358" : "#cfd9ee"}
          strokeWidth={0.6}
          strokeDasharray="2 3"
          opacity={0.5}
        />
        <line
          x1={28}
          y1={74}
          x2={68}
          y2={74}
          stroke={dark ? "#3a4358" : "#cfd9ee"}
          strokeWidth={0.6}
          strokeDasharray="2 3"
          opacity={0.35}
        />
      </svg>
      {/* 빙판 셰도우 (퍽 떠오름에 동기화)
          2026-05-11: iOS Low Power Mode / GPUProcess IdleExit / prefers-reduced-motion 환경
          에서 CSS keyframe 이 일시 정지될 때, keyframe 의 transform 안에 base 정렬값
          `translateX(-50%)` 가 포함되어 있어 정렬이 깨졌다. 인라인 base transform 으로
          fallback 보장 (keyframe 이 작동하면 인라인 transform 을 자동 override). */}
      <div
        aria-hidden
        className="absolute animate-puck-shadow"
        style={{
          left: "50%",
          bottom: 8,
          width: 60,
          height: 8,
          borderRadius: 999,
          background: dark ? "#1a2030" : "#cdd9ee",
          filter: "blur(1px)",
          transform: "translate3d(-50%, 0, 0)",
          transformOrigin: "50% 50%",
          willChange: "transform, opacity",
          backfaceVisibility: "hidden",
        }}
      />
      {/* 퍽 (떠오름) — 동일 fallback 적용 */}
      <div
        aria-hidden
        className="absolute animate-puck-bob"
        style={{
          left: "50%",
          bottom: 8,
          width: 48,
          height: 16,
          borderRadius: 999,
          background: "#141826",
          boxShadow: dark
            ? "0 3px 6px rgba(0,0,0,0.65), inset 0 1px 0 #475569"
            : "0 3px 6px rgba(15,23,42,0.22), inset 0 1px 0 #475569",
          transform: "translate3d(-50%, 0, 0)",
          transformOrigin: "50% 50%",
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      />
      {/* 회전 링 — v6 (2026-05-11): SMIL <animateTransform> 으로 회전 강제 보장.
            v5 의 `animate-spin` (CSS transform rotate) 은 다음 iOS 환경에서 일시
            정지되는 케이스가 보고됨:
              - Low Power Mode 활성 시 WebKit 이 일부 CSS animation 을 정지
              - GPUProcess IdleExit 직후 (메모리 압박 회복)
              - 시스템 "동작 줄임(Reduce Motion)" 활성
            → SMIL `<animateTransform>` 은 SVG native 라 위 상황에서도 항상 작동.
            CSS `animate-puck-arc` (호 길이 변화) 는 보너스로 유지하되, 인라인 fallback
            `strokeDasharray="60 252"` 를 두어 CSS animation 정지 시에도 호 형태 보존.
            WCAG 2.2.2 의 "필수 활동(로딩)" 예외에 따라 SMIL 은 reduce-motion 무관 회전. */}
      <svg
        viewBox="0 0 96 96"
        width={96}
        height={96}
        className="absolute inset-0"
        aria-hidden
      >
        {/* 트랙 */}
        <circle
          cx={48}
          cy={48}
          r={40}
          fill="none"
          stroke={dark ? "#2a3247" : "#dbe6ff"}
          strokeWidth={4}
        />
        {/* 회전 그룹 — SMIL <animateTransform> 으로 group 단위 등속 회전.
            v16 (2026-05-16 T9): dur 1.8s → 1.4s.
              60fps 환경에서 1.2~1.5s 범위가 시각적 부드러움 최적 (rotation 1°당 ≈ 6.5ms).
              SMIL 의 기본 calcMode 는 linear 라 회전이 일정 속도 — 등속 보장. */}
        <g>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            from="0 48 48"
            to="360 48 48"
            dur="1.4s"
            repeatCount="indefinite"
          />
          {/* 활성 호 — strokeDasharray 인라인 fallback (CSS 멈춰도 호 형태 유지) +
              animate-puck-arc 작동 시 길이 변화 보너스 */}
          <circle
            cx={48}
            cy={48}
            r={40}
            fill="none"
            stroke={dark ? "#85a8ff" : "#1E3FAE"}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray="60 252"
            className="animate-puck-arc"
            style={{
              willChange: "stroke-dasharray, stroke-dashoffset",
            }}
          />
        </g>
      </svg>
    </div>
  );
}

export default LoadingPuck;
