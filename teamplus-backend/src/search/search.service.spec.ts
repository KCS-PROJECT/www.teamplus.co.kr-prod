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
    teamMember: { findMany: jest.Mock };
    coachProfile: { findMany: jest.Mock };
    team: { findMany: jest.Mock };
    parentChild: { findMany: jest.Mock };
  };

  const TEAM_A = "team-a";

  /** searchNotices 가 만든 systemNotice.findMany where 를 꺼낸다. */
  const noticeWhere = () => prisma.systemNotice.findMany.mock.calls[0][0].where;

  /** where.AND 안의 팀 스코프 조건(OR: targetTeamId ...)을 찾는다. */
  const teamScopeCondition = () =>
    noticeWhere().AND.find(
      (c: { OR?: Array<Record<string, unknown>> }) =>
        Array.isArray(c.OR) && "targetTeamId" in (c.OR[0] ?? {}),
    );

  beforeEach(async () => {
    prisma = {
      systemNotice: {
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

  it("#9 비로그인 검색은 서비스 공지(targetTeamId=null)만 대상으로 한다", async () => {
    await service.search("훈련", "notices", 20, 0, undefined);

    expect(teamScopeCondition()).toEqual({ OR: [{ targetTeamId: null }] });
  });

  it("#10 로그인 사용자는 서비스 공지 ∪ 본인 열람 팀 공지만 대상으로 한다", async () => {
    prisma.teamMember.findMany.mockResolvedValue([{ teamId: TEAM_A }]);

    await service.search("훈련", "notices", 20, 0, {
      id: "user-1",
      userType: "COACH",
    });

    expect(teamScopeCondition()).toEqual({
      OR: [{ targetTeamId: null }, { targetTeamId: { in: [TEAM_A] } }],
    });
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
