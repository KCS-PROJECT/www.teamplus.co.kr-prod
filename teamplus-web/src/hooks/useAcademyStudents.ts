'use client';

/**
 * useAcademyStudents — 학원 수강생 데이터 페칭 훅
 *
 * v1 (SPEC_ACADEMY_STUDENTS_REDESIGN.md · 2026-05-18):
 *  - useAcademyClassesSummary (Master 수업 카드 리스트)
 *  - useAcademyStudentSearch  (학원 내 학생 통합 검색)  → @deprecated (v2에서 통합)
 *  - useAcademyClassStudents  (Detail 수업별 수강생 + 무한스크롤) → 유지
 *
 * v2 (SPEC_ACADEMY_STUDENTS_REDESIGN_V2.md · 2026-05-18):
 *  - useAcademyStudents       (학생 단위 단일 리스트 + 검색 + 무한스크롤 + summary)
 *
 * v3 (SPEC_ACADEMY_STUDENTS_REDESIGN_V3.md · 2026-05-18):
 *  - useAcademyClassesSummary 재활성화: 기본 모드(검색어 없음) 데이터 소스로 부활
 *  - useAcademyClassesSummary / useAcademyStudents 양쪽에 `enabled` 가드 추가
 *    → 모드 분기 (기본/검색) 에서 비활성 모드 fetch 차단
 *
 * 백엔드 응답 형식: { success: true, data: {...} } — 한 번 더 unwrap 필요.
 * 데이터 패턴: useState + useEffect + useCallback (TanStack Query 미사용).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/services/api-client';
import { useDebounce } from '@/hooks/useDebounce';

/* ───────────────────────── 타입 ───────────────────────── */

export type AcademyClassStatusFilter = 'active' | 'ended' | 'all';
export type AcademyClassSort = 'enrollment_count' | 'recent' | 'name';

export interface AcademyClassSummary {
  id: string;
  className: string;
  trainingType: string | null;
  scheduleSummary: string;
  durationMinutes: number;
  startDate: string;
  endDate: string | null;
  status: 'active' | 'ended';
  enrollmentCount: number;
  pendingCount: number;
}

export interface AcademyStudentsSummary {
  uniqueStudentCount: number;
  totalClassCount: number;
  activeClassCount: number;
  endedClassCount: number;
}

export interface AcademyClassesSummaryResponse {
  summary: AcademyStudentsSummary;
  classes: AcademyClassSummary[];
  pagination: { total: number; page: number; limit: number };
}

export interface AcademyStudentSearchEntry {
  childId: string;
  childName: string;
  parentId: string;
  parentName: string;
  parentPhone: string | null;
  enrolledClasses: Array<{
    classId: string;
    className: string;
    status: string;
  }>;
}

export interface AcademyStudentSearchResponse {
  results: AcademyStudentSearchEntry[];
  pagination: { total: number; page: number; limit: number };
}

export type AcademyEnrollmentStatusFilter = 'paid' | 'pending' | 'all';
export type AcademyEnrollmentSort = 'recent' | 'oldest' | 'name';

export interface AcademyClassStudent {
  enrollmentId: string;
  childId: string;
  childName: string;
  parentId: string;
  parentName: string;
  parentPhone: string | null;
  status: string;
  paidAt: string | null;
  requestedAt: string;
}

export interface AcademyClassStudentsClassInfo {
  id: string;
  className: string;
  scheduleSummary: string;
  durationMinutes: number;
  enrollmentCount: number;
  pendingCount: number;
}

export interface AcademyClassStudentsResponse {
  classInfo: AcademyClassStudentsClassInfo;
  students: AcademyClassStudent[];
  pagination: { total: number; page: number; limit: number };
}

/* ───────────────────────── v2 신규 타입 ───────────────────────── */

export type AcademyStudentsSort = 'recent' | 'name';

export interface AcademyStudentEnrolledClass {
  classId: string;
  className: string;
  status: string;
  trainingType: string | null;
}

export interface AcademyStudentEntry {
  childId: string;
  childName: string;
  parentId: string;
  parentName: string;
  parentPhone: string | null;
  enrolledClasses: AcademyStudentEnrolledClass[];
  /** ISO 문자열. 정렬 + 카드 노출 "M월 D일 등록"용 */
  lastPaidAt: string | null;
}

export interface AcademyStudentsSummaryV2 {
  uniqueStudentCount: number;
  activeClassCount: number;
}

export interface AcademyStudentsResponse {
  summary: AcademyStudentsSummaryV2;
  results: AcademyStudentEntry[];
  pagination: { total: number; page: number; limit: number };
}

/* ───────────────────────── 헬퍼 ───────────────────────── */

