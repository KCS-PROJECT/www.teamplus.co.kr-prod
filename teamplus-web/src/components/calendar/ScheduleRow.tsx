'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

export interface ScheduleRowProps {
  /** 좌측 컬러바 — 일정 유형 색상. */
  colorBar: { bg: string; darkBg?: string };
  /** 유형 칩 — 라벨 + 색상 클래스(text/bg). */
  chip: { label: string; className: string };
  /** 시간 표시(예: "16:00" 또는 "16:00 - 17:00"). */
  time?: string | null;
  title: string;
  location?: string | null;
  /** 상세 이동 버튼(선택). 감독 일정의 상세보기/대회 목록 등. */
  detail?: { label: string; onClick: () => void; ariaLabel?: string } | null;
}

/**
 * 일정 목록 공통 행 — 좌측 컬러바 + (유형 칩·시간 / 제목 / 장소 / 상세버튼).
 * 학부모 통합캘린더 · 감독/오픈클래스 감독 수업 일정에서 공통 사용(B-1 통일).
 * 박스 안에서 `border-b` 로 행을 구분하며 마지막 행은 구분선 제거.
 */
export function ScheduleRow({
  colorBar,
  chip,
  time,
  title,
  location,
  detail,
}: ScheduleRowProps) {
  return (
    <div className="flex items-start gap-3 border-b border-wline-2 py-3 last:border-b-0 dark:border-rink-700">
      <div
        className={cn(
          'mt-0.5 h-full min-h-[44px] w-1 shrink-0 rounded-full',
          colorBar.bg,
          colorBar.darkBg,
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold',
              chip.className,
            )}
          >
            {chip.label}
          </span>
          {time && (
            <span className="text-xs text-wtext-3 tabular-nums dark:text-rink-300">
              {time}
            </span>
          )}
        </div>
        <p className="truncate text-sm font-bold text-wtext-1 dark:text-white">
          {title}
        </p>
        {location && (
          <div className="mt-1 flex items-center gap-1 text-xs text-wtext-3 dark:text-rink-300">
            <Icon name="location_on" className="shrink-0 text-[14px]" aria-hidden="true" />
            <span className="truncate">{location}</span>
          </div>
        )}
      </div>
      {detail && (
        <button
          type="button"
          onClick={detail.onClick}
          className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-transparent text-wtext-3 transition-colors hover:text-ice-500 active:brightness-95 motion-reduce:transition-none dark:text-rink-300"
          aria-label={detail.ariaLabel ?? detail.label}
        >
          <Icon name="chevron_right" className="text-[18px]" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
