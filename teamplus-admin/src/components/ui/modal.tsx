'use client';

/**
 * Modal - TEAMPLUS 표준 모달 컴포넌트
 *
 * === Design 7 Principles ===
 * 1. 화면 분석: 11개 페이지의 모달 패턴 통합
 * 2. 휴먼 디자인: 깔끔하고 직관적인 모달 UI
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 색상: Ice Blue (#1E40AF) 통일
 *
 * === 제공 컴포넌트 ===
 * - Modal: 기본 모달 래퍼
 * - ModalHeader: 제목 및 설명
 * - ModalBody: 컨텐츠 영역
 * - ModalFooter: 버튼 영역
 * - ConfirmModal: 확인/삭제 확인 모달
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { X, AlertTriangle, Trash2, CheckCircle, Info, LucideIcon } from 'lucide-react';
import { ModalCore } from '@/components/ui/core/ModalCore';
import { DialogCore } from '@/components/ui/core/DialogCore';

// ============================================
// 타입 정의
// ============================================

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  /** 모달 열림 상태 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** 모달 크기 */
  size?: ModalSize;
  /** 오버레이 클릭 시 닫기 (기본: true) */
  closeOnOverlayClick?: boolean;
  /** ESC 키로 닫기 (기본: true) */
  closeOnEscape?: boolean;
  /** 닫기 버튼 표시 (기본: false) */
  showCloseButton?: boolean;
  /** 추가 클래스 */
  className?: string;
  /** 자식 요소 */
  children: ReactNode;
}

interface ModalHeaderProps {
  /** 제목 */
  title: string;
  /** 설명 (선택) */
  description?: string;
  /** 아이콘 (선택) */
  icon?: LucideIcon;
  /** 아이콘 배경 색상 */
  iconBgColor?: string;
  /** 아이콘 색상 */
  iconColor?: string;
  /** 중앙 정렬 (기본: false) */
  centered?: boolean;
  /** 추가 클래스 */
  className?: string;
}

interface ModalBodyProps {
  /** 자식 요소 */
  children: ReactNode;
  /** 스크롤 가능 (기본: false) */
  scrollable?: boolean;
  /** 최대 높이 (scrollable일 때) */
  maxHeight?: string;
  /** 추가 클래스 */
  className?: string;
}

interface ModalFooterProps {
  /** 자식 요소 */
  children: ReactNode;
  /** 추가 클래스 */
  className?: string;
}

interface ConfirmModalProps {
  /** 모달 열림 상태 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** 확인 핸들러 */
  onConfirm: () => void;
  /** 제목 */
  title: string;
  /** 설명 */
  description?: string;
  /** 모달 유형 */
  variant?: 'danger' | 'warning' | 'info' | 'success';
  /** 확인 버튼 텍스트 */
  confirmText?: string;
  /** 취소 버튼 텍스트 */
  cancelText?: string;
  /** 확인 버튼 로딩 상태 */
  isLoading?: boolean;
  /** 모달 크기 */
  size?: ModalSize;
}

// ============================================
// 스타일 상수
// ============================================

const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

const variantStyles = {
  danger: {
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    buttonBg: 'bg-red-600 hover:bg-red-700',
    icon: Trash2,
  },
  warning: {
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    buttonBg: 'bg-amber-600 hover:bg-amber-700',
    icon: AlertTriangle,
  },
  info: {
    iconBg: 'bg-primary/10 dark:bg-primary/20',
    iconColor: 'text-primary dark:text-primary-light',
    buttonBg: 'bg-primary hover:bg-primary-dark',
    icon: Info,
  },
  success: {
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    buttonBg: 'bg-green-600 hover:bg-green-700',
    icon: CheckCircle,
  },
};

// ============================================
// Modal 컴포넌트
// ============================================

export function Modal({
  isOpen,
  onClose,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = false,
  className,
  children,
}: ModalProps) {
  return (
    <ModalCore
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick={closeOnOverlayClick}
      closeOnEscape={closeOnEscape}
      className={cn(
        'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg relative',
        sizeStyles[size],
        className
      )}
    >
        {showCloseButton && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors z-10"
            aria-label="닫기"
          >
            <X className="w-5 h-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
          </button>
        )}
        {children}
    </ModalCore>
  );
}

// ============================================
// ModalHeader 컴포넌트
// ============================================

export function ModalHeader({
  title,
  description,
  icon: Icon,
  iconBgColor,
  iconColor,
  centered = false,
  className,
}: ModalHeaderProps) {
  return (
    <div
      className={cn(
        'p-6',
        description && 'pb-4',
        centered && 'text-center',
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center mb-4',
            centered && 'mx-auto',
            iconBgColor || 'bg-primary/10'
          )}
        >
          <Icon className={cn('w-6 h-6', iconColor || 'text-primary dark:text-primary-light')} />
        </div>
      )}
      <h2
        className={cn(
          'text-xl font-bold text-slate-900 dark:text-white',
          description && 'mb-2'
        )}
      >
        {title}
      </h2>
      {description && (
        <p className="text-slate-500 dark:text-slate-400 text-sm">{description}</p>
      )}
    </div>
  );
}

// ============================================
// ModalBody 컴포넌트
// ============================================

export function ModalBody({
  children,
  scrollable = false,
  maxHeight = '60vh',
  className,
}: ModalBodyProps) {
  return (
    <div
      className={cn(
        'px-6 pb-6',
        scrollable && 'overflow-y-auto',
        className
      )}
      style={scrollable ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}

// ============================================
// ModalFooter 컴포넌트
// ============================================

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div
      className={cn(
        'px-6 pb-6 pt-2 flex gap-3',
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================
// ConfirmModal 컴포넌트 (삭제/확인용)
// ============================================

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description = '이 작업은 되돌릴 수 없습니다.',
  variant = 'danger',
  confirmText = '확인',
  cancelText = '취소',
  isLoading = false,
  size = 'sm',
}: ConfirmModalProps) {
  const styles = variantStyles[variant];
  const Icon = styles.icon;

  return (
    <DialogCore
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      message={description}
      icon={<Icon className={cn('w-6 h-6', styles.iconColor)} />}
      iconWrapperClassName={styles.iconBg}
      className={sizeStyles[size]}
      actions={(
        <div className="flex gap-3">
          <Button
            onClick={onClose}
            variant="outline"
            disabled={isLoading}
            className="flex-1 h-11 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-500 hover:border-slate-400 dark:hover:border-slate-400 font-medium transition-all duration-150 active:scale-[0.98]"
          >
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'flex-1 h-11 text-white font-semibold shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-150',
              styles.buttonBg
            )}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                처리 중...
              </div>
            ) : (
              confirmText
            )}
          </Button>
        </div>
      )}
    />
  );
}

// ============================================
// 헬퍼: FormModal 패턴 예시
// ============================================

/**
 * FormModal 사용 예시:
 *
 * <Modal isOpen={showModal} onClose={() => setShowModal(false)} size="md">
 *   <ModalHeader title="새 회원 추가" description="회원 정보를 입력하세요" />
 *   <ModalBody>
 *     <div className="space-y-4">
 *       <Input placeholder="이름" />
 *       <Input placeholder="이메일" />
 *     </div>
 *   </ModalBody>
 *   <ModalFooter>
 *     <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">
 *       취소
 *     </Button>
 *     <Button onClick={handleSubmit} className="flex-1 bg-primary">
 *       저장하기
 *     </Button>
 *   </ModalFooter>
 * </Modal>
 */

export default Modal;
