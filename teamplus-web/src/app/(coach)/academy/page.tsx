'use client';

import { useCallback } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useMyAcademies } from '@/hooks/useAcademy';
import { AcademyCard } from '@/components/academy/AcademyCard';
import { MESSAGES } from '@/lib/messages';
import type { Academy } from '@/hooks/useAcademy';

/**
 * AcademyPage - 오픈클래스 관리 메인 (코치/감독 용)
 * Route: /academy (coach layout)
 */
export default function AcademyPage() {
  const { academies, isLoading } = useMyAcademies();
  const { navigate } = useNavigation();

  usePageReady(!isLoading);

  // 단순 리스트 화면 — SPEC §5 Step D 권고에 따라 isDataLoaded 가드 제거.
  //  사유: fetch 실패 시 isDataLoaded=false 잔존 → 훅이 showStatusBar 를 false 로
  //  강제 override 하여 status bar 가 영구 숨김에 빠질 수 있음 (v1 회귀 사례).
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const handleCardPress = useCallback(
    (academy: Academy) => {
      navigate(`/academy/${academy.id}`);
    },
    [navigate],
  );

  const handleCreate = useCallback(() => {
    navigate('/academy/create');
  }, [navigate]);

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title={MESSAGES.academy.manage} />

      <main className="flex-1 overflow-y-auto hide-scrollbar">
        {/* [v16 2026-05-16] 이중 로더 제거 — LoadingProvider 풀스크린 로더가 usePageReady 신호로 종료. */}
        {isLoading ? null : academies.length === 0 ? (
          /* 빈 상태 — 대담하게 재구성 */
          <div className="px-5 pt-6 pb-28">
            {/* Hero */}
            <section className="mb-8">
              <p className="text-card-meta font-bold uppercase tracking-[0.18em] text-ice-500 mb-2">
                Academy Console
              </p>
              <h2 className="text-3xl font-black text-wtext-1 dark:text-white leading-tight tracking-tight">
                나의 오픈클래스
                <br />
                관리
              </h2>
              <p className="mt-3 text-card-body font-medium text-wtext-3 dark:text-rink-300">
                소속 오픈클래스를 등록하면 수강생·코치·공지를 한곳에서 운영할 수 있어요.
              </p>
            </section>

            <div className="rounded-2xl border border-dashed border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                <Icon
                  name="school"
                  className="text-w-h2 text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-5 text-card-emphasis font-bold text-wtext-2 dark:text-rink-100">
                {MESSAGES.empty('오픈클래스')}
              </p>
              <p className="mt-1 text-card-body font-medium text-wtext-3 dark:text-rink-300">
                첫 오픈클래스를 등록해 운영을 시작해보세요.
              </p>
              <button
                type="button"
                onClick={handleCreate}
                className="mt-6 inline-flex h-12 items-center gap-1.5 rounded-xl bg-ice-500 px-6 text-card-emphasis font-bold text-white hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              >
                <Icon name="add" className="text-[18px]" aria-hidden="true" />
                오픈클래스 등록하기
              </button>
            </div>
          </div>
        ) : (
          /* 오픈클래스 목록 — Hero + 섹션 */
          <div className="px-5 pt-6 pb-28">
            {/* Hero */}
            <section className="mb-8">
              <p className="text-card-meta font-bold uppercase tracking-[0.18em] text-ice-500 mb-2">
                Academy Console
              </p>
              <h2 className="text-3xl font-black text-wtext-1 dark:text-white leading-tight tracking-tight">
                나의 오픈클래스
              </h2>
              <p className="mt-3 text-card-body font-medium text-wtext-3 dark:text-rink-300">
                카드를 눌러 수강생·코치·공지를 관리하세요.
              </p>
            </section>

            {/* 섹션 헤더 */}
            <div className="mb-4 flex items-end justify-between">
              <h3 className="text-xl font-bold text-wtext-1 dark:text-white tracking-tight">
                {MESSAGES.academy.myAcademies}
              </h3>
              <span className="inline-flex items-center gap-1 rounded-w-pill bg-ice-500/10 px-2.5 py-1 text-card-meta font-bold text-ice-500 dark:bg-ice-500/20">
                <span className="tabular-nums">{academies.length}</span>개
              </span>
            </div>

            <ul
              className="space-y-3"
              role="list"
              aria-label={`나의 오픈클래스 목록 ${academies.length}개`}
            >
              {academies.map((academy) => (
                <li key={academy.id} role="listitem">
                  <AcademyCard academy={academy} onPress={handleCardPress} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      {/* FAB — 오픈클래스 등록 */}
      {academies.length > 0 && (
        <button
          type="button"
          onClick={handleCreate}
          className="fixed bottom-24 right-5 z-10 inline-flex h-14 w-14 items-center justify-center rounded-w-pill bg-ice-500 text-white shadow-md hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
          aria-label="오픈클래스 등록"
        >
          <Icon name="add" className="text-2xl" aria-hidden="true" />
        </button>
      )}
    </MobileContainer>
  );
}
