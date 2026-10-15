/**
 * SettlementPayoutRequest.reviewReason 값 SoT — 결과 조회가 요청에 needsReview(운영자 확인 필요)를 켜는 이유.
 *   MATCH_AMBIGUOUS      : 응답을 못 받은 요청의 결과 행이 여러 건이라 어느 것이 우리 건인지 가릴 수 없음
 *   UNKNOWN_STATUS       : 나이스가 모르는 상태값을 돌려줌
 *   REOPENED_IN_PROGRESS : 실패로 닫은 건이 나이스 화면 재요청으로 다시 진행 중
 *   REOPENED_DUPLICATE   : 실패로 닫은 건이 재요청으로 성공했는데 정산은 이미 다른 경로로 끝남(이중 지급 의심)
 *   DUPLICATE_SUCCESS    : 같은 팀에 같은 지급일 성공이 2건 이상이거나, 성공 반영 때 정산이 이미 paid(이중 지급 의심)
 *   AMOUNT_MISMATCH      : 접수번호는 우리 것인데 나이스 금액이 요청 금액과 다름
 * needsReview 가 켜진 요청이 하나라도 있는 정산은 지급 요청·수동 완료가 막힌다. 운영자가 메모를 적고 확인 완료하면 풀린다.
 * 팀플러스 밖에서 올린 지급(우리 요청 행이 없는 접수번호)은 기록할 행이 없어 서버 경고 로그로만 남긴다 — 운영 규칙(콘솔 지급 금지)이 막는다.
 */
export const PAYOUT_REVIEW_REASON = {
  MATCH_AMBIGUOUS: "MATCH_AMBIGUOUS",
  UNKNOWN_STATUS: "UNKNOWN_STATUS",
  REOPENED_IN_PROGRESS: "REOPENED_IN_PROGRESS",
  REOPENED_DUPLICATE: "REOPENED_DUPLICATE",
  DUPLICATE_SUCCESS: "DUPLICATE_SUCCESS",
  AMOUNT_MISMATCH: "AMOUNT_MISMATCH",
} as const;

export type PayoutReviewReason =
  (typeof PAYOUT_REVIEW_REASON)[keyof typeof PAYOUT_REVIEW_REASON];

export const PAYOUT_REVIEW_REASON_LABEL: Readonly<
  Record<PayoutReviewReason, string>
> = {
  MATCH_AMBIGUOUS: "결과 짝 맞추기 불가",
  UNKNOWN_STATUS: "알 수 없는 나이스 상태",
  REOPENED_IN_PROGRESS: "실패 건이 나이스에서 다시 진행 중",
  REOPENED_DUPLICATE: "재요청 중복 지급 의심",
  DUPLICATE_SUCCESS: "이중 지급 의심",
  AMOUNT_MISMATCH: "금액 불일치",
};

/** 돈이 두 번 나갔을 수 있는 사유 — 목록에 "이중 지급 의심"으로 표시한다. */
export const DUPLICATE_SUSPECT_REVIEW_REASONS: readonly PayoutReviewReason[] = [
  PAYOUT_REVIEW_REASON.REOPENED_DUPLICATE,
  PAYOUT_REVIEW_REASON.DUPLICATE_SUCCESS,
];

export function isDuplicateSuspectReason(reason: string | null): boolean {
  return (
    reason !== null &&
    (DUPLICATE_SUSPECT_REVIEW_REASONS as readonly string[]).includes(reason)
  );
}

export const PAYOUT_REVIEW_MEMO_MAX = 500;
