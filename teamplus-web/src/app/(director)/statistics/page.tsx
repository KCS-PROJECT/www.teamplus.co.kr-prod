"use client";

/**
 * 팀 통계 (감독 전용)
 *
 * 구성:
 *  - 페이지 인트로 (타이틀 + 부제)
 *  - KPI 요약 4종 (총 회원 · 평균 출석률 · 월 매출 · 신규 가입)
 *  - 기간 필터 (주간 / 월간 / 분기 / 연간)
 *  - 출석률 추이 (Recharts BarChart + Tooltip)
 *  - 매출 현황 (Recharts BarChart + Tooltip)
 *  - 회원 증감 타임라인
 *  - 수업별 출석률 비교 (HBar + 범례)
 *
 * 데이터:
 *  - statistics.service 경유 Backend API 시도
 *  - clubId 없음/실패 시 FALLBACK 데이터 (개발/데모)
 *
 * 디자인 (ICETIMES flat · 2026-06-25):
 *  - AI 스타일 금지 (gradient/backdrop-blur 미사용)
 *  - flat & sectioned — main 회색 캔버스(it-canvas) + mt-2 흰 섹션 누적(카드 박스 제거)
 *  - Primary it-blue-500(#0e5db0) · 강조 it-red-500(#c8202e) + solid/alpha
 *  - 차트 색만 ICETIMES SoT 스왑, 막대/툴팁/SVG 로직은 동결
 *  - motion-reduce 대응, focus-visible ring, SR table fallback
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MESSAGES } from '@/lib/messages';
// ⚡ recharts(~90KB gzip)는 dynamic import로 지연 로드 — 초기 번들 감소
// SSR=false: recharts는 ResponsiveContainer가 DOM 측정을 필요로 하므로 클라이언트 전용
// 타입(TooltipContentProps)은 번들 영향 없음 → import type으로 유지
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
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from "@/hooks/useNativeUI";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useRefreshSubscription } from "@/lib/refresh-bus";
import {
  getClubStatistics,
  type ClubStatistics,
  type MemberTrend,
  type MonthlyRevenue,
  type PeriodType,
  type WeeklyAttendance,
} from "@/services/statistics.service";

// ─── Color tokens ───────────────────────────────────
// [ICETIMES flat 2026-06-25] primary → it-blue-500(#0e5db0), red → it-red-500(#c8202e).
//   차트 색만 ICETIMES SoT(§4)로 스왑 · 차트 막대 로직/SVG 수학은 동결.
const COLOR = {
  primary: "#0e5db0",
  emerald: "#10b981",
  yellow: "#eab308",
  red: "#c8202e",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate500: "#6b7a80",
  slate700: "#33454c",
} as const;

type TrendDirection = "up" | "down" | "flat";

// ─── Helpers ────────────────────────────────────────
function formatCurrency(amount: number): string {
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억`;
  if (amount >= 10000) return `${(amount / 10000).toFixed(0)}만`;
  return new Intl.NumberFormat("ko-KR").format(amount);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function attendanceColor(rate: number): string {
  if (rate >= 85) return COLOR.primary;
  if (rate >= 70) return COLOR.yellow;
  return COLOR.red;
}

function attendanceColorClass(rate: number): string {
  if (rate >= 85) return "bg-it-blue-500";
  if (rate >= 70) return "bg-warning-500";
  return "bg-it-red-500";
}

// ─── Main Component ──────────────────────────────────
export default function StatisticsPage() {
  const { user } = useSessionAuth();
  const clubId = (user as unknown as { clubId?: string })?.clubId ?? null;

  const [period, setPeriod] = useState<PeriodType>("week");
  const [stats, setStats] = useState<ClubStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getClubStatistics(clubId, period);
      if (res.success && res.data) {
        setStats(res.data);
      }
    } finally {
      setIsLoading(false);
    }
  }, [clubId, period]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // [추가 2026-05-15 T07↔T03] 통계 자동 갱신.
  //   T03 협업: 통계 cache key 는 ['stats', teamId, ...filters]. teamId 별 격리.
  //   - 결제/출석/회원 mutation 후 ['stats', clubId] 발화 시 본 페이지 재 fetch.
  //   - clubId(=teamId) 가 없으면 'stats' prefix 로 fallback 구독 (FALLBACK 데이터 모드).
  useRefreshSubscription(
    clubId ? (['stats', clubId] as ['stats', string]) : 'stats',
    () => {
      void loadData();
    },
  );

  const attendanceData = useMemo(
    () => stats?.attendance ?? [],
    [stats?.attendance],
  );
  const revenueData = useMemo(() => stats?.revenue ?? [], [stats?.revenue]);
  const memberTrend = useMemo(
    () => stats?.memberTrend ?? [],
    [stats?.memberTrend],
  );
  const classAttendance = useMemo(
    () => stats?.classAttendance ?? [],
    [stats?.classAttendance],
  );

  const latestTrend = memberTrend[memberTrend.length - 1];
  const prevTrend = memberTrend[memberTrend.length - 2];

  const kpis = useMemo(() => {
    const avgAttendance = avg(attendanceData.map((w) => w.rate));
    const prevAvgAttendance =
      attendanceData.length > 1
        ? avg(attendanceData.slice(0, -1).map((w) => w.rate))
        : avgAttendance;
    const latestRevenue = revenueData[revenueData.length - 1]?.amount ?? 0;
    const prevRevenue = revenueData[revenueData.length - 2]?.amount ?? 0;

    return [
      {
        key: "members",
        icon: "groups",
        iconBg: "bg-it-blue-50 dark:bg-it-blue-500/15",
        iconColor: "text-it-blue-500",
        label: "총 회원",
        value: latestTrend?.total ?? 0,
        unit: "명",
        delta:
          latestTrend && prevTrend ? latestTrend.total - prevTrend.total : 0,
        spark: memberTrend.map((t) => t.total),
        sparkColor: "bg-it-blue-500/40",
      },
      {
        key: "attendance",
        icon: "check_circle",
        iconBg: "bg-success-100 dark:bg-success-700/20",
        iconColor: "text-success",
        label: "평균 출석률",
        value: avgAttendance,
        unit: "%",
        delta: avgAttendance - prevAvgAttendance,
        spark: attendanceData.map((w) => w.rate),
        sparkColor: "bg-success/40",
      },
      {
        key: "revenue",
        icon: "payments",
        iconBg: "bg-it-blue-50 dark:bg-it-blue-500/15",
        iconColor: "text-it-blue-500",
        label: "최근 매출",
        value: Math.round(latestRevenue / 10000),
        unit: "만원",
        delta: Math.round((latestRevenue - prevRevenue) / 10000),
        spark: revenueData.map((r) => r.amount),
        sparkColor: "bg-it-blue-500/40",
      },
      {
        key: "joined",
        icon: "person_add",
        iconBg: "bg-it-red-50 dark:bg-it-red-500/15",
        iconColor: "text-it-red-500",
        label: "신규 가입",
        value: latestTrend?.joined ?? 0,
        unit: "명",
        delta:
          latestTrend && prevTrend ? latestTrend.joined - prevTrend.joined : 0,
        spark: memberTrend.map((t) => t.joined),
        sparkColor: "bg-it-red-500/40",
      },
    ];
  }, [attendanceData, revenueData, memberTrend, latestTrend, prevTrend]);

  const sortedClassAttendance = useMemo(
    () => [...classAttendance].sort((a, b) => b.rate - a.rate),
    [classAttendance],
  );

  if (isLoading) return null;

  return (
    <MobileContainer hasBottomNav>
      {/* [수정 2026-05-15 T05-L] SubmainAppBar → PageAppBar 교체.
          이전: SubmainAppBar 는 BottomNav 탭 허브 화면 전용 (뒤로가기 없음 + 4-icon).
          회귀: /statistics 는 BottomNav 진입점이 아닌 서브 페이지(감독 메뉴/대시보드에서 진입)
                인데 SubmainAppBar 적용으로 인해 뒤로가기 버튼이 없어 사용자 이탈 불가 회귀.
          조치: PageAppBar(variant=default) showBack=true 적용 — ← 뒤로가기 + 타이틀 + 메뉴. */}
      <PageAppBar title="통계" showBack forceNative />

      {/* [ICETIMES flat 2026-06-25] /director·/report 와 동일 flat 언어 —
          main 은 회색 캔버스(bg-it-canvas dark:bg-puck), 콘텐츠 블록은 각자
          mt-2 흰 섹션으로 쌓인다. 이전 px-5 space-y-6 + 카드 박스(SectionCard
          rounded border shadow) → full-bleed flat 섹션 전환. 차트 로직 동결. */}
      <main
        className="hide-scrollbar flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label="팀 통계"
      >
        {/* Hero — flat 흰 섹션 (대담한 타이포그래피) */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-6 pb-5" aria-labelledby="statistics-hero">
          <p className="mb-2 flex items-center gap-1.5 text-card-meta font-bold uppercase tracking-[0.18em] text-it-blue-500">
            <span
              className="inline-block h-1.5 w-1.5 rounded-w-pill bg-it-blue-500"
              aria-hidden="true"
            />
            Club Insights
          </p>
          <h1
            id="statistics-hero"
            className="text-3xl font-black leading-tight tracking-tight text-it-ink-900 dark:text-white"
          >
            팀 한눈에
            <br />
            보기
          </h1>
          <p className="mt-3 text-card-body font-medium text-it-ink-500 dark:text-wtext-4 leading-relaxed">
            최근 활동 기준 · 이전 구간 대비 변화를 함께 확인해보세요.
          </p>
        </section>

        {/* 기간 필터 — flat 흰 섹션 (8px 갭) */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4">
          <PeriodFilter value={period} onChange={setPeriod} />
        </section>

        {/* KPI 요약 — flat 흰 섹션 (타일 flat) */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5" aria-labelledby="kpi-heading">
          <h2 id="kpi-heading" className="sr-only">
            핵심 지표 요약
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {kpis.map(({ key, ...kpi }) => (
              <KpiCard key={key} {...kpi} />
            ))}
          </div>
        </section>

        {/* 1. 출석률 추이 (Recharts) — flat 섹션 */}
        <SectionCard
          icon="trending_up"
          iconBg="bg-it-blue-50 dark:bg-it-blue-500/15"
          iconColor="text-it-blue-500"
          title="출석률 추이"
        >
          <AttendanceBarChart items={attendanceData} />
        </SectionCard>

        {/* 2. 매출 현황 (Recharts) — flat 섹션 */}
        <SectionCard
          icon="payments"
          iconBg="bg-success-100 dark:bg-success-700/20"
          iconColor="text-success"
          title="매출 현황"
        >
          <RevenueBarChart items={revenueData} />
        </SectionCard>

        {/* 3. 회원 증감 — flat 섹션 */}
        <SectionCard
          icon="group_add"
          iconBg="bg-it-blue-50 dark:bg-it-blue-500/15"
          iconColor="text-it-blue-500"
          title="회원 증감 추이"
          subtitle={latestTrend ? `현재 총 ${latestTrend.total}명` : undefined}
        >
          <MemberTrendList items={memberTrend} />
        </SectionCard>

        {/* 4. 수업별 출석률 — flat 섹션 */}
        <SectionCard
          icon="sports_hockey"
          iconBg="bg-it-red-50 dark:bg-it-red-500/15"
          iconColor="text-it-red-500"
          title="수업별 출석률 비교"
        >
          {sortedClassAttendance.length === 0 ? (
            <EmptyChart label={MESSAGES.emptyChart.classes} />
          ) : (
            <div className="space-y-3">
              {sortedClassAttendance.map((cls) => (
                <HBar
                  key={cls.className}
                  label={cls.className}
                  topRight={`${cls.rate}% (${cls.memberCount}명)`}
                  value={cls.rate}
                  max={100}
                  colorClass={attendanceColorClass(cls.rate)}
                />
              ))}
            </div>
          )}
          <Legend />
        </SectionCard>
      </main>
    </MobileContainer>
  );
}

// ============================================================
// Sub Components
// ============================================================

function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodType;
  onChange: (v: PeriodType) => void;
}) {
  const options: { value: PeriodType; label: string; helper: string }[] = [
    { value: "week", label: "주간", helper: "최근 7일" },
    { value: "month", label: "월간", helper: "최근 4주" },
    { value: "quarter", label: "분기", helper: "3개월" },
    { value: "year", label: "연간", helper: "12개월" },
  ];
  const selectedHelper = options.find((o) => o.value === value)?.helper ?? "";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-1">
        <p className="text-card-meta font-bold uppercase tracking-wider text-it-ink-500 dark:text-wtext-4">
          집계 기간
        </p>
        <span className="text-card-meta font-medium text-it-ink-500 dark:text-wtext-4 tabular-nums">
          {selectedHelper}
        </span>
      </div>
      <div
        role="tablist"
        aria-label="집계 기간 선택"
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
    </div>
  );
}

function KpiCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  unit,
  delta,
  spark,
  sparkColor = "bg-it-blue-500/40",
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  unit: string;
  delta: number;
  spark?: number[];
  sparkColor?: string;
}) {
  const dir: TrendDirection = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return (
    /* [ICETIMES flat] 카드 박스(border shadow hover-translate) 제거 → flat 인셋 타일(bg-it-fill). */
    <div
      className="rounded-xl bg-it-fill p-4 dark:bg-rink-800"
      role="group"
      aria-label={`${label} ${value}${unit}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-[9px] ${iconBg}`}
        >
          <Icon
            name={icon}
            className={`text-card-title ${iconColor}`}
            aria-hidden="true"
          />
        </div>
        <TrendBadge dir={dir} value={Math.abs(delta)} />
      </div>
      <p className="text-card-meta font-semibold text-it-ink-500 dark:text-wtext-4">
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-0.5">
        <span className="text-w-h2 font-black leading-none tabular-nums text-it-ink-900 dark:text-white">
          {value.toLocaleString("ko-KR")}
        </span>
        <span className="text-card-meta font-semibold text-it-ink-500 dark:text-wtext-4">
          {unit}
        </span>
      </p>
      <Sparkline data={spark} colorClass={sparkColor} />
    </div>
  );
}

