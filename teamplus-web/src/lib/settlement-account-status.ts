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
};

/** status 가 null 이면 미등록. */
export function settlementAccountStatusView(
  status: TeamSettlementAccountStatus | null | undefined,
): SettlementAccountStatusView {
  return VIEWS[status ?? "NONE"];
}
