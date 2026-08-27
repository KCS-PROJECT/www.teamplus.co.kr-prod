/**
 * Payment Service
 * 결제 관련 API 호출 서비스
 *
 * 백엔드 응답 스키마가 프론트 타입과 완전히 일치하지 않기 때문에
 * 이 레이어에서 매핑을 수행하여 UI가 항상 동일한 구조의 데이터를 받도록 보장한다.
 */

import { api } from './api-client';
import { MESSAGES } from '@/lib/messages';
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
  PaymentSourceType,
  PaymentBillingTiming,
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
  /** 결제 출처 파생 append — "CLASS" | "TOURNAMENT". 무관계 결제는 미제공/무효 → undefined. */
  sourceType?: string | null;
  /** 선후불 파생 append — "PREPAID" | "POSTPAID". 무관계 결제는 미제공/무효 → undefined. */
  billingTiming?: string | null;
  /** 결제 대상명 — 대회명 또는 후불 수업명(BillingLine→Billing→Class 체인). */
  subjectName?: string | null;
  /** 수강생(자녀) 표시명 — 후불: BillingLine.user / 선불: Enrollment.child. */
  childName?: string | null;
  /** 후불 정산월 "YYYY-MM". */
  billingYearMonth?: string | null;
  /** 후불 청구 근거 출석 횟수 (라인 확정값). */
  attendanceCount?: number | null;
  /** 후불 회당 단가 — 총액÷출석횟수 파생 (출석 0회면 null). */
  unitPrice?: number | null;
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

/** 백엔드 sourceType → 프론트 유니온 정규화. 미제공/무효값은 undefined(배지 미표시). */
function normalizePaymentSourceType(value: unknown): PaymentSourceType | undefined {
  if (value === 'CLASS') return 'CLASS';
  if (value === 'TOURNAMENT') return 'TOURNAMENT';
  return undefined;
}

/** 백엔드 billingTiming → 프론트 유니온 정규화. 미제공/무효값은 undefined(배지 미표시). */
function normalizePaymentBillingTiming(value: unknown): PaymentBillingTiming | undefined {
  if (value === 'PREPAID') return 'PREPAID';
  if (value === 'POSTPAID') return 'POSTPAID';
  return undefined;
}

/** null/빈 문자열은 undefined 로 정규화 (배지·라벨 미표시). */
function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** 양수 정수만 통과, 그 외(null/0/NaN)는 undefined. */
function normalizePositiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

function toPaymentHistoryItem(item: BackendPaymentItem): PaymentHistoryItem {
  const status = mapPaymentStatus(item.paymentStatus);
  const sourceType = normalizePaymentSourceType(item.sourceType);
  // 대회 결제는 Payment.productId 가 null(상품 미연결) — 출처 인식형 폴백으로 표기.
  const productName =
    item.productName ||
    (sourceType === 'TOURNAMENT'
      ? MESSAGES.payment2.tournamentFeeProduct
      : MESSAGES.payment2.fallbackProduct);
  const amount = typeof item.amount === 'string' ? Number(item.amount) : item.amount;
  const baseDate = item.completedAt || item.createdAt;

  return {
    id: item.id,
    type: inferPaymentType(status, productName),
    productName,
    className: item.className ?? undefined,
    date: formatDate(baseDate),
    time: formatTime(baseDate),
    paidAtIso: baseDate || undefined,
    amount: Number.isFinite(amount) ? amount : 0,
    status,
    orderNumber: item.orderNumber,
    sourceType,
    billingTiming: normalizePaymentBillingTiming(item.billingTiming),
    subjectName: normalizeOptionalText(item.subjectName),
    childName: normalizeOptionalText(item.childName),
    billingYearMonth: normalizeOptionalText(item.billingYearMonth),
    attendanceCount: normalizePositiveInt(item.attendanceCount),
    unitPrice: normalizePositiveInt(item.unitPrice),
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
// 팀 정산 센터 — 인별 미수금 (unpaid-members)
// ============================================

/** 미납 출처 종류 — 수업 / 대회. */
export type UnpaidSourceKind = 'CLASS' | 'TOURNAMENT';

/** 인별 미수금 1행 — 그룹핑 키는 회원(자녀/선수) User.id. */
export interface UnpaidMemberRow {
  memberId: string;
  name: string;
  teamName: string | null;
  outstandingAmount: number;
  sources: UnpaidSourceKind[];
  classCount: number;
  tournamentCount: number;
}

/** 팀 인별 미수금 목록 응답(백엔드 TeamUnpaidMembersResponse 미러). */
export interface TeamUnpaidMembersResponse {
  yearMonth: string;
  members: UnpaidMemberRow[];
  totalOutstanding: number;
  totalCount: number;
}

/** 인별 미수금 상세 1줄 — source(수업/대회) 단위. */
export interface UnpaidDetailLine {
  sourceType: UnpaidSourceKind;
  sourceId: string;
  sourceName: string;
  teamName: string | null;
  billingTiming: 'PREPAID' | 'POSTPAID';
  yearMonth: string;
  amount: number;
  /** 후불 확정 라인일 때만 존재(선불/대회는 생략). */
  attendanceCount?: number;
}

/** 인별 미수금 상세 응답(백엔드 UnpaidMemberDetailResponse 미러). */
export interface UnpaidMemberDetailResponse {
  member: { id: string; name: string; totalOutstanding: number };
  parents: { id: string; name: string; phone: string | null }[];
  details: UnpaidDetailLine[];
}

/** 미납 안내 발송 결과. */
export interface UnpaidReminderResult {
  sent: boolean;
  cooldown: boolean;
  recipientCount: number;
}

/** 백엔드 출처 값 → 프론트 UnpaidSourceKind 정규화. */
function toUnpaidSourceKind(value: unknown): UnpaidSourceKind {
  return value === 'TOURNAMENT' ? 'TOURNAMENT' : 'CLASS';
}

/** 백엔드 결제방식 값 → 프론트 유니온 정규화. */
function toBillingTiming(value: unknown): 'PREPAID' | 'POSTPAID' {
  return value === 'POSTPAID' ? 'POSTPAID' : 'PREPAID';
}

/** unknown 값을 안전하게 숫자로 변환 (null/undefined/NaN → 0) */
function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 팀 인별 미수금 목록 조회 (`GET /payments/team-settlement-center/unpaid-members`)
 *
 * 선택 월 기준으로 수업+대회 후불/선불 미납을 회원별로 통합해 반환한다.
 * 인별 합계(totalOutstanding)는 훈련/대회 탭의 미수금 총액(summary.unpaid.amount)과 정합.
 *
 * ⚠️ 금융 화면 — 실패(403/500/timeout/네트워크)를 정상 0/빈 결과로 위장하지 않는다.
 * 응답이 실패이거나 data 가 없으면 **throw** 하여, 미수금 탭이 "미수금 없음"과
 * "불러오지 못함"을 구분해 에러+재시도 UI 로 처리하도록 한다. 성공 시에만 정규화 구조를 반환.
 */
export async function getTeamUnpaidMembers(params: {
  yearMonth: string;
  teamId?: string;
}): Promise<TeamUnpaidMembersResponse> {
  const { yearMonth, teamId } = params;
  const res = await api.get<TeamUnpaidMembersResponse>(
    '/payments/team-settlement-center/unpaid-members',
    { params: { yearMonth, teamId } },
  );

  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'team unpaid members load failed');
  }

  const raw = res.data;
  const members: UnpaidMemberRow[] = Array.isArray(raw.members)
    ? raw.members.map((m) => ({
        memberId: String(m?.memberId ?? ''),
        name: m?.name ?? '',
        teamName: m?.teamName ?? null,
        outstandingAmount: toNumber(m?.outstandingAmount),
        sources: Array.isArray(m?.sources) ? m.sources.map(toUnpaidSourceKind) : [],
        classCount: toNumber(m?.classCount),
        tournamentCount: toNumber(m?.tournamentCount),
      }))
    : [];

  return {
    yearMonth: raw.yearMonth || yearMonth,
    members,
    totalOutstanding: toNumber(raw.totalOutstanding),
    totalCount: toNumber(raw.totalCount),
  };
}

