import { cn } from '@/lib/utils';

type Props = {
  /** faceoff: 페이스오프 서클 · lines: 블루라인/센터라인 · arc: 코너 보드 라인 */
  variant?: 'faceoff' | 'lines' | 'arc';
  className?: string;
};

/**
 * 아이스링크 마킹을 추상화한 브랜드 시그니처 모티프.
 * - 순수 stroke SVG (gradient·blur·glow 0) — PRODUCT.md / DESIGN.md 규칙 준수.
 * - 색·투명도는 부모의 `text-*` 로 제어 (currentColor). 항상 장식용(aria-hidden·pointer-events-none).
 * - 하키 "정제된 휴먼" 톤: 절제된 선 한 겹으로 정체성만 남긴다.
 */
export function RinkLines({ variant = 'faceoff', className }: Props) {
  const base = 'pointer-events-none select-none';

  if (variant === 'lines') {
    return (
      <svg
        aria-hidden
        viewBox="0 0 400 260"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        className={cn(base, className)}
      >
        {/* 블루라인 2줄 */}
        <line x1="132" y1="0" x2="132" y2="260" stroke="currentColor" strokeWidth="2" />
        <line x1="268" y1="0" x2="268" y2="260" stroke="currentColor" strokeWidth="2" />
        {/* 센터라인 (점선) */}
        <line x1="200" y1="0" x2="200" y2="260" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2 8" />
        {/* 센터 서클 */}
        <circle cx="200" cy="130" r="52" stroke="currentColor" strokeWidth="2" />
        <circle cx="200" cy="130" r="3.5" fill="currentColor" />
      </svg>
    );
  }

  if (variant === 'arc') {
    return (
      <svg aria-hidden viewBox="0 0 220 220" fill="none" className={cn(base, className)}>
        {/* 라운드 코너 보드 라인 (3겹) */}
        <path d="M220 8 H96 A88 88 0 0 0 8 96 V220" stroke="currentColor" strokeWidth="2" />
        <path d="M220 40 H120 A68 68 0 0 0 40 120 V220" stroke="currentColor" strokeWidth="1.5" />
        <path d="M220 78 H150 A48 48 0 0 0 78 150 V220" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2 7" />
      </svg>
    );
  }

  // faceoff — 페이스오프 서클 + 해시마크
  return (
    <svg aria-hidden viewBox="0 0 200 200" fill="none" className={cn(base, className)}>
      <circle cx="100" cy="100" r="94" stroke="currentColor" strokeWidth="2" />
      <circle cx="100" cy="100" r="60" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2 8" />
      <circle cx="100" cy="100" r="5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="74" y1="36" x2="74" y2="56" />
        <line x1="126" y1="36" x2="126" y2="56" />
        <line x1="74" y1="144" x2="74" y2="164" />
        <line x1="126" y1="144" x2="126" y2="164" />
      </g>
    </svg>
  );
}
