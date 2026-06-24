import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { NotificationQueue } from "./notification.queue";
import { FcmService, FcmDataPayload } from "./fcm.service";
import { ConfigService } from "@nestjs/config";
import { NotificationsGateway } from "@/websocket/notifications.gateway";

// 🔥 unread-count 캐시 키 (고빈도 — 모든 페이지에서 뱃지 호출)
const UNREAD_COUNT_CACHE_KEY = (userId: string) => `notif:unread:${userId}`;
const UNREAD_COUNT_CACHE_TTL = 30; // 30초 — 실시간성과 DB 부담 균형
import {
  SendPaymentConfirmationDto,
  SendMembershipApprovalDto,
  SendClassReminderDto,
  SendAttendanceConfirmationDto,
  SendCreditExpiryDto,
} from "./dto/alimtalk.dto";

export interface CreateNotificationDto {
  userId: string;
  notificationType: string;
  title: string;
  message: string;
  /** 알림 탭 시 이동할 딥링크 경로 (optional, 예: "/classes-manage/:id/schedules") */
  linkUrl?: string;
}

/**
 * 광고성/마케팅 알림 타입 목록
 *
 * 정보통신망법 제50조에 의거, 야간(KST 21:00~08:00) 광고성 메시지 발송 금지.
 * 아래 목록에 해당하는 notificationType만 야간 발송 제한 대상입니다.
 * 정보성 메시지(출석 알림, 결제 완료 등)는 제한 없이 발송됩니다.
 */
const MARKETING_NOTIFICATION_TYPES = [
  "marketing",
  "promotion",
  "advertisement",
  "event_promotion",
  "academy_promotion",
  "admin_push_marketing",
] as const;

