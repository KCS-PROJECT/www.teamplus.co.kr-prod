/**
 * 수강 중(활성 등록) 판정 — 프론트 공통 SoT.
 *
 * 백엔드 `scheduleEligibleClassFilter`(common/billing/schedule-eligibility.util.ts)와
 * 동일한 정책을 프론트에서 status+billingMode 조합으로 판정한다.
 *
 *   · 선불(PREPAID): 결제 완료(paid) 만 수강 중. 승인됐어도 미결제(approved)는 제외.
 *   · 후불(POSTPAID): 선결제 없이 수강(approved)하므로 approved 도 수강 중.
 *   · 선택형(BOTH): 후불 상품(billingTiming=POSTPAID) 선택 approved 만 수강 중.
 *     선불 상품 approved(미결제)는 제외 — productBillingTiming 은 enrollment 에
 *     연결된 상품(product.billingTiming)을 전달한다.
 *
 * 사용처(단일 SoT):
 *   - 학부모 대시보드 월 캘린더 노출 자격 (parent/page.tsx · enabledClassIds)
 *   - 수업 목록 "등록완료" 배지 (classes/page.tsx · enrolledClassIds)
 *   - 대시보드 훈련 요약 (TeamClassesSummary.tsx)
 *   - 통합캘린더 등록훈련 카드 (EnrolledTrainingSection.tsx)
 */
export function isActiveEnrollment(
  status?: string | null,
  billingMode?: string | null,
  productBillingTiming?: string | null,
): boolean {
  if (status === "paid") return true;
  if (status === "approved" && billingMode === "POSTPAID") return true;
  if (
    status === "approved" &&
    billingMode === "BOTH" &&
    productBillingTiming === "POSTPAID"
  )
    return true;
  return false;
}
