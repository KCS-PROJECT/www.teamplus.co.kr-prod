'use client';

import type { ReactNode } from 'react';
import { EmptyStateCore } from '@/components/ui/core/EmptyStateCore';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <EmptyStateCore
      className={cn(className)}
      icon={icon}
      title={title}
      description={description}
      titleClassName="text-slate-700 dark:text-slate-300"
      descriptionClassName="text-slate-500 dark:text-slate-400"
      action={actionLabel && onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    />
  );
}
