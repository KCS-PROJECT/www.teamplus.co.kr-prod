'use client';

import type { ReactNode } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';

interface SettingsRowBaseProps {
  /** Material icon name 또는 ReactNode */
  icon?: string;
  label: string;
  /** 라벨 아래 보조 설명 (11px, text-3) */
  sub?: string;
  /** 우측 표시 값 (예: "한국어", "1시간 전") */
  value?: ReactNode;
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
  const inner = (
    <div className="flex items-center gap-3 px-5 py-4 [&:not(:first-child)]:border-t border-wline-2 dark:border-rink-700/60">
      {props.icon ? (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-ice-500/10 text-ice-500 dark:bg-ice-500/20 dark:text-blue-300">
          <Icon name={props.icon} className="text-[18px]" aria-hidden="true" />
        </div>
      ) : null}

      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold tracking-[-0.01em] text-wtext-1 dark:text-white">
          {props.label}
        </p>
        {props.sub ? (
          <p className="mt-0.5 text-[11px] leading-[1.4] text-wtext-3 dark:text-rink-300">
            {props.sub}
          </p>
        ) : null}
      </div>

      {props.value !== undefined ? (
        <span className="text-[13px] font-medium text-wtext-2 dark:text-rink-100">
          {props.value}
        </span>
      ) : null}

      <Icon
        name="chevron_right"
        className="text-[18px] text-wtext-4 dark:text-rink-300"
        aria-hidden="true"
      />
    </div>
  );

  if ('href' in props && props.href) {
    return (
      <NavLink
        href={props.href}
        className="block w-full hover:bg-wbg dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:bg-wbg dark:focus-visible:bg-rink-700/40"
      >
        {inner}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      className="block w-full text-left hover:bg-wbg dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:bg-wbg dark:focus-visible:bg-rink-700/40"
    >
      {inner}
    </button>
  );
}
