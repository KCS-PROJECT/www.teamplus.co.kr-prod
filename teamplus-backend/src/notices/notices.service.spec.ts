import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
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
      count: jest.Mock;
    };
    noticeComment: { findMany: jest.Mock; count: jest.Mock };
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
        count: jest.fn().mockResolvedValue(0),
      },
      noticeComment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findUnique: jest.fn() },
      team: { findMany: jest.fn().mockResolvedValue([]) },
      teamMember: { findMany: jest.fn().mockResolvedValue([]) },
      coachProfile: { findMany: jest.fn().mockResolvedValue([]) },
      parentChild: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
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
});
