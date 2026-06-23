'use client';

/**
 * EmptyStateAction - CTA 버튼이 포함된 빈 상태 컴포넌트
 * 기존 `components/ui/EmptyState`와 독립적으로 동작하되,
 * illustrated 변형(큰 원형 아이콘)과 Primary CTA 버튼을 지원합니다.
 * 기존 EmptyState는 variant 고정/버튼이 secondary 라 확장이 제한되어 별도 구현.
 */

import { ReactNode, isValidElement } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export type EmptyStateActionVariant = 'default' | 'illustrated';

export interface EmptyStateActionProps {
  /** material icon 이름 또는 커스텀 ReactNode */
  icon?: ReactNode | string;
  /** 제목 */
  title: string;
  /** 설명 */
  description?: string;
  /** CTA 버튼 레이블 (예: "수업 둘러보기") */
  actionLabel?: string;
  /** CTA 클릭 핸들러 */
  onAction?: () => void;
  /** actionHref 제공 시 next/link 사용 */
  actionHref?: string;
  /** 변형 (default | illustrated) */
  variant?: EmptyStateActionVariant;
  /** 추가 클래스 */
  className?: string;
}

function renderIcon(
  icon: ReactNode | string | undefined,
  illustrated: boolean,
): ReactNode {
  const size = illustrated ? 'w-32 h-32' : 'w-20 h-20';
  const iconSize = illustrated ? 'text-6xl' : 'text-4xl';
  const fallback = 'inbox';

  const isStringIcon = typeof icon === 'string' || icon === undefined;
  const content = isStringIcon ? (
    <Icon
      name={(icon as string) || fallback}
      className={`${iconSize} text-ice-500 dark:text-blue-400`}
    />
  ) : isValidElement(icon) ? (
    icon
  ) : (
    <Icon name={fallback} className={`${iconSize} text-ice-500 dark:text-blue-400`} />
  );

  return (
    <div
      className={`${size} rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center`}
    >
      {content}
    </div>
  );
}

export function EmptyStateAction({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  variant = 'default',
  className = '',
}: EmptyStateActionProps) {
  const illustrated = variant === 'illustrated';

  const ctaClasses =
    'inline-flex items-center justify-center rounded-xl bg-ice-500 px-6 py-4 text-base font-semibold text-white shadow-md hover:bg-ice-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 disabled:opacity-50 transition-colors';

  const cta = actionLabel
    ? actionHref
      ? (
        <Link href={actionHref} className={ctaClasses}>
          {actionLabel}
        </Link>
      )
      : (
        <button type="button" onClick={onAction} className={ctaClasses}>
          {actionLabel}
        </button>
      )
    : null;

  return (
    <div
      className={`flex flex-col items-center justify-center px-4 py-12 text-center ${className}`}
      role="status"
    >
      {renderIcon(icon, illustrated)}
      <h3 className="mt-5 text-lg font-semibold text-wtext-1 dark:text-white">
        {title}
      </h3>
      {description && (
        <p className="mt-2 max-w-xs text-sm text-wtext-3 dark:text-rink-300">
          {description}
        </p>
      )}
      {cta && <div className="mt-6">{cta}</div>}
    </div>
  );
}

export default EmptyStateAction;
