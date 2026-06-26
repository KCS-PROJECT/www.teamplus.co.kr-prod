'use client';

/**
 * FeeEditCard (2026-06-22 신규)
 *
 * 수업 수정 화면의 수강료 카드 — 선불/후불 공통.
 *   - 결제 방식(선불/후불): 읽기전용 배지 (수정 시 변경 불가 정책)
 *   - 1회 수강료/수업료(PER_SESSION) 단가 입력: 항상 노출
 *   - 정기 패키지(PackageManageSection embed, PER_SESSION 제외): 선불일 때만 노출
 *
 *   헤더/카드 스타일은 ClassForm 의 다른 섹션과 동일 패턴(ice 세로바 + 카드 밖 헤더)을 따른다.
 */

import { MESSAGES } from '@/lib/messages';
import {
  PackageManageSection,
  type DraftProduct,
} from '@/components/classes/PackageManageSection';

interface FeeEditCardProps {
  /** 결제 방식 — 읽기전용 표시 + 선불·선택형일 때 정기 패키지 영역 노출. */
  billingMode: 'PREPAID' | 'POSTPAID' | 'BOTH';
  /** 1회 수강료/수업료 단가(원) — PER_SESSION draft price. */
  perSessionPrice: number | '';
  onPerSessionPriceChange: (price: number | '') => void;
  /** 정기 패키지(선불) — deferred draft. PER_SESSION 은 목록에서 제외(위 단가 입력에서 관리). */
  classId?: string;
  packageValue?: DraftProduct[];
  onPackageChange?: (next: DraftProduct[]) => void;
  packageDirty?: boolean;
  classSessionsPerWeek?: number;
  /** 비매니저(학부모·학생) 진입 시 읽기전용. */
  readonly?: boolean;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스 제거(flat) + it-* 토큰(it-fill 입력·hairline 구분)으로 교체.
   */
  iceTheme?: boolean;
}

