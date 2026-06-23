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

import { memo, useEffect, useState, type ReactNode } from 'react';
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

export interface ClassListCardProps {
  /** 카드 전체 클릭 시 이동할 상세 경로 */
  href: string;
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
    <article className="group relative overflow-hidden bg-wsurface dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 transition-colors motion-reduce:transition-none">
      <NavLink
        href={href}
        aria-label={ariaLabel}
        className="block active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
      >
        <div className="flex gap-3 px-3.5 pt-3.5 pb-3">
          {/* 좌측 아이콘 박스 — trainingType 색·아이콘 + 하단 타입 배지. iconImageUrl 있으면 이미지. */}
          <div className={cn('w-14 h-14 shrink-0 grid place-items-center rounded-xl relative', dimmed && 'opacity-60')}>
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc}
                alt=""
                onError={() => setImgError(true)}
                className="absolute inset-0 h-full w-full rounded-xl object-cover bg-wline dark:bg-rink-700"
              />
            ) : (
              <span
                className={cn(
                  'absolute inset-0 rounded-xl flex items-center justify-center',
                  getTrainingTypeBadgeClass(trainingType),
                )}
              >
                <Icon name={getTrainingTypeIcon(trainingType)} className="text-[26px]" aria-hidden="true" />
              </span>
            )}
          </div>

          {/* 우측 콘텐츠 — 제목 → 메타 → 정보 라인 → 본체 액션 */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            {topRight && <div className="flex items-center gap-1.5">{topRight}</div>}

            {/* [제안 B] 유형 배지를 아이콘 하단에서 제거하고 수업명 왼쪽 인라인으로 이동 (팀 로고 가림 방지). */}
            <div className="flex items-start gap-1.5">
              {typeBadgeLabel && (
                <span
                  className={cn(
                    'shrink-0 mt-[1px] inline-flex items-center justify-center min-w-[36px] px-1.5 h-[20px] rounded-md text-[11px] font-bold tracking-[0.04em] whitespace-nowrap text-white leading-none',
                    typeBadgeColor(trainingType),
                  )}
                >
                  {typeBadgeLabel}
                </span>
              )}
              <h3
                className={cn(
                  'text-card-body font-extrabold tracking-[-0.025em] leading-[1.3] line-clamp-2',
                  titleDimmed ? 'text-wtext-3 dark:text-wtext-4' : 'text-wtext-1 dark:text-white',
                )}
              >
                {title}
              </h3>
              {titleRight && <div className="ml-auto shrink-0 pl-1.5">{titleRight}</div>}
            </div>

            {metaInline && (
              <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-card-meta font-semibold text-wtext-3 dark:text-wtext-4">
                {metaInline}
              </div>
            )}

            {children}

            {bodyAction && <div className="mt-1">{bodyAction}</div>}
          </div>
        </div>
      </NavLink>

      {footer && (
        <div className="flex border-t border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900/40">
          {footer}
        </div>
      )}
    </article>
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
  return (
    <div className="flex items-center gap-2 min-w-0 text-card-meta font-semibold text-wtext-3 dark:text-wtext-4">
      {icon && <Icon name={icon} className={cn('text-[14px] shrink-0', iconClassName)} aria-hidden="true" />}
      <span
        className={cn(
          'truncate min-w-0',
          strong && 'text-card-body font-bold text-wtext-1 dark:text-white tabular-nums',
        )}
      >
        {children}
      </span>
    </div>
  );
}
