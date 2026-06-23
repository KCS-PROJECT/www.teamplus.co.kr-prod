'use client';

/**
 * PackageEditSheet (2026-05-22 옵션 H · 전면 재설계)
 *
 * 수업 패키지(ClassProduct) 추가·수정 BottomSheet. 수업 상세 페이지의 "수강 플랜"
 * 섹션에서 호출된다.
 *
 * 디자인 결정:
 *   1) 운영자 입력 = "주 수 + 가격" 2개로 단순화 (ClassForm 자동 생성과 동일 UX).
 *   2) 주당 수업 횟수는 수업 정보(classSessionsPerWeek = classDays.length)로 자동 결정 —
 *      패키지별로 다르게 두면 학부모·출석 시스템 정합성이 깨지므로 수정 불가.
 *   3) productName / description / sessionsPerMonth / durationDays / feeType 은 자동 변환.
 *   4) PER_SESSION(1회권) 수정 시 가격만 수정 가능 (durationDays=30 고정 read-only).
 *
 * 신규 등록(initial=null) → 정기권(MONTHLY_FIXED) 고정.
 * 수정(initial=값) → feeType 분기.
 */

import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import {
  createClassProduct,
  updateClassProduct,
  type ClassProductDto,
  type CreateClassProductInput,
  type UpdateClassProductInput,
} from '@/services/class-product.service';
import type { DraftProduct } from './PackageManageSection';

/** deferred 모드에서 시트가 부모로 올려보내는 편집 결과. localKey 있으면 기존 draft 수정. */
export interface LocalProductDraft {
  /** 기존 draft 의 localKey (신규는 undefined). */
  localKey?: string;
  serverId?: string;
  productName: string;
  price: number;
  feeType: string;
  sessionsPerMonth: number;
  sessionsPerWeek?: number;
  durationDays?: number;
  description?: string;
}

interface PackageEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  initial: ClassProductDto | null;
  /** deferred 모드에서 수정 대상 draft. immediate 모드에서는 null. */
  initialDraft?: DraftProduct | null;
  /** 동작 모드 (기본 immediate). */
  mode?: 'immediate' | 'deferred';
  /** 수업 정보의 주당 수업 횟수 (Class.classDays.length). 정기권 자동 계산용. */
  classSessionsPerWeek?: number;
  onSaved: () => void;
  /** deferred 전용 — API 대신 편집 결과를 부모로 전달. */
  onLocalSave?: (draft: LocalProductDraft) => void;
}

interface FormState {
  /** 신규/MONTHLY_FIXED 수정 — 주 수 (1~52). */
  weeks: string;
  /** [Phase B-5] 수업 횟수 (MONTHLY_FIXED 번들) — sessionsPerMonth. */
  sessions: string;
  /** 가격 — 모든 모드 공통. */
  price: string;
  /** 패키지명 (선택) — 비우면 자동 생성. */
  productName: string;
  /** 설명 (선택) — 비우면 자동 생성. */
  description: string;
}

function buildAutoProductName(weeks: number, feeType: string): string {
  if (feeType === 'PER_SESSION') return '1회 수업료';
  return `${weeks}주 정기권`;
}

function buildAutoDescription(
  weeks: number,
  perWeek: number,
  feeType: string,
): string {
  if (feeType === 'PER_SESSION') return '1회 수업료';
  const total = weeks * perWeek;
  return `${weeks}주간 총 ${total}회 · 주 ${perWeek}회`;
}

/** ClassProductDto 와 DraftProduct 공통 필드만 본다 (toFormState 입력). */
type EditSource = Pick<
  ClassProductDto,
  | 'productName'
  | 'description'
  | 'price'
  | 'sessionsPerMonth'
  | 'durationDays'
  | 'feeType'
> | null;

function toFormState(p: EditSource): FormState {
  if (!p) {
    return { weeks: '4', sessions: '4', price: '', productName: '', description: '' };
  }
  const weeks = p.durationDays ? Math.max(1, Math.round(p.durationDays / 7)) : 4;
  return {
    weeks: String(weeks),
    sessions: String(p.sessionsPerMonth ?? 4),
    price: String(p.price ?? ''),
    productName: p.productName ?? '',
    description: p.description ?? '',
  };
}

