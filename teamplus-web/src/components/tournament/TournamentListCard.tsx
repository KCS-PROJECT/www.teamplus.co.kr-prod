'use client';

/**
 * TournamentListCard — 대회 목록 카드
 *
 * 레퍼런스: 사용자 제공 HTML "대회 및 경기 목록"
 *
 * 구조:
 *  - 좌측: 썸네일(회색 플레이스홀더 + D-Day 리본)
 *  - 우측: 상태뱃지 + 부제(Amateur League 등) + 제목 + 날짜 + 장소
 *  - 하단: 참가 인원 / CTA(신청하기 | 대진표 보기 | 대기 등록)
 *
 * 역할 기반 CTA:
 *  - isManager=true  → "수정하기" "삭제하기" 버튼
 *  - isManager=false → "신청하기" 또는 "대진표 보기" (상태에 따라)
 */

import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';
import { formatEligibleBirthYearsLabel } from '@/lib/gradeToBirthYear';
import {
  calculateDDay,
  mapTournamentUiStatus,
  type TournamentListItem,
  type TournamentUiStatus,
} from '@/services/tournament.service';
import { TournamentStatusBadge } from './TournamentStatusBadge';

interface Props {
  tournament: TournamentListItem;
  /** DIRECTOR/COACH/ADMIN 여부 — true 면 수정/삭제 버튼 노출 */
  isManager?: boolean;
  /** 관리자용 콜백 */
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** 카드 클릭 시 이동 경로. 기본값: `/tournaments/${id}` */
  href?: string;
}

function formatDateRange(start: string, end: string): string {
  const s = start.slice(2, 10).replace(/-/g, '.');
  const e = end.slice(2, 10).replace(/-/g, '.');
  return `${s} - ${e}`;
}

export function TournamentListCard({
  tournament,
  isManager = false,
  onEdit,
  onDelete,
  href,
}: Props) {
  const dDay = calculateDDay(tournament.registrationDeadline);
  const uiStatus: TournamentUiStatus = mapTournamentUiStatus(
    tournament.status,
    tournament.registrationDeadline,
  );
  const dateRange = formatDateRange(tournament.startDate, tournament.endDate);
  // [2026-06-08] 대회장소 자유 텍스트(tournament.location) 최우선 표시 — 직접 입력한 장소 반영.
  const locationName =
    tournament.location ||
    tournament.rink?.location ||
    tournament.rink?.name ||
    tournament.club?.clubName ||
    '장소 추후 안내';

  // [2026-06-08] 참가 인원(참가팀) 표시 삭제로 selectedCount/registrationCount 제거.

  // D-Day 리본 (좌상단)
  const dDayRibbon = (() => {
    if (dDay === undefined) return null;
    if (dDay <= 2) {
      return (
        <span className="absolute left-0 top-0 rounded-br-lg bg-red-600 px-2 py-1 text-[10px] font-bold text-white">
          D-{dDay}
        </span>
      );
    }
    return (
      <span className="absolute left-0 top-0 rounded-br-lg bg-ice-500 px-2 py-1 text-[10px] font-bold text-white">
        D-{dDay}
      </span>
    );
  })();

  const targetHref = href ?? `/tournaments/${tournament.id}`;

  // [2026-06-08] 카드 하단 참가 인원(참가팀) 표시(footerLeft) 삭제 — CTA 만 노출.

  const footerCta = (() => {
    if (isManager) {
      return (
        <div className="ml-auto flex shrink-0 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit?.(tournament.id);
            }}
            className="flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-wline bg-white px-3 text-xs font-bold text-wtext-2 hover:bg-wbg dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700"
            aria-label="대회 수정하기"
          >
            <Icon name="edit" className="text-sm" aria-hidden="true" />
            수정하기
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete?.(tournament.id);
            }}
            className="flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-800/50 dark:bg-rink-800 dark:text-red-400 dark:hover:bg-red-900/20"
            aria-label="대회 삭제하기"
          >
            <Icon name="delete" className="text-sm" aria-hidden="true" />
            삭제하기
          </button>
        </div>
      );
    }

    // 일반 사용자 CTA
    if (uiStatus === 'recruiting' || uiStatus === 'closing_soon') {
      return (
        <NavLink
          href={`/tournaments/${tournament.id}/apply`}
          className="ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-ice-500 px-4 text-xs font-bold text-white hover:bg-ice-700"
        >
          신청하기
        </NavLink>
      );
    }
    if (uiStatus === 'in_progress') {
      return (
        <NavLink
          href={`${targetHref}/bracket`}
          className="ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-wline bg-white px-4 text-xs font-bold text-wtext-2 hover:bg-wbg dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700"
        >
          대진표 보기
        </NavLink>
      );
    }
    if (uiStatus === 'closed') {
      return (
        <button
          type="button"
          className="ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-wline-2 px-4 text-xs font-bold text-wtext-2 hover:bg-wline dark:bg-rink-700 dark:text-rink-100 dark:hover:bg-rink-500"
          disabled
        >
          대기 등록
        </button>
      );
    }
    return (
      <NavLink
        href={targetHref}
        className="ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-wline bg-white px-4 text-xs font-bold text-wtext-2 hover:bg-wbg dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700"
      >
        결과 보기
      </NavLink>
    );
  })();

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl border border-wline-2 bg-white transition-all hover:shadow-md dark:border-rink-800 dark:bg-rink-800',
        uiStatus === 'closed' && 'opacity-90',
      )}
    >
      <NavLink href={targetHref} className="block">
        <div className="flex flex-row gap-4 p-4">
          {/* 썸네일 */}
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-wline-2 dark:bg-rink-700">
            <div className="flex h-full w-full items-center justify-center">
              <Icon
                name="emoji_events"
                className="text-4xl text-wtext-4 dark:text-rink-300"
              />
            </div>
            {dDayRibbon}
          </div>

          {/* 콘텐츠 */}
          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <TournamentStatusBadge status={uiStatus} />
                <span className="shrink-0 whitespace-nowrap text-[11px] text-wtext-3 dark:text-rink-300">
                  {/* [수정 2026-06-16] 출생연도 라벨 — 개별 연도 집합 우선("2014·2016·2019년생"),
                      없으면 from/to 범위 폴백, 레거시 대회는 "전체". */}
                  {formatEligibleBirthYearsLabel(
                    tournament.eligibleBirthYears,
                    tournament.eligibleBirthYearFrom,
                    tournament.eligibleBirthYearTo,
                  )}
                </span>
              </div>
              <h3 className="truncate text-base font-bold leading-tight text-wtext-1 dark:text-white">
                {tournament.name}
              </h3>
              <div className="mt-1 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs text-wtext-3 dark:text-rink-300">
                  <Icon
                    name="calendar_today"
                    className="text-[14px] text-wtext-3"
                  />
                  <span>{dateRange}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-wtext-3 dark:text-rink-300">
                  <Icon
                    name="location_on"
                    className="text-[14px] text-wtext-3"
                  />
                  <span className="truncate">{locationName}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chevron — 상세 이동 힌트 */}
          <div
            className="flex shrink-0 items-center text-wtext-4 transition-transform duration-200 group-hover:translate-x-0.5 dark:text-rink-500"
            aria-hidden="true"
          >
            <Icon name="chevron_right" className="text-2xl" />
          </div>
        </div>
      </NavLink>

      {/* 푸터 — [2026-06-08] 참가 인원(참가팀) 표시 삭제, CTA 만 우측 노출. */}
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-wline-2 bg-wbg/50 p-3 dark:border-rink-700/50 dark:bg-white/5">
        {footerCta}
      </div>
    </article>
  );
}
