'use client';

/**
 * ClassListCard — 수업 목록 항목 카드 공통 셸 (학부모 골격 기준 통일).
 *
 * 학부모(/classes DefaultClassCard)와 운영자(/classes-manage ClassCard)가 같은 외형·구조를
 * 공유하도록 레이아웃 골격(외형·좌측 아이콘 박스·우측 콘텐츠 배치·하단 footer)을 고정한다.
 * 역할별로 다른 정보는 슬롯(topRight / metaInline / children(InfoRow) / bodyAction / footer)으로 주입.
 *
 * - 아동(ChildClassCard)·청소년(TeenClassCard) 카드는 접근성·감성 차별을 위해 의도적으로 별도 유지.
 */

import { createContext, memo, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { getTrainingTypeBadgeClass, getTrainingTypeIcon } from '@/lib/class-categories';
import { resolveImageSrc } from '@/lib/image-url';

/** 좌측 아이콘 하단 타입 배지 배경색 (학부모 골격 SoT). */
function typeBadgeColor(trainingType?: string | null): string {
  if (trainingType === 'lesson') return 'bg-ice-500';
  if (trainingType === 'tournament') return 'bg-red-500';
  return 'bg-emerald-500'; // regular / 기본
}

// ─── ICETIMES variant (iceTheme=true) 전용 색 매핑 ──────────────────
// calendar-colors SoT 정합 — 정규=emerald(초록) · 대회=it-red · 레슨=mint.
function itTypeBadgeColor(trainingType?: string | null): string {
  if (trainingType === 'lesson') return 'bg-mint-500';
  if (trainingType === 'tournament') return 'bg-it-red-500';
  return 'bg-emerald-500'; // regular 정규 — 기존 초록(SoT)
}

/** ICETIMES 좌측 아이콘 박스 배경·텍스트 (soft tone). */
function itIconBoxClass(trainingType?: string | null): string {
  if (trainingType === 'lesson')
    return 'bg-mint-100 text-mint-600 dark:bg-mint-700/25 dark:text-mint-100';
  if (trainingType === 'tournament')
    return 'bg-it-red-50 text-it-red-500 dark:bg-it-red-700/25 dark:text-it-red-300';
  return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-700/25 dark:text-emerald-100'; // regular 정규 — 기존 초록(SoT)
}

/**
 * 카드 → InfoRow 로 iceTheme 전파용 컨텍스트.
 *  - children(ClassCardInfoRow)은 호출처 page 에서 직접 렌더되어 iceTheme prop 을 받지 못한다.
 *    (호출처 무수정 제약) → 부모 ClassListCard 가 컨텍스트로 테마를 내려 InfoRow 가 자동 정합.
 *  - 기본 false → InfoRow 단독 사용·기본 카드 모두 기존 스타일 그대로(회귀 0).
 */
const ClassCardThemeContext = createContext(false);

/**
 * compact(리스트 행) 모드 전파용 컨텍스트 — InfoRow 폰트/여백 축소에 사용.
 * 기본 false → 미전달 화면(운영자 목록·캘린더)은 기존 그대로.
 */
const ClassCardCompactContext = createContext(false);

export interface ClassListCardProps {
  /** 카드 전체 클릭 시 이동할 상세 경로 */
  href: string;
  /** ICETIMES flat 스타일 적용. 기본 false = 기존 카드 외형 그대로 (미전달 화면 영향 0). */
  iceTheme?: boolean;
  /**
   * 리스트 행(compact) 모드 — 카드 인상을 주던 요소를 제거한다.
   *   · 좌측 아이콘 박스 44 → 32px (타입 색·팀 로고 식별은 유지)
   *   · 제목 1줄 truncate · 정보 라인 12.5px · 세로 패딩 축소(행 높이 ≈ 절반)
   * 기본 false → 운영자 수업목록·캘린더 등 미전달 화면은 기존 카드 골격 그대로.
   */
  compact?: boolean;
  /** 좌측 아이콘 박스 색·아이콘·배지 결정 (regular/lesson/tournament) */
  trainingType?: string | null;
  /** 있으면 trainingType 아이콘 대신 이미지(예: 팀 로고) 표시 */
  iconImageUrl?: string | null;
  /** 좌측 아이콘 하단 배지 라벨 (예: "정규수업" / "오픈클래스") */
  typeBadgeLabel?: string | null;
  /** 승인대기·거절 등 비활성 톤 (opacity + 제목 흐림) */
  dimmed?: boolean;
  ariaLabel: string;
  /** 콘텐츠 첫 줄 슬롯 — 레벨(학부모) / 상태 배지(운영자) */
  topRight?: ReactNode;
  /** 제목 줄 우측 상단 슬롯 — 등록 상태 칩(학부모) / 진행 상태 배지(운영자) */
  titleRight?: ReactNode;
  title: string;
  /** 제목 색 흐림 (운영자 PENDING/REJECTED) */
  titleDimmed?: boolean;
  /** 제목 아래 인라인 메타 (코치·연령 등, 아이콘 없는 dot 구분 라인) */
  metaInline?: ReactNode;
  /** 아이콘 정보 라인들 (ClassCardInfoRow 권장) — 장소·일정·날짜 */
  children?: ReactNode;
  /** 카드 본체 내 우하단 액션 (학부모 등록 칩) */
  bodyAction?: ReactNode;
  /** NavLink 외부 하단 액션 바 (운영자 명단·공유) */
  footer?: ReactNode;
}

export const ClassListCard = memo(function ClassListCard({
  href,
  iceTheme = false,
  compact = false,
  trainingType,
  iconImageUrl,
  typeBadgeLabel,
  dimmed,
  ariaLabel,
  topRight,
  titleRight,
  title,
  titleDimmed,
  metaInline,
  children,
  bodyAction,
  footer,
}: ClassListCardProps) {
  const imgSrc = iconImageUrl ? resolveImageSrc(iconImageUrl) : null;
  // 이미지 로드 실패(파일 없음·404 등) 시 기본 trainingType 아이콘으로 폴백.
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [imgSrc]);
  const showImage = !!imgSrc && !imgError;

  return (
    <ClassCardThemeContext.Provider value={iceTheme}>
    <ClassCardCompactContext.Provider value={compact}>
    <article
      className={cn(
        'group relative overflow-hidden transition-colors motion-reduce:transition-none',
        iceTheme
          ? // ICETIMES flat: 무라운드 목록 행 + 하단 hairline, 그림자 제거.
            'bg-it-surface dark:bg-it-ink-900 border-b border-it-line dark:border-it-ink-700'
          : 'bg-wsurface dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700',
      )}
    >
      <NavLink
        href={href}
        aria-label={ariaLabel}
        className={cn(
          'block active:brightness-95 focus:outline-none focus-visible:ring-2',
          iceTheme ? 'focus-visible:ring-it-blue-500/40' : 'focus-visible:ring-ice-500/40',
        )}
      >
        <div
          className={cn(
            'flex',
            compact ? 'gap-2.5 px-4 py-2.5 items-center' : 'gap-3 px-3.5 pt-3.5 pb-3',
          )}
        >
          {/* 좌측 아이콘 박스 — trainingType 색·아이콘 + 하단 타입 배지. iconImageUrl 있으면 이미지.
              compact(리스트 행): 32px. ICETIMES(true): 시안 Avatar 44px(w-11 h-11).
              기본(false): 56px(w-14 h-14) 그대로. */}
          <div
            className={cn(
              'shrink-0 grid place-items-center relative',
              compact ? 'w-8 h-8 rounded-lg' : 'rounded-xl',
              compact ? '' : iceTheme ? 'w-11 h-11' : 'w-14 h-14',
              dimmed && 'opacity-60',
            )}
          >
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc}
                alt=""
                onError={() => setImgError(true)}
                className={cn(
                  'absolute inset-0 h-full w-full object-cover bg-wline dark:bg-rink-700',
                  compact ? 'rounded-lg' : 'rounded-xl',
                )}
              />
            ) : (
              <span
                className={cn(
                  'absolute inset-0 flex items-center justify-center',
                  compact ? 'rounded-lg' : 'rounded-xl',
                  iceTheme ? itIconBoxClass(trainingType) : getTrainingTypeBadgeClass(trainingType),
                )}
              >
                <Icon
                  name={getTrainingTypeIcon(trainingType)}
                  className={cn(compact ? 'text-[18px]' : iceTheme ? 'text-[22px]' : 'text-[26px]')}
                  aria-hidden="true"
                />
              </span>
            )}
          </div>

          {/* 우측 콘텐츠 — 제목 → 메타 → 정보 라인 → 본체 액션 */}
          <div className={cn('flex-1 min-w-0 flex flex-col', compact ? 'gap-0.5' : 'gap-1.5')}>
            {topRight && <div className="flex items-center gap-1.5">{topRight}</div>}

            {/* [제안 B] 유형 배지를 아이콘 하단에서 제거하고 수업명 왼쪽 인라인으로 이동 (팀 로고 가림 방지). */}
            <div className={cn('flex gap-1.5', compact ? 'items-center' : 'items-start')}>
              {typeBadgeLabel && (
                <span
                  className={cn(
                    'shrink-0 inline-flex items-center justify-center rounded-md font-bold tracking-[0.04em] whitespace-nowrap text-white leading-none',
                    compact
                      ? 'min-w-[32px] px-1.5 h-[18px] text-[10.5px]'
                      : 'mt-[1px] min-w-[36px] px-1.5 h-[20px] text-[11px]',
                    iceTheme ? itTypeBadgeColor(trainingType) : typeBadgeColor(trainingType),
                  )}
                >
                  {typeBadgeLabel}
                </span>
              )}
              <h3
                className={cn(
                  'leading-[1.3]',
                  // compact: 1줄 truncate — flex 자식이라 min-w-0 이 있어야 실제로 줄어든다.
                  compact ? 'truncate min-w-0' : 'line-clamp-2',
                  // ICETIMES(true): 시안 ListRow title 15.5px/700/-0.01em.
                  // 기본(false): 기존 card-body/800/-0.025em 그대로(회귀 0).
                  iceTheme
                    ? 'text-[15.5px] font-bold tracking-[-0.01em]'
                    : 'text-card-body font-extrabold tracking-[-0.025em]',
                  titleDimmed
                    ? iceTheme
                      ? 'text-it-ink-400 dark:text-it-ink-500'
                      : 'text-wtext-3 dark:text-wtext-4'
                    : iceTheme
                      ? 'text-it-ink-800 dark:text-white'
                      : 'text-wtext-1 dark:text-white',
                )}
              >
                {title}
              </h3>
              {titleRight && <div className="ml-auto shrink-0 pl-1.5">{titleRight}</div>}
            </div>

            {metaInline && (
              <div
                className={cn(
                  'flex items-center gap-x-1.5 gap-y-0.5',
                  // compact: 1줄 유지(줄바꿈 금지) → 행 높이 고정.
                  compact ? 'min-w-0 truncate text-[12.5px] font-medium' : 'flex-wrap',
                  // ICETIMES(true): 시안 subtitle 13px/500/it-ink-500. 기본(false): 기존 그대로.
                  iceTheme
                    ? cn(!compact && 'text-[13px] font-medium', 'text-it-ink-500 dark:text-it-ink-300')
                    : cn(!compact && 'text-card-meta font-semibold', 'text-wtext-3 dark:text-wtext-4'),
                )}
              >
                {metaInline}
              </div>
            )}

            {children}

            {bodyAction && <div className={cn(compact ? 'mt-0.5' : 'mt-1')}>{bodyAction}</div>}
          </div>
        </div>
      </NavLink>

      {footer && (
        <div
          className={cn(
            'flex border-t',
            iceTheme
              ? 'border-it-line dark:border-it-ink-700 bg-it-fill dark:bg-it-ink-900'
              : 'border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900/40',
          )}
        >
          {footer}
        </div>
      )}
    </article>
    </ClassCardCompactContext.Provider>
    </ClassCardThemeContext.Provider>
  );
});

