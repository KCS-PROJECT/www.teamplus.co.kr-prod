import { TeamsService } from "./teams.service";

/**
 * updateTeam/createTeam 의 지역 라벨 정규화(normalizeTeamRegionLabel 연결) 검증.
 * 표준 라벨은 canonical 정규화, 그 외 자유 입력은 trim 원문 수용 (2026-08-21 1안).
 *
 * 기존 teams.service.spec.ts 는 여러 서비스 변경(user mock 부재 · clubCode 응답
 * 드리프트 · UploadCleanupService provider 누락)으로 컴파일 불가 상태라,
 * 지역 정규화는 직접 인스턴스 방식의 전용 스위트로 검증한다.
 */
describe("TeamsService — 지역 라벨 정규화", () => {
  const prisma = {
    team: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    teamMember: {
      findFirst: jest.fn(),
    },
  };
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === "redis"
        ? { keyPrefix: { club: "club:" }, cacheTTL: { clubInfo: 600 } }
        : undefined,
    ),
  };

  let service: TeamsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TeamsService(
      prisma as never,
      redis as never,
      config as never,
      {} as never, // NotificationsService — 이 경로에서 미사용
      {} as never, // UploadCleanupService — logoUrl 미전송이라 미사용
    );
    // 권한 통과: 팀 소유(coachId) 경로
    prisma.team.findFirst.mockResolvedValue({ id: "team-id" });
    prisma.teamMember.findFirst.mockResolvedValue(null);
    prisma.team.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "team-id", ...data }),
    );
  });

  const updatedData = () =>
    prisma.team.update.mock.calls[0][0].data as { location?: string | null };

  it("표준 라벨은 그대로 저장한다", async () => {
    await service.updateTeam("coach-id", "team-id", {
      location: "서울 강남구",
    });
    expect(updatedData().location).toBe("서울 강남구");
  });

  it("시/도 단독 라벨을 허용한다", async () => {
    await service.updateTeam("coach-id", "team-id", { location: "서울" });
    expect(updatedData().location).toBe("서울");
  });

  it("표기 흔들림(다중 공백)은 canonical 로 저장한다", async () => {
    await service.updateTeam("coach-id", "team-id", {
      location: " 서울  강남구 ",
    });
    expect(updatedData().location).toBe("서울 강남구");
  });

  it("빈 문자열은 해제(null)로 저장한다", async () => {
    await service.updateTeam("coach-id", "team-id", { location: "" });
    expect(updatedData().location).toBeNull();
  });

  it("미전송(undefined)은 무변경(undefined)으로 남긴다", async () => {
    await service.updateTeam("coach-id", "team-id", { slogan: "우승" });
    expect(updatedData().location).toBeUndefined();
  });

  it("자유 텍스트(직접 입력)는 trim 원문 그대로 저장한다 — 1안", async () => {
    await service.updateTeam("coach-id", "team-id", {
      location: " 인천 선학 국제빙상경기장 ",
    });
    expect(updatedData().location).toBe("인천 선학 국제빙상경기장");
  });

  it("조합 불일치(부산 강남구)는 정규화 없이 원문 저장한다", async () => {
    await service.updateTeam("coach-id", "team-id", {
      location: "부산 강남구",
    });
    expect(updatedData().location).toBe("부산 강남구");
  });
});
