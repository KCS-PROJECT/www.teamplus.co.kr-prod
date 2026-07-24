'use client';

/**
 * RefundRequestListView — 환불 요청 관리 목록(팀/오픈클래스 공유)
 *
 * scope='team'  → /director-payments/refunds (감독 소속 팀 자동 해석)
 * scope='academy' → /academy/[id]/refunds (scopeId=academyId)
 *
 * 서버가 승인 대기(activeItems, 전량)와 처리 이력(historyItems, pagination 기준)을 분리 반환한다.
 * 활성 섹션=activeItems, 이력 섹션=historyItems+"더 보기"(페이지 append). ICETIMES flat.
 * 금융 화면 원칙: 로드 실패를 빈 목록으로 위장하지 않고 명시적 에러 + 재시도.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type { ApiResponse } from '@/types';
import { useNavigation } from '@/hooks/useNavigation';
import {
  listRefundRequests,
  type RefundRequestListItem,
  type RefundRequestListResponse,
  type RefundScope,
} from '@/services/payment';
import { RefundStatusBadge } from './RefundStatusBadge';
import { RefundRiskFlags } from './RefundRiskFlags';

interface RefundRequestListViewProps {
  scope: RefundScope;
  /** academy scope 필수 — academyId. team scope 는 서버가 소속 팀 해석. */
  scopeId?: string;
  /** 데이터 로드+셋팅 완료(성공/실패) 시 1회 호출 — 페이지 풀스크린 로더 hide. */
  onReady?: () => void;
}

