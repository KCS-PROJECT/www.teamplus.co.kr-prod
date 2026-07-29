/**
 * 가격 잠금 판정 유틸 — 단일 SoT.
 *
 * 정책 (claudedocs/class-price-lock-policy-design-2026-07-28.md v1.6.1):
 *   선불(MONTHLY_FIXED) = "판매 시작된 월분은 가격·권리조건 확정" —
 *   잠금 판정은 `billingMonth ≤ salesOpenMonth` 비교뿐이며 **결제 테이블을 읽지 않는다**
 *   (결제는 판매 시작 후에만 가능하므로 판매 시작 잠금이 결제 잠금을 함의).
 *
 * 호출 계약:
 *   - 아래 assert 류는 순수 판정만 한다. 호출부는 class sales lock
 *     (class-locks.util.acquireClassSalesLock)을 획득한 트랜잭션 안에서
 *     salesOpenMonth·상품을 재조회한 값으로 호출해야 한다 — 판매 시작과의 레이스 차단.
 */

import { BadRequestException } from "@nestjs/common";
import { MONTHLY_FIXED_FEE_TYPE } from "@/common/billing/fee-type.constants";

// ─────────────────────────────────────────────────────────────────────────
// 메시지 SoT
// ─────────────────────────────────────────────────────────────────────────

export const PRICE_LOCK_MESSAGES = {
  PREPAID_LOCKED:
    "이미 판매가 시작된 수강권은 가격을 변경할 수 없습니다. 다음 월분에서 새 가격을 적용해주세요.",
  MONTH_FROZEN:
    "판매가 시작된 월분에는 수강권을 추가할 수 없습니다. 다음 월분에서 등록해주세요.",
  LEGACY_REACTIVATION_BLOCKED:
    "월별 수강권 판매 중에는 이전 방식 수강권을 다시 판매할 수 없습니다.",
  BILLING_MONTH_REQUIRED:
    "월 정액 상품을 등록하려면 첫 일정을 먼저 등록해주세요.",
  BILLING_MONTH_INPUT_REQUIRED:
    "월 정액 수강권은 귀속 월을 지정해야 합니다.",
  SALES_MONTH_ROLLBACK:
    "이미 판매를 시작한 달보다 앞선 달로는 되돌릴 수 없습니다.",
} as const;

// ─────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────

/** Prisma Decimal 호환 최소 형태 (직접 의존 없이 비교만). */
export interface DecimalLike {
  toNumber(): number;
}

export type NumericLike = number | string | DecimalLike | null | undefined;

/** 잠금 판정 대상 상품의 최소 필드. */
export interface PriceLockProduct {
  feeType: string;
  billingMonth: Date | null;
}

/**
 * 유효금액·권리조건 필드 스냅샷 — diff 비교 입력.
 * after 는 부분(Partial) — undefined 필드는 "변경 요청 없음"으로 간주.
 */
export interface EntitlementSnapshot {
  price?: NumericLike;
  feeType?: string | null;
  feePerSession?: NumericLike;
  sessionsPerMonth?: number | null;
  sessionsPerWeek?: number | null;
  durationDays?: number | null;
}

