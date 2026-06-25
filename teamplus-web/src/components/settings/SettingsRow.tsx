'use client';

import type { ReactNode } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface SettingsRowBaseProps {
  /** Material icon name 또는 ReactNode */
  icon?: string;
  label: string;
  /** 라벨 아래 보조 설명 (11px, text-3) */
  sub?: string;
  /** 우측 표시 값 (예: "한국어", "1시간 전") */
  value?: ReactNode;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 it-* 토큰 hairline 행 + it-blue 아이콘. (현재 (common)/settings 화면만 전달.)
   */
  iceTheme?: boolean;
}

interface SettingsRowLinkProps extends SettingsRowBaseProps {
  href: string;
  onClick?: never;
}

interface SettingsRowButtonProps extends SettingsRowBaseProps {
  href?: never;
  onClick: () => void;
}

type SettingsRowProps = SettingsRowLinkProps | SettingsRowButtonProps;

/**
 * 설정 행 — 시안 07 Row 패턴.
 * 좌측 32×32 ice50/ice600 아이콘 (선택) → 라벨 + sub → 우측 value + chevron.
 * NavLink 또는 button 둘 다 지원.
 */
export function SettingsRow(props: SettingsRowProps) {
  const ice = props.iceTheme === true;

  const inner = (
    <div
      className={cn(
        'flex items-center gap-3 px-5 py-4 [&:not(:first-child)]:border-t',
        ice
          ? 'border-it-line dark:border-it-blue-900'
          : 'border-wline-2 dark:border-rink-700/60',
      )}
    >
      {props.icon ? (
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-[10px]',
            ice
              ? 'bg-it-blue-500/10 text-it-blue-500 dark:bg-it-blue-500/20 dark:text-it-blue-300'
              : 'bg-ice-500/10 text-ice-500 dark:bg-ice-500/20 dark:text-blue-300',
          )}
        >
          <Icon name={props.icon} className="text-[18px]" aria-hidden="true" />
        </div>
      ) : null}

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-[14px] font-semibold tracking-[-0.01em]',
            ice ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
          )}
        >
          {props.label}
        </p>
        {props.sub ? (
          <p
            className={cn(
              'mt-0.5 text-[11px] leading-[1.4]',
              ice ? 'text-it-ink-400 dark:text-rink-300' : 'text-wtext-3 dark:text-rink-300',
            )}
          >
            {props.sub}
          </p>
        ) : null}
      </div>

      {props.value !== undefined ? (
        <span
          className={cn(
            'text-[13px] font-medium',
            ice ? 'text-it-ink-600 dark:text-rink-100' : 'text-wtext-2 dark:text-rink-100',
          )}
        >
          {props.value}
        </span>
      ) : null}

      <Icon
        name="chevron_right"
        className={cn(
          'text-[18px]',
          ice ? 'text-it-ink-300 dark:text-rink-300' : 'text-wtext-4 dark:text-rink-300',
        )}
        aria-hidden="true"
      />
    </div>
  );

  const hoverClass = ice
    ? 'hover:bg-it-fill dark:hover:bg-it-blue-900/40 focus-visible:bg-it-fill dark:focus-visible:bg-it-blue-900/40'
    : 'hover:bg-wbg dark:hover:bg-rink-700/40 focus-visible:bg-wbg dark:focus-visible:bg-rink-700/40';

  if ('href' in props && props.href) {
    return (
      <NavLink
        href={props.href}
        className={cn(
          'block w-full transition-colors motion-reduce:transition-none focus:outline-none',
          hoverClass,
        )}
      >
        {inner}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'block w-full text-left transition-colors motion-reduce:transition-none focus:outline-none',
        hoverClass,
      )}
    >
      {inner}
    </button>
  );
}
