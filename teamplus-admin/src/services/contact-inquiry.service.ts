/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contact Inquiry Service
 * 도입 상담 신청(문의) 관리 API 호출
 *
 * SPEC: _workspace/contact-inquiry/02_planner_spec.md §3(응답 형태) · §5-1(서비스) 와 1:1 매핑.
 * baseURL(env.NEXT_PUBLIC_API_URL)에 이미 `/api/v1` 이 포함되므로 path 는 `/contact-inquiries` 부터.
 *
 * 엔드포인트
 *   GET    /contact-inquiries          관리자 목록 (page/pageSize/status/search)
 *   GET    /contact-inquiries/stats    상태별 카운트
 *   GET    /contact-inquiries/:id      상세
 *   PATCH  /contact-inquiries/:id      상태/관리자 메모 수정
 *   DELETE /contact-inquiries/:id      soft delete
 *
 * 응답 래퍼(`{ success, data }`)는 api-client 의 extractData 가 자동 해제하므로
 * 서비스는 항상 SPEC §3 의 canonical 형태를 반환받는다.
 */

import { api } from './api-client';
import { getApiErrorMessage } from '@/lib/api-error';

/**
 * 상담 신청 처리 상태 — Backend `ContactInquiryStatus` enum 과 1:1 (SPEC §2/§3)
 * NEW: 신규 접수 · IN_PROGRESS: 처리중 · DONE: 완료 · ARCHIVED: 보관
 */
export type ContactInquiryStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'ARCHIVED';

/**
 * 상담 신청 단건 — Backend `ContactInquiryDto` 와 1:1 (SPEC §3 응답 필드)
 * (ipAddress/userAgent/deletedAt 은 응답 제외 — 타입에도 포함하지 않음)
 */
export interface ContactInquiry {
  id: string;
  organizationName: string;
  managerName: string;
  email: string;
  phone: string;
  /** starter|business|enterprise|undecided (선택 필드 → nullable) */
  interestedPlan: string | null;
  /** ~50명|50-150명|150-300명|300명+ (선택 필드 → nullable) */
  clubSize: string | null;
  /** 문의 내용 (선택 필드 → nullable) */
  message: string | null;
  privacyAgreed: boolean;
  status: ContactInquiryStatus;
  /** 관리자 처리 메모 (선택 필드 → nullable) */
  adminMemo: string | null;
  /** 유입 출처 (예: home_contact) */
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** 목록 응답 — SPEC §3 GET 목록 `{ items, total, page, pageSize }` 와 1:1 */
export interface ContactInquiryListResponse {
  items: ContactInquiry[];
  total: number;
  page: number;
  pageSize: number;
}

/** 상태별 카운트 — SPEC §3 stats `{ total, NEW, IN_PROGRESS, DONE, ARCHIVED }` 와 1:1 */
export interface ContactInquiryStats {
  total: number;
  NEW: number;
  IN_PROGRESS: number;
  DONE: number;
  ARCHIVED: number;
}

/** 목록 조회 파라미터 (SPEC §3 GET 목록 query) */
export interface ContactInquiryListParams {
  page?: number;
  pageSize?: number;
  status?: ContactInquiryStatus;
  search?: string;
}

/** 수정 요청 바디 (SPEC §3 PATCH — status?/adminMemo?) */
export interface UpdateContactInquiryRequest {
  status?: ContactInquiryStatus;
  adminMemo?: string;
}

const BASE = '/contact-inquiries';

/**
 * 관리자 목록 조회
 */
export const getContactInquiries = async (
  params?: ContactInquiryListParams,
): Promise<ContactInquiryListResponse> => {
  try {
    return await api.get<ContactInquiryListResponse>(BASE, { params });
  } catch (error: unknown) {
    console.error('[ContactInquiry Service] 목록 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '상담 신청 목록을 불러오는 데 실패했습니다.'),
    );
  }
};

/**
 * 상태별 카운트 조회
 */
export const getContactInquiryStats = async (): Promise<ContactInquiryStats> => {
  try {
    return await api.get<ContactInquiryStats>(`${BASE}/stats`);
  } catch (error: unknown) {
    console.error('[ContactInquiry Service] 통계 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '상담 신청 통계를 불러오는 데 실패했습니다.'),
    );
  }
};

/**
 * 상세 조회
 */
export const getContactInquiry = async (
  id: string,
): Promise<ContactInquiry> => {
  try {
    return await api.get<ContactInquiry>(`${BASE}/${id}`);
  } catch (error: unknown) {
    console.error('[ContactInquiry Service] 상세 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '상담 신청 정보를 불러오는 데 실패했습니다.'),
    );
  }
};

/**
 * 상태/관리자 메모 수정
 */
export const updateContactInquiry = async (
  id: string,
  data: UpdateContactInquiryRequest,
): Promise<ContactInquiry> => {
  try {
    return await api.patch<ContactInquiry>(`${BASE}/${id}`, data);
  } catch (error: unknown) {
    console.error('[ContactInquiry Service] 수정 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '상담 신청 수정에 실패했습니다.'),
    );
  }
};

/**
 * 삭제 (soft delete)
 */
export const deleteContactInquiry = async (id: string): Promise<void> => {
  try {
    await api.delete<{ success: boolean }>(`${BASE}/${id}`);
  } catch (error: unknown) {
    console.error('[ContactInquiry Service] 삭제 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '상담 신청 삭제에 실패했습니다.'),
    );
  }
};

/**
 * 통합 서비스 객체 (team-lead 지정 메서드명: list/getStats/get/update/remove)
 */
export const contactInquiryService = {
  list: getContactInquiries,
  getStats: getContactInquiryStats,
  get: getContactInquiry,
  update: updateContactInquiry,
  remove: deleteContactInquiry,
};

export default contactInquiryService;
