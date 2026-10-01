'use client';

import { useCallback, useContext, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { useToast } from '@/components/ui/Toast';
import { AuthContext } from '@/contexts/AuthContext';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useNavigation } from '@/hooks/useNavigation';
import { usePageReady } from '@/hooks/usePageReady';
import { api } from '@/services/api-client';
import {
  getTeam,
  getTeamSettlementAccount,
  listManagedTeams,
  type TeamSettlementAccount,
  type TeamSettlementAccountStatus,
} from '@/services/team.service';
import { MESSAGES } from '@/lib/messages';
import { settlementAccountStatusView } from '@/lib/settlement-account-status';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettlementStatus = 'pending' | 'approved' | 'processing' | 'paid' | 'failed' | 'rejected';

// 목록 로드 실패 3분류 — 404/403/기타(네트워크·서버 오류). 성공+0건은 별도(EmptyState).
type SettlementListErrorKind = 'notFound' | 'denied' | 'load';

interface SettlementListItem {
  id: string;
  teamName: string;
  settlementMonth: string;
  netAmount: number;
  status: SettlementStatus;
  completedAt: string | null;
  accountStatus: TeamSettlementAccountStatus | null;
}

interface ApiSettlementListItem {
  id: string;
  settlementMonth?: string;
  netAmount?: number;
  status?: string;
  completedAt?: string | null;
  accountStatus?: TeamSettlementAccountStatus | null;
  team?: { id?: string; name?: string };
}

interface ListPage {
  items: SettlementListItem[];
  page: number;
  totalPages: number;
}

// 상단 계좌 카드 — 감독은 본인 소유 팀 계좌, 코치는 목록 행의 상태만.
type AccountCard =
  | { kind: 'hidden' }
  | { kind: 'director'; teamId: string; account: TeamSettlementAccount | null }
  | { kind: 'coach'; status: TeamSettlementAccountStatus | null };

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES: SettlementStatus[] = [
  'pending',
  'approved',
  'processing',
  'paid',
  'failed',
  'rejected',
];

function normalizeStatus(status?: string): SettlementStatus {
  const value = (status ?? '').toLowerCase();
  return (VALID_STATUSES as string[]).includes(value) ? (value as SettlementStatus) : 'pending';
}

function parseListPayload(payload: unknown): {
  items: ApiSettlementListItem[];
  page: number;
  totalPages: number;
} {
  if (Array.isArray(payload)) {
    return { items: payload as ApiSettlementListItem[], page: 1, totalPages: 1 };
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const rows = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.items) ? obj.items : [];
    const meta = obj.meta as Record<string, unknown> | undefined;
    return {
      items: rows as ApiSettlementListItem[],
      page: typeof meta?.page === 'number' ? meta.page : 1,
      totalPages: typeof meta?.totalPages === 'number' ? meta.totalPages : 1,
    };
  }
  return { items: [], page: 1, totalPages: 1 };
}

function mapApiSettlement(item: ApiSettlementListItem): SettlementListItem {
  return {
    id: item.id,
    teamName: item.team?.name ?? MESSAGES.settlements.teamFallback,
    settlementMonth: item.settlementMonth ?? '',
    netAmount: item.netAmount ?? 0,
    status: normalizeStatus(item.status),
    completedAt: item.completedAt ?? null,
    accountStatus: item.accountStatus ?? null,
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
}

// "YYYY-MM" → "YYYY년 M월". 형식이 다르면 원문 그대로 보여준다.
function formatSettlementMonth(value: string): string {
  const m = /^(\d{4})-(\d{1,2})/.exec(value);
  return m ? MESSAGES.settlements.yearMonthLabel(m[1], String(Number(m[2]))) : value;
}

function formatPaidDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d).replace(/-/g, '.');
}

