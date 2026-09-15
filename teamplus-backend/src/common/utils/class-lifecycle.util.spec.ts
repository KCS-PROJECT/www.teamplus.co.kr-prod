import {
  deriveClassLifecycle,
  computeSellableMonths,
  computeNextSalesMonth,
  computeSalesWindow,
  type ClassLifecycleInput,
} from "./class-lifecycle.util";

/**
 * [§4-6] 판매 창 2개월 — 유효 상태(ON_SALE)와 판매 중인 달을 분리한 계약.
 * 날짜 픽스처는 실행 시점(KST) 기준 동적 산출 — 고정 연월은 달이 바뀌는 순간
 * "이번 달/다음 달" 전제가 깨진다 (repo 관행, classes.service.spec.ts 와 동일 패턴).
 */
describe("class-lifecycle.util (§4-6)", () => {
  // kstTodayUtcMidnight() 과 동일 산식 — 같은 순간에 계산하므로 자정 경계를 넘나드는
  //   극히 드문 레이스를 제외하면 피시험 함수와 항상 같은 "오늘"을 본다.
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()),
  );
  const monthStart = (offset: number) =>
    new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() + offset, 1));
  const thisMonth = monthStart(0);
  const nextMonth = monthStart(1);
  const monthAfterNext = monthStart(2);
  const lastMonth = monthStart(-1);

  const base = (
    overrides: Partial<ClassLifecycleInput>,
  ): ClassLifecycleInput => ({
    endedAt: null,
    salesOpenMonth: null,
    trainingType: "regular",
    schedules: [],
    ...overrides,
  });

  describe("deriveClassLifecycle — ON_SALE 은 salesOpenMonth ≥ 오늘 달로만 판정", () => {
    it("오늘 달 = salesOpenMonth, 잔여 일정 있음 → ON_SALE", () => {
      const result = deriveClassLifecycle(
        base({ salesOpenMonth: thisMonth, schedules: [{ scheduledDate: today }] }),
      );
      expect(result.state).toBe("ON_SALE");
      expect(result.pendingReason).toBeNull();
      expect(result.earliestRemainingMonth?.getTime()).toBe(thisMonth.getTime());
    });

    it("다음 달 판매 이미 시작 + 이번 달 잔여 일정(특강) → ON_SALE 유지 (구 `earliest==` 비교 폐기 확인)", () => {
      const result = deriveClassLifecycle(
        base({
          salesOpenMonth: nextMonth,
          schedules: [{ scheduledDate: today }],
        }),
      );
      expect(result.state).toBe("ON_SALE");
      expect(result.earliestRemainingMonth?.getTime()).toBe(thisMonth.getTime());
    });

    it("과거 달 salesOpenMonth(갱신 필요) → PENDING_SCHEDULE/UNAPPROVED_MONTH", () => {
      const result = deriveClassLifecycle(
        base({ salesOpenMonth: lastMonth, schedules: [{ scheduledDate: today }] }),
      );
      expect(result.state).toBe("PENDING_SCHEDULE");
      expect(result.pendingReason).toBe("UNAPPROVED_MONTH");
    });

    it("salesOpenMonth null, 잔여 일정 있음 → PENDING_SCHEDULE/UNAPPROVED_MONTH", () => {
      const result = deriveClassLifecycle(
        base({ salesOpenMonth: null, schedules: [{ scheduledDate: today }] }),
      );
      expect(result.state).toBe("PENDING_SCHEDULE");
      expect(result.pendingReason).toBe("UNAPPROVED_MONTH");
    });

    it("잔여 일정 없음 → PENDING_SCHEDULE/NO_SCHEDULE (salesOpenMonth 무관)", () => {
      const result = deriveClassLifecycle(
        base({ salesOpenMonth: thisMonth, schedules: [] }),
      );
      expect(result.state).toBe("PENDING_SCHEDULE");
      expect(result.pendingReason).toBe("NO_SCHEDULE");
      expect(result.earliestRemainingMonth).toBeNull();
    });

    it("endedAt 있으면 최우선 ENDED", () => {
      const result = deriveClassLifecycle(
        base({
          endedAt: lastMonth,
          salesOpenMonth: thisMonth,
          schedules: [{ scheduledDate: today }],
        }),
      );
      expect(result.state).toBe("ENDED");
    });

    it("spot — 잔여 일정 있으면 승인 사이클 없이 ON_SALE", () => {
      const result = deriveClassLifecycle(
        base({
          trainingType: "spot",
          salesOpenMonth: null,
          schedules: [{ scheduledDate: nextMonth }],
        }),
      );
      expect(result.state).toBe("ON_SALE");
    });

    it("spot — 잔여 없고 과거 이력 있으면 ENDED", () => {
      const result = deriveClassLifecycle(
        base({ trainingType: "spot", schedules: [], hadAnySchedule: true }),
      );
      expect(result.state).toBe("ENDED");
    });

    it("spot — 이력 자체 없으면 PENDING_SCHEDULE/NO_SCHEDULE", () => {
      const result = deriveClassLifecycle(
        base({ trainingType: "spot", schedules: [], hadAnySchedule: false }),
      );
      expect(result.state).toBe("PENDING_SCHEDULE");
      expect(result.pendingReason).toBe("NO_SCHEDULE");
    });
  });

  describe("computeSellableMonths", () => {
    it("두 달(진행 중인 달 + 다음 달) 모두 판매 중이면 오름차순 두 달 반환", () => {
      const months = computeSellableMonths(
        base({
          salesOpenMonth: nextMonth,
          schedules: [{ scheduledDate: today }, { scheduledDate: nextMonth }],
        }),
      );
      expect(months.map((m) => m.getTime())).toEqual([
        thisMonth.getTime(),
        nextMonth.getTime(),
      ]);
    });

    it("유효 상태가 ON_SALE 이 아니면 빈 배열", () => {
      const months = computeSellableMonths(
        base({ salesOpenMonth: null, schedules: [{ scheduledDate: today }] }),
      );
      expect(months).toEqual([]);
    });

    it("과거 일정은 판매 중인 달 집합에서 제외", () => {
      const months = computeSellableMonths(
        base({
          salesOpenMonth: thisMonth,
          schedules: [{ scheduledDate: lastMonth }, { scheduledDate: today }],
        }),
      );
      expect(months.map((m) => m.getTime())).toEqual([thisMonth.getTime()]);
    });

    it("spot — salesOpenMonth 상한 없이 잔여 일정 달 전부", () => {
      const months = computeSellableMonths(
        base({
          trainingType: "spot",
          salesOpenMonth: null,
          schedules: [
            { scheduledDate: nextMonth },
            { scheduledDate: monthAfterNext },
          ],
        }),
      );
      expect(months.map((m) => m.getTime())).toEqual([
        nextMonth.getTime(),
        monthAfterNext.getTime(),
      ]);
    });
  });

  describe("computeNextSalesMonth", () => {
    it("하한 = salesOpenMonth+1 이 오늘 달보다 크면 그 달을 후보로", () => {
      const candidate = computeNextSalesMonth(
        base({
          salesOpenMonth: thisMonth,
          schedules: [{ scheduledDate: nextMonth }],
        }),
      );
      expect(candidate?.getTime()).toBe(nextMonth.getTime());
    });

    it("상한(오늘 달+1) 초과 일정만 있으면 후보 없음", () => {
      const candidate = computeNextSalesMonth(
        base({ salesOpenMonth: null, schedules: [{ scheduledDate: monthAfterNext }] }),
      );
      expect(candidate).toBeNull();
    });

    it("빈 달은 건너뛰고 일정 있는 가장 이른 달을 반환", () => {
      const candidate = computeNextSalesMonth(
        base({ salesOpenMonth: null, schedules: [{ scheduledDate: nextMonth }] }),
      );
      // 하한(오늘 달)에는 일정이 없고 다음 달에만 있음 — 다음 달로 건너뜀.
      expect(candidate?.getTime()).toBe(nextMonth.getTime());
    });

    it("하한보다 과거인 달의 일정은 후보에서 제외", () => {
      const candidate = computeNextSalesMonth(
        base({
          salesOpenMonth: monthStart(-2),
          schedules: [{ scheduledDate: lastMonth }],
        }),
      );
      // 하한 = max(오늘 달, salesOpenMonth+1) = 오늘 달(더 큼) — lastMonth 는 하한 미만.
      expect(candidate).toBeNull();
    });

    it("spot 은 판매 승인 사이클이 없어 항상 null", () => {
      const candidate = computeNextSalesMonth(
        base({ trainingType: "spot", schedules: [{ scheduledDate: nextMonth }] }),
      );
      expect(candidate).toBeNull();
    });

    it("이번 달 회차가 전부 경과 + 다음 달 회차만 남음 → 후보 = 다음 달(이번 달 아님)", () => {
      // 과거 회차(이번 달, 이미 지남)가 monthKeys 에 섞여 들어가 하한(오늘 달)과
      // 우연히 일치하면 "이미 지난 이번 달"이 후보로 잘못 뽑히던 버그(§4-6 재검토) 회귀 테스트.
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const candidate = computeNextSalesMonth(
        base({
          salesOpenMonth: null,
          schedules: [
            { scheduledDate: yesterday }, // 이번 달, 이미 경과
            { scheduledDate: nextMonth },
          ],
        }),
      );
      expect(candidate?.getTime()).toBe(nextMonth.getTime());
    });
  });

  describe("computeSalesWindow — lifecycle·sellableMonths·nextSalesMonth 단일 계산", () => {
    it("computeSellableMonths/computeNextSalesMonth 와 동일한 값을 한 번에 반환", () => {
      const input = base({
        salesOpenMonth: nextMonth,
        schedules: [{ scheduledDate: today }, { scheduledDate: nextMonth }],
      });
      const window = computeSalesWindow(input);
      expect(window.lifecycle).toEqual(deriveClassLifecycle(input));
      expect(window.sellableMonths.map((m) => m.getTime())).toEqual(
        computeSellableMonths(input).map((m) => m.getTime()),
      );
      expect(window.nextSalesMonth?.getTime()).toEqual(
        computeNextSalesMonth(input)?.getTime(),
      );
    });

    it("sellableMonthKeys·nextSalesMonthKey 는 YYYY-MM 문자열", () => {
      const window = computeSalesWindow(
        base({
          salesOpenMonth: nextMonth,
          schedules: [{ scheduledDate: today }, { scheduledDate: nextMonth }],
        }),
      );
      const toYm = (d: Date) =>
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      expect(window.sellableMonthKeys).toEqual([
        toYm(thisMonth),
        toYm(nextMonth),
      ]);
      expect(window.nextSalesMonthKey).toBeNull(); // 이미 ON_SALE — 다음 후보 없음(상한 초과)
    });
  });
});