/**
 * Sparkline — KpiCard 미니 추세 막대 (값 변화를 한눈에).
 * 데이터 2개 미만이면 렌더 생략. 마지막 막대는 불투명도 강조.
 */
function Sparkline({ data, colorClass }: { data?: number[]; colorClass: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const lastIdx = data.length - 1;
  return (
    <div className="mt-2.5 flex h-5 items-end gap-px" aria-hidden="true">
      {data.map((v, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] ${colorClass} ${i === lastIdx ? "brightness-110 saturate-150" : ""}`}
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function TrendBadge({ dir, value }: { dir: TrendDirection; value: number }) {
  if (dir === "flat" || value === 0) return null;
  const color =
    dir === "up"
      ? "bg-success-100 text-success dark:bg-success-700/20 dark:text-success"
      : "bg-it-red-50 text-it-red-500 dark:bg-it-red-500/15 dark:text-it-red-500";
  const iconName = dir === "up" ? "arrow_upward" : "arrow_downward";
  const ariaLabel =
    dir === "up"
      ? `이전 구간 대비 ${value} 증가`
      : `이전 구간 대비 ${value} 감소`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-w-pill px-1.5 py-0.5 text-card-meta font-bold ${color}`}
      aria-label={ariaLabel}
    >
      <Icon name={iconName} className="text-[10px]" aria-hidden="true" />
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

function SectionCard({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  action,
  children,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    /* [ICETIMES flat] 카드 박스(rounded border shadow) 제거 → mt-2 full-bleed 흰 섹션 + 8px 갭. */
    <section className="mt-2 bg-it-surface px-5 py-4 dark:bg-it-blue-950">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
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
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

// ─── Recharts Custom Tooltip ────────────────────────
type ChartTooltipProps = TooltipContentProps;

function AttendanceTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rawValue = payload[0]?.value;
  const v = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
  return (
    <div className="rounded-lg border border-it-line bg-it-surface px-3 py-2 shadow-sh-1 dark:border-rink-700 dark:bg-rink-800">
      <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">{label}</p>
      <p className="text-card-body font-bold text-it-ink-900 dark:text-white">
        <span className="tabular-nums">{v}</span>%
      </p>
    </div>
  );
}

function RevenueTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const rawValue = payload[0]?.value;
  const v = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
  return (
    <div className="rounded-lg border border-it-line bg-it-surface px-3 py-2 shadow-sh-1 dark:border-rink-700 dark:bg-rink-800">
      <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">{label}</p>
      <p className="text-card-body font-bold text-it-ink-900 dark:text-white">
        <span className="tabular-nums">
          {new Intl.NumberFormat("ko-KR").format(v)}
        </span>
        <span className="ml-0.5 text-card-meta text-it-ink-500">원</span>
      </p>
    </div>
  );
}

// ─── Recharts 차트 ──────────────────────────────────
function AttendanceBarChart({ items }: { items: WeeklyAttendance[] }) {
  if (items.length === 0) {
    return <EmptyChart label={MESSAGES.emptyChart.attendance} />;
  }
  const summary = items.map((i) => `${i.week} ${i.rate}퍼센트`).join(", ");
  // rate 등급별 색을 데이터 fill 로 주입 — Recharts Bar 는 항목별 fill 을 자동 적용한다.
  // (dynamic import 된 Cell 은 Bar 의 children 타입 검사에서 인식되지 않아 fill 이 무시되던 문제 회피)
  const data = items.map((i) => ({ ...i, fill: attendanceColor(i.rate) }));
  return (
    <div
      role="img"
      aria-label={`출석률 막대 차트: ${summary}`}
      className="w-full"
    >
      <div className="h-36 w-full min-w-0">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={144}
          initialDimension={{ width: 320, height: 144 }}
        >
          <RcBarChart
            data={data}
            margin={{ top: 16, right: 8, left: -24, bottom: 0 }}
            barCategoryGap="22%"
          >
            <XAxis
              dataKey="week"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: COLOR.slate500 }}
            />
            <YAxis
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: COLOR.slate500 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={(props) => <AttendanceTooltip {...props} />}
              wrapperStyle={{ outline: "none" }}
            />
            <Bar
              dataKey="rate"
              radius={[6, 6, 0, 0]}
              maxBarSize={40}
              isAnimationActive
              animationDuration={700}
            />
          </RcBarChart>
        </ResponsiveContainer>
      </div>
      <SrTable
        caption="출석률 데이터"
        columns={["기간", "출석률"]}
        rows={items.map((i) => [i.week, `${i.rate}%`])}
      />
    </div>
  );
}

function RevenueBarChart({ items }: { items: MonthlyRevenue[] }) {
  if (items.length === 0) {
    return <EmptyChart label={MESSAGES.emptyChart.sales} />;
  }
  const summary = items
    .map((i) => `${i.month} ${formatCurrency(i.amount)}원`)
    .join(", ");
  return (
    <div
      role="img"
      aria-label={`매출 막대 차트: ${summary}`}
      className="w-full"
    >
      <div className="h-40 w-full min-w-0">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={160}
          initialDimension={{ width: 320, height: 160 }}
        >
          <RcBarChart
            data={items}
            margin={{ top: 16, right: 8, left: -8, bottom: 0 }}
            barCategoryGap="22%"
          >
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: COLOR.slate500 }}
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
            <Bar
              dataKey="amount"
              fill={COLOR.emerald}
              radius={[6, 6, 0, 0]}
              maxBarSize={40}
              isAnimationActive
              animationDuration={700}
            />
          </RcBarChart>
        </ResponsiveContainer>
      </div>
      <SrTable
        caption="매출 데이터"
        columns={["기간", "매출"]}
        rows={items.map((i) => [
          i.month,
          `${new Intl.NumberFormat("ko-KR").format(i.amount)}원`,
        ])}
      />
    </div>
  );
}

