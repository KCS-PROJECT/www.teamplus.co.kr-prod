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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto hide-scrollbar w-full max-w-md mx-auto pb-30 px-4 pt-6 space-y-6">
        {/* Coach Profile Header */}
        {coachInfo && (
          <section className="flex items-center gap-4 bg-white dark:bg-rink-800 p-4 rounded-xl border border-wline-2 dark:border-rink-700">
            <div className="relative shrink-0">
              <div className="h-14 w-14 rounded-w-pill bg-wline-2 dark:bg-rink-700 overflow-hidden border-2 border-ice-500 flex items-center justify-center">
                <Icon name="person" className="text-2xl text-wtext-3" />
              </div>
              <div className="absolute bottom-0 right-0 h-3.5 w-3.5 bg-green-500 border-2 border-white dark:border-rink-800 rounded-w-pill" />
            </div>
            <div className="flex flex-col justify-center flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-card-emphasis font-bold text-wtext-1 dark:text-white truncate">
                  {coachInfo.name}
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-ice-500">
                  {coachInfo.role}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-card-meta text-wtext-3 dark:text-rink-300">
                <Icon name="calendar_today" className="text-card-body" />
                <span>{coachInfo.evaluationDate} {MESSAGES.skillReport.evaluation}</span>
              </div>
            </div>
          </section>
        )}

        {/* ScoreRadar */}
        {data && (
          <section className="bg-white dark:bg-rink-800 rounded-xl p-5 border border-wline-2 dark:border-rink-700 flex flex-col items-center shadow-sm">
            <div className="w-full flex justify-between items-center mb-4">
              <h3 className="font-bold text-wtext-1 dark:text-white flex items-center gap-2 text-card-emphasis">
                <span className="w-1 h-4 bg-ice-500 rounded-w-pill" aria-hidden="true" />
                {MESSAGES.skillReport.overallAnalysis}
              </h3>
              <span className="text-[11px] text-wtext-3 dark:text-rink-300 font-medium">
                {MESSAGES.skillReport.maxScore}
              </span>
            </div>
            <ScoreRadar
              scores={radarScores}
              centerValue={avg}
              centerLabel={MESSAGES.skillReport.averageScore}
              size={260}
            />
            {/* 요약 캡션 — 평균 점수 시각 강조 */}
            <div className="w-full mt-4 pt-4 border-t border-wline-2 dark:border-rink-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon
                  name="insights"
                  className="text-ice-500 text-card-title"
                  aria-hidden="true"
                />
                <span className="text-card-meta font-semibold text-wtext-2 dark:text-rink-100">
                  종합 평균
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-ice-500 tabular-nums tracking-tight">
                  {avg}
                </span>
                <span className="text-card-body font-bold text-wtext-3 dark:text-rink-300">
                  / 5.0
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Detailed Stats Grid */}
        {data && (
          <section className="space-y-3">
            <h3 className="font-bold text-wtext-1 dark:text-white px-1 text-card-emphasis">
              {MESSAGES.skillReport.detailedScores}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {SKILL_AXES.map((axis) => (
                <SkillStatCard
                  key={axis.key}
                  icon={axis.icon}
                  label={MESSAGES.skillReport[axis.labelKey] as string}
                  score={data[axis.key as keyof typeof data] as number}
                />
              ))}
              <div className="col-span-2">
                <SkillStatCard
                  icon="groups"
                  label={MESSAGES.skillReport.teamwork}
                  score={data.teamwork}
                  highlight={MESSAGES.skillReport.excellent}
                />
              </div>
            </div>
          </section>
        )}

        {/* Coach Comment */}
        {comment && (
          <CoachCommentCard
            content={comment.content}
            date={comment.date}
            onReply={() => navigate('/messages')}
          />
        )}
      </main>

      {/* Bottom Action Bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-rink-900 border-t border-wline dark:border-rink-800 pb-safe">
        <div className="max-w-md mx-auto px-4 py-4 flex gap-3">
          <button
            onClick={handleShare}
            className="flex-1 h-12 flex items-center justify-center gap-2 bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 font-bold rounded-xl active:brightness-95 transition-colors motion-reduce:transition-none"
          >
            <Icon name="ios_share" className="text-card-title" />
            <span className="text-card-body">{MESSAGES.skillReport.shareReport}</span>
          </button>
          <button
            onClick={() => navigate('/messages')}
            className="flex-[2] h-12 flex items-center justify-center gap-2 bg-ice-500 hover:bg-ice-700 text-white font-bold rounded-xl active:brightness-95 transition-colors motion-reduce:transition-none"
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
