'use client';

/**
 * ChildTeamInfoPage — 자녀별 팀·코치 정보
 *
 * Route: /children/:childId/team
 * Entry: parent/children QuickActionsList "팀·코치 정보" 카드 클릭
 *
 * [신규 2026-05-18 W3.A]
 *   학부모 자녀 관리 페이지 (children/page.tsx) 의 "팀·코치 정보" 라우팅 대상.
 *   기존에는 라우팅만 존재하고 페이지가 없어 404 가 발생하던 회귀를 해결.
 *
 * 데이터 소스:
 *   - useChildren() — childId 매칭으로 자녀 정보 + 소속 팀명(club) 추출.
 *   - 팀 상세 멤버십/코치 목록은 추후 BE endpoint 연동 (현재는 자녀 ChildApiItem.club 까지만 노출).
 *
 * 디자인 규칙 (ICETIMES flat 2026-06-25):
 *   - MobileContainer + PageAppBar 단독 헤더 (이중 헤더 금지).
 *   - usePageReady — 자녀 fetch 완료 시 풀스크린 로더 hide.
 *   - bg-gradient/backdrop-blur/colored shadow 0 건 (AI slop 금지).
 *   - main = bg-it-canvas. 콘텐츠 = full-bleed 흰 섹션(bg-it-surface) + 8px 회색 갭.
 *   - 다크모드 dark: 변형 전 컴포넌트 적용.
 */

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useChildren } from '@/hooks/useChildren';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';

export default function ChildTeamInfoPage() {
  const params = useParams<{ childId: string }>();
  const childId = params?.childId ?? null;
  const { children, isLoading } = useChildren();

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const child = useMemo(
    () => (childId ? children.find((c) => c.id === childId) : null),
    [children, childId],
  );

  usePageReady(!isLoading);

  // 데이터 fetch 완료 전까지 LoadingContext 유지 (children 0건은 정상 fallback).
  if (isLoading && children.length === 0) {
    return null;
  }

  const teamName = child?.club ?? null;
  const pendingTeam = child?.pendingClubName ?? null;
  const rejectedTeam = child?.rejectedClubName ?? null;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.childAttendance.quickActionTeamLabel} forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label="자녀 팀 정보"
      >
        {/* 자녀 헤더 — full-bleed 흰 섹션 (요약) */}
        {child && (
          <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-4 pb-4">
            <div className="flex items-center gap-3.5">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-it-blue-50 dark:bg-it-blue-500/15 text-it-blue-600 dark:text-it-blue-300">
                <Icon name="person" className="text-2xl" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-w-h3 font-extrabold text-it-ink-900 dark:text-white tracking-[-0.03em] leading-tight truncate">
                  {child.name}
                </p>
                <p className="mt-0.5 text-card-meta text-it-ink-500 dark:text-wtext-4">
                  {child.age ? `${child.age}세` : ''}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 소속 팀 — full-bleed 흰 섹션 */}
        <section
          className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pb-5"
          aria-label="소속 팀"
        >
          <header className="flex items-center gap-2 py-4">
            <span className="flex size-7 items-center justify-center rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30">
              <Icon name="groups" className="text-[16px] text-it-blue-500" aria-hidden="true" />
            </span>
            <h2 className="text-[17px] font-extrabold text-it-ink-800 dark:text-white tracking-[-0.02em]">
              소속 팀
            </h2>
          </header>

          {teamName ? (
            <div className="flex items-center justify-between gap-2 rounded-w-md bg-it-fill dark:bg-rink-900 border border-it-line dark:border-it-blue-900 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-card-body font-bold text-it-ink-900 dark:text-white truncate">
                  {teamName}
                </p>
                <p className="mt-0.5 text-card-meta font-semibold text-success-700 dark:text-success-500">
                  승인 완료
                </p>
              </div>
              <Icon name="check_circle" className="text-2xl text-success-500" aria-hidden="true" />
            </div>
          ) : pendingTeam ? (
            <div className="flex items-center justify-between gap-2 rounded-w-md bg-warning-500/10 dark:bg-warning-500/15 border border-warning-500/40 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-card-body font-bold text-it-ink-900 dark:text-white truncate">
                  {pendingTeam}
                </p>
                <p className="mt-0.5 text-card-meta font-semibold text-warning-600 dark:text-warning-500">
                  승인 대기 중
                </p>
              </div>
              <Icon name="hourglass_top" className="text-2xl text-warning-500" aria-hidden="true" />
            </div>
          ) : rejectedTeam ? (
            <div className="flex items-center justify-between gap-2 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 border border-it-red-500/40 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-card-body font-bold text-it-ink-900 dark:text-white truncate">
                  {rejectedTeam}
                </p>
                <p className="mt-0.5 text-card-meta font-semibold text-it-red-600 dark:text-it-red-300">
                  가입 반려
                </p>
              </div>
              <Icon name="block" className="text-2xl text-it-red-500" aria-hidden="true" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-w-md bg-it-fill dark:bg-rink-900 border border-it-line dark:border-it-blue-900 px-4 py-6 text-center">
              <Icon name="info" className="text-3xl text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
              <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
                소속된 팀이 없습니다
              </p>
              <p className="text-card-meta text-it-ink-400 dark:text-wtext-4">
                자녀 추가 페이지에서 팀에 가입할 수 있습니다
              </p>
            </div>
          )}

          {/* [2026-06-17] '담당 코치' placeholder 카드 · '자녀 상세 보기' 버튼 삭제 (사용자 직접 지시) */}
        </section>
      </main>
    </MobileContainer>
  );
}
