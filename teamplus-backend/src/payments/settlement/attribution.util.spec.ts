import {
  resolvePrepaidAttribution,
  resolvePostpaidLineAttribution,
  resolveTournamentAttribution,
  resolveRowBillingTiming,
  resolveSettlementYearMonth,
  instantToKstYearMonth,
  dbDateToKstYearMonth,
  isRosterMemberForMonth,
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

  describe("resolvePrepaidAttribution — [Phase 3] enrollments.billing_month 직접 판독", () => {
    it("① billing_month 있음 + 완료 결제 → billing_month 월(completedAt과 달라도 무관)", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
        enrollmentBillingMonth: JUNE_DBDATE,
        enrollmentStatus: "paid",
        payment: {
          paymentStatus: "completed",
          completedAt: JULY_INSTANT, // 7월 결제여도 귀속은 신청 확정월(6월)
          amount: 100000,
          refundLogs: [],
        },
      });
      expect(r.yearMonth).toBe("2026-06");
      expect(r.billingStatus).toBe("PAID");
      expect(r.billedAmount).toBe(100000);
      expect(r.paidAmount).toBe(100000);
    });

    it("② pending 선불(결제 진행 중/이탈) → billing_month 귀속 유지 · UNSETTLED 집계 제외", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
        enrollmentBillingMonth: JUNE_DBDATE,
        payment: {
          paymentStatus: "pending",
          createdAt: JULY_INSTANT,
          amount: 50000,
          refundLogs: [],
        },
      });
      expect(r.yearMonth).toBe("2026-06"); // 귀속만 유지(attributionUnknown 방지)
      expect(r.billingStatus).toBe("UNSETTLED");
      expect(r.billedAmount).toBeNull(); // 확정 청구 아님 — 미수금·매출 미집계
      expect(r.paidAmount).toBe(0);
    });

    it("③ 환불(부분) → billing_month 유지 · 순수납 = 청구−환불", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
        enrollmentBillingMonth: JUNE_DBDATE,
        payment: {
          paymentStatus: "partially_refunded",
          completedAt: JULY_INSTANT,
          amount: 100000,
          refundLogs: [{ refundAmount: 30000 }],
        },
      });
      expect(r.yearMonth).toBe("2026-06"); // 신청 확정월 유지
      expect(r.billingStatus).toBe("REFUNDED");
      expect(r.billedAmount).toBeNull(); // 유효 청구 제외
      expect(r.refundedAmount).toBe(30000);
      expect(r.paidAmount).toBe(70000); // 순수납
    });

    it("④ 귀속 근거 없음(billing_month NULL — 백필 전·결정 불능) → yearMonth=null + attributionUnknown", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "PREPAID",
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
        enrollmentBillingMonth: JUNE_DBDATE,
        enrollmentStatus: "cancelled",
        payment: {
          paymentStatus: "cancelled",
          completedAt: JULY_INSTANT,
          amount: 100000,
          refundLogs: [],
        },
      });
      expect(r.billingStatus).toBe("CANCELLED");
      expect(r.yearMonth).toBe("2026-06"); // 신청 확정월 유지
      expect(r.billedAmount).toBeNull();
      expect(r.paidAmount).toBe(0);
    });

    it("UNASSIGNED(BOTH 상품 미배정) → UNSETTLED · 금액 제외", () => {
      const r = resolvePrepaidAttribution({
        billingTiming: "UNASSIGNED",
        enrollmentBillingMonth: JUNE_DBDATE,
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

  describe("isRosterMemberForMonth — [Phase 3] 자격 ∪ 활동 증거", () => {
    it("자격 있으면 활동 증거 없어도 명단 포함", () => {
      expect(isRosterMemberForMonth(true, false)).toBe(true);
    });
    it("자격 없어도 그 달 활동 증거 있으면 명단 포함", () => {
      expect(isRosterMemberForMonth(false, true)).toBe(true);
    });
    it("자격도 활동도 없으면 명단 제외", () => {
      expect(isRosterMemberForMonth(false, false)).toBe(false);
    });
    it("자격·활동 모두 있어도 포함(중복 조건 무관)", () => {
      expect(isRosterMemberForMonth(true, true)).toBe(true);
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

    it("PENDING(정산 후 미결제·mode 미전달=후불 간주) → BILLED · Payment createdAt 월", () => {
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

    it("후불 명시 + PENDING → BILLED (확정 청구 미수)", () => {
      const r = resolveTournamentAttribution({
        registrationPaymentStatus: "PENDING",
        amount: 30000,
        endDate: new Date("2026-06-30T00:00:00Z"),
        tournamentBillingMode: "POSTPAID",
        payment: {
          paymentStatus: "pending",
          createdAt: JULY_INSTANT,
          refundLogs: [],
        },
      });
      expect(r.billingStatus).toBe("BILLED");
      expect(r.billedAmount).toBe(30000);
    });

    it("선불 + PENDING(결제 진행 중/이탈) → UNSETTLED · 청구/예상 모두 제외", () => {
      const r = resolveTournamentAttribution({
        registrationPaymentStatus: "PENDING",
        amount: 30000,
        endDate: new Date("2026-06-30T00:00:00Z"),
        tournamentBillingMode: "PREPAID",
        payment: {
          paymentStatus: "pending",
          createdAt: JULY_INSTANT,
          refundLogs: [],
        },
      });
      expect(r.billingStatus).toBe("UNSETTLED");
      expect(r.billedAmount).toBeNull(); // 확정 청구 아님 — 미수금 미집계
      expect(r.estimatedAmount).toBeNull(); // "곧 청구할 돈"도 아님 — 정산 예정 미집계
      expect(r.yearMonth).toBe("2026-07"); // 귀속만 유지
    });

    it("선불 + PAID → 완료 결제는 정상 수납(선불 제외는 PENDING 한정)", () => {
      const r = resolveTournamentAttribution({
        registrationPaymentStatus: "PAID",
        amount: 30000,
        endDate: new Date("2026-06-30T00:00:00Z"),
        tournamentBillingMode: "PREPAID",
        payment: {
          paymentStatus: "completed",
          completedAt: JULY_INSTANT,
          refundLogs: [],
        },
      });
      expect(r.billingStatus).toBe("PAID");
      expect(r.paidAmount).toBe(30000);
    });

    it("실제 취소 형태(cancelRegistration: registration=CANCELLED·payment=refunded·refundLogs=[]) → REFUNDED · 전액 환불 · 순수납 0", () => {
      // cancelRegistration 은 RefundLog 를 생성하지 않는다(로그 부재 = 전액 환불).
      const r = resolveTournamentAttribution({
        registrationPaymentStatus: "CANCELLED",
        amount: 50000,
        endDate: new Date("2026-06-30T00:00:00Z"),
        payment: {
          paymentStatus: "refunded",
          completedAt: JULY_INSTANT,
          refundLogs: [],
        },
      });
      expect(r.billingStatus).toBe("REFUNDED");
      expect(r.refundedAmount).toBe(50000); // 로그 부재여도 전액 환불로 해석
      expect(r.billedAmount).toBeNull(); // 유효 청구 제외
      expect(r.paidAmount).toBe(0); // 매출/순수납 0 — 취소가 매출에 잔존하지 않음
    });

    it("부분 환불(partially_refunded + 로그) → 로그 합 그대로 · 순수납 = 청구−환불", () => {
      const r = resolveTournamentAttribution({
        registrationPaymentStatus: "REFUNDED",
        amount: 50000,
        endDate: new Date("2026-06-30T00:00:00Z"),
        payment: {
          paymentStatus: "partially_refunded",
          completedAt: JULY_INSTANT,
          refundLogs: [{ refundAmount: 20000 }],
        },
      });
      expect(r.billingStatus).toBe("REFUNDED");
      expect(r.refundedAmount).toBe(20000); // 부분 환불 = 로그 합
      expect(r.paidAmount).toBe(30000); // 순수납 = 50000 − 20000
    });

    it("전액 환불 + 로그 존재(회귀) → 로그 합 사용 · 순수납 0", () => {
      const r = resolveTournamentAttribution({
        registrationPaymentStatus: "REFUNDED",
        amount: 50000,
        endDate: new Date("2026-06-30T00:00:00Z"),
        payment: {
          paymentStatus: "refunded",
          completedAt: JULY_INSTANT,
          refundLogs: [{ refundAmount: 50000 }],
        },
      });
      expect(r.billingStatus).toBe("REFUNDED");
      expect(r.refundedAmount).toBe(50000); // 로그 있으면 로그 합 사용(전액 폴백 아님)
      expect(r.paidAmount).toBe(0);
    });

    it("PAID 정상(회귀) → 순수납 = 청구액", () => {
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
      expect(r.paidAmount).toBe(30000);
      expect(r.refundedAmount).toBe(0);
    });
  });
});
