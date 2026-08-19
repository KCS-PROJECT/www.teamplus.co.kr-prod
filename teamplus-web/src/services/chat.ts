/**
 * Chat Service — 채팅방 REST 진입 헬퍼.
 *
 * 소켓 계층은 chat-socket.ts, 화면은 ChatRoomView 가 담당하고,
 * 여기는 "대화를 여는" REST 호출만 모은다.
 */

import { api } from './api-client';

interface CreateChatRoomResponse {
  roomId: string;
  isExisting: boolean;
}

/**
 * 상대 사용자와의 1:1 대화방을 생성(또는 기존 방 재사용)하고 roomId 를 반환.
 * 명단·상세 화면의 "1:1 문의" 진입점 공용 — 반환된 roomId 로 `/chat/{roomId}` 이동.
 */
export async function openDirectChat(targetUserId: string): Promise<string | null> {
  if (!targetUserId) return null;
  const res = await api.post<CreateChatRoomResponse>('/chat/rooms', {
    type: 'DIRECT',
    memberIds: [targetUserId],
  });
  if (res.success && res.data?.roomId) {
    return res.data.roomId;
  }
  return null;
}
