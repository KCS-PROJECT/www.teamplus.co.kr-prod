import { BadRequestException } from "@nestjs/common";
import {
  PRICE_LOCK_MESSAGES,
  isEntitlementOrAmountChange,
  isPrepaidProductLocked,
  assertPrepaidPriceMutable,
  assertPrepaidChangeAllowed,
  assertMonthNotFrozen,
  assertLegacyNotReactivated,
  resolveProductDeletionMode,
  resolveNewProductBillingMonth,
  assertSalesMonthNotRolledBack,
} from "./price-lock.util";

const JUN = new Date(Date.UTC(2026, 5, 1));
const JUL = new Date(Date.UTC(2026, 6, 1));
const AUG = new Date(Date.UTC(2026, 7, 1));

const monthly = (billingMonth: Date | null) => ({
  feeType: "MONTHLY_FIXED",
  billingMonth,
});

describe("isEntitlementOrAmountChange", () => {
  const before = {
    price: 100000,
    feeType: "MONTHLY_FIXED",
    feePerSession: 50000,
    sessionsPerMonth: 8,
    sessionsPerWeek: 2,
    durationDays: 28,
  };

  it("변경 요청 필드가 없으면(undefined) 미변경", () => {
    const diff = isEntitlementOrAmountChange(before, {});
    expect(diff.changed).toBe(false);
    expect(diff.effectiveAmountChanged).toBe(false);
    expect(diff.changedFields).toEqual([]);
  });

  it("동일 값 재저장은 미변경 — 문자열/숫자/Decimal 유사형 혼재 허용", () => {
    const diff = isEntitlementOrAmountChange(before, {
      price: "100000",
      feePerSession: { toNumber: () => 50000 },
      sessionsPerMonth: 8,
    });
    expect(diff.changed).toBe(false);
  });

  it("price 변경 = 유효금액 변경", () => {
    const diff = isEntitlementOrAmountChange(before, { price: 120000 });
    expect(diff.changed).toBe(true);
    expect(diff.effectiveAmountChanged).toBe(true);
    expect(diff.changedFields).toEqual(["price"]);
  });

  it("breakdown 축(feePerSession·sessionsPerWeek) 변경도 유효금액 변경", () => {
    expect(
      isEntitlementOrAmountChange(before, { feePerSession: 70000 })
        .effectiveAmountChanged,
    ).toBe(true);
    expect(
      isEntitlementOrAmountChange(before, { sessionsPerWeek: 3 })
        .effectiveAmountChanged,
    ).toBe(true);
  });

  it("회수·기간·feeType 만 변경 = 권리조건 변경이지만 유효금액 변경 아님", () => {
    const diff = isEntitlementOrAmountChange(before, {
      sessionsPerMonth: 4,
      durationDays: 14,
      feeType: "PER_SESSION",
    });
    expect(diff.changed).toBe(true);
    expect(diff.effectiveAmountChanged).toBe(false);
    expect(diff.changedFields).toEqual([
      "feeType",
      "sessionsPerMonth",
      "durationDays",
    ]);
  });

  it("null ↔ 값 전환도 변경으로 감지 (feePerSession null 해제 등)", () => {
    const diff = isEntitlementOrAmountChange(
      { ...before, feePerSession: null },
      { feePerSession: 50000 },
    );
    expect(diff.effectiveAmountChanged).toBe(true);
  });
});

describe("isPrepaidProductLocked — 판매 시작 앵커 (결제 상태 무관)", () => {
  it("MONTHLY_FIXED 외 상품은 대상 아님", () => {
    expect(
      isPrepaidProductLocked(
        { feeType: "PER_SESSION", billingMonth: JUN },
        JUL,
      ),
    ).toBe(false);
  });

  it("판매 이력 전무(salesOpenMonth null)면 잠기지 않음", () => {
    expect(isPrepaidProductLocked(monthly(JUL), null)).toBe(false);
    expect(isPrepaidProductLocked(monthly(null), null)).toBe(false);
  });

  it("무월 legacy 는 판매 중일 가능성 — fail-safe 잠금", () => {
    expect(isPrepaidProductLocked(monthly(null), JUL)).toBe(true);
  });

  it("판매 시작된 현재/과거 월분 잠금, 미래 월분 자유", () => {
    expect(isPrepaidProductLocked(monthly(JUN), JUL)).toBe(true);
    expect(isPrepaidProductLocked(monthly(JUL), JUL)).toBe(true);
    expect(isPrepaidProductLocked(monthly(AUG), JUL)).toBe(false);
  });

  it("월 비교는 UTC 월초 정규화 — 월중 시각이 섞여도 같은 달이면 잠금", () => {
    const julMid = new Date(Date.UTC(2026, 6, 15, 9, 30));
    expect(isPrepaidProductLocked(monthly(JUL), julMid)).toBe(true);
    expect(isPrepaidProductLocked(monthly(julMid), JUL)).toBe(true);
  });
});

