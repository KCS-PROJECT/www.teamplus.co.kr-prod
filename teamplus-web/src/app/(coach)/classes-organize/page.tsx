'use client';

import { useState, useEffect } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useNavigation } from '@/components/ui/NavLink';
import { api } from '@/services/api-client';

import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
// ─── 수업 편성 화면 ──────────────────────────────────────
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
  approvalStatus?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTodayLabel(): string {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
}

export default function ClassOrganizePage() {
  const { navigate } = useNavigation();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // [AppBar 보장 2026-05-12] iPhone/Android 실기/시뮬에서 AppBar safe-area 가
  //   항상 보이도록 Native AppBar 활성. Web 환경에서는 DOM PageAppBar 가 자동 표시.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '수업 편성',
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
          setClasses(res.data);
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="수업 편성" />

      <main
        className="flex-1 overflow-y-auto px-5 pt-6 pb-28"
        role="main"
        aria-label="수업 편성"
        aria-busy={isLoading}
      >
        <Card className="mb-4">
          <div className="flex items-center gap-3" role="status" aria-label={`오늘의 편성, ${formatTodayLabel()}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ice-500/10 text-ice-500" aria-hidden="true">
              <Icon name="calendar_today" className="text-xl" />
            </div>
            <div>
              <p className="text-card-body font-semibold text-wtext-1 dark:text-white">오늘의 편성</p>
              <p className="text-card-meta text-wtext-3 dark:text-rink-300">{formatTodayLabel()}</p>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div
            className="flex justify-center py-16"
            role="status"
            aria-live="polite"
            aria-label="수업 편성 불러오는 중"
          >
            <div className="w-8 h-8 border-2 border-wline border-t-primary rounded-w-pill animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className="sr-only">수업 편성을 불러오는 중입니다.</span>
          </div>
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-wtext-3" role="status">
            <Icon name="sports_hockey" className="text-5xl mb-3" aria-hidden="true" />
            <p className="text-card-body">편성된 수업이 없습니다</p>
          </div>
        ) : (
          <ul
            className="space-y-4 list-none"
            role="list"
            aria-label={`편성된 수업 ${classes.length}건`}
          >
            {classes.map((cls) => (
              <li key={cls.id} role="listitem">
                <Card hover className={cls.approvalStatus === 'PENDING' ? 'opacity-80 border-yellow-300 dark:border-yellow-600' : cls.approvalStatus === 'REJECTED' ? 'opacity-60 border-red-300 dark:border-red-600' : ''}>
                  <article aria-labelledby={`organize-title-${cls.id}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p
                          id={`organize-title-${cls.id}`}
                          className="text-card-body font-semibold text-wtext-1 dark:text-white"
                        >
                          {cls.className}
                        </p>
                        {cls.approvalStatus === 'PENDING' && (
                          <span
                            className="inline-flex px-1.5 py-0.5 text-card-meta font-semibold rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            role="status"
                            aria-label="승인 대기 상태"
                          >
                            승인대기
                          </span>
                        )}
                        {cls.approvalStatus === 'REJECTED' && (
                          <span
                            className="inline-flex px-1.5 py-0.5 text-card-meta font-semibold rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                            role="status"
                            aria-label="거절된 상태"
                          >
                            거절됨
                          </span>
                        )}
                      </div>
                      <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                        <span className="sr-only">수업 시간: </span>
                        {formatTime(cls.startTime)} - {formatTime(cls.endTime)}
                      </p>
                      <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                        <span className="sr-only">담당 코치: </span>
                        {cls.instructorName} · 정원 {cls.capacity}명
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      {cls.approvalStatus === 'APPROVED' ? (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(`/coach-schedules?classId=${cls.id}`)}
                            aria-label={`${cls.className} 세부 편성 보기`}
                          >
                            세부 편성
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => navigate(`/classes-manage/edit/${cls.id}`)}
                            aria-label={`${cls.className} 변경하기`}
                          >
                            변경
                          </Button>
                        </>
                      ) : cls.approvalStatus === 'PENDING' ? (
                        <span className="text-card-meta text-yellow-600 dark:text-yellow-400">관리자 승인을 기다리고 있습니다</span>
                      ) : (
                        <span className="text-card-meta text-red-500">관리자에 의해 거절되었습니다</span>
                      )}
                    </div>
                  </article>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>

      <div
        className="pointer-events-none fixed inset-x-0 z-30 mx-auto w-full max-w-[480px] px-5"
        style={{ bottom: 'calc(5.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}
      >
        <div className="flex justify-end">
          <button
            type="button"
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-w-pill bg-ice-500 text-white shadow-lg transition-colors hover:bg-ice-700 focus:outline-none focus:ring-2 focus:ring-ice-500/40 focus:ring-offset-2 motion-reduce:transition-none"
            aria-label="편성 추가"
          >
            <Icon name="add" className="text-3xl" aria-hidden="true" />
          </button>
        </div>
      </div>
    </MobileContainer>
  );
}
