"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNativeUI } from "@/hooks/useNativeUI";
import { api } from "@/services/api-client";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { BackHeader } from "@/components/layout/Header";
import { Icon } from "@/components/ui/Icon";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { STATUS_BADGE_CLASS, STATUS_TEXT_CLASS } from "@/lib/status-colors";

// ─── Types ───────────────────────────────────────────
interface StatAxis {
  label: string;
  value: number; // 0-100
  teamAvg: number; // 0-100
}

interface WeeklyIntensity {
  day: string;
  value: number; // 0-100
  isToday: boolean;
}

interface TrainingStatsData {
  axes: StatAxis[];
  improvement: number; // % 향상
  improvementProgress: number; // 0-100
  weeklyIntensity: WeeklyIntensity[];
  teamAvgIntensity: number; // 0-100
}

// ─── Empty Data (훈련 기록 0건일 때 차트 0 렌더링용) ─────
const EMPTY_DATA: TrainingStatsData = {
  axes: [
    { label: "스케이팅", value: 0, teamAvg: 0 },
    { label: "슈팅", value: 0, teamAvg: 0 },
    { label: "패스", value: 0, teamAvg: 0 },
    { label: "수비", value: 0, teamAvg: 0 },
    { label: "체력", value: 0, teamAvg: 0 },
  ],
  improvement: 0,
  improvementProgress: 0,
  weeklyIntensity: [
    { day: "월", value: 0, isToday: false },
    { day: "화", value: 0, isToday: false },
    { day: "수", value: 0, isToday: false },
    { day: "목", value: 0, isToday: false },
    { day: "금", value: 0, isToday: false },
    { day: "토", value: 0, isToday: false },
    { day: "일", value: 0, isToday: false },
  ],
  teamAvgIntensity: 0,
};

// ─── Radar Chart (SVG) ──────────────────────────────
const CX = 100;
const CY = 100;
const LEVELS = [23, 47, 70]; // guide polygon radii (maxR=70 기준)

