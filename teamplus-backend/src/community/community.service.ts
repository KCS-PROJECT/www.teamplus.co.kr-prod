import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";
import {
  CreateTeamPostDto as CreateClubPostDto,
  UpdateTeamPostDto as UpdateClubPostDto,
} from "./dto/create-team-post.dto";
import {
  CreateTeamPostCommentDto as CreateClubPostCommentDto,
  UpdateTeamPostCommentDto as UpdateClubPostCommentDto,
} from "./dto/create-team-post-comment.dto";
import {
  CreateTeamEventDto as CreateClubEventDto,
  UpdateTeamEventDto as UpdateClubEventDto,
} from "./dto/create-team-event.dto";
import { RegisterTeamEventDto as RegisterClubEventDto } from "./dto/register-team-event.dto";
import { AddAttachmentDto } from "./dto/add-attachment.dto";
import {
  sanitizeStrict,
  sanitizeBasicHtml,
  sanitizeExtendedHtml,
} from "@/common/utils/sanitize.util";
import { NotificationsService } from "@/notifications/notifications.service";
import { isAdminRole } from "@/auth/constants/chldiv.constants";

export interface CommunityActor {
  id: string;
  userType?: string;
}

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewCounter: ViewCounterService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ===== Team Posts =====

  async getTeamPosts(
    teamId: string,
    requester: CommunityActor,
    limit = 20,
    postType?: string,
  ) {
    // 팀 멤버십(또는 관리 역할)만 게시판 열람 — 크로스-팀 노출 차단
    await this.assertTeamMember(requester, teamId);
    const userId = requester.id;

    const posts = await this.prisma.teamPost.findMany({
      where: {
        teamId: teamId,
        isActive: true,
        ...(postType && { postType }),
      },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            email: true,
            userType: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        attachments: {
          orderBy: { displayOrder: "asc" },
        },
        _count: {
          select: { comments: true, likes: true },
        },
      },
    });

    // 현재 사용자의 좋아요 여부 확인
    const postIds = posts.map((p) => p.id);
    const userLikes = await this.prisma.teamPostLike.findMany({
      where: { postId: { in: postIds }, userId },
      select: { postId: true },
    });
    const likedPostIds = new Set(userLikes.map((l) => l.postId));

    return posts.map((post) => ({
      ...post,
      likeCount: post._count.likes,
      commentCount: post._count.comments,
      isLikedByMe: likedPostIds.has(post.id),
    }));
  }

  async getTeamPostDetail(postId: string, requester: CommunityActor) {
    const userId = requester.id;
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            userType: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: {
                id: true,
                email: true,
                userType: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        attachments: {
          orderBy: { displayOrder: "asc" },
        },
        _count: {
          select: { likes: true, comments: true },
        },
      },
    });

    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    // 팀 멤버십(또는 관리 역할)만 상세 열람 — 크로스-팀 노출 차단
    await this.assertTeamMember(requester, post.teamId);

    // 1일 1회 조회수 증가
    const shouldIncrement = await this.viewCounter.tryIncrement({
      entityType: "club_post",
      entityId: postId,
      userId,
    });
    if (shouldIncrement) {
      await this.prisma.teamPost.update({
        where: { id: postId },
        data: { viewCount: { increment: 1 } },
      });
    }

    // 좋아요 여부 확인
    const userLike = await this.prisma.teamPostLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    return {
      ...post,
      likeCount: post._count.likes,
      commentCount: post._count.comments,
      isLikedByMe: !!userLike,
    };
  }

  async createTeamPost(
    requester: CommunityActor,
    teamId: string,
    dto: CreateClubPostDto,
  ) {
    const userId = requester.id;
    // 팀 존재 확인
    const club = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!club) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    // 관할 팀에만 게시 — COACH 는 owner/승인 코치인 팀만, ADMIN 등은 통과
    await this.assertTeamMember(requester, teamId);

    const post = await this.prisma.teamPost.create({
      data: {
        teamId: teamId,
        authorId: userId,
        title: sanitizeStrict(dto.title),
        content: sanitizeExtendedHtml(dto.content),
        postType: dto.postType ?? "announcement",
        targetLevel: dto.targetLevel,
        isPinned: dto.isPinned ?? false,
      },
    });

    // 첨부파일이 있으면 추가
    if (dto.attachments && dto.attachments.length > 0) {
      await this.prisma.teamPostAttachment.createMany({
        data: dto.attachments.map((att, index) => ({
          postId: post.id,
          fileUrl: att.fileUrl,
          fileName: att.fileName,
          fileType: att.fileType,
          fileSize: att.fileSize,
          displayOrder: index,
        })),
      });
    }

    // 팀 소속 학생의 학부모에게 푸시 (실패는 게시글 작성에 영향 없음)
    void this.notificationsService.notifyTeamParents(teamId, {
      notificationType: "team_post_created",
      title: "팀 공지",
      message: post.title,
      linkUrl: `/teams/${teamId}/posts/${post.id}`,
    });

    return this.getTeamPostDetail(post.id, requester);
  }

  async updateTeamPost(userId: string, postId: string, dto: UpdateClubPostDto) {
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
    });
    if (!post || !post.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    // 작성자 또는 관리자만 수정 가능 (관리자 체크는 컨트롤러에서)
    if (post.authorId !== userId) {
      throw new ForbiddenException("게시글 수정 권한이 없습니다.");
    }

    return this.prisma.teamPost.update({
      where: { id: postId },
      data: {
        ...(dto.title && { title: sanitizeStrict(dto.title) }),
        ...(dto.content && { content: sanitizeExtendedHtml(dto.content) }),
        ...(dto.postType && { postType: dto.postType }),
        ...(dto.targetLevel !== undefined && { targetLevel: dto.targetLevel }),
        ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            userType: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        attachments: { orderBy: { displayOrder: "asc" } },
      },
    });
  }

  async deleteTeamPost(userId: string, postId: string, isAdmin = false) {
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
    });
    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    if (!isAdmin && post.authorId !== userId) {
      throw new ForbiddenException("게시글 삭제 권한이 없습니다.");
    }

    // Soft delete
    return this.prisma.teamPost.update({
      where: { id: postId },
      data: { isActive: false },
    });
  }

  // ===== Likes =====

  async toggleLike(userId: string, postId: string) {
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
    });
    if (!post || !post.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    const existingLike = await this.prisma.teamPostLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existingLike) {
      // 좋아요 취소
      await this.prisma.teamPostLike.delete({
        where: { id: existingLike.id },
      });
      await this.prisma.teamPost.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      });
      return { liked: false, likeCount: post.likeCount - 1 };
    } else {
      // 좋아요 추가
      await this.prisma.teamPostLike.create({
        data: { postId, userId },
      });
      await this.prisma.teamPost.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      });
      return { liked: true, likeCount: post.likeCount + 1 };
    }
  }

  async getPostLikes(postId: string) {
    return this.prisma.teamPostLike.findMany({
      where: { postId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            userType: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ===== Attachments =====

  async addAttachment(userId: string, postId: string, dto: AddAttachmentDto) {
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
    });
    if (!post || !post.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException("첨부파일 추가 권한이 없습니다.");
    }

    // 현재 최대 displayOrder 조회
    const maxOrder = await this.prisma.teamPostAttachment.aggregate({
      where: { postId },
      _max: { displayOrder: true },
    });

    return this.prisma.teamPostAttachment.create({
      data: {
        postId,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
      },
    });
  }

  async deleteAttachment(userId: string, attachmentId: string) {
    const attachment = await this.prisma.teamPostAttachment.findUnique({
      where: { id: attachmentId },
      include: { post: true },
    });

    if (!attachment) {
      throw new NotFoundException("첨부파일을 찾을 수 없습니다.");
    }

    if (attachment.post.authorId !== userId) {
      throw new ForbiddenException("첨부파일 삭제 권한이 없습니다.");
    }

    return this.prisma.teamPostAttachment.delete({
      where: { id: attachmentId },
    });
  }

  // ===== Comments =====

  async addCommentToPost(
    userId: string,
    postId: string,
    dto: CreateClubPostCommentDto,
  ) {
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
    });
    if (!post || !post.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    const comment = await this.prisma.teamPostComment.create({
      data: {
        postId,
        authorId: userId,
        content: sanitizeBasicHtml(dto.content),
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            userType: true,
            avatarUrl: true,
          },
        },
      },
    });

    // 댓글 수 업데이트
    await this.prisma.teamPost.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });

    return comment;
  }

  async updateComment(
    userId: string,
    commentId: string,
    dto: UpdateClubPostCommentDto,
  ) {
    const comment = await this.prisma.teamPostComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("댓글 수정 권한이 없습니다.");
    }

    return this.prisma.teamPostComment.update({
      where: { id: commentId },
      data: {
        content: dto.content ? sanitizeBasicHtml(dto.content) : undefined,
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            userType: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async deleteComment(userId: string, commentId: string, isAdmin = false) {
    const comment = await this.prisma.teamPostComment.findUnique({
      where: { id: commentId },
      include: { post: true },
    });

    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    if (!isAdmin && comment.authorId !== userId) {
      throw new ForbiddenException("댓글 삭제 권한이 없습니다.");
    }

    await this.prisma.teamPostComment.delete({ where: { id: commentId } });

    // 댓글 수 업데이트
    await this.prisma.teamPost.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
    });

    return { deleted: true };
  }

  // ===== Team Events =====

  async getTeamEvents(teamId: string) {
    const now = new Date();
    return this.prisma.teamEvent.findMany({
      where: {
        teamId: teamId,
        status: { in: ["published", "closed"] },
        endAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // 어제까지만 잘라서 조회
      },
      orderBy: {
        startAt: "asc",
      },
    });
  }

  async getTeamEventDetail(eventId: string) {
    const event = await this.prisma.teamEvent.findUnique({
      where: { id: eventId },
      include: {
        registrations: {
          include: {
            member: {
              select: {
                id: true,
                playerName: true,
                playerAge: true,
                approvalStatus: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException("이벤트를 찾을 수 없습니다.");
    }

    return event;
  }

  async createTeamEvent(
    _userId: string,
    teamId: string,
    dto: CreateClubEventDto,
  ) {
    // 감독/관리자 여부는 RolesGuard 에서 1차 필터링, 여기서는 팀 존재만 확인
    const club = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!club) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (startAt >= endAt) {
      throw new BadRequestException(
        "시작 시간이 종료 시간보다 빠를 수 없습니다.",
      );
    }

    return this.prisma.teamEvent.create({
      data: {
        teamId: teamId,
        title: sanitizeStrict(dto.title),
        description: dto.description
          ? sanitizeExtendedHtml(dto.description)
          : undefined,
        eventType: dto.eventType,
        targetLevel: dto.targetLevel,
        capacity: dto.capacity,
        startAt,
        endAt,
        priceMode: dto.priceMode ?? "payment",
        priceAmount: dto.priceAmount,
        status: dto.status ?? "published",
      },
    });
  }

  async registerForEvent(
    requester: CommunityActor,
    teamId: string,
    eventId: string,
    dto: RegisterClubEventDto,
  ) {
    const event = await this.prisma.teamEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.teamId !== teamId) {
      throw new NotFoundException("이벤트를 찾을 수 없습니다.");
    }

    if (event.status !== "published") {
      throw new BadRequestException("현재 신청이 불가능한 이벤트입니다.");
    }

    // 인증 사용자가 memberId 의 본인/부모(또는 관할 코치·관리자)인지 검증 (IDOR 차단)
    await this.assertCanActForMember(requester, dto.memberId);

    // 팀 멤버인지 확인
    const member = await this.prisma.teamMember.findUnique({
      where: { id: dto.memberId },
    });
    if (!member || member.teamId !== teamId) {
      throw new BadRequestException("해당 팀의 회원만 신청할 수 있습니다.");
    }

    // 정원 체크 (capacity 가 있을 때만)
    if (event.capacity && event.capacity > 0) {
      const count = await this.prisma.teamEventRegistration.count({
        where: { eventId, status: { in: ["pending", "confirmed"] } },
      });
      if (count >= event.capacity) {
        throw new BadRequestException("정원이 초과되었습니다.");
      }
    }

    return this.prisma.teamEventRegistration.create({
      data: {
        eventId,
        memberId: dto.memberId,
        status: "pending",
        paid: false,
        memo: dto.memo ? sanitizeStrict(dto.memo) : undefined,
      },
    });
  }

  async cancelEventRegistration(
    requester: CommunityActor,
    eventId: string,
    memberId: string,
  ) {
    // 인증 사용자가 memberId 의 본인/부모(또는 관할 코치·관리자)인지 검증 (IDOR 차단)
    await this.assertCanActForMember(requester, memberId);

    const registration = await this.prisma.teamEventRegistration.findFirst({
      where: {
        eventId,
        memberId,
        status: { in: ["pending", "confirmed"] },
      },
    });

    if (!registration) {
      throw new NotFoundException("취소할 수 있는 신청 내역이 없습니다.");
    }

    return this.prisma.teamEventRegistration.update({
      where: { id: registration.id },
      data: {
        status: "cancelled",
      },
    });
  }

  async updateTeamEvent(eventId: string, dto: UpdateClubEventDto) {
    const event = await this.prisma.teamEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException("이벤트를 찾을 수 없습니다.");
    }

    const updateData: any = {};
    if (dto.title) updateData.title = sanitizeStrict(dto.title);
    if (dto.description !== undefined)
      updateData.description = dto.description
        ? sanitizeExtendedHtml(dto.description)
        : null;
    if (dto.eventType) updateData.eventType = dto.eventType;
    if (dto.targetLevel !== undefined) updateData.targetLevel = dto.targetLevel;
    if (dto.capacity !== undefined) updateData.capacity = dto.capacity;
    if (dto.startAt) updateData.startAt = new Date(dto.startAt);
    if (dto.endAt) updateData.endAt = new Date(dto.endAt);
    if (dto.priceMode) updateData.priceMode = dto.priceMode;
    if (dto.priceAmount !== undefined) updateData.priceAmount = dto.priceAmount;
    if (dto.status) updateData.status = dto.status;

    return this.prisma.teamEvent.update({
      where: { id: eventId },
      data: updateData,
      include: {
        registrations: {
          include: {
            member: {
              select: { id: true, playerName: true, playerAge: true },
            },
          },
        },
      },
    });
  }

  async deleteTeamEvent(eventId: string) {
    const event = await this.prisma.teamEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException("이벤트를 찾을 수 없습니다.");
    }

    // 신청자가 있으면 취소 처리
    await this.prisma.teamEventRegistration.updateMany({
      where: { eventId, status: { in: ["pending", "confirmed"] } },
      data: { status: "cancelled" },
    });

    return this.prisma.teamEvent.update({
      where: { id: eventId },
      data: { status: "cancelled" },
    });
  }

  // ===== Community Statistics =====

  async getCommunityStats(teamId: string) {
    const [postCount, eventCount, totalLikes, totalComments] =
      await Promise.all([
        this.prisma.teamPost.count({
          where: { teamId: teamId, isActive: true },
        }),
        this.prisma.teamEvent.count({
          where: { teamId: teamId, status: { in: ["published", "closed"] } },
        }),
        this.prisma.teamPost.aggregate({
          where: { teamId: teamId, isActive: true },
          _sum: { likeCount: true },
        }),
        this.prisma.teamPost.aggregate({
          where: { teamId: teamId, isActive: true },
          _sum: { commentCount: true },
        }),
      ]);

    return {
      postCount,
      eventCount,
      totalLikes: totalLikes._sum.likeCount ?? 0,
      totalComments: totalComments._sum.commentCount ?? 0,
    };
  }

  // ===== Access Control Helpers =====

  /**
   * [2026-06-12 SECURITY] 팀 게시판 멤버십 검증 (크로스-팀 노출/무단 게시 차단).
   *   ADMIN/SYSTEM/OPER/DIRECTOR/ACADEMY_DIRECTOR → 관리 역할로 크로스 접근 허용.
   *   그 외(COACH/PARENT/TEEN/CHILD)는 해당 teamId 의 승인된 본인 멤버이거나,
   *   학부모의 자녀가 그 팀의 승인된 선수일 때만 허용.
   */
  private async assertTeamMember(
    requester: CommunityActor | undefined,
    teamId: string,
  ): Promise<void> {
    if (!requester?.id) {
      throw new ForbiddenException("팀 게시판을 조회할 권한이 없습니다.");
    }
    if (
      isAdminRole(requester.userType) ||
      requester.userType === "DIRECTOR" ||
      requester.userType === "ACADEMY_DIRECTOR"
    ) {
      return;
    }

    // 본인이 해당 팀의 승인된 멤버(코치/선수/매니저 등)
    const ownMembership = await this.prisma.teamMember.findFirst({
      where: {
        userId: requester.id,
        teamId,
        approvalStatus: "approved",
        leftAt: null,
      },
      select: { id: true },
    });
    if (ownMembership) return;

    // 팀 owner(코치) 직접 매핑
    const teamOwner = await this.prisma.team.findFirst({
      where: { id: teamId, coachId: requester.id },
      select: { id: true },
    });
    if (teamOwner) return;

    // 학부모의 자녀가 해당 팀의 승인된 선수
    if (requester.userType === "PARENT") {
      const childMembership = await this.prisma.teamMember.findFirst({
        where: {
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          user: {
            childParents: { some: { parentId: requester.id } },
          },
        },
        select: { id: true },
      });
      if (childMembership) return;
    }

    throw new ForbiddenException("해당 팀의 게시판에 접근할 권한이 없습니다.");
  }

  /**
   * [2026-06-12 SECURITY] 이벤트 참가 신청/취소 시 memberId 소유권 검증 (IDOR 차단).
   *   ADMIN/SYSTEM/OPER/DIRECTOR/ACADEMY_DIRECTOR/COACH(해당 팀 관할) → 허용.
   *   그 외에는 member.userId 가 본인이거나 본인 자녀(parentChild)일 때만 허용.
   */
  private async assertCanActForMember(
    requester: CommunityActor | undefined,
    memberId: string,
  ): Promise<void> {
    if (!requester?.id) {
      throw new ForbiddenException("이벤트 참가를 처리할 권한이 없습니다.");
    }

    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
      select: { userId: true, teamId: true },
    });
    if (!member) {
      throw new NotFoundException("해당 팀의 회원을 찾을 수 없습니다.");
    }

    // 본인 명의
    if (member.userId === requester.id) return;

    // 조직 관리 역할
    if (
      isAdminRole(requester.userType) ||
      requester.userType === "DIRECTOR" ||
      requester.userType === "ACADEMY_DIRECTOR"
    ) {
      return;
    }

    // 부모-자녀 관계
    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: requester.id, childId: member.userId },
      },
      select: { id: true },
    });
    if (parentChild) return;

    // 해당 팀을 관할하는 코치(owner/승인 멤버)
    if (requester.userType === "COACH") {
      const [teamOwner, approvedCoach] = await Promise.all([
        this.prisma.team.findFirst({
          where: { id: member.teamId, coachId: requester.id },
          select: { id: true },
        }),
        this.prisma.teamMember.findFirst({
          where: {
            userId: requester.id,
            teamId: member.teamId,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
          },
          select: { id: true },
        }),
      ]);
      if (teamOwner || approvedCoach) return;
    }

    throw new ForbiddenException(
      "해당 회원의 이벤트 참가를 처리할 권한이 없습니다.",
    );
  }
}
