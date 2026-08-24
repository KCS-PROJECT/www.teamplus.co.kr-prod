import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { CommunityService } from "./community.service";
import { CommunityPostsService } from "./community-posts.service";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";

/**
 * [Codex R1 H-01] 레거시 `teams/:teamId/community` 축 격리 회귀 spec.
 *
 * 레거시 경로는 팀 게시판(teamId 축) 전용 — 단위 공지(teamId=null)가 이 경로로
 * 열리면 신규 flat API 의 게시기간·soft delete 노출 필터·좋아요 미지원·첨부 이미지
 * 제한을 전부 우회한다. 모든 하위 경로(상세·좋아요·댓글·수정·삭제·첨부)가
 * ① 단위 축 게시글 ② route teamId 불일치 팀 게시글을 404 로 은닉하는지 고정한다.
 */
describe("CommunityService — 레거시 축 격리 (H-01)", () => {
  let service: CommunityService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let postsService: {
    assertCanViewPost: jest.Mock;
    assertCommentablePostState: jest.Mock;
  };

  const ROUTE_TEAM = "team-1";
  const REQUESTER = { id: "user-1", userType: "PARENT" };

  interface FixturePost {
    id: string;
    teamId: string | null;
    targetClassId: string | null;
    targetTournamentId: string | null;
    isActive: boolean;
    authorId: string;
    likeCount: number;
  }

  /** 단위 공지 (수업 축) — 레거시 경로에서 반드시 404 */
  const unitPost: FixturePost = {
    id: "post-unit",
    teamId: null,
    targetClassId: "class-1",
    targetTournamentId: null,
    isActive: true,
    authorId: "director-1",
    likeCount: 0,
  };
  /** 타 팀 게시글 — route teamId 불일치 404 */
  const otherTeamPost: FixturePost = {
    ...unitPost,
    id: "post-other",
    teamId: "team-2",
    targetClassId: null,
  };

  beforeEach(async () => {
    postsService = {
      assertCanViewPost: jest.fn().mockResolvedValue(undefined),
      assertCommentablePostState: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      teamPost: { findUnique: jest.fn(), update: jest.fn() },
      teamPostComment: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      teamPostAttachment: { findUnique: jest.fn(), aggregate: jest.fn(), create: jest.fn() },
      teamPostLike: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityService,
        { provide: PrismaService, useValue: prisma },
        { provide: ViewCounterService, useValue: { tryIncrement: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: { notifyTeamParents: jest.fn() },
        },
        {
          // 축 격리 가드가 assertCanViewPost 보다 먼저 걸리므로 도달하면 실패로 간주
          provide: CommunityPostsService,
          useValue: postsService,
        },
      ],
    }).compile();
    service = module.get<CommunityService>(CommunityService);
  });

  const cases: Array<[string, (post: FixturePost) => Promise<unknown>]> = [
    [
      "상세",
      (post) => {
        prisma.teamPost.findUnique.mockResolvedValue(post);
        return service.getTeamPostDetail(post.id, REQUESTER, ROUTE_TEAM);
      },
    ],
    [
      "좋아요 토글",
      (post) => {
        prisma.teamPost.findUnique.mockResolvedValue(post);
        return service.toggleLike(REQUESTER, post.id, ROUTE_TEAM);
      },
    ],
    [
      "좋아요 목록",
      (post) => {
        prisma.teamPost.findUnique.mockResolvedValue(post);
        return service.getPostLikes(REQUESTER, post.id, ROUTE_TEAM);
      },
    ],
    [
      "게시글 수정",
      (post) => {
        prisma.teamPost.findUnique.mockResolvedValue(post);
        return service.updateTeamPost(
          REQUESTER.id,
          post.id,
          { title: "x" },
          ROUTE_TEAM,
        );
      },
    ],
    [
      "게시글 삭제",
      (post) => {
        prisma.teamPost.findUnique.mockResolvedValue(post);
        return service.deleteTeamPost(REQUESTER.id, post.id, false, ROUTE_TEAM);
      },
    ],
    [
      "첨부 추가",
      (post) => {
        prisma.teamPost.findUnique.mockResolvedValue(post);
        return service.addAttachment(
          REQUESTER.id,
          post.id,
          { fileUrl: "u", fileName: "f", fileType: "image/png", fileSize: 1 },
          ROUTE_TEAM,
        );
      },
    ],
    [
      "댓글 작성",
      (post) => {
        prisma.teamPost.findUnique.mockResolvedValue(post);
        return service.addCommentToPost(
          REQUESTER,
          post.id,
          { content: "c" },
          ROUTE_TEAM,
        );
      },
    ],
    [
      "댓글 수정",
      (post) => {
        prisma.teamPostComment.findUnique.mockResolvedValue({
          id: "comment-1",
          authorId: REQUESTER.id,
          post: {
            id: post.id,
            teamId: post.teamId,
            targetClassId: post.targetClassId,
            targetTournamentId: post.targetTournamentId,
            authorId: post.authorId,
            isActive: post.isActive,
            startAt: null,
            expiresAt: null,
          },
        });
        return service.updateComment(
          REQUESTER,
          "comment-1",
          { content: "c" },
          ROUTE_TEAM,
        );
      },
    ],
    [
      "댓글 삭제",
      (post) => {
        prisma.teamPostComment.findUnique.mockResolvedValue({
          id: "comment-1",
          authorId: REQUESTER.id,
          postId: post.id,
          post,
        });
        return service.deleteComment(
          REQUESTER,
          "comment-1",
          false,
          ROUTE_TEAM,
        );
      },
    ],
    [
      "첨부 삭제",
      (post) => {
        prisma.teamPostAttachment.findUnique.mockResolvedValue({
          id: "att-1",
          post,
        });
        return service.deleteAttachment(REQUESTER.id, "att-1", ROUTE_TEAM);
      },
    ],
  ];

  describe("단위 공지(teamId=null)는 레거시 전 하위 경로에서 404", () => {
    for (const [name, run] of cases) {
      it(name, async () => {
        await expect(run(unitPost)).rejects.toThrow(NotFoundException);
      });
    }
  });

  describe("route teamId 불일치 팀 게시글도 404 (크로스-팀 은닉)", () => {
    for (const [name, run] of cases) {
      it(name, async () => {
        await expect(run(otherTeamPost)).rejects.toThrow(NotFoundException);
      });
    }
  });

  /**
   * [Codex R3 H-03] 레거시 댓글 경로도 신규 게시기간 정책(assertCommentablePostState)에
   * 위임하는지 고정 — 예약 전·만료 후 일반 사용자 차단이 레거시 경로에서 우회되지 않는다.
   */
  describe("레거시 댓글 경로 게시기간 정책 위임 (R3 H-03)", () => {
    const teamPost: FixturePost = {
      ...unitPost,
      id: "post-team",
      teamId: ROUTE_TEAM,
      targetClassId: null,
    };
    const commentPostSelect = {
      id: teamPost.id,
      teamId: teamPost.teamId,
      targetClassId: teamPost.targetClassId,
      targetTournamentId: teamPost.targetTournamentId,
      authorId: teamPost.authorId,
      isActive: teamPost.isActive,
      startAt: null,
      expiresAt: null,
    };

    it("댓글 작성 — requester 를 전달하고 게시기간 거부(404 은닉)를 전파", async () => {
      prisma.teamPost.findUnique.mockResolvedValue(teamPost);
      postsService.assertCommentablePostState.mockRejectedValue(
        new NotFoundException(),
      );
      await expect(
        service.addCommentToPost(
          REQUESTER,
          teamPost.id,
          { content: "c" },
          ROUTE_TEAM,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(postsService.assertCommentablePostState).toHaveBeenCalledWith(
        REQUESTER,
        teamPost,
      );
      expect(prisma.teamPostComment.create).not.toHaveBeenCalled();
    });

    it("댓글 수정 — 작성자 본인이라도 게시기간 거부(404 은닉)를 전파", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue({
        id: "comment-1",
        authorId: REQUESTER.id,
        post: commentPostSelect,
      });
      postsService.assertCommentablePostState.mockRejectedValue(
        new NotFoundException(),
      );
      await expect(
        service.updateComment(
          REQUESTER,
          "comment-1",
          { content: "c" },
          ROUTE_TEAM,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(postsService.assertCommentablePostState).toHaveBeenCalledWith(
        REQUESTER,
        commentPostSelect,
      );
    });

    it("댓글 삭제 — 작성자 본인이라도 게시기간 거부(404 은닉)를 전파", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue({
        id: "comment-1",
        authorId: REQUESTER.id,
        postId: teamPost.id,
        post: teamPost,
      });
      postsService.assertCommentablePostState.mockRejectedValue(
        new NotFoundException(),
      );
      await expect(
        service.deleteComment(REQUESTER, "comment-1", false, ROUTE_TEAM),
      ).rejects.toThrow(NotFoundException);
      expect(postsService.assertCommentablePostState).toHaveBeenCalledWith(
        REQUESTER,
        teamPost,
      );
      expect(prisma.teamPostComment.delete).not.toHaveBeenCalled();
    });

    it("게시기간 정책 허용 시 댓글 작성 정상 진행", async () => {
      prisma.teamPost.findUnique.mockResolvedValue(teamPost);
      prisma.teamPostComment.create.mockResolvedValue({ id: "comment-new" });
      prisma.teamPost.update.mockResolvedValue({});
      const result = await service.addCommentToPost(
        REQUESTER,
        teamPost.id,
        { content: "c" },
        ROUTE_TEAM,
      );
      expect(result).toEqual({ id: "comment-new" });
      expect(postsService.assertCommentablePostState).toHaveBeenCalledWith(
        REQUESTER,
        teamPost,
      );
    });
  });

  /**
   * [Codex R4 H-03] 레거시 경로에서 **실제 게시기간 판정**이 실행되는 것을 고정.
   * 위 위임 spec 은 helper 를 mock 주입으로 검증하므로 미래/만료 판정 자체는 돌지 않는다 —
   * 여기서는 실제 `assertCommentablePostState` 구현을 호출하되(관할 판정 `canManagePost` 만
   * mock — DB 의존 절단), 예약 전·만료 후 일반 사용자 404 은닉과 관할 관리자/게시글
   * 작성자 예외 허용을 레거시 댓글 경로 위에서 검증한다.
   */
  describe("레거시 댓글 경로 실제 게시기간 판정 (R4 H-03)", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const canManagePostMock = jest.fn();
    type CommentableStateFn =
      CommunityPostsService["assertCommentablePostState"];

    beforeEach(() => {
      canManagePostMock.mockReset().mockResolvedValue(false);
      const real: CommentableStateFn =
        CommunityPostsService.prototype.assertCommentablePostState;
      postsService.assertCommentablePostState.mockImplementation(
        (
          requester: Parameters<CommentableStateFn>[0],
          post: Parameters<CommentableStateFn>[1],
        ) =>
          real.call(
            {
              canManagePost: canManagePostMock,
            } as unknown as CommunityPostsService,
            requester,
            post,
          ),
      );
    });

    const teamWindowPost = (window: {
      startAt?: Date | null;
      expiresAt?: Date | null;
      authorId?: string;
    }) => ({
      id: "post-window",
      teamId: ROUTE_TEAM,
      targetClassId: null,
      targetTournamentId: null,
      isActive: true,
      authorId: window.authorId ?? "director-1",
      likeCount: 0,
      startAt: window.startAt ?? null,
      expiresAt: window.expiresAt ?? null,
    });

    it("미래 startAt — 일반 사용자 댓글 작성 404", async () => {
      prisma.teamPost.findUnique.mockResolvedValue(
        teamWindowPost({ startAt: new Date(Date.now() + DAY_MS) }),
      );
      await expect(
        service.addCommentToPost(
          REQUESTER,
          "post-window",
          { content: "c" },
          ROUTE_TEAM,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.teamPostComment.create).not.toHaveBeenCalled();
    });

    it("과거 expiresAt — 일반 사용자 댓글 수정 404", async () => {
      prisma.teamPostComment.findUnique.mockResolvedValue({
        id: "comment-1",
        authorId: REQUESTER.id,
        post: teamWindowPost({ expiresAt: new Date(Date.now() - DAY_MS) }),
      });
      await expect(
        service.updateComment(
          REQUESTER,
          "comment-1",
          { content: "c" },
          ROUTE_TEAM,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("게시기간 밖 — 관할 관리자는 댓글 삭제 허용", async () => {
      canManagePostMock.mockResolvedValue(true);
      prisma.teamPostComment.findUnique.mockResolvedValue({
        id: "comment-1",
        authorId: REQUESTER.id,
        postId: "post-window",
        post: teamWindowPost({ expiresAt: new Date(Date.now() - DAY_MS) }),
      });
      prisma.teamPostComment.delete.mockResolvedValue({});
      prisma.teamPost.update.mockResolvedValue({});
      await expect(
        service.deleteComment(REQUESTER, "comment-1", false, ROUTE_TEAM),
      ).resolves.toEqual({ deleted: true });
      expect(canManagePostMock).toHaveBeenCalled();
    });

    it("게시기간 밖 — 게시글 작성자는 댓글 작성 허용", async () => {
      prisma.teamPost.findUnique.mockResolvedValue(
        teamWindowPost({
          startAt: new Date(Date.now() + DAY_MS),
          authorId: REQUESTER.id,
        }),
      );
      prisma.teamPostComment.create.mockResolvedValue({ id: "comment-new" });
      prisma.teamPost.update.mockResolvedValue({});
      await expect(
        service.addCommentToPost(
          REQUESTER,
          "post-window",
          { content: "c" },
          ROUTE_TEAM,
        ),
      ).resolves.toEqual({ id: "comment-new" });
    });
  });
});
