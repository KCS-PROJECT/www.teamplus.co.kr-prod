"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { NavLink, useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import dynamic from "next/dynamic";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { WalletAppBar } from "@/components/wallet/WalletAppBar";
import { useSessionAuth } from "@/hooks/useSessionAuth";

const GlobalMenu = dynamic(
  () =>
    import("@/components/layout/GlobalMenu").then((mod) => ({
      default: mod.GlobalMenu,
    })),
  { ssr: false },
);
import { useNativeUI } from "@/hooks/useNativeUI";
import { useNotificationCount } from "@/hooks/useNotificationCount";
import { MESSAGES } from "@/lib/messages";
import { api } from "@/services/api-client";
import { cn } from "@/lib/utils";
import { usePageReady } from '@/hooks/usePageReady';

// ─── Types ──────────────────────────────────────────────
interface SkillData {
  skating: number;
  shooting: number;
  passing: number;
  defense: number;
  stamina: number;
}

interface NextClassData {
  id: string;
  title: string;
  time: string;
  coach: string;
  location: string;
  date: string;
  isToday: boolean;
}

interface WeeklyTraining {
  day: string;
  intensity: number; // 0-100
  isToday: boolean;
}

// ─── Mock Data ──────────────────────────────────────────
const MOCK_SKILLS: SkillData = {
  skating: 82,
  shooting: 68,
  passing: 75,
  defense: 60,
  stamina: 88,
};

const MOCK_CLASSES: NextClassData[] = [
  {
    id: "1",
    title: "스케이팅 집중 훈련",
    time: "16:00 - 17:30",
    coach: "김민수 코치",
    location: "목동 아이스링크",
    date: "오늘",
    isToday: true,
  },
  {
    id: "2",
    title: "슈팅 기초 과정",
    time: "16:00 - 17:30",
    coach: "박영진 코치",
    location: "목동 아이스링크",
    date: "내일",
    isToday: false,
  },
];

const MOCK_WEEKLY: WeeklyTraining[] = [
  { day: "월", intensity: 65, isToday: false },
  { day: "화", intensity: 80, isToday: false },
  { day: "수", intensity: 90, isToday: true },
  { day: "목", intensity: 0, isToday: false },
  { day: "금", intensity: 70, isToday: false },
  { day: "토", intensity: 50, isToday: false },
  { day: "일", intensity: 0, isToday: false },
];

const MOCK_IMPROVEMENT = 15;

// ─── Radar Chart Component ─────────────────────────────
function RadarChart({ skills }: { skills: SkillData }) {
  const labels = [
    { key: "skating", label: "스케이팅" },
    { key: "shooting", label: "슈팅" },
    { key: "passing", label: "패스" },
    { key: "defense", label: "수비" },
    { key: "stamina", label: "체력" },
  ] as const;

  const cx = 100;
  const cy = 100;
  const maxR = 70;
  const angles = labels.map((_, i) => (Math.PI * 2 * i) / 5 - Math.PI / 2);

  // 오각형 꼭짓점 계산
  const getPolygonPoints = (radius: number) =>
    angles
      .map((a) => `${cx + radius * Math.cos(a)},${cy + radius * Math.sin(a)}`)
      .join(" ");

  // 데이터 포인트 계산
  const dataPoints = labels.map((l, i) => {
    const val = skills[l.key] / 100;
    const r = maxR * val;
    return `${cx + r * Math.cos(angles[i])},${cy + r * Math.sin(angles[i])}`;
  });

  // 라벨 위치 계산
  const labelPositions = angles.map((a) => ({
    x: cx + (maxR + 20) * Math.cos(a),
    y: cy + (maxR + 20) * Math.sin(a),
  }));

  return (
    <svg
      viewBox="0 0 200 200"
      className="w-full max-w-[240px] mx-auto"
      role="img"
      aria-label={`능력 분석 차트: 스케이팅 ${skills.skating}%, 슈팅 ${skills.shooting}%, 패스 ${skills.passing}%, 수비 ${skills.defense}%, 체력 ${skills.stamina}%`}
    >
      {/* 가이드 오각형 (3단계) */}
      {[1, 0.66, 0.33].map((scale) => (
        <polygon
          key={scale}
          points={getPolygonPoints(maxR * scale)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-wtext-3 dark:text-wtext-2"
        />
      ))}

      {/* 축 라인 */}
      {angles.map((a, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + maxR * Math.cos(a)}
          y2={cy + maxR * Math.sin(a)}
          stroke="currentColor"
          strokeWidth="1"
          className="text-wtext-3 dark:text-wtext-2"
        />
      ))}

      {/* 데이터 polygon */}
      <polygon
        points={dataPoints.join(" ")}
        strokeWidth="2"
        strokeLinejoin="round"
        className="fill-primary/15 stroke-primary"
      />

      {/* 데이터 포인트 */}
      {dataPoints.map((p, i) => {
        const [px, py] = p.split(",").map(Number);
        return (
          <circle
            key={i}
            cx={px}
            cy={py}
            r="4"
            stroke="white"
            strokeWidth="2"
            className="fill-primary"
          />
        );
      })}

      {/* 라벨 */}
      {labels.map((l, i) => (
        <text
          key={l.key}
          x={labelPositions[i].x}
          y={labelPositions[i].y}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-slate-600 dark:fill-slate-300 text-[10px] font-semibold"
        >
          {l.label}
        </text>
      ))}
    </svg>
  );
}

