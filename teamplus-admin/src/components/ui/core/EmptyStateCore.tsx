'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateCoreProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}

export function EmptyStateCore({
  icon,
  title,
  description,
  action,
  className,
  iconClassName,
  titleClassName,
  descriptionClassName,
}: EmptyStateCoreProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {icon && (
        <div className={cn('mb-5 flex items-center justify-center', iconClassName)}>
          {icon}
        </div>
      )}
      <h3 className={cn('text-lg font-bold', titleClassName)}>{title}</h3>
      {description && (
        <p className={cn('text-sm mt-2 max-w-xs', descriptionClassName)}>{description}</p>
      )}
      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}
