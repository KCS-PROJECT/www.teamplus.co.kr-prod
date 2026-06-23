'use client';

import { MESSAGES } from '@/lib/messages';

/**
 * RecordCardPromo — B1 탭 상단 "기록 카드 만들어 보세요" pill
 *
 * 좌: 텍스트 + 점선 보더 태그
 * 우: 미니 카드 일러스트 + "시작" 버튼
 */
export interface RecordCardPromoProps {
  /** "지호의" 같은 변수 (없으면 기본 카피) */
  prefix?: string;
  /** 변형 헤드라인 (학생/코치/관리자 등) */
  customTitle?: string;
  onStart?: () => void;
}

export function RecordCardPromo({ prefix, customTitle, onStart }: RecordCardPromoProps) {
  // "지호의 [기록 카드] 만들어 보세요" 형태
  const text = customTitle
    ?? (prefix
      ? `${prefix}의`
      : MESSAGES.wallet.recordCard.titleNoChild.replace(/만들어.*/, '').trim());

  return (
    <div className="px-3 sm:px-5 pt-3">
      <div
        className="flex items-center gap-2 sm:gap-2.5 bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-full px-3 sm:px-3.5 py-2 sm:py-2.5"
      >
        <div
          className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-wtext-2 dark:text-rink-100 font-semibold text-[12px] sm:text-[13px] tracking-[-0.02em] break-keep"
        >
          {customTitle ? (
            <span>{customTitle}</span>
          ) : (
            <>
              <span>{text}</span>
              <span
                className="inline-flex items-center font-extrabold font-num text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-md whitespace-nowrap"
                style={{
                  border: '1.5px dashed var(--c-ice-500)',
                  color: 'var(--c-ice-600)',
                }}
              >
                {MESSAGES.wallet.recordCard.tag}
              </span>
              <span>만들어 보세요</span>
            </>
          )}
        </div>

        {/* 일러스트 — 좁은 화면에서는 숨기고 sm 이상에서만 표시 */}
        <svg
          width="32"
          height="28"
          viewBox="0 0 40 36"
          aria-hidden
          className="hidden sm:block shrink-0"
        >
          <rect x="4" y="6" width="32" height="24" rx="6" fill="var(--c-ice-100)" />
          <circle cx="14" cy="18" r="3" fill="var(--c-flame-500)" />
          <path d="M22 18 L30 18" stroke="var(--c-ice-600)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        <button
          type="button"
          onClick={onStart}
          className="shrink-0 text-white font-extrabold font-sans rounded-full text-[11px] sm:text-[12px] tracking-[-0.02em] h-8 sm:h-9 w-11 sm:w-12 border-0"
          style={{
            background: 'var(--c-rink-900)',
          }}
        >
          {MESSAGES.wallet.recordCard.cta}
        </button>
      </div>
    </div>
  );
}
