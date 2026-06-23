import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { TeamsService } from "./teams.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { NotificationsService } from "@/notifications/notifications.service";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { CreateTeamDto } from "./dto/create-team.dto";
import { JoinTeamDto } from "./dto/join-team.dto";
import {
  ApproveMemberDto,
  MemberApprovalStatus,
} from "./dto/approve-member.dto";

describe("TeamsService", () => {
  let service: TeamsService;
  const mockPrismaService = {
    coachProfile: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    team: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    teamMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    getConnectionStatus: jest.fn().mockReturnValue(true),
  };

  const mockNotificationsService = {
    notifyTeamManagers: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "redis") {
        return {
          keyPrefix: {
            club: "club:",
          },
          cacheTTL: {
            clubInfo: 600,
          },
        };
      }
      return undefined;
    }),
  };

  const mockCoachProfile = {
    id: "coach-profile-id",
    userId: "coach-user-id",
    firstName: "이순신",
    lastName: "감독",
    teamId: "team-id",
  };

  const mockClub = {
    id: "team-id",
    teamCode: "ACE-hockey",
    name: "서울 아이스 팀",
    coachId: "coach-profile-id",
    phone: "010-1234-5678",
    location: "서울시 강남구",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTeamMember = {
    id: "member-id",
    userId: "user-id",
    teamId: "team-id",
    playerName: "김철수",
    playerAge: 7,
    playerLevel: null,
    approvalStatus: "pending",
    joinedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    jest.clearAllMocks();
  });

  describe("createTeam", () => {
    const createTeamDto: CreateTeamDto = {
      clubName: "서울 아이스 팀",
      phoneNumber: "010-1234-5678",
      location: "서울시 강남구",
    };

    it("should create a new team successfully", async () => {
      // Arrange
      mockPrismaService.coachProfile.findUnique.mockResolvedValue(
        mockCoachProfile,
      );
      mockPrismaService.team.create.mockResolvedValue(mockClub);
      mockPrismaService.teamMember.create.mockResolvedValue({
        ...mockTeamMember,
        approvalStatus: "approved",
      });

      // Act
      const result = await service.createTeam("coach-user-id", createTeamDto);

      // Assert
      expect(result.clubName).toBe(createTeamDto.clubName);
      expect(result.phoneNumber).toBe(createTeamDto.phoneNumber);
      expect(result.teamCode).toBeDefined();
      expect(mockPrismaService.team.create).toHaveBeenCalled();
      expect(mockPrismaService.teamMember.create).toHaveBeenCalled();
    });

    it("should throw ForbiddenException if user is not a coach", async () => {
      // Arrange
      mockPrismaService.coachProfile.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createTeam("non-coach-user-id", createTeamDto),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.createTeam("non-coach-user-id", createTeamDto),
      ).rejects.toThrow("감독 프로필이 필요합니다.");
    });

    it("should generate unique team code", async () => {
      // Arrange
      mockPrismaService.coachProfile.findUnique.mockResolvedValue(
        mockCoachProfile,
      );
      mockPrismaService.team.create.mockResolvedValue(mockClub);
      mockPrismaService.teamMember.create.mockResolvedValue({
        ...mockTeamMember,
        approvalStatus: "approved",
      });

      // Act
      const result1 = await service.createTeam("coach-user-id", createTeamDto);

      // Assert
      expect(result1.teamCode).toMatch(/^[A-Z]+-[a-z]+$/);
      expect(["ACE", "PRO", "VIP", "ELITE", "STAR", "PEAK", "APEX"]).toContain(
        result1.teamCode.split("-")[0],
      );
    });

    it("should automatically add coach as team member with approved status", async () => {
      // Arrange
      mockPrismaService.coachProfile.findUnique.mockResolvedValue(
        mockCoachProfile,
      );
      mockPrismaService.team.create.mockResolvedValue(mockClub);
      mockPrismaService.teamMember.create.mockResolvedValue({
        ...mockTeamMember,
        approvalStatus: "approved",
      });

      // Act
      await service.createTeam("coach-user-id", createTeamDto);

      // Assert
      const memberCreateCall =
        mockPrismaService.teamMember.create.mock.calls[0];
      expect(memberCreateCall[0].data.approvalStatus).toBe("approved");
    });
  });

  describe("getTeamByCode", () => {
    it("should retrieve team by code with approved members", async () => {
      // Arrange
      const teamWithMembers = {
        ...mockClub,
        members: [
          {
            id: "member-1",
            playerName: "김철수",
            playerAge: 7,
          },
        ],
      };
      mockPrismaService.team.findUnique.mockResolvedValue(teamWithMembers);

      // Act
      const result = await service.getTeamByCode("ACE-hockey");

      // Assert
      expect(result.teamCode).toBe("ACE-hockey");
      expect(result.members).toHaveLength(1);
      expect(mockPrismaService.team.findUnique).toHaveBeenCalledWith({
        where: { teamCode: "ACE-hockey" },
        include: expect.any(Object),
      });
    });

    it("should throw NotFoundException if team not found", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getTeamByCode("INVALID-CODE")).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getTeamByCode("INVALID-CODE")).rejects.toThrow(
        "팀을 찾을 수 없습니다.",
      );
    });
  });

  describe("joinTeam", () => {
    const joinTeamDto: JoinTeamDto = {
      teamCode: "ACE-hockey",
      playerName: "김철수",
      playerAge: 7,
    };

    it("should allow user to join team with pending status", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(mockClub);
      mockPrismaService.teamMember.findUnique.mockResolvedValue(null);
      mockPrismaService.teamMember.create.mockResolvedValue(mockTeamMember);

      // Act
      const result = await service.joinTeam("user-id", joinTeamDto);

      // Assert
      expect(result.status).toBe("pending");
      expect(result.playerName).toBe(joinTeamDto.playerName);
      expect(mockPrismaService.teamMember.create).toHaveBeenCalledWith({
        data: {
          userId: "user-id",
          teamId: mockClub.id,
          playerName: joinTeamDto.playerName,
          playerAge: joinTeamDto.playerAge,
          approvalStatus: "pending",
        },
      });
    });

    it("should throw NotFoundException if team not found", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.joinTeam("user-id", joinTeamDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.joinTeam("user-id", joinTeamDto)).rejects.toThrow(
        "팀을 찾을 수 없습니다.",
      );
    });

    it("should throw ConflictException if already approved member", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(mockClub);
      mockPrismaService.teamMember.findUnique.mockResolvedValue({
        ...mockTeamMember,
        approvalStatus: "approved",
      });

      // Act & Assert
      await expect(service.joinTeam("user-id", joinTeamDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.joinTeam("user-id", joinTeamDto)).rejects.toThrow(
        "이미 가입된 팀입니다.",
      );
    });

    it("should throw ConflictException if application already pending", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(mockClub);
      mockPrismaService.teamMember.findUnique.mockResolvedValue(mockTeamMember);

      // Act & Assert
      await expect(service.joinTeam("user-id", joinTeamDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.joinTeam("user-id", joinTeamDto)).rejects.toThrow(
        "가입 신청이 대기 중입니다.",
      );
    });

    it("should validate player age", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(mockClub);
      mockPrismaService.teamMember.findUnique.mockResolvedValue(null);

      // Act & Assert - Age too high
      await expect(
        service.joinTeam("user-id", {
          ...joinTeamDto,
          playerAge: 150,
        }),
      ).rejects.toThrow(BadRequestException);

      // Age negative
      await expect(
        service.joinTeam("user-id", {
          ...joinTeamDto,
          playerAge: -1,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("approveMember", () => {
    const approveMemberDto: ApproveMemberDto = {
      status: MemberApprovalStatus.APPROVED,
    };

    it("should approve member if coach authorized", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(mockClub);
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(
        mockCoachProfile,
      );
      mockPrismaService.teamMember.findUnique.mockResolvedValue(mockTeamMember);
      mockPrismaService.teamMember.update.mockResolvedValue({
        ...mockTeamMember,
        approvalStatus: "approved",
        user: { id: "user-id", email: "user@example.com" },
      });

      // Act
      const result = await service.approveMember(
        "coach-user-id",
        "team-id",
        "member-id",
        approveMemberDto,
      );

      // Assert
      expect(result.status).toBe("approved");
      expect(mockPrismaService.teamMember.update).toHaveBeenCalledWith({
        where: { id: "member-id" },
        data: { approvalStatus: "approved" },
        include: expect.any(Object),
      });
    });

    it("should reject member if coach authorized with reject status", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(mockClub);
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(
        mockCoachProfile,
      );
      mockPrismaService.teamMember.findUnique.mockResolvedValue(mockTeamMember);
      mockPrismaService.teamMember.delete.mockResolvedValue(mockTeamMember);

      // Act
      const result = await service.approveMember(
        "coach-user-id",
        "team-id",
        "member-id",
        { status: MemberApprovalStatus.REJECTED },
      );

      // Assert
      expect(result.status).toBe("rejected");
      expect(mockPrismaService.teamMember.delete).toHaveBeenCalledWith({
        where: { id: "member-id" },
      });
    });

    it("should throw ForbiddenException if user is not coach", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(mockClub);
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.approveMember(
          "non-coach-id",
          "team-id",
          "member-id",
          approveMemberDto,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.approveMember(
          "non-coach-id",
          "team-id",
          "member-id",
          approveMemberDto,
        ),
      ).rejects.toThrow("이 팀의 감독만 회원을 승인할 수 있습니다.");
    });

    it("should throw NotFoundException if team not found", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.approveMember(
          "coach-user-id",
          "invalid-team-id",
          "member-id",
          approveMemberDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException if member not found", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(mockClub);
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(
        mockCoachProfile,
      );
      mockPrismaService.teamMember.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.approveMember(
          "coach-user-id",
          "team-id",
          "invalid-member-id",
          approveMemberDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException if already approved", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(mockClub);
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(
        mockCoachProfile,
      );
      mockPrismaService.teamMember.findUnique.mockResolvedValue({
        ...mockTeamMember,
        approvalStatus: "approved",
      });

      // Act & Assert
      await expect(
        service.approveMember(
          "coach-user-id",
          "team-id",
          "member-id",
          approveMemberDto,
        ),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.approveMember(
          "coach-user-id",
          "team-id",
          "member-id",
          approveMemberDto,
        ),
      ).rejects.toThrow("이미 승인된 회원입니다.");
    });
  });

  describe("getTeam", () => {
    it("should retrieve team with members", async () => {
      // Arrange
      const teamWithMembers = {
        ...mockClub,
        members: [
          {
            id: "member-1",
            playerName: "김철수",
            playerAge: 7,
            approvalStatus: "approved",
            joinedAt: new Date(),
          },
        ],
      };
      mockPrismaService.team.findUnique.mockResolvedValue(teamWithMembers);

      // Act
      const result = await service.getTeam("team-id");

      // Assert
      expect(result.name).toBe(mockClub.name);
      expect(result.members).toHaveLength(1);
    });

    it("should throw NotFoundException if team not found", async () => {
      // Arrange
      mockPrismaService.team.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getTeam("invalid-team-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getUserTeams", () => {
    it("should retrieve approved teams for user", async () => {
      // Arrange
      const userTeams = [
        {
          id: "member-1",
          userId: "user-id",
          teamId: "team-1",
          playerName: "김철수",
          playerAge: 7,
          playerLevel: null,
          approvalStatus: "approved",
          joinedAt: new Date(),
          team: {
            id: "team-1",
            teamCode: "ACE-hockey",
            name: "서울 아이스 팀",
            location: "서울시 강남구",
            createdAt: new Date(),
          },
        },
      ];
      mockPrismaService.teamMember.findMany.mockResolvedValue(userTeams);

      // Act
      const result = await service.getUserTeams("user-id");

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("서울 아이스 팀");
      expect(result[0].joinedAt).toBeDefined();
    });

    it("should return empty array if user has no approved teams", async () => {
      // Arrange
      mockPrismaService.teamMember.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getUserTeams("user-id");

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe("updateTeam", () => {
    const updateData: Partial<CreateTeamDto> = {
      clubName: "서울 빙상 팀",
      location: "서울시 서초구",
    };

    it("should update team info if user is coach", async () => {
      // Arrange
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(
        mockCoachProfile,
      );
      mockPrismaService.team.update.mockResolvedValue({
        ...mockClub,
        name: updateData.clubName,
        location: updateData.location,
      });

      // Act
      const result = await service.updateTeam(
        "coach-user-id",
        "team-id",
        updateData,
      );

      // Assert
      expect(result.name).toBe(updateData.clubName);
      expect(mockPrismaService.team.update).toHaveBeenCalled();
    });

    it("should throw ForbiddenException if user is not coach", async () => {
      // Arrange
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.updateTeam("non-coach-id", "team-id", updateData),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("regenerateTeamCode", () => {
    it("should regenerate team code if user is coach", async () => {
      // Arrange
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(
        mockCoachProfile,
      );
      const newCode = "ELITE-glacier";
      mockPrismaService.team.update.mockResolvedValue({
        ...mockClub,
        teamCode: newCode,
      });

      // Act
      const result = await service.regenerateTeamCode(
        "coach-user-id",
        "team-id",
      );

      // Assert
      expect(result.teamCode).toBe(newCode);
      expect(mockPrismaService.team.update).toHaveBeenCalledWith({
        where: { id: "team-id" },
        data: { teamCode: expect.any(String) },
      });
    });

    it("should throw ForbiddenException if user is not coach", async () => {
      // Arrange
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.regenerateTeamCode("non-coach-id", "team-id"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getPendingMembers", () => {
    it("should return pending members if user is coach", async () => {
      // Arrange
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(
        mockCoachProfile,
      );
      const pendingMembers = [
        {
          id: "member-1",
          playerName: "김철수",
          playerAge: 7,
          joinedAt: new Date(),
          user: { email: "kim@example.com" },
        },
      ];
      mockPrismaService.teamMember.findMany.mockResolvedValue(pendingMembers);

      // Act
      const result = await service.getPendingMembers(
        "coach-user-id",
        "team-id",
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].playerName).toBe("김철수");
      expect(mockPrismaService.teamMember.findMany).toHaveBeenCalledWith({
        where: {
          teamId: "team-id",
          approvalStatus: "pending",
        },
        select: expect.any(Object),
      });
    });

    it("should throw ForbiddenException if user is not coach", async () => {
      // Arrange
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getPendingMembers("non-coach-id", "team-id"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should return empty array if no pending members", async () => {
      // Arrange
      mockPrismaService.coachProfile.findFirst.mockResolvedValue(
        mockCoachProfile,
      );
      mockPrismaService.teamMember.findMany.mockResolvedValue([]);

      // Act
      const result = await service.getPendingMembers(
        "coach-user-id",
        "team-id",
      );

      // Assert
      expect(result).toHaveLength(0);
    });
  });
});
