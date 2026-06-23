'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '@/services/api-client';

// ─── Types ──────────────────────────────────────────

export interface Consultation {
  id: string;
  studentName: string;
  parentName: string;
  coachName: string;
  lastMessage: string;
  lastMessageAt: string;
  // Backend ConsultationStatus enum 과 정합 (ACTIVE · CLOSED · ARCHIVED)
  status: 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  unreadCount: number;
  chatRoomId: string;
  studentProfileImage?: string;
  isOnline?: boolean;
  className?: string;
  category?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderType: 'parent' | 'coach' | 'system';
  senderName: string;
  content: string;
  createdAt: string;
  type: 'text' | 'system';
  senderProfileImage?: string;
}

interface ConsultationListResponse {
  data: Consultation[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface ChatMessagesResponse {
  messages: ChatMessage[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
  };
}

// ─── Fallback Data ──────────────────────────────────

const FALLBACK_CONSULTATIONS: Consultation[] = [];
const FALLBACK_MESSAGES: ChatMessage[] = [];

// ─── Hook: useConsultations ─────────────────────────

export function useConsultations() {
  const [consultations, setConsultations] = useState<Consultation[]>(FALLBACK_CONSULTATIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConsultations = useCallback(async (params?: {
    status?: string;
    category?: string;
    search?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      // Backend ConsultationStatus enum 은 대문자 (ACTIVE/CLOSED/ARCHIVED) — Prisma 매칭 보장
      if (params?.status) queryParams.set('status', params.status.toUpperCase());
      if (params?.category) queryParams.set('category', params.category);
      if (params?.search) queryParams.set('search', params.search);

      const queryString = queryParams.toString();
      const url = `/consultations/my${queryString ? `?${queryString}` : ''}`;

      const res = await api.get<ConsultationListResponse>(url);
      if (res.success && res.data) {
        const list = Array.isArray(res.data) ? res.data : res.data.data ?? [];
        setConsultations(list);
      }
    } catch {
      setError('상담 목록을 불러올 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConsultations();
  }, [fetchConsultations]);

  return { consultations, isLoading, error, refresh: fetchConsultations };
}

// ─── Hook: useChatMessages ──────────────────────────

export function useChatMessages(chatRoomId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>(FALLBACK_MESSAGES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevRoomId = useRef<string | null>(null);

  const fetchMessages = useCallback(async (roomId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<ChatMessagesResponse>(`/chat/rooms/${roomId}/messages`);
      if (res.success && res.data) {
        const msgList = Array.isArray(res.data) ? res.data : res.data.messages ?? [];
        setMessages(msgList);
      }
    } catch {
      setError('메시지를 불러올 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (consultationId: string) => {
    try {
      await api.patch(`/consultations/${consultationId}/read`);
    } catch {
      // 읽음 처리 실패는 조용히 무시
    }
  }, []);

  useEffect(() => {
    if (chatRoomId && chatRoomId !== prevRoomId.current) {
      prevRoomId.current = chatRoomId;
      fetchMessages(chatRoomId);
    }
    if (!chatRoomId) {
      setMessages(FALLBACK_MESSAGES);
    }
  }, [chatRoomId, fetchMessages]);

  return {
    messages,
    isLoading,
    error,
    refresh: chatRoomId ? () => fetchMessages(chatRoomId) : () => {},
    markAsRead,
  };
}
