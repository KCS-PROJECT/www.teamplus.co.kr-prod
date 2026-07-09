/**
 * 결제 상품 feeType 판정 상수 — 단일 SoT.
 *
 * 월 정액 기간권(MONTHLY_FIXED) 판정은 3곳(출석 차감 deductOne · 종료 가드
 * countActivePrepaidRemainders · 크레딧 조회 분류)이 공유한다 — 리터럴 복제 금지
 * (설계 §8.4 "deductOne 과 판정 공유 — 이원화 방지").
 */
export const MONTHLY_FIXED_FEE_TYPE = "MONTHLY_FIXED" as const;

/** MemberCredit 이 월 정액 기간권인지 판정하는 공용 Prisma 관계 필터. */
export const MONTHLY_PASS_CREDIT_FILTER = {
  payment: { product: { feeType: MONTHLY_FIXED_FEE_TYPE } },
} as const;

/**
 * [Lifecycle v4.1 §9.5] 기간권 유효 "시작" 게이트 조건 — startsAt null(즉시 유효·레거시)
 * 또는 startsAt ≤ now. 출석 가능 판정(deductOne·홈 버튼·사전 검증)에 expiresAt 필터와
 * 반드시 병행한다. 다음 달분 선구매 크레딧이 당월에 유효로 오판되는 것을 막는 장치.
 * ⚠️ 종료 가드(countActivePrepaidRemainders)에는 넣지 않는다 — 미래 채무 포함이 목적.
 */
export function creditStartedWhere(now: Date = new Date()) {
  return { OR: [{ startsAt: null }, { startsAt: { lte: now } }] };
}

/** JS 측 동일 판정 (이미 조회된 크레딧 배열 필터용). */
export function isCreditStarted(
  credit: { startsAt?: Date | null },
  now: Date = new Date(),
): boolean {
  return credit.startsAt == null || credit.startsAt <= now;
}
