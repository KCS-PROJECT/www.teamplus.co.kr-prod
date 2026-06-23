'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface DebounceOptions {
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number;
}

const DEFAULT_DELAY_MS = 300;

/**
 * 값 디바운싱 Hook
 */
export function useDebounce<T>(value: T, delay: number = DEFAULT_DELAY_MS): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * 디바운스 콜백 Hook
 */
export function useDebouncedCallback<TArgs extends unknown[], TReturn>(
  callback: (...args: TArgs) => TReturn,
  delay: number = DEFAULT_DELAY_MS,
  options: DebounceOptions = {}
): [(...args: TArgs) => void, () => void, () => void] {
  const { leading = false, trailing = true, maxWait } = options;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastArgsRef = useRef<TArgs | null>(null);
  const lastCallTimeRef = useRef<number>(0);
  const isLeadingInvokedRef = useRef<boolean>(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (maxWaitTimeoutRef.current) {
      clearTimeout(maxWaitTimeoutRef.current);
      maxWaitTimeoutRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimers();
    lastArgsRef.current = null;
    isLeadingInvokedRef.current = false;
  }, [clearTimers]);

  const flush = useCallback(() => {
    if (lastArgsRef.current) {
      callback(...lastArgsRef.current);
      lastArgsRef.current = null;
    }
    clearTimers();
    isLeadingInvokedRef.current = false;
  }, [callback, clearTimers]);

  const debouncedCallback = useCallback(
    (...args: TArgs) => {
      const now = Date.now();
      lastArgsRef.current = args;
      lastCallTimeRef.current = now;

      if (leading && !isLeadingInvokedRef.current) {
        isLeadingInvokedRef.current = true;
        callback(...args);
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (trailing) {
        timeoutRef.current = setTimeout(() => {
          if (lastArgsRef.current && (!leading || lastArgsRef.current !== args)) {
            callback(...lastArgsRef.current);
          }
          lastArgsRef.current = null;
          isLeadingInvokedRef.current = false;
          timeoutRef.current = null;
        }, delay);
      }

      if (maxWait !== undefined && !maxWaitTimeoutRef.current) {
        maxWaitTimeoutRef.current = setTimeout(() => {
          if (lastArgsRef.current) {
            callback(...lastArgsRef.current);
            lastArgsRef.current = null;
          }
          isLeadingInvokedRef.current = false;
          maxWaitTimeoutRef.current = null;

          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }, maxWait);
      }
    },
    [callback, delay, leading, trailing, maxWait]
  );

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return [debouncedCallback, cancel, flush];
}

/**
 * 디바운스 상태 Hook (로딩 상태 포함)
 */
export function useDebouncedState<T>(
  initialValue: T,
  delay: number = DEFAULT_DELAY_MS
): [T, T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);
  const [isDebouncing, setIsDebouncing] = useState(false);

  useEffect(() => {
    if (value === debouncedValue) {
      setIsDebouncing(false);
      return;
    }

    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedValue(value);
      setIsDebouncing(false);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay, debouncedValue]);

  return [value, debouncedValue, setValue, isDebouncing];
}

export default useDebounce;