// ─── Weekly Bar Chart ───────────────────────────────────
function WeeklyBarChart({ data }: { data: WeeklyTraining[] }) {
  const maxIntensity = Math.max(...data.map((d) => d.intensity), 1);

  return (
    <div
      className="flex items-end justify-between gap-2 h-32 px-2"
      role="img"
      aria-label="주간 훈련 강도 차트"
    >
      {data.map((d) => {
        const height =
          d.intensity > 0 ? Math.max((d.intensity / maxIntensity) * 100, 8) : 4;
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
            <div
              className="w-full flex items-end justify-center"
              style={{ height: 96 }}
            >
              <div
                className={cn(
                  "w-full max-w-[32px] rounded-t-lg transition-all motion-reduce:transition-none duration-500",
                  d.isToday
                    ? "bg-ice-500 shadow-md"
                    : d.intensity > 0
                      ? "bg-ice-500/60"
                      : "bg-wline dark:bg-rink-700",
                )}
                style={{ height: `${height}%` }}
                role="presentation"
                aria-label={`${d.day}요일 훈련 강도 ${d.intensity}%`}
              />
            </div>
            <span
              className={cn(
                "text-card-meta font-bold",
                d.isToday
                  ? "text-ice-500"
                  : "text-wtext-3 dark:text-rink-300",
              )}
            >
              {d.day}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────
export default function TeenDashboardDetailPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { user, isAuthenticated } = useSessionAuth();
  const { unreadCount } = useNotificationCount();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [skills, setSkills] = useState<SkillData | null>(null);
  const [nextClasses, setNextClasses] = useState<NextClassData[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyTraining[]>([]);
  const [improvement, setImprovement] = useState(0);
  // 섹션별 독립 로딩 플래그 (단일 isLoading 대체)
  const [statsLoading, setStatsLoading] = useState(true); // weekly/improvement/axes
  const [skillsLoading, setSkillsLoading] = useState(true); // skill-evaluations fallback
  const [classesLoading] = useState(false); // MOCK — 즉시 false

  const { navigate } = useNavigation();
  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  // 6개 메인 화면 AppBar 일관성 — 자체 WalletAppBar 사용 (네이티브 AppBar 끔)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: true,
    showBackButton: false,
    showMenuButton: false,
  });

  // 데이터 로드 — 2개 API 를 독립 async 함수로 분리하여 병렬 시작
  // · stats 는 weekly/improvement/axes 제공 (skills 의 1순위 소스)
  // · skills 는 fallback (stats 에 axes 없거나 실패 시) — functional setState 로 race 조건 안전 처리
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let isMounted = true;

    // classes 는 MOCK — 즉시 세팅
    setNextClasses(MOCK_CLASSES);

    const memberId = user.id;

    const fetchStats = async () => {
      try {
        const res = await api.get<{
          weeklyIntensity: { day: string; value: number; isToday: boolean }[];
          improvement: number;
          axes: { label: string; value: number; teamAvg: number }[];
        }>(`/training-stats/member/${memberId}/dashboard?period=weekly`, {
          retry: false,
        });
        if (!isMounted) return;
        if (res.success && res.data) {
          const d = res.data;
          setWeeklyData(
            d.weeklyIntensity
              ? d.weeklyIntensity.map((w) => ({
                  day: w.day,
                  intensity: w.value,
                  isToday: w.isToday,
                }))
              : MOCK_WEEKLY,
          );
          setImprovement(d.improvement ?? MOCK_IMPROVEMENT);
          if (d.axes) {
            const skillMap: Record<string, number> = {};
            const LABEL_TO_KEY: Record<string, string> = {
              스케이팅: "skating",
              슈팅: "shooting",
              패스: "passing",
              수비: "defense",
              체력: "stamina",
            };
            for (const axis of d.axes) {
              const key = LABEL_TO_KEY[axis.label] ?? axis.label;
              skillMap[key] = axis.value;
            }
            // stats 는 skills 1순위 — 항상 덮어씀
            setSkills({
              skating: skillMap.skating ?? 0,
              shooting: skillMap.shooting ?? 0,
              passing: skillMap.passing ?? 0,
              defense: skillMap.defense ?? 0,
              stamina: skillMap.stamina ?? 0,
            });
          }
        } else {
          setWeeklyData(MOCK_WEEKLY);
          setImprovement(MOCK_IMPROVEMENT);
        }
      } catch {
        if (!isMounted) return;
        setWeeklyData(MOCK_WEEKLY);
        setImprovement(MOCK_IMPROVEMENT);
      } finally {
        if (isMounted) setStatsLoading(false);
      }
    };

    const fetchSkillsFallback = async () => {
      try {
        const res = await api.get<{ skillData: Record<string, number> }>(
          "/skill-evaluations/me",
          { retry: false },
        );
        if (!isMounted) return;
        if (res.success && res.data?.skillData) {
          const sd = res.data.skillData;
          // functional setState — stats(axes) 가 이미 설정했으면 유지, 아니면 skills API 값 사용
          setSkills(
            (prev) =>
              prev ?? {
                skating: Math.round((sd.skating ?? 0) * 20),
                shooting: Math.round((sd.shooting ?? 0) * 20),
                passing: Math.round((sd.passing ?? 0) * 20),
                defense: Math.round(
                  (sd.defense ?? sd.gameManagement ?? 0) * 20,
                ),
                stamina: Math.round((sd.stamina ?? sd.puckHandling ?? 0) * 20),
              },
          );
        } else {
          setSkills((prev) => prev ?? MOCK_SKILLS);
        }
      } catch {
        if (!isMounted) return;
        setSkills((prev) => prev ?? MOCK_SKILLS);
      } finally {
        if (isMounted) setSkillsLoading(false);
      }
    };

    // 2개 독립 병렬 시작 (await 없음)
    void fetchStats();
    void fetchSkillsFallback();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user]);

  const userName = user?.name ?? "";
  const now = useMemo(() => new Date(), []);
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dateString = `${now.getMonth() + 1}월 ${now.getDate()}일 ${dayNames[now.getDay()]}요일`;

  return (
    <MobileContainer hasBottomNav>
      {/* ─── AppBar — 6개 메인 화면 통일 (WalletAppBar) ─── */}
      <WalletAppBar
        forceNative
        timelineBadge={unreadCount > 0 ? unreadCount : undefined}
        onSearch={() => navigate("/search")}
        onTimeline={() => navigate("/timeline")}
        onMy={() => navigate("/notifications")}
        onMenu={openMenu}
      />

      {/* ─── Main Content ──────────────────────── */}
      <main
        className="flex-1 min-h-0 flex flex-col gap-6 pt-5 pb-30 overflow-y-auto hide-scrollbar"
        role="main"
        aria-label="종합 대시보드"
      >
        {/* 프로필 헤더 — 모던 대담 */}
        <div className="px-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-ice-500 flex items-center justify-center shrink-0 shadow-sm">
            <Icon
              name="person"
              className="text-[32px] text-white"
              filled
              aria-hidden="true"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-card-body text-wtext-3 dark:text-rink-300 font-bold tracking-wide uppercase">
              {dateString}
            </p>
            <h1 className="text-3xl font-black text-wtext-1 dark:text-white leading-tight tracking-tight">
              {userName}님
            </h1>
            <p className="text-card-emphasis font-bold text-wtext-2 dark:text-rink-100 mt-0.5">
              오늘도 링크 위에서!
            </p>
          </div>
          <NavLink
            href="/notification-settings"
            className="flex size-12 items-center justify-center rounded-w-pill hover:bg-wline-2 dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none"
            aria-label="설정"
          >
            <Icon
              name="settings"
              className="text-2xl text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </NavLink>
        </div>

        {/* 요약 스탯 칩 — skills 준비되면 즉시 표시 (stats axes 또는 skills API fallback) */}
        {skills && (
          <div className="px-5">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white dark:bg-rink-800 rounded-xl p-3 border border-wline-2 dark:border-rink-700 flex flex-col items-center">
                <Icon
                  name="military_tech"
                  className="text-amber-500 text-xl mb-1"
                  aria-hidden="true"
                />
                <span className="text-card-title font-black text-wtext-1 dark:text-white tabular-nums leading-none">
                  {Math.round(
                    (skills.skating +
                      skills.shooting +
                      skills.passing +
                      skills.defense +
                      skills.stamina) /
                      5,
                  )}
                </span>
                <p className="text-[11px] font-bold text-wtext-3 dark:text-rink-300 mt-1">
                  평균 점수
                </p>
              </div>
              <div className="bg-white dark:bg-rink-800 rounded-xl p-3 border border-wline-2 dark:border-rink-700 flex flex-col items-center">
                <Icon
                  name="bolt"
                  className="text-ice-500 text-xl mb-1"
                  aria-hidden="true"
                />
                <span className="text-card-title font-black text-ice-500 tabular-nums leading-none">
                  {Math.max(
                    skills.skating,
                    skills.shooting,
                    skills.passing,
                    skills.defense,
                    skills.stamina,
                  )}
                </span>
                <p className="text-[11px] font-bold text-wtext-3 dark:text-rink-300 mt-1">
                  최고 능력
                </p>
              </div>
              <div className="bg-white dark:bg-rink-800 rounded-xl p-3 border border-wline-2 dark:border-rink-700 flex flex-col items-center">
                <Icon
                  name="rocket_launch"
                  className="text-orange-500 text-xl mb-1"
                  aria-hidden="true"
                />
                <span className="text-card-title font-black text-orange-500 tabular-nums leading-none">
                  +{improvement}%
                </span>
                <p className="text-[11px] font-bold text-wtext-3 dark:text-rink-300 mt-1">
                  성장률
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 핵심 능력 분석 카드 — stats OR skills 중 하나라도 완료되어 skills 가 채워지면 렌더 */}
        <div className="px-5">
          {statsLoading && skillsLoading ? null : (
            <div className="bg-white dark:bg-rink-800 rounded-2xl p-6 shadow-sm border border-wline-2 dark:border-rink-700">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Icon
                    name="analytics"
                    className="text-ice-500 text-2xl"
                    filled
                    aria-hidden="true"
                  />
                  <h2 className="text-xl font-black text-wtext-1 dark:text-white tracking-tight">
                    핵심 능력 분석
                  </h2>
                </div>
                <span className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
                  SKILL RADAR
                </span>
              </div>
              {skills && <RadarChart skills={skills} />}
              {/* 능력치 수치 표시 — 큰 숫자 강조 */}
              {skills && (
                <div className="grid grid-cols-5 gap-2 mt-5 pt-5 border-t border-wline-2 dark:border-rink-700">
                  {(
                    [
                      { key: "skating", label: "스케이팅" },
                      { key: "shooting", label: "슈팅" },
                      { key: "passing", label: "패스" },
                      { key: "defense", label: "수비" },
                      { key: "stamina", label: "체력" },
                    ] as const
                  ).map((item) => (
                    <div key={item.key} className="text-center">
                      <span className="block text-2xl font-black text-ice-500 tabular-nums leading-none">
                        {skills[item.key]}
                      </span>
                      <p className="text-[11px] text-wtext-3 dark:text-rink-300 font-bold mt-1.5">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 실력 향상도 카드 — statsLoading 전용 (improvement 는 stats API 에서만 옴) */}
        <div className="px-5">
          {statsLoading ? null : (
            <div className="bg-ice-500 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Icon
                  name="trending_up"
                  className="text-white text-xl"
                  aria-hidden="true"
                />
                <p className="text-card-body font-bold uppercase tracking-wider text-white/80">
                  이번 달 실력 향상도
                </p>
              </div>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-6xl font-black text-white tabular-nums leading-none">
                  +{improvement}
                </span>
                <span className="text-2xl font-black text-white/80">%</span>
              </div>
              <div className="w-full bg-white/20 rounded-w-pill h-3 overflow-hidden">
                <div
                  className="bg-white rounded-w-pill h-full transition-all motion-reduce:transition-none duration-700"
                  style={{ width: `${Math.min(improvement * 2, 100)}%` }}
                  role="progressbar"
                  aria-valuenow={improvement}
                  aria-valuemin={0}
                  aria-valuemax={50}
                  aria-label={`실력 향상도 ${improvement}%`}
                />
              </div>
              <p className="text-card-meta text-white/70 mt-3 font-semibold">
                지난달 대비 종합 능력치 변화
              </p>
            </div>
          )}
        </div>

        {/* 다음 수업 섹션 - 타임라인 */}
        <div className="px-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-wtext-1 dark:text-white flex items-center gap-2 tracking-tight">
              <Icon
                name="event"
                className="text-ice-500 text-2xl"
                filled
                aria-hidden="true"
              />
              다음 수업
            </h2>
            <NavLink
              href="/schedule"
              className="min-h-[44px] flex items-center px-3 -mr-3 text-card-body font-bold text-ice-500 hover:text-ice-700 transition-colors motion-reduce:transition-none"
            >
              {MESSAGES.dashboard.viewAll}
            </NavLink>
          </div>

          {classesLoading ? null : nextClasses.length > 0 ? (
            <div className="relative">
              {nextClasses.map((cls, idx) => (
                <div key={cls.id} className="flex gap-4 mb-4 last:mb-0">
                  {/* 타임라인 왼쪽: 원 + 세로선 */}
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-4 h-4 rounded-w-pill shrink-0 mt-1",
                        cls.isToday
                          ? "bg-ice-500 shadow-sm"
                          : "bg-wline dark:bg-rink-500",
                      )}
                    />
                    {idx < nextClasses.length - 1 && (
                      <div className="w-0.5 flex-1 bg-wline dark:bg-rink-700 mt-1" />
                    )}
                  </div>

                  {/* 카드 */}
                  <div
                    className={cn(
                      "flex-1 rounded-xl p-4 transition-all motion-reduce:transition-none",
                      cls.isToday
                        ? "bg-ice-500/5 dark:bg-ice-500/10 border border-wline-2 dark:border-rink-700 shadow-sm"
                        : "bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 opacity-90",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={cn(
                          "text-card-meta font-black px-2.5 py-1 rounded-w-pill uppercase tracking-wider",
                          cls.isToday
                            ? "bg-ice-500 text-white"
                            : "bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300",
                        )}
                      >
                        {cls.date}
                      </span>
                    </div>
                    <h3 className="text-card-title font-black text-wtext-1 dark:text-white mb-3 tracking-tight">
                      {cls.title}
                    </h3>
                    <div className="flex flex-col gap-1.5 text-card-body font-semibold text-wtext-2 dark:text-rink-100">
                      <div className="flex items-center gap-2">
                        <Icon
                          name="schedule"
                          className="text-card-emphasis text-wtext-3"
                          aria-hidden="true"
                        />
                        <span>{cls.time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Icon
                          name="person"
                          className="text-card-emphasis text-wtext-3"
                          aria-hidden="true"
                        />
                        <span>{cls.coach}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Icon
                          name="location_on"
                          className="text-card-emphasis text-wtext-3"
                          aria-hidden="true"
                        />
                        <span>{cls.location}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-rink-800 rounded-xl p-8 border border-wline-2 dark:border-rink-700 flex flex-col items-center gap-2">
              <Icon
                name="event_busy"
                className="text-3xl text-wtext-4 dark:text-rink-500"
                aria-hidden="true"
              />
              <p className="text-card-body text-wtext-3 dark:text-rink-300">
                {MESSAGES.dashboard.noSchedule}
              </p>
            </div>
          )}
        </div>

        {/* 주간 훈련 강도 차트 — statsLoading 전용 (weeklyData 는 stats API 에서만 옴) */}
        <div className="px-5">
          {statsLoading ? null : (
            <div className="bg-white dark:bg-rink-800 rounded-2xl p-6 shadow-sm border border-wline-2 dark:border-rink-700">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Icon
                    name="fitness_center"
                    className="text-ice-500 text-2xl"
                    filled
                    aria-hidden="true"
                  />
                  <h2 className="text-xl font-black text-wtext-1 dark:text-white tracking-tight">
                    주간 훈련 강도
                  </h2>
                </div>
                <span className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
                  THIS WEEK
                </span>
              </div>
              <WeeklyBarChart data={weeklyData} />
            </div>
          )}
        </div>

        {/* 하단 여백 */}
        <div className="h-4" aria-hidden="true" />
      </main>

      {/* ─── GlobalMenu ────────────────────────── */}
      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </MobileContainer>
  );
}
