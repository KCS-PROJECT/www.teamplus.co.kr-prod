import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { DataExportService } from "./data-export.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("DataExportService", () => {
  let service: DataExportService;

  const mockPrismaService = {
    dataExportRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    classAttendance: { findMany: jest.fn() },
    memberCredit: { findMany: jest.fn() },
    enrollment: { findMany: jest.fn() },
    notification: { findMany: jest.fn() },
    auditLog: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DataExportService>(DataExportService);
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── requestExport ─────────────────────────────────────────────────────────

  describe("requestExport", () => {
    it("30일 내 이미 처리 중인 요청이 있으면 BadRequestException을 던진다", async () => {
      mockPrismaService.dataExportRequest.findFirst.mockResolvedValue({
        id: "req-existing",
        status: "processing",
      });

      await expect(service.requestExport("user-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("30일 내 ready 상태 요청이 있어도 BadRequestException을 던진다", async () => {
      mockPrismaService.dataExportRequest.findFirst.mockResolvedValue({
        id: "req-ready",
        status: "ready",
      });

      await expect(service.requestExport("user-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("정상 생성 시 status=processing 을 즉시 반환한다", async () => {
      mockPrismaService.dataExportRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.dataExportRequest.create.mockResolvedValue({
        id: "req-new",
        status: "processing",
      });
      // processExport 내부 비동기 콜 mock
      mockPrismaService.dataExportRequest.update.mockResolvedValue({});
      mockPrismaService.user.findUnique.mockResolvedValue({ id: "user-1" });
      mockPrismaService.classAttendance.findMany.mockResolvedValue([]);
      mockPrismaService.memberCredit.findMany.mockResolvedValue([]);
      mockPrismaService.enrollment.findMany.mockResolvedValue([]);
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);

      const result = await service.requestExport("user-1");

      expect(result.status).toBe("processing");
      expect(result.id).toBe("req-new");
      expect(result.expiresAt).toBeInstanceOf(Date);
    });
  });

  // ── getLatestStatus ───────────────────────────────────────────────────────

  describe("getLatestStatus", () => {
    it("요청이 없으면 hasRequest=false 를 반환한다", async () => {
      mockPrismaService.dataExportRequest.findFirst.mockResolvedValue(null);

      const result = await service.getLatestStatus("user-1");

      expect(result).toEqual({ hasRequest: false });
    });

    it("expiresAt 이 지난 ready 요청은 status=expired 를 오버라이드한다", async () => {
      const pastDate = new Date(Date.now() - 1000); // 1초 전
      mockPrismaService.dataExportRequest.findFirst.mockResolvedValue({
        id: "req-1",
        status: "ready",
        fileSize: 1024,
        requestedAt: new Date(),
        readyAt: new Date(),
        expiresAt: pastDate,
        errorMessage: null,
      });

      const result = await service.getLatestStatus("user-1");

      expect(result.hasRequest).toBe(true);
      expect((result as any).status).toBe("expired");
    });

    it("만료되지 않은 ready 요청은 status=ready 를 그대로 반환한다", async () => {
      const futureDate = new Date(Date.now() + 86400_000); // 1일 후
      mockPrismaService.dataExportRequest.findFirst.mockResolvedValue({
        id: "req-1",
        status: "ready",
        fileSize: 1024,
        requestedAt: new Date(),
        readyAt: new Date(),
        expiresAt: futureDate,
        errorMessage: null,
      });

      const result = await service.getLatestStatus("user-1");

      expect((result as any).status).toBe("ready");
    });
  });

  // ── downloadExport ────────────────────────────────────────────────────────

  describe("downloadExport", () => {
    it("요청이 없으면 NotFoundException을 던진다", async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.downloadExport("user-1", "req-unknown"),
      ).rejects.toThrow(NotFoundException);
    });

    it("다른 사용자의 requestId 접근 시 ForbiddenException을 던진다", async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        userId: "user-other",
        status: "ready",
        expiresAt: new Date(Date.now() + 86400_000),
      });

      await expect(service.downloadExport("user-1", "req-1")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("status가 ready가 아니면 BadRequestException을 던진다", async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        userId: "user-1",
        status: "processing",
        expiresAt: new Date(Date.now() + 86400_000),
      });

      await expect(service.downloadExport("user-1", "req-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("만료된 요청에 접근하면 BadRequestException을 던진다", async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        userId: "user-1",
        status: "ready",
        expiresAt: new Date(Date.now() - 1000), // 이미 만료
      });

      await expect(service.downloadExport("user-1", "req-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("유효한 ready 요청이면 수집된 데이터를 반환한다", async () => {
      mockPrismaService.dataExportRequest.findUnique.mockResolvedValue({
        userId: "user-1",
        status: "ready",
        expiresAt: new Date(Date.now() + 86400_000),
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@test.com",
      });
      mockPrismaService.classAttendance.findMany.mockResolvedValue([]);
      mockPrismaService.memberCredit.findMany.mockResolvedValue([]);
      mockPrismaService.enrollment.findMany.mockResolvedValue([]);
      mockPrismaService.notification.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);

      const result = await service.downloadExport("user-1", "req-1");

      expect(result).toHaveProperty("exportedAt");
      expect(result).toHaveProperty("profile");
    });
  });
});
