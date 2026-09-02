'use client';

/**
 * ChildPickerList — 자녀 선택 목록 본문 (홈 ChildPickerSheet · 사이드 메뉴 ChildPickerModal 공용)
 *
 * 대표 팀(승인 첫 소속) 기준으로 묶어 그린다 — 규칙은 groupByRepresentativeTeam(child-status.ts) SoT.
 *  · 그룹이 1개(자녀 전원 같은 팀 또는 전원 무소속)면 헤더를 그리지 않는다 → 기존 단순 목록과 동일 모양.
 *  · 다중 소속 자녀는 대표 팀 그룹에만 1회 배치하고, 부제에 나머지 소속을 함께 적는다.
 *  · 행 마크업은 종전 ChildPickerSheet 행을 그대로 이관(로고/팀 기본 아이콘 · 이름 · 부제 · check_circle).
 *
 * SoT: DESIGN.md §7(절대 금지) — gradient/backdrop-blur/컬러 그림자 0건, it-* 토큰만.
 */

import { memo, useMemo, useState } from 'react';
import type { Child } from '@/components/children/ChildCard';
import { Icon } from '@/components/ui/Icon';
import { getRepresentativeTeam, groupByRepresentativeTeam } from '@/lib/child-status';
import { resolveImageSrc } from '@/lib/image-url';
import { MESSAGES } from '@/lib/messages';

export interface ChildPickerListItem {
  id: string;
  name: string;
  /** 대표 팀 ID — 없으면 무소속 */
  teamId: string | null;
  /** 대표 팀명 — 없으면 "소속없음" 라벨 노출 */
  teamName: string | null;
  /** 대표 팀 로고 URL — 없거나 로드 실패 시 팀 기본 아이콘 플레이스홀더 */
  logoUrl: string | null;
  /** 대표 팀 외 소속명 (다중 소속 부제용) */
  otherTeamNames: string[];
}

/**
 * Child → 목록 항목 변환 (홈·사이드 메뉴 공용).
 * @param logoUrlOverride 호출부가 다른 출처(팀 훅 조회)의 로고를 쓰고 싶을 때 — undefined 면 child 의 대표 팀 로고.
 */
export function toChildPickerItem(
  child: Child,
  logoUrlOverride?: string | null,
): ChildPickerListItem {
  const team = getRepresentativeTeam(child);
  const others = (child.teams ?? [])
    .filter((t) => t.id !== team?.id && t.name.trim() !== '')
    .map((t) => t.name);
  return {
    id: child.id,
    name: child.name,
    teamId: team?.id ?? null,
    teamName: team?.name?.trim() ? team.name : null,
    logoUrl: logoUrlOverride !== undefined ? logoUrlOverride : (team?.logoUrl ?? null),
    otherTeamNames: others,
  };
}

export interface ChildPickerListProps {
  items: ChildPickerListItem[];
  selectedChildId: string | null;
  onSelect: (childId: string) => void;
}

export const ChildPickerList = memo(function ChildPickerList({
  items,
  selectedChildId,
  onSelect,
}: ChildPickerListProps) {
  // 로드 실패한 로고 URL 기억 → 팀 기본 아이콘으로 대체 (자녀 전환 시 재시도 불필요)
  const [brokenLogos, setBrokenLogos] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupByRepresentativeTeam(items), [items]);
  const showHeaders = groups.length > 1;

  return (
    <ul className="space-y-2" role="list">
      {groups.map((group) => {
        const groupKey = group.teamId ?? '__no_team__';
        const headerLabel = group.teamId
          ? group.teamName || MESSAGES.team.childHeaderNoTeamLabel
          : MESSAGES.team.childPickerNoTeamGroup;
        return [
          showHeaders ? (
            <li
              key={`header-${groupKey}`}
              role="presentation"
              className="pt-2 first:pt-0 px-1 text-card-meta font-semibold text-it-ink-500 dark:text-rink-300 truncate"
              data-testid="child-picker-group-header"
            >
              {headerLabel}
            </li>
          ) : null,
          ...group.items.map((child) => {
            const isSelected = child.id === selectedChildId;
            // 판정은 **해석된 URL** 기준 — resolveImageSrc 는 빈 문자열·공백·placeholder.svg 를
            //  undefined 로 돌려주므로, 원본 truthy 만 보면 src 없는 빈 img 가 남고 onError 도 안 뜬다.
            const resolvedLogo = resolveImageSrc(child.logoUrl);
            const showLogo = !!resolvedLogo && !brokenLogos.has(resolvedLogo);
            const subtitle = child.teamName
              ? MESSAGES.team.childPickerTeams([child.teamName, ...child.otherTeamNames])
              : MESSAGES.team.childHeaderNoTeamLabel;
            return (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => onSelect(child.id)}
                  aria-pressed={isSelected}
                  className={`w-full flex items-center gap-3 p-4 rounded-w-md border text-left transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 ${
                    isSelected
                      ? 'border-it-blue-500 bg-it-blue-50 dark:bg-it-blue-900/30'
                      : 'border-it-line dark:border-rink-700 bg-it-surface dark:bg-rink-800 hover:bg-it-fill dark:hover:bg-rink-700'
                  }`}
                >
                  {showLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolvedLogo}
                      alt=""
                      onError={() =>
                        setBrokenLogos((prev) => new Set(prev).add(resolvedLogo!))
                      }
                      className="size-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="size-10 rounded-lg bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center text-card-body font-bold text-it-blue-600 dark:text-it-blue-300 shrink-0"
                    >
                      {/* 팀 아이덴티티 슬롯이므로 자녀 이름 이니셜을 넣지 않는다 — 무소속이면
                          부제("소속없음")와 어긋나 그 글자가 팀명처럼 읽힌다. 홈 자녀 스트립·
                          team/[id] 히어로·TeamListCard 와 동일한 팀 기본 아이콘으로 통일. */}
                      <Icon name="sports_hockey" className="text-[20px]" />
                    </span>
                  )}
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span
                      className={`text-card-body font-semibold truncate ${
                        isSelected
                          ? 'text-it-blue-700 dark:text-it-blue-200'
                          : 'text-it-ink-900 dark:text-white'
                      }`}
                    >
                      {child.name}
                    </span>
                    <span className="text-card-meta text-it-ink-500 dark:text-rink-300 truncate">
                      {subtitle}
                    </span>
                  </span>
                  <Icon
                    name="check_circle"
                    className={`text-[22px] shrink-0 ${
                      isSelected ? 'text-it-blue-500' : 'text-transparent'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          }),
        ];
      })}
    </ul>
  );
});
