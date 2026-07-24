import { instantToKstDateOnly, kstTodayUtcMidnight } from "@/common/utils/kst-date.util";

/**
 * [정산 센터 Phase 2b] 월귀속·상태·순수납 순수 함수 모음.
 *
 * classes.service.getClassPayments(Phase 2a)의 5-state·terminal 우선·순수납 계약을
 * 목록 소계 레이어(팀/Academy 정산 요약)에서 재사용하기 위해 순수 함수로 추출한다.
 * DB 접근·부수효과 없음 — 배치 조회 결과를 인자로 받아 메모리 집계에 쓰인다.
 *
 * ── 미수금 집계 정책 (판정 SoT) ─────────────────────────────────────────
 * 미수금(BILLED 잔액) = **확정 청구 − 수납**. 확정 청구는 두 가지뿐이다:
 *   · 후불 수업: 감독 정산 확정 라인(MonthlyPostpaidBillingLine)
 *   · 후불 대회: 감독 일괄 청구된 등록(PENDING + Payment)
 * 선불의 pending(결제 진행 중/이탈)은 아무도 청구한 적 없는 미완 트랜잭션이므로
 * 채권(미수금)·매출 어디에도 집계하지 않는다(UNSETTLED). 완료(completed)만 수납이다.
 * 이 정책은 결제 관리(/director-payments)와 매출 리포트(/statistics)가 공유한다.
 */

/** Phase 2a와 동일한 5-state 정산 상태. */
export type SettlementBillingStatus =
  | "UNSETTLED"
  | "BILLED"
  | "PAID"
  | "CANCELLED"
  | "REFUNDED";

/** 선수별 유효 결제방식(클래스 모드 + 상품 결제시점에서 파생). */
export type RowBillingTiming = "PREPAID" | "POSTPAID" | "UNASSIGNED";

/** 월귀속 순수 함수 공통 반환 계약. */
export interface AttributionResult {
  /** 귀속 월("YYYY-MM"). 귀속 근거가 없으면 null(현재 월 임의 귀속 금지). */
  yearMonth: string | null;
  billingStatus: SettlementBillingStatus;
  /** 유효 청구액(취소·환불 제외). PAID/BILLED 만 값, 그 외 null. */
  billedAmount: number | null;
  /** 순수납액 = 청구 − 환불로그 합. */
  paidAmount: number;
  /** 환불 총액(환불로그 합). */
  refundedAmount: number;
  /** 미확정 월(후불) 예상액 = 출석수 × 단가. 확정·선불은 null. */
  estimatedAmount: number | null;
  /** 귀속 근거 없음 — 집계 제외 + 경고 대상. */
  attributionUnknown: boolean;
}

