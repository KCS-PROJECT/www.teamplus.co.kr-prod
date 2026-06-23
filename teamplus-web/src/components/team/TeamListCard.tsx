'use client';

/**
 * TeamListCard — 팀 목록 화면의 개별 카드
 *
 * 레퍼런스: 사용자 제공 HTML "팀 목록 🏀" Team Card
 *
 * 특징:
 *  - 로고 이미지 또는 primaryColor 폴백(하키 아이콘)
 *  - 팀명 + 위치 + 부문·팀명
 *  - 우하단 인원 배지
 *  - 비활성 팀은 "비활성" 배지
 *  - 학부모 variant (myChild=true) 은 primary 테두리 + "내 아이" 배지
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import {
  divisionLabel,
  type TeamListItem,
} from '@/services/team.service';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

// 팀 로고 폴백 색상 팔레트 — JS string 으로 사용되어 Tailwind 토큰 변환 불가.
// 디자인 토큰과 시각적으로 어울리는 어두운 색조 6종을 명시. (RULE-8 합법적 예외)
const FALLBACK_COLORS = [
  '#2f5fff', // ice-500 (primary)
  '#1f47e6', // ice-600 (primary-dark)
  '#0F766E', // teal-700
  '#6D28D9', // violet-700
  '#B91C1C', // red-700
  '#CA8A04', // yellow-700
] as const;

/** 팀 ID 해시 기반 결정적 폴백 색상 */
export function resolveLogoColor(team: TeamListItem): string {
  if (team.primaryColor) return team.primaryColor;
  let hash = 0;
  for (let i = 0; i < team.id.length; i++) {
    hash = ((hash << 5) - hash + team.id.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

interface TeamListCardProps {
  team: TeamListItem;
  onClick: () => void;
  /** 학부모 "내 아이 팀" variant (primary 테두리 + 상단 배지) */
  highlight?: boolean;
  /** 하이라이트 배지 라벨 (기본: "내 아이") */
  highlightBadge?: string;
  /** 카드 하단 슬롯 (학부모 자녀 칩 등) */
  footerSlot?: React.ReactNode;
}

export function TeamListCard({
  team,
  onClick,
  highlight = false,
  highlightBadge,
  footerSlot,
}: TeamListCardProps) {
  const logoColor = resolveLogoColor(team);
  const memberCount = team._count?.roster ?? 0;
  const clubLocation = team.club?.location ?? null;
  const clubName = team.club?.clubName ?? null;
  // 백엔드 신 표준은 team.name. 평탄화 응답에서는 team.club.clubName 으로 올 수 있음.
  const teamName = team.name ?? team.club?.clubName ?? '팀';
  const divisionText = team.division ? divisionLabel(team.division) : null;
  const metaText = divisionText && clubName
    ? `${divisionText} · ${clubName}`
    : divisionText ?? clubName;
  const badge = highlightBadge ?? MESSAGES.team.myChildBadge;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative w-full rounded-2xl border p-4 text-left shadow-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 active:scale-[0.99]',
        highlight
          ? 'border-2 border-ice-500/30 bg-white hover:border-ice-500/60 hover:shadow-md dark:border-ice-500/50 dark:bg-rink-800 dark:hover:border-ice-500'
          : 'border-wline-2 bg-white hover:border-ice-500/30 hover:shadow-md dark:border-rink-700 dark:bg-rink-800 dark:hover:border-ice-500/50',
      )}
      aria-label={`${teamName} 팀 상세 보기`}
    >
      {highlight && (
        <span className="absolute -top-2 left-4 inline-flex items-center gap-1 rounded-full bg-ice-500 px-3 py-1 text-[11px] font-bold text-white">
          <Icon name="favorite" className="text-[12px]" aria-hidden="true" />
          {badge}
        </span>
      )}

      {/* [추가 2026-05-21] 본인 멤버십이 pending 일 때 카드 우상단에 "승인 대기" 배지 표시.
          코치가 가입 신청만 한 상태의 팀임을 즉시 인지할 수 있도록. */}
      {team.myApprovalStatus === 'pending' && (
        <span
          className="absolute -top-2 right-4 inline-flex items-center gap-1 rounded-full bg-sun-100 px-3 py-1 text-[11px] font-bold text-sun-700"
          aria-label={MESSAGES.dashboard.pendingApprovalBadge}
        >
          <Icon name="schedule" className="text-[12px]" aria-hidden="true" />
          {MESSAGES.dashboard.pendingApprovalBadge}
        </span>
      )}

      <div className={cn('flex items-start gap-4', highlight && 'pt-2')}>
        {/* 로고 */}
        {resolveImageSrc(team.logoUrl) ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={resolveImageSrc(team.logoUrl)}
            alt={`${teamName} 로고`}
            className="size-16 shrink-0 rounded-lg border border-wline-2 object-cover dark:border-rink-700"
          />
        ) : (
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: logoColor }}
            aria-hidden="true"
          >
            <Icon name="sports_hockey" className="text-3xl text-white" />
          </div>
        )}

        {/* 정보 */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-card-title leading-tight text-wtext-1 dark:text-white">
            {teamName}
          </h3>
          <div className="mt-2 space-y-1">
            {/* [추가 2026-05-21 시나리오 B] 팀 코드 — 회원가입 시 사용자가 입력한 식별 코드.
                 가입 시 다른 사용자에게 공유할 코드라 목록 카드에서도 즉시 확인 가능해야 함. */}
            {team.teamCode && (
              <div className="flex items-center gap-1 text-card-meta text-wtext-3 dark:text-rink-300">
                <Icon
                  name="qr_code_2"
                  className="shrink-0 text-[14px]"
                  aria-hidden="true"
                />
                <span className="font-bold tabular-nums uppercase tracking-wider">
                  {team.teamCode}
                </span>
              </div>
            )}
            {clubLocation && (
              <div className="flex items-center gap-1 text-card-meta text-wtext-3 dark:text-rink-300">
                <Icon
                  name="location_on"
                  className="shrink-0 text-[14px]"
                  aria-hidden="true"
                />
                <span className="truncate">{clubLocation}</span>
              </div>
            )}
            {metaText && (
              <div className="flex items-center gap-1 text-card-meta text-wtext-3 dark:text-rink-300">
                <Icon
                  name="groups"
                  className="shrink-0 text-[14px]"
                  aria-hidden="true"
                />
                <span>{metaText}</span>
              </div>
            )}
          </div>
        </div>

        {team.isActive === false && (
          <span className="shrink-0 rounded-full bg-wline-2 px-2 py-0.5 text-[10px] font-bold text-wtext-3 dark:bg-rink-700 dark:text-rink-300">
            {MESSAGES.team.inactiveBadge}
          </span>
        )}
      </div>

      {footerSlot}

      <div className="mt-3 flex justify-end">
        <span className="inline-flex items-center gap-1 rounded-full bg-ice-500 px-3 py-1 text-xs font-bold text-white">
          <Icon name="person" className="text-[14px]" aria-hidden="true" />
          {MESSAGES.team.memberCount(memberCount)}
        </span>
      </div>
    </button>
  );
}