// 관리 팀 목록에는 오너 필드가 없어 오너를 찾을 때까지 상세를 순차 조회한다(팀 1개 원칙이라 보통 1회).
async function findOwnedTeamId(userId: string): Promise<string | null> {
  const list = await listManagedTeams();
  if (!list.success || !list.data) return null;
  for (const t of list.data) {
    const detail = await getTeam(t.id);
    if (detail.success && detail.data?.club?.coachId === userId) return t.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const SETTLEMENT_STATUS: Record<SettlementStatus, { label: string; className: string }> = {
  pending: {
    label: MESSAGES.settlements.statusPending,
    className: 'bg-it-fill text-it-ink-600 dark:bg-rink-700 dark:text-rink-100',
  },
  approved: {
    label: MESSAGES.settlements.statusApproved,
    className: 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-500',
  },
  processing: {
    label: MESSAGES.settlements.statusProcessing,
    className: 'bg-sun-500/10 text-sun-500 dark:bg-sun-500/15 dark:text-sun-500',
  },
  paid: {
    label: MESSAGES.settlements.statusPaid,
    className: 'bg-mint/10 text-mint dark:bg-mint/15 dark:text-mint',
  },
  failed: {
    label: MESSAGES.settlements.statusFailed,
    className: 'bg-flame-500/10 text-flame-500 dark:bg-flame-500/15 dark:text-flame-500',
  },
  rejected: {
    label: MESSAGES.settlements.statusRejected,
    className: 'bg-flame-500/10 text-flame-500 dark:bg-flame-500/15 dark:text-flame-500',
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AccountCardSection({
  card,
  onManage,
}: {
  card: Exclude<AccountCard, { kind: 'hidden' }>;
  onManage: () => void;
}) {
  const status = card.kind === 'director' ? card.account?.status : card.status;
  const view = settlementAccountStatusView(status);

  return (
    <section
      className="bg-it-surface px-5 py-4 dark:bg-it-blue-950"
      aria-label={MESSAGES.settlementAccount.rowLabel}
    >
      <div className="flex items-center gap-2">
        <Icon
          name="account_balance"
          className="shrink-0 text-[20px] text-it-ink-500 dark:text-it-ink-300"
          aria-hidden="true"
        />
        <span className="text-card-body font-extrabold text-it-ink-800 dark:text-white">
          {MESSAGES.settlementAccount.rowLabel}
        </span>
        <span
          className={cn(
            'inline-flex items-center rounded-w-pill px-2 py-0.5 text-[11px] font-extrabold',
            view.badge,
          )}
        >
          {view.label}
        </span>
        {card.kind === 'director' && (
          <button
            type="button"
            onClick={onManage}
            className="ml-auto inline-flex h-8 shrink-0 items-center gap-0.5 rounded-w-md border-[1.5px] border-it-line-strong px-3 text-card-meta font-bold text-it-blue-600 transition-colors hover:bg-it-fill active:brightness-95 motion-reduce:transition-none dark:border-rink-700 dark:text-wtext-4 dark:hover:bg-rink-700"
          >
            {card.account
              ? MESSAGES.settlementAccount.cardManage
              : MESSAGES.settlementAccount.cardRegister}
            <Icon name="chevron_right" className="text-[16px]" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="mt-1.5 text-card-meta font-semibold tabular-nums text-it-ink-500 dark:text-it-ink-300">
        {card.kind === 'director' && card.account
          ? `${card.account.bankName} ${card.account.bankAccount}`
          : view.hint}
      </p>
    </section>
  );
}

function SettlementRow({
  item,
  onOpen,
}: {
  item: SettlementListItem;
  onOpen: (id: string) => void;
}) {
  const statusCfg = SETTLEMENT_STATUS[item.status];
  const isNetNegative = item.netAmount < 0;
  const paidDate =
    item.status === 'paid' && item.completedAt ? formatPaidDate(item.completedAt) : '';

  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="flex w-full items-center gap-3 border-b border-it-line py-4 text-left transition-colors last:border-b-0 active:brightness-95 motion-reduce:transition-none dark:border-rink-700"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-card-title font-bold text-it-ink-800 dark:text-white">
            {formatSettlementMonth(item.settlementMonth)}
          </p>
          <span
            className={`inline-flex shrink-0 items-center rounded-w-pill px-2 py-0.5 text-card-meta font-bold ${statusCfg.className}`}
          >
            {statusCfg.label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-card-meta text-it-ink-400 dark:text-rink-300">
          {paidDate
            ? `${item.teamName} ${MESSAGES.settlements.paidDateLabel(paidDate)}`
            : item.teamName}
        </p>
        {isNetNegative && (
          <p className="mt-1 text-card-meta font-bold text-flame-500">
            {MESSAGES.settlements.negativeNetAmountNotice}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="mb-0.5 text-card-meta font-medium text-it-ink-400 dark:text-rink-300">
          {item.status === 'paid'
            ? MESSAGES.settlements.paidAmountLabel
            : MESSAGES.settlements.receivableLabel}
        </p>
        <p
          className={`text-card-body font-bold tabular-nums ${
            isNetNegative ? 'text-flame-500' : 'text-it-blue-500'
          }`}
        >
          {formatCurrency(item.netAmount)}
        </p>
      </div>
      <Icon
        name="chevron_right"
        className="shrink-0 text-card-body text-it-ink-300"
        aria-hidden="true"
      />
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="mb-4 flex size-16 items-center justify-center rounded-w-md bg-it-fill dark:bg-rink-800">
        <Icon name="receipt_long" className="text-3xl text-it-ink-400 dark:text-rink-500" />
      </div>
      <p className="text-card-body font-medium text-it-ink-500 dark:text-rink-300">
        {MESSAGES.settlements.emptyList}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettlementsPage() {
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const { navigate } = useNavigation();
  const { toast } = useToast();
  const user = useContext(AuthContext)?.user;
  const userId = user?.id;
  const userType = user?.userType;

  const [settlements, setSettlements] = useState<SettlementListItem[]>([]);
  const [pageInfo, setPageInfo] = useState({ page: 1, totalPages: 1 });
  const [listLoading, setListLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<SettlementListErrorKind | null>(null);
  const [card, setCard] = useState<AccountCard>({ kind: 'hidden' });
  const [cardLoading, setCardLoading] = useState(true);

  // 목록과 계좌 카드 조회가 모두 끝난 뒤에 풀스크린 로더를 내린다.
  usePageReady(!listLoading && !cardLoading);

  const fetchPage = useCallback(
    async (page: number): Promise<ListPage | SettlementListErrorKind> => {
      try {
        const res = await api.get<unknown>('/settlements', {
          params: { page, pageSize: PAGE_SIZE },
        });
        if (!res.success) {
          const status = res.error?.statusCode;
          return status === 404 ? 'notFound' : status === 403 ? 'denied' : 'load';
        }
        const parsed = parseListPayload(res.data);
        return {
          items: parsed.items.map(mapApiSettlement),
          page: parsed.page,
          totalPages: parsed.totalPages,
        };
      } catch {
        return 'load';
      }
    },
    [],
  );

  const loadFirstPage = useCallback(async () => {
    setListLoading(true);
    const result = await fetchPage(1);
    if (typeof result === 'string') {
      setSettlements([]);
      setErrorKind(result);
    } else {
      setSettlements(result.items);
      setPageInfo({ page: result.page, totalPages: result.totalPages });
      setErrorKind(null);
    }
    setListLoading(false);
  }, [fetchPage]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const handleLoadMore = useCallback(async () => {
    setMoreLoading(true);
    const result = await fetchPage(pageInfo.page + 1);
    if (typeof result === 'string') {
      toast.error(MESSAGES.settlements.loadError);
    } else {
      setSettlements((prev) => [...prev, ...result.items]);
      setPageInfo({ page: result.page, totalPages: result.totalPages });
    }
    setMoreLoading(false);
  }, [fetchPage, pageInfo.page, toast]);

  // 계좌 API 는 팀 오너 감독만 호출한다(코치는 403). 코치는 목록 행의 accountStatus 로 대신한다.
  useEffect(() => {
    if (userType !== 'director' || !userId) {
      setCardLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const teamId = await findOwnedTeamId(userId);
        if (cancelled) return;
        if (!teamId) {
          setCard({ kind: 'hidden' });
          return;
        }
        const res = await getTeamSettlementAccount(teamId);
        if (cancelled) return;
        setCard(
          res.success
            ? { kind: 'director', teamId, account: res.data ?? null }
            : { kind: 'hidden' },
        );
      } catch {
        if (!cancelled) setCard({ kind: 'hidden' });
      } finally {
        if (!cancelled) setCardLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userType, userId]);

  const shownCard: AccountCard =
    userType === 'coach' && settlements.length > 0
      ? { kind: 'coach', status: settlements[0].accountStatus }
      : card;

  const handleOpenDetail = useCallback(
    (id: string) => {
      void navigate(`/settlements/${id}`);
    },
    [navigate],
  );

  const handleManageAccount = useCallback(() => {
    if (card.kind === 'director') void navigate(`/team/${card.teamId}/settlement-account`);
  }, [card, navigate]);

  if (listLoading || cardLoading) return null;

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title={MESSAGES.settlements.pageTitle} />

      <main className="flex flex-1 flex-col overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8">
        {shownCard.kind !== 'hidden' && (
          <>
            <AccountCardSection card={shownCard} onManage={handleManageAccount} />
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
          </>
        )}

        <section className="flex-1 bg-it-surface p-4 dark:bg-it-blue-950">
          <p className="mb-3 text-card-meta text-it-ink-400 dark:text-rink-300">
            {MESSAGES.settlements.basisNotice}
          </p>

          {errorKind ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-card-body text-it-ink-500 dark:text-rink-300">
                {errorKind === 'notFound'
                  ? MESSAGES.settlements.notFound
                  : errorKind === 'denied'
                    ? MESSAGES.settlements.deniedList
                    : MESSAGES.settlements.loadError}
              </p>
              <button
                type="button"
                onClick={() => void loadFirstPage()}
                className="inline-flex h-10 items-center justify-center rounded-w-md bg-it-blue-500 px-5 text-card-body font-semibold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 motion-reduce:transition-none"
              >
                {MESSAGES.settlements.retry}
              </button>
            </div>
          ) : settlements.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col">
              {settlements.map((item) => (
                <SettlementRow key={item.id} item={item} onOpen={handleOpenDetail} />
              ))}
              {pageInfo.page < pageInfo.totalPages && (
                <button
                  type="button"
                  onClick={() => void handleLoadMore()}
                  disabled={moreLoading}
                  className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-w-md border-[1.5px] border-it-line-strong text-card-body font-semibold text-it-blue-600 transition-colors hover:bg-it-fill active:brightness-95 disabled:opacity-50 motion-reduce:transition-none dark:border-rink-700 dark:text-wtext-4 dark:hover:bg-rink-700"
                >
                  {MESSAGES.settlements.loadMore}
                </button>
              )}
            </div>
          )}

          <div className="h-8" />
        </section>
      </main>
    </MobileContainer>
  );
}
