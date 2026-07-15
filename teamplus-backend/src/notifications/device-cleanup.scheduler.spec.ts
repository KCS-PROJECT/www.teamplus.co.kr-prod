import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";
import { DeviceCleanupScheduler } from "./device-cleanup.scheduler";

describe("DeviceCleanupScheduler", () => {
  let scheduler: DeviceCleanupScheduler;

  const prismaMock = {
    userDevice: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const configMock = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceCleanupScheduler,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    scheduler = module.get<DeviceCleanupScheduler>(DeviceCleanupScheduler);
  });

  it("기본(env 미설정)은 dry-run — 카운트만 조회하고 변경 없음", async () => {
    configMock.get.mockReturnValue(undefined);

    await scheduler.handleDeviceCleanup();

    expect(prismaMock.userDevice.count).toHaveBeenCalledTimes(2);
    expect(prismaMock.userDevice.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.userDevice.deleteMany).not.toHaveBeenCalled();
  });

  it("DEVICE_CLEANUP_DRY_RUN=false 면 실제 정리 — 비활성화 + 삭제 조건이 규칙과 일치", async () => {
    configMock.get.mockReturnValue("false");
    prismaMock.userDevice.updateMany.mockResolvedValue({ count: 3 });
    prismaMock.userDevice.deleteMany.mockResolvedValue({ count: 5 });

    await scheduler.handleDeviceCleanup();

    const updateWhere = prismaMock.userDevice.updateMany.mock.calls[0][0].where;
    expect(updateWhere.isActive).toBe(true);
    expect(updateWhere.lastSeenAt.lt).toBeInstanceOf(Date);

    const deleteWhere = prismaMock.userDevice.deleteMany.mock.calls[0][0].where;
    expect(deleteWhere.isActive).toBe(false);
    expect(deleteWhere.updatedAt.lt).toBeInstanceOf(Date);

    // 비활성화 임계(270d)가 삭제 임계(90d)보다 과거여야 한다
    expect(updateWhere.lastSeenAt.lt.getTime()).toBeLessThan(
      deleteWhere.updatedAt.lt.getTime(),
    );
  });

  it("DB 오류는 격리 — throw 하지 않고 로그만", async () => {
    configMock.get.mockReturnValue("false");
    prismaMock.userDevice.updateMany.mockRejectedValue(new Error("DB down"));

    await expect(scheduler.handleDeviceCleanup()).resolves.toBeUndefined();
  });
});
