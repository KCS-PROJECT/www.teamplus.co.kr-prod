import { resolveRowBillingTiming } from "@/payments/settlement/attribution.util";

export interface EnrollmentBillingSnapshot {
  billingTiming: "PREPAID" | "POSTPAID";
  billingMonth: Date;
}

/**
 * Enrollment.billingTiming / billingMonth 스냅샷 — 신청 생성과 상품 교체 재활용
 * 지점이 공유한다. 월분 선불 상품만 상품 자체 월을 쓰고, 후불·스팟·무월 레거시는
 * 판매 게이트가 돌려준 판매 중인 달(earliestRemainingMonth)로 귀속한다.
 * 신청일·결제일에서 파생하지 않는다 — 8/29 에 9월분을 신청하면 9월이어야 한다.
 *
 * 결정 불능(UNASSIGNED · 판매 중인 달 없음)은 조용히 NULL 로 남기지 않고 던진다 —
 * 판매 게이트를 통과한 뒤라 정상 경로에서는 도달하지 않으며, 도달했다면 불변식이
 * 깨진 것이므로 어느 쓰기가 만든 행인지 추적 불가한 NULL 보다 실패가 낫다.
 */
export function resolveEnrollmentBilling(
  classBillingMode: string | null | undefined,
  productBillingTiming: string | null | undefined,
  productBillingMonth: Date | null | undefined,
  saleMonth: Date | null | undefined,
): EnrollmentBillingSnapshot {
  const timing = resolveRowBillingTiming(classBillingMode, productBillingTiming);
  if (timing === "UNASSIGNED") {
    throw new Error(
      "수강 신청 결제 방식을 결정할 수 없습니다 (선택형 수업에 상품 미선택).",
    );
  }
  const billingMonth =
    timing === "PREPAID" && productBillingMonth != null
      ? productBillingMonth
      : saleMonth;
  if (billingMonth == null) {
    throw new Error("수강 신청 귀속월을 결정할 수 없습니다 (판매 중인 달 없음).");
  }
  return { billingTiming: timing, billingMonth };
}
