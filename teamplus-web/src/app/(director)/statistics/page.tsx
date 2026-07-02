"use client";

/**
 * 감독 매출 리포트 (감독 전용 /statistics)
 *
 * 구성 (5섹션 — 요약 → 분석 → 관리 → 회원):
 *  1. 매출 요약 — 스코프 토글(월간/연간) + 기간 네비(◀ ▶, 미래 가드) + 총매출·증감·
 *     선불/후불 브레이크다운을 한 섹션에 통합 (컨트롤 → 결과가 한 덩어리로 읽히도록)
 *  2. 매출 추이 차트 — 세그먼트(전체/선불/후불) 토글을 이 섹션 안에 배치
 *     (세그먼트는 추이·수업별 매출에만 적용되는 프론트 로컬 필터)
 *  3. 수업별 매출 (HBar + billingMode 뱃지) — 추이와 세그먼트 상태 공유
 *  4. 수납 관리 — 후불 청구/수납/미수(기간) + 현재 미수금 총액 + 결제 관리 이동.
 *     미수 계열 숫자를 이 섹션 한 곳에만 노출 (Hero 에 red 요소 금지)
 *  5. 회원 현황 (subtitle KPI + 월별 증감 타임라인)
 *  제거: 출석률 추이·수업별 출석률·mock 데이터 전부
 *
 * 데이터:
 *  - statistics.service `getDirectorRevenue(scope, anchor)` 실데이터만 사용
 *  - 실패/빈 데이터 → EmptyChart·빈 상태 (mock/가짜 숫자 금지)
 *  - 팀 격리(managedTeamIds)는 백엔드가 req.user 로 해석 (teamId 미전달)
 *
 * 디자인 (ICETIMES flat):
 *  - Primary it-blue-500(#0e5db0) · 후불 emerald(#10b981) · 강조 it-red-500(#c8202e)
 *  - flat & sectioned — main 회색 캔버스(it-canvas) + mt-2 흰 섹션 누적(카드 박스 제거)
 *  - AI 스타일 금지(gradient/backdrop-blur/컬러그림자) · RULE-D04 파이프/세로구분선 금지
 *  - motion-reduce 대응, focus-visible ring, SR table fallback
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MESSAGES } from "@/lib/messages";
// ⚡ recharts(~90KB gzip)는 dynamic import로 지연 로드 — 초기 번들 감소
// SSR=false: recharts는 ResponsiveContainer가 DOM 측정을 필요로 하므로 클라이언트 전용
import type { TooltipContentProps } from "recharts";

const Bar = dynamic(() => import("recharts").then((m) => m.Bar), {
  ssr: false,
}) as typeof import("recharts").Bar;
const RcBarChart = dynamic(() => import("recharts").then((m) => m.BarChart), {
  ssr: false,
}) as typeof import("recharts").BarChart;
const ResponsiveContainer = dynamic(
  () => import("recharts").then((m) => m.ResponsiveContainer),
  { ssr: false },
) as typeof import("recharts").ResponsiveContainer;
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), {
  ssr: false,
}) as typeof import("recharts").Tooltip;
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), {
  ssr: false,
}) as typeof import("recharts").XAxis;
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), {
  ssr: false,
}) as typeof import("recharts").YAxis;

import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { NavLink } from "@/components/ui/NavLink";
import { usePageReady } from "@/hooks/usePageReady";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useRefreshSubscription } from "@/lib/refresh-bus";
import {
  getDirectorRevenue,
  type BillingMode,
  type DirectorRevenueResponse,
  type RevenueHero,
  type RevenueScope,
  type RevenueSegment,
  type RevenueSeriesPoint,
  type RevenueClassLine,
  type RevenueMemberTrendPoint,
} from "@/services/statistics.service";

// ─── Color tokens (ICETIMES SoT) ─────────────────────
// primary it-blue-500(#0e5db0) · 후불 emerald(#10b981) · 강조 it-red-500(#c8202e).
const COLOR = {
  primary: "#0e5db0",
  emerald: "#10b981",
  slate500: "#6b7a80",
} as const;

// ─── KST 기간 헬퍼 ───────────────────────────────────
function currentKstParts(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "0");
  return { year, month };
}

function currentAnchor(scope: RevenueScope): string {
  const { year, month } = currentKstParts();
  return scope === "month"
    ? `${year}-${String(month).padStart(2, "0")}`
    : `${year}`;
}

function parseMonthAnchor(anchor: string): { year: number; month: number } {
  const [y, m] = anchor.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return currentKstParts();
  return { year: y, month: m };
}

function shiftAnchor(
  scope: RevenueScope,
  anchor: string,
  delta: number,
): string {
  if (scope === "year") {
    const y = Number(anchor);
    return `${(Number.isNaN(y) ? currentKstParts().year : y) + delta}`;
  }
  const { year, month } = parseMonthAnchor(anchor);
  const total = year * 12 + (month - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** 다음(▶) 이동이 현재 KST 기간을 초과하는지 — 초과 시 버튼 비활성 */
