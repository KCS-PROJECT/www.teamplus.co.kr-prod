/**
 * EquipmentInspection 서비스 (2026-05-14 신규)
 *
 * Backend `/api/v1/equipment-inspections/*` 와 정합. apiClient 사용으로
 * 자동 토큰·재시도·X-Idempotency-Key·SLA 모니터링 적용.
 */

import { api } from './api-client';
import { hybridAuth } from './hybrid-auth';
import { env } from '@/lib/env';
import type { ApiResponse } from '@/types/api';

export type InspectionStatus = 'pending' | 'completed' | 'issue_found';
export type InspectionCondition =
  | 'good'
  | 'minor_issue'
  | 'critical'
  | 'replaced';
export type InspectionCategory =
  | 'helmet'
  | 'skate'
  | 'pad'
  | 'stick'
  | 'goal'
  | 'ice'
  | 'other';

export interface InspectionItemPayload {
  category: InspectionCategory;
  itemName: string;
  condition?: InspectionCondition;
  issueDetail?: string;
  photoUrl?: string;
  needsAction?: boolean;
  assigneeId?: string;
  sortOrder?: number;
}

export interface InspectionItem extends InspectionItemPayload {
  id: string;
  inspectionId: string;
  createdAt: string;
}

export interface EquipmentInspection {
  id: string;
  teamId: string;
  inspectorId: string;
  venueId: string | null;
  inspectedAt: string;
  status: InspectionStatus;
  notes: string | null;
  notified: boolean;
  createdAt: string;
  updatedAt: string;
  items?: InspectionItem[];
  inspector?: { id: string; firstName: string };
  team?: { id: string; name: string };
}

export interface CreateInspectionInput {
  teamId: string;
  venueId?: string;
  inspectedAt?: string;
  notes?: string;
  items: InspectionItemPayload[];
}

export interface ListResponse {
  total: number;
  page: number;
  limit: number;
  data: EquipmentInspection[];
}

export const equipmentInspectionService = {
  async list(
    teamId: string,
    opts: { status?: InspectionStatus; page?: number; limit?: number } = {},
  ) {
    const params: Record<string, string> = {};
    if (opts.status) params.status = opts.status;
    if (opts.page) params.page = String(opts.page);
    if (opts.limit) params.limit = String(opts.limit);
    return api.get<ListResponse>(`/equipment-inspections/teams/${teamId}`, {
      params,
    });
  },

  async findOne(id: string) {
    return api.get<EquipmentInspection>(`/equipment-inspections/${id}`);
  },

  async create(input: CreateInspectionInput) {
    return api.post<EquipmentInspection>('/equipment-inspections', input);
  },

  async update(
    id: string,
    patch: { status?: InspectionStatus; notes?: string },
  ) {
    // PATCH 메서드 사용
    return api.patch<EquipmentInspection>(
      `/equipment-inspections/${id}`,
      patch,
    );
  },

  async remove(id: string) {
    return api.delete<{ success: boolean }>(`/equipment-inspections/${id}`);
  },

  /**
   * 점검 사진 업로드 (multipart/form-data)
   *
   * api-client(JSON 전용) 대신 fetch 직접 호출 — multipart boundary 헤더는
   * fetch 가 자동 부여. CRUD 와 분리된 endpoint(`/upload/photo`) 로,
   * 응답 imageUrl 을 InspectionItemPayload.photoUrl 에 그대로 넣어 create.
   */
  async uploadPhoto(file: File): Promise<
    ApiResponse<{
      success: boolean;
      imageUrl: string;
      filename: string;
      originalName: string;
      size: number;
      mimetype: string;
    }>
  > {
    try {
      const tokenInfo = await hybridAuth.getToken();
      const accessToken = tokenInfo?.accessToken;

      const formData = new FormData();
      formData.append('photo', file);

      const res = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/api/v1/equipment-inspections/upload/photo`,
        {
          method: 'POST',
          body: formData,
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
        },
      );

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          error: {
            code: json?.errorCode ?? 'UPLOAD_FAILED',
            message: json?.message ?? '사진 업로드에 실패했습니다.',
            statusCode: res.status,
          },
        };
      }
      return { success: true, data: json };
    } catch (e) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message:
            e instanceof Error ? e.message : '네트워크 오류가 발생했습니다.',
        },
      };
    }
  },
};
