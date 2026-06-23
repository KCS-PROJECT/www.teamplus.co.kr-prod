'use client';

/**
 * SelectedChildDisplay — 선택된 자녀를 readonly 로 표시하는 카드.
 *
 * [생성 2026-05-18] 자녀 선택 단일 진입점 통일.
 *   - 수업 상세 페이지(/classes/[id]) 의 ChildSelector 에서 선택한 자녀가
 *     결제 옵션 페이지(/payment/options) 에 readonly 로 표시된다.
 *   - 변경하려면 이전 단계로 돌아가야 함 (helper 텍스트로 안내).
 *
 * 디자인 규칙 (CLAUDE.md / DESIGN.md):
 *  - gradient / backdrop-blur / 컬러 그림자 사용 금지.
 *  - dark: 변형 필수.
 *  - 토큰만 사용 (wline-2, rink-700, wtext-3, ice-500 등).
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import type { Child } from '@/components/children/ChildCard';

interface SelectedChildDisplayProps {
  child: Child | undefined;
  /** 헬퍼 문구 (기본: "수강생을 변경하려면 이전 단계로 돌아가세요") */
  helperText?: string;
}

export function SelectedChildDisplay({
  child,
  helperText = MESSAGES.enrollment.selectedChildHelper,
}: SelectedChildDisplayProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 px-4 py-3"
      role="group"
      aria-label={MESSAGES.enrollment.selectedChildAriaLabel}
    >
      {/* Avatar — person 아이콘 placeholder (이미지 미사용 통일) */}
      <div
        className="relative size-12 shrink-0 rounded-w-pill bg-wline dark:bg-rink-700 flex items-center justify-center"
        aria-hidden="true"
      >
        <Icon name="person" className="text-2xl text-wtext-3" />
        {/* lock 배지 — readonly 표시 */}
        <div className="absolute -bottom-0.5 -right-0.5 size-5 rounded-w-pill bg-wtext-3 dark:bg-rink-300 text-white dark:text-rink-900 flex items-center justify-center shadow-sm">
          <Icon name="lock" className="text-[11px]" aria-hidden="true" />
        </div>
      </div>

      {/* Name + Helper */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-wtext-3 dark:text-rink-300">
          {MESSAGES.enrollment.studentLabel}
        </span>
        <span className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
          {child ? child.name : MESSAGES.enrollment.selectedChildLoading}
        </span>
        <span className="text-card-meta text-wtext-3 dark:text-rink-300 leading-snug">
          {helperText}
        </span>
      </div>
    </div>
  );
}
