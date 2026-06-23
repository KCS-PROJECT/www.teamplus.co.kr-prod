import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CoachProfileService } from "./coach-profile.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("CoachProfileService", () => {
  let service: CoachProfileService;
  let prismaService: PrismaService;

  const mockUserId = "coach-user-123";
  const mockClubId = "club-456";
  const mockCoachProfile = {
    id: "coach-profile-123",
    userId: mockUserId,
    firstName: "이순신",
    lastName: "감독",
    teamId: mockClubId,
    createdAt: new Date("2026-01-04"),
  };

  const mockClub = {
    id: mockClubId,
    teamCode: "ACE-hockey",
    name: "서울 아이스 클럽",
    coachName: "이순신 감독",
    location: "서울시 강남구",
    phone: "010-1234-5678",
    createdAt: new Date("2026-01-01"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoachProfileService,
        {
          provide: PrismaService,
          useValue: {
            coachProfile: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
            team: {
              findUnique: jest.fn(),
            },
            clubMember: {
              count: jest.fn(),
              findMany: jest.fn(),
            },
            class: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<CoachProfileService>(CoachProfileService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createCoachProfile", () => {
    it("should successfully create a coach profile", async () => {
      const createDto = {
        firstName: "이순신",
        lastName: "감독",
        teamId: mockClubId,
      };

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "COACH",
      } as any);
      jest
        .spyOn(prismaService.team, "findUnique")
        .mockResolvedValue(mockClub as any);
      jest
        .spyOn(prismaService.coachProfile, "create")
        .mockResolvedValue(mockCoachProfile as any);

      const result = await service.createCoachProfile(mockUserId, createDto);

      expect(result).toEqual({
        id: "coach-profile-123",
        firstName: "이순신",
        lastName: "감독",
        teamId: mockClubId,
        createdAt: mockCoachProfile.createdAt,
      });

      expect(prismaService.coachProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUserId },
      });
      expect(prismaService.team.findUnique).toHaveBeenCalledWith({
        where: { id: mockClubId },
      });
    });

    it("should throw BadRequestException if coach profile already exists", async () => {
      const createDto = {
        firstName: "이순신",
        lastName: "감독",
        teamId: mockClubId,
      };

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(mockCoachProfile as any);

      await expect(
        service.createCoachProfile(mockUserId, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException if user does not exist", async () => {
      const createDto = {
        firstName: "이순신",
        lastName: "감독",
        teamId: mockClubId,
      };

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue(null);

      await expect(
        service.createCoachProfile(mockUserId, createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException if user is not COACH type", async () => {
      const createDto = {
        firstName: "이순신",
        lastName: "감독",
        teamId: mockClubId,
      };

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "PARENT",
      } as any);

      await expect(
        service.createCoachProfile(mockUserId, createDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException if club does not exist", async () => {
      const createDto = {
        firstName: "이순신",
        lastName: "감독",
        teamId: mockClubId,
      };

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(null);
      jest.spyOn(prismaService.user, "findUnique").mockResolvedValue({
        id: mockUserId,
        userType: "COACH",
      } as any);
      jest.spyOn(prismaService.team, "findUnique").mockResolvedValue(null);

      await expect(
        service.createCoachProfile(mockUserId, createDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getCoachProfile", () => {
    it("should successfully retrieve coach profile with club details", async () => {
      const coachProfileWithClub = {
        ...mockCoachProfile,
        club: mockClub,
      };

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(coachProfileWithClub as any);

      const result = await service.getCoachProfile(mockUserId);

      expect(result).toEqual({
        id: "coach-profile-123",
        userId: mockUserId,
        firstName: "이순신",
        lastName: "감독",
        teamId: mockClubId,
        team: {
          id: mockClubId,
          teamCode: "ACE-hockey",
          name: "서울 아이스 클럽",
          coachName: "이순신 감독",
          location: "서울시 강남구",
          phone: "010-1234-5678",
        },
        createdAt: mockCoachProfile.createdAt,
      });
    });

    it("should throw NotFoundException if profile does not exist", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(service.getCoachProfile(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("updateCoachProfile", () => {
    it("should successfully update coach profile", async () => {
      const updateDto = {
        firstName: "을지문덕",
        lastName: "장군",
      };

      const updatedProfile = {
        ...mockCoachProfile,
        firstName: "을지문덕",
        lastName: "장군",
        club: mockClub,
      };

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.coachProfile, "update")
        .mockResolvedValue(updatedProfile as any);

      const result = await service.updateCoachProfile(mockUserId, updateDto);

      expect(result).toEqual({
        id: "coach-profile-123",
        firstName: "을지문덕",
        lastName: "장군",
        name: mockClub.name,
        updatedAt: expect.any(Date),
      });
    });

    it("should throw NotFoundException if profile does not exist", async () => {
      const updateDto = {
        firstName: "을지문덕",
      };

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(
        service.updateCoachProfile(mockUserId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("should update only provided fields", async () => {
      const updateDto = {
        firstName: "을지문덕",
      };

      const updatedProfile = {
        ...mockCoachProfile,
        firstName: "을지문덕",
        club: mockClub,
      };

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.coachProfile, "update")
        .mockResolvedValue(updatedProfile as any);

      await service.updateCoachProfile(mockUserId, updateDto);

      expect(prismaService.coachProfile.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          firstName: "을지문덕",
          lastName: mockCoachProfile.lastName,
        },
        include: {
          team: {
            select: {
              id: true,
              teamCode: true,
              name: true,
            },
          },
        },
      });
    });
  });

  describe("getCoachClub", () => {
    it("should successfully retrieve coach club information", async () => {
      const coachProfileWithClub = {
        ...mockCoachProfile,
        club: mockClub,
      };

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(coachProfileWithClub as any);

      const result = await service.getCoachClub(mockUserId);

      expect(result).toEqual(mockClub);
    });

    it("should throw NotFoundException if profile does not exist", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(service.getCoachClub(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getClubStatistics", () => {
    it("should successfully retrieve club statistics", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(mockCoachProfile as any);
      jest.spyOn(prismaService.clubMember, "count").mockResolvedValue(25);
      jest
        .spyOn(prismaService.clubMember, "count")
        .mockResolvedValueOnce(25)
        .mockResolvedValueOnce(22)
        .mockResolvedValueOnce(3);

      const result = await service.getClubStatistics(mockUserId);

      expect(result).toEqual({
        teamId: mockClubId,
        totalMembers: 25,
        approvedMembers: 22,
        pendingMembers: 3,
        approvalRate: "88.0",
      });
    });

    it("should return 0 approval rate when no members", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.clubMember, "count")
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.getClubStatistics(mockUserId);

      expect(result).toEqual({
        teamId: mockClubId,
        totalMembers: 0,
        approvedMembers: 0,
        pendingMembers: 0,
        approvalRate: "0",
      });
    });

    it("should calculate correct approval rate with different ratios", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.clubMember, "count")
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(5);

      const result = await service.getClubStatistics(mockUserId);

      expect(result.approvalRate).toBe("50.0");
    });

    it("should throw NotFoundException if profile does not exist", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(service.getClubStatistics(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getCoachClasses", () => {
    it("should successfully retrieve coach classes ordered by start time", async () => {
      const mockClasses = [
        {
          id: "class-1",
          className: "신규 수강생반",
          instructorName: "김철수",
          capacity: 15,
          startTime: "16:00",
          endTime: "17:00",
          isActive: true,
          createdAt: new Date("2026-01-04"),
        },
        {
          id: "class-2",
          className: "대회 준비반",
          instructorName: "이영희",
          capacity: 10,
          startTime: "18:00",
          endTime: "19:00",
          isActive: true,
          createdAt: new Date("2026-01-04"),
        },
      ];

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.class, "findMany")
        .mockResolvedValue(mockClasses as any);

      const result = await service.getCoachClasses(mockUserId);

      expect(result).toEqual(mockClasses);
      expect(prismaService.class.findMany).toHaveBeenCalledWith({
        where: {
          teamId: mockClubId,
        },
        select: {
          id: true,
          className: true,
          instructorName: true,
          capacity: true,
          startTime: true,
          endTime: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: {
          startTime: "asc",
        },
      });
    });

    it("should return empty array if coach has no classes", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(mockCoachProfile as any);
      jest.spyOn(prismaService.class, "findMany").mockResolvedValue([]);

      const result = await service.getCoachClasses(mockUserId);

      expect(result).toEqual([]);
    });

    it("should throw NotFoundException if profile does not exist", async () => {
      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(null);

      await expect(service.getCoachClasses(mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should order classes by start time in ascending order", async () => {
      const mockClasses = [
        {
          id: "class-1",
          className: "조기 수업",
          startTime: "14:00",
          instructorName: "A",
          capacity: 10,
          endTime: "15:00",
          isActive: true,
          createdAt: new Date(),
        },
        {
          id: "class-2",
          className: "저녁 수업",
          startTime: "19:00",
          instructorName: "B",
          capacity: 10,
          endTime: "20:00",
          isActive: true,
          createdAt: new Date(),
        },
      ];

      jest
        .spyOn(prismaService.coachProfile, "findUnique")
        .mockResolvedValue(mockCoachProfile as any);
      jest
        .spyOn(prismaService.class, "findMany")
        .mockResolvedValue(mockClasses as any);

      await service.getCoachClasses(mockUserId);

      expect(prismaService.class.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            startTime: "asc",
          },
        }),
      );
    });
  });
});
