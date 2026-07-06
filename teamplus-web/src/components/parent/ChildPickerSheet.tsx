'use client';

/**
 * ChildPickerSheet — 학부모 홈 자녀 선택 바텀시트
 *
 * 네이비 자녀 스트립 우측 [선택] 버튼에서 열림. 승인 자녀 목록(무소속 포함)을
 * 로고·이름·팀명과 함께 보여주고, 행 탭 시 전역 SelectedChildContext 전환 후 닫힌다.
 * 기존 본문 자녀 칩 row 를 대체 — 사이드메뉴(GlobalMenu) 스위처는 별도 유지.
 *
 * SoT: DESIGN.md §7(절대 금지) — gradient/backdrop-blur/컬러 그림자 0건, it-* 토큰만.
 */

import { memo, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { resolveImageSrc } from '@/lib/image-url';
import { MESSAGES } from '@/lib/messages';

export interface ChildPickerItem {
  id: string;
  name: string;
  /** 승인 대표 팀명 — 없으면 "소속없음" 라벨 노출 */
  club: string | null;
  /** 대표 팀 로고 URL — 없거나 로드 실패 시 이니셜 플레이스홀더 */
  logoUrl: string | null;
}

export interface ChildPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  items: ChildPickerItem[];
  selectedChildId: string | null;
  onSelect: (childId: string) => void;
}

export const ChildPickerSheet = memo(function ChildPickerSheet({
  isOpen,
  onClose,
  items,
  selectedChildId,
  onSelect,
}: ChildPickerSheetProps) {
  // 로드 실패한 로고 URL 기억 → 이니셜 플레이스홀더로 대체 (자녀 전환 시 재시도 불필요)
  const [brokenLogos, setBrokenLogos] = useState<Set<string>>(new Set());

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.team.childStripSheetTitle}
      maxHeight="70vh"
    >
      <ul className="space-y-2" role="list">
        {items.map((child) => {
          const isSelected = child.id === selectedChildId;
          const showLogo = !!child.logoUrl && !brokenLogos.has(child.logoUrl);
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
                    src={resolveImageSrc(child.logoUrl!)}
                    alt=""
                    onError={() =>
                      setBrokenLogos((prev) => new Set(prev).add(child.logoUrl!))
                    }
                    className="size-10 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="size-10 rounded-lg bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center text-card-body font-bold text-it-blue-600 dark:text-it-blue-300 shrink-0"
                  >
                    {(child.club || child.name).charAt(0)}
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
                    {child.club || MESSAGES.team.childHeaderNoTeamLabel}
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
        })}
      </ul>
    </BottomSheet>
  );
});
