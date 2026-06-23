import { Test, TestingModule } from "@nestjs/testing";
import { ChildAuthService } from "./child-auth.service";
import { PrismaService } from "@/prisma/prisma.service";
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";

jest.mock("bcrypt");

describe("ChildAuthService", () => {
  let service: ChildAuthService;

  const mockPrisma = {
    childProfile: {
      findUnique: jest.fn(),
    },
    parentChild: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    childPin: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChildAuthService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ChildAuthService>(ChildAuthService);
    jest.clearAllMocks();
  });

  describe("setPin", () => {
    const parentUserId = "parent-1";
    const childProfileId = "cp-1";
    const pin = "482951";

    beforeEach(() => {
      mockPrisma.childProfile.findUnique.mockResolvedValue({
        id: childProfileId,
        userId: "child-user-1",
      });
      mockPrisma.parentChild.findUnique.mockResolvedValue({
        id: "pc-1",
        parentId: parentUserId,
        childId: "child-user-1",
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-pin");
      mockPrisma.childPin.upsert.mockResolvedValue({ id: "pin-1" });
    });

    it("정상적으로 PIN을 설정해야 한다", async () => {
      const result = await service.setPin(parentUserId, childProfileId, pin);

      expect(result.success).toBe(true);
      expect(result.message).toBe("자녀 PIN이 설정되었습니다.");
      expect(bcrypt.hash).toHaveBeenCalledWith(pin, 10);
      expect(mockPrisma.childPin.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { childProfileId },
          create: expect.objectContaining({ pinHash: "hashed-pin" }),
        }),
      );
    });

    it("자녀 프로필이 없으면 404를 던져야 한다", async () => {
      mockPrisma.childProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.setPin(parentUserId, childProfileId, pin),
      ).rejects.toThrow(NotFoundException);
    });

    it("소유권이 없으면 403을 던져야 한다", async () => {
      mockPrisma.parentChild.findUnique.mockResolvedValue(null);

      await expect(
        service.setPin(parentUserId, childProfileId, pin),
      ).rejects.toThrow(ForbiddenException);
    });

    it("연속 숫자 PIN(123456)을 거부해야 한다", async () => {
      await expect(
        service.setPin(parentUserId, childProfileId, "123456"),
      ).rejects.toThrow(BadRequestException);
    });

    it("동일 숫자 PIN(111111)을 거부해야 한다", async () => {
      await expect(
        service.setPin(parentUserId, childProfileId, "111111"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("verifyPin", () => {
    const childProfileId = "cp-1";
    const pin = "482951";

    it("올바른 PIN으로 검증에 성공해야 한다", async () => {
      mockPrisma.childPin.findUnique.mockResolvedValue({
        id: "pin-1",
        childProfileId,
        pinHash: "hashed-pin",
        failedAttempts: 0,
        lockedUntil: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.childPin.update.mockResolvedValue({});

      const result = await service.verifyPin(childProfileId, pin);

      expect(result.data.verified).toBe(true);
    });

    it("잘못된 PIN이면 실패 횟수가 증가해야 한다", async () => {
      mockPrisma.childPin.findUnique.mockResolvedValue({
        id: "pin-1",
        childProfileId,
        pinHash: "hashed-pin",
        failedAttempts: 2,
        lockedUntil: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrisma.childPin.update.mockResolvedValue({});

      const result = await service.verifyPin(childProfileId, pin);

      expect(result.data.verified).toBe(false);
      expect(mockPrisma.childPin.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedAttempts: 3 }),
        }),
      );
    });

    it("5회 실패 시 ForbiddenException을 던져야 한다", async () => {
      mockPrisma.childPin.findUnique.mockResolvedValue({
        id: "pin-1",
        childProfileId,
        pinHash: "hashed-pin",
        failedAttempts: 4,
        lockedUntil: null,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockPrisma.childPin.update.mockResolvedValue({});

      await expect(service.verifyPin(childProfileId, pin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("잠금 상태에서는 403을 던져야 한다", async () => {
      const futureDate = new Date(Date.now() + 5 * 60 * 1000);
      mockPrisma.childPin.findUnique.mockResolvedValue({
        id: "pin-1",
        childProfileId,
        pinHash: "hashed-pin",
        failedAttempts: 5,
        lockedUntil: futureDate,
      });

      await expect(service.verifyPin(childProfileId, pin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("PIN이 설정되지 않았으면 404를 던져야 한다", async () => {
      mockPrisma.childPin.findUnique.mockResolvedValue(null);

      await expect(service.verifyPin(childProfileId, pin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("deletePin", () => {
    const parentUserId = "parent-1";
    const childProfileId = "cp-1";

    it("정상적으로 PIN을 삭제해야 한다", async () => {
      mockPrisma.childProfile.findUnique.mockResolvedValue({
        id: childProfileId,
        userId: "child-user-1",
      });
      mockPrisma.parentChild.findUnique.mockResolvedValue({
        id: "pc-1",
        parentId: parentUserId,
        childId: "child-user-1",
      });
      mockPrisma.childPin.findUnique.mockResolvedValue({
        id: "pin-1",
      });
      mockPrisma.childPin.delete.mockResolvedValue({});

      const result = await service.deletePin(parentUserId, childProfileId);

      expect(result.success).toBe(true);
      expect(mockPrisma.childPin.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { childProfileId } }),
      );
    });

    it("자녀 프로필이 없으면 404를 던져야 한다", async () => {
      mockPrisma.childProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.deletePin(parentUserId, childProfileId),
      ).rejects.toThrow(NotFoundException);
    });

    it("PIN이 없으면 404를 던져야 한다", async () => {
      mockPrisma.childProfile.findUnique.mockResolvedValue({
        id: childProfileId,
        userId: "child-user-1",
      });
      mockPrisma.parentChild.findUnique.mockResolvedValue({
        id: "pc-1",
      });
      mockPrisma.childPin.findUnique.mockResolvedValue(null);

      await expect(
        service.deletePin(parentUserId, childProfileId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
