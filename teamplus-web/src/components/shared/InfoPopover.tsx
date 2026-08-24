'use client';

/**
 * InfoPopover - TEAMPLUS Shared Component
 * 트리거(배지·라벨)를 탭하면 바로 아래에 작은 말풍선으로 설명을 띄우는 정보 팝오버.
 * toast 는 행위 결과 알림 용도라 "이 배지가 무슨 뜻인지" 류 정보 설명에는 앵커 근처
 * 인라인 말풍선이 맞다 (2026-08-24 사용자 결정). 사용 화면: 공지 상세 2종의 대상 배지.
 *
 * 동작: 탭 토글 · 바깥 탭/ESC 닫기 · 3초 후 자동 닫힘.
 * 접근성: 트리거 aria-expanded + aria-label(설명 전문), 말풍선 role="tooltip" + aria-describedby.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** 열림 유지 시간(ms) — 짧은 한 줄 설명을 읽기에 충분한 길이 */
const AUTO_CLOSE_MS = 3000;

export interface InfoPopoverProps {
  /** 말풍선에 표시할 설명 문구 (트리거 aria-label 로도 전달) */
  description: string;
  /** 트리거 버튼 내용 (배지 span 등) */
  children: React.ReactNode;
  /** 트리거 버튼 추가 className */
  className?: string;
}

export function InfoPopover({ description, children, className }: InfoPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  const close = useCallback(() => setIsOpen(false), []);

  // 바깥 탭·ESC 닫기 + 자동 닫힘 — 열려 있는 동안만 리스너/타이머 유지
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const timer = window.setTimeout(close, AUTO_CLOSE_MS);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, close]);

  return (
    <span ref={rootRef} className="relative inline-flex max-w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={description}
        aria-describedby={isOpen ? tooltipId : undefined}
        className={cn(
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 rounded-w-md',
          className,
        )}
      >
        {children}
      </button>
      {isOpen && (
        <span
          role="tooltip"
          id={tooltipId}
          className="absolute left-0 top-full z-30 mt-2 w-max max-w-[min(260px,70vw)] rounded-w-md bg-it-ink-800 dark:bg-rink-700 px-3 py-2 text-left text-[12.5px] font-medium leading-snug text-white shadow-sh-2 animate-fade-in motion-reduce:animate-none"
        >
          {/* 꼬리(caret) — 트리거를 가리키는 작은 마름모 */}
          <span
            aria-hidden="true"
            className="absolute -top-1 left-4 h-2 w-2 rotate-45 bg-it-ink-800 dark:bg-rink-700"
          />
          {description}
        </span>
      )}
    </span>
  );
}

export default InfoPopover;
