import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { NotificationQueue } from "./notification.queue";
import {
  FcmService,
  FcmDataPayload,
  visibleNotificationWhere,
  visibleUnreadNotificationWhere,
} from "./fcm.service";
import { PushPolicyService } from "./push-policy.service";
import { buildPushData } from "./push-payload";
import {
  MARKETING_NOTIFICATION_TYPES,
  decorateAdvertisingMessage,
  isMarketingNotificationType,
  isNightTimeKST,
} from "@/common/utils/advertising.util";
import { ConfigService } from "@nestjs/config";
import { NotificationsGateway } from "@/websocket/notifications.gateway";
import { UpdateNotificationPreferenceDto } from "./dto/update-notification-preference.dto";
import { requiresGuardianConsent } from "@/common/utils/age.util";

// 🔥 unread-count 캐시 키 (고빈도 — 모든 페이지에서 뱃지 호출) — gateway 와 공유
import {
  UNREAD_COUNT_CACHE_KEY,
  UNREAD_COUNT_CACHE_TTL,
} from "./notification-cache";
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
 * 광고성/마케팅 알림 타입 목록은 `@/common/utils/advertising.util` 이 단일 SoT다
 * (푸시·SMS·알림톡 3경로 공용). 하위 호환을 위해 re-export 만 유지한다.
 */
export { MARKETING_NOTIFICATION_TYPES };

export interface AlimtalkTemplateData {
  [key: string]: string;
}

/** 관리자 광역(all/role) Push 브로드캐스트 큐 잡 데이터 */
export interface AdminPushJobData {
  pushLogId: string;
  title: string;
  body: string;
  targetType: "all" | "role";
  role?: string;
  isMarketing: boolean;
  data: FcmDataPayload;
}

export interface NotificationPreferenceAuditContext {
  ipAddress?: string;
  platform?: string;
  userAgent?: string;
}

const DEFAULT_NOTIFICATION_CATEGORIES: Record<string, boolean> = {
  class: true,
  payment: true,
  notice: true,
  system: true,
};
const PREFERENCE_TX_MAX_RETRIES = 3;

function notificationCategories(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_NOTIFICATION_CATEGORIES };
  }

  const result: Record<string, boolean> = {};
  for (const [key, categoryEnabled] of Object.entries(value)) {
    if (typeof categoryEnabled === "boolean") {
      result[key] = categoryEnabled;
    }
  }
  return result;
}