/** 거래 내역 행 — 결제 1건 = 1행(장부 축·완료월 귀속). */
export interface TeamTransactionItem {
  paymentId: string;
  amount: number;
  /** completed | refunded | partially_refunded | cancelled(실결제 후 취소). */
  paymentStatus: string;
  completedAt: string;
  payerName: string | null;
  childName: string | null;
  /** 수업명 또는 대회명 — 연결 끊김 시 null. */
  subjectName: string | null;
  sourceType: 'CLASS' | 'TOURNAMENT' | null;
  billingTiming: 'PREPAID' | 'POSTPAID' | null;
}

export interface TeamTransactionsResponse {
  yearMonth: string;
  items: TeamTransactionItem[];
  /** 월 내 전체 건수 — items 는 최신순 상한(300)까지만. */
  totalCount: number;
}

/**
 * 팀 거래 내역 조회 (`GET /payments/team-settlement-center/transactions`)
 *
 * 선택 월에 완료(환불·취소 포함)된 관리 팀 결제를 건별·최신순으로 반환한다.
 * ⚠️ 금융 화면 — 실패를 빈 목록으로 위장하지 않는다(throw → 에러+재시도 UI).
 */
export async function getTeamTransactions(params: {
  yearMonth: string;
  teamId?: string;
}): Promise<TeamTransactionsResponse> {
  const { yearMonth, teamId } = params;
  const res = await api.get<TeamTransactionsResponse>(
    '/payments/team-settlement-center/transactions',
    { params: { yearMonth, teamId } },
  );

  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'team transactions load failed');
  }

  const raw = res.data;
  return {
    yearMonth: raw.yearMonth ?? yearMonth,
    items: Array.isArray(raw.items) ? raw.items : [],
    totalCount: toNumber(raw.totalCount),
  };
}

/**
 * 팀 인별 미수금 상세 조회 (`GET /payments/team-settlement-center/unpaid-members/:memberId`)
 *
 * 보호자 연락처 + source(수업/대회)별 미납 라인을 반환한다.
 * scope 밖 회원·미납 0건이면 백엔드 404 → **throw**(IDOR 가드).
 */
export async function getTeamUnpaidMemberDetail(params: {
  memberId: string;
  yearMonth: string;
  teamId?: string;
}): Promise<UnpaidMemberDetailResponse> {
  const { memberId, yearMonth, teamId } = params;
  const res = await api.get<UnpaidMemberDetailResponse>(
    `/payments/team-settlement-center/unpaid-members/${memberId}`,
    { params: { yearMonth, teamId } },
  );

  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'unpaid member detail load failed');
  }

  const raw = res.data;
  const details: UnpaidDetailLine[] = Array.isArray(raw.details)
    ? raw.details.map((d) => ({
        sourceType: toUnpaidSourceKind(d?.sourceType),
        sourceId: String(d?.sourceId ?? ''),
        sourceName: d?.sourceName ?? '',
        teamName: d?.teamName ?? null,
        billingTiming: toBillingTiming(d?.billingTiming),
        yearMonth: d?.yearMonth ?? yearMonth,
        amount: toNumber(d?.amount),
        ...(typeof d?.attendanceCount === 'number'
          ? { attendanceCount: d.attendanceCount }
          : {}),
      }))
    : [];

  return {
    member: {
      id: String(raw.member?.id ?? memberId),
      name: raw.member?.name ?? '',
      totalOutstanding: toNumber(raw.member?.totalOutstanding),
    },
    parents: Array.isArray(raw.parents)
      ? raw.parents.map((p) => ({
          id: String(p?.id ?? ''),
          name: p?.name ?? '',
          phone: p?.phone ?? null,
        }))
      : [],
    details,
  };
}

/**
 * 팀 인별 미납 안내 발송 (`POST /payments/team-settlement-center/unpaid-members/:memberId/remind`)
 *
 * 미납 자녀의 보호자에게 인앱+푸시 안내를 발송한다(수업+대회 미납 합산). 월별 쿨다운.
 *
 * ⚠️ 금융 화면 — 실패(403/500/timeout/네트워크)를 정상 결과로 위장하지 않는다. 실패 시 **throw**.
 */
export async function sendTeamUnpaidReminder(params: {
  memberId: string;
  yearMonth: string;
}): Promise<UnpaidReminderResult> {
  const { memberId, yearMonth } = params;
  const res = await api.post<UnpaidReminderResult>(
    `/payments/team-settlement-center/unpaid-members/${memberId}/remind`,
    { yearMonth },
  );

  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'unpaid reminder send failed');
  }

  return {
    sent: Boolean(res.data.sent),
    cooldown: Boolean(res.data.cooldown),
    recipientCount: toNumber(res.data.recipientCount),
  };
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
 * 오픈클래스(academy) 정산 센터 소계 응답(백엔드 AcademySettlementSummaryResponse 미러).
 * 팀 허브와 달리 대회 축이 없다(오픈클래스 scope) — classes + unpaid 만.
 */
export interface AcademySettlementSummaryResponse {
  yearMonth: string;
  academyId: string;
  classes: ClassSettlementSummary[];
  unpaid: SettlementUnpaidSummary;
}

