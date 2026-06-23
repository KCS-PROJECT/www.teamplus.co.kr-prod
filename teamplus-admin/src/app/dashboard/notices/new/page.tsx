'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  type AdminNoticeCategory,
  type AdminNoticeTargetType,
  createAdminNotice,
} from '@/lib/admin-notice-store';
import {
  AGE_GROUPS,
  AGE_GROUP_LABELS,
  type AgeGroupKey,
  formatBirthYearPreview,
  selectedGroupsToBirthYearRange,
} from '@/lib/gradeToBirthYear';

type MessageState = { type: 'success' | 'error'; text: string } | null;

interface NoticeFormState {
  title: string;
  content: string;
  category: AdminNoticeCategory;
  targetType: AdminNoticeTargetType;
  targetName: string;
  isPinned: boolean;
  isPublished: boolean;
}

const initialForm: NoticeFormState = {
  title: '',
  content: '',
  category: 'general',
  targetType: 'all',
  targetName: '',
  isPinned: false,
  isPublished: true,
};

export default function NewNoticePage() {
  const router = useRouter();
  const [form, setForm] = useState<NoticeFormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageState>(null);
  const [selectedGrades, setSelectedGrades] = useState<AgeGroupKey[]>([]);

  const toggleGrade = (grade: AgeGroupKey) => {
    setSelectedGrades((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade],
    );
  };

  const gradePreview = formatBirthYearPreview(selectedGrades, '전체');

  const handleSubmit = () => {
    if (!form.title.trim()) {
      setMessage({ type: 'error', text: '공지 제목을 입력해주세요.' });
      return;
    }
    if (!form.content.trim()) {
      setMessage({ type: 'error', text: '공지 내용을 입력해주세요.' });
      return;
    }
    if (form.targetType !== 'all' && !form.targetName.trim()) {
      setMessage({ type: 'error', text: '대상을 입력해주세요.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const range = selectedGroupsToBirthYearRange(selectedGrades);
      const created = createAdminNotice({
        title: form.title,
        content: form.content,
        category: form.category,
        targetType: form.targetType,
        targetName: form.targetType === 'all' ? undefined : form.targetName,
        isPinned: form.isPinned,
        isPublished: form.isPublished,
        authorName: '관리자',
        targetBirthYearFrom: range.targetBirthYearFrom,
        targetBirthYearTo: range.targetBirthYearTo,
      });

      setCreatedId(created.id);
      setMessage({ type: 'success', text: '저장되었습니다.' });
      setForm(initialForm);
      setSelectedGrades([]);
    } catch (error) {
      const text = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="공지 작성"
        subtitle="공지 내용을 작성하고 발행 상태를 설정합니다."
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

      {createdId && (
        <Card className="p-4 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => router.push(`/dashboard/notices/${createdId}`)}>
            상세 보기
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard/notices')}>
            목록으로 이동
          </Button>
        </Card>
      )}

      <Card className="p-5 space-y-4">
        <div>
          <label className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">제목</label>
          <Input
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="공지 제목을 입력해주세요."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">카테고리</label>
            <select
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as AdminNoticeCategory }))}
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
              onChange={(e) => setForm((prev) => ({ ...prev, targetType: e.target.value as AdminNoticeTargetType }))}
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
              onChange={(e) => setForm((prev) => ({ ...prev, targetName: e.target.value }))}
              placeholder={form.targetType === 'club' ? '예: ACE 아이스하키' : '예: 신규 수강생반'}
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              대상 학년 (선택)
            </label>
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              대상 출생연도: {gradePreview}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {AGE_GROUPS.map((grade) => {
              const checked = selectedGrades.includes(grade);
              return (
                <button
                  type="button"
                  key={grade}
                  onClick={() => toggleGrade(grade)}
                  aria-pressed={checked}
                  className={`min-h-[36px] px-3 py-1.5 rounded-full border text-sm font-medium transition-colors motion-reduce:transition-none ${
                    checked
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-primary'
                  }`}
                >
                  {AGE_GROUP_LABELS[grade]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            선택하지 않으면 전체 학년에 노출됩니다.
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1.5 text-slate-600 dark:text-slate-300">내용</label>
          <Textarea
            value={form.content}
            onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
            placeholder="공지 내용을 입력해주세요."
            className="min-h-[300px] leading-relaxed"
            aria-label="공지 내용"
          />
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isPinned}
              onChange={(e) => setForm((prev) => ({ ...prev, isPinned: e.target.checked }))}
            />
            상단 고정
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => setForm((prev) => ({ ...prev, isPublished: e.target.checked }))}
            />
            즉시 발행
          </label>
        </div>

        <div className="flex gap-2">
          <Button type="button" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? '저장 중...' : '등록하기'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard/notices')}>
            취소
          </Button>
        </div>
      </Card>
    </div>
  );
}

