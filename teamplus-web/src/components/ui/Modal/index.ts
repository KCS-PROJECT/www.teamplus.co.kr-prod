// Modal System Exports
// Unified popup system for TEAMPLUS

// Context & Provider
export {
  ModalProvider,
  useModal,
  type ModalVariant,
  type ModalSize,
  type ConfirmOptions,
  type AlertOptions,
  type CustomModalOptions,
} from './ModalContext';

// Components
export { Modal, type ModalProps } from './Modal';
export { ConfirmDialog } from './ConfirmDialog';
export { AlertDialog } from './AlertDialog';
export { FullModal, type FullModalProps } from './FullModal';
