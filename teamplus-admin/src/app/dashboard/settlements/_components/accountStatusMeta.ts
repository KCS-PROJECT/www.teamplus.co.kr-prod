import { MESSAGES } from '@/lib/messages';

export type AccountStatus = 'SUBMITTED' | 'REGISTERED';

export interface AccountStatusMeta {
  label: string;
  badge: string;
}

const NONE_META: AccountStatusMeta = {
  label: MESSAGES.settlement.accountStatusNone,
  badge: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

const STATUS_META: Record<AccountStatus, AccountStatusMeta> = {
  SUBMITTED: {
    label: MESSAGES.settlement.accountStatusSubmitted,
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  REGISTERED: {
    label: MESSAGES.settlement.accountStatusRegistered,
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
};

/** 계좌가 없으면(null) 미등록으로 표시한다. */
export function getAccountStatusMeta(status: AccountStatus | null | undefined): AccountStatusMeta {
  return status ? STATUS_META[status] ?? NONE_META : NONE_META;
}
