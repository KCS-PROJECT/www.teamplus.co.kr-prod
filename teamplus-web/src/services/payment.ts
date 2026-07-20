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

/** 백엔드 /admin/director-payment-summary 원본 응답 (선택 필드·느슨한 타입) */
interface BackendDirectorPaymentSummary {
  summary?: {
    totalRevenue?: number | string;
    unpaid?: number | string;
    pendingSettlement?: number | string;
    completedCount?: number | string;
    unpaidCount?: number | string;
  };
  teams?: Array<{
    id?: string;
    teamName?: string;
    totalMembers?: number | string;
    paidMembers?: number | string;
    unpaidMembers?: number | string;
    totalAmount?: number | string;
    paidAmount?: number | string;
    unpaidAmount?: number | string;
    feeType?: string;
    billingTiming?: string;
  }>;
  unpaidMembers?: Array<{
    id?: string;
    name?: string;
    teamName?: string;
    amount?: number | string;
    billingType?: string;
  }>;
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

// ============================================
// 감독 결제 현황 (director-payments)
// ============================================

/** 감독 결제 요약 — totalRevenue/unpaid 는 선불+후불 합산 금액 */
export interface DirectorPaymentSummary {
  totalRevenue: number;
  unpaid: number;
  pendingSettlement: number;
  completedCount: number;
  unpaidCount: number;
}

/** 팀별 결제 현황 — unpaidMembers 는 미납 "인원 수"(카운트) */
export interface DirectorTeamPayment {
  id: string;
  teamName: string;
  totalMembers: number;
  paidMembers: number;
  unpaidMembers: number;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  feeType: 'MONTHLY_FIXED' | 'PER_SESSION';
  billingTiming: 'PREPAID' | 'POSTPAID';
}

/** 미수금 회원 1건 — 최상위 목록 항목(인원 카운트인 팀별 unpaidMembers 와 의미 다름) */
export interface DirectorUnpaidMember {
  id: string;
  name: string;
  teamName: string;
  amount: number;
  billingType: 'PREPAID' | 'POSTPAID';
}

export interface DirectorPaymentSummaryResult {
  summary: DirectorPaymentSummary;
  teams: DirectorTeamPayment[];
  unpaidMembers: DirectorUnpaidMember[];
}

/** 미납 내역 1줄 — 선불(PREPAID)/후불(POSTPAID) */
export interface DirectorUnpaidDetailLine {
  type: 'PREPAID' | 'POSTPAID';
  className: string;
  amount: number;
  yearMonth?: string;
  attendanceCount?: number;
}

/** 미수금 회원 상세 — 보호자 연락처 + 미납 내역 */
export interface DirectorUnpaidMemberDetail {
  member: { id: string; name: string; totalAmount: number };
  parents: { id: string; name: string; phone: string | null }[];
  details: DirectorUnpaidDetailLine[];
}

/** 미납 안내 발송 결과 */
export interface DirectorUnpaidReminderResult {
  sent: boolean;
  cooldown: boolean;
  recipientCount: number;
}

/** unknown 값을 안전하게 숫자로 변환 (null/undefined/NaN → 0) */
function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 감독 결제 현황 조회 (`GET /admin/director-payment-summary`)
 *
 * 백엔드 키가 UI 타입과 거의 일치하지만, 안전을 위해 숫자 변환·기본값·유니온 정규화를 수행한다.
 *
 * ⚠️ 금융 화면 — 실패(403/500/timeout/네트워크)를 정상 0/빈 결과로 위장하지 않는다.
 * 응답이 실패이거나 data 가 없으면 **throw** 하여, 미수금 탭이 "미수금 없음"과
 * "불러오지 못함"을 구분해 에러+재시도 UI 로 처리하도록 한다. 성공 시에만 정규화 구조를 반환.
 */
export async function getDirectorPaymentSummary(): Promise<DirectorPaymentSummaryResult> {
  const res = await api.get<BackendDirectorPaymentSummary>('/admin/director-payment-summary');

  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'director payment summary load failed');
  }

  const raw = res.data;
  const s = raw.summary ?? {};

  const summary: DirectorPaymentSummary = {
    totalRevenue: toNumber(s.totalRevenue),
    unpaid: toNumber(s.unpaid),
    pendingSettlement: toNumber(s.pendingSettlement),
    completedCount: toNumber(s.completedCount),
    unpaidCount: toNumber(s.unpaidCount),
  };

  const teams: DirectorTeamPayment[] = Array.isArray(raw.teams)
    ? raw.teams.map((t) => ({
        id: String(t?.id ?? ''),
        teamName: t?.teamName ?? '',
        totalMembers: toNumber(t?.totalMembers),
        paidMembers: toNumber(t?.paidMembers),
        unpaidMembers: toNumber(t?.unpaidMembers),
        totalAmount: toNumber(t?.totalAmount),
        paidAmount: toNumber(t?.paidAmount),
        unpaidAmount: toNumber(t?.unpaidAmount),
        feeType: t?.feeType === 'PER_SESSION' ? 'PER_SESSION' : 'MONTHLY_FIXED',
        billingTiming: t?.billingTiming === 'POSTPAID' ? 'POSTPAID' : 'PREPAID',
      }))
    : [];

  const unpaidMembers: DirectorUnpaidMember[] = Array.isArray(raw.unpaidMembers)
    ? raw.unpaidMembers.map((m) => ({
        id: String(m?.id ?? ''),
        name: m?.name ?? '',
        teamName: m?.teamName ?? '',
        amount: toNumber(m?.amount),
        billingType: m?.billingType === 'POSTPAID' ? 'POSTPAID' : 'PREPAID',
      }))
    : [];

  return { summary, teams, unpaidMembers };
}

