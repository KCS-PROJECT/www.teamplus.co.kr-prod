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
  /**
   * ICETIMES(하우머치) flat variant. 기본 false = 기존 동작.
   * true 일 때 표면/구분선을 it-* 토큰으로 평탄화(카드·그림자 제거, hairline border).
   * 칩/컬러바의 일정 유형 색은 유지(작업1 복원 의미색 우선).
   */
  iceTheme?: boolean;
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
  iceTheme = false,
}: ScheduleRowProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 border-b py-3 last:border-b-0',
        iceTheme
          ? 'border-it-line dark:border-rink-700'
          : 'border-wline-2 dark:border-rink-700',
      )}
    >
      <div
        className={cn(
          // 시안 KitScheduleRow: 컬러바 w-1 rounded-[3px] (full-height). 기본: 기존 rounded-full.
          'h-full w-1 shrink-0',
          iceTheme ? 'mt-0.5 min-h-[42px] rounded-[3px]' : 'mt-0.5 min-h-[44px] rounded-full',
          colorBar.bg,
          colorBar.darkBg,
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'flex items-center',
            // 시안: 칩~시간 gap 7px / 칩 아래 마진 3px. 기본: gap-2 / mb-1.
            iceTheme ? 'mb-[3px] gap-[7px]' : 'mb-1 gap-2',
          )}
        >
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full',
              // 시안: 11.5px/700 · padding 2px 7px. 기본: 12px/600 · px-2 py-0.5.
              iceTheme ? 'px-[7px] py-[2px] text-[11.5px] font-bold' : 'px-2 py-0.5 text-xs font-semibold',
              chip.className,
            )}
          >
            {chip.label}
          </span>
          {time && (
            <span
              className={cn(
                'tabular-nums',
                // 시안: 13px/700 it-ink-body. 기본: 12px regular.
                iceTheme ? 'text-[13px] font-bold text-it-ink-600 dark:text-rink-300' : 'text-xs text-wtext-3 dark:text-rink-300',
              )}
            >
              {time}
            </span>
          )}
        </div>
        <p
          className={cn(
            'truncate font-bold',
            // 시안: 15px/700 it-ink-800. 기본: 14px.
            iceTheme ? 'text-[15px] text-it-ink-800 dark:text-white' : 'text-sm text-wtext-1 dark:text-white',
          )}
        >
          {title}
        </p>
        {location && (
          <div
            className={cn(
              'flex items-center',
              // 시안: place 아이콘 14 + 12.5px it-ink-500 · gap 3 · marginTop 2.
              iceTheme ? 'mt-[2px] gap-[3px] text-[12.5px] text-it-ink-500 dark:text-rink-300' : 'mt-1 gap-1 text-xs text-wtext-3 dark:text-rink-300',
            )}
          >
            <Icon name="location_on" className="shrink-0 text-[14px]" aria-hidden="true" />
            <span className="truncate">{location}</span>
          </div>
        )}
      </div>
      {detail && (
        <button
          type="button"
          onClick={detail.onClick}
          className={cn(
            '-mr-1 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-transparent transition-colors active:brightness-95 motion-reduce:transition-none',
            iceTheme
              ? 'text-it-ink-400 hover:text-it-blue-500 dark:text-rink-300'
              : 'text-wtext-3 hover:text-ice-500 dark:text-rink-300',
          )}
          aria-label={detail.ariaLabel ?? detail.label}
        >
          <Icon name="chevron_right" className="text-[18px]" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