type BackendEnvelope<T> = { success: boolean; data: T } | T;

/**
 * 백엔드 응답에서 한 번 더 unwrap.
 * api.get<{success, data}> → response.data?.data || response.data 폴백.
 */
function unwrap<T>(payload: BackendEnvelope<T> | undefined | null): T | null {
  if (!payload) return null;
  if (typeof payload === 'object' && payload !== null && 'data' in payload && 'success' in payload) {
    return (payload as { data: T }).data ?? null;
  }
  return payload as T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    usp.set(key, String(value));
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/* ───────────────────────── 1. Classes Summary (SPEC v3) ───────────────────────── */

export interface UseAcademyClassesSummaryOpts {
  status?: AcademyClassStatusFilter;
  sort?: AcademyClassSort;
  page?: number;
  limit?: number;
}

export interface UseAcademyClassesSummaryControl {
  /**
   * fetch 활성 여부. false 일 때 fetch 스킵 + 즉시 `isLoading=false` 반환.
   * 모드 분기 (검색 모드 / 기본 모드) 에서 비활성 모드 fetch 차단용.
   */
  enabled?: boolean;
}

/**
 * SPEC v3 2026-05-18 — 수업 카드 IA 재활성화. 기본 모드 데이터 소스.
 *   `/academy/{academyId}?tab=students` 기본(검색어 없음) 모드에서 수업 카드 리스트 페칭.
 *   백엔드 `getClassesSummary` 는 `status='active'` 기본값 + isActive=true SoT 적용.
 *
 * @param academyId 학원 ID (null 이면 fetch 스킵)
 * @param opts      status/sort/page/limit (기본 status='active', sort='recent')
 * @param control   { enabled } — 검색 모드 시 false 로 fetch 차단
 */
export function useAcademyClassesSummary(
  academyId: string | null,
  opts: UseAcademyClassesSummaryOpts = {},
  control: UseAcademyClassesSummaryControl = {},
) {
  const { status = 'active', sort = 'recent', page = 1, limit = 20 } = opts;
  const { enabled = true } = control;

  const [data, setData] = useState<AcademyClassesSummaryResponse | null>(null);
  // enabled=false 로 시작하면 즉시 비로딩 상태 (검색 모드 우선 진입 케이스 대응)
  const [isLoading, setIsLoading] = useState(enabled);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!academyId) {
      setIsLoading(false);
      setData(null);
      return;
    }
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const qs = buildQuery({ status, sort, page, limit });
      const res = await api.get<BackendEnvelope<AcademyClassesSummaryResponse>>(
        `/academies/${academyId}/classes-summary${qs}`,
      );
      if (res.success && res.data) {
        const parsed = unwrap<AcademyClassesSummaryResponse>(res.data);
        setData(parsed);
      } else {
        setData(null);
        setErrorMessage(res.error?.message ?? null);
      }
    } catch (err) {
      setData(null);
      setErrorMessage(err instanceof Error ? err.message : '데이터 조회 실패');
    } finally {
      setIsLoading(false);
    }
  }, [academyId, enabled, status, sort, page, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, errorMessage, refresh: fetchData };
}

/* ───────────────────────── 2. Student Search (deprecated v2) ───────────────────────── */

export interface UseAcademyStudentSearchOpts {
  page?: number;
  limit?: number;
}

/**
 * @deprecated 2026-05-18 SPEC v2 — 학생 단위 단일 리스트 훅(`useAcademyStudents`) 이
 *   검색 기능을 통합. 사용처 마이그레이션 완료 후 제거 예정.
 */
export function useAcademyStudentSearch(
  academyId: string | null,
  query: string,
  opts: UseAcademyStudentSearchOpts = {},
) {
  const { page = 1, limit = 20 } = opts;
  const debouncedQuery = useDebounce(query, 300);
  const trimmed = debouncedQuery.trim();

  const [data, setData] = useState<AcademyStudentSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchSearch = useCallback(async () => {
    if (!academyId || trimmed.length === 0) {
      setIsLoading(false);
      setData(null);
      setErrorMessage(null);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const qs = buildQuery({ q: trimmed, page, limit });
      const res = await api.get<BackendEnvelope<AcademyStudentSearchResponse>>(
        `/academies/${academyId}/students/search${qs}`,
      );
      if (res.success && res.data) {
        const parsed = unwrap<AcademyStudentSearchResponse>(res.data);
        setData(parsed);
      } else {
        setData(null);
        setErrorMessage(res.error?.message ?? null);
      }
    } catch (err) {
      setData(null);
      setErrorMessage(err instanceof Error ? err.message : '검색 실패');
    } finally {
      setIsLoading(false);
    }
  }, [academyId, trimmed, page, limit]);

  useEffect(() => {
    fetchSearch();
  }, [fetchSearch]);

  const hasQuery = trimmed.length > 0;

  return { data, isLoading, errorMessage, refresh: fetchSearch, hasQuery, debouncedQuery: trimmed };
}

