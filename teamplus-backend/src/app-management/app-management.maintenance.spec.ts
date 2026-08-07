import { Test, TestingModule } from "@nestjs/testing";
import { AppManagementService } from "./app-management.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";

/**
 * 앱 점검 공지 읽기 격리 — 전역(targetTeamId=null) 공지만 점검 판정.
 *
 * `GET /app-management/maintenance-notice` 는 @Public 이고 결과가 앱 진입 차단
 * 화면을 발동시키므로, 팀 공지가 maintenance 타입을 달고 있어도 전체 앱을 막으면
 * 안 된다. 쓰기 가드(NoticesService — 시스템 역할 + 전역 전용)와 별개로,
 * 레거시·우회 생성분까지 무력화하는 2차 방어가 이 쿼리 필터다.
 */
describe("AppManagementService — 점검 공지 읽기 격리", () => {
  let service: AppManagementService;
  let prisma: { systemNotice: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { systemNotice: { findFirst: jest.fn().mockResolvedValue(null) } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppManagementService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: RedisService,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AppManagementService>(AppManagementService);
  });

  it("점검 판정 쿼리는 전역 공지(targetTeamId=null)만 대상으로 한다", async () => {
    await service.getActiveMaintenanceNotice();

    expect(prisma.systemNotice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetType: "maintenance",
          targetTeamId: null,
          isActive: true,
        }),
      }),
    );
  });

  it("활성 점검 공지가 없으면 null — 앱은 정상 진입", async () => {
    await expect(service.getActiveMaintenanceNotice()).resolves.toBeNull();
  });
});
