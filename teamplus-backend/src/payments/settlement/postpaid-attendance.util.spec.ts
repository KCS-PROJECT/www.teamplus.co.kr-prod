import { BadRequestException } from "@nestjs/common";
import {
  type PostpaidAttendanceDb,
  POSTPAID_PRICE_LOCK_MESSAGE,
  SETTLED_MONTH_MESSAGE,
  monthRangeUtc,
  aggregatePostpaidAttendance,
  findUnsettledPostpaidMonths,
  assertPostpaidUnitPriceMutable,
  assertScheduleMonthNotSettled,
} from "./postpaid-attendance.util";

type MockDb = {
  classSchedule: { findMany: jest.Mock; findUnique: jest.Mock };
  class: { findUnique: jest.Mock };
  enrollment: { findMany: jest.Mock };
  monthlyPostpaidBilling: { findMany: jest.Mock; findUnique: jest.Mock };
};

const createMockDb = (): MockDb => ({
  classSchedule: { findMany: jest.fn(), findUnique: jest.fn() },
  class: { findUnique: jest.fn() },
  enrollment: { findMany: jest.fn() },
  monthlyPostpaidBilling: { findMany: jest.fn(), findUnique: jest.fn() },
});

const asDb = (db: MockDb) => db as unknown as PostpaidAttendanceDb;

const sched = (dateIso: string, memberIds: string[]) => ({
  scheduledDate: new Date(dateIso),
  attendances: memberIds.map((memberId) => ({ memberId })),
});

describe("monthRangeUtc — @db.Date UTC 반개구간 계약", () => {
  it("[월초 UTC 자정, 익월초 UTC 자정) 을 반환", () => {
    const { start, end } = monthRangeUtc("2026-07");
    expect(start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("연 경계(12월 → 익년 1월)도 정확", () => {
    const { end } = monthRangeUtc("2026-12");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("aggregatePostpaidAttendance", () => {
  it("비취소 일정 조건으로 조회하고 회원별 present 를 합산한다", async () => {
    const db = createMockDb();
    db.classSchedule.findMany.mockResolvedValue([
      sched("2026-07-01T00:00:00.000Z", ["m1", "m2"]),
      sched("2026-07-08T00:00:00.000Z", ["m1"]),
    ]);
    db.class.findUnique.mockResolvedValue({ billingMode: "POSTPAID" });

    const { start, end } = monthRangeUtc("2026-07");
    const counts = await aggregatePostpaidAttendance(
      asDb(db),
      "class-1",
      start,
      end,
    );

    expect(db.classSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classId: "class-1",
          isCancelled: false,
          scheduledDate: { gte: start, lt: end },
        }),
      }),
    );
    expect(counts.get("m1")).toBe(2);
    expect(counts.get("m2")).toBe(1);
  });

  it("POSTPAID 전용 수업은 enrollment 필터 없이 전원 유지", async () => {
    const db = createMockDb();
    db.classSchedule.findMany.mockResolvedValue([
      sched("2026-07-01T00:00:00.000Z", ["m1"]),
    ]);
    db.class.findUnique.mockResolvedValue({ billingMode: "POSTPAID" });

    const { start, end } = monthRangeUtc("2026-07");
    const counts = await aggregatePostpaidAttendance(
      asDb(db),
      "class-1",
      start,
      end,
    );

    expect(counts.size).toBe(1);
    expect(db.enrollment.findMany).not.toHaveBeenCalled();
  });

  it("BOTH 수업은 후불 상품 선택 학생만 남긴다 (선불 학생 이중청구 방지)", async () => {
    const db = createMockDb();
    db.classSchedule.findMany.mockResolvedValue([
      sched("2026-07-01T00:00:00.000Z", ["postpaidKid", "prepaidKid"]),
    ]);
    db.class.findUnique.mockResolvedValue({ billingMode: "BOTH" });
    db.enrollment.findMany.mockResolvedValue([{ childId: "postpaidKid" }]);

    const { start, end } = monthRangeUtc("2026-07");
    const counts = await aggregatePostpaidAttendance(
      asDb(db),
      "class-1",
      start,
      end,
    );

    expect([...counts.keys()]).toEqual(["postpaidKid"]);
    expect(db.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["approved", "paid"] },
          product: { billingTiming: "POSTPAID" },
        }),
      }),
    );
  });

  it("출석 0건이면 빈 Map — 수업/enrollment 조회도 생략", async () => {
    const db = createMockDb();
    db.classSchedule.findMany.mockResolvedValue([
      sched("2026-07-01T00:00:00.000Z", []),
    ]);

    const { start, end } = monthRangeUtc("2026-07");
    const counts = await aggregatePostpaidAttendance(
      asDb(db),
      "class-1",
      start,
      end,
    );

    expect(counts.size).toBe(0);
    expect(db.class.findUnique).not.toHaveBeenCalled();
  });
});

