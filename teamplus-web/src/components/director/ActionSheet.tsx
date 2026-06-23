'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { useNativeScrim } from '@/hooks/useNativeScrim';

export interface ActionSheetItem {
  /** Material Symbols 아이콘 이름 */
  icon: string;
  /** 메뉴 항목 라벨 */
  label: string;
  /** 클릭 핸들러 */
  onClick: () => void;
  /** 아이콘 배경 색상 Tailwind 클래스 */
  iconBg?: string;
  /** 아이콘 색상 Tailwind 클래스 */
  iconColor?: string;
  /** 라벨 색상 Tailwind 클래스 (위험 액션 등에 사용) */
  labelColor?: string;
  /** 위험 액션 여부 (true 시 빨간색 스타일 자동 적용) */
  danger?: boolean;
}

interface ActionSheetProps {
  /** 표시 여부 */
  isOpen: boolean;
  /** 닫기 핸들러 */
  onClose: () => void;
  /** 시트 제목 (접근성용 aria-label) */
  title: string;
  /** 메뉴 항목 목록 */
  items: ActionSheetItem[];
}

/**
 * 바텀 액션 시트 컴포넌트
 * 감독 대시보드의 일정/이벤트 관리 메뉴 등에서 사용합니다.
 *
 * [SPEC_POPUP_FULLSCREEN_DIM v2026-05-16]
 *   - createPortal(document.body) — MobileContainer overflow-hidden 클리핑 우회
 *   - useNativeScrim — Flutter native safe-area(status bar / home indicator) 영역까지 dim
 *   - overlay-fullscreen-dim-sheet — viewport 100dvh + AppBar/BottomNav 위로 z-9990
 *   - body scroll lock, ESC 닫기, 오버레이 클릭 닫기
 *
 * @example
 * <ActionSheet
 *   isOpen={!!selectedId}
 *   onClose={() => setSelectedId(null)}
 *   title="일정 관리"
 *   items={[
 *     { icon: 'edit', label: '수정하기', onClick: handleEdit },
 *     { icon: 'delete', label: '삭제하기', onClick: handleDelete, danger: true },
 *   ]}
 * />
 */
export function ActionSheet({ isOpen, onClose, title, items }: ActionSheetProps) {
  // Portal 마운트 여부 (SSR 대응)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // [SPEC_POPUP_FULLSCREEN_DIM] Flutter native status bar dim — Sheet 패턴 (#73141826 = rink-900/45).
  // 2026-05-16: ActionSheet 는 BottomSheet variant — 하단 native scrim 비활성(`bottom: false`).
  //   SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(isOpen, '#73141826', { bottom: false });

  // ESC 키 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // body scroll lock — 시트 열릴 때 배경 스크롤 방지
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="overlay-fullscreen-wrapper items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={handleOverlayClick}
    >
      {/* Overlay — viewport 전체 (status bar / appbar / bottom nav 위) */}
      <div
        className="overlay-fullscreen-dim-sheet animate-overlay-in motion-reduce:animate-none"
        aria-hidden="true"
      />

      {/* Sheet — 화면 바깥에서 자연스럽게 슬라이드 업 */}
      <div
        className="relative w-full max-w-md bg-white dark:bg-rink-800 rounded-t-2xl shadow-md animate-sheet-up motion-reduce:animate-none"
        style={{ paddingBottom: 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle */}
        <div
          className="w-12 h-1 bg-wline dark:bg-rink-500 rounded-full mx-auto mt-3"
          aria-hidden="true"
        />

        {/* Menu Items */}
        <nav className="p-4 space-y-1" aria-label={`${title} 메뉴`}>
          {items.map((item, index) => {
            const isDanger = item.danger;
            const iconBg = item.iconBg ?? (isDanger
              ? 'bg-red-50 dark:bg-red-900/20'
              : 'bg-blue-50 dark:bg-blue-900/20');
            const iconColor = item.iconColor ?? (isDanger
              ? 'text-red-500'
              : 'text-ice-500');
            const labelColor = item.labelColor ?? (isDanger
              ? 'text-red-600 dark:text-red-400'
              : 'text-wtext-1 dark:text-white');

            return (
              <button
                key={index}
                type="button"
                onClick={item.onClick}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-wbg dark:hover:bg-rink-700 transition-colors active:brightness-95"
              >
                <div
                  className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}
                >
                  <Icon
                    name={item.icon}
                    className={`${iconColor} text-lg`}
                    aria-hidden="true"
                  />
                </div>
                <span className={`font-medium ${labelColor}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Cancel */}
        <div className="border-t border-wline-2 dark:border-rink-700">
          <button
            onClick={onClose}
            className="w-full p-4 text-center text-wtext-3 dark:text-rink-300 font-medium hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors active:brightness-95"
          >
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
