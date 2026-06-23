'use client';

/**
 * 알림 센터 페이지 (알림톡 발송 기능 포함)
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석 필수: 기존 알림 센터 + PDF 요구사항 (알림톡) 분석
 * 2. 휴먼 디자인: 사람이 만든 것처럼 자연스럽고 직관적인 UI
 * 3. AI 스타일 절대 금지: gradient, blur, 과도한 애니메이션 사용 안함
 * 4. 페르소나 융합/협업: frontend + architect + analyzer 협업
 * 5. 명령어 필수: frontend-design 관련 명령어 적용
 * 6. 결과 출력 필수: 7원칙 적용 내용 문서화
 * 7. Tone & Manner 적용: 존댓말, 액션 동사, 일관된 용어
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { getUsers } from '@/services/user.service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Check, Bell, Send, MessageSquare, Clock,
  CheckCircle
} from 'lucide-react';
import NotificationForm from './_components/NotificationForm';
import NotificationHistory from './_components/NotificationHistory';

// ==================== 타입 정의 ====================

interface ApiNotification {
  id: string;
  notificationType: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface AdminStats {
  totalNotifications: number;
  unreadCount: number;
  readCount: number;
  alimtalk: { sent: number; failed: number; pending: number };
}

type NotificationType = 'info' | 'success' | 'warning' | 'error';
type AlimtalkStatus = 'sent' | 'delivered' | 'failed' | 'pending';
type AlimtalkTemplate = 'payment_success' | 'membership_approved' | 'class_cancelled' | 'class_reminder' | 'credit_expiring' | 'custom';
type TargetType = 'all' | 'club' | 'class' | 'individual';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: string;
  isRead: boolean;
  recipient: string;
  isAlimtalk?: boolean;
  alimtalkStatus?: AlimtalkStatus;
  templateCode?: AlimtalkTemplate;
}

interface AlimtalkTemplateInfo {
  id: string;
  code: AlimtalkTemplate;
  name: string;
  description: string;
  variables: string[];
  example: string;
}

interface Member {
  id: string;
  name: string;
  phone: string;
  club: string;
  class: string;
}

// ==================== 상수 ====================

const ITEMS_PER_PAGE = 10;

const ALIMTALK_TYPES = new Set([
  'payment_success', 'membership_approved', 'class_cancelled',
  'class_reminder', 'credit_expiring',
]);

const TEMPLATES: AlimtalkTemplateInfo[] = [
  {
    id: '1',
    code: 'payment_success',
    name: '결제 완료',
    description: '결제가 완료되었을 때 발송',
    variables: ['회원명', '상품명', '결제금액', '유효기간'],
    example: '안녕하세요, {{회원명}}님! {{상품명}} 결제가 완료되었습니다. 결제금액: {{결제금액}}원, 유효기간: {{유효기간}}',
  },
  {
    id: '2',
    code: 'membership_approved',
    name: '회원 가입 승인',
    description: '회원 가입이 승인되었을 때 발송',
    variables: ['회원명', '클럽명', '코치명'],
    example: '안녕하세요, {{회원명}}님! {{클럽명}} 가입이 승인되었습니다. 담당 코치: {{코치명}}',
  },
  {
    id: '3',
    code: 'class_cancelled',
    name: '수업 취소',
    description: '수업이 취소되었을 때 발송',
    variables: ['회원명', '수업명', '취소일', '취소사유'],
    example: '안녕하세요, {{회원명}}님! {{취소일}} {{수업명}} 수업이 취소되었습니다. 사유: {{취소사유}}. 크레딧이 복구됩니다.',
  },
  {
    id: '4',
    code: 'class_reminder',
    name: '수업 리마인더',
    description: '수업 전날 또는 당일 리마인더',
    variables: ['회원명', '수업명', '수업일시', '장소'],
    example: '안녕하세요, {{회원명}}님! 내일 {{수업일시}}에 {{수업명}} 수업이 있습니다. 장소: {{장소}}',
  },
  {
    id: '5',
    code: 'credit_expiring',
    name: '크레딧 만료 안내',
    description: '크레딧 만료 7일 전 발송',
    variables: ['회원명', '잔여크레딧', '만료일'],
    example: '안녕하세요, {{회원명}}님! 보유 크레딧 {{잔여크레딧}}개가 {{만료일}}에 만료됩니다. 기간 내 사용해주세요.',
  },
  {
    id: '6',
    code: 'custom',
    name: '커스텀 메시지',
    description: '직접 작성한 메시지 발송 (사전 승인 필요)',
    variables: [],
    example: '',
  },
];

const USER_TYPE_LABELS: Record<string, string> = {
  parent: '학부모',
  coach: '코치',
  child: '아동',
  teen: '청소년',
  director: '감독',
  academy_director: '아카데미원장',
  admin: '관리자',
};

// ==================== 헬퍼 함수 ====================

function mapApiNotification(n: ApiNotification): Notification {
  const isAlimtalk = ALIMTALK_TYPES.has(n.notificationType);
  const type: NotificationType =
    n.notificationType.includes('success') || n.notificationType.includes('approved')
      ? 'success'
      : n.notificationType.includes('cancel') || n.notificationType.includes('expir')
        ? 'warning'
        : n.notificationType.includes('fail') || n.notificationType.includes('error')
          ? 'error'
          : 'info';

  return {
    id: n.id,
    title: n.title,
    message: n.message,
    type,
    createdAt: n.createdAt,
    isRead: n.isRead,
    recipient: '',
    isAlimtalk,
    alimtalkStatus: isAlimtalk ? 'delivered' : undefined,
    templateCode: n.notificationType as AlimtalkTemplate | undefined,
  };
}

// ==================== 컴포넌트 ====================

export default function NotificationsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [filterUnread, setFilterUnread] = useState(false);
  const [activeTab, setActiveTab] = useState<'notifications' | 'alimtalk'>('notifications');
  const [currentPage, setCurrentPage] = useState(1);

  // 알림톡 발송 관련 상태
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [customMessage, setCustomMessage] = useState('');
  const [searchMember, setSearchMember] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ==================== 데이터 로딩 ====================

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [notifData, statsData] = await Promise.all([
        api.get<ApiNotification[]>('/notifications?limit=100'),
        api.get<AdminStats>('/notifications/admin/stats').catch(() => null),
      ]);
      setNotifications((notifData as ApiNotification[]).map(mapApiNotification));
      if (statsData) setAdminStats(statsData as AdminStats);
    } catch {
      // 에러 시 빈 상태 유지
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 개인 선택 모드: 회원 검색 (debounce 300ms)
  useEffect(() => {
    if (targetType !== 'individual') return;
    const handle = setTimeout(async () => {
      try {
        const res = await getUsers({ search: searchMember || undefined, pageSize: 20 });
        setMembers(
          res.data.map((u) => ({
            id: u.id,
            name: u.name || u.email,
            phone: u.phone || '',
            club: '',
            class: USER_TYPE_LABELS[u.userType] || u.userType,
          }))
        );
      } catch {
        setMembers([]);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [searchMember, targetType]);

  void router;

  // 페이지 변경 시 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, filterUnread]);

  // ==================== 파생 데이터 ====================

  const filteredNotifications = filterUnread
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  const displayNotifications = activeTab === 'notifications'
    ? filteredNotifications
    : notifications.filter((n) => n.isAlimtalk);

  const totalPages = Math.ceil(displayNotifications.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedNotifications = displayNotifications.slice(startIndex, endIndex);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const alimtalkCount = notifications.filter((n) => n.isAlimtalk).length;

  // ==================== 핸들러 ====================

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch { /* 실패해도 UI 업데이트 */ }
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/notifications/${id}`);
    } catch { /* 실패해도 UI 업데이트 */ }
    setNotifications(notifications.filter((n) => n.id !== id));
  };

  const handleSendAlimtalk = async () => {
    if (!selectedTemplate) {
      setActionMsg({ type: 'error', text: MESSAGES.pushNotification.templateRequired }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    if (selectedTemplate === 'custom' && !customMessage.trim()) {
      setActionMsg({ type: 'error', text: MESSAGES.pushNotification.customMessageRequired }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    if (targetType === 'individual' && selectedMembers.length === 0) {
      setActionMsg({ type: 'error', text: MESSAGES.pushNotification.targetRequired }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    const template = TEMPLATES.find((t) => t.code === selectedTemplate);
    const bodyText = selectedTemplate === 'custom'
      ? customMessage
      : template?.example || '';

    const pushPayload: {
      title: string;
      bodyText: string;
      targetType: 'all' | 'role' | 'specific';
      role?: string;
      userIds?: string[];
    } = {
      title: template?.name || '알림톡',
      bodyText,
      targetType: 'all',
    };
    if (targetType === 'individual') {
      pushPayload.targetType = 'specific';
      pushPayload.userIds = selectedMembers;
    } else if (targetType === 'club' || targetType === 'class') {
      // 클럽/수업 단위 타겟은 후속 과제 — 현재는 학부모 역할 발송으로 처리
      pushPayload.targetType = 'role';
      pushPayload.role = 'PARENT';
    }

    setIsSending(true);
    try {
      const result = await api.post<{ sentCount?: number; totalDevices?: number; message?: string }>(
        '/notifications/admin/push',
        pushPayload,
      );
      const sentInfo =
        typeof result?.sentCount === 'number'
          ? `${result.sentCount}명에게`
          : targetType === 'individual'
            ? `${selectedMembers.length}명에게`
            : '대상자에게';

      const newNotification: Notification = {
        id: Date.now().toString(),
        title: `${template?.name || '알림톡'} 발송 완료`,
        message: `${sentInfo} 알림이 발송되었습니다.`,
        type: 'success',
        createdAt: new Date().toISOString(),
        isRead: false,
        recipient: targetType === 'all' ? '전체 회원' : targetType === 'individual' ? `${selectedMembers.length}명` : targetType === 'club' ? '클럽 회원' : '수업 회원',
        isAlimtalk: true,
        alimtalkStatus: 'sent',
        templateCode: selectedTemplate as AlimtalkTemplate,
      };

      setNotifications([newNotification, ...notifications]);
      setShowSendModal(false);
      setSelectedTemplate('');
      setCustomMessage('');
      setSelectedMembers([]);
      setTargetType('all');
      setActionMsg({ type: 'success', text: `${sentInfo} 발송되었습니다.` }); setTimeout(() => setActionMsg(null), 3000);
    } catch (error) {
      console.error('[NotificationsPage] 알림톡 발송 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.pushNotification.sendError }); setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsSending(false);
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    if (selectedMembers.includes(memberId)) {
      setSelectedMembers(selectedMembers.filter((id) => id !== memberId));
    } else {
      setSelectedMembers([...selectedMembers, memberId]);
    }
  };

  const handleCloseSendModal = () => {
    setShowSendModal(false);
    setSelectedTemplate('');
    setCustomMessage('');
    setSelectedMembers([]);
    setTargetType('all');
  };

  if (isLoading) {
    return <LoadingSpinner message="알림을 불러오는 중..." />;
  }

  // ==================== 렌더링 ====================

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
        title="알림 센터"
        subtitle={unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개` : '모든 알림을 읽었습니다'}
      >
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => router.push('/dashboard/notifications/history')}
            variant="outline"
            className="gap-2 border-slate-200 h-11 motion-reduce:transition-none"
          >
            <Clock className="w-4 h-4" aria-hidden="true" />
            발송 이력
          </Button>
          <Button
            type="button"
            onClick={() => setShowSendModal(true)}
            className="gap-2 bg-primary hover:bg-primary-dark text-white h-11 motion-reduce:transition-none"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            알림톡 발송
          </Button>
          {unreadCount > 0 && (
            <Button
              type="button"
              onClick={handleMarkAllAsRead}
              variant="outline"
              className="gap-2 border-slate-200 h-11 motion-reduce:transition-none"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              모두 읽음
            </Button>
          )}
        </div>
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">전체 알림</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {adminStats?.totalNotifications ?? notifications.length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <MessageSquare className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">알림톡 발송</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {adminStats ? (adminStats.alimtalk.sent + adminStats.alimtalk.failed + adminStats.alimtalk.pending) : alimtalkCount}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <Bell className="w-5 h-5 text-red-700 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">읽지 않음</p>
              <p className="text-xl font-bold text-red-700 dark:text-red-400 tabular-nums">
                {adminStats?.unreadCount ?? unreadCount}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-700 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">발송 성공</p>
              <p className="text-xl font-bold text-green-700 dark:text-green-400 tabular-nums">
                {adminStats?.alimtalk.sent ?? notifications.filter((n) => n.alimtalkStatus === 'delivered').length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg w-fit" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'notifications'}
          onClick={() => setActiveTab('notifications')}
          className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-md transition-colors motion-reduce:transition-none ${
            activeTab === 'notifications'
              ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          전체 알림
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'alimtalk'}
          onClick={() => setActiveTab('alimtalk')}
          className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-md transition-colors motion-reduce:transition-none ${
            activeTab === 'alimtalk'
              ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          알림톡 이력
        </button>
      </div>

      {/* Filter Controls */}
      {activeTab === 'notifications' && notifications.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => setFilterUnread(false)}
            variant={!filterUnread ? 'default' : 'outline'}
            size="sm"
            aria-pressed={!filterUnread}
            className={`motion-reduce:transition-none tabular-nums ${!filterUnread ? 'bg-primary hover:bg-primary-dark text-white' : ''}`}
          >
            전체 ({notifications.length})
          </Button>
          <Button
            type="button"
            onClick={() => setFilterUnread(true)}
            variant={filterUnread ? 'default' : 'outline'}
            size="sm"
            aria-pressed={filterUnread}
            className={`motion-reduce:transition-none tabular-nums ${filterUnread ? 'bg-primary hover:bg-primary-dark text-white' : ''}`}
          >
            읽지 않음 ({unreadCount})
          </Button>
        </div>
      )}

      {/* Notifications Table */}
      <NotificationHistory
        displayNotifications={displayNotifications}
        paginatedNotifications={paginatedNotifications}
        activeTab={activeTab}
        filterUnread={filterUnread}
        currentPage={currentPage}
        totalPages={totalPages}
        startIndex={startIndex}
        onPageChange={handlePageChange}
        onMarkAsRead={handleMarkAsRead}
        onDelete={handleDelete}
      />

      {/* Send Alimtalk Modal */}
      <NotificationForm
        isOpen={showSendModal}
        selectedTemplate={selectedTemplate}
        targetType={targetType}
        customMessage={customMessage}
        searchMember={searchMember}
        selectedMembers={selectedMembers}
        isSending={isSending}
        templates={TEMPLATES}
        members={members}
        onTemplateChange={setSelectedTemplate}
        onTargetTypeChange={(type) => {
          setTargetType(type);
          if (type !== 'individual') {
            setSelectedMembers([]);
          }
        }}
        onCustomMessageChange={setCustomMessage}
        onSearchMemberChange={setSearchMember}
        onToggleMember={toggleMemberSelection}
        onSubmit={handleSendAlimtalk}
        onClose={handleCloseSendModal}
      />
    </div>
  );
}
