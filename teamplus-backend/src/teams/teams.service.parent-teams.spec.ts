import { TeamsService } from "./teams.service";

/**
 * 학부모 팀 목록(GET /teams/my/parent) 응답의 totalChildren 계약.
 * 웹 /team 은 이 값이 0 이면 "자녀 없음" 빈 상태를 띄우므로, 소속 팀이 없는 자녀도 셈에 넣어야 한다.
 *
 * 기존 teams.service.spec.ts 는 컴파일 불가 상태라 직접 인스턴스 방식의 전용 스위트로 검증한다
 * (teams.service.region.spec.ts 와 같은 방식).
 */
describe("TeamsService — 학부모 팀 목록 자녀 수", () => {
  const prisma = {
    parentChild: { findMany: jest.fn() },
    teamMember: { findMany: jest.fn() },
  };

  const team = {
    id: "team-1",
    name: "농구팀",
    shortName: null,
    division: null,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    isActive: true,
    createdAt: new Date("2026-07-13T06:24:56.195Z"),
    updatedAt: new Date("2026-10-06T06:38:01.645Z"),
  };

  let service: TeamsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TeamsService(
      prisma as never,
      {} as never, // RedisService — 이 경로에서 미사용
      {} as never, // ConfigService — 이 경로에서 미사용
      {} as never, // NotificationsService — 이 경로에서 미사용
      {} as never, // UploadCleanupService — 이 경로에서 미사용
    );
    prisma.teamMember.findMany.mockResolvedValue([]);
  });

  it("팀 승인 자녀와 소속 팀 없는 자녀를 모두 세어 totalChildren 으로 반환한다", async () => {
    prisma.parentChild.findMany.mockResolvedValue([
      { child: { teamMembers: [{ teamId: "team-1", team }] } },
      { child: { teamMembers: [] } },
    ]);

    const result = await service.getParentVisibleTeams("parent-1");

    expect(result.totalChildren).toBe(2);
    expect(result.myChildTeams).toHaveLength(1);
  });

  it("자녀가 없으면 totalChildren 은 0 이다", async () => {
    prisma.parentChild.findMany.mockResolvedValue([]);

    const result = await service.getParentVisibleTeams("parent-1");

    expect(result.totalChildren).toBe(0);
    expect(result.myChildTeams).toHaveLength(0);
  });
});
