import {
  findBlockingOwnership,
  findBlockingOwnershipDetailed,
  OwnershipCountDb,
} from "./withdrawal-guard.util";

/**
 * count(+findMany) 만 가진 최소 DB mock.
 * tournament.count 는 두 갈래(진행 중 status IN / 후불 미정산 billingMode)로 호출되므로
 * where 인자를 보고 각각의 카운트를 돌려준다.
 */
function buildDb(counts: {
  team?: number;
  class?: number;
  tournamentActive?: number;
  tournamentUnsettled?: number;
  academy?: number;
  enrollment?: number;
  postpaidLine?: number;
  refund?: number;
  tournamentReg?: number;
  ownedTeamIds?: string[];
  ownedAcademyIds?: string[];
}): OwnershipCountDb & {
  team: { count: jest.Mock; findMany: jest.Mock };
  class: { count: jest.Mock };
  tournament: { count: jest.Mock };
  academy: { count: jest.Mock; findMany: jest.Mock };
  enrollment: { count: jest.Mock };
  monthlyPostpaidBillingLine: { count: jest.Mock };
  tournamentRegistration: { count: jest.Mock };
  refundRequest: { count: jest.Mock };
} {
  return {
    team: {
      count: jest.fn().mockResolvedValue(counts.team ?? 0),
      findMany: jest
        .fn()
        .mockResolvedValue((counts.ownedTeamIds ?? []).map((id) => ({ id }))),
    },
    class: { count: jest.fn().mockResolvedValue(counts.class ?? 0) },
    tournament: {
      count: jest.fn().mockImplementation(({ where }: any) => {
        if (where.billingMode === "POSTPAID") {
          return Promise.resolve(counts.tournamentUnsettled ?? 0);
        }
        return Promise.resolve(counts.tournamentActive ?? 0);
      }),
    },
    academy: {
      count: jest.fn().mockResolvedValue(counts.academy ?? 0),
      findMany: jest
        .fn()
        .mockResolvedValue(
          (counts.ownedAcademyIds ?? []).map((id) => ({ id })),
        ),
    },
    enrollment: { count: jest.fn().mockResolvedValue(counts.enrollment ?? 0) },
    monthlyPostpaidBillingLine: {
      count: jest.fn().mockResolvedValue(counts.postpaidLine ?? 0),
    },
    tournamentRegistration: {
      count: jest.fn().mockResolvedValue(counts.tournamentReg ?? 0),
    },
    refundRequest: { count: jest.fn().mockResolvedValue(counts.refund ?? 0) },
  };
}

