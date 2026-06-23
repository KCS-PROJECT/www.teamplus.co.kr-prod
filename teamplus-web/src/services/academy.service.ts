/**
 * Academy (오픈클래스) thin service — director 대시보드 ACADEMY_DIRECTOR 분기용.
 *
 * 백엔드: GET /api/v1/academies/my/list (Roles: COACH/DIRECTOR/ACADEMY_DIRECTOR)
 * 응답 shape: { success, data: { data: AcademyListItem[] } } — 한 번 더 래핑되므로
 *   호출처가 항상 동일한 평면 배열을 받도록 thin wrapper 에서 한 단계 풀어 반환.
 */
import { apiRequest } from '@/services/api-client';
import type { ApiResponse } from '@/types';

export interface AcademyListItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  region: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: {
    members: number;
    coaches: number;
    classes: number;
  };
}

const BASE = '/academies';

export async function listMyAcademies(): Promise<ApiResponse<AcademyListItem[]>> {
  const res = await apiRequest<{ data: AcademyListItem[] } | AcademyListItem[]>({
    method: 'GET',
    url: `${BASE}/my/list`,
  });

  if (res.success && res.data) {
    const flat = Array.isArray(res.data) ? res.data : res.data.data ?? [];
    return {
      ...res,
      data: flat,
    };
  }

  return {
    success: res.success,
    error: res.error,
    data: [],
  } as ApiResponse<AcademyListItem[]>;
}