describe("assertPrepaidPriceMutable", () => {
  it("잠긴 월분은 거부", () => {
    expect(() => assertPrepaidPriceMutable(monthly(JUL), JUL)).toThrow(
      new BadRequestException(PRICE_LOCK_MESSAGES.PREPAID_LOCKED),
    );
  });

  it("미판매 미래 월분은 통과", () => {
    expect(() => assertPrepaidPriceMutable(monthly(AUG), JUL)).not.toThrow();
  });
});

describe("assertPrepaidChangeAllowed — 저장·변경 feeType 양방향 판정 (P2-C1)", () => {
  it("판매 시작 후 PER_SESSION → MONTHLY_FIXED 전환은 거부 (무월 legacy 둔갑 차단)", () => {
    expect(() =>
      assertPrepaidChangeAllowed(
        {
          storedFeeType: "PER_SESSION",
          effectiveFeeType: "MONTHLY_FIXED",
          billingMonth: null,
        },
        JUL,
      ),
    ).toThrow(new BadRequestException(PRICE_LOCK_MESSAGES.PREPAID_LOCKED));
  });

  it("잠긴 MONTHLY_FIXED → PER_SESSION 전환도 거부 (잠금 이탈 차단)", () => {
    expect(() =>
      assertPrepaidChangeAllowed(
        {
          storedFeeType: "MONTHLY_FIXED",
          effectiveFeeType: "PER_SESSION",
          billingMonth: JUL,
        },
        JUL,
      ),
    ).toThrow(BadRequestException);
  });

  it("PER_SESSION 일반 수정(feeType 불변)은 판매 중에도 통과", () => {
    expect(() =>
      assertPrepaidChangeAllowed(
        {
          storedFeeType: "PER_SESSION",
          effectiveFeeType: "PER_SESSION",
          billingMonth: null,
        },
        JUL,
      ),
    ).not.toThrow();
    expect(() =>
      assertPrepaidChangeAllowed(
        { storedFeeType: "PER_SESSION", billingMonth: null },
        JUL,
      ),
    ).not.toThrow();
  });

  it("판매 이력 없으면(feeType 전환 포함) 통과", () => {
    expect(() =>
      assertPrepaidChangeAllowed(
        {
          storedFeeType: "PER_SESSION",
          effectiveFeeType: "MONTHLY_FIXED",
          billingMonth: null,
        },
        null,
      ),
    ).not.toThrow();
  });

  it("미판매 미래 월분은 feeType 전환 포함 통과", () => {
    expect(() =>
      assertPrepaidChangeAllowed(
        {
          storedFeeType: "MONTHLY_FIXED",
          effectiveFeeType: "MONTHLY_FIXED",
          billingMonth: AUG,
        },
        JUL,
      ),
    ).not.toThrow();
  });
});

describe("assertMonthNotFrozen — 판매 시작된 달 신규 생성 차단", () => {
  it("판매 이력 없으면 통과", () => {
    expect(() => assertMonthNotFrozen(JUL, null)).not.toThrow();
  });

  it("판매 시작된 달(현재·과거)에는 신규 생성 거부", () => {
    expect(() => assertMonthNotFrozen(JUL, JUL)).toThrow(
      new BadRequestException(PRICE_LOCK_MESSAGES.MONTH_FROZEN),
    );
    expect(() => assertMonthNotFrozen(JUN, JUL)).toThrow(BadRequestException);
  });

  it("미래 월분 등록은 자유", () => {
    expect(() => assertMonthNotFrozen(AUG, JUL)).not.toThrow();
  });
});

