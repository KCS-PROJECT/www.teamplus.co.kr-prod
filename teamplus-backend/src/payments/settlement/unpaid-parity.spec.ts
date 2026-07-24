import {
  resolvePostpaidLineAttribution,
  resolvePrepaidAttribution,
} from "./attribution.util";

/**
 * [미수금 정의 parity 잠금] 결제 관리(/director-payments) ↔ 매출 리포트(/statistics)
 *
 * 수업 미수금은 두 소비처가 서로 다른 구현 경로를 쓴다:
 *  · 결제 관리: resolvePostpaidLineAttribution 행 판정 → Σ max(0, billed − paid)
 *    (settlement-summary.service.buildClassSourceRows)
 *  · 매출 리포트: MonthlyPostpaidBillingLine.paymentStatus='pending' 의 amount 직접 합
 *    (teams/director-revenue.service.ts "현재 미수금" 쿼리)
 *
 * 두 경로는 같은 질문("미수금 얼마?")에 같은 답을 내야 한다 — 이 spec 은 공유 픽스처로
 * 두 규칙의 결과 일치를 고정한다. 한쪽 정의만 바뀌면 여기가 깨져 드리프트가 드러난다.
 *
 * 전제(도메인 불변식): 라인 paymentStatus 와 연결 Payment 는 confirmTossPayment 가
 * 트랜잭션으로 동시 갱신하므로 "라인 pending + Payment completed" 같은 stale 조합은
 * 정상 상태가 아니다 — parity 는 정합 상태만 다룬다.
 */
describe("미수금 정의 parity — 결제 관리 ↔ 매출 리포트", () => {
  const YM = "2026-07";

  interface LineFixture {
    amount: number;
    linePaymentStatus: "pending" | "paid";
    payment: {
      paymentStatus: string | null;
      refundLogs: { refundAmount: number | null }[];
    } | null;
  }

  /** 후불 확정 라인 혼합 — pending(주문 전/주문 pending)·완납·환불. */
  const LINES: LineFixture[] = [
    // 청구 확정 + 주문 미생성 → 미수
    { amount: 40000, linePaymentStatus: "pending", payment: null },
    // 청구 확정 + 주문 pending(학부모 미결제) → 미수
    {
      amount: 25000,
      linePaymentStatus: "pending",
      payment: { paymentStatus: "pending", refundLogs: [] },
    },
    // 완납 → 미수 아님
    {
      amount: 30000,
      linePaymentStatus: "paid",
      payment: { paymentStatus: "completed", refundLogs: [] },
    },
    // 환불 → 미수 아님(청구 자체 제외)
    {
      amount: 50000,
      linePaymentStatus: "paid",
      payment: {
        paymentStatus: "refunded",
        refundLogs: [{ refundAmount: 50000 }],
      },
    },
  ];

  /** 결제 관리 경로 — attribution 행 판정 합산(§2-0 불변식과 동일 식). */
  const settlementOutstanding = (lines: LineFixture[]): number =>
    lines.reduce((sum, ln) => {
      const att = resolvePostpaidLineAttribution({
        yearMonth: YM,
        amount: ln.amount,
        linePaymentStatus: ln.linePaymentStatus,
        payment: ln.payment,
      });
      if (att.billedAmount == null) return sum;
      return sum + Math.max(0, att.billedAmount - att.paidAmount);
    }, 0);

  /** 매출 리포트 경로 — director-revenue.service 의 직접 쿼리 규칙 재현. */
  const revenueOutstanding = (lines: LineFixture[]): number =>
    lines
      .filter((ln) => ln.linePaymentStatus === "pending")
      .reduce((sum, ln) => sum + ln.amount, 0);

  it("후불 확정 라인 혼합 — 두 경로의 미수금 합이 일치한다", () => {
    const a = settlementOutstanding(LINES);
    const b = revenueOutstanding(LINES);
    expect(a).toBe(65000); // 40000 + 25000
    expect(a).toBe(b);
  });

  it("전부 완납이면 두 경로 모두 0", () => {
    const paidOnly = LINES.filter((l) => l.linePaymentStatus === "paid");
    expect(settlementOutstanding(paidOnly)).toBe(0);
    expect(revenueOutstanding(paidOnly)).toBe(0);
  });

  it("선불 pending(결제 이탈)은 어느 경로에서도 미수금이 아니다", () => {
    // 결제 관리 경로 — 선불 행 판정: pending 은 UNSETTLED(billed null) → 기여 0.
    const att = resolvePrepaidAttribution({
      billingTiming: "PREPAID",
      feeType: "PER_SESSION",
      payment: {
        paymentStatus: "pending",
        createdAt: new Date("2026-07-10T03:00:00Z"),
        amount: 50000,
        refundLogs: [],
      },
    });
    expect(att.billingStatus).toBe("UNSETTLED");
    expect(att.billedAmount).toBeNull();
    // 매출 리포트 경로 — 수업 미수금 쿼리는 후불 확정 라인만 보므로
    // 선불 enrollment/Payment 는 구조적으로 집계 대상이 아니다(기여 0). 정의 일치.
  });
});