/* ───────────────────────── 3. Class Students (무한 스크롤) ───────────────────────── */

export interface UseAcademyClassStudentsOpts {
  status?: AcademyEnrollmentStatusFilter;
  sort?: AcademyEnrollmentSort;
  q?: string;
  limit?: number;
}

export interface UseAcademyClassStudentsReturn {
  classInfo: AcademyClassStudentsClassInfo | null;
  students: AcademyClassStudent[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  errorMessage: string | null;
  loadMoreErrorMessage: string | null;
  pagination: { total: number; page: number; limit: number } | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export function useAcademyClassStudents(
  academyId: string | null,
  classId: string | null,
  opts: UseAcademyClassStudentsOpts = {},
): UseAcademyClassStudentsReturn {
  const { status = 'all', sort = 'recent', q = '', limit = 20 } = opts;

  const [classInfo, setClassInfo] = useState<AcademyClassStudentsClassInfo | null>(null);
  const [students, setStudents] = useState<AcademyClassStudent[]>([]);
  const [pagination, setPagination] = useState<
    { total: number; page: number; limit: number } | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadMoreErrorMessage, setLoadMoreErrorMessage] = useState<string | null>(null);

  // 무한 스크롤 race 방지 — 가장 최근 요청만 반영
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(
    async (page: number, isInitial: boolean) => {
      if (!academyId || !classId) {
        setIsLoading(false);
        return;
      }
      const myRequestId = ++requestIdRef.current;

      if (isInitial) {
        setIsLoading(true);
        setErrorMessage(null);
      } else {
        setIsLoadingMore(true);
        setLoadMoreErrorMessage(null);
      }

      try {
        const qs = buildQuery({ status, sort, q: q.trim(), page, limit });
        const res = await api.get<BackendEnvelope<AcademyClassStudentsResponse>>(
          `/academies/${academyId}/classes/${classId}/students${qs}`,
        );
        if (requestIdRef.current !== myRequestId) return;

        if (res.success && res.data) {
          const parsed = unwrap<AcademyClassStudentsResponse>(res.data);
          if (!parsed) {
            if (isInitial) setErrorMessage('데이터 형식 오류');
            else setLoadMoreErrorMessage('데이터 형식 오류');
            return;
          }
          setClassInfo(parsed.classInfo);
          setPagination(parsed.pagination);
          setStudents((prev) =>
            isInitial ? parsed.students : [...prev, ...parsed.students],
          );
        } else {
          const msg = res.error?.message ?? null;
          if (isInitial) setErrorMessage(msg);
          else setLoadMoreErrorMessage(msg);
        }
      } catch (err) {
        if (requestIdRef.current !== myRequestId) return;
        const msg = err instanceof Error ? err.message : '데이터 조회 실패';
        if (isInitial) setErrorMessage(msg);
        else setLoadMoreErrorMessage(msg);
      } finally {
        if (requestIdRef.current === myRequestId) {
          if (isInitial) setIsLoading(false);
          else setIsLoadingMore(false);
        }
      }
    },
    [academyId, classId, status, sort, q, limit],
  );

  // 옵션 변경 시 1페이지부터 재조회
  useEffect(() => {
    setStudents([]);
    setPagination(null);
    fetchPage(1, true);
  }, [fetchPage]);

  const hasMore = useMemo(() => {
    if (!pagination) return false;
    return pagination.page * pagination.limit < pagination.total;
  }, [pagination]);

  const loadMore = useCallback(async () => {
    if (!pagination || isLoading || isLoadingMore || !hasMore) return;
    await fetchPage(pagination.page + 1, false);
  }, [pagination, isLoading, isLoadingMore, hasMore, fetchPage]);

  const refresh = useCallback(async () => {
    setStudents([]);
    setPagination(null);
    await fetchPage(1, true);
  }, [fetchPage]);

  return {
    classInfo,
    students,
    isLoading,
    isLoadingMore,
    hasMore,
    errorMessage,
    loadMoreErrorMessage,
    pagination,
    refresh,
    loadMore,
  };
}

/* ───────────────────────── 4. Academy Students (SPEC v2 신규) ─────────────────────────
 * 학생 단위 단일 리스트 + 검색(debounce 300ms) + 무한 스크롤 + summary.
 * 백엔드: GET /api/v1/academies/:academyId/students
 */

export interface UseAcademyStudentsOpts {
  q?: string;
  sort?: AcademyStudentsSort;
  limit?: number;
}

export interface UseAcademyStudentsControl {
  /**
   * fetch 활성 여부. false 일 때 fetch 스킵 + 즉시 `isLoading=false` 반환.
   * 모드 분기 (검색 모드 / 기본 모드) 에서 비활성 모드 fetch 차단용.
   */
  enabled?: boolean;
}

export interface UseAcademyStudentsReturn {
  summary: AcademyStudentsSummaryV2 | null;
  results: AcademyStudentEntry[];
  pagination: { total: number; page: number; limit: number } | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  errorMessage: string | null;
  loadMoreErrorMessage: string | null;
  debouncedQuery: string;
  hasQuery: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export function useAcademyStudents(
  academyId: string | null,
  opts: UseAcademyStudentsOpts = {},
  control: UseAcademyStudentsControl = {},
): UseAcademyStudentsReturn {
  const { q = '', sort = 'recent', limit = 20 } = opts;
  const { enabled = true } = control;
  const debouncedQuery = useDebounce(q, 300);
  const trimmedQuery = debouncedQuery.trim();

  const [summary, setSummary] = useState<AcademyStudentsSummaryV2 | null>(null);
  const [results, setResults] = useState<AcademyStudentEntry[]>([]);
  const [pagination, setPagination] = useState<
    { total: number; page: number; limit: number } | null
  >(null);
  // enabled=false 로 시작하면 즉시 비로딩 상태 (기본 모드 우선 진입 케이스 대응)
  const [isLoading, setIsLoading] = useState(enabled);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadMoreErrorMessage, setLoadMoreErrorMessage] = useState<string | null>(null);

