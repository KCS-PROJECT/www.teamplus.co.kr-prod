'use client';

import { memo, useEffect, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { Button } from '../Button';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import type { AlertOptions, ModalVariant } from './ModalContext';
import { cn } from '@/lib/utils';

// DialogCore implementation
interface DialogCoreProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string | ReactNode;
  icon?: ReactNode;
  iconWrapperClassName?: string;
  actions?: ReactNode;
  className?: string;
}

function DialogCore({
  isOpen,
  onClose,
  title,
  message,
  icon,
  iconWrapperClassName,
  actions,
  className,
}: DialogCoreProps) {
  // [2026-05-16 SoT] viewport 전체 dim — overlay-fullscreen-wrapper +
  //   overlay-fullscreen-dim 표준화. Native safe-area 는 #8C141826 (rink-900/55).
  //   SPEC: docs/Planning/SPEC_POPUP_FULLSCREEN_DIM.md
  useNativeScrim(isOpen, '#8C141826');

  if (!isOpen) return null;

  return (
    <div className="overlay-fullscreen-wrapper items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* Dim overlay — overlay-fullscreen-dim (rink-900 / 55%), blur 미사용 */}
      <div
        className="overlay-fullscreen-dim"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div
        className={cn(
          'relative pointer-events-auto bg-wsurface dark:bg-rink-800',
          'rounded-[28px] shadow-sh-rink ring-1 ring-wline-2 dark:ring-rink-700/60',
          'max-w-sm w-full p-6',
          className
        )}
      >
        {/* Icon */}
        {icon && (
          <div className="flex justify-center mb-4">
            <div className={cn('w-14 h-14 rounded-full flex items-center justify-center', iconWrapperClassName)}>
              {icon}
            </div>
          </div>
        )}
        {/* Title */}
        {title && (
          <h2 className="text-w-title font-bold tracking-tight text-center text-wtext-1 dark:text-white mb-2">
            {title}
          </h2>
        )}
        {/* Message */}
        {message && (
          <p className="text-center text-wtext-3 dark:text-rink-300 mb-6">
            {message}
          </p>
        )}
        {/* Actions */}
        {actions && (
          <div className="flex flex-col gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Types ============

interface AlertDialogProps {
  isOpen: boolean;
  options: AlertOptions;
  onClose: () => void;
}

// ============ Variant Configs ============

const variantConfig: Record<
  ModalVariant,
  {
    iconBg: string;
    iconColor: string;
    icon: string;
  }
> = {
  default: {
    iconBg: 'bg-ice-100 dark:bg-ice-900/40',
    iconColor: 'text-ice-600 dark:text-ice-300',
    icon: 'info',
  },
  danger: {
    iconBg: 'bg-red-100 dark:bg-red-900/20',
    iconColor: 'text-red-600 dark:text-red-400',
    icon: 'error',
  },
  success: {
    iconBg: 'bg-green-100 dark:bg-green-900/20',
    iconColor: 'text-green-600 dark:text-green-400',
    icon: 'check_circle',
  },
  warning: {
    iconBg: 'bg-amber-100 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    icon: 'warning',
  },
};

// ============ AlertDialog Component ============

export const AlertDialog = memo(function AlertDialog({
  isOpen,
  options,
  onClose,
}: AlertDialogProps) {
  const {
    title = '알림',
    message,
    buttonText = '확인',
    variant = 'default',
    icon,
  } = options;

  const config = variantConfig[variant];
  const displayIcon = icon || config.icon;

  // Handle ESC and Enter keys
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        onClose();
      }
    },
    [onClose]
  );

  // Prevent body scroll and add keyboard listener
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      lockBodyScroll();

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        unlockBodyScroll();
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;
  if (typeof window === 'undefined') return null;

  const content = (
    <DialogCore
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      message={message}
      icon={<Icon name={displayIcon} className={cn('text-3xl', config.iconColor)} />}
      iconWrapperClassName={config.iconBg}
      actions={(
        <Button variant="primary" fullWidth onClick={onClose}>
          {buttonText}
        </Button>
      )}
      className="animate-in fade-in duration-200"
    />
  );

  return createPortal(content, document.body);
});
