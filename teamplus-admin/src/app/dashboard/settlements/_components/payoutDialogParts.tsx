'use client';

/**
 * 지급 요청·나이스 지급 엑셀 팝업이 함께 쓰는 조각 — 정산 상세 팝업과 같은 문법(회색 타일 · 테두리 구역 · semibold 소제목).
 */

import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { MESSAGES } from '@/lib/messages';

interface PayoutDialogSectionProps {
  title: string;
  /** 소제목 옆 건수 배지 */
  count?: number;
  children: ReactNode;
  /** 본문 아래 한 줄 메모(합계·안내) */
  footer?: ReactNode;
  /** 표를 넣을 때 — 본문 안쪽 여백을 없애 표 테두리가 구역 테두리에 붙는다 */
  flush?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function PayoutDialogSection({
  title,
  count,
  children,
  footer,
  flush = false,
  collapsible = false,
  defaultOpen = true,
}: PayoutDialogSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = !collapsible || open;
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-700/50 px-3 py-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-white dark:bg-slate-800 px-2 text-xs tabular-nums text-slate-600 dark:text-slate-300">
              {count}
            </span>
          )}
        </h4>
        {collapsible && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            {open ? MESSAGES.settlement.sectionCollapse : MESSAGES.settlement.sectionExpand}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
      </div>
      {expanded && (
        <>
          <div className={flush ? 'overflow-x-auto' : 'p-3 space-y-2'}>{children}</div>
          {footer && (
            <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
              {footer}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export interface PayoutSummaryTile {
  key: string;
  label: string;
  value: string;
  /** 값 아래 한 줄 — 경고 사유 등 */
  note?: string;
  tone?: 'default' | 'warn';
}

export function PayoutSummaryTiles({ tiles, columns = 3 }: { tiles: PayoutSummaryTile[]; columns?: 3 | 5 }) {
  const grid = columns === 5 ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3';
  return (
    <div className={`grid ${grid} gap-2 text-sm`}>
      {tiles.map((tile) => {
        const warn = tile.tone === 'warn';
        return (
          <div
            key={tile.key}
            className={`rounded-lg px-3 py-2 ${warn ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-slate-700/50'}`}
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{tile.label}</p>
            <p
              className={`font-bold tabular-nums ${
                warn ? 'text-amber-800 dark:text-amber-300' : 'text-slate-900 dark:text-white'
              }`}
            >
              {tile.value}
            </p>
            {tile.note && (
              <p className="mt-0.5 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                {tile.note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface PayoutConfirmBoxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

/** 돈이 나가는 확정 체크 — 하단 버튼 바로 위에 두어 "여기서 확정한다"가 보이게 한다. */
export function PayoutConfirmBox({ checked, onChange, disabled = false, label }: PayoutConfirmBoxProps) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 dark:bg-primary/10 p-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
      />
      <span className="text-sm font-medium text-slate-900 dark:text-white">{label}</span>
    </label>
  );
}
