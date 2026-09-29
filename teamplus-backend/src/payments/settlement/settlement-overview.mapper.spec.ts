import {
  buildSettlementOverviewResponse,
  SettlementOverviewSourceRow,
  SettlementOverviewTeamMeta,
} from "./settlement-overview.mapper";

/**
 * [정산 개요 Dual Emit] alias(기존 admin 소비 키) === canonical 1:1 검증 +
 *  수수료 반올림 + 활동 없는 팀 0행 + totals 합산.
 */
describe("settlement-overview.mapper", () => {
  const teams: SettlementOverviewTeamMeta[] = [
    { id: "team-1", name: "팀1", teamCode: "T1" },
    { id: "team-2", name: "팀2(활동없음)", teamCode: null },
  ];

  const classRows: SettlementOverviewSourceRow[] = [
    {
      teamId: "team-1",
      total: 10,
      paidCount: 7,
      billedAmount: 100_000,
      paidAmount: 70_000,
      outstandingAmount: 30_000,
      outstandingMemberCount: 3,
      estimatedAmount: 0,
      refundedAmount: 5_000,
    },
    {
      teamId: "team-1",
      total: 5,
      paidCount: 5,
      billedAmount: 50_000,
      paidAmount: 50_000,
      outstandingAmount: 0,
      outstandingMemberCount: 0,
      estimatedAmount: 1_000,
      refundedAmount: 0,
    },
    // Academy 전용 수업(teamId null) — 팀 정산 개요 집계 제외.
    {
      teamId: null,
      total: 3,
      paidCount: 3,
      billedAmount: 30_000,
      paidAmount: 30_000,
      outstandingAmount: 0,
      outstandingMemberCount: 0,
      estimatedAmount: 0,
      refundedAmount: 0,
    },
  ];

  const tournamentRows: SettlementOverviewSourceRow[] = [
    {
      teamId: "team-1",
      total: 4,
      paidCount: 4,
      billedAmount: 40_000,
      paidAmount: 40_000,
      outstandingAmount: 0,
      outstandingMemberCount: 0,
      estimatedAmount: 0,
      refundedAmount: 0,
    },
  ];

  const feeRate = 0.03;
  const yearMonth = "2026-09";

  it("alias 필드는 canonical 필드와 항상 동일하다(1:1)", () => {
    const res = buildSettlementOverviewResponse(
      teams,
      classRows,
      tournamentRows,
      feeRate,
      yearMonth,
    );
    for (const t of res.teams) {
      expect(t.studentCount).toBe(t.memberCount);
      expect(t.unpaidAmount).toBe(t.outstandingAmount);
      expect(t.totalAmount).toBe(t.billedAmount);
    }
    expect(res.totals.studentCount).toBe(res.totals.memberCount);
    expect(res.totals.unpaidAmount).toBe(res.totals.outstandingAmount);
    expect(res.totals.totalAmount).toBe(res.totals.billedAmount);
  });

  it("팀별 금액/인원은 classes+tournaments 소계의 합이다", () => {
    const res = buildSettlementOverviewResponse(
      teams,
      classRows,
      tournamentRows,
      feeRate,
      yearMonth,
    );
    const team1 = res.teams.find((t) => t.teamId === "team-1")!;
    expect(team1.classCount).toBe(2);
    expect(team1.tournamentCount).toBe(1);
    expect(team1.memberCount).toBe(10 + 5 + 4); // 19
    expect(team1.paidCount).toBe(7 + 5 + 4); // 16
    expect(team1.unpaidCount).toBe(19 - 16); // 3
    expect(team1.paidAmount).toBe(70_000 + 50_000 + 40_000); // 160,000
    expect(team1.outstandingAmount).toBe(30_000);
    expect(team1.outstandingMemberCount).toBe(3);
    expect(team1.billedAmount).toBe(100_000 + 50_000 + 40_000); // 190,000
    expect(team1.estimatedAmount).toBe(1_000);
    expect(team1.refundedAmount).toBe(5_000);
  });

  it("수수료는 paidAmount × feeRate 반올림, netAmount = paidAmount − platformFee", () => {
    const res = buildSettlementOverviewResponse(
      teams,
      classRows,
      tournamentRows,
      feeRate,
      yearMonth,
    );
    const team1 = res.teams.find((t) => t.teamId === "team-1")!;
    // 160,000 * 0.03 = 4,800 (정수 나눗셈 없이 정확히 떨어지는 값으로 반올림 경계 단순화)
    expect(team1.platformFee).toBe(4_800);
    expect(team1.netAmount).toBe(160_000 - 4_800);
  });

  it("반올림 케이스 — 소수점 발생 시 Math.round 규칙을 따른다", () => {
    const res = buildSettlementOverviewResponse(
      [{ id: "team-x", name: "팀X", teamCode: null }],
      [
        {
          teamId: "team-x",
          total: 1,
          paidCount: 1,
          billedAmount: 10_001,
          paidAmount: 10_001,
          outstandingAmount: 0,
          outstandingMemberCount: 0,
          estimatedAmount: 0,
          refundedAmount: 0,
        },
      ],
      [],
      0.03,
      yearMonth,
    );
    const teamX = res.teams[0];
    // 10,001 * 0.03 = 300.03 → round = 300
    expect(teamX.platformFee).toBe(300);
    expect(teamX.netAmount).toBe(10_001 - 300);
  });

  it("수업/대회 소계가 없는 팀도 0행으로 유지한다(활성 팀 전수)", () => {
    const res = buildSettlementOverviewResponse(
      teams,
      classRows,
      tournamentRows,
      feeRate,
      yearMonth,
    );
    const team2 = res.teams.find((t) => t.teamId === "team-2")!;
    expect(team2).toBeDefined();
    expect(team2.classCount).toBe(0);
    expect(team2.tournamentCount).toBe(0);
    expect(team2.memberCount).toBe(0);
    expect(team2.paidCount).toBe(0);
    expect(team2.unpaidCount).toBe(0);
    expect(team2.paidAmount).toBe(0);
    expect(team2.outstandingMemberCount).toBe(0);
    expect(team2.platformFee).toBe(0);
    expect(team2.netAmount).toBe(0);
  });

  it("teamId 가 null 인 행(Academy 전용 수업)은 팀 정산 개요에서 제외한다", () => {
    const res = buildSettlementOverviewResponse(
      teams,
      classRows,
      tournamentRows,
      feeRate,
      yearMonth,
    );
    // classRows 의 3번째 행(teamId=null, total=3)이 어느 팀에도 더해지지 않아야 한다.
    const sumMemberCount = res.teams.reduce((s, t) => s + t.memberCount, 0);
    expect(sumMemberCount).toBe(19); // 10+5+4, null 행의 3 은 제외
  });

  it("totals 는 팀별 행 전부의 합이다", () => {
    const res = buildSettlementOverviewResponse(
      teams,
      classRows,
      tournamentRows,
      feeRate,
      yearMonth,
    );
    const expectedTotal = (key: keyof (typeof res.teams)[number]) =>
      res.teams.reduce((s, t) => s + (t[key] as number), 0);
    expect(res.totals.classCount).toBe(expectedTotal("classCount"));
    expect(res.totals.tournamentCount).toBe(expectedTotal("tournamentCount"));
    expect(res.totals.memberCount).toBe(expectedTotal("memberCount"));
    expect(res.totals.paidCount).toBe(expectedTotal("paidCount"));
    expect(res.totals.unpaidCount).toBe(expectedTotal("unpaidCount"));
    expect(res.totals.paidAmount).toBe(expectedTotal("paidAmount"));
    expect(res.totals.outstandingAmount).toBe(
      expectedTotal("outstandingAmount"),
    );
    expect(res.totals.outstandingMemberCount).toBe(
      expectedTotal("outstandingMemberCount"),
    );
    expect(res.totals.billedAmount).toBe(expectedTotal("billedAmount"));
    expect(res.totals.estimatedAmount).toBe(expectedTotal("estimatedAmount"));
    expect(res.totals.refundedAmount).toBe(expectedTotal("refundedAmount"));
    expect(res.totals.platformFee).toBe(expectedTotal("platformFee"));
    expect(res.totals.netAmount).toBe(expectedTotal("netAmount"));
  });

  it("yearMonth·feeRate 는 입력값을 그대로 응답에 담는다", () => {
    const res = buildSettlementOverviewResponse(
      teams,
      classRows,
      tournamentRows,
      feeRate,
      yearMonth,
    );
    expect(res.yearMonth).toBe(yearMonth);
    expect(res.feeRate).toBe(feeRate);
  });
});
