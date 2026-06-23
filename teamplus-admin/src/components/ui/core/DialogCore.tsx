"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ModalCore } from "./ModalCore";

interface DialogCoreProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
  messageClassName?: string;
  iconWrapperClassName?: string;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

export function DialogCore({
  isOpen,
  onClose,
  title,
  message,
  icon,
  actions,
  className,
  titleClassName,
  messageClassName,
  iconWrapperClassName,
  closeOnOverlayClick = true,
  closeOnEscape = true,
}: DialogCoreProps) {
  return (
    <ModalCore
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick={closeOnOverlayClick}
      closeOnEscape={closeOnEscape}
      lockScroll={false}
      className={cn("w-full max-w-sm", className)}
    >
      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl ring-1 ring-white/10">
        <div className="p-6 text-center">
          {icon && (
            <div className={cn("w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center", iconWrapperClassName)}>
              {icon}
            </div>
          )}
          <h3 className={cn("text-lg font-bold text-slate-900 dark:text-white", titleClassName)}>
            {title}
          </h3>
          {message && (
            <p className={cn("mt-2 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-line", messageClassName)}>
              {message}
            </p>
          )}
        </div>
        {actions && (
          <div className="px-6 pb-6">
            {actions}
          </div>
        )}
      </div>
    </ModalCore>
  );
}