/**
 * 미수금 회원 상세 조회 (`GET /admin/director-payments/unpaid/:memberId`)
 * 보호자 연락처 + 미납 내역(선불/후불)을 반환한다.
 */
export async function getDirectorUnpaidMemberDetail(
  memberId: string,
): Promise<ApiResponse<DirectorUnpaidMemberDetail>> {
  return api.get<DirectorUnpaidMemberDetail>(
    `/admin/director-payments/unpaid/${memberId}`,
  );
}

/**
 * 미수금 회원 미납 안내 발송 (`POST /admin/director-payments/unpaid/:memberId/remind`)
 * 미납 자녀의 보호자에게 인앱+푸시 안내를 발송한다. 백엔드 24시간 쿨다운.
 */
export async function sendDirectorUnpaidReminder(
  memberId: string,
): Promise<ApiResponse<DirectorUnpaidReminderResult>> {
  return api.post<DirectorUnpaidReminderResult>(
    `/admin/director-payments/unpaid/${memberId}/remind`,
    {},
  );
}

// ============================================
// 팀 정산 센터 (team-settlement-center) — 월 인식 훈련/대회 소계
// ============================================

/** 소계 정산 상태(5-state). 백엔드 SubtotalSettlementStatus 미러. */
export type SettlementSubtotalStatus =
  | 'NOT_REQUIRED'
  | 'NOT_READY'
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIAL_BILLED';

/** 소계 결제 상태. 백엔드 SubtotalPaymentStatus 미러. */
export type SettlementSubtotalPaymentStatus =
  | 'NONE'
  | 'UNPAID_ALL'
  | 'PARTIAL_PAID'
  | 'PAID_ALL';

/** 정산 차단 사유 코드(화면 문구는 messages.ts). 백엔드 BlockedReasonCode 미러. */
export type SettlementBlockedReasonCode =
  | 'MONTH_NOT_ENDED'
  | 'NO_ATTENDANCE'
  | 'UNIT_PRICE_MISSING'
  | 'TOURNAMENT_NOT_ENDED'
  | 'BILLING_TIMING_UNASSIGNED'
  | null;

