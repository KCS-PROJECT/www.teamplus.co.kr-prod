import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";
import { NotificationsService } from "@/notifications/notifications.service";
import {
  sanitizeBasicHtml,
  sanitizeExtendedHtml,
  sanitizeStrict,
} from "@/common/utils/sanitize.util";
import { maskProfanity } from "@/common/utils/content-filter.util";
import { resolveViewerTeamIds } from "@/common/utils/team-scope.util";
import {
  isNoticeSystemRole,
  resolveNoticeManageTeamIds,
} from "@/notices/utils/notice-manage-scope.util";
import { resolveManagedContentScope } from "./utils/content-scope.util";
import {
  CreateUnitCommentDto,
  CreateUnitPostDto,
  UNIT_NOTICE_IMAGE_MAX_COUNT,
  UnitNoticeAttachmentDto,
  UpdateUnitCommentDto,
  UpdateUnitPostDto,
} from "./dto/unit-notice.dto";
import { CommunityActor } from "./community.types";

/** 축 판정에 필요한 최소 스코프 필드 */
interface PostScope {
  id: string;
  teamId: string | null;
  targetClassId: string | null;
  targetTournamentId: string | null;
}

interface PublicationWindow {
  isActive: boolean;
  startAt: Date | null;
  expiresAt: Date | null;
}

const AUTHOR_SELECT = {
  id: true,
  userType: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
} as const;

/** 미읽음 재알림 쿨다운 — 게시글당 24시간 1회 (알림 스팸 방지) */
const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * 수업/대회 단위 공지 스트림 서비스 (Phase 1).
 * 설계 SoT: claudedocs/unit-notice-stream-design-2026-08-19.md v1.2.3
 *
 * 축 배타(teamId | targetClassId | targetTournamentId 정확히 1개) 위에서
 * 발행·열람·읽음 N/M·댓글·즉시 알림을 담당한다.
 * 기존 팀 게시판 경로(community.service)의 좋아요/댓글 IDOR 도 여기의
 * assertCanViewPost 를 공용으로 사용한다.
 */
