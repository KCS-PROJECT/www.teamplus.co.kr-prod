import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ResourceAccessService } from "./resource-access.service";
import { PrismaService } from "@/prisma/prisma.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * Phase 0 IDOR 가드 단위 검증.
 *
 * 취약점 재현→차단 증명: 역할만 맞고 소속이 없는 요청자(타 팀 코치,
 * 오픈클래스 감독의 팀 자원 접근 등)가 Forbidden 으로 차단되는지,
 * 정상 관리자(owner/승인 멤버/디렉터/active 코치/ADMIN)는 통과하는지 확인한다.
 */
describe("ResourceAccessService", () => {
  let service: ResourceAccessService;

  const prismaMock = {
    class: { findUnique: jest.fn() },
    team: { findFirst: jest.fn() },
    teamMember: { findFirst: jest.fn() },
    academy: { findUnique: jest.fn() },
    academyCoach: { findUnique: jest.fn() },
    tournament: { findUnique: jest.fn() },
    hockeyMatch: { findUnique: jest.fn() },
  };

  const asUser = (
    id: string,
    userType: string,
  ): JwtUserPayload => ({ id, email: `${id}@t.dev`, userType });

  const admin = asUser("admin-1", "ADMIN");
  const teamCoach = asUser("coach-1", "COACH");
  const otherCoach = asUser("coach-999", "COACH");
  const academyDirector = asUser("acadir-1", "ACADEMY_DIRECTOR");

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceAccessService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(ResourceAccessService);
  });

  // ─── 팀 관리자 판정 ─────────────────────────────────────────────
  describe("assertTeamManager", () => {
    it("팀 owner(coachId)는 통과한다", async () => {
      prismaMock.team.findFirst.mockResolvedValue({ id: "team-1" });
      prismaMock.teamMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertTeamManager("team-1", teamCoach),
      ).resolves.toBeUndefined();
    });

    it("승인된 관리 멤버(HEAD_COACH/COACH/MANAGER)는 통과한다", async () => {
      prismaMock.team.findFirst.mockResolvedValue(null);
      prismaMock.teamMember.findFirst.mockResolvedValue({ id: "tm-1" });
      await expect(
        service.assertTeamManager("team-1", teamCoach),
      ).resolves.toBeUndefined();
    });

    it("[IDOR 차단] 소속 없는 타 팀 코치는 Forbidden", async () => {
      prismaMock.team.findFirst.mockResolvedValue(null);
      prismaMock.teamMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertTeamManager("team-1", otherCoach),
      ).rejects.toThrow(ForbiddenException);
    });

    it("ADMIN 은 소속 조회 없이 통과한다", async () => {
      await expect(
        service.assertTeamManager("team-1", admin),
      ).resolves.toBeUndefined();
      expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    });

    it("[관리자급] SYSTEM/OPER 도 통과한다 (RolesGuard 자동 통과 기준 정합)", async () => {
      await expect(
        service.assertTeamManager("team-1", asUser("sys-1", "SYSTEM")),
      ).resolves.toBeUndefined();
      await expect(
        service.assertTeamManager("team-1", asUser("oper-1", "OPER")),
      ).resolves.toBeUndefined();
      expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    });

    it("[역할 게이트] ACADEMY_DIRECTOR 는 승인 TeamMember 소속이 있어도 팀 관리 차단", async () => {
      // 소속 레코드가 존재하는 상황을 명시적으로 mock — 역할 게이트가 소속 검사보다 선행함을 증명.
      prismaMock.team.findFirst.mockResolvedValue(null);
      prismaMock.teamMember.findFirst.mockResolvedValue({ id: "tm-cross" });
      await expect(
        service.assertTeamManager("team-1", academyDirector),
      ).rejects.toThrow(ForbiddenException);
      // 역할 게이트에서 즉시 차단 — 소속 조회 자체가 실행되지 않는다.
      expect(prismaMock.teamMember.findFirst).not.toHaveBeenCalled();
    });

    it("[역할 게이트] PARENT 등 비관리 역할은 팀 관리 차단", async () => {
      await expect(
        service.assertTeamManager("team-1", asUser("p-1", "PARENT")),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── 오픈클래스(Academy) 관리자 판정 ────────────────────────────
  describe("assertAcademyManager", () => {
    it("Academy.directorId 본인은 통과한다", async () => {
      prismaMock.academy.findUnique.mockResolvedValue({
        directorId: academyDirector.id,
      });
      await expect(
        service.assertAcademyManager("aca-1", academyDirector),
      ).resolves.toBeUndefined();
    });

    it("active AcademyCoach 는 통과한다", async () => {
      prismaMock.academy.findUnique.mockResolvedValue({
        directorId: "someone-else",
      });
      prismaMock.academyCoach.findUnique.mockResolvedValue({ isActive: true });
      await expect(
        service.assertAcademyManager("aca-1", teamCoach),
      ).resolves.toBeUndefined();
    });

    it("[IDOR 차단] 비활성 코치·무관 사용자는 Forbidden", async () => {
      prismaMock.academy.findUnique.mockResolvedValue({
        directorId: "someone-else",
      });
      prismaMock.academyCoach.findUnique.mockResolvedValue({
        isActive: false,
      });
      await expect(
        service.assertAcademyManager("aca-1", otherCoach),
      ).rejects.toThrow(ForbiddenException);
    });

    it("[역할 게이트] DIRECTOR 는 active AcademyCoach 소속이 있어도 Academy 관리 차단", async () => {
      const director = asUser("dir-1", "DIRECTOR");
      prismaMock.academy.findUnique.mockResolvedValue({
        directorId: "someone-else",
      });
      prismaMock.academyCoach.findUnique.mockResolvedValue({ isActive: true });
      await expect(
        service.assertAcademyManager("aca-1", director),
      ).rejects.toThrow(ForbiddenException);
      // 역할 게이트 선행 — Academy 소속 조회 자체가 실행되지 않는다.
      expect(prismaMock.academy.findUnique).not.toHaveBeenCalled();
    });

    it("[관리자급] SYSTEM/OPER 는 Academy 관리도 통과한다", async () => {
      await expect(
        service.assertAcademyManager("aca-1", asUser("sys-1", "SYSTEM")),
      ).resolves.toBeUndefined();
    });
  });

  // ─── 수업 도메인 분기 ───────────────────────────────────────────
  describe("assertManageableClass / Record", () => {
    it("수업 미존재 시 NotFound", async () => {
      prismaMock.class.findUnique.mockResolvedValue(null);
      await expect(
        service.assertManageableClass("nope", teamCoach),
      ).rejects.toThrow(NotFoundException);
    });

    it("팀 수업은 팀 관리자 검증으로 분기한다", async () => {
      prismaMock.class.findUnique.mockResolvedValue({
        id: "class-1",
        teamId: "team-1",
        academyId: null,
      });
      prismaMock.team.findFirst.mockResolvedValue({ id: "team-1" });
      prismaMock.teamMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertManageableClass("class-1", teamCoach),
      ).resolves.toEqual({ id: "class-1", teamId: "team-1", academyId: null });
    });

    it("[도메인 분리] 오픈클래스 감독은 팀 수업에 접근할 수 없다", async () => {
      prismaMock.class.findUnique.mockResolvedValue({
        id: "class-1",
        teamId: "team-1",
        academyId: null,
      });
      prismaMock.team.findFirst.mockResolvedValue(null);
      prismaMock.teamMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertManageableClass("class-1", academyDirector),
      ).rejects.toThrow(ForbiddenException);
    });

    it("[도메인 분리] 팀 코치는 무관 오픈클래스 수업에 접근할 수 없다", async () => {
      prismaMock.class.findUnique.mockResolvedValue({
        id: "class-2",
        teamId: null,
        academyId: "aca-1",
      });
      prismaMock.academy.findUnique.mockResolvedValue({
        directorId: "someone-else",
      });
      prismaMock.academyCoach.findUnique.mockResolvedValue(null);
      await expect(
        service.assertManageableClass("class-2", teamCoach),
      ).rejects.toThrow(ForbiddenException);
    });

    it("오픈클래스 수업은 Academy 관리자 검증으로 통과한다", async () => {
      prismaMock.class.findUnique.mockResolvedValue({
        id: "class-2",
        teamId: null,
        academyId: "aca-1",
      });
      prismaMock.academy.findUnique.mockResolvedValue({
        directorId: academyDirector.id,
      });
      await expect(
        service.assertManageableClass("class-2", academyDirector),
      ).resolves.toBeTruthy();
    });

    it("팀도 아카데미도 없는 수업은 ADMIN 외 Forbidden", async () => {
      await expect(
        service.assertManageableClassRecord(
          { teamId: null, academyId: null },
          teamCoach,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.assertManageableClassRecord(
          { teamId: null, academyId: null },
          admin,
        ),
      ).resolves.toBeUndefined();
    });
  });

  // ─── 대회 관리 범위 ────────────────────────────────────────────
  describe("assertManageableTournament / Record", () => {
    it("대회 미존재 시 NotFound", async () => {
      prismaMock.tournament.findUnique.mockResolvedValue(null);
      await expect(
        service.assertManageableTournament("nope", teamCoach),
      ).rejects.toThrow(NotFoundException);
    });

    it("주최 팀 관리자는 통과한다", async () => {
      prismaMock.tournament.findUnique.mockResolvedValue({
        id: "trn-1",
        teamId: "team-1",
      });
      prismaMock.team.findFirst.mockResolvedValue({ id: "team-1" });
      prismaMock.teamMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertManageableTournament("trn-1", teamCoach),
      ).resolves.toEqual({ id: "trn-1", teamId: "team-1" });
    });

    it("[IDOR 차단] 타 팀 코치는 대회 관리 Forbidden", async () => {
      prismaMock.tournament.findUnique.mockResolvedValue({
        id: "trn-1",
        teamId: "team-1",
      });
      prismaMock.team.findFirst.mockResolvedValue(null);
      prismaMock.teamMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertManageableTournament("trn-1", otherCoach),
      ).rejects.toThrow(ForbiddenException);
    });

    it("[정책 v4.0] teamId=null 대회는 비ADMIN Forbidden, ADMIN 통과", async () => {
      prismaMock.tournament.findUnique.mockResolvedValue({
        id: "trn-2",
        teamId: null,
      });
      await expect(
        service.assertManageableTournament("trn-2", teamCoach),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.assertManageableTournament("trn-2", admin),
      ).resolves.toEqual({ id: "trn-2", teamId: null });
    });
  });

  // ─── 경기(HockeyMatch) 관리 범위 — Codex 2차 지적 ─────────────────
  describe("assertManageableMatch / Record", () => {
    const baseMatch = {
      id: "match-1",
      tournamentId: null as string | null,
      homeTeamId: null as string | null,
      awayTeamId: null as string | null,
      homeClubId: null as string | null,
      awayClubId: null as string | null,
      tournament: null as { teamId: string | null } | null,
    };

    it("경기 미존재 시 NotFound", async () => {
      prismaMock.hockeyMatch.findUnique.mockResolvedValue(null);
      await expect(
        service.assertManageableMatch("nope", teamCoach),
      ).rejects.toThrow(NotFoundException);
    });

    it("대회 소속 경기는 대회 관리 규칙을 재사용한다 (주최 팀 관리자 통과)", async () => {
      prismaMock.hockeyMatch.findUnique.mockResolvedValue({
        ...baseMatch,
        tournamentId: "trn-1",
        tournament: { teamId: "team-1" },
      });
      prismaMock.team.findFirst.mockResolvedValue({ id: "team-1" });
      prismaMock.teamMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertManageableMatch("match-1", teamCoach),
      ).resolves.toEqual({ id: "match-1", tournamentId: "trn-1" });
    });

    it("[IDOR 차단] 대회 소속 경기 — 타 팀 코치는 Forbidden", async () => {
      prismaMock.hockeyMatch.findUnique.mockResolvedValue({
        ...baseMatch,
        tournamentId: "trn-1",
        tournament: { teamId: "team-1" },
      });
      prismaMock.team.findFirst.mockResolvedValue(null);
      prismaMock.teamMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertManageableMatch("match-1", otherCoach),
      ).rejects.toThrow(ForbiddenException);
    });

    it("독립 경기(tournamentId=null)는 home/away 팀 중 하나의 관리자면 통과", async () => {
      prismaMock.hockeyMatch.findUnique.mockResolvedValue({
        ...baseMatch,
        awayTeamId: "team-1",
      });
      // team-1 의 owner
      prismaMock.team.findFirst.mockResolvedValue({ id: "team-1" });
      prismaMock.teamMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertManageableMatch("match-1", teamCoach),
      ).resolves.toBeTruthy();
    });

    it("[IDOR 차단] 독립 경기 — 어느 팀도 관리하지 않으면 Forbidden", async () => {
      prismaMock.hockeyMatch.findUnique.mockResolvedValue({
        ...baseMatch,
        homeTeamId: "team-1",
        awayTeamId: "team-2",
      });
      prismaMock.team.findFirst.mockResolvedValue(null);
      prismaMock.teamMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertManageableMatch("match-1", otherCoach),
      ).rejects.toThrow(ForbiddenException);
    });

    it("[정책] 소속 팀이 전혀 없는 독립 경기는 비ADMIN Forbidden, 관리자급 통과", async () => {
      prismaMock.hockeyMatch.findUnique.mockResolvedValue({ ...baseMatch });
      await expect(
        service.assertManageableMatch("match-1", teamCoach),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.assertManageableMatch("match-1", admin),
      ).resolves.toBeTruthy();
    });

    it("[역할 게이트] ACADEMY_DIRECTOR 는 독립 경기도 차단", async () => {
      prismaMock.hockeyMatch.findUnique.mockResolvedValue({
        ...baseMatch,
        homeTeamId: "team-1",
      });
      await expect(
        service.assertManageableMatch("match-1", academyDirector),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    });
  });
});
