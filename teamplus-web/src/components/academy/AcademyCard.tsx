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
   *   (현재 공개 academies 목록 컴팩트 행으로 사용 — 흰 섹션 내부 divide 행으로 쌓임.)
   */
  iceTheme?: boolean;
  /**
   * 오픈클래스 관리(/academy) 전용 리치 카드 variant. 팀 관리(/team)의
   * CoachTeamManageCard 와 동일한 시각 골격(56px 로고 · 17px 이름 · 코드 chip ·
   * chevron · 흰 블록)으로 통일. 1인 1개 정책상 단일 카드로 노출된다.
   * `manage` 가 true 면 iceTheme 보다 우선한다.
   */
  manage?: boolean;
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
export function AcademyCard({ academy, onPress, className, iceTheme = false, manage = false }: AcademyCardProps) {
  const memberCount = academy._count?.members ?? 0;
  const coachCount = academy._count?.coaches ?? 0;
  const classCount = academy._count?.classes ?? 0;

  // 관리 리치 카드 — 팀 관리 CoachTeamManageCard 와 동일 골격(56px 로고 · 17px 이름 ·
  //   코드 chip · chevron). 1인 1개 정책상 단일 카드로 노출되므로 목록형 컴팩트 행 대신 사용.
  if (manage) {
    const logoSrc = resolveImageSrc(academy.imageUrl);
    return (
      <button
        type="button"
        onClick={() => onPress?.(academy)}
        aria-label={`${academy.name} 오픈클래스 상세 보기`}
        className={cn('block w-full text-left active:brightness-95', className)}
      >
        {/* 헤더: 로고 + 이름 + 상태 + 메타 + 코드 + chevron — 패딩 16/16/12 (팀 카드 동일) */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          {logoSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoSrc}
              alt={`${academy.name} 로고`}
              className="w-14 h-14 rounded-w-md object-cover shrink-0 border border-it-line dark:border-it-blue-900"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-w-md bg-it-blue-500 flex items-center justify-center shrink-0 text-white"
              aria-hidden="true"
            >
              <Icon name="school" className="text-[26px]" aria-hidden="true" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* 이름 17px + 상태 배지 */}
            <div className="flex items-center gap-1.5 mb-1 min-w-0">
              <h3 className="text-card-emphasis font-extrabold text-it-ink-800 dark:text-white tracking-[-0.03em] truncate">
                {academy.name}
              </h3>
              <span
                className={cn(
                  'shrink-0 px-2 py-0.5 rounded-w-pill text-[11px] font-bold',
                  academy.isActive
                    ? 'bg-it-blue-50 dark:bg-it-blue-900/40 text-it-blue-500'
                    : 'bg-it-fill dark:bg-rink-700 text-it-ink-500 dark:text-rink-300',
                )}
              >
                {academy.isActive ? '운영중' : '비활성'}
              </span>
            </div>

            {/* 지역 */}
            {academy.region && (
              <div className="mb-1 inline-flex items-center gap-1 text-card-meta text-it-ink-500 dark:text-it-ink-400 min-w-0">
                <Icon name="place" className="shrink-0 text-[13px]" aria-hidden="true" />
                <span className="truncate">{academy.region}</span>
              </div>
            )}

            {/* 메타 — 수강생 · 코치 · 수업 (pipe 금지, gap 구분) */}
            <div className="flex items-center gap-4 text-card-meta text-it-ink-500 dark:text-it-ink-400">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon name="group" className="text-[14px]" aria-hidden="true" />
                {MESSAGES.academy.memberCount(memberCount)}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon name="sports" className="text-[14px]" aria-hidden="true" />
                {MESSAGES.academy.coachCount(coachCount)}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon name="class" className="text-[14px]" aria-hidden="true" />
                {MESSAGES.academy.classCount(classCount)}
              </span>
            </div>

            {/* 오픈클래스 코드 — 팀코드 chip 과 동일 패턴(가입 안내 시 즉시 공유) */}
            {academy.code && (
              <div className="mt-1 inline-flex items-center gap-1 text-card-meta text-it-ink-500 dark:text-it-ink-400 min-w-0">
                <Icon name="qr_code_2" className="shrink-0 text-[12px]" aria-hidden="true" />
                <span className="font-bold tabular-nums uppercase tracking-wider truncate">
                  {academy.code}
                </span>
              </div>
            )}
          </div>

          {/* 상세 이동 표시 */}
          <span
            className="w-8 h-8 inline-flex items-center justify-center text-it-ink-500 dark:text-it-ink-400 shrink-0"
            aria-hidden="true"
          >
            <Icon name="chevron_right" className="text-[28px]" aria-hidden="true" />
          </span>
        </div>
      </button>
    );
  }

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
