import { cn } from '@/lib/utils';

/**
 * StoreBadge — App Store / Google Play 다운로드 배지 버튼
 *
 * 마케팅 랜딩(teamplus-home) 전용. 전 세계 공통 인지 형태(배지 + 플랫폼 로고 + 2줄 텍스트)를
 * 페이지 표면 톤에 맞춰 렌더한다.
 * - tone="dark": 밝은 표면(wbg)용 다크 배지 + 흰색 글리프 (Hero)
 * - tone="light": 어두운 표면(rink-900)용 화이트 배지 + 다크 글리프 (Final CTA) — Apple 배지 가이드 준수
 *
 * 스토어 링크는 출시 후 연결되므로 href 가 비어 있으면 비활성(non-navigable) 상태로 렌더한다.
 */

type StoreKey = 'apple' | 'google';
type Tone = 'dark' | 'light';

const STORE_META: Record<StoreKey, { caption: string; label: string; aria: string }> = {
  apple: {
    caption: 'Download on the',
    label: 'App Store',
    aria: 'App Store에서 TEAMPLUS 다운로드',
  },
  google: {
    caption: 'GET IT ON',
    label: 'Google Play',
    aria: 'Google Play에서 TEAMPLUS 다운로드',
  },
};

const TONE: Record<Tone, { badge: string; caption: string }> = {
  dark: {
    badge:
      'bg-rink-900 text-white ring-1 ring-white/10 shadow-sh-rink hover:bg-rink-puck focus-visible:ring-ice-400 focus-visible:ring-offset-wbg',
    caption: 'text-white/70',
  },
  light: {
    badge:
      'bg-white text-rink-900 ring-1 ring-rink-100 shadow-sh-2 hover:bg-rink-50 focus-visible:ring-ice-500 focus-visible:ring-offset-rink-900',
    caption: 'text-rink-500',
  },
};

function StoreIcon({ store }: { store: StoreKey }) {
  if (store === 'apple') {
    return (
      <svg
        viewBox="0 0 384 512"
        aria-hidden
        fill="currentColor"
        className="h-7 w-auto shrink-0"
      >
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 512 512" aria-hidden className="h-[26px] w-auto shrink-0">
      <path
        className="fill-accent-cyan"
        d="M47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0z"
      />
      <path
        className="fill-accent-emerald"
        d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"
      />
      <path
        className="fill-accent-amber"
        d="M472.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8z"
      />
      <path
        className="fill-accent-rose"
        d="M104.6 499l280.8-161.2-60.1-60.1L104.6 499z"
      />
    </svg>
  );
}

interface StoreBadgeProps {
  store: StoreKey;
  /** 스토어 링크. 비어 있으면 링크 비활성 상태로 렌더(출시 후 연결). */
  href?: string;
  /** 배지 톤 — 밝은 표면=dark(기본), 어두운 표면=light. */
  tone?: Tone;
  className?: string;
}

export function StoreBadge({ store, href, tone = 'dark', className }: StoreBadgeProps) {
  const meta = STORE_META[store];
  const t = TONE[tone];
  const isLinked = Boolean(href);

  return (
    <a
      href={href || undefined}
      {...(isLinked ? { target: '_blank', rel: 'noopener noreferrer' } : { 'aria-disabled': true })}
      aria-label={meta.aria}
      className={cn(
        'inline-flex items-center gap-3 rounded-2xl px-5 py-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none aria-disabled:cursor-default',
        t.badge,
        className,
      )}
    >
      <StoreIcon store={store} />
      <span className="flex flex-col items-start leading-none">
        <span className={cn('text-[10px] font-medium tracking-[0.08em]', t.caption)}>{meta.caption}</span>
        <span className="mt-0.5 text-[17px] font-semibold leading-tight">{meta.label}</span>
      </span>
    </a>
  );
}
