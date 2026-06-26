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

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8">
        {/* [v16 2026-05-16] 이중 로더 제거 — LoadingProvider 풀스크린 로더가 usePageReady 신호로 종료.
            [ICETIMES flat 2026-06-25] 카드 박스(rounded-2xl border)·Hero 박스 제거 →
            /director·classes-manage 와 동일하게 full-bleed 흰 섹션(bg-it-surface)을 8px 회색 갭으로 쌓는다. */}
        {isLoading ? null : academies.length === 0 ? (
          /* 빈 상태 — flat 흰 섹션 */
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
            <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
              <div className="mb-3 flex size-14 items-center justify-center rounded-w-pill bg-it-fill dark:bg-it-blue-900">
                <Icon
                  name="school"
                  className="text-3xl text-it-ink-400 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-emphasis font-bold text-it-ink-800 dark:text-white">
                {MESSAGES.empty('오픈클래스')}
              </p>
              <p className="mt-1 text-card-body font-medium text-it-ink-500 dark:text-rink-300">
                첫 오픈클래스를 등록해 운영을 시작해보세요.
              </p>
              <button
                type="button"
                onClick={handleCreate}
                className="mt-6 inline-flex h-12 items-center gap-1.5 rounded-w-md bg-it-blue-500 px-6 text-card-emphasis font-bold text-white hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              >
                <Icon name="add" className="text-[18px]" aria-hidden="true" />
                오픈클래스 등록하기
              </button>
            </div>
          </section>
        ) : (
          /* 오픈클래스 목록 — flat 흰 섹션 + 섹션 헤더 */
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
            {/* 섹션 헤더 — classes-manage ClassSectionHead 와 동일 17px/800 it-ink + 우측 count */}
            <div className="flex items-center gap-2 px-4 sm:px-5 pt-4 sm:pt-[18px] pb-2">
              <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                {MESSAGES.academy.myAcademies}
              </h2>
              <span className="text-[15px] font-extrabold text-it-blue-500 dark:text-it-blue-300 tabular-nums">
                {academies.length}
              </span>
            </div>

            <ul
              className="px-4 sm:px-5 pb-4 flex flex-col divide-y divide-it-line dark:divide-it-blue-900"
              role="list"
              aria-label={`나의 오픈클래스 목록 ${academies.length}개`}
            >
              {academies.map((academy, idx) => (
                <li
                  key={academy.id}
                  role="listitem"
                  className="motion-reduce:animate-none"
                  style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                >
                  <AcademyCard academy={academy} onPress={handleCardPress} iceTheme />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* FAB — 오픈클래스 등록 */}
      {academies.length > 0 && (
        <button
          type="button"
          onClick={handleCreate}
          style={{
            bottom: 'calc(76px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
          }}
          className="fixed right-6 z-30 inline-flex h-14 w-14 items-center justify-center rounded-w-pill bg-it-blue-500 text-white shadow-sh-2 hover:bg-it-blue-600 active:brightness-90 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
          aria-label="오픈클래스 등록"
        >
          <Icon name="add" className="text-2xl" aria-hidden="true" />
        </button>
      )}
    </MobileContainer>
  );
}
