'use client';

/**
 * DrawerChildPicker — 사이드 메뉴 프로필 아래 "현재 자녀 · 팀" 한 줄 + 자녀 선택 모달
 *
 * 종전 카드형 DrawerChildSwitcher 를 대체한다. 프로필·텍스트 메뉴의 평평한 톤에 맞춰
 * 테두리·배경 없이 부제 한 줄만 차지하며, 자녀 수와 무관하게 사이드 메뉴 높이가 같다.
 *
 *  · 자녀 0명 또는 선택 자녀 미확정(로딩) → 아무것도 그리지 않음
 *  · 자녀 1명 → 정적 텍스트(종전 부제와 동일 성격)
 *  · 자녀 2명+ → 버튼(expand_more) → ChildPickerModal
 *
 * 행 선택 시 onSelect 만 호출한다 — 전역 자녀 변경과 사이드 메뉴 닫기는 호출부(GlobalMenu) 책임.
 * 사이드 메뉴가 닫히면(drawerOpen=false) 모달 열림 상태도 함께 리셋한다.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import { ChildPickerModal } from '@/components/parent/ChildPickerModal';
import type { ChildPickerListItem } from '@/components/parent/ChildPickerList';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

export interface DrawerChildPickerProps {
  items: ChildPickerListItem[];
  selectedChildId: string | null;
  /** 사이드 메뉴 열림 여부 — false 전이 시 모달을 닫는다 */
  drawerOpen: boolean;
  onSelect: (childId: string) => void;
}

export const DrawerChildPicker = memo(function DrawerChildPicker({
  items,
  selectedChildId,
  drawerOpen,
  onSelect,
}: DrawerChildPickerProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) setIsPickerOpen(false);
  }, [drawerOpen]);

  const handleSelect = useCallback(
    (id: string) => {
      setIsPickerOpen(false);
      onSelect(id);
    },
    [onSelect],
  );

  const selected = items.find((c) => c.id === selectedChildId) ?? null;
  if (!selected) return null;

  const teamLabel = selected.teamName ?? MESSAGES.drawer.childNoTeam;
  const label = (
    <>
      <span className="font-semibold text-wtext-2 dark:text-rink-100 truncate">
        {selected.name}
      </span>
      <span className="text-wtext-4 dark:text-rink-300 truncate">
        {` · ${teamLabel}`}
      </span>
    </>
  );

  if (items.length < 2) {
    return (
      <span
        className="min-w-0 flex items-center text-card-meta tracking-[-0.01em] truncate"
        data-testid="drawer-child-line"
      >
        {label}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsPickerOpen(true)}
        aria-label={MESSAGES.drawer.changeChild}
        aria-haspopup="dialog"
        aria-expanded={isPickerOpen}
        data-testid="drawer-child-line"
        className="self-start max-w-full min-w-0 min-h-[32px] inline-flex items-center gap-0.5 text-card-meta tracking-[-0.01em] text-left rounded-md transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
      >
        <span className="min-w-0 flex items-center truncate">{label}</span>
        <Icon
          name="expand_more"
          className="text-[18px] shrink-0 text-wtext-3 dark:text-rink-300"
          aria-hidden="true"
        />
      </button>
      <ChildPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        items={items}
        selectedChildId={selectedChildId}
        onSelect={handleSelect}
      />
    </>
  );
});
