'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Trash2, Check, Bell, MessageSquare, Clock,
  CheckCircle, XCircle,
  ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight
} from 'lucide-react';

// ==================== 타입 정의 ====================

type NotificationType = 'info' | 'success' | 'warning' | 'error';
type AlimtalkStatus = 'sent' | 'delivered' | 'failed' | 'pending';
type AlimtalkTemplate = 'payment_success' | 'membership_approved' | 'class_cancelled' | 'class_reminder' | 'credit_expiring' | 'custom';

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

interface NotificationHistoryProps {
  displayNotifications: Notification[];
  paginatedNotifications: Notification[];
  activeTab: 'notifications' | 'alimtalk';
  filterUnread: boolean;
  currentPage: number;
  totalPages: number;
  startIndex: number;
  onPageChange: (page: number) => void;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

// ==================== 헬퍼 함수 ====================

function getTypeIcon(type: string) {
  switch (type) {
    case 'success': return '\u2713';
    case 'error': return '\u2715';
    case 'warning': return '!';
    case 'info':
    default: return '\u2139';
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'success': return '성공';
    case 'error': return '오류';
    case 'warning': return '경고';
    case 'info':
    default: return '정보';
  }
}

function getAlimtalkStatusBadge(status?: AlimtalkStatus) {
  switch (status) {
    case 'delivered':
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
          <CheckCircle className="w-3 h-3" />
          발송 완료
        </Badge>
      );
    case 'sent':
      return (
        <Badge variant="outline" className="bg-primary/5 text-blue-700 border-blue-200 gap-1">
          <Clock className="w-3 h-3" />
          발송 중
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
          <XCircle className="w-3 h-3" />
          발송 실패
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
          <Clock className="w-3 h-3" />
          대기 중
        </Badge>
      );
    default:
      return null;
  }
}

// ==================== 컴포넌트 ====================

export default function NotificationHistory({
  displayNotifications,
  paginatedNotifications,
  activeTab,
  filterUnread,
  currentPage,
  totalPages,
  startIndex,
  onPageChange,
  onMarkAsRead,
  onDelete,
}: NotificationHistoryProps) {
  return (
    <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
            <tr>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">번호</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">유형</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">제목</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">내용</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">수신자</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">상태</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">일시</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {paginatedNotifications.length > 0 ? (
              paginatedNotifications.map((notification, index) => (
                <tr
                  key={notification.id}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                    !notification.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                  }`}
                >
                  <td className="px-4 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                    {displayNotifications.length - startIndex - index}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          notification.type === 'success'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : notification.type === 'error'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : notification.type === 'warning'
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                : 'bg-primary/10 text-blue-700 dark:text-primary-light'
                        }`}
                      >
                        {notification.isAlimtalk ? (
                          <MessageSquare className="w-4 h-4" />
                        ) : (
                          getTypeIcon(notification.type)
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">
                        {notification.title}
                      </span>
                      {!notification.isRead && (
                        <div className="w-2 h-2 rounded-full bg-primary dark:bg-blue-400"></div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">
                    {notification.message}
                  </td>
                  <td className="px-4 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                    {notification.recipient}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center">
                      {notification.isAlimtalk ? (
                        getAlimtalkStatusBadge(notification.alimtalkStatus)
                      ) : (
                        <Badge variant="outline" className="text-xs border-slate-300 dark:border-slate-600">
                          {getTypeLabel(notification.type)}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                    {new Date(notification.createdAt).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {!notification.isRead && (
                        <button
                          onClick={() => onMarkAsRead(notification.id)}
                          className="p-1.5 hover:bg-primary/5 dark:hover:bg-primary/20 rounded-lg transition-colors"
                          title="읽음으로 표시"
                        >
                          <Check className="w-4 h-4 text-blue-600 dark:text-primary-light" />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(notification.id)}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-4">
                      {activeTab === 'alimtalk' ? (
                        <MessageSquare className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                      ) : (
                        <Bell className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                      {activeTab === 'alimtalk'
                        ? '알림톡 이력이 없습니다'
                        : filterUnread
                          ? '읽지 않은 알림이 없습니다'
                          : '알림이 없습니다'}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400">
                      {activeTab === 'alimtalk'
                        ? '알림톡을 발송하면 이력이 표시됩니다.'
                        : filterUnread
                          ? '모든 알림을 읽었습니다.'
                          : '새로운 알림이 없습니다.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 페이징 UI */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="첫 페이지"
          >
            <ChevronsLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="이전 페이지"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>

          <div className="flex items-center gap-1 mx-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page, index, arr) => (
              <span key={page} className="flex items-center">
                <button
                  onClick={() => onPageChange(page)}
                  className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === page
                      ? 'bg-primary text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {page}
                </button>
                {index < arr.length - 1 && (
                  <span className="text-slate-300 dark:text-slate-600 mx-0.5">|</span>
                )}
              </span>
            ))}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="다음 페이지"
          >
            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="마지막 페이지"
          >
            <ChevronsRight className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
      )}
    </Card>
  );
}
