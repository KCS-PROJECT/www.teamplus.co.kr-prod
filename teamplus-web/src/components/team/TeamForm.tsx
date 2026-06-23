'use client';

/**
 * TeamForm — 팀 등록/수정 공용 폼 컴포넌트
 *
 * - AI 스타일 금지 (gradient, backdrop-blur, shadow-color/30 없음)
 * - 한글 버튼 레이블
 * - messages.ts 상수 사용
 * - DIRECTOR/COACH/ADMIN 권한에서만 렌더
 */

import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import type { TeamDivision } from '@/services/team.service';
import { VenuePicker } from '@/components/common/VenuePicker';

export interface TeamFormValues {
  clubId: string;
  name: string;
  // [제거 2026-05-21 시나리오 B] shortName — Phase 2 잔재. 백엔드 createTeam/updateTeam 이 저장하지 않음.
  //   상세: services/team.service.ts CreateTeamPayload 주석 참조.
  division: TeamDivision | '';
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  // 2026-04-12 재디자인 필드 (매니저 입력 경로)
  description: string;
  slogan: string;
  /** YYYY-MM-DD */
  foundingDate: string;
  homeArena: string;
  /** [추가 2026-05-22] 홈 링크장 ID (Venue FK) — DB 등록 링크장에서 선택 */
  venueId: string;
}

export interface TeamFormErrors {
  name?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
  slogan?: string;
  foundingDate?: string;
  homeArena?: string;
  general?: string;
}

export function createInitialValues(): TeamFormValues {
  return {
    clubId: '',
    name: '',
    division: '',
    logoUrl: '',
    primaryColor: '#1E3FAE',
    secondaryColor: '',
    // 2026-04-12 재디자인 필드 (모두 기본 공란)
    description: '',
    slogan: '',
    foundingDate: '',
    homeArena: '',
    venueId: '',
  };
}

/**
 * 폼 값 검증 (클라이언트 사이드)
 * 서버 응답이 있으면 서버 에러가 우선 표시됩니다.
 */
export function validateTeamForm(values: TeamFormValues): TeamFormErrors {
  const errors: TeamFormErrors = {};

  if (!values.name.trim()) {
    errors.name = MESSAGES.team.nameRequired;
  } else if (values.name.trim().length < 2) {
    errors.name = MESSAGES.team.nameMinLength;
  } else if (values.name.length > 50) {
    errors.name = MESSAGES.team.nameMaxLength;
  }

  const hexRe = /^#[0-9A-Fa-f]{6}$/;
  if (values.primaryColor && !hexRe.test(values.primaryColor)) {
    errors.primaryColor = MESSAGES.team.invalidColor;
  }
  if (values.secondaryColor && !hexRe.test(values.secondaryColor)) {
    errors.secondaryColor = MESSAGES.team.invalidColor;
  }

  // 2026-04-12 재디자인 필드 검증 (길이 제한은 백엔드 DTO 와 일치)
  if (values.description && values.description.length > 1000) {
    errors.description = MESSAGES.team.formDescriptionMax;
  }
  if (values.slogan && values.slogan.length > 200) {
    errors.slogan = MESSAGES.team.formSloganMax;
  }
  if (values.homeArena && values.homeArena.length > 100) {
    errors.homeArena = MESSAGES.team.formHomeArenaMax;
  }
  // foundingDate 는 <input type="date"> 로 포맷 강제 + YYYY-MM-DD 검증
  if (values.foundingDate) {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(values.foundingDate)) {
      errors.foundingDate = MESSAGES.team.formFoundingDateFormat;
    }
  }

  return errors;
}

interface TeamFormProps {
  mode: 'create' | 'edit';
  initialValues: TeamFormValues;
  /** 팀 목록 (생성 모드에서만 필요) */
  clubOptions?: Array<{ id: string; clubName: string }>;
  /** 수정 모드에서 팀 이름 표시용 */
  clubNameLabel?: string;
  onSubmit: (values: TeamFormValues) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  serverError?: string | null;
}

