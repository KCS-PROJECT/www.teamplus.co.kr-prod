import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ChildProfileService } from "./child-profile.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("ChildProfileService", () => {
  let service: ChildProfileService;
  let prismaService: PrismaService;

  const mockUserId = "user-456";
  const mockBirthDate = new Date("2018-06-15");
  const mockChildProfile = {
    id: "child-profile-123",
    userId: mockUserId,
    firstName: "철수",
    lastName: "김",
    birthDate: mockBirthDate,
    createdAt: new Date("2026-01-04"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChildProfileService,
        {
          provide: PrismaService,
          useValue: {
            childProfile: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            clubMember: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ChildProfileService>(ChildProfileService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createChildProfile", () => {
    it("should successfully create a child profile with valid age", async () => {
      const createDto = {
        firstName: "철수",
        lastName: "김",
        birthDate: new Date("2018-06-15"),
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "CHILD",
      } as any);
      jest
        .spyOn(prismaService.childProfile, "create")
        .mockResolvedValue(mockChildProfile as any);

      const result = await service.createChildProfile(mockUserId, createDto);

      expect(result).toEqual({
        id: "child-profile-123",
        firstName: "철수",
        lastName: "김",
        birthDate: mockBirthDate,
        createdAt: mockChildProfile.createdAt,
      });

      expect(prismaService.childProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUserId },
      });
    });

    it("should throw BadRequestException if profile already exists", async () => {
      const createDto = {
        firstName: "철수",
        lastName: "김",
        birthDate: new Date("2018-06-15"),
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile as any);

      await expect(
        service.createChildProfile(mockUserId, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException if user does not exist", async () => {
      const createDto = {
        firstName: "철수",
        lastName: "김",
        birthDate: new Date("2018-06-15"),
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue(null);

      await expect(
        service.createChildProfile(mockUserId, createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if user is not CHILD type", async () => {
      const createDto = {
        firstName: "철수",
        lastName: "김",
        birthDate: new Date("2018-06-15"),
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "PARENT",
      } as any);

      await expect(
        service.createChildProfile(mockUserId, createDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw BadRequestException if child age is negative (future birth date)", async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const createDto = {
        firstName: "철수",
        lastName: "김",
        birthDate: futureDate,
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "CHILD",
      } as any);

      await expect(
        service.createChildProfile(mockUserId, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if child age exceeds 20", async () => {
      const oldBirthDate = new Date();
      oldBirthDate.setFullYear(oldBirthDate.getFullYear() - 21);

      const createDto = {
        firstName: "철수",
        lastName: "김",
        birthDate: oldBirthDate,
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "CHILD",
      } as any);

      await expect(
        service.createChildProfile(mockUserId, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should accept age 0 (newborn)", async () => {
      const newbornDate = new Date();

      const createDto = {
        firstName: "신생아",
        lastName: "김",
        birthDate: newbornDate,
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "CHILD",
      } as any);
      jest.spyOn(prismaService.childProfile, "create").mockResolvedValue({
        id: "newborn-profile",
        userId: mockUserId,
        firstName: "신생아",
        lastName: "김",
        birthDate: newbornDate,
        createdAt: new Date(),
      } as any);

      const result = await service.createChildProfile(mockUserId, createDto);

      expect(result).toBeDefined();
      expect(result.firstName).toBe("신생아");
    });

    it("should accept age 20 (20-year-old)", async () => {
      const birthDateAge20 = new Date();
      birthDateAge20.setFullYear(birthDateAge20.getFullYear() - 20);

      const createDto = {
        firstName: "성인",
        lastName: "김",
        birthDate: birthDateAge20,
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "CHILD",
      } as any);
      jest.spyOn(prismaService.childProfile, "create").mockResolvedValue({
        id: "adult-profile",
        userId: mockUserId,
        firstName: "성인",
        lastName: "김",
        birthDate: birthDateAge20,
        createdAt: new Date(),
      } as any);

      const result = await service.createChildProfile(mockUserId, createDto);

      expect(result).toBeDefined();
      expect(result.firstName).toBe("성인");
    });
  });

  describe("getChildProfile", () => {
    it("should successfully retrieve child profile with calculated age", async () => {
      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile as any);

      const result = await service.getChildProfile(mockUserId);

      expect(result).toEqual({
        id: "child-profile-123",
        userId: mockUserId,
        firstName: "철수",
        lastName: "김",
        birthDate: mockBirthDate,
        age: expect.any(Number),
        createdAt: mockChildProfile.createdAt,
      });

      expect(result.age).toBeGreaterThanOrEqual(7);
      expect(result.age).toBeLessThanOrEqual(8);
    });

    it("should throw NotFoundException if profile does not exist", async () => {
      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(service.getChildProfile(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("updateChildProfile", () => {
    it("should successfully update child profile", async () => {
      const updateDto = {
        firstName: "영희",
        lastName: "이",
      };

      const updatedProfile = {
        ...mockChildProfile,
        firstName: "영희",
        lastName: "이",
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile as any);
      jest
        .spyOn(prismaService.childProfile, "update")
        .mockResolvedValue(updatedProfile as any);

      const result = await service.updateChildProfile(mockUserId, updateDto);

      expect(result).toEqual({
        id: "child-profile-123",
        firstName: "영희",
        lastName: "이",
        birthDate: mockBirthDate,
        age: expect.any(Number),
        updatedAt: expect.any(Date),
      });
    });

    it("should throw NotFoundException if profile does not exist", async () => {
      const updateDto = {
        firstName: "영희",
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.updateChildProfile(mockUserId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should validate age when updating birthDate", async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const updateDto = {
        birthDate: futureDate,
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile as any);

      await expect(
        service.updateChildProfile(mockUserId, updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should allow updating only firstName", async () => {
      const updateDto = {
        firstName: "영희",
      };

      const updatedProfile = {
        ...mockChildProfile,
        firstName: "영희",
      };

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile as any);
      jest
        .spyOn(prismaService.childProfile, "update")
        .mockResolvedValue(updatedProfile as any);

      await service.updateChildProfile(mockUserId, updateDto);

      expect(prismaService.childProfile.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          firstName: "영희",
          lastName: mockChildProfile.lastName,
          birthDate: mockChildProfile.birthDate,
        },
      });
    });
  });

  describe("getChildClubs", () => {
    it("should successfully retrieve child clubs list", async () => {
      const clubMembers = [
        {
          team: {
            id: "club-123",
            teamCode: "ACE-hockey",
            name: "서울 아이스 클럽",
            coachName: "이순신",
            location: "서울시 강남구",
          },
          playerName: "철수",
          playerAge: 7,
          joinedAt: new Date("2026-01-04"),
        },
      ];

      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile as any);
      jest
        .spyOn(prismaService.clubMember, "findMany")
        .mockResolvedValue(clubMembers as any);

      const result = await service.getChildClubs(mockUserId);

      expect(result).toEqual([
        {
          teamId: "club-123",
          teamCode: "ACE-hockey",
          name: "서울 아이스 클럽",
          coachName: "이순신",
          location: "서울시 강남구",
          playerName: "철수",
          playerAge: 7,
          joinedAt: new Date("2026-01-04"),
        },
      ]);

      expect(prismaService.clubMember.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          approvalStatus: "approved",
        },
        include: {
          team: {
            select: {
              id: true,
              teamCode: true,
              name: true,
              location: true,
              coach: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });
    });

    it("should return empty array if child has no clubs", async () => {
      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile as any);
      jest.spyOn(prismaService.clubMember, "findMany").mockResolvedValue([]);

      const result = await service.getChildClubs(mockUserId);

      expect(result).toEqual([]);
    });

    it("should throw NotFoundException if profile does not exist", async () => {
      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(service.getChildClubs(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should only return approved clubs", async () => {
      jest
        .spyOn(prismaService.childProfile, "findUnique")
        .mockResolvedValue(mockChildProfile as any);
      jest.spyOn(prismaService.clubMember, "findMany").mockResolvedValue([]);

      await service.getChildClubs(mockUserId);

      expect(prismaService.clubMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            approvalStatus: "approved",
          }),
        }),
      );
    });
  });
});
