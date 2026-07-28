/**
 * 환불 요청(RefundRequest) 상태 상수 — 서비스 · 탈퇴 가드(withdrawal-guard.util) 공용 SoT.
 */

/** 활성(대기·처리 중·실패 미해소) 상태 집합 — 목록 우선 노출·partial unique index 정합. */
export const REFUND_REQUEST_ACTIVE_STATUSES: string[] = [
  "pending",
  "executing",
  "execution_failed",
];
