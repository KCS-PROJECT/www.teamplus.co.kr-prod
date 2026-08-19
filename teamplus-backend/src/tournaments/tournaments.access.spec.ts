import { ForbiddenException, BadRequestException } from "@nestjs/common";
import { TournamentsService } from "./tournaments.service";
import { TournamentsController } from "./tournaments.controller";
import { PaymentsController } from "@/payments/payments.controller";
import { ROLES_KEY } from "@/auth/roles.decorator";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * Phase 0 보안 회귀 스펙 — 대회 도메인.
 *
 * 증명 대상 (Codex 1차 검증 지적 7):
 *  1) 컨트롤러가 req.user 를 서비스로 실제 전달하는지 (배선)
 *  2) 서비스가 관리 권한 단언 실패 시 즉시 중단하고 쓰기를 수행하지 않는지
 *  3) 메서드 레벨 @Roles 가 클래스 레벨을 덮어써도 ACADEMY_DIRECTOR 가 남지 않는지 (메타데이터)
 *  4) 대회 목록의 명시 teamId 가 관리 팀 교집합으로 제한되는지
 */
describe("Tournaments Phase 0 access", () => {
  const requester: JwtUserPayload = {
    id: "coach-1",
    email: "coach-1@t.dev",
    userType: "COACH",
  };

  const forbidden = new ForbiddenException("이 팀을 관리할 권한이 없습니다.");

  const makePrismaMock = () => ({
    user: { findUnique: jest.fn() },
    team: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    teamMember: { findFirst: jest.fn(), findMany: jest.fn() },
    coachProfile: { findMany: jest.fn() },
    tournament: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    tournamentRegistration: { findMany: jest.fn(), updateMany: jest.fn() },
    hockeyMatch: {
      aggregate: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    matchEvent: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    matchPeriod: { upsert: jest.fn() },
    $transaction: jest.fn(),
  });

  const makeAccessMock = (reject: boolean) => ({
    assertManageableTournament: reject
      ? jest.fn().mockRejectedValue(forbidden)
      : jest.fn().mockResolvedValue({ id: "trn-1", teamId: "team-1" }),
    assertManageableTournamentRecord: reject
      ? jest.fn().mockRejectedValue(forbidden)
      : jest.fn().mockResolvedValue(undefined),
    assertTeamManager: reject
      ? jest.fn().mockRejectedValue(forbidden)
      : jest.fn().mockResolvedValue(undefined),
    assertManageableMatch: reject
      ? jest.fn().mockRejectedValue(forbidden)
      : jest.fn().mockResolvedValue({ id: "match-1", tournamentId: "trn-1" }),
    assertManageableMatchRecord: reject
      ? jest.fn().mockRejectedValue(forbidden)
      : jest.fn().mockResolvedValue(undefined),
  });

  const makeService = (prisma: any, access: any) =>
    new TournamentsService(prisma, { } as any, access, {} as any);

  // ─── 2) 서비스: 비관리자 차단 + 쓰기 미수행 ────────────────────────
  describe("서비스 가드 배선 — 타 팀 관리자 차단", () => {
    it.each([
      ["deleteTournament", (s: TournamentsService) => s.deleteTournament("trn-1", requester)],
      ["changeTournamentStatus", (s: TournamentsService) => s.changeTournamentStatus("trn-1", "ongoing", requester)],
      ["getTournamentSummary", (s: TournamentsService) => s.getTournamentSummary("trn-1", requester)],
      ["getEligiblePlayers", (s: TournamentsService) => s.getEligiblePlayers("trn-1", requester)],
    ])("%s: assert 거부 시 Forbidden 전파 + 쓰기 미수행", async (_name, call) => {
      const prisma = makePrismaMock();
      const service = makeService(prisma, makeAccessMock(true));
      await expect(call(service)).rejects.toThrow(ForbiddenException);
      expect(prisma.tournament.delete).not.toHaveBeenCalled();
      expect(prisma.tournament.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("updateTournament: 기존 대회 fetch 후 record 단언 거부 시 Forbidden + update 미수행", async () => {
      const prisma = makePrismaMock();
      prisma.tournament.findUnique.mockResolvedValue({
        id: "trn-1",
        teamId: "team-1",
        status: "scheduled",
        endDate: null,
        startDate: new Date("2099-01-01"),
        ageGroup: "ALL",
      });
      const service = makeService(prisma, makeAccessMock(true));
      await expect(
        service.updateTournament("trn-1", {} as any, requester),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.tournament.update).not.toHaveBeenCalled();
    });

    it("getTournamentRegistrations: record 단언 거부 시 참가자 조회 미수행", async () => {
      const prisma = makePrismaMock();
      prisma.tournament.findUnique.mockResolvedValue({
        id: "trn-1",
        teamId: "team-1",
      });
      const service = makeService(prisma, makeAccessMock(true));
      await expect(
        service.getTournamentRegistrations("trn-1", requester),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.tournamentRegistration.findMany).not.toHaveBeenCalled();
    });

    it("confirm/cancelTournamentSettlement: record 단언 거부 시 트랜잭션 미수행", async () => {
      const prisma = makePrismaMock();
      prisma.tournament.findUnique.mockResolvedValue({
        id: "trn-1",
        teamId: "team-1",
        name: "T",
        billingMode: "POSTPAID",
        status: "finished",
        endDate: new Date("2020-01-01"),
      });
      const service = makeService(prisma, makeAccessMock(true));
      await expect(
        service.confirmTournamentSettlement("trn-1", 10000, undefined, requester),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.cancelTournamentSettlement("trn-1", requester),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("createTournament: 비ADMIN 이 관리 팀 없이 생성 시 400 (teamId=null 대회 ADMIN 전용)", async () => {
      const prisma = makePrismaMock();
      prisma.team.findFirst.mockResolvedValue(null);
      prisma.teamMember.findFirst.mockResolvedValue(null);
      const service = makeService(prisma, makeAccessMock(false));
      await expect(
        service.createTournament(
          { startDate: "2099-01-01", endDate: "2099-01-02", name: "T" } as any,
          requester,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("createTournament: 전달 teamId 의 관리 권한 단언 거부 시 Forbidden", async () => {
      const prisma = makePrismaMock();
      prisma.team.findUnique.mockResolvedValue({ id: "team-2" });
      const service = makeService(prisma, makeAccessMock(true));
      await expect(
        service.createTournament(
          {
            startDate: "2099-01-01",
            endDate: "2099-01-02",
            name: "T",
            teamId: "team-2",
          } as any,
          requester,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── 경기(HockeyMatch) 쓰기 가드 — Codex 2차 지적 ─────────────────
  describe("경기 관리 API 가드 — 타 팀 관리자 차단·쓰기 미수행", () => {
    it.each([
      ["updateMatch", (s: TournamentsService) => s.updateMatch("match-1", {} as any, requester)],
      ["deleteMatch", (s: TournamentsService) => s.deleteMatch("match-1", requester)],
      ["addMatchParticipant", (s: TournamentsService) => s.addMatchParticipant("match-1", "team-2", "home", requester)],
      ["removeMatchParticipant", (s: TournamentsService) => s.removeMatchParticipant("match-1", "team-2", requester)],
      ["updateMatchScore", (s: TournamentsService) => s.updateMatchScore("match-1", {} as any, requester)],
      ["updateMatchLiveState", (s: TournamentsService) => s.updateMatchLiveState("match-1", {} as any, requester)],
      ["upsertMatchPeriod", (s: TournamentsService) => s.upsertMatchPeriod("match-1", {} as any, requester)],
      ["createMatchEvent", (s: TournamentsService) => s.createMatchEvent("match-1", {} as any, requester)],
      ["updateMatchEvent", (s: TournamentsService) => s.updateMatchEvent("match-1", "ev-1", {} as any, requester)],
      ["deleteMatchEvent", (s: TournamentsService) => s.deleteMatchEvent("match-1", "ev-1", requester)],
    ])("%s: 단언 거부 시 Forbidden 전파 + 쓰기·트랜잭션 미수행", async (_name, call) => {
      const prisma = makePrismaMock();
      const service = makeService(prisma, makeAccessMock(true));
      await expect(call(service)).rejects.toThrow(ForbiddenException);
      expect(prisma.hockeyMatch.create).not.toHaveBeenCalled();
      expect(prisma.hockeyMatch.update).not.toHaveBeenCalled();
      expect(prisma.hockeyMatch.delete).not.toHaveBeenCalled();
      expect(prisma.matchEvent.create).not.toHaveBeenCalled();
      expect(prisma.matchEvent.update).not.toHaveBeenCalled();
      expect(prisma.matchEvent.delete).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("createMatch: 생성 전 record 단언 거부 시 Forbidden + create 미수행 (대회 teamId 전달 확인)", async () => {
      const prisma = makePrismaMock();
      prisma.tournament.findUnique.mockResolvedValue({
        id: "trn-1",
        teamId: "team-1",
      });
      const access = makeAccessMock(true);
      const service = makeService(prisma, access);
      await expect(
        service.createMatch({ tournamentId: "trn-1" } as any, requester),
      ).rejects.toThrow(ForbiddenException);
      expect(access.assertManageableMatchRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          tournamentId: "trn-1",
          tournament: { teamId: "team-1" },
        }),
        requester,
      );
      expect(prisma.hockeyMatch.create).not.toHaveBeenCalled();
    });
  });

  // ─── 4) 목록 명시 teamId 교집합 ────────────────────────────────────
  describe("getTournaments — 명시 teamId 교집합 제한", () => {
    it("관리자(DIRECTOR)가 비관리 팀 teamId 를 지정하면 조회 없이 빈 배열", async () => {
      const prisma = makePrismaMock();
      prisma.user.findUnique.mockResolvedValue({
        id: "dir-1",
        userType: "DIRECTOR",
      });
      // resolveManagedTeamIds 구성 요소 — 관리 팀 = team-1 뿐
      prisma.teamMember.findMany.mockResolvedValue([{ teamId: "team-1" }]);
      prisma.coachProfile.findMany.mockResolvedValue([]);
      prisma.team.findMany.mockResolvedValue([]);
      const service = makeService(prisma, makeAccessMock(false));
      const result = await service.getTournaments("team-999", "dir-1");
      expect(result).toEqual([]);
      expect(prisma.tournament.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── 1) 컨트롤러 배선: req.user 전달 ──────────────────────────────
  describe("컨트롤러 → 서비스 req.user 전달", () => {
    const serviceMock: Record<string, jest.Mock> = {
      deleteTournament: jest.fn(),
      changeTournamentStatus: jest.fn(),
      getTournamentSummary: jest.fn(),
      getEligiblePlayers: jest.fn(),
      getTournamentRegistrations: jest.fn(),
      confirmTournamentSettlement: jest.fn(),
      cancelTournamentSettlement: jest.fn(),
      createTournament: jest.fn(),
      updateTournament: jest.fn(),
      createMatch: jest.fn(),
      updateMatch: jest.fn(),
      deleteMatch: jest.fn(),
      addMatchParticipant: jest.fn(),
      removeMatchParticipant: jest.fn(),
      updateMatchScore: jest.fn(),
      updateMatchLiveState: jest.fn(),
      upsertMatchPeriod: jest.fn(),
      createMatchEvent: jest.fn(),
      updateMatchEvent: jest.fn(),
      deleteMatchEvent: jest.fn(),
    };
    const controller = new TournamentsController(serviceMock as any);
    const req = { user: requester } as any;

    it("delete/status/summary/eligible/registrations 에 req.user 가 전달된다", async () => {
      await controller.deleteTournament("trn-1", req);
      expect(serviceMock.deleteTournament).toHaveBeenCalledWith("trn-1", requester);

      await controller.changeTournamentStatus("trn-1", { status: "ongoing" } as any, req);
      expect(serviceMock.changeTournamentStatus).toHaveBeenCalledWith("trn-1", "ongoing", requester);

      await controller.getTournamentSummary("trn-1", req);
      expect(serviceMock.getTournamentSummary).toHaveBeenCalledWith("trn-1", requester);

      await controller.getEligiblePlayers("trn-1", req);
      expect(serviceMock.getEligiblePlayers).toHaveBeenCalledWith("trn-1", requester);

      await controller.getTournamentRegistrations("trn-1", req);
      expect(serviceMock.getTournamentRegistrations).toHaveBeenCalledWith("trn-1", requester);
    });

    it("정산 confirm/cancel·create/update 에 req.user 가 전달된다", async () => {
      await controller.confirmTournamentSettlement(
        "trn-1",
        { feePerPerson: 10000 } as any,
        req,
      );
      expect(serviceMock.confirmTournamentSettlement).toHaveBeenCalledWith(
        "trn-1",
        10000,
        undefined,
        requester,
      );

      await controller.cancelTournamentSettlement("trn-1", req);
      expect(serviceMock.cancelTournamentSettlement).toHaveBeenCalledWith("trn-1", requester);

      await controller.createTournament({ name: "T" } as any, req);
      expect(serviceMock.createTournament).toHaveBeenCalledWith({ name: "T" }, requester);

      await controller.updateTournament("trn-1", { name: "T2" } as any, req);
      expect(serviceMock.updateTournament).toHaveBeenCalledWith("trn-1", { name: "T2" }, requester);
    });

    it("경기 쓰기 11개 핸들러 전부에 req.user 가 전달된다", async () => {
      await controller.createMatch({ tournamentId: "trn-1" } as any, req);
      expect(serviceMock.createMatch).toHaveBeenCalledWith(
        { tournamentId: "trn-1" },
        requester,
      );

      await controller.updateMatch("match-1", { note: "n" } as any, req);
      expect(serviceMock.updateMatch).toHaveBeenCalledWith("match-1", { note: "n" }, requester);

      await controller.deleteMatch("match-1", req);
      expect(serviceMock.deleteMatch).toHaveBeenCalledWith("match-1", requester);

      await controller.addMatchParticipant("match-1", "team-1", "home", req);
      expect(serviceMock.addMatchParticipant).toHaveBeenCalledWith(
        "match-1",
        "team-1",
        "home",
        requester,
      );

      await controller.removeMatchParticipant("match-1", "team-1", req);
      expect(serviceMock.removeMatchParticipant).toHaveBeenCalledWith(
        "match-1",
        "team-1",
        requester,
      );

      await controller.updateMatchScore("match-1", { homeScore: 1 } as any, req);
      expect(serviceMock.updateMatchScore).toHaveBeenCalledWith(
        "match-1",
        { homeScore: 1 },
        requester,
      );

      await controller.updateMatchLiveState("match-1", { state: "live" } as any, req);
      expect(serviceMock.updateMatchLiveState).toHaveBeenCalledWith(
        "match-1",
        { state: "live" },
        requester,
      );

      await controller.upsertMatchPeriod("match-1", { period: 1 } as any, req);
      expect(serviceMock.upsertMatchPeriod).toHaveBeenCalledWith(
        "match-1",
        { period: 1 },
        requester,
      );

      await controller.createMatchEvent("match-1", { type: "goal" } as any, req);
      expect(serviceMock.createMatchEvent).toHaveBeenCalledWith(
        "match-1",
        { type: "goal" },
        requester,
      );

      await controller.updateMatchEvent("match-1", "ev-1", { type: "goal" } as any, req);
      expect(serviceMock.updateMatchEvent).toHaveBeenCalledWith(
        "match-1",
        "ev-1",
        { type: "goal" },
        requester,
      );

      await controller.deleteMatchEvent("match-1", "ev-1", req);
      expect(serviceMock.deleteMatchEvent).toHaveBeenCalledWith(
        "match-1",
        "ev-1",
        requester,
      );
    });
  });

  // ─── 3) @Roles 메타데이터: ACADEMY_DIRECTOR 부재 증명 ─────────────
  describe("@Roles 메타데이터 — ACADEMY_DIRECTOR 차단 (메서드 레벨 덮어쓰기 대응)", () => {
    const rolesOf = (target: object | Function): string[] | undefined =>
      Reflect.getMetadata(ROLES_KEY, target);

    it("TournamentsController 클래스 레벨에 ACADEMY_DIRECTOR 가 없다", () => {
      expect(rolesOf(TournamentsController)).not.toContain("ACADEMY_DIRECTOR");
    });

    it("메서드 레벨 @Roles(클래스 덮어쓰기)에도 ACADEMY_DIRECTOR 가 없다", () => {
      const proto = TournamentsController.prototype as Record<string, any>;
      // 메서드 @Roles 가 있는 모든 핸들러를 전수 검사 — 신규 핸들러 추가 시 자동 커버.
      const handlerNames = Object.getOwnPropertyNames(proto).filter(
        (name) =>
          name !== "constructor" &&
          typeof proto[name] === "function" &&
          rolesOf(proto[name]) !== undefined,
      );
      expect(handlerNames.length).toBeGreaterThan(0);
      for (const name of handlerNames) {
        expect(rolesOf(proto[name])).not.toContain("ACADEMY_DIRECTOR");
      }
    });

    it("팀 인별 미수금 목록·상세·알림 발송에 ACADEMY_DIRECTOR 가 없다", () => {
      // 레거시 admin/director-payment-summary 3핸들러 → payments/team-settlement-center/unpaid-members 이관.
      const proto = PaymentsController.prototype as Record<string, any>;
      expect(rolesOf(proto.getTeamUnpaidMembers)).not.toContain(
        "ACADEMY_DIRECTOR",
      );
      expect(rolesOf(proto.getTeamUnpaidMemberDetail)).not.toContain(
        "ACADEMY_DIRECTOR",
      );
      expect(rolesOf(proto.sendTeamUnpaidReminder)).not.toContain(
        "ACADEMY_DIRECTOR",
      );
    });
  });
});
