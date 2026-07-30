import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { NoticesService } from "./notices.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";

/**
 * 팀 공지 댓글 작성 권한 — "열람 가능한 공지에만 댓글" 단일 규칙.
 *
 * 학부모는 resolveViewerTeamIds(childId 미지정 = 전체 자녀, approved 만) 기준이므로
 * 자녀 중 해당 팀 approved 멤버가 1명 이상일 때만 작성할 수 있다.
 * (가입 승인 대기·거절·무소속 자녀만 보유 시 차단 — 목록 열람 완화와 분리된 경계)
 */
describe("NoticesService — 댓글 작성 권한", () => {
  let service: NoticesService;
  let prisma: {
    systemNotice: { findUnique: jest.Mock };
    noticeComment: { create: jest.Mock };
    teamMember: { findMany: jest.Mock };
    coachProfile: { findMany: jest.Mock };
    team: { findMany: jest.Mock };
    parentChild: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  const PARENT_ID = "parent-1";
  const CHILD_ID = "child-1";
  const TEAM_ID = "team-1";
  const NOTICE_ID = "notice-1";

  const teamNotice = {
    id: NOTICE_ID,
    title: "이번 주 훈련 안내",
    targetTeamId: TEAM_ID,
    isActive: true,
    createdBy: "director-1",
  };

  /** 학부모 자녀의 팀 멤버십 상태를 지정 — resolveViewerTeamIds 가 읽는 경로. */
  const setChildMembership = (memberships: Array<{ teamId: string }>) => {
    prisma.parentChild.findMany.mockResolvedValue([{ childId: CHILD_ID }]);
    // resolveManagedTeamIds — 학부모 본인은 관리/소속 팀 없음
    prisma.teamMember.findMany
      .mockResolvedValueOnce([]) // 본인 TeamMember
      .mockResolvedValueOnce(memberships); // 자녀 TeamMember (approved 조건 적용된 결과)
    prisma.coachProfile.findMany.mockResolvedValue([]);
    prisma.team.findMany.mockResolvedValue([]);
  };

  beforeEach(async () => {
    prisma = {
      systemNotice: { findUnique: jest.fn() },
      noticeComment: { create: jest.fn() },
      teamMember: { findMany: jest.fn() },
      coachProfile: { findMany: jest.fn() },
      team: { findMany: jest.fn() },
      parentChild: { findMany: jest.fn(), findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoticesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: { get: jest.fn(), del: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: { notifyTeamManagers: jest.fn() },
        },
        { provide: ViewCounterService, useValue: { increment: jest.fn() } },
      ],
    }).compile();

    service = module.get<NoticesService>(NoticesService);
    prisma.systemNotice.findUnique.mockResolvedValue(teamNotice);
    prisma.noticeComment.create.mockResolvedValue({
      id: "comment-1",
      noticeId: NOTICE_ID,
      userId: PARENT_ID,
      content: "확인했습니다.",
      user: { id: PARENT_ID, firstName: "부모", lastName: "안" },
    });
  });

  it("자녀가 해당 팀 approved 멤버면 댓글을 작성한다", async () => {
    setChildMembership([{ teamId: TEAM_ID }]);

    const result = await service.createComment(
      NOTICE_ID,
      PARENT_ID,
      "확인했습니다.",
      "PARENT",
    );

    expect(result.id).toBe("comment-1");
    expect(prisma.noticeComment.create).toHaveBeenCalledTimes(1);
  });

  it("해당 팀 approved 자녀가 없으면 404 로 차단하고 댓글을 만들지 않는다", async () => {
    // 승인 대기/거절/무소속만 보유 → approved 필터 결과가 빈 배열
    setChildMembership([]);

    await expect(
      service.createComment(NOTICE_ID, PARENT_ID, "확인했습니다.", "PARENT"),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.noticeComment.create).not.toHaveBeenCalled();
  });

  it("다른 팀 소속 자녀만 있으면 차단한다", async () => {
    setChildMembership([{ teamId: "team-other" }]);

    await expect(
      service.createComment(NOTICE_ID, PARENT_ID, "확인했습니다.", "PARENT"),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.noticeComment.create).not.toHaveBeenCalled();
  });

  it("시스템 공지(targetTeamId=null)는 팀 소속 없이도 작성할 수 있다", async () => {
    prisma.systemNotice.findUnique.mockResolvedValue({
      ...teamNotice,
      targetTeamId: null,
    });

    await expect(
      service.createComment(NOTICE_ID, PARENT_ID, "확인했습니다.", "PARENT"),
    ).resolves.toBeDefined();
    // 팀 조회 없이 통과 — 추가 쿼리 0
    expect(prisma.teamMember.findMany).not.toHaveBeenCalled();
  });

  it("ADMIN 은 팀 소속 검증 없이 작성할 수 있다", async () => {
    await expect(
      service.createComment(NOTICE_ID, "admin-1", "확인", "ADMIN"),
    ).resolves.toBeDefined();
    expect(prisma.teamMember.findMany).not.toHaveBeenCalled();
  });

  it("미게시 공지에는 댓글을 작성할 수 없다", async () => {
    prisma.systemNotice.findUnique.mockResolvedValue({
      ...teamNotice,
      isActive: false,
    });
    setChildMembership([{ teamId: TEAM_ID }]);

    await expect(
      service.createComment(NOTICE_ID, PARENT_ID, "확인", "PARENT"),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.noticeComment.create).not.toHaveBeenCalled();
  });
});