/** 수업 소계 응답 계약(백엔드 ClassSettlementSummary 미러). */
export interface ClassSettlementSummary {
  classId: string;
  className: string;
  teamId: string | null;
  teamName: string | null;
  billingMode: string;
  settlementStatus: SettlementSubtotalStatus;
  paymentStatus: SettlementSubtotalPaymentStatus;
  total: number;
  paidCount: number;
  billedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  estimatedAmount: number;
  cancelledCount: number;
  refundedCount: number;
  refundedAmount: number;
  mixedBilling: boolean;
  prepaidCount: number;
  postpaidCount: number;
  unassignedCount: number;
  blockedReasonCode: SettlementBlockedReasonCode;
  /** 드릴다운 경로 — "/classes/{id}/students?yearMonth=YYYY-MM". */
  detailPath: string;
}

/** 대회 소계 응답 계약(백엔드 TournamentSettlementSummary 미러 — 선불/후불 인원 축 없음). */
export interface TournamentSettlementSummary {
  tournamentId: string;
  tournamentName: string;
  teamId: string | null;
  teamName: string | null;
  billingMode: string;
  settlementStatus: SettlementSubtotalStatus;
  paymentStatus: SettlementSubtotalPaymentStatus;
  total: number;
  paidCount: number;
  billedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  estimatedAmount: number;
  cancelledCount: number;
  refundedCount: number;
  refundedAmount: number;
  mixedBilling: boolean;
  blockedReasonCode: SettlementBlockedReasonCode;
  /** 드릴다운 경로 — "/tournaments/{id}#settlement". */
  detailPath: string;
}

/** 미납 요약 — amount=미수금 총액, count=미납 발생 항목(수업/대회) 수. */
export interface SettlementUnpaidSummary {
  amount: number;
  count: number;
}

/** 팀 정산 센터 소계 응답(백엔드 TeamSettlementSummaryResponse 미러). */
export interface TeamSettlementSummaryResponse {
  yearMonth: string;
  classes: ClassSettlementSummary[];
  tournaments: TournamentSettlementSummary[];
  unpaid: SettlementUnpaidSummary;
}

/** 서비스 반환 별칭 — 페이지/훅에서 결과 타입으로 참조. */
export type TeamSettlementSummaryResult = TeamSettlementSummaryResponse;

/**
 * 팀 정산 센터 소계 조회 (`GET /payments/team-settlement-center/summary`)
 *
 * 선택 월 기준으로 훈련(수업)/대회 소계 + 미납 요약을 반환한다.
 *
 * ⚠️ 금융 화면 — 실패(403/500/timeout/네트워크)를 정상 0/빈 결과로 위장하지 않는다.
 * 응답이 실패이거나 data 가 없으면 **throw** 하여, 호출부(페이지)가 "미수금 없음"과
 * "불러오지 못함"을 구분해 에러+재시도 UI 로 처리하도록 한다.
 * 성공 시에만 정규화된 구조를 반환한다.
 */
export async function getTeamSettlementSummary(params?: {
  yearMonth?: string;
  teamId?: string;
}): Promise<TeamSettlementSummaryResult> {
  const fallbackYm = params?.yearMonth ?? '';
  const res = await api.get<TeamSettlementSummaryResponse>(
    '/payments/team-settlement-center/summary',
    { params },
  );

  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'settlement summary load failed');
  }

  const raw = res.data;
  return {
    yearMonth: raw.yearMonth || fallbackYm,
    classes: Array.isArray(raw.classes) ? raw.classes : [],
    tournaments: Array.isArray(raw.tournaments) ? raw.tournaments : [],
    unpaid: {
      amount: toNumber(raw.unpaid?.amount),
      count: toNumber(raw.unpaid?.count),
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
  getDirectorPaymentSummary,
  getDirectorUnpaidMemberDetail,
  sendDirectorUnpaidReminder,
  getTeamSettlementSummary,
  getReceipt,
  verifyPaymentCompletion,
  getReceiptDownloadUrl,
  requestPaymentCancel,
  groupPaymentsByMonth,
  groupUsagesByMonth,
};

export default paymentService;
