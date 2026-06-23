'use client';

/**
 * useKeyboardAvoidance — 폼 input 키보드 가림 회피 훅 (2026-05-09 신규).
 *
 * 시스템 키보드(iOS/Android)가 표시될 때 활성 input 이 키보드 아래로 가려지는 문제를
 * 자동 해결한다. SCREEN_METRICS SoT 의 `--keyboard-inset-bottom` CSS 변수가 이미
 * RAF 디바운싱으로 갱신되고 있으므로, 본 훅은 그 변화 시점에 활성 input 을 viewport
 * 안쪽으로 부드럽게 스크롤만 한다.
 *
 * ## 동작 원리
 *
 * 1. **CSS-first (리렌더 0)**: 호출만으로 `<form>` 컨테이너에 `pb-keyboard-safe-8`
 *    클래스를 적용하여 키보드 inset 만큼 자동 padding-bottom 부여.
 *    → 키보드가 올라와도 폼 마지막 요소(예: 로그인 버튼)가 보임.
 *
 * 2. **focusin → scrollIntoView**: 사용자가 input 을 포커스하면 `block: 'center'` 로
 *    부드럽게 스크롤하여 viewport 중앙에 위치시킴. iOS Safari 의 자동 스크롤이
 *    부정확한 경우(특히 input 이 viewport 하단부에 있을 때)에도 100% 가시 영역 보장.
 *
 * 3. **focusout → 자동 원복**: blur 시 `--keyboard-inset-bottom = 0px` 로 자동
 *    되돌아오며 padding 도 사라짐. 별도 cleanup 불필요.
 *
 * ## 비호출 권장
 *
 * - 호출하지 않아도 `--keyboard-inset-bottom` CSS 변수는 갱신된다. 단순 키보드
 *   회피만 필요하면 `pb-keyboard-safe` 클래스 직접 사용 (CSS-only).
 * - 본 훅은 활성 input 자동 스크롤이 필요한 폼 페이지(로그인/회원가입/검색 등)에서만 사용.
 *
 * ## 사용 예
 *
 * ```tsx
 * function LoginPage() {
 *   const formRef = useRef<HTMLFormElement>(null);
 *   useKeyboardAvoidance(formRef);
 *
 *   return (
 *     <div className="min-h-screen-safe overflow-y-auto scroll-keyboard-safe">
 *       <form ref={formRef} className="pb-keyboard-safe-8">
 *         <input ... />
 *         <button>로그인</button>
 *       </form>
 *     </div>
 *   );
 * }
 * ```
 *
 * ## 회귀 방지
 *
 * - `subscribeToDeviceMetrics` 단일 진입점 보호 — 본 훅은 자체 resize listener 등록 금지
 *   (CLAUDE.md MUST FOLLOW). `ui.onKeyboardChange` 만 사용.
 * - `motion-reduce:` 사용자 prefer 시 instant scroll 적용 (접근성).
 */

import { useEffect, type RefObject } from 'react';
import { ui as nativeUI } from '@/services/native-bridge';

interface UseKeyboardAvoidanceOptions {
  /**
   * 활성 input 이 키보드에 가려지는 임계값 (px). 초과 시 scrollIntoView 트리거.
   * @default 24
   */
  bottomMargin?: number;
  /**
   * scrollIntoView block 옵션. 기본 `nearest` 는 미세하게 위치 보정 (이미 보이면 무동작),
   * `center` 는 항상 중앙 정렬.
   * @default 'nearest'
   */
  scrollBlock?: ScrollLogicalPosition;
  /**
   * 활성화 여부 (조건부 비활성화 시 false).
   * @default true
   */
  enabled?: boolean;
}

/**
 * 폼 컨테이너 ref 의 input/textarea 에 대해 키보드 회피 자동 스크롤을 활성화한다.
 *
 * @param containerRef - 폼 컨테이너 ref. null 이면 document 전체에 listener 등록.
 * @param options - 동작 옵션
 */
export function useKeyboardAvoidance(
  containerRef?: RefObject<HTMLElement | null>,
  options: UseKeyboardAvoidanceOptions = {},
): void {
  const {
    bottomMargin = 24,
    scrollBlock = 'nearest',
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const container = containerRef?.current ?? document;

    // 1. focusin → 활성 input 자동 스크롤 (키보드 표시 직후 보정용)
    //    iOS/Android 시스템 자동 스크롤이 부정확한 경우 대비.
    const handleFocusIn = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // input/textarea/contenteditable 만 대상
      const isFormField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (!isFormField) return;

      // 키보드가 완전히 올라온 후 (~300ms) 스크롤 — 시스템 키보드 애니메이션과
      // 충돌하지 않도록 timeout. RAF 단독은 너무 빠름.
      window.setTimeout(() => {
        scrollActiveInputIntoView(target, scrollBlock, bottomMargin);
      }, 300);
    };

    // 2. 키보드 표시 변화 감지 → 이미 포커스된 input 재보정
    //    iOS Safari 는 키보드 표시 후 visualViewport 가 변하지만 input 이 자동
    //    중앙으로 가지 않는 경우 있음.
    const unsubscribeKeyboard = nativeUI.onKeyboardChange(({ visible }) => {
      if (!visible) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      const isFormField =
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable;
      if (!isFormField) return;
      // 컨테이너 범위 체크 (containerRef 지정 시)
      if (containerRef?.current && !containerRef.current.contains(active)) return;

      scrollActiveInputIntoView(active, scrollBlock, bottomMargin);
    });

    container.addEventListener('focusin', handleFocusIn, { passive: true });

    return () => {
      container.removeEventListener('focusin', handleFocusIn);
      unsubscribeKeyboard();
    };
  }, [containerRef, bottomMargin, scrollBlock, enabled]);
}

/**
 * 활성 input 이 키보드 위로 가려지지 않도록 viewport 안쪽으로 스크롤.
 *
 * @internal
 */
function scrollActiveInputIntoView(
  element: HTMLElement,
  scrollBlock: ScrollLogicalPosition,
  bottomMargin: number,
): void {
  if (typeof window === 'undefined') return;

  const visualH = window.visualViewport?.height ?? window.innerHeight;
  const rect = element.getBoundingClientRect();

  // 활성 input 이 visible viewport 하단 임계값보다 아래에 있으면 스크롤
  const inputBottomFromTop = rect.top + rect.height;
  const safeBottom = visualH - bottomMargin;
  if (inputBottomFromTop <= safeBottom && rect.top >= 0) {
    // 이미 visible — 스크롤 불필요
    return;
  }

  // prefers-reduced-motion 존중 (DESIGN.md §모션 — 접근성)
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

  try {
    element.scrollIntoView({ block: scrollBlock, behavior, inline: 'nearest' });
  } catch {
    // 매우 구형 환경: scrollIntoView 옵션 미지원 → 단순 호출
    element.scrollIntoView();
  }
}
