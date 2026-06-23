/**
 * 뱃지/스티커 등급(Rarity) 색상 SoT
 *
 * Badge.rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
 * 등급별 시각 톤을 단일 정의해 stickers/badges/wallet/membership 화면이 동일한 색을 쓰도록 한다.
 *
 * 사용 예:
 *   import { RARITY_PILL_CLASS, RARITY_EMOJI, type Rarity } from '@/lib/rarity-colors';
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** 뱃지/카드 pill (배경 + 텍스트 + 보더 + dark 변형) */
export const RARITY_PILL_CLASS: Record<Rarity, string> = {
  common:    'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  uncommon:  'bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  rare:      'bg-violet-100 text-violet-600 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800',
  epic:      'bg-orange-100 text-orange-500 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800',
  legendary: 'bg-red-100 text-red-500 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
};

/** 등급 한글 라벨 */
export const RARITY_LABEL: Record<Rarity, string> = {
  common:    '일반',
  uncommon:  '특별',
  rare:      '희귀',
  epic:      '영웅',
  legendary: '전설',
};

/** 등급 emoji (recentBadges fallback 등) */
export const RARITY_EMOJI: Record<Rarity, string> = {
  common:    '🎖️',
  uncommon:  '🥉',
  rare:      '🥈',
  epic:      '🥇',
  legendary: '🏆',
};

/** 안전 조회 — 알 수 없는 값은 common 으로 폴백 */
export function getRarityPill(rarity?: string | null): string {
  if (!rarity) return RARITY_PILL_CLASS.common;
  return RARITY_PILL_CLASS[rarity as Rarity] ?? RARITY_PILL_CLASS.common;
}
