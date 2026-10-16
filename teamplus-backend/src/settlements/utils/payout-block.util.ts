import type { TeamSettlementAccountStatus } from "@prisma/client";
import {
  SETTLEMENT_STATUS,
  type SettlementStatus,
} from "../constants/settlement-status.constant";
import {
  classifyPayoutFileAccount,
  isSubMallRegistrationInProgress,
  type PayoutFileExclusion,
} from "./nice-account-state.util";

/** 지급 요청을 받을 수 있는 정산 상태 — 지급 예정(approved)과 지급 실패 뒤 재요청(failed). */
export const PAYABLE_STATUSES: readonly SettlementStatus[] = [
  SETTLEMENT_STATUS.APPROVED,
  SETTLEMENT_STATUS.FAILED,
];

/** 정산 한 건만 보고 알 수 있는 지급 요청 불가 사유 — 요청 순간에만 아는 사유(계좌·정산 변경, 나이스 재확인 실패)는 빠진다. */
export type PayoutBlockReason =
  | PayoutFileExclusion
  | "NOT_PAYABLE_STATUS"
  | "PAYOUT_IN_PROGRESS"
  | "NET_NOT_POSITIVE"
  | "PAYOUT_REVIEW_OPEN"
  | "PAYOUT_REVIEW_REOPENED";

export interface PayoutBlockInput {
  status: string;
  netAmount: number;
  /** 확인 필요 사유가 실패 건의 나이스 재진행인 요청이 있음 — 확인 완료로 풀리지 않아 안내가 다르다 */
  reviewReopened: boolean;
  /** 운영자 확인이 필요한 요청이 있음(상태 무관) */
  reviewOpen: boolean;
  account: {
    status: TeamSettlementAccountStatus;
    subMallId: string | null;
    registrationInProgress: boolean;
  } | null;
}

/** 팀 정산 계좌 행 → 판정 입력. 지급 요청·목록·지급 엑셀이 같은 "등록 처리 중" 기준을 쓰게 한 곳에 둔다. */
export function toPayoutAccountInput(
  account: {
    status: TeamSettlementAccountStatus;
    subMallId: string | null;
    registrationStartedAt: Date | null;
  } | null,
): PayoutBlockInput["account"] {
  if (!account) return null;
  return {
    status: account.status,
    subMallId: account.subMallId,
    registrationInProgress: isSubMallRegistrationInProgress(
      account.registrationStartedAt,
    ),
  };
}

export type PayoutBlockVerdict =
  | { reason: null; subMallId: string }
  | { reason: PayoutBlockReason };

/**
 * 지금 이 정산을 나이스에 지급 요청할 수 있는지 — 지급 요청(claim)과 목록의 "요청 불가" 구분이 같은 판정을 쓴다.
 * 판정 순서가 곧 안내 우선순위다: 상태 → 확인 필요 → 금액 → 계좌.
 */
export function classifyPayoutBlock(
  input: PayoutBlockInput,
): PayoutBlockVerdict {
  if (!PAYABLE_STATUSES.includes(input.status as SettlementStatus)) {
    return {
      reason:
        input.status === SETTLEMENT_STATUS.PROCESSING
          ? "PAYOUT_IN_PROGRESS"
          : "NOT_PAYABLE_STATUS",
    };
  }
  // 운영자 확인이 필요한 지급 건이 있으면 또 보내지 않는다. 실패 건의 나이스 재진행은 확인 완료로 풀리지 않아(다음 조회가 다시 켬)
  //   안내가 달라 사유를 나눈다 — 그 밖의 사유(이중 지급 의심·금액 불일치 등)는 확인 완료로 푼다.
  if (input.reviewReopened) return { reason: "PAYOUT_REVIEW_REOPENED" };
  if (input.reviewOpen) return { reason: "PAYOUT_REVIEW_OPEN" };
  if (input.netAmount <= 0) return { reason: "NET_NOT_POSITIVE" };
  const classified = classifyPayoutFileAccount(input.account);
  if (classified.exclusion !== null) return { reason: classified.exclusion };
  return { reason: null, subMallId: classified.subMallId };
}
