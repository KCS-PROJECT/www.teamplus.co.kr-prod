'use client';

import { useState, useEffect, useCallback } from 'react';
import { MESSAGES } from '@/lib/messages';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Search,
  Eye,
  Send,
  Users,
  User,
  Building2,
  GraduationCap,
  Headphones,
  Plus,
} from 'lucide-react';
import { api } from '@/services/api-client';

interface ChatRoom {
  id: string;
  name?: string;
  type: 'DIRECT' | 'GROUP' | 'CLASS' | 'CLUB' | 'SUPPORT';
  memberCount: number;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  isActive: boolean;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM' | 'NOTICE';
  createdAt: string;
  isAdmin?: boolean;
}

const roomTypeLabels: Record<string, { label: string; icon: typeof User; color: string }> = {
  DIRECT: { label: '1:1 채팅', icon: User, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  GROUP: { label: '그룹 채팅', icon: Users, color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  CLASS: { label: '수업 채팅방', icon: GraduationCap, color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  CLUB: { label: '클럽 채팅방', icon: Building2, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  SUPPORT: { label: '고객 지원', icon: Headphones, color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
};


export default function MessagesPage() {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeTarget, setNoticeTarget] = useState<string>('all');
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadRooms = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{
        rooms?: ChatRoom[];
        data?: ChatRoom[];
      }>('/chat/rooms');
      setRooms(res.rooms ?? res.data ?? []);
    } catch (error) {
      console.error('[MessagesPage] 채팅방 목록 조회 실패:', error);
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const filteredRooms = rooms.filter((room) => {
    const matchesSearch =
      (room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
      (room.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesType = typeFilter === 'all' || room.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleOpenChat = async (room: ChatRoom) => {
    setSelectedRoom(room);
    setMessages([]);
    setNewMessage('');
    setIsChatOpen(true);
    try {
      const res = await api.get<{
        messages?: ChatMessage[];
        data?: ChatMessage[];
      }>(`/chat/rooms/${room.id}/messages`);
      setMessages(res.messages ?? res.data ?? []);
    } catch (error) {
      console.error('[MessagesPage] 메시지 조회 실패:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedRoom || !newMessage.trim()) return;
    const content = newMessage;
    setNewMessage('');
    try {
      const res = await api.post<ChatMessage>(`/chat/rooms/${selectedRoom.id}/messages`, {
        content,
        type: 'TEXT',
      });
      setMessages((prev) => [...prev, res as ChatMessage]);
    } catch (error) {
      console.error('[MessagesPage] 메시지 전송 실패:', error);
      // 전송 실패 시 로컬에서라도 추가 (낙관적 업데이트)
      const newMsg: ChatMessage = {
        id: Date.now().toString(),
        senderId: 'admin',
        senderName: '관리자',
        content,
        type: 'TEXT',
        createdAt: new Date().toLocaleString('ko-KR'),
        isAdmin: true,
      };
      setMessages((prev) => [...prev, newMsg]);
    }
  };

  const handleSendNotice = async () => {
    if (!noticeContent.trim()) return;
    try {
      await api.post('/notifications/admin/push', {
        title: '공지사항',
        bodyText: noticeContent,
        targetType: noticeTarget === 'all' ? 'all' : 'role',
        role: noticeTarget !== 'all' ? noticeTarget.toUpperCase() : undefined,
      });
      setActionMsg({ type: 'success', text: MESSAGES.notice.sent });
      setTimeout(() => setActionMsg(null), 3000);
    } catch (error) {
      console.error('[MessagesPage] 공지 발송 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.notice.sendError });
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsNoticeOpen(false);
      setNoticeContent('');
    }
  };

  const getStats = () => {
    return {
      total: rooms.length,
      support: rooms.filter((r) => r.type === 'SUPPORT').length,
      unread: rooms.reduce((sum, r) => sum + r.unreadCount, 0),
      active: rooms.filter((r) => r.isActive).length,
    };
  };

  const stats = getStats();

  if (isLoading) {
    return <LoadingSpinner message="채팅방 목록을 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div className={`p-3 rounded-lg text-sm ${
          actionMsg.type === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {actionMsg.text}
        </div>
      )}

      <PageHeader
        title="메시지 관리"
        description="채팅방과 메시지를 관리합니다."
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
          <div className="text-sm text-slate-500 dark:text-slate-400">전체 채팅방</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{stats.total}개</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Headphones className="h-4 w-4 text-red-500" aria-hidden="true" />
            고객 지원
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">{stats.support}개</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
          <div className="text-sm text-slate-500 dark:text-slate-400">읽지 않은 메시지</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{stats.unread}개</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
          <div className="text-sm text-slate-500 dark:text-slate-400">활성 채팅방</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums">{stats.active}개</div>
        </div>
      </div>

      {/* 필터 및 액션 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="채팅방 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="유형 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              {Object.entries(roomTypeLabels).map(([key, value]) => (
                <SelectItem key={key} value={key}>
                  {value.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={() => setIsNoticeOpen(true)} className="gap-2 h-11 motion-reduce:transition-none">
          <Plus className="h-4 w-4" aria-hidden="true" />
          공지 발송
        </Button>
      </div>

      {/* 채팅방 목록 */}
      <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">채팅방</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">유형</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">참여자</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">최근 메시지</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">읽지 않음</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">마지막 활동</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    로딩 중...
                  </td>
                </tr>
              ) : filteredRooms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    채팅방이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRooms.map((room) => {
                  const typeInfo = roomTypeLabels[room.type];
                  const Icon = typeInfo.icon;
                  return (
                    <tr key={room.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="font-medium text-slate-900 dark:text-white">
                            {room.name || `${room.type} 채팅방`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                          <span className="text-slate-700 dark:text-slate-300 tabular-nums">{room.memberCount}명</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <p className="text-sm text-slate-600 dark:text-slate-400 truncate max-w-xs mx-auto">
                          {room.lastMessage || '-'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {room.unreadCount > 0 ? (
                          <Badge className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                            {room.unreadCount}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                          {room.lastMessageAt || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenChat(room)}
                          className="gap-1 motion-reduce:transition-none"
                          aria-label={`${room.name || room.type} 채팅방 보기`}
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          보기
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 채팅 다이얼로그 */}
      <Dialog open={isChatOpen} onOpenChange={setIsChatOpen}>
        <DialogContent className="max-w-2xl h-[600px] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRoom && (
                <>
                  <span>{selectedRoom.name || `${selectedRoom.type} 채팅방`}</span>
                  <Badge className={roomTypeLabels[selectedRoom.type].color}>
                    {roomTypeLabels[selectedRoom.type].label}
                  </Badge>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* 메시지 목록 */}
          <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.isAdmin ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-3 ${
                    msg.isAdmin
                      ? 'bg-primary text-white'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {!msg.isAdmin && (
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      {msg.senderName}
                    </p>
                  )}
                  <p className="text-sm dark:text-slate-100">{msg.content}</p>
                  <p
                    className={`text-xs mt-1 ${
                      msg.isAdmin ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {msg.createdAt}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* 메시지 입력 */}
          <div className="flex gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="메시지를 입력하세요..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <Button type="button" onClick={handleSendMessage} className="motion-reduce:transition-none" aria-label="메시지 전송">
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 공지 발송 다이얼로그 */}
      <Dialog open={isNoticeOpen} onOpenChange={setIsNoticeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>공지 발송</DialogTitle>
            <DialogDescription>
              선택한 대상에게 공지 메시지를 발송합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">발송 대상</label>
              <Select value={noticeTarget} onValueChange={setNoticeTarget}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 회원</SelectItem>
                  <SelectItem value="club">클럽 채팅방</SelectItem>
                  <SelectItem value="class">수업 채팅방</SelectItem>
                  <SelectItem value="parent">학부모</SelectItem>
                  <SelectItem value="coach">코치</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">공지 내용</label>
              <Textarea
                value={noticeContent}
                onChange={(e) => setNoticeContent(e.target.value)}
                placeholder="공지 내용을 입력하세요..."
                rows={5}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsNoticeOpen(false)} className="motion-reduce:transition-none">
              취소
            </Button>
            <Button type="button" onClick={handleSendNotice} disabled={!noticeContent.trim()} className="motion-reduce:transition-none">
              발송하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
