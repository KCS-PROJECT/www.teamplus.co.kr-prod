'use client';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useState, useEffect, useCallback } from 'react';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useNavigation } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

type TabType = 'payment' | 'usage';

interface ChildData {
  id: string;
  name: string;
  credits: number;
  expiringCredits: number;
  expiringDate: string;
}

interface PaymentHistory {
  id: string;
  title: string;
  date: string;
  time: string;
  amount: number;
  status: 'completed' | 'cancelled';
  icon: string;
  iconBgClass: string;
  iconColorClass: string;
}

interface UsageHistory {
  id: string;
  className: string;
  date: string;
  time: string;
  credits: number;
  // [Step 7 2026-05-19] 'adjusted' 추가 — 감독/관리자 수동 조정 트랜잭션.
  //   양수: adjusted_positive (회차 추가) / 음수: adjusted_negative (회차 차감).
  //   백엔드 응답이 transactions 필드를 미포함해도 graceful degradation
  //   (기존 deduction/restore/expired 동작 유지).
  type: 'deduction' | 'restore' | 'expired' | 'adjusted';
  coachName: string;
  // [Step 7 2026-05-19] 감독 조정 사유 (CreditTransaction.reason). optional.
  reason?: string;
}

interface MonthGroup<T> {
  month: string;
  count?: number;
  items: T[];
}

interface ChildApiItem {
  id: string;
  firstName: string;
  lastName: string;
}

interface CreditSummary {
  available?: number;
  totalCredits?: number;
  expiringCredits?: number;
  expiringDate?: string;
  nearestExpiryDate?: string;
}

interface PaymentApiItem {
  id: string;
  title?: string;
  productName?: string;
  createdAt?: string;
  paidAt?: string;
  amount?: number;
  totalAmount?: number;
  status?: string;
}

interface UsageApiItem {
  id: string;
  className?: string;
  createdAt?: string;
  credits?: number;
  amount?: number;
  type?: string;
  transactionType?: string;
  coachName?: string;
  // [Step 7 2026-05-19] 감독/관리자 수동 조정 이력 표시용.
  //   백엔드 응답 확장 대비 (graceful degradation — 미포함 시 기존 동작 유지).
  //   adjustedBy: 조정 주체 ID (truthy 면 감독 조정 트랜잭션으로 표시)
  //   adjustedByName: 조정 주체 표시명 (선택)
  //   reason: 조정 사유 (학부모에게 표시)
  adjustedBy?: string | null;
  adjustedByName?: string;
  reason?: string;
}

// ────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────

