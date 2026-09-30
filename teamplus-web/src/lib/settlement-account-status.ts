import { MESSAGES } from "@/lib/messages";
import type { TeamSettlementAccountStatus } from "@/services/team.service";

const M = MESSAGES.settlementAccount;

export interface SettlementAccountStatusView {
  label: string;
  hint: string;
  badge: string;
}

const VIEWS: Record<TeamSettlementAccountStatus | "NONE", SettlementAccountStatusView> = {
  NONE: {
    label: M.statusNone,
    hint: M.statusNoneHint,
    badge: "bg-it-fill text-it-ink-600 dark:bg-it-blue-900 dark:text-it-ink-200",
  },
  SUBMITTED: {
    label: M.statusSubmitted,
    hint: M.statusSubmittedHint,
    badge: "bg-sun-100 text-it-ink-800 dark:bg-sun-500/15 dark:text-sun-100",
  },
  REGISTERED: {
    label: M.statusRegistered,
    hint: M.statusRegisteredHint,
    badge: "bg-mint-100 text-mint-700 dark:bg-mint-500/15 dark:text-mint-500",
  },
  FAILED: {
    label: M.statusFailed,
    hint: M.statusFailedHint,
    badge: "bg-flame-100 text-flame-700 dark:bg-flame-500/15 dark:text-flame-500",
  },
};

/** status 가 null 이면 미등록. */
export function settlementAccountStatusView(
  status: TeamSettlementAccountStatus | null | undefined,
): SettlementAccountStatusView {
  return VIEWS[status ?? "NONE"];
}

/**
 * 나이스 자동 등록 방식의 안내 — 결과를 감독이 저장 직후 직접 확인하므로 "운영자 확인" 문구를 쓰지 않는다
 * (미등록·확인 중·등록 완료). 수동 운영이면 기본 표시 그대로.
 */
export function settlementAccountStatusViewForMode(
  status: TeamSettlementAccountStatus | null | undefined,
  mode: "manual" | "api" | undefined,
): SettlementAccountStatusView {
  const base = settlementAccountStatusView(status);
  if (status === "SUBMITTED" && mode === "api") {
    return { ...base, label: M.statusChecking, hint: M.statusCheckingHint };
  }
  if (!status && mode === "api") {
    return { ...base, hint: M.statusNoneApiHint };
  }
  if (status === "REGISTERED" && mode === "api") {
    return { ...base, hint: M.statusRegisteredApiHint };
  }
  return base;
}
