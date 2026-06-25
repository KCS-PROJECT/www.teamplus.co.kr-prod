'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { useNavigation } from '@/components/ui/NavLink';
import { api } from '@/services/api-client';

import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

// ─── 일정 관리 화면 ──────────────────────────────────────
// API: GET /teams/managed/list → teamId
//      GET /teams/:teamId/classes

interface ClassItem {
  id: string;
  className: string;
  instructorName: string;
  capacity: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ScheduleManagePage() {
  const { back, navigate } = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // [AppBar 보장 2026-05-12] iPhone/Android 실기/시뮬에서 AppBar safe-area 가
  //   항상 보이도록 Native AppBar 활성. Web 환경에서는 DOM PageAppBar 가 자동 표시.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '일정 관리',
    showBackButton: true,
    showBottomNav: true,
  });

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const clubRes = await api.get<Array<{ id: string }>>('/teams/managed/list');
        if (!clubRes.success || !clubRes.data?.[0]) return;
        const clubId = clubRes.data[0].id;

        const res = await api.get<ClassItem[]>(`/teams/${clubId}/classes`);
        if (res.success && res.data) {
          setClasses(res.data.filter((c) => c.isActive));
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="일정 관리" />

      <main
        className="flex-1 overflow-y-auto bg-it-canvas dark:bg-rink-900 !pb-8"
        role="main"
        aria-label="일정 관리"
        aria-busy={isLoading}
      >
        {isLoading ? (
          <div
            className="flex justify-center py-16"
            role="status"
            aria-live="polite"
            aria-label="일정 목록 불러오는 중"
          >
            <div className="w-8 h-8 border-2 border-it-line border-t-it-blue-500 rounded-w-pill animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className="sr-only">일정 목록을 불러오는 중입니다.</span>
          </div>
        ) : classes.length === 0 ? (
          <div
            className="mt-2 flex flex-col items-center justify-center bg-it-surface py-16 text-it-ink-400 dark:bg-rink-800 dark:text-rink-300"
            role="status"
          >
            <Icon name="event_busy" className="text-5xl mb-3" aria-hidden="true" />
            <p className="text-card-body">등록된 일정이 없습니다</p>
          </div>
        ) : (
          /* 일정 목록 — full-bleed flat 섹션 (카드 박스 제거 → hairline 행). */
          <ul
            className="mt-2 list-none divide-y divide-it-line bg-it-surface dark:divide-rink-700 dark:bg-rink-800"
            role="list"
            aria-label="등록된 수업 일정 목록"
          >
            {classes.map((cls) => (
              <li key={cls.id} role="listitem">
                <article
                  className="flex items-start justify-between px-5 py-4"
                  aria-labelledby={`schedule-title-${cls.id}`}
                >
                  <div className="min-w-0 space-y-1">
                    <h2
                      id={`schedule-title-${cls.id}`}
                      className="truncate text-card-emphasis font-bold text-it-ink-800 dark:text-white"
                    >
                      {cls.className}
                    </h2>
                    <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
                      <span className="sr-only">일시: </span>
                      {formatDate(cls.startTime)} · {formatTime(cls.startTime)} -{' '}
                      {formatTime(cls.endTime)}
                    </p>
                    <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
                      <span className="sr-only">담당 코치: </span>
                      {cls.instructorName}
                    </p>
                  </div>
                  <Button
                    iceTheme
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/classes-manage/edit/${cls.id}`)}
                    aria-label={`${cls.className} 수업 편집하기`}
                  >
                    편집
                  </Button>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>

      <button
        type="button"
        onClick={() => navigate('/classes-manage/create')}
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-w-pill bg-it-blue-500 text-white shadow-md hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
        aria-label="일정 추가"
      >
        <Icon name="add" className="text-[28px]" aria-hidden="true" />
      </button>

      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
