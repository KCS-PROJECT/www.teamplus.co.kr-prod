'use client';

/**
 * AwardItemCard — 수상 이력 카드 공용 컴포넌트
 *
 * Task #8 (2026-05-14): 선수카드 (profile-card) ↔ 수상이력 페이지 (awards) UI 통일.
 *   기존:
 *     · profile-card/page.tsx 내부 AwardsSection — 11px 컴팩트 li
 *     · children/[childId]/awards/page.tsx 내부 AwardListCard — full size button
 *   문제: 동일 데이터(PlayerAward)인데 토큰/간격/날짜 포맷 미세 차이로 UI 일관성 부족.
 *
 * 본 컴포넌트는 두 진입점에서 공유되며 `mode` prop 으로 밀도(preview vs page) 만 조절.
 *   - mode='preview': profile-card 박스 안 미리보기 3건. 컴팩트(p-3 + 13px 본문).
 *   - mode='page':    awards 페이지 전체 목록. full(p-4 + 17px 본문 + description + chevron).
 *
 * 두 모드 공통:
 *   - 배지 컬러 매핑 (AWARD_TYPE_BADGE_CLASS)
 *   - 아이콘 매핑 (AWARD_TYPE_ICON)
 *   - 날짜 포맷 (formatAwardDate · YYYY.MM.DD)
 *   - 다크모드 토큰 (bg-white dark:bg-rink-800 · border-wline-2 dark:border-rink-700)
 *   - 토글 비활성 시 button 의 role/aria-disabled 동작
 */

import type { PlayerAward } from '@/types/awards';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────────────────────
// 공유 토큰 / 유틸 — 두 진입점이 동일하게 참조하는 SoT
// ────────────────────────────────────────────────────────────────

export const AWARD_TYPE_ICON: Record<string, string> = {
  mvp: 'star',
  best_scorer: 'scoreboard',
  best_goalie: 'sports_hockey',
  most_improved: 'trending_up',
  sportsmanship: 'handshake',
  skill: 'workspace_premium',
  attendance: 'event_available',
  special: 'military_tech',
};

export const AWARD_TYPE_BADGE_CLASS: Record<string, string> = {
  mvp: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  best_scorer: 'bg-blue-100 text-ice-500 dark:bg-blue-900/20 dark:text-blue-400',
  best_goalie: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
  most_improved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  sportsmanship: 'bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400',
  skill: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  attendance: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  special: 'bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
};

const AWARD_BADGE_FALLBACK =
  'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100';

/** 수상 유형 → Material Symbol 아이콘 (fallback: emoji_events) */
export function getAwardTypeIcon(type: string | null | undefined): string {
  if (!type) return 'emoji_events';
  return AWARD_TYPE_ICON[type] ?? 'emoji_events';
}

/** 수상 유형 → 한국어 라벨 (MESSAGES SoT · fallback: '수상') */
export function getAwardTypeLabel(type: string | null | undefined): string {
  if (!type) return '수상';
  return MESSAGES.awards.typeLabel[type] ?? '수상';
}

/** 수상 유형 → Tailwind 배지 클래스 (라이트·다크 페어 · fallback: 중성) */
export function getAwardTypeBadgeClass(type: string | null | undefined): string {
  if (!type) return AWARD_BADGE_FALLBACK;
  return AWARD_TYPE_BADGE_CLASS[type] ?? AWARD_BADGE_FALLBACK;
}

/** YYYY.MM.DD 한국식 날짜 포맷 (빈 입력 → '-') */
export function formatAwardDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// ────────────────────────────────────────────────────────────────
// AwardItemCard — 본 컴포넌트
// ────────────────────────────────────────────────────────────────

export interface AwardItemCardProps {
  award: PlayerAward;
  /**
   * 표시 모드 — 진입점에 따라 밀도 조절.
   *   - 'preview': profile-card 박스 안 미리보기 (컴팩트, description 숨김)
   *   - 'page':    awards 페이지 전체 목록 (full, description + chevron)
   */
  mode: 'preview' | 'page';
  /** 클릭 핸들러 — 미지정 시 비-인터랙티브 (preview 기본). */
  onClick?: (award: PlayerAward) => void;
  /** 추가 클래스 (도피 해치 · 사용 자제) */
  className?: string;
}

export function AwardItemCard({
  award,
  mode,
  onClick,
  className,
}: AwardItemCardProps) {
  const badgeClass = getAwardTypeBadgeClass(award.awardType);
  const icon = getAwardTypeIcon(award.awardType);
  const label = getAwardTypeLabel(award.awardType);
  const date = formatAwardDate(award.awardedAt);

  const interactive = typeof onClick === 'function';
  const handleClick = interactive
    ? () => onClick!(award)
    : undefined;

  // ── preview 모드 (profile-card 박스 안 컴팩트 미리보기) ──────────
  if (mode === 'preview') {
    const PreviewWrapper: React.ElementType = interactive ? 'button' : 'div';
    return (
      <PreviewWrapper
        type={interactive ? 'button' : undefined}
        onClick={handleClick}
        className={cn(
          'w-full text-left rounded-xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 px-3 py-2.5',
          interactive &&
            'hover:border-ice-500/60 hover:shadow-sm transition-all motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-w-pill text-[11px] font-semibold',
              badgeClass,
            )}
          >
            <Icon name={icon} size={13} aria-hidden="true" />
            {label}
          </span>
          <span className="text-[11px] text-wtext-3 dark:text-rink-300 tabular-nums shrink-0">
            {date}
          </span>
        </div>
        <p className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
          {award.awardName}
        </p>
        {award.awardedBy && (
          <p className="text-[11px] text-wtext-3 dark:text-rink-300 mt-0.5 truncate">
            {award.awardedBy}
          </p>
        )}
      </PreviewWrapper>
    );
  }

  // ── page 모드 (awards 페이지 전체 목록) ─────────────────────────
  const PageWrapper: React.ElementType = interactive ? 'button' : 'div';
  return (
    <PageWrapper
      type={interactive ? 'button' : undefined}
      onClick={handleClick}
      className={cn(
        'w-full text-left bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 shadow-sm overflow-hidden',
        interactive &&
          'hover:shadow-md transition-shadow motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
        className,
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-w-pill text-card-meta font-semibold',
              badgeClass,
            )}
          >
            <Icon name={icon} size={14} aria-hidden="true" />
            {label}
          </span>
          {interactive && (
            <Icon
              name="chevron_right"
              size={18}
              className="text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          )}
        </div>
        <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white mb-1 leading-snug">
          {award.awardName}
        </h3>
        {award.description && (
          <p className="text-card-body text-wtext-3 dark:text-rink-300 mb-3 line-clamp-2">
            {award.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-card-meta text-wtext-3 dark:text-rink-300">
          <span className="flex items-center gap-1 tabular-nums">
            <Icon name="calendar_today" size={13} aria-hidden="true" />
            {date}
          </span>
          {award.season && (
            <span className="flex items-center gap-1">
              <Icon name="date_range" size={13} aria-hidden="true" />
              {award.season}
            </span>
          )}
          {award.awardedBy && (
            <span className="flex items-center gap-1">
              <Icon name="person" size={13} aria-hidden="true" />
              {award.awardedBy}
            </span>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}

export default AwardItemCard;
