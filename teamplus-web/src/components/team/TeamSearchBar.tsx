'use client';

/**
 * TeamSearchBar — 둥근 검색 입력
 *
 * 레퍼런스: 사용자 제공 HTML "팀 목록 🏀" Search Section
 * - h-11 rounded-xl bg-wline-2 + focus 시 border-ice-500
 * - 좌측 search 아이콘
 */

import { Icon } from '@/components/ui/Icon';

interface TeamSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** 접근성 레이블 (기본: placeholder) */
  ariaLabel?: string;
}

export function TeamSearchBar({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: TeamSearchBarProps) {
  return (
    <label className="relative block">
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-wtext-3 dark:text-rink-300"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border-2 border-transparent bg-wline-2 pl-10 pr-4 text-sm font-medium text-wtext-1 placeholder:text-wtext-3 focus:border-ice-500 focus:bg-white focus:outline-none dark:bg-rink-700 dark:text-white dark:placeholder:text-wtext-3 dark:focus:bg-rink-800"
        aria-label={ariaLabel ?? placeholder}
      />
    </label>
  );
}
