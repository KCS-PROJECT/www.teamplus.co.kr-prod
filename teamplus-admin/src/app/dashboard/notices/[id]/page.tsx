'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  deleteAdminNotice,
  getAdminNoticeById,
  type AdminNotice,
  type AdminNoticeCategory,
  type AdminNoticeTargetType,
  updateAdminNotice,
} from '@/lib/admin-notice-store';

type MessageState = { type: 'success' | 'error'; text: string } | null;

interface NoticeEditForm {
  title: string;
  content: string;
  category: AdminNoticeCategory;
  targetType: AdminNoticeTargetType;
  targetName: string;
  isPinned: boolean;
  isPublished: boolean;
}

const getTargetLabel = (notice: AdminNotice): string => {
  if (notice.targetType === 'all') return '전체';
  if (notice.targetType === 'club') return notice.targetName || '클럽';
  return notice.targetName || '수업';
};

export default function NoticeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const noticeId = String(params?.id || '');

  const [notice, setNotice] = useState<AdminNotice | null>(null);
  const [form, setForm] = useState<NoticeEditForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);

  useEffect(() => {
    if (!noticeId) {
      setNotice(null);
      setForm(null);
      setIsLoading(false);
      return;
    }

    const found = getAdminNoticeById(noticeId);
    setNotice(found);
    setForm(
      found
        ? {
            title: found.title,
            content: found.content,
            category: found.category,
            targetType: found.targetType,
            targetName: found.targetName || '',
            isPinned: found.isPinned,
            isPublished: found.isPublished,
          }
        : null
    );
    setIsLoading(false);
  }, [noticeId]);

  const handleSave = () => {
    if (!form || !notice) return;
    if (!form.title.trim()) {
      setMessage({ type: 'error', text: '공지 제목을 입력해주세요.' });
      return;
    }
    if (!form.content.trim()) {
      setMessage({ type: 'error', text: '공지 내용을 입력해주세요.' });
      return;
    }
    if (form.targetType !== 'all' && !form.targetName.trim()) {
      setMessage({ type: 'error', text: '대상명을 입력해주세요.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const updated = updateAdminNotice(notice.id, {
        title: form.title,
        content: form.content,
        category: form.category,
        targetType: form.targetType,
        targetName: form.targetType === 'all' ? undefined : form.targetName,
        isPinned: form.isPinned,
        isPublished: form.isPublished,
      });

      if (!updated) {
        setMessage({ type: 'error', text: '공지 정보를 찾을 수 없습니다.' });
        return;
      }

      setNotice(updated);
      setForm({
        title: updated.title,
        content: updated.content,
        category: updated.category,
        targetType: updated.targetType,
        targetName: updated.targetName || '',
        isPinned: updated.isPinned,
        isPublished: updated.isPublished,
      });
      setIsEditing(false);
      setMessage({ type: 'success', text: '수정되었습니다.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : '수정 중 오류가 발생했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!notice) return;
    setConfirmAction({ id: notice.id, action: 'delete' });
  };

  const handleDeleteConfirmed = () => {
    if (!notice) return;

    const deleted = deleteAdminNotice(notice.id);
    if (!deleted) {
      setMessage({ type: 'error', text: '삭제 중 오류가 발생했습니다.' });
      setConfirmAction(null);
      return;
    }

    router.push('/dashboard/notices');
  };

  const handleTogglePublish = () => {
    if (!notice) return;
    const updated = updateAdminNotice(notice.id, { isPublished: !notice.isPublished });
    if (!updated) {
      setMessage({ type: 'error', text: '발행 상태 변경 중 오류가 발생했습니다.' });
      return;
    }
    setNotice(updated);
    if (form) {
      setForm({ ...form, isPublished: updated.isPublished });
    }
    setMessage({
      type: 'success',
      text: updated.isPublished ? '공지가 발행되었습니다.' : '공지가 비공개 처리되었습니다.',
    });
  };

  if (isLoading) {
    return <LoadingSpinner message="공지 상세 정보를 불러오는 중입니다..." />;
  }

  if (!notice || !form) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-600 dark:text-slate-300">공지 정보를 찾을 수 없습니다.</p>
        <Button className="mt-4" onClick={() => router.push('/dashboard/notices')}>
          공지 목록으로 이동
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="공지 상세"
        subtitle={isEditing ? '공지 내용을 수정할 수 있습니다.' : '공지 상세 정보를 확인합니다.'}
        actions={[
          {
            label: '공지 목록',
            onClick: () => router.push('/dashboard/notices'),
            icon: ArrowLeft,
            variant: 'outline',
          },
        ]}
      />

      {message && (
        <Card
          className={`p-4 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {message.text}
        </Card>
      )}

      <Card className="p-5 space-y-4">
        {isEditing ? (
          <>
            <div>
              <label className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">제목</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">카테고리</label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev ? { ...prev, category: e.target.value as AdminNoticeCategory } : prev
                    )
                  }
                  className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
                >
                  <option value="general">일반</option>
                  <option value="schedule">일정</option>
                  <option value="event">이벤트</option>
                  <option value="urgent">긴급</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">대상 범위</label>
                <select
                  value={form.targetType}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev ? { ...prev, targetType: e.target.value as AdminNoticeTargetType } : prev
                    )
                  }
                  className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
                >
                  <option value="all">전체</option>
                  <option value="club">클럽</option>
                  <option value="class">수업</option>
                </select>
              </div>
            </div>

            {form.targetType !== 'all' && (
              <div>
                <label className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">대상명</label>
                <Input
                  value={form.targetName}
                  onChange={(e) =>
                    setForm((prev) => (prev ? { ...prev, targetName: e.target.value } : prev))
                  }
                />
              </div>
            )}

            <div>
              <label className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">내용</label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, content: e.target.value } : prev))}
                className="min-h-[300px] leading-relaxed"
                aria-label="공지 내용"
              />
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isPinned}
                  onChange={(e) =>
                    setForm((prev) => (prev ? { ...prev, isPinned: e.target.checked } : prev))
                  }
                />
                상단 고정
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  onChange={(e) =>
                    setForm((prev) => (prev ? { ...prev, isPublished: e.target.checked } : prev))
                  }
                />
                발행 상태
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{notice.title}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                작성자 {notice.authorName} · {new Date(notice.createdAt).toLocaleString('ko-KR')}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <span className="inline-flex rounded border border-slate-200 dark:border-slate-700 px-2 py-1">
                카테고리: {notice.category}
              </span>
              <span className="inline-flex rounded border border-slate-200 dark:border-slate-700 px-2 py-1">
                대상: {getTargetLabel(notice)}
              </span>
              <span className="inline-flex rounded border border-slate-200 dark:border-slate-700 px-2 py-1">
                조회수: {notice.viewCount}
              </span>
              <span className="inline-flex rounded border border-slate-200 dark:border-slate-700 px-2 py-1">
                상태: {notice.isPublished ? '발행' : '비공개'}
              </span>
            </div>

            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              {notice.content}
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          {isEditing ? (
            <>
              <Button type="button" onClick={() => handleSave()} disabled={isSaving}>
                {isSaving ? '저장 중...' : '수정하기'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                취소
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={() => setIsEditing(true)}>
                편집하기
              </Button>
              <Button type="button" variant="outline" onClick={() => handleTogglePublish()}>
                {notice.isPublished ? '비공개 전환' : '발행하기'}
              </Button>
              <Button type="button" variant="outline" onClick={() => handleDelete()}>
                삭제하기
              </Button>
              {confirmAction?.action === 'delete' && (
                <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <span className="text-sm text-red-700 dark:text-red-400">정말 삭제하시겠습니까?</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirmAction(null)} className="h-7 text-xs">취소</Button>
                  <Button type="button" size="sm" onClick={() => handleDeleteConfirmed()} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">삭제하기</Button>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

