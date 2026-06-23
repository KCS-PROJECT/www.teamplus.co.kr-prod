/**
 * useDateTime Hook (Admin · Web 와 동일 시그니처)
 *
 * @example
 *   const { data, year, month, date, weeklyDates, isLoading, refresh } = useDateTime();
 *   const { weeklyDates, monthlyDates } = useDateTime('20260415');
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { datetimeService, type DateTimeData } from '../services/datetime.service';

export interface UseDateTimeOptions {
  /** 자동 재호출 주기 (ms). 0 또는 undefined 면 1회만 호출 */
  autoRefreshMs?: number;
  /** 자동 호출 비활성화 (수동 refresh 만 사용) */
  enabled?: boolean;
}

export interface UseDateTimeResult {
  data: DateTimeData | null;
  year: string;
  month: string;
  date: string;
  dateTime: string;
  dateTimeSecond: string;
  dateTimeMillisecond: string;
  weeklyDates: string[];
  monthlyDates: string[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const EMPTY_ARR: string[] = [];

export function useDateTime(
  baseDate?: string,
  options: UseDateTimeOptions = {},
): UseDateTimeResult {
  const { autoRefreshMs, enabled = true } = options;

  const [data, setData] = useState<DateTimeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await datetimeService.getAll(baseDate);
      if (mountedRef.current) setData(result);
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [baseDate, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefreshMs || autoRefreshMs <= 0 || !enabled) return;
    const id = setInterval(() => {
      void refresh();
    }, autoRefreshMs);
    return () => clearInterval(id);
  }, [autoRefreshMs, enabled, refresh]);

  return {
    data,
    year: data?.year ?? '',
    month: data?.month ?? '',
    date: data?.date ?? '',
    dateTime: data?.dateTime ?? '',
    dateTimeSecond: data?.dateTimeSecond ?? '',
    dateTimeMillisecond: data?.dateTimeMillisecond ?? '',
    weeklyDates: data?.weeklyDates ?? EMPTY_ARR,
    monthlyDates: data?.monthlyDates ?? EMPTY_ARR,
    isLoading,
    error,
    refresh,
  };
}

export default useDateTime;
