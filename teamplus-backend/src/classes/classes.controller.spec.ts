import { Test, TestingModule } from "@nestjs/testing";
import { ClassesController } from "./classes.controller";
import { ClassesService } from "./classes.service";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CreateClassDto } from "./dto/create-class.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { CreateClassProductDto } from "./dto/create-product.dto";

describe("ClassesController", () => {
  let controller: ClassesController;

  const mockClass = {
    id: "class-uuid",
    teamId: "team-uuid",
    className: "신규 수강생반",
    instructorName: "김철수",
    capacity: 15,
    startTime: new Date("2026-01-04T16:00:00Z"),
    endTime: new Date("2026-01-04T17:00:00Z"),
    isActive: true,
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockSchedule = {
    id: "schedule-uuid",
    classId: "class-uuid",
    scheduledDate: new Date("2026-01-04T00:00:00Z"),
    isCancelled: false,
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockProduct = {
    id: "product-uuid",
    classId: "class-uuid",
    productName: "월 8회 수업",
    description: "주 2회 수업 (1개월)",
    price: 240000,
    sessionsPerMonth: 8,
    durationDays: 30,
    createdAt: new Date("2026-01-04T10:00:00Z"),
  };

  const mockClassesService = {
    createClass: jest.fn(),
    getClass: jest.fn(),
    getClubClasses: jest.fn(),
    getTeamClasses: jest.fn(),
    updateClass: jest.fn(),
    deleteClass: jest.fn(),
    cancelClassSchedule: jest.fn(),
    getClassSchedulesByDateRange: jest.fn(),
    createClassProduct: jest.fn(),
    getClassProducts: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassesController],
      providers: [
        {
          provide: ClassesService,
          useValue: mockClassesService,
        },
      ],
    }).compile();

    controller = module.get<ClassesController>(ClassesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/teams/:teamId/classes", () => {
    const createClassDto: CreateClassDto = {
      className: "신규 수강생반",
      instructorName: "김철수",
      capacity: 15,
      startTime: new Date("2026-01-04T16:00:00Z"),
      endTime: new Date("2026-01-04T17:00:00Z"),
    };

    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should create class successfully", async () => {
      // Arrange
      mockClassesService.createClass.mockResolvedValue(mockClass);

      // Act
      const result = await controller.createClass(
        mockRequest,
        "team-uuid",
        createClassDto,
      );

      // Assert
      expect(result.id).toBe(mockClass.id);
      expect(result.className).toBe(mockClass.className);
      expect(mockClassesService.createClass).toHaveBeenCalledWith(
        "coach-uuid",
        "team-uuid",
        createClassDto,
      );
    });

    it("should call classesService with correct params", async () => {
      // Arrange
      mockClassesService.createClass.mockResolvedValue(mockClass);

      // Act
      await controller.createClass(mockRequest, "team-uuid", createClassDto);

      // Assert
      expect(mockClassesService.createClass).toHaveBeenCalledWith(
        mockRequest.user.id,
        "team-uuid",
        createClassDto,
      );
    });

    it("should handle forbidden error for non-coach", async () => {
      // Arrange
      mockClassesService.createClass.mockRejectedValue(
        new ForbiddenException("감독만 수업을 생성할 수 있습니다."),
      );

      // Act & Assert
      await expect(
        controller.createClass(mockRequest, "team-uuid", createClassDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should handle invalid time error", async () => {
      // Arrange
      mockClassesService.createClass.mockRejectedValue(
        new BadRequestException("올바른 시간을 입력해주세요."),
      );

      // Act & Assert
      await expect(
        controller.createClass(mockRequest, "team-uuid", createClassDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("GET /api/v1/teams/:teamId/classes/:classId", () => {
    it("should return class details", async () => {
      // Arrange
      mockClassesService.getClass.mockResolvedValue(mockClass);

      // Act
      const result = await controller.getClass("class-uuid");

      // Assert
      expect(result).toEqual(mockClass);
      expect(mockClassesService.getClass).toHaveBeenCalledWith("class-uuid");
    });

    it("should handle class not found", async () => {
      // Arrange
      mockClassesService.getClass.mockRejectedValue(
        new NotFoundException("수업을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(controller.getClass("invalid-id")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("GET /api/v1/teams/:teamId/classes", () => {
    it("should return club classes list", async () => {
      // Arrange
      mockClassesService.getTeamClasses.mockResolvedValue([mockClass]);

      // Act
      const result = await controller.getTeamClasses("team-uuid");

      // Assert
      expect(result).toEqual([mockClass]);
      expect(mockClassesService.getTeamClasses).toHaveBeenCalledWith(
        "team-uuid",
      );
    });

    it("should return empty array if no classes", async () => {
      // Arrange
      mockClassesService.getTeamClasses.mockResolvedValue([]);

      // Act
      const result = await controller.getTeamClasses("team-uuid");

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("PUT /api/v1/teams/:teamId/classes/:classId", () => {
    const updateClassDto: UpdateClassDto = {
      className: "수정된 수업명",
      capacity: 20,
    };

    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should update class successfully", async () => {
      // Arrange
      const updatedClass = { ...mockClass, ...updateClassDto };
      mockClassesService.updateClass.mockResolvedValue(updatedClass);

      // Act
      const result = await controller.updateClass(
        mockRequest,
        "team-uuid",
        "class-uuid",
        updateClassDto,
      );

      // Assert
      expect(result.className).toBe("수정된 수업명");
      expect(result.className).toBe("수정된 수업명");
      expect(mockClassesService.updateClass).toHaveBeenCalledWith(
        "coach-uuid",
        "team-uuid",
        "class-uuid",
        updateClassDto,
      );
    });

    it("should handle forbidden error", async () => {
      // Arrange
      mockClassesService.updateClass.mockRejectedValue(
        new ForbiddenException("감독만 수정할 수 있습니다."),
      );

      // Act & Assert
      await expect(
        controller.updateClass(
          mockRequest,
          "team-uuid",
          "class-uuid",
          updateClassDto,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should handle class not found", async () => {
      // Arrange
      mockClassesService.updateClass.mockRejectedValue(
        new NotFoundException("수업을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(
        controller.updateClass(
          mockRequest,
          "team-uuid",
          "invalid-id",
          updateClassDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("DELETE /api/v1/teams/:teamId/classes/:classId", () => {
    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should delete class successfully", async () => {
      // Arrange
      mockClassesService.deleteClass.mockResolvedValue({
        id: "class-uuid",
        deletedAt: new Date(),
      });

      // Act
      const result = await controller.deleteClass(
        mockRequest,
        "team-uuid",
        "class-uuid",
      );

      // Assert
      expect(result.id).toBe("class-uuid");
      expect(mockClassesService.deleteClass).toHaveBeenCalledWith(
        "coach-uuid",
        "team-uuid",
        "class-uuid",
      );
    });

    it("should handle forbidden error", async () => {
      // Arrange
      mockClassesService.deleteClass.mockRejectedValue(
        new ForbiddenException("감독만 삭제할 수 있습니다."),
      );

      // Act & Assert
      await expect(
        controller.deleteClass(mockRequest, "team-uuid", "class-uuid"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("PUT /api/v1/teams/:teamId/classes/:classId/schedules/:scheduleId/cancel", () => {
    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should cancel schedule successfully", async () => {
      // Arrange
      const cancelledSchedule = { ...mockSchedule, isCancelled: true };
      mockClassesService.cancelClassSchedule.mockResolvedValue(
        cancelledSchedule,
      );

      // Act
      const result = await controller.cancelClassSchedule(
        mockRequest,
        "schedule-uuid",
      );

      // Assert
      expect(result.isCancelled).toBe(true);
      expect(mockClassesService.cancelClassSchedule).toHaveBeenCalledWith(
        "coach-uuid",
        "schedule-uuid",
        undefined,
      );
    });

    it("should cancel with reason", async () => {
      // Arrange
      const cancelledSchedule = { ...mockSchedule, isCancelled: true };
      mockClassesService.cancelClassSchedule.mockResolvedValue(
        cancelledSchedule,
      );

      // Act
      await controller.cancelClassSchedule(
        mockRequest,
        "schedule-uuid",
        "빙상장 점검",
      );

      // Assert
      expect(mockClassesService.cancelClassSchedule).toHaveBeenCalledWith(
        "coach-uuid",
        "schedule-uuid",
        "빙상장 점검",
      );
    });
  });

  describe("GET /api/v1/teams/:teamId/classes/:classId/schedules", () => {
    it("should return schedules by date range", async () => {
      // Arrange
      mockClassesService.getClassSchedulesByDateRange.mockResolvedValue([
        mockSchedule,
      ]);

      // Act
      const result = await controller.getClassSchedulesByDateRange(
        "class-uuid",
        "2026-01-01",
        "2026-01-31",
      );

      // Assert
      expect(result).toEqual([mockSchedule]);
      expect(
        mockClassesService.getClassSchedulesByDateRange,
      ).toHaveBeenCalledWith("class-uuid", expect.any(Date), expect.any(Date));
    });

    it("should use default dates if not provided", async () => {
      // Arrange
      mockClassesService.getClassSchedulesByDateRange.mockResolvedValue([]);

      // Act
      const result = await controller.getClassSchedulesByDateRange(
        "class-uuid",
        "",
        "",
      );

      // Assert
      expect(result).toEqual([]);
      expect(
        mockClassesService.getClassSchedulesByDateRange,
      ).toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/teams/:teamId/classes/:classId/products", () => {
    const createProductDto: CreateClassProductDto = {
      productName: "월 8회 수업",
      description: "주 2회 수업 (1개월)",
      price: 240000,
      sessionsPerMonth: 8,
      durationDays: 30,
    };

    const mockRequest = { user: { id: "coach-uuid" } } as any;

    it("should create product successfully", async () => {
      // Arrange
      mockClassesService.createClassProduct.mockResolvedValue(mockProduct);

      // Act
      const result = await controller.createClassProduct(
        mockRequest,
        "team-uuid",
        "class-uuid",
        createProductDto,
      );

      // Assert
      expect(result.id).toBe(mockProduct.id);
      expect(result.productName).toBe(mockProduct.productName);
      expect(result.price).toBe(240000);
      expect(mockClassesService.createClassProduct).toHaveBeenCalledWith(
        "coach-uuid",
        "team-uuid",
        "class-uuid",
        createProductDto,
      );
    });

    it("should handle forbidden error", async () => {
      // Arrange
      mockClassesService.createClassProduct.mockRejectedValue(
        new ForbiddenException("감독만 상품을 생성할 수 있습니다."),
      );

      // Act & Assert
      await expect(
        controller.createClassProduct(
          mockRequest,
          "team-uuid",
          "class-uuid",
          createProductDto,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("GET /api/v1/teams/:teamId/classes/:classId/products", () => {
    it("should return class products", async () => {
      // Arrange
      mockClassesService.getClassProducts.mockResolvedValue([mockProduct]);

      // Act
      const result = await controller.getClassProducts("class-uuid");

      // Assert
      expect(result).toEqual([mockProduct]);
      expect(mockClassesService.getClassProducts).toHaveBeenCalledWith(
        "class-uuid",
      );
    });

    it("should return empty array if no products", async () => {
      // Arrange
      mockClassesService.getClassProducts.mockResolvedValue([]);

      // Act
      const result = await controller.getClassProducts("class-uuid");

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("API Response Format", () => {
    it("should return correct class creation response structure", async () => {
      // Arrange
      mockClassesService.createClass.mockResolvedValue(mockClass);
      const mockRequest = { user: { id: "coach-uuid" } } as any;

      // Act
      const result = await controller.createClass(mockRequest, "team-uuid", {
        className: "신규 수강생반",
        instructorName: "김철수",
        capacity: 15,
        startTime: new Date("2026-01-04T16:00:00Z"),
        endTime: new Date("2026-01-04T17:00:00Z"),
      });

      // Assert
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("teamId");
      expect(result).toHaveProperty("className");
      expect(result).toHaveProperty("instructorName");
      expect(result).toHaveProperty("capacity");
      expect(result).toHaveProperty("isActive");
    });

    it("should return correct product response structure", async () => {
      // Arrange
      mockClassesService.createClassProduct.mockResolvedValue(mockProduct);
      const mockRequest = { user: { id: "coach-uuid" } } as any;

      // Act
      const result = await controller.createClassProduct(
        mockRequest,
        "team-uuid",
        "class-uuid",
        {
          productName: "월 8회 수업",
          description: "설명",
          price: 240000,
          sessionsPerMonth: 8,
          durationDays: 30,
        },
      );

      // Assert
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("classId");
      expect(result).toHaveProperty("productName");
      expect(result).toHaveProperty("price");
      expect(result).toHaveProperty("sessionsPerMonth");
      expect(result).toHaveProperty("durationDays");
    });
  });
});
