import { hasOtherValidEnrollment } from "./roster-retention.util";
import { addUtcMonths } from "@/common/utils/kst-date.util";

/**
 * 명단 유지 판정 — 취소·환불로 등록 하나가 끝날 때 같은 자녀의 다른 등록이 명단을 지키는지.
 *  · 후불·결정 불능(NULL): 활성(approved·paid)이면 유지 — 월 만료 없는 구독형.
 *  · 스팟: paid 면 유지 — 일정 1회라 월 귀속 개념이 없다.
 *  · 월 정기 선불: 이번 달 또는 다음 달(판매 창) 자격이면 유지.
 */
describe("roster-retention.util — hasOtherValidEnrollment", () => {
  const classId = "class-1";
  const childId = "child-1";

  // 결정론적 기준일 — 실제 오늘과 무관하게 고정(다른 순수 함수 spec과 동일 관례).
  const todayMonth = new Date(Date.UTC(2026, 8, 1)); // 2026-09
  const nextMonth = addUtcMonths(todayMonth, 1);
  const twoMonthsAgo = addUtcMonths(todayMonth, -2);

  type Row = Record<string, unknown>;

  function db(
    cls: { trainingType?: string | null } | null,
    rows: Row[],
  ) {
    return {
      class: {
        findUnique: jest.fn().mockResolvedValue(
          cls === null ? null : { trainingType: cls.trainingType ?? "regular" },
        ),
      },
      enrollment: { findMany: jest.fn().mockResolvedValue(rows) },
    };
  }

  const monthlyPaidRow = (billingMonth: Date | null): Row => ({
    id: "enr-other",
    status: "paid",
    billingMonth,
    billingTiming: "PREPAID",
  });

  const call = (d: ReturnType<typeof db>, exclude: string[] = ["enr-target"]) =>
    hasOtherValidEnrollment(
      d as never,
      { classId, childId, excludeEnrollmentIds: exclude },
      todayMonth,
    );

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
    const d = db({}, [
      { id: "enr-other", status: "approved", billingMonth: null, billingTiming: "POSTPAID" },
    ]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("결정 불능(billingTiming NULL) 행은 보수적으로 유지", async () => {
    const d = db({}, [
      { id: "enr-other", status: "paid", billingMonth: null, billingTiming: null },
    ]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("스팟 수업의 paid 등록은 월 귀속과 무관하게 유지", async () => {
    const d = db({ trainingType: "spot" }, [monthlyPaidRow(twoMonthsAgo)]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("월 정기 — 귀속월이 이번 달이면 유지", async () => {
    const d = db({}, [monthlyPaidRow(todayMonth)]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("월 정기 — 귀속월이 다음 달이면 유지(판매 창)", async () => {
    const d = db({}, [monthlyPaidRow(nextMonth)]);
    await expect(call(d)).resolves.toBe(true);
  });

  it("월 정기 — 귀속월이 지난 달이면 해지(만료 이력)", async () => {
    const d = db({}, [monthlyPaidRow(twoMonthsAgo)]);
    await expect(call(d)).resolves.toBe(false);
  });

  it("월 정기 — approved(결제 대기)는 자격이 아니므로 해지", async () => {
    const d = db({}, [
      { id: "enr-other", status: "approved", billingMonth: todayMonth, billingTiming: "PREPAID" },
    ]);
    await expect(call(d)).resolves.toBe(false);
  });

  it("유효한 행이 하나라도 있으면 유지 — 만료 이력과 현재 수강이 섞여도", async () => {
    const d = db({}, [monthlyPaidRow(twoMonthsAgo), monthlyPaidRow(todayMonth)]);
    await expect(call(d)).resolves.toBe(true);
  });
});
