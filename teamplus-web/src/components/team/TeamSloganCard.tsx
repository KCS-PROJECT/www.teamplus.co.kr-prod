'use client';

/**
 * TeamSloganCard — 팀 슬로건 인용 카드
 *
 * 레퍼런스: 사용자 제공 HTML "팀 상세 정보" Team Slogan 섹션
 * - primary/5 배경 + primary/10 테두리
 * - italic 인용 (gradient 금지)
 */

import { MESSAGES } from '@/lib/messages';

interface TeamSloganCardProps {
  /** 슬로건 문구. 없으면 fallback 사용. */
  slogan?: string | null;
  /** fallback 활성화 여부 (기본 true) */
  useFallback?: boolean;
}

export function TeamSloganCard({
  slogan,
  useFallback = true,
}: TeamSloganCardProps) {
  const text =
    (slogan && slogan.trim()) ||
    (useFallback ? MESSAGES.team.sloganFallback : null);

  if (!text) return null;

  return (
    <section
      className="rounded-2xl border border-ice-500/10 bg-ice-500/5 p-5 dark:border-ice-500/30 dark:bg-ice-500/10"
      aria-label={MESSAGES.team.ariaSloganRegion}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className="inline-block h-5 w-1 rounded-full bg-ice-500"
          aria-hidden="true"
        />
        <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
          {MESSAGES.team.slogan}
        </h3>
      </div>
      <blockquote className="text-card-title italic leading-relaxed text-ice-500 dark:text-blue-200">
        &ldquo;{text}&rdquo;
      </blockquote>
    </section>
  );
}
