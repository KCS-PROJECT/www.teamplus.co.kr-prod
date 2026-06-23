'use client';

import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { MESSAGES } from '@/lib/messages';

/**
 * BottomSheetSelector — TEAMPLUS 리스트형 단일 선택 바텀시트 (Phase 2 P3)
 *
 * 빙상장·자녀·결제수단 등 단일 선택 컨텍스트에서 사용한다.
 * Wallet v2 토큰(`bg-wsurface`/`bg-rink-800`/`text-w-title`/`shadow-sh-rink`)을
 * 사용해 기존 `BottomSheet`(slate 톤) 와는 별도의 결제·금융 컨텍스트 시트로
 * 디자인 시스템상 분리한다.
 *
 * - AI 스타일 금지: 그라디언트·블러·컬러 그림자 없음 (`shadow-sh-rink` 는
 *   디자인 토큰화된 중성 그림자로 SoT 준수)
 * - createPortal 로 MobileContainer overflow-hidden 클리핑 우회
 * - ESC 키 + 오버레이 클릭으로 close
 * - 애니메이션: 시트는 `animate-sheet-up`, 오버레이는 `animate-overlay-in`
 * - body 스크롤 잠금: `lockBodyScroll()` (reference-counted)
 *
 * @example
 * <BottomSheetSelector
 *   isOpen={isOpen}
 *   title="빙상장을 선택해주세요."
 *   items={[
 *     { id: 'mokdong', name: '목동 아이스링크', sub: '서울 양천구', selected: true },
 *     { id: 'jamsil',  name: '잠실 아이스링크', sub: '서울 송파구' },
 *   ]}
 *   onSelect={(id) => handleSelect(id)}
 *   onClose={() => setIsOpen(false)}
 * />
 */
export interface BottomSheetSelectorItem<T extends string | number> {
  /** 고유 식별자 (string 또는 number) */
  id: T;
  /** 표시 이름 (text-w-body font-semibold) */
  name: string;
  /** 보조 설명 (text-w-caption text-wtext-4) */
  sub?: string;
  /** 좌측 아이콘 (Material Symbols ligature 이름, 선택 사항) */
  icon?: string;
  /** 현재 선택 여부 — true 일 때 ✓ 아이콘 표시 */
  selected?: boolean;
  /** 비활성화 여부 — opacity-40 + cursor-not-allowed */
  disabled?: boolean;
}

export interface BottomSheetSelectorProps<T extends string | number> {
  /** 시트 표시 여부 */
  isOpen: boolean;
  /** 시트 헤더 제목 */
  title: string;
  /** 선택 가능한 항목 리스트 */
  items: BottomSheetSelectorItem<T>[];
  /** 항목 선택 콜백 */
  onSelect: (id: T) => void;
  /** 닫기 핸들러 (X 버튼 / ESC / 오버레이 클릭) */
  onClose: () => void;
  /** 추가 클래스명 (시트 컨테이너) */
  className?: string;
  /** 접근성 라벨 (생략 시 title 사용) */
  ariaLabel?: string;
}

export function BottomSheetSelector<T extends string | number>({
  isOpen,
  title,
  items,
  onSelect,
  onClose,
  className,
  ariaLabel,
}: BottomSheetSelectorProps<T>): ReactElement | null {
  // Portal 마운트 여부 (SSR 대응)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // body scroll lock — Modal/BottomSheet 와 동일한 reference-counted 유틸 사용
  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [isOpen]);

  // [2026-05-12 → 2026-05-16 v2] 네이티브 status bar 영역만 dim — BottomSheet 는 화면
  //   하단까지 시트 카드가 차지하므로 하단 native scrim 비활성(`bottom: false`) 으로
  //   하단 dim 이 시트 카드 위에 덮이는 시각 버그 회피.
  //   BottomSheet 표준 AARRGGBB = '#73141826' (rink-900 / 45%) — SPEC §2.4
  //   SoT: docs/Design/MODAL_DIM_POLICY.md (BottomSheet 패턴)
  useNativeScrim(isOpen, '#73141826', { bottom: false });

  const handleOverlayClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleSelect = useCallback(
    (id: T, disabled?: boolean) => {
      if (disabled) return;
      onSelect(id);
    },
    [onSelect],
  );

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="overlay-fullscreen-wrapper items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      onClick={handleOverlayClick}
    >
      {/* 오버레이 — viewport 전체(status bar / home indicator) dim, SPEC 2026-05-16 SoT */}
      <div
        className="overlay-fullscreen-dim-sheet animate-overlay-in motion-reduce:animate-none"
        aria-hidden="true"
      />

      {/* 시트 본체 — 화면 바깥에서 자연스럽게 슬라이드 업 */}
      <div
        className={cn(
          'relative pointer-events-auto flex w-full max-w-md flex-col rounded-t-w-2xl bg-wsurface shadow-sh-rink animate-sheet-up dark:bg-rink-800 motion-reduce:animate-none',
          className,
        )}
        style={{ maxHeight: '70vh', paddingBottom: 32 }}
      >
        {/* 그랩 핸들 — 40x4 rounded */}
        <div
          className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-wline dark:bg-rink-700"
          aria-hidden="true"
        />

        {/* 헤더 — 제목 + X 버튼 */}
        <div className="flex items-center justify-between px-6 pb-1.5 pt-4">
          <h2 className="text-w-title font-bold tracking-tight text-wtext-1 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={MESSAGES.common.close}
            className="flex size-8 shrink-0 items-center justify-center text-wtext-2 transition-colors hover:text-wtext-1 dark:text-rink-100 dark:hover:text-white"
          >
            <Icon name="close" className="text-[20px]" aria-hidden="true" />
          </button>
        </div>

        {/* 리스트 (스크롤 영역) */}
        <ul
          className="hide-scrollbar flex-1 overflow-y-auto pt-2"
          role="listbox"
          aria-label={ariaLabel ?? title}
        >
          {items.map((item) => {
            const isSelected = !!item.selected;
            const isDisabled = !!item.disabled;
            return (
              <li
                key={String(item.id)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={isDisabled || undefined}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(item.id, isDisabled)}
                  disabled={isDisabled}
                  className={cn(
                    'flex w-full items-center gap-3 px-6 py-4 text-left transition-colors',
                    isDisabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-wbg active:bg-wline-2 dark:hover:bg-rink-700/40 dark:active:bg-rink-700/60',
                  )}
                >
                  {item.icon && (
                    <Icon
                      name={item.icon}
                      className={cn(
                        'shrink-0 text-[20px]',
                        isSelected
                          ? 'text-ice-500'
                          : 'text-wtext-3 dark:text-rink-300',
                      )}
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        'text-w-body font-semibold tracking-tight',
                        isSelected
                          ? 'text-ice-600 dark:text-ice-300'
                          : 'text-wtext-1 dark:text-white',
                      )}
                    >
                      {item.name}
                    </span>
                    {item.sub && (
                      <span className="text-w-caption text-wtext-4 dark:text-rink-300">
                        {item.sub}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Icon
                      name="check"
                      className="shrink-0 text-[22px] text-ice-500"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

export default BottomSheetSelector;
