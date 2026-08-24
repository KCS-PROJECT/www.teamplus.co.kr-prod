import { ParentDashboardService } from "./parent-dashboard.service";
import { CoachDashboardService } from "./coach-dashboard.service";
import { DirectorDashboardService } from "./director-dashboard.service";
import { ChildDashboardService } from "./child-dashboard.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";

/**
 * 대시보드 "최근 공지" 팀 가시성 — F-EX-05.
 *
 * 4개 대시보드 서비스는 관심사가 "공지 가시성" 하나로 동일해 서비스별 spec 대신
 * 범위 한정 단일 spec 으로 검증한다(Codex Round 7 합의).
 *
 * ⚠️ 헬퍼 조합을 재현해 검증하면 **대시보드 한 곳에 적용을 빠뜨려도 통과**한다.
 *    그래서 각 서비스를 실제로 호출하고 `systemNotice.findMany` 에 전달된 **실 where** 를 본다.
 *    대시보드는 쿼리를 Promise.all/$transaction 으로 한꺼번에 구성하므로,
 *    이후 파생 계산이 mock 데이터 부족으로 실패해도 공지 쿼리는 이미 구성된 뒤다.
 *    (그래서 호출은 try/catch 로 감싸고, 단언은 "쿼리가 어떻게 만들어졌는가"에만 둔다)
 */
