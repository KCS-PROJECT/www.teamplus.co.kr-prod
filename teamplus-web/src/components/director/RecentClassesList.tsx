'use client';

import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import type { RecentClassItem } from '@/hooks/useDirectorDashboardData';

interface RecentClassesListProps {
  /** 최근 등록된 수업 목록 (createdAt DESC, 상위 5건) */
  classes: RecentClassItem[];
  /** 자세히 보기 링크 — 기본 /classes-manage */
  viewMoreHref?: string;
  isAnimated?: boolean;
}

/**
 * RecentClassesList — 홈 "수업 현황" 섹션
 *
 * - "코치별 수업 현황" 컴포넌트(CoachProgressList) 를 대체.
 * - 감독/코치가 등록한 최신 수업 5건을 노출. "자세히 보기" 클릭 시 /classes-manage 로 이동.
 * - 수업 카드 자체는 비활성 표시 (목록은 단순 미리보기 — 상세 진입은 자세히 보기로).
 */
export function RecentClassesList({
  classes,
  viewMoreHref = '/classes-manage',
}: RecentClassesListProps) {
  return (
    <section aria-label="수업 현황">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-[19px] font-bold text-wtext-1 dark:text-white">
          수업 현황
        </h3>
        <NavLink
          href={viewMoreHref}
          className="text-sm font-bold text-ice-500 dark:text-blue-400 flex items-center"
        >
          자세히 보기
          <Icon
            name="chevron_right"
            className="text-lg ml-0.5"
            aria-hidden="true"
          />
        </NavLink>
      </div>

      {classes.length === 0 ? (
        <div className="bg-white dark:bg-rink-800 rounded-xl p-8 border border-wline-2 dark:border-rink-700 flex flex-col items-center justify-center gap-2">
          <div className="w-12 h-12 rounded-full bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
            <Icon
              name="school"
              className="text-2xl text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </div>
          <p className="text-sm text-wtext-3 dark:text-rink-300 text-center">
            등록된 수업이 없습니다.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" role="list" aria-label="최근 등록 수업">
          {classes.map((cls) => (
            <li
              key={cls.id}
              className="bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline-2 dark:border-rink-700 flex items-center gap-4"
            >
              <div className="shrink-0 size-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 flex items-center justify-center">
                <Icon
                  name="school"
                  className="text-xl text-ice-500 dark:text-blue-400"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-wtext-1 dark:text-white truncate text-[15px]">
                  {cls.className}
                </h4>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-medium text-wtext-3 dark:text-rink-300">
                  <span className="truncate">{cls.instructorName}</span>
                  <span className="text-wtext-4 dark:text-rink-500">·</span>
                  <span>{formatTimeRange(cls.startTime, cls.endTime)}</span>
                  {cls.capacity > 0 && (
                    <>
                      <span className="text-wtext-4 dark:text-rink-500">·</span>
                      <span>정원 {cls.capacity}명</span>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTimeRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };
  const s = fmt(start);
  const e = fmt(end);
  if (!s && !e) return '';
  if (!s) return e;
  if (!e) return s;
  return `${s} ~ ${e}`;
}