/** 서비스 반환 별칭 — 탭 컴포넌트에서 결과 타입으로 참조. */
export type AcademySettlementSummaryResult = AcademySettlementSummaryResponse;

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
 * 연체 미납 청구 항목 수 조회 (`GET /payments/team-settlement-center/unpaid-total`)
 *
 * 정산센터 Hero "미납 N건" 칩 전용 — 월과 무관하게, 청구 후 유예 기간(백엔드 7일)이
 * 지나도 미결제인 청구 항목 수만 센다(정산 확정 직후 전원 미납은 "수납 중"이라 제외).
 * 실패는 호출부에서 0 처리(fail-closed, 칩 미노출)하므로 throw 하지 않고 응답을 그대로 반환한다.
 */
export async function getTeamUnpaidTotal(params?: { teamId?: string }) {
  return api.get<{ count: number }>(
    '/payments/team-settlement-center/unpaid-total',
    { params },
  );
}

/** 연체 미납 회원 라인 — memberId 는 인별 상세/안내 발송 API 와 동일 축(자녀 User.id). */
export interface UnpaidOverdueMemberLine {
  memberId: string;
  memberName: string;
  amount: number;
}

/** 연체 미납 항목 — 청구 단위(수업×월 청구서 / 대회 일괄청구). */
export interface UnpaidOverdueItem {
  key: string;
  sourceType: 'CLASS' | 'TOURNAMENT';
  sourceId: string;
  sourceName: string;
  /** 귀속 월(YYYY-MM) — 인별 상세/안내 발송의 yearMonth 파라미터로 그대로 사용. */
  yearMonth: string;
  billedAt: string;
  overdueDays: number;
  amount: number;
  members: UnpaidOverdueMemberLine[];
}

export interface TeamUnpaidItemsResponse {
  count: number;
  totalAmount: number;
  graceDays: number;
  items: UnpaidOverdueItem[];
}

/**
 * 연체 미납 목록 조회 (`GET /payments/team-settlement-center/unpaid-items`)
 *
 * 미납 관리 페이지 전용 — 청구 단위 그룹 + 인별 라인, 오래된 청구 우선.
 * ⚠️ 금융 화면 — 실패를 빈 목록으로 위장하지 않는다. 실패 시 **throw**.
 */
export async function getTeamUnpaidItems(params?: {
  teamId?: string;
}): Promise<TeamUnpaidItemsResponse> {
  const res = await api.get<TeamUnpaidItemsResponse>(
    '/payments/team-settlement-center/unpaid-items',
    { params },
  );
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'unpaid items load failed');
  }
  const raw = res.data;
  return {
    count: toNumber(raw.count),
    totalAmount: toNumber(raw.totalAmount),
    graceDays: toNumber(raw.graceDays),
    items: Array.isArray(raw.items)
      ? raw.items.map((item) => ({
          ...item,
          amount: toNumber(item.amount),
          overdueDays: toNumber(item.overdueDays),
          members: Array.isArray(item.members)
            ? item.members.map((m) => ({ ...m, amount: toNumber(m.amount) }))
            : [],
        }))
      : [],
  };
}

/**
 * 오픈클래스 정산 센터 소계 조회 (`GET /academies/:academyId/settlement-summary`)
 *
 * 선택 월 기준으로 오픈클래스 수업 소계 + 미납 요약을 반환한다(대회 없음).
 *
 * ⚠️ 금융 화면 — 실패(403/500/timeout/네트워크)를 정상 0/빈 결과로 위장하지 않는다.
 * 응답이 실패이거나 data 가 없으면 **throw** 하여, 호출부(정산 탭)가 "미수금 없음"과
 * "불러오지 못함"을 구분해 에러+재시도 UI 로 처리하도록 한다. 성공 시에만 정규화 구조를 반환.
 */
