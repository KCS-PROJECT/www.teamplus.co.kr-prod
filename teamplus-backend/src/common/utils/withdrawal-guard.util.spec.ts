import { findBlockingOwnership, OwnershipCountDb } from "./withdrawal-guard.util";

/** count 만 가진 최소 DB mock — 각 델리게이트 count 를 jest.fn 으로 대체. */
function buildDb(counts: {
  team?: number;
  class?: number;
  tournament?: number;
  academy?: number;
  enrollment?: number;
}): OwnershipCountDb & {
  team: { count: jest.Mock };
  class: { count: jest.Mock };
  tournament: { count: jest.Mock };
  academy: { count: jest.Mock };
  enrollment: { count: jest.Mock };
} {
  return {
    team: { count: jest.fn().mockResolvedValue(counts.team ?? 0) },
    class: { count: jest.fn().mockResolvedValue(counts.class ?? 0) },
    tournament: { count: jest.fn().mockResolvedValue(counts.tournament ?? 0) },
    academy: { count: jest.fn().mockResolvedValue(counts.academy ?? 0) },
    enrollment: { count: jest.fn().mockResolvedValue(counts.enrollment ?? 0) },
  };
}

describe("findBlockingOwnership", () => {
  it("DIRECTOR: 보유 자산별 라벨을 순서대로 조합해 반환한다", async () => {
    const db = buildDb({ team: 2, class: 3, tournament: 1, academy: 1 });

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

  it("DIRECTOR: 대회 count 는 status IN(scheduled, ongoing) 로만 집계한다", async () => {
    const db = buildDb({ tournament: 1 });

    await findBlockingOwnership(db, "u-1", "DIRECTOR");

    expect(db.tournament.count).toHaveBeenCalledWith({
      where: {
        team: { coachId: "u-1" },
        status: { in: ["scheduled", "ongoing"] },
      },
    });
  });

  it("ACADEMY_DIRECTOR: academy 경로 수업/오픈클래스도 동일 로직으로 집계", async () => {
    const db = buildDb({ class: 1, academy: 2 });

    const blockers = await findBlockingOwnership(db, "u-9", "ACADEMY_DIRECTOR");

    expect(blockers).toEqual([
      "활성 수업 1개",
      "운영 중인 오픈클래스 2개",
    ]);
  });

  it("PARENT: 자녀 진행 중 수강신청이 있으면 라벨 1개 반환", async () => {
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

  it("PARENT: 진행 중 수강신청이 없으면 빈 배열", async () => {
    const db = buildDb({ enrollment: 0 });
    expect(await findBlockingOwnership(db, "p-1", "PARENT")).toEqual([]);
  });

  it("비대상 역할(COACH/TEEN 등)은 쿼리 없이 빈 배열", async () => {
    const db = buildDb({ team: 5, enrollment: 5 });

    expect(await findBlockingOwnership(db, "c-1", "COACH")).toEqual([]);
    expect(db.team.count).not.toHaveBeenCalled();
    expect(db.enrollment.count).not.toHaveBeenCalled();
  });
});
