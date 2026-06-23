import { Test, TestingModule } from "@nestjs/testing";
import { ChildProfileController } from "./child-profile.controller";
import { ChildProfileService } from "./child-profile.service";
import { BadRequestException, NotFoundException } from "@nestjs/common";

describe("ChildProfileController", () => {
  let controller: ChildProfileController;

  const mockUserId = "user-uuid";

  const mockProfile = {
    id: "profile-uuid",
    userId: mockUserId,
    firstName: "철수",
    lastName: "김",
    birthDate: new Date("2018-06-15T00:00:00Z"),
    age: 7,
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockClub = {
    teamId: "club-uuid",
    teamCode: "ACE-hockey",
    name: "서울 아이스 클럽",
    coachName: "이순신 감독",
    location: "서울시 강남구",
    playerName: "김철수",
    playerAge: 7,
    joinedAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockChildProfileService = {
    createChildProfile: jest.fn(),
    getChildProfile: jest.fn(),
    updateChildProfile: jest.fn(),
    getChildClubs: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChildProfileController],
      providers: [
        {
          provide: ChildProfileService,
          useValue: mockChildProfileService,
        },
      ],
    }).compile();

    controller = module.get<ChildProfileController>(ChildProfileController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/child-profile", () => {
    const mockRequest = { user: { id: mockUserId } } as any;
    const createDto = {
      firstName: "철수",
      lastName: "김",
      birthDate: new Date("2018-06-15"),
    };

    it("should create child profile successfully", async () => {
      mockChildProfileService.createChildProfile.mockResolvedValue(mockProfile);

      const result = await controller.createChildProfile(
        mockRequest,
        createDto,
      );

      expect(result.id).toBe("profile-uuid");
      expect(result.firstName).toBe("철수");
      expect(mockChildProfileService.createChildProfile).toHaveBeenCalledWith(
        mockUserId,
        createDto,
      );
    });

    it("should throw BadRequestException if profile already exists", async () => {
      mockChildProfileService.createChildProfile.mockRejectedValue(
        new BadRequestException("이미 프로필이 존재합니다."),
      );

      await expect(
        controller.createChildProfile(mockRequest, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if age is invalid", async () => {
      mockChildProfileService.createChildProfile.mockRejectedValue(
        new BadRequestException("나이가 유효하지 않습니다."),
      );

      await expect(
        controller.createChildProfile(mockRequest, createDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("GET /api/v1/child-profile", () => {
    const mockRequest = { user: { id: mockUserId } } as any;

    it("should return child profile", async () => {
      mockChildProfileService.getChildProfile.mockResolvedValue(mockProfile);

      const result = await controller.getChildProfile(mockRequest);

      expect(result.id).toBe("profile-uuid");
      expect(result.firstName).toBe("철수");
      expect(result.age).toBe(7);
      expect(mockChildProfileService.getChildProfile).toHaveBeenCalledWith(
        mockUserId,
      );
    });

    it("should throw NotFoundException if profile not found", async () => {
      mockChildProfileService.getChildProfile.mockRejectedValue(
        new NotFoundException("프로필을 찾을 수 없습니다."),
      );

      await expect(controller.getChildProfile(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("PUT /api/v1/child-profile", () => {
    const mockRequest = { user: { id: mockUserId } } as any;
    const updateDto = { firstName: "민수" };

    it("should update child profile", async () => {
      const updatedProfile = { ...mockProfile, firstName: "민수" };
      mockChildProfileService.updateChildProfile.mockResolvedValue(
        updatedProfile,
      );

      const result = await controller.updateChildProfile(
        mockRequest,
        updateDto,
      );

      expect(result.firstName).toBe("민수");
      expect(mockChildProfileService.updateChildProfile).toHaveBeenCalledWith(
        mockUserId,
        updateDto,
      );
    });

    it("should throw NotFoundException if profile not found", async () => {
      mockChildProfileService.updateChildProfile.mockRejectedValue(
        new NotFoundException("프로필을 찾을 수 없습니다."),
      );

      await expect(
        controller.updateChildProfile(mockRequest, updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("GET /api/v1/child-profile/clubs", () => {
    const mockRequest = { user: { id: mockUserId } } as any;

    it("should return child clubs", async () => {
      const clubs = [mockClub, { ...mockClub, teamId: "club-2" }];
      mockChildProfileService.getChildClubs.mockResolvedValue(clubs);

      const result = await controller.getChildClubs(mockRequest);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(mockChildProfileService.getChildClubs).toHaveBeenCalledWith(
        mockUserId,
      );
    });

    it("should return empty array if no clubs", async () => {
      mockChildProfileService.getChildClubs.mockResolvedValue([]);

      const result = await controller.getChildClubs(mockRequest);

      expect(result).toEqual([]);
    });
  });

  describe("Error Handling", () => {
    it("should propagate service errors", async () => {
      const mockRequest = { user: { id: mockUserId } } as any;
      const error = new Error("Service error");
      mockChildProfileService.getChildProfile.mockRejectedValue(error);

      await expect(controller.getChildProfile(mockRequest)).rejects.toThrow(
        error,
      );
    });
  });
});
