"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface ModalCoreProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
}

export function ModalCore({
  isOpen,
  onClose,
  children,
  className,
  overlayClassName,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  lockScroll = true,
}: ModalCoreProps) {
  // Portal은 클라이언트 마운트 이후에만 렌더 (SSR/hydration 안전)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    if (lockScroll) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (lockScroll) {
        document.body.style.overflow = "";
      }
    };
  }, [isOpen, closeOnEscape, onClose, lockScroll]);

  if (!isOpen || !mounted) return null;

  // 조상 요소의 transform(예: 페이지 fade-in 애니메이션)에 fixed가 갇히는 것을
  // 막기 위해 document.body에 직접 렌더 → 항상 viewport 정중앙에 위치한다.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="닫기"
        className={cn("absolute inset-0 bg-black/40", overlayClassName)}
        onClick={() => {
          if (closeOnOverlayClick) onClose();
        }}
      />
      <div
        className={cn("relative w-full mx-4", className)}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
