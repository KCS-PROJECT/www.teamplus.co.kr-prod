'use client';

import { useMemo } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { GrowthTrendChart } from '@/components/parent/GrowthTrendChart';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────
interface SkillProgressItem {
  id: string;
  label: string;
  icon: string;
  percent: number;
  delta: number; // 지난 달 대비 변화 (+/-)
  tone: 'skating' | 'shooting' | 'passing' | 'teamwork';
}

interface LevelBadge {
  label: string;
  level: number;
  nextLevel: string;
  nextPercent: number;
}

// ─── Mock Data (실데이터 연결 전까지) ─────────────────
const skillItems: SkillProgressItem[] = [
  { id: 'skating',  label: '스케이팅 기본기', icon: 'ice_skating',   percent: 78, delta: 6,  tone: 'skating' },
  { id: 'passing',  label: '패스 정확도',     icon: 'multiple_stop', percent: 85, delta: 4,  tone: 'passing' },
  { id: 'teamwork', label: '팀워크',          icon: 'groups',        percent: 92, delta: 8,  tone: 'teamwork' },
  { id: 'shooting', label: '슈팅',            icon: 'sports_hockey', percent: 71, delta: -2, tone: 'shooting' },
];

const attendanceTrend = [
  { label: '11월', value: 72 },
  { label: '12월', value: 78 },
  { label: '1월',  value: 81 },
  { label: '2월',  value: 85 },
  { label: '3월',  value: 90 },
  { label: '4월',  value: 93 },
];

const currentLevel: LevelBadge = {
  label: '중급 · 스트라이더',
  level: 3,
  nextLevel: '상급 · 스프린터',
  nextPercent: 64,
};

// ─── Helpers ─────────────────────────────────────────
function toneBg(tone: SkillProgressItem['tone']): string {
  switch (tone) {
    case 'skating':  return 'bg-sky-50 dark:bg-sky-900/20';
    case 'passing':  return 'bg-emerald-50 dark:bg-emerald-900/20';
    case 'teamwork': return 'bg-violet-50 dark:bg-violet-900/20';
    case 'shooting': return 'bg-amber-50 dark:bg-amber-900/20';
  }
}
function toneText(tone: SkillProgressItem['tone']): string {
  switch (tone) {
    case 'skating':  return 'text-sky-600 dark:text-sky-400';
    case 'passing':  return 'text-emerald-600 dark:text-emerald-400';
    case 'teamwork': return 'text-violet-600 dark:text-violet-400';
    case 'shooting': return 'text-amber-600 dark:text-amber-400';
  }
}
function toneBar(tone: SkillProgressItem['tone']): string {
  switch (tone) {
    case 'skating':  return 'bg-sky-500';
    case 'passing':  return 'bg-emerald-500';
    case 'teamwork': return 'bg-violet-500';
    case 'shooting': return 'bg-amber-500';
  }
}

