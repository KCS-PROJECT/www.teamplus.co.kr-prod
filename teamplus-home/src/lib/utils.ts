import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Accent = 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose' | 'ice';

/**
 * 라이트 카드 친화 액센트 토큰 — DESIGN.md SoT 준수
 * - 컬러 그림자(`shadow-*-500/30`) 제거 (RULE-1)
 * - 다크 배경 의존 제거 → 흰 카드(`bg-wsurface`) 위에서 작동
 * - 6 모듈을 시각적으로 구분하는 최소 컬러 다양성만 유지
 */
export const ACCENT_CLASSES: Record<
  Accent,
  { text: string; bg: string; ring: string; dot: string; soft: string }
> = {
  cyan: {
    text: 'text-cyan-700',
    bg: 'bg-cyan-50',
    ring: 'ring-cyan-200',
    dot: 'bg-cyan-500',
    soft: 'bg-cyan-100/60',
  },
  violet: {
    text: 'text-violet-700',
    bg: 'bg-violet-50',
    ring: 'ring-violet-200',
    dot: 'bg-violet-500',
    soft: 'bg-violet-100/60',
  },
  emerald: {
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    dot: 'bg-emerald-500',
    soft: 'bg-emerald-100/60',
  },
  amber: {
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    ring: 'ring-amber-200',
    dot: 'bg-amber-500',
    soft: 'bg-amber-100/60',
  },
  rose: {
    text: 'text-rose-700',
    bg: 'bg-rose-50',
    ring: 'ring-rose-200',
    dot: 'bg-rose-500',
    soft: 'bg-rose-100/60',
  },
  ice: {
    text: 'text-ice-700',
    bg: 'bg-ice-50',
    ring: 'ring-ice-100',
    dot: 'bg-ice-500',
    soft: 'bg-ice-100/70',
  },
};
