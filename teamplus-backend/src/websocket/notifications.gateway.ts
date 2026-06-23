import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, UsePipes, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "@/prisma/prisma.service";
import { FileResponseDto } from "@/files/dto/upload-file.dto";
import {
  WsMarkAsReadDto,
  WsRefRoomDto,
  WsRefRoomLeaveDto,
} from "./dto/ws-events.dto";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * 파일 이벤트 타입 — Phase 2.2 SPEC §4.3
 */
export type FileEventType = "file:created" | "file:updated" | "file:deleted";

/**
 * 파일 이벤트 페이로드 — `${refType}:${refId}` 룸에 emit.
 * SPEC §4.3 정의와 1:1 일치. Web/Admin/App 클라이언트의 useFileUploadSync 가
 * 동일 시그니처로 구독.
 */
export interface FileEventPayload {
  type: FileEventType;
  refType: string;
  refId: string;
  files: FileResponseDto[];
  uploaderId: string;
  ts: number; // Date.now()
}

/**
 * Ref 룸 표준화 — `${refType}:${refId}` 형식.
 * - refType 은 소문자로 강제 (notice/gallery/chat 등)
 * - refId 는 cuid/uuid 등 원형 유지
 * - 길이 제한은 DTO 에서 사전 검증
 */
function buildRefRoom(refType: string, refId: string): string {
  return `${refType.toLowerCase()}:${refId}`;
}

// CORS_ORIGINS 환경변수: 쉼표 구분 도메인 목록 (예: http://localhost:5001,http://localhost:5002)
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5001", "http://localhost:5002"];

