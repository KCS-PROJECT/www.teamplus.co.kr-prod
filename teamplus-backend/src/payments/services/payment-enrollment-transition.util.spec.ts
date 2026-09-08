import {
  applyPaymentToEnrollments,
  applyPaymentToTournamentRegistrations,
  isOrphanAutoRefundRequest,
  isOrphanPayment,
  ORPHAN_PAYMENT_REFUND_REASON,
  recordOrphanPaymentRefundRequest,
} from "./payment-enrollment-transition.util";

/**
 * 결제 승인 후처리의 등록 전이 규칙 — 결제를 기다리던 등록만 완료로, 나머지는 그대로(stale).
 * 수업·대회 결제인데 전이 0건이면 고아 결제 → 환불 요청 자동 접수(활성 요청이 있으면 생략).
 * 명단(ClassRegistration)은 전이된 등록에만 올리고, stale 등록 때문에 해지하지는 않는다
 * (등록 없이 배치된 좌석 — 감독 명단 관리·나이 범위 자동 배치 — 을 결제가 해지하면 안 된다).
 */
describe("payment-enrollment-transition.util", () => {
  const paidAt = new Date("2026-09-07T00:00:00Z");

  function tx(
    rows: { id: string; status: string }[],
    opts: {
      activeRefund?: boolean;
      tournamentRows?: { id: string; paymentStatus: string }[];
    } = {},
  ) {
    const tournamentRows = opts.tournamentRows ?? [];
    return {
      enrollment: {
        findMany: jest.fn().mockResolvedValue(
          rows.map((r) => ({
            ...r,
            classId: "class-1",
            childId: `child-${r.id}`,
          })),
        ),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn(async (args: { where: { id: string } }) => ({
          count: ["pending", "approved"].includes(
            rows.find((r) => r.id === args.where.id)!.status,
          )
            ? 1
            : 0,
        })),
      },
      tournamentRegistration: {
        findMany: jest.fn().mockResolvedValue(
          tournamentRows.map((r) => ({
            ...r,
            tournamentId: "tour-1",
            childId: `child-${r.id}`,
          })),
        ),
        updateMany: jest.fn(async (args: { where: { id: string } }) => ({
          count:
            tournamentRows.find((r) => r.id === args.where.id)!
              .paymentStatus === "PENDING"
              ? 1
              : 0,
        })),
      },
      classRegistration: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      refundRequest: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.activeRefund ? { id: "rr-existing" } : null),
        create: jest.fn().mockResolvedValue({ id: "rr-new" }),
      },
      class: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ teamId: "team-1", academyId: null }),
      },
      tournament: {
        findUnique: jest.fn().mockResolvedValue({ teamId: "team-9" }),
      },
    };
  }

  const noTransition = { transitioned: [], stale: [] };

  it("pending·approved 만 paid 로 전이하고 명단을 활성화, 취소·만료는 stale", async () => {
    const t = tx([
      { id: "a", status: "pending" },
      { id: "b", status: "cancelled" },
      { id: "c", status: "approved" },
      { id: "d", status: "expired" },
    ]);
    const r = await applyPaymentToEnrollments(t as never, "pay-1", paidAt);
    expect(r.transitioned.map((e) => e.id)).toEqual(["a", "c"]);
    expect(r.stale.map((e) => `${e.id}:${e.status}`)).toEqual([
      "b:cancelled",
      "d:expired",
    ]);
    expect(t.enrollment.updateMany).toHaveBeenCalledWith({
      where: { id: "a", status: { in: ["pending", "approved"] } },
      data: { status: "paid", paidAt },
    });
    expect(t.classRegistration.upsert).toHaveBeenCalledTimes(2);
  });

  it("stale 등록이 있어도 명단을 해지하지 않는다 — 배치된 좌석 보존", async () => {
    const t = tx([{ id: "b", status: "cancelled" }]);
    await applyPaymentToEnrollments(t as never, "pay-1", paidAt);
    expect(t.classRegistration.updateMany).not.toHaveBeenCalled();
    expect(t.classRegistration.upsert).not.toHaveBeenCalled();
  });

  describe("대회 참가 등록 전이", () => {
    it("PENDING 만 PAID 로, 취소된 등록은 stale — 취소가 무효화되지 않는다", async () => {
      const t = tx([], {
        tournamentRows: [
          { id: "t1", paymentStatus: "PENDING" },
          { id: "t2", paymentStatus: "CANCELLED" },
        ],
      });
      const r = await applyPaymentToTournamentRegistrations(
        t as never,
        "pay-1",
      );
      expect(r.transitioned.map((x) => x.id)).toEqual(["t1"]);
      expect(r.stale.map((x) => `${x.id}:${x.paymentStatus}`)).toEqual([
        "t2:CANCELLED",
      ]);
      expect(t.tournamentRegistration.updateMany).toHaveBeenCalledWith({
        where: { id: "t1", paymentStatus: { in: ["PENDING"] } },
        data: { paymentStatus: "PAID" },
      });
    });

    it("연결된 대회 등록이 없으면 전이·stale 모두 없음", async () => {
      const t = tx([]);
      const r = await applyPaymentToTournamentRegistrations(
        t as never,
        "pay-1",
      );
      expect(r.transitioned).toEqual([]);
      expect(r.stale).toEqual([]);
    });
  });

  describe("고아 판정", () => {
    const prepaid = { classId: "class-1", billingTiming: "PREPAID" };
    const call = (over: Partial<Parameters<typeof isOrphanPayment>[0]>) =>
      isOrphanPayment({
        product: prepaid,
        enrollments: noTransition,
        tournaments: noTransition,
        linkedBillingLines: 0,
        ...over,
      });

    it("선불 수업 상품 + 청구 라인 없음 + 전이 0건이면 고아", () => {
      expect(call({})).toBe(true);
    });

    it("상품·대회 어느 쪽에도 연결되지 않은 결제는 고아가 아니다", () => {
      expect(call({ product: null })).toBe(false);
      expect(
        call({ product: { classId: null, billingTiming: "PREPAID" } }),
      ).toBe(false);
    });

    it("후불 정산 결제(청구 라인 연결)·후불 상품은 고아가 아니다", () => {
      expect(call({ linkedBillingLines: 1 })).toBe(false);
      expect(
        call({ product: { classId: "class-1", billingTiming: "POSTPAID" } }),
      ).toBe(false);
    });

    it("전이된 등록이 있으면 고아가 아니다", () => {
      expect(
        call({
          enrollments: {
            transitioned: [{ id: "a", classId: "class-1", childId: "c" }],
            stale: [],
          },
        }),
      ).toBe(false);
    });

    it("대회 결제 — 연결 등록이 취소돼 전이 0건이면 고아(수업 상품 없음)", () => {
      expect(
        call({
          product: null,
          tournaments: {
            transitioned: [],
            stale: [
              {
                id: "t2",
                tournamentId: "tour-1",
                childId: "child-1",
                paymentStatus: "CANCELLED",
              },
            ],
          },
        }),
      ).toBe(true);
    });

    it("대회 결제 — 정상 전이되면 고아가 아니다", () => {
      expect(
        call({
          product: null,
          tournaments: {
            transitioned: [
              { id: "t1", tournamentId: "tour-1", childId: "child-1" },
            ],
            stale: [],
          },
        }),
      ).toBe(false);
    });
  });

  it("환불 요청 자동 접수 — pending · CLASS_PREPAID · 팀 스코프 · 전액", async () => {
    const t = tx([]);
    const id = await recordOrphanPaymentRefundRequest(t as never, {
      paymentId: "pay-1",
      payerUserId: "parent-1",
      amount: 80000,
      classId: "class-1",
      tournamentId: null,
      childId: "child-1",
    });
    expect(id).toBe("rr-new");
    expect(t.refundRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentId: "pay-1",
          requesterId: "parent-1",
          sourceType: "CLASS_PREPAID",
          classId: "class-1",
          tournamentId: null,
          teamId: "team-1",
          status: "pending",
          requestedAmount: 80000,
        }),
      }),
    );
  });

  it("대회 고아 결제 — TOURNAMENT 스코프로 접수(주최 팀 스냅샷)", async () => {
    const t = tx([]);
    const id = await recordOrphanPaymentRefundRequest(t as never, {
      paymentId: "pay-2",
      payerUserId: "parent-1",
      amount: 30000,
      classId: null,
      tournamentId: "tour-1",
      childId: "child-1",
    });
    expect(id).toBe("rr-new");
    expect(t.refundRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: "TOURNAMENT",
          classId: null,
          tournamentId: "tour-1",
          teamId: "team-9",
          academyId: null,
        }),
      }),
    );
  });

  it("수업·대회 어느 스코프도 없으면 접수하지 않는다", async () => {
    const t = tx([]);
    const id = await recordOrphanPaymentRefundRequest(t as never, {
      paymentId: "pay-3",
      payerUserId: "parent-1",
      amount: 10000,
      classId: null,
      tournamentId: null,
      childId: null,
    });
    expect(id).toBeNull();
    expect(t.refundRequest.create).not.toHaveBeenCalled();
  });

  it("활성 환불 요청이 이미 있으면 생성하지 않고 null", async () => {
    const t = tx([], { activeRefund: true });
    const id = await recordOrphanPaymentRefundRequest(t as never, {
      paymentId: "pay-1",
      payerUserId: "parent-1",
      amount: 80000,
      classId: "class-1",
      tournamentId: null,
      childId: null,
    });
    expect(id).toBeNull();
    expect(t.refundRequest.create).not.toHaveBeenCalled();
  });

  it("고아 자동 접수 식별 — 접수 시 기록한 사유로 판정", () => {
    expect(
      isOrphanAutoRefundRequest({
        requestReason: ORPHAN_PAYMENT_REFUND_REASON,
      }),
    ).toBe(true);
    expect(isOrphanAutoRefundRequest({ requestReason: "개인 사정" })).toBe(
      false,
    );
    expect(isOrphanAutoRefundRequest({})).toBe(false);
  });
});
