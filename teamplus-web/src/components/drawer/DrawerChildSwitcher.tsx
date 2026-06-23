'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';

export interface DrawerChildItem {
  id: string;
  name: string;
  profileEmoji?: string;
  /** 소속 클럽명 — 무소속이면 비움(부제 "무소속" 표기). */
  clubName?: string | null;
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
  if (items.length < 2) return null;

  const handleSelect = (id: string) => {
    if (activeChildId === id) return;
    onSelect(id);
  };

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
                      'inline-flex items-center justify-center w-9 h-9 rounded-full text-base shrink-0',
                      isActive
                        ? 'bg-ice-500 text-white'
                        : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-100',
                    )}
                    aria-hidden="true"
                  >
                    {child.profileEmoji ? (
                      <span className="text-lg">{child.profileEmoji}</span>
                    ) : (
                      <Icon name="child_care" className="text-[18px]" />
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