/** ISO → "YYYY.MM.DD HH:mm" — 목록 행의 신청 일시 표기. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${hh}:${mi}`;
}

export function RefundRequestListView({
  scope,
  scopeId,
  onReady,
}: RefundRequestListViewProps) {
  const { navigate } = useNavigation();

  // 서버 분리 목록 — 활성(전량, page 1) / 이력(누적, "더 보기"로 append).
  const [activeItems, setActiveItems] = useState<RefundRequestListItem[]>([]);
  const [historyItems, setHistoryItems] = useState<RefundRequestListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loaded, setLoaded] = useState(false); // 최초 로드 성공 여부(에러와 구분)
  const [loadError, setLoadError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false); // 더 보기 실패 → 인라인 안내 + 재시도

  // 요청 세대(generation) — scope/필터 변경·재시도 시 증가시켜 이전 응답의 stale 반영 무효화.
  const requestSeq = useRef(0);

  const fetchPage = useCallback(
    (p: number) => listRefundRequests({ scope, scopeId, page: p }),
    [scope, scopeId],
  );

  /** 최초/재시도 적용 — 성공=활성 전량 + 이력 1페이지 세팅, 실패=에러. */
  const applyFirst = useCallback((res: ApiResponse<RefundRequestListResponse>) => {
    if (res.success && res.data) {
      setActiveItems(res.data.activeItems);
      setHistoryItems(res.data.historyItems);
      setPage(res.data.pagination.page);
      setTotalPages(res.data.pagination.totalPages);
      setLoaded(true);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const seq = ++requestSeq.current; // 새 세대 — 진행 중 더 보기 append 무효화
    (async () => {
      setIsLoading(true);
      setIsLoadingMore(false); // 이전 세대의 더 보기 잔여 잠금 해제
      setLoadMoreError(false);
      const res = await fetchPage(1);
      if (cancelled || seq !== requestSeq.current) return; // stale-write 가드(C10)
      applyFirst(res);
      setIsLoading(false);
      onReady?.();
    })();
    return () => {
      cancelled = true;
    };
    // onReady/applyFirst 는 안정 참조 — scope/scopeId 변경만 재조회 트리거.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scopeId]);

  const handleRetry = useCallback(async () => {
    const seq = ++requestSeq.current; // 자기 세대 발급 — in-flight 더 보기·이전 응답 무효화
    setIsRetrying(true);
    try {
      const res = await fetchPage(1);
      if (seq !== requestSeq.current) return; // 더 최신 요청 진행 중 → write 폐기
      applyFirst(res);
    } finally {
      if (seq === requestSeq.current) setIsRetrying(false); // 자기 세대일 때만 해제
    }
  }, [applyFirst, fetchPage]);

  /** 이력 더 보기 — 다음 페이지 append(id 중복 제거). 세대 가드로 stale append 0건 + flag 정리. */
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || page >= totalPages) return;
    const seq = requestSeq.current; // 더 보기는 새 세대 발급 안 함(같은 scope 연속) — 현재 세대 캡처
    setIsLoadingMore(true);
    setLoadMoreError(false);
    const next = page + 1;
    try {
      const res = await fetchPage(next);
      // scope 변경/재시도(effect·handleRetry가 seq 증가) 발생 → 이전 응답 append 폐기(effect가 flag 리셋).
      if (seq !== requestSeq.current) return;
      if (res.success && res.data) {
        const fetched = res.data;
        setHistoryItems((prev) => {
          const seen = new Set(prev.map((it) => it.id));
          const merged = [...prev];
          for (const it of fetched.historyItems) if (!seen.has(it.id)) merged.push(it);
          return merged;
        });
        setPage(fetched.pagination.page);
        setTotalPages(fetched.pagination.totalPages);
      } else {
        setLoadMoreError(true); // 실패 — 인라인 안내 + 재시도(버튼 재클릭)
      }
    } finally {
      if (seq === requestSeq.current) setIsLoadingMore(false); // 자기 세대일 때만 해제
    }
  }, [fetchPage, isLoadingMore, page, totalPages]);

  const handleOpen = useCallback(
    (id: string) => {
      const path =
        scope === 'academy'
          ? `/academy/${scopeId}/refunds/${id}`
          : `/director-payments/refunds/${id}`;
      void navigate(path);
    },
    [navigate, scope, scopeId],
  );

  // 서버 우선순위 순서 그대로 렌더(클라 재정렬 금지) — activeItems=처리 필요, historyItems=이력.
  const pending = activeItems;
  const history = historyItems;

  const hasMoreHistory = page < totalPages;

  // 최초 풀스크린 로더는 페이지 usePageReady 가 처리 — 로딩 중엔 null.
  if (isLoading) return null;

  // 최초 로드 실패 — 빈 목록 위장 금지. 명시적 에러 + 재시도.
  if (loadError && !loaded) {
    return (
      <RefundListErrorState onRetry={handleRetry} retrying={isRetrying} />
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── 승인 대기 ─────────────────────────────────────── */}
      <RefundListSection
        title={MESSAGES.refund.tabPending}
        count={pending.length}
        emphasis
      >
        {pending.length > 0 ? (
          <ul className="flex flex-col divide-y divide-it-line dark:divide-rink-700" role="list">
            {pending.map((item) => (
              <li key={item.id}>
                <RefundRow item={item} onOpen={handleOpen} />
              </li>
            ))}
          </ul>
        ) : (
          <RefundListEmpty message={MESSAGES.refund.listEmptyPending} />
        )}
      </RefundListSection>

      {/* flat 섹션 사이 8px 회색 갭 */}
      <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

      {/* ── 처리 이력 (페이지네이션) ─────────────────────── */}
      <RefundListSection
        title={MESSAGES.refund.tabHistory}
        count={history.length}
        ariaBusy={isLoadingMore}
      >
        {/* 목록 갱신 announcement — 스크린리더 polite 알림. */}
        <p className="sr-only" aria-live="polite" role="status">
          {MESSAGES.refund.listAnnounce(history.length)}
        </p>
        {history.length > 0 ? (
          <>
            <ul className="flex flex-col divide-y divide-it-line dark:divide-rink-700" role="list">
              {history.map((item) => (
                <li key={item.id}>
                  <RefundRow item={item} onOpen={handleOpen} />
                </li>
              ))}
            </ul>
            {/* 더 보기 실패 — 인라인 안내(버튼 재클릭으로 재시도). */}
            {loadMoreError && (
              <p className="mt-3 text-center text-card-meta text-it-red-500 dark:text-it-red-400" role="alert">
                {MESSAGES.refund.loadMoreFailed}
              </p>
            )}
            {hasMoreHistory && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
                className="mt-4 flex h-12 w-full items-center justify-center gap-1.5 rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface text-card-body font-semibold text-it-ink-700 transition-colors hover:bg-it-fill active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:border-rink-700 dark:bg-rink-800 dark:text-it-ink-200 dark:hover:bg-rink-700/50"
              >
                <span>{isLoadingMore ? MESSAGES.refund.loadingMore : MESSAGES.refund.loadMore}</span>
                {!isLoadingMore && (
                  <Icon name="expand_more" className="text-card-emphasis" aria-hidden="true" />
                )}
              </button>
            )}
          </>
        ) : (
          <RefundListEmpty message={MESSAGES.refund.listEmptyHistory} />
        )}
      </RefundListSection>
    </div>
  );
}

