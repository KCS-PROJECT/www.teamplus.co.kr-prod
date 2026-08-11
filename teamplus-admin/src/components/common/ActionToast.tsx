'use client';

/**
 * ActionToast — 작업 결과 알림 (성공/실패)
 *
 * 페이지 흐름이 아니라 **body 포털 + fixed + z-[9999]** 로 렌더한다.
 * 이유: `Modal` 은 `createPortal` 로 body 에 `z-50` 오버레이를 그리므로,
 *   페이지 트리 안의 일반 배너는 모달이 열려 있을 때 그 뒤에 깔려 보이지 않는다.
 *   등록·수정 실패 같은 "모달 안에서 발생하는 에러"가 사용자에게 전달되지 않는 문제를 막는다.
 *
 * 배치·z-index 는 기존 `components/auth/UnauthorizedToastListener` 와 동일 계열로 맞췄다.
 *
 * 자동 소멸은 **호출부 책임**이다 — 기존 페이지들이 `setTimeout` 으로 `actionMsg` 를
 * null 로 되돌리는 패턴을 이미 쓰고 있어, 그 패턴을 그대로 재사용할 수 있게 남겨 둔다.
 *
 * 사용:
 * ```tsx
 * const [actionMsg, setActionMsg] = useState<ActionToastValue>(null);
 * ...
 * <ActionToast value={actionMsg} onClose={() => setActionMsg(null)} />
 * ```
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export type ActionToastValue = {
  type: 'success' | 'error';
  text: string;
} | null;

interface ActionToastProps {
  /** 표시할 값. null 이면 렌더하지 않는다 (기존 `actionMsg` 상태를 그대로 넘기면 된다). */
  value: ActionToastValue;
  /** 닫기 버튼 핸들러. 주지 않으면 닫기 버튼을 노출하지 않는다. */
  onClose?: () => void;
}

const VARIANT = {
  success: {
    className:
      'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400',
    Icon: CheckCircle2,
  },
  error: {
    className:
      'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400',
    Icon: AlertCircle,
  },
} as const;

export function ActionToast({ value, onClose }: ActionToastProps) {
  // 포털은 클라이언트에서만 — SSR 하이드레이션 불일치 방지
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !value) return null;

  const { className, Icon } = VARIANT[value.type];

  return createPortal(
    <div
      role="status"
      aria-live={value.type === 'error' ? 'assertive' : 'polite'}
      className={`fixed top-4 left-1/2 z-[9999] -translate-x-1/2 flex items-start gap-2 min-w-[280px] max-w-[480px] rounded-lg border px-4 py-3 text-sm shadow-lg ${className}`}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 leading-relaxed break-words">{value.text}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex-shrink-0 -mr-1 -mt-0.5 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors motion-reduce:transition-none"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>,
    document.body,
  );
}
