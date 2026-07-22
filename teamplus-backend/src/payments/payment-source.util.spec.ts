import { deriveSource } from "./payment-source.util";

/**
 * 결제 출처 라벨링 파생 순수 함수 단위 검증 (SPEC §6-1).
 *  - 대회/수업 × 선불/후불 파생 정확성
 *  - 후불 라인 우선순위(product null 대응)
 *  - 복수 관계 시 대회 우선
 *  - 관계 전무 → null (강화 지시: 매치·쇼핑 오라벨 방지)
 */
describe("payment-source.util · deriveSource", () => {
  it("후불 대회(billingMode=POSTPAID) → TOURNAMENT/POSTPAID", () => {
    expect(
      deriveSource({
        productBillingTiming: null,
        hasMonthlyBillingLine: false,
        tournamentBillingMode: "POSTPAID",
      }),
    ).toEqual({ sourceType: "TOURNAMENT", billingTiming: "POSTPAID" });
  });

  it("선불 대회(billingMode=PREPAID) → TOURNAMENT/PREPAID", () => {
    expect(
      deriveSource({
        productBillingTiming: null,
        hasMonthlyBillingLine: false,
        tournamentBillingMode: "PREPAID",
      }),
    ).toEqual({ sourceType: "TOURNAMENT", billingTiming: "PREPAID" });
  });

  it("후불 수업(라인 존재, product null) → CLASS/POSTPAID", () => {
    expect(
      deriveSource({
        productBillingTiming: null,
        hasMonthlyBillingLine: true,
        tournamentBillingMode: null,
      }),
    ).toEqual({ sourceType: "CLASS", billingTiming: "POSTPAID" });
  });

  it("선불 수업(product.billingTiming=PREPAID) → CLASS/PREPAID", () => {
    expect(
      deriveSource({
        productBillingTiming: "PREPAID",
        hasMonthlyBillingLine: false,
        tournamentBillingMode: null,
      }),
    ).toEqual({ sourceType: "CLASS", billingTiming: "PREPAID" });
  });

  it("BOTH 후불(라인 존재) → CLASS/POSTPAID", () => {
    expect(
      deriveSource({
        productBillingTiming: "PREPAID", // BOTH 상품이라도 라인이 우선
        hasMonthlyBillingLine: true,
        tournamentBillingMode: null,
      }),
    ).toEqual({ sourceType: "CLASS", billingTiming: "POSTPAID" });
  });

  it("BOTH 선불(product PREPAID, 라인 없음) → CLASS/PREPAID", () => {
    expect(
      deriveSource({
        productBillingTiming: "PREPAID",
        hasMonthlyBillingLine: false,
        tournamentBillingMode: null,
      }),
    ).toEqual({ sourceType: "CLASS", billingTiming: "PREPAID" });
  });

  it("수업 상품 POSTPAID(라인 없음) → CLASS/POSTPAID", () => {
    expect(
      deriveSource({
        productBillingTiming: "POSTPAID",
        hasMonthlyBillingLine: false,
        tournamentBillingMode: null,
      }),
    ).toEqual({ sourceType: "CLASS", billingTiming: "POSTPAID" });
  });

  it("관계 전무(매치·쇼핑·기타) → null/null (오라벨 방지)", () => {
    expect(
      deriveSource({
        productBillingTiming: null,
        hasMonthlyBillingLine: false,
        tournamentBillingMode: null,
      }),
    ).toEqual({ sourceType: null, billingTiming: null });
  });

  it("productBillingTiming undefined + 무신호 → null/null", () => {
    expect(
      deriveSource({
        hasMonthlyBillingLine: false,
      }),
    ).toEqual({ sourceType: null, billingTiming: null });
  });

  it("복수 관계(대회 + 수업 라인 동시) → TOURNAMENT 우선", () => {
    expect(
      deriveSource({
        productBillingTiming: "PREPAID",
        hasMonthlyBillingLine: true,
        tournamentBillingMode: "PREPAID",
      }),
    ).toEqual({ sourceType: "TOURNAMENT", billingTiming: "PREPAID" });
  });

  it("대회 billingMode 미지정 값 → PREPAID 폴백(POSTPAID 아니면 선불)", () => {
    expect(
      deriveSource({
        productBillingTiming: null,
        hasMonthlyBillingLine: false,
        tournamentBillingMode: "OTHER",
      }),
    ).toEqual({ sourceType: "TOURNAMENT", billingTiming: "PREPAID" });
  });
});