function canGrantMarketingConsent(user: {
  userType: string;
  birthDate: Date | null;
}): boolean {
  if (user.userType === "CHILD") return false;
  if (user.userType === "TEEN" && !user.birthDate) return false;
  return (
    !user.birthDate || !requiresGuardianConsent(user.birthDate)
  );
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationQueue: NotificationQueue,
    private readonly fcmService: FcmService,
    private readonly pushPolicy: PushPolicyService,
    private readonly configService: ConfigService,
    @InjectQueue("push") private readonly pushQueue: Queue,
    @Optional()
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly notificationsGateway?: NotificationsGateway,
  ) {}

  /** 마케팅 동의 SoT와 호환 미러가 동시 요청에서도 함께 커밋되도록 직렬화한다. */
  private async withPreferenceSerializableRetry<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const isSerializationConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";
        if (
          !isSerializationConflict ||
          attempt >= PREFERENCE_TX_MAX_RETRIES
        ) {
          throw error;
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 야간 마케팅 발송 제한 (정보통신망법 제50조)
  // KST 21:00 ~ 08:00 광고성 메시지 발송 금지
  // ──────────────────────────────────────────────────────────────

  /**
   * 현재 시각이 야간 시간대(KST 21:00~08:00)인지 판별.
   * 판정 로직은 advertising.util(푸시·SMS·알림톡 공용 SoT)에 위임한다.
   */
  private isNightTimeKST(): boolean {
    return isNightTimeKST();
  }

  /**
   * 주어진 알림 타입이 광고성(마케팅) 메시지인지 판별
   */
  private isMarketingNotification(notificationType: string): boolean {
    return isMarketingNotificationType(notificationType);
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

    // 광고성이면 '(광고)' 표기 + 전송자 명칭·연락처 + 무료 수신거부 방법을 삽입한다 (§50④).
    // 알림함에 남는 문구와 실제 발송(푸시·WebSocket) 문구를 동일하게 유지하려고 저장 전에 가공한다.
    const decorated = this.isMarketingNotification(dto.notificationType)
      ? decorateAdvertisingMessage(dto.title, dto.message)
      : null;
    const title = decorated?.title ?? dto.title;
    const message = decorated?.body ?? dto.message;

    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        notificationType: dto.notificationType,
        title,
        message,
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
    // linkUrl 포함(계약 v1) — 알림함 클릭과 푸시 탭이 같은 목적지로 이동한다.
    this.sendFcmPushAsync(
      dto.userId,
      notification.title,
      notification.message,
      buildPushData({
        type: notification.notificationType,
        linkUrl: notification.linkUrl,
        notificationId: notification.id,
      }),
      notification.notificationType,
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

  /**
   * 푸시 정책(수신거부·마케팅 수신동의·카테고리·방해금지)을 통과한 FCM 발송 대상 반환.
   * 정책 로직은 PushPolicyService(단일 SoT)로 이관 — 여기는 위임 래퍼.
   */
  private async filterPushEnabled(
    userIds: string[],
    notificationType?: string,
    isMarketing?: boolean,
  ): Promise<string[]> {
    const { allowed } = await this.pushPolicy.filterRecipients(userIds, {
      notificationType,
      isMarketing,
    });
    return allowed;
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
    if (unique.length === 0) return;

    // 인앱 알림은 전원 적재 — 수신거부/방해금지는 '푸시' 억제이지 알림함 차단이
    // 아니다. FCM 만 아래 정책 게이트를 통과한 대상에게 발송한다.
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({
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
      unique.map((userId) => this.invalidateUnreadCountCache(userId)),
    );

    // WebSocket 실시간 (best-effort)
    if (this.notificationsGateway) {
      try {
        await this.notificationsGateway.sendToUsers(unique, {
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

    // FCM 배치 발송 — 정책 게이트(수신거부·카테고리·방해금지) 통과 대상만.
    // 정책 조회까지 try 로 감싸 FCM 발송 실패가 알림 생성(이미 완료)에 영향 없게 격리.
    try {
      const targets = await this.filterPushEnabled(
        unique,
        payload.notificationType,
      );
      if (targets.length === 0) return;

      await this.fcmService.sendPushToUsers(
        targets,
        payload.title,
        payload.message,
        buildPushData({
          type: payload.notificationType,
          linkUrl: payload.linkUrl,
        }),
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
    if (unique.length === 0) return;

    // 정책 조회(filterPushEnabled → prisma)까지 포함해 통째로 격리한다. 이 메서드는
    // 호출부에서 `void`(fire-and-forget)로 쓰이므로(예: attendance 정정/수동마킹),
    // 정책 DB 조회가 throw 하면 unhandled promise rejection 이 된다 — 절대 reject 하지 않는다.
    try {
      const targets = await this.filterPushEnabled(
        unique,
        payload.notificationType,
      );
      if (targets.length === 0) return;

      await this.fcmService.sendPushToUsers(
        targets,
        payload.title,
        payload.message,
        buildPushData({
          type: payload.notificationType,
          linkUrl: payload.linkUrl,
        }),
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

  /**
   * [2026-07-20 팀공지 수신자 확대] 팀 전체 수신 풀(직접 멤버 ∪ 학부모 ∪ 감독/코치)에게
   * 일괄 알림 — 팀 공지 등 "팀 구성원 전원" 대상 이벤트용.
   *
   * 기존 notifyTeamParents 는 ParentChild 링크가 있는 학부모만 대상이라, 폰을 가진
   * 선수 본인(TEEN)·감독/코치·링크 미연결 팀은 팀 공지 푸시를 전혀 받지 못했다
   * (링크 0건이면 조용히 0명 발송). 수신 풀 기준은 수동 팀 Push(sendTeamPush)의
   * IDOR 검증 풀과 동일하다 (PUSH_NOTIFICATION_GUIDE §2).
   */
  async notifyTeamAudience(
    teamId: string,
    payload: {
      notificationType: string;
      title: string;
      message: string;
      linkUrl?: string;
    },
    options?: { excludeUserIds?: string[] },
  ): Promise<void> {
    try {
      const [memberRows, parentIds, managerIds] = await Promise.all([
        this.prisma.teamMember.findMany({
          where: {
            teamId,
            approvalStatus: "approved",
            leftAt: null,
            user: { status: { not: "WITHDRAWN" } },
          },
          select: { userId: true },
        }),
        this.getTeamParentUserIds(teamId),
        this.getTeamManagerUserIds(teamId),
      ]);
      const exclude = new Set(options?.excludeUserIds ?? []);
      const audience = Array.from(
        new Set([
          ...memberRows.map((m) => m.userId),
          ...parentIds,
          ...managerIds,
        ]),
      ).filter((id) => !!id && !exclude.has(id));
      if (audience.length === 0) {
        this.logger.warn(
          `notifyTeamAudience: 발송 대상 0명 (team=${teamId}) — ` +
            `승인 멤버/학부모 링크/매니저 구성을 확인하세요.`,
        );
        return;
      }
      await this.notifyUsers(audience, payload);
    } catch (error) {
      this.logger.warn(`notifyTeamAudience 실패: team=${teamId}, ${error}`);
    }
  }

  /**
   * [2026-07-20 시스템 공지 푸시] 전체 활성 앱 사용자에게 일괄 알림+푸시.
   * 시스템 공지(targetTeamId=null) 생성처럼 "서비스 전체 공지" 이벤트용.
   * - 대상: 탈퇴/휴면 제외(ACTIVE) + soft-delete 제외 + 앱 로그인 가능 역할만
   *   (SYSTEM/OPER 어드민 콘솔 계정 제외 — chldiv=ADM)
   * - 인앱 적재/수신거부 필터/FCM 배치는 notifyUsers 가 처리.
   */
  async notifyAllAppUsers(
    payload: {
      notificationType: string;
      title: string;
      message: string;
      linkUrl?: string;
    },
    options?: { excludeUserIds?: string[] },
  ): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        where: {
          status: "ACTIVE",
          deletedAt: null,
          userType: {
            in: [
              "ADMIN",
              "DIRECTOR",
              "ACADEMY_DIRECTOR",
              "COACH",
              "PARENT",
              "TEEN",
              "CHILD",
            ],
          },
        },
        select: { id: true },
      });
      const exclude = new Set(options?.excludeUserIds ?? []);
      const audience = users.map((u) => u.id).filter((id) => !exclude.has(id));
      if (audience.length === 0) return;
      await this.notifyUsers(audience, payload);
    } catch (error) {
      this.logger.warn(`notifyAllAppUsers 실패: ${error}`);
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
    excludeTypes?: string[],
  ) {
    // types(화이트리스트) 우선, 없으면 excludeTypes(제외 기반).
    //   공지 탭은 "다른 카테고리에 속하지 않는 나머지" 라 제외 방식으로 조회한다
    //   — 프론트 카탈로그 갱신 누락으로 신규 유형이 목록에서 빠지던 문제 차단.
    const typeFilter =
      types && types.length > 0
        ? { in: types }
        : excludeTypes && excludeTypes.length > 0
          ? { notIn: excludeTypes }
          : undefined;
    const where: import("@prisma/client").Prisma.NotificationWhereInput = {
      userId,
      ...(typeFilter ? { notificationType: typeFilter } : {}),
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
    // iOS 앱 아이콘 뱃지 하향 동기화 — 읽어도 뱃지가 남던 문제의 서버측 해소.
    void this.fcmService.sendBadgeSync(updated.userId);
    // 공지 알림이면 공지 읽음(NoticeRead)도 함께 마킹 — 이중 읽음 시스템 동기화.
    void this.syncNoticeReadFromLinkUrl(updated.userId, updated.linkUrl);

    return {
      id: updated.id,
      isRead: updated.isRead,
      readAt: updated.readAt,
    };
  }

  /**
   * [2026-07-20 읽음 동기화 A→B] 알림함 읽음 → 공지 읽음(NoticeRead) 동기화.
   * linkUrl 이 `/notice/{id}` 인 알림을 읽으면 대응 SystemNotice 의 NoticeRead 를
   * upsert 한다. 실패는 격리(읽음 처리 본 흐름에 영향 없음).
   */
  private async syncNoticeReadFromLinkUrl(
    userId: string,
    linkUrl?: string | null,
  ): Promise<void> {
    try {
      const noticeId = this.parseNoticeIdFromLinkUrl(linkUrl);
      if (!noticeId) return;
      // FK 보호 — 삭제된 공지의 잔존 알림이면 skip.
      const exists = await this.prisma.systemNotice.findUnique({
        where: { id: noticeId },
        select: { id: true },
      });
      if (!exists) return;
      await this.prisma.noticeRead.upsert({
        where: { noticeId_userId: { noticeId, userId } },
        create: { noticeId, userId },
        update: { readAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`공지 읽음 동기화 실패 (userId=${userId}): ${error}`);
    }
  }

  /** `/notice/{id}` 형태의 linkUrl 에서 noticeId 추출 (그 외 형태는 null). */
  private parseNoticeIdFromLinkUrl(linkUrl?: string | null): string | null {
    if (!linkUrl) return null;
    const match = /^\/notice\/([^/?#]+)$/.exec(linkUrl);
    return match ? match[1] : null;
  }

  /**
   * [2026-07-20 읽음 동기화 B→A] 공지 읽음 → 알림함(Notification) 동기화.
   * 공지 상세 열람/공지 읽음 처리 시, 같은 공지를 가리키는(linkUrl 일치) 미읽음
   * 알림 행을 읽음 처리해 벨 카운트·iOS 뱃지가 함께 내려가게 한다.
   */
  async markNotificationsReadByLinkUrls(
    userId: string,
    linkUrls: string[],
  ): Promise<number> {
    if (linkUrls.length === 0) return 0;
    try {
      const result = await this.prisma.notification.updateMany({
        where: { userId, isRead: false, linkUrl: { in: linkUrls } },
        data: { isRead: true, readAt: new Date() },
      });
      if (result.count > 0) {
        // [Phase 4 · AC 4-3] unread 캐시 무효화는 **응답 전 완료** — void 로 흘리면
        // 클라이언트가 응답 직후 재조회한 벨 카운트가 30초 TTL 스테일을 읽는다.
        // FCM badge sync 만 기존 best-effort 비동기 유지.
        await this.invalidateUnreadCountCache(userId);
        void this.fcmService.sendBadgeSync(userId);
      }
      return result.count;
    } catch (error) {
      this.logger.warn(
        `linkUrl 기반 알림 읽음 동기화 실패 (userId=${userId}): ${error}`,
      );
      return 0;
    }
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

    // [2026-07-20] iOS 뱃지(fcm.service countUnread)·웹 목록(isNotificationVisible)과
    //   동일한 '표시되는 미읽음' 기준으로 통일 — 숨김 유형·21일 초과 알림이 벨/뱃지
    //   카운트에 유령으로 남아 클리어되지 않던 문제 해소.
    const count = await this.prisma.notification.count({
      where: { userId, ...visibleUnreadNotificationWhere() },
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
    // 탭 배지·통계 칩 전용 집계. 목록(useNotifications) 이 21일·숨김 유형을 걸러
    //   보여주므로 집계도 같은 범위로 세야 한다 — 전체 기간을 세면 "배지에 숫자는
    //   있는데 탭을 열면 없는" 불일치가 생긴다(벨·앱 뱃지는 이미 같은 기준).
    const visible = visibleNotificationWhere();
    const [totals, unreads] = await Promise.all([
      this.prisma.notification.groupBy({
        by: ["notificationType"],
        where: { userId, ...visible },
        _count: { _all: true },
      }),
      this.prisma.notification.groupBy({
        by: ["notificationType"],
        where: { userId, isRead: false, ...visible },
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
    // 미읽음 삭제 시 iOS 뱃지도 함께 하향.
    if (!notification.isRead) {
      void this.fcmService.sendBadgeSync(notification.userId);
    }

    return { id: notificationId };
  }

  /**
   * 내 알림 전체 읽음 처리
   */
  async markAllAsRead(userId: string) {
    // 공지 알림(linkUrl=/notice/{id})은 읽음 처리 전에 수집 — 공지 읽음(NoticeRead)
    // 동기화 대상 (이중 읽음 시스템 정합).
    const noticeLinked = await this.prisma.notification.findMany({
      where: {
        userId,
        isRead: false,
        linkUrl: { startsWith: "/notice/" },
      },
      select: { linkUrl: true },
    });

    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    // 🔥 unread-count 캐시 무효화
    void this.invalidateUnreadCountCache(userId);
    // iOS 앱 아이콘 뱃지 0 동기화 — '전체 읽음' 후에도 뱃지가 남던 문제 해소.
    void this.fcmService.sendBadgeSync(userId);
    // 공지 읽음(NoticeRead) 일괄 동기화 (best-effort, 실패 격리)
    void this.syncNoticeReadsBulk(userId, noticeLinked);

    return { updated: result.count };
  }

  /** markAllAsRead 보조 — 공지 알림들의 NoticeRead 일괄 upsert (실패 격리). */
  private async syncNoticeReadsBulk(
    userId: string,
    rows: Array<{ linkUrl: string | null }>,
  ): Promise<void> {
    try {
      const noticeIds = Array.from(
        new Set(
          rows
            .map((r) => this.parseNoticeIdFromLinkUrl(r.linkUrl))
            .filter((id): id is string => !!id),
        ),
      );
      if (noticeIds.length === 0) return;
      // FK 보호 — 실존 공지만 createMany.
      const existing = await this.prisma.systemNotice.findMany({
        where: { id: { in: noticeIds } },
        select: { id: true },
      });
      if (existing.length === 0) return;
      await this.prisma.noticeRead.createMany({
        data: existing.map((n) => ({ noticeId: n.id, userId })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn(`공지 읽음 일괄 동기화 실패 (userId=${userId}): ${error}`);
    }
  }

  /**
   * 내 알림 전체 삭제
   */
  async deleteAllNotifications(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });

    void this.invalidateUnreadCountCache(userId);
    void this.fcmService.sendBadgeSync(userId);

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
    void this.fcmService.sendBadgeSync(userId);

    return { deleted: result.count, days: clampedDays };
  }

  // ──────────────────────────────────────────────────────────────
  // 알림 수신 설정 (UserNotificationPreference)
  // ──────────────────────────────────────────────────────────────

  /**
   * 내 알림 설정 조회 — 없으면 기본값으로 upsert
   */
  async getMyNotificationPreference(userId: string) {
    const queriedAt = new Date();
    const [pref, user, marketingTerms] = await this.prisma.$transaction([
      this.prisma.userNotificationPreference.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          marketingConsent: true,
          userType: true,
          birthDate: true,
        },
      }),
      this.prisma.appTerms.findFirst({
        where: {
          type: "marketing",
          isActive: true,
          publishedAt: { lte: queriedAt },
        },
        select: { version: true },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    const categories = {
      ...notificationCategories(pref.categories),
      marketing: user.marketingConsent,
    };

    return {
      pushEnabled: pref.pushEnabled,
      smsEnabled: pref.smsEnabled,
      emailEnabled: pref.emailEnabled,
      soundEnabled: pref.soundEnabled,
      vibrationEnabled: pref.vibrationEnabled,
      quietHoursEnabled: pref.quietHoursEnabled,
      quietHoursStart: pref.quietHoursStart,
      quietHoursEnd: pref.quietHoursEnd,
      categories,
      marketingConsent: user.marketingConsent,
      marketingConsentGrantAllowed: canGrantMarketingConsent(user),
      marketingConsentTermsVersion: marketingTerms?.version ?? null,
      updatedAt: pref.updatedAt,
    };
  }

  /**
   * 내 알림 설정 수정 — 부분 업데이트
   */
  async updateMyNotificationPreference(
    userId: string,
    patch: UpdateNotificationPreferenceDto,
    context: NotificationPreferenceAuditContext = {},
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
    const categoryPatch: Record<string, boolean> = {};
    if (patch.categories && typeof patch.categories === "object") {
      // 허용 키만 화이트리스트 필터 (class/payment/notice/system/marketing)
      // marketing: 광고성 정보 수신 동의 토글 (iOS 4.5.4 · 정보통신망법 제50조).
      // categories JSON 컬럼에 그대로 저장/반환되므로 Prisma 스키마 변경 불요.
      // 이 토글은 PushPolicyService.filterRecipients 의 카테고리 필터가 실제로 존중한다
      // (categoryOfNotificationType 이 marketing 계열 타입을 'marketing' 으로 매핑).
      // 법정 사전동의(opt-in) 자체는 User.marketingConsent 가 1순위 기준이다.
      const allowed = ["class", "payment", "notice", "system", "marketing"];
      for (const key of allowed) {
        const value = patch.categories[key as keyof typeof patch.categories];
        if (typeof value === "boolean") {
          categoryPatch[key] = value;
        }
      }
    }

    const result = await this.withPreferenceSerializableRetry(async (tx) => {
      const [user, currentPref] = await Promise.all([
        tx.user.findUnique({
          where: { id: userId },
          select: {
            marketingConsent: true,
            userType: true,
            birthDate: true,
          },
        }),
        tx.userNotificationPreference.findUnique({ where: { userId } }),
      ]);

      if (!user) {
        throw new NotFoundException("사용자를 찾을 수 없습니다.");
      }

      const legacyMarketingConsent = categoryPatch.marketing;
      const requestedMarketingConsent =
        typeof patch.marketingConsent === "boolean"
          ? patch.marketingConsent
          : typeof legacyMarketingConsent === "boolean"
            ? legacyMarketingConsent
            : undefined;
      const nextMarketingConsent =
        requestedMarketingConsent ?? user.marketingConsent;
      const consentChanged = nextMarketingConsent !== user.marketingConsent;
      const processedAt = new Date();
      const marketingConsentGrantAllowed = canGrantMarketingConsent(user);

      if (
        nextMarketingConsent &&
        consentChanged &&
        !marketingConsentGrantAllowed
      ) {
        throw new ForbiddenException(
          "만 14세 미만 회원은 직접 마케팅 정보 수신에 동의할 수 없습니다.",
        );
      }

      const marketingTerms = await tx.appTerms.findFirst({
        where: {
          type: "marketing",
          isActive: true,
          publishedAt: { lte: processedAt },
        },
        select: { version: true },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      });

      if (nextMarketingConsent && consentChanged && !marketingTerms) {
        throw new ServiceUnavailableException(
          "현재 마케팅 정보 수신 동의 약관을 확인할 수 없습니다.",
        );
      }

      if (
        nextMarketingConsent &&
        consentChanged &&
        patch.marketingConsentTermsVersion !== marketingTerms?.version
      ) {
        throw new BadRequestException(
          "마케팅 정보 수신 동의 내용을 다시 확인해주세요.",
        );
      }

      sanitized.categories = {
        ...notificationCategories(currentPref?.categories),
        ...categoryPatch,
        marketing: nextMarketingConsent,
      };

      if (consentChanged) {
        await tx.user.update({
          where: { id: userId },
          data: {
            marketingConsent: nextMarketingConsent,
            marketingConsentAt: processedAt,
          },
        });
      }

      const pref = await tx.userNotificationPreference.upsert({
        where: { userId },
        create: { userId, ...sanitized },
        update: sanitized,
      });

      if (consentChanged) {
        await tx.auditLog.create({
          data: {
            userId,
            action: nextMarketingConsent
              ? "marketing_consent_granted"
              : "marketing_consent_revoked",
            resource: "notification_preferences",
            platform: context.platform ?? null,
            ipAddress: context.ipAddress ?? null,
            oldValue: { marketingConsent: user.marketingConsent },
            newValue: {
              marketingConsent: nextMarketingConsent,
              processedAt: processedAt.toISOString(),
              userAgent: context.userAgent ?? null,
              termsVersion: marketingTerms?.version ?? null,
              termsVersionSource: marketingTerms
                ? "app_terms_current"
                : "app_terms_current_missing",
            },
          },
        });
      }

      return {
        pref,
        marketingConsent: nextMarketingConsent,
        marketingConsentGrantAllowed,
        marketingConsentTermsVersion: marketingTerms?.version ?? null,
      };
    });

    const {
      pref,
      marketingConsent,
      marketingConsentGrantAllowed,
      marketingConsentTermsVersion,
    } = result;

    return {
      pushEnabled: pref.pushEnabled,
      smsEnabled: pref.smsEnabled,
      emailEnabled: pref.emailEnabled,
      soundEnabled: pref.soundEnabled,
      vibrationEnabled: pref.vibrationEnabled,
      quietHoursEnabled: pref.quietHoursEnabled,
      quietHoursStart: pref.quietHoursStart,
      quietHoursEnd: pref.quietHoursEnd,
      categories: {
        ...notificationCategories(pref.categories),
        marketing: marketingConsent,
      },
      marketingConsent,
      marketingConsentGrantAllowed,
      marketingConsentTermsVersion,
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

      // 2. 앱 내 알림 생성 — 수신자는 승인된 회원의 학부모(유일 호출처 member-approvals) → 대시보드 착지.
      const notification = await this.createNotification({
        userId: dto.userId,
        notificationType: "membership_approved",
        title: "가입 승인",
        message: `${dto.clubName} 클럽 가입이 승인되었습니다.`,
        linkUrl: "/parent",
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
    linkUrl?: string,
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

    // 광고성이면 '(광고)' 표기 + 전송자 정보·수신거부 방법을 삽입한다 (§50④).
    // 큐 잡·PushNotificationLog·AuditLog·알림함에 모두 '실제 발송 문구'가 남도록
    // 분기 이전에 한 번만 가공한다(관리자가 입력한 원문은 AuditLog 이전 값에 없으므로
    // 감사 시 가공 결과 = 발송 결과로 일치한다).
    if (isMarketing) {
      const decorated = decorateAdvertisingMessage(title, bodyText);
      title = decorated.title;
      bodyText = decorated.body;
    }

    // 개인 타겟은 대상 userIds 필수
    if (targetType === "specific" && (!userIds || userIds.length === 0)) {
      throw new BadRequestException("개인 발송 대상(userIds)이 필요합니다.");
    }
    if (targetType === "role" && !role) {
      throw new BadRequestException("역할 발송 대상(role)이 필요합니다.");
    }

    // 계약 v1 payload + dual-emit — 구 payload 키(targetType/role/source)는
    // 기존 소비처 호환을 위해 당분간 병행 emit (구앱 소멸 후 제거 예정).
    const pushData: FcmDataPayload = {
      ...buildPushData({
        type: isMarketing ? "admin_push_marketing" : "admin_push",
        linkUrl,
      }),
      targetType,
      role: role ?? "",
      source: "admin_push",
    };

    // ── all/role 광역 발송은 큐로 분리 (B5) ──
    // 500청크 순차 발송 + 백오프 sleep 이 HTTP 요청 스레드를 점유해 타임아웃을
    // 유발하고, 관리자가 실패로 오인해 재발송(중복 푸시)하는 사고를 막는다.
    // 대상 산출·수신거부 필터는 발송 시점(executeAdminPushJob)에 재해석하고,
    // 결과는 PushNotificationLog(queued → sent/partial/failed) 폴링으로 추적.
    if (targetType === "all" || targetType === "role") {
      const [pushLog] = await this.prisma.$transaction([
        this.prisma.pushNotificationLog.create({
          data: {
            title,
            body: bodyText,
            targetType,
            targetValue: role ?? null,
            sentBy: adminId ?? "",
            totalCount: 0,
            successCount: 0,
            failCount: 0,
            status: "queued",
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
              queued: true,
            },
          },
        }),
      ]);

      const jobData: AdminPushJobData = {
        pushLogId: pushLog.id,
        title,
        body: bodyText,
        targetType,
        role,
        isMarketing,
        data: pushData,
      };
      try {
        await this.pushQueue.add("send-admin-push", jobData, {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: false,
        });
      } catch (error) {
        // 큐 등록 실패 시 로그를 failed 로 종결 — 'queued' 영구 잔존 방지
        const err = error as Error;
        await this.markAdminPushJobFailed(
          pushLog.id,
          `큐 등록 실패: ${err.message}`,
        );
        throw error;
      }

      return {
        success: true,
        queued: true,
        sentCount: 0,
        failedCount: 0,
        totalDevices: 0,
        pushLogId: pushLog.id,
        message:
          "발송이 접수되었습니다. 발송 이력에서 처리 결과를 확인해주세요.",
      };
    }

    // ── specific: 소량 개인 발송은 동기 처리 (관리자 즉시 피드백 유지) ──
    let recipientUserIds = Array.from(new Set((userIds ?? []).filter(Boolean)));

    // 광고성 발송 시 수신거부(pushEnabled=false) + 마케팅 미동의(marketingConsent=false)
    // 대상을 제외한다 (정보성/시스템 공지는 전체 발송 유지 — 관리자 긴급 공지의
    // 의도적 우회 경로, PUSH_NOTIFICATION_GUIDE §4 참조).
    if (isMarketing && recipientUserIds.length > 0) {
      recipientUserIds = await this.filterPushEnabled(
        recipientUserIds,
        "admin_push_marketing",
        true,
      );
    }

    // 인앱 알림 적재 — 관리자가 명시적으로 고른 specific 대상만 알림함에 남긴다.
    // (all/role 광역 발송은 알림함 대량 적재를 피하고 푸시 + PushNotificationLog 로만 추적.)
    if (recipientUserIds.length > 0) {
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

    const devices = await this.prisma.userDevice.findMany({
      where: { isActive: true, userId: { in: recipientUserIds } },
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
        pushData,
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

    // PushNotificationLog + AuditLog 기록 — FCM 는 이미 전송됨(부수효과 확정).
    // 로그 기록 실패로 요청을 500 시키면 관리자가 '발송 실패'로 오인해 재발송 →
    // 대상자에게 중복 푸시. 로그 실패는 격리하고 발송 성공 응답을 유지한다.
    let pushLogId: string | null = null;
    try {
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
      pushLogId = pushLog.id;
    } catch (error) {
      this.logger.error(
        `Admin Push 이력 기록 실패(발송은 완료됨 — 재발송 금지): ${error}`,
      );
    }

    return {
      success: successCount > 0 || tokens.length === 0,
      sentCount: successCount,
      failedCount: failCount,
      totalDevices: tokens.length,
      pushLogId,
      message:
        tokens.length === 0
          ? "발송 대상 기기가 없습니다."
          : `${tokens.length}개 기기 중 ${successCount}개 발송 성공, ${failCount}개 실패`,
    };
  }

  /**
   * 큐 프로세서(PushProcessor)가 호출하는 광역 브로드캐스트 실행부.
   *
   * 대상은 발송 시점에 재해석한다(큐 대기 중 변경된 디바이스/수신거부 반영).
   * 완료 시 PushNotificationLog 를 최종 상태로 갱신한다.
   */
  async executeAdminPushJob(job: AdminPushJobData): Promise<void> {
    // 야간×마케팅 재검사 — 접수는 주간이었으나 처리 시점이 야간으로 넘어간 경우
    // 법적 게이트(정보통신망법 §50)를 우회하지 않도록 큐에서도 차단한다.
    if (job.isMarketing && this.isNightTimeKST()) {
      this.logger.warn(
        `야간 광고성 Push 큐 처리 차단: pushLogId=${job.pushLogId}`,
      );
      await this.prisma.pushNotificationLog.update({
        where: { id: job.pushLogId },
        data: { status: "blocked", sentAt: new Date() },
      });
      return;
    }

    // ── 발송 대상 디바이스 재해석 ──
    const deviceWhere: import("@prisma/client").Prisma.UserDeviceWhereInput = {
      isActive: true,
    };
    let recipientUserIds: string[] | null = null;
    if (job.targetType === "role") {
      const users = await this.prisma.user.findMany({
        where: {
          userType: job.role as import("@prisma/client").UserType,
        },
        select: { id: true },
      });
      recipientUserIds = users.map((u) => u.id);
      if (job.isMarketing) {
        recipientUserIds = await this.filterPushEnabled(
          recipientUserIds,
          "admin_push_marketing",
          true,
        );
      }
      deviceWhere.userId = { in: recipientUserIds };
    } else if (job.isMarketing) {
      // all + 광고성: 전체 디바이스를 userId 목록 없이 조회하므로, 옵트아웃
      // (pushEnabled=false) 사용자를 relation 필터로 제외한다(정보통신망법 §50).
      // preference 행이 없거나 pushEnabled=true 인 사용자는 그대로 포함된다.
      deviceWhere.NOT = [
        {
          user: {
            is: { notificationPreference: { is: { pushEnabled: false } } },
          },
        },
        {
          user: {
            is: {
              notificationPreference: {
                is: {
                  categories: { path: ["marketing"], equals: false },
                },
              },
            },
          },
        },
      ];
      // 사전 수신동의(opt-in)가 없는 회원은 relation 필터로 원천 제외한다 (§50①).
      // 전 회원 목록을 메모리로 올리지 않기 위해 filterRecipients 대신 DB 조건으로 처리.
      deviceWhere.user = { is: { marketingConsent: true } };
    }

    const devices = await this.prisma.userDevice.findMany({
      where: deviceWhere,
      select: { fcmToken: true },
    });
    const tokens = Array.from(
      new Set(devices.map((d) => d.fcmToken).filter(Boolean) as string[]),
    );

    this.logger.log(
      `Admin Push 큐 발송: pushLogId=${job.pushLogId}, ${tokens.length}개 기기`,
    );

    let successCount = 0;
    let failCount = 0;
    // 대상 0건은 '실패'가 아니라 '보낼 대상 없음' — 동기 specific 경로와 동일하게
    // 성공 계열로 처리한다. status="failed" 로 두면 관리자가 실패로 오인해 재발송
    // (큐 분리가 막으려던 중복 푸시)한다.
    let status = "sent";

    if (tokens.length > 0) {
      const fcmResult = await this.fcmService.sendToTokens(
        tokens,
        job.title,
        job.body,
        job.data,
      );
      successCount = fcmResult.successCount;
      failCount = fcmResult.failureCount;
      status =
        successCount === tokens.length
          ? "sent"
          : successCount === 0
            ? "failed"
            : "partial";
    }

    await this.prisma.pushNotificationLog.update({
      where: { id: job.pushLogId },
      data: {
        totalCount: tokens.length,
        successCount,
        failCount,
        status,
        sentAt: new Date(),
      },
    });
  }

  /** 큐 처리 자체가 실패했을 때 로그 행을 실패로 종결 (queued 잔존 방지) */
  async markAdminPushJobFailed(
    pushLogId: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.prisma.pushNotificationLog.update({
        where: { id: pushLogId },
        data: {
          status: "failed",
          metadata: JSON.stringify({ error: errorMessage }),
        },
      });
    } catch (error) {
      this.logger.error(
        `PushNotificationLog 실패 기록 불가: pushLogId=${pushLogId} — ${error}`,
      );
    }
  }

  /**
   * FCM 푸시 비동기 발송 (fire-and-forget)
   *
   * createNotification에서 호출됩니다. 발송 실패해도 알림 생성에 영향을 주지 않으며
   * 에러는 로그로만 기록됩니다.
   *
   * 단건 경로도 발송 직전 푸시 정책 게이트를 통과한다(B1) — 인앱 알림·WebSocket 은
   * 이미 처리된 뒤라 영향 없고, FCM 만 수신거부 설정을 존중한다.
   *
   * @param userId 대상 사용자 ID
   * @param title 알림 제목
   * @param message 알림 본문
   * @param data 추가 데이터 페이로드 (buildPushData 로 조립된 계약 v1)
   * @param notificationType 정책 판정용 알림 타입
   */
  private sendFcmPushAsync(
    userId: string,
    title: string,
    message: string,
    data?: FcmDataPayload,
    notificationType?: string,
  ): void {
    void (async () => {
      const { allowed } = await this.pushPolicy.filterRecipients([userId], {
        notificationType,
      });
      if (allowed.length === 0) {
        this.logger.debug(
          `FCM 푸시 정책 억제: userId=${userId}, type=${notificationType ?? "-"}`,
        );
        return;
      }

      const result = await this.fcmService.sendPushNotification(
        userId,
        title,
        message,
        data,
      );
      if (result.successCount > 0) {
        this.logger.debug(
          `FCM 푸시 발송 완료: userId=${userId}, 성공=${result.successCount}`,
        );
      }
    })().catch((error) => {
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
