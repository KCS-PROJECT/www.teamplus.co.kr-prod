import { PrismaService } from "@/prisma/prisma.service";
import {
  resolveNoticeManageTeamIds,
  normalizeTargetTeamId,
  isNoticeSystemRole,
  isNoticeTeamScopedRole,
} from "./notice-manage-scope.util";

/**
 * 공지 관리 권한 SoT — 열람 SoT 와 분리된 쓰기 전용 집합.
 * (Phase 0 · F-03 · F-04 · F-EX-03 · F-EX-04)
 */
describe("notice-manage-scope.util", () => {
  const USER_ID = "user-1";

  let prisma: {
    team: { findMany: jest.Mock };
    teamMember: { findMany: jest.Mock };
  };

  const asPrisma = () => prisma as unknown as PrismaService;

  beforeEach(() => {
    prisma = {
      team: { findMany: jest.fn().mockResolvedValue([]) },
      teamMember: { findMany: jest.fn().mockResolvedValue([]) },
    };
  });

  describe("resolveNoticeManageTeamIds", () => {
    it("팀 소유자(active Team.coachId)를 포함한다", async () => {
      prisma.team.findMany.mockResolvedValue([{ id: "team-owned" }]);

      await expect(
        resolveNoticeManageTeamIds(asPrisma(), USER_ID, "DIRECTOR"),
      ).resolves.toEqual(["team-owned"]);
    });

    it("승인된 관리 역할 멤버십을 포함한다", async () => {
      prisma.teamMember.findMany.mockResolvedValue([{ teamId: "team-coach" }]);

      await expect(
        resolveNoticeManageTeamIds(asPrisma(), USER_ID, "COACH"),
      ).resolves.toEqual(["team-coach"]);
    });

    it("소유 팀과 멤버십 팀을 중복 없이 합집합한다", async () => {
      prisma.team.findMany.mockResolvedValue([{ id: "team-a" }]);
      prisma.teamMember.findMany.mockResolvedValue([
        { teamId: "team-a" },
        { teamId: "team-b" },
      ]);

      const result = await resolveNoticeManageTeamIds(
        asPrisma(),
        USER_ID,
        "DIRECTOR",
      );

      expect(result.sort()).toEqual(["team-a", "team-b"]);
    });

    it("소유 팀 조회는 활성 팀만 대상으로 한다", async () => {
      await resolveNoticeManageTeamIds(asPrisma(), USER_ID, "DIRECTOR");

      expect(prisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coachId: USER_ID, isActive: true },
        }),
      );
    });

    it("멤버십 조회도 비활성 팀을 제외한다 (Codex Round 8 체크포인트)", async () => {
      await resolveNoticeManageTeamIds(asPrisma(), USER_ID, "COACH");

      expect(prisma.teamMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ team: { isActive: true } }),
        }),
      );
    });

    it("미승인(pending)·탈퇴 멤버십을 제외한다 — F-03", async () => {
      await resolveNoticeManageTeamIds(asPrisma(), USER_ID, "COACH");

      expect(prisma.teamMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            approvalStatus: "approved",
            leftAt: null,
          }),
        }),
      );
    });

    it("관리 역할(HEAD_COACH·COACH·MANAGER)만 포함하고 PLAYER 를 제외한다", async () => {
      await resolveNoticeManageTeamIds(asPrisma(), USER_ID, "COACH");

      const where = prisma.teamMember.findMany.mock.calls[0][0].where;
      expect(where.roleInTeam.in).toEqual(["HEAD_COACH", "COACH", "MANAGER"]);
      expect(where.roleInTeam.in).not.toContain("PLAYER");
    });

    it("CoachProfile 을 권한 근거로 조회하지 않는다 — F-03·F-04", async () => {
      await resolveNoticeManageTeamIds(asPrisma(), USER_ID, "COACH");

      expect(
        (prisma as unknown as { coachProfile?: unknown }).coachProfile,
      ).toBeUndefined();
    });

    it("ACADEMY_DIRECTOR 는 조회 없이 빈 배열을 반환한다 — F-EX-03", async () => {
      await expect(
        resolveNoticeManageTeamIds(asPrisma(), USER_ID, "ACADEMY_DIRECTOR"),
      ).resolves.toEqual([]);

      expect(prisma.team.findMany).not.toHaveBeenCalled();
      expect(prisma.teamMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe("normalizeTargetTeamId — F-EX-04", () => {
    it("null·undefined 를 전역(null) 요청으로 본다", () => {
      expect(normalizeTargetTeamId(null)).toBeNull();
      expect(normalizeTargetTeamId(undefined)).toBeNull();
    });

    it("빈 문자열·공백 문자열도 전역(null) 요청으로 통일한다 (고아 공지 차단)", () => {
      expect(normalizeTargetTeamId("")).toBeNull();
      expect(normalizeTargetTeamId("   ")).toBeNull();
    });

    it("실제 팀 ID 는 트림해서 보존한다", () => {
      expect(normalizeTargetTeamId("team-1")).toBe("team-1");
      expect(normalizeTargetTeamId(" team-1 ")).toBe("team-1");
    });
  });

  describe("역할 판정 헬퍼", () => {
    it("시스템 역할 3종만 전체 공지를 관리한다", () => {
      expect(isNoticeSystemRole("ADMIN")).toBe(true);
      expect(isNoticeSystemRole("SYSTEM")).toBe(true);
      expect(isNoticeSystemRole("OPER")).toBe(true);
      expect(isNoticeSystemRole("DIRECTOR")).toBe(false);
      expect(isNoticeSystemRole(undefined)).toBe(false);
    });

    it("팀 공지 관리 역할에서 ACADEMY_DIRECTOR 를 제외한다", () => {
      expect(isNoticeTeamScopedRole("DIRECTOR")).toBe(true);
      expect(isNoticeTeamScopedRole("COACH")).toBe(true);
      expect(isNoticeTeamScopedRole("ACADEMY_DIRECTOR")).toBe(false);
      expect(isNoticeTeamScopedRole("PARENT")).toBe(false);
    });
  });
});
