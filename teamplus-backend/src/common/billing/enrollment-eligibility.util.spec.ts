import {
  eligibleChildIdsForClasses,
  eligibleChildIdsForMonth,
  eligibleEnrollmentWhere,
  eligibleEnrollmentWhereAnyOf,
  hasEligibleEnrollment,
  isEligibleForMonth,
} from "./enrollment-eligibility.util";

describe("enrollment-eligibility.util — isEligibleForMonth", () => {
  const month = new Date(Date.UTC(2026, 8, 1)); // 2026-09
  const otherMonth = new Date(Date.UTC(2026, 9, 1)); // 2026-10

  it("선불 approved 는 비자격 — 결제 대기는 자격이 아니다", () => {
    expect(
      isEligibleForMonth(
        { status: "approved", billingTiming: "PREPAID", billingMonth: month },
        month,
      ),
    ).toBe(false);
  });

  it("선불 paid 는 자격", () => {
    expect(
      isEligibleForMonth(
        { status: "paid", billingTiming: "PREPAID", billingMonth: month },
        month,
      ),
    ).toBe(true);
  });

  it("후불 approved 는 자격 — 감독 승인 없이 즉시 수강 중", () => {
    expect(
      isEligibleForMonth(
        { status: "approved", billingTiming: "POSTPAID", billingMonth: month },
        month,
      ),
    ).toBe(true);
  });

  it("후불 paid 도 자격", () => {
    expect(
      isEligibleForMonth(
        { status: "paid", billingTiming: "POSTPAID", billingMonth: month },
        month,
      ),
    ).toBe(true);
  });

  it("월 불일치는 비자격 — 결제 방식·상태가 맞아도 다른 달", () => {
    expect(
      isEligibleForMonth(
        { status: "paid", billingTiming: "PREPAID", billingMonth: otherMonth },
        month,
      ),
    ).toBe(false);
  });

  it("billingMonth NULL 은 비자격 — 결정 불능 행은 보수적으로 배제", () => {
    expect(
      isEligibleForMonth(
        { status: "paid", billingTiming: "PREPAID", billingMonth: null },
        month,
      ),
    ).toBe(false);
  });

  it("billingTiming NULL(결정 불능)은 비자격", () => {
    expect(
      isEligibleForMonth(
        { status: "paid", billingTiming: null, billingMonth: month },
        month,
      ),
    ).toBe(false);
  });

  it("후불이지만 cancelled 상태는 비자격", () => {
    expect(
      isEligibleForMonth(
        { status: "cancelled", billingTiming: "POSTPAID", billingMonth: month },
        month,
      ),
    ).toBe(false);
  });
});

describe("enrollment-eligibility.util — where 빌더", () => {
  const month = new Date(Date.UTC(2026, 8, 1));

  it("eligibleEnrollmentWhere — 단일 월 조건", () => {
    expect(eligibleEnrollmentWhere(month)).toEqual({
      billingMonth: month,
      OR: [
        { billingTiming: "PREPAID", status: "paid" },
        { billingTiming: "POSTPAID", status: { in: ["approved", "paid"] } },
      ],
    });
  });

  it("eligibleEnrollmentWhereAnyOf — 복수 월", () => {
    const next = new Date(Date.UTC(2026, 9, 1));
    expect(eligibleEnrollmentWhereAnyOf([month, next])).toEqual({
      billingMonth: { in: [month, next] },
      OR: [
        { billingTiming: "PREPAID", status: "paid" },
        { billingTiming: "POSTPAID", status: { in: ["approved", "paid"] } },
      ],
    });
  });

  it("eligibleEnrollmentWhereAnyOf — 빈 배열은 항상 불일치", () => {
    const where = eligibleEnrollmentWhereAnyOf([]) as Record<string, unknown>;
    expect(where).toEqual({ id: "__no_match__" });
  });
});

describe("enrollment-eligibility.util — DB 헬퍼", () => {
  const month = new Date(Date.UTC(2026, 8, 1));

  function dbWith(rows: Array<{ id?: string; childId?: string; classId?: string }>) {
    return {
      enrollment: {
        findFirst: jest.fn().mockResolvedValue(rows[0] ?? null),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
  }

  it("hasEligibleEnrollment — 매치 행 있으면 true", async () => {
    const db = dbWith([{ id: "enr-1" }]);
    await expect(
      hasEligibleEnrollment(db as never, "child-1", "class-1", month),
    ).resolves.toBe(true);
  });

  it("hasEligibleEnrollment — 매치 없으면 false", async () => {
    const db = dbWith([]);
    await expect(
      hasEligibleEnrollment(db as never, "child-1", "class-1", month),
    ).resolves.toBe(false);
  });

  it("eligibleChildIdsForMonth — childId 집합으로 축약", async () => {
    const db = dbWith([{ childId: "c1" }, { childId: "c2" }, { childId: "c1" }]);
    await expect(
      eligibleChildIdsForMonth(db as never, "class-1", month),
    ).resolves.toEqual(new Set(["c1", "c2"]));
  });

  it("eligibleChildIdsForClasses — 수업별 자격자 집합, 빈 결과도 키는 보존", async () => {
    const db = dbWith([
      { classId: "class-1", childId: "c1" },
      { classId: "class-2", childId: "c2" },
    ]);
    const result = await eligibleChildIdsForClasses(
      db as never,
      ["class-1", "class-2", "class-3"],
      month,
    );
    expect(result.get("class-1")).toEqual(new Set(["c1"]));
    expect(result.get("class-2")).toEqual(new Set(["c2"]));
    expect(result.get("class-3")).toEqual(new Set());
  });

  it("eligibleChildIdsForClasses — classIds 빈 배열이면 쿼리 없이 빈 맵", async () => {
    const db = dbWith([]);
    const result = await eligibleChildIdsForClasses(db as never, [], month);
    expect(result.size).toBe(0);
    expect(db.enrollment.findMany).not.toHaveBeenCalled();
  });
});
