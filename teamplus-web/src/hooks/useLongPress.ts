'use client';

import { useCallback, useRef, useState } from 'react';

interface UseLongPressOptions {
  threshold?: number;
  onStart?: () => void;
  onFinish?: () => void;
  onCancel?: () => void;
}

/**
 * 롱 프레스(길게 누르기) 감지 Hook
 */
export function useLongPress(
  callback: () => void,
  { threshold = 500, onStart, onFinish, onCancel }: UseLongPressOptions = {}
) {
  const [isPressed, setIsPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    setIsPressed(true);
    onStart?.();
    timerRef.current = setTimeout(() => {
      callback();
      setIsPressed(false);
      onFinish?.();
    }, threshold);
  }, [callback, threshold, onStart, onFinish]);

  const cancel = useCallback(() => {
    setIsPressed(false);
    onCancel?.();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [onCancel]);

  return {
    handlers: {
      onMouseDown: start,
      onMouseUp: cancel,
      onMouseLeave: cancel,
      onTouchStart: start,
      onTouchEnd: cancel,
    },
    isPressed,
  };
}
