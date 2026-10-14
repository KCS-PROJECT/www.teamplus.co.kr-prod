import { dateOnlyToString } from "@/common/utils/kst-date.util";
import {
  PAYOUT_CHECK_ATTENTION_COUNT,
  PAYOUT_REQUEST_STATUS_LABEL,
  isActivePayoutRequestStatus,
  type PayoutRequestStatus,
} from "../constants/payout-request-status.constant";
import { describePayoutCallForOperator } from "../gateway/payout-res-code.util";

/** 목록·상세 응답에 싣는 지급 요청 컬럼 — 계좌 스냅샷(암호문)은 싣지 않는다. */
export const PAYOUT_REQUEST_VIEW_SELECT = {
  id: true,
  status: true,
  settlementDate: true,
  amount: true,
  niceSeq: true,
  resCode: true,
  resMsg: true,
  requestError: true,
  niceStatusNm: true,
  errReason: true,
  needsReview: true,
  checkCount: true,
  requestedAt: true,
  confirmedAt: true,
  lastCheckedAt: true,
  teamName: true,
} as const;

export interface PayoutRequestRow {
  id: string;
  status: string;
  settlementDate: Date;
  amount: number;
  niceSeq: string | null;
  resCode: string | null;
  resMsg: string | null;
  requestError: string | null;
  niceStatusNm: string | null;
  errReason: string | null;
  needsReview: boolean;
  checkCount: number;
  requestedAt: Date;
  confirmedAt: Date | null;
  lastCheckedAt: Date | null;
  teamName: string;
}

/** 전 역할 공통 — 진행 중인 요청의 지급 예정일(YYYY-MM-DD). 없으면 null. */
export function payoutScheduledDateOf(
  latest:
    | Pick<PayoutRequestRow, "status" | "settlementDate">
    | null
    | undefined,
): string | null {
  if (!latest || !isActivePayoutRequestStatus(latest.status)) return null;
  return dateOnlyToString(latest.settlementDate);
}

/**
 * 운영자 확인이 필요한 건 — 결과 조회에서 여러 번 "요청"으로 남았거나, 지급일이 지났는데 아직 끝나지 않았거나,
 * 결과를 자동으로 짝 맞출 수 없었던 경우.
 */
export function needsAttention(
  row: Pick<
    PayoutRequestRow,
    "status" | "settlementDate" | "checkCount" | "needsReview"
  >,
  todayUtcMidnight: Date,
): boolean {
  if (!isActivePayoutRequestStatus(row.status)) return false;
  return (
    row.needsReview ||
    row.checkCount >= PAYOUT_CHECK_ATTENTION_COUNT ||
    row.settlementDate.getTime() < todayUtcMidnight.getTime()
  );
}

/** ADMIN 전용 — 접수번호·응답 코드·실패 사유를 그대로 드러낸다. */
export function toAdminPayoutRequestView(
  row: PayoutRequestRow,
  todayUtcMidnight: Date,
) {
  const status = row.status as PayoutRequestStatus;
  const requestDetail =
    row.resCode || row.requestError
      ? describePayoutCallForOperator({
          resCode: row.resCode,
          resMsg: row.resMsg,
          error: row.requestError,
        })
      : null;
  return {
    id: row.id,
    status,
    statusLabel: PAYOUT_REQUEST_STATUS_LABEL[status] ?? status,
    settlementDate: dateOnlyToString(row.settlementDate),
    amount: row.amount,
    niceSeq: row.niceSeq,
    niceStatusNm: row.niceStatusNm,
    /** 지급 요청 호출의 결과 설명(코드·나이스 원문) */
    requestDetail,
    /** 결과 조회가 알려준 실패 사유 */
    errReason: row.errReason,
    needsReview: row.needsReview,
    needsAttention: needsAttention(row, todayUtcMidnight),
    checkCount: row.checkCount,
    requestedAt: row.requestedAt,
    confirmedAt: row.confirmedAt,
    lastCheckedAt: row.lastCheckedAt,
    teamName: row.teamName,
  };
}
