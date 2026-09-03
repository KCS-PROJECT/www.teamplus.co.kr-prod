'use client';

/**
 * ChildPickerSheet — 학부모 홈 자녀 선택 바텀시트
 *
 * 네이비 자녀 스트립 우측 [선택] 버튼에서 열림. 목록 본문은 사이드 메뉴 모달과 공용인
 * ChildPickerList(대표 팀별 그룹 헤더 · 다중 소속 부제)이며, 행 탭 시 전역
 * SelectedChildContext 전환 후 닫힌다.
 *
 * SoT: DESIGN.md §7(절대 금지) — gradient/backdrop-blur/컬러 그림자 0건, it-* 토큰만.
 */

import { memo } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MESSAGES } from '@/lib/messages';
import { ChildPickerList, type ChildPickerListItem } from './ChildPickerList';

export type { ChildPickerListItem as ChildPickerItem } from './ChildPickerList';

export interface ChildPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  items: ChildPickerListItem[];
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
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.team.childStripSheetTitle}
      maxHeight="70vh"
    >
      <ChildPickerList
        items={items}
        selectedChildId={selectedChildId}
        onSelect={onSelect}
      />
    </BottomSheet>
  );
});
