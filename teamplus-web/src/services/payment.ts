/**
 * Payment Service
 * 결제 관련 API 호출 서비스
 *
 * 백엔드 응답 스키마가 프론트 타입과 완전히 일치하지 않기 때문에
 * 이 레이어에서 매핑을 수행하여 UI가 항상 동일한 구조의 데이터를 받도록 보장한다.
 */

import { api } from './api-client';
import type { ApiResponse } from '@/types';
import type { PaymentStatus } from '@/types/api';
import type {
  PaymentHistoryItem,
  UsageHistoryItem,
  GroupedPaymentHistory,
  GroupedUsageHistory,
  GetPaymentHistoryRequest,
  GetPaymentHistoryResponse,
  GetUsageHistoryRequest,
  GetUsageHistoryResponse,
  GetCreditStatusResponse,
  GetReceiptResponse,
  PaymentCompletionParams,
  VerifyPaymentResponse,
  PaymentType,
} from '@/types/payment';

// ============================================
// 백엔드 원본 응답 타입 (매핑 소스)
// ============================================

/** 백엔드 /credits/stats/me 응답 */
interface BackendCreditStats {
  memberId: string;
  totalIssued: number;
  totalUsed: number;
  totalRemaining: number;
  availableRemaining: number;
  availableCreditCount: number;
  expiredCreditCount: number;
  allCredits: number;
}

/** 백엔드 /payments/my 응답 아이템 */
interface BackendPaymentItem {
  id: string;
  orderNumber: string;
  amount: number | string;
  paymentStatus: string;
  productName?: string;
  /** [추가 2026-05-13] 결제 대상 수업의 명칭 (Enrollment.class.className) — 결제내역 카드 노출용. */
  className?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

// ============================================
// 매핑 유틸리티
// ============================================

/** ISO 날짜를 "YYYY.MM.DD" 형식으로 변환 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

/** ISO 날짜를 "HH:MM" 형식으로 변환 */
function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/** 백엔드 paymentStatus → 프론트 PaymentStatus 매핑 */
function mapPaymentStatus(status: string): PaymentStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'pending':
      return 'pending';
    case 'failed':
      return 'failed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'refunded':
      return 'refunded';
    default:
      return 'pending';
  }
}

/** paymentStatus → UI 분류(PaymentType) */
function inferPaymentType(status: PaymentStatus, productName: string): PaymentType {
  if (status === 'cancelled' || status === 'refunded') {
    return 'cancelled';
  }
  // 상품명에 "체험"이 포함되면 trial로 분류
  if (productName.includes('체험')) return 'trial';
  return 'regular';
}

function toPaymentHistoryItem(item: BackendPaymentItem): PaymentHistoryItem {
  const status = mapPaymentStatus(item.paymentStatus);
  const productName = item.productName || '이용권';
  const amount = typeof item.amount === 'string' ? Number(item.amount) : item.amount;
  const baseDate = item.completedAt || item.createdAt;

  return {
    id: item.id,
    type: inferPaymentType(status, productName),
    productName,
    className: item.className ?? undefined,
    date: formatDate(baseDate),
    time: formatTime(baseDate),
    amount: Number.isFinite(amount) ? amount : 0,
    status,
    orderNumber: item.orderNumber,
  };
}

// ============================================
// Payment API 서비스
// ============================================

/**
 * 결제 내역 조회 (현재 로그인 사용자)
 *
 * 백엔드 `/payments/my`는 PaymentHistoryItem[]과 다른 구조의 배열을 반환하므로
 * 서비스 레이어에서 매핑하여 UI 타입으로 변환한다.
 */
export async function getPaymentHistory(
  params?: GetPaymentHistoryRequest,
): Promise<ApiResponse<GetPaymentHistoryResponse>> {
  const res = await api.get<BackendPaymentItem[] | GetPaymentHistoryResponse>(
    '/payments/my',
    { params },
  );

  if (!res.success || !res.data) {
    return {
      success: res.success,
      data: { payments: [], totalCount: 0, hasMore: false },
      error: res.error,
    } as ApiResponse<GetPaymentHistoryResponse>;
  }

  // 백엔드가 배열을 직접 반환 → 표준 응답 구조로 래핑
  if (Array.isArray(res.data)) {
    const payments = res.data.map(toPaymentHistoryItem);
    return {
      success: true,
      data: {
        payments,
        totalCount: payments.length,
        hasMore: false,
      },
    };
  }

  // 이미 표준 구조로 오는 경우 그대로 반환
  return res as ApiResponse<GetPaymentHistoryResponse>;
}

