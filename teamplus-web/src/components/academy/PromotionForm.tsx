'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import type { LessonType, PromotionFormInput } from '@/hooks/usePromotions';

export interface PromotionFormData extends PromotionFormInput {
  title: string;
  content: string;
  lessonType: LessonType;
}

interface PromotionFormProps {
  mode: 'create' | 'edit';
  academyId?: string;
  initialData?: Partial<PromotionFormData>;
  onSubmit: (data: PromotionFormData) => Promise<void>;
  isSubmitting?: boolean;
}

const LESSON_TYPES: Array<{ key: LessonType; label: string }> = [
  { key: 'PRIVATE', label: MESSAGES.promotion.lessonType.PRIVATE },
  { key: 'GROUP', label: MESSAGES.promotion.lessonType.GROUP },
  { key: 'GAME_LESSON', label: MESSAGES.promotion.lessonType.GAME_LESSON },
  { key: 'FUN', label: MESSAGES.promotion.lessonType.FUN },
];

/**
 * PromotionForm — 오픈클래스 광고 등록/수정 폼
 *
 * - useState 기반 (React Hook Form 미사용, AcademyForm과 패턴 일치)
 * - MESSAGES 상수 사용 (하드코딩 0)
 * - AI slop 없음 (solid bg-ice-500, 다크모드 pair)
 */
