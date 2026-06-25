'use client';

import { FormEvent, useState, useEffect, useMemo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

/**
 * 매치 생성/수정 공통 폼 값.
 *
 * `matches/create` · `matches/[id]/edit` 두 페이지가 동일한 폼을 공유하므로
 * 한 곳에서 유지보수할 수 있도록 컴포넌트로 추출했습니다.
 */
export interface MatchFormValues {
  title: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:mm
  rinkName: string;
  rinkAddress: string;
  price: number;
  level: LevelType;
  levelCode: LevelCodeType;
  gender: GenderType;
  maxParticipants: number;
  rulesText: string; // 줄바꿈 구분
  description: string;
}

export type LevelType = '입문' | '초급' | '중급' | '고급';
export type GenderType = '혼성' | '남성' | '여성';
export type LevelCodeType = '' | 'A' | 'B' | 'C';

const LEVEL_OPTIONS: LevelType[] = ['입문', '초급', '중급', '고급'];
const LEVEL_CODE_OPTIONS: LevelCodeType[] = ['', 'A', 'B', 'C'];
const GENDER_OPTIONS: GenderType[] = ['혼성', '남성', '여성'];

const DEFAULT_VALUES: MatchFormValues = {
  title: '',
  date: '',
  time: '',
  rinkName: '',
  rinkAddress: '',
  price: 30000,
  level: '중급',
  levelCode: 'B',
  gender: '혼성',
  maxParticipants: 20,
  rulesText: '',
  description: '',
};

interface MatchCreateFormProps {
  mode: 'create' | 'edit';
  initialValues?: Partial<MatchFormValues>;
  isSubmitting?: boolean;
  onSubmit: (values: MatchFormValues) => Promise<void> | void;
  onCancel?: () => void;
  error?: string | null;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 it-* 토큰(flat 섹션 · it-fill 인풋 border 1.5px · it-blue 칩/제출).
   */
  iceTheme?: boolean;
}

/**
 * 매치 생성/수정 공통 폼.
 *
 * HTML 목업 "매치 등록 및 관리"의 3섹션 구성 (기본정보 / 모집요건 / 안내사항)을
 * 재현하며 다크모드·8px 그리드·WCAG AA 대비를 준수합니다.
 *
 * - mode='create'     → 제출 버튼 라벨 "매치 등록하기"
 * - mode='edit'       → 제출 버튼 라벨 "매치 수정하기"
 */
export function MatchCreateForm({
  mode,
  initialValues,
  isSubmitting = false,
  onSubmit,
  onCancel,
  error,
  iceTheme = false,
}: MatchCreateFormProps) {
  const merged = useMemo<MatchFormValues>(
    () => ({ ...DEFAULT_VALUES, ...initialValues }),
    [initialValues]
  );

  const [values, setValues] = useState<MatchFormValues>(merged);
  const [validationError, setValidationError] = useState<string | null>(null);

  // edit 모드: 비동기로 초기값 로드된 경우 values 갱신
  useEffect(() => {
    setValues(merged);
  }, [merged]);

  const update = <K extends keyof MatchFormValues>(
    key: K,
    next: MatchFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: next }));
  };

  const validate = (): string | null => {
    if (values.title.trim().length < 3) {
      return MESSAGES.match.form.errors.titleTooShort;
    }
    if (!values.date || !values.time) {
      return MESSAGES.match.form.errors.dateRequired;
    }
    if (!values.rinkName.trim()) {
      return MESSAGES.match.form.errors.rinkRequired;
    }
    if (
      Number.isNaN(values.price) ||
      values.price < 0 ||
      values.price > 1_000_000
    ) {
      return MESSAGES.match.form.errors.priceRange;
    }
    if (
      Number.isNaN(values.maxParticipants) ||
      values.maxParticipants < 2 ||
      values.maxParticipants > 30
    ) {
      return MESSAGES.match.form.errors.participantsRange;
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationMessage = validate();
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }
    setValidationError(null);
    await onSubmit(values);
  };

  const displayError = validationError ?? error ?? null;
  const submitLabel =
    mode === 'edit'
      ? MESSAGES.match.form.submit.update
      : MESSAGES.match.form.submit.create;

  // [ICETIMES] flat — 테마별 클래스. iceTheme=false 시 기존 constant 1:1 사용(회귀 0).
  const fieldInputClass = iceTheme ? iceInputClass : inputClass;
  const fieldTextareaClass = iceTheme ? iceTextareaClass : textareaClass;
  const sectionClass = iceTheme
    ? 'bg-it-surface dark:bg-rink-800 border border-it-line dark:border-it-blue-900 rounded-w-md p-5 space-y-4'
    : 'bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 rounded-2xl p-5 space-y-4';

  return (
    <form id="match-form" onSubmit={handleSubmit} className="space-y-5">
      {/* 섹션 1: 기본 정보 */}
      <section className={sectionClass}>
        <SectionTitle
          icon="edit_note"
          title={MESSAGES.match.form.sections.basic}
          iceTheme={iceTheme}
        />

        <Field label={MESSAGES.match.form.titleField.label} required iceTheme={iceTheme}>
          <input
            value={values.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder={MESSAGES.match.form.titleField.placeholder}
            className={fieldInputClass}
          />
        </Field>

        {/* [수정 W2.D 2026-05-18 #6] iPhone 좁은 폭(xs ≤359px) 에서 type="date"/"time"
            native chrome 기본 너비가 grid-cols-2 슬롯을 넘쳐 박스끼리 겹쳐 보이는 회귀.
            · xs breakpoint 에서 grid-cols-1 로 세로 스택
            · 각 input 에 min-w-0 추가 → date/time input 의 intrinsic min-content 회피 */}
        <div className="grid grid-cols-2 gap-3 [[data-screen-bp='xs']_&]:grid-cols-1">
          <Field label={MESSAGES.match.form.date.label} required iceTheme={iceTheme}>
            <input
              type="date"
              value={values.date}
              onChange={(e) => update('date', e.target.value)}
              className={cn(fieldInputClass, 'min-w-0 box-border')}
            />
          </Field>
          <Field label={MESSAGES.match.form.time.label} required iceTheme={iceTheme}>
            <input
              type="time"
              value={values.time}
              onChange={(e) => update('time', e.target.value)}
              className={cn(fieldInputClass, 'min-w-0 box-border')}
            />
          </Field>
        </div>

        <Field label={MESSAGES.match.form.rink.label} required iceTheme={iceTheme}>
          <div className="relative">
            <Icon
              name="location_on"
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 text-[20px]',
                iceTheme ? 'text-it-ink-400' : 'text-wtext-3'
              )}
            />
            <input
              value={values.rinkName}
              onChange={(e) => update('rinkName', e.target.value)}
              placeholder={MESSAGES.match.form.rink.placeholder}
              className={cn(fieldInputClass, 'pl-10')}
            />
          </div>
        </Field>

        <Field label={MESSAGES.match.form.rinkAddress.label} iceTheme={iceTheme}>
          <input
            value={values.rinkAddress}
            onChange={(e) => update('rinkAddress', e.target.value)}
            placeholder={MESSAGES.match.form.rinkAddress.placeholder}
            className={fieldInputClass}
          />
        </Field>
      </section>

      {/* 섹션 2: 모집 요건 */}
      <section className={sectionClass}>
        <SectionTitle
          icon="groups"
          title={MESSAGES.match.form.sections.requirements}
          iceTheme={iceTheme}
        />

        {/* [수정 W2.D 2026-05-18 #6] xs 폭 number input 겹침 — grid-cols-1 분기 + min-w-0 */}
        <div className="grid grid-cols-2 gap-3 [[data-screen-bp='xs']_&]:grid-cols-1">
          <Field label={MESSAGES.match.form.maxParticipants.label} required iceTheme={iceTheme}>
            <input
              type="number"
              min={2}
              max={30}
              inputMode="numeric"
              value={Number.isFinite(values.maxParticipants) ? values.maxParticipants : ''}
              onChange={(e) =>
                update('maxParticipants', Number(e.target.value))
              }
              className={cn(fieldInputClass, 'min-w-0 box-border')}
            />
          </Field>
          <Field label={MESSAGES.match.form.price.label} required iceTheme={iceTheme}>
            <input
              type="number"
              min={0}
              max={1_000_000}
              step={1000}
              inputMode="numeric"
              value={Number.isFinite(values.price) ? values.price : ''}
              onChange={(e) => update('price', Number(e.target.value))}
              className={cn(fieldInputClass, 'min-w-0 box-border')}
            />
          </Field>
        </div>

        <Field label={MESSAGES.match.form.level.label} iceTheme={iceTheme}>
          <div className="flex flex-wrap gap-2">
            {LEVEL_OPTIONS.map((option) => {
              const active = values.level === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => update('level', option)}
                  className={cn(
                    'inline-flex items-center h-10 px-4 text-sm font-semibold transition-colors motion-reduce:transition-none',
                    iceTheme
                      ? cn(
                          'rounded-w-pill border-[1.5px] font-bold',
                          active
                            ? 'bg-it-blue-500 border-it-blue-500 text-white'
                            : 'bg-it-surface dark:bg-rink-900 border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-it-ink-300 hover:border-it-blue-500 hover:text-it-blue-500'
                        )
                      : cn(
                          'rounded-full border',
                          active
                            ? 'bg-ice-500 border-ice-500 text-white'
                            : 'bg-white dark:bg-rink-900 border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:border-ice-500 hover:text-ice-500'
                        )
                  )}
                  aria-pressed={active}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </Field>

        {/* [수정 W2.D 2026-05-18 #6] xs 폭 select 겹침 — grid-cols-1 분기 + min-w-0 */}
        <div className="grid grid-cols-2 gap-3 [[data-screen-bp='xs']_&]:grid-cols-1">
          <Field label={MESSAGES.match.form.levelCode.label} iceTheme={iceTheme}>
            <select
              value={values.levelCode}
              onChange={(e) =>
                update('levelCode', e.target.value as LevelCodeType)
              }
              className={cn(fieldInputClass, 'min-w-0 box-border')}
            >
              {LEVEL_CODE_OPTIONS.map((option) => (
                <option key={option || 'none'} value={option}>
                  {option
                    ? MESSAGES.match.form.levelCode.option(option)
                    : MESSAGES.match.form.levelCode.none}
                </option>
              ))}
            </select>
          </Field>
          <Field label={MESSAGES.match.form.gender.label} iceTheme={iceTheme}>
            <select
              value={values.gender}
              onChange={(e) => update('gender', e.target.value as GenderType)}
              className={cn(fieldInputClass, 'min-w-0 box-border')}
            >
              {GENDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* 섹션 3: 안내 사항 */}
      <section className={sectionClass}>
        <SectionTitle
          icon="info"
          title={MESSAGES.match.form.sections.description}
          iceTheme={iceTheme}
        />

        <Field label={MESSAGES.match.form.rules.label} iceTheme={iceTheme}>
          <textarea
            value={values.rulesText}
            onChange={(e) => update('rulesText', e.target.value)}
            placeholder={MESSAGES.match.form.rules.placeholder}
            className={cn(fieldTextareaClass, 'min-h-[100px]')}
          />
        </Field>

        <Field label={MESSAGES.match.form.description.label} iceTheme={iceTheme}>
          <textarea
            value={values.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder={MESSAGES.match.form.description.placeholder}
            className={cn(fieldTextareaClass, 'min-h-[120px]')}
          />
        </Field>
      </section>

      {displayError && (
        <div
          role="alert"
          className={cn(
            'px-4 py-3 text-sm',
            iceTheme
              ? 'rounded-w-md border border-it-red-200 bg-it-red-50 dark:border-it-red-700/50 dark:bg-it-red-500/15 text-it-red-500 dark:text-it-red-300'
              : 'rounded-xl border border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
          )}
        >
          {displayError}
        </div>
      )}

      {/* Sticky bottom action bar */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40 border-t',
          iceTheme
            ? 'bg-it-surface dark:bg-rink-900 border-it-line dark:border-it-blue-900'
            : 'bg-white dark:bg-rink-900 border-wline-2 dark:border-rink-700'
        )}
      >
        <div className="max-w-md mx-auto px-4 py-4 flex gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                'flex-1 h-12 text-sm font-bold transition-colors motion-reduce:transition-none',
                iceTheme
                  ? 'rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 text-it-ink-700 dark:text-it-ink-200 hover:bg-it-fill dark:hover:bg-rink-800'
                  : 'rounded-xl border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-800'
              )}
            >
              {MESSAGES.match.applicants.reject.cancel}
            </button>
          )}
          <button
            type="submit"
            form="match-form"
            disabled={isSubmitting}
            className={cn(
              'flex-[2] h-12 text-white text-sm font-bold disabled:opacity-60 transition-colors motion-reduce:transition-none flex items-center justify-center gap-2',
              iceTheme ? 'rounded-w-md bg-it-blue-500 hover:bg-it-blue-600' : 'rounded-xl bg-ice-500 hover:bg-ice-700'
            )}
          >
            {isSubmitting ? (
              <>
                <Icon name="progress_activity" className="animate-spin text-xl" />
                {MESSAGES.common.processing}
              </>
            ) : (
              submitLabel
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── 내부 유틸 ─────────────────────────────────────────────
const inputClass =
  'w-full h-11 px-3 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-900 text-sm text-wtext-1 dark:text-white focus:border-ice-500 focus:ring-1 focus:ring-ice-500 focus:outline-none';

const textareaClass =
  'w-full px-3 py-2 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-900 text-sm text-wtext-1 dark:text-white resize-y focus:border-ice-500 focus:ring-1 focus:ring-ice-500 focus:outline-none';

// [ICETIMES] flat — it-fill 인풋 컨테이너, border 1.5px, it-blue 포커스.
const iceInputClass =
  'w-full h-11 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-rink-900 text-sm text-it-ink-800 dark:text-white placeholder:text-it-ink-400 focus:border-it-blue-500 focus:ring-1 focus:ring-it-blue-500 focus:outline-none';

const iceTextareaClass =
  'w-full px-3 py-2 rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-rink-900 text-sm text-it-ink-800 dark:text-white placeholder:text-it-ink-400 resize-y focus:border-it-blue-500 focus:ring-1 focus:ring-it-blue-500 focus:outline-none';

function SectionTitle({ icon, title, iceTheme = false }: { icon: string; title: string; iceTheme?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={iceTheme ? 'text-it-blue-500' : 'text-ice-500'}>
        <Icon name={icon} className="text-lg" />
      </span>
      <h2
        className={cn(
          'text-base font-bold',
          iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white'
        )}
      >
        {title}
      </h2>
    </div>
  );
}

function Field({
  label,
  required,
  children,
  iceTheme = false,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  iceTheme?: boolean;
}) {
  return (
    <label className="block">
      <span
        className={cn(
          'text-sm font-semibold',
          iceTheme ? 'text-it-ink-700 dark:text-it-ink-200' : 'text-wtext-2 dark:text-rink-100'
        )}
      >
        {label}
        {required && (
          <span className={cn('ml-0.5', iceTheme ? 'text-it-red-500' : 'text-red-500')} aria-hidden="true">
            *
          </span>
        )}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
