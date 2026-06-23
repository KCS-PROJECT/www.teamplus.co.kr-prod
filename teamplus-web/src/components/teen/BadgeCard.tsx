'use client';

import { Icon } from '@/components/ui/Icon';
import { resolveImageSrc } from '@/lib/image-url';

export interface BadgeData {
  id: string;
  name: string;
  iconUrl: string | null;
  isUnlocked: boolean;
  description?: string | null;
  rarity: string;
  earnedAt?: string;
}

const RARITY_EMOJI: Record<string, string> = {
  legendary: '',
  epic: '',
  rare: '',
  uncommon: '',
  common: '',
};

interface BadgeCardProps {
  badge: BadgeData;
  /** 카드 크기 변형 (기본: 'default', 대시보드 미리보기용: 'compact') */
  variant?: 'default' | 'compact';
}

/**
 * 뱃지 카드 컴포넌트
 * - default: badges 목록 페이지용 (큰 사이즈, 설명 포함)
 * - compact: 대시보드 미리보기용 (작은 사이즈, 이름만)
 */
export function BadgeCard({ badge, variant = 'default' }: BadgeCardProps) {
  const emoji = RARITY_EMOJI[badge.rarity] ?? '';

  // 잠금 상태
  if (!badge.isUnlocked) {
    if (variant === 'compact') {
      return (
        <div className="flex-1 flex flex-col items-center gap-2 py-3 rounded-xl bg-wbg dark:bg-rink-800 border border-dashed border-wline dark:border-rink-700">
          <div className="w-10 h-10 rounded-lg bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
            <Icon
              name="lock"
              className="text-lg text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </div>
          <span className="text-xs font-bold text-wtext-3 dark:text-rink-300">
            ???
          </span>
        </div>
      );
    }

    return (
      <div className="bg-white dark:bg-rink-800 rounded-2xl border-2 border-wline dark:border-rink-700 p-4 flex flex-col items-center min-h-[180px]">
        <div className="w-24 h-24 bg-wline-2 dark:bg-rink-700 rounded-xl flex items-center justify-center border-2 border-dashed border-wline dark:border-rink-700">
          <Icon
            name="lock"
            className="text-4xl text-wtext-3 dark:text-rink-300"
            aria-hidden="true"
          />
        </div>
        <span className="mt-3 text-lg font-bold text-wtext-3 dark:text-rink-300">
          ???
        </span>
      </div>
    );
  }

  // compact 변형 (대시보드 미리보기)
  if (variant === 'compact') {
    return (
      <div className="flex-1 flex flex-col items-center gap-2 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
        <span className="text-3xl">{emoji}</span>
        <span className="text-xs font-bold text-wtext-2 dark:text-rink-100 text-center leading-tight">
          {badge.name}
        </span>
      </div>
    );
  }

  // default 변형 (전체 목록)
  return (
    <div className="bg-white dark:bg-rink-800 rounded-2xl border-2 border-ice-500 p-4 flex flex-col items-center min-h-[180px] relative">
      <div className="w-24 h-24 bg-wbg dark:bg-rink-700 rounded-xl flex items-center justify-center border-2 border-dashed border-ice-500/30 overflow-hidden">
        {resolveImageSrc(badge.iconUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageSrc(badge.iconUrl)}
            alt={badge.name}
            className="w-20 h-20 object-contain"
          />
        ) : (
          <span className="text-5xl">{emoji}</span>
        )}
      </div>
      <span className="mt-3 text-lg font-bold text-ice-500">{badge.name}</span>
      {badge.description && (
        <span className="mt-1 text-xs text-wtext-3 dark:text-rink-300 text-center line-clamp-2">
          {badge.description}
        </span>
      )}
      {/* 획득 체크마크 */}
      <div className="absolute top-3 right-3 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
        <Icon
          name="check"
          className="text-sm text-white"
          aria-label="획득 완료"
        />
      </div>
    </div>
  );
}
