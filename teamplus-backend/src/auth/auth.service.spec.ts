import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { AppleTokenService } from "./services/apple-token.service";
import { AccountLockoutService } from "./services/account-lockout.service";
import { LoggerService } from "@/logger/logger.service";
import { SmsService } from "@/sms/sms.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { UserType } from "@prisma/client";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

describe("AuthService", () => {
  let service: AuthService;

  const mockUser = {
    id: "test-user-id",
    email: "test@example.com",
    phone: "01012345678",
    passwordHash: "hashed-password",
    userType: UserType.PARENT,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(false),
    getConnectionStatus: jest.fn().mockReturnValue(true),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === "redis") {
        return {
          keyPrefix: {
            jwt: "jwt:blacklist:",
            refresh: "refresh:",
          },
          cacheTTL: {
            jwtBlacklist: 900,
            refreshToken: 604800,
          },
        };
      }
      const config: Record<string, any> = {
        JWT_EXPIRATION: "900",
        JWT_REFRESH_EXPIRATION: "604800",
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
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
          provide: AppleTokenService,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(false),
            exchangeAuthorizationCode: jest.fn().mockResolvedValue(null),
            revokeRefreshToken: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: AccountLockoutService,
          useValue: {
            checkIfLocked: jest.fn().mockResolvedValue(undefined),
            recordFailedAttempt: jest.fn().mockResolvedValue(undefined),
            clearFailedAttempts: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SmsService,
          useValue: {
            sendVerificationCode: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            logAuthEvent: jest.fn(),
            audit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    const registerDto: RegisterDto = {
      email: "parent@example.com",
      phone: "01012345678",
      password: "SecurePassword123",
      userType: UserType.PARENT,
    };

    it("should register a new user successfully", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        id: "new-user-id",
        email: registerDto.email,
        phone: registerDto.phone,
        userType: registerDto.userType,
        createdAt: new Date(),
      });

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result.user.email).toBe(registerDto.email);
      expect(result.user.phone).toBe(registerDto.phone);
      expect(result.user.userType).toBe(UserType.PARENT);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ email: registerDto.email }, { phone: registerDto.phone }],
        },
      });
    });

    it("should throw BadRequestException if user already exists by email", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(service.register(registerDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        "이미 등록된 이메일 또는 휴대폰 번호입니다.",
      );
    });

    it("should throw BadRequestException if user already exists by phone", async () => {
      // Arrange
      const existingUser = { ...mockUser, email: "different@example.com" };
      mockPrismaService.user.findFirst.mockResolvedValue(existingUser);

      // Act & Assert
      await expect(service.register(registerDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should hash password correctly", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: registerDto.email,
      });

      // Act
      await service.register(registerDto);

      // Assert
      const createCall = mockPrismaService.user.create.mock.calls[0];
      const passwordHash = createCall[0].data.passwordHash;
      expect(passwordHash).not.toBe(registerDto.password);
      expect(await bcrypt.compare(registerDto.password, passwordHash)).toBe(
        true,
      );
    });

    it("should generate both access and refresh tokens", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign
        .mockReturnValueOnce("access-token")
        .mockReturnValueOnce("refresh-token");
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: registerDto.email,
      });

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result.accessToken).toBe("access-token");
      expect(result.refreshToken).toBe("refresh-token");
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe("login", () => {
    const loginDto: LoginDto = {
      email: "test@example.com",
      password: "SecurePassword123",
    };

    it("should login user successfully with correct credentials", async () => {
      // Arrange
      const passwordHash = await bcrypt.hash(loginDto.password, 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash,
      });
      mockJwtService.sign
        .mockReturnValueOnce("access-token")
        .mockReturnValueOnce("refresh-token");

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result.user.id).toBe(mockUser.id);
      expect(result.user.email).toBe(mockUser.email);
      expect(result.accessToken).toBe("access-token");
      expect(result.refreshToken).toBe("refresh-token");
    });

    it("should throw UnauthorizedException if user not found", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        "이메일 또는 비밀번호가 일치하지 않습니다.",
      );
    });

    it("should throw UnauthorizedException if password is incorrect", async () => {
      // Arrange
      const incorrectPasswordHash = await bcrypt.hash("WrongPassword123", 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: incorrectPasswordHash,
      });

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should not return password hash in response", async () => {
      // Arrange
      const passwordHash = await bcrypt.hash(loginDto.password, 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash,
      });
      mockJwtService.sign
        .mockReturnValueOnce("access-token")
        .mockReturnValueOnce("refresh-token");

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result.user).not.toHaveProperty("passwordHash");
    });
  });

  describe("refreshToken", () => {
    const refreshToken = "valid-refresh-token";

    it("should refresh token successfully with valid refresh token", async () => {
      // Arrange
      mockJwtService.verify.mockReturnValue({
        sub: mockUser.id,
        userType: mockUser.userType,
      });
      mockJwtService.sign
        .mockReturnValueOnce("new-access-token")
        .mockReturnValueOnce("new-refresh-token");

      // Act
      const result = await service.refreshToken(refreshToken);

      // Assert
      expect(result.accessToken).toBe("new-access-token");
      expect(result.refreshToken).toBe("new-refresh-token");
      expect(mockJwtService.verify).toHaveBeenCalledWith(refreshToken, {
        secret: process.env.JWT_SECRET,
      });
    });

    it("should throw UnauthorizedException if refresh token is invalid", async () => {
      // Arrange
      mockJwtService.verify.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      // Act & Assert
      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        "유효하지 않은 refresh token입니다.",
      );
    });

    it("should throw UnauthorizedException if refresh token is expired", async () => {
      // Arrange
      mockJwtService.verify.mockImplementation(() => {
        throw new Error("Token expired");
      });

      // Act & Assert
      await expect(service.refreshToken(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should return new tokens with same user information", async () => {
      // Arrange
      const decodedPayload = {
        sub: "user-123",
        userType: UserType.COACH,
      };
      mockJwtService.verify.mockReturnValue(decodedPayload);
      mockJwtService.sign
        .mockReturnValueOnce("new-access-token")
        .mockReturnValueOnce("new-refresh-token");

      // Act
      const result = await service.refreshToken(refreshToken);

      // Assert
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Verify that the same userId and userType are used
      const signCalls = mockJwtService.sign.mock.calls;
      expect(signCalls[0][0].sub).toBe(decodedPayload.sub);
      expect(signCalls[0][0].userType).toBe(decodedPayload.userType);
    });
  });

  describe("validateUser", () => {
    it("should validate user successfully if user exists", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        userType: mockUser.userType,
      });

      // Act
      const result = await service.validateUser(mockUser.id);

      // Assert
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.userType).toBe(mockUser.userType);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        select: {
          id: true,
          email: true,
          userType: true,
        },
      });
    });

    it("should throw UnauthorizedException if user not found", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.validateUser("non-existent-id")).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.validateUser("non-existent-id")).rejects.toThrow(
        "사용자를 찾을 수 없습니다.",
      );
    });

    it("should not include password hash in result", async () => {
      // Arrange
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        userType: mockUser.userType,
      });

      // Act
      const result = await service.validateUser(mockUser.id);

      // Assert
      expect(result).not.toHaveProperty("passwordHash");
    });
  });

  describe("Token generation", () => {
    it("should generate tokens with correct payload structure", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        id: mockUser.id,
        email: "test@example.com",
        phone: "01012345678",
        userType: UserType.PARENT,
        createdAt: new Date(),
      });

      const registerDto: RegisterDto = {
        email: "test@example.com",
        phone: "01012345678",
        password: "TestPassword123",
        userType: UserType.PARENT,
      };

      // Act
      await service.register(registerDto);

      // Assert
      const signCalls = mockJwtService.sign.mock.calls;
      expect(signCalls[0][0]).toHaveProperty("sub");
      expect(signCalls[0][0]).toHaveProperty("userType");
      expect(signCalls[0][0]).toHaveProperty("iat");
      expect(signCalls[0][1]).toHaveProperty("expiresIn");
    });

    it("should use correct expiration times", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        id: mockUser.id,
        email: "test@example.com",
        phone: "01012345678",
        userType: UserType.PARENT,
        createdAt: new Date(),
      });

      const registerDto: RegisterDto = {
        email: "test@example.com",
        phone: "01012345678",
        password: "TestPassword123",
        userType: UserType.PARENT,
      };

      // Act
      await service.register(registerDto);

      // Assert
      const signCalls = mockJwtService.sign.mock.calls;
      const accessTokenOptions = signCalls[0][1];
      const refreshTokenOptions = signCalls[1][1];

      // Access token: 15 minutes (900 seconds)
      expect(accessTokenOptions.expiresIn).toBe(900);
      // Refresh token: 7 days (604800 seconds)
      expect(refreshTokenOptions.expiresIn).toBe(604800);
    });
  });

  describe("Security", () => {
    it("should not log passwords", async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: "test@example.com",
      });

      const registerDto: RegisterDto = {
        email: "test@example.com",
        phone: "01012345678",
        password: "SecurePassword123",
        userType: UserType.PARENT,
      };

      // Act
      await service.register(registerDto);

      // Assert
      const logCalls = consoleSpy.mock.calls.join().toLowerCase();
      expect(logCalls).not.toContain("securepassword123");

      consoleSpy.mockRestore();
    });

    it("should always hash passwords before storing", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: "test@example.com",
      });

      const registerDto: RegisterDto = {
        email: "test@example.com",
        phone: "01012345678",
        password: "PlainPassword123",
        userType: UserType.PARENT,
      };

      // Act
      await service.register(registerDto);

      // Assert
      const createCall = mockPrismaService.user.create.mock.calls[0];
      const storedPassword = createCall[0].data.passwordHash;

      // Should not be plain password
      expect(storedPassword).not.toBe(registerDto.password);
      // Should be a hash (bcrypt hashes are long)
      expect(storedPassword.length).toBeGreaterThan(50);
    });

    it("should generate bcrypt hash with proper format", async () => {
      // Arrange
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockJwtService.sign.mockReturnValue("mock-token");
      mockPrismaService.user.create.mockResolvedValue({
        ...mockUser,
        email: "test@example.com",
      });

      const registerDto: RegisterDto = {
        email: "test@example.com",
        phone: "01012345678",
        password: "SecurePassword123",
        userType: UserType.PARENT,
      };

      // Act
      await service.register(registerDto);

      // Assert
      const createCall = mockPrismaService.user.create.mock.calls[0];
      const passwordHash = createCall[0].data.passwordHash;

      // Bcrypt hashes follow $2a$ or $2b$ pattern with specific format
      expect(passwordHash).toMatch(/^\$2[aby]\$/);
    });
  });
});
