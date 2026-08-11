'use client';

/**
 * 피드백 접수함 - TEAMPLUS 관리자
 *
 * 감독/학부모 등 앱 사용자가 제출한 피드백(AppFeedback)을 조회·처리한다.
 * - 목록: GET /app/feedback (ADMIN 전용, 전체 사용자 피드백)
 * - 처리: PATCH /app/feedback/:id { status, adminNote } (상태 변경 + 답변)
 * 작성자 이름/팀, 첨부 사진을 함께 표시한다.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ActionToast, type ActionToastValue } from '@/components/common';
import {
  MessageSquare, User, Users, Paperclip, CheckCircle2, Clock, Eye,
} from 'lucide-react';

interface FeedbackAttachment {
  id: string;
  url: string;
  thumbUrl: string | null;
  originalName: string;
}

interface Feedback {
  id: string;
  category: string;
  content: string;
  rating: number | null;
  status: string;
  authorName: string | null;
  teamName: string | null;
  adminNote: string | null;
  adminReplyAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: FeedbackAttachment[];
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: '오류 신고',
  improvement: '개선 제안',
  question: '문의',
  other: '기타',
};

const STATUS_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '접수됨' },
  { value: 'reviewed', label: '검토 중' },
  { value: 'resolved', label: '답변 완료' },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: {
    label: '접수됨',
    color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
  reviewed: {
    label: '검토 중',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  resolved: {
    label: '답변 완료',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function FeedbackManagementPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Feedback | null>(null);
  const [replyStatus, setReplyStatus] = useState('reviewed');
  const [replyNote, setReplyNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<ActionToastValue>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
      const res = await api.get<{ data: Feedback[] }>(`/app/feedback?limit=100${qs}`);
      setFeedbacks(res?.data ?? []);
    } catch (error) {
      console.error('[Feedback] 로드 실패:', error);
      setFeedbacks([]);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = (fb: Feedback) => {
    setSelected(fb);
    setReplyStatus(fb.status === 'pending' ? 'reviewed' : fb.status);
    setReplyNote(fb.adminNote ?? '');
  };

  const submitReply = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.patch(`/app/feedback/${selected.id}`, {
        status: replyStatus,
        adminNote: replyNote.trim() || undefined,
      });
      setSelected(null);
      setActionMsg({ type: 'success', text: '피드백 처리 내용이 저장되었습니다.' });
      setTimeout(() => setActionMsg(null), 3000);
      await load();
    } catch (error) {
      console.error('[Feedback] 저장 실패:', error);
      setActionMsg({ type: 'error', text: '저장에 실패했습니다. 다시 시도해주세요.' });
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const fileUrl = (u: string) => (/^https?:\/\//.test(u) ? u : `${env.API_ORIGIN}${u}`);

  if (isLoading) {
    return <LoadingSpinner message="피드백을 불러오는 중..." />;
  }

  const pendingCount = feedbacks.filter((f) => f.status === 'pending').length;
  const resolvedCount = feedbacks.filter((f) => f.status === 'resolved').length;

  return (
    <div className="space-y-6">
      <ActionToast value={actionMsg} onClose={() => setActionMsg(null)} />

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{feedbacks.length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">전체 피드백</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{pendingCount}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">미처리(접수됨)</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{resolvedCount}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">답변 완료</p>
            </div>
          </div>
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">접수된 피드백</h2>
            <div className="flex flex-wrap gap-2">
              <label htmlFor="feedback-status-filter" className="sr-only">상태 필터</label>
              <select
                id="feedback-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="피드백 상태 필터"
                className="h-10 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-slate-200"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {feedbacks.map((fb) => {
            const statusMeta = STATUS_META[fb.status] ?? STATUS_META.pending;
            const hasReply = !!fb.adminNote && !!fb.adminReplyAt;
            return (
              <div
                key={fb.id}
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => openDetail(fb)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDetail(fb);
                  }
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    {/* 작성자 이름/팀 + 상태 */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900 dark:text-white">
                        <User className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        {fb.authorName || '이름 미기재'}
                      </span>
                      {fb.teamName && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <Users className="w-3.5 h-3.5" aria-hidden="true" />
                          {fb.teamName}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusMeta.color}`}>
                        {statusMeta.label}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {CATEGORY_LABEL[fb.category] ?? fb.category}
                      </span>
                      {hasReply && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          답변 완료
                        </span>
                      )}
                    </div>

                    {/* 내용 */}
                    <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">{fb.content}</p>

                    {/* 첨부 썸네일 + 작성일 */}
                    <div className="flex items-center gap-3 mt-2">
                      {fb.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                          사진 {fb.attachments.length}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                        {formatDateTime(fb.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex-shrink-0 flex items-center">
                    <button
                      type="button"
                      aria-label="피드백 상세 보기"
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                      onClick={(e) => { e.stopPropagation(); openDetail(fb); }}
                    >
                      <Eye className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {feedbacks.length === 0 && (
          <div className="p-12 text-center">
            <MessageSquare className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" aria-hidden="true" />
            <p className="text-slate-500 dark:text-slate-400">접수된 피드백이 없습니다</p>
          </div>
        )}
      </div>

      {/* 상세 + 처리 모달 */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} size="lg">
        <ModalHeader title="피드백 상세" icon={MessageSquare} />
        <ModalBody>
          {selected && (
            <div className="space-y-5">
              {/* 작성자 정보 */}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                  <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  {selected.authorName || '이름 미기재'}
                </span>
                {selected.teamName && (
                  <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <Users className="w-4 h-4" aria-hidden="true" />
                    {selected.teamName}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {CATEGORY_LABEL[selected.category] ?? selected.category}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {formatDateTime(selected.createdAt)}
                </span>
              </div>

              {/* 내용 */}
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 tracking-wider">내용</p>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  {selected.content}
                </p>
              </div>

              {/* 첨부 사진 */}
              {selected.attachments.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 tracking-wider">
                    첨부 사진 ({selected.attachments.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selected.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={fileUrl(att.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-24 h-24 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-primary transition-shadow"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={fileUrl(att.thumbUrl || att.url)}
                          alt={att.originalName}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* 처리: 상태 + 답변 */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-3">
                <div className="space-y-2">
                  <label htmlFor="reply-status" className="block text-sm font-medium text-slate-700 dark:text-slate-300">처리 상태</label>
                  <select
                    id="reply-status"
                    value={replyStatus}
                    onChange={(e) => setReplyStatus(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-slate-200"
                  >
                    <option value="pending">접수됨</option>
                    <option value="reviewed">검토 중</option>
                    <option value="resolved">답변 완료</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="reply-note" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    답변 (선택 — 작성 시 사용자에게 알림이 발송됩니다)
                  </label>
                  <textarea
                    id="reply-note"
                    value={replyNote}
                    onChange={(e) => setReplyNote(e.target.value)}
                    placeholder="사용자에게 전달할 답변을 입력해주세요"
                    rows={4}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSelected(null)}
            className="flex-1 h-12 px-5 text-base font-bold border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            닫기
          </Button>
          <Button
            type="button"
            onClick={submitReply}
            disabled={saving}
            className="flex-1 h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장하기'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
