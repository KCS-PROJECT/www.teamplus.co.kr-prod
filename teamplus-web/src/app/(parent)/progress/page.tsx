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
// [ICETIMES flat 2026-06-25] 스킬 tone → it-blue 단일 액센트로 통일.
//   기존 sky/emerald/violet/amber 다색 → ICETIMES 2색(blue) 언어. 막대/수치 로직 동결, 색만 스왑.
function toneBg(): string {
  return 'bg-it-blue-50 dark:bg-it-blue-500/15';
}
function toneText(): string {
  return 'text-it-blue-500 dark:text-it-blue-300';
}
function toneBar(): string {
  return 'bg-it-blue-500';
}

// ─── Components ──────────────────────────────────────
function LevelHero({ level }: { level: LevelBadge }) {
  return (
    /* [ICETIMES flat 2026-06-25] 레벨 요약 = navy 히어로 밴드 full-bleed.
       기존 흰 카드 박스(rounded-2xl border) → 잔액/요약 navy 밴드 패턴(ROLLOUT §3 히어로). */
    <section
      className="bg-it-blue-800 dark:bg-it-blue-950 px-5 py-6"
      aria-label="현재 레벨 요약"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
          현재 레벨
        </span>
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-white bg-white/15 px-2 py-1 rounded">
          LEVEL {level.level}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <Icon name="workspace_premium" className="text-white text-4xl" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[20px] font-extrabold text-white truncate">
            {level.label}
          </p>
          <p className="mt-0.5 text-[12.5px] text-white/70">
            다음 레벨: <span className="font-semibold text-white">{level.nextLevel}</span>
          </p>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] text-white/70">다음 레벨까지</span>
          <span className="text-[14px] font-extrabold text-white font-num tabular-nums">
            <CountUp end={level.nextPercent} duration={1400} />%
          </span>
        </div>
        <div
          className="h-2 w-full rounded-w-pill bg-white/15 overflow-hidden"
          role="progressbar"
          aria-valuenow={level.nextPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`다음 레벨까지 ${level.nextPercent}%`}
        >
          <div
            className="h-full rounded-w-pill bg-white transition-all motion-reduce:transition-none duration-700 ease-out"
            style={{ width: `${level.nextPercent}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function SkillProgressRow({ item }: { item: SkillProgressItem }) {
  const isPositive = item.delta >= 0;
  return (
    /* [ICETIMES flat 2026-06-25] 카드 박스 제거 → hairline 행. last:border-0 으로 마지막 행 구분선 제거. */
    <li className="py-4 border-b border-it-line dark:border-it-blue-900 last:border-0">
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', toneBg())}
          aria-hidden="true"
        >
          <Icon name={item.icon} className={cn('text-xl', toneText())} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-it-ink-900 dark:text-white truncate">
            {item.label}
          </p>
          <p className="mt-0.5 text-[12px] text-it-ink-500 dark:text-rink-300">
            지난 평가 대비
            <span
              className={cn(
                'ml-1 font-bold tabular-nums',
                isPositive ? 'text-it-blue-500 dark:text-it-blue-300' : 'text-it-red-500 dark:text-it-red-300'
              )}
            >
              {isPositive ? '+' : ''}
              {item.delta}점
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className={cn('text-xl font-extrabold font-num tabular-nums', toneText())}>
            <CountUp end={item.percent} duration={1400} />
          </p>
          <p className="text-[12px] text-it-ink-500 dark:text-rink-300 font-medium">/100점</p>
        </div>
      </div>
      <div
        className="h-2 w-full rounded-w-pill bg-it-line dark:bg-it-blue-900 overflow-hidden"
        role="progressbar"
        aria-valuenow={item.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${item.label} ${item.percent}점`}
      >
        <div
          className={cn('h-full rounded-w-pill transition-all motion-reduce:transition-none duration-700 ease-out', toneBar())}
          style={{ width: `${item.percent}%` }}
        />
      </div>
    </li>
  );
}

function HighlightTile({
  icon,
  label,
  value,
  suffix,
}: {
  icon: string;
  label: string;
  value: number;
  suffix: string;
}) {
  return (
    /* [ICETIMES flat 2026-06-25] 흰 카드 박스 → it-fill 인셋 타일(섹션 내부 통계). */
    <div className="rounded-xl bg-it-fill dark:bg-it-blue-900 p-4">
      <div className="w-9 h-9 rounded-lg bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center mb-3" aria-hidden="true">
        <Icon name={icon} className="text-[16px] text-it-blue-500 dark:text-it-blue-300" />
      </div>
      <p className="text-[12px] font-medium text-it-ink-500 dark:text-rink-300">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold font-num text-it-ink-900 dark:text-white tabular-nums">
        <CountUp end={value} duration={1400} />
        <span className="text-[14px] font-bold text-it-ink-500 dark:text-rink-300 ml-0.5">{suffix}</span>
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

      {/* [ICETIMES flat 재작업 2026-06-25] /report·/director 와 동일 flat 언어 —
          main 은 회색 캔버스(bg-it-canvas dark:bg-puck), 콘텐츠 블록은 각자 mt-2 흰 섹션
          (또는 navy 히어로)으로 쌓인다. 이전 px-5 gap-6 + 카드 박스(rounded-* border) →
          full-bleed flat 섹션 전환. 데이터/통계 로직 동결, 비주얼만. */}
      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label="자녀 성장 기록"
      >
        {/* 1. 현재 레벨 navy 히어로 */}
        <LevelHero level={currentLevel} />

        {/* 2. 요약 지표 2칸 — 흰 섹션 + it-fill 인셋 타일 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <HighlightTile
              icon="insights"
              label="평균 점수"
              value={averageScore}
              suffix="점"
            />
            <HighlightTile
              icon="trending_up"
              label="상승 영역"
              value={improvedCount}
              suffix={`/${skillItems.length}`}
            />
          </div>
        </section>

        {/* 3. 출석률 성장 추이 차트 — GrowthTrendChart 자체 표면 소유. flat 섹션으로 감싸 갭 부여. */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5">
          <GrowthTrendChart
            iceTheme
            title="월간 출석률 추이"
            subtitle="최근 6개월 기준"
            badge="LAST 6M"
            data={attendanceTrend}
          />
        </section>

        {/* 4. 스킬별 진행도 — 흰 섹션 + hairline 행 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5" aria-labelledby="skill-progress-heading">
          <div className="flex items-center justify-between mb-1">
            <h2
              id="skill-progress-heading"
              className="text-[15px] font-extrabold text-it-ink-900 dark:text-white"
            >
              스킬별 진행도
            </h2>
            <span className="text-[12px] text-it-ink-500 dark:text-rink-300 font-medium">
              100점 만점
            </span>
          </div>
          <ul>
            {skillItems.map((item) => (
              <SkillProgressRow key={item.id} item={item} />
            ))}
          </ul>
        </section>

        {/* 5. 안내 배너 — 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5">
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-lg bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <Icon name="tips_and_updates" className="text-it-blue-500 dark:text-it-blue-300 text-[16px]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-it-ink-900 dark:text-white mb-1">
                성장 기록 안내
              </p>
              <p className="text-[12px] text-it-ink-500 dark:text-rink-300 leading-relaxed">
                코치님의 월간 기술 평가와 출석 데이터를 기반으로 자동 산출됩니다.
                다음 평가일까지 꾸준히 참여해 보세요.
              </p>
            </div>
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
