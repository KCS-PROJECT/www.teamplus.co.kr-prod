import {
  countActiveUnitNotices,
  cleanupUnitNoticesForDelete,
  isForeignKeyRestrictError,
} from "./unit-notice-delete-guard.util";

/**
 * [Codex R1 H-04 · R2 보강] 단위 공지 FK(RESTRICT) 삭제 가드 계약 spec.
 * · 게시 중(isActive=true) 공지만 차단 카운트로 집계 (0건 → 삭제 진행 허용)
 * · 삭제 트랜잭션 정리는 **inactive(soft 삭제)만** 제거 — count 이후 레이스로 생성된
 *   active 공지는 FK RESTRICT 가 delete 를 막고(P2003), 호출부가 Conflict 로 변환한다.
 */
describe("unit-notice-delete-guard.util", () => {
  const makePrisma = (count = 0) => ({
    teamPost: {
      count: jest.fn().mockResolvedValue(count),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  });

  it("countActiveUnitNotices — 수업 축은 targetClassId + isActive=true 로 집계", async () => {
    const prisma = makePrisma(1);
    const result = await countActiveUnitNotices(
      prisma as never,
      { classId: "class-1" },
    );
    expect(result).toBe(1);
    expect(prisma.teamPost.count).toHaveBeenCalledWith({
      where: { targetClassId: "class-1", isActive: true },
    });
  });

  it("countActiveUnitNotices — 대회 축은 targetTournamentId 로 집계", async () => {
    const prisma = makePrisma(0);
    const result = await countActiveUnitNotices(
      prisma as never,
      { tournamentId: "tour-1" },
    );
    expect(result).toBe(0); // 0건 → 호출부가 삭제 진행
    expect(prisma.teamPost.count).toHaveBeenCalledWith({
      where: { targetTournamentId: "tour-1", isActive: true },
    });
  });

  it("[R2] cleanupUnitNoticesForDelete — inactive(soft 삭제)만 정리 (레이스 active 공지 보존)", async () => {
    const prisma = makePrisma();
    await cleanupUnitNoticesForDelete(prisma as never, { classId: "class-1" });
    expect(prisma.teamPost.deleteMany).toHaveBeenCalledWith({
      where: { targetClassId: "class-1", isActive: false },
    });
  });

  it("[R2] cleanupUnitNoticesForDelete — 대회 축도 inactive 한정", async () => {
    const prisma = makePrisma();
    await cleanupUnitNoticesForDelete(prisma as never, {
      tournamentId: "tour-1",
    });
    expect(prisma.teamPost.deleteMany).toHaveBeenCalledWith({
      where: { targetTournamentId: "tour-1", isActive: false },
    });
  });

  it("[R2] isForeignKeyRestrictError — P2003 만 true (제어 변환 판정)", () => {
    expect(isForeignKeyRestrictError({ code: "P2003" })).toBe(true);
    expect(isForeignKeyRestrictError({ code: "P2025" })).toBe(false);
    expect(isForeignKeyRestrictError(new Error("boom"))).toBe(false);
    expect(isForeignKeyRestrictError(null)).toBe(false);
  });
});
