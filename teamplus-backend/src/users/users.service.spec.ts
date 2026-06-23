import { Test, TestingModule } from "@nestjs/testing";
import { UsersService } from "./users.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("UsersService", () => {
  let service: UsersService;

  const mockUser = {
    id: "user-uuid",
    email: "test@example.com",
    phone: "01012345678",
    userType: "parent",
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe("findById", () => {
    it("should return user when found", async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockUser);

      const result = await service.findById("user-uuid");

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-uuid" },
        select: {
          id: true,
          email: true,
          phone: true,
          userType: true,
          createdAt: true,
        },
      });
    });

    it("should return null when user not found", async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.findById("nonexistent-id");

      expect(result).toBeNull();
    });
  });

  describe("findByEmail", () => {
    it("should return user when found", async () => {
      const expectedUser = {
        id: mockUser.id,
        email: mockUser.email,
        userType: mockUser.userType,
      };
      mockPrismaService.user.findUnique.mockResolvedValueOnce(expectedUser);

      const result = await service.findByEmail("test@example.com");

      expect(result).toEqual(expectedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        select: {
          id: true,
          email: true,
          userType: true,
        },
      });
    });

    it("should return null when user not found", async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.findByEmail("nonexistent@example.com");

      expect(result).toBeNull();
    });
  });
});
