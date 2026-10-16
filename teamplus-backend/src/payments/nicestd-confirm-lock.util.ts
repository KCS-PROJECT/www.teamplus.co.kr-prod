/**
 * 나이스 구모듈 승인(confirm) 처리 중 잠금 키 — 승인 처리가 시작될 때 잡고 끝나면 푼다.
 *  키가 있으면 그 주문은 지금 승인 호출 중이므로, 같은 주문을 대체하는 새 결제 시작은
 *  막아야 승인 도중 취소로 결제가 연결을 잃지 않는다.
 */
export function niceStdConfirmLockKey(orderNumber: string): string {
  return `nicestd:confirm:${orderNumber}`;
}
