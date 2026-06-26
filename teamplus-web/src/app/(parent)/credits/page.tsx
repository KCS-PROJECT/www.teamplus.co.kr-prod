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
  // [시안 ParentCredits.jsx] navy hero 하단 누적 발급/사용 통계 2-col.
  //   /credits/stats/{id} 응답에 이미 포함(추가 호출 없음 — graceful degradation).
  totalIssued: number;
  totalUsed: number;
  // 정액(기간제) 수업권 — 회수 차감 없는 무제한권. 회수 표시 대신 만료일 표기.
  //   credits 는 회차권(차감형)만 집계(BD1 가 정액을 회수 합산에서 분리). 혼재 시 둘 다 표시.
  isPeriodPass: boolean;
  periodPassExpiresAt: string;
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
  // ── 백엔드 getCreditStats(GET /credits/stats/:id) 실제 응답 키 (1순위) ──
  //   availableRemaining: 회차권(차감형) 잔여 — 정액(무차감) 제외.
  //   hasActivePeriodPass: 정액 기간제 활성 여부.
  //   periodPassExpiresAt: 정액 만료일.
  availableRemaining?: number;
  hasActivePeriodPass?: boolean;
  periodPassExpiresAt?: string;
  periodPassCount?: number;
  periodPasses?: unknown[];
  totalRemaining?: number;
  // [시안] 누적 발급/사용 — 백엔드 /credits/stats SoT (totalIssued/totalUsed).
  totalIssued?: number;
  totalUsed?: number;
  // ── 구 호환 폴백 키 (백엔드 미제공 시 안전 폴백, 2순위) ──
  available?: number;
  totalCredits?: number;
  expiringCredits?: number;
  expiringDate?: string;
  nearestExpiryDate?: string;
  isPeriodPass?: boolean;
  hasPeriodPass?: boolean;
  feeType?: string;
  periodPassExpiry?: string;
  expiresAt?: string;
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
    return { icon: 'remove_shopping_cart', bg: 'bg-it-fill dark:bg-rink-700', color: 'text-it-ink-400 dark:text-wtext-3' };
  }
  return { icon: 'confirmation_number', bg: 'bg-it-blue-50 dark:bg-it-blue-500/15', color: 'text-it-blue-500' };
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
    case 'deduction': return 'text-it-red-500';
    case 'restore': return 'text-success';
    case 'expired': return 'text-it-ink-400 dark:text-wtext-3';
    case 'adjusted':
      // 감독 조정 양수: it-blue (파랑 — 추가/혜택), 음수: it-red (차감/주의)
      return credits >= 0
        ? 'text-it-blue-500'
        : 'text-it-red-500';
  }
}

