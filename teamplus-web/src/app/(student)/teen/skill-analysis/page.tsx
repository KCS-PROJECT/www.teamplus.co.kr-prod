"use client";

import { useState, useEffect, useCallback } from "react";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNativeUI } from "@/hooks/useNativeUI";
import { api } from "@/services/api-client";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { BackHeader } from "@/components/layout/Header";
import { Icon } from "@/components/ui/Icon";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────
interface SkillItem {
  key: string;
  label: string;
  icon: string;
  score: number; // 0-100
  teamAvg: number;
}

interface BadgeProgress {
  currentBadge: string;
  nextBadge: string;
  progress: number; // 0-100
  currentXP: number;
  requiredXP: number;
}

interface GoalItem {
  id: string;
  text: string;
  completed: boolean;
}

interface SkillAnalysisData {
  skills: SkillItem[];
  overallScore: number;
  badge: BadgeProgress;
  goals: GoalItem[];
}

// ─── Mock Data ───────────────────────────────────────
const MOCK_DATA: SkillAnalysisData = {
  skills: [
    {
      key: "skating",
      label: "스케이팅",
      icon: "directions_run",
      score: 85,
      teamAvg: 70,
    },
    {
      key: "shooting",
      label: "슈팅",
      icon: "sports_hockey",
      score: 72,
      teamAvg: 65,
    },
    {
      key: "passing",
      label: "패스",
      icon: "swap_horiz",
      score: 90,
      teamAvg: 75,
    },
    { key: "defense", label: "수비", icon: "shield", score: 68, teamAvg: 72 },
    { key: "stamina", label: "체력", icon: "favorite", score: 78, teamAvg: 68 },
  ],
  overallScore: 88,
  badge: {
    currentBadge: "Speed Demon II",
    nextBadge: "Speed Demon III",
    progress: 72,
    currentXP: 1440,
    requiredXP: 2000,
  },
  goals: [
    { id: "1", text: "스케이팅 속도 10% 향상", completed: true },
    { id: "2", text: "슈팅 정확도 80% 달성", completed: true },
    { id: "3", text: "주간 훈련 5회 이상 참석", completed: false },
    { id: "4", text: "수비 전환 속도 개선", completed: false },
    { id: "5", text: "체력 테스트 상위 30% 진입", completed: false },
  ],
};

// ─── Radar Chart (Large) ─────────────────────────────
const CX = 120;
const CY = 120;
const MAX_R = 75;
const GUIDE_LEVELS = [25, 50, 75];

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

