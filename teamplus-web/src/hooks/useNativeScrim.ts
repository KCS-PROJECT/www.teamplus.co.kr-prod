"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/environment";
import { ui } from "@/services/native-bridge";

/**
 * Flutter 네이티브 safe area(Status Bar / Home Indicator / Navigation Bar)
 * 전 영역을 dim 처리하는 공통 훅.
 *
 * WebView 내부 CSS backdrop(bg-black/40 등)은 viewport 까지만 덮어
 * iOS 노치·홈 인디케이터·Android 네비게이션 바 영역이 밝게 남는 시각적 분리 문제가 있다.
 *
 * iOS 제약:
 *   · SystemUiOverlayStyle 의 statusBarColor / systemNavigationBarColor 필드는 iOS 에서 무시됨
 *   · Scaffold.backgroundColor 반투명 지정은 InAppWebView 합성 충돌로 비활성화 상태
 *
 * → 네이티브 Stack 위 IgnorePointer Container(showScrim) 방식이 iOS/Android 공통 유일 해법.
 *   팝업·모달·바텀시트 등 모든 오버레이 UI 에서 열릴 때 호출하여 일관된 dim 을 제공한다.
 *
 * 동시에 `document.body` 에 `data-modal-open="true"` 마커를 토글하여 "오버레이 열림"
 * 전역 상태를 노출한다(native/web 공통, isNativeApp 가드 밖).
 * [2026-05-30 v3] 종전에는 이 마커로 BottomNav 에 `::after` dim 을 덧그렸으나, 모든
 *   오버레이가 이미 풀스크린 backdrop 으로 BottomNav 를 덮어 이중 dim 이 되던 문제로
 *   해당 CSS 를 제거했다. 마커 자체는 일반 상태 신호로 유지(향후 활용 가능).
 *
 * BottomSheet 모드 (`options.bottom = false`):
 *   BottomSheet 는 화면 하단(home indicator 영역 포함)까지 카드가 차지하므로
 *   하단 native scrim 을 그리면 BottomSheet 카드 위에 dim 이 덮여 사용자에게는
 *   "BottomSheet 하단만 어둡게" 보이는 시각 버그가 발생한다(2026-05-16 사건).
 *   Sheet 패턴은 `bottom: false` 로 호출하여 상단 status bar 영역만 dim 처리한다.
 *
 * @param isOpen 모달/팝업 열림 상태
 * @param scrimColor AARRGGBB 형식 컬러 (기본: rink-900/55 = '#8C141826' — 웹
 *                   `.overlay-fullscreen-dim` 과 동일 톤. SoT)
 * @param options.bottom 하단 home indicator/system nav 영역 dim 여부 (기본 true).
 *                        BottomSheet 류 컴포넌트는 false 로 설정.
 *                        SoT: docs/Design/MODAL_DIM_POLICY.md
 */
// [수정 2026-05-30] 기본 scrim 색을 웹 `.overlay-fullscreen-dim`(rink-900/55)과 통일.
//   종전 slate-950/70 색은 hue·alpha 가 모두 달라 네이티브 safe-area 가 본문
//   dim 과 다른 색으로 보이던 불일치 원인. SoT: SPEC_POPUP_FULLSCREEN_DIM.md §2.4
const DEFAULT_SCRIM_COLOR = "#8C141826";

export interface UseNativeScrimOptions {
  /** 하단 home indicator/system nav 영역 dim 여부. BottomSheet 류는 false 권장. */
  bottom?: boolean;
  /** 하단 home indicator/system nav 영역만 별도 색상으로 칠해야 할 때 사용. */
  bottomColor?: string;
}
const MODAL_OPEN_COUNT_KEY = "__teamplusModalOpenCount";

interface ModalOpenWindow extends Window {
  [MODAL_OPEN_COUNT_KEY]?: number;
}

function incrementModalOpen(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const w = window as ModalOpenWindow;
  const next = (w[MODAL_OPEN_COUNT_KEY] ?? 0) + 1;
  w[MODAL_OPEN_COUNT_KEY] = next;
  document.body.setAttribute("data-modal-open", "true");
}

function decrementModalOpen(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const w = window as ModalOpenWindow;
  const next = Math.max(0, (w[MODAL_OPEN_COUNT_KEY] ?? 0) - 1);
  w[MODAL_OPEN_COUNT_KEY] = next;
  if (next === 0) document.body.removeAttribute("data-modal-open");
}

export function useNativeScrim(
  isOpen: boolean,
  scrimColor: string = DEFAULT_SCRIM_COLOR,
  options: UseNativeScrimOptions = {},
): void {
  const { bottom = true, bottomColor } = options;

  // Web 측 BottomNav dim 신호 — native/web 환경 모두 동작
  useEffect(() => {
    if (!isOpen) return;
    incrementModalOpen();
    return decrementModalOpen;
  }, [isOpen]);

  // Flutter Native scrim 호출 — iOS notch/Home Indicator/Android NavBar 영역 dim
  useEffect(() => {
    if (!isOpen || !isNativeApp()) return;

    void ui.setConfig({
      showScrim: true,
      scrimColor,
      scrimBottomColor: bottomColor,
      scrimBottom: bottom,
    });

    return () => {
      void ui.setConfig({ showScrim: false });
    };
  }, [isOpen, scrimColor, bottom, bottomColor]);
}