export function FeeEditCard({
  billingMode,
  perSessionPrice,
  onPerSessionPriceChange,
  classId,
  packageValue,
  onPackageChange,
  packageDirty = false,
  classSessionsPerWeek,
  readonly = false,
  iceTheme = false,
}: FeeEditCardProps) {
  const isPostpaid = billingMode === 'POSTPAID';
  const isPrepaidOnly = billingMode === 'PREPAID';
  // [Phase B-6] 선불 전용은 1회 수업료가 참고용(판매 안 함), 후불·선택형은 판매되는 단가.
  const priceLabel = isPrepaidOnly
    ? MESSAGES.classProduct.singlePriceRefLabel
    : MESSAGES.classProduct.feePerSessionLabel;
  // [Phase B-6] 결제 방식 배지/안내 — 선불·후불·선택형 3종.
  const billingModeText = isPostpaid
    ? MESSAGES.classProduct.billingModePostpaid
    : billingMode === 'BOTH'
      ? MESSAGES.classProduct.billingModeBoth
      : MESSAGES.classProduct.billingModePrepaid;
  const billingModeHintText = isPostpaid
    ? MESSAGES.classProduct.billingModePostpaidHint
    : billingMode === 'BOTH'
      ? MESSAGES.classProduct.billingModeBothHint
      : MESSAGES.classProduct.billingModePrepaidHint;

  if (iceTheme) {
    // [ICETIMES] flat — 카드 박스(rounded/shadow/border) 제거. it-blue 세로바 헤더 + it-fill 입력.
    return (
      <section className="space-y-4" aria-label={MESSAGES.classProduct.feeSectionTitle}>
        <h2 className="flex items-center gap-2.5 text-card-title font-extrabold text-it-blue-500 dark:text-it-blue-300 tracking-[-0.02em] pb-1">
          <span className="w-1 h-4 rounded-sm bg-it-blue-500" aria-hidden="true" />
          {MESSAGES.classProduct.feeSectionTitle}
        </h2>

        <div className="space-y-6">
          {/* 결제 방식 — 읽기전용 배지 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider">
                {MESSAGES.classProduct.billingModeLabel}
              </span>
              <span className="inline-flex items-center h-7 px-3 rounded-pill text-card-meta font-bold bg-it-blue-500/10 text-it-blue-500 dark:text-it-blue-300">
                {billingModeText}
              </span>
            </div>
            <p className="text-card-caption text-it-ink-500 dark:text-rink-300">
              {billingModeHintText}
            </p>
          </div>

          {/* 1회 수강료/수업료 단가 입력 — 선불·후불 공통 */}
          <div className="space-y-2">
            <label className="block text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider">
              {priceLabel}
            </label>
            <div className="flex items-center gap-2 bg-it-fill dark:bg-rink-900 px-3 py-2.5 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 focus-within:border-it-blue-500 focus-within:ring-2 focus-within:ring-it-blue-500/20 transition-colors motion-reduce:transition-none">
              <input
                type="text"
                inputMode="numeric"
                disabled={readonly}
                value={
                  perSessionPrice === ''
                    ? ''
                    : Number(perSessionPrice).toLocaleString('ko-KR')
                }
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  if (raw === '') {
                    onPerSessionPriceChange('');
                    return;
                  }
                  onPerSessionPriceChange(Math.min(parseInt(raw, 10), 10000000));
                }}
                placeholder={MESSAGES.classProduct.singlePricePlaceholder}
                className="w-full bg-transparent border-0 p-0 text-sm font-extrabold text-it-ink-800 dark:text-white focus:ring-0 focus:outline-none placeholder:font-light placeholder:italic disabled:opacity-60"
                aria-label={priceLabel}
              />
              <span className="text-xs font-bold text-it-ink-500 shrink-0">원</span>
            </div>
          </div>

          {/* 정기 패키지 — 선불 한정. PER_SESSION 은 위 단가 입력에서 관리하므로 목록에서 제외. */}
          {!isPostpaid && onPackageChange && (
            <div className="pt-4 border-t border-it-line dark:border-rink-700 space-y-3">
              <p className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider">
                {MESSAGES.classProduct.embedSectionLabel}
              </p>
              <PackageManageSection
                classId={classId}
                mode="deferred"
                variant="embed"
                excludePerSession
                value={packageValue}
                onChange={onPackageChange}
                dirty={packageDirty}
                classSessionsPerWeek={classSessionsPerWeek}
                billingMode={billingMode}
                readonly={readonly}
                iceTheme
              />
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-label={MESSAGES.classProduct.feeSectionTitle}>
      {/* ClassForm 공통 섹션 헤더 패턴 — ice 세로바 + text-ice-600 (카드 밖) */}
      <h2 className="flex items-center gap-2.5 text-card-title font-extrabold text-ice-600 dark:text-ice-400 tracking-[-0.02em] pb-1">
        <span className="w-1 h-4 rounded-sm bg-ice-500" aria-hidden="true" />
        {MESSAGES.classProduct.feeSectionTitle}
      </h2>

      <div className="bg-white dark:bg-rink-800 p-5 rounded-xl space-y-6 shadow-sm border border-wline dark:border-rink-700">
        {/* 결제 방식 — 읽기전용 배지 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
              {MESSAGES.classProduct.billingModeLabel}
            </span>
            <span className="inline-flex items-center h-7 px-3 rounded-pill text-card-meta font-bold bg-ice-500/10 text-ice-600 dark:text-ice-400">
              {billingModeText}
            </span>
          </div>
          <p className="text-card-caption text-wtext-3 dark:text-rink-300">
            {billingModeHintText}
          </p>
        </div>

        {/* 1회 수강료/수업료 단가 입력 — 선불·후불 공통 */}
        <div className="space-y-2">
          <label className="block text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
            {priceLabel}
          </label>
          <div className="flex items-center gap-2 bg-wbg dark:bg-rink-900 px-3 py-2.5 rounded-lg border border-wline dark:border-rink-700">
            <input
              type="text"
              inputMode="numeric"
              disabled={readonly}
              value={
                perSessionPrice === ''
                  ? ''
                  : Number(perSessionPrice).toLocaleString('ko-KR')
              }
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                if (raw === '') {
                  onPerSessionPriceChange('');
                  return;
                }
                onPerSessionPriceChange(Math.min(parseInt(raw, 10), 10000000));
              }}
              placeholder={MESSAGES.classProduct.singlePricePlaceholder}
              className="w-full bg-transparent border-0 p-0 text-sm font-extrabold text-wtext-1 dark:text-white focus:ring-0 focus:outline-none placeholder:font-light placeholder:italic disabled:opacity-60"
              aria-label={priceLabel}
            />
            <span className="text-xs font-bold text-wtext-3 shrink-0">원</span>
          </div>
        </div>

        {/* 정기 패키지 — 선불 한정. PER_SESSION 은 위 단가 입력에서 관리하므로 목록에서 제외. */}
        {!isPostpaid && onPackageChange && (
          <div className="pt-4 border-t border-wline-2 dark:border-rink-700 space-y-3">
            <p className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider">
              {MESSAGES.classProduct.embedSectionLabel}
            </p>
            <PackageManageSection
              classId={classId}
              mode="deferred"
              variant="embed"
              excludePerSession
              value={packageValue}
              onChange={onPackageChange}
              dirty={packageDirty}
              classSessionsPerWeek={classSessionsPerWeek}
              billingMode={billingMode}
              readonly={readonly}
            />
          </div>
        )}
      </div>
    </section>
  );
}

export default FeeEditCard;
