import { Test, TestingModule } from "@nestjs/testing";
import { TeamsController } from "./teams.controller";
import { TeamsService } from "./teams.service";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CreateTeamDto } from "./dto/create-team.dto";
import { JoinTeamDto } from "./dto/join-team.dto";
import {
  ApproveMemberDto,
  MemberApprovalStatus,
} from "./dto/approve-member.dto";
import { BulkApproveMembersDto } from "./dto/bulk-approve.dto";

describe("TeamsController", () => {
  let controller: TeamsController;

  const mockClub = {
    id: "club-uuid",
    teamCode: "ACE-hockey",
    name: "서울 아이스 클럽",
    coachName: "이순신 감독",
    phoneNumber: "010-1234-5678",
    location: "서울시 강남구",
    description: "청소년 아이스하키 클럽",
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockMember = {
    id: "member-uuid",
    teamId: "club-uuid",
    name: "서울 아이스 클럽",
    playerName: "김철수",
    status: "pending",
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockApprovedMember = {
    id: "member-uuid",
    playerName: "김철수",
    status: "approved",
    approvedAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockUserClub = {
    id: "club-uuid",
    teamCode: "ACE-hockey",
    name: "서울 아이스 클럽",
    coachName: "이순신 감독",
    location: "서울시 강남구",
    role: "coach",
    joinedAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockBulkApproveResult = {
    approvedCount: 5,
    approvedMembers: [
      { id: "member-uuid-1", playerName: "김철수", status: "approved" },
      { id: "member-uuid-2", playerName: "이영희", status: "approved" },
    ],
  };

  const mockTeamsService = {
    createTeam: jest.fn(),
    getTeamByCode: jest.fn(),
    joinTeam: jest.fn(),
    getTeam: jest.fn(),
    getUserTeams: jest.fn(),
    updateTeam: jest.fn(),
    regenerateTeamCode: jest.fn(),
    approveMember: jest.fn(),
    getPendingMembers: jest.fn(),
    bulkApproveMembers: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
      ],
    }).compile();

    controller = module.get<TeamsController>(TeamsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/teams", () => {
    const createTeamDto: CreateTeamDto = {
      clubName: "서울 아이스 팀",
      phoneNumber: "01012345678",
      location: "서울시 강남구",
    };

    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should create team successfully", async () => {
      // Arrange
      mockTeamsService.createTeam.mockResolvedValue(mockClub);

      // Act
      const result = await controller.createTeam(mockRequest, createTeamDto);

      // Assert
      expect(result.id).toBe(mockClub.id);
      expect(result.teamCode).toBeDefined();
      expect(result.name).toBe(mockClub.name);
      expect(mockTeamsService.createTeam).toHaveBeenCalledWith(
        "coach-uuid",
        createTeamDto,
      );
    });

    it("should call teamsService with correct params", async () => {
      // Arrange
      mockTeamsService.createTeam.mockResolvedValue(mockClub);

      // Act
      await controller.createTeam(mockRequest, createTeamDto);

      // Assert
      expect(mockTeamsService.createTeam).toHaveBeenCalledWith(
        mockRequest.user.id,
        createTeamDto,
      );
      expect(mockTeamsService.createTeam).toHaveBeenCalledTimes(1);
    });

    it("should handle coach profile required error", async () => {
      // Arrange
      mockTeamsService.createTeam.mockRejectedValue(
        new ForbiddenException("감독 프로필이 필요합니다."),
      );

      // Act & Assert
      await expect(
        controller.createTeam(mockRequest, createTeamDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("GET /api/v1/teams/by-code/:teamCode", () => {
    it("should return team by code", async () => {
      // Arrange
      mockTeamsService.getTeamByCode.mockResolvedValue(mockClub);

      // Act
      const result = await controller.getTeamByCode("ACE-hockey");

      // Assert
      expect(result).toEqual(mockClub);
      expect(mockTeamsService.getTeamByCode).toHaveBeenCalledWith("ACE-hockey");
    });

    it("should handle team not found", async () => {
      // Arrange
      mockTeamsService.getTeamByCode.mockRejectedValue(
        new NotFoundException("팀을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(controller.getTeamByCode("INVALID-code")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("POST /api/v1/teams/join", () => {
    const joinTeamDto: JoinTeamDto = {
      teamCode: "ACE-hockey",
      playerName: "김철수",
      playerAge: 10,
    };

    const mockRequest = { user: { id: "parent-uuid" } } as any;

    it("should join team successfully", async () => {
      // Arrange
      mockTeamsService.joinTeam.mockResolvedValue(mockMember);

      // Act
      const result = await controller.joinTeam(mockRequest, joinTeamDto);

      // Assert
      expect(result.id).toBe(mockMember.id);
      expect(result.status).toBe("pending");
      expect(mockTeamsService.joinTeam).toHaveBeenCalledWith(
        "parent-uuid",
        joinTeamDto,
      );
    });

    it("should handle invalid player age error", async () => {
      // Arrange
      mockTeamsService.joinTeam.mockRejectedValue(
        new BadRequestException("올바른 선수 나이를 입력해주세요."),
      );

      // Act & Assert
      await expect(
        controller.joinTeam(mockRequest, { ...joinTeamDto, playerAge: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle team not found error", async () => {
      // Arrange
      mockTeamsService.joinTeam.mockRejectedValue(
        new NotFoundException("팀을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(
        controller.joinTeam(mockRequest, joinTeamDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should handle already joined error", async () => {
      // Arrange
      mockTeamsService.joinTeam.mockRejectedValue(
        new ConflictException("이미 가입되었거나 신청이 대기 중입니다."),
      );

      // Act & Assert
      await expect(
        controller.joinTeam(mockRequest, joinTeamDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("GET /api/v1/teams/:teamId", () => {
    // [수정 2026-05-21] getTeam 시그니처 — (teamId, callerUserId?, callerUserType?).
    //  callerUserType 은 매니저 역할 본인 권한 없는 팀 조회 차단 (정보 누출 방어) 용도.
    const mockRequest = {
      user: { id: "user-uuid", userType: "ADMIN" },
    } as any;

    it("should return team details", async () => {
      // Arrange
      mockTeamsService.getTeam.mockResolvedValue(mockClub);

      // Act
      const result = await controller.getTeam(mockRequest, "team-uuid");

      // Assert
      expect(result).toEqual(mockClub);
      expect(mockTeamsService.getTeam).toHaveBeenCalledWith(
        "team-uuid",
        "user-uuid",
        "ADMIN",
      );
    });

    it("should handle team not found", async () => {
      // Arrange
      mockTeamsService.getTeam.mockRejectedValue(
        new NotFoundException("팀을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(controller.getTeam(mockRequest, "invalid-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("GET /api/v1/teams/my/list", () => {
    const mockRequest = { user: { id: "user-uuid" } } as any;

    it("should return user teams", async () => {
      // Arrange
      mockTeamsService.getUserTeams.mockResolvedValue([mockUserClub]);

      // Act
      const result = await controller.getUserTeams(mockRequest);

      // Assert
      expect(result).toEqual([mockUserClub]);
      expect(mockTeamsService.getUserTeams).toHaveBeenCalledWith("user-uuid");
    });

    it("should return empty array if no teams", async () => {
      // Arrange
      mockTeamsService.getUserTeams.mockResolvedValue([]);

      // Act
      const result = await controller.getUserTeams(mockRequest);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("PUT /api/v1/teams/:teamId", () => {
    const updateData = { clubName: "수정된 팀명" };
    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should update team successfully", async () => {
      // Arrange
      const updatedTeam = { ...mockClub, ...updateData };
      mockTeamsService.updateTeam.mockResolvedValue(updatedTeam);

      // Act
      const result = await controller.updateTeam(
        mockRequest,
        "team-uuid",
        updateData,
      );

      // Assert
      expect(result.clubName).toBe("수정된 팀명");
      expect(mockTeamsService.updateTeam).toHaveBeenCalledWith(
        "coach-uuid",
        "team-uuid",
        updateData,
      );
    });

    it("should handle forbidden error", async () => {
      // Arrange
      mockTeamsService.updateTeam.mockRejectedValue(
        new ForbiddenException("감독만 수정할 수 있습니다."),
      );

      // Act & Assert
      await expect(
        controller.updateTeam(mockRequest, "team-uuid", updateData),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should handle team not found", async () => {
      // Arrange
      mockTeamsService.updateTeam.mockRejectedValue(
        new NotFoundException("팀을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(
        controller.updateTeam(mockRequest, "invalid-id", updateData),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("POST /api/v1/teams/:teamId/regenerate-code", () => {
    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should regenerate team code successfully", async () => {
      // Arrange
      const regeneratedResult = {
        id: "team-uuid",
        teamCode: "ELITE-glacier",
        regeneratedAt: new Date(),
      };
      mockTeamsService.regenerateTeamCode.mockResolvedValue(regeneratedResult);

      // Act
      const result = await controller.regenerateTeamCode(
        mockRequest,
        "team-uuid",
      );

      // Assert
      expect(result.teamCode).toBe("ELITE-glacier");
      expect(mockTeamsService.regenerateTeamCode).toHaveBeenCalledWith(
        "coach-uuid",
        "team-uuid",
      );
    });

    it("should handle forbidden error", async () => {
      // Arrange
      mockTeamsService.regenerateTeamCode.mockRejectedValue(
        new ForbiddenException("감독만 재생성할 수 있습니다."),
      );

      // Act & Assert
      await expect(
        controller.regenerateTeamCode(mockRequest, "team-uuid"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("PUT /api/v1/teams/:teamId/members/:memberId/approve", () => {
    const approveMemberDto: ApproveMemberDto = {
      status: MemberApprovalStatus.APPROVED,
    };

    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should approve member successfully", async () => {
      // Arrange
      mockTeamsService.approveMember.mockResolvedValue(mockApprovedMember);

      // Act
      const result = await controller.approveMember(
        mockRequest,
        "team-uuid",
        "member-uuid",
        approveMemberDto,
      );

      // Assert
      expect(result.status).toBe("approved");
      expect(mockTeamsService.approveMember).toHaveBeenCalledWith(
        "coach-uuid",
        "team-uuid",
        "member-uuid",
        approveMemberDto,
      );
    });

    it("should reject member successfully", async () => {
      // Arrange
      const rejectedMember = { ...mockApprovedMember, status: "rejected" };
      mockTeamsService.approveMember.mockResolvedValue(rejectedMember);

      // Act
      const result = await controller.approveMember(
        mockRequest,
        "team-uuid",
        "member-uuid",
        { status: MemberApprovalStatus.REJECTED },
      );

      // Assert
      expect(result.status).toBe("rejected");
    });

    it("should handle forbidden error", async () => {
      // Arrange
      mockTeamsService.approveMember.mockRejectedValue(
        new ForbiddenException("감독만 승인할 수 있습니다."),
      );

      // Act & Assert
      await expect(
        controller.approveMember(
          mockRequest,
          "team-uuid",
          "member-uuid",
          approveMemberDto,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should handle member not found", async () => {
      // Arrange
      mockTeamsService.approveMember.mockRejectedValue(
        new NotFoundException("팀 또는 회원을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(
        controller.approveMember(
          mockRequest,
          "team-uuid",
          "invalid-id",
          approveMemberDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("should handle already approved error", async () => {
      // Arrange
      mockTeamsService.approveMember.mockRejectedValue(
        new ConflictException("이미 승인된 회원입니다."),
      );

      // Act & Assert
      await expect(
        controller.approveMember(
          mockRequest,
          "team-uuid",
          "member-uuid",
          approveMemberDto,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("GET /api/v1/teams/:teamId/pending-members", () => {
    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should return pending members", async () => {
      // Arrange
      const pendingMembers = [
        {
          id: "member-uuid",
          playerName: "김철수",
          playerAge: 7,
          createdAt: new Date(),
          user: { email: "kim@example.com" },
        },
      ];
      mockTeamsService.getPendingMembers.mockResolvedValue(pendingMembers);

      // Act
      const result = await controller.getPendingMembers(
        mockRequest,
        "team-uuid",
      );

      // Assert
      expect(result).toEqual(pendingMembers);
      expect(mockTeamsService.getPendingMembers).toHaveBeenCalledWith(
        "coach-uuid",
        "team-uuid",
      );
    });

    it("should return empty array if no pending members", async () => {
      // Arrange
      mockTeamsService.getPendingMembers.mockResolvedValue([]);

      // Act
      const result = await controller.getPendingMembers(
        mockRequest,
        "team-uuid",
      );

      // Assert
      expect(result).toEqual([]);
    });

    it("should handle forbidden error", async () => {
      // Arrange
      mockTeamsService.getPendingMembers.mockRejectedValue(
        new ForbiddenException("감독만 조회할 수 있습니다."),
      );

      // Act & Assert
      await expect(
        controller.getPendingMembers(mockRequest, "team-uuid"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("POST /api/v1/teams/:teamId/members/bulk-approve", () => {
    const bulkApproveDto: BulkApproveMembersDto = {
      memberIds: ["member-uuid-1", "member-uuid-2", "member-uuid-3"],
    };

    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should bulk approve members successfully", async () => {
      // Arrange
      mockTeamsService.bulkApproveMembers.mockResolvedValue(
        mockBulkApproveResult,
      );

      // Act
      const result = await controller.bulkApproveMembers(
        mockRequest,
        "team-uuid",
        bulkApproveDto,
      );

      // Assert
      expect(result.approvedCount).toBe(5);
      expect(result.approvedMembers).toHaveLength(2);
      expect(mockTeamsService.bulkApproveMembers).toHaveBeenCalledWith(
        "coach-uuid",
        "team-uuid",
        bulkApproveDto,
      );
    });

    it("should handle forbidden error", async () => {
      // Arrange
      mockTeamsService.bulkApproveMembers.mockRejectedValue(
        new ForbiddenException("감독만 일괄 승인할 수 있습니다."),
      );

      // Act & Assert
      await expect(
        controller.bulkApproveMembers(mockRequest, "team-uuid", bulkApproveDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("API Response Format", () => {
    it("should return correct team creation response structure", async () => {
      // Arrange
      mockTeamsService.createTeam.mockResolvedValue(mockClub);
      const mockRequest = { user: { id: "coach-uuid" } } as any;

      // Act
      const result = await controller.createTeam(mockRequest, {
        clubName: "서울 아이스 팀",
        phoneNumber: "01012345678",
        location: "서울시 강남구",
      });

      // Assert
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("teamCode");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("createdAt");
    });

    it("should return correct join team response structure", async () => {
      // Arrange
      mockTeamsService.joinTeam.mockResolvedValue(mockMember);
      const mockRequest = { user: { id: "parent-uuid" } } as any;

      // Act
      const result = await controller.joinTeam(mockRequest, {
        teamCode: "ACE-hockey",
        playerName: "김철수",
        playerAge: 10,
      });

      // Assert
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("teamId");
      expect(result).toHaveProperty("playerName");
      expect(result).toHaveProperty("status");
    });

    it("should return correct user teams response structure", async () => {
      // Arrange
      mockTeamsService.getUserTeams.mockResolvedValue([mockUserClub]);
      const mockRequest = { user: { id: "user-uuid" } } as any;

      // Act
      const result = await controller.getUserTeams(mockRequest);

      // Assert
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("teamCode");
      expect(result[0]).toHaveProperty("name");
      expect(result[0]).toHaveProperty("role");
      expect(result[0]).toHaveProperty("joinedAt");
    });

    it("should return correct bulk approve response structure", async () => {
      // Arrange
      mockTeamsService.bulkApproveMembers.mockResolvedValue(
        mockBulkApproveResult,
      );
      const mockRequest = { user: { id: "coach-uuid" } } as any;

      // Act
      const result = await controller.bulkApproveMembers(
        mockRequest,
        "team-uuid",
        {
          memberIds: ["member-uuid-1"],
        },
      );

      // Assert
      expect(result).toHaveProperty("approvedCount");
      expect(result).toHaveProperty("approvedMembers");
      expect(Array.isArray(result.approvedMembers)).toBe(true);
    });
  });
});
