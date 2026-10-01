import { TeamSettlementAccountStatus } from "@prisma/client";

/**
 * 수동 운영에서 운영자가 나이스 관리자 화면에서 할 일.
 * REGISTER = 나이스에 등록한 적 없음(등록 엑셀 대상) · UPDATE = 등록돼 있는데 계좌가 바뀜(나이스에서 직접 수정) · NONE = 없음.
 */
export type NiceAction = "REGISTER" | "UPDATE" | "NONE";

export function resolveNiceAction(account: {
  status: TeamSettlementAccountStatus;
  subMallId: string | null;
}): NiceAction {
  if (!account.subMallId) return "REGISTER";
  return account.status === TeamSettlementAccountStatus.REGISTERED
    ? "NONE"
    : "UPDATE";
}

export type PayoutFileExclusion =
  | "ACCOUNT_NONE"
  | "IN_PROGRESS"
  | "ACCOUNT_CHANGED"
  | "SUB_ID_MISSING"
  | "NOT_REGISTERED";

export const PAYOUT_FILE_EXCLUSION_REASON: Readonly<
  Record<PayoutFileExclusion, string>
> = {
  ACCOUNT_NONE: "정산 계좌 미입력",
  IN_PROGRESS: "나이스 등록 처리 중",
  ACCOUNT_CHANGED: "계좌 변경 후 나이스 수정·등록 완료 처리 전",
  SUB_ID_MISSING: "서브ID 기록 없음 — 등록 완료 처리를 다시 해주세요",
  NOT_REGISTERED: "나이스 등록 전",
};

export type PayoutFileClassification =
  | { exclusion: null; subMallId: string }
  | { exclusion: PayoutFileExclusion; subMallId: null };

/** 지급 엑셀에 넣을 수 있는지 — 등록 완료이고 서브ID 가 있을 때만 그 서브ID 와 함께 통과한다. */
export function classifyPayoutFileAccount(
  account: {
    status: TeamSettlementAccountStatus;
    subMallId: string | null;
    registrationInProgress: boolean;
  } | null,
): PayoutFileClassification {
  const excluded = (exclusion: PayoutFileExclusion) => ({
    exclusion,
    subMallId: null,
  });
  if (!account) return excluded("ACCOUNT_NONE");
  if (account.registrationInProgress) return excluded("IN_PROGRESS");
  const registered = account.status === TeamSettlementAccountStatus.REGISTERED;
  if (account.subMallId) {
    return registered
      ? { exclusion: null, subMallId: account.subMallId }
      : excluded("ACCOUNT_CHANGED");
  }
  return excluded(registered ? "SUB_ID_MISSING" : "NOT_REGISTERED");
}
