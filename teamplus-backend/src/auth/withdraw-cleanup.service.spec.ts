import { Test, TestingModule } from "@nestjs/testing";
import { WithdrawCleanupService } from "./withdraw-cleanup.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { ConfigService } from "@nestjs/config";
import { UploadCleanupService } from "@/common/upload-cleanup.service";
import { AppleTokenService } from "./services/apple-token.service";

/**
 * 트랜잭션 콜백에 전달할 tx 목. user/childProfile findUnique 는 id 기준으로 분기해
 * 부모/자녀 각각의 avatar/photo URL 을 반환한다.
 */
function makeTxMock(
  fixtures: {
    avatarByUserId?: Record<string, string | null>;
    photoByUserId?: Record<string, string | null>;
    childProfileUserIds?: string[]; // childProfile 레코드가 존재하는 userId 목록
    creditsByUserId?: Record<
      string,
      Array<{ id: string; totalSessions: number; usedSessions: number }>
    >; // 잔여 수업권 소멸 검증용
  } = {},
) {
  const {
    avatarByUserId = {},
    photoByUserId = {},
    childProfileUserIds = [],
    creditsByUserId = {},
  } = fixtures;

  return {
    user: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve({ avatarUrl: avatarByUserId[where.id] ?? null }),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    childProfile: {
      findUnique: jest.fn(({ where }: any) => {
        if (!childProfileUserIds.includes(where.userId))
          return Promise.resolve(null);
        return Promise.resolve({ imageUrl: photoByUserId[where.userId] ?? null });
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    socialAccount: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    userNotificationPreference: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    userDevice: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    identityVerification: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    childPin: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    teamMember: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    parentChild: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    memberCredit: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(creditsByUserId[where.userId] ?? []),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    creditTransaction: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe("WithdrawCleanupService", () => {
  let service: WithdrawCleanupService;
  let prisma: {
    user: { findMany: jest.Mock };
    socialAccount: { findMany: jest.Mock };
    parentChild: { findMany: jest.Mock; count: jest.Mock };
    team: { count: jest.Mock };
    class: { count: jest.Mock };
    tournament: { count: jest.Mock };
    academy: { count: jest.Mock };
    enrollment: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let redisService: { del: jest.Mock };
  let uploadCleanupService: { cleanupReplacedUpload: jest.Mock };
  let appleTokenService: { revokeRefreshToken: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn() },
      socialAccount: { findMany: jest.fn().mockResolvedValue([]) },
      parentChild: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() },
      // findBlockingOwnership 재검증용 — 기본 0(차단 자산 없음)
      team: { count: jest.fn().mockResolvedValue(0) },
      class: { count: jest.fn().mockResolvedValue(0) },
      tournament: { count: jest.fn().mockResolvedValue(0) },
      academy: { count: jest.fn().mockResolvedValue(0) },
      enrollment: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(),
    };
    redisService = { del: jest.fn().mockResolvedValue(1) };
    uploadCleanupService = {
      cleanupReplacedUpload: jest.fn().mockResolvedValue(undefined),
    };
    appleTokenService = { revokeRefreshToken: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawCleanupService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redisService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue({ keyPrefix: { refresh: "refresh:" } }) },
        },
        { provide: AppleTokenService, useValue: appleTokenService },
        { provide: UploadCleanupService, useValue: uploadCleanupService },
      ],
    }).compile();

    service = module.get(WithdrawCleanupService);
  });

  it("[4] 유예 지난 대상 없음 → no-op (트랜잭션 미실행)", async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.handleWithdrawCleanup();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(uploadCleanupService.cleanupReplacedUpload).not.toHaveBeenCalled();
  });

  it("[5] 부모 1명 익명화 — email withdrawn_<id>, avatarUrl 로 cleanup 호출", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "p1" }]);
    const tx = makeTxMock({
      avatarByUserId: { p1: "/uploads/avatar/p1.display.webp" },
    });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await service.handleWithdrawCleanup();

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ email: "withdrawn_p1" }),
      }),
    );
    expect(uploadCleanupService.cleanupReplacedUpload).toHaveBeenCalledWith(
      "/uploads/avatar/p1.display.webp",
    );
    expect(redisService.del).toHaveBeenCalledWith("refresh:p1");
  });

  it("[6] 무보호자 자녀 연쇄 — 자녀 익명화 + parentChild.deleteMany + 자녀 파일 cleanup + 자녀 토큰 삭제", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "p1" }]);
    prisma.parentChild.findMany.mockResolvedValue([{ childId: "c1" }]);
    prisma.parentChild.count.mockResolvedValue(0); // 다른 활성 보호자 없음
    const tx = makeTxMock({
      avatarByUserId: {
        p1: "/uploads/avatar/p1.display.webp",
        c1: "/uploads/avatar/c1.display.webp",
      },
      photoByUserId: { c1: "/uploads/avatar/c1photo.display.webp" },
      childProfileUserIds: ["c1"],
    });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await service.handleWithdrawCleanup();

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({ email: "withdrawn_c1" }),
      }),
    );
    expect(tx.childProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: "c1" },
      data: expect.objectContaining({ imageUrl: null }),
    });
    expect(tx.parentChild.deleteMany).toHaveBeenCalledWith({
      where: { childId: "c1" },
    });
    expect(uploadCleanupService.cleanupReplacedUpload).toHaveBeenCalledWith(
      "/uploads/avatar/c1.display.webp",
    );
    expect(uploadCleanupService.cleanupReplacedUpload).toHaveBeenCalledWith(
      "/uploads/avatar/c1photo.display.webp",
    );
    expect(redisService.del).toHaveBeenCalledWith("refresh:c1");
  });

  it("[6-1] 잔여 수업권 소멸 — 부모+연쇄 자녀의 잔여분만 소진 + expired 기록", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "p1" }]);
    prisma.parentChild.findMany.mockResolvedValue([{ childId: "c1" }]);
    prisma.parentChild.count.mockResolvedValue(0);
    const tx = makeTxMock({
      childProfileUserIds: ["c1"],
      creditsByUserId: {
        c1: [
          { id: "mc1", totalSessions: 10, usedSessions: 3 }, // 잔여 7 → 소멸
          { id: "mc2", totalSessions: 5, usedSessions: 5 }, // 잔여 0 → 무시
        ],
      },
    });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await service.handleWithdrawCleanup();

    // 부모(p1)·자녀(c1) 모두 조회하되, 잔여분 있는 mc1 만 소진
    expect(tx.memberCredit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "p1" } }),
    );
    expect(tx.memberCredit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "c1" } }),
    );
    expect(tx.memberCredit.update).toHaveBeenCalledTimes(1);
    expect(tx.memberCredit.update).toHaveBeenCalledWith({
      where: { id: "mc1" },
      data: { usedSessions: 10 },
    });
    expect(tx.creditTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memberCreditId: "mc1",
        type: "expired",
        amount: 7,
        balanceAfter: 0,
      }),
    });
    // AuditLog 에 소멸 합계 기록
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        newValue: expect.objectContaining({ expiredSessions: 7 }),
      }),
    });
  });

  it("[7] 다른 활성 보호자 있는 자녀 제외 — 익명화·관계삭제 미실행", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "p1" }]);
    prisma.parentChild.findMany.mockResolvedValue([{ childId: "c1" }]);
    prisma.parentChild.count.mockResolvedValue(1); // 다른 활성 보호자 존재
    const tx = makeTxMock({
      avatarByUserId: { p1: null },
    });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await service.handleWithdrawCleanup();

    // 부모만 update, 자녀 c1 은 update 안 됨
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" } }),
    );
    expect(tx.parentChild.deleteMany).not.toHaveBeenCalled();
    expect(redisService.del).not.toHaveBeenCalledWith("refresh:c1");
  });

  it("[8] 공동 보호자가 WITHDRAWN/WITHDRAW_PENDING 뿐이면 자녀는 orphan 처리(연쇄 익명화)", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "p1" }]);
    prisma.parentChild.findMany.mockResolvedValue([{ childId: "c1" }]);
    // count 쿼리가 status notIn 필터를 포함하므로, 탈퇴 보호자만 있으면 0 반환
    prisma.parentChild.count.mockResolvedValue(0);
    const tx = makeTxMock({ childProfileUserIds: ["c1"] });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await service.handleWithdrawCleanup();

    // count 쿼리 조건 검증 — 다른 부모 + 활성 상태만 카운트
    expect(prisma.parentChild.count).toHaveBeenCalledWith({
      where: {
        childId: "c1",
        parentId: { not: "p1" },
        parent: { status: { notIn: ["WITHDRAWN", "WITHDRAW_PENDING"] } },
      },
    });
    expect(tx.parentChild.deleteMany).toHaveBeenCalledWith({
      where: { childId: "c1" },
    });
  });

  it("[9] Apple revoke 가 false 를 반환해도 트랜잭션 진행(회귀)", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "p1" }]);
    prisma.socialAccount.findMany.mockResolvedValue([
      { appleRefreshToken: "apple-token" },
    ]);
    appleTokenService.revokeRefreshToken.mockResolvedValue(false);
    const tx = makeTxMock();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await service.handleWithdrawCleanup();

    expect(appleTokenService.revokeRefreshToken).toHaveBeenCalledWith(
      "apple-token",
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalled();
  });

  it("[10] 파일 cleanup reject 해도 배치 성공(best-effort)", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "p1" }]);
    uploadCleanupService.cleanupReplacedUpload.mockRejectedValue(
      new Error("disk error"),
    );
    const tx = makeTxMock({
      avatarByUserId: { p1: "/uploads/avatar/p1.display.webp" },
    });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await expect(service.handleWithdrawCleanup()).resolves.not.toThrow();
    // 비식별화 자체는 커밋됨
    expect(tx.user.update).toHaveBeenCalled();
    expect(redisService.del).toHaveBeenCalledWith("refresh:p1");
  });

  it("[11] Redis del 실패해도 비식별화 성공(회귀)", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "p1" }]);
    redisService.del.mockRejectedValue(new Error("redis down"));
    const tx = makeTxMock();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await expect(service.handleWithdrawCleanup()).resolves.not.toThrow();
    expect(tx.user.update).toHaveBeenCalled();
  });

  it("[12] per-user 격리 — 1명 실패해도 나머지 처리 지속", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    const okTx = makeTxMock();
    prisma.$transaction
      .mockImplementationOnce(async () => {
        throw new Error("tx failed for p1");
      })
      .mockImplementationOnce(async (fn: any) => fn(okTx));

    await service.handleWithdrawCleanup();

    // p2 는 정상 처리
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(okTx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p2" } }),
    );
  });

  it("[13] 결과 email 에 SHA-256 해시가 들어가지 않음(hashEmail 폐기)", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "p1" }]);
    const tx = makeTxMock();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await service.handleWithdrawCleanup();

    const updateData = tx.user.update.mock.calls[0][0].data;
    expect(updateData.email).toBe("withdrawn_p1");
    expect(String(updateData.email)).not.toMatch(/@deleted\.teamplus\.com$/);
    expect(String(updateData.email)).not.toMatch(/[a-f0-9]{64}/); // 64자 hex 해시 부재
  });

  it("[14] 확정 직전 재검증 — 차단 자산 보유 사용자는 skip(익명화 미실행·상태 미변경)", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: "d1", userType: "DIRECTOR" },
    ]);
    prisma.team.count.mockResolvedValue(1); // 유예 중 신규 생성된 운영 팀
    const tx = makeTxMock();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await service.handleWithdrawCleanup();

    // 재검증에서 차단 → 익명화 트랜잭션 자체가 실행되지 않음(상태 WITHDRAW_PENDING 유지)
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(uploadCleanupService.cleanupReplacedUpload).not.toHaveBeenCalled();
    expect(redisService.del).not.toHaveBeenCalled();
  });

  it("[15] 차단 자산 없는 DIRECTOR 는 정상 익명화 진행", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: "d2", userType: "DIRECTOR" },
    ]);
    // team/class/tournament/academy count 모두 기본 0 → 차단 없음
    const tx = makeTxMock();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await service.handleWithdrawCleanup();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d2" },
        data: expect.objectContaining({ email: "withdrawn_d2" }),
      }),
    );
    expect(redisService.del).toHaveBeenCalledWith("refresh:d2");
  });
});
