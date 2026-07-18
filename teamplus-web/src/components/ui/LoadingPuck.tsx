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
import { acquireSpinnerNativeChrome } from "@/services/spinner-native-chrome";

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

  // v22 (2026-07-18) 사용자 직접 지시 — 풀사이즈 스피너 표시 중 appstatus 숨김.
  // LoadingContext 미경유 표면(페이지/레이아웃 자체 LoadingPuck — 콜드 부트 인증 체크,
  // suppressNextLoad 탭 전환 등)도 컴포넌트 mount 로 일원 커버. unmount 시 페이지 의도
  // config 복원 (spinner-native-chrome.ts SoT — skip 경로/비-native 는 내부에서 no-op).
  useEffect(() => acquireSpinnerNativeChrome(), []);

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
          // 2026-07-18 사용자 지시: 스피너 배경 순백 통일 (appstatus 스트립과 한 색)
          "dark:hidden bg-white",
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
// 수정: padding 제거. 배경은 inset:0 + bg-white/bg-puck 가 풀스크린 커버,
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
 * PuckLoaderArt — [ICETIMES DS 2026-07-18] 올드버전 디자인 시스템
 * `components/feedback/LoadingPuck.jsx` 1:1 적용 (96×96 기준):
 * 1. 아이스 halo: inset 10 · ice-50 원 · tp-halo-pulse 2.8s sine (호흡)
 * 2. 회전 arc 링: r-40 · ice-500 4px round cap — 트랙 없음(arc 단독) · 회전 1s
 * 3. 퍽 본체: 30×13 · r-7 · rink-900 + 화이트 인셋 하이라이트 ·
 *    tp-puck-bob 2.2s (squash & stretch — origin 50% 100% 바닥 피벗)
 * 4. 그림자: 32×6 · rgba(20,24,38,.3) · tp-puck-shadow 2.2s (축소·페이드 동기화)
 *
 * 유지되는 구현 디테일 (DS 는 시각 스펙, 아래는 안정성 레이어):
 * - SMIL <animateTransform> 회전 (iOS Low Power/GPUProcess IdleExit 에서도 지속)
 * - 인라인 base transform translate3d(-50%,0,0) fallback (keyframe 정지 시 정렬 보존)
 * - 다크 모드 변형 (DS 는 라이트 전용 — halo rink-800 · arc ice-300 매핑)
 */
function PuckLoaderArt({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className="relative"
      style={{
        width: 96,
        height: 96,
        transform: 'translate3d(0, 0, 0)',
        transformOrigin: '50% 50%',
      }}
    >
      {/* 아이스 halo — DS: inset 10 · ice-50 · tp-halo-pulse */}
      <div
        aria-hidden
        className={cn(
          "absolute rounded-full animate-loading-halo-pulse",
          dark ? "bg-rink-800" : "bg-ice-50",
        )}
        style={{
          inset: 10,
          willChange: "transform, opacity",
          backfaceVisibility: "hidden",
        }}
      />
      {/* 회전 arc 링 — DS: 트랙 없음 · ice-500 · 회전 1s(tp-spin) + tp-puck-arc 2.8s.
          SMIL <animateTransform> 은 iOS Low Power Mode 에서도 회전이 지속되는
          기존 안정성 레이어 — DS 의 tp-spin 1s linear 를 SMIL dur 로 반영. */}
      <svg
        viewBox="0 0 96 96"
        width={96}
        height={96}
        className="absolute inset-0"
        aria-hidden
      >
        <g>
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            from="0 48 48"
            to="360 48 48"
            dur="1s"
            repeatCount="indefinite"
          />
          {/* 활성 호 — strokeDasharray 인라인 fallback (CSS 멈춰도 호 형태 유지) +
              animate-puck-arc (20 251→120 251→20 251 — DS tp-puck-arc 동일값) */}
          <circle
            cx={48}
            cy={48}
            r={40}
            fill="none"
            stroke={dark ? "#85a8ff" : "#2f5fff"}
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
      {/* 퍽 (떠오름) — DS: 30×13 · r-7 · bottom 26 · rink-900 + 화이트 인셋.
          origin 50% 100% (바닥 피벗) 로 squash & stretch 가 빙판에 붙어 보임.
          인라인 base transform 은 keyframe 정지 시 정렬 fallback (2026-05-11 교훈). */}
      <div
        aria-hidden
        className="absolute animate-puck-bob"
        style={{
          left: "50%",
          bottom: 26,
          width: 30,
          height: 13,
          borderRadius: 7,
          background: "#141826",
          boxShadow:
            "inset 0 -3px 0 rgba(255,255,255,0.14), inset 0 2px 0 rgba(255,255,255,0.06)",
          transform: "translate3d(-50%, 0, 0)",
          transformOrigin: "50% 100%",
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      />
      {/* 그림자 — DS: 32×6 · bottom 21 · rgba(20,24,38,.3) · tp-puck-shadow 동기화 */}
      <div
        aria-hidden
        className="absolute animate-puck-shadow"
        style={{
          left: "50%",
          bottom: 21,
          width: 32,
          height: 6,
          borderRadius: "50%",
          background: dark ? "rgba(0,0,0,0.5)" : "rgba(20,24,38,0.3)",
          transform: "translate3d(-50%, 0, 0)",
          transformOrigin: "50% 50%",
          willChange: "transform, opacity",
          backfaceVisibility: "hidden",
        }}
      />
    </div>
  );
}

export default LoadingPuck;
