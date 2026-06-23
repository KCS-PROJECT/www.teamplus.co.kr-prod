'use client';

/**
 * /mypage/calendar — 내 캘린더 (역할별 기존 캘린더 진입점)
 *
 * W2.C #6: 마이페이지 활동 탭의 "내 캘린더" 가 이전에는 `/calendar` 로 잘못 라우팅되어
 *   (student) 그룹 가드에 막혀 비-학생 사용자가 홈으로 튕기는 회귀 발생.
 * 본 페이지는 (common) 그룹의 모든 인증 사용자가 접근 가능한 캘린더 허브이며,
 * 사용자 역할에 따라 자동 리다이렉트 또는 통합 뷰를 보여준다.
 *
 * 역할별 라우팅:
 *   parent       → /parent-calendar (자녀 수업 월별 캘린더)
 *   coach        → /coach-calendar  (코치 일정)
 *   teen/child   → /calendar         ((student) 그룹 학생 캘린더)
 *   director     → /director-schedules (감독 일정)
 *   admin        → /admin-schedules   (관리자 일정)
 *
 * 통합 뷰 (역할 unknown 또는 multi-role): 현재 페이지 자체가 fallback. 캘린더 진입
 *   카드 4종 (이번주 / 이번달 / 결제 / 출석) + 역할별 진입 가능 캘린더 링크 안내.
 */

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from '@/hooks/useSessionAuth';

interface CalendarEntry {
  href: string;
  title: string;
  description: string;
  icon: string;
}

/** 역할별 primary 캘린더 경로 */
const ROLE_TO_CALENDAR: Record<string, string> = {
  parent: '/parent-calendar',
  coach: '/coach-calendar',
  director: '/director-schedules',
  admin: '/admin-schedules',
  teen: '/calendar',
  child: '/calendar',
  academy_director: '/coach-calendar',
};

export default function MyCalendarPage() {
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: true });
  const router = useRouter();
  const { navigate } = useNavigation();
  const { user, isLoading: isAuthLoading } = useSessionAuth();

  // 인증 + 역할 로드 완료 후에만 ready (로더 즉시 hide 금지)
  usePageReady(!isAuthLoading);

  const roleKey = (user?.userType ?? '').toString().toLowerCase();

  // 역할별 자동 리다이렉트 (단일 역할 매칭 시 즉시 이동)
  useEffect(() => {
    if (isAuthLoading || !roleKey) return;
    const target = ROLE_TO_CALENDAR[roleKey];
    if (target) {
      router.replace(target);
    }
  }, [isAuthLoading, roleKey, router]);

  // 통합 뷰 fallback — 역할 unknown 또는 redirect 진행 중에 잠깐 노출
  const entries: CalendarEntry[] = useMemo(
    () => [
      {
        href: '/parent-calendar',
        title: '학부모 캘린더',
        description: '자녀 수업·대회 월별 보기',
        icon: 'family_restroom',
      },
      {
        href: '/coach-calendar',
        title: '코치 캘린더',
        description: '담당 수업·훈련 일정',
        icon: 'sports',
      },
      {
        href: '/calendar',
        title: '학생 캘린더',
        description: '내 수업·대회 일정',
        icon: 'school',
      },
      {
        href: '/director-schedules',
        title: '감독 일정',
        description: '클럽 전체 일정 관리',
        icon: 'event_note',
      },
    ],
    [],
  );

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="내 캘린더" forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck pb-8"
        role="main"
        aria-label="역할별 캘린더 진입"
      >
        <section className="px-5 pt-4" aria-label="안내">
          <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-sh-1">
            <div className="flex items-start gap-3">
              <div
                className="shrink-0 size-10 rounded-w-md bg-ice-50 dark:bg-ice-500/15 flex items-center justify-center"
                aria-hidden="true"
              >
                <Icon name="info" className="text-card-title text-ice-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-card-body font-bold text-wtext-1 dark:text-white">
                  역할별 캘린더로 이동합니다
                </p>
                <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300">
                  잠시 후 자동으로 이동되지 않으면 아래 카드를 선택해주세요.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 pt-4 flex flex-col gap-2.5" aria-label="캘린더 선택">
          {entries.map((e) => (
            <button
              key={e.href}
              type="button"
              onClick={() => navigate(e.href)}
              className="flex items-center gap-3 rounded-w-lg bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-sh-1 text-left transition-shadow duration-200 ease-wallet motion-reduce:transition-none hover:shadow-sh-2 active:brightness-95"
            >
              <div
                className="shrink-0 size-11 rounded-w-md bg-ice-50 dark:bg-ice-500/15 flex items-center justify-center"
                aria-hidden="true"
              >
                <Icon name={e.icon} className="text-card-title text-ice-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="truncate text-card-title font-bold text-wtext-1 dark:text-white">
                  {e.title}
                </h3>
                <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300">
                  {e.description}
                </p>
              </div>
              <Icon
                name="chevron_right"
                className="shrink-0 text-card-title text-wtext-3 dark:text-wtext-4"
                aria-hidden="true"
              />
            </button>
          ))}
        </section>
      </main>
    </MobileContainer>
  );
}