// ─── 회원 증감 타임라인 ─────────────────────────────
function MemberTrendList({ items }: { items: MemberTrend[] }) {
  if (items.length === 0) {
    return <EmptyChart label={MESSAGES.emptyChart.members} />;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.month} className="flex items-center gap-3">
          <span className="w-8 text-card-meta font-medium text-it-ink-500 dark:text-wtext-4">
            {item.month}
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
              <span className="text-card-meta text-it-ink-500">변동 없음</span>
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

// ─── 수평 진행률 바 ─────────────────────────────────
function HBar({
  label,
  topRight,
  value,
  max,
  colorClass,
}: {
  label: string;
  topRight: string;
  value: number;
  max: number;
  colorClass: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="truncate text-card-meta font-medium text-it-ink-700 dark:text-wtext-4">
          {label}
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
        aria-label={`${label} ${value}퍼센트`}
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

// ─── Empty / Legend / SrTable ───────────────────────
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

function Legend() {
  return (
    <div className="mt-4 flex items-center gap-4 border-t border-it-line pt-3 dark:border-rink-700">
      <LegendItem color="bg-it-blue-500" label="85% 이상" />
      <LegendItem color="bg-warning-500" label="70~84%" />
      <LegendItem color="bg-it-red-500" label="70% 미만" />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-2 w-2 rounded-w-pill ${color}`} aria-hidden="true" />
      <span className="text-card-meta text-it-ink-500 dark:text-wtext-4">
        {label}
      </span>
    </div>
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
