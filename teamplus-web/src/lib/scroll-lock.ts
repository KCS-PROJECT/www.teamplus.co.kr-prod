/**
 * Scroll Lock Utility - TEAMPLUS Design System
 * 스크롤바 너비를 보존하여 레이아웃 이동(깜박임) 방지
 */

let lockCount = 0;
let originalOverflow: string | null = null;
let originalPaddingRight: string | null = null;
let originalHtmlOverscroll: string | null = null;
let originalBodyOverscroll: string | null = null;

/**
 * 현재 스크롤바 너비를 계산합니다.
 * window.innerWidth와 documentElement.clientWidth의 차이로 계산
 */
function getScrollbarWidth(): number {
  if (typeof document === 'undefined') return 0;
  return window.innerWidth - document.documentElement.clientWidth;
}

/**
 * body 스크롤을 잠급니다.
 * 스크롤바가 사라져도 레이아웃이 이동하지 않도록 padding-right를 추가합니다.
 */
export function lockBodyScroll() {
  if (typeof document === 'undefined') return;

  if (lockCount === 0) {
    const scrollbarWidth = getScrollbarWidth();
    originalOverflow = document.body.style.overflow;
    originalPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = 'hidden';
    // 스크롤바 너비만큼 padding-right 추가하여 레이아웃 이동 방지
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // 모바일 브라우저(Chrome) 당겨서-새로고침 차단 — 루트 스크롤러에만 유효한
    // 속성이라 오버레이가 아닌 html/body 에 걸어야 한다. 잠금 중 body 가
    // overflow:hidden 이 되면 아래 드래그가 루트 overscroll 로 해석되어
    // 배경 페이지 새로고침이 발동하던 문제의 차단 지점.
    originalHtmlOverscroll = document.documentElement.style.overscrollBehaviorY;
    originalBodyOverscroll = document.body.style.overscrollBehaviorY;
    document.documentElement.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';
  }

  lockCount += 1;
}

/**
 * body 스크롤 잠금을 해제합니다.
 * 원래 상태로 복원합니다.
 */
export function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return;

  lockCount -= 1;

  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow || '';
    document.body.style.paddingRight = originalPaddingRight || '';
    document.documentElement.style.overscrollBehaviorY =
      originalHtmlOverscroll || '';
    document.body.style.overscrollBehaviorY = originalBodyOverscroll || '';
    originalOverflow = null;
    originalPaddingRight = null;
    originalHtmlOverscroll = null;
    originalBodyOverscroll = null;
  }
}