@WebSocketGateway({
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
  namespace: "/notifications",
  // Socket.io ping 정책 명시 (2026-05-08) — 모바일 환경 idle disconnect 사이클 차단.
  // 기본값(pingTimeout 20s · pingInterval 25s) 은 Flutter 앱 background 사이클에서
  // ping 응답 누락 → 강제 disconnect 유발. chat.gateway.ts (60s/30s) 와 동기화.
  pingTimeout: 60000,
  pingInterval: 30000,
})
// [2026-05-13 Phase D-3] Event payload class-validator 검증.
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set<socketIds>

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit() {
    this.logger.log("WebSocket Notifications Gateway initialized");
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from handshake auth or query
      const token =
        client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.replace("Bearer ", "") ||
        (client.handshake?.query?.token as string);

      if (!token) {
        this.logger.warn(
          `Client ${client.id} connection rejected: No token provided`,
        );
        // [2026-05-13 Phase D-4] 클라이언트가 갱신/재로그인할 수 있도록 명확한 신호.
        client.emit("token_expired", { reason: "no_token" });
        client.disconnect();
        return;
      }

      // Verify JWT token
      let payload: {
        sub?: string;
        role?: string;
        userType?: string;
        exp?: number;
      };
      try {
        payload = this.jwtService.verify(token);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Client ${client.id} JWT verify failed: ${msg}`);
        client.emit("token_expired", {
          reason: msg.toLowerCase().includes("expired") ? "expired" : "invalid",
        });
        client.disconnect();
        return;
      }
      const userId = payload.sub;
      // [2026-06-15] 토큰 payload 의 role 클레임은 미발급(userType 만 존재) → userType 폴백.
      //   refRoom 접근 제어(canJoinRefRoom)가 역할(PARENT/ADMIN 등)을 사용한다.
      const userRole = payload.role ?? payload.userType;

      if (!userId) {
        this.logger.warn(
          `Client ${client.id} connection rejected: Invalid token`,
        );
        client.emit("token_expired", { reason: "invalid" });
        client.disconnect();
        return;
      }

      // [2026-05-13 Phase D-4] 토큰 만료 임박(5분 이내) 시 클라이언트에 갱신 요청.
      //   클라이언트는 hybridAuth.refreshToken() 후 새 토큰으로 재연결한다.
      //   연결 자체는 유지 — 즉시 끊지 않고 클라이언트 결정에 맡긴다.
      if (payload.exp && payload.exp * 1000 - Date.now() < 5 * 60 * 1000) {
        client.emit("token:refresh_required", {
          expiresAt: payload.exp * 1000,
        });
      }

      // Attach user info to socket
      client.userId = userId;
      client.userRole = userRole;

      // Add to connected users map
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set());
      }
      this.connectedUsers.get(userId)!.add(client.id);

      // Join user's personal room
      client.join(`user:${userId}`);

      // 🎯 초기 페칭 병렬화 — 멤버십 조회 + unreadCount 동시 수행
      //    WebSocket 연결 직후 클라이언트 첫 이벤트까지의 지연 단축 (~100-200ms)
      const [memberships, unreadCount] = await Promise.all([
        this.prisma.teamMember.findMany({
          where: {
            userId,
            approvalStatus: "approved",
          },
          select: {
            teamId: true,
          },
        }),
        this.getUnreadNotificationsCount(userId),
      ]);

      for (const membership of memberships) {
        client.join(`club:${membership.teamId}`);
      }

      this.logger.log(
        `Client ${client.id} connected: userId=${userId}, role=${userRole}, clubs=${memberships.length}`,
      );

      // 🎯 초기 이벤트 번들링 — 개별 emit 2회 대신 단일 이벤트로 통합
      //    clients 는 'initial_state' 를 구독해 connected/unreadCount 를 한 번에 처리
      client.emit("initial_state", {
        status: "connected",
        userId,
        rooms: Array.from(client.rooms),
        unreadCount,
      });
      // 호환성을 위한 legacy 이벤트 (기존 클라이언트가 connected/unreadCount 구독)
      client.emit("connected", {
        status: "connected",
        userId,
        rooms: Array.from(client.rooms),
      });
      client.emit("unreadCount", { count: unreadCount });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Client ${client.id} connection error: ${message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.userId;
    if (userId && this.connectedUsers.has(userId)) {
      this.connectedUsers.get(userId)!.delete(client.id);
      if (this.connectedUsers.get(userId)!.size === 0) {
        this.connectedUsers.delete(userId);
      }
    }
    this.logger.log(`Client ${client.id} disconnected: userId=${userId}`);
  }

  /**
   * Send notification to a specific user
   */
  async sendToUser(userId: string, notification: NotificationPayload) {
    this.server.to(`user:${userId}`).emit("notification", notification);
    this.logger.log(
      `Notification sent to user ${userId}: ${notification.type}`,
    );
  }

  /**
   * Send notification to all members of a club
   */
  async sendToClub(teamId: string, notification: NotificationPayload) {
    this.server.to(`club:${teamId}`).emit("notification", notification);
    this.logger.log(
      `Notification sent to club ${teamId}: ${notification.type}`,
    );
  }

  /**
   * Send notification to multiple users
   */
  async sendToUsers(userIds: string[], notification: NotificationPayload) {
    for (const userId of userIds) {
      this.server.to(`user:${userId}`).emit("notification", notification);
    }
    this.logger.log(
      `Notification sent to ${userIds.length} users: ${notification.type}`,
    );
  }

  /**
   * Broadcast notification to all connected clients
   */
  async broadcast(notification: NotificationPayload) {
    this.server.emit("notification", notification);
    this.logger.log(`Broadcast notification: ${notification.type}`);
  }

  /**
   * 파일 이벤트 브로드캐스트 — Phase 2.2 SPEC §4.3
   *
   * 업로드/수정/삭제 직후 `${refType}:${refId}` 룸으로 emit.
   * - refType/refId 가 없으면(private upload) emit 하지 않음 (silent skip)
   * - emit 실패가 호출자(업로드 트랜잭션)에 영향을 주지 않도록 try-catch
   *
   * @param params 이벤트 정보
   */
  async broadcastFileEvent(params: {
    type: FileEventType;
    refType?: string | null;
    refId?: string | null;
    files: FileResponseDto[];
    uploaderId: string;
  }): Promise<void> {
    if (!params.refType || !params.refId) {
      // private upload — 이벤트 발송 안함 (정상 케이스)
      return;
    }
    if (!Array.isArray(params.files) || params.files.length === 0) {
      this.logger.debug(
        `broadcastFileEvent skipped — empty files array (${params.type})`,
      );
      return;
    }

    const room = buildRefRoom(params.refType, params.refId);
    const payload: FileEventPayload = {
      type: params.type,
      refType: params.refType,
      refId: params.refId,
      files: params.files,
      uploaderId: params.uploaderId,
      ts: Date.now(),
    };

    try {
      this.server.to(room).emit(params.type, payload);
      this.logger.log(
        `[file:event] ${params.type} → room "${room}" (${params.files.length} files, by ${params.uploaderId})`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`broadcastFileEvent emit 실패: ${message}`);
      // 호출자(업로드)에 throw 하지 않음 — best-effort 정책.
    }
  }

  /**
   * Ref 룸 join — 클라이언트가 특정 리소스의 파일 이벤트 구독.
   * Phase 2.2 SPEC §4.3
   *
   * 사용: `socket.emit('joinRefRoom', { refType: 'notice', refId: 'abc123' })`
   * 응답: `{ success: true, room: 'notice:abc123' }`
   */
  @SubscribeMessage("joinRefRoom")
  async handleJoinRefRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsRefRoomDto,
  ): Promise<{ success: boolean; room?: string; error?: string }> {
    const userId = client.userId;
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    try {
      // [2026-06-15 SECURITY] refType 별 접근 제어 + 미등록 refType 기본 거부(deny-unknown).
      //   기존엔 chat 만 검증하고 그 외(notice/gallery/임의값)는 무검증 join → 타 리소스
      //   파일 이벤트(FileResponseDto[]+uploaderId) 도청 가능했음.
      const allowed = await this.canJoinRefRoom(
        data.refType,
        data.refId,
        userId,
        client.userRole,
      );
      if (!allowed) {
        this.logger.warn(
          `[SECURITY] refRoom 구독 거부: user=${userId}, refType=${data.refType}, refId=${data.refId}`,
        );
        return { success: false, error: "구독 권한이 없습니다." };
      }

      const room = buildRefRoom(data.refType, data.refId);
      await client.join(room);
      this.logger.log(`[joinRefRoom] user=${userId} → room "${room}"`);
      return { success: true, room };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`joinRefRoom 실패: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * [2026-06-15 SECURITY] refRoom 구독 접근 제어 (파일 이벤트 도청 차단).
   *
   * 원칙:
   * - **deny-unknown**: 레지스트리에 없는 refType 은 기본 거부 — 임의 refType 추측으로
   *   타 리소스 파일 이벤트를 도청하는 무한 표면을 차단한다. 신규 실시간 refType 추가 시
   *   본 switch 에 명시 등록해야 한다.
   * - 타입별 READ 규칙은 해당 리소스의 HTTP 조회 권한과 동일 수준으로 맞춘다(WS 가 HTTP
   *   보다 엄격해져 정상 사용자를 막지 않도록).
   * - ADMIN/SYSTEM/OPER 는 전역 허용.
   * - gallery·notice 는 현재 HTTP 조회가 인증 사용자 전체 허용이므로 동일 허용(향후
   *   가시성 모델 확정 시 HTTP·WS 양쪽 동시 강화 — 별도 과제).
   */
  private async canJoinRefRoom(
    refTypeRaw: string,
    refId: string,
    userId: string,
    userRole?: string,
  ): Promise<boolean> {
    const refType = (refTypeRaw || "").toLowerCase();
    const role = (userRole || "").toUpperCase();

    // 관리자 계층 전역 허용
    if (role === "ADMIN" || role === "SYSTEM" || role === "OPER") {
      return true;
    }

    switch (refType) {
      case "chat": {
        // 채팅방 활성 멤버만 (1:1/그룹 대화 — 가장 민감)
        const membership = await this.prisma.chatRoomMember.findUnique({
          where: { roomId_userId: { roomId: refId, userId } },
          select: { isActive: true },
        });
        return !!membership && membership.isActive !== false;
      }
      case "user_avatar": {
        // refId = 대상 User ID. 본인 또는 (학부모인 경우) 자녀.
        if (refId === userId) return true;
        if (role === "PARENT") {
          const link = await this.prisma.parentChild.findFirst({
            where: { parentId: userId, childId: refId },
            select: { id: true },
          });
          return !!link;
        }
        return false;
      }
      case "team_logo": {
        // refId = Team ID. 승인된 팀 멤버 또는 팀 코치(owner).
        const [member, owner] = await Promise.all([
          this.prisma.teamMember.findFirst({
            where: { teamId: refId, userId, approvalStatus: "approved" },
            select: { id: true },
          }),
          this.prisma.team.findFirst({
            where: { id: refId, coachId: userId },
            select: { id: true },
          }),
        ]);
        return !!member || !!owner;
      }
      case "player_award": {
        // refId = TeamMember ID. 본인 / 자녀의 부모 / 해당 팀 코치.
        const member = await this.prisma.teamMember.findUnique({
          where: { id: refId },
          select: { userId: true, team: { select: { coachId: true } } },
        });
        if (!member) return false;
        if (member.userId === userId) return true;
        if (member.team?.coachId === userId) return true;
        if (role === "PARENT") {
          const link = await this.prisma.parentChild.findFirst({
            where: { parentId: userId, childId: member.userId },
            select: { id: true },
          });
          return !!link;
        }
        return false;
      }
      case "gallery":
      case "notice":
        // 현재 HTTP 조회가 인증 사용자 전체 허용 → 동일 허용(별도 가시성 모델 확정 시 강화).
        return true;
      default:
        // 미등록 refType → 거부(deny-unknown).
        return false;
    }
  }

  /**
   * Ref 룸 leave — 클라이언트가 더 이상 해당 리소스 이벤트를 받지 않음.
   * 페이지 unmount 시 호출 권장 (cleanup).
   */
  @SubscribeMessage("leaveRefRoom")
  async handleLeaveRefRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsRefRoomLeaveDto,
  ): Promise<{ success: boolean; room?: string; error?: string }> {
    const userId = client.userId;
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    try {
      const room = buildRefRoom(data.refType, data.refId);
      await client.leave(room);
      this.logger.log(`[leaveRefRoom] user=${userId} → room "${room}"`);
      return { success: true, room };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`leaveRefRoom 실패: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Subscribe to mark notifications as read
   */
  @SubscribeMessage("markAsRead")
  async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsMarkAsReadDto,
  ) {
    const userId = client.userId;
    if (!userId) return { success: false, error: "Unauthorized" };

    try {
      await this.prisma.notification.updateMany({
        where: {
          id: data.notificationId,
          userId,
        },
        data: {
          isRead: true,
        },
      });

      // Send updated unread count
      const unreadCount = await this.getUnreadNotificationsCount(userId);
      client.emit("unreadCount", { count: unreadCount });

      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error marking notification as read: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Subscribe to mark all notifications as read
   */
  @SubscribeMessage("markAllAsRead")
  async handleMarkAllAsRead(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.userId;
    if (!userId) return { success: false, error: "Unauthorized" };

    try {
      await this.prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
        },
      });

      client.emit("unreadCount", { count: 0 });
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error marking all notifications as read: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Subscribe to get unread notifications count
   */
  @SubscribeMessage("getUnreadCount")
  async handleGetUnreadCount(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.userId;
    if (!userId) return { success: false, error: "Unauthorized" };

    const count = await this.getUnreadNotificationsCount(userId);
    return { success: true, count };
  }

  /**
   * Helper method to get unread notifications count
   */
  private async getUnreadNotificationsCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return (
      this.connectedUsers.has(userId) &&
      this.connectedUsers.get(userId)!.size > 0
    );
  }

  /**
   * Get online users count
   */
  getOnlineUsersCount(): number {
    return this.connectedUsers.size;
  }
}
