import {
  resolvePrepaidAttribution,
  resolvePostpaidLineAttribution,
  resolveTournamentAttribution,
  resolveRowBillingTiming,
  resolveSettlementYearMonth,
  instantToKstYearMonth,
  dbDateToKstYearMonth,
} from "./attribution.util";

/**
 * [Phase 2b] 월귀속·상태·순수납 순수 함수 단위 검증.
 *  6가지 월귀속 경우 + 환불 원결제월 유지 + 순수납 + pending BILLED + 귀속불명(현재월 금지).
 */
describe("attribution.util", () => {
  // KST 2026-07-15 (timestamptz)
  const JULY_INSTANT = new Date("2026-07-15T05:00:00Z");
  // KST 경계: UTC 07-31 16:00 = KST 08-01 → "2026-08"
  const AUG_BOUNDARY = new Date("2026-07-31T16:00:00Z");
  // @db.Date (UTC 자정) 6월 귀속월
  const JUNE_DBDATE = new Date("2026-06-01T00:00:00Z");

  describe("KST 월 변환", () => {
    it("instant 는 KST 벽시계 월로 변환한다", () => {
      expect(instantToKstYearMonth(JULY_INSTANT)).toBe("2026-07");
    });
    it("자정 경계(UTC 16시 이후)는 다음날 KST 월로 넘어간다", () => {
      expect(instantToKstYearMonth(AUG_BOUNDARY)).toBe("2026-08");
    });
    it("@db.Date 는 +9h 보정 없이 UTC 월을 그대로 쓴다", () => {
      expect(dbDateToKstYearMonth(JUNE_DBDATE)).toBe("2026-06");
    });
  });

  describe("resolveSettlementYearMonth", () => {
    it("유효한 YYYY-MM 은 그대로 반환한다", () => {
      expect(resolveSettlementYearMonth("2026-03")).toBe("2026-03");
    });
    it("범위 밖(2026-13)은 현재 월로 폴백한다", () => {
      expect(resolveSettlementYearMonth("2026-13")).toMatch(/^\d{4}-\d{2}$/);
      expect(resolveSettlementYearMonth("2026-13")).not.toBe("2026-13");
    });
  });

  describe("resolveRowBillingTiming", () => {
    it("PREPAID 수업은 전원 PREPAID", () => {
      expect(resolveRowBillingTiming("PREPAID", "POSTPAID")).toBe("PREPAID");
    });
    it("POSTPAID 수업은 전원 POSTPAID", () => {
      expect(resolveRowBillingTiming("POSTPAID", null)).toBe("POSTPAID");
    });
    it("BOTH 수업은 상품 결제시점 따름, 없으면 UNASSIGNED", () => {
      expect(resolveRowBillingTiming("BOTH", "PREPAID")).toBe("PREPAID");
      expect(resolveRowBillingTiming("BOTH", "POSTPAID")).toBe("POSTPAID");
      expect(resolveRowBillingTiming("BOTH", null)).toBe("UNASSIGNED");
    });
  });

  describe("resolvePrepaidAttribution — 월귀속 6경우", () => {
    it("① MONTHLY_FIXED + billingMonth → billingMonth 월(completedAt보다 우선)", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
        feeType: "MONTHLY_FIXED",
        billingMonth: JUNE_DBDATE,
        enrollmentStatus: "paid",
        payment: {
          paymentStatus: "completed",
          completedAt: JULY_INSTANT, // 7월 결제지만 귀속은 billingMonth(6월)
          amount: 100000,
          refundLogs: [],
        },
      });
      expect(r.yearMonth).toBe("2026-06");
      expect(r.billingStatus).toBe("PAID");
      expect(r.billedAmount).toBe(100000);
      expect(r.paidAmount).toBe(100000);
    });

    it("② billingMonth 없는 완료 선불 → completedAt 월", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
        feeType: "PER_SESSION",
        payment: {
          paymentStatus: "completed",
          completedAt: JULY_INSTANT,
          amount: 80000,
          refundLogs: [],
        },
      });
      expect(r.yearMonth).toBe("2026-07");
      expect(r.billingStatus).toBe("PAID");
      expect(r.paidAmount).toBe(80000);
    });

    it("③ pending 선불 → createdAt 월 · BILLED", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
        feeType: "PER_SESSION",
        payment: {
          paymentStatus: "pending",
          createdAt: JULY_INSTANT,
          amount: 50000,
          refundLogs: [],
        },
      });
      expect(r.yearMonth).toBe("2026-07");
      expect(r.billingStatus).toBe("BILLED");
      expect(r.billedAmount).toBe(50000); // 실청구
      expect(r.paidAmount).toBe(0);
    });

    it("④ 레거시 paid(completedAt 없음) → paidAt 월", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
        feeType: "PER_SESSION",
        enrollmentStatus: "paid",
        enrollmentPaidAt: new Date("2026-05-20T05:00:00Z"),
        productPrice: 60000,
        payment: null,
      });
      expect(r.yearMonth).toBe("2026-05");
      expect(r.billingStatus).toBe("PAID");
      expect(r.billedAmount).toBe(60000);
      expect(r.paidAmount).toBe(60000);
    });

    it("⑤ 환불(부분) → 원결제 월(completedAt) 유지 · 순수납 = 청구−환불", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
        feeType: "PER_SESSION",
        payment: {
          paymentStatus: "partially_refunded",
          completedAt: JULY_INSTANT,
          amount: 100000,
          refundLogs: [{ refundAmount: 30000 }],
        },
      });
      expect(r.yearMonth).toBe("2026-07"); // 원결제 월 유지
      expect(r.billingStatus).toBe("REFUNDED");
      expect(r.billedAmount).toBeNull(); // 유효 청구 제외
      expect(r.refundedAmount).toBe(30000);
      expect(r.paidAmount).toBe(70000); // 순수납
    });

    it("⑥ 귀속 근거 없음 → yearMonth=null + attributionUnknown(현재월 임의 귀속 금지)", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
        feeType: "PER_SESSION",
        enrollmentStatus: "approved",
        payment: null,
      });
      expect(r.yearMonth).toBeNull();
      expect(r.attributionUnknown).toBe(true);
      // 현재 월(실제 now)로 몰래 귀속되지 않았음을 명시적으로 확인.
      expect(r.yearMonth).not.toBe(resolveSettlementYearMonth());
      expect(r.billingStatus).toBe("UNSETTLED");
    });

    it("취소(enrollment cancelled) → CANCELLED · billedAmount null", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
        feeType: "PER_SESSION",
        enrollmentStatus: "cancelled",
        payment: {
          paymentStatus: "cancelled",
          completedAt: JULY_INSTANT,
          amount: 100000,
          refundLogs: [],
        },
      });
      expect(r.billingStatus).toBe("CANCELLED");
      expect(r.yearMonth).toBe("2026-07"); // 원결제 월 유지
      expect(r.billedAmount).toBeNull();
      expect(r.paidAmount).toBe(0);
    });

    it("UNASSIGNED(BOTH 상품 미배정) → UNSETTLED · 금액 제외", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "UNASSIGNED",
        feeType: "PER_SESSION",
        payment: {
          paymentStatus: "completed",
          completedAt: JULY_INSTANT,
          amount: 100000,
          refundLogs: [],
        },
      });
      expect(r.billingStatus).toBe("UNSETTLED");
      expect(r.billedAmount).toBeNull();
      expect(r.paidAmount).toBe(0);
    });
  });

  describe("resolvePostpaidLineAttribution — 확정 라인", () => {
    it("완료 라인 → PAID · billing.yearMonth 귀속", () => {
      const r = resolvePostpaidLineAttribution({
        yearMonth: "2026-07",
        amount: 40000,
        linePaymentStatus: "paid",
        payment: { paymentStatus: "completed", refundLogs: [] },
      });
      expect(r.yearMonth).toBe("2026-07");
      expect(r.billingStatus).toBe("PAID");
      expect(r.paidAmount).toBe(40000);
    });

    it("환불 라인 → REFUNDED · billedAmount null · 순수납 반영", () => {
      const r = resolvePostpaidLineAttribution({
        yearMonth: "2026-07",
        amount: 40000,
        linePaymentStatus: "paid",
        payment: {
          paymentStatus: "refunded",
          refundLogs: [{ refundAmount: 40000 }],
        },
      });
      expect(r.billingStatus).toBe("REFUNDED");
      expect(r.billedAmount).toBeNull();
      expect(r.paidAmount).toBe(0);
    });

    it("미결제 라인(pending) → BILLED", () => {
      const r = resolvePostpaidLineAttribution({
        yearMonth: "2026-07",
        amount: 40000,
        linePaymentStatus: "pending",
        payment: null,
      });
      expect(r.billingStatus).toBe("BILLED");
      expect(r.billedAmount).toBe(40000);
      expect(r.paidAmount).toBe(0);
    });
  });

  describe("resolveTournamentAttribution — 대회 후불", () => {
    it("UNPAID(정산 전) → UNSETTLED · endDate 월 귀속 · 예상액", () => {
      const r = resolveTournamentAttribution({
        registrationPaymentStatus: "UNPAID",
        amount: 0,
        endDate: new Date("2026-06-30T00:00:00Z"),
        payment: null,
      });
      expect(r.billingStatus).toBe("UNSETTLED");
      expect(r.yearMonth).toBe("2026-06"); // endDate 월
      expect(r.billedAmount).toBeNull();
      expect(r.estimatedAmount).toBe(0);
    });

    it("PAID → 확정 Payment completedAt 월 귀속", () => {
      const r = resolveTournamentAttribution({
        registrationPaymentStatus: "PAID",
        amount: 30000,
        endDate: new Date("2026-06-30T00:00:00Z"),
        payment: {
          paymentStatus: "completed",
          completedAt: JULY_INSTANT,
          refundLogs: [],
        },
      });
      expect(r.billingStatus).toBe("PAID");
      expect(r.yearMonth).toBe("2026-07"); // completedAt 우선(endDate 6월 아님)
      expect(r.paidAmount).toBe(30000);
    });

    it("PENDING(정산 후 미결제) → BILLED · Payment createdAt 월", () => {
      const r = resolveTournamentAttribution({
        registrationPaymentStatus: "PENDING",
        amount: 30000,
        endDate: new Date("2026-06-30T00:00:00Z"),
        payment: {
          paymentStatus: "pending",
          createdAt: JULY_INSTANT,
          refundLogs: [],
        },
      });
      expect(r.billingStatus).toBe("BILLED");
      expect(r.yearMonth).toBe("2026-07"); // createdAt 월
      expect(r.billedAmount).toBe(30000);
    });
  });
});
