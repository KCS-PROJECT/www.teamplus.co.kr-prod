'use client';

import { ReactNode } from 'react';

/**
 * AlertBanner — B3 "서명할 문서 N건이 있어요" 같은 안내 strip
 *
 * 좌측 원형 아이콘 + 본문 + chevron
 */
export interface AlertBannerProps {
  icon?: ReactNode;
  /** 본문 (highlight 부분은 별도 prop) */
  body: ReactNode;
  onClick?: () => void;
  /** 아이콘 박스 배경/색상 (기본 ice 톤) */
  iconBg?: string;
  iconColor?: string;
}

export function AlertBanner({
  icon,
  body,
  onClick,
  iconBg = 'var(--c-ice-50)',
  iconColor = 'var(--c-ice-600)',
}: AlertBannerProps) {
  return (
    <div className="px-3 sm:px-5 pt-3">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center w-full bg-wsurface dark:bg-rink-800 text-left border-0 rounded-[14px] gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 sm:py-3.5 shadow-[0_1px_3px_rgba(20,24,38,0.04)]"
      >
        <div
          className="grid place-items-center w-8 h-8 sm:w-9 sm:h-9 rounded-full shrink-0"
          style={{
            background: iconBg,
            color: iconColor,
          }}
        >
          {icon ?? <DefaultInfoIcon color={iconColor} />}
        </div>
        <div className="flex-1 min-w-0 text-wtext-2 dark:text-rink-100 font-semibold text-[12px] sm:text-[13px] tracking-[-0.02em] break-keep">
          {body}
        </div>
        <svg
          viewBox="0 0 24 24"
          stroke="var(--c-text-4)"
          strokeWidth="2"
          fill="none"
          className="w-3.5 h-3.5 shrink-0"
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
    </div>
  );
}

function DefaultInfoIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      stroke={color}
      strokeWidth="2"
      fill="none"
      className="w-4 h-4 sm:w-[18px] sm:h-[18px]"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h0.01" />
    </svg>
  );
}
