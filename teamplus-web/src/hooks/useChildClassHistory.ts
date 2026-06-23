'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

/**
 * useChildClassHistory (Task #28 C-6)
 *
 * Backend: GET /api/v1/children/:childId/class-history?year=YYYY
 * Response: ChildClassHistoryMonth[]
 *   = { month: 1-12, classes: ChildClassHistoryItem[] }[]
 *
 * - PARENT 본인 자녀만 조회 가능 (BE가 ParentChild 링크 검증)
 * - COACH / DIRECTOR / ACADEMY_DIRECTOR / ADMIN 허용
 */

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'cancelled';

export interface ChildClassHistoryItem {
  name: string;
  attendedAt: string; // ISO
  creditUsed: boolean;
  status: AttendanceStatus | string;
}

export interface ChildClassHistoryMonth {
  month: number; // 1..12
  classes: ChildClassHistoryItem[];
}

export interface ChildClassHistorySummary {
  totalClasses: number;
  present: number;
  absent: number;
  late: number;
  creditUsedCount: number;
}

interface UseChildClassHistoryOptions {
  childId: string | null | undefined;
  initialYear?: number;
}

interface UseChildClassHistoryReturn {
  currentYear: number;
  months: ChildClassHistoryMonth[];
  summary: ChildClassHistorySummary;
  maxMonthCount: number;
  isLoading: boolean;
  errorMessage: string | null;
  hasAny: boolean;
  goToPrevYear: () => void;
  goToNextYear: () => void;
  goToCurrentYear: () => void;
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function buildEmptyMonths(): ChildClassHistoryMonth[] {
  const empty: ChildClassHistoryMonth[] = [];
  for (let m = 1; m <= 12; m += 1) {
    empty.push({ month: m, classes: [] });
  }
  return empty;
}

function normalize(
  raw: unknown,
): ChildClassHistoryMonth[] {
  const base = buildEmptyMonths();
  if (!Array.isArray(raw)) return base;
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Partial<ChildClassHistoryMonth>;
    const month = r.month;
    if (typeof month !== 'number' || month < 1 || month > 12) continue;
    base[month - 1] = {
      month,
      classes: Array.isArray(r.classes) ? r.classes : [],
    };
  }
  return base;
}

// ────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────

export function useChildClassHistory(
  options: UseChildClassHistoryOptions,
): UseChildClassHistoryReturn {
  const { childId, initialYear } = options;

  const thisYear = useMemo(() => new Date().getFullYear(), []);
  const [currentYear, setCurrentYear] = useState<number>(
    initialYear ?? thisYear,
  );
  const [months, setMonths] = useState<ChildClassHistoryMonth[]>(() =>
    buildEmptyMonths(),
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!childId) {
      setMonths(buildEmptyMonths());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const response = await api.get<ChildClassHistoryMonth[]>(
      `/children/${childId}/class-history`,
      {
        params: { year: String(currentYear) },
        retry: false,
      },
    );

    if (!response.success) {
      setMonths(buildEmptyMonths());
      setErrorMessage(
        response.error?.message || MESSAGES.calendar.loadError,
      );
      setIsLoading(false);
      return;
    }

    setMonths(normalize(response.data));
    setIsLoading(false);
  }, [childId, currentYear]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const summary: ChildClassHistorySummary = useMemo(() => {
    const acc: ChildClassHistorySummary = {
      totalClasses: 0,
      present: 0,
      absent: 0,
      late: 0,
      creditUsedCount: 0,
    };
    for (const m of months) {
      for (const c of m.classes) {
        acc.totalClasses += 1;
        if (c.status === 'present') acc.present += 1;
        else if (c.status === 'absent') acc.absent += 1;
        else if (c.status === 'late') acc.late += 1;
        if (c.creditUsed) acc.creditUsedCount += 1;
      }
    }
    return acc;
  }, [months]);

  const maxMonthCount = useMemo(() => {
    return months.reduce(
      (max, m) => (m.classes.length > max ? m.classes.length : max),
      0,
    );
  }, [months]);

  const hasAny = summary.totalClasses > 0;

  const goToPrevYear = useCallback(() => {
    setCurrentYear((prev) => prev - 1);
  }, []);

  const goToNextYear = useCallback(() => {
    setCurrentYear((prev) => prev + 1);
  }, []);

  const goToCurrentYear = useCallback(() => {
    setCurrentYear(thisYear);
  }, [thisYear]);

  return {
    currentYear,
    months,
    summary,
    maxMonthCount,
    isLoading,
    errorMessage,
    hasAny,
    goToPrevYear,
    goToNextYear,
    goToCurrentYear,
  };
}
