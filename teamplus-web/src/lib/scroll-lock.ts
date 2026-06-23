/**
 * Scroll Lock Utility - TEAMPLUS Design System
 * 스크롤바 너비를 보존하여 레이아웃 이동(깜박임) 방지
 */

let lockCount = 0;
let originalOverflow: string | null = null;
let originalPaddingRight: string | null = null;

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
    originalOverflow = null;
    originalPaddingRight = null;
  }
}
