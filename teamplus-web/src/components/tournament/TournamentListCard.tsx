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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스(rounded/shadow/border) → hairline 행, it-* 토큰 적용.
   *   (대회/경기 목록 화면만 전달.)
   */
  iceTheme?: boolean;
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
  iceTheme = false,
}: Props) {
  const dDay = calculateDDay(tournament.registrationDeadline);
  const uiStatus: TournamentUiStatus = mapTournamentUiStatus(
    tournament.status,
    tournament.endDate,
  );
  const dateRange = formatDateRange(tournament.startDate, tournament.endDate);
  // [2026-06-08] 대회장소 자유 텍스트(tournament.location) 최우선 표시 — 직접 입력한 장소 반영.
  // [2026-06-22] venue?.name(대회 전체 장소) 폴백 추가 + club.clubName(클럽·팀명) 제거 —
  //   장소 자리에 팀명이 노출되거나, venue 입력해도 "장소 추후 안내"로 뜨던 버그 수정.
  //   목록은 대회 전체 장소만 표시(경기별 장소는 상세에서 확인).
  const locationName =
    tournament.location ||
    tournament.venue?.name ||
    tournament.rink?.location ||
    tournament.rink?.name ||
    '장소 추후 안내';

  // [2026-06-08] 참가 인원(참가팀) 표시 삭제로 selectedCount/registrationCount 제거.

  // D-Day 리본 (좌상단)
  const dDayRibbon = (() => {
    if (dDay === undefined) return null;
    const urgent = dDay <= 2;
    if (iceTheme) {
      return (
        <span
          className={cn(
            'absolute left-0 top-0 rounded-br-w-md px-2 py-1 text-[10px] font-bold text-white',
            urgent ? 'bg-it-red-500' : 'bg-it-blue-500',
          )}
        >
          D-{dDay}
        </span>
      );
    }
    if (urgent) {
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

  // iceTheme CTA 클래스 — flat(it-* 토큰). false 경로는 기존 클래스 1:1 유지.
  const itGhostBtn =
    'flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface px-3 text-xs font-bold text-it-ink-800 hover:bg-it-fill dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700';
  const itDangerBtn =
    'flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-w-md border-[1.5px] border-it-red-200 bg-it-surface px-3 text-xs font-bold text-it-red-500 hover:bg-it-red-50 dark:border-it-red-500/40 dark:bg-rink-800 dark:text-it-red-300 dark:hover:bg-it-red-500/10';
  const itPrimaryBtn =
    'ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-w-md bg-it-blue-500 px-4 text-xs font-bold text-white hover:bg-it-blue-600';
  const itOutlineBtn =
    'ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface px-4 text-xs font-bold text-it-ink-800 hover:bg-it-fill dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700';
  const itDisabledBtn =
    'ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-w-md bg-it-fill px-4 text-xs font-bold text-it-ink-600 dark:bg-rink-700 dark:text-rink-100';

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
            className={
              iceTheme
                ? itGhostBtn
                : 'flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-wline bg-white px-3 text-xs font-bold text-wtext-2 hover:bg-wbg dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700'
            }
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
            className={
              iceTheme
                ? itDangerBtn
                : 'flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-800/50 dark:bg-rink-800 dark:text-red-400 dark:hover:bg-red-900/20'
            }
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
          className={
            iceTheme
              ? itPrimaryBtn
              : 'ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-ice-500 px-4 text-xs font-bold text-white hover:bg-ice-700'
          }
        >
          신청하기
        </NavLink>
      );
    }
    if (uiStatus === 'in_progress') {
      return (
        <NavLink
          href={`${targetHref}/bracket`}
          className={
            iceTheme
              ? itOutlineBtn
              : 'ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-wline bg-white px-4 text-xs font-bold text-wtext-2 hover:bg-wbg dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700'
          }
        >
          대진표 보기
        </NavLink>
      );
    }
    if (uiStatus === 'closed') {
      return (
        <button
          type="button"
          className={
            iceTheme
              ? itDisabledBtn
              : 'ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-wline-2 px-4 text-xs font-bold text-wtext-2 hover:bg-wline dark:bg-rink-700 dark:text-rink-100 dark:hover:bg-rink-500'
          }
          disabled
        >
          대기 등록
        </button>
      );
    }
    return (
      <NavLink
        href={targetHref}
        className={
          iceTheme
            ? itOutlineBtn
            : 'ml-auto flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-wline bg-white px-4 text-xs font-bold text-wtext-2 hover:bg-wbg dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100 dark:hover:bg-rink-700'
        }
      >
        결과 보기
      </NavLink>
    );
  })();

  return (
    <article
      className={cn(
        iceTheme
          ? // ICETIMES flat — 카드 박스(rounded/shadow/border) 제거. hairline 행만.
            'group relative overflow-hidden border-b border-it-line dark:border-rink-700'
          : 'group relative overflow-hidden rounded-xl border border-wline-2 bg-white transition-all hover:shadow-md dark:border-rink-800 dark:bg-rink-800',
        uiStatus === 'closed' && 'opacity-90',
      )}
    >
      <NavLink href={targetHref} className="block">
        <div className={cn('flex flex-row gap-4', iceTheme ? 'px-1 pt-1 pb-3' : 'p-4')}>
          {/* 썸네일 */}
          <div
            className={cn(
              'relative h-24 w-24 shrink-0 overflow-hidden',
              iceTheme
                ? 'rounded-w-md bg-it-fill dark:bg-rink-700'
                : 'rounded-lg bg-wline-2 dark:bg-rink-700',
            )}
          >
            <div className="flex h-full w-full items-center justify-center">
              <Icon
                name="emoji_events"
                className={cn(
                  'text-4xl',
                  iceTheme
                    ? 'text-it-ink-300 dark:text-rink-300'
                    : 'text-wtext-4 dark:text-rink-300',
                )}
              />
            </div>
            {dDayRibbon}
          </div>

          {/* 콘텐츠 */}
          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <TournamentStatusBadge status={uiStatus} iceTheme={iceTheme} />
                <span
                  className={cn(
                    'shrink-0 whitespace-nowrap text-[11px]',
                    iceTheme
                      ? 'text-it-ink-400 dark:text-rink-300'
                      : 'text-wtext-3 dark:text-rink-300',
                  )}
                >
                  {/* [수정 2026-06-16] 출생연도 라벨 — 개별 연도 집합 우선("2014·2016·2019년생"),
                      없으면 from/to 범위 폴백, 레거시 대회는 "전체". */}
                  {formatEligibleBirthYearsLabel(
                    tournament.eligibleBirthYears,
                    tournament.eligibleBirthYearFrom,
                    tournament.eligibleBirthYearTo,
                  )}
                </span>
              </div>
              <h3
                className={cn(
                  'truncate text-base font-bold leading-tight',
                  iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
                )}
              >
                {tournament.name}
              </h3>
              <div className="mt-1 flex flex-col gap-1">
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-xs',
                    iceTheme
                      ? 'text-it-ink-500 dark:text-rink-300'
                      : 'text-wtext-3 dark:text-rink-300',
                  )}
                >
                  <Icon
                    name="calendar_today"
                    className={cn('text-[14px]', iceTheme ? 'text-it-ink-400' : 'text-wtext-3')}
                  />
                  <span>{dateRange}</span>
                </div>
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-xs',
                    iceTheme
                      ? 'text-it-ink-500 dark:text-rink-300'
                      : 'text-wtext-3 dark:text-rink-300',
                  )}
                >
                  <Icon
                    name="location_on"
                    className={cn('text-[14px]', iceTheme ? 'text-it-ink-400' : 'text-wtext-3')}
                  />
                  <span className="truncate">{locationName}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chevron — 상세 이동 힌트 */}
          <div
            className={cn(
              'flex shrink-0 items-center transition-transform duration-200 group-hover:translate-x-0.5',
              iceTheme ? 'text-it-ink-300 dark:text-rink-500' : 'text-wtext-4 dark:text-rink-500',
            )}
            aria-hidden="true"
          >
            <Icon name="chevron_right" className="text-2xl" />
          </div>
        </div>
      </NavLink>

      {/* 푸터 — [2026-06-08] 참가 인원(참가팀) 표시 삭제, CTA 만 우측 노출. */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-end gap-x-3 gap-y-2',
          iceTheme
            ? // flat — 상단 hairline 구분만, 배경 박스 없음.
              'border-t border-it-line pt-3 pb-3 dark:border-rink-700'
            : 'border-t border-wline-2 bg-wbg/50 p-3 dark:border-rink-700/50 dark:bg-white/5',
        )}
      >
        {footerCta}
      </div>
    </article>
  );
}