export function TeamForm({
  mode,
  initialValues,
  clubOptions,
  clubNameLabel,
  onSubmit,
  onCancel,
  isSubmitting,
  serverError,
}: TeamFormProps) {
  const [values, setValues] = useState<TeamFormValues>(initialValues);
  const [errors, setErrors] = useState<TeamFormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // [추가 2026-05-22] 홈 링크장 선택 — DB 등록 Venue 마스터 목록.

  const setField = <K extends keyof TeamFormValues>(
    key: K,
    value: TeamFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleBlur = (field: keyof TeamFormErrors) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const errs = validateTeamForm(values);
    setErrors(errs);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({
      name: true,
      primaryColor: true,
      secondaryColor: true,
      description: true,
      slogan: true,
      foundingDate: true,
      homeArena: true,
    });
    const errs = validateTeamForm(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (mode === 'create' && !values.clubId) {
      setErrors({ general: MESSAGES.team.noTeam });
      return;
    }
    await onSubmit(values);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 px-4 pb-30 pt-4"
      noValidate
    >
      {/* ─── 안내 카드 ───────────── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-ice-500 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
        <div className="flex items-start gap-2">
          <Icon
            name="info"
            className="mt-0.5 shrink-0 text-[16px]"
            aria-hidden="true"
          />
          <p className="leading-relaxed">{MESSAGES.team.createHint}</p>
        </div>
      </div>

      {/* ─── 팀 선택 (생성 모드) ─── */}
      {mode === 'create' && (
        <FormField label="소속 팀" required>
          {clubOptions && clubOptions.length > 0 ? (
            <select
              value={values.clubId}
              onChange={(e) => setField('clubId', e.target.value)}
              required
              aria-label="소속 팀 선택"
              aria-required="true"
              className="h-12 w-full rounded-xl border border-wline bg-white px-4 text-sm font-medium text-wtext-1 focus:border-ice-500 focus:outline-none focus:ring-2 focus:ring-ice-500/20 dark:border-rink-700 dark:bg-rink-800 dark:text-white"
            >
              <option value="" disabled>팀을 선택해주세요</option>
              {clubOptions.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.clubName}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
              {MESSAGES.team.noTeam}
            </p>
          )}
        </FormField>
      )}

      {mode === 'edit' && clubNameLabel && (
        <FormField label="소속 팀">
          <div className="flex h-12 items-center rounded-xl bg-wline-2 px-4 text-sm font-bold text-wtext-2 dark:bg-rink-700 dark:text-rink-100">
            {clubNameLabel}
          </div>
        </FormField>
      )}

      {/* ─── 팀 이름 ─── */}
      <FormField
        label={MESSAGES.team.fieldName}
        required
        error={touched.name ? errors.name : undefined}
      >
        <input
          type="text"
          value={values.name}
          onChange={(e) => setField('name', e.target.value)}
          onBlur={() => handleBlur('name')}
          placeholder={MESSAGES.team.fieldNamePlaceholder}
          maxLength={50}
          className={cn(
            'h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-wtext-1 placeholder:text-wtext-3 focus:outline-none focus:ring-2 dark:bg-rink-800 dark:text-white',
            touched.name && errors.name
              ? 'border-red-400 focus:border-red-500 focus:ring-red-400/20'
              : 'border-wline focus:border-ice-500 focus:ring-ice-500/20 dark:border-rink-700',
          )}
          aria-label={MESSAGES.team.fieldName}
          aria-invalid={Boolean(touched.name && errors.name)}
          aria-required="true"
          required
        />
      </FormField>

      {/* [제거 2026-05-21 시나리오 B] "약칭" FormField 삭제 —
          Phase 2 (2026-04-29) Club↔Team 통합 잔재 컬럼. 백엔드 createTeam/updateTeam 이
          저장하지 않는 죽은 입력 UI 였음. 신규 팀 식별은 teamCode(가입 시 사용자 입력) 로 통일. */}

      {/* ─── 부문 ─── */}
      {/* [2026-05-18 BUG FIX]
         사용자 보고: "팀 정보 수정 화면에서 하위 그룹용 연령 선택 항목이 표시됩니다"
         팀은 단일 카테고리이며 U8/U9/U10/U11/U12 등 연령 분류는 하위그룹(SubGroup) 차원.
         UI 필드 자체를 제거. 단, `division` 상태/payload는 보존하여 기존 데이터/백엔드
         호환 유지 (이주 경로: 팀 상세 > 하위그룹 등록/수정 화면에서 연령 카테고리 선택).
         W2.B Team 2 보고 §4 + Wave 4 evaluator 권장사항 §재수정-3 반영. */}

      {/* ─── 로고 URL ─── */}
      <FormField label={MESSAGES.team.fieldLogoUrl} hint="외부 이미지 URL (선택)">
        <input
          type="url"
          value={values.logoUrl}
          onChange={(e) => setField('logoUrl', e.target.value)}
          placeholder="https://example.com/logo.png"
          aria-label={MESSAGES.team.fieldLogoUrl}
          className="h-12 w-full rounded-xl border border-wline bg-white px-4 text-sm font-medium text-wtext-1 placeholder:text-wtext-3 focus:border-ice-500 focus:outline-none focus:ring-2 focus:ring-ice-500/20 dark:border-rink-700 dark:bg-rink-800 dark:text-white"
        />
      </FormField>

      {/* ─── 홈 링크장 (2026-05-22 · v2 2026-05-23 VenuePicker BottomSheet) ─── */}
      <FormField label="홈 링크장" hint="링크장 관리에 등록된 목록에서 선택">
        <VenuePicker
          value={values.venueId}
          onChange={(id) => setField('venueId', id)}
          placeholder="홈 링크장 선택"
          sheetTitle="홈 링크장을 선택해주세요."
          ariaLabel="홈 링크장"
        />
      </FormField>

      {/* ─── 컬러 ─── */}
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label={MESSAGES.team.fieldPrimaryColor}
          error={touched.primaryColor ? errors.primaryColor : undefined}
        >
          <ColorInput
            value={values.primaryColor}
            onChange={(v) => setField('primaryColor', v)}
            onBlur={() => handleBlur('primaryColor')}
            invalid={Boolean(touched.primaryColor && errors.primaryColor)}
          />
        </FormField>
        <FormField
          label={MESSAGES.team.fieldSecondaryColor}
          error={touched.secondaryColor ? errors.secondaryColor : undefined}
        >
          <ColorInput
            value={values.secondaryColor}
            onChange={(v) => setField('secondaryColor', v)}
            onBlur={() => handleBlur('secondaryColor')}
            invalid={Boolean(touched.secondaryColor && errors.secondaryColor)}
          />
        </FormField>
      </div>

      {/* 팀 스토리(선택) 섹션 — 사용자 요청으로 비활성. 데이터 구조는 보존(빈 값 전송). */}

      {/* ─── 서버 에러 표시 ─── */}
      {(serverError || errors.general) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          <div className="flex items-start gap-2">
            <Icon
              name="error"
              className="mt-0.5 shrink-0 text-[16px]"
              aria-hidden="true"
            />
            <span>{serverError || errors.general}</span>
          </div>
        </div>
      )}

      {/* ─── 제출 버튼 ─── */}
      <div className="border-t border-wline-2 pt-4 dark:border-rink-800">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex h-12 flex-1 items-center justify-center rounded-xl bg-wline-2 text-sm font-bold text-wtext-2 hover:bg-wline disabled:opacity-50 dark:bg-rink-700 dark:text-rink-100 dark:hover:bg-rink-500"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 flex-[2] items-center justify-center gap-1.5 rounded-xl bg-ice-500 text-sm font-bold text-white hover:bg-ice-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 active:scale-[0.98] disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Icon
                  name="progress_activity"
                  className="animate-spin text-[18px]"
                  aria-hidden="true"
                />
                처리 중...
              </>
            ) : (
              <>
                <Icon
                  name={mode === 'create' ? 'add' : 'save'}
                  className="text-[18px]"
                  aria-hidden="true"
                />
                {mode === 'create' ? '등록하기' : '수정하기'}
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── FormField ─────────────────────────────────
function FormField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1 text-xs font-bold text-wtext-2 dark:text-rink-100">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {!error && hint && (
        <p className="text-[11px] text-wtext-3 dark:text-rink-300">
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── ColorInput ────────────────────────────────
function ColorInput({
  value,
  onChange,
  onBlur,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  invalid: boolean;
}) {
  const displayValue = value || '';
  const swatchBg = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#E2E8F0';
  return (
    <div
      className={cn(
        'flex h-12 items-center rounded-xl border bg-white dark:bg-rink-800',
        invalid
          ? 'border-red-400'
          : 'border-wline focus-within:border-ice-500 focus-within:ring-2 focus-within:ring-ice-500/20 dark:border-rink-700',
      )}
    >
      <div className="pl-3">
        <span
          className="inline-block size-7 rounded-md border border-wline dark:border-rink-700"
          style={{ backgroundColor: swatchBg }}
          aria-hidden="true"
        />
      </div>
      <input
        type="text"
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="#1E3FAE"
        maxLength={7}
        aria-label="컬러 HEX 코드"
        className="h-full w-full bg-transparent px-3 font-mono text-xs font-bold uppercase text-wtext-1 placeholder:text-wtext-3 focus:outline-none dark:text-white"
      />
      <input
        type="color"
        value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#1E3FAE'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="mr-2 h-7 w-7 cursor-pointer rounded-md border border-wline dark:border-rink-700"
        aria-label="컬러 선택"
      />
    </div>
  );
}
