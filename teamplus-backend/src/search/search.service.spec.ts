import { Test, TestingModule } from "@nestjs/testing";
import { SearchService } from "./search.service";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * 공지 검색 팀 격리 — F-EX-05.
 *
 * `GET /api/v1/search` 는 `@Public()` + `@SkipThrottle()` 이라, 팀 스코프가 없으면
 * 비로그인 사용자가 임의 질의로 타 팀 공지 본문의 존재를 탐침하고 미리보기를 얻을 수 있었다.
 */
describe("SearchService — 공지 검색 팀 격리", () => {
  let service: SearchService;
  let prisma: {
    systemNotice: { findMany: jest.Mock; count: jest.Mock };
    teamPost: { findMany: jest.Mock; count: jest.Mock };
    teamMember: { findMany: jest.Mock };
    coachProfile: { findMany: jest.Mock };
    team: { findMany: jest.Mock };
    parentChild: { findMany: jest.Mock };
  };

  const TEAM_A = "team-a";

  /** searchNotices 가 만든 systemNotice.findMany where 를 꺼낸다. */
  const noticeWhere = () => prisma.systemNotice.findMany.mock.calls[0][0].where;

  /** where.AND 안의 팀 스코프 조건(OR: targetTeamId ...)을 찾는다 — [Phase 2] 부재가 정상. */
  const teamScopeCondition = () =>
    noticeWhere().AND.find(
      (c: { OR?: Array<Record<string, unknown>> }) =>
        Array.isArray(c.OR) && "targetTeamId" in (c.OR[0] ?? {}),
    );

  /** [Phase 2] 서비스 전용 조각({ targetTeamId: null }) — SystemNotice 검색의 새 계약. */
  const serviceOnlyCondition = () =>
    noticeWhere().AND.find(
      (c: Record<string, unknown>) => !("OR" in c) && "targetTeamId" in c,
    );

  beforeEach(async () => {
    prisma = {
      systemNotice: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      teamPost: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      teamMember: { findMany: jest.fn().mockResolvedValue([]) },
      coachProfile: { findMany: jest.fn().mockResolvedValue([]) },
      team: { findMany: jest.fn().mockResolvedValue([]) },
      parentChild: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it("#9 비로그인 검색은 서비스 공지(targetTeamId=null)만 — TeamPost 미조회", async () => {
    await service.search("훈련", "notices", 20, 0, undefined);

    expect(serviceOnlyCondition()).toEqual({ targetTeamId: null });
    expect(teamScopeCondition()).toBeUndefined();
    expect(prisma.teamPost.findMany).not.toHaveBeenCalled();
  });

  it("#10 [Phase 2] 로그인 = 서비스 공지 + 열람 팀의 TeamPost 팀 공지 병합", async () => {
    prisma.teamMember.findMany.mockResolvedValue([{ teamId: TEAM_A }]);

    await service.search("훈련", "notices", 20, 0, {
      id: "user-1",
      userType: "COACH",
    });

    // SystemNotice 는 서비스 전용으로 축소
    expect(serviceOnlyCondition()).toEqual({ targetTeamId: null });
    // 팀 공지는 TeamPost(announcement · 열람 팀 · 게시 중) 검색으로 병합
    expect(prisma.teamPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teamId: { in: [TEAM_A] },
          postType: "announcement",
          isActive: true,
        }),
      }),
    );
    // count 도 같은 where 공유 (총건수 유출 차단 계약 동일)
    expect(prisma.teamPost.count.mock.calls[0][0].where).toBe(
      prisma.teamPost.findMany.mock.calls[0][0].where,
    );
  });

  it("[P2-R1-H06] 서비스 결과가 limit 이상이어도 팀 공지가 전역 병합에 포함된다", async () => {
    prisma.teamMember.findMany.mockResolvedValue([{ teamId: TEAM_A }]);
    // 서비스 공지 3건(오래됨) vs 팀 공지 1건(최신) — limit 3
    const day = (n: number) => new Date(2026, 0, n);
    prisma.systemNotice.findMany.mockResolvedValue([
      { id: "s1", title: "s1", content: "c", targetType: "all", createdAt: day(3) },
      { id: "s2", title: "s2", content: "c", targetType: "all", createdAt: day(2) },
      { id: "s3", title: "s3", content: "c", targetType: "all", createdAt: day(1) },
    ]);
    prisma.systemNotice.count.mockResolvedValue(3);
    prisma.teamPost.findMany.mockResolvedValue([
      { id: "t1", title: "t1", content: "c", createdAt: day(10) },
    ]);
    prisma.teamPost.count.mockResolvedValue(1);

    const res = await service.search("훈련", "notices", 3, 0, {
      id: "user-1",
      userType: "COACH",
    });
    const n = (res.results as Record<string, { total: number; items: Array<{ id: string }> }>).notices;

    // 최신순 전역 병합 — 팀 공지(가장 최신)가 첫 페이지 선두, total 은 두 소스 합
    expect(n.total).toBe(4);
    expect(n.items.map((i) => i.id)).toEqual(["t1", "s1", "s2"]);
  });

  it("[P2-R1-H06] 2페이지는 병합 결과의 offset 절단 — 중복·누락 없음", async () => {
    prisma.teamMember.findMany.mockResolvedValue([{ teamId: TEAM_A }]);
    const day = (n: number) => new Date(2026, 0, n);
    // 각 소스는 offset+limit(=6)까지 수집됨 — 병합 정렬 후 두 번째 페이지 검증
    prisma.systemNotice.findMany.mockResolvedValue([
      { id: "s1", title: "s1", content: "c", targetType: "all", createdAt: day(6) },
      { id: "s2", title: "s2", content: "c", targetType: "all", createdAt: day(4) },
      { id: "s3", title: "s3", content: "c", targetType: "all", createdAt: day(2) },
    ]);
    prisma.systemNotice.count.mockResolvedValue(3);
    prisma.teamPost.findMany.mockResolvedValue([
      { id: "t1", title: "t1", content: "c", createdAt: day(5) },
      { id: "t2", title: "t2", content: "c", createdAt: day(3) },
      { id: "t3", title: "t3", content: "c", createdAt: day(1) },
    ]);
    prisma.teamPost.count.mockResolvedValue(3);

    const res = await service.search("훈련", "notices", 3, 3, {
      id: "user-1",
      userType: "COACH",
    });
    const n = (res.results as Record<string, { total: number; items: Array<{ id: string }> }>).notices;

    // 전역 정렬 [s1,t1,s2,t2,s3,t3] 의 2페이지(offset 3) = [t2,s3,t3]
    expect(n.items.map((i) => i.id)).toEqual(["t2", "s3", "t3"]);
    expect(n.total).toBe(6);
  });

  it("[P2-R2-H06] createdAt 동률은 id desc 2차 키로 안정 정렬 — 페이지 경계 중복·누락 없음", async () => {
    prisma.teamMember.findMany.mockResolvedValue([{ teamId: TEAM_A }]);
    const same = new Date(2026, 0, 5); // 4건 전부 같은 시각 — 동률 강제
    prisma.systemNotice.findMany.mockResolvedValue([
      { id: "s9", title: "s9", content: "c", targetType: "all", createdAt: same },
      { id: "s2", title: "s2", content: "c", targetType: "all", createdAt: same },
    ]);
    prisma.systemNotice.count.mockResolvedValue(2);
    prisma.teamPost.findMany.mockResolvedValue([
      { id: "t7", title: "t7", content: "c", createdAt: same },
      { id: "t4", title: "t4", content: "c", createdAt: same },
    ]);
    prisma.teamPost.count.mockResolvedValue(2);

    const page = async (offset: number) => {
      const res = await service.search("훈련", "notices", 2, offset, {
        id: "user-1",
        userType: "COACH",
      });
      return (
        res.results as Record<string, { items: Array<{ id: string }> }>
      ).notices.items.map((i) => i.id);
    };

    // 안정 정렬(createdAt desc, id desc) = [t7, t4, s9, s2] — 두 페이지가 정확히 분할
    expect(await page(0)).toEqual(["t7", "t4"]);
    expect(await page(2)).toEqual(["s9", "s2"]);
    // DB 조회에도 동일한 2차 키가 걸린다 (수집 절단과 병합의 순서 일치 계약)
    expect(prisma.systemNotice.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    expect(prisma.teamPost.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("#11 게시 기간(시작·종료) 조건을 함께 적용한다", async () => {
    await service.search("훈련", "notices", 20, 0, undefined);

    const and = noticeWhere().AND;
    const keys = and.flatMap((c: { OR?: Array<Record<string, unknown>> }) =>
      (c.OR ?? []).flatMap((o) => Object.keys(o)),
    );

    expect(keys).toContain("startAt");
    expect(keys).toContain("expiresAt");
  });

  it("items 와 total 이 동일한 where 객체를 공유한다 (총건수 유출 차단)", async () => {
    await service.search("훈련", "notices", 20, 0, undefined);

    const findManyWhere = prisma.systemNotice.findMany.mock.calls[0][0].where;
    const countWhere = prisma.systemNotice.count.mock.calls[0][0].where;

    // 참조 동일성까지 확인 — 분기되면 total 로 비열람 공지의 존재가 새어나간다
    expect(countWhere).toBe(findManyWhere);
  });

  it("isActive 필터는 그대로 유지한다", async () => {
    await service.search("훈련", "notices", 20, 0, undefined);

    expect(noticeWhere().isActive).toBe(true);
  });
});