function getUsageIcon(type: UsageHistory['type'], credits: number = 0) {
  switch (type) {
    case 'deduction':
      return { name: 'remove_circle_outline', bg: 'bg-it-red-50 dark:bg-it-red-500/15', color: 'text-it-red-500' };
    case 'restore':
      return { name: 'replay', bg: 'bg-success-100 dark:bg-success-700/20', color: 'text-success' };
    case 'expired':
      return { name: 'schedule', bg: 'bg-it-fill dark:bg-rink-700', color: 'text-it-ink-400 dark:text-wtext-3' };
    case 'adjusted':
      // 감독 조정은 'tune' 아이콘 — 양수/음수 부호로 색상 분기.
      return credits >= 0
        ? { name: 'tune', bg: 'bg-it-blue-50 dark:bg-it-blue-500/15', color: 'text-it-blue-500' }
        : { name: 'tune', bg: 'bg-it-red-50 dark:bg-it-red-500/15', color: 'text-it-red-500' };
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
              // 회차권 잔여(정액 제외) — 백엔드 availableRemaining 1순위, 구 키 폴백.
              credits:
                credit.availableRemaining ??
                credit.available ??
                credit.totalCredits ??
                0,
              expiringCredits: credit.expiringCredits ?? 0,
              expiringDate: credit.nearestExpiryDate ?? credit.expiringDate ?? '',
              totalIssued: credit.totalIssued ?? 0,
              totalUsed: credit.totalUsed ?? 0,
              // 정액 기간제 활성 — 백엔드 hasActivePeriodPass 1순위, 구 키/feeType 폴백.
              isPeriodPass:
                credit.hasActivePeriodPass ??
                credit.isPeriodPass ??
                credit.hasPeriodPass ??
                credit.feeType === 'MONTHLY_FIXED',
              periodPassExpiresAt:
                credit.periodPassExpiresAt ??
                credit.periodPassExpiry ??
                credit.expiresAt ??
                '',
            };
          } catch {
            return {
              id: child.id,
              name: `${child.lastName}${child.firstName}`,
              credits: 0,
              expiringCredits: 0,
              expiringDate: '',
              totalIssued: 0,
              totalUsed: 0,
              isPeriodPass: false,
              periodPassExpiresAt: '',
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
        <div className="px-4 pt-3 pb-1 bg-it-canvas dark:bg-puck border-b border-it-line-strong dark:border-rink-700">
          <div className="flex items-center gap-2 bg-it-surface dark:bg-rink-800 border border-it-line dark:border-rink-700 rounded-w-md px-3 py-2.5">
            <Icon name="search" className="text-card-emphasis text-it-ink-500 dark:text-rink-300" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="자녀 이름 또는 상품명으로 검색"
              aria-label="결제 내역 검색"
              className="flex-1 bg-transparent border-0 outline-none text-card-body text-it-ink-900 dark:text-white placeholder-it-ink-400 dark:placeholder-rink-300"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="검색어 지우기"
                className="text-it-ink-500 dark:text-rink-300 hover:text-it-ink-700 dark:hover:text-rink-100"
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
      <div className="hide-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y bg-it-canvas dark:bg-puck">
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
                    /* [시안 Chip 1:1] pill h-[42px] px-4, fs14/700, blue active fill /
                       비활성 흰 표면 + line-strong 1.5px border (사각 person 칩 → pill) */
                    'flex items-center justify-center gap-1.5 rounded-w-pill h-[42px] px-4 text-[14px] font-bold tracking-[-0.01em] whitespace-nowrap snap-start transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                    children.length >= 4 ? 'shrink-0' : 'flex-1',
                    selectedChildId === child.id
                      ? 'bg-it-blue-500 text-white border-[1.5px] border-it-blue-500'
                      : 'bg-it-surface text-it-ink-600 hover:bg-it-fill dark:bg-rink-800 dark:text-wtext-3 dark:hover:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-700',
                  )}
                >
                  <span className="truncate">{child.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 결제권 잔액 — ICETIMES navy 히어로 밴드 (full-bleed, 카드 박스 제거) */}
        {selectedChild && (
          <section
            className="bg-it-blue-800 dark:bg-it-blue-950 px-4 pt-[22px] pb-6"
            aria-label="결제권 잔액"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {/* [시안 ParentCredits.jsx 1:1] 라벨 — "{자녀명} · 보유 결제권"
                fs11/700 uppercase tracking 0.12em white/soft 단일 행 */}
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
              <Icon name="account_balance_wallet" className="text-[14px]" aria-hidden="true" />
              {selectedChild.name} · {MESSAGES.dashboard.parentDashboard.creditSummary}
            </div>

            {selectedChild.isPeriodPass ? (
              /* 정액(기간제) — 회수 차감 없음. "이 달 무제한" + 만료일 표기. */
              <>
                <div className="mt-2">
                  <span className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] text-white">
                    {MESSAGES.credits.periodPass.unlimited}
                  </span>
                </div>
                {selectedChild.periodPassExpiresAt && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-w-pill bg-white/[0.12] px-[11px] py-[5px] text-[12.5px] font-bold text-white/85">
                    <Icon name="event_available" className="text-[15px]" aria-hidden="true" />
                    <span className="tabular-nums">
                      {MESSAGES.credits.periodPass.expiresLabel(selectedChild.periodPassExpiresAt)}
                    </span>
                  </div>
                )}
                {/* 혼재 — 회차권(차감형)도 보유 시 회수 별도 표기. */}
                {selectedChild.credits > 0 && (
                  <div className="mt-2 text-[13px] font-semibold text-white/70 tabular-nums">
                    {MESSAGES.credits.periodPass.sessionPassCount(selectedChild.credits)}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* [시안] 금액 38px/800 + "회" 19px/700 (text-6xl 60px 과대 → 시안 스케일) */}
                <div className="mt-2 flex items-baseline gap-[3px]">
                  <span className="text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] text-white tabular-nums">
                    {selectedChild.credits}
                  </span>
                  <span className="text-[19px] font-bold text-white">회</span>
                </div>

                {/* [시안] 만료 임박 — 단일 inline pill (우측 블록 + alert 박스 → 통합)
                    bg white/.12, schedule icon, 연한 적색 텍스트 12.5/700 */}
                {selectedChild.expiringCredits > 0 && (
                  <div
                    className="mt-3 inline-flex items-center gap-1.5 rounded-w-pill bg-white/[0.12] px-[11px] py-[5px] text-[12.5px] font-bold text-it-red-200"
                    role="alert"
                    aria-live="polite"
                  >
                    <Icon name="schedule" className="text-[15px]" aria-hidden="true" />
                    <span className="tabular-nums">
                      {selectedChild.expiringDate
                        ? `${selectedChild.expiringDate} ${selectedChild.expiringCredits}회 만료`
                        : `${selectedChild.expiringCredits}회 만료 예정`}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* [시안] 누적 발급/사용 2-col — 상단 border, fs18/800 */}
            <div className="mt-[18px] flex gap-6 border-t border-white/[0.14] pt-4">
              <div>
                <div className="text-[12px] text-white/60">누적 발급</div>
                <div className="mt-[3px] text-[18px] font-extrabold text-white tabular-nums">
                  {selectedChild.totalIssued}
                  <span className="text-[12px] font-semibold text-white/60"> 회</span>
                </div>
              </div>
              <div>
                <div className="text-[12px] text-white/60">누적 사용</div>
                <div className="mt-[3px] text-[18px] font-extrabold text-white tabular-nums">
                  {selectedChild.totalUsed}
                  <span className="text-[12px] font-semibold text-white/60"> 회</span>
                </div>
              </div>
            </div>

            {/* CTA 버튼 — ICETIMES accent(red) (시안 Button accent lg) */}
            <button
              onClick={() => navigate('/payment/select')}
              className="mt-[18px] flex w-full items-center justify-center gap-2 rounded-w-md bg-it-red-500 py-3.5 text-white shadow-sh-1 transition-colors motion-reduce:transition-none active:brightness-95 hover:bg-it-red-600"
            >
              <Icon name="add_card" className="text-[20px]" aria-hidden="true" />
              <span className="text-card-body font-bold tracking-wide">
                결제권 충전하기
              </span>
            </button>

            {/* [2026-06-09 심사 3.1.1] 결제권 성격 명시 — 디지털 화폐/콘텐츠 오인 방지 (기능 보존) */}
            <p className="mt-3 flex items-start gap-1.5 text-card-meta leading-relaxed text-white/55">
              <Icon
                name="info"
                className="mt-px shrink-0 text-[14px]"
                aria-hidden="true"
              />
              <span>{MESSAGES.payment2.offlineCreditNotice}</span>
            </p>
          </section>
        )}

        {/* 탭 내비게이션 — [시안 SegmentedTabs 1:1] 8px 갭 위 full-width 흰 세그먼트.
            pill 토글 → underline 탭 (blue active 800 + blue 2.5px underline). */}
        <section
          className="sticky top-[57px] z-40 mt-2 dark:bg-puck"
          aria-label="내역 탭"
        >
          <div
            className="flex border-b border-it-line bg-it-surface dark:border-rink-700 dark:bg-rink-800"
            role="tablist"
            aria-label="결제/사용 내역"
          >
            {([
              { key: 'payment' as const, label: MESSAGES.dashboard.adminDashboard.payments, aria: '결제 내역 보기' },
              { key: 'usage' as const, label: '사용 내역', aria: '결제권 사용 내역 보기' },
            ]).map((t) => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  role="tab"
                  aria-selected={active}
                  aria-label={t.aria}
                  className={cn(
                    'relative flex-1 min-h-[48px] px-1 pb-[13px] pt-[14px] text-[15px] tracking-[-0.01em] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40',
                    active
                      ? 'font-extrabold text-it-blue-600 dark:text-it-blue-300'
                      : 'font-semibold text-it-ink-500 dark:text-wtext-3',
                  )}
                >
                  {t.label}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-x-0 -bottom-px h-[2.5px] rounded-[2px]',
                      active ? 'bg-it-blue-500' : 'bg-transparent',
                    )}
                  />
                </button>
              );
            })}
          </div>
        </section>

        {/* 탭 콘텐츠 — ICETIMES flat 섹션 (8px 회색 갭 위 흰 패널) */}
        <main
          className="flex flex-col gap-2 py-2 pb-8"
          role="tabpanel"
          aria-label={activeTab === 'payment' ? '결제 내역' : '결제권 사용 내역'}
        >
          {activeTab === 'payment' ? (
            /* 결제 내역 */
            <>
              {visiblePaymentHistory.length > 0 ? (
                visiblePaymentHistory.map((group) => (
                  <section key={group.month} className="bg-it-surface dark:bg-rink-800 px-4 pt-3.5 pb-1.5">
                    {/* [시안] 월 헤더 — fs12.5/800/faint (총N건 pill 제거) */}
                    <div className="mb-1 text-[12.5px] font-extrabold text-it-ink-400 dark:text-wtext-3">
                      {group.month}
                    </div>

                    {/* [시안 PRow 1:1] 단일 행 — 아이콘44 / title15·sub12.5 / 우측 금액15·상태11.5 */}
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          'flex items-center gap-3 border-b border-it-line py-[13px] last:border-b-0 dark:border-rink-700',
                          item.status === 'cancelled' && 'opacity-60',
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex gap-3">
                            {/* 아이콘 */}
                            <div
                              className={cn(
                                'flex size-11 shrink-0 items-center justify-center rounded-w-md',
                                item.iconBgClass,
                              )}
                            >
                              <Icon name={item.icon} className={cn('text-[22px]', item.iconColorClass)} aria-hidden="true" />
                            </div>
                            {/* 정보 */}
                            <div className="flex min-w-0 flex-col justify-center gap-0.5">
                              <h4
                                className={cn(
                                  'truncate text-[15px] font-bold leading-tight',
                                  item.status === 'cancelled'
                                    ? 'text-it-ink-500 line-through decoration-it-ink-400/50 dark:text-wtext-3'
                                    : 'text-it-ink-900 dark:text-white',
                                )}
                              >
                                {item.title}
                              </h4>
                              <span className="text-[12.5px] text-it-ink-500 dark:text-wtext-3 tabular-nums">
                                {item.date} {'\u00B7'} {item.time}
                              </span>
                            </div>
                          </div>
                        </div>
                        {/* 우측 — 금액 15/800 + rightSub 11.5(상태/영수증·환불 기능 보존) */}
                        <div className="shrink-0 text-right">
                          <div
                            className={cn(
                              'text-[15px] font-extrabold tabular-nums tracking-tight',
                              item.status === 'cancelled'
                                ? 'text-it-ink-400 line-through decoration-it-ink-300/50 dark:text-wtext-3'
                                : 'text-it-ink-900 dark:text-white',
                            )}
                          >
                            {formatAmount(item.amount)}원
                          </div>
                          {item.status === 'completed' ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/payment/receipt/${item.id}`)}
                              aria-label={`${item.title || '결제'} 영수증 보기`}
                              className="mt-0.5 inline-flex items-center text-[11.5px] font-semibold text-success underline underline-offset-2 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 rounded"
                            >
                              {MESSAGES.payment.success}
                            </button>
                          ) : (
                            <span className="mt-0.5 block text-[11.5px] font-semibold text-it-ink-400 dark:text-wtext-3">
                              환불 완료
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </section>
                ))
              ) : (
                <div className="bg-it-surface dark:bg-rink-800 flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex size-14 items-center justify-center rounded-w-pill bg-it-fill mb-3 dark:bg-rink-700">
                    <Icon name="credit_card_off" className="text-[28px] text-it-ink-400 dark:text-wtext-3" aria-hidden="true" />
                  </div>
                  <p className="text-card-body font-medium text-it-ink-500 dark:text-wtext-4">
                    {MESSAGES.payment2.emptyPaymentHistory}
                  </p>
                  <p className="mt-1 text-card-meta text-it-ink-400 dark:text-wtext-3">
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
                  <section key={group.month} className="bg-it-surface dark:bg-rink-800 px-4 pt-3.5 pb-1.5">
                    {/* [시안] 월 헤더 — fs12.5/800/faint (총N건 pill 제거) */}
                    <div className="mb-1 text-[12.5px] font-extrabold text-it-ink-400 dark:text-wtext-3">
                      {group.month}
                    </div>

                    {/* 사용 아이템 — flat hairline 행 (시안 PRow) */}
                    {group.items.map((item) => {
                      // [Step 7 2026-05-19] 감독 조정은 credits 부호로 아이콘/색 분기.
                      const iconInfo = getUsageIcon(item.type, item.credits);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 border-b border-it-line py-3.5 last:border-b-0 dark:border-rink-700"
                        >
                          {/* 아이콘 */}
                          <div
                            className={cn(
                              'flex size-11 shrink-0 items-center justify-center rounded-w-md',
                              iconInfo.bg,
                            )}
                          >
                            <Icon name={iconInfo.name} className={cn('text-[22px]', iconInfo.color)} aria-hidden="true" />
                          </div>

                          {/* 정보 */}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[15px] font-bold text-it-ink-900 leading-tight truncate dark:text-white">
                              {item.className}
                            </h4>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-card-meta text-it-ink-500 dark:text-wtext-4">
                                {item.date} {'\u00B7'} {item.time}
                              </span>
                              {item.coachName && (
                                <>
                                  <span className="text-card-meta text-it-ink-400 dark:text-wtext-3">{'\u00B7'}</span>
                                  <span className="text-card-meta text-it-ink-500 dark:text-wtext-4">{item.coachName}</span>
                                </>
                              )}
                            </div>
                            <span className={cn('mt-1 inline-block text-card-meta font-semibold', getUsageTypeColor(item.type, item.credits))}>
                              {getUsageTypeLabel(item.type, item.credits, item.reason)}
                            </span>
                          </div>

                          {/* 결제권 수 — [시안] 우측 15/800. 차감(-1회) blue-600 / 복원 success / 만료 faint */}
                          <div className="shrink-0 text-right">
                            <span
                              className={cn(
                                'text-[15px] font-extrabold tabular-nums',
                                item.credits > 0
                                  ? 'text-success'
                                  : item.type === 'expired'
                                    ? 'text-it-ink-400 dark:text-wtext-3'
                                    : 'text-it-blue-600 dark:text-it-blue-300',
                              )}
                            >
                              {item.credits > 0 ? '+' : ''}{item.credits}회
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                ))
              ) : (
                <div className="bg-it-surface dark:bg-rink-800 flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex size-14 items-center justify-center rounded-w-pill bg-it-fill mb-3 dark:bg-rink-700">
                    <Icon name="history" className="text-[28px] text-it-ink-400 dark:text-wtext-3" aria-hidden="true" />
                  </div>
                  <p className="text-card-body font-medium text-it-ink-500 dark:text-wtext-4">
                    {MESSAGES.payment2.emptyUsageHistory}
                  </p>
                  <p className="mt-1 text-card-meta text-it-ink-400 dark:text-wtext-3">
                    {MESSAGES.payment2.usageHistoryHint}
                  </p>
                </div>
              )}
            </>
          )}

          {/* 환불 요청 버튼 */}
          <div className="mt-2 px-4">
            <button
              onClick={() => toast.info(MESSAGES.payment2.refundContactInfo)}
              className="flex w-full items-center justify-center gap-2 rounded-w-md border border-it-line-strong bg-it-surface py-3.5 text-card-body font-semibold text-it-ink-700 transition-colors motion-reduce:transition-none hover:bg-it-fill active:brightness-95 dark:border-rink-700 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700"
            >
              <Icon name="currency_exchange" className="text-[18px] text-it-ink-500 dark:text-wtext-4" aria-hidden="true" />
              환불 요청하기
            </button>
          </div>

          {/* 하단 안내 */}
          <div className="mt-4 px-4 text-center">
            <p className="text-card-meta leading-relaxed text-it-ink-400 dark:text-wtext-3">
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
          <div className="relative w-full max-w-[var(--mobile-shell-width,28rem)] bg-it-surface dark:bg-rink-800 rounded-t-2xl pt-3 pb-safe-4 border-t border-it-line-strong dark:border-rink-700">
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-it-line-strong dark:bg-rink-700" aria-hidden="true" />
            <h3 className="px-5 pb-2 text-card-emphasis font-bold text-it-ink-900 dark:text-white">정렬</h3>
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
                          ? 'bg-it-blue-50 dark:bg-it-blue-500/15'
                          : 'hover:bg-it-fill dark:hover:bg-rink-700',
                      )}
                    >
                      <span
                        className={cn(
                          'text-card-body font-semibold',
                          isActive
                            ? 'text-it-blue-600'
                            : 'text-it-ink-900 dark:text-white',
                        )}
                      >
                        {option.label}
                      </span>
                      {isActive && (
                        <Icon name="check" className="text-card-emphasis text-it-blue-600" aria-hidden="true" />
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
