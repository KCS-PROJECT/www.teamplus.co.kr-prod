import {
  HIDE_INACTIVE_USER_TYPES,
  PACKAGE_DISABLED_REASONS,
  PACKAGE_PAYMENT_BLOCK_MESSAGES,
  isClassEnded,
  shouldHideInactiveFor,
  computePackageGuardMeta,
  assertPaymentAllowed,
} from "./package-guard.util";

describe("package-guard.util", () => {
  const NOW = new Date("2026-05-22T00:00:00.000Z");

  const daysFromNow = (n: number): Date => {
    const d = new Date(NOW);
    d.setDate(d.getDate() + n);
    return d;
  };

  describe("상수 SoT", () => {
    it("HIDE_INACTIVE_USER_TYPES 는 PARENT/CHILD/TEEN", () => {
      expect(HIDE_INACTIVE_USER_TYPES.has("PARENT")).toBe(true);
      expect(HIDE_INACTIVE_USER_TYPES.has("CHILD")).toBe(true);
      expect(HIDE_INACTIVE_USER_TYPES.has("TEEN")).toBe(true);
      expect(HIDE_INACTIVE_USER_TYPES.has("COACH")).toBe(false);
      expect(HIDE_INACTIVE_USER_TYPES.has("DIRECTOR")).toBe(false);
      expect(HIDE_INACTIVE_USER_TYPES.has("ACADEMY_DIRECTOR")).toBe(false);
      expect(HIDE_INACTIVE_USER_TYPES.has("ADMIN")).toBe(false);
    });
  });

  describe("isClassEnded()", () => {
    it("endTime 이 현재보다 미래이면 false", () => {
      expect(isClassEnded(daysFromNow(1), NOW)).toBe(false);
    });

    it("endTime 이 현재보다 과거이면 true", () => {
      expect(isClassEnded(daysFromNow(-1), NOW)).toBe(true);
    });

    it("endTime null 은 false", () => {
      expect(isClassEnded(null, NOW)).toBe(false);
    });
  });

  describe("shouldHideInactiveFor()", () => {
    it.each(["PARENT", "CHILD", "TEEN"])("%s 는 true", (type) => {
      expect(shouldHideInactiveFor(type)).toBe(true);
    });

    it.each(["COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN"])(
      "%s 는 false",
      (type) => {
        expect(shouldHideInactiveFor(type)).toBe(false);
      },
    );

    it("undefined/null 는 false", () => {
      expect(shouldHideInactiveFor(undefined)).toBe(false);
      expect(shouldHideInactiveFor(null)).toBe(false);
    });
  });

  describe("computePackageGuardMeta()", () => {
    const endTime = daysFromNow(11);

    it("isActive=true → isPurchasable=true, disabledReason=null", () => {
      const meta = computePackageGuardMeta(
        { feeType: "PER_SESSION", durationDays: 30, isActive: true },
        endTime,
        NOW,
      );
      expect(meta.isPurchasable).toBe(true);
      expect(meta.disabledReason).toBeNull();
    });

    it("isActive=false → isPurchasable=false, disabledReason=INACTIVE", () => {
      const meta = computePackageGuardMeta(
        { feeType: "PER_SESSION", durationDays: 30, isActive: false },
        endTime,
        NOW,
      );
      expect(meta.isPurchasable).toBe(false);
      expect(meta.disabledReason).toBe(PACKAGE_DISABLED_REASONS.INACTIVE);
    });

    it("MONTHLY_FIXED + 수업 종료 후에도 isActive=true → isPurchasable=true (endTime 가드 폐기)", () => {
      const endedAt = daysFromNow(-10);
      const meta = computePackageGuardMeta(
        { feeType: "MONTHLY_FIXED", durationDays: 56, isActive: true },
        endedAt,
        NOW,
      );
      expect(meta.isPurchasable).toBe(true);
      expect(meta.disabledReason).toBeNull();
    });

    it("classEndDate 가 응답에 그대로 전달됨 (프론트 호환)", () => {
      const meta = computePackageGuardMeta(
        { feeType: "PER_SESSION", durationDays: 30, isActive: true },
        endTime,
        NOW,
      );
      expect(meta.classEndDate).toEqual(endTime);
    });

    it("durationDays null → expectedExpiresAt null", () => {
      const meta = computePackageGuardMeta(
        { feeType: "PER_SESSION", durationDays: null, isActive: true },
        endTime,
        NOW,
      );
      expect(meta.expectedExpiresAt).toBeNull();
      expect(meta.isPurchasable).toBe(true);
    });

    it("durationDays 있으면 expectedExpiresAt = now + durationDays", () => {
      const meta = computePackageGuardMeta(
        { feeType: "MONTHLY_FIXED", durationDays: 28, isActive: true },
        endTime,
        NOW,
      );
      const expected = daysFromNow(28);
      expect(meta.expectedExpiresAt?.toISOString()).toBe(expected.toISOString());
    });
  });

  describe("assertPaymentAllowed()", () => {
    const endTime = daysFromNow(11);

    it("isActive=true → null (통과)", () => {
      expect(
        assertPaymentAllowed({
          feeType: "PER_SESSION",
          durationDays: 30,
          isActive: true,
          class: { endTime },
        }),
      ).toBeNull();
    });

    it("isActive=false → INACTIVE", () => {
      const result = assertPaymentAllowed({
        feeType: "PER_SESSION",
        durationDays: 30,
        isActive: false,
        class: { endTime },
      });
      expect(result).toBe("INACTIVE");
      expect(PACKAGE_PAYMENT_BLOCK_MESSAGES[result!]).toContain("결제할 수 없는");
    });

    it("수업 종료 후에도 isActive=true → null (endTime 가드 폐기)", () => {
      const endedAt = daysFromNow(-10);
      expect(
        assertPaymentAllowed({
          feeType: "PER_SESSION",
          durationDays: 30,
          isActive: true,
          class: { endTime: endedAt },
        }),
      ).toBeNull();
    });

    it("MONTHLY_FIXED + durationDays 초과 + isActive=true → null (endTime 가드 폐기)", () => {
      expect(
        assertPaymentAllowed({
          feeType: "MONTHLY_FIXED",
          durationDays: 56,
          isActive: true,
          class: { endTime },
        }),
      ).toBeNull();
    });

    it("class 정보 없음 + isActive=true → null", () => {
      expect(
        assertPaymentAllowed({
          feeType: "MONTHLY_FIXED",
          durationDays: 56,
          isActive: true,
          class: null,
        }),
      ).toBeNull();
    });
  });
});