describe("findUnsettledPostpaidMonths", () => {
  it("출석 존재 월 중 confirmed 아닌 월만 오름차순 반환", async () => {
    const db = createMockDb();
    db.classSchedule.findMany.mockResolvedValue([
      sched("2026-07-05T00:00:00.000Z", ["m1"]),
      sched("2026-06-10T00:00:00.000Z", ["m1"]),
      sched("2026-05-03T00:00:00.000Z", ["m2"]),
    ]);
    db.class.findUnique.mockResolvedValue({ billingMode: "POSTPAID" });
    db.monthlyPostpaidBilling.findMany.mockResolvedValue([
      { yearMonth: "2026-05" },
    ]);

    const months = await findUnsettledPostpaidMonths(asDb(db), "class-1");

    expect(months).toEqual(["2026-06", "2026-07"]);
    expect(db.monthlyPostpaidBilling.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "confirmed" }),
      }),
    );
  });

  it("BOTH 수업에서 선불 학생 출석만 있는 월은 미정산으로 치지 않는다", async () => {
    const db = createMockDb();
    db.classSchedule.findMany.mockResolvedValue([
      sched("2026-06-10T00:00:00.000Z", ["prepaidKid"]),
      sched("2026-07-05T00:00:00.000Z", ["postpaidKid"]),
    ]);
    db.class.findUnique.mockResolvedValue({ billingMode: "BOTH" });
    db.enrollment.findMany.mockResolvedValue([{ childId: "postpaidKid" }]);
    db.monthlyPostpaidBilling.findMany.mockResolvedValue([]);

    const months = await findUnsettledPostpaidMonths(asDb(db), "class-1");

    expect(months).toEqual(["2026-07"]);
  });

  it("present 출석이 전혀 없으면 빈 배열 — billing 조회 생략", async () => {
    const db = createMockDb();
    db.classSchedule.findMany.mockResolvedValue([
      sched("2026-07-05T00:00:00.000Z", []),
    ]);

    const months = await findUnsettledPostpaidMonths(asDb(db), "class-1");

    expect(months).toEqual([]);
    expect(db.monthlyPostpaidBilling.findMany).not.toHaveBeenCalled();
  });
});

describe("assertScheduleMonthNotSettled — 정산 확정 월 출석 변경 거부 (P3-H1)", () => {
  it("해당 일정의 월 정산이 confirmed 면 거부", async () => {
    const db = createMockDb();
    db.classSchedule.findUnique.mockResolvedValue({
      classId: "class-1",
      scheduledDate: new Date("2026-06-10T00:00:00.000Z"),
    });
    db.monthlyPostpaidBilling.findUnique.mockResolvedValue({
      status: "confirmed",
    });

    await expect(
      assertScheduleMonthNotSettled(asDb(db), "sched-1"),
    ).rejects.toThrow(new BadRequestException(SETTLED_MONTH_MESSAGE));
    expect(db.monthlyPostpaidBilling.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classId_yearMonth: { classId: "class-1", yearMonth: "2026-06" },
        },
      }),
    );
  });

  it("정산 미확정(또는 청구 헤더 없음)이면 통과", async () => {
    const db = createMockDb();
    db.classSchedule.findUnique.mockResolvedValue({
      classId: "class-1",
      scheduledDate: new Date("2026-06-10T00:00:00.000Z"),
    });
    db.monthlyPostpaidBilling.findUnique.mockResolvedValue(null);

    await expect(
      assertScheduleMonthNotSettled(asDb(db), "sched-1"),
    ).resolves.toBeUndefined();
  });

  it("일정이 없으면 통과 (존재 검증은 호출부 몫)", async () => {
    const db = createMockDb();
    db.classSchedule.findUnique.mockResolvedValue(null);

    await expect(
      assertScheduleMonthNotSettled(asDb(db), "sched-x"),
    ).resolves.toBeUndefined();
    expect(db.monthlyPostpaidBilling.findUnique).not.toHaveBeenCalled();
  });
});

describe("assertPostpaidUnitPriceMutable — 단가 잠금 가드", () => {
  it("미정산 월 존재 시 월 목록을 담아 거부", async () => {
    const db = createMockDb();
    db.classSchedule.findMany.mockResolvedValue([
      sched("2026-07-05T00:00:00.000Z", ["m1"]),
    ]);
    db.class.findUnique.mockResolvedValue({ billingMode: "POSTPAID" });
    db.monthlyPostpaidBilling.findMany.mockResolvedValue([]);

    await expect(
      assertPostpaidUnitPriceMutable(asDb(db), "class-1"),
    ).rejects.toThrow(
      new BadRequestException(POSTPAID_PRICE_LOCK_MESSAGE(["2026-07"])),
    );
  });

  it("경과 월 전부 확정 + 당월 출석 0 이면 통과", async () => {
    const db = createMockDb();
    db.classSchedule.findMany.mockResolvedValue([
      sched("2026-06-10T00:00:00.000Z", ["m1"]),
    ]);
    db.class.findUnique.mockResolvedValue({ billingMode: "POSTPAID" });
    db.monthlyPostpaidBilling.findMany.mockResolvedValue([
      { yearMonth: "2026-06" },
    ]);

    await expect(
      assertPostpaidUnitPriceMutable(asDb(db), "class-1"),
    ).resolves.toBeUndefined();
  });
});