describe("대시보드 최근 공지 가시성 — 실 쿼리 검증", () => {
  const TEAM_A = "team-a";
  const TEAM_B = "team-b";

  /** 모든 모델·메서드에 기본값을 돌려주는 Prisma 목 — 대시보드가 부르는 쿼리 수가 많아 Proxy 로 처리. */
  const createPrismaMock = () => {
    const noticeFindMany = jest.fn().mockResolvedValue([]);
    const modelCache = new Map<string, Record<string, jest.Mock>>();

    const makeMethod = (method: string) =>
      jest.fn(async () => {
        if (method === "count") return 0;
        if (method === "aggregate") return { _sum: {}, _count: 0 };
        if (method === "findMany" || method === "groupBy") return [];
        return null;
      });

    const modelProxy = (name: string) => {
      if (!modelCache.has(name)) modelCache.set(name, {});
      const methods = modelCache.get(name)!;
      return new Proxy(
        {},
        {
          get: (_t, method: string) => {
            if (name === "systemNotice" && method === "findMany") {
              return noticeFindMany;
            }
            if (!methods[method]) methods[method] = makeMethod(method);
            return methods[method];
          },
        },
      );
    };

    const prisma = new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === "$transaction") {
            return jest.fn((arg: unknown) =>
              Array.isArray(arg)
                ? Promise.all(arg)
                : (arg as (tx: unknown) => unknown)(prisma),
            );
          }
          if (prop === "then") return undefined;
          return modelProxy(prop);
        },
      },
    );

    return { prisma, noticeFindMany, modelCache };
  };

  const redisMock = () => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  });

  /** 열람 팀 해석(resolveViewerTeamIds)이 teamIds 를 돌려주도록 teamMember 목을 고정. */
  const stubViewerTeams = (
    modelCache: Map<string, Record<string, jest.Mock>>,
    prisma: unknown,
    teamIds: string[],
  ) => {
    // Proxy 는 접근 시 생성되므로 먼저 한 번 접근해 캐시를 만든다
    void (prisma as { teamMember: { findMany: jest.Mock } }).teamMember
      .findMany;
    const teamMember = modelCache.get("teamMember")!;
    teamMember.findMany.mockImplementation(
      async (args: { where?: { roleInTeam?: unknown } }) =>
        // 관리 SoT(roleInTeam 필터) 조회는 빈 결과 — 여기서는 열람 스코프만 검증
        args?.where?.roleInTeam ? [] : teamIds.map((teamId) => ({ teamId })),
    );
  };

  /** 실제 서비스가 만든 공지 where 에서 팀 스코프 조건을 추출. */
  const extractScope = (noticeFindMany: jest.Mock, callIndex = 0) => {
    const where = noticeFindMany.mock.calls[callIndex]?.[0]?.where;
    expect(where).toBeDefined();
    expect(Array.isArray(where.AND)).toBe(true);
    return {
      where,
      scope: where.AND.find(
        (c: { OR?: Array<Record<string, unknown>> }) =>
          Array.isArray(c.OR) && "targetTeamId" in (c.OR[0] ?? {}),
      ),
      serviceOnly: where.AND.find(
        (c: Record<string, unknown>) =>
          !("OR" in c) && "targetTeamId" in c,
      ),
      publicationKeys: where.AND.flatMap(
        (c: { OR?: Array<Record<string, unknown>> }) =>
          (c.OR ?? []).flatMap((o) => Object.keys(o)),
      ),
    };
  };

  /** [Phase 2] 팀 공지는 TeamPost feed 로 이관 — 대시보드 공지는 서비스 전용이어야 한다. */
  const expectServiceOnly = (parts: {
    scope: unknown;
    serviceOnly: unknown;
  }) => {
    expect(parts.scope).toBeUndefined(); // 구 팀 스코프 OR 조각 부재
    expect(parts.serviceOnly).toEqual({ targetTeamId: null });
  };

  const run = async (fn: () => Promise<unknown>) => {
    // 파생 계산은 mock 데이터 부족으로 실패할 수 있다 — 쿼리 구성까지가 검증 대상.
    try {
      await fn();
    } catch {
      /* noop */
    }
  };

  it("#12 학부모 대시보드 — [Phase 2] 서비스 공지 전용", async () => {
    const { prisma, noticeFindMany, modelCache } = createPrismaMock();
    stubViewerTeams(modelCache, prisma, [TEAM_A]);
    const service = new ParentDashboardService(
      prisma as unknown as PrismaService,
      redisMock() as unknown as RedisService,
    );

    await run(() => service.getParentDashboard("parent-1"));

    const parts = extractScope(noticeFindMany);
    expectServiceOnly(parts);
    expect(parts.publicationKeys).toContain("startAt");
    expect(parts.publicationKeys).toContain("expiresAt");
  });

  it("#12-b 학부모 대시보드 — [Phase 2] 어떤 팀 id 도 쿼리에 없다", async () => {
    const { prisma, noticeFindMany, modelCache } = createPrismaMock();
    stubViewerTeams(modelCache, prisma, [TEAM_A]);
    const service = new ParentDashboardService(
      prisma as unknown as PrismaService,
      redisMock() as unknown as RedisService,
    );

    await run(() => service.getParentDashboard("parent-1"));

    const { where } = extractScope(noticeFindMany);
    expect(JSON.stringify(where)).not.toContain(TEAM_A);
    expect(JSON.stringify(where)).not.toContain(TEAM_B);
  });

  it("#14 코치 대시보드 — [Phase 2] 서비스 공지 전용", async () => {
    const { prisma, noticeFindMany, modelCache } = createPrismaMock();
    stubViewerTeams(modelCache, prisma, [TEAM_A]);
    const service = new CoachDashboardService(
      prisma as unknown as PrismaService,
      redisMock() as unknown as RedisService,
    );

    await run(() => service.getCoachDashboard("coach-1"));

    const parts = extractScope(noticeFindMany);
    expectServiceOnly(parts);
    expect(parts.publicationKeys).toContain("expiresAt");
    expect(JSON.stringify(parts.where)).not.toContain(TEAM_A);
  });

  it("#15 감독 대시보드 — [Phase 2] 서비스 공지 전용", async () => {
    const { prisma, noticeFindMany, modelCache } = createPrismaMock();
    stubViewerTeams(modelCache, prisma, [TEAM_A]);
    const service = new DirectorDashboardService(
      prisma as unknown as PrismaService,
      redisMock() as unknown as RedisService,
    );

    await run(() => service.getDirectorDashboard("director-1"));

    const parts = extractScope(noticeFindMany);
    expectServiceOnly(parts);
    expect(parts.publicationKeys).toContain("expiresAt");
    expect(JSON.stringify(parts.where)).not.toContain(TEAM_A);
  });

  it("#13 아동 대시보드 멤버십 없음 분기 — [Phase 2] 서비스 공지 전용", async () => {
    const { prisma, noticeFindMany, modelCache } = createPrismaMock();
    stubViewerTeams(modelCache, prisma, []); // 열람 팀 0 = 승인 대기 아동
    const service = new ChildDashboardService(
      prisma as unknown as PrismaService,
      redisMock() as unknown as RedisService,
    );

    await run(() => service.getChildHome("child-1", "CHILD"));

    expectServiceOnly(extractScope(noticeFindMany));
  });

  it("#16 아동 대시보드 정상 분기 — [Phase 2] 서비스 공지 전용", async () => {
    const { prisma, noticeFindMany, modelCache } = createPrismaMock();
    stubViewerTeams(modelCache, prisma, [TEAM_A]);
    // 멤버십 있음 → 정상 분기(:204)로 진입
    void (prisma as { teamMember: { findFirst: jest.Mock } }).teamMember
      .findFirst;
    modelCache
      .get("teamMember")!
      .findFirst.mockResolvedValue({ id: "m-1", teamId: TEAM_A });

    const service = new ChildDashboardService(
      prisma as unknown as PrismaService,
      redisMock() as unknown as RedisService,
    );

    await run(() => service.getChildHome("child-1", "CHILD"));

    const parts = extractScope(noticeFindMany);
    expectServiceOnly(parts);
    expect(parts.publicationKeys).toContain("expiresAt");
    expect(JSON.stringify(parts.where)).not.toContain(TEAM_A);
  });

  it("캐시 적중 시 아동 대시보드는 Prisma 를 전혀 호출하지 않는다 (Round 10)", async () => {
    // 스코프 계산을 캐시 확인 앞에 두면 캐시가 무의미해진다 —
    // 나머지 3개 대시보드(캐시 뒤 해석)와 동작이 갈리는 회귀 방지.
    const { prisma, noticeFindMany, modelCache } = createPrismaMock();
    stubViewerTeams(modelCache, prisma, [TEAM_A]);
    const redis = redisMock();
    redis.get.mockResolvedValue({ cached: true });

    const service = new ChildDashboardService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );

    const result = await service.getChildHome("child-1", "CHILD");

    expect(result).toEqual({ cached: true });
    expect(noticeFindMany).not.toHaveBeenCalled();
    expect(modelCache.get("teamMember")?.findMany).not.toHaveBeenCalled();
  });

  it("역할별 targetType OR 필터를 덮어쓰지 않는다 (스코프는 AND 로 병합)", async () => {
    const { prisma, noticeFindMany, modelCache } = createPrismaMock();
    stubViewerTeams(modelCache, prisma, [TEAM_A]);
    const service = new ParentDashboardService(
      prisma as unknown as PrismaService,
      redisMock() as unknown as RedisService,
    );

    await run(() => service.getParentDashboard("parent-1"));

    const { where } = extractScope(noticeFindMany);
    // 최상위 OR = targetType 필터가 그대로 살아 있어야 한다
    expect(
      where.OR.some((c: { targetType?: string }) => c.targetType === "parent"),
    ).toBe(true);
    expect(where.isActive).toBe(true);
  });
});