export async function getAcademySettlementSummary(params: {
  academyId: string;
  yearMonth?: string;
}): Promise<AcademySettlementSummaryResult> {
  const { academyId, yearMonth } = params;
  const fallbackYm = yearMonth ?? '';
  const res = await api.get<AcademySettlementSummaryResponse>(
    `/academies/${academyId}/settlement-summary`,
    { params: { yearMonth } },
  );

  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? 'academy settlement summary load failed');
  }

  const raw = res.data;
  return {
    yearMonth: raw.yearMonth || fallbackYm,
    academyId: raw.academyId || academyId,
    classes: Array.isArray(raw.classes) ? raw.classes : [],
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

// ============================================
// 환불 승인제 (Phase 1) — RefundRequest
// ============================================
// 학부모 요청(pending) → 소속 감독(팀=DIRECTOR / 오픈클래스=ACADEMY_DIRECTOR)·ADMIN
// 승인=실행(단일 액션) 전건 승인제. 백엔드 계약(SPEC ③)을 미러링한다.
// 상태 전이: pending → rejected|canceled|executing → executed|execution_failed.

/** 환불 요청 상태(도메인 6종). approved 없음 — 승인=실행. */
export type RefundRequestStatus =
  | 'pending'
  | 'executing'
  | 'executed'
  | 'execution_failed'
  | 'rejected'
  | 'canceled';

/**
 * 결제 출처 — 요청 생성 시 fail-closed 판별.
 * DIRECT = 관리자 직접 환불(원장). scope.teamId/academyId 가 모두 null 일 수 있고
 * 승인/거절 없이 admin 만 재처리 가능(팀/아카데미 감독 읽기 전용).
 */
export type RefundSourceType =
  | 'CLASS_PREPAID'
  | 'CLASS_POSTPAID'
  | 'TOURNAMENT'
  | 'DIRECT';

/**
 * 표시용 상태/출처 — 미지 값은 'unknown'으로 유지(fail-closed).
 * pending/CLASS_PREPAID 로의 임의 승격을 금지해, 잘못된 서버값이 조작 가능한 상태로
 * 렌더되지 않도록 한다. 'unknown'은 뷰에서 중립 표기 + mutate CTA 미노출로 처리한다.
 */
export type RefundDisplayStatus = RefundRequestStatus | 'unknown';
export type RefundDisplaySource = RefundSourceType | 'unknown';

/** 실패 단계 — PG(무이체, 전체 재실행 안전) / DB_AFTER_PG(PG 성공, 재처리 시 PG 재호출 금지). */
export type RefundFailureStage = 'PG' | 'DB_AFTER_PG';

/** 관리 목록 스코프 — 팀(director-payments) / 오픈클래스(academy). */
export type RefundScope = 'team' | 'academy';

/** 위험 표식 — 승인 판단 보조(이용 내역/후불/대회). */
export interface RefundRiskFlags {
  used: boolean;
  postpaid: boolean;
  tournament: boolean;
}

/** 승인/거절/재처리/생성 공통 응답(백엔드 RefundRequestResponseDto 미러). */
export interface RefundRequestResponse {
  id: string;
  paymentId: string;
  status: RefundRequestStatus;
  sourceType: RefundSourceType;
  requestedAmount: number;
  approvedAmount?: number | null;
  decidedAt?: string | null;
  executedAt?: string | null;
  failureStage?: RefundFailureStage | null;
  version: number;
}

/** 관리 목록 1행(백엔드 RefundRequestListItemDto 미러). */
export interface RefundRequestListItem {
  id: string;
  status: RefundDisplayStatus;
  sourceType: RefundDisplaySource;
  subjectLabel: string;
  requesterName: string;
  childName?: string | null;
  amount: number;
  createdAt: string;
  waitingMinutes: number;
  riskFlags: RefundRiskFlags;
}

/** 목록 페이지네이션(이력 기준). */
export interface RefundListPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * 목록 응답(백엔드 계약 — 서버가 활성/이력을 분리 반환).
 * activeItems = 승인 대기(전량, 페이지네이션 없음). historyItems = 처리 이력(pagination 기준 더 보기).
 */
export interface RefundRequestListResponse {
  activeItems: RefundRequestListItem[];
  historyItems: RefundRequestListItem[];
  pendingCount: number;
  pagination: RefundListPagination;
}

/** 상세 사용 현황(판단 자료) — 백엔드 태그드 유니언(kind별). null=판별 불가/미해당. */
export interface RefundUsagePrepaid {
  kind: 'CLASS_PREPAID';
  /** 결제일 이후 사용(출석) 횟수. */
  usedCount: number;
  /** 수업별 사용 횟수. */
  perClass: { classId: string; count: number }[];
}
export interface RefundUsagePostpaid {
  kind: 'CLASS_POSTPAID';
  /** 산정 근거 출석 횟수. */
  attendanceCount: number;
  /** 청구액(출석수×단가). 회당 단가는 amount/attendanceCount 로 파생. */
  amount: number;
}
export interface RefundUsageTournament {
  kind: 'TOURNAMENT';
  gamesCount: number;
  calculatedFee: number;
}
export type RefundUsage =
  | RefundUsagePrepaid
  | RefundUsagePostpaid
  | RefundUsageTournament
  | null;

/** 상세 이력 1건(RefundLog join). */
export interface RefundHistoryItem {
  id: string;
  refundAmount: number;
  refundReason: string | null;
  processedAt: string | null;
  actorId: string | null;
}

/** 상세 응답(백엔드 RefundRequestDetailDto 미러 — 중첩 구조 SoT). */
export interface RefundRequestDetail {
  id: string;
  status: RefundDisplayStatus;
  sourceType: RefundDisplaySource;
  subjectLabel: string;
  version: number;
  /**
   * 소속 컨텍스트 스냅샷(백엔드 추가 중) — URL 컨텍스트 대조용.
   * 부재(undefined) 시 대조 스킵(백엔드 배포 전 호환).
   */
  scope?: {
    sourceType?: string | null;
    teamId?: string | null;
    academyId?: string | null;
  } | null;
  payment: {
    orderNumber: string | null;
    amount: number;
    paymentMethod: string | null;
    /** 마스킹된 PG 승인번호. */
    tid: string | null;
    /** 현재 결제 상태(원본). */
    currentStatus: string;
    completedAt: string | null;
    /** 상품/대상명. */
    product: string | null;
  };
  request: {
    requesterName: string;
    requesterPhone: string | null;
    childName: string | null;
    requestReason: string;
    requestedAmount: number;
    createdAt: string;
  };
  usage: RefundUsage;
  /** fail-closed — 사용현황 조회 일부 실패 시 false(승인 CTA 비활성). */
  judgmentDataOk: boolean;
  /**
   * 산정 내역(표시 자료) — pending 한정, 조회 실패·구버전 백엔드면 null(섹션 숨김).
   * 승인 실행 금액의 SoT 는 request.requestedAmount.
   */
  quote: {
    paidAmount: number;
    attendedCount: number;
    unitFee: number;
    deductedAmount: number;
    alreadyRefunded: number;
    refundableAmount: number;
  } | null;
  snapshotVsCurrent: {
    /** 요청 생성 시점 결제 상태(예: 'completed'). RefundRequestStatus 아님. */
    requestedStatusAtCreate: string;
    requestedAmount: number;
    /** 현재 결제 상태(예: 'completed' | 'refunded'). */
    currentPaymentStatus: string;
  };
  decision: {
    decidedBy: string | null;
    decidedByName: string | null;
    decidedAt: string | null;
    decisionReason: string | null;
    failureStage: RefundFailureStage | null;
    failureCode: string | null;
    failureReason: string | null;
  };
  history: RefundHistoryItem[];
}

/** 학부모 내 요청 1건 — /payment/history 배지용. */
export interface RefundMyRequestItem {
  id: string;
  paymentId: string;
  status: RefundDisplayStatus;
}

/** 목록/카운트 스코프 쿼리 — team(감독 소속 자동 해석) / academy(scopeId 필요). */
function buildScopeParams(
  scope: RefundScope,
  scopeId?: string,
): Record<string, string> {
  if (scope === 'academy') {
    return scopeId ? { scope: 'academy', academyId: scopeId } : { scope: 'academy' };
  }
  return { scope: 'team' };
}

/** 상태 정규화 — 미지 값은 'unknown'(fail-closed). pending 승격 금지. */
function normalizeRefundStatus(value: unknown): RefundDisplayStatus {
  return value === 'pending' ||
    value === 'executing' ||
    value === 'executed' ||
    value === 'execution_failed' ||
    value === 'rejected' ||
    value === 'canceled'
    ? value
    : 'unknown';
}

/** 출처 정규화 — 미지 값은 'unknown'(fail-closed). CLASS_PREPAID 승격 금지. */
function normalizeRefundSource(value: unknown): RefundDisplaySource {
  return value === 'CLASS_PREPAID' ||
    value === 'CLASS_POSTPAID' ||
    value === 'TOURNAMENT' ||
    value === 'DIRECT'
    ? value
    : 'unknown';
}

function normalizeRiskFlags(value: unknown): RefundRiskFlags {
  const v = (value ?? {}) as Partial<RefundRiskFlags>;
  return {
    used: Boolean(v.used),
    postpaid: Boolean(v.postpaid),
    tournament: Boolean(v.tournament),
  };
}

function normalizeFailureStage(value: unknown): RefundFailureStage | null {
  return value === 'PG' || value === 'DB_AFTER_PG' ? value : null;
}

/** 상세 사용현황(판단 자료) 태그드 유니언 정규화. kind 미해당/null → null. */
function normalizeUsage(value: unknown): RefundUsage {
  if (!value || typeof value !== 'object') return null;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'CLASS_PREPAID') {
    const v = value as Partial<RefundUsagePrepaid>;
    return {
      kind: 'CLASS_PREPAID',
      usedCount: toNumber(v.usedCount),
      perClass: Array.isArray(v.perClass)
        ? v.perClass.map((pc) => ({
            classId: String(pc?.classId ?? ''),
            count: toNumber(pc?.count),
          }))
        : [],
    };
  }
  if (kind === 'CLASS_POSTPAID') {
    const v = value as Partial<RefundUsagePostpaid>;
    return {
      kind: 'CLASS_POSTPAID',
      attendanceCount: toNumber(v.attendanceCount),
      amount: toNumber(v.amount),
    };
  }
  if (kind === 'TOURNAMENT') {
    const v = value as Partial<RefundUsageTournament>;
    return {
      kind: 'TOURNAMENT',
      gamesCount: toNumber(v.gamesCount),
      calculatedFee: toNumber(v.calculatedFee),
    };
  }
  return null;
}

