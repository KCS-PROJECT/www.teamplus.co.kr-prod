/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS Payment Service
 * 결제 관리 API 호출 (결제 생성, 이력 조회, 검증)
 */

import { api } from './api-client';
import { getApiErrorStatus, getApiErrorMessage } from '@/lib/api-error';
import {
  Payment,
  CreatePaymentRequest,
  PaymentResult,
  VerifyPaymentRequest,
  PaginationParams,
  Status,
} from '../types';

/**
 * 결제 생성 (KG이니시스 결제 페이지로 리다이렉트)
 * @param orderData - 주문 데이터
 * @returns 결제 결과 (결제 페이지 URL 포함)
 */
export const createPayment = async (
  orderData: CreatePaymentRequest
): Promise<PaymentResult> => {
  try {
    const result = await api.post<PaymentResult>('/payments/create', orderData);
    return result;
  } catch (error: unknown) {
    console.error('[Payment Service] 결제 생성 실패:', error);

    const errorMessage = getApiErrorMessage(error, '결제 생성에 실패했습니다. 다시 시도해주세요.');
    if (errorMessage.includes('duplicate')) {
      throw new Error('이미 처리 중인 결제입니다.');
    } else if (errorMessage.includes('amount')) {
      throw new Error('결제 금액이 올바르지 않습니다.');
    } else {
      throw new Error(errorMessage);
    }
  }
};

/**
 * 결제 검증 (KG이니시스 콜백 후 서버 검증)
 * @param tid - KG이니시스 거래 ID
 * @param orderNumber - 주문 번호
 * @returns 결제 검증 결과
 */
export const verifyPayment = async (
  tid: string,
  orderNumber: string
): Promise<PaymentResult> => {
  try {
    const data: VerifyPaymentRequest = { tid, orderNumber };
    const result = await api.post<PaymentResult>('/payments/verify', data);
    return result;
  } catch (error: unknown) {
    console.error('[Payment Service] 결제 검증 실패:', error);

    const errorMessage = getApiErrorMessage(error, '결제 검증에 실패했습니다.');
    if (errorMessage.includes('not found')) {
      throw new Error('결제 정보를 찾을 수 없습니다.');
    } else if (errorMessage.includes('mismatch')) {
      throw new Error('결제 금액이 일치하지 않습니다.');
    } else {
      throw new Error(errorMessage);
    }
  }
};

/**
 * 단일 결제 조회
 * @param paymentId - 결제 ID
 * @returns 결제 상세 정보
 */