describe("assertLegacyNotReactivated — 무월 legacy 재활성화 차단", () => {
  const base = {
    wasActive: false,
    willBeActive: true as boolean | undefined,
    feeType: "MONTHLY_FIXED",
    billingMonth: null as Date | null,
    hasCurrentMonthProduct: true,
  };

  it("월별 판매 중 무월 legacy 재활성화는 거부", () => {
    expect(() => assertLegacyNotReactivated(base)).toThrow(
      new BadRequestException(PRICE_LOCK_MESSAGES.LEGACY_REACTIVATION_BLOCKED),
    );
  });

  it("판매 중지(true→false)·isActive 미변경은 대상 아님", () => {
    expect(() =>
      assertLegacyNotReactivated({ ...base, willBeActive: false }),
    ).not.toThrow();
    expect(() =>
      assertLegacyNotReactivated({ ...base, willBeActive: undefined }),
    ).not.toThrow();
    expect(() =>
      assertLegacyNotReactivated({ ...base, wasActive: true }),
    ).not.toThrow();
  });

  it("월분 상품·비 MONTHLY_FIXED·월분 상품 부재 시 통과", () => {
    expect(() =>
      assertLegacyNotReactivated({ ...base, billingMonth: JUL }),
    ).not.toThrow();
    expect(() =>
      assertLegacyNotReactivated({ ...base, feeType: "PER_SESSION" }),
    ).not.toThrow();
    expect(() =>
      assertLegacyNotReactivated({ ...base, hasCurrentMonthProduct: false }),
    ).not.toThrow();
  });
});

describe("resolveProductDeletionMode — 삭제 4경로 공통 판정", () => {
  it("결제·수강 이력 존재 → 월과 무관하게 soft", () => {
    expect(resolveProductDeletionMode(monthly(AUG), JUL, true)).toBe("soft");
  });

  it("판매 시작된 월분은 이력 0건이어도 soft (판매 계약 이력 보존)", () => {
    expect(resolveProductDeletionMode(monthly(JUL), JUL, false)).toBe("soft");
    expect(resolveProductDeletionMode(monthly(JUN), JUL, false)).toBe("soft");
    expect(resolveProductDeletionMode(monthly(null), JUL, false)).toBe("soft");
  });

  it("미판매 미래 월분 + 이력 0건 → hard (미판매 초안)", () => {
    expect(resolveProductDeletionMode(monthly(AUG), JUL, false)).toBe("hard");
  });

  it("비 MONTHLY_FIXED 는 이력 기준 현행 유지", () => {
    expect(
      resolveProductDeletionMode(
        { feeType: "PER_SESSION", billingMonth: null },
        JUL,
        false,
      ),
    ).toBe("hard");
  });
});

describe("resolveNewProductBillingMonth — never null, 도출 불가 fail-fast", () => {
  it("우선순위: 첫 일정의 달 → lifecycle 대상월 → salesOpenMonth", () => {
    expect(
      resolveNewProductBillingMonth({
        firstScheduleMonth: JUL,
        lifecycleTargetMonth: AUG,
        salesOpenMonth: JUN,
      }).getTime(),
    ).toBe(JUL.getTime());
    expect(
      resolveNewProductBillingMonth({
        lifecycleTargetMonth: AUG,
        salesOpenMonth: JUN,
      }).getTime(),
    ).toBe(AUG.getTime());
    expect(
      resolveNewProductBillingMonth({ salesOpenMonth: JUN }).getTime(),
    ).toBe(JUN.getTime());
  });

  it("월중 날짜 입력도 UTC 월초로 정규화", () => {
    const julMid = new Date(Date.UTC(2026, 6, 21, 3, 0));
    expect(
      resolveNewProductBillingMonth({ firstScheduleMonth: julMid }).getTime(),
    ).toBe(JUL.getTime());
  });

  it("전부 없으면 400 — 현재시각 추정·null 저장 금지", () => {
    expect(() => resolveNewProductBillingMonth({})).toThrow(
      new BadRequestException(PRICE_LOCK_MESSAGES.BILLING_MONTH_REQUIRED),
    );
    expect(() =>
      resolveNewProductBillingMonth({
        firstScheduleMonth: null,
        lifecycleTargetMonth: null,
        salesOpenMonth: null,
      }),
    ).toThrow(BadRequestException);
  });
});

describe("assertSalesMonthNotRolledBack — salesOpenMonth 비감소 불변식", () => {
  it("최초 판매 시작(현재 값 없음)은 통과", () => {
    expect(() => assertSalesMonthNotRolledBack(JUN, null)).not.toThrow();
  });

  it("같은 달·이후 달로의 전환은 통과", () => {
    expect(() => assertSalesMonthNotRolledBack(JUL, JUL)).not.toThrow();
    expect(() => assertSalesMonthNotRolledBack(AUG, JUL)).not.toThrow();
  });

  it("이미 판매한 달보다 앞선 달로의 역행은 거부", () => {
    expect(() => assertSalesMonthNotRolledBack(JUN, JUL)).toThrow(
      new BadRequestException(PRICE_LOCK_MESSAGES.SALES_MONTH_ROLLBACK),
    );
  });
});