/** 환불 예정액 산정 내역 — 요청 시트·상세 공용 형태. */
export type RefundPreviewQuote = NonNullable<RefundRequestDetail['quote']>;

/**
 * 환불 예정액 미리보기 (`GET /payments/:paymentId/refund-preview`) — 학부모 요청 전 표시.
 * 실패·스키마 오염 시 null — 예상액 없이도 요청 흐름은 유지한다(섹션만 숨김).
 * 서버가 요청 접수 시 같은 산식으로 재산정하므로 이 값은 표시 전용이다.
 */
export async function getRefundPreview(
  paymentId: string,
): Promise<RefundPreviewQuote | null> {
  const res = await api.get<Record<string, unknown>>(
    `/payments/${paymentId}/refund-preview`,
  );
  if (!res.success || !res.data) return null;
  return normalizeQuote(res.data);
}

/**
 * 환불 요청 생성 (`POST /refund-requests`) — 학부모.
 * 성공 시 pending 요청 생성(PG 미호출). 실패 시 error.statusCode 로 분기:
 * 403(소유권) · 400(미완료) · 422(미지원 결제) · 409(활성 중복).
 */
export async function createRefundRequest(params: {
  paymentId: string;
  reason: string;
}): Promise<ApiResponse<RefundRequestResponse>> {
  return api.post<RefundRequestResponse>('/refund-requests', {
    paymentId: params.paymentId,
    reason: params.reason,
  });
}

/**
 * 내 환불 요청 조회 (`GET /refund-requests/my`) — 학부모.
 * 활성/거절 요청이 있는 결제의 버튼을 배지로 대체하기 위한 최소 목록.
 */
export async function getMyRefundRequests(): Promise<
  ApiResponse<RefundMyRequestItem[]>
> {
  const res = await api.get<RefundMyRequestItem[] | { items: RefundMyRequestItem[] }>(
    '/refund-requests/my',
  );
  if (!res.success || !res.data) return res as ApiResponse<RefundMyRequestItem[]>;
  const raw = Array.isArray(res.data) ? res.data : (res.data.items ?? []);
  const items: RefundMyRequestItem[] = raw.map((r) => ({
    id: String(r?.id ?? ''),
    paymentId: String(r?.paymentId ?? ''),
    status: normalizeRefundStatus(r?.status),
  }));
  return { success: true, data: items };
}

// ── 런타임 스키마 검증(수동 — 프로젝트에 zod 미도입) ─────────────
const REFUND_STATUS_SET = new Set([
  'pending',
  'executing',
  'executed',
  'execution_failed',
  'rejected',
  'canceled',
]);
// 목록 배열별 허용 상태 — activeItems=처리 필요, historyItems=종결. 교차 혼입은 오염(전체 실패).
const REFUND_ACTIVE_STATUS_SET = new Set(['pending', 'executing', 'execution_failed']);
const REFUND_HISTORY_STATUS_SET = new Set(['executed', 'rejected', 'canceled']);
// sourceType 허용값(DIRECT 포함). usage.kind 는 DIRECT 없음(별도 Set).
const REFUND_SOURCE_SET = new Set(['CLASS_PREPAID', 'CLASS_POSTPAID', 'TOURNAMENT', 'DIRECT']);
const REFUND_USAGE_KIND_SET = new Set(['CLASS_PREPAID', 'CLASS_POSTPAID', 'TOURNAMENT']);
const REFUND_FAILURE_STAGE_SET = new Set(['PG', 'DB_AFTER_PG']);

function isNonEmptyStr(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}
/** nullable 문자열 필드 — string | null | undefined 만 허용(그 외 타입 오염 거부). */
function isStrOrNull(v: unknown): boolean {
  return v === null || v === undefined || typeof v === 'string';
}
/** failureStage — 'PG'|'DB_AFTER_PG'|null|undefined 만 허용(그 외 값 오염 거부). */
function isFailureStageOrNull(v: unknown): boolean {
  return v === null || v === undefined || REFUND_FAILURE_STAGE_SET.has(v as string);
}
/** 비음수 정수 필드(금액·카운트). */
function isNonNegInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}
/** 양의 정수 필드(page·limit). */
function isPosInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/**
 * pagination 검증(numeric 불변조건) — page/limit/totalPages 양의 정수(>=1) · total 0 이상 정수 ·
 * totalPages === max(1, ceil(total/limit)) · 1 <= page <= totalPages. (백엔드 계약상 totalPages>=1.)
 */
function isValidPagination(p: unknown): boolean {
  if (!p || typeof p !== 'object') return false;
  const q = p as Record<string, unknown>;
  if (!isPosInt(q.page) || !isPosInt(q.limit) || !isPosInt(q.totalPages)) return false;
  if (!isNonNegInt(q.total)) return false;
  const page = q.page as number;
  const limit = q.limit as number;
  const total = q.total as number;
  const totalPages = q.totalPages as number;
  if (totalPages !== Math.max(1, Math.ceil(total / limit))) return false;
  if (page > totalPages) return false; // page>=1 은 isPosInt 로 보장
  return true;
}

/**
 * scope 객체 검증 — sourceType(허용값) 필수 + 소속키 규칙.
 * 수업/대회: teamId·academyId 중 **정확히 하나만**(둘 다 없음/혼합 거부). DIRECT: 둘 다 null 허용.
 */
