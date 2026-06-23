'use client';

/**
 * TeamCoachStaffRow — 팀 코치진 가로 스크롤 섹션
 *
 * 레퍼런스: 사용자 제공 HTML "팀 상세 정보" Coaching Staff 섹션
 *
 * 특징:
 *  - Head 코치(팀 오너)는 primary 테두리 + "감독" 배지
 *  - 그 외는 일반 회색 테두리
 *  - 이니셜 아바타 (photoUrl 필드 없음 → 이름 기반 이니셜 + primary 컬러)
 *  - overflow-x-auto + hide-scrollbar
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import type { TeamCoachStaff } from '@/services/team.service';
import { cn } from '@/lib/utils';

interface TeamCoachStaffRowProps {
  staff: readonly TeamCoachStaff[];
  /** "전체보기" 핸들러 (감독/코치 전용, 생략 가능) */
  onSeeAll?: () => void;
}

/** 이름 → 이니셜 (한글/영문 모두 대응) */
function getInitials(
  firstName: string | null,
  lastName: string | null,
): string {
  const last = (lastName ?? '').trim();
  const first = (firstName ?? '').trim();
  if (!last && !first) return '?';
  // 한국 이름: 성(1) + 이름 첫 글자(1)
  if (last && first) {
    return `${last.slice(0, 1)}${first.slice(0, 1)}`;
  }
  return (last || first).slice(0, 2);
}

/** 코치 표시용 풀네임 */
function displayName(coach: TeamCoachStaff): string {
  const { firstName, lastName, email } = coach.user;
  const full = `${lastName ?? ''}${firstName ?? ''}`.trim();
  if (full) return full;
  const idLocal = email.split('@')[0];
  return idLocal || '코치';
}

/** 코치 카드 (CoachAvatar) */
function CoachAvatar({ coach }: { coach: TeamCoachStaff }) {
  const name = displayName(coach);
  const initials = getInitials(coach.user.firstName, coach.user.lastName);
  const badge = coach.isHead
    ? MESSAGES.team.headCoachBadge
    : MESSAGES.team.coachBadge;

  return (
    <article
      className="w-24 shrink-0 text-center"
      aria-label={`${name} ${badge}`}
    >
      <div className="relative mx-auto mb-2">
        <div
          className={cn(
            'mx-auto flex size-20 items-center justify-center rounded-full border-2 p-0.5',
            coach.isHead
              ? 'border-ice-500 bg-ice-500/5 dark:border-ice-500/70 dark:bg-ice-500/20'
              : 'border-wline bg-wbg dark:border-rink-700 dark:bg-rink-700',
          )}
        >
          <div
            className={cn(
              'flex size-[72px] items-center justify-center rounded-full text-lg font-extrabold',
              coach.isHead
                ? 'bg-ice-500 text-white'
                : 'bg-white text-wtext-3 dark:bg-rink-500 dark:text-rink-100',
            )}
            aria-hidden="true"
          >
            {initials}
          </div>
        </div>
        {coach.isHead && (
          <span
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-ice-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
            aria-hidden="true"
          >
            {MESSAGES.team.headCoachBadge}
          </span>
        )}
      </div>
      <p className="truncate text-card-emphasis font-bold text-wtext-1 dark:text-white">
        {name}
      </p>
      <p className="truncate text-card-meta text-wtext-3 dark:text-rink-300">
        {badge}
      </p>
    </article>
  );
}

export function TeamCoachStaffRow({ staff, onSeeAll }: TeamCoachStaffRowProps) {
  const hasData = staff.length > 0;

  return (
    <section aria-label={MESSAGES.team.ariaCoachStaffRegion}>
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-6 w-1 rounded-full bg-ice-500"
            aria-hidden="true"
          />
          <h3 className="text-card-section text-wtext-1 dark:text-white">
            {MESSAGES.team.coachStaff}
          </h3>
        </div>
        {onSeeAll && hasData && (
          <button
            type="button"
            onClick={onSeeAll}
            className="rounded text-card-meta font-bold text-ice-500 hover:text-ice-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 focus-visible:ring-offset-2"
          >
            {MESSAGES.team.seeAll}
          </button>
        )}
      </header>

      {!hasData ? (
        <div className="rounded-2xl border border-wline-2 bg-white p-6 text-center dark:border-rink-700 dark:bg-rink-800">
          <Icon
            name="person_off"
            className="mx-auto text-3xl text-wtext-4 dark:text-rink-500"
            aria-hidden="true"
          />
          <p className="mt-2 text-card-emphasis font-semibold text-wtext-2 dark:text-rink-100">
            {MESSAGES.team.coachStaffEmpty}
          </p>
        </div>
      ) : (
        <div className="hide-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
          {staff.map((coach) => (
            <CoachAvatar key={coach.id} coach={coach} />
          ))}
        </div>
      )}
    </section>
  );
}
