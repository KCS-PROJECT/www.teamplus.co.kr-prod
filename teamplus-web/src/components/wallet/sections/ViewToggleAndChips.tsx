'use client';

/**
 * ViewToggleAndChips — B1 탭 hero 위 view toggle + chip actions
 *
 * 가변형(fluid) 리팩토링 (2026-05-07):
 *   - inline px 고정값 → Tailwind 점진형
 *   - 좁은 화면(320px+)에서도 토글 + chip 두 개 한 줄 유지
 *   - chip 라벨이 길어져도 whitespace-nowrap + 점진형 padding
 *
 * 좌: 보기 토글(카드/리스트) — segmented
 * 우: 칩 액션 ("이용내역", "결제·계좌관리")
 */
export interface ViewToggleAndChipsProps {
  view?: 'card' | 'list';
  onViewChange?: (v: 'card' | 'list') => void;
  chips?: { label: string; onClick?: () => void }[];
}

export function ViewToggleAndChips({
  view = 'card',
  onViewChange,
  chips = [],
}: ViewToggleAndChipsProps) {
  return (
    <div className="px-3 sm:px-5 pt-3 flex items-center gap-2">
      {/* View toggle */}
      <div className="flex border border-wline dark:border-rink-700 overflow-hidden rounded-lg shrink-0">
        <button
          type="button"
          onClick={() => onViewChange?.('card')}
          className="grid place-items-center border-0 w-8 h-8"
          style={{
            background: view === 'card' ? 'var(--c-text-1)' : 'var(--c-surface)',
          }}
          aria-label="카드 보기"
        >
          <svg width="14" height="14" viewBox="0 0 16 16">
            <rect x="1" y="2" width="14" height="5" rx="1" fill={view === 'card' ? '#fff' : 'var(--c-text-3)'} />
            <rect
              x="1"
              y="9"
              width="14"
              height="5"
              rx="1"
              fill={view === 'card' ? '#fff' : 'var(--c-text-3)'}
              opacity="0.5"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onViewChange?.('list')}
          className="grid place-items-center border-0 w-8 h-8"
          style={{
            background: view === 'list' ? 'var(--c-text-1)' : 'var(--c-surface)',
          }}
          aria-label="리스트 보기"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" stroke={view === 'list' ? '#fff' : 'var(--c-text-3)'} strokeWidth="1.5">
            <line x1="2" y1="4" x2="14" y2="4" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12" x2="14" y2="12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 min-w-0" />

      {chips.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={c.onClick}
          className="bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 font-semibold rounded-full h-8 px-2.5 sm:px-3.5 text-[11px] sm:text-[12px] whitespace-nowrap shrink-0"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
