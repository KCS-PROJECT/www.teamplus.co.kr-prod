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
 * 결제 통계 조회 (관리자/코치)
 * @param clubId - 클럽 ID (옵션)
 * @param startDate - 시작 날짜 (ISO 8601)
 * @param endDate - 종료 날짜 (ISO 8601)
 * @returns 결제 통계 정보
 */
export const getPaymentStatistics = async (
  clubId?: string,
  startDate?: string,
  endDate?: string
): Promise<{
  totalAmount: number;
  totalCount: number;
  successCount: number;
  failedCount: number;
  cancelledCount: number;
  averageAmount: number;
}> => {
  try {
    const params: Record<string, unknown> = {};
    if (clubId) params.clubId = clubId;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const stats = await api.get<{
      totalAmount: number;
      totalCount: number;
      successCount: number;
      failedCount: number;
      cancelledCount: number;
      averageAmount: number;
    }>('/payments/statistics', { params });

    return stats;
  } catch (error: unknown) {
    console.error('[Payment Service] 결제 통계 조회 실패:', error);

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
  getPaymentStatistics,
};

export default paymentService;
/* eslint-disable @typescript-eslint/no-explicit-any */
