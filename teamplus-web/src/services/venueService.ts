/**
 * venueService.ts
 * 구장(Venue) REST 클라이언트
 * - 백엔드 `api/v1/venues` 엔드포인트와 직접 매핑
 * - 모든 호출은 `api-client` 의 통합 래퍼를 사용 (native/web 환경 자동 분기)
 */

import { api } from '@/services/api-client';
import { hybridAuth } from '@/services/hybrid-auth';
import { env } from '@/lib/env';
import type {
  Venue,
  VenueListResponse,
  VenuePayload,
  VenueStatus,
} from '@/types/venue';
import type { ApiResponse } from '@/types/api';

/** 이미지 업로드 허용 MIME (백엔드 fileFilter 와 동기화) */
export const VENUE_IMAGE_ACCEPTED_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

/** 이미지 업로드 최대 바이트 (5MB — 백엔드 limits.fileSize 와 동기화) */
export const VENUE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface ListVenuesParams {
  page?: number;
  limit?: number;
  search?: string;
  city?: string;
}

const BASE = '/venues';

export const venueService = {
  /**
   * 구장 목록 조회 (공개)
   */
  async listVenues(params: ListVenuesParams = {}) {
    const query: Record<string, string> = {};
    if (params.page) query.page = String(params.page);
    if (params.limit) query.limit = String(params.limit);
    if (params.search) query.search = params.search;
    if (params.city) query.city = params.city;

    return api.get<VenueListResponse>(BASE, { params: query });
  },

  /**
   * 구장 상세 조회 (공개)
   */
  async getVenue(id: string) {
    return api.get<Venue>(`${BASE}/${id}`);
  },

  /**
   * 구장 등록 (ADMIN / DIRECTOR / COACH)
   */
  async createVenue(payload: VenuePayload) {
    return api.post<Venue>(BASE, payload);
  },

  /**
   * 구장 수정 (ADMIN / DIRECTOR / COACH — 소속만)
   */
  async updateVenue(id: string, payload: Partial<VenuePayload>) {
    return api.patch<Venue>(`${BASE}/${id}`, payload);
  },

  /**
   * 구장 삭제 (ADMIN / DIRECTOR 전용)
   */
  async deleteVenue(id: string) {
    return api.delete<{ success: boolean; id: string }>(`${BASE}/${id}`);
  },

  /**
   * 구장 운영 상태 변경
   */
  async updateStatus(id: string, status: VenueStatus) {
    return api.patch<Venue>(`${BASE}/${id}/status`, { status });
  },

  /**
   * 구장 대표 이미지 URL 갱신 (이미 업로드된 URL)
   */
  async updateImage(id: string, imageUrl: string) {
    return api.patch<Venue>(`${BASE}/${id}/image`, { imageUrl });
  },

  /**
   * 구장 대표 이미지 멀티파트 업로드
   *
   * - `api-client` 통합 래퍼는 JSON 전용이므로 FormData 는 `fetch` 로 직접 전송
   * - 토큰은 `hybridAuth.getToken()` 으로 환경별 저장소에서 조회
   * - 업로드 완료 후 서버가 반영한 구장 객체를 `ApiResponse<Venue>` 로 래핑하여 반환
   *
   * @param id 구장 ID
   * @param file 업로드 대상 파일 (jpeg/png/webp, ≤5MB)
   */
  async uploadImage(id: string, file: File): Promise<ApiResponse<Venue>> {
    // 클라이언트 선제 검증 (백엔드도 동일 룰 적용)
    if (!(VENUE_IMAGE_ACCEPTED_MIMES as readonly string[]).includes(file.type)) {
      return {
        success: false,
        error: {
          code: 'INVALID_MIME',
          message: '지원하지 않는 이미지 형식입니다. (jpeg/png/webp 만 허용)',
        },
      };
    }
    if (file.size > VENUE_IMAGE_MAX_BYTES) {
      return {
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: '이미지 크기는 5MB 이내여야 합니다.',
        },
      };
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = await hybridAuth.getToken();
      const baseUrl = env.NEXT_PUBLIC_API_URL;

      const response = await fetch(
        `${baseUrl}/api/v1/venues/${encodeURIComponent(id)}/upload-image`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: Venue; message?: string }
        | Venue
        | null;

      if (!response.ok || !payload) {
        const message =
          (payload && 'message' in payload && typeof payload.message === 'string'
            ? payload.message
            : undefined) ?? '이미지 업로드에 실패했습니다.';
        return {
          success: false,
          error: {
            code: 'UPLOAD_FAILED',
            message,
            statusCode: response.status,
          },
        };
      }

      // 백엔드는 Venue 엔티티를 바로 반환하므로 ApiResponse<Venue> 로 감싸서 표준화
      const data =
        'data' in payload && payload.data !== undefined
          ? payload.data
          : (payload as Venue);
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message:
            err instanceof Error
              ? err.message
              : '네트워크 오류로 업로드에 실패했습니다.',
        },
      };
    }
  },
};

export default venueService;
