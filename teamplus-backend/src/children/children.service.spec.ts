import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ChildrenService } from "./children.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { UploadCleanupService } from "@/common/upload-cleanup.service";

/**
 * deleteChild 무보호자 자녀 삭제 경로의 비식별화 동일화(P4a) 검증.
 * anonymizeUserWithinTx 는 실제 util 을 그대로 호출하므로 tx mock 이 해당 메서드를 모두 제공한다.
 */
describe("ChildrenService - deleteChild", () => {
  let service: ChildrenService;

  const PARENT_ID = "parent-1";
  const CHILD_ID = "child-1";

  // 트랜잭션 내부 tx 클라이언트 mock (anonymizeUserWithinTx 가 사용하는 메서드 포함)
  let txMock: any;

  const mockPrisma = {
    parentChild: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockUploadCleanupService = {
    cleanupReplacedUpload: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    txMock = {
      parentChild: {
        delete: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
      },
      enrollment: { count: jest.fn().mockResolvedValue(0) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ avatarUrl: null }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      childProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
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
    };

    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txMock));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChildrenService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: UploadCleanupService, useValue: mockUploadCleanupService },
      ],
    }).compile();

    service = module.get<ChildrenService>(ChildrenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const primaryLink = { isPrimary: true, child: { id: CHILD_ID } };

  // 14. 다른 보호자 존재 → 관계만 해제, User 미변경
  it("다른 보호자가 있으면 관계만 해제하고 User 비식별화는 하지 않는다", async () => {
    mockPrisma.parentChild.findUnique.mockResolvedValue(primaryLink);
    mockPrisma.parentChild.count.mockResolvedValue(1);
    txMock.parentChild.findFirst.mockResolvedValue({ id: "link-2" });

    await service.deleteChild(PARENT_ID, CHILD_ID);

    expect(txMock.parentChild.delete).toHaveBeenCalled();
    expect(txMock.parentChild.update).toHaveBeenCalledWith({
      where: { id: "link-2" },
      data: { isPrimary: true },
    });
    // 익명화 경로 미실행
    expect(txMock.user.update).not.toHaveBeenCalled();
    expect(mockUploadCleanupService.cleanupReplacedUpload).not.toHaveBeenCalled();
  });

  // 15. 무보호자 + 진행 중 수강신청 → BadRequestException, 익명화 미실행
  it("무보호자 자녀에 진행 중 수강신청이 있으면 차단하고 익명화하지 않는다", async () => {
    mockPrisma.parentChild.findUnique.mockResolvedValue(primaryLink);
    mockPrisma.parentChild.count.mockResolvedValue(0);
    txMock.enrollment.count.mockResolvedValue(2);

    await expect(service.deleteChild(PARENT_ID, CHILD_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(txMock.user.update).not.toHaveBeenCalled();
    expect(mockUploadCleanupService.cleanupReplacedUpload).not.toHaveBeenCalled();
  });

  // 16. 무보호자 + 수강신청 없음 → anonymizeUserWithinTx 경유 비식별화
  it("무보호자 자녀는 withdrawn_<childId> 로 비식별화되고 원본 이메일이 남지 않는다", async () => {
    mockPrisma.parentChild.findUnique.mockResolvedValue(primaryLink);
    mockPrisma.parentChild.count.mockResolvedValue(0);
    txMock.enrollment.count.mockResolvedValue(0);
    txMock.childProfile.findUnique.mockResolvedValue({
      imageUrl: "/uploads/child/photo.display.webp",
    });

    await service.deleteChild(PARENT_ID, CHILD_ID);

    expect(txMock.parentChild.deleteMany).toHaveBeenCalledWith({
      where: { childId: CHILD_ID },
    });

    const updateArg = txMock.user.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: CHILD_ID });
    expect(updateArg.data.email).toBe(`withdrawn_${CHILD_ID}`);
    expect(updateArg.data.status).toBe("WITHDRAWN");
    // 원본 이메일 prefix(deleted_) 잔존 없음
    expect(updateArg.data.email).not.toContain("deleted_");
    // ChildProfile 비식별화(imageUrl null)
    expect(txMock.childProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: CHILD_ID },
        data: expect.objectContaining({ imageUrl: null }),
      }),
    );
    // teamMember leftAt 종료(util 처리)
    expect(txMock.teamMember.updateMany).toHaveBeenCalled();
  });

  // 17. 파일삭제 호출 검증 + reject 시에도 삭제 자체는 성공
  it("비식별화 후 avatar/사진 파일 삭제를 호출하며, 삭제 실패해도 성공 처리한다", async () => {
    mockPrisma.parentChild.findUnique.mockResolvedValue(primaryLink);
    mockPrisma.parentChild.count.mockResolvedValue(0);
    txMock.enrollment.count.mockResolvedValue(0);
    txMock.user.findUnique.mockResolvedValue({
      avatarUrl: "/uploads/user/avatar.display.webp",
    });
    txMock.childProfile.findUnique.mockResolvedValue({
      imageUrl: "/uploads/child/photo.display.webp",
    });
    mockUploadCleanupService.cleanupReplacedUpload.mockRejectedValue(
      new Error("disk error"),
    );

    await expect(
      service.deleteChild(PARENT_ID, CHILD_ID),
    ).resolves.toBeUndefined();

    expect(mockUploadCleanupService.cleanupReplacedUpload).toHaveBeenCalledWith(
      "/uploads/user/avatar.display.webp",
    );
    expect(mockUploadCleanupService.cleanupReplacedUpload).toHaveBeenCalledWith(
      "/uploads/child/photo.display.webp",
    );
  });
});
