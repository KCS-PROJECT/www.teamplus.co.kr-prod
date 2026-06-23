import { Test, TestingModule } from "@nestjs/testing";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CheckInDto } from "./dto/check-in.dto";

describe("AttendanceController", () => {
  let controller: AttendanceController;

  const mockAttendance = {
    id: "attendance-uuid",
    memberId: "member-uuid",
    scheduleId: "schedule-uuid",
    attendanceStatus: "present",
    checkedInAt: new Date("2026-01-04T16:30:00Z"),
    creditDeducted: true,
  };

  const mockScheduleAttendance = {
    scheduleId: "schedule-uuid",
    scheduledDate: new Date("2026-01-05T16:00:00Z"),
    isCancelled: false,
    total: 15,
    present: 12,
    absent: 2,
    late: 1,
    presentRate: "80.0",
    attendances: [mockAttendance],
  };

  const mockAttendanceHistory = [
    {
      id: "attendance-uuid",
      className: "신규 수강생반",
      scheduledDate: new Date("2026-01-05T16:00:00Z"),
      attendanceStatus: "present",
      checkedInAt: new Date("2026-01-05T16:05:00Z"),
      creditDeducted: true,
    },
  ];

  const mockAttendanceStats = {
    classId: "class-uuid",
    totalSessions: 8,
    totalPresent: 96,
    totalAbsent: 8,
    totalLate: 4,
    presentRate: "80.0",
  };

  const mockAttendanceService = {
    checkInAttendance: jest.fn(),
    getScheduleAttendance: jest.fn(),
    getMemberAttendanceHistory: jest.fn(),
    getClassAttendanceStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        {
          provide: AttendanceService,
          useValue: mockAttendanceService,
        },
      ],
    }).compile();

    controller = module.get<AttendanceController>(AttendanceController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/v1/attendance/check-in", () => {
    const checkInDto: CheckInDto = {
      scheduleId: "schedule-uuid",
      memberId: "member-uuid",
    };

    const mockRequest = {
      user: { id: "user-uuid" },
    } as any;

    it("should check in attendance successfully", async () => {
      // Arrange
      mockAttendanceService.checkInAttendance.mockResolvedValue(mockAttendance);

      // Act
      const result = await controller.checkInAttendance(
        mockRequest,
        checkInDto,
      );

      // Assert
      expect(result.id).toBe(mockAttendance.id);
      expect(result.attendanceStatus).toBe("present");
      expect(result.creditDeducted).toBe(true);
      expect(mockAttendanceService.checkInAttendance).toHaveBeenCalledWith(
        "user-uuid",
        checkInDto.scheduleId,
      );
    });

    it("should call attendanceService.checkInAttendance with correct params", async () => {
      // Arrange
      mockAttendanceService.checkInAttendance.mockResolvedValue(mockAttendance);

      // Act
      await controller.checkInAttendance(mockRequest, checkInDto);

      // Assert
      expect(mockAttendanceService.checkInAttendance).toHaveBeenCalledWith(
        mockRequest.user.id,
        checkInDto.scheduleId,
      );
      expect(mockAttendanceService.checkInAttendance).toHaveBeenCalledTimes(1);
    });

    it("should handle cancelled schedule error", async () => {
      // Arrange
      mockAttendanceService.checkInAttendance.mockRejectedValue(
        new BadRequestException("취소된 일정입니다."),
      );

      // Act & Assert
      await expect(
        controller.checkInAttendance(mockRequest, checkInDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle insufficient credits error", async () => {
      // Arrange
      mockAttendanceService.checkInAttendance.mockRejectedValue(
        new BadRequestException("크레딧이 부족합니다."),
      );

      // Act & Assert
      await expect(
        controller.checkInAttendance(mockRequest, checkInDto),
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle schedule not found error", async () => {
      // Arrange
      mockAttendanceService.checkInAttendance.mockRejectedValue(
        new NotFoundException("일정을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(
        controller.checkInAttendance(mockRequest, checkInDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("GET /api/v1/attendance/schedule/:scheduleId", () => {
    it("should return schedule attendance successfully", async () => {
      // Arrange
      mockAttendanceService.getScheduleAttendance.mockResolvedValue(
        mockScheduleAttendance,
      );

      // Act
      const result = await controller.getScheduleAttendance("schedule-uuid");

      // Assert
      expect(result.scheduleId).toBe("schedule-uuid");
      expect(result.total).toBe(15);
      expect(result.present).toBe(12);
      expect(result.presentRate).toBe("80.0");
      expect(mockAttendanceService.getScheduleAttendance).toHaveBeenCalledWith(
        "schedule-uuid",
      );
    });

    it("should call attendanceService with correct scheduleId", async () => {
      // Arrange
      mockAttendanceService.getScheduleAttendance.mockResolvedValue(
        mockScheduleAttendance,
      );

      // Act
      await controller.getScheduleAttendance("test-schedule-id");

      // Assert
      expect(mockAttendanceService.getScheduleAttendance).toHaveBeenCalledWith(
        "test-schedule-id",
      );
    });

    it("should handle schedule not found error", async () => {
      // Arrange
      mockAttendanceService.getScheduleAttendance.mockRejectedValue(
        new NotFoundException("일정을 찾을 수 없습니다."),
      );

      // Act & Assert
      await expect(
        controller.getScheduleAttendance("invalid-schedule-id"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should return attendance list in response", async () => {
      // Arrange
      mockAttendanceService.getScheduleAttendance.mockResolvedValue(
        mockScheduleAttendance,
      );

      // Act
      const result = await controller.getScheduleAttendance("schedule-uuid");

      // Assert
      expect(result.attendances).toBeDefined();
      expect(Array.isArray(result.attendances)).toBe(true);
      expect(result.attendances.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/v1/attendance/member/:memberId", () => {
    it("should return member attendance history with default limit", async () => {
      // Arrange
      mockAttendanceService.getMemberAttendanceHistory.mockResolvedValue(
        mockAttendanceHistory,
      );

      // Act
      const result = await controller.getMemberAttendanceHistory("member-uuid");

      // Assert
      expect(result).toEqual(mockAttendanceHistory);
      expect(
        mockAttendanceService.getMemberAttendanceHistory,
      ).toHaveBeenCalledWith("member-uuid", 10);
    });

    it("should return member attendance history with custom limit", async () => {
      // Arrange
      mockAttendanceService.getMemberAttendanceHistory.mockResolvedValue(
        mockAttendanceHistory,
      );

      // Act
      const result = await controller.getMemberAttendanceHistory(
        "member-uuid",
        "20",
      );

      // Assert
      expect(result).toEqual(mockAttendanceHistory);
      expect(
        mockAttendanceService.getMemberAttendanceHistory,
      ).toHaveBeenCalledWith("member-uuid", 20);
    });

    it("should parse limit parameter correctly", async () => {
      // Arrange
      mockAttendanceService.getMemberAttendanceHistory.mockResolvedValue([]);

      // Act
      await controller.getMemberAttendanceHistory("member-uuid", "5");

      // Assert
      expect(
        mockAttendanceService.getMemberAttendanceHistory,
      ).toHaveBeenCalledWith("member-uuid", 5);
    });

    it("should return empty array if no history", async () => {
      // Arrange
      mockAttendanceService.getMemberAttendanceHistory.mockResolvedValue([]);

      // Act
      const result = await controller.getMemberAttendanceHistory("member-uuid");

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("GET /api/v1/attendance/class/:classId/stats", () => {
    it("should return class attendance stats", async () => {
      // Arrange
      mockAttendanceService.getClassAttendanceStats.mockResolvedValue(
        mockAttendanceStats,
      );

      // Act
      const result = await controller.getClassAttendanceStats("class-uuid");

      // Assert
      expect(result.classId).toBe("class-uuid");
      expect(result.totalSessions).toBe(8);
      expect(result.totalPresent).toBe(96);
      expect(result.presentRate).toBe("80.0");
      expect(
        mockAttendanceService.getClassAttendanceStats,
      ).toHaveBeenCalledWith("class-uuid");
    });

    it("should call attendanceService with correct classId", async () => {
      // Arrange
      mockAttendanceService.getClassAttendanceStats.mockResolvedValue(
        mockAttendanceStats,
      );

      // Act
      await controller.getClassAttendanceStats("test-class-id");

      // Assert
      expect(
        mockAttendanceService.getClassAttendanceStats,
      ).toHaveBeenCalledWith("test-class-id");
    });

    it("should return stats with all required fields", async () => {
      // Arrange
      mockAttendanceService.getClassAttendanceStats.mockResolvedValue(
        mockAttendanceStats,
      );

      // Act
      const result = await controller.getClassAttendanceStats("class-uuid");

      // Assert
      expect(result).toHaveProperty("classId");
      expect(result).toHaveProperty("totalSessions");
      expect(result).toHaveProperty("totalPresent");
      expect(result).toHaveProperty("totalAbsent");
      expect(result).toHaveProperty("totalLate");
      expect(result).toHaveProperty("presentRate");
    });
  });

  describe("Error Handling", () => {
    it("should propagate service errors correctly", async () => {
      // Arrange
      const error = new BadRequestException("Service error");
      mockAttendanceService.checkInAttendance.mockRejectedValue(error);

      const mockRequest = { user: { id: "user-uuid" } } as any;

      // Act & Assert
      await expect(
        controller.checkInAttendance(mockRequest, {
          scheduleId: "schedule-uuid",
          memberId: "member-uuid",
        }),
      ).rejects.toThrow(error);
    });

    it("should handle unexpected errors", async () => {
      // Arrange
      mockAttendanceService.getScheduleAttendance.mockRejectedValue(
        new Error("Unexpected error"),
      );

      // Act & Assert
      await expect(
        controller.getScheduleAttendance("schedule-uuid"),
      ).rejects.toThrow(Error);
    });
  });

  describe("API Response Format", () => {
    it("should return correct check-in response structure", async () => {
      // Arrange
      mockAttendanceService.checkInAttendance.mockResolvedValue(mockAttendance);
      const mockRequest = { user: { id: "user-uuid" } } as any;

      // Act
      const result = await controller.checkInAttendance(mockRequest, {
        scheduleId: "schedule-uuid",
        memberId: "member-uuid",
      });

      // Assert
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("memberId");
      expect(result).toHaveProperty("scheduleId");
      expect(result).toHaveProperty("attendanceStatus");
      expect(result).toHaveProperty("creditDeducted");
    });

    it("should return correct schedule attendance response structure", async () => {
      // Arrange
      mockAttendanceService.getScheduleAttendance.mockResolvedValue(
        mockScheduleAttendance,
      );

      // Act
      const result = await controller.getScheduleAttendance("schedule-uuid");

      // Assert
      expect(result).toHaveProperty("scheduleId");
      expect(result).toHaveProperty("scheduledDate");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("present");
      expect(result).toHaveProperty("absent");
      expect(result).toHaveProperty("attendances");
    });
  });
});
