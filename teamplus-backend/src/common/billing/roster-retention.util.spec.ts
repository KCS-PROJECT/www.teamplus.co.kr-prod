import { hasOtherValidEnrollment } from "./roster-retention.util";

/**
 * 명단 유지 판정 — 취소·환불로 등록 하나가 끝날 때 같은 자녀의 다른 등록이 명단을 지키는지.
 *  · 후불: 활성(approved·paid)이면 유지 — 월 만료 없는 구독형.
 *  · 스팟: paid 면 유지 — 일정 1회라 월 귀속 개념이 없다.
 *  · 월 정기 선불: 귀속월이 판매월의 직전 달 이상일 때만 유지(판매 시작 해제 로직과 같은 기준).
 */
describe("roster-retention.util — hasOtherValidEnrollment", () => {
  const classId = "class-1";
  const childId = "child-1";

  type Row = Record<string, unknown>;

  function db(
    cls: {
      billingMode?: string;
      trainingType?: string | null;
      salesOpenMonth?: Date | null;
    } | null,
    rows: Row[],
  ) {
    return {
      class: {
        findUnique: jest.fn().mockResolvedValue(
          cls === null
            ? null
            : {
                billingMode: cls.billingMode ?? "PREPAID",
                trainingType: cls.trainingType ?? "regular",
                salesOpenMonth: cls.salesOpenMonth ?? null,
              },
        ),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue(rows) },
    };
  }

  /** 월 정기 선불 결제 행 — 귀속월은 상품 billingMonth 기준. */
  const monthlyPaidRow = (year: number, month: number): Row => ({
    id: "enr-other",
    status: "paid",
    paidAt: new Date(Date.UTC(year, month - 1, 1)),
    product: {
      billingTiming: "PREPAID",
      feeType: "MONTHLY_FIXED",
      billingMonth: new Date(Date.UTC(year, month - 1, 1)),
      price: 100000,
    },
    payment: {
      amount: 100000,
      paymentStatus: "completed",
      completedAt: new Date(Date.UTC(year, month - 1, 1)),
      createdAt: new Date(Date.UTC(year, month - 1, 1)),
      refundLogs: [],
    },
  });

  const call = (d: ReturnType<typeof db>, exclude: string[] = ["enr-target"]) =>
    hasOtherValidEnrollment(d as never, {
      classId,
      childId,
      excludeEnrollmentIds: exclude,
    });

  it("다른 등록이 없으면 false — 명단을 해지한다", async () => {
    const d = db({}, []);
    await expect(call(d)).resolves.toBe(false);
  });

  it("수업이 없으면 false", async () => {
    const d = db(null, []);
    await expect(call(d)).resolves.toBe(false);
  });

  it("취소·환불 대상 등록은 판정에서 제외한다", async () => {
    const d = db({}, []);
    await call(d, ["enr-a", "enr-b"]);
    expect(d.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { notIn: ["enr-a", "enr-b"] },
          status: { in: ["paid", "approved"] },
        }),
      }),
    );
  });

  it("제외 목록이 비면 필터 없이 모든 등록을 후보로 본다", async () => {
    const d = db({}, []);
    await call(d, []);
    const where = (d.enrollment.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where).not.toHaveProperty("id");
  });

  it("후불 수업의 approved 등록은 유지 — 월 만료가 없다", async () => {
    const d = db({ billingMode: "POSTPAID" }, [
      {
        id: "enr-other",
        status: "approved",
        paidAt: null,
        product: null,
        payment: null,
      },
    ]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("선불 수업이라도 후불 상품 등록이면 유지", async () => {
    const d = db({ billingMode: "BOTH" }, [
      {
        id: "enr-other",
        status: "paid",
        paidAt: new Date(),
        product: {
          billingTiming: "POSTPAID",
          feeType: "PER_SESSION",
          billingMonth: null,
          price: 0,
        },
        payment: null,
      },
    ]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("스팟 수업의 paid 등록은 월 귀속과 무관하게 유지", async () => {
    const d = db(
      { trainingType: "spot", salesOpenMonth: new Date(Date.UTC(2026, 8, 1)) },
      [monthlyPaidRow(2026, 1)], // 훨씬 지난 달 결제여도 스팟은 유지
    );
    await expect(call(d)).resolves.toBe(true);
  });

  it("월 정기 — 귀속월이 판매월의 직전 달이면 유지", async () => {
    const d = db({ salesOpenMonth: new Date(Date.UTC(2026, 8, 1)) }, [
      monthlyPaidRow(2026, 8),
    ]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("월 정기 — 귀속월이 판매월과 같으면 유지", async () => {
    const d = db({ salesOpenMonth: new Date(Date.UTC(2026, 8, 1)) }, [
      monthlyPaidRow(2026, 9),
    ]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("월 정기 — 귀속월이 직전 달보다 이전이면 해지(만료 이력)", async () => {
    const d = db({ salesOpenMonth: new Date(Date.UTC(2026, 8, 1)) }, [
      monthlyPaidRow(2026, 6),
    ]);
    await expect(call(d)).resolves.toBe(false);
  });

  it("월 경계 — 1월 판매월의 직전 달은 전년 12월", async () => {
    const d = db({ salesOpenMonth: new Date(Date.UTC(2026, 0, 1)) }, [
      monthlyPaidRow(2025, 12),
    ]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("판매 시작 전(salesOpenMonth 없음)이면 월 조건 없이 유지", async () => {
    const d = db({ salesOpenMonth: null }, [monthlyPaidRow(2020, 1)]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("환불된 결제 행은 유효로 치지 않는다", async () => {
    const row = monthlyPaidRow(2026, 9);
    (row.payment as Record<string, unknown>).paymentStatus = "refunded";
    const d = db({ salesOpenMonth: new Date(Date.UTC(2026, 8, 1)) }, [row]);
    await expect(call(d)).resolves.toBe(false);
  });

  it("취소된 결제 행도 유효로 치지 않는다", async () => {
    const row = monthlyPaidRow(2026, 9);
    (row.payment as Record<string, unknown>).paymentStatus = "cancelled";
    const d = db({ salesOpenMonth: new Date(Date.UTC(2026, 8, 1)) }, [row]);
    await expect(call(d)).resolves.toBe(false);
  });

  it("유효한 행이 하나라도 있으면 유지 — 만료 이력과 현재 수강이 섞여도", async () => {
    const d = db({ salesOpenMonth: new Date(Date.UTC(2026, 8, 1)) }, [
      monthlyPaidRow(2026, 3),
      monthlyPaidRow(2026, 9),
    ]);
    await expect(call(d)).resolves.toBe(true);
  });
});
