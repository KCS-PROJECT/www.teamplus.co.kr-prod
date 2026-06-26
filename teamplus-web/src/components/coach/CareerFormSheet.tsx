'use client';

/**
 * CareerFormSheet — 스태프(코치·감독) 약력 등록/수정 바텀시트
 *
 * staff_careers 의 description(자유 텍스트) 1개만 입력받는다.
 * 소속/직책/기간/리그 등 구조화 필드는 사용하지 않으며(미전송 → 백엔드 NULL 저장),
 * 약력 한 덩어리에 소속팀·경력·자격·수상 내역을 줄바꿈으로 자유 서술한다.
 *
 * - BottomSheet 기반 (createPortal · ESC/오버레이 닫기 · safe-area)
 * - ICETIMES flat 입력 스타일(it-* 토큰) + dark mode
 * - AI 스타일 금지: 그라디언트·블러·컬러 그림자 없음
 */

import { useCallback, useEffect, useId, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

/** 스태프 경력 (careers/staff/profile 응답 항목) — 자유텍스트 약력은 description 1개만 사용 */
export interface StaffCareer {
  id: string;
  description?: string | null;
  displayOrder?: number;
}

export interface CareerFormSheetProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** 약력 대상 User.id */
  userId: string;
  /** edit 모드 대상 경력 */
  initial?: StaffCareer | null;
  onClose: () => void;
  /** 저장 성공 시 — 상세 refetch 트리거 */
  onSaved: () => void;
}

/** ICETIMES flat 입력 — it-fill 배경 + 1.5px it-line-strong + it-blue 포커스 */
const TEXTAREA_CLASS =
  'w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-700 px-4 py-3 text-card-body font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 outline-none transition-colors motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 resize-none';

export function CareerFormSheet({
  open,
  mode,
  userId,
  initial,
  onClose,
  onSaved,
}: CareerFormSheetProps) {
  const { toast } = useToast();

  const descId = useId();

  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 열릴 때 초기값 주입 (edit) / 초기화 (create)
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initial) {
      setDescription(initial.description ?? '');
    } else {
      setDescription('');
    }
    setFormError(null);
  }, [open, mode, initial]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;

    // 약력(자유 텍스트) 필수 검증
    if (!description.trim()) {
      setFormError(MESSAGES.career.validation.descriptionRequired);
      return;
    }

    setFormError(null);
    setIsSaving(true);

    // description 만 전송 — 구조화 필드(소속/직책/기간/리그)는 보내지 않음(백엔드 NULL 저장)
    const body = { description: description.trim() };

    try {
      const res =
        mode === 'create'
          ? await api.post('/careers/staff', { userId, ...body })
          : await api.patch(`/careers/staff/${initial?.id}`, body);

      if (res.success) {
        toast.success(
          mode === 'create' ? MESSAGES.career.created : MESSAGES.career.updated,
        );
        onSaved();
        onClose();
      } else if (res.error?.statusCode === 403) {
        toast.error(MESSAGES.career.permissionDenied);
      } else {
        toast.error(res.error?.message || MESSAGES.save.error);
      }
    } catch {
      toast.error(MESSAGES.save.error);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, description, mode, userId, initial, toast, onSaved, onClose]);

  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      title={mode === 'create' ? MESSAGES.career.formCreateTitle : MESSAGES.career.formEditTitle}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-card-emphasis font-bold text-it-ink-600 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-rink-700 active:brightness-95 disabled:opacity-50"
          >
            {MESSAGES.common.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-w-md bg-it-blue-500 text-card-emphasis font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 disabled:opacity-60"
          >
            <Icon name="check" className="text-[20px]" aria-hidden="true" />
            <span>{isSaving ? MESSAGES.common.saving : MESSAGES.common.save}</span>
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-1 pb-2">
        {/* 약력 — 자유 텍스트 1개 (소속·경력·자격·수상을 줄바꿈으로 서술) */}
        <div>
          <label htmlFor={descId} className="mb-2 block text-card-body font-bold text-it-ink-800 dark:text-white">
            {MESSAGES.career.bioLabel} <span className="text-it-red-500" aria-hidden="true">*</span>
          </label>
          <textarea
            id={descId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={MESSAGES.career.bioPlaceholder}
            rows={9}
            maxLength={2000}
            className={TEXTAREA_CLASS}
            required
            aria-required="true"
          />
        </div>

        {/* 에러 메시지 */}
        {formError && (
          <div
            className="flex items-center gap-2 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 border-[1.5px] border-it-red-100 dark:border-it-red-500/30 px-4 py-3"
            role="alert"
          >
            <Icon name="error" className="text-it-red-500 dark:text-it-red-300 text-xl shrink-0" aria-hidden="true" />
            <p className="text-card-body text-it-red-600 dark:text-it-red-300">{formError}</p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

export default CareerFormSheet;
