'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal } from '@/components/ui/modal';
import { api } from '@/services/api-client';
import { env } from '@/lib/env';
import {
  ArrowLeft,
  Edit2,
  Save,
  X,
  Send,
  Calendar,
  User,
  Mail,
  Eye,
  MessageSquare,
  FileText,
  Download,
} from 'lucide-react';

interface TmsPost {
  id: string;
  title: string;
  content: string;
  platform: string;
  category: string;
  priority: string;
  status: string;
  authorName: string;
  authorEmail?: string;
  assignee?: string;
  dueDate?: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  attachments: TmsAttachment[];
  comments: TmsComment[];
}

interface TmsAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface TmsComment {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
}

const platformLabel: Record<string, string> = {
  web: 'Web', app: 'App', admin: 'Admin', backend: 'Backend', other: '기타',
};

const categoryLabel: Record<string, string> = {
  bug: '버그', feature: '기능 요청', improvement: '개선', design: '디자인', other: '기타',
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: '낮음', className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  medium: { label: '보통', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  high: { label: '높음', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  critical: { label: '긴급', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  todo: { label: 'TODO', className: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  in_progress: { label: '진행중', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  review: { label: '리뷰', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  done: { label: '완료', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const platformBadgeClass: Record<string, string> = {
  web: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  app: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  backend: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  other: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

export default function TmsDetailPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;

  const [post, setPost] = useState<TmsPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 이미지 팝업
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  // 수정 모드
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPlatform, setEditPlatform] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 댓글
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const loadPost = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<TmsPost>(`/tms/${postId}`);
      const data = res as unknown as TmsPost;
      setPost(data);
    } catch (error) {
      console.error('[TMS] 상세 로드 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.tms.loadError });
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  useEffect(() => {
    if (actionMsg) {
      const timer = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionMsg]);

  // 수정 모드 진입
  const startEditing = () => {
    if (!post) return;
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditPlatform(post.platform);
    setEditCategory(post.category);
    setEditPriority(post.priority);
    setEditAssignee(post.assignee || '');
    setEditDueDate(post.dueDate ? post.dueDate.split('T')[0] : '');
    setIsEditing(true);
  };

  // 수정 저장
  const handleSave = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      setActionMsg({ type: 'error', text: MESSAGES.tms.editRequiredFields });
      return;
    }
    setIsSaving(true);
    try {
      await api.patch(`/tms/${postId}`, {
        title: editTitle,
        content: editContent,
        platform: editPlatform,
        category: editCategory,
        priority: editPriority,
        assignee: editAssignee || undefined,
        dueDate: editDueDate || undefined,
      });
      setActionMsg({ type: 'success', text: MESSAGES.tms.updated });
      setIsEditing(false);
      loadPost();
    } catch (error) {
      console.error('[TMS] 수정 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.tms.updateError });
    } finally {
      setIsSaving(false);
    }
  };

  // 상태 변경
  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.patch(`/tms/${postId}/status`, { status: newStatus });
      setActionMsg({ type: 'success', text: MESSAGES.tms.statusChanged });
      loadPost();
    } catch (error) {
      console.error('[TMS] 상태 변경 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.tms.statusError });
    }
  };

  // 댓글 추가
  const handleAddComment = async () => {
    if (!commentAuthor.trim() || !commentContent.trim()) {
      setActionMsg({ type: 'error', text: MESSAGES.tms.commentRequired });
      return;
    }
    setIsSubmittingComment(true);
    try {
      await api.post(`/tms/${postId}/comments`, {
        authorName: commentAuthor,
        content: commentContent,
      });
      setCommentContent('');
      setActionMsg({ type: 'success', text: MESSAGES.tms.commentCreated });
      loadPost();
    } catch (error) {
      console.error('[TMS] 댓글 추가 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.tms.commentError });
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  };

  const apiBaseUrl = env.API_ORIGIN;
  const getFileUrl = (fileUrl: string) => encodeURI(`${apiBaseUrl}${fileUrl}`);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500 dark:text-slate-400">게시글을 찾을 수 없습니다.</p>
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/tms')} className="mt-4 h-12 px-5 text-base font-bold">
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  const _sConfig = statusConfig[post.status] || statusConfig.todo;
  const pConfig = priorityConfig[post.priority] || priorityConfig.medium;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.push('/dashboard/tms')}
            className="min-h-[44px] min-w-[44px] h-11 w-11 inline-flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 motion-reduce:transition-none transition-colors"
            aria-label="목록으로 돌아가기"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">수정사항 상세</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">#{post.id.slice(-6)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isEditing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => startEditing()}
              className="h-11 px-5 text-sm font-semibold motion-reduce:transition-none"
            >
              <Edit2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
              수정하기
            </Button>
          )}
        </div>
      </div>

      {/* 알림 메시지 */}
      {actionMsg && (
        <div className={`p-4 rounded-lg text-sm font-medium ${
          actionMsg.type === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {actionMsg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 본문 (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* 제목 + 내용 */}
          <Card className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            {isEditing ? (
              <div className="space-y-4">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="제목"
                  className="text-lg font-bold"
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <div className="grid grid-cols-3 gap-3">
                  <select value={editPlatform} onChange={(e) => setEditPlatform(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <option value="web">Web</option>
                    <option value="app">App</option>
                    <option value="admin">Admin</option>
                    <option value="backend">Backend</option>
                    <option value="other">기타</option>
                  </select>
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <option value="bug">버그</option>
                    <option value="feature">기능 요청</option>
                    <option value="improvement">개선</option>
                    <option value="design">디자인</option>
                    <option value="other">기타</option>
                  </select>
                  <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <option value="low">낮음</option>
                    <option value="medium">보통</option>
                    <option value="high">높음</option>
                    <option value="critical">긴급</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input value={editAssignee} onChange={(e) => setEditAssignee(e.target.value)} placeholder="담당자 (선택)" />
                  <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)} className="h-12 px-5 text-base font-bold">
                    <X className="w-4 h-4 mr-1" aria-hidden="true" />취소
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={isSaving} className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white">
                    <Save className="w-4 h-4 mr-1" aria-hidden="true" />{isSaving ? '저장 중...' : '저장하기'}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Badge className={`text-xs ${platformBadgeClass[post.platform] || platformBadgeClass.other}`}>
                    {platformLabel[post.platform] || post.platform}
                  </Badge>
                  <Badge className={`text-xs ${pConfig.className}`}>{pConfig.label}</Badge>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{categoryLabel[post.category] || post.category}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">{post.title}</h2>
                <div className="prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {post.content}
                </div>
              </div>
            )}
          </Card>

          {/* 첨부파일 */}
          {post.attachments.length > 0 && (
            <Card className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                첨부파일 ({post.attachments.length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {post.attachments.map((att) => (
                  <div key={att.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    {att.fileType.startsWith('image/') ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ url: getFileUrl(att.fileUrl), name: att.fileName })}
                        className="aspect-video bg-slate-100 dark:bg-slate-800 flex items-center justify-center w-full cursor-pointer hover:opacity-80 transition-opacity"
                        title="클릭하여 크게 보기"
                        aria-label="첨부 이미지 크게 보기"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getFileUrl(att.fileUrl)}
                          alt={att.fileName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </button>
                    ) : (
                      <div className="aspect-video bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <FileText className="w-8 h-8 text-slate-400" aria-hidden="true" />
                      </div>
                    )}
                    <div className="p-2 flex items-center justify-between">
                      <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{att.fileName}</span>
                      <a
                        href={getFileUrl(att.fileUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 댓글 */}
          <Card className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              <MessageSquare className="w-4 h-4 inline-block mr-1" aria-hidden="true" />
              댓글 ({post.comments.length})
            </h3>

            {/* 댓글 목록 */}
            {post.comments.length > 0 ? (
              <div className="space-y-4 mb-6">
                {post.comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {comment.authorName.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{comment.authorName}</span>
                        <span className="text-xs text-slate-400">{formatDate(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500 mb-6">아직 댓글이 없습니다.</p>
            )}

            {/* 댓글 작성 */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="flex gap-3 mb-3">
                <Input
                  value={commentAuthor}
                  onChange={(e) => setCommentAuthor(e.target.value)}
                  placeholder="작성자 이름"
                  className="w-40"
                />
              </div>
              <div className="flex gap-2">
                <textarea
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="댓글을 입력하세요..."
                  rows={2}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <Button
                  type="button"
                  onClick={handleAddComment}
                  disabled={isSubmittingComment}
                  className="h-12 px-5 bg-primary hover:bg-primary-dark text-white self-end"
                  aria-label="댓글 등록"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* 사이드바 (1/3) */}
        <div className="space-y-4">
          {/* 상태 */}
          <Card className="p-5 rounded-xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">상태</h3>
            <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="상태 변경">
              {Object.entries(statusConfig).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={post.status === key}
                  onClick={() => handleStatusChange(key)}
                  className={`min-h-[40px] px-3 py-2 text-sm rounded-lg text-left motion-reduce:transition-none transition-colors ${
                    post.status === key
                      ? `${config.className} font-semibold ring-2 ring-primary/30`
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </Card>

          {/* 상세 정보 */}
          <Card className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">상세 정보</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <span className="text-slate-500 dark:text-slate-400 w-16">작성자</span>
                <span className="text-slate-900 dark:text-white font-medium">{post.authorName}</span>
              </div>
              {post.authorEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  <span className="text-slate-500 dark:text-slate-400 w-16">이메일</span>
                  <span className="text-slate-700 dark:text-slate-300 text-xs">{post.authorEmail}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <span className="text-slate-500 dark:text-slate-400 w-16">담당자</span>
                <span className="text-slate-900 dark:text-white">{post.assignee || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <span className="text-slate-500 dark:text-slate-400 w-16">마감일</span>
                <span className="text-slate-900 dark:text-white">{post.dueDate ? formatDateShort(post.dueDate) : '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <span className="text-slate-500 dark:text-slate-400 w-16">조회수</span>
                <span className="text-slate-900 dark:text-white">{post.viewCount}</span>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-700 pt-2 mt-2">
                <p className="text-xs text-slate-400">등록: {formatDate(post.createdAt)}</p>
                <p className="text-xs text-slate-400">수정: {formatDate(post.updatedAt)}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* 이미지 미리보기 팝업 */}
      {previewImage && (
        <Modal
          isOpen={!!previewImage}
          onClose={() => setPreviewImage(null)}
          className="max-w-[90vw] max-h-[90vh] overflow-hidden"
        >
          <div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[400px]">
                {previewImage.name}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.url}
                  download={previewImage.name}
                  className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  다운로드
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="이미지 미리보기 닫기"
                >
                  <X className="w-5 h-5 text-slate-500" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-w-[80vw] max-h-[75vh] object-contain rounded"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