function polarToXY(
  cx: number,
  cy: number,
  r: number,
  idx: number,
  total: number,
) {
  const angle = (Math.PI * 2 * idx) / total - Math.PI / 2;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function polygonPoints(cx: number, cy: number, values: number[], maxR: number) {
  return values
    .map((v, i) => {
      const r = (v / 100) * maxR;
      const p = polarToXY(cx, cy, r, i, values.length);
      return `${p.x},${p.y}`;
    })
    .join(" ");
}

function guidePolygon(cx: number, cy: number, r: number, n: number) {
  return Array.from({ length: n })
    .map((_, i) => {
      const p = polarToXY(cx, cy, r, i, n);
      return `${p.x},${p.y}`;
    })
    .join(" ");
}

function RadarChart({ axes }: { axes: StatAxis[] }) {
  const n = axes.length;
  const maxR = 70;

  // label positions (outside the chart with enough room)
  const labelPositions = axes.map((_, i) => {
    const p = polarToXY(CX, CY, maxR + 22, i, n);
    return p;
  });

  return (
    <div className="flex items-center justify-center">
      <svg
        viewBox="0 0 200 200"
        className="w-64 h-64"
        role="img"
        aria-label="능력치 레이더 차트"
      >
        {/* Guide polygons */}
        {LEVELS.map((r) => (
          <polygon
            key={r}
            points={guidePolygon(CX, CY, r, n)}
            fill="none"
            strokeWidth="1"
            className="stroke-slate-200 dark:stroke-slate-700"
          />
        ))}

        {/* Axis lines */}
        {axes.map((_, i) => {
          const p = polarToXY(CX, CY, maxR, i, n);
          return (
            <line
              key={`axis-${i}`}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              strokeWidth="0.5"
              className="stroke-slate-200 dark:stroke-slate-700"
            />
          );
        })}

        {/* Team avg polygon */}
        <polygon
          points={polygonPoints(
            CX,
            CY,
            axes.map((a) => a.teamAvg),
            maxR,
          )}
          fill="rgba(203,213,225,0.25)"
          strokeWidth="1.5"
          strokeDasharray="4 2"
          className="stroke-slate-300 dark:stroke-slate-600"
        />

        {/* My data polygon */}
        <polygon
          points={polygonPoints(
            CX,
            CY,
            axes.map((a) => a.value),
            maxR,
          )}
          fill="rgba(30,64,175,0.15)"
          strokeWidth="2"
          className="stroke-primary"
        />

        {/* Data points */}
        {axes.map((a, i) => {
          const r = (a.value / 100) * maxR;
          const p = polarToXY(CX, CY, r, i, n);
          return (
            <circle
              key={`dot-${i}`}
              cx={p.x}
              cy={p.y}
              r="3.5"
              className="fill-primary"
            />
          );
        })}

        {/* Labels */}
        {axes.map((a, i) => (
          <text
            key={`lbl-${i}`}
            x={labelPositions[i].x}
            y={labelPositions[i].y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-slate-700 dark:fill-slate-300 text-[10px] font-medium"
          >
            {a.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Empty State (훈련 기록 0건) ─────────────────────
function EmptyState() {
  return (
    <MobileContainer hasBottomNav>
      <BackHeader title="훈련 스탯 분석" />
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div className="w-16 h-16 rounded-w-pill flex items-center justify-center bg-wline-2 dark:bg-rink-800">
          <Icon
            name="bar_chart"
            className="text-3xl text-wtext-3 dark:text-rink-300"
            aria-hidden="true"
          />
        </div>
        <div className="text-center">
          <h2 className="text-card-title font-bold text-wtext-1 dark:text-white mb-1">
            아직 훈련 기록이 없습니다
          </h2>
          <p className="text-card-body text-wtext-3 dark:text-rink-300">
            훈련에 참여하면 스탯 분석이 자동으로 표시됩니다.
          </p>
        </div>
      </div>
    </MobileContainer>
  );
}

// ─── Error State ─────────────────────────────────────
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <MobileContainer hasBottomNav>
      <BackHeader title="훈련 스탯 분석" />
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div
          className={cn(
            "w-16 h-16 rounded-w-pill flex items-center justify-center",
            STATUS_BADGE_CLASS.error,
          )}
        >
          <Icon name="error_outline" className="text-3xl" aria-hidden="true" />
        </div>
        <div className="text-center">
          <h2 className="text-card-title font-bold text-wtext-1 dark:text-white mb-1">
            {MESSAGES.error.title}
          </h2>
          <p className="text-card-body text-wtext-3 dark:text-rink-300">
            {MESSAGES.error.network}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="mt-2 px-6 py-3 bg-ice-500 hover:bg-ice-700 text-white font-semibold rounded-xl transition-colors motion-reduce:transition-none active:brightness-95"
        >
          다시 시도
        </button>
      </div>
    </MobileContainer>
  );
}

// ─── Main Page ───────────────────────────────────────
export default function TrainingStatsPage() {
  const { user } = useSessionAuth();

  const [tab, setTab] = useState<"weekly" | "monthly">("weekly");
  const [data, setData] = useState<TrainingStatsData>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);

  // [appbar-team5-#7 · 2026-05-13] showAppBar:false — <BackHeader/>(forceNative=true 기본)가 Native에서도
  // 강제 렌더되므로 Flutter Native AppBar 와 동시 노출 시 이중 헤더 회귀. Web BackHeader 단독 사용으로 통일.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: "훈련 스탯 분석",
    showBackButton: true,
    showBottomNav: false,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    setIsEmpty(false);
    try {
      const memberId = user?.id;
      if (!memberId) {
        setIsEmpty(true);
        setData(EMPTY_DATA);
        return;
      }
      const period = tab === "weekly" ? "weekly" : "monthly";
      const res = await api.get<TrainingStatsData>(
        `/training-stats/member/${memberId}/dashboard?period=${period}`,
      );
      if (res?.success && res.data && Array.isArray(res.data.weeklyIntensity)) {
        const hasAnySession =
          res.data.weeklyIntensity.some((d) => d.value > 0) ||
          res.data.axes.some((a) => a.value > 0);
        if (hasAnySession) {
          setData(res.data);
        } else {
          setData(EMPTY_DATA);
          setIsEmpty(true);
        }
      } else {
        setData(EMPTY_DATA);
        setIsEmpty(true);
      }
    } catch {
      setError(true);
      setData(EMPTY_DATA);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) return null;
  if (error) return <ErrorState onRetry={fetchData} />;
  if (isEmpty) return <EmptyState />;

  return (
    <MobileContainer hasBottomNav>
      {/* Header */}
      {/* [appbar-harness-v4 분류 C→A] 기존 rightAction 의 설정 버튼은 onClick 미지정 stub 으로 동작 0.
          BackHeader rightAction 미지정 시 PageAppBar default(=detail) 자동 적용 → 시계/종/메뉴 3 액션 자동 노출. */}
      <BackHeader title="훈련 스탯 분석" />

      <main className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {/* ── 인트로 — 요약 칩 (훈련 횟수 + 평균 강도 + 최고 강도) ── */}
        <section className="grid grid-cols-3 gap-2" aria-label="훈련 요약">
          {(() => {
            const active = (data.weeklyIntensity ?? []).filter(
              (d) => d.value > 0,
            );
            const sessions = active.length;
            const avg = active.length
              ? Math.round(
                  active.reduce((a, b) => a + b.value, 0) / active.length,
                )
              : 0;
            const peak = active.length
              ? Math.max(...active.map((d) => d.value))
              : 0;
            return (
              <>
                <div className="bg-white dark:bg-rink-800 rounded-xl p-3 border border-wline-2 dark:border-rink-700 flex flex-col items-center">
                  <Icon
                    name="event_available"
                    className="text-ice-500 text-xl mb-1"
                    aria-hidden="true"
                  />
                  <span className="text-xl font-black text-wtext-1 dark:text-white tabular-nums leading-none">
                    {sessions}
                  </span>
                  <p className="text-[11px] font-bold text-wtext-3 dark:text-rink-300 mt-1">
                    훈련 횟수
                  </p>
                </div>
                <div className="bg-white dark:bg-rink-800 rounded-xl p-3 border border-wline-2 dark:border-rink-700 flex flex-col items-center">
                  <Icon
                    name="speed"
                    className={cn("text-xl mb-1", STATUS_TEXT_CLASS.warning)}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "text-xl font-black tabular-nums leading-none",
                      STATUS_TEXT_CLASS.warning,
                    )}
                  >
                    {avg}%
                  </span>
                  <p className="text-[11px] font-bold text-wtext-3 dark:text-rink-300 mt-1">
                    평균 강도
                  </p>
                </div>
                <div className="bg-white dark:bg-rink-800 rounded-xl p-3 border border-wline-2 dark:border-rink-700 flex flex-col items-center">
                  <Icon
                    name="whatshot"
                    className={cn("text-xl mb-1", STATUS_TEXT_CLASS.error)}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "text-xl font-black tabular-nums leading-none",
                      STATUS_TEXT_CLASS.error,
                    )}
                  >
                    {peak}%
                  </span>
                  <p className="text-[11px] font-bold text-wtext-3 dark:text-rink-300 mt-1">
                    최고 강도
                  </p>
                </div>
              </>
            );
          })()}
        </section>

        {/* ── 주간/월간 탭 ── */}
        <div
          className="bg-wline-2 dark:bg-rink-800 p-1.5 rounded-xl flex"
          role="tablist"
        >
          {(["weekly", "monthly"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 min-h-[48px] text-card-emphasis font-black rounded-lg transition-all motion-reduce:transition-none tracking-tight",
                tab === t
                  ? "bg-white dark:bg-rink-700 shadow-sm text-wtext-1 dark:text-white"
                  : "text-wtext-3 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100",
              )}
            >
              {t === "weekly" ? "주간" : "월간"}
            </button>
          ))}
        </div>

        {/* ── 실력 향상도 히어로 카드 ── */}
        <section className="bg-ice-500 rounded-2xl p-6 text-white shadow-sm">
          <p className="text-card-meta font-bold uppercase tracking-wider text-white/70 mb-1">
            이번 {tab === "weekly" ? "주" : "달"} 실력 향상도
          </p>
          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-6xl font-black tabular-nums leading-none">
              +{data.improvement}
            </span>
            <span className="text-2xl font-black text-white/80">%</span>
          </div>
          <div className="bg-white/20 h-3 rounded-w-pill overflow-hidden">
            <div
              className="h-full rounded-w-pill bg-white transition-all motion-reduce:transition-none duration-500"
              style={{ width: `${data.improvementProgress}%` }}
            />
          </div>
          <p className="text-card-meta font-bold text-white/80 mt-3 tabular-nums">
            목표 달성률 {data.improvementProgress}%
          </p>
        </section>

        {/* ── 핵심 능력치 레이더 차트 카드 ── */}
        <section className="bg-white dark:bg-rink-800 rounded-2xl p-6 border border-wline-2 dark:border-rink-700">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-black text-wtext-1 dark:text-white tracking-tight">
              핵심 능력치 분석
            </h2>
            <span className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
              5 AXIS
            </span>
          </div>
          <p className="text-card-body font-semibold text-wtext-3 dark:text-rink-300 mb-5">
            팀 평균과 비교
          </p>

          <RadarChart axes={data.axes ?? EMPTY_DATA.axes} />

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-w-pill bg-ice-500" />
              <span className="text-card-meta font-bold text-wtext-2 dark:text-rink-100">
                나의 기록
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-w-pill bg-wline dark:bg-wbg0" />
              <span className="text-card-meta font-bold text-wtext-2 dark:text-rink-100">
                팀 평균
              </span>
            </div>
          </div>
        </section>

        {/* ── 요일별 훈련 강도 ── */}
        <section className="bg-white dark:bg-rink-800 rounded-2xl p-6 border border-wline-2 dark:border-rink-700">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-black text-wtext-1 dark:text-white tracking-tight">
              요일별 훈련 강도
            </h2>
            <span className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
              WEEKLY
            </span>
          </div>
          <p className="text-card-body font-semibold text-wtext-3 dark:text-rink-300 mb-6">
            일주일 훈련 패턴
          </p>

          <div className="relative h-40 flex items-end gap-2">
            {/* Team avg dashed line */}
            <div
              className="absolute left-0 right-0 border-t-2 border-dashed border-wline dark:border-rink-700"
              style={{ bottom: `${data.teamAvgIntensity}%` }}
            >
              <span className="absolute -top-4 right-0 text-[10px] text-wtext-3 dark:text-rink-300">
                팀 평균
              </span>
            </div>

            {(data.weeklyIntensity ?? []).map((d) => (
              <div
                key={d.day}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <div
                  className={cn(
                    "w-full rounded-t-sm relative",
                    d.isToday
                      ? "bg-ice-500/20"
                      : "bg-ice-500/10 dark:bg-ice-500/5",
                  )}
                  style={{ height: "100%" }}
                >
                  <div
                    className={cn(
                      "absolute bottom-0 left-0 right-0 rounded-t-sm bg-ice-500 transition-all motion-reduce:transition-none duration-500",
                      d.isToday && "shadow-md",
                    )}
                    style={{ height: `${d.value}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "text-[11px] font-medium px-1.5 py-0.5 rounded",
                    d.isToday
                      ? "bg-ice-500/10 dark:bg-ice-500/20 text-ice-500 font-bold"
                      : "text-wtext-3 dark:text-rink-300",
                  )}
                >
                  {d.day}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
