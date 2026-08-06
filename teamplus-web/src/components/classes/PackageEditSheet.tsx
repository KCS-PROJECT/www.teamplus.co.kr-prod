'use client';

/**
 * PackageEditSheet (2026-05-22 옵션 H · 전면 재설계)
 *
 * 수업 패키지(ClassProduct) 추가·수정 BottomSheet. 수업 상세 페이지의 "수강 플랜"
 * 섹션에서 호출된다.
 *
 * 디자인 결정:
 *   1) 운영자 입력 = "주 수 + 가격" 2개로 단순화 (ClassForm 자동 생성과 동일 UX).
 *   2) "주 N회" 자동 파생(classDays.length) 폐기 — classDays 는 갱신 안 되는 스냅샷이라
 *      상품 메타 오염원. 무차감 기간제라 주 빈도 제약도 없음. 상품 안내는 설명(자유 입력)이 SoT.
 *   3) sessionsPerMonth / durationDays / feeType 은 자동 변환. description 은 선택 입력.
 *   4) PER_SESSION(1회권) 수정 시 가격만 수정 가능 (durationDays=30 고정 read-only).
 *
 * 신규 등록(initial=null) → 정기권(MONTHLY_FIXED) 고정.
 * 수정(initial=값) → feeType 분기.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * [가격 계산 도우미] 귀속월 실제 일정 기반 참여 회차 × 1회 수업료 계산 컨텍스트.
 *   산출된 회차는 가격 필드 프리필에만 쓰고 서버로 보내지 않는다
 *   (sessionsPerMonth = 크레딧 발급 SoT 불변).
 */
export interface PriceCalcContext {
  /** 1회 수업료(참고 단가) — 0 이하면 도우미 미노출. */
  unitPrice: number;
  /** 기본 대상월 "YYYY-MM" — 등록 폼은 첫 판매월, 수정 폼은 갱신 대상월. */
  targetMonth: string | null;
  /** 일정 날짜 "YYYY-MM-DD" 목록(취소 제외) — 대상월분만 골라 회차·요일을 집계한다. */
  scheduleDates: string[];
}

// 요일 라벨/정렬 — Date#getDay 인덱스(0=일) 기준, 칩은 월요일 시작으로 노출.
const CALC_DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const CALC_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

interface PackageEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  initial: ClassProductDto | null;
  /** deferred 모드에서 수정 대상 draft. immediate 모드에서는 null. */
  initialDraft?: DraftProduct | null;
  /** 동작 모드 (기본 immediate). */
  mode?: 'immediate' | 'deferred';
  /** [가격 잠금] 판매 시작된 월분 — 가격 입력 잠금(이름·설명만 수정 가능). */
  priceLocked?: boolean;
  /** [가격 계산 도우미] 일정·단가 컨텍스트 — 미전달 시 도우미 미노출(기존 동작). */
  priceContext?: PriceCalcContext | null;
  onSaved: () => void;
  /** deferred 전용 — API 대신 편집 결과를 부모로 전달. */
  onLocalSave?: (draft: LocalProductDraft) => void;
}

interface FormState {
  /** 신규/MONTHLY_FIXED 수정 — 주 수 (1~52). */
  weeks: string;
  /** 가격 — 모든 모드 공통. */
  price: string;
  /** 패키지명 (선택) — 비우면 자동 생성. */
  productName: string;
  /** 설명 (선택) — 비우면 빈 값 그대로 저장(자동 생성 없음). */
  description: string;
}

