import { BadRequestException } from "@nestjs/common";
import { TournamentsService } from "./tournaments.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * 대회 기간 수동 입력(A안) + 경기 일정 diff 동기화 회귀 스펙 (2026-08-20).
 *
 * 증명 대상:
 *  1) R3 — 경기 일정이 있으면 기간 필수 (생성·수정 공통).
 *  2) R4 — 모든 경기 날짜는 기간 안(양끝 포함). 최종 상태 기준 검증.
 *  3) R6 — 기간만 축소(경기 미전송)해도 기존 경기가 밖으로 밀리면 400.
 *  4) diff 분류 — 무변경 행 미접촉 · 신규 생성 · 빠진 행 삭제가 단일 트랜잭션으로 수행.
 *  5) 불가침 — 지난 경기/기록·경비 보유 경기는 변경·삭제 400 (deleteMatch 단독 경로 포함).
 */
describe("TournamentsService — 대회 기간·경기 일정 정합/diff 동기화", () => {
  const requester: JwtUserPayload = {
    id: "coach-1",
    email: "coach-1@t.dev",
    userType: "COACH",
  };

  /** KST 달력일 YYYY-MM-DD (오늘 + offsetDays) — 판정 마진 ±3일 이상으로 TZ 흔들림 무관. */
  const kstDateStr = (offsetDays: number) => {
    const k = new Date(
      Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000,
    );
    return k.toISOString().slice(0, 10);
  };
  /** dto scheduledAt 계약(오프셋 없는 KST 벽시계) — 서비스와 동일 파싱으로 왕복 등가 보장. */
  const wallClock = (dateStr: string) => `${dateStr}T14:00`;
  const utcMidnight = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);

  const baseTournament = (over: Record<string, unknown> = {}) => ({
    id: "trn-1",
    teamId: "team-1",
    name: "봄 대회",
    description: null,
    rinkId: null,
    venueId: null,
    status: "scheduled",
    startDate: utcMidnight(kstDateStr(3)),
    endDate: utcMidnight(kstDateStr(5)),
    eligibleBirthYearFrom: null,
    eligibleBirthYearTo: null,
    eligibleBirthYears: [],
    feePerGame: null,
    totalGames: null,
    feeType: null,
    maxParticipants: null,
    registrationDeadline: null,
    ageGroup: null,
    selectedParticipantIds: [],
    eligibleGroupIds: [],
    rules: null,
    location: null,
    prizeAmount: null,
    billingMode: "PREPAID",
    ...over,
  });

  const baseMatch = (over: Record<string, unknown> = {}) => ({
    id: "m-1",
    scheduledAt: new Date(wallClock(kstDateStr(4))),
    startedAt: null,
    endedAt: null,
    status: "scheduled",
    homeScore: 0,
    awayScore: 0,
    opponentName: "상대팀",
    venueId: null,
    venueName: null,
    matchOrder: 1,
    _count: { periods: 0, events: 0, gameExpenses: 0 },
    ...over,
  });

  const makeTx = () => ({
    tournament: {
      update: jest.fn().mockResolvedValue({ id: "trn-1" }),
      create: jest.fn().mockResolvedValue({ id: "trn-new", name: "봄 대회" }),
    },
    hockeyMatch: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  });

  const makePrisma = (tx: ReturnType<typeof makeTx>) => ({
    tournament: { findUnique: jest.fn() },
    hockeyMatch: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) =>
      cb(tx),
    ),
  });

  const makeAccess = () => ({
    assertManageableTournamentRecord: jest.fn().mockResolvedValue(undefined),
    assertTeamManager: jest.fn().mockResolvedValue(undefined),
    assertManageableMatch: jest.fn().mockResolvedValue(undefined),
  });

  const makeService = (prisma: unknown, access: unknown) =>
    new TournamentsService(
      prisma as never,
      {} as never,
      access as never,
      {} as never,
    );

  describe("createTournament — R3/R4/지난 날짜", () => {
    it("경기 일정이 있는데 기간 미입력이면 400 (R3)", async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const service = makeService(prisma, makeAccess());
      await expect(
        service.createTournament(
          {
            name: "봄 대회",
            matches: [{ scheduledAt: wallClock(kstDateStr(4)) }],
          } as never,
          requester,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("기간 밖 경기 날짜면 400 (R4)", async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const service = makeService(prisma, makeAccess());
      await expect(
        service.createTournament(
          {
            name: "봄 대회",
            startDate: kstDateStr(3),
            endDate: kstDateStr(5),
            matches: [{ scheduledAt: wallClock(kstDateStr(8)) }],
          } as never,
          requester,
        ),
      ).rejects.toThrow(/벗어난 경기 일정/);
    });

    it("지난 날짜 경기면 400", async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const service = makeService(prisma, makeAccess());
      await expect(
        service.createTournament(
          {
            name: "봄 대회",
            startDate: kstDateStr(-5),
            endDate: kstDateStr(5),
            matches: [{ scheduledAt: wallClock(kstDateStr(-3)) }],
          } as never,
          requester,
        ),
      ).rejects.toThrow(/지난 날짜/);
    });
  });

  describe("updateTournament — 기간 축소(R6)·기간 해제(R7)", () => {
    it("경기 미전송 + 기간 축소로 기존 경기가 밖이면 400", async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      prisma.tournament.findUnique.mockResolvedValue(baseTournament());
      prisma.hockeyMatch.findMany.mockResolvedValue([
        baseMatch({ scheduledAt: new Date(wallClock(kstDateStr(5))) }),
      ]);
      const service = makeService(prisma, makeAccess());
      await expect(
        service.updateTournament(
          "trn-1",
          { startDate: kstDateStr(3), endDate: kstDateStr(4) } as never,
          requester,
        ),
      ).rejects.toThrow(/벗어난 경기 일정/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("경기가 남아 있는데 기간 해제(null)면 400", async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      prisma.tournament.findUnique.mockResolvedValue(baseTournament());
      prisma.hockeyMatch.findMany.mockResolvedValue([baseMatch()]);
      const service = makeService(prisma, makeAccess());
      await expect(
        service.updateTournament(
          "trn-1",
          { startDate: null, endDate: null } as never,
          requester,
        ),
      ).rejects.toThrow(/기간을 입력해야/);
    });
  });

  describe("updateTournament — matches diff 동기화", () => {
    it("무변경 행 미접촉 · 신규 생성 · 빠진 행 삭제를 단일 트랜잭션으로 수행", async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const keepAt = wallClock(kstDateStr(4));
      const kept = baseMatch({
        id: "m-keep",
        scheduledAt: new Date(keepAt),
        matchOrder: 1,
      });
      const removed = baseMatch({ id: "m-del", matchOrder: 2 });
      prisma.tournament.findUnique.mockResolvedValue(baseTournament());
      prisma.hockeyMatch.findMany.mockResolvedValue([kept, removed]);
      const service = makeService(prisma, makeAccess());

      await service.updateTournament(
        "trn-1",
        {
          matches: [
            {
              id: "m-keep",
              opponentName: "상대팀",
              scheduledAt: keepAt,
              matchOrder: 1,
            },
            { opponentName: "새 상대", scheduledAt: wallClock(kstDateStr(5)) },
          ],
        } as never,
        requester,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // 무변경 행(m-keep)은 미접촉 — update 호출 없음.
      expect(tx.hockeyMatch.update).not.toHaveBeenCalled();
      expect(tx.hockeyMatch.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["m-del"] }, tournamentId: "trn-1" },
      });
      expect(tx.hockeyMatch.createMany).toHaveBeenCalledTimes(1);
      const createArg = tx.hockeyMatch.createMany.mock.calls[0][0];
      expect(createArg.data).toHaveLength(1);
      expect(createArg.data[0]).toMatchObject({
        tournamentId: "trn-1",
        opponentName: "새 상대",
      });
    });

    it("최종 집합의 신규 경기가 기간 밖이면 400 (최종 상태 기준 R4)", async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      prisma.tournament.findUnique.mockResolvedValue(baseTournament());
      prisma.hockeyMatch.findMany.mockResolvedValue([]);
      const service = makeService(prisma, makeAccess());
      await expect(
        service.updateTournament(
          "trn-1",
          { matches: [{ scheduledAt: wallClock(kstDateStr(8)) }] } as never,
          requester,
        ),
      ).rejects.toThrow(/벗어난 경기 일정/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("기록(피리어드) 보유 경기를 빠뜨리면(삭제 시도) 400", async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      prisma.tournament.findUnique.mockResolvedValue(baseTournament());
      prisma.hockeyMatch.findMany.mockResolvedValue([
        baseMatch({
          id: "m-played",
          _count: { periods: 3, events: 5, gameExpenses: 0 },
        }),
      ]);
      const service = makeService(prisma, makeAccess());
      await expect(
        service.updateTournament("trn-1", { matches: [] } as never, requester),
      ).rejects.toThrow(/삭제할 수 없습니다/);
    });

    it("지난 경기의 일정 변경은 400 (무변경 왕복은 통과)", async () => {
      const tx = makeTx();
      const prisma = makePrisma(tx);
      const pastAt = wallClock(kstDateStr(-3));
      const pastMatch = baseMatch({
        id: "m-past",
        scheduledAt: new Date(pastAt),
        matchOrder: 1,
      });
      // 진행 중 대회(종료일 미래) — 지난 경기가 섞여 있는 상태.
      prisma.tournament.findUnique.mockResolvedValue(
        baseTournament({ startDate: utcMidnight(kstDateStr(-4)) }),
      );
      prisma.hockeyMatch.findMany.mockResolvedValue([pastMatch]);
      const service = makeService(prisma, makeAccess());

      // 변경 시도 → 불가침 400.
      await expect(
        service.updateTournament(
          "trn-1",
          {
            matches: [
              { id: "m-past", scheduledAt: wallClock(kstDateStr(4)) },
            ],
          } as never,
          requester,
        ),
      ).rejects.toThrow(/수정할 수 없습니다/);

      // 무변경 왕복 → 미접촉 통과.
      await expect(
        service.updateTournament(
          "trn-1",
          {
            matches: [
              {
                id: "m-past",
                opponentName: "상대팀",
                scheduledAt: pastAt,
                matchOrder: 1,
              },
            ],
          } as never,
          requester,
        ),
      ).resolves.toBeDefined();
      expect(tx.hockeyMatch.update).not.toHaveBeenCalled();
      expect(tx.hockeyMatch.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("deleteMatch — 기록 보유 경기 삭제 차단", () => {
    it("피리어드/이벤트/경비가 있으면 400", async () => {
      const prisma = {
        hockeyMatch: {
          findUnique: jest.fn().mockResolvedValue(
            baseMatch({
              _count: { periods: 0, events: 0, gameExpenses: 1 },
            }),
          ),
          delete: jest.fn(),
        },
      };
      const service = makeService(prisma, makeAccess());
      await expect(service.deleteMatch("m-1", requester)).rejects.toThrow(
        /삭제할 수 없습니다/,
      );
      expect(prisma.hockeyMatch.delete).not.toHaveBeenCalled();
    });

    it("기록 없는 지난 경기는 오입력 정리로 삭제 허용", async () => {
      const prisma = {
        hockeyMatch: {
          findUnique: jest.fn().mockResolvedValue(
            baseMatch({
              scheduledAt: new Date(wallClock(kstDateStr(-3))),
            }),
          ),
          delete: jest.fn().mockResolvedValue({}),
        },
      };
      const service = makeService(prisma, makeAccess());
      await expect(
        service.deleteMatch("m-1", requester),
      ).resolves.toMatchObject({ id: "m-1" });
      expect(prisma.hockeyMatch.delete).toHaveBeenCalledTimes(1);
    });
  });
});
