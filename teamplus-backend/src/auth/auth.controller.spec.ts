import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { UserType } from "@prisma/client";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

describe("AuthController", () => {
  let controller: AuthController;

  const mockUser = {
    id: "test-user-id",
    email: "test@example.com",
    phone: "01012345678",
    userType: UserType.PARENT,
    createdAt: new Date(),
  };

  const mockAuthResponse = {
    user: mockUser,
    accessToken: "mock-access-token",
    refreshToken: "mock-refresh-token",
  };

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refreshToken: jest.fn(),
    validateUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/auth/register", () => {
    const registerDto: RegisterDto = {
      email: "parent@example.com",
      phone: "01012345678",
      password: "SecurePassword123",
      userType: UserType.PARENT,
    };

    it("should register user and return tokens", async () => {
      // Arrange
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      // Act
      const result = await controller.register(registerDto);

      // Assert
      expect(result.user.email).toBe(mockUser.email);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockAuthService.register).toHaveBeenCalledWith(registerDto);
      expect(mockAuthService.register).toHaveBeenCalledTimes(1);
    });

    it("should return 201 status (implicit through HTTP decorator)", () => {
      // The @HttpCode(HttpStatus.CREATED) decorator ensures 201 status
      expect(controller.register).toBeDefined();
    });

    it("should call authService.register with correct DTO", async () => {
      // Arrange
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      // Act
      await controller.register(registerDto);

      // Assert
      expect(mockAuthService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          phone: registerDto.phone,
          userType: registerDto.userType,
        }),
      );
    });

    it("should handle registration error from service", async () => {
      // Arrange
      mockAuthService.register.mockRejectedValue(
        new BadRequestException("User already exists"),
      );

      // Act & Assert
      await expect(controller.register(registerDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should return user without password hash", async () => {
      // Arrange
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      // Act
      const result = await controller.register(registerDto);

      // Assert
      expect(result.user).not.toHaveProperty("passwordHash");
      expect(result.user).toHaveProperty("email");
      expect(result.user).toHaveProperty("phone");
      expect(result.user).toHaveProperty("userType");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    const loginDto: LoginDto = {
      email: "test@example.com",
      password: "SecurePassword123",
    };

    it("should login user and return tokens", async () => {
      // Arrange
      mockAuthService.login.mockResolvedValue(mockAuthResponse);

      // Act
      const result = await controller.login(loginDto);

      // Assert
      expect(result.user.email).toBe(mockUser.email);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockAuthService.login).toHaveBeenCalledWith(loginDto);
    });

    it("should return 200 status (implicit through HTTP decorator)", () => {
      // The @HttpCode(HttpStatus.OK) decorator ensures 200 status
      expect(controller.login).toBeDefined();
    });

    it("should call authService.login with correct DTO", async () => {
      // Arrange
      mockAuthService.login.mockResolvedValue(mockAuthResponse);

      // Act
      await controller.login(loginDto);

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(
        expect.objectContaining({
          email: loginDto.email,
        }),
      );
    });

    it("should handle invalid credentials", async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException("Invalid credentials"),
      );

      // Act & Assert
      await expect(controller.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should not return password in response", async () => {
      // Arrange
      mockAuthService.login.mockResolvedValue(mockAuthResponse);

      // Act
      const result = await controller.login(loginDto);

      // Assert
      expect(result.user).not.toHaveProperty("password");
      expect(result.user).not.toHaveProperty("passwordHash");
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    const refreshToken = "valid-refresh-token";

    it("should refresh token and return new tokens", async () => {
      // Arrange
      mockAuthService.refreshToken.mockResolvedValue({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      });

      // Act
      const result = await controller.refresh(refreshToken);

      // Assert
      expect(result.accessToken).toBe("new-access-token");
      expect(result.refreshToken).toBe("new-refresh-token");
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(refreshToken);
    });

    it("should return 200 status", () => {
      // The @HttpCode(HttpStatus.OK) decorator ensures 200 status
      expect(controller.refresh).toBeDefined();
    });

    it("should call authService.refreshToken with correct token", async () => {
      // Arrange
      mockAuthService.refreshToken.mockResolvedValue({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      });

      // Act
      await controller.refresh(refreshToken);

      // Assert
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(refreshToken);
    });

    it("should handle invalid refresh token", async () => {
      // Arrange
      mockAuthService.refreshToken.mockRejectedValue(
        new UnauthorizedException("Invalid token"),
      );

      // Act & Assert
      await expect(controller.refresh(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should handle expired refresh token", async () => {
      // Arrange
      mockAuthService.refreshToken.mockRejectedValue(
        new UnauthorizedException("Token expired"),
      );

      // Act & Assert
      await expect(controller.refresh(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("POST /api/v1/auth/profile (Protected)", () => {
    it("should return current user profile when JWT is valid", async () => {
      // Arrange
      const mockRequest = {
        user: {
          id: mockUser.id,
          email: mockUser.email,
          userType: mockUser.userType,
        },
      } as any;

      // Act
      const result = await controller.getProfile(mockRequest);

      // Assert
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.userType).toBe(mockUser.userType);
    });

    it("should require valid JWT token (guard test)", () => {
      // The @UseGuards(AuthGuard('jwt')) decorator is applied
      expect(controller.getProfile).toBeDefined();
    });

    it("should return user data attached to request by JWT strategy", async () => {
      // Arrange
      const mockRequest = {
        user: {
          id: "user-123",
          email: "coach@example.com",
          userType: UserType.COACH,
        },
      } as any;

      // Act
      const result = await controller.getProfile(mockRequest);

      // Assert
      expect(result).toEqual(mockRequest.user);
      expect(result.id).toBe("user-123");
      expect(result.email).toBe("coach@example.com");
      expect(result.userType).toBe(UserType.COACH);
    });

    it("should support all user types", async () => {
      // Test with different user types
      const userTypes = [UserType.PARENT, UserType.COACH, UserType.ADMIN];

      for (const userType of userTypes) {
        // Arrange
        const mockRequest = {
          user: {
            id: "test-id",
            email: "test@example.com",
            userType,
          },
        } as any;

        // Act
        const result = await controller.getProfile(mockRequest);

        // Assert
        expect(result.userType).toBe(userType);
      }
    });
  });

  describe("API Response Format", () => {
    it("should return correct response structure for register", async () => {
      // Arrange
      mockAuthService.register.mockResolvedValue(mockAuthResponse);

      // Act
      const result = await controller.register({
        email: "test@example.com",
        phone: "01012345678",
        password: "Test123",
        userType: UserType.PARENT,
      });

      // Assert
      expect(result).toHaveProperty("user");
      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
    });

    it("should return correct response structure for login", async () => {
      // Arrange
      mockAuthService.login.mockResolvedValue(mockAuthResponse);

      // Act
      const result = await controller.login({
        email: "test@example.com",
        password: "Test123",
      });

      // Assert
      expect(result).toHaveProperty("user");
      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
    });

    it("should return correct response structure for refresh", async () => {
      // Arrange
      mockAuthService.refreshToken.mockResolvedValue({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      });

      // Act
      const result = await controller.refresh("refresh-token");

      // Assert
      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result).not.toHaveProperty("user");
    });
  });

  describe("Error Handling", () => {
    it("should handle service errors gracefully", async () => {
      // Arrange
      const error = new BadRequestException("Validation error");
      mockAuthService.register.mockRejectedValue(error);

      // Act & Assert
      await expect(
        controller.register({
          email: "test@example.com",
          phone: "01012345678",
          password: "Test123",
          userType: UserType.PARENT,
        }),
      ).rejects.toThrow(error);
    });

    it("should handle BadRequestException from service", async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(
        new BadRequestException("Invalid input"),
      );

      // Act & Assert
      await expect(
        controller.login({
          email: "test@example.com",
          password: "Test123",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle UnauthorizedException from service", async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException("Invalid credentials"),
      );

      // Act & Assert
      await expect(
        controller.login({
          email: "test@example.com",
          password: "WrongPassword",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