  // 무한 스크롤 race 방지 — 가장 최근 요청만 반영 (검색어 변경 시 stale 응답 차단)
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(
    async (page: number, isInitial: boolean) => {
      if (!academyId) {
        setIsLoading(false);
        return;
      }
      if (!enabled) {
        setIsLoading(false);
        return;
      }
      const myRequestId = ++requestIdRef.current;

      if (isInitial) {
        setIsLoading(true);
        setErrorMessage(null);
      } else {
        setIsLoadingMore(true);
        setLoadMoreErrorMessage(null);
      }

      try {
        const qs = buildQuery({ q: trimmedQuery, sort, page, limit });
        const res = await api.get<BackendEnvelope<AcademyStudentsResponse>>(
          `/academies/${academyId}/students${qs}`,
        );
        if (requestIdRef.current !== myRequestId) return;

        if (res.success && res.data) {
          const parsed = unwrap<AcademyStudentsResponse>(res.data);
          if (!parsed) {
            if (isInitial) setErrorMessage('데이터 형식 오류');
            else setLoadMoreErrorMessage('데이터 형식 오류');
            return;
          }
          setSummary(parsed.summary);
          setPagination(parsed.pagination);
          setResults((prev) =>
            isInitial ? parsed.results : [...prev, ...parsed.results],
          );
        } else {
          const msg = res.error?.message ?? null;
          if (isInitial) setErrorMessage(msg);
          else setLoadMoreErrorMessage(msg);
        }
      } catch (err) {
        if (requestIdRef.current !== myRequestId) return;
        const msg = err instanceof Error ? err.message : '데이터 조회 실패';
        if (isInitial) setErrorMessage(msg);
        else setLoadMoreErrorMessage(msg);
      } finally {
        if (requestIdRef.current === myRequestId) {
          if (isInitial) setIsLoading(false);
          else setIsLoadingMore(false);
        }
      }
    },
    [academyId, enabled, trimmedQuery, sort, limit],
  );

  // 옵션(검색어 디바운스 결과 포함) 변경 시 1페이지부터 재조회
  useEffect(() => {
    setResults([]);
    setPagination(null);
    fetchPage(1, true);
  }, [fetchPage]);

  const hasMore = useMemo(() => {
    if (!pagination) return false;
    return pagination.page * pagination.limit < pagination.total;
  }, [pagination]);

  const loadMore = useCallback(async () => {
    if (!pagination || isLoading || isLoadingMore || !hasMore) return;
    await fetchPage(pagination.page + 1, false);
  }, [pagination, isLoading, isLoadingMore, hasMore, fetchPage]);

  const refresh = useCallback(async () => {
    setResults([]);
    setPagination(null);
    await fetchPage(1, true);
  }, [fetchPage]);

  return {
    summary,
    results,
    pagination,
    isLoading,
    isLoadingMore,
    hasMore,
    errorMessage,
    loadMoreErrorMessage,
    debouncedQuery: trimmedQuery,
    hasQuery: trimmedQuery.length > 0,
    refresh,
    loadMore,
  };
}