function makePolygon(cx: number, cy: number, values: number[], maxR: number) {
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

function LargeRadarChart({ skills }: { skills: SkillItem[] }) {
  const n = skills.length;

  const labelPositions = skills.map((_, i) =>
    polarToXY(CX, CY, MAX_R + 22, i, n),
  );

  return (
    <div className="flex items-center justify-center">
      <svg
        viewBox="0 0 240 240"
        className="w-72 h-72"
        role="img"
        aria-label="능력치 레이더 차트 상세"
      >
        {/* Guides */}
        {GUIDE_LEVELS.map((r) => (
          <polygon
            key={r}
            points={guidePolygon(CX, CY, r, n)}
            fill="none"
            className="stroke-wline-2 dark:stroke-rink-700"
            strokeWidth="1"
          />
        ))}

        {/* Axes */}
        {skills.map((_, i) => {
          const p = polarToXY(CX, CY, MAX_R, i, n);
          return (
            <line
              key={i}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              className="stroke-wline-2 dark:stroke-rink-700"
              strokeWidth="0.5"
            />
          );
        })}

        {/* Team avg */}
        <polygon
          points={makePolygon(
            CX,
            CY,
            skills.map((s) => s.teamAvg),
            MAX_R,
          )}
          className="fill-wline/30 stroke-wline dark:fill-rink-700/30 dark:stroke-rink-600"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />

        {/* My data */}
        <polygon
          points={makePolygon(
            CX,
            CY,
            skills.map((s) => s.score),
            MAX_R,
          )}
          className="fill-ice-500/15 stroke-ice-500"
          strokeWidth="2"
        />

        {/* Points */}
        {skills.map((s, i) => {
          const r = (s.score / 100) * MAX_R;
          const p = polarToXY(CX, CY, r, i, n);
          return (
            <circle key={i} cx={p.x} cy={p.y} r="4" className="fill-primary" />
          );
        })}

        {/* Labels */}
        {skills.map((s, i) => (
          <text
            key={i}
            x={labelPositions[i].x}
            y={labelPositions[i].y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-slate-700 dark:fill-slate-300 text-[11px] font-semibold"
          >
            {s.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Circular Progress (SVG) ─────────────────────────
function CircularProgress({
  progress,
  size = 80,
}: {
  progress: number;
  size?: number;
}) {
  const strokeWidth = 6;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-wline-2 dark:stroke-rink-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="stroke-primary transition-all motion-reduce:transition-none duration-700"
      />
    </svg>
  );
}

// ─── Skill Bar ───────────────────────────────────────
function SkillBar({ skill }: { skill: SkillItem }) {
  const barColor =
    skill.score >= 80
      ? "bg-ice-500"
      : skill.score >= 60
        ? "bg-blue-400"
        : "bg-blue-300";

  return (
    <div className="bg-white dark:bg-rink-800 rounded-2xl p-5 border border-wline-2 dark:border-rink-700">
      <div className="flex items-center gap-4 mb-3">
        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
          <Icon
            name={skill.icon}
            className="text-ice-500 text-2xl"
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-card-emphasis font-black text-wtext-1 dark:text-white tracking-tight">
            {skill.label}
          </p>
          <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
            팀 평균 {skill.teamAvg}점
          </p>
        </div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-3xl font-black text-ice-500 tabular-nums leading-none">
            {skill.score}
          </span>
          <span className="text-card-body font-bold text-wtext-3 dark:text-rink-300">
            /100
          </span>
        </div>
      </div>
      <div className="h-3 bg-wline-2 dark:bg-rink-700 rounded-w-pill overflow-hidden">
        <div
          className={cn(
            "h-full rounded-w-pill transition-all motion-reduce:transition-none duration-500",
            barColor,
          )}
          style={{ width: `${skill.score}%` }}
        />
      </div>
    </div>
  );
}

// ─── Error State ─────────────────────────────────────
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <MobileContainer hasBottomNav>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div className="w-16 h-16 rounded-w-pill bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <Icon
            name="error_outline"
            className="text-3xl text-red-500 dark:text-red-400"
            aria-hidden="true"
          />
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
export default function SkillAnalysisPage() {
  const { user } = useSessionAuth();

  const [data, setData] = useState<SkillAnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState(false);

  // [appbar-team5-#7 · 2026-05-13] showAppBar:false — <BackHeader/>(forceNative=true 기본)가 Native에서도
  // 강제 렌더되므로 Flutter Native AppBar 와 동시 노출 시 이중 헤더 회귀. Web BackHeader 단독 사용으로 통일.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: "능력 분석 상세",
    showBackButton: true,
    showBottomNav: false,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const res = await api.get("/skill-evaluations/me");
      if (res?.data) {
        setData(res.data as SkillAnalysisData);
      } else {
        setData(MOCK_DATA);
      }
    } catch {
      setData(MOCK_DATA);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // v17 anti-flicker: return null → visibility:hidden wrapper 로 변경 (unmount→mount 깜박임 제거)
  if (error) return <ErrorState onRetry={fetchData} />;

  const hidden = isLoading || !data;
  const completedGoals = data ? data.goals.filter((g) => g.completed).length : 0;

  return (
    <div style={{ visibility: hidden ? "hidden" : "visible" }} aria-hidden={hidden}>
    {data && (
    <MobileContainer hasBottomNav>
      {/* Header */}
      <BackHeader title="능력 분석 상세" />

      <main className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {/* ── 종합 점수 히어로 + 강점/약점 하이라이트 ── */}
        <section className="bg-ice-500 rounded-2xl p-6 shadow-sm">
          <p className="text-card-meta font-bold uppercase tracking-wider text-white/70 mb-1">
            OVERALL SCORE
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-6xl font-black text-white tabular-nums leading-none">
              {data.overallScore}
            </span>
            <span className="text-2xl font-black text-white/70">점</span>
          </div>
          <p className="text-card-body font-semibold text-white/80 mt-2">
            5축 종합 능력치 평균
          </p>
          {(() => {
            const sorted = [...data.skills].sort((a, b) => b.score - a.score);
            const top = sorted[0];
            const weak = sorted[sorted.length - 1];
            return (
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="bg-white/15 rounded-xl p-3 border border-white/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon
                      name="emoji_events"
                      className="text-yellow-300 text-card-body"
                      aria-hidden="true"
                    />
                    <span className="text-[11px] font-black uppercase tracking-wider text-white/80">
                      강점
                    </span>
                  </div>
                  <p className="text-card-emphasis font-black text-white truncate">
                    {top.label}
                  </p>
                  <p className="text-card-meta font-bold text-white/70 tabular-nums">
                    {top.score}점
                  </p>
                </div>
                <div className="bg-white/15 rounded-xl p-3 border border-white/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon
                      name="trending_up"
                      className="text-orange-200 text-card-body"
                      aria-hidden="true"
                    />
                    <span className="text-[11px] font-black uppercase tracking-wider text-white/80">
                      보완
                    </span>
                  </div>
                  <p className="text-card-emphasis font-black text-white truncate">
                    {weak.label}
                  </p>
                  <p className="text-card-meta font-bold text-white/70 tabular-nums">
                    {weak.score}점
                  </p>
                </div>
              </div>
            );
          })()}
        </section>

        {/* ── 코치의 개선 제안 ── */}
        {(() => {
          const sorted = [...data.skills].sort((a, b) => a.score - b.score);
          const weak = sorted[0];
          return (
            <section className="bg-white dark:bg-rink-800 rounded-2xl p-5 border border-wline-2 dark:border-rink-700 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Icon
                  name="tips_and_updates"
                  className="text-ice-500 text-xl"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-wtext-3 dark:text-rink-300">
                  개선 제안
                </p>
                <p className="text-card-body font-bold text-wtext-1 dark:text-rink-100 mt-0.5 leading-relaxed">
                  <span className="text-ice-500">{weak.label}</span> 능력이 팀
                  평균 {weak.teamAvg}점 대비{" "}
                  <span className="tabular-nums">
                    {weak.teamAvg - weak.score}점
                  </span>{" "}
                  낮습니다. 집중 훈련으로 실력을 끌어올려보세요.
                </p>
              </div>
            </section>
          );
        })()}

        {/* ── 레이더 차트 ── */}
        <section className="bg-white dark:bg-rink-800 rounded-2xl p-6 border border-wline-2 dark:border-rink-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-wtext-1 dark:text-white tracking-tight">
              종합 능력치
            </h2>
            <span className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
              RADAR
            </span>
          </div>

          <LargeRadarChart skills={data.skills} />

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-w-pill bg-ice-500" />
              <span className="text-card-meta font-bold text-wtext-2 dark:text-rink-100">
                나의 기록
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-w-pill bg-gray-300 dark:bg-wbg0" />
              <span className="text-card-meta font-bold text-wtext-2 dark:text-rink-100">
                팀 평균
              </span>
            </div>
          </div>
        </section>

        {/* ── 5개 능력치 상세 ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-wtext-1 dark:text-white tracking-tight">
              능력치 상세
            </h2>
            <span className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
              5 SKILLS
            </span>
          </div>
          {data.skills.map((skill) => (
            <SkillBar key={skill.key} skill={skill} />
          ))}
        </section>

        {/* ── 뱃지 진행률 ── */}
        <section className="bg-white dark:bg-rink-800 rounded-2xl p-6 border border-wline-2 dark:border-rink-700">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black text-wtext-1 dark:text-white tracking-tight">
              뱃지 진행률
            </h2>
            <span className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
              LEVEL UP
            </span>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              <CircularProgress progress={data.badge.progress} size={96} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-card-title font-black text-ice-500 tabular-nums">
                  {data.badge.progress}%
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300 mb-0.5">
                현재
              </p>
              <p className="text-card-emphasis font-black text-wtext-1 dark:text-white truncate tracking-tight">
                {data.badge.currentBadge}
              </p>
              <div className="mt-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300 mb-0.5">
                  다음
                </p>
                <p className="text-card-emphasis font-black text-ice-500 truncate tracking-tight">
                  {data.badge.nextBadge}
                </p>
              </div>
              <p className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 mt-2 tabular-nums">
                {data.badge.currentXP.toLocaleString()} /{" "}
                {data.badge.requiredXP.toLocaleString()} XP
              </p>
            </div>
          </div>
        </section>

        {/* ── 목표 체크리스트 ── */}
        <section className="bg-white dark:bg-rink-800 rounded-2xl p-6 border border-wline-2 dark:border-rink-700">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black text-wtext-1 dark:text-white tracking-tight">
              목표 체크리스트
            </h2>
            <span className="text-card-body font-black text-ice-500 tabular-nums">
              {completedGoals}
              <span className="text-wtext-3 dark:text-rink-300 font-bold">
                /{data.goals.length}
              </span>
            </span>
          </div>
          <ul className="space-y-4" role="list">
            {data.goals.map((goal) => (
              <li
                key={goal.id}
                className="flex items-center gap-3 min-h-[48px]"
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-md flex-shrink-0 flex items-center justify-center",
                    goal.completed
                      ? "bg-ice-500"
                      : "border-2 border-gray-300 dark:border-rink-700",
                  )}
                  role="checkbox"
                  aria-checked={goal.completed}
                >
                  {goal.completed && (
                    <Icon
                      name="check"
                      className="text-white text-card-emphasis font-bold"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "text-card-emphasis font-semibold",
                    goal.completed
                      ? "line-through text-wtext-3 dark:text-rink-300"
                      : "text-wtext-1 dark:text-rink-100",
                  )}
                >
                  {goal.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </MobileContainer>
    )}
    </div>
  );
}
