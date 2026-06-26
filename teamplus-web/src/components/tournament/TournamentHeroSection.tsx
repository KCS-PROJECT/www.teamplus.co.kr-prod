"use client";

/**
 * TournamentHeroSection — 대회 상세 상단 히어로
 *
 * 레퍼런스: 사용자 제공 HTML "대회 상세 및 대진표" Header Image
 *
 * 구조:
 *  - 배경: 솔리드 slate 컬러 + 하단 어두운 솔리드 오버레이
 *  - 좌상단 상태 태그
 *  - 하단: 부제목(대회 카테고리) + 제목 + 기간
 *
 * 주의:
 *  - AI 스타일 금지 원칙 엄수: 장식 배경 · 블러 사용 금지
 *  - 솔리드 컬러 + 반투명 오버레이만 사용
 */

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import type { TournamentUiStatus } from "@/services/tournament.service";
import { TournamentStatusBadge } from "./TournamentStatusBadge";

interface Props {
  title: string;
  subtitle?: string;
  startDate: string;
  endDate: string;
  status: TournamentUiStatus;
  dDay?: number;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 navy 히어로(it-blue-800)·it-* 본문 위계로 치환.
   */
  iceTheme?: boolean;
}

function formatRangeLong(start: string, end: string): string {
  const s = start.slice(0, 10).replace(/-/g, ".");
  const e = end.slice(0, 10).replace(/-/g, ".");
  return `${s} - ${e}`;
}

export function TournamentHeroSection({
  title,
  subtitle,
  startDate,
  endDate,
  status,
  dDay,
  iceTheme = false,
}: Props) {
  return (
    <section
      // [수정 2026-05-11] absolute 배지 → inline 으로 변경하여 본문과 겹침 해소.
      //  · 배지가 본문(title/subtitle/date) 위에 별도 행으로 배치되도록 flex 구조 단순화.
      className={cn(
        'relative overflow-hidden',
        iceTheme
          ? // ICETIMES navy 히어로 — full-bleed, shadow 제거(flat).
            'bg-it-blue-800 dark:bg-it-blue-950'
          : 'bg-rink-800 shadow-sm',
      )}
      aria-label="대회 히어로"
    >
      <div className="relative z-10 flex flex-col gap-2 p-5 pb-6 pt-6">
        {/* 1행: 상태 배지 (inline, 별도 라인) */}
        <div>
          <TournamentStatusBadge status={status} dDay={dDay} iceTheme={iceTheme} />
        </div>

        {/* 2행: 부제 (palette 톤다운, 작게) */}
        {subtitle ? (
          <p
            className={cn(
              'text-[11px] font-semibold uppercase tracking-wide',
              iceTheme ? 'text-it-blue-200' : 'text-wtext-4',
            )}
          >
            {subtitle}
          </p>
        ) : null}

        {/* 3행: 메인 타이틀 */}
        <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-white">
          {title}
        </h1>

        {/* 4행: 기간 */}
        <div className="mt-1 flex items-center gap-2">
          <Icon
            name="calendar_today"
            className={cn('text-base', iceTheme ? 'text-it-blue-200' : 'text-wtext-4')}
            aria-hidden
          />
          <p
            className={cn(
              'text-sm tabular-nums',
              iceTheme ? 'text-it-blue-100' : 'text-wtext-3',
            )}
          >
            {formatRangeLong(startDate, endDate)}
          </p>
        </div>
      </div>
    </section>
  );
}
