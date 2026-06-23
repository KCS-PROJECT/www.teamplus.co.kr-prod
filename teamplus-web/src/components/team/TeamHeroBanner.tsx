'use client';

/**
 * TeamHeroBanner — 팀 상세 페이지 Hero 배너
 *
 * TEAMPLUS 디자인 7원칙 준수:
 *  - AI 스타일 금지: gradient / backdrop-blur 0건 (solid overlay 사용)
 *  - 휴먼 디자인: primaryColor 기반 solid 배경 + 실제 데이터
 *  - 다크모드 대응
 *
 * 레퍼런스: 사용자 제공 HTML "팀 상세 정보" Hero Banner 섹션
 */

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';

export interface TeamHeroBannerProps {
  /** 팀명 */
  name: string;
  /** Primary color (background) — 없으면 #1E3FAE */
  primaryColor?: string | null;
  /** 로고 URL (있으면 배경에 30% opacity 로 오버레이) */
  logoUrl?: string | null;
  /** 위치 뱃지 (우상단) */
  location?: string | null;
  /** 서브 타이틀 (예: "팀플러스 주니어 A팀 · U12") */
  subtitle?: string | null;
  /** 리그 / 부문 태그 (예: "Since 2018 · 아마추어 리그") */
  tagline?: string | null;
  /** 우상단 액션 (예: 공유 버튼) */
  actions?: ReactNode;
}

export function TeamHeroBanner({
  name,
  primaryColor,
  logoUrl,
  location,
  subtitle,
  tagline,
  actions,
}: TeamHeroBannerProps) {
  const bg = primaryColor || '#1E3FAE';

  return (
    <section
      className="relative overflow-hidden rounded-2xl shadow-card"
      style={{ backgroundColor: bg }}
      aria-label={MESSAGES.team.ariaHeroRegion}
    >
      {/* 로고 배경 이미지 (30% opacity) */}
      {resolveImageSrc(logoUrl) && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={resolveImageSrc(logoUrl)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-25"
          aria-hidden="true"
        />
      )}
      {/* Solid dark overlay (NO gradient) */}
      <div
        className="absolute inset-0 bg-rink-900/45 dark:bg-puck/60"
        aria-hidden="true"
      />

      {/* [수정 2026-04-30] 사용자 요청 — Hero 배너 50% 축소.
          min-h 280→140, padding 6→3, 로고 14→10, 타이틀 2xl→base, 위치 배지 padding 축소. */}
      {/* 우상단 위치 배지 + actions */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        {location && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
            <Icon
              name="location_on"
              className="text-[12px]"
              aria-hidden="true"
            />
            <span>{location}</span>
          </span>
        )}
        {actions}
      </div>

      {/* 본문 — 절반 크기 */}
      <div className="relative flex min-h-[140px] flex-col justify-end p-3 pt-8">
        <div className="flex items-center gap-2">
          {/* 로고 박스 — 56→40 */}
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-md"
            aria-hidden="true"
          >
            <Icon name="sports_hockey" className="text-xl text-ice-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold leading-tight text-white">
              {name}
            </h1>
            {subtitle && (
              <p className="mt-0.5 truncate text-[11px] font-medium text-white/85">
                {subtitle}
              </p>
            )}
            {tagline && (
              <p className="truncate text-[10px] font-medium text-white/70">
                {tagline}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