export interface AlimtalkTemplateData {
  [key: string]: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationQueue: NotificationQueue,
    private readonly fcmService: FcmService,
    private readonly configService: ConfigService,
    @Optional()
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly notificationsGateway?: NotificationsGateway,
  ) {}

  // ──────────────────────────────────────────────────────────────
  // 야간 마케팅 발송 제한 (정보통신망법 제50조)
  // KST 21:00 ~ 08:00 광고성 메시지 발송 금지
  // ──────────────────────────────────────────────────────────────

  /**
   * 현재 시각이 야간 시간대(KST 21:00~08:00)인지 판별
   */
  private isNightTimeKST(): boolean {
    const now = new Date();
    // KST = UTC+9
    const kstOffset = 9 * 60; // 분 단위
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const kstMinutes = (utcMinutes + kstOffset) % (24 * 60);
    const kstHour = Math.floor(kstMinutes / 60);
    // 21:00 ~ 23:59 또는 00:00 ~ 07:59
    return kstHour >= 21 || kstHour < 8;
  }

  /**
   * 주어진 알림 타입이 광고성(마케팅) 메시지인지 판별
   */
  private isMarketingNotification(notificationType: string): boolean {
    const normalized = notificationType.toLowerCase();
    return (MARKETING_NOTIFICATION_TYPES as readonly string[]).includes(
      normalized,
    );
  }

  /**
   * 야간 마케팅 발송 제한 체크
   *
   * 광고성 메시지 + 야간 시간대이면 true를 반환합니다.
   * 정보성 메시지(출석, 결제, 수업 등)는 항상 false를 반환합니다.
   */
  private isBlockedByNightRestriction(notificationType: string): boolean {
    if (!this.isMarketingNotification(notificationType)) {
      return false;
    }
    return this.isNightTimeKST();
  }

  /**
   * 알림 생성
   */
  async createNotification(dto: CreateNotificationDto) {
    // 야간 마케팅 발송 제한 (정보통신망법 제50조)
    if (this.isBlockedByNightRestriction(dto.notificationType)) {
      this.logger.warn(
        `야간 광고성 메시지 발송 차단: userId=${dto.userId}, type=${dto.notificationType}`,
      );
      throw new BadRequestException(
        "야간 시간대(21:00~08:00)에는 광고성 메시지를 발송할 수 없습니다. (정보통신망법 제50조)",
      );
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        notificationType: dto.notificationType,
        title: dto.title,
        message: dto.message,
        linkUrl: dto.linkUrl ?? null,
        isRead: false,
      },
    });

    // 🔥 unread-count 캐시 무효화 — 다음 조회 시 새 값 반영
    void this.invalidateUnreadCountCache(dto.userId);

    const result = {
      id: notification.id,
      userId: notification.userId,
      notificationType: notification.notificationType,
      title: notification.title,
      message: notification.message,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    };

    // Emit WebSocket event if gateway is available
    if (this.notificationsGateway) {
      try {
        await this.notificationsGateway.sendToUser(dto.userId, {
          id: notification.id,
          type: notification.notificationType,
          title: notification.title,
          message: notification.message,
          createdAt: notification.createdAt,
        });
      } catch (error) {
        this.logger.warn(`WebSocket notification failed: ${error.message}`);
      }
    }

    // FCM 푸시 발송 (비동기 — 실패해도 알림 생성에 영향 없음)
    this.sendFcmPushAsync(
      dto.userId,
      notification.title,
      notification.message,
      {
        notificationId: notification.id,
        type: notification.notificationType,
      },
    );

    return result;
  }

  /**
   * 팀 소속 학생의 학부모 userId 목록 (승인·활성 멤버 기준, 중복 제거).
   * 경로: TeamMember(approved·미탈퇴).userId → ParentChild.childId → parentId
   */
  async getTeamParentUserIds(teamId: string): Promise<string[]> {
    const members = await this.prisma.teamMember.findMany({
      where: { teamId, approvalStatus: "approved", leftAt: null },
      select: { userId: true },
    });
    if (members.length === 0) return [];
    const childIds = members.map((m) => m.userId);
    const links = await this.prisma.parentChild.findMany({
      where: { childId: { in: childIds } },
      select: { parentId: true },
    });
    return Array.from(new Set(links.map((l) => l.parentId)));
  }

  /** 푸시 수신거부(pushEnabled=false) 사용자를 제외한 대상 반환 */
  private async filterPushEnabled(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const disabledPrefs = await this.prisma.userNotificationPreference.findMany(
      {
        where: { userId: { in: userIds }, pushEnabled: false },
        select: { userId: true },
      },
    );
    const disabled = new Set(disabledPrefs.map((p) => p.userId));
    return userIds.filter((id) => !disabled.has(id));
  }

  /**
   * 여러 사용자에게 정보성 알림 일괄 발송 (대량 최적화).
   * - 수신거부(pushEnabled=false) 사용자 제외
   * - DB는 createMany 1회, WebSocket은 sendToUsers, FCM은 sendPushToUsers 배치 1회
   * - 광고성 야간 제한이 필요한 단건 발송은 createNotification 경로 사용.
   */
  async notifyUsers(
    userIds: string[],
    payload: {
      notificationType: string;
      title: string;
      message: string;
      linkUrl?: string;
    },
  ): Promise<void> {
    const unique = Array.from(new Set(userIds)).filter(Boolean);
    const targets = await this.filterPushEnabled(unique);
    if (targets.length === 0) return;

    // DB 알림 일괄 생성
    await this.prisma.notification.createMany({
      data: targets.map((userId) => ({
        userId,
        notificationType: payload.notificationType,
        title: payload.title,
        message: payload.message,
        linkUrl: payload.linkUrl ?? null,
        isRead: false,
      })),
    });

    // unread 캐시 무효화
    await Promise.allSettled(
      targets.map((userId) => this.invalidateUnreadCountCache(userId)),
    );

    // WebSocket 실시간 (best-effort)
    if (this.notificationsGateway) {
      try {
        await this.notificationsGateway.sendToUsers(targets, {
          id: "",
          type: payload.notificationType,
          title: payload.title,
          message: payload.message,
          createdAt: new Date(),
        });
      } catch (error) {
        this.logger.warn(`WebSocket 일괄 발송 실패: ${error}`);
      }
    }

    // FCM 배치 발송
    try {
      await this.fcmService.sendPushToUsers(
        targets,
        payload.title,
        payload.message,
        {
          type: payload.notificationType,
          ...(payload.linkUrl ? { linkUrl: payload.linkUrl } : {}),
        },
      );
    } catch (error) {
      this.logger.warn(`FCM 일괄 발송 실패: ${error}`);
    }
  }

  /**
   * FCM 푸시만 별도 발송 (DB 알림은 호출 측에서 이미 생성했거나 불필요한 경우).
   * - 트랜잭션 내부 createMany 로 인앱 알림을 적재한 출석 정정 등 → 인앱은 유지하고 푸시만 추가
   * - 알림센터 적재가 불필요한 채팅 메시지 등 → 자체 unreadCount 를 쓰므로 푸시만 발송
   * 푸시 수신거부(pushEnabled=false) 사용자는 제외하고, 실패는 격리한다.
   *
   * @param options.setBadge `false` 면 iOS 앱 뱃지를 설정하지 않는다(omit).
   *   채팅처럼 알림센터에 적재되지 않는 푸시가 unread=0 으로 뱃지를 잘못
   *   클리어하는 것을 막는다. 출석 정정 등 트랜잭션 내 notification row 를
   *   생성하는 경로는 기본값(setBadge 미전달=뱃지 유지)을 그대로 사용한다.
   */
  async pushOnlyToUsers(
    userIds: string[],
    payload: {
      notificationType: string;
      title: string;
      message: string;
      linkUrl?: string;
    },
    options?: { setBadge?: boolean },
  ): Promise<void> {
    const unique = Array.from(new Set(userIds)).filter(Boolean);
    const targets = await this.filterPushEnabled(unique);
    if (targets.length === 0) return;

    try {
      await this.fcmService.sendPushToUsers(
        targets,
        payload.title,
        payload.message,
        {
          type: payload.notificationType,
          ...(payload.linkUrl ? { linkUrl: payload.linkUrl } : {}),
        },
        options,
      );
    } catch (error) {
      this.logger.warn(`FCM 단독 발송 실패: ${error}`);
    }
  }

  /**
   * 팀 소속 학생의 학부모에게 일괄 알림 — 도메인 공통 진입점.
   * (공지·팀공지·수업·훈련·대회·전지훈련·일정 등록 시 재사용)
   * 실패는 격리하여 호출 도메인의 메인 흐름을 막지 않는다.
   */
  async notifyTeamParents(
    teamId: string,
    payload: {
      notificationType: string;
      title: string;
      message: string;
      linkUrl?: string;
    },
  ): Promise<void> {
    try {
      const parentIds = await this.getTeamParentUserIds(teamId);
      await this.notifyUsers(parentIds, payload);
    } catch (error) {
      this.logger.warn(`notifyTeamParents 실패: team=${teamId}, ${error}`);
    }
  }

  /**
   * 팀의 감독/코치 userId 목록 (중복 제거).
   * 경로: Team.coachId(팀 소유 감독) ∪ TeamMember(approved·미탈퇴·roleInTeam∈[HEAD_COACH,COACH,MANAGER]).userId
   * — 승인 권한 판정(teams.service.assertTeamManagerPermission)과 동일 기준.
   */
  async getTeamManagerUserIds(teamId: string): Promise<string[]> {
    const [team, managers] = await Promise.all([
      this.prisma.team.findUnique({
        where: { id: teamId },
        select: { coachId: true },
      }),
      this.prisma.teamMember.findMany({
        where: {
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: { userId: true },
      }),
    ]);
    const ids = managers.map((m) => m.userId);
    if (team?.coachId) ids.push(team.coachId);
    return Array.from(new Set(ids.filter(Boolean)));
  }

  /**
   * 팀의 감독/코치 전원에게 정보성 알림 일괄 발송 (notifyTeamParents 대응).
   * 수신거부·실패 격리는 notifyUsers 가 처리.
   */
  async notifyTeamManagers(
    teamId: string,
    payload: {
      notificationType: string;
      title: string;
      message: string;
      linkUrl?: string;
    },
  ): Promise<void> {
    try {
      const managerIds = await this.getTeamManagerUserIds(teamId);
      await this.notifyUsers(managerIds, payload);
    } catch (error) {
      this.logger.warn(`notifyTeamManagers 실패: team=${teamId}, ${error}`);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 코치/감독 팀 Push 발송 (시나리오2)
  // ──────────────────────────────────────────────────────────────

  /**
   * 발송자가 해당 팀의 감독/코치(매니저)인지 검증.
   * teams.service.assertTeamManagerPermission 과 동일 기준
   * (Team.coachId ∪ approved 매니저 TeamMember[HEAD_COACH/COACH/MANAGER]).
   * NotificationsModule ↔ TeamsModule 순환 의존(TeamsModule 이 이미 NotificationsModule 을
   * import)을 피하기 위해 TeamsService 를 주입하지 않고 여기서 직접 검증한다.
   */
  private async assertTeamManager(
    senderId: string,
    teamId: string,
  ): Promise<void> {
    const [ownedTeam, approvedManager] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, coachId: senderId },
        select: { id: true },
      }),
      this.prisma.teamMember.findFirst({
        where: {
          userId: senderId,
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: { id: true },
      }),
    ]);
    if (!ownedTeam && !approvedManager) {
      throw new ForbiddenException("이 팀의 감독/코치만 발송할 수 있습니다.");
    }
  }

  /**
   * 팀 Push 발송 가능 대상 풀 조회 (멤버 / 학부모 / 매니저).
   * - members: 직접 멤버 중 매니저가 아닌 자 (선수 등)
   * - parents: 팀 소속 학생의 학부모
   * - managers: 감독/코치
   * 각 항목은 { userId, name, role }. 권한 검증은 호출 측(getTeamPushRecipientsForManager)에서 수행.
   */
  private async getTeamPushRecipients(teamId: string): Promise<{
    members: Array<{ userId: string; name: string; role: string }>;
    parents: Array<{ userId: string; name: string; role: string }>;
    managers: Array<{ userId: string; name: string; role: string }>;
  }> {
    const [memberRows, parentIds, managerIds] = await Promise.all([
      this.prisma.teamMember.findMany({
        where: {
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          user: { status: { not: "WITHDRAWN" } },
        },
        select: {
          userId: true,
          playerName: true,
          user: {
            select: { firstName: true, lastName: true, userType: true },
          },
        },
      }),
      this.getTeamParentUserIds(teamId),
      this.getTeamManagerUserIds(teamId),
    ]);

    const managerIdSet = new Set(managerIds);

    // parents + managers 의 표시 이름 조회 (멤버는 위 쿼리에서 이미 user 포함)
    const extraIds = Array.from(new Set([...parentIds, ...managerIds]));
    const extraUsers = extraIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: extraIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userType: true,
          },
        })
      : [];
    const userMap = new Map(extraUsers.map((u) => [u.id, u]));
    const fullName = (last?: string | null, first?: string | null) =>
      `${last ?? ""}${first ?? ""}`.trim();

    const members = memberRows
      .filter((m) => !managerIdSet.has(m.userId)) // 매니저는 managers 그룹으로 분리
      .map((m) => ({
        userId: m.userId,
        name:
          m.playerName ||
          fullName(m.user?.lastName, m.user?.firstName) ||
          "이름 미상",
        role: m.user?.userType ?? "MEMBER",
      }));

    const managers = managerIds.map((id) => {
      const u = userMap.get(id);
      return {
        userId: id,
        name: fullName(u?.lastName, u?.firstName) || "이름 미상",
        role: u?.userType ?? "COACH",
      };
    });

    const parents = parentIds.map((id) => {
      const u = userMap.get(id);
      return {
        userId: id,
        name: fullName(u?.lastName, u?.firstName) || "이름 미상",
        role: u?.userType ?? "PARENT",
      };
    });

    return { members, parents, managers };
  }

  /** 권한 검증 후 팀 Push 발송 대상 풀 반환 (컨트롤러 진입점). */
  async getTeamPushRecipientsForManager(senderId: string, teamId: string) {
    await this.assertTeamManager(senderId, teamId);
    return this.getTeamPushRecipients(teamId);
  }

  /**
   * 코치/감독이 특정 팀 회원(멤버/학부모/매니저)에게 Push 발송.
   * IDOR 2단 검증: (1) 발송자가 팀 매니저인지, (2) 대상이 팀 풀에 속하는지 교차검증.
   * 발송은 notifyUsers(인앱+WebSocket+FCM+수신거부 필터)를 재사용하고 AuditLog 를 남긴다.
   */
  async sendTeamPush(
    senderId: string,
    teamId: string,
    dto: {
      userIds: string[];
      title: string;
      message: string;
      linkUrl?: string;
    },
  ) {
    // (1) 발송자 권한 — 팀 매니저 여부
    await this.assertTeamManager(senderId, teamId);

    // (2) 대상 교차검증 — 요청 userIds 가 모두 팀 풀(멤버∪학부모∪매니저)에 속하는지
    const recipients = await this.getTeamPushRecipients(teamId);
    const allowed = new Set<string>([
      ...recipients.members.map((r) => r.userId),
      ...recipients.parents.map((r) => r.userId),
      ...recipients.managers.map((r) => r.userId),
    ]);
    const requested = Array.from(new Set(dto.userIds.filter(Boolean)));
    const rejected = requested.filter((id) => !allowed.has(id));
    if (rejected.length > 0) {
      throw new ForbiddenException(
        "발송 대상에 이 팀과 무관한 사용자가 포함되어 있습니다.",
      );
    }

    // (3) 인앱 알림 + WebSocket + FCM + 수신거부 필터 — notifyUsers 재사용
    await this.notifyUsers(requested, {
      notificationType: "team_push",
      title: dto.title,
      message: dto.message,
      linkUrl: dto.linkUrl,
    });

    // (4) 감사 추적 — 발송 남용 모니터링
    await this.prisma.auditLog.create({
      data: {
        userId: senderId,
        action: "TEAM_PUSH_SENT",
        resource: "notifications",
        newValue: {
          teamId,
          recipientCount: requested.length,
          title: dto.title,
        },
      },
    });

    return { success: true, sentCount: requested.length };
  }

  /**
   * 사용자 알림 조회
   *
   * 프론트(`teamplus-web/src/lib/notification-mapper.ts`)는 다음 필드를 사용함:
   *  - id / notificationType / title / message / isRead / createdAt / linkUrl
   * linkUrl 누락 시 알림 클릭 → 상세 이동 경로를 잃으므로 명시적으로 포함한다.
   * N+1 방지를 위해 select 로 필요한 컬럼만 조회.
   */
  async getUserNotifications(
    userId: string,
    limit: number = 20,
    skip: number = 0,
    types?: string[],
  ) {
    const where: import("@prisma/client").Prisma.NotificationWhereInput = {
      userId,
      ...(types && types.length > 0 ? { notificationType: { in: types } } : {}),
    };

    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
      select: {
        id: true,
        notificationType: true,
        title: true,
        message: true,
        isRead: true,
        createdAt: true,
        linkUrl: true,
      },
    });

    return notifications.map((n) => ({
      id: n.id,
      notificationType: n.notificationType,
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      createdAt: n.createdAt,
      linkUrl: n.linkUrl,
    }));
  }

  /**
   * 알림 상세 조회
   */
  async getNotification(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        alimtalkLog: true,
      },
    });

    // 본인 알림이 아니면 존재 자체를 숨겨 404로 응답 (IDOR 방지)
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException("알림을 찾을 수 없습니다.");
    }

    return {
      id: notification.id,
      notificationType: notification.notificationType,
      title: notification.title,
      message: notification.message,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      alimtalkLog: notification.alimtalkLog
        ? {
            id: notification.alimtalkLog.id,
            phone: notification.alimtalkLog.phone,
            status: notification.alimtalkLog.status,
            sentAt: notification.alimtalkLog.sentAt,
          }
        : null,
    };
  }

  /**
   * 알림 읽음 처리
   */
  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    // 본인 알림이 아니면 존재 자체를 숨겨 404로 응답 (IDOR 방지)
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException("알림을 찾을 수 없습니다.");
    }

    if (notification.isRead) {
      throw new BadRequestException("이미 읽은 알림입니다.");
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    // 🔥 unread-count 캐시 무효화
    void this.invalidateUnreadCountCache(updated.userId);

    return {
      id: updated.id,
      isRead: updated.isRead,
      readAt: updated.readAt,
    };
  }

  /**
   * 읽지 않은 알림 개수 — 🔥 Redis 캐시 (30초 TTL)
   * 모든 페이지에서 뱃지 표시를 위해 반복 호출되므로 DB 왕복을 제거한다.
   * `createNotification`, `markAsRead`, `markAllAsRead`, `deleteNotification`
   * 직후 `invalidateUnreadCountCache()` 로 캐시 무효화.
   */
  async getUnreadCount(userId: string) {
    const cacheKey = UNREAD_COUNT_CACHE_KEY(userId);
    try {
      const cached = await this.redis.get<string>(cacheKey);
      if (cached !== null && cached !== undefined) {
        const parsed =
          typeof cached === "string" ? parseInt(cached, 10) : Number(cached);
        if (!Number.isNaN(parsed)) {
          return { unreadCount: parsed };
        }
      }
    } catch (err) {
      this.logger.debug(
        `unreadCount cache read failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    try {
      await this.redis.set(cacheKey, String(count), UNREAD_COUNT_CACHE_TTL);
    } catch {
      /* Redis 장애 무시 — TTL 내 자연 만료 */
    }
    return { unreadCount: count };
  }

  /** 외부(mark as read, 새 알림 생성 등)에서 캐시 무효화 */
  async invalidateUnreadCountCache(userId: string): Promise<void> {
    try {
      await this.redis.del(UNREAD_COUNT_CACHE_KEY(userId));
    } catch {
      /* noop */
    }
  }

  /**
   * notificationType 별 전체/미읽음 카운트 — 탭 뱃지·카테고리 통계용
   *
   * 페이지네이션과 무관하게 사용자의 전체 알림을 type 별로 groupBy 집계한다.
   * 프론트엔드 `aggregateStatsByCategory()` 가 deriveCategory 매핑으로 카테고리별 합산.
   */
  async getStatsByType(userId: string) {
    const [totals, unreads] = await Promise.all([
      this.prisma.notification.groupBy({
        by: ["notificationType"],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.notification.groupBy({
        by: ["notificationType"],
        where: { userId, isRead: false },
        _count: { _all: true },
      }),
    ]);

    const byType: Record<string, { total: number; unread: number }> = {};

    for (const row of totals) {
      byType[row.notificationType] = {
        total: row._count._all,
        unread: 0,
      };
    }

    for (const row of unreads) {
      if (byType[row.notificationType]) {
        byType[row.notificationType].unread = row._count._all;
      } else {
        // total 결과에 없는 경우(이론상 불가)에도 안전하게 기록
        byType[row.notificationType] = {
          total: row._count._all,
          unread: row._count._all,
        };
      }
    }

    return { byType };
  }

  /**
   * 알림 삭제
   */
  async deleteNotification(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    // 본인 알림이 아니면 존재 자체를 숨겨 404로 응답 (IDOR 방지)
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException("알림을 찾을 수 없습니다.");
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    void this.invalidateUnreadCountCache(notification.userId);

    return { id: notificationId };
  }

  /**
   * 내 알림 전체 읽음 처리
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    // 🔥 unread-count 캐시 무효화
    void this.invalidateUnreadCountCache(userId);

    return { updated: result.count };
  }

  /**
   * 내 알림 전체 삭제
   */
  async deleteAllNotifications(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });

    void this.invalidateUnreadCountCache(userId);

    return { deleted: result.count };
  }

  /**
   * 오래된 알림 삭제 (days 이전 생성된 알림)
   * days: 1~365 클램프
   */
  async deleteOldNotifications(userId: string, days: number) {
    const clampedDays = Math.max(1, Math.min(365, Math.floor(days || 30)));
    const cutoff = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000);

    const result = await this.prisma.notification.deleteMany({
      where: {
        userId,
        createdAt: { lt: cutoff },
      },
    });

    void this.invalidateUnreadCountCache(userId);

    return { deleted: result.count, days: clampedDays };
  }

  // ──────────────────────────────────────────────────────────────
  // 알림 수신 설정 (UserNotificationPreference)
  // ──────────────────────────────────────────────────────────────

  /**
   * 내 알림 설정 조회 — 없으면 기본값으로 upsert
   */
  async getMyNotificationPreference(userId: string) {
    const pref = await this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    return {
      pushEnabled: pref.pushEnabled,
      smsEnabled: pref.smsEnabled,
      emailEnabled: pref.emailEnabled,
      soundEnabled: pref.soundEnabled,
      vibrationEnabled: pref.vibrationEnabled,
      quietHoursEnabled: pref.quietHoursEnabled,
      quietHoursStart: pref.quietHoursStart,
      quietHoursEnd: pref.quietHoursEnd,
      categories: pref.categories,
      updatedAt: pref.updatedAt,
    };
  }

  /**
   * 내 알림 설정 수정 — 부분 업데이트
   */
  async updateMyNotificationPreference(
    userId: string,
    patch: {
      pushEnabled?: boolean;
      smsEnabled?: boolean;
      emailEnabled?: boolean;
      soundEnabled?: boolean;
      vibrationEnabled?: boolean;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
      categories?: Record<string, boolean>;
    },
  ) {
    const sanitized: Record<string, unknown> = {};
    if (typeof patch.pushEnabled === "boolean")
      sanitized.pushEnabled = patch.pushEnabled;
    if (typeof patch.smsEnabled === "boolean")
      sanitized.smsEnabled = patch.smsEnabled;
    if (typeof patch.emailEnabled === "boolean")
      sanitized.emailEnabled = patch.emailEnabled;
    if (typeof patch.soundEnabled === "boolean")
      sanitized.soundEnabled = patch.soundEnabled;
    if (typeof patch.vibrationEnabled === "boolean")
      sanitized.vibrationEnabled = patch.vibrationEnabled;
    if (typeof patch.quietHoursEnabled === "boolean")
      sanitized.quietHoursEnabled = patch.quietHoursEnabled;
    if (patch.quietHoursStart !== undefined)
      sanitized.quietHoursStart = patch.quietHoursStart;
    if (patch.quietHoursEnd !== undefined)
      sanitized.quietHoursEnd = patch.quietHoursEnd;
    if (patch.categories && typeof patch.categories === "object") {
      // 허용 키만 화이트리스트 필터 (class/payment/notice/system/marketing)
      // marketing: 광고성 정보 수신 동의 토글 (iOS 4.5.4 · 정보통신망법 제50조).
      // categories JSON 컬럼에 그대로 저장/반환되므로 Prisma 스키마 변경 불요.
      // ⚠️ 마케팅 성격 푸시 발송기 추가 시 발송 전 categories.marketing === false 사용자 제외 가드를 추가할 것.
      const allowed = ["class", "payment", "notice", "system", "marketing"];
      const filtered: Record<string, boolean> = {};
      for (const key of allowed) {
        if (typeof patch.categories[key] === "boolean") {
          filtered[key] = patch.categories[key];
        }
      }
      sanitized.categories = filtered;
    }

    const pref = await this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, ...sanitized },
      update: sanitized,
    });

    return {
      pushEnabled: pref.pushEnabled,
      smsEnabled: pref.smsEnabled,
      emailEnabled: pref.emailEnabled,
      soundEnabled: pref.soundEnabled,
      vibrationEnabled: pref.vibrationEnabled,
      quietHoursEnabled: pref.quietHoursEnabled,
      quietHoursStart: pref.quietHoursStart,
      quietHoursEnd: pref.quietHoursEnd,
      categories: pref.categories,
      updatedAt: pref.updatedAt,
    };
  }

  /**
   * AlimTalk 로그 생성 및 전송
   */
  async createAlimtalkLog(
    notificationId: string,
    phone: string,
    templateCode: string,
  ) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException("알림을 찾을 수 없습니다.");
    }

    // 알림톡 로그 생성 (상태: pending)
    const alimtalkLog = await this.prisma.alimtalkLog.create({
      data: {
        notificationId,
        phone,
        templateCode,
        status: "pending",
      },
    });

    return {
      id: alimtalkLog.id,
      notificationId: alimtalkLog.notificationId,
      phone: alimtalkLog.phone,
      templateCode: alimtalkLog.templateCode,
      status: alimtalkLog.status,
      createdAt: alimtalkLog.createdAt,
    };
  }

  /**
   * AlimTalk 전송 상태 업데이트
   */
  async updateAlimtalkStatus(
    alimtalkLogId: string,
    status: "sent" | "failed",
    responseData?: any,
  ) {
    const alimtalkLog = await this.prisma.alimtalkLog.findUnique({
      where: { id: alimtalkLogId },
    });

    if (!alimtalkLog) {
      throw new NotFoundException("알림톡 로그를 찾을 수 없습니다.");
    }

    if (alimtalkLog.status !== "pending") {
      throw new BadRequestException("이미 처리된 알림톡입니다.");
    }

    const updated = await this.prisma.alimtalkLog.update({
      where: { id: alimtalkLogId },
      data: {
        status,
        sentAt: status === "sent" ? new Date() : null,
        responseData: responseData || null,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      sentAt: updated.sentAt,
    };
  }

  /**
   * 실패한 알림톡 조회
   */
  async getFailedAlimtalks(limit: number = 10) {
    const failedLogs = await this.prisma.alimtalkLog.findMany({
      where: { status: "failed" },
      include: {
        notification: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return failedLogs.map((log) => ({
      id: log.id,
      notificationId: log.notificationId,
      phone: log.phone,
      templateCode: log.templateCode,
      status: log.status,
      createdAt: log.createdAt,
      notification: {
        title: log.notification.title,
        message: log.notification.message,
      },
    }));
  }

  /**
   * 알림 통계
   */
  async getNotificationStats(userId?: string) {
    const query = userId ? { userId } : {};

    const totalNotifications = await this.prisma.notification.count({
      where: query,
    });

    const unreadCount = await this.prisma.notification.count({
      where: {
        ...query,
        isRead: false,
      },
    });

    const readCount = totalNotifications - unreadCount;

    // 타입별 통계
    const notifications = await this.prisma.notification.findMany({
      where: query,
    });

    const typeStats: { [key: string]: number } = {};
    notifications.forEach((n) => {
      typeStats[n.notificationType] = (typeStats[n.notificationType] || 0) + 1;
    });

    // AlimTalk 통계
    const alimtalkSent = await this.prisma.alimtalkLog.count({
      where: { status: "sent" },
    });

    const alimtalkFailed = await this.prisma.alimtalkLog.count({
      where: { status: "failed" },
    });

    const alimtalkPending = await this.prisma.alimtalkLog.count({
      where: { status: "pending" },
    });

    return {
      totalNotifications,
      unreadCount,
      readCount,
      typeStats,
      alimtalk: {
        sent: alimtalkSent,
        failed: alimtalkFailed,
        pending: alimtalkPending,
      },
    };
  }

  /**
   * 알림 템플릿 및 메시지 렌더링
   */
  static renderTemplate(template: string, data: AlimtalkTemplateData): string {
    let message = template;
    Object.entries(data).forEach(([key, value]) => {
      message = message.replace(`{{${key}}}`, value);
    });
    return message;
  }

  /**
   * 표준 알림 생성
   */
  async createStandardNotification(
    userId: string,
    type: string,
    templateData: AlimtalkTemplateData,
  ) {
    const templates: { [key: string]: { title: string; message: string } } = {
      payment_success: {
        title: "결제 완료",
        message: "₩{{amount}}를 결제하셨습니다. (주문번호: {{orderNumber}})",
      },
      membership_approved: {
        title: "가입 승인",
        message: "{{clubName}} 클럽 가입이 승인되었습니다.",
      },
      class_created: {
        title: "새로운 수업",
        message: "{{className}} 수업이 등록되었습니다. ({{classDate}})",
      },
      attendance_reminder: {
        title: "수업 알림",
        message: "내일 {{className}} 수업이 있습니다. ({{classTime}})",
      },
      class_cancelled: {
        title: "수업 취소",
        message: "{{className}} 수업이 취소되었습니다. ({{cancelDate}})",
      },
    };

    const template = templates[type];
    if (!template) {
      throw new BadRequestException("지원하지 않는 알림 타입입니다.");
    }

    const title = NotificationsService.renderTemplate(
      template.title,
      templateData,
    );
    const message = NotificationsService.renderTemplate(
      template.message,
      templateData,
    );

    return this.createNotification({
      userId,
      notificationType: type,
      title,
      message,
    });
  }

  /**
   * 결제 완료 알림 발송
   *
   * 알림톡 + 앱 내 알림 동시 발송
   */
  async sendPaymentConfirmation(
    dto: SendPaymentConfirmationDto,
  ): Promise<void> {
    this.logger.log(`결제 완료 알림 발송: ${dto.userId}`);

    try {
      // 1. 사용자 정보 조회
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      });

      if (!user) {
        throw new NotFoundException("사용자를 찾을 수 없습니다.");
      }

      // 2. 앱 내 알림 생성
      const notification = await this.createNotification({
        userId: dto.userId,
        notificationType: "payment_success",
        title: "결제 완료",
        message: `${dto.className} 수업 결제가 완료되었습니다. (₩${dto.amount})`,
      });

      // 3. 알림톡 발송 (비동기 큐)
      const templateCode = this.configService.get<string>(
        "kakao.templateCodes.paymentSuccess",
      );

      if (!user.phone) {
        this.logger.warn(`알림톡 발송 스킵 (phone 없음): userId=${dto.userId}`);
        return;
      }

      await this.notificationQueue.addJob(
        {
          phone: user.phone,
          templateCode: templateCode || "PAYMENT_SUCCESS_001",
          templateData: {
            orderNumber: dto.orderNumber,
            className: dto.className,
            amount: dto.amount,
            startDate: dto.startDate,
          },
          userId: dto.userId,
        },
        notification.id,
      );

      this.logger.log(`결제 완료 알림 발송 성공: ${dto.userId}`);
    } catch (error) {
      this.logger.error(`결제 완료 알림 발송 실패: ${dto.userId}`, error);
      throw error;
    }
  }

  /**
   * 가입 승인 알림 발송
   */
  async sendMembershipApproval(dto: SendMembershipApprovalDto): Promise<void> {
    this.logger.log(`가입 승인 알림 발송: ${dto.userId}`);

    try {
      // 1. 사용자 정보 조회
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      });

      if (!user) {
        throw new NotFoundException("사용자를 찾을 수 없습니다.");
      }

      // 2. 앱 내 알림 생성
      const notification = await this.createNotification({
        userId: dto.userId,
        notificationType: "membership_approved",
        title: "가입 승인",
        message: `${dto.clubName} 클럽 가입이 승인되었습니다.`,
      });

      // 3. 알림톡 발송 (비동기 큐)
      const templateCode = this.configService.get<string>(
        "kakao.templateCodes.membershipApproved",
      );

      if (!user.phone) {
        this.logger.warn(`알림톡 발송 스킵 (phone 없음): userId=${dto.userId}`);
        return;
      }

      await this.notificationQueue.addJob(
        {
          phone: user.phone,
          templateCode: templateCode || "MEMBERSHIP_APPROVED_001",
          templateData: {
            name: dto.clubName,
            coachName: dto.coachName,
          },
          userId: dto.userId,
        },
        notification.id,
      );

      this.logger.log(`가입 승인 알림 발송 성공: ${dto.userId}`);
    } catch (error) {
      this.logger.error(`가입 승인 알림 발송 실패: ${dto.userId}`, error);
      throw error;
    }
  }

  /**
   * 수업 리마인더 발송
   */
  async sendClassReminder(dto: SendClassReminderDto): Promise<void> {
    this.logger.log(`수업 리마인더 발송: ${dto.userId}`);

    try {
      // 1. 사용자 정보 조회
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      });

      if (!user) {
        throw new NotFoundException("사용자를 찾을 수 없습니다.");
      }

      // 2. 앱 내 알림 생성
      const notification = await this.createNotification({
        userId: dto.userId,
        notificationType: "class_reminder",
        title: "수업 알림",
        message: `내일 ${dto.className} 수업이 있습니다. (${dto.classTime})`,
      });

      // 3. 알림톡 발송 (비동기 큐)
      const templateCode = this.configService.get<string>(
        "kakao.templateCodes.classReminder",
      );

      if (!user.phone) {
        this.logger.warn(`알림톡 발송 스킵 (phone 없음): userId=${dto.userId}`);
        return;
      }

      await this.notificationQueue.addJob(
        {
          phone: user.phone,
          templateCode: templateCode || "CLASS_REMINDER_001",
          templateData: {
            className: dto.className,
            classDate: dto.classDate,
            classTime: dto.classTime,
          },
          userId: dto.userId,
        },
        notification.id,
      );

      this.logger.log(`수업 리마인더 발송 성공: ${dto.userId}`);
    } catch (error) {
      this.logger.error(`수업 리마인더 발송 실패: ${dto.userId}`, error);
      throw error;
    }
  }

  /**
   * 출석 확인 알림 발송
   */
  async sendAttendanceConfirmation(
    dto: SendAttendanceConfirmationDto,
  ): Promise<void> {
    this.logger.log(`출석 확인 알림 발송: ${dto.userId}`);

    try {
      // 1. 사용자 정보 조회
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      });

      if (!user) {
        throw new NotFoundException("사용자를 찾을 수 없습니다.");
      }

      // 2. 앱 내 알림 생성
      const notification = await this.createNotification({
        userId: dto.userId,
        notificationType: "attendance_confirmed",
        title: "출석 확인",
        message: `${dto.className} 출석이 확인되었습니다. (잔여: ${dto.creditsRemaining}회)`,
      });

      // 3. 알림톡 발송 (비동기 큐)
      const templateCode = this.configService.get<string>(
        "kakao.templateCodes.attendanceConfirmed",
      );

      if (!user.phone) {
        this.logger.warn(`알림톡 발송 스킵 (phone 없음): userId=${dto.userId}`);
        return;
      }

      await this.notificationQueue.addJob(
        {
          phone: user.phone,
          templateCode: templateCode || "ATTENDANCE_CONFIRMED_001",
          templateData: {
            className: dto.className,
            attendanceDate: dto.attendanceDate,
            creditsRemaining: dto.creditsRemaining,
          },
          userId: dto.userId,
        },
        notification.id,
      );

      this.logger.log(`출석 확인 알림 발송 성공: ${dto.userId}`);
    } catch (error) {
      this.logger.error(`출석 확인 알림 발송 실패: ${dto.userId}`, error);
      throw error;
    }
  }

  /**
   * 크레딧 만료 예정 알림 발송
   */
  async sendCreditExpiry(dto: SendCreditExpiryDto): Promise<void> {
    this.logger.log(`크레딧 만료 알림 발송: ${dto.userId}`);

    try {
      // 1. 사용자 정보 조회
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      });

      if (!user) {
        throw new NotFoundException("사용자를 찾을 수 없습니다.");
      }

      // 2. 앱 내 알림 생성
      const notification = await this.createNotification({
        userId: dto.userId,
        notificationType: "credit_expiry",
        title: "크레딧 만료 예정",
        message: `${dto.className} 크레딧 ${dto.creditsRemaining}회가 ${dto.expiryDate}에 만료됩니다.`,
      });

      // 3. 알림톡 발송 (비동기 큐)
      const templateCode = this.configService.get<string>(
        "kakao.templateCodes.creditExpiry",
      );

      if (!user.phone) {
        this.logger.warn(`알림톡 발송 스킵 (phone 없음): userId=${dto.userId}`);
        return;
      }

      await this.notificationQueue.addJob(
        {
          phone: user.phone,
          templateCode: templateCode || "CREDIT_EXPIRY_001",
          templateData: {
            className: dto.className,
            creditsRemaining: dto.creditsRemaining,
            expiryDate: dto.expiryDate,
          },
          userId: dto.userId,
        },
        notification.id,
      );

      this.logger.log(`크레딧 만료 알림 발송 성공: ${dto.userId}`);
    } catch (error) {
      this.logger.error(`크레딧 만료 알림 발송 실패: ${dto.userId}`, error);
      throw error;
    }
  }

  /**
   * 관리자 전체/역할별 Push 발송
   *
   * FCM을 통해 실제 푸시를 발송하고 결과를 PushNotificationLog + AuditLog에 기록합니다.
   * FCM이 초기화되지 않은 경우(환경변수 미설정) 로그 기록만 수행합니다.
   *
   * @param isMarketing 광고성 메시지 여부 (true이면 야간 발송 제한 적용)
   */
  async sendAdminPush(
    title: string,
    bodyText: string,
    targetType: "all" | "role" | "specific",
    role?: string,
    adminId?: string,
    isMarketing: boolean = false,
    userIds?: string[],
  ) {
    // 야간 마케팅 발송 제한 (정보통신망법 제50조)
    if (isMarketing && this.isNightTimeKST()) {
      this.logger.warn(
        `야간 광고성 Push 발송 차단: admin=${adminId}, title="${title}"`,
      );
      throw new BadRequestException(
        "야간 시간대(21:00~08:00)에는 광고성 메시지를 발송할 수 없습니다. (정보통신망법 제50조)",
      );
    }

    // 개인 타겟은 대상 userIds 필수
    if (targetType === "specific" && (!userIds || userIds.length === 0)) {
      throw new BadRequestException("개인 발송 대상(userIds)이 필요합니다.");
    }
    if (targetType === "role" && !role) {
      throw new BadRequestException("역할 발송 대상(role)이 필요합니다.");
    }

    // ── 대상 userId 산출 (인앱 알림 적재 + 광고성 수신거부 필터에 사용) ──
    // all 은 전체 디바이스를 직접 조회하므로 개별 userId 목록을 산출하지 않는다(대량 회피).
    let recipientUserIds: string[] = [];
    if (targetType === "specific") {
      recipientUserIds = Array.from(new Set((userIds ?? []).filter(Boolean)));
    } else if (targetType === "role") {
      const users = await this.prisma.user.findMany({
        where: { userType: role as import("@prisma/client").UserType },
        select: { id: true },
      });
      recipientUserIds = users.map((u) => u.id);
    }

    // 광고성 발송 시 수신거부(pushEnabled=false) 제외 (정보성/시스템 공지는 전체 발송 유지).
    // all + 광고성은 디바이스 직접 조회라 user 단위 필터가 어려우므로, 광고성 전체 발송은
    // role/specific 경로 사용을 권장한다.
    if (isMarketing && recipientUserIds.length > 0) {
      recipientUserIds = await this.filterPushEnabled(recipientUserIds);
    }

    // 인앱 알림 적재 — 관리자가 명시적으로 고른 specific 대상만 알림함에 남긴다.
    // (all/role 광역 발송은 알림함 대량 적재를 피하고 푸시 + PushNotificationLog 로만 추적.)
    if (targetType === "specific" && recipientUserIds.length > 0) {
      const inAppType = isMarketing ? "admin_push_marketing" : "admin_push";
      await this.prisma.notification.createMany({
        data: recipientUserIds.map((uid) => ({
          userId: uid,
          notificationType: inAppType,
          title,
          message: bodyText,
          linkUrl: null,
          isRead: false,
        })),
      });
      await Promise.allSettled(
        recipientUserIds.map((uid) => this.invalidateUnreadCountCache(uid)),
      );
      if (this.notificationsGateway) {
        try {
          await this.notificationsGateway.sendToUsers(recipientUserIds, {
            id: "",
            type: inAppType,
            title,
            message: bodyText,
            createdAt: new Date(),
          });
        } catch (error) {
          this.logger.warn(`Admin Push WebSocket 발송 실패: ${error}`);
        }
      }
    }

    // ── FCM 발송 대상 디바이스 조회 ──
    // role+정보성은 relation 필터(효율적), role+광고성/specific 은 수신거부가 반영된
    // recipientUserIds 로 IN 조회, all 은 전체 활성 디바이스.
    const deviceWhere: import("@prisma/client").Prisma.UserDeviceWhereInput = {
      isActive: true,
    };
    if (targetType === "specific") {
      deviceWhere.userId = { in: recipientUserIds };
    } else if (targetType === "role") {
      if (isMarketing) {
        deviceWhere.userId = { in: recipientUserIds };
      } else {
        deviceWhere.user = {
          is: { userType: role as import("@prisma/client").UserType },
        };
      }
    }

    const devices = await this.prisma.userDevice.findMany({
      where: deviceWhere,
      select: { fcmToken: true, userId: true },
    });

    // 동일 fcmToken 중복 제거(안전망) — 같은 물리 기기가 여러 active row 에 걸쳐도 1회만.
    const tokens = Array.from(
      new Set(devices.map((d) => d.fcmToken).filter(Boolean) as string[]),
    );

    this.logger.log(
      `Admin Push 발송: ${tokens.length}개 기기, admin=${adminId}`,
    );

    // FCM 실제 발송
    let successCount = 0;
    let failCount = 0;
    let status = "pending";

    if (tokens.length > 0) {
      const fcmResult = await this.fcmService.sendToTokens(
        tokens,
        title,
        bodyText,
        {
          targetType,
          role: role ?? "",
          source: "admin_push",
        },
      );

      successCount = fcmResult.successCount;
      failCount = fcmResult.failureCount;

      if (successCount === tokens.length) {
        status = "sent";
      } else if (successCount === 0) {
        status = "failed";
      } else {
        status = "partial";
      }
    } else {
      status = "failed";
    }

    // PushNotificationLog + AuditLog 동시 기록
    const [pushLog] = await this.prisma.$transaction([
      this.prisma.pushNotificationLog.create({
        data: {
          title,
          body: bodyText,
          targetType,
          targetValue:
            targetType === "specific"
              ? JSON.stringify(userIds ?? [])
              : (role ?? null),
          sentBy: adminId ?? "",
          totalCount: tokens.length,
          successCount,
          failCount,
          status,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: adminId ?? null,
          action: "ADMIN_PUSH_SENT",
          resource: "notifications",
          newValue: {
            title,
            body: bodyText,
            targetType,
            role: role ?? null,
            deviceCount: tokens.length,
            successCount,
            failCount,
          },
        },
      }),
    ]);

    return {
      success: successCount > 0 || tokens.length === 0,
      sentCount: successCount,
      failedCount: failCount,
      totalDevices: tokens.length,
      pushLogId: pushLog.id,
      message:
        tokens.length === 0
          ? "발송 대상 기기가 없습니다."
          : `${tokens.length}개 기기 중 ${successCount}개 발송 성공, ${failCount}개 실패`,
    };
  }

  /**
   * FCM 푸시 비동기 발송 (fire-and-forget)
   *
   * createNotification에서 호출됩니다. 발송 실패해도 알림 생성에 영향을 주지 않으며
   * 에러는 로그로만 기록됩니다.
   *
   * @param userId 대상 사용자 ID
   * @param title 알림 제목
   * @param message 알림 본문
   * @param data 추가 데이터 페이로드
   */
  private sendFcmPushAsync(
    userId: string,
    title: string,
    message: string,
    data?: FcmDataPayload,
  ): void {
    this.fcmService
      .sendPushNotification(userId, title, message, data)
      .then((result) => {
        if (result.successCount > 0) {
          this.logger.debug(
            `FCM 푸시 발송 완료: userId=${userId}, 성공=${result.successCount}`,
          );
        }
      })
      .catch((error) => {
        this.logger.warn(
          `FCM 푸시 발송 실패 (userId=${userId}): ${error.message}`,
        );
      });
  }

  /**
   * 관리자 Push 발송 이력 조회
   * PushNotificationLog 모델에서 페이지네이션 + 필터 조회
   */
  async getPushHistory(params: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, startDate, endDate, status, search } = params;
    const skip = (page - 1) * limit;

    const where: import("@prisma/client").Prisma.PushNotificationLogWhereInput =
      {
        ...(startDate || endDate
          ? {
              sentAt: {
                ...(startDate && { gte: startDate }),
                ...(endDate && { lte: endDate }),
              },
            }
          : {}),
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { body: { contains: search } },
              ],
            }
          : {}),
      };

    const [logs, total] = await Promise.all([
      this.prisma.pushNotificationLog.findMany({
        where,
        select: {
          id: true,
          title: true,
          body: true,
          targetType: true,
          targetValue: true,
          sentBy: true,
          sentAt: true,
          totalCount: true,
          successCount: true,
          failCount: true,
          status: true,
          createdAt: true,
        },
        orderBy: { sentAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.pushNotificationLog.count({ where }),
    ]);

    return {
      data: logs.map((log) => ({
        id: log.id,
        title: log.title,
        body: log.body,
        targetType: log.targetType,
        targetValue: log.targetValue,
        sentBy: log.sentBy,
        sentAt: log.sentAt,
        totalCount: log.totalCount,
        successCount: log.successCount,
        failCount: log.failCount,
        status: log.status,
        createdAt: log.createdAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ──────────────────────────────────────────────────────────────
  // 등록 관련 인앱 알림 — 카카오 알림톡 X (인앱 + FCM 만)
  // ──────────────────────────────────────────────────────────────

  /**
   * 다음달 정기권 등록 오픈 알림
   *
   * @param userId 학부모 User.id
   * @param className 수업명
   * @param monthLabel 월 라벨 (예: "6월")
   */
  async sendEnrollmentOpen(
    userId: string,
    className: string,
    monthLabel: string,
  ) {
    return this.createNotification({
      userId,
      notificationType: "enrollment_open",
      title: `${monthLabel} 정기권 등록이 시작됐습니다`,
      message: `[${className}] ${monthLabel} 정기권 등록이 열렸습니다. 마감일까지 결제를 완료해주세요.`,
      linkUrl: "/classes",
    });
  }

  /**
   * 등록 마감 D-1 알림
   *
   * @param userId 학부모 User.id
   * @param className 수업명
   * @param monthLabel 월 라벨 (예: "6월")
   */
  async sendEnrollmentDeadline(
    userId: string,
    className: string,
    monthLabel: string,
  ) {
    return this.createNotification({
      userId,
      notificationType: "enrollment_deadline",
      title: "오늘이 등록 마지막 날입니다",
      message: `[${className}] ${monthLabel} 정기권 등록이 오늘 마감됩니다.`,
      linkUrl: "/classes",
    });
  }
}