export function PromotionForm({
  mode,
  academyId,
  initialData,
  onSubmit,
  isSubmitting = false,
}: PromotionFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [content, setContent] = useState(initialData?.content ?? '');
  const [lessonType, setLessonType] = useState<LessonType>(
    (initialData?.lessonType as LessonType) ?? 'PRIVATE',
  );
  const [scheduleInfo, setScheduleInfo] = useState(initialData?.scheduleInfo ?? '');
  const [priceInfo, setPriceInfo] = useState(initialData?.priceInfo ?? '');
  const [capacity, setCapacity] = useState<string>(
    initialData?.capacity != null ? String(initialData.capacity) : '',
  );
  const [venueInfo, setVenueInfo] = useState(initialData?.venueInfo ?? '');
  const [contactPhone, setContactPhone] = useState(initialData?.contactPhone ?? '');
  const [startDate, setStartDate] = useState(
    initialData?.startDate ? initialData.startDate.substring(0, 10) : '',
  );
  const [endDate, setEndDate] = useState(
    initialData?.endDate ? initialData.endDate.substring(0, 10) : '',
  );
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? '');
  const [isActive, setIsActive] = useState<boolean>(initialData?.isActive ?? true);

  const [errors, setErrors] = useState<Partial<Record<keyof PromotionFormData, string>>>({});

  const inputClass = cn(
    'w-full px-3 py-2.5 rounded-lg border text-sm',
    'bg-white dark:bg-rink-800 text-wtext-1 dark:text-white',
    'border-wline dark:border-rink-700',
    'placeholder:text-wtext-3 dark:placeholder:text-wtext-3',
    'focus:outline-none focus:ring-2 focus:ring-ice-500 focus:border-transparent',
    'transition-colors motion-reduce:transition-none',
  );

  const labelClass = 'block text-sm font-medium text-wtext-2 dark:text-rink-100 mb-1.5';

  const validate = useCallback((): boolean => {
    const next: Partial<Record<keyof PromotionFormData, string>> = {};
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle) next.title = MESSAGES.promotion.titleRequired;
    else if (trimmedTitle.length < 2) next.title = MESSAGES.promotion.titleMinLength;

    if (!trimmedContent) next.content = MESSAGES.promotion.contentRequired;
    else if (trimmedContent.length < 10) next.content = MESSAGES.promotion.contentMinLength;

    if (!lessonType) next.lessonType = MESSAGES.promotion.lessonTypeRequired;

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [title, content, lessonType]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      const parsedCapacity = capacity ? Number(capacity) : undefined;
      const safeCapacity =
        parsedCapacity != null && Number.isFinite(parsedCapacity) && parsedCapacity > 0
          ? parsedCapacity
          : undefined;

      const data: PromotionFormData = {
        title: title.trim(),
        content: content.trim(),
        lessonType,
        clubId: academyId,
        scheduleInfo: scheduleInfo.trim() || undefined,
        priceInfo: priceInfo.trim() || undefined,
        capacity: safeCapacity,
        venueInfo: venueInfo.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        imageUrl: imageUrl.trim() || undefined,
        isActive,
      };

      await onSubmit(data);
    },
    [
      validate,
      title,
      content,
      lessonType,
      academyId,
      scheduleInfo,
      priceInfo,
      capacity,
      venueInfo,
      contactPhone,
      startDate,
      endDate,
      imageUrl,
      isActive,
      onSubmit,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 제목 (필수) */}
      <div>
        <label htmlFor="promo-title" className={labelClass}>
          {MESSAGES.promotion.fieldTitle} <span className="text-red-500">*</span>
        </label>
        <input
          id="promo-title"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setErrors((prev) => ({ ...prev, title: undefined }));
          }}
          placeholder={MESSAGES.promotion.fieldTitlePlaceholder}
          className={cn(inputClass, errors.title && 'border-red-500 dark:border-red-500')}
          maxLength={200}
          aria-invalid={!!errors.title}
        />
        {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
      </div>

      {/* 레슨 유형 (필수) */}
      <div>
        <span className={labelClass} id="promo-lessontype-label">
          {MESSAGES.promotion.fieldLessonType} <span className="text-red-500">*</span>
        </span>
        <div
          role="radiogroup"
          aria-labelledby="promo-lessontype-label"
          className="grid grid-cols-2 gap-2"
        >
          {LESSON_TYPES.map(({ key, label }) => {
            const active = key === lessonType;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setLessonType(key)}
                className={cn(
                  'h-11 px-3 rounded-xl text-sm font-semibold border transition-colors motion-reduce:transition-none',
                  active
                    ? 'bg-ice-500 text-white border-ice-500'
                    : 'bg-white dark:bg-rink-800 text-wtext-2 dark:text-rink-100 border-wline dark:border-rink-700 hover:border-ice-500 hover:text-ice-500',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {errors.lessonType && (
          <p className="mt-1 text-xs text-red-500">{errors.lessonType}</p>
        )}
      </div>

      {/* 상세 내용 (필수) */}
      <div>
        <label htmlFor="promo-content" className={labelClass}>
          {MESSAGES.promotion.fieldContent} <span className="text-red-500">*</span>
        </label>
        <textarea
          id="promo-content"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setErrors((prev) => ({ ...prev, content: undefined }));
          }}
          placeholder={MESSAGES.promotion.fieldContentPlaceholder}
          className={cn(
            inputClass,
            'resize-none h-36',
            errors.content && 'border-red-500 dark:border-red-500',
          )}
          maxLength={5000}
          aria-invalid={!!errors.content}
        />
        {errors.content && <p className="mt-1 text-xs text-red-500">{errors.content}</p>}
      </div>

      {/* 일정 */}
      <div>
        <label htmlFor="promo-schedule" className={labelClass}>
          {MESSAGES.promotion.fieldSchedule}
        </label>
        <input
          id="promo-schedule"
          type="text"
          value={scheduleInfo}
          onChange={(e) => setScheduleInfo(e.target.value)}
          placeholder={MESSAGES.promotion.fieldSchedulePlaceholder}
          className={inputClass}
          maxLength={200}
        />
      </div>

      {/* 가격 + 정원 */}
      <div className="grid grid-cols-[1fr_92px] gap-2">
        <div>
          <label htmlFor="promo-price" className={labelClass}>
            {MESSAGES.promotion.fieldPrice}
          </label>
          <input
            id="promo-price"
            type="text"
            value={priceInfo}
            onChange={(e) => setPriceInfo(e.target.value)}
            placeholder={MESSAGES.promotion.fieldPricePlaceholder}
            className={inputClass}
            maxLength={200}
          />
        </div>
        <div>
          <label htmlFor="promo-capacity" className={labelClass}>
            {MESSAGES.promotion.fieldCapacity}
          </label>
          <input
            id="promo-capacity"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={MESSAGES.promotion.fieldCapacityPlaceholder}
            className={cn(inputClass, 'text-right')}
          />
        </div>
      </div>

      {/* 장소 */}
      <div>
        <label htmlFor="promo-venue" className={labelClass}>
          {MESSAGES.promotion.fieldVenue}
        </label>
        <input
          id="promo-venue"
          type="text"
          value={venueInfo}
          onChange={(e) => setVenueInfo(e.target.value)}
          placeholder={MESSAGES.promotion.fieldVenuePlaceholder}
          className={inputClass}
          maxLength={200}
        />
      </div>

      {/* 연락처 */}
      <div>
        <label htmlFor="promo-contact" className={labelClass}>
          {MESSAGES.promotion.fieldContact}
        </label>
        <input
          id="promo-contact"
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder={MESSAGES.promotion.fieldContactPlaceholder}
          className={inputClass}
          maxLength={20}
          autoComplete="tel"
        />
      </div>

      {/* 모집 기간 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="promo-start" className={labelClass}>
            {MESSAGES.promotion.fieldStartDate}
          </label>
          <input
            id="promo-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="promo-end" className={labelClass}>
            {MESSAGES.promotion.fieldEndDate}
          </label>
          <input
            id="promo-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* 이미지 URL */}
      <div>
        <label htmlFor="promo-image" className={labelClass}>
          {MESSAGES.promotion.fieldImage}
        </label>
        <input
          id="promo-image"
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder={MESSAGES.promotion.fieldImagePlaceholder}
          className={inputClass}
          maxLength={500}
        />
      </div>

      {/* 공개 여부 */}
      <div className="flex items-center justify-between bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-wtext-1 dark:text-white">
            {MESSAGES.promotion.fieldActive}
          </p>
          <p className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">
            {isActive ? MESSAGES.promotion.fieldActiveOn : MESSAGES.promotion.fieldActiveOff}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          onClick={() => setIsActive((prev) => !prev)}
          className={cn(
            'relative w-12 h-7 rounded-full transition-colors motion-reduce:transition-none',
            'focus:outline-none focus:ring-2 focus:ring-ice-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
            isActive
              ? 'bg-ice-500'
              : 'bg-wline dark:bg-rink-500',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform motion-reduce:transition-none',
              isActive ? 'translate-x-[22px]' : 'translate-x-0.5',
            )}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* 제출 버튼 */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          'w-full py-3 rounded-xl text-white font-bold text-[15px]',
          'bg-ice-500 hover:bg-ice-700 active:bg-ice-700',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-ice-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
        )}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <span
              className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            처리 중...
          </span>
        ) : mode === 'create' ? (
          MESSAGES.promotion.createButton
        ) : (
          MESSAGES.promotion.editButton
        )}
      </button>
    </form>
  );
}

export default PromotionForm;
