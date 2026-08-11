'use client';

import { useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';

export interface DrawerChildItem {
  id: string;
  name: string;
  /**
   * ⚠️ 현재 항상 undefined — 백엔드 `GET /children`(ChildResponseDto)에 profileEmoji 필드가
   *  없어 이 분기는 도달하지 않는다(2026-08-11 backend 전수 grep 0건). 되살릴 때는 좌측 슬롯이
   *  팀 아이덴티티 자리라는 점을 먼저 검토할 것.
   */
  profileEmoji?: string;
  /** 소속 클럽명 — 무소속이면 비움(부제 "무소속" 표기). */
  clubName?: string | null;
  /** 승인 대표 팀 로고 URL — 좌측 슬롯에 우선 표시. 없으면 팀 기본 아이콘 폴백. */
  teamLogoUrl?: string | null;
}

interface DrawerChildSwitcherProps {
  /** 선택 대상 자녀 목록 (무소속 포함, pending/rejected 제외). 2명 이상일 때만 호출 측에서 렌더 권장 */
  items: DrawerChildItem[];
  /** 현재 선택 자녀 id — 단일 자녀 모델이라 항상 특정 자녀('전체' 없음) */
  activeChildId: string | null;
  onSelect: (id: string) => void;
}

/**
 * DrawerChildSwitcher — 학부모 자녀 스위처 카드 (사이드메뉴 전용)
 *
 * - 자녀 2명 이상인 학부모에게만 표시 (호출 측 가드 — 1명 이하면 null 렌더)
 * - 자녀별 카드를 가로 스크롤 ('전체' 없음 — 단일 자녀 모델)
 * - 활성 카드: ring-ice-500 + bg-ice-500/5
 * - 클릭 시 동일 id 면 onSelect 호출하지 않음 (불필요한 재렌더 방지)
 * - role="radiogroup" / radio 적용
 * - 선택 상태는 전역 SelectedChildContext(useSelectedChild)가 보유 — 본 컴포넌트는 표시·선택 위임만.
 */
export function DrawerChildSwitcher({
  items,
  activeChildId,
  onSelect,
}: DrawerChildSwitcherProps) {
  // 로드 실패(404/깨짐) 로고 URL 기억 → 팀 기본 아이콘으로 대체.
  //   URL 값 기준이라 팀 로고가 교체되면 자동으로 다시 시도한다.
  //   ⚠️ Hooks 규칙 — 아래 `items.length < 2` 조기 반환보다 반드시 위에 있어야 한다.
  const [brokenLogos, setBrokenLogos] = useState<Set<string>>(new Set());

  const handleSelect = (id: string) => {
    if (activeChildId === id) return;
    onSelect(id);
  };

  if (items.length < 2) return null;

  return (
    <section
      className="bg-white dark:bg-rink-900 border-b border-wline-2 dark:border-rink-800"
      aria-label={MESSAGES.drawer.selectChild}
    >
      <div
        className="max-w-2xl mx-auto px-5 py-3 overflow-x-auto hide-scrollbar"
        style={{ scrollbarWidth: 'none' }}
      >
        <ul
          role="radiogroup"
          aria-label={MESSAGES.drawer.selectChild}
          className="flex gap-2 flex-nowrap min-w-max whitespace-nowrap"
        >
          {items.map((child) => {
            const isActive = activeChildId === child.id;
            // 판정은 **해석된 URL** 기준 — resolveImageSrc 는 빈 문자열·공백·placeholder.svg 를
            //  undefined 로 돌려주므로, 원본 truthy 만 보면 src 없는 빈 img 가 남고 onError 도 안 뜬다.
            const resolvedLogo = resolveImageSrc(child.teamLogoUrl);
            const showLogo = !!resolvedLogo && !brokenLogos.has(resolvedLogo);
            return (
              <li key={child.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => handleSelect(child.id)}
                  className={cn(
                    'flex items-center gap-2 h-[60px] px-4 rounded-2xl text-sm font-semibold border transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ice-500/40 focus-visible:outline-none',
                    isActive
                      ? 'ring-2 ring-ice-500 bg-ice-500/5 border-ice-500 text-ice-500 dark:text-white'
                      : 'border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-2 dark:text-rink-100 hover:border-ice-500/60',
                  )}
                >
                  <span
                    className={cn(
                      'relative inline-flex items-center justify-center w-9 h-9 rounded-full text-base shrink-0 overflow-hidden',
                      isActive
                        ? 'bg-ice-500 text-white'
                        : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-100',
                    )}
                    aria-hidden="true"
                  >
                    {showLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolvedLogo}
                        alt=""
                        onError={() =>
                          setBrokenLogos((prev) => new Set(prev).add(resolvedLogo!))
                        }
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : child.profileEmoji ? (
                      <span className="text-lg">{child.profileEmoji}</span>
                    ) : (
                      // 팀 아이덴티티 슬롯이므로 사람 아이콘(child_care)이 아니라 팀 기본 아이콘.
                      //  홈 자녀 스트립·ChildPickerSheet·team/[id] 히어로·TeamListCard 와 동일 관용.
                      <Icon name="sports_hockey" className="text-[18px]" />
                    )}
                  </span>
                  <span className="leading-tight text-left">
                    <span className="block">{child.name}</span>
                    <span className="block text-[11px] font-medium text-wtext-3 dark:text-rink-300 truncate max-w-[120px]">
                      {child.clubName?.trim() || MESSAGES.drawer.childNoTeam}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
