import { Test, TestingModule } from "@nestjs/testing";
import { ParentProfileController } from "./parent-profile.controller";
import { ParentProfileService } from "./parent-profile.service";
import { BadRequestException, NotFoundException } from "@nestjs/common";

describe("ParentProfileController", () => {
  let controller: ParentProfileController;

  const mockUserId = "user-uuid";
  const mockChildUserId = "child-uuid";

  const mockProfile = {
    id: "profile-uuid",
    userId: mockUserId,
    firstName: "순신",
    lastName: "이",
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockChild = {
    id: "child-profile-uuid",
    userId: mockChildUserId,
    firstName: "철수",
    lastName: "김",
    birthDate: new Date("2018-06-15"),
    age: 7,
  };

  const mockParentProfileService = {
    createParentProfile: jest.fn(),
    getParentProfile: jest.fn(),
    updateParentProfile: jest.fn(),
    getChildren: jest.fn(),
    addChild: jest.fn(),
    removeChild: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentProfileController],
      providers: [
        {
          provide: ParentProfileService,
          useValue: mockParentProfileService,
        },
      ],
    }).compile();

    controller = module.get<ParentProfileController>(ParentProfileController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/parent-profile", () => {
    const mockRequest = { user: { id: mockUserId } } as any;
    const createDto = { firstName: "순신", lastName: "이" };

    it("should create parent profile successfully", async () => {
      mockParentProfileService.createParentProfile.mockResolvedValue(
        mockProfile,
      );

      const result = await controller.createParentProfile(
        mockRequest,
        createDto,
      );

      expect(result.id).toBe("profile-uuid");
      expect(result.firstName).toBe("순신");
      expect(mockParentProfileService.createParentProfile).toHaveBeenCalledWith(
        mockUserId,
        createDto,
      );
    });

    it("should throw BadRequestException if profile already exists", async () => {
      mockParentProfileService.createParentProfile.mockRejectedValue(
        new BadRequestException("이미 프로필이 존재합니다."),
      );

      await expect(
        controller.createParentProfile(mockRequest, createDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("GET /api/v1/parent-profile", () => {
    const mockRequest = { user: { id: mockUserId } } as any;

    it("should return parent profile", async () => {
      mockParentProfileService.getParentProfile.mockResolvedValue(mockProfile);

      const result = await controller.getParentProfile(mockRequest);

      expect(result.id).toBe("profile-uuid");
      expect(result.firstName).toBe("순신");
      expect(mockParentProfileService.getParentProfile).toHaveBeenCalledWith(
        mockUserId,
      );
    });

    it("should throw NotFoundException if profile not found", async () => {
      mockParentProfileService.getParentProfile.mockRejectedValue(
        new NotFoundException("프로필을 찾을 수 없습니다."),
      );

      await expect(controller.getParentProfile(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("PUT /api/v1/parent-profile", () => {
    const mockRequest = { user: { id: mockUserId } } as any;
    const updateDto = { firstName: "세종" };

    it("should update parent profile", async () => {
      const updatedProfile = { ...mockProfile, firstName: "세종" };
      mockParentProfileService.updateParentProfile.mockResolvedValue(
        updatedProfile,
      );

      const result = await controller.updateParentProfile(
        mockRequest,
        updateDto,
      );

      expect(result.firstName).toBe("세종");
      expect(mockParentProfileService.updateParentProfile).toHaveBeenCalledWith(
        mockUserId,
        updateDto,
      );
    });

    it("should throw NotFoundException if profile not found", async () => {
      mockParentProfileService.updateParentProfile.mockRejectedValue(
        new NotFoundException("프로필을 찾을 수 없습니다."),
      );

      await expect(
        controller.updateParentProfile(mockRequest, updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("GET /api/v1/parent-profile/children", () => {
    const mockRequest = { user: { id: mockUserId } } as any;

    it("should return children list", async () => {
      const children = [
        mockChild,
        { ...mockChild, id: "child-2", firstName: "민수" },
      ];
      mockParentProfileService.getChildren.mockResolvedValue(children);

      const result = await controller.getChildren(mockRequest);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(mockParentProfileService.getChildren).toHaveBeenCalledWith(
        mockUserId,
      );
    });

    it("should return empty array if no children", async () => {
      mockParentProfileService.getChildren.mockResolvedValue([]);

      const result = await controller.getChildren(mockRequest);

      expect(result).toEqual([]);
    });
  });

  describe("POST /api/v1/parent-profile/children/:childUserId", () => {
    const mockRequest = { user: { id: mockUserId } } as any;

    const addChildDto = { birthDate: "2016-03-15" };

    it("should add child successfully", async () => {
      const updatedProfile = {
        id: "profile-uuid",
        children: [mockChildUserId],
        updatedAt: new Date(),
      };
      mockParentProfileService.addChild.mockResolvedValue(updatedProfile);

      const result = await controller.addChild(
        mockRequest,
        mockChildUserId,
        addChildDto,
      );

      expect(result.id).toBe("profile-uuid");
      expect(mockParentProfileService.addChild).toHaveBeenCalledWith(
        mockUserId,
        mockChildUserId,
        addChildDto.birthDate,
      );
    });

    it("should throw BadRequestException if child already added", async () => {
      mockParentProfileService.addChild.mockRejectedValue(
        new BadRequestException("이미 추가된 자녀입니다."),
      );

      await expect(
        controller.addChild(mockRequest, mockChildUserId, addChildDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException if child not found", async () => {
      mockParentProfileService.addChild.mockRejectedValue(
        new NotFoundException("자녀를 찾을 수 없습니다."),
      );

      await expect(
        controller.addChild(mockRequest, "non-existent", addChildDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("DELETE /api/v1/parent-profile/children/:childUserId", () => {
    const mockRequest = { user: { id: mockUserId } } as any;

    it("should remove child successfully", async () => {
      const updatedProfile = {
        id: "profile-uuid",
        children: [],
        updatedAt: new Date(),
      };
      mockParentProfileService.removeChild.mockResolvedValue(updatedProfile);

      const result = await controller.removeChild(mockRequest, mockChildUserId);

      expect(result.id).toBe("profile-uuid");
      expect(mockParentProfileService.removeChild).toHaveBeenCalledWith(
        mockUserId,
        mockChildUserId,
      );
    });

    it("should throw NotFoundException if profile not found", async () => {
      mockParentProfileService.removeChild.mockRejectedValue(
        new NotFoundException("프로필을 찾을 수 없습니다."),
      );

      await expect(
        controller.removeChild(mockRequest, mockChildUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if child not found in list", async () => {
      mockParentProfileService.removeChild.mockRejectedValue(
        new BadRequestException("해당 자녀를 찾을 수 없습니다."),
      );

      await expect(
        controller.removeChild(mockRequest, "non-existent"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("Error Handling", () => {
    it("should propagate service errors", async () => {
      const mockRequest = { user: { id: mockUserId } } as any;
      const error = new Error("Service error");
      mockParentProfileService.getParentProfile.mockRejectedValue(error);

      await expect(controller.getParentProfile(mockRequest)).rejects.toThrow(
        error,
      );
    });
  });
});