function formatDateParts(dateStr: string): { date: string; time: string; monthKey: string } {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${year}.${month}.${day}`,
    time: `${hours}:${minutes}`,
    monthKey: `${year}년 ${parseInt(month)}월`,
  };
}

function getPaymentIcon(status: string): { icon: string; bg: string; color: string } {
  if (status === 'cancelled' || status === 'CANCELLED' || status === 'REFUNDED') {
    return { icon: 'remove_shopping_cart', bg: 'bg-wline dark:bg-rink-700', color: 'text-wtext-4 dark:text-wtext-3' };
  }
  return { icon: 'confirmation_number', bg: 'bg-ice-100 dark:bg-ice-500/15', color: 'text-ice-500' };
}

function groupByMonth<T extends { date: string }>(items: T[]): MonthGroup<T>[] {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const parts = item.date.split('.');
    const monthKey = parts.length >= 2 ? `${parts[0]}년 ${parseInt(parts[1])}월` : item.date;
    if (!groups[monthKey]) groups[monthKey] = [];
    groups[monthKey].push(item);
  }
  return Object.entries(groups).map(([month, groupItems]) => ({
    month,
    count: groupItems.length,
    items: groupItems,
  }));
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat('ko-KR').format(amount);
}

// [Step 7 2026-05-19] 감독 조정 라벨 — credits 양수/음수 + reason 으로 분기.
//   감독 조정은 단일 'adjusted' 타입으로 묶고, 부호(+/-)에 따라 라벨/색상 분기.
function getUsageTypeLabel(type: UsageHistory['type'], credits: number, reason?: string) {
  switch (type) {
    case 'deduction': return '출석 차감';
    case 'restore': return '수업 취소 복원';
    case 'expired': return MESSAGES.credits.history.expired;
    case 'adjusted':
      return credits >= 0
        ? MESSAGES.credits.history.adjustedByCoachPositive(credits, reason)
        : MESSAGES.credits.history.adjustedByCoachNegative(credits, reason);
  }
}

function getUsageTypeColor(type: UsageHistory['type'], credits: number) {
  switch (type) {
    case 'deduction': return 'text-flame-500 dark:text-flame-500';
    case 'restore': return 'text-mint-500 dark:text-mint-500';
    case 'expired': return 'text-wtext-4 dark:text-wtext-3';
    case 'adjusted':
      // 감독 조정 양수: ice-500 (파랑 — 추가/혜택), 음수: flame-500 (주황 — 차감/주의)
      return credits >= 0
        ? 'text-ice-500 dark:text-ice-500'
        : 'text-flame-500 dark:text-flame-500';
  }
}

function getUsageIcon(type: UsageHistory['type'], credits: number = 0) {
  switch (type) {
    case 'deduction':
      return { name: 'remove_circle_outline', bg: 'bg-flame-100 dark:bg-flame-500/15', color: 'text-flame-500' };
    case 'restore':
      return { name: 'replay', bg: 'bg-mint-100 dark:bg-mint-500/15', color: 'text-mint-500' };
    case 'expired':
      return { name: 'schedule', bg: 'bg-wline dark:bg-rink-700', color: 'text-wtext-4 dark:text-wtext-3' };
    case 'adjusted':
      // 감독 조정은 'tune' 아이콘 — 양수/음수 부호로 색상 분기.
      return credits >= 0
        ? { name: 'tune', bg: 'bg-ice-100 dark:bg-ice-500/15', color: 'text-ice-500' }
        : { name: 'tune', bg: 'bg-flame-100 dark:bg-flame-500/15', color: 'text-flame-500' };
  }
}

// ────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────

type SortOrder = 'recent' | 'oldest' | 'amountHigh' | 'amountLow';

const SORT_OPTIONS: { key: SortOrder; label: string }[] = [
  { key: 'recent', label: '최신순' },
  { key: 'oldest', label: '오래된순' },
  { key: 'amountHigh', label: '금액 높은순' },
  { key: 'amountLow', label: '금액 낮은순' },
];

export default function CreditsPage() {
  const { navigate } = useNavigation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('payment');
  const [children, setChildren] = useState<ChildData[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [paymentHistory, setPaymentHistory] = useState<MonthGroup<PaymentHistory>[]>([]);
  const [usageHistory, setUsageHistory] = useState<MonthGroup<UsageHistory>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // [W3.B 2026-05-18 / Task #4] 상단바 액션 추가 — 검색 + 정렬 (이전: 새로고침 단독).
  //   - 검색: SearchBar 토글 (자녀 이름·상품명 부분 일치)
  //   - 정렬: 바텀시트 (최신/오래된/금액 높은순/낮은순)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');

  // 풀스크린 로더 fast-path (v11) — 결제권/이력 fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // [appbar-harness / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  //   기존 showAppBar:true → Flutter Native AppBar 가 (refresh 만) 노출되어
  //   "공지/알림/메뉴 버튼 안 보임" 회귀 발생. Native AppBar OFF 로 4-icon 헤더 강제.
  // [Task #12 2026-05-14] forceNative 누락 회귀 — PageAppBar 가 Native 에서 null 반환되어
  //   "앱 SubmainAppBar 우측 액션이 새로고침만" + "뒤로가기 미동작" 발생.
  //   조치: `<PageAppBar forceNative />` 로 Web/Native 동일 4-액션 헤더 단일 노출.
  //   - 공지(타임라인) / 알림 / 메뉴 PageAppBar 기본 액션 자동 노출
  //   - showBack=true 로 ← 뒤로가기 useNavigation().back() 내장 핸들러 활성
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  // 자녀 목록 + 결제권 정보 로드
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const childrenRes = await api.get<{ data?: ChildApiItem[] }>('/children');
      if (!childrenRes.success || !childrenRes.data) {
        setChildren([]);
        return;
      }

      const rawChildren = Array.isArray(childrenRes.data)
        ? childrenRes.data
        : (childrenRes.data as { data?: ChildApiItem[] }).data ?? [];

      const childDataList: ChildData[] = await Promise.all(
        (rawChildren as ChildApiItem[]).map(async (child) => {
          try {
            const creditRes = await api.get<CreditSummary>(`/credits/stats/${child.id}`);
            const credit = creditRes.success && creditRes.data ? creditRes.data : {};
            return {
              id: child.id,
              name: `${child.lastName}${child.firstName}`,
              credits: credit.available ?? credit.totalCredits ?? 0,
              expiringCredits: credit.expiringCredits ?? 0,
              expiringDate: credit.nearestExpiryDate ?? credit.expiringDate ?? '',
            };
          } catch {
            return {
              id: child.id,
              name: `${child.lastName}${child.firstName}`,
              credits: 0,
              expiringCredits: 0,
              expiringDate: '',
            };
          }
        })
      );

      setChildren(childDataList);
      if (childDataList.length > 0 && !selectedChildId) {
        setSelectedChildId(childDataList[0].id);
      }
    } catch {
      setChildren([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedChildId]);

  // 결제/사용 내역 로드
  const loadHistory = useCallback(async (childId: string) => {
    if (!childId) return;

    try {
      const [payRes, usageRes] = await Promise.all([
        api.get<{ data?: PaymentApiItem[]; items?: PaymentApiItem[] }>(`/payments/member/${childId}`, {
          params: { limit: '50' },
        }),
        api.get<{ data?: UsageApiItem[]; items?: UsageApiItem[]; transactions?: UsageApiItem[] }>(`/credits/member/${childId}`),
      ]);

      // 결제 내역 변환
      if (payRes.success && payRes.data) {
        const raw = (payRes.data as { data?: PaymentApiItem[]; items?: PaymentApiItem[] }).data
          ?? (payRes.data as { items?: PaymentApiItem[] }).items
          ?? (Array.isArray(payRes.data) ? payRes.data : []);
        const mapped: PaymentHistory[] = (raw as PaymentApiItem[]).map((item) => {
          const dateStr = item.paidAt ?? item.createdAt ?? '';
          const { date, time } = dateStr ? formatDateParts(dateStr) : { date: '', time: '' };
          const normalizedStatus = (item.status === 'CANCELLED' || item.status === 'REFUNDED') ? 'cancelled' as const : 'completed' as const;
          const iconInfo = getPaymentIcon(item.status ?? '');
          return {
            id: item.id,
            title: item.title ?? item.productName ?? '',
            date,
            time,
            amount: item.amount ?? item.totalAmount ?? 0,
            status: normalizedStatus,
            icon: iconInfo.icon,
            iconBgClass: iconInfo.bg,
            iconColorClass: iconInfo.color,
          };
        });
        setPaymentHistory(groupByMonth(mapped));
      } else {
        setPaymentHistory([]);
      }

      // 사용 내역 변환
      if (usageRes.success && usageRes.data) {
        const raw = (usageRes.data as { data?: UsageApiItem[]; items?: UsageApiItem[]; transactions?: UsageApiItem[] }).data
          ?? (usageRes.data as { items?: UsageApiItem[] }).items
          ?? (usageRes.data as { transactions?: UsageApiItem[] }).transactions
          ?? (Array.isArray(usageRes.data) ? usageRes.data : []);
        const mapped: UsageHistory[] = (raw as UsageApiItem[]).map((item) => {
          const dateStr = item.createdAt ?? '';
          const { date, time } = dateStr ? formatDateParts(dateStr) : { date: '', time: '' };
          const rawType = (item.type ?? item.transactionType ?? 'deduction').toLowerCase();
          // [Step 7 2026-05-19] 감독 조정 트랜잭션 인식 — adjustedBy 가 truthy 이거나
          //   type 이 adjusted_positive/adjusted_negative 인 경우 'adjusted' 타입 부여.
          //   백엔드 응답 확장 대비 (graceful degradation — 미포함 시 기존 동작 유지).
          const isAdjusted =
            !!item.adjustedBy ||
            rawType === 'adjusted_positive' ||
            rawType === 'adjusted_negative' ||
            rawType === 'adjusted';
          const type: UsageHistory['type'] = isAdjusted
            ? 'adjusted'
            : rawType === 'restore'
              ? 'restore'
              : rawType === 'expired'
                ? 'expired'
                : 'deduction';
          // adjusted_negative 의 경우 amount 가 양수로 와도 부호를 반영.
          let credits = item.credits ?? item.amount ?? 0;
          if (isAdjusted && rawType === 'adjusted_negative' && credits > 0) {
            credits = -credits;
          }
          return {
            id: item.id,
            className: item.className ?? '',
            date,
            time,
            credits,
            type,
            coachName: item.coachName ?? item.adjustedByName ?? '',
            reason: item.reason,
          };
        });
        setUsageHistory(groupByMonth(mapped));
      } else {
        setUsageHistory([]);
      }
    } catch {
      setPaymentHistory([]);
      setUsageHistory([]);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedChildId) {
      loadHistory(selectedChildId);
    }
  }, [selectedChildId, loadHistory]);

  const selectedChild = children.find((c) => c.id === selectedChildId) ?? children[0];

  // [W3.B 2026-05-18 / Task #4] 검색·정렬 적용 — paymentHistory/usageHistory 가공.
  //   검색: 자녀 이름은 외부 selectedChild, 상품명(title/className) 부분 일치.
  //   정렬: MonthGroup 내부 items 만 정렬 (월 그룹은 유지 — 시간 가독성 보존).
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const applyFilterAndSort = <T extends { id: string }>(
    groups: MonthGroup<T>[],
    pick: (item: T) => { title: string; sortKey: number; amount: number },
  ): MonthGroup<T>[] => {
    return groups
      .map((group) => {
        const filtered = normalizedQuery
          ? group.items.filter((item) => pick(item).title.toLowerCase().includes(normalizedQuery))
          : group.items;
        const sorted = [...filtered].sort((a, b) => {
          const pa = pick(a);
          const pb = pick(b);
          switch (sortOrder) {
            case 'recent': return pb.sortKey - pa.sortKey;
            case 'oldest': return pa.sortKey - pb.sortKey;
            case 'amountHigh': return pb.amount - pa.amount;
            case 'amountLow': return pa.amount - pb.amount;
          }
        });
        return { ...group, items: sorted, count: sorted.length };
      })
      .filter((group) => group.items.length > 0);
  };

  const visiblePaymentHistory = applyFilterAndSort(paymentHistory, (item) => ({
    title: item.title,
    sortKey: new Date(`${item.date} ${item.time}`).getTime() || 0,
    amount: item.amount,
  }));
  const visibleUsageHistory = applyFilterAndSort(usageHistory, (item) => ({
    title: item.className,
    sortKey: new Date(`${item.date} ${item.time}`).getTime() || 0,
    amount: Math.abs(item.credits),
  }));

  // [v16 2026-05-16] 이중 로더 제거 — LoadingProvider 풀스크린 로더가 usePageReady 신호로 종료.
  if (isLoading) return null;

  return (
    <MobileContainer hasBottomNav>
      {/* [Task #12 2026-05-14] forceNative — App/Web 동일 4-액션 헤더 단일 노출.
          PageAppBar variant=default → [← 뒤로] [타이틀] [⏰ 🔔 ≡] 자동 렌더.
          showBack → useNavigation().back() 내장 핸들러로 뒤로가기 동작.
          [W3.B 2026-05-18 / Task #4] extraActions — 검색·정렬 액션 추가 (이전: 새로고침 단독).
            결제 내역에서 자녀 이름·상품명 검색 + 정렬(최신/오래된/금액) 지원. */}
      <PageAppBar
        title="결제 및 수업권"
        showBack
        forceNative
        extraActions={[
          {
            icon: 'search',
            onClick: () => setIsSearchOpen((prev) => !prev),
            label: '검색 열기',
          },
          {
            icon: 'sort',
            onClick: () => setIsSortSheetOpen(true),
            label: '정렬 변경',
          },
        ]}
      />

      {/* 검색바 — extraActions 검색 아이콘 토글로 노출/숨김 */}
      {isSearchOpen && (
        <div className="px-4 pt-3 pb-1 bg-wbg dark:bg-puck border-b border-wline-2 dark:border-rink-700">
          <div className="flex items-center gap-2 bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-w-md px-3 py-2.5">
            <Icon name="search" className="text-card-emphasis text-wtext-3 dark:text-rink-300" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="자녀 이름 또는 상품명으로 검색"
              aria-label="결제 내역 검색"
              className="flex-1 bg-transparent border-0 outline-none text-card-body text-wtext-1 dark:text-white placeholder-wtext-3 dark:placeholder-rink-300"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="검색어 지우기"
                className="text-wtext-3 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100"
              >
                <Icon name="close" className="text-card-emphasis" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* [Task #12 2026-05-14] 스크롤 미동작 회귀 해소.
          이전: `hide-scrollbar flex-1 overflow-y-auto` 만 → Android WebView 에서
                flex-1 의 min-height:auto 기본값 + 부모 pb-[calc(60px+sa)] 가
                충돌하여 스크롤 영역 height=0 으로 계산되는 회귀 발생.
          조치: (1) `min-h-0` 명시(MobileContainer `[&>*]:min-h-0` 셀렉터에 의존하지 않고
                    페이지에서 직접 강제 — WebView 의 selector 우선순위 평가 차이 회피),
                (2) `touch-pan-y` (Tailwind utility) 로 세로 스크롤 제스처 명시,
                (3) `overscroll-contain` 로 BottomNav 침범 시 부모 바운스 차단.
          상세: docs/Architecture/SCREEN_METRICS.md §"WebView 스크롤 가드" */}
      <div className="hide-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y bg-wbg dark:bg-puck">
        {/* 자녀 선택 탭
            [수정 2026-05-15 T05-K] 카테고리(자녀) UI 잘림 회귀 수정.
              이전: `flex flex-1 + gap-2` — 4명 이상이면 버튼 폭이 28px 이하로 좁아져
                    아이콘 + 이름이 잘리는 사용자 제보.
              조치:
                · 자녀 3명 이하 → 기존 균등 분배 (flex-1) 유지
                · 자녀 4명 이상 → 가로 스크롤 (overflow-x-auto + snap)
                  · whitespace-nowrap, shrink-0 으로 라벨 보존
                  · hide-scrollbar 클래스로 스크롤바 시각 노출 차단 */}
        {children.length > 1 && (
          <section className="px-4 pt-3" aria-label="자녀 선택">
            <div
              className={cn(
                'flex gap-2',
                children.length >= 4
                  ? 'overflow-x-auto hide-scrollbar snap-x snap-mandatory'
                  : '',
              )}
              role="tablist"
            >
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  role="tab"
                  onClick={() => setSelectedChildId(child.id)}
                  aria-label={`${child.name} 결제권 보기`}
                  aria-selected={selectedChildId === child.id}
                  aria-pressed={selectedChildId === child.id}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-w-md min-h-[48px] py-2.5 px-4 text-card-body font-semibold whitespace-nowrap snap-start transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                    children.length >= 4 ? 'shrink-0' : 'flex-1',
                    selectedChildId === child.id
                      ? 'bg-ice-500 text-white shadow-sh-1'
                      : 'bg-wsurface text-wtext-3 hover:bg-wline dark:bg-rink-800 dark:text-wtext-3 dark:hover:bg-rink-700 border border-wline dark:border-rink-700',
                  )}
                >
                  <Icon name="person" className="text-[16px] shrink-0" aria-hidden="true" />
                  <span className="truncate">{child.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 결제권 잔액 카드 */}
        {selectedChild && (
          <section
            className="px-4 pt-3"
            aria-label="결제권 잔액"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="overflow-hidden rounded-w-xl bg-wsurface shadow-sh-2 border border-wline p-6 dark:bg-rink-800 dark:border-rink-700">
              <div className="flex flex-col gap-5">
                {/* 상단: 라벨 + 아이콘 */}
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-card-meta font-bold uppercase tracking-wider text-wtext-4 dark:text-wtext-3">
                      <Icon name="account_balance_wallet" className="text-[14px]" aria-hidden="true" />
                      잔여 결제권
                    </span>
                    <span className="text-card-body font-semibold text-wtext-2 dark:text-rink-200">
                      {selectedChild.name}의 {MESSAGES.dashboard.parentDashboard.creditSummary}
                    </span>
                  </div>
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-w-lg bg-ice-100 text-ice-500 dark:bg-ice-500/15 dark:text-ice-500">
                    <Icon name="stars" className="text-[28px]" aria-hidden="true" />
                  </div>
                </div>

                {/* 결제권 대형 숫자 (hero) */}
                <div className="flex items-end justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-6xl font-black text-wtext-1 tracking-tighter tabular-nums leading-none dark:text-white">
                      {selectedChild.credits}
                    </span>
                    <span className="text-w-h2 font-bold text-wtext-3 dark:text-wtext-3">회</span>
                  </div>
                  {selectedChild.expiringCredits > 0 && (
                    <div className="text-right">
                      <p className="text-card-meta font-medium text-wtext-4 dark:text-wtext-3 uppercase tracking-wider">만료 임박</p>
                      <p className="text-card-emphasis font-bold text-sun-500 dark:text-sun-500 tabular-nums">
                        {selectedChild.expiringCredits}회
                      </p>
                    </div>
                  )}
                </div>

                {/* 만료 예정 경고 — 동적 변경 시 스크린리더 안내 */}
                {selectedChild.expiringCredits > 0 && (
                  <div
                    className="flex items-center gap-2 rounded-lg bg-sun-100 px-3 py-2.5 border border-sun-500/40 dark:bg-sun-500/15 dark:border-sun-500/40"
                    role="alert"
                    aria-live="polite"
                  >
                    <Icon name="warning" className="shrink-0 text-[18px] text-sun-500" aria-hidden="true" />
                    <span className="text-card-meta font-medium text-wtext-2 dark:text-sun-100">
                      <span className="font-bold tabular-nums">{selectedChild.expiringCredits}회</span> 결제권이 <span className="font-bold">{selectedChild.expiringDate}</span>에 만료 예정입니다
                    </span>
                  </div>
                )}

                {/* 구분선 */}
                <div className="h-px w-full bg-wline dark:bg-rink-700" aria-hidden="true" />

                {/* [2026-06-09 심사 3.1.1] 결제권 성격 명시 — 디지털 화폐/콘텐츠 오인 방지 */}
                <p className="flex items-start gap-1.5 text-card-meta leading-relaxed text-wtext-3 dark:text-rink-300">
                  <Icon
                    name="info"
                    className="mt-px shrink-0 text-[14px]"
                    aria-hidden="true"
                  />
                  <span>{MESSAGES.payment2.offlineCreditNotice}</span>
                </p>

                {/* CTA 버튼 */}
                <button
                  onClick={() => navigate('/payment/select')}
                  className="flex w-full items-center justify-center gap-2 rounded-w-md bg-ice-500 py-3.5 text-white shadow-sh-1 transition-colors motion-reduce:transition-none active:brightness-95 hover:bg-ice-700"
                >
                  <Icon name="add_card" className="text-[20px]" aria-hidden="true" />
                  <span className="text-card-body font-bold tracking-wide">
                    결제권 충전하기
                  </span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* 탭 내비게이션 */}
        <section
          className="sticky top-[57px] z-40 mt-4 bg-wbg px-4 pb-2 pt-2 dark:bg-puck"
          aria-label="내역 탭"
        >
          <div
            className="flex rounded-w-md bg-wline-2/60 p-1 dark:bg-rink-800"
            role="tablist"
            aria-label="결제/사용 내역"
          >
            <button
              type="button"
              onClick={() => setActiveTab('payment')}
              role="tab"
              aria-selected={activeTab === 'payment'}
              aria-label="결제 내역 보기"
              className={cn(
                'flex-1 flex items-center justify-center rounded-lg min-h-[48px] py-2.5 text-card-body font-bold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                activeTab === 'payment'
                  ? 'bg-wsurface text-ice-500 shadow-sh-1 dark:bg-rink-700 dark:text-ice-500'
                  : 'text-wtext-3 hover:text-wtext-2 dark:text-wtext-3 dark:hover:text-rink-200',
              )}
            >
              {MESSAGES.dashboard.adminDashboard.payments}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('usage')}
              role="tab"
              aria-selected={activeTab === 'usage'}
              aria-label="결제권 사용 내역 보기"
              className={cn(
                'flex-1 flex items-center justify-center rounded-lg min-h-[48px] py-2.5 text-card-body font-bold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                activeTab === 'usage'
                  ? 'bg-wsurface text-ice-500 shadow-sh-1 dark:bg-rink-700 dark:text-ice-500'
                  : 'text-wtext-3 hover:text-wtext-2 dark:text-wtext-3 dark:hover:text-rink-200',
              )}
            >
              사용 내역
            </button>
          </div>
        </section>

        {/* 탭 콘텐츠 */}
        <main
          className="flex flex-col gap-5 px-4 py-2 pb-8"
          role="tabpanel"
          aria-label={activeTab === 'payment' ? '결제 내역' : '결제권 사용 내역'}
        >
          {activeTab === 'payment' ? (
            /* 결제 내역 */
            <>
              {visiblePaymentHistory.length > 0 ? (
                visiblePaymentHistory.map((group) => (
                  <div key={group.month} className="flex flex-col gap-3">
                    {/* 월 헤더 */}
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-wtext-3">
                        {group.month}
                      </h3>
                      {group.count != null && group.count > 0 && (
                        <span className="rounded-w-pill bg-wline px-2 py-0.5 text-card-meta font-medium text-wtext-4 dark:bg-rink-800 dark:text-wtext-3">
                          총 {group.count}건
                        </span>
                      )}
                    </div>

                    {/* 결제 아이템 */}
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          'flex flex-col gap-3 rounded-w-lg bg-wsurface p-4 shadow-sh-1 border border-wline transition-colors motion-reduce:transition-none dark:bg-rink-800 dark:border-rink-700',
                          item.status === 'cancelled' && 'opacity-80',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex gap-3">
                            {/* 아이콘 */}
                            <div
                              className={cn(
                                'flex size-12 shrink-0 items-center justify-center rounded-w-md',
                                item.iconBgClass,
                              )}
                            >
                              <Icon name={item.icon} className={cn('text-[22px]', item.iconColorClass)} aria-hidden="true" />
                            </div>
                            {/* 정보 */}
                            <div className="flex flex-col justify-center gap-0.5">
                              <h4
                                className={cn(
                                  'text-card-emphasis font-bold leading-tight',
                                  item.status === 'cancelled'
                                    ? 'text-wtext-3 line-through decoration-wtext-4/50 dark:text-wtext-3'
                                    : 'text-wtext-1 dark:text-white',
                                )}
                              >
                                {item.title}
                              </h4>
                              <span className="text-card-meta font-medium text-wtext-3 dark:text-wtext-3">
                                {item.date} {'\u00B7'} {item.time}
                              </span>
                            </div>
                          </div>
                          {/* 금액 */}
                          <p
                            className={cn(
                              'text-card-emphasis font-semibold shrink-0 tabular-nums text-right tracking-tight',
                              item.status === 'cancelled'
                                ? 'text-wtext-4 line-through decoration-slate-400/50 dark:text-wtext-3'
                                : 'text-wtext-1 dark:text-white',
                            )}
                          >
                            {formatAmount(item.amount)}원
                          </p>
                        </div>

                        {/* 하단: 상태 + 영수증 */}
                        <div className="flex items-center justify-between border-t border-wline pt-3 dark:border-rink-700">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                'flex size-2 rounded-w-pill',
                                item.status === 'completed' ? 'bg-mint-500' : 'bg-flame-500',
                              )}
                              aria-hidden="true"
                            />
                            <span
                              className={cn(
                                'text-card-meta font-semibold',
                                item.status === 'completed'
                                  ? 'text-mint-500 dark:text-mint-500'
                                  : 'text-flame-500 dark:text-flame-500',
                              )}
                            >
                              {item.status === 'completed' ? MESSAGES.payment.success : MESSAGES.payment.fail}
                            </span>
                          </div>
                          {item.status === 'completed' ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/payment/receipt/${item.id}`)}
                              aria-label={`${item.title || '결제'} 영수증 보기`}
                              className="inline-flex items-center min-h-[48px] px-1 text-card-body font-medium text-ice-500 hover:text-ice-700 underline underline-offset-2 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 rounded"
                            >
                              영수증 보기
                            </button>
                          ) : (
                            <span className="text-card-meta font-medium text-wtext-4 dark:text-wtext-3">
                              환불 완료
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex size-14 items-center justify-center rounded-w-pill bg-wline mb-3 dark:bg-rink-800">
                    <Icon name="credit_card_off" className="text-[28px] text-wtext-4 dark:text-wtext-3" aria-hidden="true" />
                  </div>
                  <p className="text-card-body font-medium text-wtext-3 dark:text-wtext-4">
                    {MESSAGES.payment2.emptyPaymentHistory}
                  </p>
                  <p className="mt-1 text-card-meta text-wtext-4 dark:text-wtext-3">
                    {MESSAGES.payment2.paymentHistoryHint}
                  </p>
                </div>
              )}
            </>
          ) : (
            /* 사용 내역 */
            <>
              {visibleUsageHistory.length > 0 ? (
                visibleUsageHistory.map((group) => (
                  <div key={group.month} className="flex flex-col gap-3">
                    {/* 월 헤더 */}
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-wtext-3">
                        {group.month}
                      </h3>
                      {group.count != null && group.count > 0 && (
                        <span className="rounded-w-pill bg-wline px-2 py-0.5 text-card-meta font-medium text-wtext-4 dark:bg-rink-800 dark:text-wtext-3">
                          총 {group.count}건
                        </span>
                      )}
                    </div>

                    {/* 사용 아이템 */}
                    {group.items.map((item) => {
                      // [Step 7 2026-05-19] 감독 조정은 credits 부호로 아이콘/색 분기.
                      const iconInfo = getUsageIcon(item.type, item.credits);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-w-lg bg-wsurface p-4 shadow-sh-1 border border-wline dark:bg-rink-800 dark:border-rink-700"
                        >
                          {/* 아이콘 */}
                          <div
                            className={cn(
                              'flex size-12 shrink-0 items-center justify-center rounded-w-md',
                              iconInfo.bg,
                            )}
                          >
                            <Icon name={iconInfo.name} className={cn('text-[22px]', iconInfo.color)} aria-hidden="true" />
                          </div>

                          {/* 정보 */}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-card-body font-bold text-wtext-1 leading-tight truncate dark:text-white">
                              {item.className}
                            </h4>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-card-meta text-wtext-3 dark:text-wtext-4">
                                {item.date} {'\u00B7'} {item.time}
                              </span>
                              {item.coachName && (
                                <>
                                  <span className="text-card-meta text-wtext-4 dark:text-wtext-3">{'\u00B7'}</span>
                                  <span className="text-card-meta text-wtext-3 dark:text-wtext-4">{item.coachName}</span>
                                </>
                              )}
                            </div>
                            <span className={cn('mt-1 inline-block text-card-meta font-semibold', getUsageTypeColor(item.type, item.credits))}>
                              {getUsageTypeLabel(item.type, item.credits, item.reason)}
                            </span>
                          </div>

                          {/* 결제권 수 */}
                          <div className="shrink-0 text-right">
                            <span
                              className={cn(
                                'text-card-emphasis font-bold tabular-nums',
                                item.credits > 0
                                  ? 'text-mint-500 dark:text-mint-500'
                                  : item.type === 'expired'
                                    ? 'text-wtext-4 dark:text-wtext-3'
                                    : 'text-flame-500 dark:text-flame-500',
                              )}
                            >
                              {item.credits > 0 ? '+' : ''}{item.credits}회
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex size-14 items-center justify-center rounded-w-pill bg-wline mb-3 dark:bg-rink-800">
                    <Icon name="history" className="text-[28px] text-wtext-4 dark:text-wtext-3" aria-hidden="true" />
                  </div>
                  <p className="text-card-body font-medium text-wtext-3 dark:text-wtext-4">
                    {MESSAGES.payment2.emptyUsageHistory}
                  </p>
                  <p className="mt-1 text-card-meta text-wtext-4 dark:text-wtext-3">
                    {MESSAGES.payment2.usageHistoryHint}
                  </p>
                </div>
              )}
            </>
          )}

          {/* 환불 요청 버튼 */}
          <div className="mt-2">
            <button
              onClick={() => toast.info(MESSAGES.payment2.refundContactInfo)}
              className="flex w-full items-center justify-center gap-2 rounded-w-md border border-wline bg-wsurface py-3.5 text-card-body font-semibold text-wtext-2 transition-colors motion-reduce:transition-none hover:bg-wbg active:brightness-95 dark:border-rink-700 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700"
            >
              <Icon name="currency_exchange" className="text-[18px] text-wtext-3 dark:text-wtext-4" aria-hidden="true" />
              환불 요청하기
            </button>
          </div>

          {/* 하단 안내 */}
          <div className="mt-4 px-2 text-center">
            <p className="text-card-meta leading-relaxed text-wtext-4 dark:text-wtext-3">
              {MESSAGES.payment2.historyNote}
            </p>
          </div>
        </main>

      </div>

      {/* [W3.B 2026-05-18 / Task #4] 정렬 바텀시트 */}
      {isSortSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="정렬 선택"
        >
          <button
            type="button"
            aria-label="정렬 시트 닫기"
            onClick={() => setIsSortSheetOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative w-full max-w-[var(--mobile-shell-width,28rem)] bg-wsurface dark:bg-rink-800 rounded-t-2xl pt-3 pb-safe-4 border-t border-wline-2 dark:border-rink-700">
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-wline-2 dark:bg-rink-700" aria-hidden="true" />
            <h3 className="px-5 pb-2 text-card-emphasis font-bold text-wtext-1 dark:text-white">정렬</h3>
            <ul role="listbox" aria-label="정렬 옵션">
              {SORT_OPTIONS.map((option) => {
                const isActive = sortOrder === option.key;
                return (
                  <li key={option.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        setSortOrder(option.key);
                        setIsSortSheetOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-5 py-4 text-left transition-colors motion-reduce:transition-none active:brightness-95',
                        isActive
                          ? 'bg-ice-500/5 dark:bg-ice-500/15'
                          : 'hover:bg-wbg dark:hover:bg-rink-700',
                      )}
                    >
                      <span
                        className={cn(
                          'text-card-body font-semibold',
                          isActive
                            ? 'text-ice-500'
                            : 'text-wtext-1 dark:text-white',
                        )}
                      >
                        {option.label}
                      </span>
                      {isActive && (
                        <Icon name="check" className="text-card-emphasis text-ice-500" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </MobileContainer>
  );
}
