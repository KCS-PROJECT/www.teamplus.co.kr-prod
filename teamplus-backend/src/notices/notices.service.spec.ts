import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { NoticesService } from "./notices.service";
import { NoticeType } from "./dto/create-notice.dto";
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

/**
 * Phase 0 회귀 — 공지 관리 권한 SoT · 대상 팀 전이 계약 · 게시 기간 인가.
 * (F-03 · F-04 · F-09 · F-EX-01 · F-EX-03 · F-EX-04)
 */
describe("NoticesService — Phase 0 권한·전이·게시기간", () => {
  let service: NoticesService;
  let prisma: {
    systemNotice: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
    noticeComment: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    noticeRead: { upsert: jest.Mock; createMany: jest.Mock };
    auditLog: { create: jest.Mock };
    user: { findUnique: jest.Mock };
    team: { findMany: jest.Mock };
    teamMember: { findMany: jest.Mock };
    coachProfile: { findMany: jest.Mock };
    parentChild: { findMany: jest.Mock; findFirst: jest.Mock };
  };

  const TEAM_A = "team-a";
  const TEAM_B = "team-b";
  const TEAM_C = "team-c";
  const NOTICE_ID = "notice-1";
  const USER_ID = "user-1";

  /** 공지 관리 SoT(resolveNoticeManageTeamIds) 가 읽는 두 경로를 한 번에 지정. */
  const setManageTeams = (teamIds: string[]) => {
    prisma.team.findMany.mockResolvedValue(teamIds.map((id) => ({ id })));
    prisma.teamMember.findMany.mockResolvedValue([]);
  };

  /**
   * 열람 SoT(resolveViewerTeamIds) 만 통과하는 일반 회원 — 관리 권한은 없음.
   *
   * 두 SoT 가 같은 `teamMember.findMany` 를 호출하므로 **실제 쿼리 차이(`roleInTeam` 필터)**로
   * 분기해야 한다. 단순 mockResolvedValue 로 두면 일반 회원이 관리자로 오판되어
   * "게시 기간 밖 → 관리자만 열람" 가드가 검증되지 않는다.
   */
  const setViewerTeams = (teamIds: string[]) => {
    prisma.teamMember.findMany.mockImplementation(
      (args: { where?: { roleInTeam?: unknown } }) =>
        Promise.resolve(
          // roleInTeam 필터가 있으면 관리 SoT 조회 → 일반 회원은 해당 없음
          args?.where?.roleInTeam ? [] : teamIds.map((teamId) => ({ teamId })),
        ),
    );
    prisma.coachProfile.findMany.mockResolvedValue([]);
    prisma.team.findMany.mockResolvedValue([]);
  };

  const teamNotice = (overrides: Record<string, unknown> = {}) => ({
    id: NOTICE_ID,
    title: "훈련 안내",
    content: "본문",
    targetTeamId: TEAM_A,
    isActive: true,
    createdBy: "director-other",
    startAt: null,
    expiresAt: null,
    pinned: false,
    displayLocationsJson: [],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      systemNotice: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        // 게시 알림 claim — 기본은 "claim 획득"(count:1). 소진 케이스는 개별 테스트가 재지정.
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      noticeComment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({ id: "comment-1" }),
      },
      noticeRead: {
        upsert: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
      user: { findUnique: jest.fn() },
      team: { findMany: jest.fn().mockResolvedValue([]) },
      teamMember: { findMany: jest.fn().mockResolvedValue([]) },
      coachProfile: { findMany: jest.fn().mockResolvedValue([]) },
      parentChild: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      // 트랜잭션 — 단위 spec 에서는 콜백형이면 같은 mock 을 tx 로 넘겨 실행,
      // 배열형(Promise 목록)이면 Promise.all. 실제 격리·직렬화 충돌은
      // PostgreSQL 통합 spec(notice-pin-concurrency)이 검증한다.
      $transaction: jest.fn((arg: unknown) =>
        Array.isArray(arg)
          ? Promise.all(arg)
          : ((arg as (tx: unknown) => Promise<unknown>)(
              prisma,
            ) as Promise<unknown>),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoticesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: { get: jest.fn(), del: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: {
            notifyTeamManagers: jest.fn(),
            notifyTeamAudience: jest.fn(),
            notifyAllAppUsers: jest.fn(),
            markNotificationsReadByLinkUrls: jest.fn(),
          },
        },
        { provide: ViewCounterService, useValue: { tryIncrement: jest.fn() } },
      ],
    }).compile();

    service = module.get<NoticesService>(NoticesService);
    prisma.systemNotice.findUnique.mockResolvedValue(teamNotice());
    prisma.systemNotice.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...teamNotice(), ...data }),
    );
  });

  // ── #1~8 대상 팀 전이 계약 (F-EX-04) ─────────────────────────
  describe("대상 팀 전이 계약", () => {
    it("#1 DIRECTOR 가 자기 팀 공지를 전역(null)으로 전환하면 403", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: null }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.update).not.toHaveBeenCalled();
    });

    it("#2 COACH 가 전역(null)으로 전환하면 403", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "COACH" });
      setManageTeams([TEAM_A]);

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: null }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.update).not.toHaveBeenCalled();
    });

    it("#3 빈 문자열도 전역 전환 요청으로 보고 403 (고아 공지 차단)", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: "" }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.update).not.toHaveBeenCalled();
    });

    it("#3-b 공백 문자열도 동일하게 403", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: "   " }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("#4 관리 팀 A → 관리 팀 B 이동은 성공한다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A, TEAM_B]);

      await service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: TEAM_B });

      expect(prisma.systemNotice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetTeamId: TEAM_B }),
        }),
      );
    });

    it("#5 비관리 팀 C 로 이동하면 403", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: TEAM_C }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.update).not.toHaveBeenCalled();
    });

    it("#6 ADMIN 은 팀 → 전역, 전역 → 팀 양방향 전환이 가능하다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "ADMIN" });

      await service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: null });
      expect(prisma.systemNotice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetTeamId: null }),
        }),
      );

      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ targetTeamId: null }),
      );
      await service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: TEAM_A });
      expect(prisma.systemNotice.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetTeamId: TEAM_A }),
        }),
      );
    });

    it("#7 ACADEMY_DIRECTOR 는 팀 공지 관리 자체가 차단된다", async () => {
      prisma.user.findUnique.mockResolvedValue({
        userType: "ACADEMY_DIRECTOR",
      });

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, { title: "수정" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("#8 targetTeamId 미지정 수정은 기존 팀을 유지한다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);

      await service.updateNotice(USER_ID, NOTICE_ID, { title: "제목만 수정" });

      const data = prisma.systemNotice.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty("targetTeamId");
    });
  });

  // ── 작성 권한 (F-03 · F-04 · F-EX-03) ────────────────────────
  describe("공지 작성 권한", () => {
    it("승인 대기(pending) 코치는 관리 팀이 없어 작성이 차단된다 — F-03", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "COACH" });
      // pending 멤버십은 SoT 에서 제외되므로 소유 팀·관리 멤버십 모두 빈 결과
      setManageTeams([]);

      await expect(
        service.createNotice(USER_ID, {
          title: "무단 공지",
          content: "10자 이상 본문입니다.",
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.create).not.toHaveBeenCalled();
    });

    it("ACADEMY_DIRECTOR 는 팀 공지를 작성할 수 없다 — F-EX-03", async () => {
      prisma.user.findUnique.mockResolvedValue({
        userType: "ACADEMY_DIRECTOR",
      });

      await expect(
        service.createNotice(USER_ID, {
          title: "오픈클래스 공지",
          content: "10자 이상 본문입니다.",
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.create).not.toHaveBeenCalled();
    });

    it("명시적 null 은 전역 공지 요청이라 팀 권한자에게 403 — DTO 계약 일치 (Round 10)", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);

      await expect(
        service.createNotice(USER_ID, {
          title: "전역 시도",
          content: "10자 이상 본문입니다.",
          targetTeamId: null,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.create).not.toHaveBeenCalled();
    });

    it("명시적 빈 문자열도 전역 요청으로 보고 403 (Round 10)", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "COACH" });
      setManageTeams([TEAM_A]);

      await expect(
        service.createNotice(USER_ID, {
          title: "전역 시도",
          content: "10자 이상 본문입니다.",
          targetTeamId: "",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("시스템 역할은 명시적 null 로 전체 공지를 작성할 수 있다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "ADMIN" });
      prisma.systemNotice.create.mockResolvedValue(
        teamNotice({ targetTeamId: null }),
      );

      await service.createNotice(USER_ID, {
        title: "전체 공지",
        content: "10자 이상 본문입니다.",
        targetTeamId: null,
      });

      expect(prisma.systemNotice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetTeamId: null }),
        }),
      );
    });

    it("관리 팀이 하나면 대상 팀을 자동 주입한다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.create.mockResolvedValue(teamNotice());

      await service.createNotice(USER_ID, {
        title: "정상 공지",
        content: "10자 이상 본문입니다.",
      });

      expect(prisma.systemNotice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetTeamId: TEAM_A }),
        }),
      );
    });
  });

  // ── Phase 1 — 목록 스코프·게시 기간 (F-01 · F-05 · F-06 · R10-H1) ──
  describe("목록 조회 — 스코프·게시 기간", () => {
    const listWhere = () => prisma.systemNotice.findMany.mock.calls[0][0].where;

    /** where.AND 안에서 팀 스코프 조건(OR: targetTeamId ...)을 찾는다. */
    const teamScopeCondition = () =>
      (listWhere().AND ?? []).find(
        (c: { OR?: Array<Record<string, unknown>> }) =>
          Array.isArray(c.OR) && "targetTeamId" in (c.OR[0] ?? {}),
      );

    const publicationKeys = () =>
      (listWhere().AND ?? []).flatMap(
        (c: { OR?: Array<Record<string, unknown>> }) =>
          (c.OR ?? []).flatMap((o) => Object.keys(o)),
      );

    beforeEach(() => {
      prisma.systemNotice.findMany.mockResolvedValue([]);
      prisma.systemNotice.count.mockResolvedValue(0);
      setViewerTeams([TEAM_A]);
    });

    it("R10-H1 — scope 생략 시 서비스 공지 ∪ 내 열람 팀으로 좁힌다", async () => {
      await service.getNotices({ isActive: true }, 1, 10, USER_ID, "PARENT");

      expect(teamScopeCondition()).toEqual({
        OR: [{ targetTeamId: null }, { targetTeamId: { in: [TEAM_A] } }],
      });
    });

    it("R10-H1 — scope 생략 시 타 팀은 포함되지 않는다", async () => {
      await service.getNotices({ isActive: true }, 1, 10, USER_ID, "PARENT");

      expect(JSON.stringify(teamScopeCondition())).not.toContain(TEAM_B);
    });

    it("R10-H1 — teamId 파라미터로 타 팀 공지를 열 수 없다 (레거시 분기 제거)", async () => {
      await service.getNotices(
        { isActive: true, teamId: TEAM_B },
        1,
        10,
        USER_ID,
        "PARENT",
      );

      // teamId 는 더 이상 팀 필터로 쓰이지 않는다 — 열람 팀 스코프만 적용된다
      expect(listWhere().targetTeamId).toBeUndefined();
      expect(teamScopeCondition()).toEqual({
        OR: [{ targetTeamId: null }, { targetTeamId: { in: [TEAM_A] } }],
      });
    });

    it("R10-H1 — 비로그인은 서비스 공지만 본다", async () => {
      await service.getNotices({ isActive: true }, 1, 10);

      expect(teamScopeCondition()).toEqual({ OR: [{ targetTeamId: null }] });
    });

    it("scope=service 는 서비스 공지만 (기존 동작 유지)", async () => {
      await service.getNotices(
        { isActive: true, scope: "service" },
        1,
        10,
        USER_ID,
        "PARENT",
      );

      expect(listWhere().targetTeamId).toBeNull();
    });

    it("scope=team 은 내 열람 팀만 (기존 동작 유지)", async () => {
      await service.getNotices(
        { isActive: true, scope: "team" },
        1,
        10,
        USER_ID,
        "PARENT",
      );

      expect(listWhere().targetTeamId).toEqual({ in: [TEAM_A] });
    });

    it("F-01 — 게시 기간 조건이 항상 함께 적용된다", async () => {
      await service.getNotices({ isActive: true }, 1, 10, USER_ID, "PARENT");

      expect(publicationKeys()).toContain("startAt");
      expect(publicationKeys()).toContain("expiresAt");
    });

    it("출생연도 필터와 게시 기간이 서로 덮어쓰지 않고 병합된다", async () => {
      await service.getNotices(
        { isActive: true, childBirthYear: 2017 },
        1,
        10,
        USER_ID,
        "PARENT",
      );

      const keys = publicationKeys();
      // 팀 스코프 1 + 출생연도 2 + 게시 기간 2 = 5개 조건이 모두 살아 있어야 한다
      expect(listWhere().AND).toHaveLength(5);
      expect(keys).toContain("targetBirthYearFrom");
      expect(keys).toContain("targetBirthYearTo");
      expect(keys).toContain("startAt");
      expect(keys).toContain("expiresAt");
    });

    it("관리 목록은 팀 스코프·게시 기간을 명시적으로 우회한다", async () => {
      await service.getNotices(
        { skipViewerScope: true, skipPublicationWindow: true },
        1,
        10,
        USER_ID,
        "ADMIN",
      );

      expect(teamScopeCondition()).toBeUndefined();
      expect(publicationKeys()).not.toContain("startAt");
      // 우회 시에는 열람 팀 해석 쿼리조차 나가지 않는다
      expect(prisma.teamMember.findMany).not.toHaveBeenCalled();
    });

    it("관리 목록이라도 scope=service 는 유지된다 (어드민 공지 탭 회귀)", async () => {
      await service.getNotices(
        {
          scope: "service",
          skipViewerScope: true,
          skipPublicationWindow: true,
        },
        1,
        10,
        USER_ID,
        "ADMIN",
      );

      expect(listWhere().targetTeamId).toBeNull();
    });
  });

  // ── Phase 1 — 노출 기간 KST 정규화 (F-05 · F-06) ─────────────
  describe("노출 기간 저장", () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.create.mockResolvedValue(teamNotice());
    });

    /**
     * A군 절대 시점 계약 — 화면이 KST 벽시계를 ISO 로 변환해 보내고 서버는 그대로 저장한다.
     * (백엔드가 date-only 를 받아 변환하려던 시도는 어드민 점검 공지의 분 단위 입력을 깨뜨려 철회)
     */
    it("전달받은 ISO 절대시각을 그대로 저장한다", async () => {
      await service.createNotice(USER_ID, {
        title: "기간 공지",
        content: "10자 이상 본문입니다.",
        // 웹 폼이 KST 2026-08-06 00:00 ~ 23:59:59.999 를 변환해 보낸 값
        startDate: "2026-08-05T15:00:00.000Z",
        endDate: "2026-08-06T14:59:59.999Z",
      });

      const data = prisma.systemNotice.create.mock.calls[0][0].data;
      expect(data.startAt.toISOString()).toBe("2026-08-05T15:00:00.000Z");
      expect(data.expiresAt.toISOString()).toBe("2026-08-06T14:59:59.999Z");
    });

    it("점검 공지의 분 단위 시각도 손실 없이 저장한다 (어드민 계약)", async () => {
      await service.createNotice(USER_ID, {
        title: "점검 안내",
        content: "10자 이상 본문입니다.",
        // KST 02:00 ~ 06:00
        startDate: "2026-08-05T17:00:00.000Z",
        endDate: "2026-08-05T21:00:00.000Z",
      });

      const data = prisma.systemNotice.create.mock.calls[0][0].data;
      expect(data.startAt.toISOString()).toBe("2026-08-05T17:00:00.000Z");
      expect(data.expiresAt.toISOString()).toBe("2026-08-05T21:00:00.000Z");
    });

    it("F-05 — null 을 보내면 기간이 해제된다", async () => {
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({
          startAt: new Date("2026-08-05T15:00:00.000Z"),
          expiresAt: new Date("2026-08-06T14:59:59.999Z"),
        }),
      );

      await service.updateNotice(USER_ID, NOTICE_ID, {
        startDate: null,
        endDate: null,
      });

      const data = prisma.systemNotice.update.mock.calls[0][0].data;
      expect(data.startAt).toBeNull();
      expect(data.expiresAt).toBeNull();
    });

    it("키를 생략하면 기존 기간을 유지한다", async () => {
      prisma.systemNotice.findUnique.mockResolvedValue(teamNotice());

      await service.updateNotice(USER_ID, NOTICE_ID, { title: "제목만" });

      const data = prisma.systemNotice.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty("startAt");
      expect(data).not.toHaveProperty("expiresAt");
    });
  });

  // ── 댓글 열람 권한 · 게시 기간 (F-09 · F-EX-01) ───────────────
  describe("댓글 목록 열람 권한", () => {
    it("소속 팀 공지의 댓글은 조회할 수 있다", async () => {
      setViewerTeams([TEAM_A]);

      await expect(
        service.getComments(NOTICE_ID, 1, 10, USER_ID, "PARENT"),
      ).resolves.toBeDefined();
    });

    it("타 팀 공지의 댓글은 404 로 차단한다 — F-09", async () => {
      setViewerTeams([TEAM_B]);

      await expect(
        service.getComments(NOTICE_ID, 1, 10, USER_ID, "PARENT"),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.noticeComment.findMany).not.toHaveBeenCalled();
    });

    it("비로그인(viewerId 없음)은 팀 공지 댓글을 볼 수 없다 — F-09", async () => {
      await expect(service.getComments(NOTICE_ID, 1, 10)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.noticeComment.findMany).not.toHaveBeenCalled();
    });

    it("만료된 공지의 댓글은 일반 열람자에게 404 — F-EX-01", async () => {
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ expiresAt: new Date("2020-01-01T00:00:00.000Z") }),
      );
      setViewerTeams([TEAM_A]);

      await expect(
        service.getComments(NOTICE_ID, 1, 10, USER_ID, "PARENT"),
      ).rejects.toThrow(NotFoundException);
    });

    it("시작 전(예약) 공지의 댓글도 일반 열람자에게 404 — F-EX-01", async () => {
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ startAt: new Date("2999-01-01T00:00:00.000Z") }),
      );
      setViewerTeams([TEAM_A]);

      await expect(
        service.getComments(NOTICE_ID, 1, 10, USER_ID, "PARENT"),
      ).rejects.toThrow(NotFoundException);
    });

    it("만료된 공지라도 해당 팀 관리자는 관리 목적으로 열람할 수 있다", async () => {
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ expiresAt: new Date("2020-01-01T00:00:00.000Z") }),
      );
      // 열람 SoT + 관리 SoT 모두 TEAM_A 를 포함하도록 지정
      prisma.teamMember.findMany.mockResolvedValue([{ teamId: TEAM_A }]);
      prisma.team.findMany.mockResolvedValue([{ id: TEAM_A }]);
      prisma.coachProfile.findMany.mockResolvedValue([]);

      await expect(
        service.getComments(NOTICE_ID, 1, 10, USER_ID, "DIRECTOR"),
      ).resolves.toBeDefined();
    });
  });

  // ── 팀 선택기 후보 목록 (Phase 2) ────────────────────────────
  describe("관리 가능 팀 목록", () => {
    /** 소유 팀 조회(where.coachId)와 이름 조회(where.id.in)를 구분해 응답한다. */
    const setTeamLookup = (
      ownedIds: string[],
      named: Array<{ id: string; name: string }>,
    ) => {
      prisma.team.findMany.mockImplementation(
        (args: { where?: { coachId?: string } }) =>
          Promise.resolve(
            args?.where?.coachId
              ? ownedIds.map((id) => ({ id }))
              : named.map((t) => ({ ...t })),
          ),
      );
    };

    it("쓰기 권한 SoT 와 동일한 팀 집합을 반환한다 — 소유 팀 ∪ 관리 역할 멤버십", async () => {
      setTeamLookup(
        [TEAM_A],
        [
          { id: TEAM_A, name: "A팀" },
          { id: TEAM_B, name: "B팀" },
        ],
      );
      prisma.teamMember.findMany.mockResolvedValue([{ teamId: TEAM_B }]);

      const result = await service.getManageableTeams(USER_ID, "DIRECTOR");

      expect(result.data).toEqual([
        { id: TEAM_A, name: "A팀" },
        { id: TEAM_B, name: "B팀" },
      ]);
      // 이름 조회는 SoT 결과 그대로여야 한다 — 화면에는 뜨는데 저장은 403 이 되는 불일치 방지
      const nameQuery = prisma.team.findMany.mock.calls.find(
        (c: [{ where?: { id?: unknown } }]) => c[0]?.where?.id,
      );
      expect(nameQuery).toBeDefined();
      expect(
        (nameQuery as [{ where: { id: { in: string[] } } }])[0].where.id.in.sort(),
      ).toEqual([TEAM_A, TEAM_B]);
    });

    it("미승인·탈퇴·비관리 역할 멤버십은 후보에서 제외한다 (쿼리 조건 고정)", async () => {
      setTeamLookup([], []);
      prisma.teamMember.findMany.mockResolvedValue([]);

      const result = await service.getManageableTeams(USER_ID, "COACH");

      expect(result.data).toEqual([]);
      expect(prisma.teamMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: USER_ID,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
            team: { isActive: true },
          }),
        }),
      );
      // 미승인 코치를 관리자로 승격시키던 CoachProfile 경로는 사용하지 않는다
      expect(prisma.coachProfile.findMany).not.toHaveBeenCalled();
      // 후보가 없으면 이름 조회도 하지 않는다
      expect(
        prisma.team.findMany.mock.calls.some(
          (c: [{ where?: { id?: unknown } }]) => c[0]?.where?.id,
        ),
      ).toBe(false);
    });

    it("시스템 역할은 팀 제한이 없어 빈 목록 + DB 조회 0회", async () => {
      const result = await service.getManageableTeams(USER_ID, "ADMIN");

      expect(result.data).toEqual([]);
      expect(prisma.team.findMany).not.toHaveBeenCalled();
      expect(prisma.teamMember.findMany).not.toHaveBeenCalled();
    });
  });

  // ── 점검 공지 격리 — 시스템 역할 + 전역 전용 ─────────────────
  //   웹 팀 공지 작성 화면에는 type 입력이 없지만 API 직접 호출은 가능하므로
  //   (UI 부재 ≠ 차단) 서버 가드를 검증한다. 읽기 격리는 app-management spec 소유.
  describe("점검 공지 격리", () => {
    it("DIRECTOR 는 type=maintenance 로 작성할 수 없다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);

      await expect(
        service.createNotice(USER_ID, {
          title: "점검 시도",
          content: "10자 이상 본문입니다.",
          type: NoticeType.MAINTENANCE,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.create).not.toHaveBeenCalled();
    });

    it("ADMIN 은 전역 점검 공지를 작성할 수 있다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "ADMIN" });
      prisma.systemNotice.create.mockResolvedValue(
        teamNotice({ targetTeamId: null, targetType: "maintenance" }),
      );

      await service.createNotice(USER_ID, {
        title: "시스템 점검",
        content: "10자 이상 본문입니다.",
        type: NoticeType.MAINTENANCE,
      });

      expect(prisma.systemNotice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetType: "maintenance",
            targetTeamId: null,
          }),
        }),
      );
    });

    it("ADMIN 이라도 팀 대상 점검 공지는 작성할 수 없다 — 판정 쿼리에 안 잡히는 죽은 데이터 방지", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "ADMIN" });

      await expect(
        service.createNotice(USER_ID, {
          title: "팀 점검 시도",
          content: "10자 이상 본문입니다.",
          type: NoticeType.MAINTENANCE,
          targetTeamId: TEAM_A,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.create).not.toHaveBeenCalled();
    });

    it("COACH 는 자기 팀 공지를 maintenance 로 전환할 수 없다 — Update 상속 type 경로", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "COACH" });
      setManageTeams([TEAM_A]);

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, {
          type: NoticeType.MAINTENANCE,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.update).not.toHaveBeenCalled();
    });

    it("ADMIN 이라도 팀 공지를 maintenance 로 전환할 수 없다 (전역 전용)", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "ADMIN" });

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, {
          type: NoticeType.MAINTENANCE,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.update).not.toHaveBeenCalled();
    });

    it("ADMIN 이 기존 maintenance 공지를 type 생략 + 팀 이동해도 403 — R1-01 결과 상태 판정", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "ADMIN" });
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ targetTeamId: null, targetType: "maintenance" }),
      );

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: TEAM_A }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.systemNotice.update).not.toHaveBeenCalled();
    });

    it("ADMIN 은 전역 공지를 maintenance 로 전환할 수 있다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "ADMIN" });
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ targetTeamId: null }),
      );

      await service.updateNotice(USER_ID, NOTICE_ID, {
        type: NoticeType.MAINTENANCE,
      });

      expect(prisma.systemNotice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetType: "maintenance" }),
        }),
      );
    });
  });

  // ── Phase 3 — 고정 한도 (AC 3-6~8) ──────────────────────────
  describe("고정 한도 불변식", () => {
    const validBody = { title: "고정 공지", content: "10자 이상 본문입니다." };

    it("풀이 가득 차면 create(isPinned=true) 는 409 + NOTICE_PIN_LIMIT", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.count.mockResolvedValue(2);

      await expect(
        service.createNotice(USER_ID, { ...validBody, isPinned: true }),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ error: "NOTICE_PIN_LIMIT" }),
      });
      expect(prisma.systemNotice.create).not.toHaveBeenCalled();
      // 풀 판정은 대상 팀 기준(팀별 독립 풀)
      expect(prisma.systemNotice.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ pinned: true, targetTeamId: TEAM_A }),
        }),
      );
    });

    it("여유가 있으면 고정 생성은 Serializable 트랜잭션 안에서 성공한다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.count.mockResolvedValue(1);
      prisma.systemNotice.create.mockResolvedValue(teamNotice({ pinned: true }));

      await service.createNotice(USER_ID, { ...validBody, isPinned: true });

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "Serializable",
      });
      expect(prisma.systemNotice.create).toHaveBeenCalled();
    });

    it("togglePin false→true 는 한도 초과 시 409, 해제는 한도와 무관", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);

      // 고정 시도 — 풀 가득
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ pinned: false }),
      );
      prisma.systemNotice.count.mockResolvedValue(2);
      await expect(service.togglePin(NOTICE_ID, USER_ID)).rejects.toMatchObject({
        status: 409,
      });
      // 자기 자신은 카운트에서 제외
      expect(prisma.systemNotice.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: NOTICE_ID } }),
        }),
      );

      // 해제 — count 무관하게 즉시 성공
      prisma.systemNotice.count.mockClear();
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ pinned: true }),
      );
      prisma.systemNotice.update.mockResolvedValue(teamNotice({ pinned: false }));
      await service.togglePin(NOTICE_ID, USER_ID);
      expect(prisma.systemNotice.count).not.toHaveBeenCalled();
    });

    it("update 상속 경로(PATCH isPinned:true)도 동일 불변식 — 세 번째 우회 차단", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ pinned: false }),
      );
      prisma.systemNotice.count.mockResolvedValue(2);

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, { isPinned: true }),
      ).rejects.toMatchObject({ status: 409 });
      expect(prisma.systemNotice.update).not.toHaveBeenCalled();
    });

    it("직렬화 충돌(P2034)은 bounded retry 후 성공한다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.count.mockResolvedValue(0);
      prisma.systemNotice.create.mockResolvedValue(teamNotice({ pinned: true }));

      const p2034 = new Prisma.PrismaClientKnownRequestError(
        "serialization conflict",
        { code: "P2034", clientVersion: "test" },
      );
      let calls = 0;
      prisma.$transaction.mockImplementation(
        (fn: (tx: unknown) => Promise<unknown>) => {
          calls += 1;
          if (calls <= 2) return Promise.reject(p2034);
          return fn(prisma) as Promise<unknown>;
        },
      );

      await service.createNotice(USER_ID, { ...validBody, isPinned: true });
      expect(calls).toBe(3);
    });
  });

  // ── Phase 3 — 게시 알림 생애 1회 claim (AC 3-9~11) ───────────
  describe("게시 알림 claim", () => {
    const notifications = () =>
      (service as unknown as { notificationsService: { notifyTeamAudience: jest.Mock; notifyAllAppUsers: jest.Mock } })
        .notificationsService;

    it("즉시 게시 생성은 publishedNotifiedAt 을 생성 데이터에 함께 기록하고 1회 발송한다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.create.mockResolvedValue(teamNotice());

      await service.createNotice(USER_ID, {
        title: "즉시 게시",
        content: "10자 이상 본문입니다.",
      });

      expect(prisma.systemNotice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedNotifiedAt: expect.any(Date),
          }),
        }),
      );
      expect(notifications().notifyTeamAudience).toHaveBeenCalledTimes(1);
    });

    it("임시저장(isPublished:false) 생성은 claim 을 남겨두고(null) 발송하지 않는다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.create.mockResolvedValue(
        teamNotice({ isActive: false }),
      );

      await service.createNotice(USER_ID, {
        title: "임시저장",
        content: "10자 이상 본문입니다.",
        isPublished: false,
      });

      expect(prisma.systemNotice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ publishedNotifiedAt: null }),
        }),
      );
      expect(notifications().notifyTeamAudience).not.toHaveBeenCalled();
      expect(notifications().notifyAllAppUsers).not.toHaveBeenCalled();
    });

    it("미게시→게시 전환은 claim(updateMany where publishedNotifiedAt:null) 획득 시에만 발송한다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ isActive: false }),
      );
      prisma.systemNotice.update.mockResolvedValue(teamNotice({ isActive: true }));
      prisma.systemNotice.updateMany.mockResolvedValue({ count: 1 });

      await service.updateNotice(USER_ID, NOTICE_ID, { isPublished: true });

      expect(prisma.systemNotice.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NOTICE_ID, publishedNotifiedAt: null },
        }),
      );
      expect(notifications().notifyTeamAudience).toHaveBeenCalledTimes(1);
    });

    it("claim 이 이미 소진됐으면(재게시) 발송하지 않는다 — 생애 1회", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ isActive: false }),
      );
      prisma.systemNotice.update.mockResolvedValue(teamNotice({ isActive: true }));
      prisma.systemNotice.updateMany.mockResolvedValue({ count: 0 });

      await service.updateNotice(USER_ID, NOTICE_ID, { isPublished: true });

      expect(notifications().notifyTeamAudience).not.toHaveBeenCalled();
    });

    it("예약 공지(startAt 미래)의 게시 전환은 claim 하지 않는다 — AC 3-11", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      const future = new Date("2999-01-01T00:00:00.000Z");
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ isActive: false, startAt: future }),
      );
      prisma.systemNotice.update.mockResolvedValue(
        teamNotice({ isActive: true, startAt: future }),
      );

      await service.updateNotice(USER_ID, NOTICE_ID, { isPublished: true });

      expect(prisma.systemNotice.updateMany).not.toHaveBeenCalled();
      expect(notifications().notifyTeamAudience).not.toHaveBeenCalled();
    });

    it("togglePublish 전환도 동일 claim 저장소를 쓴다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ isActive: false }),
      );
      prisma.systemNotice.update.mockResolvedValue(teamNotice({ isActive: true }));
      prisma.systemNotice.updateMany.mockResolvedValue({ count: 1 });

      await service.togglePublish(NOTICE_ID, USER_ID);

      expect(prisma.systemNotice.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NOTICE_ID, publishedNotifiedAt: null },
        }),
      );
      expect(notifications().notifyTeamAudience).toHaveBeenCalledTimes(1);
    });
  });

  // ── Phase 3 — 관리 목록 임의 teamId 404 은닉 (AC 3-5) ────────
  describe("관리 목록 teamId 은닉", () => {
    it("관리 밖 teamId 는 403 이 아닌 404 — 팀 존재를 확인시켜 주지 않는다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);

      await expect(
        service.getAdminNotices(USER_ID, { teamId: TEAM_B, page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.systemNotice.findMany).not.toHaveBeenCalled();
    });

    it("관리 팀이 0개여도 임의 teamId 는 200 빈 목록이 아닌 404 — P3-R1-01", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "COACH" });
      setManageTeams([]);

      await expect(
        service.getAdminNotices(USER_ID, { teamId: TEAM_B, page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.systemNotice.findMany).not.toHaveBeenCalled();
    });
  });

  // ── Phase 3 R2 — R1 지적 회귀 (P3-R1-02·03·04) ───────────────
  describe("Phase 3 R2 회귀", () => {
    it("고정 유지 채 팀 이동 시 목적지 풀 한도를 검사한다 — P3-R1-02", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "ADMIN" });
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ pinned: true, targetTeamId: TEAM_A }),
      );
      prisma.systemNotice.count.mockResolvedValue(2); // 목적지(TEAM_B) 풀 가득

      await expect(
        service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: TEAM_B }),
      ).rejects.toMatchObject({ status: 409 });
      expect(prisma.systemNotice.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ pinned: true, targetTeamId: TEAM_B }),
        }),
      );
      expect(prisma.systemNotice.update).not.toHaveBeenCalled();
    });

    it("고정 해제 상태의 팀 이동은 한도 검사를 하지 않는다", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "ADMIN" });
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ pinned: false, targetTeamId: TEAM_A }),
      );
      prisma.systemNotice.update.mockResolvedValue(
        teamNotice({ pinned: false, targetTeamId: TEAM_B }),
      );

      await service.updateNotice(USER_ID, NOTICE_ID, { targetTeamId: TEAM_B });
      expect(prisma.systemNotice.count).not.toHaveBeenCalled();
    });

    it("게시 전환의 isActive 반영과 claim 은 같은 트랜잭션에서 수행된다 — P3-R1-03", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ isActive: false }),
      );
      prisma.systemNotice.update.mockResolvedValue(teamNotice({ isActive: true }));
      prisma.systemNotice.updateMany.mockResolvedValue({ count: 1 });

      await service.updateNotice(USER_ID, NOTICE_ID, { isPublished: true });

      // $transaction 이 사용됐고, 그 안에서 update 와 claim(updateMany)이 모두 호출됨
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.systemNotice.update).toHaveBeenCalled();
      expect(prisma.systemNotice.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NOTICE_ID, publishedNotifiedAt: null },
        }),
      );
    });

    it("이미 만료된 기간으로 즉시 게시 생성하면 claim·알림 대상이 아니다 — P3-R1-04", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.create.mockResolvedValue(
        teamNotice({ expiresAt: new Date("2020-01-01T00:00:00.000Z") }),
      );

      await service.createNotice(USER_ID, {
        title: "만료 생성",
        content: "10자 이상 본문입니다.",
        endDate: "2020-01-01T00:00:00.000Z",
      });

      expect(prisma.systemNotice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ publishedNotifiedAt: null }),
        }),
      );
      const notifications = (
        service as unknown as {
          notificationsService: { notifyTeamAudience: jest.Mock };
        }
      ).notificationsService;
      expect(notifications.notifyTeamAudience).not.toHaveBeenCalled();
    });
  });

  // ── Phase 4 — 댓글 moderation + 감사 로그 (AC 4-1~2) ─────────
  describe("댓글 moderation", () => {
    const COMMENT_ID = "comment-1";
    const OWNER_ID = "comment-owner";

    const teamComment = (overrides: Record<string, unknown> = {}) => ({
      id: COMMENT_ID,
      userId: OWNER_ID,
      noticeId: NOTICE_ID,
      notice: { targetTeamId: TEAM_A },
      ...overrides,
    });

    it("본인 댓글 삭제는 감사 로그 없이 성공한다 (기존 동작 유지)", async () => {
      prisma.noticeComment.findUnique.mockResolvedValue(
        teamComment({ userId: USER_ID }),
      );

      await service.deleteComment(COMMENT_ID, USER_ID, "PARENT");

      expect(prisma.noticeComment.delete).toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it("해당 팀 관리자는 타인 댓글을 삭제하며 감사 로그가 같은 트랜잭션에 남는다", async () => {
      prisma.noticeComment.findUnique.mockResolvedValue(teamComment());
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);

      await service.deleteComment(COMMENT_ID, USER_ID, "DIRECTOR");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.noticeComment.delete).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            action: "NOTICE_COMMENT_DELETED",
            resource: "NoticeComment",
            oldValue: {
              noticeId: NOTICE_ID,
              commentId: COMMENT_ID,
              commentOwnerUserId: OWNER_ID,
            },
          }),
        }),
      );
      // 개인정보 최소화 — 감사 로그에 댓글 본문 미복제
      const auditData = prisma.auditLog.create.mock.calls[0][0].data;
      expect(JSON.stringify(auditData)).not.toContain("content");
    });

    it("권한 없는 사용자의 타인 댓글 삭제는 403 이 아닌 404 — 존재 은닉", async () => {
      prisma.noticeComment.findUnique.mockResolvedValue(teamComment());
      prisma.user.findUnique.mockResolvedValue({ userType: "PARENT" });

      await expect(
        service.deleteComment(COMMENT_ID, USER_ID, "PARENT"),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.noticeComment.delete).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it("타 팀 관리자는 404 — 관리 팀 범위 밖", async () => {
      prisma.noticeComment.findUnique.mockResolvedValue(teamComment());
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_B]);

      await expect(
        service.deleteComment(COMMENT_ID, USER_ID, "DIRECTOR"),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.noticeComment.delete).not.toHaveBeenCalled();
    });

    it("전역 공지 댓글은 팀 관리자여도 404, 시스템 역할은 삭제+감사", async () => {
      // 팀 관리자 — 전역 공지(targetTeamId=null)는 moderation 불가
      prisma.noticeComment.findUnique.mockResolvedValue(
        teamComment({ notice: { targetTeamId: null } }),
      );
      setManageTeams([TEAM_A]);
      await expect(
        service.deleteComment(COMMENT_ID, USER_ID, "DIRECTOR"),
      ).rejects.toThrow(NotFoundException);

      // 시스템 역할 — 성공 + 감사
      prisma.noticeComment.delete.mockClear();
      await service.deleteComment(COMMENT_ID, USER_ID, "ADMIN");
      expect(prisma.noticeComment.delete).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ── Phase 4 — 읽음 동기화 응답 전 완료 (AC 4-3 · P4-R1-02) ───
  describe("읽음 동기화", () => {
    /** 지연 promise 로 "await 전환" 을 증명 — void 로 흘렸다면 응답 시점에 false. */
    const delayedSync = () => {
      let syncDone = false;
      const notifications = (
        service as unknown as {
          notificationsService: { markNotificationsReadByLinkUrls: jest.Mock };
        }
      ).notificationsService;
      notifications.markNotificationsReadByLinkUrls.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              syncDone = true;
              resolve(1);
            }, 5),
          ),
      );
      return () => syncDone;
    };

    it("markNoticeAsRead 는 알림함 동기화 완료 후에 응답한다", async () => {
      prisma.systemNotice.findUnique.mockResolvedValue({ id: NOTICE_ID });
      const isDone = delayedSync();

      await service.markNoticeAsRead(NOTICE_ID, USER_ID);

      expect(isDone()).toBe(true);
    });

    it("markAllServiceNoticesRead 도 동기화 완료 후에 응답한다 — P4-R1-02", async () => {
      prisma.systemNotice.findMany.mockResolvedValue([{ id: "svc-1" }]);
      const isDone = delayedSync();

      const result = await service.markAllServiceNoticesRead(USER_ID);

      expect(result.marked).toBe(1);
      expect(isDone()).toBe(true);
    });

    it("getNotice 상세 열람도 동기화 완료 후에 응답한다 — P4-R1-02", async () => {
      // 전역 활성 공지 — 열람 검증 통과 경로
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ targetTeamId: null }),
      );
      const isDone = delayedSync();

      await service.getNotice(NOTICE_ID, USER_ID, "PARENT");

      expect(isDone()).toBe(true);
    });
  });

  // ── Phase 4 — 댓글 비마스킹 계약 (AC 4-4 · P4-R1-03) ─────────
  describe("댓글 작성자 이름 계약", () => {
    it("인증 응답의 userName 은 마스킹 없는 전체 이름이다", async () => {
      setViewerTeams([TEAM_A]);
      prisma.noticeComment.findMany.mockResolvedValue([
        {
          id: "comment-1",
          noticeId: NOTICE_ID,
          userId: "user-x",
          content: "댓글 본문",
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          user: { id: "user-x", firstName: "길동", lastName: "홍" },
        },
      ]);
      prisma.noticeComment.count.mockResolvedValue(1);

      const result = await service.getComments(
        NOTICE_ID,
        1,
        10,
        USER_ID,
        "PARENT",
      );

      expect(result.data[0].userName).toBe("홍길동");
      // 중첩 user 객체도 원본 그대로 (마스킹 잔재 없음)
      expect(result.data[0].user).toEqual({
        id: "user-x",
        firstName: "길동",
        lastName: "홍",
      });
    });
  });

  // ── Phase 5 — canManage 단일 기준 (AC 5-1~2) ─────────────────
  describe("canManage 응답 필드", () => {
    it("시스템 역할은 전 행 true — 팀 조회 없이 판정", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "ADMIN" });
      prisma.systemNotice.findMany.mockResolvedValue([
        teamNotice({ id: "n1", targetTeamId: TEAM_A }),
        teamNotice({ id: "n2", targetTeamId: null }),
      ]);

      const result = (await service.getNotices(
        { skipViewerScope: true, skipPublicationWindow: true },
        1,
        10,
        USER_ID,
        "ADMIN",
      )) as { data: Array<{ canManage: boolean }> };

      expect(result.data.map((n) => n.canManage)).toEqual([true, true]);
      // 시스템 역할 판정에 관리 팀 쿼리 불필요
      expect(prisma.team.findMany).not.toHaveBeenCalled();
    });

    it("팀 역할은 관리 팀 공지만 true — 권한 집합은 요청당 1회 해석", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.findMany.mockResolvedValue([
        teamNotice({ id: "n1", targetTeamId: TEAM_A }),
        teamNotice({ id: "n2", targetTeamId: TEAM_B }),
        teamNotice({ id: "n3", targetTeamId: null }),
      ]);

      const result = (await service.getNotices(
        { skipViewerScope: true, skipPublicationWindow: true },
        1,
        10,
        USER_ID,
        "DIRECTOR",
      )) as { data: Array<{ canManage: boolean }> };

      expect(result.data.map((n) => n.canManage)).toEqual([
        true, // 관리 팀
        false, // 열람만 가능한 타 팀
        false, // 전역 공지 — 팀 역할은 관리 불가
      ]);
      // [AC 5-2] 관리 SoT(roleInTeam 필터 쿼리)는 행 수와 무관하게 정확히 1회
      const manageQueries = prisma.teamMember.findMany.mock.calls.filter(
        (c: [{ where?: { roleInTeam?: unknown } }]) => c[0]?.where?.roleInTeam,
      );
      expect(manageQueries).toHaveLength(1);
    });

    it("상세(getNotice)도 동일 기준 — 관리 팀이면 true, 아니면 false", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.findUnique.mockResolvedValue(teamNotice());

      const managed = await service.getNotice(NOTICE_ID, USER_ID, "DIRECTOR");
      expect(managed.canManage).toBe(true);

      setManageTeams([TEAM_B]);
      // 열람은 가능(뷰어 팀 TEAM_A)하지만 관리 팀 아님 — canManage false
      prisma.teamMember.findMany.mockImplementation(
        (args: { where?: { roleInTeam?: unknown } }) =>
          Promise.resolve(
            args?.where?.roleInTeam ? [] : [{ teamId: TEAM_A }],
          ),
      );
      prisma.team.findMany.mockResolvedValue([]);
      const viewedOnly = await service.getNotice(NOTICE_ID, USER_ID, "PARENT");
      expect(viewedOnly.canManage).toBe(false);
    });
  });

  // ── Phase 5 — 이전/다음 전용 API (AC 5-3~4) ──────────────────
  describe("인접 공지 API", () => {
    it("audience 모드 — 게시 중·같은 종류 풀에서 (createdAt,id) 튜플 결정론으로 판정한다", async () => {
      setViewerTeams([TEAM_A]);
      const curCreatedAt = new Date("2026-08-01T00:00:00.000Z");
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ createdAt: curCreatedAt }),
      );
      prisma.systemNotice.findFirst
        .mockResolvedValueOnce({ id: "newer", title: "더 최신" })
        .mockResolvedValueOnce({ id: "older", title: "더 오래됨" });

      const result = await service.getAdjacentNotices(
        NOTICE_ID,
        USER_ID,
        "PARENT",
      );

      expect(result.next).toEqual({ id: "newer", title: "더 최신" });
      expect(result.previous).toEqual({ id: "older", title: "더 오래됨" });

      const [nextCall, prevCall] = prisma.systemNotice.findFirst.mock.calls;
      // next = 튜플 (createdAt, id) 초과분 중 최솟값 (asc) — 동률은 id 로 판정
      expect(nextCall[0].where.AND).toEqual(
        expect.arrayContaining([
          { isActive: true },
          {
            OR: [
              { createdAt: { gt: curCreatedAt } },
              { createdAt: curCreatedAt, id: { gt: NOTICE_ID } },
            ],
          },
        ]),
      );
      expect(nextCall[0].orderBy).toEqual([
        { createdAt: "asc" },
        { id: "asc" },
      ]);
      expect(prevCall[0].orderBy).toEqual([
        { createdAt: "desc" },
        { id: "desc" },
      ]);
    });

    it("audience 모드 — 마지막/첫 글이면 해당 방향은 null", async () => {
      setViewerTeams([TEAM_A]);
      prisma.systemNotice.findUnique.mockResolvedValue(teamNotice());
      prisma.systemNotice.findFirst.mockResolvedValue(null);

      const result = await service.getAdjacentNotices(
        NOTICE_ID,
        USER_ID,
        "PARENT",
      );
      expect(result).toEqual({ next: null, previous: null });
    });

    it("manage 모드 — 관리 권한자는 미게시·만료 포함(게시기간 조건 없음) 관리 풀에서 판정", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.findUnique.mockResolvedValue(teamNotice());
      prisma.systemNotice.findFirst.mockResolvedValue(null);

      await service.getAdjacentNotices(NOTICE_ID, USER_ID, "DIRECTOR", "manage");

      const where = prisma.systemNotice.findFirst.mock.calls[0][0].where;
      expect(where.AND).toEqual(
        expect.arrayContaining([{ targetTeamId: { in: [TEAM_A] } }]),
      );
      // 관리 모드는 audience 의 isActive/게시기간 조건을 걸지 않는다
      expect(JSON.stringify(where)).not.toContain("isActive");
      expect(JSON.stringify(where)).not.toContain("expiresAt");
    });

    it("manage 모드 — 권한 없는 사용자와 부재 공지는 동일한 404", async () => {
      // 권한 없음 (PARENT)
      prisma.user.findUnique.mockResolvedValue({ userType: "PARENT" });
      prisma.systemNotice.findUnique.mockResolvedValue(teamNotice());
      await expect(
        service.getAdjacentNotices(NOTICE_ID, USER_ID, "PARENT", "manage"),
      ).rejects.toThrow(NotFoundException);

      // 부재 공지
      prisma.systemNotice.findUnique.mockResolvedValue(null);
      await expect(
        service.getAdjacentNotices("ghost", USER_ID, "PARENT", "manage"),
      ).rejects.toThrow(NotFoundException);
    });

    it("audience 모드 — 열람 불가(타 팀) 공지는 404 (상세와 동일 검증)", async () => {
      setViewerTeams([TEAM_B]);
      prisma.systemNotice.findUnique.mockResolvedValue(teamNotice());

      await expect(
        service.getAdjacentNotices(NOTICE_ID, USER_ID, "PARENT"),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.systemNotice.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── Phase 5 R2 — 인접 경계·동률 실결과 (P5-R1-04) ────────────
  describe("인접 공지 경계·동률", () => {
    /**
     * 서비스가 생성하는 (createdAt, id) 튜플 where/orderBy 를 픽스처 행에 실제로
     * 평가하는 인메모리 findFirst — mock 반환값 짜맞추기가 아니라 쿼리 시맨틱이
     * 옳아야만 통과한다.
     */
    const fixtureAdjacent = (rows: Array<{ id: string; createdAt: Date }>) => {
      prisma.systemNotice.findFirst.mockImplementation(
        (args: {
          where: { AND: Array<Record<string, unknown>> };
        }) => {
          // 게시기간 조건(publicationConditions)도 OR 를 쓰므로, createdAt 튜플 OR 만 선별
          const tuple = args.where.AND.find(
            (c) =>
              "OR" in c &&
              (c as { OR: Array<{ createdAt?: unknown }> }).OR[0]?.createdAt !==
                undefined,
          ) as {
            OR: [
              { createdAt: { gt?: Date; lt?: Date } },
              { createdAt: Date; id: { gt?: string; lt?: string } },
            ];
          };
          const isNext = tuple.OR[0].createdAt.gt !== undefined;
          const curAt = tuple.OR[1].createdAt;
          const curId = (tuple.OR[1].id.gt ?? tuple.OR[1].id.lt) as string;
          const cmp = (r: { id: string; createdAt: Date }) => {
            const dt = r.createdAt.getTime() - curAt.getTime();
            if (dt !== 0) return dt;
            return r.id < curId ? -1 : r.id > curId ? 1 : 0;
          };
          const hit = rows
            .filter((r) => (isNext ? cmp(r) > 0 : cmp(r) < 0))
            .sort((a, b) => {
              const dt = a.createdAt.getTime() - b.createdAt.getTime();
              const s = dt !== 0 ? dt : a.id < b.id ? -1 : 1;
              return isNext ? s : -s;
            })[0];
          return Promise.resolve(
            hit ? { id: hit.id, title: `t-${hit.id}` } : null,
          );
        },
      );
    };

    const T = new Date("2026-08-01T00:00:00.000Z");
    const sameTimeRows = [
      { id: "aaa", createdAt: T },
      { id: "bbb", createdAt: T },
      { id: "ccc", createdAt: T },
    ];

    const asCurrent = (id: string, createdAt: Date) => {
      setViewerTeams([TEAM_A]);
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ id, createdAt }),
      );
    };

    it("동일 createdAt 3행에서 중간 글은 id 순서로 양방향이 결정된다", async () => {
      asCurrent("bbb", T);
      fixtureAdjacent(sameTimeRows);

      const result = await service.getAdjacentNotices("bbb", USER_ID, "PARENT");
      expect(result.next?.id).toBe("ccc");
      expect(result.previous?.id).toBe("aaa");
    });

    it("가장 최신 글(첫 글)은 next=null, previous 만 존재한다", async () => {
      asCurrent("ccc", T);
      fixtureAdjacent(sameTimeRows);

      const result = await service.getAdjacentNotices("ccc", USER_ID, "PARENT");
      expect(result.next).toBeNull();
      expect(result.previous?.id).toBe("bbb");
    });

    it("가장 오래된 글(마지막 글)은 previous=null, next 만 존재한다", async () => {
      asCurrent("aaa", T);
      fixtureAdjacent(sameTimeRows);

      const result = await service.getAdjacentNotices("aaa", USER_ID, "PARENT");
      expect(result.next?.id).toBe("bbb");
      expect(result.previous).toBeNull();
    });
  });

  // ── Phase 5 R2 — 관리 컨텍스트 1회 조회 (P5-R1-03) ───────────
  describe("상세 관리 컨텍스트 재사용", () => {
    it("만료 팀 공지를 관리자가 열람해도 관리 SoT 조회는 정확히 1회", async () => {
      prisma.user.findUnique.mockResolvedValue({ userType: "DIRECTOR" });
      setManageTeams([TEAM_A]);
      prisma.systemNotice.findUnique.mockResolvedValue(
        teamNotice({ expiresAt: new Date("2020-01-01T00:00:00.000Z") }),
      );

      const result = await service.getNotice(NOTICE_ID, USER_ID, "DIRECTOR");

      expect(result.canManage).toBe(true);
      // 열람 검증(관리자 예외) + canManage 가 같은 컨텍스트를 공유 — **관리 SoT** 조회 1회.
      //   (coachId 단독 쿼리는 열람 SoT(resolveViewerTeamIds)의 소유 팀 조회라 별개 —
      //    관리 SoT 시그니처는 coachId+isActive / roleInTeam 필터로 구분한다)
      const manageOwnedQueries = prisma.team.findMany.mock.calls.filter(
        (c: [{ where?: { coachId?: string; isActive?: boolean } }]) =>
          c[0]?.where?.coachId && c[0]?.where?.isActive === true,
      );
      expect(manageOwnedQueries).toHaveLength(1);
      const manageMemberQueries = prisma.teamMember.findMany.mock.calls.filter(
        (c: [{ where?: { roleInTeam?: unknown } }]) => c[0]?.where?.roleInTeam,
      );
      expect(manageMemberQueries).toHaveLength(1);
    });
  });
});