export const getPayment = async (paymentId: string): Promise<Payment> => {
  try {
    const payment = await api.get<Payment>(`/payments/${paymentId}`);
    return payment;
  } catch (error: unknown) {
    console.error('[Payment Service] 결제 조회 실패:', error);

    if (getApiErrorStatus(error) === 404) {
      throw new Error('결제 정보를 찾을 수 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '결제 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 주문 번호로 결제 조회
 * @param orderNumber - 주문 번호
 * @returns 결제 정보
 */
export const getPaymentByOrderNumber = async (
  orderNumber: string
): Promise<Payment> => {
  try {
    const payment = await api.get<Payment>(
      `/payments/order/${orderNumber}`
    );
    return payment;
  } catch (error: unknown) {
    console.error('[Payment Service] 결제 조회 실패:', error);

    if (getApiErrorStatus(error) === 404) {
      throw new Error('결제 정보를 찾을 수 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '결제 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 사용자 결제 이력 조회
 * @param userId - 사용자 ID (옵션, 없으면 현재 로그인한 사용자)
 * @param params - 페이지네이션 및 필터 파라미터
 * @returns 결제 이력 목록
 */
export const getPaymentHistory = async (
  userId?: string,
  params?: PaginationParams & {
    startDate?: string;
    endDate?: string;
    status?: Status;
  }
): Promise<Payment[]> => {
  try {
    const endpoint = userId ? `/payments/user/${userId}` : '/payments/my';
    const payments = await api.get<Payment[]>(endpoint, { params });
    return payments;
  } catch (error: unknown) {
    console.error('[Payment Service] 결제 이력 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '결제 이력을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 내 결제 이력 조회 (현재 로그인한 사용자)
 * @param params - 페이지네이션 및 필터 파라미터
 * @returns 결제 이력 목록
 */
export const getMyPaymentHistory = async (
  params?: PaginationParams & {
    startDate?: string;
    endDate?: string;
    status?: Status;
  }
): Promise<Payment[]> => {
  return getPaymentHistory(undefined, params);
};

/**
 * 멤버별 결제 이력 조회 (코치/부모)
 * @param memberId - 멤버 ID
 * @param params - 페이지네이션 및 필터 파라미터
 * @returns 결제 이력 목록
 */
export const getPaymentHistoryByMember = async (
  memberId: string,
  params?: PaginationParams & {
    startDate?: string;
    endDate?: string;
    status?: Status;
  }
): Promise<Payment[]> => {
  try {
    const payments = await api.get<Payment[]>(
      `/payments/member/${memberId}`,
      { params }
    );
    return payments;
  } catch (error: unknown) {
    console.error('[Payment Service] 멤버 결제 이력 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '결제 이력을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 클럽별 결제 이력 조회 (코치/관리자)
 * @param clubId - 클럽 ID
 * @param params - 페이지네이션 및 필터 파라미터
 * @returns 결제 이력 목록
 */
export const getPaymentHistoryByClub = async (
  clubId: string,
  params?: PaginationParams & {
    startDate?: string;
    endDate?: string;
    status?: Status;
  }
): Promise<Payment[]> => {
  try {
    const payments = await api.get<Payment[]>(
      `/payments/club/${clubId}`,
      { params }
    );
    return payments;
  } catch (error: unknown) {
    console.error('[Payment Service] 클럽 결제 이력 조회 실패:', error);

    if (getApiErrorStatus(error) === 403) {
      throw new Error('결제 이력 조회 권한이 없습니다.');
    }

    throw new Error(
      getApiErrorMessage(error, '결제 이력을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 결제 취소 (환불)
 * @param paymentId - 결제 ID
 * @param reason - 취소 사유
 * @returns 취소된 결제 정보
 */
export const cancelPayment = async (
  paymentId: string,
  reason?: string
): Promise<Payment> => {
  try {
    const payment = await api.post<Payment>(`/payments/${paymentId}/cancel`, {
      reason,
    });
    return payment;
  } catch (error: unknown) {
    console.error('[Payment Service] 결제 취소 실패:', error);

    const errorMessage = getApiErrorMessage(error, '결제 취소에 실패했습니다.');
    if (errorMessage.includes('already')) {
      throw new Error('이미 취소된 결제입니다.');
    } else if (errorMessage.includes('period')) {
      throw new Error('취소 가능 기간이 지났습니다.');
    } else {
      throw new Error(errorMessage);
    }
  }
};

/**
 * 관리자 결제 목록 1건 — 백엔드 admin/list 응답은 평탄한 형태다
 * (product 중첩 객체가 아니라 productName 문자열).
 */
export interface AdminPaymentItem {
  id: string;
  orderNumber: string;
  amount: number;
  paymentStatus: string;
  paymentMethod?: string | null;
  tid?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
  productName?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface AdminPaymentListResult {
  data: AdminPaymentItem[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface AdminPaymentStats {
  totalPayments: number;
  completedCount: number;
  failedCount: number;
  refundedCount: number;
  totalRevenue: number;
  totalRefunded: number;
  netRevenue: number;
  successRate: string;
}

interface AdminPaymentQuery {
  teamId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * 관리자 전체 결제 목록 조회 — 감독용(club/:teamId)·본인용(my) 과 달리 소속 제약이 없다.
 * 팀 필터는 결제↔수업/대회 연결로 귀속을 판정한다(정산 센터와 동일 기준).
 */
export const getAdminPaymentList = async (
  query: AdminPaymentQuery = {}
): Promise<AdminPaymentListResult> => {
  try {
    return await api.get<AdminPaymentListResult>('/payments/admin/list', {
      params: query,
    });
  } catch (error: unknown) {
    console.error('[Payment Service] 관리자 결제 목록 조회 실패:', error);
    if (getApiErrorStatus(error) === 403) {
      throw new Error('결제 목록 조회 권한이 없습니다.');
    }
    throw new Error(
      getApiErrorMessage(error, '결제 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 관리자 결제 통계 조회 — 상태별 집계를 DB 에서 직접 수행한 값을 그대로 사용한다.
 */
export const getAdminPaymentStats = async (
  query: Pick<AdminPaymentQuery, 'teamId' | 'startDate' | 'endDate'> = {}
): Promise<AdminPaymentStats> => {
  try {
    return await api.get<AdminPaymentStats>('/payments/admin/stats', {
      params: query,
    });
  } catch (error: unknown) {
    console.error('[Payment Service] 관리자 결제 통계 조회 실패:', error);
    if (getApiErrorStatus(error) === 403) {
      throw new Error('통계 조회 권한이 없습니다.');
    }
    throw new Error(
      getApiErrorMessage(error, '결제 통계를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * Payment Service Export
 */
export const paymentService = {
  createPayment,
  verifyPayment,
  getPayment,
  getPaymentByOrderNumber,
  getPaymentHistory,
  getMyPaymentHistory,
  getPaymentHistoryByMember,
  getPaymentHistoryByClub,
  cancelPayment,
  getAdminPaymentList,
  getAdminPaymentStats,
};

export default paymentService;
/* eslint-disable @typescript-eslint/no-explicit-any */