function buildAutoProductName(feeType: string): string {
  if (feeType === 'PER_SESSION') return '1회 수업료';
  return '주 N회 수업';
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
    return { weeks: '4', price: '', productName: '', description: '' };
  }
  const weeks = p.durationDays ? Math.max(1, Math.round(p.durationDays / 7)) : 4;
  return {
    weeks: String(weeks),
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
  priceLocked = false,
  priceContext = null,
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

  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(editSource));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 연타 가드 — deferred 모드는 submitting state 를 안 거치므로(동기 onLocalSave) 저장 버튼
  //   연타 시 같은 패키지가 중복 등록된다. 동기 ref 로 1회만 처리하고 시트 재오픈 시 해제.
  const submittingRef = useRef(false);

  // ── [가격 계산 도우미] 귀속월 일정 집계 ──
  //   대상월 우선순위: 갱신 마킹(renewToMonth·새 달 가격 준비) > 편집 row 귀속월 > 컨텍스트 기본값.
  const calcMonth =
    initialDraft?.renewToMonth ??
    initialDraft?.billingMonth ??
    priceContext?.targetMonth ??
    null;
  const monthDates = useMemo(
    () =>
      calcMonth && priceContext
        ? priceContext.scheduleDates.filter(
            (d) => d && d.slice(0, 7) === calcMonth,
          )
        : [],
    [calcMonth, priceContext],
  );
  const totalCount = monthDates.length;
  // 요일별 회차 수 — TZ 시프트 방지를 위해 로컬 기준 파싱.
  const dayCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const dateStr of monthDates) {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (!y || !m || !d) continue;
      const dow = new Date(y, m - 1, d).getDay();
      map.set(dow, (map.get(dow) ?? 0) + 1);
    }
    return map;
  }, [monthDates]);
  const unitPrice = priceContext?.unitPrice ?? 0;
  // 참여 회차/요일 선택 — 가격 산정 보조 로컬 상태(서버 미전송).
  const [calcCount, setCalcCount] = useState(0);
  const [calcDays, setCalcDays] = useState<number[]>([]);
  // 직전 자동 제안 이름 — 자동값 그대로면 재제안으로 갱신, 수동 입력은 보호.
  const autoNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm(toFormState(editSource));
      setError(null);
      submittingRef.current = false;
      // 계산 도우미 초기화 — 기본은 전체 회차 참여.
      setCalcDays([]);
      setCalcCount(monthDates.length);
      autoNameRef.current = null;
    }
    // editSource 는 initial/initialDraft 파생 — 두 원본을 deps 로 추적.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initial, initialDraft]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // 크레딧 발급 수량 SoT = class_products.sessions_per_month, 0 = 미발급(기본).
  //   신규 생성은 자동 파생값을 만들지 않고 항상 0 을 전송한다.
  //   수정 시 기존 값 보존 — 되살린 발급형 패키지(>0)를 가격 수정이 0으로 덮지 않도록.
  //   weeks 는 입력 검증용으로만 유지 — durationDays 는 기존
  //   정책(flat 30) 유지, 월권 만료 SoT 는 서버 endOfMonthKst.
  const weeksNum = Math.max(1, Math.min(52, Number(form.weeks) || 0));
  const previewSessionsPerMonth = editSource
    ? (editSource.sessionsPerMonth ?? 0)
    : 0;
  const previewDurationDays = isPerSession ? (editSource?.durationDays ?? 30) : 30;

  // ── [가격 계산 도우미] 노출 조건·핸들러 ──
  //   정기권 + 가격 잠금 아님 + 대상월 일정·1회 수업료가 있을 때만.
  const calcAvailable =
    !isPerSession && !priceLocked && totalCount > 0 && unitPrice > 0;
  const calcMonthNum = calcMonth ? Number(calcMonth.slice(5, 7)) : 0;
  // 표시/계산용 회차 — 오픈 effect 전(초기 0)에도 1~전체 회차 범위로 보정.
  const calcCountSafe = Math.min(
    Math.max(totalCount, 1),
    Math.max(1, calcCount || totalCount),
  );

  const toggleCalcDay = (dow: number) => {
    const next = calcDays.includes(dow)
      ? calcDays.filter((d) => d !== dow)
      : [...calcDays, dow];
    setCalcDays(next);
    const sum = next.reduce((acc, d) => acc + (dayCounts.get(d) ?? 0), 0);
    // 전부 해제하면 기본(전체 회차 참여)으로 복귀.
    setCalcCount(next.length > 0 ? Math.max(1, sum) : totalCount);
  };
  const stepCalcCount = (delta: number) => {
    // 수동 조정은 요일 프리셋과 불일치할 수 있으므로 선택 해제.
    setCalcDays([]);
    setCalcCount(Math.min(totalCount, Math.max(1, calcCountSafe + delta)));
  };
  const applyCalcPrice = () => {
    update('price', String(unitPrice * calcCountSafe));
    // 요일 기반 이름 제안 — 회차 수는 달마다 변하므로 이름에 넣지 않는다
    //   (월분 갱신이 productName 매칭이라 숫자 포함 시 다음 달에 오표기로 남는다).
    //   빈 이름 또는 직전 자동 제안 그대로일 때만 갱신 — 수동 입력은 보호.
    const current = form.productName.trim();
    if (calcDays.length > 0) {
      const labels = CALC_DAY_ORDER.filter((d) => calcDays.includes(d)).map(
        (d) => CALC_DAY_LABELS[d],
      );
      const suggestion = MESSAGES.classProduct.priceCalc.dayClassName(
        labels.join('·'),
      );
      if (!current || current === autoNameRef.current) {
        update('productName', suggestion);
        autoNameRef.current = suggestion;
      }
    } else if (current && current === autoNameRef.current) {
      // 요일 전체 해제 후 적용 — 옛 요일 이름이 남으면 오표기이므로 자동값만 비운다.
      update('productName', '');
      autoNameRef.current = null;
    }
  };
  // 역표시 — 입력된 가격 ÷ 참여 회차 = 회당 단가(+1회 수업료 대비 할인율).
  //   0원은 회당/할인율 표시가 무의미("100% 할인")하므로 양수일 때만 산출.
  const perUnit =
    calcAvailable && form.price !== '' && Number(form.price) > 0
      ? Math.round(Number(form.price) / calcCountSafe)
      : null;
  const discountPct =
    perUnit != null && perUnit < unitPrice
      ? Math.round(((unitPrice - perUnit) / unitPrice) * 100)
      : null;

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

    const productName = form.productName.trim();
    // 설명은 순수 선택 입력 — 비우면 빈 값 그대로 전달(수정 시 기존 설명도 삭제됨).
    const description = form.description.trim();

    // ── deferred 모드 — API 호출 없이 부모로 편집 결과 전달 ──
    if (isDeferred) {
      onLocalSave?.({
        localKey: initialDraft?.localKey,
        serverId: initialDraft?.serverId,
        productName,
        price,
        feeType,
        sessionsPerMonth: previewSessionsPerMonth,
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

        {/* [가격 잠금 Phase 5] 판매 시작 확정 안내 — 가격 입력 잠금, 이름·설명만 수정. */}
        {priceLocked && (
          <div
            role="note"
            className="rounded-w-lg bg-wbg dark:bg-rink-700/50 border border-wline dark:border-rink-700 px-3 py-2.5"
          >
            <p className="text-card-meta text-wtext-2 dark:text-rink-100">
              {MESSAGES.classProduct.priceLockedNotice}
            </p>
          </div>
        )}

        {/* 패키지명 — 필수 */}
        <TextField
          label={MESSAGES.classProduct.fieldProductName}
          required
          value={form.productName}
          onChange={(v) => update('productName', v)}
          placeholder={buildAutoProductName(feeType)}
          maxLength={50}
        />

        {/* 가격 — 공통. 판매 시작된 월분은 잠금(disabled) — 저장 400 대신 사전 차단. */}
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
          disabled={priceLocked}
        />

        {/* [가격 계산 도우미] 귀속월 실제 일정 기반 참여 회차 × 1회 수업료 — 선택 사용.
            산출 회차는 가격 프리필 전용(서버 미전송·sessionsPerMonth 불변). */}
        {calcAvailable && (
          <section
            aria-label={MESSAGES.classProduct.priceCalc.sectionTitle}
            className="rounded-w-lg border border-wline dark:border-rink-700 bg-wbg dark:bg-rink-900/40 px-3 py-3 space-y-3"
          >
            <p className="text-card-meta font-bold text-wtext-2 dark:text-rink-100">
              {MESSAGES.classProduct.priceCalc.sectionTitle}
            </p>

            {/* 참여 요일 — 대상월 일정에 존재하는 요일만 칩으로 노출 */}
            <div className="space-y-1.5">
              <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
                {MESSAGES.classProduct.priceCalc.daysLabel}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CALC_DAY_ORDER.filter((d) => dayCounts.has(d)).map((d) => {
                  const active = calcDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleCalcDay(d)}
                      aria-pressed={active}
                      className={
                        active
                          ? 'h-8 px-3 rounded-w-pill border border-ice-500 bg-ice-50 dark:bg-rink-700 text-card-meta font-bold text-ice-600 dark:text-ice-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40'
                          : 'h-8 px-3 rounded-w-pill border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-card-meta font-semibold text-wtext-2 dark:text-rink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40'
                      }
                    >
                      {MESSAGES.classProduct.priceCalc.dayChip(
                        CALC_DAY_LABELS[d],
                        dayCounts.get(d) ?? 0,
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 참여 회차 수 스테퍼 */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
                {MESSAGES.classProduct.priceCalc.countLabel}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stepCalcCount(-1)}
                  disabled={calcCountSafe <= 1}
                  aria-label={MESSAGES.classProduct.priceCalc.countDecrease}
                  className="w-9 h-9 rounded-w-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-card-body font-bold text-wtext-1 dark:text-rink-100 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
                >
                  −
                </button>
                <span className="min-w-[48px] text-center text-card-body font-bold text-wtext-1 dark:text-rink-100 tabular-nums">
                  {MESSAGES.classProduct.priceCalc.count(calcCountSafe)}
                </span>
                <button
                  type="button"
                  onClick={() => stepCalcCount(1)}
                  disabled={calcCountSafe >= totalCount}
                  aria-label={MESSAGES.classProduct.priceCalc.countIncrease}
                  className="w-9 h-9 rounded-w-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-card-body font-bold text-wtext-1 dark:text-rink-100 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
                >
                  ＋
                </button>
              </div>
            </div>

            <p
              className="text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums"
              aria-live="polite"
            >
              {MESSAGES.classProduct.priceCalc.summary(
                calcMonthNum,
                totalCount,
                calcCountSafe,
              )}
            </p>

            {/* 산식 + 가격 적용 */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-card-meta font-bold text-wtext-1 dark:text-rink-100 tabular-nums">
                {MESSAGES.classProduct.priceCalc.formula(
                  unitPrice,
                  calcCountSafe,
                  unitPrice * calcCountSafe,
                )}
              </p>
              <button
                type="button"
                onClick={applyCalcPrice}
                className="shrink-0 h-9 px-3 rounded-w-lg bg-ice-500 text-white text-card-meta font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
              >
                {MESSAGES.classProduct.priceCalc.applyButton}
              </button>
            </div>

            {/* 회당 단가 역표시 — 입력된 가격 기준(할인 반영 시 할인율 병기) */}
            {perUnit != null && (
              <p
                className="text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums"
                aria-live="polite"
              >
                {MESSAGES.classProduct.priceCalc.perSessionRate(perUnit)}
                {discountPct != null && discountPct >= 1
                  ? ` · ${MESSAGES.classProduct.priceCalc.discountHint(discountPct)}`
                  : ''}
              </p>
            )}
          </section>
        )}

        {/* 설명 — 선택 */}
        <TextField
          label={MESSAGES.classProduct.fieldDescription}
          optionalHint={MESSAGES.classProduct.fieldDescriptionHint}
          value={form.description}
          onChange={(v) => update('description', v)}
          placeholder={MESSAGES.classProduct.fieldDescriptionPlaceholder}
          maxLength={100}
        />

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
  disabled,
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
  disabled?: boolean;
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
      <div
        className={
          disabled
            ? 'flex items-center gap-2 h-12 rounded-w-lg border border-wline-2 dark:border-rink-700 bg-wbg dark:bg-rink-900 px-3 opacity-70'
            : 'flex items-center gap-2 h-12 rounded-w-lg border border-wline dark:border-rink-700 focus-within:border-ice-500 transition-colors bg-white dark:bg-rink-800 px-3'
        }
      >
        <input
          type="text"
          inputMode="numeric"
          value={display}
          disabled={disabled}
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
          className="w-full bg-transparent border-0 p-0 text-card-body font-bold text-wtext-1 dark:text-rink-100 tabular-nums focus:ring-0 focus:outline-none disabled:opacity-60"
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
        className="w-full h-12 rounded-w-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 px-3 text-card-body text-wtext-1 dark:text-rink-100 placeholder:text-wtext-4 focus:outline-none focus:border-ice-500"
      />
    </div>
  );
}

export default PackageEditSheet;
