import { TournamentsService } from "./tournaments.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * 대회 상세 응답 participants(이름 해석) 회귀 스펙.
 *
 * 증명 대상:
 *  1) TeamMember.playerName 우선, 없으면 users 성+이름 폴백.
 *  2) status=WITHDRAWN 은 name:null 이고 TeamMember.playerName 조회 자체가 일어나지 않음.
 *  3) users 행이 없는(파기·유령) id 도 name:null.
 *  4) 학부모 요청자는 본인 자녀에 해당하는 항목만 받는다(타 자녀 미포함).
 *  5) selectedParticipantIds 가 비어 있으면 participants: [] (전체 대상 의미 보존).
 *  6) 요청자 미지정 호출은 실패한다 — 개인정보 필터의 기본값을 닫힌 쪽으로.
 */
describe("TournamentsService.getTournamentById — participants 이름 해석", () => {
  const coach: JwtUserPayload = {
    id: "coach-1",
    email: "coach-1@t.dev",
    userType: "COACH",
  };

  const makePrismaMock = (selectedParticipantIds: string[]) => ({
    tournament: {
      findUnique: jest.fn().mockResolvedValue({
        id: "trn-1",
        teamId: "team-1",
        selectedParticipantIds,
      }),
    },
    tournamentRegistration: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    teamMember: { findMany: jest.fn().mockResolvedValue([]) },
    parentChild: { findMany: jest.fn().mockResolvedValue([]) },
  });

  const makeService = (prisma: any) =>
    new TournamentsService(prisma, {} as any, {} as any, {} as any);

  it("정상 회원 — TeamMember.playerName 우선, 없으면 users 성+이름 폴백", async () => {
    const prisma = makePrismaMock(["u-1", "u-2"]);
    prisma.user.findMany.mockResolvedValue([
      { id: "u-1", status: "ACTIVE", firstName: "민준", lastName: "김" },
      { id: "u-2", status: "ACTIVE", firstName: "서연", lastName: "이" },
    ]);
    prisma.teamMember.findMany.mockResolvedValue([
      { userId: "u-1", playerName: "김민준(등번호 7)" },
    ]);

    const result = await makeService(prisma).getTournamentById("trn-1", coach);

    expect(result.participants).toEqual([
      { userId: "u-1", name: "김민준(등번호 7)" },
      { userId: "u-2", name: "이서연" },
    ]);
    expect(prisma.teamMember.findMany).toHaveBeenCalledWith({
      where: { teamId: "team-1", userId: { in: ["u-1", "u-2"] } },
      select: { userId: true, playerName: true },
    });
  });

  it("status=WITHDRAWN — name:null 이고 TeamMember.playerName 조회 대상에서 제외", async () => {
    const prisma = makePrismaMock(["u-1", "u-withdrawn"]);
    prisma.user.findMany.mockResolvedValue([
      { id: "u-1", status: "ACTIVE", firstName: "민준", lastName: "김" },
      {
        id: "u-withdrawn",
        status: "WITHDRAWN",
        firstName: "탈퇴회원",
        lastName: "",
      },
    ]);
    prisma.teamMember.findMany.mockResolvedValue([
      { userId: "u-1", playerName: "김민준" },
    ]);

    const result = await makeService(prisma).getTournamentById("trn-1", coach);

    expect(result.participants).toEqual([
      { userId: "u-1", name: "김민준" },
      { userId: "u-withdrawn", name: null },
    ]);
    // 탈퇴자는 식별 불가 판정이므로 playerName 조회 대상(in 절)에 포함되면 안 된다.
    expect(prisma.teamMember.findMany).toHaveBeenCalledWith({
      where: { teamId: "team-1", userId: { in: ["u-1"] } },
      select: { userId: true, playerName: true },
    });
  });

  it("users 행 없음(유령 id) — name:null", async () => {
    const prisma = makePrismaMock(["u-ghost"]);
    prisma.user.findMany.mockResolvedValue([]); // 행 자체가 없음

    const result = await makeService(prisma).getTournamentById("trn-1", coach);

    expect(result.participants).toEqual([{ userId: "u-ghost", name: null }]);
    expect(prisma.teamMember.findMany).not.toHaveBeenCalled();
  });

  it("학부모 요청 — 본인 자녀 항목만, 타 자녀 미포함", async () => {
    const parent: JwtUserPayload = {
      id: "parent-1",
      email: "parent-1@t.dev",
      userType: "PARENT",
    };
    // 대회 참가 대상에는 내 자녀(child-1)와 타인 자녀(child-2)가 함께 있다.
    const prisma = makePrismaMock(["child-1", "child-2"]);
    prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
    prisma.user.findMany.mockResolvedValue([
      { id: "child-1", status: "ACTIVE", firstName: "하늘", lastName: "박" },
    ]);
    prisma.teamMember.findMany.mockResolvedValue([]);

    const result = await makeService(prisma).getTournamentById(
      "trn-1",
      parent,
    );

    expect(result.participants).toEqual([{ userId: "child-1", name: "박하늘" }]);
    // 타 자녀(child-2)는 users 조회에도 포함되지 않아야 한다(스코프 필터가 먼저 적용).
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["child-1"] } },
      select: { id: true, status: true, firstName: true, lastName: true },
    });
  });

  it("selectedParticipantIds 빈 배열 — participants: []", async () => {
    const prisma = makePrismaMock([]);

    const result = await makeService(prisma).getTournamentById("trn-1", coach);

    expect(result.participants).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("요청자 정보 없이 호출하면 실패한다 — 빈 배열로 눙치지 않는다(전체 대상 의미와 구분)", async () => {
    const prisma = makePrismaMock(["u-1", "u-2"]);

    await expect(
      makeService(prisma).getTournamentById("trn-1", undefined),
    ).rejects.toThrow();
    // 스코프를 정할 수 없으므로 개인정보 조회로 넘어가지 않는다
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.teamMember.findMany).not.toHaveBeenCalled();
  });
});
