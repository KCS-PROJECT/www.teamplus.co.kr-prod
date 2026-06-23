import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ParentProfileService } from "./parent-profile.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("ParentProfileService", () => {
  let service: ParentProfileService;
  let prismaService: PrismaService;

  const mockUserId = "user-123";
  const mockChildUserId1 = "child-user-1";
  const mockChildUserId2 = "child-user-2";
  const mockParentProfile = {
    id: "profile-123",
    userId: mockUserId,
    firstName: "이순신",
    lastName: "부모",
    children: [mockChildUserId1],
    createdAt: new Date("2026-01-04"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentProfileService,
        {
          provide: PrismaService,
          useValue: {
            parentProfile: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            childProfile: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            parentChild: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ParentProfileService>(ParentProfileService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createParentProfile", () => {
    it("should successfully create a parent profile", async () => {
      const createDto = {
        firstName: "이순신",
        lastName: "부모",
      };

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "PARENT",
      } as any);
      jest
        .spyOn(prismaService.parentProfile, "create")
        .mockResolvedValue(mockParentProfile as any);

      const result = await service.createParentProfile(mockUserId, createDto);

      expect(result).toEqual({
        id: "profile-123",
        firstName: "이순신",
        lastName: "부모",
        createdAt: mockParentProfile.createdAt,
      });

      expect(prismaService.parentProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUserId },
      });
      expect(prismaService.parentProfile.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          firstName: "이순신",
          lastName: "부모",
        },
      });
    });

    it("should throw BadRequestException if profile already exists", async () => {
      const createDto = {
        firstName: "이순신",
        lastName: "부모",
      };

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);

      await expect(
        service.createParentProfile(mockUserId, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException if user does not exist", async () => {
      const createDto = {
        firstName: "이순신",
        lastName: "부모",
      };

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue(null);

      await expect(
        service.createParentProfile(mockUserId, createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if user is not PARENT type", async () => {
      const createDto = {
        firstName: "이순신",
        lastName: "부모",
      };

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "COACH",
      } as any);

      await expect(
        service.createParentProfile(mockUserId, createDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getParentProfile", () => {
    it("should successfully retrieve parent profile", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);

      const result = await service.getParentProfile(mockUserId);

      expect(result).toEqual({
        id: "profile-123",
        userId: mockUserId,
        firstName: "이순신",
        lastName: "부모",
        createdAt: mockParentProfile.createdAt,
      });

      expect(prismaService.parentProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
    });

    it("should throw NotFoundException if profile does not exist", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(service.getParentProfile(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("updateParentProfile", () => {
    it("should successfully update parent profile", async () => {
      const updateDto = {
        firstName: "을지문덕",
        lastName: "장군",
      };

      const updatedProfile = {
        ...mockParentProfile,
        firstName: "을지문덕",
        lastName: "장군",
      };

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);
      jest
        .spyOn(prismaService.parentProfile, "update")
        .mockResolvedValue(updatedProfile as any);

      const result = await service.updateParentProfile(mockUserId, updateDto);

      expect(result).toEqual({
        id: "profile-123",
        firstName: "을지문덕",
        lastName: "장군",
        updatedAt: expect.any(Date),
      });

      expect(prismaService.parentProfile.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          firstName: "을지문덕",
          lastName: "장군",
        },
      });
    });

    it("should throw NotFoundException if profile does not exist", async () => {
      const updateDto = {
        firstName: "을지문덕",
      };

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.updateParentProfile(mockUserId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should update only provided fields", async () => {
      const updateDto = {
        firstName: "을지문덕",
      };

      const updatedProfile = {
        ...mockParentProfile,
        firstName: "을지문덕",
      };

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);
      jest
        .spyOn(prismaService.parentProfile, "update")
        .mockResolvedValue(updatedProfile as any);

      await service.updateParentProfile(mockUserId, updateDto);

      expect(prismaService.parentProfile.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          firstName: "을지문덕",
          lastName: mockParentProfile.lastName,
        },
      });
    });
  });

  describe("getChildren", () => {
    it("should successfully retrieve children list", async () => {
      const childProfiles = [
        {
          id: "child-profile-1",
          userId: mockChildUserId1,
          firstName: "철수",
          lastName: "김",
          birthDate: new Date("2018-06-15"),
          createdAt: new Date("2026-01-04"),
        },
      ];

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);
      jest
        .spyOn(prismaService.childProfile, "findMany")
        .mockResolvedValue(childProfiles as any);

      const result = await service.getChildren(mockUserId);

      expect(result).toEqual(childProfiles);
      expect(prismaService.childProfile.findMany).toHaveBeenCalledWith({
        where: {
          userId: {
            in: [mockChildUserId1],
          },
        },
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          createdAt: true,
        },
      });
    });

    it("should return empty array if parent has no children", async () => {
      const parentWithoutChildren = {
        ...mockParentProfile,
        children: [],
      };

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(parentWithoutChildren as any);

      const result = await service.getChildren(mockUserId);

      expect(result).toEqual([]);
    });

    it("should throw NotFoundException if parent profile does not exist", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(service.getChildren(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("addChild", () => {
    const validBirthDate = "2016-03-15";
    const mockChildProfile2 = {
      id: "child-profile-2",
      userId: mockChildUserId2,
      birthDate: new Date("2016-03-15T00:00:00.000Z"),
    };

    it("should successfully add child when birthDate matches and child is unlinked", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);
      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile2 as any);
      // 동일 부모-자녀 기존 링크 없음
      jest
        .spyOn(prismaService.parentChild, "findUnique")
        .mockResolvedValue(null);
      // 다른 부모에 연결된 이력 없음 (재클레임 게이트 통과)
      jest
        .spyOn(prismaService.parentChild, "findFirst")
        .mockResolvedValue(null);
      jest
        .spyOn(prismaService.parentChild, "create")
        .mockResolvedValue({} as any);
      // addChild 마지막에 getChildren 재조회
      jest.spyOn(prismaService.parentChild, "findMany").mockResolvedValue([]);

      const result = await service.addChild(
        mockUserId,
        mockChildUserId2,
        validBirthDate,
      );

      expect(result).toMatchObject({ id: "profile-123" });
      expect(prismaService.parentChild.create).toHaveBeenCalledWith({
        data: { parentId: mockUserId, childId: mockChildUserId2 },
      });
    });

    it("should throw NotFoundException if parent profile does not exist", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.addChild(mockUserId, mockChildUserId2, validBirthDate),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException if child profile does not exist", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);
      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.addChild(mockUserId, mockChildUserId2, validBirthDate),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if child is already added to this parent", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);
      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile2 as any);
      jest
        .spyOn(prismaService.parentChild, "findUnique")
        .mockResolvedValue({ id: "existing-link" } as any);

      await expect(
        service.addChild(mockUserId, mockChildUserId2, validBirthDate),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw ForbiddenException if child is already linked to another parent", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);
      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile2 as any);
      jest
        .spyOn(prismaService.parentChild, "findUnique")
        .mockResolvedValue(null);
      // 다른 부모에 이미 연결됨
      jest
        .spyOn(prismaService.parentChild, "findFirst")
        .mockResolvedValue({ id: "other-parent-link" } as any);

      await expect(
        service.addChild(mockUserId, mockChildUserId2, validBirthDate),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException if birthDate does not match", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);
      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile2 as any);
      jest
        .spyOn(prismaService.parentChild, "findUnique")
        .mockResolvedValue(null);
      jest
        .spyOn(prismaService.parentChild, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.addChild(mockUserId, mockChildUserId2, "2010-01-01"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("removeChild", () => {
    it("should successfully remove child from parent", async () => {
      const updatedProfile = {
        ...mockParentProfile,
        children: [],
      };

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);
      jest
        .spyOn(prismaService.parentProfile, "update")
        .mockResolvedValue(updatedProfile as any);

      const result = await service.removeChild(mockUserId, mockChildUserId1);

      expect(result).toEqual({
        id: "profile-123",
        children: [],
        updatedAt: expect.any(Date),
      });

      expect(prismaService.parentProfile.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          children: [],
        },
      });
    });

    it("should throw NotFoundException if parent profile does not exist", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.removeChild(mockUserId, mockChildUserId1),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if child is not in parent list", async () => {
      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(mockParentProfile as any);

      await expect(
        service.removeChild(mockUserId, mockChildUserId2),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if parent has no children", async () => {
      const parentWithoutChildren = {
        ...mockParentProfile,
        children: [],
      };

      jest
        .spyOn(prismaService.parentProfile, "findUnique")
        .mockResolvedValue(parentWithoutChildren as any);

      await expect(
        service.removeChild(mockUserId, mockChildUserId1),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
