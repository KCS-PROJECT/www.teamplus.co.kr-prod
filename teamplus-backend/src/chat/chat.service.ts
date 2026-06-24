import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { ModerationService } from "@/moderation/moderation.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { filterProfanity } from "@/common/utils/content-filter.util";
import { CreateChatRoomDto, SendMessageDto } from "./dto/create-room.dto";

const BLOCKED_MESSAGE_PLACEHOLDER = "차단한 사용자의 메시지입니다.";

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 내 채팅방 목록 조회 (최근 메시지 기준 정렬)
   */
  async getMyChatRooms(userId: string) {
    const rooms = await this.prisma.chatRoomMember.findMany({
      where: { userId, isActive: true },
      orderBy: { room: { lastMessageAt: "desc" } },
      select: {
        id: true,
        unreadCount: true,
        isMuted: true,
        lastReadAt: true,
        room: {
          select: {
            id: true,
            name: true,
            type: true,
            lastMessage: true,
            lastMessageAt: true,
            isActive: true,
            members: {
              where: { isActive: true },
              select: {
                userId: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // 차단 사용자 ID — DIRECT 방 상대가 차단 대상이면 플래그 표시 (UGC 차단)
    const blockedIds = new Set(await this.moderation.getBlockedUserIds(userId));

    // 채팅방 정보 변환 (1:1 채팅의 경우 상대방 이름 표시)
    return rooms.map((member) => {
      const room = member.room;
      let displayName = room.name ?? "";
      let otherUser: {
        userId: string;
        name: string;
        avatarUrl: string | null;
      } | null = null;
      let isBlockedUser = false;

      if (room.type === "DIRECT") {
        const other = room.members.find((m) => m.userId !== userId);
        if (other) {
          const name =
            `${other.user.lastName}${other.user.firstName}`.trim() ||
            "알 수 없음";
          displayName = name;
          otherUser = {
            userId: other.userId,
            name,
            avatarUrl: other.user.avatarUrl ?? null,
          };
          isBlockedUser = blockedIds.has(other.userId);
        }
      }

      return {
        membershipId: member.id,
        roomId: room.id,
        name: displayName,
        type: room.type,
        lastMessage: isBlockedUser
          ? BLOCKED_MESSAGE_PLACEHOLDER
          : room.lastMessage,
        lastMessageAt: room.lastMessageAt,
        unreadCount: member.unreadCount,
        isMuted: member.isMuted,
        isActive: room.isActive,
        otherUser,
        isBlockedUser,
        memberCount: room.members.length,
      };
    });
  }

  /**
   * 채팅방 생성
   */
  async createChatRoom(dto: CreateChatRoomDto, creatorId: string) {
    // DIRECT 채팅: 이미 존재하는 1:1 채팅방 확인
    if (dto.type === "DIRECT") {
      if (dto.memberIds.length !== 1) {
        throw new BadRequestException(
          "1:1 채팅은 상대방 1명을 지정해야 합니다.",
        );
      }
      const targetUserId = dto.memberIds[0];
      if (targetUserId === creatorId) {
        throw new BadRequestException("자신과의 채팅은 생성할 수 없습니다.");
      }

      // 기존 1:1 채팅방 찾기
      const existing = await this.prisma.chatRoom.findFirst({
        where: {
          type: "DIRECT",
          AND: [
            { members: { some: { userId: creatorId, isActive: true } } },
            { members: { some: { userId: targetUserId, isActive: true } } },
          ],
        },
        select: { id: true },
      });

      if (existing) {
        return { roomId: existing.id, isExisting: true };
      }
    }

    if (["GROUP", "CLUB", "CLASS"].includes(dto.type) && !dto.name) {
      throw new BadRequestException("그룹 채팅방은 이름이 필요합니다.");
    }

    // 모든 참여 멤버 ID (생성자 포함)
    const allMemberIds = Array.from(new Set([creatorId, ...dto.memberIds]));

    // 멤버 존재 확인
    const users = await this.prisma.user.findMany({
      where: { id: { in: allMemberIds } },
      select: { id: true },
    });
    if (users.length !== allMemberIds.length) {
      throw new NotFoundException("존재하지 않는 사용자가 포함되어 있습니다.");
    }

    const room = await this.prisma.chatRoom.create({
      data: {
        name: dto.name,
        type: dto.type as any,
        teamId: dto.teamId,
        classId: dto.classId,
        members: {
          create: allMemberIds.map((uid) => ({
            userId: uid,
            role: uid === creatorId ? "admin" : "member",
          })),
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true,
      },
    });

    return { roomId: room.id, isExisting: false, room };
  }

  /**
   * 채팅 메시지 목록 조회 (페이지네이션)
   */
  async getMessages(
    roomId: string,
    userId: string,
    cursor?: string,
    limit = 30,
  ) {
    // 채팅방 멤버 확인
    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true, isActive: true },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException("해당 채팅방의 멤버가 아닙니다.");
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        roomId,
        isDeleted: false,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        content: true,
        type: true,
        attachments: true,
        isEdited: true,
        readBy: true,
        createdAt: true,
        senderId: true,
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    // 차단 사용자 메시지 숨김 (UGC 차단 — 내가 차단한 사용자의 콘텐츠 비노출)
    const blockedIds = new Set(await this.moderation.getBlockedUserIds(userId));

    // 읽음 처리 - lastReadAt 업데이트
    await this.prisma.chatRoomMember.update({
      where: { roomId_userId: { roomId, userId } },
      data: { lastReadAt: new Date(), unreadCount: 0 },
    });

    return {
      messages: items.map((msg) => {
        const isBlocked = blockedIds.has(msg.senderId);
        return {
          id: msg.id,
          content: isBlocked ? BLOCKED_MESSAGE_PLACEHOLDER : msg.content,
          type: isBlocked ? "TEXT" : msg.type,
          attachments: isBlocked ? [] : msg.attachments,
          isEdited: msg.isEdited,
          isBlocked,
          isMine: msg.senderId === userId,
          isRead: Array.isArray(msg.readBy)
            ? (msg.readBy as string[]).includes(userId)
            : false,
          createdAt: msg.createdAt,
          sender: {
            id: msg.senderId,
            name:
              `${msg.sender.lastName}${msg.sender.firstName}`.trim() ||
              "알 수 없음",
            avatarUrl: msg.sender.avatarUrl ?? null,
          },
        };
      }),
      hasMore,
      nextCursor: hasMore
        ? items[items.length - 1].createdAt.toISOString()
        : null,
    };
  }

  /**
   * 채팅방 단일 조회 (채팅방 상세 정보)
   */
  async getRoomById(roomId: string, userId: string) {
    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { isActive: true, isMuted: true },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException("해당 채팅방의 멤버가 아닙니다.");
    }

    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        type: true,
        isActive: true,
        lastMessage: true,
        lastMessageAt: true,
        members: {
          where: { isActive: true },
          select: {
            userId: true,
            role: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!room) throw new NotFoundException("채팅방을 찾을 수 없습니다.");

    // 1:1 채팅이면 상대방 정보 표시
    let displayName = room.name ?? "";
    const isOnline = false;
    // 신고·차단 대상 식별용 — DIRECT 방의 상대 사용자 (UGC 안전장치)
    let otherUser: { userId: string; name: string } | null = null;

    if (room.type === "DIRECT") {
      const other = room.members.find((m) => m.userId !== userId);
      if (other) {
        const name =
          `${other.user.lastName}${other.user.firstName}`.trim() ||
          "알 수 없음";
        displayName = name;
        otherUser = { userId: other.userId, name };
      }
    }

    // 상대를 이미 차단했는지 — 채팅 UI 에서 차단/해제 토글 표시용
    const isBlockedUser = otherUser
      ? (await this.moderation.getBlockedUserIds(userId)).includes(
          otherUser.userId,
        )
      : false;

    return {
      id: room.id,
      name: displayName,
      type: room.type,
      isOnline,
      status: "활성",
      isMuted: membership.isMuted,
      memberCount: room.members.length,
      lastMessage: room.lastMessage,
      lastMessageAt: room.lastMessageAt,
      otherUser,
      isBlockedUser,
    };
  }

  /**
   * 채팅방 나가기 (soft delete)
   */
  async leaveRoom(roomId: string, userId: string) {
    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true, isActive: true },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException("해당 채팅방의 멤버가 아닙니다.");
    }

    await this.prisma.chatRoomMember.update({
      where: { roomId_userId: { roomId, userId } },
      data: { isActive: false },
    });

    return { message: "채팅방을 나갔습니다." };
  }

  /**
   * 알림 설정 토글 (음소거/해제)
   */
  async toggleNotification(roomId: string, userId: string) {
    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { id: true, isMuted: true, isActive: true },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException("해당 채팅방의 멤버가 아닙니다.");
    }

    const updated = await this.prisma.chatRoomMember.update({
      where: { roomId_userId: { roomId, userId } },
      data: { isMuted: !membership.isMuted },
      select: { isMuted: true },
    });

    return {
      message: updated.isMuted ? "알림이 꺼졌습니다." : "알림이 켜졌습니다.",
      isMuted: updated.isMuted,
    };
  }

  /**
   * 메시지 전송 (REST - WebSocket 미지원 환경 폴백)
   */
  async sendMessage(roomId: string, userId: string, dto: SendMessageDto) {
    const membership = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { isActive: true },
    });

    if (!membership || !membership.isActive) {
      throw new ForbiddenException("해당 채팅방의 멤버가 아닙니다.");
    }

    // UGC 콘텐츠 필터 — 비속어 마스킹 (TEXT 메시지만, REST+WebSocket 공통 진입점)
    const isTextType = ((dto.type as string) ?? "TEXT") === "TEXT";
    const safeContent = isTextType
      ? filterProfanity(dto.content).filtered
      : dto.content;

    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.chatMessage.create({
        data: {
          roomId,
          senderId: userId,
          receiverId: dto.receiverId,
          content: safeContent,
          type: (dto.type as any) ?? "TEXT",
          readBy: [userId],
        },
        select: {
          id: true,
          content: true,
          type: true,
          createdAt: true,
          senderId: true,
        },
      });

      // 채팅방 마지막 메시지 업데이트
      await tx.chatRoom.update({
        where: { id: roomId },
        data: {
          lastMessage: safeContent.slice(0, 100),
          lastMessageAt: msg.createdAt,
        },
      });

      // 다른 멤버 unreadCount 증가
      await tx.chatRoomMember.updateMany({
        where: { roomId, userId: { not: userId }, isActive: true },
        data: { unreadCount: { increment: 1 } },
      });

      return msg;
    });

    // 신규 메시지 FCM 푸시 — 음소거(isMuted=toggleNotification OFF) 아닌 활성 수신자에게 (best-effort, 비차단)
    void this.notifyMessageRecipients(roomId, userId, safeContent, isTextType);

    return {
      message: "메시지가 전송되었습니다.",
      data: message,
    };
  }

  /**
   * 신규 채팅 메시지 수신자에게 FCM 푸시 발송 (best-effort).
   * - 발신자 제외, 활성 멤버 중 음소거(isMuted=true, toggleNotification OFF) 제외
   * - 푸시 수신거부(pushEnabled=false)는 NotificationsService.pushOnlyToUsers 에서 추가 제외
   * - 채팅은 알림센터 DB 적재 없이 푸시만 발송 (자체 unreadCount 사용)
   */
  private async notifyMessageRecipients(
    roomId: string,
    senderId: string,
    content: string,
    isText: boolean,
  ): Promise<void> {
    try {
      const [recipients, sender] = await Promise.all([
        this.prisma.chatRoomMember.findMany({
          where: {
            roomId,
            userId: { not: senderId },
            isActive: true,
            isMuted: false,
          },
          select: { userId: true },
        }),
        this.prisma.user.findUnique({
          where: { id: senderId },
          select: { firstName: true, lastName: true },
        }),
      ]);

      const userIds = recipients.map((r) => r.userId);
      if (userIds.length === 0) return;

      const senderName =
        `${sender?.lastName ?? ""}${sender?.firstName ?? ""}`.trim() ||
        "새 메시지";
      const preview = isText
        ? content.slice(0, 100)
        : "사진·파일을 보냈습니다.";

      // 채팅 메시지는 알림센터(notification 테이블)에 적재되지 않으므로
      // unread count 가 0 일 수 있다 → iOS 앱 뱃지를 0 으로 잘못 클리어하는
      // 엣지를 막기 위해 badge 를 설정하지 않는다(setBadge:false).
      await this.notifications.pushOnlyToUsers(
        userIds,
        {
          notificationType: "chat_message",
          title: senderName,
          message: preview,
          linkUrl: `/chat/${roomId}`,
        },
        { setBadge: false },
      );
    } catch (error) {
      this.logger.warn(`채팅 푸시 발송 실패: ${error}`);
    }
  }
}
