'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import dynamic from 'next/dynamic';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });
import { useToast } from '@/components/ui/Toast';
import { useSkillReport } from '@/hooks/useSkillReport';
import { ScoreRadar } from '@/components/shared';
import { SkillStatCard } from '@/components/report/SkillStatCard';
import { CoachCommentCard } from '@/components/report/CoachCommentCard';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useNavigation } from '@/components/ui/NavLink';
import { openShareSheet } from '@/lib/share';
import { MESSAGES } from '@/lib/messages';

// ---------------------------------------------------------------------------
// Skill axis config
// ---------------------------------------------------------------------------

const SKILL_AXES: { key: string; icon: string; labelKey: keyof typeof MESSAGES.skillReport }[] = [
  { key: 'skating', icon: 'ice_skating', labelKey: 'skating' },
  { key: 'shooting', icon: 'sports_hockey', labelKey: 'shooting' },
  { key: 'passing', icon: 'multiple_stop', labelKey: 'passing' },
  { key: 'agility', icon: 'sprint', labelKey: 'agility' },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SkillReportPage() {
  const { back, navigate } = useNavigation();
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // [2차 사이클 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: false });
  const { data, coachInfo, comment, isLoading } = useSkillReport();

  usePageReady(!isLoading);

  const handleShare = () => {
    openShareSheet({
      title: MESSAGES.skillReport.title,
      text: MESSAGES.skillReport.shareText(coachInfo?.name ?? ''),
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });
  };

  if (isLoading && !data) return null;

  // Compute average
  const avg =
    data
      ? Number(
          (
            (data.skating + data.shooting + data.passing + data.agility + data.teamwork) /
            5
          ).toFixed(1),
        )
      : 0;

  // Build ScoreRadar items
  const radarScores = data
    ? SKILL_AXES.map((axis) => ({
        label: MESSAGES.skillReport[axis.labelKey] as string,
        value: data[axis.key as keyof typeof data] as number,
        max: 5,
      })).concat([{ label: MESSAGES.skillReport.teamwork, value: data.teamwork, max: 5 }])
    : [];

  return (
    <MobileContainer hasBottomNav>
      {/* [appbar-harness-v4 · parent-agent · 2026-05-12] rightAction → extraActions 변환 —
          공유 버튼이 시계/종/메뉴를 통째로 대체하던 문제 해결. 메뉴 자동 유지. */}
      <PageAppBar
        title={MESSAGES.skillReport.title}
        forceNative
        extraActions={[
          {
            icon: 'ios_share',
            onClick: handleShare,
            label: '공유',
          },
        ]}
      />

      {/* Main Content
          [ICETIMES flat 재작업 2026-06-25] /report 와 동일 flat 언어 — main 은 회색 캔버스
          (bg-it-canvas dark:bg-puck), 콘텐츠 블록은 각자 mt-2 흰 섹션으로 쌓인다. 이전
          max-w-md space-y-6 + 카드 박스(rounded-xl border) → full-bleed flat 섹션 전환.
          데이터(useSkillReport)·차트(ScoreRadar) 로직 동결, 비주얼만. fixed footer 푸시 여백은
          main !pb-32 로 확보. */}
      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-32">
        {/* Coach Profile Header — flat 섹션 (카드 박스 제거) */}
        {coachInfo && (
          <section className="mt-2 flex items-center gap-4 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
            <div className="relative shrink-0">
              <div className="h-14 w-14 rounded-w-pill bg-it-fill dark:bg-rink-700 overflow-hidden border-2 border-it-blue-500 flex items-center justify-center">
                <Icon name="person" className="text-2xl text-it-ink-400" />
              </div>
              <div className="absolute bottom-0 right-0 h-3.5 w-3.5 bg-success border-2 border-it-surface dark:border-it-blue-950 rounded-w-pill" />
            </div>
            <div className="flex flex-col justify-center flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-card-emphasis font-bold text-it-ink-900 dark:text-white truncate">
                  {coachInfo.name}
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-it-blue-50 dark:bg-it-blue-500/15 text-it-blue-600 dark:text-it-blue-300">
                  {coachInfo.role}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-card-meta text-it-ink-500 dark:text-rink-300">
                <Icon name="calendar_today" className="text-card-body" />
                <span>{coachInfo.evaluationDate} {MESSAGES.skillReport.evaluation}</span>
              </div>
            </div>
          </section>
        )}

        {/* ScoreRadar — flat 섹션 (차트 SVG 로직 동결, 외곽 박스만 평탄화) */}
        {data && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-5 flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-4">
              <h3 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
                {MESSAGES.skillReport.overallAnalysis}
              </h3>
              <span className="text-[12px] text-it-ink-400 dark:text-rink-300 font-medium">
                {MESSAGES.skillReport.maxScore}
              </span>
            </div>
            <ScoreRadar
              scores={radarScores}
              centerValue={avg}
              centerLabel={MESSAGES.skillReport.averageScore}
              size={260}
              iceTheme
            />
            {/* 요약 캡션 — 평균 점수 시각 강조 */}
            <div className="w-full mt-4 pt-4 border-t border-it-line dark:border-it-blue-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon
                  name="insights"
                  className="text-it-blue-500 dark:text-it-blue-300 text-card-title"
                  aria-hidden="true"
                />
                <span className="text-card-meta font-semibold text-it-ink-700 dark:text-rink-100">
                  종합 평균
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold font-num text-it-blue-600 dark:text-it-blue-300 tabular-nums tracking-tight">
                  {avg}
                </span>
                <span className="text-card-body font-bold text-it-ink-500 dark:text-rink-300">
                  / 5.0
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Detailed Stats Grid — SkillStatCard 자체 표면 소유. flat 섹션으로 감싸 갭 부여. */}
        {data && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-5">
            <h3 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white mb-3">
              {MESSAGES.skillReport.detailedScores}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {SKILL_AXES.map((axis) => (
                <SkillStatCard
                  key={axis.key}
                  iceTheme
                  icon={axis.icon}
                  label={MESSAGES.skillReport[axis.labelKey] as string}
                  score={data[axis.key as keyof typeof data] as number}
                />
              ))}
              <div className="col-span-2">
                <SkillStatCard
                  iceTheme
                  icon="groups"
                  label={MESSAGES.skillReport.teamwork}
                  score={data.teamwork}
                  highlight={MESSAGES.skillReport.excellent}
                />
              </div>
            </div>
          </section>
        )}

        {/* Coach Comment — flat 섹션 (공유 컴포넌트 내부 불변) */}
        {comment && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-5">
            <CoachCommentCard
              iceTheme
              content={comment.content}
              date={comment.date}
              onReply={() => navigate('/messages')}
            />
          </section>
        )}
      </main>

      {/* Bottom Action Bar — page-local fixed 푸터 (AppBar/BottomNav 영역 아님). it-* 스왑. */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-it-surface dark:bg-puck border-t border-it-line dark:border-it-blue-900 pb-safe">
        <div className="max-w-md mx-auto px-4 py-4 flex gap-3">
          <button
            onClick={handleShare}
            className="flex-1 h-12 flex items-center justify-center gap-2 bg-it-surface dark:bg-it-blue-950 border border-it-line-strong dark:border-it-blue-900 text-it-ink-700 dark:text-rink-100 font-bold rounded-xl active:brightness-95 transition-colors motion-reduce:transition-none"
          >
            <Icon name="ios_share" className="text-card-title" />
            <span className="text-card-body">{MESSAGES.skillReport.shareReport}</span>
          </button>
          <button
            onClick={() => navigate('/messages')}
            className="flex-[2] h-12 flex items-center justify-center gap-2 bg-it-blue-500 hover:bg-it-blue-700 text-white font-bold rounded-xl active:brightness-95 transition-colors motion-reduce:transition-none"
          >
            <Icon name="chat" className="text-card-title" />
            <span className="text-card-emphasis">{MESSAGES.skillReport.askCoach}</span>
          </button>
        </div>
      </footer>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
