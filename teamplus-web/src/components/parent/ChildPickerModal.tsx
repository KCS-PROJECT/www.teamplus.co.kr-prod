'use client';

/**
 * ChildPickerModal — 사이드 메뉴(GlobalMenu) 자녀 선택 가운데 모달
 *
 * 프로필 아래 현재 자녀 줄을 누르면 열린다. 로그아웃 확인창과 같은 공용 Modal 층을 쓰므로
 * 사이드 메뉴 위에 오른다(둘 다 document.body 포털 — 나중에 열린 쪽이 위).
 * 목록 본문은 홈 ChildPickerSheet 와 공용인 ChildPickerList.
 *
 *  · 오버레이 탭·✕ → onClose (모달만 닫힘, 사이드 메뉴 유지)
 *  · 행 선택 → onSelect (호출부가 전역 자녀 변경 + 모달·사이드 메뉴 닫기)
 *  · ESC 는 사이드 메뉴의 document 리스너 정책에 따라 전체 스택이 닫힐 수 있다(기존 로그아웃 확인창과 동일).
 */

import { memo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { MESSAGES } from '@/lib/messages';
import { ChildPickerList, type ChildPickerListItem } from './ChildPickerList';

export interface ChildPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ChildPickerListItem[];
  selectedChildId: string | null;
  onSelect: (childId: string) => void;
}

export const ChildPickerModal = memo(function ChildPickerModal({
  isOpen,
  onClose,
  items,
  selectedChildId,
  onSelect,
}: ChildPickerModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.drawer.selectChild}
      size="sm"
      // 아래 여백은 모달 모서리 둥글기(28px)와 맞춰 마지막 행 모서리가 곡선과 겹쳐 보이지 않게 하고,
      // 위는 헤더가 이미 구분하므로 16px 로 줄여 위아래 균형을 맞춘다.
      // 여백은 스크롤 영역 **밖**에 둔다 — 본문 전체를 스크롤시키면 목록이 상한을 넘을 때
      // 아래 여백이 접힌 부분 아래로 내려가 마지막 행이 잘린 채 보인다.
      contentClassName="px-5 pt-4 pb-7"
    >
      {/* 목록만 스크롤. 상한은 화면 높이에서 헤더·여백·바깥 패딩 몫(약 200px)을 뺀 값 —
          667px 화면에서 자녀 5명(그룹 헤더 포함)까지 스크롤 없이 표시된다. */}
      <div className="max-h-[calc(100dvh-200px)] overflow-y-auto">
        <ChildPickerList
          items={items}
          selectedChildId={selectedChildId}
          onSelect={onSelect}
        />
      </div>
    </Modal>
  );
});