describe("findBlockingOwnership", () => {
  it("DIRECTOR: 보유 자산별 라벨을 순서대로 조합해 반환한다", async () => {
    const db = buildDb({
      team: 2,
      class: 3,
      tournamentActive: 1,
      academy: 1,
    });

    const blockers = await findBlockingOwnership(db, "u-1", "DIRECTOR");

    expect(blockers).toEqual([
      "운영 중인 팀 2개",
      "활성 수업 3개",
      "진행 중인 대회 1개",
      "운영 중인 오픈클래스 1개",
    ]);
  });

  it("DIRECTOR: 자산이 하나도 없으면 빈 배열", async () => {
    const db = buildDb({});
    expect(await findBlockingOwnership(db, "u-1", "DIRECTOR")).toEqual([]);
  });

  it("DIRECTOR: 진행 대회 count 는 status IN(scheduled, ongoing) 로만 집계한다", async () => {
    const db = buildDb({ tournamentActive: 1 });

    await findBlockingOwnership(db, "u-1", "DIRECTOR");

    expect(db.tournament.count).toHaveBeenCalledWith({
      where: {
        team: { coachId: "u-1" },
        status: { in: ["scheduled", "ongoing"] },
      },
    });
  });

  it("DIRECTOR: 후불 미납 정산·미정산 후불 대회·처리 중 환불 요청도 차단 라벨로 반환한다", async () => {
    const db = buildDb({
      postpaidLine: 2,
      tournamentUnsettled: 1,
      refund: 3,
      ownedTeamIds: ["t-1"],
    });

    const blockers = await findBlockingOwnership(db, "u-1", "DIRECTOR");

    expect(blockers).toEqual([
      "미납된 후불 정산 2건",
      "정산되지 않은 후불 대회 1개",
      "처리 중인 환불 요청 3건",
    ]);
  });

  it("DIRECTOR: 후불 대회 미정산 쿼리는 billingMode=POSTPAID + UNPAID/PENDING + 미취소로 제한한다 (선불 PENDING 배제)", async () => {
    const db = buildDb({ tournamentUnsettled: 1 });

    await findBlockingOwnership(db, "u-1", "DIRECTOR");

    expect(db.tournament.count).toHaveBeenCalledWith({
      where: {
        team: { coachId: "u-1" },
        billingMode: "POSTPAID",
        registrations: {
          some: {
            cancelledAt: null,
            paymentStatus: { in: ["UNPAID", "PENDING"] },
          },
        },
      },
    });
  });

  it("DIRECTOR: 환불 요청 count 는 소유 팀/아카데미 스코프 키로만 집계하고, 스코프가 없으면 쿼리하지 않는다", async () => {
    const scoped = buildDb({
      refund: 1,
      ownedTeamIds: ["t-1", "t-2"],
      ownedAcademyIds: ["a-1"],
    });
    await findBlockingOwnership(scoped, "u-1", "DIRECTOR");
    expect(scoped.refundRequest.count).toHaveBeenCalledWith({
      where: {
        status: { in: ["pending", "executing", "execution_failed"] },
        OR: [
          { teamId: { in: ["t-1", "t-2"] } },
          { academyId: { in: ["a-1"] } },
        ],
      },
    });

    const noScope = buildDb({ refund: 9 });
    expect(await findBlockingOwnership(noScope, "u-1", "DIRECTOR")).toEqual([]);
    expect(noScope.refundRequest.count).not.toHaveBeenCalled();
  });

  it("ACADEMY_DIRECTOR: academy 경로 수업/오픈클래스도 동일 로직으로 집계", async () => {
    const db = buildDb({ class: 1, academy: 2 });

    const blockers = await findBlockingOwnership(db, "u-9", "ACADEMY_DIRECTOR");

    expect(blockers).toEqual(["활성 수업 1개", "운영 중인 오픈클래스 2개"]);
  });

  it("PARENT: 자녀 진행 중 수강신청이 있으면 라벨 반환", async () => {
    const db = buildDb({ enrollment: 3 });

    const blockers = await findBlockingOwnership(db, "p-1", "PARENT");

    expect(blockers).toEqual(["자녀의 진행 중인 수강신청 3건"]);
    expect(db.enrollment.count).toHaveBeenCalledWith({
      where: {
        status: { in: ["pending", "pending_approval", "approved"] },
        child: { childParents: { some: { parentId: "p-1" } } },
      },
    });
    // 감독 자산 쿼리는 실행되지 않음
    expect(db.team.count).not.toHaveBeenCalled();
  });

  it("PARENT: 후불 미납·처리 중 환불·후불 대회 참가도 차단 라벨로 반환한다", async () => {
    const db = buildDb({ postpaidLine: 1, refund: 2, tournamentReg: 1 });

    const blockers = await findBlockingOwnership(db, "p-1", "PARENT");

    expect(blockers).toEqual([
      "미납된 후불 정산 1건",
      "처리 중인 환불 요청 2건",
      "정산 예정인 후불 대회 참가 1건",
    ]);
  });

  it("PARENT: 후불 대회 참가 쿼리는 billingMode=POSTPAID 대회로 제한한다 (선불 결제 이탈 PENDING 배제)", async () => {
    const db = buildDb({ tournamentReg: 1 });

    await findBlockingOwnership(db, "p-1", "PARENT");

    expect(db.tournamentRegistration.count).toHaveBeenCalledWith({
      where: {
        userId: "p-1",
        cancelledAt: null,
        paymentStatus: { in: ["UNPAID", "PENDING"] },
        tournament: { billingMode: "POSTPAID" },
      },
    });
  });

  it("PARENT: 미납 후불 쿼리는 본인 직접 청구와 자녀 청구를 모두 포함한다", async () => {
    const db = buildDb({ postpaidLine: 1 });

    await findBlockingOwnership(db, "p-1", "PARENT");

    expect(db.monthlyPostpaidBillingLine.count).toHaveBeenCalledWith({
      where: {
        paymentStatus: "pending",
        OR: [
          { userId: "p-1" },
          { user: { childParents: { some: { parentId: "p-1" } } } },
        ],
      },
    });
  });

  it("PARENT: 차단 사유가 없으면 빈 배열", async () => {
    const db = buildDb({});
    expect(await findBlockingOwnership(db, "p-1", "PARENT")).toEqual([]);
  });

  it("비대상 역할(COACH/TEEN 등)은 쿼리 없이 빈 배열", async () => {
    const db = buildDb({ team: 5, enrollment: 5 });

    expect(await findBlockingOwnership(db, "c-1", "COACH")).toEqual([]);
    expect(db.team.count).not.toHaveBeenCalled();
    expect(db.enrollment.count).not.toHaveBeenCalled();
  });
});

describe("findBlockingOwnershipDetailed", () => {
  it("key·count·label 구조로 반환한다 (eligibility API 계약)", async () => {
    const db = buildDb({ team: 1, postpaidLine: 2, ownedTeamIds: ["t-1"] });

    const detailed = await findBlockingOwnershipDetailed(db, "u-1", "DIRECTOR");

    expect(detailed).toEqual([
      { key: "team", count: 1, label: "운영 중인 팀 1개" },
      { key: "postpaidUnpaid", count: 2, label: "미납된 후불 정산 2건" },
    ]);
  });
});
