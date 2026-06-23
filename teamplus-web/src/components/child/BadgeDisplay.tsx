'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

/**
 * BadgeDisplay - 뱃지 표시 컴포넌트 (획득/미획득 상태)
 *
 * child 대시보드의 뱃지 그리드와 badges 페이지에서 공통 사용.
 * 획득 시 amber 배경 + 이모지 wiggle 애니메이션,
 * 미획득 시 dashed 테두리 + 자물쇠 아이콘.
 *
 * WCAG AAA: 7:1 대비율, 충분한 텍스트 크기
 */

export const RARITY_EMOJI: Record<string, string> = {
  legendary: '\uD83C\uDFC6',
  epic: '\uD83D\uDC9C',
  rare: '\uD83D\uDC8E',
  uncommon: '\u2B50',
  common: '\uD83E\uDD47',
};

interface BadgeDisplayProps {
  /** 뱃지 이모지 (또는 rarity 기반 자동 매핑) */
  emoji?: string;
  /** 뱃지 이름 */
  label: string;
  /** 획득 여부 */
  earned: boolean;
  /** 뱃지 rarity (emoji 미지정 시 자동 매핑) */
  rarity?: string;
  /** 이미지 URL (이모지 대신 이미지 사용 시) */
  iconUrl?: string | null;
  /** 뱃지 설명 */
  description?: string | null;
  /** 크기 변형 */
  size?: 'sm' | 'md' | 'lg';
  /** 추가 className */
  className?: string;
}

const SIZE_STYLES = {
  sm: {
    container: 'min-h-[80px]',
    emoji: 'text-3xl',
    icon: 'text-2xl',
    // [WCAG AAA Task #4] text-card-meta-child(14) → text-card-title-child(17-18px) — 아동 4-7세 가독성.
    label: 'text-card-title-child',
    image: 'w-12 h-12',
  },
  md: {
    container: 'min-h-[100px]',
    emoji: 'text-4xl',
    icon: 'text-3xl',
    // [WCAG AAA Task #4] text-card-body-child(14-15) → text-card-title-child(17-18px) — 아동 4-7세 가독성.
    label: 'text-card-title-child',
    image: 'w-16 h-16',
  },
  lg: {
    container: 'min-h-[180px]',
    emoji: 'text-5xl',
    icon: 'text-4xl',
    label: 'text-card-section-child',
    image: 'w-20 h-20',
  },
};

export const BadgeDisplay = memo(function BadgeDisplay({
  emoji,
  label,
  earned,
  rarity,
  iconUrl,
  description,
  size = 'md',
  className = '',
}: BadgeDisplayProps) {
  const resolvedEmoji = emoji ?? (rarity ? RARITY_EMOJI[rarity] : undefined) ?? '\uD83E\uDD47';
  const styles = SIZE_STYLES[size];

  // [\uCD94\uAC00 2026-05-16] \uC7A0\uAE08\uD574\uC81C \uC140\uB7EC\uBE0C\uB808\uC774\uC158 \u2014 earned prop \uBCC0\uACBD (false \u2192 true) \uAC10\uC9C0 \uC2DC
  //   800ms \uB3D9\uC548 bounce + scale + \u2728 confetti fade-in. WCAG: motion-reduce \uC2DC \uC790\uB3D9 \uBE44\uD65C\uC131.
  const prevEarnedRef = useRef<boolean>(earned);
  const [isCelebrating, setIsCelebrating] = useState(false);
  useEffect(() => {
    if (!prevEarnedRef.current && earned) {
      setIsCelebrating(true);
      const t = setTimeout(() => setIsCelebrating(false), 800);
      prevEarnedRef.current = earned;
      return () => clearTimeout(t);
    }
    prevEarnedRef.current = earned;
  }, [earned]);

  if (!earned) {
    // WCAG AAA (7:1 대비) 준수 미획득 뱃지.
    // 기존: slate-50 bg + slate-300 icon → 4.2:1 (AAA 미달).
    // 수정: slate-100 bg + slate-700 icon → 11.4:1 (AAA 충족).
    // "다음" → "잠김" 으로 명확화 (아동에게 더 직관적인 상태 표현).
    return (
      <div
        className={cn(
          'flex-1 aspect-square rounded-2xl flex flex-col items-center justify-center gap-1',
          'bg-wline-2 dark:bg-rink-800 border-2 border-dashed border-wline dark:border-rink-300',
          styles.container,
          className,
        )}
        role="img"
        aria-label={`잠긴 뱃지: ${label}`}
      >
        <Icon
          name="lock"
          className={cn(styles.icon, 'text-wtext-2 dark:text-rink-100')}
          aria-hidden="true"
        />
        <span
          className={cn(
            styles.label,
            'font-bold text-wtext-2 dark:text-rink-100',
          )}
        >
          잠김
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex-1 aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 border transition-all',
        'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700',
        // [추가 2026-05-16] 셀러브레이션: 800ms bounce + scale-110, motion-reduce 시 비활성.
        isCelebrating && 'animate-bounce scale-110 motion-reduce:animate-none motion-reduce:scale-100',
        styles.container,
        className,
      )}
      role="img"
      aria-label={`획득한 뱃지: ${label}`}
    >
      {resolveImageSrc(iconUrl) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveImageSrc(iconUrl)}
          alt={label}
          className={cn(styles.image, 'object-contain')}
        />
      ) : (
        <span className={styles.emoji}>{resolvedEmoji}</span>
      )}
      <span
        className={cn(
          styles.label,
          'font-bold text-wtext-1 dark:text-rink-100 text-center leading-tight px-1',
        )}
      >
        {label}
      </span>
      {description && (
        // [WCAG AAA Task #4 final] text-card-body-child(14-15px WCAG 미달) → text-card-title-child(17-18px+) — 아동 4-7세 가독성.
        <span className="text-card-title-child font-normal text-center line-clamp-2 px-1">
          {description}
        </span>
      )}
      {/* [추가 2026-05-16] ✨ confetti fade-in — 셀러브레이션 중에만 노출 */}
      {isCelebrating && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-1 -left-1 text-2xl animate-pulse motion-reduce:animate-none"
          >
            ✨
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-1 -right-1 text-2xl animate-pulse motion-reduce:animate-none"
          >
            ✨
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-1 -right-1 text-xl animate-pulse motion-reduce:animate-none"
          >
            🎉
          </span>
        </>
      )}
    </div>
  );
});
