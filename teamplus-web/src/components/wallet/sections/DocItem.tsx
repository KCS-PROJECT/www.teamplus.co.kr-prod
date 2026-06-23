'use client';

import { MESSAGES } from '@/lib/messages';

/**
 * DocItem — B3 "대기중" 문서 아이템 (서명 대기)
 */
export interface DocItemProps {
  title: string;
  /** "목동 아이스링크" 같은 발신 */
  from?: string;
  /** "08.15까지" 같은 마감 표기 */
  deadlineLabel?: string;
  urgent?: boolean;
  onSign?: () => void;
}

export function DocItem({ title, from, deadlineLabel, urgent, onSign }: DocItemProps) {
  return (
    <div className="flex bg-wsurface dark:bg-rink-800 rounded-[14px] gap-2.5 sm:gap-3 px-3 sm:px-4 py-3 sm:py-3.5 shadow-[0_1px_3px_rgba(20,24,38,0.04)]">
      <DocPaperIcon />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {urgent && <UrgentBadge />}
          <div className="font-bold text-wtext-1 dark:text-white truncate text-[13px] sm:text-[14px] tracking-[-0.02em] min-w-0">
            {title}
          </div>
        </div>
        {from && (
          <div className="text-wtext-3 dark:text-rink-300 truncate text-[10px] sm:text-[11px] mt-1">
            {from}
          </div>
        )}
        {deadlineLabel && (
          <div
            className="font-semibold text-[10px] sm:text-[11px] mt-0.5 truncate"
            style={{
              color: urgent ? 'var(--c-flame-500)' : 'var(--c-text-3)',
            }}
          >
            {MESSAGES.wallet.doc.deadline(deadlineLabel)}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onSign}
        className="self-center text-white font-bold border-0 h-8 px-3 sm:px-3.5 rounded-full text-[11px] sm:text-[12px] shrink-0 whitespace-nowrap"
        style={{
          background: 'var(--c-ice-500)',
        }}
      >
        {MESSAGES.wallet.doc.sign}
      </button>
    </div>
  );
}

/**
 * DocStorageItem — B3 "보관함" 아이템 (체결완료/만료 표시)
 */
export interface DocStorageItemProps {
  title: string;
  date: string;
  status: 'signed' | 'expired';
  onClick?: () => void;
}

export function DocStorageItem({ title, date, status, onClick }: DocStorageItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center w-full bg-wsurface dark:bg-rink-800 text-left border-0 rounded-xl gap-2.5 sm:gap-3 px-3 sm:px-3.5 py-3 shadow-[0_1px_3px_rgba(20,24,38,0.04)]"
    >
      <svg
        viewBox="0 0 20 24"
        fill="var(--c-text-4)"
        aria-hidden
        className="w-5 h-6 shrink-0"
      >
        <path d="M2 0h12l4 4v18a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z" />
      </svg>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-wtext-1 dark:text-white truncate text-[12px] sm:text-[13px] tracking-[-0.02em]">
          {title}
        </div>
        <div className="font-num text-wtext-3 dark:text-rink-300 truncate text-[10px] sm:text-[11px] mt-0.5">
          {date}
        </div>
      </div>
      <div
        className="font-bold text-[10px] sm:text-[11px] shrink-0 whitespace-nowrap"
        style={{
          color: status === 'expired' ? 'var(--c-text-4)' : 'var(--c-mint-500)',
        }}
      >
        {status === 'expired' ? MESSAGES.wallet.doc.expired : MESSAGES.wallet.doc.signed}
      </div>
    </button>
  );
}

function DocPaperIcon() {
  return (
    <div
      className="relative shrink-0 w-9 sm:w-10 h-11 sm:h-12 rounded"
      style={{
        background: 'var(--c-ice-50)',
      }}
    >
      <div
        className="absolute top-2 left-1.5 right-1.5 h-0.5 rounded-[1px]"
        style={{ background: 'var(--c-ice-300)' }}
      />
      <div
        className="absolute top-3.5 left-1.5 right-2.5 h-0.5 rounded-[1px]"
        style={{ background: 'var(--c-ice-200)' }}
      />
      <div
        className="absolute top-5 left-1.5 right-3.5 h-0.5 rounded-[1px]"
        style={{ background: 'var(--c-ice-200)' }}
      />
      <div
        className="absolute bottom-0 right-0 w-3 h-3"
        style={{
          background: 'var(--c-ice-100)',
          clipPath: 'polygon(0 0, 100% 100%, 0 100%)',
        }}
      />
    </div>
  );
}

function UrgentBadge() {
  return (
    <span
      className="inline-flex items-center text-white font-extrabold h-[18px] px-1.5 text-[9px] sm:text-[10px] rounded shrink-0 whitespace-nowrap"
      style={{
        background: 'var(--c-flame-500)',
      }}
    >
      {MESSAGES.wallet.doc.urgent}
    </span>
  );
}
