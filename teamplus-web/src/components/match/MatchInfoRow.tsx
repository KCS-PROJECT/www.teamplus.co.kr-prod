'use client';

import { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface MatchInfoRowProps {
  /** 구글 Material Symbols 아이콘 이름 (선택) */
  icon?: string;
  label: string;
  value: ReactNode;
  /** 강조 여부 — 참가비/레벨 같은 핵심 정보 */
  emphasize?: boolean;
  /** 마지막 행이면 bottom border 제거 */
  last?: boolean;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 hairline(it-line) 행 + it-* 톤. 부모는 흰 섹션(px-0 권장) 가정.
   */
  iceTheme?: boolean;
}

/**
 * 매치 정보 행 (key-value) — 상세 페이지 카드 내부 재사용.
 */
export function MatchInfoRow({ icon, label, value, emphasize, last, iceTheme = false }: MatchInfoRowProps) {
  // [ICETIMES] flat — hairline(it-line) 행 + it-* 토큰. 좌우 패딩 0(흰 섹션이 패딩 보유).
  if (iceTheme) {
    return (
      <div
        className={cn(
          'flex items-center justify-between py-[14px]',
          !last && 'border-b border-it-line dark:border-it-blue-900'
        )}
      >
        <span className="flex items-center gap-2 text-card-body text-it-ink-500 dark:text-it-ink-300">
          {icon && <Icon name={icon} className="text-base text-it-ink-400 dark:text-it-ink-300" />}
          {label}
        </span>
        <span
          className={cn(
            'text-right text-card-body',
            emphasize
              ? 'text-card-title font-bold text-it-blue-600 dark:text-it-blue-300'
              : 'font-semibold text-it-ink-800 dark:text-white'
          )}
        >
          {value}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between px-5 py-4',
        !last && 'border-b border-wline-2 dark:border-rink-700'
      )}
    >
      <span className="flex items-center gap-2 text-sm text-wtext-3 dark:text-rink-300">
        {icon && <Icon name={icon} className="text-base text-wtext-3 dark:text-rink-300" />}
        {label}
      </span>
      <span
        className={cn(
          'text-right text-sm',
          emphasize
            ? 'text-base font-bold text-ice-500 dark:text-blue-300'
            : 'font-medium text-wtext-1 dark:text-white'
        )}
      >
        {value}
      </span>
    </div>
  );
}