export interface EntitlementDiff {
  /** 6개 잠금 필드 중 하나라도 실변경이면 true — 잠금 가드 발동 조건. */
  changed: boolean;
  /** 실결제 금액 축(price·feePerSession·sessionsPerWeek) 변경 — 가격 변경 알림 발송 조건. */
  effectiveAmountChanged: boolean;
  /** 실변경된 필드명 목록 (알림 문구·감사 로그용). */
  changedFields: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────────────────────────────

function toComparableNumber(v: NumericLike): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** 월 비교는 항상 UTC 월초로 정규화 — @db.Date UTC 자정 규약과 동일 축. */
function toUtcMonthStartMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

// ─────────────────────────────────────────────────────────────────────────
// 변경 감지 — isEntitlementOrAmountChange
// ─────────────────────────────────────────────────────────────────────────

/** 실결제 금액에 영향을 주는 필드 (breakdown: feePerSession × sessionsPerWeek 포함). */
const AMOUNT_FIELDS = ["price", "feePerSession", "sessionsPerWeek"] as const;
/** 금액 외 권리조건 필드. */
const ENTITLEMENT_ONLY_FIELDS = [
  "feeType",
  "sessionsPerMonth",
  "durationDays",
] as const;

/**
 * 수정 요청(after)이 기존 상품(before) 대비 유효금액·권리조건을 실변경하는지 판정.
 * 이름·설명·판매중지 같은 비금전 필드는 비교 대상이 아니므로 여기서 다루지 않는다.
 */
export function isEntitlementOrAmountChange(
  before: EntitlementSnapshot,
  after: EntitlementSnapshot,
): EntitlementDiff {
  const changedFields: string[] = [];
  let effectiveAmountChanged = false;

  for (const field of AMOUNT_FIELDS) {
    if (after[field] === undefined) continue;
    const prev = toComparableNumber(before[field]);
    const next = toComparableNumber(after[field]);
    if (prev !== next) {
      changedFields.push(field);
      effectiveAmountChanged = true;
    }
  }

  for (const field of ENTITLEMENT_ONLY_FIELDS) {
    if (after[field] === undefined) continue;
    if (field === "feeType") {
      const prev = before.feeType ?? null;
      const next = after.feeType ?? null;
      if (prev !== next) changedFields.push(field);
      continue;
    }
    const prev = toComparableNumber(before[field]);
    const next = toComparableNumber(after[field]);
    if (prev !== next) changedFields.push(field);
  }

  return {
    changed: changedFields.length > 0,
    effectiveAmountChanged,
    changedFields,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 선불 잠금 판정 — 판매 시작 앵커 (결제 테이블 미조회)
// ─────────────────────────────────────────────────────────────────────────

/**
 * 선불 월분 상품이 잠겼는지 판정.
 *   - MONTHLY_FIXED 외(참고용 1회 수업료 등)는 대상 아님 → false.
 *   - salesOpenMonth null(판매 이력 전무) → false.
 *   - billingMonth null(무월 legacy)은 판매 중일 가능성이 있으므로 fail-safe 잠금.
 *   - 그 외: 판매 시작된 적 있는 달(billingMonth ≤ salesOpenMonth)이면 잠금.
 *     (salesOpenMonth 는 비감소 — openSales 역행 거부가 이 비교의 전제)
 */
export function isPrepaidProductLocked(
  product: PriceLockProduct,
  salesOpenMonth: Date | null,
): boolean {
  if (product.feeType !== MONTHLY_FIXED_FEE_TYPE) return false;
  if (!salesOpenMonth) return false;
  if (!product.billingMonth) return true;
  return (
    toUtcMonthStartMs(product.billingMonth) <= toUtcMonthStartMs(salesOpenMonth)
  );
}

/** 잠긴 상품의 유효금액·권리조건 변경 요청을 거부. (diff 판정은 호출부에서 선행) */
export function assertPrepaidPriceMutable(
  product: PriceLockProduct,
  salesOpenMonth: Date | null,
): void {
  if (isPrepaidProductLocked(product, salesOpenMonth)) {
    throw new BadRequestException(PRICE_LOCK_MESSAGES.PREPAID_LOCKED);
  }
}

export interface PrepaidChangeInput {
  /** 저장된(변경 전) feeType. */
  storedFeeType: string;
  /** 변경 후 feeType — 요청에 없으면 undefined(변경 없음). */
  effectiveFeeType?: string | null;
  /** 저장된 billingMonth — 월 기준은 항상 저장값(월 귀속 불변). */
  billingMonth: Date | null;
}

/**
 * 상품 변경 요청의 선불 잠금 가드 — 저장된 feeType 과 변경 후(effective) feeType
 * **양쪽**을 판정한다. 한쪽만 보면 feeType 전환으로 잠금을 우회할 수 있다:
 *   - 저장값만 판정 → 판매 시작된 수업에서 PER_SESSION 행을 MONTHLY_FIXED 로 둔갑
 *     (무월 행이 월별 생성 흐름 밖에서 판매 가능한 월 정액이 됨)
 *   - 변경값만 판정 → 잠긴 MONTHLY_FIXED 를 PER_SESSION 으로 바꿔 잠금 이탈
 */
export function assertPrepaidChangeAllowed(
  input: PrepaidChangeInput,
  salesOpenMonth: Date | null,
): void {
  assertPrepaidPriceMutable(
    { feeType: input.storedFeeType, billingMonth: input.billingMonth },
    salesOpenMonth,
  );
  const effective = input.effectiveFeeType ?? input.storedFeeType;
  if (effective !== input.storedFeeType) {
    assertPrepaidPriceMutable(
      { feeType: effective, billingMonth: input.billingMonth },
      salesOpenMonth,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 월분 동결 — 판매 시작된 달의 신규 MONTHLY_FIXED 생성 차단
// ─────────────────────────────────────────────────────────────────────────

/**
 * 신규 MONTHLY_FIXED 생성 요청의 귀속 월이 이미 판매 시작된 달이면 거부.
 * (기존 상품 판매중지 후 고가 재등록 우회 차단 — 상품 존재 여부와 무관하게
 *  salesOpenMonth 비교만으로 판정하므로 hard delete 로도 우회 불가)
 */
export function assertMonthNotFrozen(
  billingMonth: Date,
  salesOpenMonth: Date | null,
): void {
  if (!salesOpenMonth) return;
  if (toUtcMonthStartMs(billingMonth) <= toUtcMonthStartMs(salesOpenMonth)) {
    throw new BadRequestException(PRICE_LOCK_MESSAGES.MONTH_FROZEN);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 무월 legacy 재활성화 차단
// ─────────────────────────────────────────────────────────────────────────

export interface LegacyReactivationInput {
  /** 수정 전 isActive. */
  wasActive: boolean;
  /** 수정 후 isActive (요청에 없으면 undefined → 변경 없음). */
  willBeActive: boolean | undefined;
  feeType: string;
  billingMonth: Date | null;
  /**
   * 현재 판매 월(salesOpenMonth)의 월분 상품 존재 여부 —
   * 호출부가 isActive 무관(판매중지분 포함)으로 조회해 전달한다.
   */
  hasCurrentMonthProduct: boolean;
}

/**
 * 무월 legacy MONTHLY_FIXED 의 재활성화(false→true)를 월별 판매 중에는 거부.
 * (openSales 가 자동 판매중지한 무월 상품이 되살아나면 월 필터를 우회해
 *  현재 월분과 이중 가격으로 병렬 노출되기 때문)
 * 판매 중지(true→false)와 월분 상품(billingMonth 有)은 대상 아님.
 */
export function assertLegacyNotReactivated(
  input: LegacyReactivationInput,
): void {
  if (input.willBeActive !== true || input.wasActive) return;
  if (input.feeType !== MONTHLY_FIXED_FEE_TYPE) return;
  if (input.billingMonth) return;
  if (input.hasCurrentMonthProduct) {
    throw new BadRequestException(
      PRICE_LOCK_MESSAGES.LEGACY_REACTIVATION_BLOCKED,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 삭제 모드 판정 — 삭제 4경로(개별 2 API·bulk·reconcile unmatched) 공통
// ─────────────────────────────────────────────────────────────────────────

export type ProductDeletionMode = "hard" | "soft";

/**
 * 판매 시작된 월분(무월 legacy 포함)은 결제·수강 이력 0건이어도 hard delete 금지 —
 * 판매 계약 이력으로 row 를 보존한다(soft = isActive=false).
 * hard 는 "미판매 미래 월분 + 이력 0건"만.
 */
export function resolveProductDeletionMode(
  product: PriceLockProduct,
  salesOpenMonth: Date | null,
  hasHistory: boolean,
): ProductDeletionMode {
  if (hasHistory) return "soft";
  if (isPrepaidProductLocked(product, salesOpenMonth)) return "soft";
  return "hard";
}

// ─────────────────────────────────────────────────────────────────────────
// 신규 MONTHLY_FIXED 귀속 월 도출 — never null
// ─────────────────────────────────────────────────────────────────────────

export interface BillingMonthCandidates {
  /** 생성 경로: 첫 비취소 일정의 달 (utcMonthStart). */
  firstScheduleMonth?: Date | null;
  /** updateClass→reconcile 경로: lifecycle 대상월(earliestRemainingMonth). */
  lifecycleTargetMonth?: Date | null;
  /** 공통 폴백: 현재 판매 승인 월. */
  salesOpenMonth?: Date | null;
}

/**
 * 신규 MONTHLY_FIXED 의 귀속 월 도출 — 우선순위 폴백, 전부 없으면 fail-fast 400.
 * 서버 현재시각·DTO startDate 로 추정하지 않는다(첫 일정의 달·salesOpenMonth 와
 * 어긋난 월이 박히는 것을 차단). null 을 반환하는 경우는 없다.
 * MONTHLY_FIXED 미요청 경로에서는 호출 자체를 하지 않는다(과차단 방지).
 */
export function resolveNewProductBillingMonth(
  candidates: BillingMonthCandidates,
): Date {
  const resolved =
    candidates.firstScheduleMonth ??
    candidates.lifecycleTargetMonth ??
    candidates.salesOpenMonth ??
    null;
  if (!resolved) {
    throw new BadRequestException(PRICE_LOCK_MESSAGES.BILLING_MONTH_REQUIRED);
  }
  return new Date(toUtcMonthStartMs(resolved));
}

// ─────────────────────────────────────────────────────────────────────────
// 판매 승인 월 비감소 불변식 — openSales 전용
// ─────────────────────────────────────────────────────────────────────────

/**
 * 판매 승인 월 역행 거부 — `billingMonth ≤ salesOpenMonth` 잠금 비교가
 * "과거에 판매됐던 월분"을 포함하려면 salesOpenMonth 가 비감소여야 한다.
 * (이른 달 일정 추가로 earliestRemainingMonth 가 과거로 이동하는 경우 차단)
 */
export function assertSalesMonthNotRolledBack(
  targetMonth: Date,
  currentSalesOpenMonth: Date | null,
): void {
  if (!currentSalesOpenMonth) return;
  if (
    toUtcMonthStartMs(targetMonth) < toUtcMonthStartMs(currentSalesOpenMonth)
  ) {
    throw new BadRequestException(PRICE_LOCK_MESSAGES.SALES_MONTH_ROLLBACK);
  }
}
