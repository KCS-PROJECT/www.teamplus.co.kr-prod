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
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

export interface ScoreUpdatePayload {
  matchId: string;
  homeScore: number;
  awayScore: number;
  currentPeriod?: number | null;
  lastEvent?: {
    id: string;
    eventType: string;
    periodNumber: number;
    eventTime: string;
    description?: string | null;
  };
}

export interface MatchStatusPayload {
  matchId: string;
  status: string; // scheduled | in_progress | completed | cancelled
  currentPeriod?: number | null;
  homeScore?: number;
  awayScore?: number;
  startedAt?: Date | null;
  endedAt?: Date | null;
}

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5001", "http://localhost:5002"];

/**
 * Match Scoreboard 실시간 게이트웨이
 *
 * Namespace: `/match-scoreboard`
 * Auth:      JWT (handshake.auth.token | Bearer header | query)
 * Room:      `match:${matchId}` — 클라이언트가 `joinMatch` 이벤트로 명시적 join
 *
 * Emit Events:
 *  - `match:score-update`   — 골/이벤트 발생 시 (service.createEvent)
 *  - `match:status-change`  — 경기 상태 전이 시 (service.updateStatus)
 *
 * Subscribe Events:
 *  - `joinMatch`  payload `{ matchId }`  → room join
 *  - `leaveMatch` payload `{ matchId }`  → room leave
 */
@WebSocketGateway({
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
  namespace: "/match-scoreboard",
  // Socket.io ping 정책 명시 (2026-05-08) — chat/notifications gateway 와 동기화.
  // 모바일 환경 idle 시 강제 disconnect 차단 (pingTimeout 20s → 60s).
  pingTimeout: 60000,
  pingInterval: 30000,
})
export class MatchScoreboardGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MatchScoreboardGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  afterInit() {
    this.logger.log("WebSocket Match Scoreboard Gateway initialized");
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.replace("Bearer ", "") ||
        (client.handshake?.query?.token as string);

      if (!token) {
        this.logger.warn(
          `Match scoreboard: client ${client.id} rejected (no token)`,
        );
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(
          `Match scoreboard: client ${client.id} rejected (invalid token)`,
        );
        client.disconnect();
        return;
      }

      client.userId = userId;
      client.userRole = payload.role;

      this.logger.log(
        `Match scoreboard: client ${client.id} connected (userId=${userId})`,
      );

      client.emit("connected", { status: "connected", userId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Match scoreboard: client ${client.id} connection error: ${message}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(
      `Match scoreboard: client ${client.id} disconnected (userId=${client.userId})`,
    );
  }

  /**
   * 클라이언트가 특정 매치 룸에 참여
   */
  @SubscribeMessage("joinMatch")
  handleJoinMatch(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { matchId: string },
  ) {
    if (!data?.matchId) {
      return { success: false, error: "matchId required" };
    }
    if (!client.userId) {
      return { success: false, error: "Unauthorized" };
    }
    const room = `match:${data.matchId}`;
    client.join(room);
    this.logger.log(
      `Match scoreboard: ${client.userId} joined ${room} (socket=${client.id})`,
    );
    return { success: true, room };
  }

  /**
   * 클라이언트가 특정 매치 룸에서 이탈
   */
  @SubscribeMessage("leaveMatch")
  handleLeaveMatch(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { matchId: string },
  ) {
    if (!data?.matchId) {
      return { success: false, error: "matchId required" };
    }
    const room = `match:${data.matchId}`;
    client.leave(room);
    return { success: true, room };
  }

  /**
   * 스코어 갱신 emit — service.createEvent 에서 호출
   */
  emitScoreUpdate(payload: ScoreUpdatePayload) {
    const room = `match:${payload.matchId}`;
    this.server.to(room).emit("match:score-update", payload);
    this.logger.debug(
      `Emit match:score-update → ${room} (home=${payload.homeScore}, away=${payload.awayScore})`,
    );
  }

  /**
   * 경기 상태 변경 emit — service.updateStatus 에서 호출
   */
  emitStatusChange(payload: MatchStatusPayload) {
    const room = `match:${payload.matchId}`;
    this.server.to(room).emit("match:status-change", payload);
    this.logger.debug(
      `Emit match:status-change → ${room} (status=${payload.status})`,
    );
  }
}