// ─── Components ──────────────────────────────────────
function LevelHeroCard({ level }: { level: LevelBadge }) {
  return (
    <section
      className="rounded-2xl bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 p-5 shadow-sm"
      aria-label="현재 레벨 요약"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-1 h-4 bg-ice-500 rounded-w-pill" aria-hidden="true" />
          <span className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
            현재 레벨
          </span>
        </div>
        <span className="text-card-meta font-bold uppercase tracking-wider text-ice-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
          LEVEL {level.level}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Icon name="workspace_premium" className="text-ice-500 text-4xl" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-card-title font-extrabold text-wtext-1 dark:text-white truncate">
            {level.label}
          </p>
          <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-rink-300">
            다음 레벨: <span className="font-semibold text-wtext-2 dark:text-rink-100">{level.nextLevel}</span>
          </p>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-card-meta text-wtext-3 dark:text-rink-300">다음 레벨까지</span>
          <span className="text-card-body font-bold text-ice-500 tabular-nums">
            <CountUp end={level.nextPercent} duration={1400} />%
          </span>
        </div>
        <div
          className="h-2 w-full rounded-w-pill bg-wline-2 dark:bg-rink-700 overflow-hidden"
          role="progressbar"
          aria-valuenow={level.nextPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`다음 레벨까지 ${level.nextPercent}%`}
        >
          <div
            className="h-full rounded-w-pill bg-ice-500 transition-all motion-reduce:transition-none duration-700 ease-out"
            style={{ width: `${level.nextPercent}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function SkillProgressCard({ item }: { item: SkillProgressItem }) {
  const isPositive = item.delta >= 0;
  return (
    <li className="rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', toneBg(item.tone))}
          aria-hidden="true"
        >
          <Icon name={item.icon} className={cn('text-xl', toneText(item.tone))} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
            {item.label}
          </p>
          <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-rink-300">
            지난 평가 대비
            <span
              className={cn(
                'ml-1 font-bold tabular-nums',
                isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
              )}
            >
              {isPositive ? '+' : ''}
              {item.delta}점
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className={cn('text-xl font-extrabold tabular-nums', toneText(item.tone))}>
            <CountUp end={item.percent} duration={1400} />
          </p>
          <p className="text-card-meta text-wtext-3 dark:text-rink-300 font-medium">/100점</p>
        </div>
      </div>
      <div
        className="h-2 w-full rounded-w-pill bg-wline-2 dark:bg-rink-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={item.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${item.label} ${item.percent}점`}
      >
        <div
          className={cn('h-full rounded-w-pill transition-all motion-reduce:transition-none duration-700 ease-out', toneBar(item.tone))}
          style={{ width: `${item.percent}%` }}
        />
      </div>
    </li>
  );
}

function HighlightCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  suffix,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  suffix: string;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-sm">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', iconBg)} aria-hidden="true">
        <Icon name={icon} className={cn('text-card-title', iconColor)} />
      </div>
      <p className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold text-wtext-1 dark:text-white tabular-nums">
        <CountUp end={value} duration={1400} />
        <span className="text-card-body font-bold text-wtext-3 dark:text-rink-300 ml-0.5">{suffix}</span>
      </p>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────
export default function ChildProgressPage() {
  usePageReady(true);

  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const averageScore = useMemo(
    () => Math.round(skillItems.reduce((sum, s) => sum + s.percent, 0) / skillItems.length),
    []
  );
  const improvedCount = useMemo(
    () => skillItems.filter((s) => s.delta > 0).length,
    []
  );

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar showBack={false} title="성장 기록" showMenu />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar px-5 pt-5 pb-30"
        role="main"
        aria-label="자녀 성장 기록"
      >
        <div className="flex flex-col gap-6">
          {/* 1. 현재 레벨 Hero */}
          <LevelHeroCard level={currentLevel} />

          {/* 2. 요약 지표 2칸 */}
          <div className="grid grid-cols-2 gap-3">
            <HighlightCard
              icon="insights"
              iconBg="bg-blue-50 dark:bg-blue-900/20"
              iconColor="text-ice-500"
              label="평균 점수"
              value={averageScore}
              suffix="점"
            />
            <HighlightCard
              icon="trending_up"
              iconBg="bg-emerald-50 dark:bg-emerald-900/20"
              iconColor="text-emerald-600 dark:text-emerald-400"
              label="상승 영역"
              value={improvedCount}
              suffix={`/${skillItems.length}`}
            />
          </div>

          {/* 3. 출석률 성장 추이 차트 */}
          <GrowthTrendChart
            title="월간 출석률 추이"
            subtitle="최근 6개월 기준"
            badge="LAST 6M"
            data={attendanceTrend}
          />

          {/* 4. 스킬별 진행도 */}
          <section aria-labelledby="skill-progress-heading">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 bg-ice-500 rounded-w-pill" aria-hidden="true" />
                <h2
                  id="skill-progress-heading"
                  className="text-card-emphasis font-bold text-wtext-1 dark:text-white"
                >
                  스킬별 진행도
                </h2>
              </div>
              <span className="text-card-meta text-wtext-3 dark:text-rink-300 font-medium">
                100점 만점
              </span>
            </div>
            <ul className="space-y-3">
              {skillItems.map((item) => (
                <SkillProgressCard key={item.id} item={item} />
              ))}
            </ul>
          </section>

          {/* 5. 안내 배너 */}
          <section className="rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <Icon name="tips_and_updates" className="text-ice-500 text-card-title" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-card-body font-bold text-wtext-1 dark:text-white mb-1">
                  성장 기록 안내
                </p>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 leading-relaxed">
                  코치님의 월간 기술 평가와 출석 데이터를 기반으로 자동 산출됩니다.
                  다음 평가일까지 꾸준히 참여해 보세요.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </MobileContainer>
  );
}
