/**
 * FeedbackFormExample — RHF + Zod 폼 마이그레이션 참조 구현 (2026-05-14)
 *
 * 실제 `/feedback` 페이지의 WriteTab 교체 참조. 본 컴포넌트는 패턴 데모이며
 * 실제 마이그레이션은 패키지 설치 후 `app/(common)/feedback/page.tsx` 의
 * WriteTab 부분을 동일한 구조로 교체한다.
 *
 * 차별점 (vs login):
 *  - enum 선택 (category) — Controller 또는 register + setValue 패턴
 *  - 긴 텍스트 검증 (min 10 / max 2000)
 *  - 선택 필드 (rating)
 */

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { feedbackSchema, type FeedbackInput } from '../schemas';

interface Props {
  onSubmit: (data: FeedbackInput) => Promise<void>;
}

const CATEGORIES: Array<{ value: FeedbackInput['category']; label: string }> = [
  { value: 'bug', label: '오류 신고' },
  { value: 'improvement', label: '개선 제안' },
  { value: 'question', label: '문의' },
  { value: 'other', label: '기타' },
];

export function FeedbackFormExample({ onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FeedbackInput>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: { category: 'improvement', content: '' },
  });

  const contentValue = watch('content') ?? '';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-wtext-1">카테고리</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <label
              key={c.value}
              className="inline-flex items-center gap-2 rounded-w-md border border-wline px-3 py-2"
            >
              <input
                type="radio"
                value={c.value}
                {...register('category')}
              />
              <span className="text-sm">{c.label}</span>
            </label>
          ))}
        </div>
        {errors.category && (
          <p className="mt-1 text-sm text-flame-500">{errors.category.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="content" className="block text-sm font-medium text-wtext-1">
          내용 <span className="text-wtext-3">({contentValue.length}/2000)</span>
        </label>
        <textarea
          {...register('content')}
          id="content"
          rows={6}
          className="mt-1 w-full rounded-w-md border border-wline px-3 py-2"
          placeholder="10자 이상 자세히 작성해주세요."
        />
        {errors.content && (
          <p className="mt-1 text-sm text-flame-500">{errors.content.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-w-md bg-ice-500 py-2 text-white font-bold disabled:opacity-60"
      >
        {isSubmitting ? '전송 중…' : '피드백 보내기'}
      </button>
    </form>
  );
}