function isValidRefundScope(scope: unknown): boolean {
  if (!scope || typeof scope !== 'object') return false;
  const s = scope as Record<string, unknown>;
  if (!REFUND_SOURCE_SET.has(s.sourceType as string)) return false;
  if (!isStrOrNull(s.teamId) || !isStrOrNull(s.academyId)) return false;
  if (s.sourceType !== 'DIRECT') {
    const hasTeam = isNonEmptyStr(s.teamId);
    const hasAcademy = isNonEmptyStr(s.academyId);
    // 정확히 하나 — 둘 다 없거나(빈 객체) 둘 다 있으면(혼합) 무효.
    if (hasTeam === hasAcademy) return false;
  }
  // DIRECT: teamId/academyId 둘 다 null 허용.
  return true;
}

/**
 * history 각 item 구조 검증 — {id, refundAmount number, processedAt, refundReason, actorId}.
 * 무효 item 하나라도 있으면 false.
 */
function isValidRefundHistory(history: unknown[]): boolean {
  for (const h of history) {
    if (!h || typeof h !== 'object') return false;
    const hi = h as Record<string, unknown>;
    if (!isNonEmptyStr(hi.id)) return false;
    if (!isNonNegInt(hi.refundAmount)) return false;
    if (!isStrOrNull(hi.processedAt)) return false;
    if (!isStrOrNull(hi.refundReason)) return false;
    if (!isStrOrNull(hi.actorId)) return false;
  }
  return true;
}

/**
 * 상세 응답 런타임 검증(fail-open 제거) — 중첩 계약 전수화.
 * 금전 판단 필드/중첩 구조 하나라도 누락/타입 오염 시 false. 기본값 폴백 변환 금지 →
 * 호출부가 success:false 로 상세 전체를 fail-closed 처리한다.
 */
function isValidRefundDetailPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  if (!isNonEmptyStr(r.id)) return false;
  if (!isNonNegInt(r.version)) return false;
  if (!REFUND_STATUS_SET.has(r.status as string)) return false;
  if (!REFUND_SOURCE_SET.has(r.sourceType as string)) return false;
  // payment — 금전 판단 필수(amount 비음수 정수).
  const p = r.payment as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== 'object' || !isNonNegInt(p.amount)) return false;
  // request — 사유·요청액(비음수 정수)·시각 필수.
  const rq = r.request as Record<string, unknown> | null | undefined;
  if (!rq || typeof rq !== 'object') return false;
  if (typeof rq.requestReason !== 'string') return false;
  if (!isNonNegInt(rq.requestedAmount)) return false;
  if (!isNonEmptyStr(rq.createdAt)) return false;
  // usage — kind(DIRECT 제외) 유효 객체 + kind별 금전/카운트(비음수 정수), 또는 null/미제공(→ judgmentDataOk 강제 false).
  const u = r.usage as Record<string, unknown> | null | undefined;
  if (u !== null && u !== undefined) {
    if (typeof u !== 'object' || !REFUND_USAGE_KIND_SET.has(u.kind as string)) return false;
    if (u.kind === 'CLASS_PREPAID') {
      if (!isNonNegInt(u.usedCount)) return false;
      // perClass — 배열 + 각 item {classId string, count 비음수 정수}.
      if (!Array.isArray(u.perClass)) return false;
      for (const pc of u.perClass) {
        if (!pc || typeof pc !== 'object') return false;
        const p2 = pc as Record<string, unknown>;
        if (typeof p2.classId !== 'string' || !isNonNegInt(p2.count)) return false;
      }
    }
    if (
      u.kind === 'CLASS_POSTPAID' &&
      (!isNonNegInt(u.attendanceCount) || !isNonNegInt(u.amount))
    )
      return false;
    if (
      u.kind === 'TOURNAMENT' &&
      (!isNonNegInt(u.gamesCount) || !isNonNegInt(u.calculatedFee))
    )
      return false;
  }
  // snapshotVsCurrent — 요청액 비음수 정수 + 생성시점/현재 상태 문자열 필수.
  const sc = r.snapshotVsCurrent as Record<string, unknown> | null | undefined;
  if (!sc || typeof sc !== 'object') return false;
  if (!isNonNegInt(sc.requestedAmount)) return false;
  if (typeof sc.requestedStatusAtCreate !== 'string') return false;
  if (typeof sc.currentPaymentStatus !== 'string') return false;
  // decision — 객체 + nullable 문자열 필드 + failureStage enum 검증.
  const dc = r.decision as Record<string, unknown> | null | undefined;
  if (!dc || typeof dc !== 'object') return false;
  if (
    !isStrOrNull(dc.decidedBy) ||
    !isStrOrNull(dc.decidedByName) ||
    !isStrOrNull(dc.decidedAt) ||
    !isStrOrNull(dc.decisionReason) ||
    !isFailureStageOrNull(dc.failureStage) ||
    !isStrOrNull(dc.failureCode) ||
    !isStrOrNull(dc.failureReason)
  )
    return false;
  // history — 배열 + 각 item 구조.
  if (!Array.isArray(r.history) || !isValidRefundHistory(r.history)) return false;
  // scope — 백엔드 상시 emit(DIRECT 원장 포함). sourceType 필수 + 소속키 규칙.
  if (!isValidRefundScope(r.scope)) return false;
  // sourceType 일치 강제 — top-level 과 scope.sourceType 불일치 = 오염.
  if (r.sourceType !== (r.scope as Record<string, unknown>).sourceType) return false;
  return true;
}

/**
 * 목록 행 전수 계약 검증(fail-closed) — 하나라도 무효면 호출부가 전체 응답 실패 처리.
 * id·status(배열별 허용집합)·sourceType(허용값)·subjectLabel·requesterName·createdAt(string)·
 * childName(undefined|null|string)·amount·waitingMinutes(비음수 정수)·riskFlags(3 boolean).
 * @param allowedStatuses activeItems=REFUND_ACTIVE_STATUS_SET · historyItems=REFUND_HISTORY_STATUS_SET.
 */
