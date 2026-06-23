'use client';
import { useState, useCallback, useEffect } from 'react';
import { api } from '@/services/api-client';

interface Academy {
  id: string;
  name: string;
  code: string;
  description: string | null;
  region: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  director: { id: string; firstName: string; lastName: string };
  _count?: { members: number; coaches: number; classes: number };
}

interface AcademyMember {
  id: string;
  userId: string;
  childId: string | null;
  status: string;
  joinedAt: string;
  user: { id: string; firstName: string; lastName: string; email: string; phone: string };
  child?: { id: string; firstName: string; lastName: string } | null;
}

interface AcademyCoach {
  id: string;
  userId: string;
  role: string;
  isActive: boolean;
  joinedAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

export function useMyAcademies() {
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAcademies = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: Academy[] }>('/academies/my/list');
      if (res.success && res.data) {
        setAcademies(res.data.data || []);
      } else {
        setAcademies([]);
      }
    } catch {
      setAcademies([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAcademies(); }, [fetchAcademies]);

  return { academies, isLoading, refresh: fetchAcademies };
}

export function useAcademyDetail(academyId: string | null) {
  const [academy, setAcademy] = useState<Academy | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!academyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.get<Academy>(`/academies/${academyId}`);
      if (res.success && res.data) {
        setAcademy(res.data);
      } else {
        setAcademy(null);
      }
    } catch {
      setAcademy(null);
    } finally {
      setIsLoading(false);
    }
  }, [academyId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  return { academy, isLoading, refresh: fetchDetail };
}

/**
 * @deprecated 2026-05-18 — `useAcademyClassesSummary` / `useAcademyClassStudents` 로 대체됨.
 *
 * SPEC_ACADEMY_STUDENTS_REDESIGN v1.0 에 따라 학원 멤버십(AcademyMember) 기반
 * 노출을 폐기. 수업(Class.enrollments) 단위 Master-Detail Drill-down 패턴 사용.
 * 본 훅은 backward-compat 을 위해 유지되며 신규 사용 금지.
 *
 * 대체 훅: `@/hooks/useAcademyStudents`
 */
export function useAcademyMembers(academyId: string | null) {
  const [members, setMembers] = useState<AcademyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    if (!academyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.get<{ data: AcademyMember[] }>(`/academies/${academyId}/members`);
      if (res.success && res.data) {
        setMembers(res.data.data || []);
      } else {
        setMembers([]);
      }
    } catch {
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [academyId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  return { members, isLoading, refresh: fetchMembers };
}

export function useAcademyCoaches(academyId: string | null) {
  const [coaches, setCoaches] = useState<AcademyCoach[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCoaches = useCallback(async () => {
    if (!academyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.get<{ data: AcademyCoach[] }>(`/academies/${academyId}/coaches`);
      if (res.success && res.data) {
        setCoaches(res.data.data || []);
      } else {
        setCoaches([]);
      }
    } catch {
      setCoaches([]);
    } finally {
      setIsLoading(false);
    }
  }, [academyId]);

  useEffect(() => { fetchCoaches(); }, [fetchCoaches]);

  return { coaches, isLoading, refresh: fetchCoaches };
}

export function usePublicAcademies(search?: string, region?: string) {
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPublic = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (region) params.set('region', region);
      const res = await api.get<{ data: Academy[]; pagination: { total: number } }>(`/academies/public?${params.toString()}`);
      if (res.success && res.data) {
        setAcademies(res.data.data || []);
        setTotal(res.data.pagination?.total || 0);
      } else {
        setAcademies([]);
        setTotal(0);
      }
    } catch {
      setAcademies([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [search, region]);

  useEffect(() => { fetchPublic(); }, [fetchPublic]);

  return { academies, total, isLoading, refresh: fetchPublic };
}

export type { Academy, AcademyMember, AcademyCoach };
