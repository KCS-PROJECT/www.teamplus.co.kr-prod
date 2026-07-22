/**
 * 결제 관련 타입 정의
 */

import { PaymentStatus } from './api';

// ============================================
// 결제 상태 및 타입
// ============================================

// PaymentStatus는 './api'에서 import됨 - 중복 정의 방지

/** 결제 유형 */
export type PaymentType = 'regular' | 'trial' | 'cancelled';

// ============================================
// 결제 출처 · 선후불 (백엔드 파생 필드 미러 — DB 컬럼 아님)
// ============================================

/** 결제 출처 — 수업 / 대회 (백엔드 deriveSource 파생값 미러). */
export type PaymentSourceType = 'CLASS' | 'TOURNAMENT';

/** 선불 / 후불 (백엔드 deriveSource 파생값 미러). */
export type PaymentBillingTiming = 'PREPAID' | 'POSTPAID';

// ============================================
// 결제 방식 (feeType) — Backend ClassProduct.feeType / Tournament.feeType
// ============================================

/**
 * 결제 방식 (Backend `ClassProduct.feeType` · `Tournament.feeType`와 정렬)
 * - MONTHLY_FIXED: 정기권 (주 N회 × 회당 단가 × weeks주 — durationDays/7 동적 계산)
 * - PER_SESSION: 횟수제 (totalSessions × 금액)
 * - PER_GAME: 경기당 (gameCount × 금액 — 대회용)
 */
export type FeeType = 'MONTHLY_FIXED' | 'PER_SESSION' | 'PER_GAME';

/** 결제 옵션 프리뷰 (카드 표시에 필요한 최소 데이터) */
export interface PaymentOption {
  /** 결제 방식 */
  feeType: FeeType;
  /** 단위당 금액 (1회/1경기/1주기 기준) */
  pricePerUnit: number;
  /** MONTHLY_FIXED 전용 — 주 N회 */
  weeklyCount?: number;
  /** PER_SESSION 전용 — 총 회수 */
  totalSessions?: number;
  /** PER_GAME 전용 — 총 경기 수 */
  gameCount?: number;
  /** MONTHLY_FIXED 전용 — 4주 기준 월 고정 금액 (서버 제공 시 우선 사용) */
  monthlyFixedAmount?: number;
}

/** 결제권 사용 상태 */
export type UsageStatus = 'attended' | 'absent' | 'cancelled';

// ============================================
// 결제 내역 타입
// ============================================

/** 결제 내역 아이템 */
export interface PaymentHistoryItem {
  id: string;
  type: PaymentType;
  productName: string;
  /** 결제 대상 수업명 (Enrollment.class.className) — 결제내역 카드에 상품명 위로 노출 */
  className?: string;
  date: string;
  time: string;
  amount: number;
  status: PaymentStatus;
  refundStatus?: string;
  creditsIssued?: number;
  orderNumber?: string;
  /** 결제 출처 (수업/대회) — 백엔드 파생 append. 무관계 결제(매치·쇼핑)는 미제공. */
  sourceType?: PaymentSourceType;
  /** 선불/후불 — 백엔드 파생 append. 무관계 결제는 미제공. */
  billingTiming?: PaymentBillingTiming;
  /** 결제 대상명 — 대회명(Tournament.name) 또는 후불 수업명(BillingLine→Billing→Class). 선불 수업명은 className 담당. */
  subjectName?: string;
  /** 수강생(자녀) 표시명 — 후불: BillingLine.user / 선불: Enrollment.child, lastName+firstName 조합. */
  childName?: string;
  /** 후불 정산월 "YYYY-MM" (MonthlyPostpaidBilling.yearMonth). 후불 결제만 존재. */
  billingYearMonth?: string;
  /** 후불 청구 근거 출석 횟수 (BillingLine.attendanceCount 확정값). 후불 결제만 존재. */
  attendanceCount?: number;
  /** 후불 회당 단가 — 청구 총액÷출석횟수 파생값 (출석 0회면 미제공). */
  unitPrice?: number;
}

/** 결제권 사용 내역 아이템 */
export interface UsageHistoryItem {
  id: string;
  className: string;
  date: string;
  time: string;
  creditsUsed: number;
  status: UsageStatus;
}

/** 월별 그룹화된 결제 내역 */
export interface GroupedPaymentHistory {
  [month: string]: PaymentHistoryItem[];
}

/** 월별 그룹화된 사용 내역 */
export interface GroupedUsageHistory {
  [month: string]: UsageHistoryItem[];
}

// ============================================
// 영수증 타입
// ============================================

/** 영수증 상세 정보 */
export interface Receipt {
  id: string;
  orderNumber: string;
  status: PaymentStatus;
  storeName: string;
  paymentDate: string;
  paymentMethod: string;
  cardLastFour?: string;
  installment?: string;
  productName: string;
  totalAmount: number;
  creditsIssued: number;
  /** 수업명 (Enrollment → Class.className). 수업 결제인 경우에만 존재. */
  className?: string;
  /** 수강생(자녀) 이름 (Enrollment → Child.name). 수업 결제인 경우에만 존재. */
  childName?: string;
  /** 결제 출처 (수업/대회) — 백엔드 파생 append. 무관계 결제는 미제공. */
  sourceType?: PaymentSourceType;
  /** 선불/후불 — 백엔드 파생 append. 무관계 결제는 미제공. */
  billingTiming?: PaymentBillingTiming;
}

// ============================================
// 결제권 타입
// ============================================

/** 결제권 상태 */
export interface CreditStatus {
  currentCredits: number;
  totalCredits: number;
  usedCredits: number;
  expiringCredits: number;
  expiresIn: number; // 만료까지 남은 일수
}

// ============================================
// API 요청/응답 타입
// ============================================

/** 결제 내역 조회 요청 */
export interface GetPaymentHistoryRequest {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

/** 결제 내역 조회 응답 */
export interface GetPaymentHistoryResponse {
  payments: PaymentHistoryItem[];
  totalCount: number;
  hasMore: boolean;
}

/** 사용 내역 조회 요청 */
export interface GetUsageHistoryRequest {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  memberId?: string;
}

/** 사용 내역 조회 응답 */
export interface GetUsageHistoryResponse {
  usages: UsageHistoryItem[];
  totalCount: number;
  hasMore: boolean;
}

/** 결제권 상태 조회 응답 */
export interface GetCreditStatusResponse {
  creditStatus: CreditStatus;
}

/** 영수증 조회 응답 */
export interface GetReceiptResponse {
  receipt: Receipt;
}

/** 결제 완료 정보 (URL 파라미터로 전달받는 결제 결과) */
export interface PaymentCompletionParams {
  orderNumber: string;
  tid?: string;
  resultCode?: string;
}

/** 결제 완료 확인 응답 */
export interface VerifyPaymentResponse {
  receipt: Receipt;
  creditsIssued: number;
  message: string;
}
