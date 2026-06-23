'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { ui as nativeUI } from '@/services/native-bridge';
import { isNativeApp } from '@/lib/environment';

// [수정 2026-05-30] 시스템 UI(statusBar/navBar/scrim) dim 색을 웹 표준과 통일.
//   종전 slate-950/70 색은 웹 `.overlay-fullscreen-dim`(rink-900/55)과 hue·alpha
//   가 모두 달라 모달 오픈 시 네이티브 safe-area(상단 status bar / 하단 home indicator)가
//   본문 dim 과 다른 색으로 보이던 불일치의 원인이었다.
//   → SoT #8C141826(= rgb(20 24 38 / 0.55), rink-900/55)로 통일. Flutter Color(int) 파서
//     호환 AARRGGBB 8자리 HEX. SPEC: docs/Planning/SPEC_POPUP_FULLSCREEN_DIM.md §2.4
const DIM_OVERLAY_HEX = '#8C141826';

// ============ Types ============

export type ModalVariant = 'default' | 'danger' | 'success' | 'warning';
export type ModalSize = 'sm' | 'md' | 'lg' | 'full';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ModalVariant;
  icon?: string;
}

export interface AlertOptions {
  title?: string;
  message: string;
  buttonText?: string;
  variant?: ModalVariant;
  icon?: string;
}

export interface CustomModalOptions {
  content: ReactNode;
  size?: ModalSize;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  title?: string;
}

interface ModalState {
  id: string;
  type: 'confirm' | 'alert' | 'custom';
  isOpen: boolean;
  options: ConfirmOptions | AlertOptions | CustomModalOptions;
  resolve?: (value: boolean) => void;
}

interface ModalContextType {
  modals: ModalState[];
  modal: {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    alert: (options: AlertOptions | string) => Promise<void>;
    open: (options: CustomModalOptions) => string;
    close: (id?: string) => void;
    closeAll: () => void;
  };
}

// ============ Context ============

const ModalContext = createContext<ModalContextType | null>(null);

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}

// ============ Provider ============

interface ModalProviderProps {
  children: ReactNode;
}

