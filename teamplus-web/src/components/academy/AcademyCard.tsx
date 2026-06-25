'use client';

import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';
import type { Academy } from '@/hooks/useAcademy';

interface AcademyCardProps {
  academy: Academy;
  onPress?: (academy: Academy) => void;
  className?: string;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스(rounded-xl border) → flat hairline 행 + it-* 토큰.
   *   (현재 /academy 관리 화면만 전달 — 흰 섹션 내부 divide 행으로 쌓임.)
   */
  iceTheme?: boolean;
}

/**
 * AcademyCard - 오픈클래스 카드 컴포넌트
 *
 * 디자인 시스템 준수:
 * - Primary #1E3FAE
 * - AI 스타일 금지 (그라디언트/블러/컬러 그림자 없음)
 * - 다크모드 지원
 * - WCAG 2.1 AA 접근성
 */
export function AcademyCard({ academy, onPress, className, iceTheme = false }: AcademyCardProps) {
  const memberCount = academy._count?.members ?? 0;
  const coachCount = academy._count?.coaches ?? 0;
  const classCount = academy._count?.classes ?? 0;

  // ICETIMES flat — 카드 박스 제거. 흰 섹션 위 hairline 행(좌측 아이콘 + 메타). it-* 토큰.
  if (iceTheme) {
    return (
      <button
        type="button"
        onClick={() => onPress?.(academy)}
        className={cn(
          'w-full text-left py-[14px] transition-colors motion-reduce:transition-none',
          'active:bg-it-fill dark:active:bg-it-blue-900/30',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40',
          className
        )}
        aria-label={`${academy.name} 오픈클래스`}
      >
        <div className="flex items-start gap-3">
          {resolveImageSrc(academy.imageUrl) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={resolveImageSrc(academy.imageUrl)}
              alt={`${academy.name} 로고`}
              className="w-11 h-11 rounded-w-md object-cover shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/40 flex items-center justify-center shrink-0">
              <Icon name="school" className="text-lg text-it-blue-500" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {/* 이름 + 상태 */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white truncate">
                {academy.name}
              </h3>
              <span
                className={cn(
                  'shrink-0 px-2 py-0.5 rounded-w-pill text-[11px] font-bold',
                  academy.isActive
                    ? 'bg-it-blue-50 dark:bg-it-blue-900/40 text-it-blue-500'
                    : 'bg-it-fill dark:bg-rink-700 text-it-ink-500 dark:text-rink-300'
                )}
              >
                {academy.isActive ? '운영중' : '비활성'}
              </span>
            </div>
            {academy.region && (
              <p className="mb-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-it-ink-500 dark:text-it-ink-300">
                <Icon name="place" className="text-[13px]" aria-hidden="true" />
                {academy.region}
              </p>
            )}
            {/* 메타 — 멤버/코치/수업 (pipe 금지, gap 구분) */}
            <div className="flex items-center gap-4 text-[12px] font-medium text-it-ink-500 dark:text-it-ink-300">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon name="group" className="text-sm" aria-hidden="true" />
                {MESSAGES.academy.memberCount(memberCount)}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon name="sports" className="text-sm" aria-hidden="true" />
                {MESSAGES.academy.coachCount(coachCount)}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon name="class" className="text-sm" aria-hidden="true" />
                {MESSAGES.academy.classCount(classCount)}
              </span>
            </div>
          </div>
          <Icon
            name="chevron_right"
            className="mt-0.5 shrink-0 text-xl text-it-ink-300 dark:text-it-ink-400"
            aria-hidden="true"
          />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPress?.(academy)}
      className={cn(
        'w-full text-left bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700',
        'p-4 transition-colors hover:bg-wbg dark:hover:bg-rink-700',
        'focus:outline-none focus:ring-2 focus:ring-ice-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
        className
      )}
      aria-label={`${academy.name} 오픈클래스`}
    >
      {/* 상단: 이름 + 상태 배지 */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {resolveImageSrc(academy.imageUrl) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={resolveImageSrc(academy.imageUrl)}
              alt={`${academy.name} 로고`}
              className="w-10 h-10 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-ice-500/10 dark:bg-ice-500/20 flex items-center justify-center shrink-0">
              <Icon name="school" className="text-lg text-ice-500" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-wtext-1 dark:text-white truncate">
              {academy.name}
            </h3>
            {academy.region && (
              <p className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">
                {academy.region}
              </p>
            )}
          </div>
        </div>

        <span
          className={cn(
            'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium',
            academy.isActive
              ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
              : 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
          )}
        >
          {academy.isActive ? '운영중' : '비활성'}
        </span>
      </div>

      {/* 하단: 멤버수, 코치수, 수업수 */}
      <div className="flex items-center gap-4 text-xs text-wtext-3 dark:text-rink-300">
        <span className="flex items-center gap-1">
          <Icon name="group" className="text-sm" />
          {MESSAGES.academy.memberCount(memberCount)}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="sports" className="text-sm" />
          {MESSAGES.academy.coachCount(coachCount)}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="class" className="text-sm" />
          {MESSAGES.academy.classCount(classCount)}
        </span>
      </div>
    </button>
  );
}

export default AcademyCard;
