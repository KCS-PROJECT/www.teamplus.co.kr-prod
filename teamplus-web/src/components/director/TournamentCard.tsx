'use client';

import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';

// ─── 대회 상태 타입 ─────────────────────────────────
export type TournamentStatus =
  | 'recruiting'
  | 'closing_soon'
  | 'closed'
  | 'in_progress'
  | 'coming_soon';

export interface TournamentItem {
  id: string;
  title: string;
  type: 'league' | 'friendly' | 'cup';
  typeLabel: string;
  dateRange: string;
  location: string;
  imageUrl?: string;
  status: TournamentStatus;
  statusLabel: string;
  dDay?: number;
  teamCount?: number;
  hasBracket?: boolean;
  notifyOnCancel?: boolean;
}

// ─── 상태 배지 스타일 맵 ────────────────────────────
const STATUS_BADGE_MAP: Record<
  TournamentStatus,
  string
> = {
  recruiting:
    'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  closing_soon:
    'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  closed:
    'bg-wline text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
  in_progress:
    'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  coming_soon:
    'border border-wline text-wtext-2 dark:border-rink-700 dark:text-rink-300',
};

interface TournamentCardProps {
  item: TournamentItem;
}

/**
 * 대회/경기 목록용 카드 컴포넌트
 * coming_soon 상태는 간소화된 레이아웃을 사용합니다.
 */
export function TournamentCard({ item }: TournamentCardProps) {
  const badgeClassName = STATUS_BADGE_MAP[item.status] ?? STATUS_BADGE_MAP.coming_soon;

  const statusBadge = (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${badgeClassName}`}
    >
      {item.statusLabel}
    </span>
  );

  // Coming Soon 변형 (간소화)
  if (item.status === 'coming_soon') {
    return (
      <article className="w-full bg-wbg dark:bg-rink-800/50 rounded-2xl p-5 border border-wline dark:border-rink-700">
        <div className="flex items-center justify-between mb-2">
          {statusBadge}
          <button type="button"             className="p-1 rounded-full hover:bg-wline dark:hover:bg-rink-700 transition-colors"
            aria-label="알림 신청"
          >
            <Icon
              name="notifications"
              className="text-xl text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </button>
        </div>
        <h3 className="text-lg font-bold text-wtext-1 dark:text-white mb-1">
          {item.title}
        </h3>
        <p className="text-sm text-wtext-3 dark:text-rink-300">
          {item.dateRange}
        </p>
      </article>
    );
  }

  // 기본 대회 카드
  return (
    <article className="w-full bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline-2 dark:border-rink-700 overflow-hidden">
      {/* 이미지 섹션 */}
      <div className="relative h-36 bg-wline dark:bg-rink-700">
        {item.dDay != null && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md text-xs font-bold bg-ice-500 text-white">
            D-{item.dDay}
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon
            name="sports_hockey"
            className="text-5xl text-wtext-4 dark:text-rink-500"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* 콘텐츠 섹션 */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {statusBadge}
          <span className="text-xs text-wtext-3 dark:text-rink-300">
            {item.typeLabel}
          </span>
        </div>

        <h3 className="text-base font-bold text-wtext-1 dark:text-white mb-3 line-clamp-1">
          {item.title}
        </h3>

        <div className="flex flex-col gap-1.5 mb-4">
          <div className="flex items-center gap-2 text-wtext-3 dark:text-rink-300">
            <Icon name="calendar_today" className="text-lg" aria-hidden="true" />
            <span className="text-sm">{item.dateRange}</span>
          </div>
          <div className="flex items-center gap-2 text-wtext-3 dark:text-rink-300">
            <Icon name="location_on" className="text-lg" aria-hidden="true" />
            <span className="text-sm">{item.location}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-wline-2 dark:border-rink-700">
          {item.teamCount != null && (
            <p className="text-sm text-wtext-3 dark:text-rink-300">
              현재{' '}
              <span className="font-bold text-ice-500">{item.teamCount}팀</span>{' '}
              참가 신청 중
            </p>
          )}
          {item.hasBracket && (
            <p className="text-sm text-wtext-3 dark:text-rink-300">
              대진표가 공개되었습니다
            </p>
          )}
          {item.notifyOnCancel && (
            <p className="text-sm text-wtext-3 dark:text-rink-300">
              취소 발생 시 알림 신청
            </p>
          )}

          {item.status === 'recruiting' && (
            <NavLink
              href={`/tournaments/${item.id}`}
              className="px-4 py-2 bg-ice-500 hover:bg-ice-700 text-white text-sm font-bold rounded-lg transition-colors active:brightness-95"
            >
              신청하기
            </NavLink>
          )}
          {item.hasBracket && (
            <NavLink
              href={`/tournaments/${item.id}/bracket`}
              className="px-4 py-2 bg-white dark:bg-rink-700 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 text-sm font-bold rounded-lg hover:bg-wbg dark:hover:bg-rink-500 transition-colors active:brightness-95"
            >
              대진표 보기
            </NavLink>
          )}
          {item.notifyOnCancel && (
            <button type="button" className="px-4 py-2 bg-white dark:bg-rink-700 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 text-sm font-bold rounded-lg hover:bg-wbg dark:hover:bg-rink-500 transition-colors active:brightness-95">
              대기 등록
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── 유틸: API 응답 → TournamentItem 변환 ──────────
export function mapTournamentFromApi(t: {
  id: string;
  name?: string;
  title?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  status?: string;
  currentTeams?: number;
  maxTeams?: number;
  hasBracket?: boolean;
}): TournamentItem {
  const rawStatus = t.status ?? 'upcoming';

  const statusMap: Record<string, TournamentStatus> = {
    upcoming: 'coming_soon',
    recruiting: 'recruiting',
    ongoing: 'in_progress',
    completed: 'closed',
    closing_soon: 'closing_soon',
    closed: 'closed',
    in_progress: 'in_progress',
    coming_soon: 'coming_soon',
  };

  const statusLabelMap: Record<TournamentStatus, string> = {
    recruiting: '접수중',
    closing_soon: '마감 임박',
    closed: '모집 완료',
    in_progress: '진행 중',
    coming_soon: 'Coming Soon',
  };

  const status: TournamentStatus = statusMap[rawStatus] ?? 'coming_soon';

  const dateRange =
    t.startDate && t.endDate
      ? `${t.startDate.slice(2, 10).replace(/-/g, '.')} - ${t.endDate.slice(2, 10).replace(/-/g, '.')}`
      : t.startDate
        ? t.startDate.slice(0, 10)
        : '';

  return {
    id: t.id,
    title: t.name ?? t.title ?? '',
    type: (t.type as TournamentItem['type']) ?? 'league',
    typeLabel:
      t.type === 'friendly'
        ? 'Friendly Match'
        : t.type === 'cup'
          ? 'Cup'
          : 'Amateur League',
    dateRange,
    location: t.location ?? '',
    status,
    statusLabel: statusLabelMap[status],
    teamCount: t.currentTeams,
    hasBracket: t.hasBracket,
  };
}