function isValidRefundListItem(it: unknown, allowedStatuses: Set<string>): boolean {
  if (!it || typeof it !== 'object') return false;
  const r = it as Record<string, unknown>;
  if (!isNonEmptyStr(r.id)) return false;
  if (!allowedStatuses.has(r.status as string)) return false; // 배열 교차 혼입 거부
  if (!REFUND_SOURCE_SET.has(r.sourceType as string)) return false;
  if (typeof r.subjectLabel !== 'string') return false;
  if (typeof r.requesterName !== 'string') return false;
  if (typeof r.createdAt !== 'string') return false;
  if (!isStrOrNull(r.childName)) return false; // undefined|null|string 만(숫자 등 거부)
  if (!isNonNegInt(r.amount)) return false; // 음수/소수/numeric string 거부
  if (!isNonNegInt(r.waitingMinutes)) return false;
  const rf = r.riskFlags as Record<string, unknown> | null | undefined;
  if (!rf || typeof rf !== 'object') return false;
  if (
    typeof rf.used !== 'boolean' ||
    typeof rf.postpaid !== 'boolean' ||
    typeof rf.tournament !== 'boolean'
  )
    return false;
  return true;
}

/**
 * 역할 기반 환불 승인 권한(페이지에서 layout-provided user + 상세 sourceType 으로 판정).
 * - 수업/대회: team=director/admin·academy=academy_director/admin(+system/oper).
 * - DIRECT(관리자 직접 환불): admin/system/oper 만 true — 팀/아카데미 감독은 읽기 전용.
 */
export function canManageRefund(
  scope: RefundScope,
  userType: string | undefined | null,
  sourceType?: RefundDisplaySource,
): boolean {
  const t = (userType ?? '').toLowerCase();
  const isAdminTier = t === 'admin' || t === 'system' || t === 'oper';
  if (sourceType === 'DIRECT') return isAdminTier;
  return scope === 'academy'
    ? t === 'academy_director' || isAdminTier
    : t === 'director' || isAdminTier;
}

/**
 * 관리자 환불 요청 목록 (`GET /refund-requests`).
 * 소속 범위는 백엔드가 저장된 team_id/academy_id 스냅샷으로 필터한다.
 */
export async function listRefundRequests(params: {
  scope: RefundScope;
  scopeId?: string;
  status?: RefundRequestStatus | 'all';
  page?: number;
  limit?: number;
}): Promise<ApiResponse<RefundRequestListResponse>> {
  const query: Record<string, string | number> = {
    ...buildScopeParams(params.scope, params.scopeId),
  };
  if (params.status) query.status = params.status;
  if (params.page) query.page = params.page;
  if (params.limit) query.limit = params.limit;

  const res = await api.get<RefundRequestListResponse>('/refund-requests', {
    params: query,
  });
  if (!res.success || !res.data) {
    return res as ApiResponse<RefundRequestListResponse>;
  }
  const raw = res.data as unknown as Record<string, unknown>;
  // fail-closed 목록 계약 검증 — 하나라도 오염되면 상태 반영 없이 전체 실패(silent drop 금지).
  const invalid = (message: string): ApiResponse<RefundRequestListResponse> => ({
    success: false,
    error: { code: 'INVALID_REFUND_LIST', statusCode: 500, message },
  });
  // ① 두 배열 존재 필수 · ② pendingCount 비음수 정수 · ③ pagination 산식 · ④ 행 전수 계약.
  if (!Array.isArray(raw.activeItems) || !Array.isArray(raw.historyItems)) {
    return invalid('invalid refund list arrays');
  }
  if (!isNonNegInt(raw.pendingCount)) {
    return invalid('invalid refund list pendingCount');
  }
  if (!isValidPagination(raw.pagination)) {
    return invalid('invalid refund list pagination');
  }
  if (
    !raw.activeItems.every((it) => isValidRefundListItem(it, REFUND_ACTIVE_STATUS_SET)) ||
    !raw.historyItems.every((it) => isValidRefundListItem(it, REFUND_HISTORY_STATUS_SET))
  ) {
    return invalid('invalid refund list item');
  }
  // 검증 통과 후 정규화(폴백 변환 없이 검증된 값 매핑). childName 은 string|null|undefined 만 통과됨.
  const mapItem = (it: Record<string, unknown>): RefundRequestListItem => ({
    id: String(it.id),
    status: normalizeRefundStatus(it.status),
    sourceType: normalizeRefundSource(it.sourceType),
    subjectLabel: it.subjectLabel as string,
    requesterName: it.requesterName as string,
    childName: typeof it.childName === 'string' ? it.childName : null,
    amount: it.amount as number,
    createdAt: it.createdAt as string,
    waitingMinutes: it.waitingMinutes as number,
    riskFlags: normalizeRiskFlags(it.riskFlags),
  });
  return {
    success: true,
    data: {
      activeItems: raw.activeItems.map(mapItem),
      historyItems: raw.historyItems.map(mapItem),
      pendingCount: raw.pendingCount as number,
      pagination: raw.pagination as RefundListPagination,
    },
  };
}

/**
 * 환불 요청 상세 (`GET /refund-requests/:requestId`).
 * 범위 밖 접근은 백엔드 403 → error.statusCode 로 "권한 없음" 분기.
 */
/** 산정 내역 — 전 필드 비음수 정수일 때만 통과. 표시 자료라 오염 시 null(섹션 숨김). */
function normalizeQuote(raw: unknown): RefundRequestDetail['quote'] {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const fields = [
    'paidAmount',
    'attendedCount',
    'unitFee',
    'deductedAmount',
    'alreadyRefunded',
    'refundableAmount',
  ] as const;
  if (!fields.every((f) => isNonNegInt(q[f]))) return null;
  return {
    paidAmount: q.paidAmount as number,
    attendedCount: q.attendedCount as number,
    unitFee: q.unitFee as number,
    deductedAmount: q.deductedAmount as number,
    alreadyRefunded: q.alreadyRefunded as number,
    refundableAmount: q.refundableAmount as number,
  };
}