/** 카드 정보 라인 — 아이콘(14px) + truncate 텍스트. strong=true 시 날짜 등 강조. */
export function ClassCardInfoRow({
  icon,
  iconClassName,
  strong,
  children,
}: {
  icon?: string;
  iconClassName?: string;
  strong?: boolean;
  children: ReactNode;
}) {
  // 부모 ClassListCard 의 iceTheme·compact 를 컨텍스트로 상속 (호출처 무수정).
  const iceTheme = useContext(ClassCardThemeContext);
  const compact = useContext(ClassCardCompactContext);
  return (
    <div
      className={cn(
        'flex items-center min-w-0',
        // compact(리스트 행): 12.5px · 아이콘 14px · gap 4px 로 축소.
        // ICETIMES(true): 시안 subtitle/InfoRow 13px/500/it-ink-500 · 아이콘 15px · gap 6px.
        //   기본(false): 기존 그대로.
        compact
          ? 'gap-1 text-[12.5px] font-medium'
          : iceTheme
            ? 'gap-1.5 text-[13px] font-medium'
            : 'gap-2 text-card-meta font-semibold',
        iceTheme
          ? 'text-it-ink-500 dark:text-it-ink-300'
          : 'text-wtext-3 dark:text-wtext-4',
      )}
    >
      {icon && (
        <Icon
          name={icon}
          className={cn(
            compact ? 'text-[14px]' : iceTheme ? 'text-[15px]' : 'text-[14px]',
            'shrink-0',
            iconClassName,
          )}
          aria-hidden="true"
        />
      )}
      <span
        className={cn(
          'truncate min-w-0',
          strong &&
            (compact
              ? 'text-[12.5px] font-semibold text-wtext-2 dark:text-white tabular-nums'
              : iceTheme
                ? 'text-[13px] font-semibold text-wtext-2 dark:text-white tabular-nums'
                : 'text-card-body font-bold text-wtext-1 dark:text-white tabular-nums'),
        )}
      >
        {children}
      </span>
    </div>
  );
}