/* ── Sub Components ─────────────────────────────────────── */

function RefundListSection({
  title,
  count,
  emphasis,
  ariaBusy,
  children,
}: {
  title: string;
  count: number;
  emphasis?: boolean;
  ariaBusy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="bg-it-surface px-5 pt-5 pb-6 dark:bg-rink-800"
      aria-label={title}
      aria-busy={ariaBusy}
    >
      <div className="flex items-baseline gap-2 pb-1">
        <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
          {title}
        </h2>
        <span
          className={cn(
            'text-[15px] font-extrabold tabular-nums',
            emphasis && count > 0
              ? 'text-it-red-500'
              : 'text-it-blue-500',
          )}
        >
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function RefundRow({
  item,
  onOpen,
}: {
  item: RefundRequestListItem;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="w-full py-[14px] text-left transition-colors hover:bg-it-fill/60 active:brightness-95 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-it-ink-800 dark:text-white">
              {item.subjectLabel || item.requesterName}
            </span>
            <RefundStatusBadge status={item.status} />
          </div>
          <p className="mt-0.5 truncate text-[13px] text-it-ink-500 dark:text-wtext-4">
            {item.requesterName}
            {item.childName ? ` · ${item.childName}` : ''}
          </p>
          <RefundRiskFlags flags={item.riskFlags} className="mt-1.5" />
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-extrabold text-it-ink-900 tabular-nums dark:text-white">
            {item.amount.toLocaleString()}
            <span className="ml-0.5 text-[12px] font-medium text-it-ink-500 dark:text-wtext-4">
              {MESSAGES.settlement.won}
            </span>
          </p>
          <p className="mt-0.5 text-[11.5px] font-medium text-it-ink-400 tabular-nums dark:text-wtext-4">
            {formatDateTime(item.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
}

function RefundListEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-10" role="status">
      <div className="flex h-12 w-12 items-center justify-center rounded-w-pill bg-it-fill dark:bg-rink-700">
        <Icon name="inbox" className="text-2xl text-it-ink-400 dark:text-wtext-3" aria-hidden="true" />
      </div>
      <p className="text-card-body text-it-ink-500 dark:text-wtext-4">{message}</p>
    </div>
  );
}

function RefundListErrorState({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <section className="bg-it-surface dark:bg-rink-800">
      <div className="flex flex-col items-center gap-3 px-5 py-16 text-center" role="alert">
        <div className="flex h-14 w-14 items-center justify-center rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15">
          <Icon name="error_outline" className="text-3xl text-it-red-600 dark:text-it-red-400" aria-hidden="true" />
        </div>
        <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
          {MESSAGES.refund.listLoadFailed}
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-1 inline-flex items-center gap-1 rounded-w-md bg-it-blue-500 px-5 py-2.5 text-card-body font-bold text-white transition-colors hover:bg-it-blue-600 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        >
          <Icon name="refresh" className="text-card-title" aria-hidden="true" />
          {MESSAGES.refund.retry}
        </button>
      </div>
    </section>
  );
}

export default RefundRequestListView;
