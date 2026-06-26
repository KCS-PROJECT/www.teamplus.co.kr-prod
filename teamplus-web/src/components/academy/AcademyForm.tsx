'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';

export interface AcademyFormData {
  name: string;
  description: string;
  region: string;
  contactPhone: string;
  contactEmail: string;
}

interface AcademyFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<AcademyFormData>;
  onSubmit: (data: AcademyFormData) => Promise<void>;
  isSubmitting?: boolean;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 인풋 bg-it-fill + border-[1.5px] border-it-line-strong, 라벨 it-ink,
   *   포커스 it-blue, 필수 it-red, 제출 버튼 it-blue. (현재 /academy/create 만 전달.)
   */
  iceTheme?: boolean;
}

/**
 * AcademyForm - 오픈클래스 생성/수정 폼
 *
 * 디자인 시스템 준수:
 * - useState 기반 (React Hook Form 미사용)
 * - MESSAGES 상수 사용
 * - AI 스타일 금지
 * - 다크모드 지원
 */
export function AcademyForm({ mode, initialData, onSubmit, isSubmitting = false, iceTheme = false }: AcademyFormProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [region, setRegion] = useState(initialData?.region ?? '');
  const [contactPhone, setContactPhone] = useState(initialData?.contactPhone ?? '');
  const [contactEmail, setContactEmail] = useState(initialData?.contactEmail ?? '');
  const [errors, setErrors] = useState<Partial<Record<keyof AcademyFormData, string>>>({});

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof AcademyFormData, string>> = {};

    if (!name.trim()) {
      newErrors.name = MESSAGES.academy.nameRequired;
    } else if (name.trim().length > 50) {
      newErrors.name = MESSAGES.academy.nameMaxLength;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      region: region.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
    });
  }, [name, description, region, contactPhone, contactEmail, validate, onSubmit]);

  const inputClass = iceTheme
    ? cn(
        'w-full px-4 py-3 rounded-w-md text-card-body font-medium',
        'bg-it-fill dark:bg-rink-900 text-it-ink-800 dark:text-white',
        'border-[1.5px] border-it-line-strong dark:border-rink-700',
        'placeholder:text-it-ink-400 dark:placeholder:text-rink-300',
        'focus:outline-none focus:border-it-blue-500',
        'transition-colors motion-reduce:transition-none'
      )
    : cn(
        'w-full px-3 py-2.5 rounded-lg border text-sm',
        'bg-white dark:bg-rink-800 text-wtext-1 dark:text-white',
        'border-wline dark:border-rink-700',
        'placeholder:text-wtext-3 dark:placeholder:text-wtext-3',
        'focus:outline-none focus:ring-2 focus:ring-ice-500 focus:border-transparent',
        'transition-colors'
      );

  const labelClass = iceTheme
    ? 'mb-1.5 block text-card-body font-bold text-it-ink-800 dark:text-rink-100'
    : 'block text-sm font-medium text-wtext-2 dark:text-rink-100 mb-1.5';

  const requiredMarkClass = iceTheme ? 'text-it-red-500' : 'text-red-500';
  const errorTextClass = iceTheme ? 'text-it-red-500' : 'text-red-500';
  const errorBorderClass = iceTheme
    ? 'border-it-red-500 dark:border-it-red-500'
    : 'border-red-500 dark:border-red-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 오픈클래스명 (필수) */}
      <div>
        <label htmlFor="academy-name" className={labelClass}>
          오픈클래스명 <span className={requiredMarkClass}>*</span>
        </label>
        <input
          id="academy-name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: undefined })); }}
          placeholder="오픈클래스명을 입력해주세요"
          className={cn(inputClass, errors.name && errorBorderClass)}
          maxLength={50}
          autoComplete="organization"
        />
        {errors.name && (
          <p className={cn('mt-1 text-xs', errorTextClass)}>{errors.name}</p>
        )}
      </div>

      {/* 소개 */}
      <div>
        <label htmlFor="academy-description" className={labelClass}>
          소개
        </label>
        <textarea
          id="academy-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="오픈클래스 소개를 입력해주세요"
          className={cn(inputClass, 'resize-none h-24')}
          maxLength={500}
        />
      </div>

      {/* 지역 */}
      <div>
        <label htmlFor="academy-region" className={labelClass}>
          지역
        </label>
        <input
          id="academy-region"
          type="text"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="예: 서울 강남구"
          className={inputClass}
          maxLength={100}
        />
      </div>

      {/* 연락처 */}
      <div>
        <label htmlFor="academy-phone" className={labelClass}>
          연락처
        </label>
        <input
          id="academy-phone"
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="010-0000-0000"
          className={inputClass}
          autoComplete="tel"
        />
      </div>

      {/* 이메일 */}
      <div>
        <label htmlFor="academy-email" className={labelClass}>
          이메일
        </label>
        <input
          id="academy-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="academy@example.com"
          className={inputClass}
          autoComplete="email"
        />
      </div>

      {/* 제출 버튼 */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={
          iceTheme
            ? cn(
                'w-full inline-flex h-12 items-center justify-center gap-2 rounded-w-md text-white font-bold text-card-emphasis',
                'bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900'
              )
            : cn(
                'w-full py-3 rounded-xl text-white font-bold text-[15px]',
                'bg-ice-500 hover:bg-ice-700 active:bg-ice-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors focus:outline-none focus:ring-2 focus:ring-ice-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900'
              )
        }
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
            처리 중...
          </span>
        ) : (
          mode === 'create' ? '등록하기' : '수정하기'
        )}
      </button>
    </form>
  );
}

export default AcademyForm;