function nextDisabled(scope: RevenueScope, anchor: string): boolean {
  const cur = currentKstParts();
  if (scope === "year") return Number(anchor) >= cur.year;
  const { year, month } = parseMonthAnchor(anchor);
  return year * 12 + (month - 1) >= cur.year * 12 + (cur.month - 1);
}

function formatPeriodLabel(scope: RevenueScope, anchor: string): string {
  if (scope === "year") return `${anchor}년`;
  const { year, month } = parseMonthAnchor(anchor);
  return `${year}년 ${month}월`;
}

// ─── 통화 포맷 ───────────────────────────────────────
function formatCurrency(amount: number): string {
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억`;
  if (amount >= 10000) return `${(amount / 10000).toFixed(0)}만`;
  return new Intl.NumberFormat("ko-KR").format(amount);
}

// ─── Main Component ──────────────────────────────────
export default function StatisticsPage() {
  const [scope, setScope] = useState<RevenueScope>("month");
  const [anchor, setAnchor] = useState<string>(() => currentAnchor("month"));
  const [segment, setSegment] = useState<RevenueSegment>("all");
  const [data, setData] = useState<DirectorRevenueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // 풀스크린 로더 fast-path — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await getDirectorRevenue(scope, anchor);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setData(null);
        setHasError(true);
      }
    } catch {
      setData(null);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [scope, anchor]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 결제/출석/회원 mutation 후 ['stats'] 발화 시 재 fetch (teamId 격리는 백엔드 해석).
  useRefreshSubscription("stats", () => {
    void loadData();
  });

  const handleScopeChange = useCallback((next: RevenueScope) => {
    setScope(next);
    setAnchor(currentAnchor(next));
  }, []);

  const handleShift = useCallback(
    (delta: number) => {
      setAnchor((prev) => shiftAnchor(scope, prev, delta));
    },
    [scope],
  );

  const navLabel = formatPeriodLabel(scope, anchor);
  const disableNext = nextDisabled(scope, anchor);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="통계" showBack forceNative />

      <main
        className="hide-scrollbar flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label={MESSAGES.statistics.heroTitle}
      >
        {/* 1. 매출 요약 — 기간 컨트롤 + Hero 숫자를 한 섹션에 (컨트롤 → 결과) */}
        <section
          className="bg-it-surface dark:bg-it-blue-950 px-5 pt-6 pb-6"
          aria-labelledby="revenue-hero"
        >
          <p
            id="revenue-hero"
            className="mb-3 flex items-center gap-1.5 text-card-meta font-bold uppercase tracking-[0.18em] text-it-blue-500"
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-w-pill bg-it-blue-500"
              aria-hidden="true"
            />
            {MESSAGES.statistics.heroTitle}
          </p>
          <ScopeToggle value={scope} onChange={handleScopeChange} />
          <PeriodNav
            label={navLabel}
            onPrev={() => handleShift(-1)}
            onNext={() => handleShift(1)}
            nextDisabled={disableNext}
          />
          {!isLoading && !hasError && data?.hasManagedTeams && (
            <HeroSummary hero={data.hero} />
          )}
        </section>

        {isLoading ? null : hasError ? (
          <ErrorState onRetry={() => void loadData()} />
        ) : !data || !data.hasManagedTeams ? (
          <NoTeamsState />
        ) : (
          <StatisticsContent
            data={data}
            segment={segment}
            onSegmentChange={setSegment}
          />
        )}
      </main>
    </MobileContainer>
  );
}

// ============================================================
// Content (데이터 존재 · 관리 팀 있음)
// ============================================================
function StatisticsContent({
  data,
  segment,
  onSegmentChange,
}: {
  data: DirectorRevenueResponse;
  segment: RevenueSegment;
  onSegmentChange: (s: RevenueSegment) => void;
}) {
  const { hero, series, classRevenue, postpaidStatus, memberSummary, memberTrend } =
    data;

  // 세그먼트 반영 시리즈 합계 (빈 상태 판정)
  const seriesSum = useMemo(
    () =>
      series.reduce((acc, p) => {
        if (segment === "prepaid") return acc + p.prepaid;
        if (segment === "postpaid") return acc + p.postpaid;
        return acc + p.prepaid + p.postpaid;
      }, 0),
    [series, segment],
  );

  // 세그먼트 반영 수업별 매출 (표시값 기준 필터·내림차순 — RULE-C03 불변 정렬)
  const classLines = useMemo(() => {
    const valueOf = (c: RevenueClassLine) =>
      segment === "prepaid"
        ? c.prepaid
        : segment === "postpaid"
          ? c.postpaid
          : c.total;
    return [...classRevenue]
      .filter((c) => valueOf(c) > 0)
      .sort((a, b) => valueOf(b) - valueOf(a));
  }, [classRevenue, segment]);

  const classMax = useMemo(() => {
    const valueOf = (c: RevenueClassLine) =>
      segment === "prepaid"
        ? c.prepaid
        : segment === "postpaid"
          ? c.postpaid
          : c.total;
    return classLines.reduce((max, c) => Math.max(max, valueOf(c)), 0);
  }, [classLines, segment]);

  return (
    <>
      {/* 2. 매출 추이 차트 — 세그먼트 토글 포함 (추이·수업별 매출 공통 필터) */}
      <SectionCard
        icon="bar_chart"
        iconBg="bg-it-blue-50 dark:bg-it-blue-500/15"
        iconColor="text-it-blue-500"
        title={MESSAGES.statistics.revenueTrend}
      >
        <div className="mb-4">
          <SegmentToggle value={segment} onChange={onSegmentChange} />
        </div>
        {seriesSum === 0 ? (
          <EmptyChart label={MESSAGES.statistics.emptyRevenue} />
        ) : (
          <RevenueTrendChart items={series} segment={segment} />
        )}
      </SectionCard>

      {/* 3. 수업별 매출 — 위 세그먼트 상태 공유 */}
      <SectionCard
        icon="sports_hockey"
        iconBg="bg-it-blue-50 dark:bg-it-blue-500/15"
        iconColor="text-it-blue-500"
        title={MESSAGES.statistics.classRevenue}
      >
        {classLines.length === 0 ? (
          <EmptyChart label={MESSAGES.statistics.emptyClassRevenue} />
        ) : (
          <div className="space-y-3">
            {classLines.map((c) => {
              const value =
                segment === "prepaid"
                  ? c.prepaid
                  : segment === "postpaid"
                    ? c.postpaid
                    : c.total;
              return (
                <HBar
                  key={c.classId}
                  label={c.className}
                  badge={<BillingModeBadge mode={c.billingMode} />}
                  topRight={`${formatCurrency(value)}원`}
                  value={value}
                  max={classMax}
                  colorClass="bg-it-blue-500"
                />
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* 4. 수납 관리 — 후불 청구/수납/미수(기간) + 현재 미수금 총액. 후불 수업 없으면 숨김 */}
      {postpaidStatus.hasPostpaid && (
        <SectionCard
          icon="receipt_long"
          iconBg="bg-success-100 dark:bg-success-700/20"
          iconColor="text-success"
          title={MESSAGES.statistics.collectionTitle}
          subtitle={postpaidStatus.periodLabel}
        >
          <div className="grid grid-cols-3 gap-3">
            <PostpaidMetric
              label={MESSAGES.statistics.billed}
              value={postpaidStatus.billed}
              tone="ink"
            />
            <PostpaidMetric
              label={MESSAGES.statistics.collected}
              value={postpaidStatus.collected}
              tone="success"
            />
            <PostpaidMetric
              label={MESSAGES.statistics.postpaidOutstanding}
              value={postpaidStatus.outstanding}
              tone="red"
            />
          </div>
          {/* 현재 미수금 총액 — 기간 무관 누적 pending. 과거분은 캡션으로 안내 */}
          <div className="mt-3 rounded-xl bg-it-red-50 px-4 py-3 dark:bg-it-red-500/10">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-card-body font-semibold text-it-red-500">
                <Icon
                  name="account_balance_wallet"
                  className="text-[18px]"
                  aria-hidden="true"
                />
                {MESSAGES.statistics.outstanding}
              </span>
              <span className="text-card-title font-black tabular-nums text-it-red-500">
                {new Intl.NumberFormat("ko-KR").format(hero.outstanding)}원
              </span>
            </div>
            {postpaidStatus.outstandingPrevious > 0 && (
              <p className="mt-1 text-right text-card-meta font-medium text-it-ink-500 dark:text-wtext-4">
                {MESSAGES.statistics.previousOutstanding}{" "}
                <span className="tabular-nums">
                  {new Intl.NumberFormat("ko-KR").format(
                    postpaidStatus.outstandingPrevious,
                  )}
                </span>
                원
              </p>
            )}
          </div>
          <NavLink
            href="/director-payments"
            className="mt-4 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-it-blue-500 px-4 text-card-body font-bold text-white transition-colors hover:bg-it-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 active:brightness-95 motion-reduce:transition-none"
          >
            <Icon name="payments" className="text-[18px]" aria-hidden="true" />
            {MESSAGES.statistics.goToPayments}
          </NavLink>
        </SectionCard>
      )}

      {/* 5. 회원 현황 */}
      <SectionCard
        icon="groups"
        iconBg="bg-it-blue-50 dark:bg-it-blue-500/15"
        iconColor="text-it-blue-500"
        title={MESSAGES.statistics.memberTitle}
        subtitle={`${MESSAGES.statistics.totalMembers} ${memberSummary.totalMembers.toLocaleString("ko-KR")}명 · ${MESSAGES.statistics.newMembers} +${memberSummary.newMembers.toLocaleString("ko-KR")}명`}
      >
        {memberTrend.length === 0 ? (
          <EmptyChart label={MESSAGES.statistics.emptyMembers} />
        ) : (
          <MemberTrendList items={memberTrend} />
        )}
      </SectionCard>
    </>
  );
}

// ============================================================
// Sub Components
// ============================================================

/** 매출 요약 — 기간 컨트롤 섹션에 이어 붙는 Hero 숫자부 (미수금은 수납 관리 섹션 담당) */
function HeroSummary({ hero }: { hero: RevenueHero }) {
  return (
    <div className="mt-5 border-t border-it-line pt-4 dark:border-rink-700">
      <h2 className="text-card-meta font-bold uppercase tracking-wider text-it-ink-500 dark:text-wtext-4">
        {MESSAGES.statistics.totalRevenue}
      </h2>
      <div className="mt-2 flex items-end gap-2">
        <p className="text-w-display font-black leading-none tabular-nums text-it-ink-900 dark:text-white">
          {new Intl.NumberFormat("ko-KR").format(hero.totalRevenue)}
          <span className="ml-0.5 text-w-h3 font-bold text-it-ink-500 dark:text-wtext-4">
            원
          </span>
        </p>
        <RevenueDeltaBadge amount={hero.deltaAmount} rate={hero.deltaRate} />
      </div>

      {hero.totalRevenue === 0 && (
        <p className="mt-2 text-card-meta text-it-ink-500 dark:text-wtext-4">
          {MESSAGES.statistics.emptyRevenue}
        </p>
      )}

      {/* 선불/후불 브레이크다운 — 중점(·) 텍스트만, 파이프/세로구분선 금지 */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-card-body font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-w-pill bg-it-blue-500"
            aria-hidden="true"
          />
          <span className="text-it-ink-700 dark:text-wtext-4">
            {MESSAGES.statistics.prepaid} {formatCurrency(hero.prepaidRevenue)}
          </span>
        </span>
        <span className="text-it-ink-400 dark:text-wtext-3" aria-hidden="true">
          ·
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-w-pill bg-success"
            aria-hidden="true"
          />
          <span className="text-it-ink-700 dark:text-wtext-4">
            {MESSAGES.statistics.postpaid}{" "}
            {formatCurrency(hero.postpaidRevenue)}
          </span>
        </span>
      </div>
    </div>
  );
}

function ScopeToggle({
  value,
  onChange,
}: {
  value: RevenueScope;
  onChange: (v: RevenueScope) => void;
}) {
  const options: { value: RevenueScope; label: string }[] = [
    { value: "month", label: MESSAGES.statistics.scopeMonth },
    { value: "year", label: MESSAGES.statistics.scopeYear },
  ];
  return (
    <div
      role="tablist"
      aria-label={MESSAGES.statistics.heroTitle}
      className="flex rounded-w-md bg-it-fill p-1 dark:bg-rink-800"
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={`min-h-[36px] flex-1 rounded-[9px] px-2 py-1.5 text-card-body font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 motion-reduce:transition-none ${
              selected
                ? "bg-it-surface text-it-blue-500 shadow-sh-1 dark:bg-rink-700 dark:text-white"
                : "text-it-ink-500 hover:text-it-ink-800 dark:text-wtext-3 dark:hover:text-wtext-4"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PeriodNav({
  label,
  onPrev,
  onNext,
  nextDisabled: disableNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="mt-3 flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        aria-label={MESSAGES.statistics.prevPeriod}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-it-fill text-it-ink-700 transition-colors hover:bg-it-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 active:brightness-95 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700 motion-reduce:transition-none"
      >
        <Icon name="chevron_left" className="text-[22px]" aria-hidden="true" />
      </button>
      <span
        className="text-card-title font-extrabold tabular-nums text-it-ink-900 dark:text-white"
        aria-live="polite"
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={disableNext}
        aria-disabled={disableNext}
        aria-label={MESSAGES.statistics.nextPeriod}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-it-fill text-it-ink-700 transition-colors hover:bg-it-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-it-fill dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700 dark:disabled:hover:bg-rink-800 motion-reduce:transition-none"
      >
        <Icon name="chevron_right" className="text-[22px]" aria-hidden="true" />
      </button>
    </div>
  );
}

function SegmentToggle({
  value,
  onChange,
}: {
  value: RevenueSegment;
  onChange: (v: RevenueSegment) => void;
}) {
  const options: { value: RevenueSegment; label: string }[] = [
    { value: "all", label: MESSAGES.statistics.segmentAll },
    { value: "prepaid", label: MESSAGES.statistics.segmentPrepaid },
    { value: "postpaid", label: MESSAGES.statistics.segmentPostpaid },
  ];
  return (
    <div
      role="tablist"
      aria-label={MESSAGES.statistics.revenueTrend}
      className="flex rounded-w-md bg-it-fill p-1 dark:bg-rink-800"
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={`min-h-[36px] flex-1 rounded-[9px] px-2 py-1.5 text-card-meta font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 motion-reduce:transition-none ${
              selected
                ? "bg-it-surface text-it-blue-500 shadow-sh-1 dark:bg-rink-700 dark:text-white"
                : "text-it-ink-500 hover:text-it-ink-800 dark:text-wtext-3 dark:hover:text-wtext-4"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function RevenueDeltaBadge({
  amount,
  rate,
}: {
  amount: number;
  rate: number | null;
}) {
  if (rate === null || amount === 0) return null;
  const up = amount > 0;
  const color = up
    ? "bg-success-100 text-success dark:bg-success-700/20 dark:text-success"
    : "bg-it-red-50 text-it-red-500 dark:bg-it-red-500/15 dark:text-it-red-500";
  const iconName = up ? "arrow_upward" : "arrow_downward";
  const ariaLabel = up
    ? `이전 기간 대비 ${Math.abs(rate)}퍼센트 증가`
    : `이전 기간 대비 ${Math.abs(rate)}퍼센트 감소`;
  return (
    <span
      className={`mb-1 inline-flex items-center gap-0.5 rounded-w-pill px-2 py-0.5 text-card-meta font-bold ${color}`}
      aria-label={ariaLabel}
    >
      <Icon name={iconName} className="text-[12px]" aria-hidden="true" />
      <span className="tabular-nums">{Math.abs(rate)}%</span>
    </span>
  );
}

function BillingModeBadge({ mode }: { mode: BillingMode }) {
  const map: Record<BillingMode, { label: string; className: string }> = {
    PREPAID: {
      label: MESSAGES.statistics.prepaid,
      className:
        "bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-500",
    },
    POSTPAID: {
      label: MESSAGES.statistics.postpaid,
      className:
        "bg-success-100 text-success dark:bg-success-700/20 dark:text-success",
    },
    BOTH: {
      label: MESSAGES.statistics.selectable,
      className:
        "bg-it-fill text-it-ink-500 dark:bg-rink-700 dark:text-wtext-4",
    },
  };
  const { label, className } = map[mode];
  return (
    <span
      className={`shrink-0 rounded-w-pill px-1.5 py-0.5 text-[11px] font-bold ${className}`}
    >
      {label}
    </span>
  );
}

function PostpaidMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ink" | "success" | "red";
}) {
  const valueColor =
    tone === "success"
      ? "text-success"
      : tone === "red"
        ? "text-it-red-500"
        : "text-it-ink-900 dark:text-white";
  return (
    <div className="rounded-xl bg-it-fill px-3 py-3 dark:bg-rink-800">
      <p className="text-card-meta font-semibold text-it-ink-500 dark:text-wtext-4">
        {label}
      </p>
      <p
        className={`mt-1 text-card-title font-black tabular-nums ${valueColor}`}
      >
        {new Intl.NumberFormat("ko-KR").format(value)}원
      </p>
    </div>
  );
}

function SectionCard({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  children,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-2 bg-it-surface px-5 py-4 dark:bg-it-blue-950">
      <div className="mb-4 flex items-center gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${iconBg}`}
        >
          <Icon
            name={icon}
            className={`text-[18px] ${iconColor}`}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
            {title}
          </h2>
          {subtitle && (
            <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

// ─── Recharts Custom Tooltip ────────────────────────
type ChartTooltipProps = TooltipContentProps;

function RevenueTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((acc, p) => {
    const v = typeof p.value === "number" ? p.value : Number(p.value ?? 0);
    return acc + v;
  }, 0);
  return (
    <div className="rounded-lg border border-it-line bg-it-surface px-3 py-2 shadow-sh-1 dark:border-rink-700 dark:bg-rink-800">
      <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">{label}</p>
      {payload.map((p) => {
        const v = typeof p.value === "number" ? p.value : Number(p.value ?? 0);
        const name =
          p.dataKey === "postpaid"
            ? MESSAGES.statistics.postpaid
            : MESSAGES.statistics.prepaid;
        return (
          <p
            key={String(p.dataKey)}
            className="text-card-meta font-semibold text-it-ink-700 dark:text-wtext-4"
          >
            {name} {new Intl.NumberFormat("ko-KR").format(v)}원
          </p>
        );
      })}
      <p className="mt-0.5 text-card-body font-bold text-it-ink-900 dark:text-white">
        <span className="tabular-nums">
          {new Intl.NumberFormat("ko-KR").format(total)}
        </span>
        <span className="ml-0.5 text-card-meta text-it-ink-500">원</span>
      </p>
    </div>
  );
}

// ─── 매출 추이 스택 차트 ────────────────────────────
interface RevenueTickProps {
  x?: string | number;
  y?: string | number;
  index?: number;
  payload?: { value?: string | number };
}

function RevenueTrendChart({
  items,
  segment,
}: {
  items: RevenueSeriesPoint[];
  segment: RevenueSegment;
}) {
  const showPrepaid = segment === "all" || segment === "prepaid";
  const showPostpaid = segment === "all" || segment === "postpaid";

  const summary = items
    .map((i) => {
      const v =
        segment === "prepaid"
          ? i.prepaid
          : segment === "postpaid"
            ? i.postpaid
            : i.prepaid + i.postpaid;
      return `${i.label} ${formatCurrency(v)}원`;
    })
    .join(", ");

  // 선택 anchor 버킷 라벨 강조용 커스텀 틱 (per-cell fill 대신 축 라벨 강조 — Cell 미신뢰 회피)
  const renderTick = (props: RevenueTickProps) => {
    const { x = 0, y = 0, index = 0, payload } = props;
    const cx = Number(x);
    const cy = Number(y);
    const isCurrent = items[index]?.isCurrent ?? false;
    return (
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fontSize={10}
        fontWeight={isCurrent ? 700 : 400}
        fill={isCurrent ? COLOR.primary : COLOR.slate500}
      >
        {payload?.value ?? ""}
      </text>
    );
  };

  return (
    <div role="img" aria-label={`매출 추이 막대 차트: ${summary}`} className="w-full">
      <div className="h-44 w-full min-w-0">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={176}
          initialDimension={{ width: 320, height: 176 }}
        >
          <RcBarChart
            data={items}
            margin={{ top: 16, right: 8, left: -8, bottom: 0 }}
            barCategoryGap="22%"
          >
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={renderTick}
              interval={0}
            />
            <YAxis
              tickFormatter={(v: number) => formatCurrency(v)}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: COLOR.slate500 }}
              width={44}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={(props) => <RevenueTooltip {...props} />}
              wrapperStyle={{ outline: "none" }}
            />
            {showPrepaid && (
              <Bar
                dataKey="prepaid"
                stackId="rev"
                fill={COLOR.primary}
                radius={showPostpaid ? [0, 0, 0, 0] : [6, 6, 0, 0]}
                maxBarSize={40}
                isAnimationActive
                animationDuration={700}
              />
            )}
            {showPostpaid && (
              <Bar
                dataKey="postpaid"
                stackId="rev"
                fill={COLOR.emerald}
                radius={[6, 6, 0, 0]}
                maxBarSize={40}
                isAnimationActive
                animationDuration={700}
              />
            )}
          </RcBarChart>
        </ResponsiveContainer>
      </div>
      <SrTable
        caption="매출 추이 데이터"
        columns={["기간", "선불", "후불", "합계"]}
        rows={items.map((i) => [
          i.label,
          `${new Intl.NumberFormat("ko-KR").format(i.prepaid)}원`,
          `${new Intl.NumberFormat("ko-KR").format(i.postpaid)}원`,
          `${new Intl.NumberFormat("ko-KR").format(i.prepaid + i.postpaid)}원`,
        ])}
      />
    </div>
  );
}

// ─── 회원 증감 타임라인 ─────────────────────────────
function MemberTrendList({ items }: { items: RevenueMemberTrendPoint[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.month} className="flex items-center gap-3">
          <span className="w-8 text-card-meta font-medium text-it-ink-500 dark:text-wtext-4">
            {item.label}
          </span>
          <div className="flex flex-1 items-center gap-2">
            {item.joined > 0 && (
              <span
                className="inline-flex items-center gap-1"
                aria-label={`가입 ${item.joined}명`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-w-pill bg-success"
                  aria-hidden="true"
                />
                <span className="text-card-meta font-bold text-success">
                  +{item.joined}
                </span>
              </span>
            )}
            {item.left > 0 && (
              <span
                className="inline-flex items-center gap-1"
                aria-label={`탈퇴 ${item.left}명`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-w-pill bg-it-red-500"
                  aria-hidden="true"
                />
                <span className="text-card-meta font-bold text-it-red-500">
                  -{item.left}
                </span>
              </span>
            )}
            {item.left === 0 && item.joined === 0 && (
              <span className="text-card-meta text-it-ink-500 dark:text-wtext-4">
                {MESSAGES.statistics.noChange}
              </span>
            )}
          </div>
          <span className="text-card-meta font-bold tabular-nums text-it-ink-900 dark:text-white">
            {item.total}명
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── 수평 진행률 바 (수업별 매출) ──────────────────
function HBar({
  label,
  badge,
  topRight,
  value,
  max,
  colorClass,
}: {
  label: string;
  badge?: React.ReactNode;
  topRight: string;
  value: number;
  max: number;
  colorClass: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-card-meta font-medium text-it-ink-700 dark:text-wtext-4">
            {label}
          </span>
          {badge}
        </span>
        <span className="shrink-0 text-card-meta font-bold tabular-nums text-it-ink-900 dark:text-white">
          {topRight}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label} ${topRight}`}
        className="h-2 overflow-hidden rounded-w-pill bg-it-line dark:bg-rink-700"
      >
        <div
          className={`h-full rounded-w-pill transition-[width] duration-700 ease-out motion-reduce:transition-none ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Empty / Error / NoTeams / SrTable ──────────────
function EmptyChart({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-it-line-strong dark:border-rink-700"
    >
      <Icon
        name="bar_chart"
        className="mb-2 text-3xl text-it-ink-400 dark:text-wtext-4"
        aria-hidden="true"
      />
      <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">{label}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      className="mt-2 bg-it-surface px-5 py-12 dark:bg-it-blue-950"
      role="alert"
    >
      <div className="flex flex-col items-center justify-center text-center">
        <Icon
          name="error_outline"
          className="mb-3 text-4xl text-it-red-500"
          aria-hidden="true"
        />
        <p className="text-card-body font-semibold text-it-ink-900 dark:text-white">
          {MESSAGES.common.loadFailed}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-it-blue-500 px-6 text-card-body font-bold text-white transition-colors hover:bg-it-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 active:brightness-95 motion-reduce:transition-none"
        >
          <Icon name="refresh" className="text-[18px]" aria-hidden="true" />
          {MESSAGES.common.retry}
        </button>
      </div>
    </section>
  );
}

function NoTeamsState() {
  return (
    <section className="mt-2 bg-it-surface px-5 py-12 dark:bg-it-blue-950" role="status">
      <div className="flex flex-col items-center justify-center text-center">
        <Icon
          name="groups"
          className="mb-3 text-4xl text-it-ink-400 dark:text-wtext-4"
          aria-hidden="true"
        />
        <p className="text-card-body font-semibold text-it-ink-700 dark:text-wtext-4">
          {MESSAGES.statistics.noManagedTeams}
        </p>
      </div>
    </section>
  );
}

function SrTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={j}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
