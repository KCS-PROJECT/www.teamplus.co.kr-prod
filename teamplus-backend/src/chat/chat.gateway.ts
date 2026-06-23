import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, UsePipes, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "@/prisma/prisma.service";
import { ChatService } from "./chat.service";
import { WsRoomDto, WsSendMessageDto, WsTypingDto } from "./dto/ws-events.dto";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

@WebSocketGateway({
  namespace: "/chat",
  cors: {
    origin: process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()) || [
      "http://localhost:5001",
      "http://localhost:5002",
    ],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 30000,
})
// [2026-05-13 Phase D-3] Event payload class-validator 검증.
//   gateway-level ValidationPipe 로 모든 @SubscribeMessage 핸들러의 @MessageBody 가 검증된다.
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.replace("Bearer ", "") ||
        (client.handshake?.query?.token as string);

      if (!token) {
        this.logger.warn(`Chat client ${client.id}: No token`);
        client.emit("token_expired", { reason: "no_token" });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;
      client.userRole = payload.role || payload.userType;

      // 개인 룸 참여
      client.join(`user:${client.userId}`);

      this.logger.log(
        `Chat client ${client.id} connected: userId=${client.userId}`,
      );

      client.emit("connected", { status: "connected", userId: client.userId });

      // [2026-05-13 Phase D-4] 토큰 만료 임박(5분 이내) 시 클라이언트에 갱신 요청.
      if (payload.exp && payload.exp * 1000 - Date.now() < 5 * 60 * 1000) {
        client.emit("token:refresh_required", {
          expiresAt: payload.exp * 1000,
        });
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (err.name === "TokenExpiredError") {
        this.logger.warn(`Chat client ${client.id}: token expired`);
        client.emit("token_expired", {
          message: "토큰이 만료되었습니다. 갱신 후 재연결해주세요.",
        });
      } else {
        this.logger.error(`Chat client ${client.id} error: ${err.message}`);
      }
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(
      `Chat client ${client.id} disconnected: userId=${client.userId}`,
    );
  }

  /**
   * 채팅방 참여
   */
  @SubscribeMessage("join_chat")
  async handleJoinChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsRoomDto,
  ) {
    if (!client.userId) {
      return { success: false, error: "인증되지 않은 연결입니다." };
    }

    // [2026-06-10 SECURITY] 룸 멤버십 검증을 join 이전에 수행 (IDOR/도청 차단).
    //   기존: 멤버십 확인 없이 무조건 join → 임의 사용자가 타인 채팅방 메시지/typing 실시간 도청 가능.
    const membership = await this.prisma.chatRoomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: data.roomId,
          userId: client.userId,
        },
      },
      select: { unreadCount: true, isActive: true },
    });

    if (!membership || membership.isActive === false) {
      this.logger.warn(
        `[SECURITY] 비멤버 채팅방 join 차단: user=${client.userId}, room=${data.roomId}`,
      );
      return { success: false, error: "채팅방 참여 권한이 없습니다." };
    }

    client.join(`chat:${data.roomId}`);
    this.logger.debug(`Client ${client.id} joined chat room: ${data.roomId}`);

    // 미읽음 메시지 카운트 전송
    client.emit("unread_count", {
      roomId: data.roomId,
      count: membership.unreadCount ?? 0,
    });

    return { success: true, roomId: data.roomId };
  }

  /**
   * 채팅방 퇴장
   */
  @SubscribeMessage("leave_chat")
  handleLeaveChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsRoomDto,
  ) {
    client.leave(`chat:${data.roomId}`);
    return { success: true };
  }

  /**
   * 메시지 전송
   */
  @SubscribeMessage("send_message")
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsSendMessageDto,
  ) {
    if (!client.userId) {
      return { success: false, error: "인증되지 않은 연결입니다." };
    }

    try {
      const messageResult = await this.chatService.sendMessage(
        data.roomId,
        client.userId,
        {
          content: data.content,
          type: (data.messageType as any) || "TEXT",
        },
      );
      const message = messageResult.data;

      // 같은 룸의 다른 참여자에게 브로드캐스트
      client.to(`chat:${data.roomId}`).emit("new_message", {
        id: message.id,
        roomId: data.roomId,
        senderId: message.senderId,
        content: message.content,
        messageType: message.type,
        createdAt: message.createdAt.toISOString(),
      });

      // 발신자에게 전송 확인
      client.emit("message_sent", {
        id: message.id,
        roomId: data.roomId,
        status: "sent",
      });

      return { success: true, messageId: message.id };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Message send error: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * 타이핑 인디케이터
   */
  @SubscribeMessage("typing")
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsTypingDto,
  ) {
    if (!client.userId) return;

    client.to(`chat:${data.roomId}`).emit("user_typing", {
      userId: client.userId,
      roomId: data.roomId,
      isTyping: data.isTyping,
    });
  }

  /**
   * 메시지 읽음 처리
   */
  @SubscribeMessage("read_messages")
  async handleReadMessages(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsRoomDto,
  ) {
    if (!client.userId) return { success: false };

    try {
      const now = new Date();
      const membership = await this.prisma.chatRoomMember.findUnique({
        where: {
          roomId_userId: {
            roomId: data.roomId,
            userId: client.userId,
          },
        },
        select: {
          isActive: true,
          lastReadAt: true,
        },
      });

      if (!membership || !membership.isActive) {
        return { success: false, error: "해당 채팅방의 멤버가 아닙니다." };
      }

      const unreadMessages = await this.prisma.chatMessage.findMany({
        where: {
          roomId: data.roomId,
          senderId: { not: client.userId },
          isDeleted: false,
          ...(membership.lastReadAt
            ? { createdAt: { gt: membership.lastReadAt } }
            : {}),
        },
        select: {
          id: true,
          readBy: true,
        },
      });

      await this.prisma.$transaction(async (tx) => {
        // N+1 해소: 직렬 update 대신 Promise.all 병렬 처리
        // 각 row.id 가 모두 달라 락 충돌 없음, readBy 값이 row 별로 달라 updateMany 불가
        const messageUpdates = unreadMessages
          .map((unreadMessage) => {
            const currentReadBy = Array.isArray(unreadMessage.readBy)
              ? (unreadMessage.readBy as string[])
              : [];
            if (currentReadBy.includes(client.userId!)) return null;
            return tx.chatMessage.update({
              where: { id: unreadMessage.id },
              data: { readBy: [...currentReadBy, client.userId!] },
            });
          })
          .filter((p): p is NonNullable<typeof p> => p !== null);
        await Promise.all(messageUpdates);

        await tx.chatRoomMember.update({
          where: {
            roomId_userId: {
              roomId: data.roomId,
              userId: client.userId!,
            },
          },
          data: {
            lastReadAt: now,
            unreadCount: 0,
          },
        });
      });

      // 상대방에게 읽음 알림
      client.to(`chat:${data.roomId}`).emit("messages_read", {
        roomId: data.roomId,
        readBy: client.userId,
      });

      return { success: true };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Read messages error: ${msg}`);
      return { success: false };
    }
  }
}