export function PackageEditSheet({
  isOpen,
  onClose,
  classId,
  initial,
  initialDraft = null,
  mode = 'immediate',
  classSessionsPerWeek,
  onSaved,
  onLocalSave,
}: PackageEditSheetProps) {
  const isDeferred = mode === 'deferred';
  // 편집 소스 — deferred 는 initialDraft, immediate 는 initial.
  const editSource: EditSource = isDeferred ? (initialDraft ?? null) : initial;
  const isEdit = Boolean(editSource);
  // 신규는 항상 정기권. 수정은 기존 feeType 유지.
  const feeType: string = isEdit
    ? (editSource?.feeType ?? 'MONTHLY_FIXED')
    : 'MONTHLY_FIXED';
  const isPerSession = feeType === 'PER_SESSION';
  const perWeek = Math.max(1, classSessionsPerWeek ?? 1);

  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(editSource));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 연타 가드 — deferred 모드는 submitting state 를 안 거치므로(동기 onLocalSave) 저장 버튼
  //   연타 시 같은 패키지가 중복 등록된다. 동기 ref 로 1회만 처리하고 시트 재오픈 시 해제.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setForm(toFormState(editSource));
      setError(null);
      submittingRef.current = false;
    }
    // editSource 는 initial/initialDraft 파생 — 두 원본을 deps 로 추적.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initial, initialDraft]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // [Phase B-5] 수업 횟수 직접 입력(번들). 1회당 참고가 = 가격 ÷ 수업 횟수.
  const weeksNum = Math.max(1, Math.min(52, Number(form.weeks) || 0));
  const sessionsNum = Math.max(1, Math.min(728, Number(form.sessions) || 0));
  const previewSessionsPerMonth = isPerSession ? 1 : sessionsNum;
  const previewDurationDays = isPerSession ? (editSource?.durationDays ?? 30) : 30;
  const priceNum = Number(form.price) || 0;
  const perSessionRef =
    !isPerSession && sessionsNum > 0 && priceNum > 0
      ? Math.round(priceNum / sessionsNum)
      : 0;
  // 2026-05-22 정책 — 수업권 사용 기간 = 본 패키지 기간 + 미사용 회차 사용 30일.
  //   백엔드 결제 시점에 expiresAt = now + durationDays + 30 으로 발급됨.
  const MEMBER_CREDIT_EXTRA_USABLE_DAYS = 30;
  const previewUsableDays =
    previewDurationDays + MEMBER_CREDIT_EXTRA_USABLE_DAYS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 부모 ClassForm <form> 으로의 submit 합성 이벤트 버블링 차단 (Portal 트리 전파 방지).
    e.stopPropagation();
    setError(null);

    if (!form.productName.trim()) {
      setError(MESSAGES.classProduct.validationProductName);
      return;
    }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      setError(MESSAGES.classProduct.validationPrice);
      return;
    }
    if (!isPerSession) {
      if (!Number.isFinite(weeksNum) || weeksNum < 1 || weeksNum > 52) {
        setError(MESSAGES.classProduct.validationWeeks);
        return;
      }
    }

    // 연타 가드 — 검증 통과 후 1회만 처리(중복 등록 방지). 해제는 시트 재오픈 시.
    if (submittingRef.current) return;
    submittingRef.current = true;

    const autoDesc = buildAutoDescription(weeksNum, perWeek, feeType);
    const productName = form.productName.trim();
    const description = form.description.trim() || autoDesc;

    // ── deferred 모드 — API 호출 없이 부모로 편집 결과 전달 ──
    if (isDeferred) {
      onLocalSave?.({
        localKey: initialDraft?.localKey,
        serverId: initialDraft?.serverId,
        productName,
        price,
        feeType,
        sessionsPerMonth: previewSessionsPerMonth,
        sessionsPerWeek: isPerSession ? undefined : perWeek,
        durationDays: previewDurationDays,
        description,
      });
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && initial) {
        // 수정 모드 — feeType 그대로 유지, 가격·(정기권은) 주 수만 변경.
        const payload: UpdateClassProductInput = {
          productName,
          description,
          price,
          ...(isPerSession
            ? {} // PER_SESSION 은 durationDays·sessionsPerMonth 고정.
            : {
                durationDays: previewDurationDays,
                sessionsPerMonth: previewSessionsPerMonth,
                sessionsPerWeek: perWeek,
              }),
        };
        const res = await updateClassProduct(classId, initial.id, payload);
        if (!res) {
          toast.error(MESSAGES.classProduct.saveFailed);
          return;
        }
      } else {
        // 신규 등록 — 정기권 고정.
        const payload: CreateClassProductInput = {
          productName,
          description,
          price,
          sessionsPerMonth: previewSessionsPerMonth,
          durationDays: previewDurationDays,
          feeType: 'MONTHLY_FIXED',
          sessionsPerWeek: perWeek,
        };
        const res = await createClassProduct(classId, payload);
        if (!res) {
          toast.error(MESSAGES.classProduct.saveFailed);
          return;
        }
      }
      toast.success(MESSAGES.classProduct.saveSuccess);
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
      // 실패 시 재시도 가능하도록 가드 해제(성공 시엔 onClose 후 재오픈 effect 가 해제).
      submittingRef.current = false;
    }
  };

  const sheetTitle = isEdit
    ? MESSAGES.classProduct.editPackage
    : MESSAGES.classProduct.addPackage;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={sheetTitle}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 h-12 rounded-w-lg border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 text-card-body font-semibold text-wtext-1 dark:text-rink-100 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            form="package-edit-form"
            disabled={submitting}
            className="flex-1 h-12 rounded-w-lg bg-ice-500 text-white text-card-body font-bold disabled:opacity-50"
          >
            {submitting ? MESSAGES.classProduct.saving : '저장하기'}
          </button>
        </div>
      }
    >
      <form id="package-edit-form" onSubmit={handleSubmit} className="space-y-4 px-1 pb-2">
        {/* PER_SESSION 안내 — 가격만 수정 가능 */}
        {isPerSession && (
          <div className="rounded-w-lg bg-ice-50 dark:bg-rink-700/50 border border-ice-100 dark:border-rink-700 px-3 py-2.5">
            <p className="text-card-meta text-wtext-2 dark:text-rink-100">
              {MESSAGES.classProduct.perSessionEditHint}
            </p>
          </div>
        )}

        {/* 정기권 주 수 — [2026-06-09] 숨김 (가격·패키지명만 입력). */}
        {false && (
          <NumberField
            label={MESSAGES.classProduct.fieldWeeks}
            required
            value={form.weeks}
            onChange={(v) => update('weeks', v)}
            min={1}
            max={52}
            suffix="주"
          />
        )}

        {/* 패키지명 — 필수 */}
        <TextField
          label={MESSAGES.classProduct.fieldProductName}
          required
          value={form.productName}
          onChange={(v) => update('productName', v)}
          placeholder={buildAutoProductName(weeksNum, feeType)}
          maxLength={50}
        />

        {/* 가격 — 공통 */}
        <NumberField
          label={MESSAGES.classProduct.fieldPrice}
          required
          value={form.price}
          onChange={(v) => update('price', v)}
          min={0}
          step={1000}
          suffix="원"
          format="comma"
          placeholder="180,000"
        />

        {/* [Phase B-5] 수업 횟수 (정기/번들 전용) + 1회당 참고가 */}
        {!isPerSession && (
          <div className="space-y-1.5">
            <NumberField
              label={MESSAGES.classProduct.fieldSessions}
              required
              value={form.sessions}
              onChange={(v) => update('sessions', v)}
              min={1}
              max={728}
              suffix="회"
            />
            {perSessionRef > 0 && (
              <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                {MESSAGES.classProduct.perSessionRef(perSessionRef)}
              </p>
            )}
          </div>
        )}

        {/* 자동 계산 미리보기 — [2026-06-09] 숨김 (가격·패키지명만 입력). */}
        {false && (
          <div className="rounded-w-lg bg-wbg dark:bg-rink-900 border border-wline-2 dark:border-rink-700 px-3 py-3 space-y-1">
            <p className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
              {MESSAGES.classProduct.previewTitle}
            </p>
            <PreviewRow
              label={MESSAGES.classProduct.previewSessionsPerWeek}
              value={`${perWeek}회`}
              hint={MESSAGES.classProduct.previewSessionsPerWeekHint}
            />
            <PreviewRow
              label={MESSAGES.classProduct.previewTotalSessions}
              value={`${previewSessionsPerMonth}회`}
            />
            <PreviewRow
              label={MESSAGES.classProduct.previewUsageWindow}
              value={`${previewUsableDays}일`}
              hint={MESSAGES.classProduct.previewUsageWindowHint(
                weeksNum,
                MEMBER_CREDIT_EXTRA_USABLE_DAYS,
              )}
            />
          </div>
        )}

        {/* 설명 — [2026-06-09] 숨김 (가격·패키지명만 입력). */}
        {false && (
          <TextField
            label={MESSAGES.classProduct.fieldDescription}
            optionalHint={MESSAGES.classProduct.fieldDescriptionHint}
            value={form.description}
            onChange={(v) => update('description', v)}
            placeholder={buildAutoDescription(weeksNum, perWeek, feeType)}
            maxLength={120}
          />
        )}

        {error && (
          <p
            role="alert"
            className="text-card-meta text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
      </form>
    </BottomSheet>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sub Components
// ──────────────────────────────────────────────────────────────────

function NumberField({
  label,
  required,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  placeholder,
  format,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  format?: 'comma';
}) {
  const display =
    format === 'comma' && value !== ''
      ? Number(value).toLocaleString('ko-KR')
      : value;
  return (
    <div>
      <label className="block mb-1.5 text-card-meta font-semibold text-wtext-2 dark:text-rink-300">
        {label}
        {required && <span className="ml-1 text-error-500">*</span>}
      </label>
      <div className="flex items-center gap-2 h-12 rounded-w-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-3">
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '');
            if (raw === '') {
              onChange('');
              return;
            }
            let num = parseInt(raw, 10);
            if (max != null) num = Math.min(num, max);
            if (min != null) num = Math.max(num, min);
            onChange(String(num));
          }}
          placeholder={placeholder}
          className="w-full bg-transparent border-0 p-0 text-card-body font-bold text-wtext-1 dark:text-rink-100 tabular-nums focus:ring-0 focus:outline-none"
          aria-label={label}
        />
        {suffix && (
          <span className="text-card-meta font-bold text-wtext-3 shrink-0">
            {suffix}
          </span>
        )}
      </div>
      {step && <input type="hidden" value={step} readOnly />}
    </div>
  );
}

function TextField({
  label,
  optionalHint,
  required,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  optionalHint?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="block mb-1.5 text-card-meta font-semibold text-wtext-2 dark:text-rink-300">
        {label}
        {required && <span className="ml-1 text-error-500">*</span>}
        {optionalHint && (
          <span className="ml-1 text-wtext-4 font-medium">{optionalHint}</span>
        )}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full h-12 rounded-w-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-3 text-card-body text-wtext-1 dark:text-rink-100 placeholder:text-wtext-4"
      />
    </div>
  );
}

function PreviewRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-card-meta text-wtext-3 dark:text-rink-300">
        {label}
      </span>
      <span className="text-card-body font-bold text-wtext-1 dark:text-rink-100 tabular-nums">
        {value}
        {hint && (
          <span className="ml-1 text-card-caption font-medium text-wtext-3 dark:text-rink-300">
            {hint}
          </span>
        )}
      </span>
    </div>
  );
}

export default PackageEditSheet;