export function ModalProvider({ children }: ModalProviderProps) {
  const [modals, setModals] = useState<ModalState[]>([]);
  // 최근 브릿지 상태를 추적: true = dim 적용 중, false = 기본값
  const dimAppliedRef = useRef<boolean>(false);

  // 모달 스택 변화 → Flutter 시스템 UI 색상 동기화
  // 첫 모달이 열릴 때(빈 스택 → 1+): statusBar·navigationBar·scaffold를 dim 색으로 설정
  // 마지막 모달이 닫힐 때(1+ → 빈 스택): 세 필드를 null로 보내 기본값 복원
  useEffect(() => {
    if (!isNativeApp()) return;
    const shouldDim = modals.length > 0;
    if (shouldDim === dimAppliedRef.current) return; // 중복 호출 방지

    // scaffoldBackgroundColor는 InAppWebView 합성과 충돌하여 팝업 자체가 안 보이는
    // 증상이 발생하므로 현재는 statusBar + navigationBar만 조정한다.
    //
    // showScrim 병행:
    //   · iOS 는 statusBarColor/systemNavigationBarColor 를 무시하므로
    //     showScrim(IgnorePointer Container)만이 유일한 safe area dim 해법.
    //   · Android 는 statusBarColor/navigationBarColor 가 동작하지만,
    //     showScrim 을 함께 켜면 WebView 합성 전체를 균일하게 덮어 시각적 통일감 향상.
    const config = shouldDim
      ? {
          statusBarColor: DIM_OVERLAY_HEX,
          navigationBarColor: DIM_OVERLAY_HEX,
          showScrim: true,
          scrimColor: DIM_OVERLAY_HEX,
        }
      : {
          // 명시적 null 전달 → Flutter에서 _statusBarColor 등을 null로 리셋해 기본 색 복원
          statusBarColor: null,
          navigationBarColor: null,
          showScrim: false,
        };

    dimAppliedRef.current = shouldDim;
    // nativeUI.setConfig는 내부적으로 bridge 실패 시 handleBridgeError로 처리하므로
    // 여기서 별도 try/catch 불필요. Promise는 무시해도 안전함.
    void nativeUI.setConfig(config);
  }, [modals.length]);

  const generateId = () => `modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Confirm Dialog - Returns Promise<boolean>
  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      const id = generateId();
      setModals((prev) => [
        ...prev,
        {
          id,
          type: 'confirm',
          isOpen: true,
          options: {
            title: options.title || '확인',
            confirmText: options.confirmText || '확인',
            cancelText: options.cancelText || '취소',
            variant: options.variant || 'default',
            ...options,
          },
          resolve,
        },
      ]);
    });
  }, []);

  // Alert Dialog - Returns Promise<void>
  const alert = useCallback((options: AlertOptions | string): Promise<void> => {
    return new Promise((resolve) => {
      const id = generateId();
      const normalizedOptions: AlertOptions =
        typeof options === 'string'
          ? { message: options }
          : options;

      setModals((prev) => [
        ...prev,
        {
          id,
          type: 'alert',
          isOpen: true,
          options: {
            title: normalizedOptions.title || '알림',
            buttonText: normalizedOptions.buttonText || '확인',
            variant: normalizedOptions.variant || 'default',
            ...normalizedOptions,
          },
          resolve: () => resolve(),
        },
      ]);
    });
  }, []);

  // Custom Modal - Returns modal ID
  const open = useCallback((options: CustomModalOptions): string => {
    const id = generateId();
    setModals((prev) => [
      ...prev,
      {
        id,
        type: 'custom',
        isOpen: true,
        options: {
          size: options.size || 'md',
          showCloseButton: options.showCloseButton ?? true,
          closeOnOverlayClick: options.closeOnOverlayClick ?? true,
          ...options,
        },
      },
    ]);
    return id;
  }, []);

  // Close specific modal or the last one
  const close = useCallback((id?: string) => {
    setModals((prev) => {
      if (id) {
        const modal = prev.find((m) => m.id === id);
        if (modal?.resolve) {
          modal.resolve(false);
        }
        return prev.filter((m) => m.id !== id);
      }

      // Close last modal
      if (prev.length > 0) {
        const lastModal = prev[prev.length - 1];
        if (lastModal.resolve) {
          lastModal.resolve(false);
        }
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  // Close all modals
  const closeAll = useCallback(() => {
    setModals((prev) => {
      prev.forEach((modal) => {
        if (modal.resolve) {
          modal.resolve(false);
        }
      });
      return [];
    });
  }, []);

  // Handle confirm action
  const handleConfirm = useCallback((id: string) => {
    setModals((prev) => {
      const modal = prev.find((m) => m.id === id);
      if (modal?.resolve) {
        modal.resolve(true);
      }
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  // Handle cancel/close action
  const handleCancel = useCallback((id: string) => {
    setModals((prev) => {
      const modal = prev.find((m) => m.id === id);
      if (modal?.resolve) {
        modal.resolve(false);
      }
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  const value: ModalContextType = {
    modals,
    modal: {
      confirm,
      alert,
      open,
      close,
      closeAll,
    },
  };

  return (
    <ModalContext.Provider value={value}>
      {children}
      <ModalContainer
        modals={modals}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onClose={close}
      />
    </ModalContext.Provider>
  );
}

// ============ Modal Container (renders all modals) ============

import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { AlertDialog } from './AlertDialog';

interface ModalContainerProps {
  modals: ModalState[];
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onClose: (id: string) => void;
}

function ModalContainer({ modals, onConfirm, onCancel, onClose }: ModalContainerProps) {
  if (modals.length === 0) return null;

  return (
    <>
      {modals.map((modal) => {
        switch (modal.type) {
          case 'confirm':
            return (
              <ConfirmDialog
                key={modal.id}
                isOpen={modal.isOpen}
                options={modal.options as ConfirmOptions}
                onConfirm={() => onConfirm(modal.id)}
                onCancel={() => onCancel(modal.id)}
              />
            );
          case 'alert':
            return (
              <AlertDialog
                key={modal.id}
                isOpen={modal.isOpen}
                options={modal.options as AlertOptions}
                onClose={() => onClose(modal.id)}
              />
            );
          case 'custom':
            const customOptions = modal.options as CustomModalOptions;
            return (
              <Modal
                key={modal.id}
                isOpen={modal.isOpen}
                onClose={() => onClose(modal.id)}
                title={customOptions.title}
                size={customOptions.size}
                showCloseButton={customOptions.showCloseButton}
                closeOnOverlayClick={customOptions.closeOnOverlayClick}
              >
                {customOptions.content}
              </Modal>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
