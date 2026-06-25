'use client';

import type { ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 full-bleed 흰 섹션(it-surface) + it-* 토큰. 박스 상하 구분선은 유지(섹션 경계).
   *   (현재 (common)/settings 화면만 전달.)
   */
  iceTheme?: boolean;
}

/**
 * 설정 화면 섹션 그룹 — 시안 07 SettingsSection 패턴.
 * 헤더 라벨(13px 700w) + white surface + 상하 구분선.
 */
export function SettingsSection({ title, children, iceTheme = false }: SettingsSectionProps) {
  // ICETIMES flat — 회색 캔버스 위 full-bleed 흰 섹션 + it-* 토큰 hairline 경계.
  if (iceTheme) {
    return (
      <section className="mt-2">
        <div className="px-5 pt-4 pb-2 text-[13px] font-bold tracking-[-0.01em] text-it-ink-500 dark:text-rink-100">
          {title}
        </div>
        <div className="bg-it-surface dark:bg-it-blue-950 border-y border-it-line dark:border-it-blue-900">
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-3">
      <div className="px-5 pt-4 pb-2 text-[13px] font-bold tracking-[-0.01em] text-rink-700 dark:text-rink-100">
        {title}
      </div>
      <div className="bg-white dark:bg-rink-800 border-y border-wline-2 dark:border-rink-700">
        {children}
      </div>
    </section>
  );
}
