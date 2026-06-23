'use client';

import type { ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

/**
 * 설정 화면 섹션 그룹 — 시안 07 SettingsSection 패턴.
 * 헤더 라벨(13px 700w) + white surface + 상하 구분선.
 */
export function SettingsSection({ title, children }: SettingsSectionProps) {
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
