import { dateOnlyToString, nowKstParts } from "@/common/utils/kst-date.util";
import {
  PAYOUT_REQUEST_STATUS,
  PAYOUT_REQUEST_STATUS_LABEL,
  isActivePayoutRequestStatus,
  type PayoutRequestStatus,
} from "../constants/payout-request-status.constant";
import { describePayoutCallForOperator } from "../gateway/payout-res-code.util";
import {
  PAYOUT_REVIEW_REASON_LABEL,
  isDuplicateSuspectReason,
  type PayoutReviewReason,
} from "../constants/payout-review.constant";
import { isBeforePayCutoff } from "./nice-pay-date.util";

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
  reviewReason: true,
  reviewedAt: true,
  reviewMemo: true,
  reviewedBy: { select: { firstName: true, lastName: true } },
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
  reviewReason: string | null;
  reviewedAt: Date | null;
  reviewMemo: string | null;
  reviewedBy: { firstName: string | null; lastName: string | null } | null;
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
 * 운영자 확인이 필요한 건 — 지급일이 지났는데 아직 끝나지 않았거나, 결과를 자동으로 짝 맞출 수 없었던 경우.
 * 확인 횟수는 기준이 아니다 — 결과 배치가 하루 여러 번 돌아 정상 건도 횟수가 쌓인다.
 */
export function needsAttention(
  row: Pick<PayoutRequestRow, "status" | "settlementDate" | "needsReview">,
  todayUtcMidnight: Date,
): boolean {
  if (!isActivePayoutRequestStatus(row.status)) return false;
  return (
    row.needsReview || row.settlementDate.getTime() < todayUtcMidnight.getTime()
  );
}

/** 운영자 지급 취소를 막는 이유 — 서버 검사(409 코드)와 목록의 cancelable 이 같은 판정을 쓴다. */
export type PayoutCancelBlock = "NO_REQUEST" | "REVIEW_OPEN" | "CUTOFF_PASSED";

export type PayoutCancelVerdict =
  /** 취소할 수 있다 — 나이스에 보낼 접수번호 */
  { reason: null; niceSeq: string } | { reason: PayoutCancelBlock };

/**
 * 운영자 지급 취소를 막는 이유 — 없으면 reason null 과 접수번호.
 * 나이스 접수번호가 있는 접수 건만(NO_REQUEST), 확인 필요가 아닌 건만(REVIEW_OPEN), 지급일 당일 10:30 전까지(CUTOFF_PASSED). 모드(live)는 화면이 따로 본다.
 */
export function classifyPayoutCancelBlock(
  row: Pick<
    PayoutRequestRow,
    "status" | "niceSeq" | "needsReview" | "settlementDate"
  >,
  now: ReturnType<typeof nowKstParts> = nowKstParts(),
): PayoutCancelVerdict {
  if (row.status !== PAYOUT_REQUEST_STATUS.REQUESTED || row.niceSeq === null) {
    return { reason: "NO_REQUEST" };
  }
  if (row.needsReview) return { reason: "REVIEW_OPEN" };
  if (!isBeforePayCutoff(row.settlementDate, now)) {
    return { reason: "CUTOFF_PASSED" };
  }
  return { reason: null, niceSeq: row.niceSeq };
}

/** 운영자 지급 취소 가능 여부 — classifyPayoutCancelBlock 의 reason 이 null 일 때. */
export function isPayoutRequestCancelable(
  row: Pick<
    PayoutRequestRow,
    "status" | "niceSeq" | "needsReview" | "settlementDate"
  >,
  now: ReturnType<typeof nowKstParts> = nowKstParts(),
): boolean {
  return classifyPayoutCancelBlock(row, now).reason === null;
}

/** ADMIN 전용 — 접수번호·응답 코드·실패 사유를 그대로 드러낸다. */
export function toAdminPayoutRequestView(
  row: PayoutRequestRow,
  todayUtcMidnight: Date,
  now: ReturnType<typeof nowKstParts> = nowKstParts(),
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
    /** needsReview 를 켠 이유(끈 뒤에도 이력으로 남는다) */
    reviewReason: row.reviewReason,
    reviewReasonLabel: row.reviewReason
      ? (PAYOUT_REVIEW_REASON_LABEL[row.reviewReason as PayoutReviewReason] ??
        row.reviewReason)
      : null,
    /** 사유가 돈이 두 번 나갔을 수 있는 것(재요청 중복·이중 지급 의심)인지 — 화면은 이 값으로 빨간 표시를 고른다 */
    duplicateSuspected: isDuplicateSuspectReason(row.reviewReason),
    /** 운영자가 확인 완료한 시각·이름·메모 — 자동으로 꺼진 경우는 모두 null */
    reviewedAt: row.reviewedAt,
    reviewedByName: row.reviewedBy
      ? `${row.reviewedBy.lastName ?? ""}${row.reviewedBy.firstName ?? ""}`.trim() ||
        null
      : null,
    reviewMemo: row.reviewMemo,
    needsAttention: needsAttention(row, todayUtcMidnight),
    /** 지급 처리 중 목록의 [지급 취소] 노출 기준 */
    cancelable: isPayoutRequestCancelable(row, now),
    checkCount: row.checkCount,
    requestedAt: row.requestedAt,
    confirmedAt: row.confirmedAt,
    lastCheckedAt: row.lastCheckedAt,
    teamName: row.teamName,
  };
}
