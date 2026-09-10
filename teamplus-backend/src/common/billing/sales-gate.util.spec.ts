import {
  assertClassOnSale,
  filterSellableProducts,
  SALES_GATE_MESSAGES,
} from "./sales-gate.util";

/** [§4-6] 판매 게이트 — 판매 중인 달 집합 기반 필터·가드 계약. */
describe("sales-gate.util (§4-6)", () => {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()),
  );
  const monthStart = (offset: number) =>
    new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() + offset, 1));
  const thisMonth = monthStart(0);
  const nextMonth = monthStart(1);
  const monthAfterNext = monthStart(2);

  describe("filterSellableProducts", () => {
    it("billingMonth null(무월 레거시)은 항상 통과", () => {
      const result = filterSellableProducts(
        [{ billingMonth: null, id: "legacy" }],
        [thisMonth],
      );
      expect(result.map((p) => p.id)).toEqual(["legacy"]);
    });

    it("billingMonth 가 집합에 포함되면 통과", () => {
      const result = filterSellableProducts(
        [
          { billingMonth: thisMonth, id: "cur" },
          { billingMonth: nextMonth, id: "next" },
        ],
        [thisMonth, nextMonth],
      );
      expect(result.map((p) => p.id)).toEqual(["cur", "next"]);
    });

    it("billingMonth 가 집합에 없으면 제외", () => {
      const result = filterSellableProducts(
        [{ billingMonth: monthAfterNext, id: "future" }],
        [thisMonth, nextMonth],
      );
      expect(result).toEqual([]);
    });

    it("sellableMonths 가 null/undefined 이면 무월만 통과", () => {
      const result = filterSellableProducts(
        [
          { billingMonth: null, id: "legacy" },
          { billingMonth: thisMonth, id: "cur" },
        ],
        null,
      );
      expect(result.map((p) => p.id)).toEqual(["legacy"]);
    });
  });

  describe("assertClassOnSale", () => {
    const mkPrisma = (klass: unknown) => ({
      class: { findUnique: jest.fn().mockResolvedValue(klass) },
    });

    it("존재하지 않는 수업 → 400", async () => {
      const prisma = mkPrisma(null);
      await expect(assertClassOnSale(prisma, "class-1")).rejects.toThrow(
        "수업 정보를 찾을 수 없습니다.",
      );
    });

    it("ENDED → 400", async () => {
      const prisma = mkPrisma({
        endedAt: today,
        salesOpenMonth: thisMonth,
        trainingType: "regular",
        schedules: [{ scheduledDate: today }],
      });
      await expect(assertClassOnSale(prisma, "class-1")).rejects.toThrow(
        SALES_GATE_MESSAGES.ENDED,
      );
    });

    it("PENDING_SCHEDULE(승인 안 됨) → 400", async () => {
      const prisma = mkPrisma({
        endedAt: null,
        salesOpenMonth: null,
        trainingType: "regular",
        schedules: [{ scheduledDate: today }],
      });
      await expect(assertClassOnSale(prisma, "class-1")).rejects.toThrow(
        SALES_GATE_MESSAGES.PENDING,
      );
    });

    it("ON_SALE 이지만 판매 중인 달이 빈 집합(방학 달) → 400", async () => {
      // salesOpenMonth = 다음 달(유효 상태 ON_SALE) 이지만 잔여 일정이 다다음달뿐이라
      //   [오늘 달, 다음 달] 교집합이 비어 있는 경우 (§4-6 방학 달 시나리오).
      const prisma = mkPrisma({
        endedAt: null,
        salesOpenMonth: nextMonth,
        trainingType: "regular",
        schedules: [{ scheduledDate: monthAfterNext }],
      });
      await expect(assertClassOnSale(prisma, "class-1")).rejects.toThrow(
        SALES_GATE_MESSAGES.PENDING,
      );
    });

    it("ON_SALE + 판매 중인 두 달 → sellableMonths·primaryMonth 반환", async () => {
      const prisma = mkPrisma({
        endedAt: null,
        salesOpenMonth: nextMonth,
        trainingType: "regular",
        schedules: [{ scheduledDate: today }, { scheduledDate: nextMonth }],
      });
      const result = await assertClassOnSale(prisma, "class-1");
      expect(result.lifecycle.state).toBe("ON_SALE");
      expect(result.sellableMonths.map((m) => m.getTime())).toEqual([
        thisMonth.getTime(),
        nextMonth.getTime(),
      ]);
      expect(result.primaryMonth.getTime()).toBe(thisMonth.getTime());
    });
  });
});
