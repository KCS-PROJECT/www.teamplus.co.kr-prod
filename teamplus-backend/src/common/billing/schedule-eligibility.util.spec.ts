import {
  monthsInRange,
  scheduleEligibleClassFilter,
  scheduleVisibleChildIds,
} from "./schedule-eligibility.util";

describe("schedule-eligibility.util — monthsInRange", () => {
  it("단일 월 범위(같은 달의 1일~말일)는 그 달 하나만 반환", () => {
    const start = new Date(Date.UTC(2026, 8, 1)); // 2026-09-01
    const end = new Date(Date.UTC(2026, 8, 30)); // 2026-09-30 (같은 달, inclusive 스타일 사용도 안전)
    expect(monthsInRange(start, end).map((d) => d.toISOString())).toEqual([
      new Date(Date.UTC(2026, 8, 1)).toISOString(),
    ]);
  });

  it("두 달에 걸친 exclusive 범위는 두 달 모두 포함", () => {
    const start = new Date(Date.UTC(2026, 8, 25)); // 2026-09-25
    const end = new Date(Date.UTC(2026, 9, 5)); // 2026-10-05 (exclusive)
    expect(monthsInRange(start, end)).toEqual([
      new Date(Date.UTC(2026, 8, 1)),
      new Date(Date.UTC(2026, 9, 1)),
    ]);
  });

  it("1년 범위는 12개월 전부 반환", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2027, 0, 1)); // exclusive
    const months = monthsInRange(start, end);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual(new Date(Date.UTC(2026, 0, 1)));
    expect(months[11]).toEqual(new Date(Date.UTC(2026, 11, 1)));
  });
});

describe("schedule-eligibility.util — scheduleEligibleClassFilter", () => {
  it("childId·복수월 자격 조건을 enrollments.some 로 합성한다", () => {
    const months = [new Date(Date.UTC(2026, 8, 1)), new Date(Date.UTC(2026, 9, 1))];
    const filter = scheduleEligibleClassFilter(["child-1"], months);
    expect(filter).toEqual({
      enrollments: {
        some: {
          childId: { in: ["child-1"] },
          billingMonth: { in: months },
          OR: [
            { billingTiming: "PREPAID", status: "paid" },
            { billingTiming: "POSTPAID", status: { in: ["approved", "paid"] } },
          ],
        },
      },
    });
  });
});

describe("schedule-eligibility.util — scheduleVisibleChildIds", () => {
  it("등록·자격·조회범위 세 집합의 교집합만 반환", () => {
    const result = scheduleVisibleChildIds(
      ["c1", "c2", "c3"],
      ["c1", "c3"],
      ["c1", "c2"],
    );
    expect(result).toEqual(["c1"]);
  });

  it("중복 registrationUserIds 는 한 번만 반환", () => {
    const result = scheduleVisibleChildIds(["c1", "c1"], ["c1"], ["c1"]);
    expect(result).toEqual(["c1"]);
  });
});
