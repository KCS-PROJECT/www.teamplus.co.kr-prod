/**
 * 정산 카드/요약 공용 포매터 — 팀 허브(director-payments) · 오픈클래스(academy) 정산 탭 공유.
 *
 * director-payments 에 인라인이던 헬퍼를 공유 모듈로 추출(양쪽 재사용). 동작 100% 동일.
 */

/** 금액을 ko-KR 천단위 구분 문자열로 변환. */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount);
}

/** stagger 진입 지연 (DESIGN §6.5 — interval 40ms / cap 280ms). */
export function staggerDelay(i: number): string {
  return `${Math.min(i * 40, 280)}ms`;
}

/** 'YYYY-MM' 을 delta 개월 이동한 'YYYY-MM' 반환. */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
