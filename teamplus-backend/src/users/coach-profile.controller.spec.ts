import { Test, TestingModule } from "@nestjs/testing";
import { CoachProfileController } from "./coach-profile.controller";
import { CoachProfileService } from "./coach-profile.service";
import { BadRequestException, NotFoundException } from "@nestjs/common";

describe("CoachProfileController", () => {
  let controller: CoachProfileController;

  const mockUserId = "user-uuid";
  const mockClubId = "club-uuid";

  const mockProfile = {
    id: "profile-uuid",
    userId: mockUserId,
    firstName: "이순신",
    lastName: "감독",
    teamId: mockClubId,
    team: {
      id: mockClubId,
      teamCode: "ACE-hockey",
      name: "서울 아이스 클럽",
      coachName: "이순신",
      location: "서울시 강남구",
      phone: "010-1234-5678",
    },
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockClub = {
    id: mockClubId,
    teamCode: "ACE-hockey",
    name: "서울 아이스 클럽",
    coachName: "이순신",
    phone: "010-1234-5678",
    location: "서울시 강남구",
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockStatistics = {
    teamId: mockClubId,
    totalMembers: 25,
    approvedMembers: 22,
    pendingMembers: 3,
    approvalRate: "88.0",
  };

  const mockClass = {
    id: "class-uuid",
    className: "신규 수강생반",
    instructorName: "김철수",
    capacity: 15,
    startTime: "16:00",
    endTime: "17:00",
    isActive: true,
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockCoachProfileService = {
    createCoachProfile: jest.fn(),
    getCoachProfile: jest.fn(),
    updateCoachProfile: jest.fn(),
    getCoachClub: jest.fn(),
    getClubStatistics: jest.fn(),
    getCoachClasses: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoachProfileController],
      providers: [
        {
          provide: CoachProfileService,
          useValue: mockCoachProfileService,
        },
      ],
    }).compile();

    controller = module.get<CoachProfileController>(CoachProfileController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/coach-profile", () => {
    const mockRequest = { user: { id: mockUserId } } as any;
    const createDto = {
      firstName: "이순신",
      lastName: "감독",
      teamId: mockClubId,
    };

    it("should create coach profile successfully", async () => {
      mockCoachProfileService.createCoachProfile.mockResolvedValue(mockProfile);

      const result = await controller.createCoachProfile(
        mockRequest,
        createDto,
      );

      expect(result.id).toBe("profile-uuid");
      expect(result.firstName).toBe("이순신");
      expect(result.teamId).toBe(mockClubId);
      expect(mockCoachProfileService.createCoachProfile).toHaveBeenCalledWith(
        mockUserId,
        createDto,
      );
    });

    it("should throw BadRequestException if profile already exists", async () => {
      mockCoachProfileService.createCoachProfile.mockRejectedValue(
        new BadRequestException("이미 프로필이 존재합니다."),
      );

      await expect(
        controller.createCoachProfile(mockRequest, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if club not found", async () => {
      mockCoachProfileService.createCoachProfile.mockRejectedValue(
        new BadRequestException("클럽이 없습니다."),
      );

      await expect(
        controller.createCoachProfile(mockRequest, createDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("GET /api/v1/coach-profile", () => {
    const mockRequest = { user: { id: mockUserId } } as any;

    it("should return coach profile with club info", async () => {
      mockCoachProfileService.getCoachProfile.mockResolvedValue(mockProfile);

      const result = await controller.getCoachProfile(mockRequest);

      expect(result.id).toBe("profile-uuid");
      expect(result.firstName).toBe("이순신");
      expect(result.team).toBeDefined();
      expect(result.team.name).toBe("서울 아이스 클럽");
      expect(mockCoachProfileService.getCoachProfile).toHaveBeenCalledWith(
        mockUserId,
      );
    });

    it("should throw NotFoundException if profile not found", async () => {
      mockCoachProfileService.getCoachProfile.mockRejectedValue(
        new NotFoundException("프로필을 찾을 수 없습니다."),
      );

      await expect(controller.getCoachProfile(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("PUT /api/v1/coach-profile", () => {
    const mockRequest = { user: { id: mockUserId } } as any;
    const updateDto = { firstName: "세종" };

    it("should update coach profile", async () => {
      const updatedProfile = { ...mockProfile, firstName: "세종" };
      mockCoachProfileService.updateCoachProfile.mockResolvedValue(
        updatedProfile,
      );

      const result = await controller.updateCoachProfile(
        mockRequest,
        updateDto,
      );

      expect(result.firstName).toBe("세종");
      expect(mockCoachProfileService.updateCoachProfile).toHaveBeenCalledWith(
        mockUserId,
        updateDto,
      );
    });

    it("should throw NotFoundException if profile not found", async () => {
      mockCoachProfileService.updateCoachProfile.mockRejectedValue(
        new NotFoundException("프로필을 찾을 수 없습니다."),
      );

      await expect(
        controller.updateCoachProfile(mockRequest, updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("GET /api/v1/coach-profile/club", () => {
    const mockRequest = { user: { id: mockUserId } } as any;

    it("should return coach club info", async () => {
      mockCoachProfileService.getCoachClub.mockResolvedValue(mockClub);

      const result = await controller.getCoachClub(mockRequest);

      expect(result.id).toBe(mockClubId);
      expect(result.name).toBe("서울 아이스 클럽");
      expect(result.coachName).toBe("이순신");
      expect(mockCoachProfileService.getCoachClub).toHaveBeenCalledWith(
        mockUserId,
      );
    });

    it("should throw NotFoundException if profile not found", async () => {
      mockCoachProfileService.getCoachClub.mockRejectedValue(
        new NotFoundException("프로필을 찾을 수 없습니다."),
      );

      await expect(controller.getCoachClub(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("GET /api/v1/coach-profile/club/statistics", () => {
    const mockRequest = { user: { id: mockUserId } } as any;

    it("should return club member statistics", async () => {
      mockCoachProfileService.getClubStatistics.mockResolvedValue(
        mockStatistics,
      );

      const result = await controller.getClubStatistics(mockRequest);

      expect(result.teamId).toBe(mockClubId);
      expect(result.totalMembers).toBe(25);
      expect(result.approvedMembers).toBe(22);
      expect(result.pendingMembers).toBe(3);
      expect(result.approvalRate).toBe("88.0");
      expect(mockCoachProfileService.getClubStatistics).toHaveBeenCalledWith(
        mockUserId,
      );
    });

    it("should throw NotFoundException if profile not found", async () => {
      mockCoachProfileService.getClubStatistics.mockRejectedValue(
        new NotFoundException("프로필을 찾을 수 없습니다."),
      );

      await expect(controller.getClubStatistics(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("GET /api/v1/coach-profile/club/classes", () => {
    const mockRequest = { user: { id: mockUserId } } as any;

    it("should return club classes list", async () => {
      const classes = [
        mockClass,
        { ...mockClass, id: "class-2", className: "중급반" },
      ];
      mockCoachProfileService.getCoachClasses.mockResolvedValue(classes);

      const result = await controller.getCoachClasses(mockRequest);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].className).toBe("신규 수강생반");
      expect(mockCoachProfileService.getCoachClasses).toHaveBeenCalledWith(
        mockUserId,
      );
    });

    it("should return empty array if no classes", async () => {
      mockCoachProfileService.getCoachClasses.mockResolvedValue([]);

      const result = await controller.getCoachClasses(mockRequest);

      expect(result).toEqual([]);
    });

    it("should throw NotFoundException if profile not found", async () => {
      mockCoachProfileService.getCoachClasses.mockRejectedValue(
        new NotFoundException("프로필을 찾을 수 없습니다."),
      );

      await expect(controller.getCoachClasses(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("Error Handling", () => {
    it("should propagate service errors", async () => {
      const mockRequest = { user: { id: mockUserId } } as any;
      const error = new Error("Service error");
      mockCoachProfileService.getCoachProfile.mockRejectedValue(error);

      await expect(controller.getCoachProfile(mockRequest)).rejects.toThrow(
        error,
      );
    });
  });

  describe("API Response Format", () => {
    it("should return correct profile structure", async () => {
      mockCoachProfileService.getCoachProfile.mockResolvedValue(mockProfile);
      const mockRequest = { user: { id: mockUserId } } as any;

      const result = await controller.getCoachProfile(mockRequest);

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("userId");
      expect(result).toHaveProperty("firstName");
      expect(result).toHaveProperty("lastName");
      expect(result).toHaveProperty("teamId");
      expect(result).toHaveProperty("club");
    });

    it("should return correct statistics structure", async () => {
      mockCoachProfileService.getClubStatistics.mockResolvedValue(
        mockStatistics,
      );
      const mockRequest = { user: { id: mockUserId } } as any;

      const result = await controller.getClubStatistics(mockRequest);

      expect(result).toHaveProperty("teamId");
      expect(result).toHaveProperty("totalMembers");
      expect(result).toHaveProperty("approvedMembers");
      expect(result).toHaveProperty("pendingMembers");
      expect(result).toHaveProperty("approvalRate");
    });
  });
});