/** timestamptz instant → 그 순간의 KST 달력월("YYYY-MM"). */
export function instantToKstYearMonth(at: Date): string {
  const d = instantToKstDateOnly(at);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * `@db.Date`(UTC 자정 규약) → "YYYY-MM".
 *  billingMonth·endDate 등 날짜형은 이미 UTC 자정이라 +9h 보정 금지(이중 시프트).
 */
export function dbDateToKstYearMonth(at: Date): string {
  return at.toISOString().slice(0, 7);
}

/** "YYYY-MM" 유효(01-12)면 그대로, 아니면 현재 KST 월(Phase 2a resolveSettlementYearMonth와 동일 계약). */
export function resolveSettlementYearMonth(yearMonth?: string): string {
  if (yearMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) return yearMonth;
  const base = kstTodayUtcMidnight();
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 선수별 유효 결제방식 판정(Phase 2a resolveRowBillingTiming와 동일 계약).
 *  - PREPAID/POSTPAID 수업: 전원 해당 방식
 *  - BOTH 수업: 학생 enrollment 상품의 billingTiming(없으면 UNASSIGNED)
 */
export function resolveRowBillingTiming(
  classBillingMode: string | null | undefined,
  enrollmentProductBillingTiming?: string | null,
): RowBillingTiming {
  const mode = classBillingMode ?? "PREPAID";
  if (mode === "PREPAID") return "PREPAID";
  if (mode === "POSTPAID") return "POSTPAID";
  if (enrollmentProductBillingTiming === "POSTPAID") return "POSTPAID";
  if (enrollmentProductBillingTiming === "PREPAID") return "PREPAID";
  return "UNASSIGNED";
}

function sumRefund(
  refundLogs?: { refundAmount: number | null }[] | null,
): number {
  return (refundLogs ?? []).reduce((s, r) => s + (r.refundAmount ?? 0), 0);
}

export interface PrepaidAttributionInput {
  /** resolveRowBillingTiming 로 산출한 유효 결제방식. */
  billingTiming: RowBillingTiming;
  feeType?: string | null;
  /** MONTHLY_FIXED 전용 귀속월(@db.Date). 다른 유형은 무시. */
  billingMonth?: Date | null;
  enrollmentStatus?: string | null;
  enrollmentPaidAt?: Date | null;
  /** payment.amount 미존재 시 폴백(상품가). */
  productPrice?: number | null;
  payment?: {
    paymentStatus?: string | null;
    completedAt?: Date | null;
    createdAt?: Date | null;
    amount?: number | null;
    refundLogs?: { refundAmount: number | null }[] | null;
  } | null;
}

/**
 * [R1] 선불 월귀속·상태·순수납 — Phase 2a 선불(PREPAID)/미배정(UNASSIGNED) 로직과 동일 계약.
 *
 * 월귀속(순서대로): MONTHLY_FIXED+billingMonth → billingMonth 월 / 완료 선불 → completedAt 월 /
 *   pending 선불 → createdAt 월(UNSETTLED — 귀속만 유지, 집계 제외) / 레거시 paid(completedAt 없음) → paidAt 월 /
 *   환불·취소 → 위 규칙으로 산출한 원결제 월 유지(상태·환불액만 반영) / 근거 없음 → null + attributionUnknown.
 * 상태: terminal(Payment) 우선 — 환불→REFUNDED / 취소→CANCELLED / 완료→PAID / else UNSETTLED.
 *   선불 pending(결제 진행 중/이탈)은 확정 청구가 아니므로 BILLED 로 치지 않는다(파일 헤더 정책).
 */
export function resolvePrepaidAttribution(
  input: PrepaidAttributionInput,
): AttributionResult {
  const { billingTiming, feeType, billingMonth, enrollmentStatus, enrollmentPaidAt, productPrice, payment } = input;
  const payStatus = payment?.paymentStatus ?? null;
  const legacyAmount = payment?.amount ?? productPrice ?? null;
  const refundedAmount = sumRefund(payment?.refundLogs);

  // 5-state 판정 (terminal 우선). UNASSIGNED → 정산 제외.
  let billingStatus: SettlementBillingStatus;
  if (billingTiming === "UNASSIGNED") {
    billingStatus = "UNSETTLED";
  } else if (payStatus === "refunded" || payStatus === "partially_refunded") {
    billingStatus = "REFUNDED";
  } else if (
    payStatus === "cancelled" ||
    enrollmentStatus === "cancelled" ||
    enrollmentStatus === "rejected" ||
    enrollmentStatus === "expired"
  ) {
    billingStatus = "CANCELLED";
  } else if (
    payStatus === "completed" ||
    enrollmentStatus === "paid" ||
    enrollmentStatus === "completed"
  ) {
    billingStatus = "PAID";
  } else {
    // pending(결제 진행 중/이탈) 포함 — 확정 청구가 아니므로 집계 제외.
    billingStatus = "UNSETTLED";
  }

  // 원결제 귀속 월 산출 — 환불·취소도 이 규칙으로 산출한 월을 유지한다.
  let yearMonth: string | null = null;
  if (feeType === "MONTHLY_FIXED" && billingMonth != null) {
    yearMonth = dbDateToKstYearMonth(billingMonth);
  } else if (payment?.completedAt != null) {
    yearMonth = instantToKstYearMonth(payment.completedAt);
  } else if (payStatus === "pending" && payment?.createdAt != null) {
    yearMonth = instantToKstYearMonth(payment.createdAt);
  } else if (enrollmentPaidAt != null) {
    yearMonth = instantToKstYearMonth(enrollmentPaidAt);
  } else {
    yearMonth = null;
  }

  // 선불은 BILLED 를 산출하지 않으므로(정책 — pending 은 UNSETTLED) 청구액 = 완료 결제만.
  const billedAmount = billingStatus === "PAID" ? legacyAmount : null;
  const paidAmount =
    billingStatus === "PAID"
      ? legacyAmount ?? 0
      : billingStatus === "REFUNDED"
        ? Math.max(0, (legacyAmount ?? 0) - refundedAmount)
        : 0;

  return {
    yearMonth,
    billingStatus,
    billedAmount,
    paidAmount,
    refundedAmount,
    estimatedAmount: null,
    attributionUnknown: yearMonth === null,
  };
}

export interface PostpaidLineAttributionInput {
  /** 확정 정산 라인이 속한 월(billing.yearMonth). */
  yearMonth: string;
  /** 라인 청구액. */
  amount: number;
  /** 라인 자체 결제상태(pending|paid). */
  linePaymentStatus?: string | null;
  payment?: {
    paymentStatus?: string | null;
    refundLogs?: { refundAmount: number | null }[] | null;
  } | null;
}

/**
 * [R2] 후불 확정 라인 월귀속·상태·순수납 — Phase 2a 후불 로직과 동일 계약.
 *  귀속월 = billing.yearMonth. 연결 Payment terminal 상태 우선(라인 stale 방지).
 */
export function resolvePostpaidLineAttribution(
  input: PostpaidLineAttributionInput,
): AttributionResult {
  const { yearMonth, amount, linePaymentStatus, payment } = input;
  const payStatus = payment?.paymentStatus ?? null;
  const refundedAmount = sumRefund(payment?.refundLogs);
  const isRefunded =
    payStatus === "refunded" || payStatus === "partially_refunded";
  const billingStatus: SettlementBillingStatus = isRefunded
    ? "REFUNDED"
    : linePaymentStatus === "paid" || payStatus === "completed"
      ? "PAID"
      : "BILLED";

  const billedAmount = isRefunded ? null : amount;
  const paidAmount =
    billingStatus === "PAID"
      ? amount
      : isRefunded
        ? Math.max(0, amount - refundedAmount)
        : 0;

  return {
    yearMonth,
    billingStatus,
    billedAmount,
    paidAmount,
    refundedAmount,
    estimatedAmount: null,
    attributionUnknown: false,
  };
}

export interface TournamentAttributionInput {
  /** TournamentRegistration.paymentStatus (UNPAID|PENDING|PAID|CANCELLED|REFUNDED). */
  registrationPaymentStatus?: string | null;
  /** 확정 청구액(calculatedFee). */
  amount: number;
  /** 대회 종료월 폴백(@db.Date). */
  endDate?: Date | null;
  /**
   * Tournament.billingMode (PREPAID|POSTPAID). PENDING 은 두 의미가 겹친다 —
   *  후불=감독 확정 청구 후 미결제(진짜 미수, BILLED) / 선불=결제 진행 중·이탈(집계 제외).
   *  미전달 시 POSTPAID 로 간주해 확정 청구를 보존한다(선불 제외는 명시 전달 시에만).
   */
  tournamentBillingMode?: string | null;
  payment?: {
    paymentStatus?: string | null;
    completedAt?: Date | null;
    createdAt?: Date | null;
    refundLogs?: { refundAmount: number | null }[] | null;
  } | null;
}

/**
 * [R3] 대회 후불 월귀속·상태·순수납(팀 API 전용).
 *  귀속월 = 정산 확정 Payment 의 completedAt/createdAt KST월, 미확정(UNPAID·Payment 없음)은 대회 endDate 월.
 *  상태: registration paymentStatus 기준(연결 Payment 환불 terminal 우선).
 */
export function resolveTournamentAttribution(
  input: TournamentAttributionInput,
): AttributionResult {
  const { registrationPaymentStatus, amount, endDate, payment, tournamentBillingMode } = input;
  const regStatus = (registrationPaymentStatus ?? "UNPAID").toUpperCase();
  const payStatus = payment?.paymentStatus ?? null;
  const refundLogSum = sumRefund(payment?.refundLogs);
  const isPrepaid = (tournamentBillingMode ?? "").toUpperCase() === "PREPAID";

  let billingStatus: SettlementBillingStatus;
  if (
    regStatus === "REFUNDED" ||
    payStatus === "refunded" ||
    payStatus === "partially_refunded"
  ) {
    billingStatus = "REFUNDED";
  } else if (regStatus === "CANCELLED" || payStatus === "cancelled") {
    billingStatus = "CANCELLED";
  } else if (regStatus === "PAID" || payStatus === "completed") {
    billingStatus = "PAID";
  } else if (regStatus === "PENDING") {
    // 후불 PENDING = 확정 청구 미결제(BILLED) / 선불 PENDING = 결제 진행 중·이탈(집계 제외).
    billingStatus = isPrepaid ? "UNSETTLED" : "BILLED";
  } else {
    // UNPAID — 정산 전.
    billingStatus = "UNSETTLED";
  }

  // 환불액 — partially_refunded 는 실제 로그 합(부분 환불 정확). 그 외 전액 환불 terminal
  //  (REFUNDED)은 로그가 있으면 로그 합, 없으면 전액으로 해석한다.
  //  cancelRegistration(tournaments.service) 은 PAID 취소 시 Payment 만 refunded 로 바꾸고
  //  RefundLog 를 생성하지 않으므로(등록=CANCELLED·refundLogs=[]) 로그 부재 = 전액 환불이다.
  //  이 보정으로 실제 취소 흐름의 순수납(paidAmount)이 0 이 되어 매출에 잔존하지 않는다.
  const refundedAmount =
    billingStatus === "REFUNDED" && payStatus !== "partially_refunded"
      ? refundLogSum > 0
        ? refundLogSum
        : amount
      : refundLogSum;

  // 귀속월 — 확정 Payment 우선, 없으면 대회 종료월. 둘 다 없으면 근거 불명.
  let yearMonth: string | null;
  if (payment?.completedAt != null) {
    yearMonth = instantToKstYearMonth(payment.completedAt);
  } else if (payment?.createdAt != null) {
    yearMonth = instantToKstYearMonth(payment.createdAt);
  } else if (endDate != null) {
    yearMonth = dbDateToKstYearMonth(endDate);
  } else {
    yearMonth = null;
  }

  const billedAmount =
    billingStatus === "PAID" || billingStatus === "BILLED" ? amount : null;
  const paidAmount =
    billingStatus === "PAID"
      ? amount
      : billingStatus === "REFUNDED"
        ? Math.max(0, amount - refundedAmount)
        : 0;
  // UNSETTLED(정산 전 UNPAID) 는 예상액으로 표기(대회는 종료 후 단가 확정 전 0).
  //  선불 PENDING(결제 이탈)의 UNSETTLED 는 "곧 청구할 돈"이 아니므로 예상액에서도 제외.
  const estimatedAmount =
    billingStatus === "UNSETTLED" && regStatus !== "PENDING" ? amount : null;

  return {
    yearMonth,
    billingStatus,
    billedAmount,
    paidAmount,
    refundedAmount,
    estimatedAmount,
    attributionUnknown: yearMonth === null,
  };
}
