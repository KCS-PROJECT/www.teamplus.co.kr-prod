/**
 * SettlementPayoutRequest.status 값 SoT — 나이스 지급 요청 1건의 생애.
 *   REQUESTING  : 정산을 processing 으로 잡고 나이스를 부르는 중(60초 넘게 남아 있으면 서버가 도중에 멈춘 것 → UNCONFIRMED 취급)
 *   REQUESTED   : 나이스가 접수(0000·seq 받음). 지급일 결과 조회를 기다린다
 *   UNCONFIRMED : 응답을 못 받았거나 나이스 내부 오류 — 접수됐는지 모른다. 재전송하지 않고 결과 조회로만 확정한다
 *   SUCCEEDED   : 결과 조회 "성공" → 정산 paid
 *   FAILED      : 결과 조회 "실패" → 정산 failed(운영자가 지급일을 바꿔 재요청)
 *   REJECTED    : 요청 자체가 확정 거절(1001 비영업일·1103 중복 등) 또는 우리 설정 결함 → 정산 approved 복귀
 *   CANCELLED   : 나이스 화면에서 삭제됨("삭제") → 정산 approved 복귀
 *   NOT_FOUND   : 지급일이 지났는데 결과 목록에 없음(접수되지 않은 것) → 정산 approved 복귀
 */
export const PAYOUT_REQUEST_STATUS = {
  REQUESTING: "REQUESTING",
  REQUESTED: "REQUESTED",
  UNCONFIRMED: "UNCONFIRMED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  NOT_FOUND: "NOT_FOUND",
} as const;

export type PayoutRequestStatus =
  (typeof PAYOUT_REQUEST_STATUS)[keyof typeof PAYOUT_REQUEST_STATUS];

/** 아직 끝나지 않은 요청 — DB 부분 유니크 인덱스(정산당 1건)의 조건과 같아야 한다. */
export const ACTIVE_PAYOUT_REQUEST_STATUSES: readonly PayoutRequestStatus[] = [
  PAYOUT_REQUEST_STATUS.REQUESTING,
  PAYOUT_REQUEST_STATUS.REQUESTED,
  PAYOUT_REQUEST_STATUS.UNCONFIRMED,
];

export function isActivePayoutRequestStatus(status: string): boolean {
  return (ACTIVE_PAYOUT_REQUEST_STATUSES as readonly string[]).includes(status);
}

/**
 * REQUESTING 이 이보다 오래 남아 있으면 요청 중 서버가 멈춘 것으로 본다.
 * 게이트웨이 타임아웃(10초)과 반영 트랜잭션보다 충분히 길다.
 */
export const PAYOUT_REQUESTING_STALE_MS = 60_000;

/** 결과 조회 statusNm(나이스 원문) → 요청 상태. 모르는 값은 pending 으로 두고 운영자 확인을 켠다. */
export type PayoutResultKind =
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "PENDING"
  | "UNKNOWN";

export function classifyNiceStatusNm(statusNm: string): PayoutResultKind {
  const v = statusNm.replace(/\s+/g, "");
  if (v === "성공") return "SUCCEEDED";
  if (v === "실패") return "FAILED";
  if (v === "삭제") return "CANCELLED";
  if (v === "요청" || v.startsWith("재요청")) return "PENDING";
  return "UNKNOWN";
}

/** 운영자 화면용 상태 설명. */
export const PAYOUT_REQUEST_STATUS_LABEL: Readonly<
  Record<PayoutRequestStatus, string>
> = {
  REQUESTING: "요청 중",
  REQUESTED: "접수됨",
  UNCONFIRMED: "접수 확인 필요",
  SUCCEEDED: "지급 완료",
  FAILED: "지급 실패",
  REJECTED: "요청 거절",
  CANCELLED: "나이스에서 삭제",
  NOT_FOUND: "접수되지 않음",
};
