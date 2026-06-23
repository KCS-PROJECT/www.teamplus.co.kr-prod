'use client';

import { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

type EmptyStateVariant = 'notifications' | 'search' | 'error' | 'generic' | 'filter';

interface EmptyStateProps {
  /** 변형 타입 */
  variant?: EmptyStateVariant;
  /** 커스텀 아이콘 */
  icon?: string;
  /** 제목 */
  title?: string;
  /** 설명 */
  description?: string;
  /** 액션 버튼 라벨 */
  actionLabel?: string;
  /** 액션 클릭 핸들러 */
  onAction?: () => void;
  /** 추가 클래스 */
  className?: string;
}

/** 기본 설정 */
const VARIANT_DEFAULTS: Record<EmptyStateVariant, { icon: string; title: string; description: string }> = {
  notifications: {
    icon: 'notifications_off',
    title: '알림이 없습니다',
    description: '새로운 알림이 도착하면 여기에 표시됩니다.',
  },
  search: {
    icon: 'search_off',
    title: '검색 결과가 없습니다',
    description: '다른 검색어로 다시 시도해보세요.',
  },
  error: {
    icon: 'error_outline',
    title: '오류가 발생했습니다',
    description: '잠시 후 다시 시도해주세요.',
  },
  generic: {
    icon: 'inbox',
    title: '데이터가 없습니다',
    description: '표시할 내용이 없습니다.',
  },
  filter: {
    icon: 'filter_list_off',
    title: '조건에 맞는 알림이 없습니다',
    description: '다른 필터를 선택해보세요.',
  },
};

/**
 * EmptyStateCore - 내부 구현
 */
interface EmptyStateCoreProps {
  className?: string;
  icon: ReactNode;
  title: string;
  description: string;
  titleClassName?: string;
  descriptionClassName?: string;
  action?: ReactNode;
}

function EmptyStateCore({
  className = '',
  icon,
  title,
  description,
  titleClassName = '',
  descriptionClassName = '',
  action,
}: EmptyStateCoreProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {icon}
      <h3 className={`mt-4 text-lg font-semibold ${titleClassName}`}>{title}</h3>
      <p className={`mt-2 text-sm ${descriptionClassName}`}>{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function EmptyState({
  variant = 'generic',
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  const defaults = VARIANT_DEFAULTS[variant];

  return (
    <EmptyStateCore
      className={className}
      icon={(
        <div className="w-20 h-20 rounded-full bg-wline-2 dark:bg-rink-800 flex items-center justify-center">
          <Icon
            name={icon || defaults.icon}
            className="text-4xl text-wtext-3 dark:text-rink-300"
          />
        </div>
      )}
      title={title || defaults.title}
      description={description || defaults.description}
      titleClassName="text-wtext-2 dark:text-rink-100"
      descriptionClassName="text-wtext-3 dark:text-rink-300"
      action={actionLabel && onAction ? (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    />
  );
}
