import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CommunityPostsService } from "./community-posts.service";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";

/**
 * 수업/대회 단위 공지 스트림 — 권한 매트릭스·축 배타·수신자 산출 계약 spec.
 * 설계 SoT: claudedocs/unit-notice-stream-design-2026-08-19.md v1.2.3 §4~§5
 */
describe("CommunityPostsService", () => {
  let service: CommunityPostsService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let notifications: { notifyUsers: jest.Mock; notifyTeamAudience: jest.Mock };

  const DIRECTOR = { id: "director-1", userType: "DIRECTOR" };
  const PARENT = { id: "parent-1", userType: "PARENT" };
  const CLASS_ID = "class-1";
  const TOURNAMENT_ID = "tour-1";

  beforeEach(async () => {
    prisma = {
      teamPost: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      teamPostRead: { findMany: jest.fn(), upsert: jest.fn() },
      teamPostComment: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      teamPostAttachment: { createMany: jest.fn(), aggregate: jest.fn() },
      class: { findUnique: jest.fn(), findMany: jest.fn() },
      classRegistration: { findMany: jest.fn(), findFirst: jest.fn() },
      classCoachAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
      tournament: { findUnique: jest.fn(), findMany: jest.fn() },
      tournamentRegistration: { findMany: jest.fn(), findFirst: jest.fn() },
      academy: { findFirst: jest.fn(), findMany: jest.fn() },
      academyCoach: { findFirst: jest.fn(), findMany: jest.fn() },
      team: { findMany: jest.fn() },
      teamMember: { findMany: jest.fn() },
      coachProfile: { findMany: jest.fn() },
      parentChild: { findMany: jest.fn(), findFirst: jest.fn() },
      user: { findMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    // $transaction — 배열/콜백 양쪽 지원
    (prisma as Record<string, unknown>).$transaction = jest.fn(
      async (arg: unknown) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return (arg as (tx: unknown) => Promise<unknown>)(prisma);
      },
    );
    notifications = {
      notifyUsers: jest.fn().mockResolvedValue(undefined),
      notifyTeamAudience: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityPostsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        {
          provide: ViewCounterService,
          useValue: { tryIncrement: jest.fn().mockResolvedValue(false) },
        },
      ],
    }).compile();

    service = module.get<CommunityPostsService>(CommunityPostsService);
  });

  /** resolveNoticeManageTeamIds 경로 — 소유 팀/승인 관리 멤버십 지정 */
  const setManagedTeams = (teamIds: string[]) => {
    prisma.team.findMany.mockResolvedValue(teamIds.map((id) => ({ id })));
    prisma.teamMember.findMany.mockResolvedValue([]);
  };

  describe("createPost — 축 배타 (DB CHECK 와 동일 판정)", () => {
    it("축 0개 지정이면 400", async () => {
      await expect(
        service.createPost(DIRECTOR, { title: "t", content: "c" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("축 2개 지정이면 400", async () => {
      await expect(
        service.createPost(DIRECTOR, {
          title: "t",
          content: "c",
          targetClassId: CLASS_ID,
          targetTournamentId: TOURNAMENT_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("종료된 수업(endedAt)에는 작성 불가", async () => {
      prisma.class.findUnique.mockResolvedValue({
        id: CLASS_ID,
        endedAt: new Date(),
        isActive: true,
      });
      await expect(
        service.createPost(DIRECTOR, {
          title: "t",
          content: "c",
          targetClassId: CLASS_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("관할 아닌 수업이면 403 — resolveManagedTeamIds 계열 금지, 엄격 resolver 기준", async () => {
      prisma.class.findUnique
        .mockResolvedValueOnce({
          id: CLASS_ID,
          endedAt: null,
          isActive: true,
        })
        // canManageClass 내부 재조회
        .mockResolvedValueOnce({ teamId: "other-team", academyId: null });
      setManagedTeams([]); // 관할 팀 없음
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);
      await expect(
        service.createPost(DIRECTOR, {
          title: "t",
          content: "c",
          targetClassId: CLASS_ID,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("수신자 산출 — 대회 PENDING 이중 의미 (billingMode 분기)", () => {
    it("선불(PREPAID) 대회는 PAID 만 수신자", async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        billingMode: "PREPAID",
      });
      prisma.tournamentRegistration.findMany.mockResolvedValue([]);
      await (
        service as unknown as {
          resolveTournamentRecipients: (id: string) => Promise<string[]>;
        }
      ).resolveTournamentRecipients(TOURNAMENT_ID);
      expect(prisma.tournamentRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cancelledAt: null,
            paymentStatus: "PAID",
          }),
        }),
      );
    });

    it("후불(POSTPAID) 대회는 UNPAID/PENDING 도 수신자 (CANCELLED/REFUNDED 만 제외)", async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        billingMode: "POSTPAID",
      });
      prisma.tournamentRegistration.findMany.mockResolvedValue([]);
      await (
        service as unknown as {
          resolveTournamentRecipients: (id: string) => Promise<string[]>;
        }
      ).resolveTournamentRecipients(TOURNAMENT_ID);
      expect(prisma.tournamentRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentStatus: { notIn: ["CANCELLED", "REFUNDED"] },
          }),
        }),
      );
    });
  });

  describe("수신자 산출 — 수업 (ClassRegistration→ParentChild dedupe)", () => {
    it("학부모 dedupe + 학부모 없는 성인은 본인 + WITHDRAWN 제외", async () => {
      prisma.classRegistration.findMany.mockResolvedValue([
        { userId: "child-1" },
        { userId: "child-2" },
        { userId: "adult-1" }, // 학부모 링크 없음 — 성인 본인
      ]);
      prisma.parentChild.findMany.mockResolvedValue([
        { parentId: "parent-1", childId: "child-1" },
        { parentId: "parent-1", childId: "child-2" }, // 같은 학부모 dedupe
      ]);
      // WITHDRAWN 필터 — adult-1 이 탈퇴했다고 가정
      prisma.user.findMany.mockResolvedValue([{ id: "parent-1" }]);

      const result = await (
        service as unknown as {
          resolveClassRecipients: (id: string) => Promise<string[]>;
        }
      ).resolveClassRecipients(CLASS_ID);

      expect(result).toEqual(["parent-1"]);
      // 활성 필터에 parent-1·adult-1 두 후보가 전달됐는지
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: expect.arrayContaining(["parent-1", "adult-1"]) },
            status: { not: "WITHDRAWN" },
          }),
        }),
      );
    });
  });

  describe("목록 조회 (getPosts) — 비열람자는 404 대신 빈 배열 (목록 한정 예외)", () => {
    it("미등록 학부모의 classId 목록 → []", async () => {
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-x",
        academyId: null,
      });
      setManagedTeams([]);
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
      prisma.classRegistration.findFirst.mockResolvedValue(null); // 등록 없음

      const result = await service.getPosts(PARENT, { classId: CLASS_ID });
      expect(result).toEqual([]);
      expect(prisma.teamPost.findMany).not.toHaveBeenCalled(); // 게시글 조회 자체를 생략
    });

    it("축 파라미터 0개/2개는 여전히 400", async () => {
      await expect(service.getPosts(PARENT, {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.getPosts(PARENT, { classId: CLASS_ID, teamId: "t" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("열람 검증 (assertCanViewPost) — 404 은닉", () => {
    it("수업 축: 자녀 active 등록 없는 학부모는 404", async () => {
      // canManageClass → false 경로
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-x",
        academyId: null,
      });
      setManagedTeams([]);
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
      prisma.classRegistration.findFirst.mockResolvedValue(null); // 등록 없음

      await expect(
        service.assertCanViewPost(PARENT, {
          id: "post-1",
          teamId: null,
          targetClassId: CLASS_ID,
          targetTournamentId: null,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("수업 축: 자녀 active 등록이 있으면 통과", async () => {
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-x",
        academyId: null,
      });
      setManagedTeams([]);
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
      prisma.classRegistration.findFirst.mockResolvedValue({ id: "reg-1" });

      await expect(
        service.assertCanViewPost(PARENT, {
          id: "post-1",
          teamId: null,
          targetClassId: CLASS_ID,
          targetTournamentId: null,
        }),
      ).resolves.toBeUndefined();
      // status='active' 만 인정 (pending 완화 미적용 — v1.2.2 재확정)
      expect(prisma.classRegistration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "active" }),
        }),
      );
    });

    it("ADMIN 계열은 전면 통과", async () => {
      await expect(
        service.assertCanViewPost(
          { id: "admin-1", userType: "ADMIN" },
          {
            id: "post-1",
            teamId: null,
            targetClassId: CLASS_ID,
            targetTournamentId: null,
          },
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("읽음 N/M (getReadsSummary) — 감독·코치 전용", () => {
    it("비관할 사용자는 404 은닉", async () => {
      prisma.teamPost.findUnique.mockResolvedValue({
        id: "post-1",
        teamId: null,
        targetClassId: CLASS_ID,
        targetTournamentId: null,
        authorId: "director-1",
        isActive: true,
        startAt: null,
        expiresAt: null,
      });
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-x",
        academyId: null,
      });
      setManagedTeams([]);
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.getReadsSummary(PARENT, "post-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("N = 수신자 ∩ TeamPostRead · 미읽음 명단만 노출 (읽은 목록·readAt 비노출)", async () => {
      prisma.teamPost.findUnique.mockResolvedValue({
        id: "post-1",
        teamId: null,
        targetClassId: CLASS_ID,
        targetTournamentId: null,
        authorId: DIRECTOR.id,
        isActive: true,
        startAt: null,
        expiresAt: null,
        lastRemindAt: null,
      });
      // canManageClass 통과 — 관할 팀 수업
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-1",
        academyId: null,
      });
      setManagedTeams(["team-1"]);
      // 수신자 = parent-1, parent-2
      prisma.classRegistration.findMany.mockResolvedValue([
        { userId: "child-1" },
        { userId: "child-2" },
      ]);
      prisma.parentChild.findMany
        .mockResolvedValueOnce([
          { parentId: "parent-1", childId: "child-1" },
          { parentId: "parent-2", childId: "child-2" },
        ])
        // childNames 조회 (미읽음자 한정, 2번째 호출)
        .mockResolvedValueOnce([]);
      prisma.user.findMany
        .mockResolvedValueOnce([{ id: "parent-1" }, { id: "parent-2" }]) // 활성 필터
        .mockResolvedValueOnce([
          // 미읽음자(parent-2)만 조회된다
          { id: "parent-2", firstName: "부", lastName: "조", avatarUrl: null, userType: "PARENT" },
        ]);
      // reads 쿼리는 userId in 수신자 필터 — parent-1 만 읽음
      prisma.teamPostRead.findMany.mockResolvedValue([
        { userId: "parent-1" },
      ]);

      const summary = await service.getReadsSummary(DIRECTOR, "post-1");
      expect(summary.recipientCount).toBe(2);
      expect(summary.readCount).toBe(1);
      expect(summary.unread.map((r) => r.userId)).toEqual(["parent-2"]);
      // 노출 축소 계약 — 읽은 사람 목록·읽은 시각은 응답에 없다
      expect(summary).not.toHaveProperty("read");
      expect(summary.unread[0]).not.toHaveProperty("readAt");
      // reads 조회가 수신자 집합으로 스코프되는지 (관리자 read 제외 근거)
      expect(prisma.teamPostRead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: { in: expect.arrayContaining(["parent-1", "parent-2"]) },
          }),
        }),
      );
      // 미읽음 사용자 조회가 unreadIds 로만 스코프되는지
      expect(prisma.user.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ["parent-2"] } }),
        }),
      );
    });
  });

  describe("팀 공지 읽음 현황 — 단건 수신자 해석기의 팀 축 편입 (목록과 분모 일치)", () => {
    it("팀 공지 상세 읽음 현황도 팀 수신 풀(멤버∪학부모∪감독)을 분모로 쓴다", async () => {
      prisma.teamPost.findUnique.mockResolvedValue({
        id: "post-1",
        teamId: "team-1",
        targetClassId: null,
        targetTournamentId: null,
        authorId: DIRECTOR.id,
        isActive: true,
        startAt: null,
        expiresAt: null,
        lastRemindAt: null,
      });
      setManagedTeams(["team-1"]);
      // 팀 수신 풀 — 자녀 멤버 child-1 + 학부모 parent-1 + 소유 감독(coachId)
      prisma.teamMember.findMany.mockResolvedValue([
        { teamId: "team-1", userId: "child-1" },
      ]);
      prisma.team.findMany.mockResolvedValue([
        { id: "team-1", coachId: DIRECTOR.id },
      ]);
      prisma.parentChild.findMany
        .mockResolvedValueOnce([{ childId: "child-1", parentId: "parent-1" }])
        // childNames 조회 (미읽음자 한정)
        .mockResolvedValueOnce([]);
      // parent-1 만 읽음 → 미읽음 = child-1 + 감독
      prisma.teamPostRead.findMany.mockResolvedValue([{ userId: "parent-1" }]);
      prisma.user.findMany.mockResolvedValue([
        {
          id: "child-1",
          firstName: "자",
          lastName: "김",
          avatarUrl: null,
          userType: "CHILD",
        },
        {
          id: DIRECTOR.id,
          firstName: "감",
          lastName: "김",
          avatarUrl: null,
          userType: "DIRECTOR",
        },
      ]);

      const summary = await service.getReadsSummary(DIRECTOR, "post-1");
      // 이 계약이 깨지면 목록(managed)은 N/M 인데 상세는 0/0 이 된다
      expect(summary.recipientCount).toBe(3);
      expect(summary.readCount).toBe(1);
    });
  });

  describe("미읽음 재알림 (remindUnread) — 24시간 쿨다운", () => {
    const activePost = {
      id: "post-1",
      teamId: null,
      targetClassId: CLASS_ID,
      targetTournamentId: null,
      authorId: DIRECTOR.id,
      isActive: true,
      startAt: null,
      expiresAt: null,
    };

    const setupManaged = () => {
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-1",
        academyId: null,
      });
      setManagedTeams(["team-1"]);
    };

    it("쿨다운 claim 실패(count=0)면 400 — 하루 1회", async () => {
      prisma.teamPost.findUnique.mockResolvedValue(activePost);
      setupManaged();
      prisma.teamPost.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.remindUnread(DIRECTOR, "post-1"),
      ).rejects.toThrow(BadRequestException);
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });

    it("미읽음자에게만 재알림 발송 + reminded 수 반환", async () => {
      prisma.teamPost.findUnique
        .mockResolvedValueOnce(activePost) // getPostScope
        .mockResolvedValue({ title: "공지", targetClassId: CLASS_ID }); // 제목 조회
      setupManaged();
      prisma.teamPost.updateMany.mockResolvedValue({ count: 1 });
      prisma.classRegistration.findMany.mockResolvedValue([
        { userId: "child-1" },
        { userId: "child-2" },
      ]);
      prisma.parentChild.findMany.mockResolvedValue([
        { parentId: "parent-1", childId: "child-1" },
        { parentId: "parent-2", childId: "child-2" },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: "parent-1" },
        { id: "parent-2" },
      ]);
      prisma.teamPostRead.findMany.mockResolvedValue([
        { userId: "parent-1" }, // parent-1 은 읽음 → 제외
      ]);

      const result = await service.remindUnread(DIRECTOR, "post-1");
      expect(result).toEqual({ reminded: 1 });
      expect(notifications.notifyUsers).toHaveBeenCalledWith(
        ["parent-2"],
        expect.objectContaining({
          notificationType: "notice_unread_reminder",
          linkUrl: "/community-notice/post-1",
        }),
      );
    });

    it("비관할 사용자는 404 은닉", async () => {
      prisma.teamPost.findUnique.mockResolvedValue(activePost);
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-x",
        academyId: null,
      });
      setManagedTeams([]);
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);
      await expect(service.remindUnread(PARENT, "post-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("댓글 삭제 — UI 본인만·백엔드 moderation (v1.2.3 §5)", () => {
    const comment = {
      id: "comment-1",
      authorId: "parent-1",
      postId: "post-1",
      post: {
        id: "post-1",
        teamId: null,
        targetClassId: CLASS_ID,
        targetTournamentId: null,
        authorId: "director-1",
        isActive: true,
        startAt: null,
        expiresAt: null,
      },
    };

    it("본인 댓글 삭제 — 현재 열람 자격 재검증 통과 시 삭제 (감사 로그 없음)", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue(comment);
      // [H-03] 본인 삭제도 assertCanViewPost 재검증 — 자녀 active 등록 유지 상태 mock
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-x",
        academyId: null,
      });
      setManagedTeams([]);
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
      prisma.classRegistration.findFirst.mockResolvedValue({ id: "reg-1" });
      prisma.teamPostComment.delete.mockResolvedValue({});
      prisma.teamPost.update.mockResolvedValue({});
      const result = await service.deleteComment(PARENT, "comment-1");
      expect(result).toEqual({ deleted: true });
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it("[H-03] 자격 상실(등록 해지) 후 본인 댓글 삭제 — 404 은닉", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue(comment);
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-x",
        academyId: null,
      });
      setManagedTeams([]);
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
      prisma.classRegistration.findFirst.mockResolvedValue(null); // 등록 해지됨
      await expect(
        service.deleteComment(PARENT, "comment-1"),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.teamPostComment.delete).not.toHaveBeenCalled();
    });

    it("[H-03] 자격 상실 후 본인 댓글 수정 — 404 은닉", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue({
        id: "comment-1",
        authorId: PARENT.id,
        post: {
          id: "post-1",
          teamId: null,
          targetClassId: CLASS_ID,
          targetTournamentId: null,
          isActive: true,
        },
      });
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-x",
        academyId: null,
      });
      setManagedTeams([]);
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
      prisma.classRegistration.findFirst.mockResolvedValue(null);
      await expect(
        service.updateComment(PARENT, "comment-1", { content: "수정" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("[H-03] soft 삭제된 게시글의 본인 댓글 수정 — 404 은닉", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue({
        id: "comment-1",
        authorId: PARENT.id,
        post: {
          id: "post-1",
          teamId: null,
          targetClassId: CLASS_ID,
          targetTournamentId: null,
          isActive: false,
        },
      });
      await expect(
        service.updateComment(PARENT, "comment-1", { content: "수정" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("관할 감독 moderation — AuditLog 기록", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue(comment);
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-1",
        academyId: null,
      });
      setManagedTeams(["team-1"]);
      prisma.teamPostComment.delete.mockResolvedValue({});
      prisma.teamPost.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.deleteComment(DIRECTOR, "comment-1");
      expect(result).toEqual({ deleted: true });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "TEAM_POST_COMMENT_DELETED",
          }),
        }),
      );
    });

    it("비관할 타인 — 404 은닉 (403 금지)", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue(comment);
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-x",
        academyId: null,
      });
      setManagedTeams([]);
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteComment({ id: "other", userType: "PARENT" }, "comment-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("[R2 H-03] soft 삭제된 게시글의 댓글 삭제 — 본인·moderation 전 경로 404", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue({
        ...comment,
        post: { ...comment.post, isActive: false },
      });
      // 본인 경로
      await expect(
        service.deleteComment(PARENT, "comment-1"),
      ).rejects.toThrow(NotFoundException);
      // moderation 경로 (관할 감독이어도 404)
      await expect(
        service.deleteComment(DIRECTOR, "comment-1"),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.teamPostComment.delete).not.toHaveBeenCalled();
    });

    it("[R2 H-03] 만료된 게시글의 본인 댓글 삭제 — 관할/작성자 아니면 404 (addComment 정책 통일)", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue({
        ...comment,
        post: {
          ...comment.post,
          expiresAt: new Date(Date.now() - 86_400_000), // 어제 만료
        },
      });
      // 열람 자격은 유지(자녀 active 등록) — 게시기간 정책만 판정 대상
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-x",
        academyId: null,
      });
      setManagedTeams([]);
      prisma.classCoachAssignment.findFirst.mockResolvedValue(null);
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
      prisma.classRegistration.findFirst.mockResolvedValue({ id: "reg-1" });

      await expect(
        service.deleteComment(PARENT, "comment-1"),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.teamPostComment.delete).not.toHaveBeenCalled();
    });

    it("[R2 H-03] 만료된 게시글이라도 관할 감독의 moderation 삭제는 허용", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue({
        ...comment,
        post: {
          ...comment.post,
          expiresAt: new Date(Date.now() - 86_400_000),
        },
      });
      prisma.class.findUnique.mockResolvedValue({
        teamId: "team-1",
        academyId: null,
      });
      setManagedTeams(["team-1"]);
      prisma.teamPostComment.delete.mockResolvedValue({});
      prisma.teamPost.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.deleteComment(DIRECTOR, "comment-1");
      expect(result).toEqual({ deleted: true });
    });
  });

  describe("알림 — 즉시 게시 claim (생애 1회)", () => {
    it("즉시 게시 생성은 publishedNotifiedAt 을 생성과 함께 기록", async () => {
      prisma.class.findUnique
        .mockResolvedValueOnce({ id: CLASS_ID, endedAt: null, isActive: true })
        .mockResolvedValue({ teamId: "team-1", academyId: null });
      setManagedTeams(["team-1"]);
      prisma.teamPost.create.mockResolvedValue({
        id: "post-1",
        teamId: null,
        targetClassId: CLASS_ID,
        targetTournamentId: null,
        title: "t",
      });
      // getPostDetail 경로 mock — scope 재조회 + include 조회
      prisma.teamPost.findUnique.mockResolvedValue({
        id: "post-1",
        teamId: null,
        targetClassId: CLASS_ID,
        targetTournamentId: null,
        authorId: DIRECTOR.id,
        isActive: true,
        startAt: null,
        expiresAt: null,
        title: "t",
        content: "c",
        isPinned: false,
        viewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: {},
        targetClass: { id: CLASS_ID, className: "수업" },
        targetTournament: null,
        attachments: [],
        comments: [],
        _count: { comments: 0 },
      });
      prisma.teamPostRead.upsert.mockResolvedValue({});
      prisma.teamPostRead.findMany.mockResolvedValue([]);

      await service.createPost(DIRECTOR, {
        title: "t",
        content: "c",
        targetClassId: CLASS_ID,
      });
      expect(prisma.teamPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedNotifiedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("[H-07] 게시글+첨부 메타는 단일 트랜잭션으로 저장", async () => {
      prisma.class.findUnique
        .mockResolvedValueOnce({ id: CLASS_ID, endedAt: null, isActive: true })
        .mockResolvedValue({ teamId: "team-1", academyId: null });
      setManagedTeams(["team-1"]);
      prisma.teamPost.create.mockResolvedValue({
        id: "post-1",
        teamId: null,
        targetClassId: CLASS_ID,
        targetTournamentId: null,
        title: "t",
      });
      prisma.teamPostAttachment.createMany.mockResolvedValue({ count: 1 });
      prisma.teamPost.findUnique.mockResolvedValue({
        id: "post-1",
        teamId: null,
        targetClassId: CLASS_ID,
        targetTournamentId: null,
        authorId: DIRECTOR.id,
        isActive: true,
        startAt: null,
        expiresAt: null,
        title: "t",
        content: "c",
        isPinned: false,
        viewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: {},
        targetClass: { id: CLASS_ID, className: "수업" },
        targetTournament: null,
        attachments: [],
        comments: [],
        _count: { comments: 0 },
      });
      prisma.teamPostRead.upsert.mockResolvedValue({});
      prisma.teamPostRead.findMany.mockResolvedValue([]);

      await service.createPost(DIRECTOR, {
        title: "t",
        content: "c",
        targetClassId: CLASS_ID,
        attachments: [
          { fileUrl: "u", fileName: "f.png", fileType: "image/png", fileSize: 10 },
        ],
      });
      // 게시글 create 와 첨부 createMany 가 같은 $transaction 콜백 안에서 실행됐는지
      expect(
        (prisma as Record<string, unknown>).$transaction,
      ).toHaveBeenCalled();
      expect(prisma.teamPostAttachment.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({ postId: "post-1", fileType: "image/png" }),
          ],
        }),
      );
    });

    it("예약(startAt 미래) 생성은 claim·푸시 없음 (AC 3-11 동일 계약)", async () => {
      prisma.class.findUnique
        .mockResolvedValueOnce({ id: CLASS_ID, endedAt: null, isActive: true })
        .mockResolvedValue({ teamId: "team-1", academyId: null });
      setManagedTeams(["team-1"]);
      const future = new Date(Date.now() + 86_400_000).toISOString();
      prisma.teamPost.create.mockResolvedValue({
        id: "post-1",
        teamId: null,
        targetClassId: CLASS_ID,
        targetTournamentId: null,
        title: "t",
      });
      prisma.teamPost.findUnique.mockResolvedValue({
        id: "post-1",
        teamId: null,
        targetClassId: CLASS_ID,
        targetTournamentId: null,
        authorId: DIRECTOR.id,
        isActive: true,
        startAt: new Date(future),
        expiresAt: null,
        title: "t",
        content: "c",
        isPinned: false,
        viewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: {},
        targetClass: { id: CLASS_ID, className: "수업" },
        targetTournament: null,
        attachments: [],
        comments: [],
        _count: { comments: 0 },
      });
      prisma.teamPostRead.upsert.mockResolvedValue({});
      prisma.teamPostRead.findMany.mockResolvedValue([]);

      await service.createPost(DIRECTOR, {
        title: "t",
        content: "c",
        targetClassId: CLASS_ID,
        startAt: future,
      });
      expect(prisma.teamPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ publishedNotifiedAt: null }),
        }),
      );
      expect(notifications.notifyUsers).not.toHaveBeenCalled();
    });
  });

  /**
   * [Phase 2 §4.5] 통합 feed — 대시보드 탭 A 단일 소스.
   * 열람 3축 합집합(팀+수업+대회) · childId 표시 필터(권한은 전 자녀) · 게시 중만.
   */
  describe("[Phase 2] 통합 feed (getFeed)", () => {
    /** 열람·관할 해석기가 읽는 mock 전부 빈 결과로 초기화 — 케이스가 필요한 축만 override */
    const stubEmptyScope = () => {
      prisma.team.findMany.mockResolvedValue([]);
      prisma.teamMember.findMany.mockResolvedValue([]);
      prisma.coachProfile.findMany.mockResolvedValue([]);
      prisma.parentChild.findMany.mockResolvedValue([]);
      prisma.classRegistration.findMany.mockResolvedValue([]);
      prisma.tournamentRegistration.findMany.mockResolvedValue([]);
      prisma.academy.findMany.mockResolvedValue([]);
      prisma.academyCoach.findMany.mockResolvedValue([]);
      prisma.classCoachAssignment.findMany.mockResolvedValue([]);
      prisma.class.findMany.mockResolvedValue([]);
      prisma.tournament.findMany.mockResolvedValue([]);
      prisma.teamPost.findMany.mockResolvedValue([]);
      prisma.teamPost.count.mockResolvedValue(0);
      prisma.teamPostRead.findMany.mockResolvedValue([]);
    };

    const feedWhere = () => prisma.teamPost.findMany.mock.calls[0][0].where;

    it("학부모 — 팀+수업+대회 열람 축 OR 합집합 + 게시기간 조건으로 조회한다", async () => {
      stubEmptyScope();
      // 자녀 child-1 → 팀 TEAM_A(자녀 멤버십) + 수업 CLASS_ID 등록
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
      prisma.teamMember.findMany.mockImplementation(
        (args: { where?: { roleInTeam?: unknown } }) =>
          Promise.resolve(
            args?.where?.roleInTeam ? [] : [{ teamId: "team-a" }],
          ),
      );
      prisma.classRegistration.findMany.mockResolvedValue([
        { classId: CLASS_ID },
      ]);
      // 대회 — 선불 PAID 신청 1건
      prisma.tournamentRegistration.findMany.mockResolvedValue([
        {
          tournamentId: TOURNAMENT_ID,
          paymentStatus: "PAID",
          tournament: { billingMode: "PREPAID" },
        },
      ]);

      await service.getFeed(PARENT, { limit: 5 });

      const where = feedWhere();
      expect(where.isActive).toBe(true);
      expect(where.postType).toBe("announcement");
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { teamId: { in: ["team-a"] } },
          { targetClassId: { in: [CLASS_ID] } },
          { targetTournamentId: { in: [TOURNAMENT_ID] } },
        ]),
      );
      // 게시 중만 — startAt/expiresAt 윈도 조건이 AND 로 함께 걸린다
      const windowKeys = (where.AND as Array<{ OR: Array<Record<string, unknown>> }>)
        .flatMap((c) => c.OR.flatMap((o) => Object.keys(o)));
      expect(windowKeys).toContain("startAt");
      expect(windowKeys).toContain("expiresAt");
    });

    it("audienceChildNames — 자녀 등록으로 매칭된 수업·대회 공지에 자녀 이름을 채운다", async () => {
      stubEmptyScope();
      prisma.parentChild.findMany.mockResolvedValue([
        {
          childId: "child-1",
          child: { firstName: "민준", lastName: "김" },
        },
      ]);
      prisma.classRegistration.findMany.mockResolvedValue([
        { classId: CLASS_ID, userId: "child-1" },
      ]);
      prisma.tournamentRegistration.findMany.mockResolvedValue([
        {
          tournamentId: TOURNAMENT_ID,
          childId: "child-1",
          paymentStatus: "PAID",
          tournament: { billingMode: "PREPAID" },
        },
      ]);
      const basePost = {
        title: "공지",
        content: "본문",
        isPinned: false,
        isActive: true,
        viewCount: 0,
        startAt: null,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        author: { id: "director-1" },
        attachments: [],
        _count: { comments: 0 },
      };
      prisma.teamPost.findMany.mockResolvedValue([
        {
          ...basePost,
          id: "post-class",
          teamId: null,
          targetClassId: CLASS_ID,
          targetTournamentId: null,
          team: null,
          targetClass: { id: CLASS_ID, className: "화요 훈련" },
          targetTournament: null,
        },
        {
          ...basePost,
          id: "post-tour",
          teamId: null,
          targetClassId: null,
          targetTournamentId: TOURNAMENT_ID,
          team: null,
          targetClass: null,
          targetTournament: { id: TOURNAMENT_ID, name: "가을 대회" },
        },
      ]);
      prisma.teamPost.count.mockResolvedValue(2);

      const res = await service.getFeed(PARENT, { limit: 5 });

      const byId = new Map(
        res.data.map((p: { id: string; audienceChildNames: string[] }) => [
          p.id,
          p.audienceChildNames,
        ]),
      );
      expect(byId.get("post-class")).toEqual(["김민준"]);
      expect(byId.get("post-tour")).toEqual(["김민준"]);
    });

    it("[P2-R3-M01] feed offset 페이지 안정 정렬 — isPinned·createdAt·id 3차 키", async () => {
      stubEmptyScope();
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
      prisma.teamMember.findMany.mockImplementation(
        (args: { where?: { roleInTeam?: unknown } }) =>
          Promise.resolve(
            args?.where?.roleInTeam ? [] : [{ teamId: "team-a" }],
          ),
      );

      await service.getFeed(PARENT, { limit: 5, offset: 5 });

      const call = prisma.teamPost.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual([
        { isPinned: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ]);
      expect(call.skip).toBe(5);
    });

    it("childId 표시 필터 — 타인 자녀 지정 시 수업 축은 빈 교집합(IDOR 차단)", async () => {
      stubEmptyScope();
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);

      await service.getFeed(PARENT, { childId: "other-child", limit: 5 });

      // 내 자녀 목록에 없는 childId → 수업 등록 조회 자체가 나가지 않는다
      expect(prisma.classRegistration.findMany).not.toHaveBeenCalled();
    });

    it("[P2-R1-H05] childId 지정 시 대회 등록도 선택 자녀로 필터한다", async () => {
      stubEmptyScope();
      prisma.parentChild.findMany.mockResolvedValue([{ childId: "child-1" }]);
      prisma.tournamentRegistration.findMany.mockResolvedValue([]);

      await service.getFeed(PARENT, { childId: "child-1", limit: 5 });

      expect(prisma.tournamentRegistration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: PARENT.id,
            childId: "child-1",
          }),
        }),
      );
    });

    it("대회 축 — PREPAID 는 PAID 만 포함 (PENDING 이중 의미 분기)", async () => {
      stubEmptyScope();
      prisma.tournamentRegistration.findMany.mockResolvedValue([
        {
          tournamentId: "t-prepaid-pending",
          paymentStatus: "PENDING",
          tournament: { billingMode: "PREPAID" },
        },
        {
          tournamentId: "t-postpaid-pending",
          paymentStatus: "PENDING",
          tournament: { billingMode: "POSTPAID" },
        },
      ]);

      await service.getFeed(PARENT, { limit: 5 });

      const where = feedWhere();
      expect(where.OR).toEqual([
        { targetTournamentId: { in: ["t-postpaid-pending"] } },
      ]);
    });

    it("열람 축이 전무하면 빈 배열 — 게시글 조회 0", async () => {
      stubEmptyScope();

      const result = await service.getFeed(PARENT, { limit: 5 });

      expect(result).toEqual({ data: [], total: 0 });
      expect(prisma.teamPost.findMany).not.toHaveBeenCalled();
    });

    it("시스템 역할은 3축 전역", async () => {
      stubEmptyScope();

      await service.getFeed({ id: "admin-1", userType: "ADMIN" }, { limit: 5 });

      expect(feedWhere().OR).toEqual([
        { teamId: { not: null } },
        { targetClassId: { not: null } },
        { targetTournamentId: { not: null } },
      ]);
    });
  });

  /** [Phase 2 §6·§7] managed 공지함·픽커의 팀 축 편입 */
  describe("[Phase 2] managed 팀 축", () => {
    it("axis=team — 관할 팀 공지만 조회하고 수신 분모는 팀 전체 풀(멤버∪학부모∪감독)", async () => {
      // 관할 팀 team-a (소유)
      prisma.team.findMany.mockImplementation(
        (args: { where?: { coachId?: string; id?: unknown } }) =>
          Promise.resolve(
            args?.where?.coachId
              ? [{ id: "team-a" }]
              : [{ id: "team-a", coachId: DIRECTOR.id }],
          ),
      );
      prisma.classCoachAssignment.findMany.mockResolvedValue([]);
      prisma.academy.findMany.mockResolvedValue([]);
      prisma.academyCoach.findMany.mockResolvedValue([]);
      prisma.class.findMany.mockResolvedValue([]);
      prisma.tournament.findMany.mockResolvedValue([]);
      prisma.teamPost.findMany.mockResolvedValue([
        {
          id: "post-1",
          teamId: "team-a",
          targetClassId: null,
          targetTournamentId: null,
          title: "팀 공지",
          content: "본문",
          isPinned: false,
          isActive: true,
          viewCount: 0,
          startAt: null,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          author: { id: DIRECTOR.id },
          team: { id: "team-a", name: "블랭크" },
          targetClass: null,
          targetTournament: null,
          attachments: [],
          _count: { comments: 0 },
        },
      ]);
      // 팀 수신 풀 — 자녀 멤버 child-1 + 그 학부모 parent-1 + 소유 감독(coachId)
      prisma.teamMember.findMany.mockResolvedValue([
        { teamId: "team-a", userId: "child-1" },
      ]);
      prisma.parentChild.findMany.mockResolvedValue([
        { childId: "child-1", parentId: "parent-1" },
      ]);
      prisma.teamPostRead.findMany.mockResolvedValue([
        { postId: "post-1", userId: "parent-1" },
      ]);

      prisma.teamPost.count.mockResolvedValue(1);
      const result = await service.getManagedPosts(DIRECTOR, "team", 30, 30);

      // where — 팀 축만
      const call = prisma.teamPost.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([{ teamId: { in: ["team-a"] } }]);
      // [P2-R3-M01] offset 페이지 안정 정렬 — createdAt 동률 시 경계 중복·누락 방지
      expect(call.orderBy).toEqual([
        { isPinned: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ]);
      expect(call.skip).toBe(30);
      // [P2-R1-M01] 페이지 계약 — {data,total}
      expect(result.total).toBe(1);
      // 분모 M = child-1 + parent-1 + director-1(coachId) = 3 · 읽음 N = parent-1 = 1
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          targetName: "블랭크",
          readCount: 1,
          recipientCount: 3,
        }),
      );
    });

    it("status 필터 — expired 는 종료일 경과만·ongoing 은 미만료(예약 포함) 서버 where", async () => {
      prisma.team.findMany.mockImplementation(
        (args: { where?: { coachId?: string } }) =>
          Promise.resolve(args?.where?.coachId ? [{ id: "team-a" }] : []),
      );
      prisma.teamMember.findMany.mockResolvedValue([]);
      prisma.classCoachAssignment.findMany.mockResolvedValue([]);
      prisma.academy.findMany.mockResolvedValue([]);
      prisma.academyCoach.findMany.mockResolvedValue([]);
      prisma.class.findMany.mockResolvedValue([]);
      prisma.tournament.findMany.mockResolvedValue([]);
      prisma.teamPost.findMany.mockResolvedValue([]);
      prisma.teamPost.count.mockResolvedValue(0);
      prisma.teamPostRead.findMany.mockResolvedValue([]);

      await service.getManagedPosts(DIRECTOR, "team", 30, 0, "expired");
      const expiredWhere = prisma.teamPost.findMany.mock.calls[0][0].where;
      expect(expiredWhere.expiresAt).toEqual({ lt: expect.any(Date) });

      await service.getManagedPosts(DIRECTOR, "team", 30, 0, "ongoing");
      const ongoingWhere = prisma.teamPost.findMany.mock.calls[1][0].where;
      expect(ongoingWhere.AND).toEqual([
        {
          OR: [{ expiresAt: null }, { expiresAt: { gte: expect.any(Date) } }],
        },
      ]);
      // count 는 목록과 같은 where 공유 — total 이 필터와 어긋나면 hasMore 가 깨진다
      expect(prisma.teamPost.count.mock.calls[1][0].where).toBe(ongoingWhere);
    });

    it("targets 픽커에 관할 팀 목록이 포함된다", async () => {
      prisma.team.findMany.mockImplementation(
        (args: { where?: { coachId?: string; id?: unknown } }) =>
          Promise.resolve(
            args?.where?.coachId
              ? [{ id: "team-a" }]
              : [{ id: "team-a", name: "블랭크" }],
          ),
      );
      prisma.teamMember.findMany.mockResolvedValue([]);
      prisma.classCoachAssignment.findMany.mockResolvedValue([]);
      prisma.academy.findMany.mockResolvedValue([]);
      prisma.academyCoach.findMany.mockResolvedValue([]);
      prisma.class.findMany.mockResolvedValue([]);
      prisma.tournament.findMany.mockResolvedValue([]);

      const result = await service.getManagedTargets(DIRECTOR);

      expect(result.teams).toEqual([{ id: "team-a", name: "블랭크" }]);
    });
  });
});
