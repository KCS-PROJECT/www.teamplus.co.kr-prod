import { Decimal } from "@prisma/client/runtime/library";
import { DirectorRevenueService } from "./director-revenue.service";
import { RevenueScope } from "./dto/director-revenue-query.dto";

/**
 * 작업 A BE-2 — director-revenue 대회 매출 집계 회귀 스펙.
 *
 * 증명 대상:
 *  1) 선불 대회 PAID → hero.prepaidRevenue·series[선택월].prepaid 증가.
 *  2) 후불 대회 BILLED → postpaidStatus.billed·outstanding·hero.outstanding 증가,
 *     PAID → postpaidStatus.collected·series.postpaid·hero.postpaidRevenue 증가, hasPostpaid true.
 *  3) 대회 없는 팀 → 기존 수치 불변(회귀), classRevenue 에 대회 라인 미출현.
 *
 * 팀 허브(computeTournamentSummaries)와 동일한 resolveTournamentAttribution 를 소비하므로
 * billed/paid/outstanding 규칙은 1:1 정합.
 */
describe("DirectorRevenueService — 대회 매출 집계", () => {
  const director = { id: "dir-1", userType: "DIRECTOR" };
  const ANCHOR = "2026-03"; // periodBucket = 2026-03
  // KST 2026-03-10 → UTC 2026-03-10T06:00Z. 귀속월 2026-03.
  const march = new Date("2026-03-10T06:00:00.000Z");
  const endDate = new Date("2026-03-31T00:00:00.000Z");

  /**
   * teamId=team-1 만 관리하는 director 로 프리셋 + 대회 행을 주입한 prisma mock.
   *  postpaidTournamentCount: payment 무관 POSTPAID 대회 존재 판정용 count 쿼리 결과.
   *   기본값 = 주입 regs 에 POSTPAID 대회가 있으면 1(참가자 존재 케이스 자동 정합), 없으면 0.
   *   참가자 0명·전원 UNPAID(regs 미포함) 케이스는 명시적으로 count 를 넘긴다.
   */
  const makePrisma = (
    tournamentRegs: any[],
    classes: any[] = [],
    postpaidTournamentCount?: number,
  ) => ({
    // resolveManagedTeamIds(director) + 회원 조회 공용.
    teamMember: {
      findMany: jest.fn().mockImplementation((args: any) => {
        if (args?.where?.roleInTeam) return Promise.resolve([{ teamId: "team-1" }]);
        return Promise.resolve([]); // members(joinedAt/leftAt) — 없음.
      }),
    },
    team: {
      findMany: jest.fn().mockResolvedValue([{ id: "team-1" }]),
    },
    class: {
      findMany: jest.fn().mockResolvedValue(classes),
    },
    monthlyPostpaidBillingLine: {
      findMany: jest.fn().mockResolvedValue([]), // 수업 후불 없음.
    },
    payment: {
      findMany: jest.fn().mockResolvedValue([]), // 수업 선불 없음.
    },
    tournamentRegistration: {
      findMany: jest.fn().mockResolvedValue(tournamentRegs),
    },
    tournament: {
      count: jest.fn().mockResolvedValue(
        postpaidTournamentCount ??
          (tournamentRegs.some(
            (r) => r?.tournament?.billingMode === "POSTPAID",
          )
            ? 1
            : 0),
      ),
    },
  });

  const run = (prisma: any) =>
    new DirectorRevenueService(prisma as any).getDirectorRevenue(
      director,
      RevenueScope.MONTH,
      ANCHOR,
    );

  const paidPayment = {
    paymentStatus: "completed",
    completedAt: march,
    createdAt: march,
    refundLogs: [],
  };
  const pendingPayment = {
    paymentStatus: "pending",
    completedAt: null,
    createdAt: march,
    refundLogs: [],
  };

  it("선불 대회 PAID → hero.prepaidRevenue·series[선택월].prepaid 증가", async () => {
    const prisma = makePrisma([
      {
        paymentStatus: "PAID",
        calculatedFee: new Decimal(30000),
        tournament: { billingMode: "PREPAID", endDate },
        payment: paidPayment,
      },
    ]);
    const res = await run(prisma);

    expect(res.hero.prepaidRevenue).toBe(30000);
    expect(res.hero.totalRevenue).toBe(30000);
    const march2026 = res.series.find((s) => s.bucket === "2026-03")!;
    expect(march2026.prepaid).toBe(30000);
    // 선불 대회는 후불 상태에 영향 없음.
    expect(res.postpaidStatus.billed).toBe(0);
    expect(res.postpaidStatus.hasPostpaid).toBe(false);
    // classRevenue 에 대회 라인 미출현.
    expect(res.classRevenue).toEqual([]);
  });

  it("후불 대회 BILLED + PAID → postpaidStatus/collected/outstanding·series·hero 증가", async () => {
    const prisma = makePrisma([
      {
        paymentStatus: "PAID",
        calculatedFee: new Decimal(50000),
        tournament: { billingMode: "POSTPAID", endDate },
        payment: paidPayment,
      },
      {
        paymentStatus: "PENDING", // BILLED
        calculatedFee: new Decimal(20000),
        tournament: { billingMode: "POSTPAID", endDate },
        payment: pendingPayment,
      },
    ]);
    const res = await run(prisma);

    // billed = 50000 + 20000, collected = 50000, outstanding(period) = 20000.
    expect(res.postpaidStatus.billed).toBe(70000);
    expect(res.postpaidStatus.collected).toBe(50000);
    expect(res.postpaidStatus.outstanding).toBe(20000);
    expect(res.postpaidStatus.hasPostpaid).toBe(true);

    // series/hero 수납 = PAID 50000.
    const march2026 = res.series.find((s) => s.bucket === "2026-03")!;
    expect(march2026.postpaid).toBe(50000);
    expect(res.hero.postpaidRevenue).toBe(50000);
    expect(res.hero.totalRevenue).toBe(50000);

    // 현재 미수(hero.outstanding) = BILLED 20000.
    expect(res.hero.outstanding).toBe(20000);

    // 대회는 classRevenue 미출현.
    expect(res.classRevenue).toEqual([]);
  });

  it("실제 취소 형태(registration=CANCELLED·payment=refunded·refundLogs=[]) → 매출/미수 0 · paidAmount 0", async () => {
    // cancelRegistration 은 RefundLog 를 생성하지 않는다. resolveTournamentAttribution 이
    //  로그 부재를 전액 환불로 해석해 순수납 0 → 매출/미수에 잔존하지 않아야 한다.
    const prisma = makePrisma([
      {
        paymentStatus: "CANCELLED",
        calculatedFee: new Decimal(50000),
        tournament: { billingMode: "POSTPAID", endDate },
        payment: {
          paymentStatus: "refunded",
          completedAt: march,
          createdAt: march,
          refundLogs: [], // 실제 취소 = 로그 없음
        },
      },
    ]);
    const res = await run(prisma);

    // 취소 대회의 매출/수납/미수 전부 0.
    expect(res.postpaidStatus.billed).toBe(0);
    expect(res.postpaidStatus.collected).toBe(0);
    expect(res.postpaidStatus.outstanding).toBe(0);
    expect(res.hero.postpaidRevenue).toBe(0);
    expect(res.hero.totalRevenue).toBe(0);
    expect(res.hero.outstanding).toBe(0);
    const march2026 = res.series.find((s) => s.bucket === "2026-03")!;
    expect(march2026.postpaid).toBe(0);
    // 단, POSTPAID 대회가 존재하므로 수납관리 섹션은 노출(hasPostpaid true).
    expect(res.postpaidStatus.hasPostpaid).toBe(true);
  });

  it("POSTPAID 대회 참가자 0명 → hasPostpaid true(매출 0)", async () => {
    // 참가자 없음(regs=[]) 이지만 POSTPAID 대회는 존재(count=1).
    const prisma = makePrisma([], [], 1);
    const res = await run(prisma);

    expect(res.postpaidStatus.hasPostpaid).toBe(true);
    expect(res.postpaidStatus.billed).toBe(0);
    expect(res.postpaidStatus.collected).toBe(0);
    expect(res.hero.totalRevenue).toBe(0);
  });

  it("POSTPAID 대회 전원 UNPAID/payment null → hasPostpaid true(매출 0)", async () => {
    // payment null 참가자는 tournamentReg 쿼리(payment isNot null)에 미포함 → regs=[].
    //  그래도 POSTPAID 대회 존재 count=1 이면 수납관리 섹션 노출.
    const prisma = makePrisma([], [], 1);
    const res = await run(prisma);

    expect(res.postpaidStatus.hasPostpaid).toBe(true);
    expect(res.postpaidStatus.billed).toBe(0);
    expect(res.hero.postpaidRevenue).toBe(0);
  });

  it("대회 없는 팀 → 기존 수치 불변(회귀) + classRevenue 대회 미출현", async () => {
    const prisma = makePrisma([], [
      { id: "c-1", className: "A수업", billingMode: "PREPAID" },
    ]);
    const res = await run(prisma);

    expect(res.hero.prepaidRevenue).toBe(0);
    expect(res.hero.postpaidRevenue).toBe(0);
    expect(res.hero.totalRevenue).toBe(0);
    expect(res.hero.outstanding).toBe(0);
    expect(res.postpaidStatus.billed).toBe(0);
    expect(res.postpaidStatus.collected).toBe(0);
    expect(res.postpaidStatus.outstanding).toBe(0);
    expect(res.postpaidStatus.hasPostpaid).toBe(false);
    // 수업 매출 라인만(대회 라인 없음) — 매출 0 이라 필터로 빈 배열.
    expect(res.classRevenue).toEqual([]);
    expect(res.series.every((s) => s.prepaid === 0 && s.postpaid === 0)).toBe(true);
  });
});
