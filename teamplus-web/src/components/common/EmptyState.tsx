'use client';

import { memo, ReactNode, isValidElement } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * EmptyState - 공통 빈 상태 컴포넌트
 *
 * 데이터가 없을 때 사용하는 표준 컴포넌트입니다.
 * 아이콘(Material Symbols) + 제목 + 설명 + 액션 구성.
 *
 * 사용처: 모든 목록/검색/필터 결과가 비어있을 때
 * 이전 중복: ui/EmptyState, teen/EmptyState, coach/CoachEmptyState,
 *   child/ChildEmptyState, admin/AdminEmptyState, shared/EmptyStateAction
 *   → 이 컴포넌트로 통합 권장
 *
 * @example
 * // 기본 사용
 * <EmptyState title="데이터가 없습니다" />
 *
 * // 아이콘 + 설명
 * <EmptyState
 *   icon="search_off"
 *   title="검색 결과가 없습니다"
 *   description="다른 검색어로 다시 시도해보세요."
 * />
 *
 * // 액션 버튼 포함
 * <EmptyState
 *   icon="person_off"
 *   title={MESSAGES.empty('회원')}
 *   actionLabel="회원 등록하기"
 *   onAction={() => router.push('/members/create')}
 * />
 *
 * // 커스텀 액션 (ReactNode)
 * <EmptyState
 *   icon="inbox"
 *   title="알림이 없습니다"
 *   action={<Link href="/settings">설정으로 이동</Link>}
 * />
 *
 * // 카드 변형
 * <EmptyState
 *   variant="card"
 *   icon="sports_hockey"
 *   title="등록된 수업이 없습니다"
 * />
 */

type EmptyStateVariant = 'default' | 'card' | 'compact';
type EmptyStateSize = 'sm' | 'md' | 'lg';

interface EmptyStateProps {
  /** Material Symbols 아이콘 이름 (기본: 'inbox') */
  icon?: string;
  /** 커스텀 아이콘 ReactNode (icon prop 대신 사용) */
  customIcon?: ReactNode;
  /** 제목 (필수) */
  title: string;
  /** 설명 텍스트 (선택) */
  description?: string;
  /** 액션 버튼 라벨 (선택) */
  actionLabel?: string;
  /** 액션 버튼 클릭 핸들러 */
  onAction?: () => void;
  /** 커스텀 액션 ReactNode (actionLabel 대신 사용) */
  action?: ReactNode;
  /** 변형: default(배경 없음) | card(카드 형태) | compact(작은 패딩) */
  variant?: EmptyStateVariant;
  /** 아이콘 크기: sm | md | lg */
  size?: EmptyStateSize;
  /** 추가 CSS 클래스 */
  className?: string;
}

const sizeConfig: Record<EmptyStateSize, {
  container: string;
  iconWrapper: string;
  iconSize: string;
  title: string;
  description: string;
}> = {
  sm: {
    container: 'py-6 gap-2',
    iconWrapper: 'w-10 h-10',
    iconSize: 'text-xl',
    title: 'text-sm font-semibold',
    description: 'text-xs',
  },
  md: {
    container: 'py-12 gap-3',
    iconWrapper: 'w-14 h-14',
    iconSize: 'text-3xl',
    title: 'text-base font-semibold',
    description: 'text-sm',
  },
  lg: {
    container: 'py-16 gap-4',
    iconWrapper: 'w-20 h-20',
    iconSize: 'text-4xl',
    title: 'text-lg font-bold',
    description: 'text-sm',
  },
};

export const EmptyState = memo(function EmptyState({
  icon = 'inbox',
  customIcon,
  title,
  description,
  actionLabel,
  onAction,
  action,
  variant = 'default',
  size = 'md',
  className,
}: EmptyStateProps) {
  const config = sizeConfig[size];

  const iconNode = customIcon && isValidElement(customIcon)
    ? customIcon
    : (
      <div
        className={cn(
          config.iconWrapper,
          'rounded-full bg-wline-2 dark:bg-rink-800 flex items-center justify-center',
        )}
      >
        <Icon
          name={icon}
          className={cn(config.iconSize, 'text-wtext-3 dark:text-rink-300')}
          aria-hidden="true"
        />
      </div>
    );

  const actionNode = action
    ? <div className="mt-1">{action}</div>
    : actionLabel && onAction
      ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 px-5 py-2.5 bg-ice-500 hover:bg-ice-700 text-white text-sm font-semibold rounded-xl transition-colors active:brightness-95"
        >
          {actionLabel}
        </button>
      )
      : null;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-4 text-center',
        config.container,
        variant === 'card' && 'bg-white dark:bg-rink-800 rounded-xl p-8 border border-wline-2 dark:border-rink-700',
        variant === 'compact' && 'py-6',
        className,
      )}
      role="status"
    >
      {iconNode}
      <h3 className={cn(config.title, 'text-wtext-2 dark:text-rink-100')}>
        {title}
      </h3>
      {description && (
        <p className={cn(config.description, 'text-wtext-3 dark:text-rink-300 max-w-xs')}>
          {description}
        </p>
      )}
      {actionNode}
    </div>
  );
});

export default EmptyState;