export async function getRefundRequestDetail(
  requestId: string,
): Promise<ApiResponse<RefundRequestDetail>> {
  const res = await api.get<RefundRequestDetail>(`/refund-requests/${requestId}`);
  if (!res.success || !res.data) {
    return res as ApiResponse<RefundRequestDetail>;
  }
  const raw = res.data;
  // 런타임 스키마 검증(fail-open 제거) — 금전 판단 필드 오염 시 부분 렌더 금지, 오류 화면 유도.
  if (!isValidRefundDetailPayload(raw)) {
    return {
      success: false,
      error: { statusCode: 500, message: 'invalid refund detail schema' },
    } as ApiResponse<RefundRequestDetail>;
  }
  const normalizedUsage = normalizeUsage(raw.usage);
  const p = (raw.payment ?? {}) as Partial<RefundRequestDetail['payment']>;
  const rq = (raw.request ?? {}) as Partial<RefundRequestDetail['request']>;
  const sc = (raw.snapshotVsCurrent ?? {}) as Partial<RefundRequestDetail['snapshotVsCurrent']>;
  const dc = (raw.decision ?? {}) as Partial<RefundRequestDetail['decision']>;
  const rawScope = raw.scope as RefundRequestDetail['scope'] | undefined;
  return {
    success: true,
    data: {
      id: String(raw.id ?? ''),
      status: normalizeRefundStatus(raw.status),
      sourceType: normalizeRefundSource(raw.sourceType),
      subjectLabel: raw.subjectLabel ?? '',
      version: toNumber(raw.version),
      // scope 는 백엔드 배포 전 부재 가능 — 존재 시에만 전달(부재=대조 스킵).
      ...(rawScope && typeof rawScope === 'object'
        ? {
            scope: {
              sourceType: rawScope.sourceType ?? null,
              teamId: rawScope.teamId ?? null,
              academyId: rawScope.academyId ?? null,
            },
          }
        : {}),
      payment: {
        orderNumber: p.orderNumber ?? null,
        amount: toNumber(p.amount),
        paymentMethod: p.paymentMethod ?? null,
        tid: p.tid ?? null,
        currentStatus: p.currentStatus ?? '',
        completedAt: p.completedAt ?? null,
        product: p.product ?? null,
      },
      request: {
        requesterName: rq.requesterName ?? '',
        requesterPhone: rq.requesterPhone ?? null,
        childName: rq.childName ?? null,
        requestReason: rq.requestReason ?? '',
        requestedAmount: toNumber(rq.requestedAmount),
        createdAt: rq.createdAt ?? '',
      },
      usage: normalizedUsage,
      // 엄격 fail-closed — raw 값이 true 이면서 usage(판단 자료)가 존재할 때만 승인 허용.
      //   usage=null(판별 불가) 이면 강제 false(승인 CTA 비활성).
      judgmentDataOk: raw.judgmentDataOk === true && normalizedUsage !== null,
      quote: normalizeQuote(raw.quote),
      snapshotVsCurrent: {
        requestedStatusAtCreate: sc.requestedStatusAtCreate ?? '',
        requestedAmount: toNumber(sc.requestedAmount),
        currentPaymentStatus: sc.currentPaymentStatus ?? p.currentStatus ?? '',
      },
      decision: {
        decidedBy: dc.decidedBy ?? null,
        decidedByName: dc.decidedByName ?? null,
        decidedAt: dc.decidedAt ?? null,
        decisionReason: dc.decisionReason ?? null,
        failureStage: normalizeFailureStage(dc.failureStage),
        failureCode: dc.failureCode ?? null,
        failureReason: dc.failureReason ?? null,
      },
      history: Array.isArray(raw.history)
        ? raw.history.map((h) => ({
            id: String(h?.id ?? ''),
            refundAmount: toNumber(h?.refundAmount),
            refundReason: h?.refundReason ?? null,
            processedAt: h?.processedAt ?? null,
            actorId: h?.actorId ?? null,
          }))
        : [],
    },
  };
}

/**
 * 승인=실행 (`POST /refund-requests/:requestId/approve`).
 * version 으로 더블탭·stale 방지. count 0(CAS 실패) → 409.
 */
export async function approveRefundRequest(
  requestId: string,
  params: { version: number; memo?: string },
): Promise<ApiResponse<RefundRequestResponse>> {
  return api.post<RefundRequestResponse>(
    `/refund-requests/${requestId}/approve`,
    { version: params.version, ...(params.memo ? { memo: params.memo } : {}) },
  );
}

/**
 * 거절 (`POST /refund-requests/:requestId/reject`). 재정 변화 없음. decisionReason 필수.
 */
export async function rejectRefundRequest(
  requestId: string,
  params: { version: number; decisionReason: string },
): Promise<ApiResponse<RefundRequestResponse>> {
  return api.post<RefundRequestResponse>(
    `/refund-requests/${requestId}/reject`,
    { version: params.version, decisionReason: params.decisionReason },
  );
}

/**
 * 재처리 (`POST /refund-requests/:requestId/reprocess`). execution_failed 전용.
 * DB_AFTER_PG 는 PG 재호출 없이 DB 보상만 재적용(백엔드 처리).
 */
export async function reprocessRefundRequest(
  requestId: string,
  params: { version: number },
): Promise<ApiResponse<RefundRequestResponse>> {
  return api.post<RefundRequestResponse>(
    `/refund-requests/${requestId}/reprocess`,
    { version: params.version },
  );
}

/** KG 미확정 정산 결과 — PG 취소 확인됨 / PG 미취소 확인됨. */
export type RefundReconcileOutcome = 'CONFIRMED_CANCELLED' | 'CONFIRMED_NOT_CANCELLED';

/**
 * KG 미확정 정산 (`POST /refund-requests/:requestId/reconcile`) — ADMIN(system/oper 포함) 전용.
 * KG_UNCONFIRMED(PG 결과 미확정) 건을 관리자가 PG 결과 확인 후 해소한다.
 * body: { version(CAS), outcome(2종), memo(1~500 필수) }.
 */
export async function reconcileRefundRequest(
  requestId: string,
  params: { version: number; outcome: RefundReconcileOutcome; memo: string },
): Promise<ApiResponse<RefundRequestResponse>> {
  return api.post<RefundRequestResponse>(
    `/refund-requests/${requestId}/reconcile`,
    { version: params.version, outcome: params.outcome, memo: params.memo },
  );
}

/**
 * 대기 건수 (`GET /refund-requests/pending-count`) — 메뉴·배너·알림 공통 단일 집계.
 * 활성(pending) 건수만 반환. 실패/0건 구분 위해 ApiResponse 그대로 반환.
 */
export async function getRefundPendingCount(params: {
  scope: RefundScope;
  scopeId?: string;
}): Promise<ApiResponse<{ count: number }>> {
  const res = await api.get<{ count: number }>('/refund-requests/pending-count', {
    params: buildScopeParams(params.scope, params.scopeId),
  });
  if (!res.success || !res.data) {
    return res as ApiResponse<{ count: number }>;
  }
  return { success: true, data: { count: toNumber(res.data.count) } };
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
  getTeamUnpaidMembers,
  getTeamUnpaidMemberDetail,
  sendTeamUnpaidReminder,
  getTeamSettlementSummary,
  getAcademySettlementSummary,
  getReceipt,
  verifyPaymentCompletion,
  getReceiptDownloadUrl,
  requestPaymentCancel,
  createRefundRequest,
  getMyRefundRequests,
  listRefundRequests,
  getRefundRequestDetail,
  approveRefundRequest,
  rejectRefundRequest,
  reprocessRefundRequest,
  reconcileRefundRequest,
  getRefundPendingCount,
  groupPaymentsByMonth,
  groupUsagesByMonth,
};

export default paymentService;
