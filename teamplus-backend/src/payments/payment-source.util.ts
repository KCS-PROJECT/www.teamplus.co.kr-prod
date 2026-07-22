/**
 * 결제 출처 라벨링 파생 순수 함수 (정산 센터 재설계 Phase 5 · 작업 B).
 *
 * Payment 의 기존 관계(product / monthlyBillingLines / tournamentRegistrations)에서
 * 출처(sourceType)·선후불(billingTiming)을 파생한다. DB 컬럼·마이그레이션 0.
 *
 * 설계 근거(SPEC §2-4·결정 1): settlement 폴더의 attribution.util(집계 계약,
 * resolveRowBillingTiming 등)은 roster 유효 timing(UNASSIGNED 포함)이라 시그니처·의미가
 * 다르고, 소비처가 정산 무관 화면(결제 이력·영수증)까지 포함하므로 재사용하지 않는다.
 * 본 함수는 부수효과 없는 순수 함수 — select 결과 조각만 인자로 받아 5개 매퍼가 공유한다.
 */

export type PaymentSourceType = "CLASS" | "TOURNAMENT";
export type PaymentBillingTiming = "PREPAID" | "POSTPAID";

export interface DeriveSourceInput {
  /** payment.product?.billingTiming (ClassProduct.billingTiming). 없으면 null/undefined. */
  productBillingTiming?: string | null;
  /** payment.monthlyBillingLines take:1 존재 여부(후불 정산 confirm 이 생성한 라인). */
  hasMonthlyBillingLine: boolean;
  /** payment.tournamentRegistrations take:1 의 tournament.billingMode. 존재하면 TOURNAMENT 신호. */
  tournamentBillingMode?: string | null;
}

export interface DeriveSourceResult {
  /** 관계 신호가 전무하면(매치·쇼핑·기타) null — 프론트 배지 미표시. */
  sourceType: PaymentSourceType | null;
  billingTiming: PaymentBillingTiming | null;
}

/**
 * 결제 출처·선후불 파생 (SPEC §2-2 우선순위).
 *
 * sourceType:
 *   1. tournamentBillingMode != null → TOURNAMENT
 *   2. product/monthlyBillingLine 신호 존재 → CLASS
 *   3. 관계 신호 전무 → null (매치·쇼핑·기타 결제 오라벨 방지 · 강화 지시)
 *
 * billingTiming:
 *   - TOURNAMENT: tournament.billingMode === "POSTPAID" ? POSTPAID : PREPAID
 *   - CLASS: hasMonthlyBillingLine → POSTPAID(1순위, 후불 confirm Payment 는 product null 가능)
 *            → product.billingTiming === "POSTPAID" ? POSTPAID : PREPAID
 *   - 신호 전무 → null
 *
 * 불변식: Payment 스코프(확정 거래)라 UNASSIGNED 를 반환하지 않는다.
 */
export function deriveSource(input: DeriveSourceInput): DeriveSourceResult {
  const { productBillingTiming, hasMonthlyBillingLine, tournamentBillingMode } =
    input;

  // 1. 대회 신호 우선 (tournamentRegistrations 존재)
  if (tournamentBillingMode != null) {
    return {
      sourceType: "TOURNAMENT",
      billingTiming:
        tournamentBillingMode === "POSTPAID" ? "POSTPAID" : "PREPAID",
    };
  }

  // 2. 수업 후불 신호 (라인 존재가 product 보다 우선 — product null 후불 confirm Payment 대응)
  if (hasMonthlyBillingLine) {
    return { sourceType: "CLASS", billingTiming: "POSTPAID" };
  }

  // 3. 수업 상품 연결 (선불/후불)
  if (productBillingTiming != null) {
    return {
      sourceType: "CLASS",
      billingTiming:
        productBillingTiming === "POSTPAID" ? "POSTPAID" : "PREPAID",
    };
  }

  // 4. 관계 신호 전무 → 무라벨 (매치·쇼핑·기타)
  return { sourceType: null, billingTiming: null };
}
