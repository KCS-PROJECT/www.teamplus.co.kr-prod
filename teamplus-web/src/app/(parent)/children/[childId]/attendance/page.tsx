'use client';

/**
 * ChildAttendancePage — 자녀별 출석 현황 (1차 요약)
 *
 * Route: /children/:childId/attendance
 * Entry: parent/children QuickActionsList "출석 현황" 카드 클릭
 *
 * 데이터 소스:
 *   - useChildClassHistory({ childId }) — class-history 페이지와 동일 hook 재사용 (SoT).
 *     결제권/결제권 관련 호출은 하지 않는다(MemberCredit.classId 귀속이라 합산 무의미).
 *   - 자녀 이름은 useChildren.
 *
 * 집계 정의:
 *   - 출석 = attendanceStatus === 'present' 만 카운트. 출석률(%)·지각/결석/취소 미표시.
 *   - "이번 달"=현재 연·월, "직전 달"=현재 월-1(단, currentYear 단위 hook 특성상
 *     직전 달이 전년이면 폴백 생략하고 빈 메시지 처리 — 과도한 복잡성 회피).
 *
 * 디자인 규칙:
 *   - MobileContainer + PageAppBar 단독 헤더 (이중 헤더 금지).
 *   - usePageReady — fetch 완료 시 풀스크린 로더 hide.
 *   - bg-gradient/backdrop-blur/colored shadow 0 건 (AI slop 금지).
 *   - 다크모드 dark: 변형 전 컴포넌트 적용.
 */

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useChildren } from '@/hooks/useChildren';
import {
  useChildClassHistory,
  type ChildClassHistoryItem,
} from '@/hooks/useChildClassHistory';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function isPresent(item: ChildClassHistoryItem): boolean {
  return item.status === 'present';
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDay(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ────────────────────────────────────────────
// Class Row
// ────────────────────────────────────────────

function ClassRow({ item }: { item: ChildClassHistoryItem }) {
  return (
    <div className="flex items-start gap-3 border-b border-wline-2 py-3 last:border-b-0 dark:border-rink-700">
      <span
        className="mt-1.5 size-2 shrink-0 rounded-w-pill bg-green-500 dark:bg-green-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-card-body font-semibold text-wtext-1 dark:text-white">
          {item.name}
        </p>
        <div className="mt-1 flex items-center gap-3 text-card-meta text-wtext-3 dark:text-rink-300">
          <span className="tabular-nums flex items-center gap-1">
            <Icon name="event" className="text-[14px]" aria-hidden="true" />
            {formatDay(item.attendedAt)}
          </span>
          <span className="tabular-nums flex items-center gap-1">
            <Icon name="schedule" className="text-[14px]" aria-hidden="true" />
            {formatTime(item.attendedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────

export default function ChildAttendancePage() {
  const params = useParams<{ childId: string }>();
  const childId = params?.childId ?? null;
  const { navigate } = useNavigation();
  const { children, isLoading: isChildrenLoading } = useChildren();

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const child = useMemo(
    () => (childId ? children.find((c) => c.id === childId) : null),
    [children, childId],
  );

  const { months, summary, isLoading, errorMessage } = useChildClassHistory({
    childId,
  });

  usePageReady(!isLoading && !isChildrenLoading);

  // 이번 달 / 직전 달 인덱스 (1-12)
  const now = useMemo(() => new Date(), []);
  const currentMonth = now.getMonth() + 1; // 1..12
  const prevMonth = currentMonth - 1; // 0 이면 전년 → 폴백 생략

  // present 항목만 추출하는 헬퍼
  const presentOf = (month: number): ChildClassHistoryItem[] => {
    const m = months.find((x) => x.month === month);
    if (!m) return [];
    return m.classes.filter(isPresent);
  };

  // 올해 / 이번 달 present 카운트
  const yearPresent = summary.present;
  const thisMonthPresent = useMemo(
    () => presentOf(currentMonth),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, currentMonth],
  );
  const prevMonthPresent = useMemo(
    () => (prevMonth >= 1 ? presentOf(prevMonth) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, prevMonth],
  );

  // 수업별 출석 집계 (올해 전체) — className 별 present 횟수 내림차순
  const byClass = useMemo(() => {
    const counter = new Map<string, number>();
    for (const m of months) {
      for (const c of m.classes) {
        if (!isPresent(c)) continue;
        counter.set(c.name, (counter.get(c.name) ?? 0) + 1);
      }
    }
    return Array.from(counter.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [months]);

  // 월별 리스트 폴백 결정
  const monthList = useMemo(() => {
    if (thisMonthPresent.length > 0) {
      return {
        month: currentMonth,
        items: thisMonthPresent,
        isPrev: false,
      };
    }
    if (prevMonthPresent.length > 0) {
      return {
        month: prevMonth,
        items: prevMonthPresent,
        isPrev: true,
      };
    }
    return null;
  }, [thisMonthPresent, prevMonthPresent, currentMonth, prevMonth]);

  if ((isLoading || isChildrenLoading) && children.length === 0) {
    return null;
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar
        title={MESSAGES.childAttendance.pageTitle(child?.name ?? '')}
        forceNative
      />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-rink-900"
        role="main"
        aria-label="자녀 출석 현황"
      >
        <div className="flex flex-col gap-4 px-4 py-4">
          {/* 에러 배너 */}
          {errorMessage && (
            <div
              className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-card-body text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
              role="alert"
            >
              <Icon
                name="error_outline"
                className="mt-0.5 text-card-emphasis"
                aria-hidden="true"
              />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 상단 지표 — 올해 / 이번 달 present 카운트 */}
          <section
            aria-label="출석 요약"
            className="rounded-2xl border border-wline-2 bg-wsurface p-5 shadow-sh-1 dark:border-rink-700 dark:bg-rink-800"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="tabular-nums text-w-h1 font-extrabold text-ice-500">
                  {yearPresent}
                </span>
                <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
                  {MESSAGES.childAttendance.yearLabel}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="tabular-nums text-w-h1 font-extrabold text-wtext-1 dark:text-white">
                  {thisMonthPresent.length}
                </span>
                <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
                  {MESSAGES.childAttendance.monthLabel}
                </span>
              </div>
            </div>
          </section>

          {/* 수업별 출석 (올해) — 0건이면 섹션 숨김 */}
          {byClass.length > 0 && (
            <section
              aria-label={MESSAGES.childAttendance.byClassTitle}
              className="rounded-2xl border border-wline-2 bg-wsurface p-4 shadow-sh-1 dark:border-rink-700 dark:bg-rink-800"
            >
              <h2 className="mb-2 text-card-title font-extrabold text-wtext-1 dark:text-white">
                {MESSAGES.childAttendance.byClassTitle}
              </h2>
              <ul className="flex flex-col">
                {byClass.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center justify-between border-b border-wline-2 py-2.5 last:border-b-0 dark:border-rink-700"
                  >
                    <span className="min-w-0 flex-1 truncate text-card-body font-semibold text-wtext-1 dark:text-white">
                      {row.name}
                    </span>
                    <span className="tabular-nums shrink-0 text-card-body font-bold text-ice-500">
                      {MESSAGES.calendar.historyCount(row.count)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 이번 달 출석 리스트 (또는 직전 달 폴백) */}
          {monthList ? (
            <section
              aria-label={MESSAGES.childAttendance.monthListTitle(
                monthList.month,
              )}
              className="rounded-2xl border border-wline-2 bg-wsurface p-4 shadow-sh-1 dark:border-rink-700 dark:bg-rink-800"
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h2 className="text-card-title font-extrabold text-wtext-1 dark:text-white">
                  {MESSAGES.childAttendance.monthListTitle(monthList.month)}
                </h2>
                <span className="tabular-nums text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
                  {MESSAGES.calendar.historyCount(monthList.items.length)}
                </span>
              </div>
              {monthList.isPrev && (
                <p className="mb-1 flex items-center gap-1 text-card-meta text-wtext-3 dark:text-rink-300">
                  <Icon name="info" className="text-[14px]" aria-hidden="true" />
                  {MESSAGES.childAttendance.prevMonthHint}
                </p>
              )}
              <div>
                {monthList.items.map((item, idx) => (
                  <ClassRow key={`${item.attendedAt}-${idx}`} item={item} />
                ))}
              </div>
            </section>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-wline-2 bg-wsurface p-10 text-center dark:border-rink-700 dark:bg-rink-800">
              <div className="flex size-14 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                <Icon
                  name="event_busy"
                  className="text-3xl text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <p className="text-card-body text-wtext-3 dark:text-rink-300">
                {MESSAGES.childAttendance.emptyThisMonth}
              </p>
            </div>
          )}

          {/* 연간 전체 이력 보기 */}
          {child && (
            <button
              type="button"
              onClick={() => navigate(`/children/${child.id}/class-history`)}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-wsurface px-4 py-4 text-card-body font-bold text-ice-500 shadow-sh-1 border border-wline-2 transition-colors hover:bg-wline-2/40 active:brightness-95 motion-reduce:transition-none dark:border-rink-700 dark:bg-rink-800 dark:hover:bg-rink-700/40"
            >
              {MESSAGES.childAttendance.viewYearHistory}
              <Icon name="arrow_forward" className="text-xl" aria-hidden="true" />
            </button>
          )}
        </div>
      </main>
    </MobileContainer>
  );
}
