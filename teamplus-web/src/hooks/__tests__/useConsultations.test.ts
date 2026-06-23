import { renderHook, act } from '@testing-library/react';
import { useConsultations, useChatMessages } from '../useConsultations';
import { api } from '@/services/api-client';

// Mock dependencies
jest.mock('@/services/api-client');

describe('useConsultations Hook', () => {
  const mockConsultations = [
    {
      id: 'c1',
      studentName: '김수현',
      parentName: '김부모',
      coachName: '이코치',
      lastMessage: '오늘 수업 잘 했습니다.',
      lastMessageAt: '2026-04-12T10:00:00Z',
      status: 'ACTIVE' as const,
      unreadCount: 2,
      chatRoomId: 'room-1',
    },
    {
      id: 'c2',
      studentName: '박지민',
      parentName: '박부모',
      coachName: '이코치',
      lastMessage: '다음 수업 문의드립니다.',
      lastMessageAt: '2026-04-11T09:00:00Z',
      status: 'CLOSED' as const,
      unreadCount: 0,
      chatRoomId: 'room-2',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('마운트 시 상담 목록을 페칭한다', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      success: true,
      data: { data: mockConsultations },
    });

    const { result } = renderHook(() => useConsultations());

    // 초기 로딩 상태
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.consultations).toEqual(mockConsultations);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/consultations/my');
  });

  it('API 실패 시 에러 상태를 설정한다', async () => {
    (api.get as jest.Mock).mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useConsultations());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.error).toBe('상담 목록을 불러올 수 없습니다.');
    expect(result.current.consultations).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('파라미터를 쿼리스트링으로 전달한다', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      success: true,
      data: { data: [] },
    });

    const { result } = renderHook(() => useConsultations());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.refresh({
        status: 'active',
        category: 'lesson',
        search: '김수현',
      });
    });

    // fetchConsultations 내부에서 status.toUpperCase() 로 변환 (Backend Prisma enum 매칭)
    expect(api.get).toHaveBeenCalledWith(
      '/consultations/my?status=ACTIVE&category=lesson&search=%EA%B9%80%EC%88%98%ED%98%84',
    );
  });
});

describe('useChatMessages Hook', () => {
  const mockMessages = [
    {
      id: 'm1',
      senderId: 'user-1',
      senderType: 'parent' as const,
      senderName: '김부모',
      content: '안녕하세요.',
      createdAt: '2026-04-12T10:00:00Z',
      type: 'text' as const,
    },
    {
      id: 'm2',
      senderId: 'user-2',
      senderType: 'coach' as const,
      senderName: '이코치',
      content: '네, 안녕하세요!',
      createdAt: '2026-04-12T10:01:00Z',
      type: 'text' as const,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chatRoomId로 메시지를 페칭한다', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      success: true,
      data: { messages: mockMessages },
    });

    const { result } = renderHook(() => useChatMessages('room-1'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.messages).toEqual(mockMessages);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/chat/rooms/room-1/messages');
  });

  it('chatRoomId가 null이면 빈 배열을 반환한다', async () => {
    const { result } = renderHook(() => useChatMessages(null));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('markAsRead를 호출한다', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      success: true,
      data: { messages: mockMessages },
    });
    (api.patch as jest.Mock).mockResolvedValue({ success: true });

    const { result } = renderHook(() => useChatMessages('room-1'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.markAsRead('c1');
    });

    expect(api.patch).toHaveBeenCalledWith('/consultations/c1/read');
  });

  it('API 실패 시 에러 상태를 설정한다', async () => {
    (api.get as jest.Mock).mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useChatMessages('room-1'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.error).toBe('메시지를 불러올 수 없습니다.');
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