/**
 * 결제권 사용 내역 조회
 *
 * 현재 백엔드에 전용 엔드포인트가 없어 빈 배열을 반환한다.
 * 추후 `/credits/transactions/me` 와 같은 엔드포인트가 추가되면 이 함수만 교체한다.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getUsageHistory(
  params?: GetUsageHistoryRequest,
): Promise<ApiResponse<GetUsageHistoryResponse>> {
  void params;
  return {
    success: true,
    data: {
      usages: [],
      totalCount: 0,
      hasMore: false,
    },
  };
}

/**
 * 현재 결제권 상태 조회
 *
 * 백엔드 `/credits/stats/me`는 통계 flat 객체를 반환하므로
 * 프론트 타입 `CreditStatus` 로 매핑한다.
 */
export async function getCreditStatus(): Promise<ApiResponse<GetCreditStatusResponse>> {
  const res = await api.get<BackendCreditStats>('/credits/stats/me');

  if (!res.success || !res.data) {
    return {
      success: res.success,
      data: {
        creditStatus: {
          currentCredits: 0,
          totalCredits: 0,
          usedCredits: 0,
          expiringCredits: 0,
          expiresIn: 0,
        },
      },
      error: res.error,
    } as ApiResponse<GetCreditStatusResponse>;
  }

  const stats = res.data;
  return {
    success: true,
    data: {
      creditStatus: {
        currentCredits: stats.availableRemaining ?? 0,
        totalCredits: stats.totalIssued ?? 0,
        usedCredits: stats.totalUsed ?? 0,
        expiringCredits: 0,
        expiresIn: 0,
      },
    },
  };
}

/**
 * 영수증 상세 조회
 */
export async function getReceipt(receiptId: string): Promise<ApiResponse<GetReceiptResponse>> {
  return api.get<GetReceiptResponse>(`/payments/receipts/${receiptId}`);
}

/**
 * 결제 완료 확인 (결제 완료 페이지에서 사용)
 */
export async function verifyPaymentCompletion(
  params: PaymentCompletionParams,
): Promise<ApiResponse<VerifyPaymentResponse>> {
  return api.post<VerifyPaymentResponse>('/payments/verify', params);
}

/**
 * 영수증 PDF 다운로드 URL 조회
 */
export async function getReceiptDownloadUrl(
  receiptId: string,
): Promise<ApiResponse<{ downloadUrl: string }>> {
  return api.get<{ downloadUrl: string }>(`/payments/receipts/${receiptId}/download`);
}

/**
 * 결제 취소 요청
 */
export async function requestPaymentCancel(
  paymentId: string,
  reason?: string,
): Promise<ApiResponse<{ message: string; refundAmount: number }>> {
  return api.post<{ message: string; refundAmount: number }>(`/payments/${paymentId}/cancel`, {
    reason,
  });
}

/**
 * 결제 내역을 월별로 그룹화하는 유틸리티
 */
export function groupPaymentsByMonth(payments: PaymentHistoryItem[]): GroupedPaymentHistory {
  if (!payments || !Array.isArray(payments)) return {};
  return payments.reduce((groups, payment) => {
    if (!payment.date) return groups;
    const [year, month] = payment.date.split('.');
    if (!year || !month) return groups;
    const monthKey = `${year}년 ${parseInt(month, 10)}월`;

    if (!groups[monthKey]) groups[monthKey] = [];
    groups[monthKey].push(payment);
    return groups;
  }, {} as GroupedPaymentHistory);
}

/**
 * 사용 내역을 월별로 그룹화하는 유틸리티
 */
export function groupUsagesByMonth(usages: UsageHistoryItem[]): GroupedUsageHistory {
  if (!usages || !Array.isArray(usages)) return {};
  return usages.reduce((groups, usage) => {
    if (!usage.date) return groups;
    const [year, month] = usage.date.split('.');
    if (!year || !month) return groups;
    const monthKey = `${year}년 ${parseInt(month, 10)}월`;

    if (!groups[monthKey]) groups[monthKey] = [];
    groups[monthKey].push(usage);
    return groups;
  }, {} as GroupedUsageHistory);
}

// 기본 export
const paymentService = {
  getPaymentHistory,
  getUsageHistory,
  getCreditStatus,
  getReceipt,
  verifyPaymentCompletion,
  getReceiptDownloadUrl,
  requestPaymentCancel,
  groupPaymentsByMonth,
  groupUsagesByMonth,
};

export default paymentService;
