/**
 * 환불 요청(RefundRequest) 상태 상수 — 서비스 · 탈퇴 가드(withdrawal-guard.util) 공용 SoT.
 */

/** 활성(대기·처리 중·실패 미해소) 상태 집합 — 목록 우선 노출·partial unique index 정합. */
export const REFUND_REQUEST_ACTIVE_STATUSES: string[] = [
  "pending",
  "executing",
  "execution_failed",
];

/**
 * PG 취소 결과가 확정되지 않은 실패 코드 집합.
 *
 * 취소가 실제로 처리됐는지 알 수 없으므로 거절(종결)·임의 재호출 대상이 아니다.
 * 해소는 reconcile(운영자 PG 콘솔 확인) 또는 토스 멱등 재시도로만 한다.
 */
export const REFUND_PG_UNCONFIRMED_CODES: string[] = [
  "KG_UNCONFIRMED",
  "TOSS_UNCONFIRMED",
  "TOSS_IDEMPOTENCY_CONFLICT",
];