@Injectable()
export class CommunityPostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewCounter: ViewCounterService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ==================== 노출 판정 ====================

  /** 팀 공지(SystemNotice)와 동일한 게시 경계 — expiresAt 은 >= (종료 경계 포함) */
  private isWithinWindow(row: PublicationWindow, now = new Date()): boolean {
    return (
      row.isActive &&
      (!row.startAt || row.startAt <= now) &&
      (!row.expiresAt || row.expiresAt >= now)
    );
  }

  // ==================== 축/권한 판정 ====================

  private async getPostScope(postId: string): Promise<
    PostScope & PublicationWindow & { authorId: string }
  > {
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        teamId: true,
        targetClassId: true,
        targetTournamentId: true,
        authorId: true,
        isActive: true,
        startAt: true,
        expiresAt: true,
      },
    });
    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }
    return post;
  }

  /** 학부모의 자녀 userId + 본인 — 수업/대회 등록 주체 후보 집합 */
  private async resolveSelfAndChildIds(userId: string): Promise<string[]> {
    const children = await this.prisma.parentChild.findMany({
      where: { parentId: userId },
      select: { childId: true },
    });
    return [userId, ...children.map((c) => c.childId)];
  }

  /**
   * 해당 단위(수업)를 관리하는지 — 쓰기 권한 판정 (§5).
   * 팀 수업 = 관할 팀 ∪ ClassCoachAssignment(ACCEPTED),
   * 오픈클래스 = Academy.directorId ∪ AcademyCoach(isActive).
   */
  private async canManageClass(
    requester: CommunityActor,
    classId: string,
  ): Promise<boolean> {
    if (isNoticeSystemRole(requester.userType)) return true;
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { teamId: true, academyId: true },
    });
    if (!cls) return false;

    if (cls.teamId) {
      const managed = await resolveNoticeManageTeamIds(
        this.prisma,
        requester.id,
        requester.userType,
      );
      if (managed.includes(cls.teamId)) return true;
    }
    if (cls.academyId) {
      const [owned, coach] = await Promise.all([
        this.prisma.academy.findFirst({
          where: { id: cls.academyId, directorId: requester.id },
          select: { id: true },
        }),
        this.prisma.academyCoach.findFirst({
          where: {
            academyId: cls.academyId,
            userId: requester.id,
            isActive: true,
          },
          select: { id: true },
        }),
      ]);
      if (owned || coach) return true;
    }
    const assignment = await this.prisma.classCoachAssignment.findFirst({
      where: { classId, coachUserId: requester.id, status: "ACCEPTED" },
      select: { id: true },
    });
    return !!assignment;
  }

  private async canManageTournament(
    requester: CommunityActor,
    tournamentId: string,
  ): Promise<boolean> {
    if (isNoticeSystemRole(requester.userType)) return true;
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { teamId: true },
    });
    if (!tournament?.teamId) return false;
    const managed = await resolveNoticeManageTeamIds(
      this.prisma,
      requester.id,
      requester.userType,
    );
    return managed.includes(tournament.teamId);
  }

  private async canManageTeam(
    requester: CommunityActor,
    teamId: string,
  ): Promise<boolean> {
    if (isNoticeSystemRole(requester.userType)) return true;
    const managed = await resolveNoticeManageTeamIds(
      this.prisma,
      requester.id,
      requester.userType,
    );
    return managed.includes(teamId);
  }

  /** 게시글 축 기준 관리(수정·삭제·읽음 요약·댓글 moderation) 가능 여부 */
  async canManagePost(
    requester: CommunityActor,
    scope: PostScope,
  ): Promise<boolean> {
    if (scope.targetClassId) {
      return this.canManageClass(requester, scope.targetClassId);
    }
    if (scope.targetTournamentId) {
      return this.canManageTournament(requester, scope.targetTournamentId);
    }
    if (scope.teamId) {
      return this.canManageTeam(requester, scope.teamId);
    }
    return isNoticeSystemRole(requester.userType);
  }

  /**
   * 축별 열람 검증 (IDOR 차단 공용 — 기존 like/댓글 경로도 이 판정을 사용).
   * 404 은닉: 권한 없는 사용자에게 존재를 확인시켜 주지 않는다.
   */
  async assertCanViewPost(
    requester: CommunityActor,
    scope: PostScope,
  ): Promise<void> {
    const canView = await this.canViewPost(requester, scope);
    if (!canView) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }
  }

  private async canViewPost(
    requester: CommunityActor | undefined,
    scope: PostScope,
  ): Promise<boolean> {
    if (!requester?.id) return false;
    if (isNoticeSystemRole(requester.userType)) return true;

    if (scope.targetClassId) {
      if (await this.canManageClass(requester, scope.targetClassId)) {
        return true;
      }
      const memberIds = await this.resolveSelfAndChildIds(requester.id);
      const registration = await this.prisma.classRegistration.findFirst({
        where: {
          classId: scope.targetClassId,
          status: "active",
          userId: { in: memberIds },
        },
        select: { id: true },
      });
      return !!registration;
    }

    if (scope.targetTournamentId) {
      if (await this.canManageTournament(requester, scope.targetTournamentId)) {
        return true;
      }
      const registration = await this.findEligibleTournamentRegistration(
        scope.targetTournamentId,
        requester.id,
      );
      return !!registration;
    }

    if (scope.teamId) {
      const viewerTeamIds = await resolveViewerTeamIds(
        this.prisma,
        requester.id,
        requester.userType,
      );
      return viewerTeamIds.includes(scope.teamId);
    }

    return false;
  }

  /**
   * 대회 신청 완료 판정 — PENDING 이중 의미 함정: 선불 PENDING=결제 이탈(미완료),
   * 후불 UNPAID/PENDING=정상 참가(정산 전/청구). billingMode 분기 필수.
   */
  private tournamentEligibleWhere(
    billingMode: string,
  ): Prisma.TournamentRegistrationWhereInput {
    return {
      cancelledAt: null,
      paymentStatus:
        billingMode === "PREPAID"
          ? "PAID"
          : { notIn: ["CANCELLED", "REFUNDED"] },
    };
  }

  private async findEligibleTournamentRegistration(
    tournamentId: string,
    userId: string,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { billingMode: true },
    });
    if (!tournament) return null;
    return this.prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId,
        userId,
        ...this.tournamentEligibleWhere(tournament.billingMode),
      },
      select: { id: true },
    });
  }

  // ==================== 수신자 산출 (§5) ====================

  /**
   * 수업 수신자: ClassRegistration(active) → userId → ParentChild → parentId dedupe.
   * 학부모가 없는 등록 주체(성인)는 본인. WITHDRAWN 계정 제외.
   */
  private async resolveClassRecipients(classId: string): Promise<string[]> {
    const registrations = await this.prisma.classRegistration.findMany({
      where: { classId, status: "active" },
      select: { userId: true },
    });
    const memberIds = Array.from(new Set(registrations.map((r) => r.userId)));
    if (memberIds.length === 0) return [];

    const parentLinks = await this.prisma.parentChild.findMany({
      where: { childId: { in: memberIds } },
      select: { parentId: true, childId: true },
    });
    const childrenWithParents = new Set(parentLinks.map((l) => l.childId));
    const candidates = new Set<string>(parentLinks.map((l) => l.parentId));
    for (const memberId of memberIds) {
      if (!childrenWithParents.has(memberId)) candidates.add(memberId); // 성인 본인
    }
    return this.filterActiveUserIds(Array.from(candidates));
  }

  /** 대회 수신자: 신청 완료자(billingMode 분기) — 신청 주체(userId)=학부모/성인 본인 */
  private async resolveTournamentRecipients(
    tournamentId: string,
  ): Promise<string[]> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { billingMode: true },
    });
    if (!tournament) return [];
    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        ...this.tournamentEligibleWhere(tournament.billingMode),
      },
      select: { userId: true },
    });
    return this.filterActiveUserIds(
      Array.from(new Set(registrations.map((r) => r.userId))),
    );
  }

  private async filterActiveUserIds(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        status: { not: "WITHDRAWN" },
        deletedAt: null,
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async resolveRecipients(scope: PostScope): Promise<string[]> {
    // 팀 축 — 목록(managed)과 동일한 분모 규칙(멤버∪학부모∪감독)을 배치 해석기
    // 재사용으로 보장한다. 누락 시 상세 읽음 현황·재알림이 수신자 0(0/0)이 된다.
    if (scope.teamId) {
      const map = await this.resolveTeamRecipientsMap([scope.teamId]);
      return map.get(scope.teamId) ?? [];
    }
    if (scope.targetClassId) {
      return this.resolveClassRecipients(scope.targetClassId);
    }
    if (scope.targetTournamentId) {
      return this.resolveTournamentRecipients(scope.targetTournamentId);
    }
    return [];
  }

  /**
   * [Codex R1 M-04] 수업 수신자 일괄 산출 — 단위 수에 비례해 resolver 를 반복하던
   * N+1(관리 목록에서 단위 30개 ≈ 90쿼리)을 고정 3쿼리로 대체. 규칙은 단건과 동일.
   */
  private async resolveClassRecipientsMap(
    classIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    classIds.forEach((id) => map.set(id, []));
    if (classIds.length === 0) return map;

    const registrations = await this.prisma.classRegistration.findMany({
      where: { classId: { in: classIds }, status: "active" },
      select: { classId: true, userId: true },
    });
    const memberIds = Array.from(new Set(registrations.map((r) => r.userId)));
    if (memberIds.length === 0) return map;

    const parentLinks = await this.prisma.parentChild.findMany({
      where: { childId: { in: memberIds } },
      select: { parentId: true, childId: true },
    });
    const parentsByChild = new Map<string, string[]>();
    for (const link of parentLinks) {
      if (!parentsByChild.has(link.childId)) {
        parentsByChild.set(link.childId, []);
      }
      parentsByChild.get(link.childId)!.push(link.parentId);
    }

    const candidateSet = new Set<string>();
    for (const reg of registrations) {
      const parents = parentsByChild.get(reg.userId);
      if (parents?.length) parents.forEach((p) => candidateSet.add(p));
      else candidateSet.add(reg.userId); // 성인 본인
    }
    const activeIds = new Set(
      await this.filterActiveUserIds(Array.from(candidateSet)),
    );

    for (const reg of registrations) {
      const recipients = new Set(map.get(reg.classId) ?? []);
      const parents = parentsByChild.get(reg.userId);
      if (parents?.length) {
        parents.forEach((p) => activeIds.has(p) && recipients.add(p));
      } else if (activeIds.has(reg.userId)) {
        recipients.add(reg.userId);
      }
      map.set(reg.classId, Array.from(recipients));
    }
    return map;
  }

  /** [Codex R1 M-04] 대회 수신자 일괄 산출 — billingMode 분기 규칙은 단건과 동일 */
  private async resolveTournamentRecipientsMap(
    tournamentIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    tournamentIds.forEach((id) => map.set(id, []));
    if (tournamentIds.length === 0) return map;

    const tournaments = await this.prisma.tournament.findMany({
      where: { id: { in: tournamentIds } },
      select: { id: true, billingMode: true },
    });
    const prepaidIds = tournaments
      .filter((t) => t.billingMode === "PREPAID")
      .map((t) => t.id);
    const postpaidIds = tournaments
      .filter((t) => t.billingMode !== "PREPAID")
      .map((t) => t.id);

    const or: Prisma.TournamentRegistrationWhereInput[] = [];
    if (prepaidIds.length > 0) {
      or.push({ tournamentId: { in: prepaidIds }, paymentStatus: "PAID" });
    }
    if (postpaidIds.length > 0) {
      or.push({
        tournamentId: { in: postpaidIds },
        paymentStatus: { notIn: ["CANCELLED", "REFUNDED"] },
      });
    }
    if (or.length === 0) return map;

    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: { cancelledAt: null, OR: or },
      select: { tournamentId: true, userId: true },
    });
    const activeIds = new Set(
      await this.filterActiveUserIds(
        Array.from(new Set(registrations.map((r) => r.userId))),
      ),
    );
    for (const reg of registrations) {
      if (!activeIds.has(reg.userId)) continue;
      const recipients = new Set(map.get(reg.tournamentId) ?? []);
      recipients.add(reg.userId);
      map.set(reg.tournamentId, Array.from(recipients));
    }
    return map;
  }

  /**
   * [Phase 2] 팀 공지 수신자: 팀 전체 수신 풀 — 직접 멤버 ∪ 멤버(자녀)의 학부모 ∪
   * 팀 소유 감독(Team.coachId). 알림 발송 풀(notifyTeamAudience)과 동일 기준으로
   * 읽음 N/M 의 분모 M 을 일치시킨다. WITHDRAWN 제외.
   */
  private async resolveTeamRecipientsMap(
    teamIds: string[],
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, Set<string>>();
    teamIds.forEach((id) => map.set(id, new Set()));
    if (teamIds.length === 0) return new Map();

    const [members, teams] = await Promise.all([
      this.prisma.teamMember.findMany({
        where: {
          teamId: { in: teamIds },
          approvalStatus: "approved",
          leftAt: null,
          user: { status: { not: "WITHDRAWN" } },
        },
        select: { teamId: true, userId: true },
      }),
      this.prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, coachId: true },
      }),
    ]);

    const childIds = Array.from(new Set(members.map((m) => m.userId)));
    const links =
      childIds.length > 0
        ? await this.prisma.parentChild.findMany({
            where: {
              childId: { in: childIds },
              parent: { status: { not: "WITHDRAWN" } },
            },
            select: { childId: true, parentId: true },
          })
        : [];
    const parentsByChild = new Map<string, string[]>();
    for (const link of links) {
      if (!parentsByChild.has(link.childId)) {
        parentsByChild.set(link.childId, []);
      }
      parentsByChild.get(link.childId)!.push(link.parentId);
    }

    for (const member of members) {
      const set = map.get(member.teamId);
      if (!set) continue;
      set.add(member.userId);
      for (const parentId of parentsByChild.get(member.userId) ?? []) {
        set.add(parentId);
      }
    }
    for (const team of teams) {
      if (team.coachId) map.get(team.id)?.add(team.coachId);
    }
    return new Map(
      Array.from(map, ([id, set]) => [id, Array.from(set)] as const),
    );
  }

  // ==================== 작성 ====================

  async createPost(requester: CommunityActor, dto: CreateUnitPostDto) {
    // 축 배타 — DB CHECK(num_nonnulls=1)와 동일 판정을 코드에서 선행
    const axes = [dto.teamId, dto.targetClassId, dto.targetTournamentId].filter(
      (v) => typeof v === "string" && v.trim().length > 0,
    );
    if (axes.length !== 1) {
      throw new BadRequestException(
        "공지 대상(팀·훈련·대회)은 정확히 하나만 지정해야 합니다.",
      );
    }

    // 축별 쓰기 권한 + 대상 상태 검증
    if (dto.targetClassId) {
      const cls = await this.prisma.class.findUnique({
        where: { id: dto.targetClassId },
        select: { id: true, endedAt: true, isActive: true },
      });
      if (!cls || !cls.isActive) {
        throw new NotFoundException("수업을 찾을 수 없습니다.");
      }
      if (cls.endedAt) {
        throw new BadRequestException(
          "종료된 수업에는 공지를 등록할 수 없습니다.",
        );
      }
      if (!(await this.canManageClass(requester, dto.targetClassId))) {
        throw new ForbiddenException(
          "해당 수업의 공지를 작성할 권한이 없습니다.",
        );
      }
    } else if (dto.targetTournamentId) {
      const tournament = await this.prisma.tournament.findUnique({
        where: { id: dto.targetTournamentId },
        select: { id: true, status: true },
      });
      if (!tournament || tournament.status === "cancelled") {
        throw new NotFoundException("대회를 찾을 수 없습니다.");
      }
      if (
        !(await this.canManageTournament(requester, dto.targetTournamentId))
      ) {
        throw new ForbiddenException(
          "해당 대회의 공지를 작성할 권한이 없습니다.",
        );
      }
    } else if (dto.teamId) {
      if (!(await this.canManageTeam(requester, dto.teamId))) {
        throw new ForbiddenException("해당 팀에 게시할 권한이 없습니다.");
      }
    }

    const now = new Date();
    const startAt = dto.startAt ? new Date(dto.startAt) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (startAt && expiresAt && startAt > expiresAt) {
      throw new BadRequestException(
        "게시 시작이 만료 시점보다 늦을 수 없습니다.",
      );
    }
    // 즉시 게시(생성 시점에 게시 중)만 생성 시 claim+푸시.
    // 예약(startAt 미래)은 claim·푸시 없음 — 도래 시 노출만 자동 (AC 3-11 계약 동일).
    const isPushablePublication = this.isWithinWindow(
      { isActive: true, startAt, expiresAt },
      now,
    );

    // [Codex R1 H-07] 게시글+첨부 메타를 단일 트랜잭션으로 — 첨부 저장 실패 시
    // 게시글·알림 claim 이 홀로 남아 재시도 중복 게시글이 생기던 경로 차단.
    // 알림은 commit 성공 후에만 발송한다.
    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.teamPost.create({
        data: {
          teamId: dto.teamId ?? null,
          targetClassId: dto.targetClassId ?? null,
          targetTournamentId: dto.targetTournamentId ?? null,
          authorId: requester.id,
          title: maskProfanity(sanitizeStrict(dto.title)),
          content: maskProfanity(sanitizeExtendedHtml(dto.content)),
          postType: "announcement",
          isPinned: dto.isPinned ?? false,
          startAt,
          expiresAt,
          publishedNotifiedAt: isPushablePublication ? now : null,
        },
      });
      if (dto.attachments && dto.attachments.length > 0) {
        await tx.teamPostAttachment.createMany({
          data: dto.attachments.map((att, index) => ({
            postId: created.id,
            fileUrl: att.fileUrl,
            fileName: att.fileName,
            fileType: att.fileType,
            fileSize: att.fileSize,
            displayOrder: index,
          })),
        });
      }
      return created;
    });

    if (isPushablePublication) {
      this.sendPublishNotification(post, requester.id);
    }

    return this.getPostDetail(requester, post.id);
  }

  /**
   * 게시 알림 (claim 소진 후 commit 뒤 호출 — exactly-once 는 publishedNotifiedAt 이 보장).
   * 실제 전달은 best-effort — 실패해도 claim 을 되돌리거나 재발송하지 않는다.
   */
  private sendPublishNotification(
    post: PostScope & { title: string },
    actorUserId: string,
  ): void {
    const linkUrl = `/community-notice/${post.id}`;
    if (post.teamId) {
      void this.notificationsService.notifyTeamAudience(
        post.teamId,
        {
          notificationType: "team_post_created",
          title: "팀 공지",
          message: post.title,
          linkUrl,
        },
        { excludeUserIds: [actorUserId] },
      );
      return;
    }
    void (async () => {
      try {
        const recipients = await this.resolveRecipients(post);
        const targets = recipients.filter((id) => id !== actorUserId);
        if (targets.length === 0) return;
        await this.notificationsService.notifyUsers(targets, {
          notificationType: post.targetClassId
            ? "notice_class_created"
            : "notice_tournament_created",
          // 용어: 웹 BottomNav "훈련/대회" 탭과 동일 — "수업"은 결제·수강 문맥 표기
          title: post.targetClassId ? "훈련 공지" : "대회 공지",
          message: post.title,
          linkUrl,
        });
      } catch {
        // best-effort — 게시 자체에 영향 없음
      }
    })();
  }

  // ==================== 조회 ====================

  /**
   * 단위 스트림 목록 — classId | tournamentId | teamId 중 1개 필수.
   *
   * [2026-08-20 사용자 확정 — 404 은닉의 목록 한정 예외] 비열람자는 404 대신 **빈 배열**.
   * 상세 블록이 "공지 0건 열람자"와 동일하게 숨김 처리되므로 은닉 효과는 동등하고
   * (권한 없음 ↔ 0건 구분 불가), 미등록 학부모의 상세 페이지 탐색마다 에러가 쌓이지
   * 않는다. 상세·댓글·읽음 등 id 지정 경로는 404 은닉 유지 (IDOR 계약 그대로).
   */
  async getPosts(
    requester: CommunityActor,
    query: { classId?: string; tournamentId?: string; teamId?: string },
    limit = 30,
  ) {
    const axes = [query.classId, query.tournamentId, query.teamId].filter(
      (v) => typeof v === "string" && v.length > 0,
    );
    if (axes.length !== 1) {
      throw new BadRequestException(
        "classId, tournamentId, teamId 중 하나를 지정해주세요.",
      );
    }

    const scope: PostScope = {
      id: "",
      teamId: query.teamId ?? null,
      targetClassId: query.classId ?? null,
      targetTournamentId: query.tournamentId ?? null,
    };
    if (!(await this.canViewPost(requester, scope))) {
      return [];
    }
    const isManager = await this.canManagePost(requester, scope);

    const now = new Date();
    const where: Prisma.TeamPostWhereInput = {
      isActive: true,
      postType: "announcement",
      ...(query.classId && { targetClassId: query.classId }),
      ...(query.tournamentId && { targetTournamentId: query.tournamentId }),
      ...(query.teamId && { teamId: query.teamId }),
      // 관리자는 예약/만료 포함 전체, 열람자는 게시 중만
      ...(!isManager && {
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
      }),
    };

    const posts = await this.prisma.teamPost.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: Math.min(Math.max(limit, 1), 100),
      include: {
        author: { select: AUTHOR_SELECT },
        attachments: { orderBy: { displayOrder: "asc" } },
        _count: { select: { comments: true } },
      },
    });

    const readSet = new Set(
      (
        await this.prisma.teamPostRead.findMany({
          where: {
            postId: { in: posts.map((p) => p.id) },
            userId: requester.id,
          },
          select: { postId: true },
        })
      ).map((r) => r.postId),
    );

    return posts.map((post) => ({
      ...this.mapPost(post, now),
      commentCount: post._count.comments,
      isReadByMe: readSet.has(post.id),
    }));
  }

  /** 감독·코치 통합 공지함 — 관할 팀+수업+대회 공지 (읽음 N/M 포함 · Phase 2 팀 축 편입) */
  async getManagedPosts(
    requester: CommunityActor,
    axis?: "team" | "class" | "tournament" | "unit",
    limit = 30,
    offset = 0,
    status?: "ongoing" | "expired",
  ) {
    // [Codex P2-R1-M01] 'unit'(=class+tournament) 은 서버 필터 — 클라이언트 제외 방식은
    //   팀 공지가 limit 상위를 차지하면 훈련·대회 공지가 잠식된다.
    const includeAxis = (a: "team" | "class" | "tournament") =>
      axis === undefined || axis === a || (axis === "unit" && a !== "team");
    const or: Prisma.TeamPostWhereInput[] = [];
    if (isNoticeSystemRole(requester.userType)) {
      // [Codex R1 H-06] 시스템 역할 전면 통과 — 개별 canManage 와 동일하게
      // 통합 목록도 전역(모든 단위 공지)으로 일치시킨다.
      if (includeAxis("team")) or.push({ teamId: { not: null } });
      if (includeAxis("class")) or.push({ targetClassId: { not: null } });
      if (includeAxis("tournament")) {
        or.push({ targetTournamentId: { not: null } });
      }
    } else {
      const scope = await resolveManagedContentScope(
        this.prisma,
        requester.id,
        requester.userType,
      );
      if (includeAxis("team") && scope.teamIds.length > 0) {
        or.push({ teamId: { in: scope.teamIds } });
      }
      if (includeAxis("class") && scope.classIds.length > 0) {
        or.push({ targetClassId: { in: scope.classIds } });
      }
      if (includeAxis("tournament") && scope.tournamentIds.length > 0) {
        or.push({ targetTournamentId: { in: scope.tournamentIds } });
      }
    }
    if (or.length === 0) return { data: [], total: 0 };

    const now = new Date();
    const managedWhere: Prisma.TeamPostWhereInput = {
      isActive: true,
      postType: "announcement",
      OR: or,
      // 상태 필터 — 만료 구분(서버 where: 클라 필터는 로드된 페이지에만 적용돼 부정확).
      //   ongoing = 미만료(예약 포함) · expired = 종료일 경과. 생략 시 전체.
      ...(status === "ongoing" && {
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
      }),
      ...(status === "expired" && { expiresAt: { lt: now } }),
    };
    const total = await this.prisma.teamPost.count({ where: managedWhere });
    const posts = await this.prisma.teamPost.findMany({
      where: managedWhere,
      // [Codex P2-R3 M01] offset 페이지라 createdAt 동률 시 순서가 비결정 —
      //   id desc 3차 키로 안정화해 페이지 경계 중복·누락을 막는다 (feed 동일)
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(limit, 1), 100),
      skip: Math.max(offset, 0),
      include: {
        author: { select: AUTHOR_SELECT },
        team: { select: { id: true, name: true } },
        targetClass: { select: { id: true, className: true } },
        targetTournament: { select: { id: true, name: true } },
        attachments: { orderBy: { displayOrder: "asc" } },
        _count: { select: { comments: true } },
      },
    });

    // 읽음 N/M — 수신자 집합을 축별 **일괄 쿼리**로 산출 (M-04: 단위 수 비례 N+1 제거)
    const classIds = Array.from(
      new Set(posts.map((p) => p.targetClassId).filter(Boolean) as string[]),
    );
    const tournamentIds = Array.from(
      new Set(
        posts.map((p) => p.targetTournamentId).filter(Boolean) as string[],
      ),
    );
    const postTeamIds = Array.from(
      new Set(posts.map((p) => p.teamId).filter(Boolean) as string[]),
    );
    const [classRecipients, tournamentRecipients, teamRecipients] =
      await Promise.all([
        this.resolveClassRecipientsMap(classIds),
        this.resolveTournamentRecipientsMap(tournamentIds),
        this.resolveTeamRecipientsMap(postTeamIds),
      ]);
    const recipientMap = new Map<string, string[]>();
    for (const [id, list] of classRecipients) {
      recipientMap.set(`class:${id}`, list);
    }
    for (const [id, list] of tournamentRecipients) {
      recipientMap.set(`tournament:${id}`, list);
    }
    for (const [id, list] of teamRecipients) {
      recipientMap.set(`team:${id}`, list);
    }

    const reads = await this.prisma.teamPostRead.findMany({
      where: { postId: { in: posts.map((p) => p.id) } },
      select: { postId: true, userId: true },
    });
    const readsByPost = new Map<string, Set<string>>();
    for (const read of reads) {
      if (!readsByPost.has(read.postId)) {
        readsByPost.set(read.postId, new Set());
      }
      readsByPost.get(read.postId)!.add(read.userId);
    }

    return {
      total,
      data: posts.map((post) => {
        const recipientKey = post.teamId
          ? `team:${post.teamId}`
          : post.targetClassId
            ? `class:${post.targetClassId}`
            : `tournament:${post.targetTournamentId}`;
        const recipients = recipientMap.get(recipientKey) ?? [];
        const readSet = readsByPost.get(post.id) ?? new Set<string>();
        const readCount = recipients.filter((id) => readSet.has(id)).length;

        return {
          ...this.mapPost(post, now),
          commentCount: post._count.comments,
          targetName:
            post.team?.name ??
            post.targetClass?.className ??
            post.targetTournament?.name ??
            null,
          readCount,
          recipientCount: recipients.length,
        };
      }),
    };
  }

  /**
   * [Phase 2 §4.5] 통합 feed — 대시보드 탭 A 단일 소스 (팀+수업+대회 · 게시 중만).
   * 표시 스코프 = childId 필터(학부모 선택 자녀 — 팀·수업·대회 3축 일관), **열람 권한 =
   * 전 자녀 합집합**(푸시 딥링크 403/404 금지는 상세 열람 검증이 담당 — v1.2.2).
   * 감독·코치·오픈클래스 감독은 관할(쓰기 스코프)을 합집합 — 자기 단위 공지도 함께 본다.
   */
  async getFeed(
    requester: CommunityActor,
    opts: { childId?: string; limit?: number; offset?: number } = {},
  ) {
    // [Codex P2-R1-M01] offset + total — limit 상한(50)에 갇혀 51번째 이후가
    //   영구 미노출되지 않도록 페이지 계약을 제공한다.
    const limit = Math.min(Math.max(opts.limit ?? 5, 1), 50);
    const offset = Math.max(opts.offset ?? 0, 0);
    const now = new Date();
    const or: Prisma.TeamPostWhereInput[] = [];
    // 단위별 "이 공지를 보게 만든 참가 자녀 이름" — 학부모 목록의 대상 칩용.
    //   자녀 등록/신청으로 매칭된 항목에만 채워진다 (관할·본인 열람은 빈 배열).
    const classChildNames = new Map<string, string[]>();
    const tournamentChildNames = new Map<string, string[]>();

    if (isNoticeSystemRole(requester.userType)) {
      or.push(
        { teamId: { not: null } },
        { targetClassId: { not: null } },
        { targetTournamentId: { not: null } },
      );
    } else {
      // 팀 축 — 열람 팀 (resolveViewerTeamIds 가 childId 표시 필터 지원)
      const viewerTeamIds = await resolveViewerTeamIds(
        this.prisma,
        requester.id,
        requester.userType,
        opts.childId ? { childId: opts.childId } : undefined,
      );
      // 수업 축 — 본인+자녀 등록. childId 지정 시 내 자녀인지 교집합 검증(타인 자녀 IDOR 차단)
      const childLinks = await this.prisma.parentChild.findMany({
        where: { parentId: requester.id },
        select: {
          childId: true,
          child: { select: { firstName: true, lastName: true } },
        },
      });
      const childNameById = new Map(
        childLinks.map((l) => [
          l.childId,
          `${l.child?.lastName ?? ""}${l.child?.firstName ?? ""}`.trim(),
        ]),
      );
      let memberIds = [requester.id, ...childLinks.map((l) => l.childId)];
      if (opts.childId) {
        memberIds = memberIds.includes(opts.childId) ? [opts.childId] : [];
      }
      const classRegs =
        memberIds.length > 0
          ? await this.prisma.classRegistration.findMany({
              where: { status: "active", userId: { in: memberIds } },
              select: { classId: true, userId: true },
            })
          : [];
      for (const reg of classRegs) {
        const name = childNameById.get(reg.userId);
        if (!name) continue; // 본인 등록(성인) 등 자녀 아님
        const names = classChildNames.get(reg.classId) ?? [];
        if (!names.includes(name)) names.push(name);
        classChildNames.set(reg.classId, names);
      }
      // 대회 축 — 신청 완료 (PENDING 이중 의미: PREPAID=PAID만 · POSTPAID=취소/환불 제외)
      //   [Codex P2-R1-H05] childId 표시 필터는 대회 축에도 적용 —
      //   TournamentRegistration.childId 로 선택 자녀의 신청만 남긴다
      //   (userId=requester 조건과 결합되어 타인 자녀 지정은 자연히 0건).
      const tournamentRegs =
        await this.prisma.tournamentRegistration.findMany({
          where: {
            userId: requester.id,
            ...(opts.childId ? { childId: opts.childId } : {}),
            cancelledAt: null,
            paymentStatus: { notIn: ["CANCELLED", "REFUNDED"] },
          },
          select: {
            tournamentId: true,
            childId: true,
            paymentStatus: true,
            tournament: { select: { billingMode: true } },
          },
        });
      const eligibleTournamentRegs = tournamentRegs.filter((r) =>
        r.tournament.billingMode === "PREPAID"
          ? r.paymentStatus === "PAID"
          : true,
      );
      const eligibleTournamentIds = eligibleTournamentRegs.map(
        (r) => r.tournamentId,
      );
      for (const reg of eligibleTournamentRegs) {
        const name = reg.childId ? childNameById.get(reg.childId) : undefined;
        if (!name) continue;
        const names = tournamentChildNames.get(reg.tournamentId) ?? [];
        if (!names.includes(name)) names.push(name);
        tournamentChildNames.set(reg.tournamentId, names);
      }
      // 관할 합집합 — 학부모는 빈 집합이라 무영향
      const managed = await resolveManagedContentScope(
        this.prisma,
        requester.id,
        requester.userType,
      );
      const teamSet = Array.from(
        new Set([...viewerTeamIds, ...managed.teamIds]),
      );
      const classSet = Array.from(
        new Set([...classRegs.map((r) => r.classId), ...managed.classIds]),
      );
      const tournamentSet = Array.from(
        new Set([...eligibleTournamentIds, ...managed.tournamentIds]),
      );
      if (teamSet.length > 0) or.push({ teamId: { in: teamSet } });
      if (classSet.length > 0) {
        or.push({ targetClassId: { in: classSet } });
      }
      if (tournamentSet.length > 0) {
        or.push({ targetTournamentId: { in: tournamentSet } });
      }
    }
    if (or.length === 0) return { data: [], total: 0 };

    const feedWhere: Prisma.TeamPostWhereInput = {
      isActive: true,
      postType: "announcement",
      OR: or,
      AND: [
        { OR: [{ startAt: null }, { startAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ],
    };
    const total = await this.prisma.teamPost.count({ where: feedWhere });
    const posts = await this.prisma.teamPost.findMany({
      where: feedWhere,
      // [Codex P2-R3 M01] offset 페이지 안정 정렬 — managed 와 동일 계약
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: offset,
      include: {
        author: { select: AUTHOR_SELECT },
        team: { select: { id: true, name: true } },
        targetClass: { select: { id: true, className: true } },
        targetTournament: { select: { id: true, name: true } },
        attachments: { orderBy: { displayOrder: "asc" } },
        _count: { select: { comments: true } },
      },
    });

    const readSet = new Set(
      (
        await this.prisma.teamPostRead.findMany({
          where: {
            postId: { in: posts.map((p) => p.id) },
            userId: requester.id,
          },
          select: { postId: true },
        })
      ).map((r) => r.postId),
    );

    return {
      total,
      data: posts.map((post) => ({
        ...this.mapPost(post, now),
        commentCount: post._count.comments,
        targetName:
          post.team?.name ??
          post.targetClass?.className ??
          post.targetTournament?.name ??
          null,
        // 참가 자녀 이름 — 학부모 목록의 대상 칩 ("어느 자녀 때문에 보이는 공지인지")
        audienceChildNames: post.targetClassId
          ? (classChildNames.get(post.targetClassId) ?? [])
          : post.targetTournamentId
            ? (tournamentChildNames.get(post.targetTournamentId) ?? [])
            : [],
        isReadByMe: readSet.has(post.id),
      })),
    };
  }

  /** 상세 (+읽음 upsert +1일 1회 조회수) */
  async getPostDetail(requester: CommunityActor, postId: string) {
    const scope = await this.getPostScope(postId);
    await this.assertCanViewPost(requester, scope);
    const isManager = await this.canManagePost(requester, scope);
    const isAuthor = scope.authorId === requester.id;

    const now = new Date();
    // 노출 필터 — 관리자/작성자 외에는 미게시(soft 삭제·예약 전·만료 후) 404 은닉
    if (!isManager && !isAuthor && !this.isWithinWindow(scope, now)) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
      include: {
        author: { select: AUTHOR_SELECT },
        team: { select: { id: true, name: true } },
        targetClass: { select: { id: true, className: true } },
        targetTournament: { select: { id: true, name: true } },
        attachments: { orderBy: { displayOrder: "asc" } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: AUTHOR_SELECT } },
        },
        _count: { select: { comments: true } },
      },
    });
    if (!post || !post.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    // 읽음 upsert — N 은 수신자 ∩ Read 로 계산하므로 관리자 read 가 섞여도 무해
    await this.prisma.teamPostRead.upsert({
      where: { postId_userId: { postId, userId: requester.id } },
      create: { postId, userId: requester.id },
      update: { readAt: now },
    });
    // [Phase 2 §3.2 linkUrl 호환] 팀 공지 상세 열람 = 벨 알림도 읽음 동기화.
    //   이관 공지는 id 보존이라 기발송 구 경로(`/notice/{id}`) 알림이 남아 있다 —
    //   기존 팀 공지 상세(markNoticeAsRead)가 하던 동기화의 패리티. 실패는 내부 격리.
    if (post.teamId) {
      await this.notificationsService.markNotificationsReadByLinkUrls(
        requester.id,
        [`/notice/${postId}`, `/community-notice/${postId}`],
      );
    }

    const shouldIncrement = await this.viewCounter.tryIncrement({
      entityType: "club_post",
      entityId: postId,
      userId: requester.id,
    });
    if (shouldIncrement) {
      await this.prisma.teamPost.update({
        where: { id: postId },
        data: { viewCount: { increment: 1 } },
      });
    }

    return {
      ...this.mapPost(post, now),
      commentCount: post._count.comments,
      targetName:
        post.team?.name ??
        post.targetClass?.className ??
        post.targetTournament?.name ??
        null,
      comments: post.comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: comment.author,
        isMine: comment.authorId === requester.id,
      })),
      canManage: isManager,
    };
  }

  private mapPost(
    post: {
      id: string;
      teamId: string | null;
      targetClassId: string | null;
      targetTournamentId: string | null;
      title: string;
      content: string;
      isPinned: boolean;
      isActive: boolean;
      viewCount: number;
      startAt: Date | null;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      author?: unknown;
      attachments?: unknown[];
    },
    now = new Date(),
  ) {
    return {
      id: post.id,
      teamId: post.teamId,
      targetClassId: post.targetClassId,
      targetTournamentId: post.targetTournamentId,
      title: post.title,
      content: post.content,
      isPinned: post.isPinned,
      viewCount: post.viewCount,
      startAt: post.startAt,
      expiresAt: post.expiresAt,
      isPublished: this.isWithinWindow(post, now),
      isScheduled: !!post.startAt && post.startAt > now,
      isExpired: !!post.expiresAt && post.expiresAt < now,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: post.author,
      attachments: post.attachments ?? [],
    };
  }

  // ==================== 수정 / 삭제 ====================

  async updatePost(
    requester: CommunityActor,
    postId: string,
    dto: UpdateUnitPostDto,
  ) {
    const scope = await this.getPostScope(postId);
    await this.assertCanViewPost(requester, scope);
    const isManager = await this.canManagePost(requester, scope);
    if (!isManager && scope.authorId !== requester.id) {
      throw new ForbiddenException("게시글 수정 권한이 없습니다.");
    }
    if (!scope.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    const now = new Date();
    const nextStartAt =
      dto.startAt === undefined
        ? scope.startAt
        : dto.startAt === null
          ? null
          : new Date(dto.startAt);
    const nextExpiresAt =
      dto.expiresAt === undefined
        ? scope.expiresAt
        : dto.expiresAt === null
          ? null
          : new Date(dto.expiresAt);
    if (nextStartAt && nextExpiresAt && nextStartAt > nextExpiresAt) {
      throw new BadRequestException(
        "게시 시작이 만료 시점보다 늦을 수 없습니다.",
      );
    }

    // 첫 유효 게시 전환이면 claim(생애 1회) 후 커밋 뒤 푸시 — SystemNotice 계약 동일
    const wasPushable = this.isWithinWindow(scope, now);
    const willBePushable = this.isWithinWindow(
      { isActive: true, startAt: nextStartAt, expiresAt: nextExpiresAt },
      now,
    );

    const { updated, claimed } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.teamPost.update({
        where: { id: postId },
        data: {
          ...(dto.title !== undefined && {
            title: maskProfanity(sanitizeStrict(dto.title)),
          }),
          ...(dto.content !== undefined && {
            content: maskProfanity(sanitizeExtendedHtml(dto.content)),
          }),
          ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
          ...(dto.startAt !== undefined && { startAt: nextStartAt }),
          ...(dto.expiresAt !== undefined && { expiresAt: nextExpiresAt }),
        },
      });
      let didClaim = false;
      if (!wasPushable && willBePushable) {
        const claim = await tx.teamPost.updateMany({
          where: { id: postId, publishedNotifiedAt: null },
          data: { publishedNotifiedAt: now },
        });
        didClaim = claim.count === 1;
      }
      return { updated: row, claimed: didClaim };
    });

    if (claimed) {
      this.sendPublishNotification(updated, requester.id);
    }

    return this.getPostDetail(requester, postId);
  }

  /** soft 삭제 — 작성자 + 관할 감독·코치 (§5) */
  async deletePost(requester: CommunityActor, postId: string) {
    const scope = await this.getPostScope(postId);
    await this.assertCanViewPost(requester, scope);
    const isManager = await this.canManagePost(requester, scope);
    if (!isManager && scope.authorId !== requester.id) {
      throw new ForbiddenException("게시글 삭제 권한이 없습니다.");
    }
    await this.prisma.teamPost.update({
      where: { id: postId },
      data: { isActive: false },
    });
    return { deleted: true };
  }

  // ==================== 읽음 N/M (감독·코치 전용) ====================

  /**
   * 읽음 현황 — **미읽음자 명단만** 노출한다 (v1.2.3 후속 확정, 2026-08-20 사용자).
   * 읽은 쪽은 개인 식별 없이 카운트(N)만. readAt 은 저장은 유지하되(이관·감사 근거)
   * 응답에서 제거 — 프론트 숨김이 아니라 서버가 내려주지 않는다.
   * 업계 관행(밴드·Spond) 대비 노출을 좁힌 형태.
   */
  async getReadsSummary(requester: CommunityActor, postId: string) {
    const scope = await this.getPostScope(postId);
    const isManager = await this.canManagePost(requester, scope);
    if (!isManager) {
      // 404 은닉 — 읽음 현황은 감독·코치 전용
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    const recipientIds = await this.resolveRecipients(scope);
    const reads = await this.prisma.teamPostRead.findMany({
      where: { postId, userId: { in: recipientIds } },
      select: { userId: true },
    });
    const readSet = new Set(reads.map((r) => r.userId));
    const unreadIds = recipientIds.filter((id) => !readSet.has(id));

    const [users, childLinks] = await Promise.all([
      unreadIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: unreadIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              userType: true,
            },
          })
        : Promise.resolve([]),
      // 수업 축: 학부모별 이 수업 수강 자녀 이름 (미읽음 명단 식별용)
      scope.targetClassId && unreadIds.length > 0
        ? this.prisma.parentChild.findMany({
            where: {
              parentId: { in: unreadIds },
              child: {
                classRegistrations: {
                  some: { classId: scope.targetClassId, status: "active" },
                },
              },
            },
            select: {
              parentId: true,
              child: { select: { firstName: true, lastName: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const childNamesMap = new Map<string, string[]>();
    for (const link of childLinks) {
      const name =
        `${link.child.lastName ?? ""}${link.child.firstName ?? ""}`.trim();
      if (!childNamesMap.has(link.parentId)) {
        childNamesMap.set(link.parentId, []);
      }
      if (name) childNamesMap.get(link.parentId)!.push(name);
    }

    return {
      postId,
      recipientCount: recipientIds.length,
      readCount: recipientIds.length - unreadIds.length,
      unread: users.map((user) => ({
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        childNames: childNamesMap.get(user.id) ?? [],
      })),
      remindAvailableAt: await this.getRemindAvailableAt(postId),
    };
  }

  /** 재알림 쿨다운 만료 시각 — null 이면 즉시 가능 */
  private async getRemindAvailableAt(postId: string): Promise<Date | null> {
    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
      select: { lastRemindAt: true },
    });
    if (!post?.lastRemindAt) return null;
    const availableAt = new Date(
      post.lastRemindAt.getTime() + REMIND_COOLDOWN_MS,
    );
    return availableAt > new Date() ? availableAt : null;
  }

  /**
   * 미읽음자에게 다시 알리기 — 업계 표준(밴드 "읽지 않은 멤버에게 다시 알리기"·Spond 리마인더).
   * 관할 감독·코치 전용 · 알림 스팸 방지를 위해 게시글당 24시간 1회 쿨다운.
   */
  async remindUnread(requester: CommunityActor, postId: string) {
    const scope = await this.getPostScope(postId);
    const isManager = await this.canManagePost(requester, scope);
    if (!isManager) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }
    if (!scope.isActive || !this.isWithinWindow(scope)) {
      throw new BadRequestException(
        "게시 중인 공지에만 재알림을 보낼 수 있습니다.",
      );
    }

    const now = new Date();
    // 쿨다운 claim — updateMany 원자 판정 (동시 클릭 2건 중 1건만 통과)
    const cooldownGate = new Date(now.getTime() - REMIND_COOLDOWN_MS);
    const claim = await this.prisma.teamPost.updateMany({
      where: {
        id: postId,
        OR: [{ lastRemindAt: null }, { lastRemindAt: { lt: cooldownGate } }],
      },
      data: { lastRemindAt: now },
    });
    if (claim.count !== 1) {
      throw new BadRequestException(
        "재알림은 하루에 한 번만 보낼 수 있습니다.",
      );
    }

    const recipientIds = await this.resolveRecipients(scope);
    const reads = await this.prisma.teamPostRead.findMany({
      where: { postId, userId: { in: recipientIds } },
      select: { userId: true },
    });
    const readSet = new Set(reads.map((r) => r.userId));
    const unreadIds = recipientIds.filter((id) => !readSet.has(id));
    if (unreadIds.length === 0) {
      return { reminded: 0 };
    }

    const post = await this.prisma.teamPost.findUnique({
      where: { id: postId },
      select: { title: true, targetClassId: true },
    });
    await this.notificationsService.notifyUsers(unreadIds, {
      notificationType: "notice_unread_reminder",
      title: post?.targetClassId ? "훈련 공지 확인 요청" : "대회 공지 확인 요청",
      message: post?.title ?? "공지를 확인해주세요.",
      linkUrl: `/community-notice/${postId}`,
    });
    return { reminded: unreadIds.length };
  }

  // ==================== 댓글 ====================

  async addComment(
    requester: CommunityActor,
    postId: string,
    dto: CreateUnitCommentDto,
  ) {
    const scope = await this.getPostScope(postId);
    await this.assertCanViewPost(requester, scope);
    await this.assertCommentablePostState(requester, scope);

    // [Codex R1 M-02] 댓글 생성 + commentCount 캐시를 단일 트랜잭션으로 (불일치 차단)
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.teamPostComment.create({
        data: {
          postId,
          authorId: requester.id,
          content: maskProfanity(sanitizeBasicHtml(dto.content)),
        },
        include: { author: { select: AUTHOR_SELECT } },
      });
      await tx.teamPost.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });
      return created;
    });
    return comment;
  }

  /**
   * [Codex R2 H-03] 댓글 하위 경로 공통 게시 상태 정책 — 작성(addComment)과 동일 계약으로 통일.
   * · inactive(soft delete) 게시글 = **전 경로 404** (관리자 예외 없음)
   * · 게시기간 밖(예약 전·만료 후) = 관할 관리자 또는 게시글 작성자만 허용
   * [R3] 레거시 팀 댓글 경로(community.service)도 이 정책을 공용으로 사용한다 — public.
   */
  async assertCommentablePostState(
    requester: CommunityActor,
    post: PostScope & PublicationWindow & { authorId: string },
  ): Promise<void> {
    if (!post.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }
    const now = new Date();
    const withinWindow =
      (!post.startAt || post.startAt <= now) &&
      (!post.expiresAt || post.expiresAt >= now);
    if (!withinWindow) {
      const isManager = await this.canManagePost(requester, post);
      if (!isManager && post.authorId !== requester.id) {
        throw new NotFoundException("게시글을 찾을 수 없습니다.");
      }
    }
  }

  /**
   * 댓글 수정 — 본인만. [Codex R1 H-03] 작성자 확인만으로는 자격 상실
   * (수강 해지·대회 취소) 후에도 commentId 로 계속 수정 가능 — 현재 게시글
   * 열람 권한·활성 상태·게시기간을 재검증한다 (R2: 게시기간 포함).
   */
  async updateComment(
    requester: CommunityActor,
    commentId: string,
    dto: UpdateUnitCommentDto,
  ) {
    const comment = await this.prisma.teamPostComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        authorId: true,
        post: {
          select: {
            id: true,
            teamId: true,
            targetClassId: true,
            targetTournamentId: true,
            authorId: true,
            isActive: true,
            startAt: true,
            expiresAt: true,
          },
        },
      },
    });
    if (!comment || comment.authorId !== requester.id) {
      // 404 은닉 — 타인 댓글 존재를 확인시켜 주지 않는다
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }
    // inactive 는 열람 검증 이전에 선차단 (전 경로 404 — 불필요한 관할 조회 생략)
    if (!comment.post.isActive) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }
    await this.assertCanViewPost(requester, comment.post);
    await this.assertCommentablePostState(requester, comment.post);
    return this.prisma.teamPostComment.update({
      where: { id: commentId },
      data: { content: maskProfanity(sanitizeBasicHtml(dto.content)) },
      include: { author: { select: AUTHOR_SELECT } },
    });
  }

  /**
   * 댓글 삭제 — UI 는 본인 댓글만 노출하되, 백엔드는 본인 + 관할 감독·코치 moderation
   * (기존 notices 정책 이식 — AuditLog 기록 + 404 은닉. v1.2.3 §5)
   */
  async deleteComment(requester: CommunityActor, commentId: string) {
    const comment = await this.prisma.teamPostComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        authorId: true,
        postId: true,
        post: {
          select: {
            id: true,
            teamId: true,
            targetClassId: true,
            targetTournamentId: true,
            authorId: true,
            isActive: true,
            startAt: true,
            expiresAt: true,
          },
        },
      },
    });
    if (!comment) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }
    // [Codex R2 H-03] inactive(soft delete) 게시글의 댓글은 전 경로(본인·moderation) 404
    if (!comment.post.isActive) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    if (comment.authorId === requester.id) {
      // [Codex R1 H-03] 본인 삭제도 현재 열람 권한·게시기간 재검증 — 자격 상실 후 404 은닉
      await this.assertCanViewPost(requester, comment.post);
      await this.assertCommentablePostState(requester, comment.post);
      await this.prisma.$transaction([
        this.prisma.teamPostComment.delete({ where: { id: commentId } }),
        this.prisma.teamPost.update({
          where: { id: comment.postId },
          data: { commentCount: { decrement: 1 } },
        }),
      ]);
      return { deleted: true };
    }

    const canModerate = await this.canManagePost(requester, comment.post);
    if (!canModerate) {
      throw new NotFoundException("댓글을 찾을 수 없습니다.");
    }

    await this.prisma.$transaction([
      this.prisma.teamPostComment.delete({ where: { id: commentId } }),
      this.prisma.teamPost.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: requester.id,
          action: "TEAM_POST_COMMENT_DELETED",
          resource: "TeamPostComment",
          oldValue: {
            postId: comment.postId,
            commentId: comment.id,
            commentOwnerUserId: comment.authorId,
          },
        },
      }),
    ]);
    return { deleted: true };
  }

  // ==================== 첨부 (이미지 4종 · 10MB — DTO 검증) ====================

  /** 첨부 메타 추가 — 파일 업로드는 공용 files/upload(category=IMAGE) 선행 */
  async addAttachment(
    requester: CommunityActor,
    postId: string,
    dto: UnitNoticeAttachmentDto,
  ) {
    const scope = await this.getPostScope(postId);
    await this.assertCanViewPost(requester, scope);
    const isManager = await this.canManagePost(requester, scope);
    if (!isManager && scope.authorId !== requester.id) {
      throw new ForbiddenException("첨부파일 추가 권한이 없습니다.");
    }
    if (!scope.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    const existing = await this.prisma.teamPostAttachment.aggregate({
      where: { postId },
      _max: { displayOrder: true },
      _count: true,
    });
    if (existing._count >= UNIT_NOTICE_IMAGE_MAX_COUNT) {
      throw new BadRequestException(
        `이미지는 최대 ${UNIT_NOTICE_IMAGE_MAX_COUNT}장까지 첨부할 수 있습니다.`,
      );
    }
    return this.prisma.teamPostAttachment.create({
      data: {
        postId,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        displayOrder: (existing._max.displayOrder ?? -1) + 1,
      },
    });
  }

  // ==================== 참가자 연락 대상 (수업 명단 1:1 문의) ====================

  /**
   * [Codex R1 H-02] 수업 참가자 명단의 연락 대상 — 설계 §8 "수업 참가자 명단 행 1:1 문의".
   * 부모 우선 규칙은 수신자 산출과 동일: 선수(자녀)의 활성 보호자 → 없으면 성인 본인.
   * 정산 계약(getClassPayments 5-state)을 건드리지 않기 위한 별도 조회.
   * 관할 감독·코치 전용 (비관할 404 은닉).
   */
  async getClassContacts(requester: CommunityActor, classId: string) {
    if (!(await this.canManageClass(requester, classId))) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    const registrations = await this.prisma.classRegistration.findMany({
      where: { classId, status: "active" },
      select: { userId: true },
    });
    const memberIds = Array.from(new Set(registrations.map((r) => r.userId)));
    if (memberIds.length === 0) return { classId, contacts: [] };

    const [parentLinks, members] = await Promise.all([
      this.prisma.parentChild.findMany({
        where: {
          childId: { in: memberIds },
          parent: { status: { not: "WITHDRAWN" }, deletedAt: null },
        },
        select: {
          childId: true,
          parent: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.user.findMany({
        where: {
          id: { in: memberIds },
          status: { not: "WITHDRAWN" },
          deletedAt: null,
        },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);

    const fullName = (u: {
      firstName: string | null;
      lastName: string | null;
    }) => `${u.lastName ?? ""}${u.firstName ?? ""}`.trim();

    // 자녀별 대표 보호자 1명 (첫 링크 — 수신자 산출은 전 보호자, 문의 진입은 대표 1명)
    const primaryParentByChild = new Map<
      string,
      { id: string; name: string }
    >();
    for (const link of parentLinks) {
      if (!primaryParentByChild.has(link.childId)) {
        primaryParentByChild.set(link.childId, {
          id: link.parent.id,
          name: fullName(link.parent),
        });
      }
    }
    const memberById = new Map(members.map((m) => [m.id, m]));

    return {
      classId,
      contacts: memberIds.map((memberId) => {
        const parent = primaryParentByChild.get(memberId);
        if (parent) {
          return {
            memberId,
            contactUserId: parent.id,
            contactName: parent.name,
          };
        }
        const self = memberById.get(memberId); // 성인 본인 (탈퇴 시 null)
        return {
          memberId,
          contactUserId: self?.id ?? null,
          contactName: self ? fullName(self) : null,
        };
      }),
    };
  }

  // ==================== 대상 픽커 (감독·코치 작성 화면용) ====================

  /** 관할 중 공지 작성 가능한 수업(진행 중)·대회(취소 제외) 목록 */
  async getManagedTargets(requester: CommunityActor) {
    // [Codex R1 H-06] 시스템 역할은 전역 — 개별 canManage 전면 통과와 픽커를 일치시킨다
    const isSystemRole = isNoticeSystemRole(requester.userType);
    const scope = isSystemRole
      ? null
      : await resolveManagedContentScope(
          this.prisma,
          requester.id,
          requester.userType,
        );

    const [teams, classes, tournaments] = await Promise.all([
      isSystemRole || (scope && scope.teamIds.length > 0)
        ? this.prisma.team.findMany({
            where: {
              ...(scope ? { id: { in: scope.teamIds } } : {}),
              isActive: true,
            },
            select: { id: true, name: true },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      isSystemRole || (scope && scope.classIds.length > 0)
        ? this.prisma.class.findMany({
            where: {
              ...(scope ? { id: { in: scope.classIds } } : {}),
              isActive: true,
              endedAt: null,
            },
            select: {
              id: true,
              className: true,
              teamId: true,
              academyId: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      isSystemRole || (scope && scope.tournamentIds.length > 0)
        ? this.prisma.tournament.findMany({
            where: {
              ...(scope ? { id: { in: scope.tournamentIds } } : {}),
              status: { not: "cancelled" },
            },
            select: { id: true, name: true, status: true },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    return {
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
      classes: classes.map((c) => ({
        id: c.id,
        name: c.className,
        isOpenClass: !c.teamId && !!c.academyId,
      })),
      tournaments: tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
      })),
    };
  }
}
