'use client';

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import type { FeeType } from '@/types/payment';

/**
 * PaymentOptionCard — A-5 정기권/횟수제/경기당 결제 분기 카드
 *
 * Design 7원칙 준수:
 *  1. 분석: feeType 3종(MONTHLY_FIXED·PER_SESSION·PER_GAME) 분기 표시
 *  2. 휴먼 디자인: 단색 카드 + 명확한 계산식 + 우측 금액 정렬
 *  3. AI 스타일 금지: gradient/backdrop-blur/컬러 그림자 없음
 *  4. 페르소나 융합: frontend · architect
 *  5. 명령어: frontend-design
 *  6. 결과 출력: 결과 보고 시 7원칙 표기
 *  7. Tone & Manner: messages.ts 상수 사용, 한글 존댓말
 */
export interface PaymentOptionCardProps {
  /** 결제 방식 */
  feeType: FeeType;
  /** 단위당 금액 — 1회/1경기/주1회 기준 */
  pricePerUnit: number;
  /** MONTHLY_FIXED 전용 — 주 N회 */
  weeklyCount?: number;
  /** MONTHLY_FIXED 전용 — 정기권 주 수 (PACKAGE_WEEKS_SPEC §6, 4주 하드코딩 폐기) */
  weeks?: number;
  /** PER_SESSION 전용 — 총 회수 */
  totalSessions?: number;
  /** PER_GAME 전용 — 총 경기 수 (대회 참가비 계산) */
  gameCount?: number;
  /** MONTHLY_FIXED 전용 — 서버에서 내려온 월 고정 금액 (우선 사용) */
  monthlyFixedAmount?: number;
  /** 선택 여부 */
  selected?: boolean;
  /** 클릭 시 선택 */
  onSelect?: () => void;
  /** 추가 클래스 */
  className?: string;
  /**
   * 상품명 (ClassProduct.productName) — 있으면 카드 제목에 우선 사용.
   * 없으면 MESSAGES.payment2.card.title[feeType] 폴백.
   */
  productName?: string | null;
  /**
   * 상품 설명 (ClassProduct.description) — 있으면 카드 요약에 우선 사용.
   * 없으면 MESSAGES.payment2.card.summary[feeType] 폴백.
   */
  productDescription?: string | null;
  /**
   * PACKAGE_END_GUARD (2026-05-22) — 비활성 패키지(수업 종료일 초과·이미 종료).
   * true 면 카드 전체 grayscale + opacity-50 + 클릭 차단 + 배지 노출.
   */
  disabled?: boolean;
  /**
   * disabled=true 시 우상단에 표시할 배지 라벨 (예: "수업 종료일 초과").
   * MESSAGES 단일 SoT 위해 부모에서 전달.
   */
  disabledBadge?: string | null;
}

const ICON_BY_FEE_TYPE: Record<FeeType, string> = {
  MONTHLY_FIXED: 'calendar_month',
  PER_SESSION: 'confirmation_number',
  PER_GAME: 'sports_hockey',
};

const BADGE_KEY: Record<FeeType, keyof typeof MESSAGES.payment2.card.badge> = {
  MONTHLY_FIXED: 'monthlyFixed',
  PER_SESSION: 'perSession',
  PER_GAME: 'perGame',
};

const TITLE_KEY: Record<FeeType, keyof typeof MESSAGES.payment2.card.title> = {
  MONTHLY_FIXED: 'monthlyFixed',
  PER_SESSION: 'perSession',
  PER_GAME: 'perGame',
};

const SUMMARY_KEY: Record<FeeType, keyof typeof MESSAGES.payment2.card.summary> = {
  MONTHLY_FIXED: 'monthlyFixed',
  PER_SESSION: 'perSession',
  PER_GAME: 'perGame',
};

const TOTAL_LABEL_KEY: Record<FeeType, keyof typeof MESSAGES.payment2.card.totalLabel> = {
  MONTHLY_FIXED: 'monthlyFixed',
  PER_SESSION: 'perSession',
  PER_GAME: 'perGame',
};

/** feeType별 총액 계산 — 서버 값이 있으면 우선, 없으면 단위 × 수량 */
function computeTotal(props: PaymentOptionCardProps): number {
  const { feeType, pricePerUnit, weeklyCount, weeks, totalSessions, gameCount, monthlyFixedAmount } = props;
  switch (feeType) {
    case 'MONTHLY_FIXED':
      if (typeof monthlyFixedAmount === 'number' && monthlyFixedAmount > 0) return monthlyFixedAmount;
      if (!weeklyCount || weeklyCount <= 0) return pricePerUnit;
      // PACKAGE_WEEKS_SPEC §7 — durationDays 동적, 4주 하드코딩 폐기. weeks 미지정 시 4주 폴백.
      return weeklyCount * pricePerUnit * (weeks ?? 4);
    case 'PER_SESSION':
      if (!totalSessions || totalSessions <= 0) return pricePerUnit;
      return totalSessions * pricePerUnit;
    case 'PER_GAME':
      if (!gameCount || gameCount <= 0) return pricePerUnit;
      return gameCount * pricePerUnit;
    default:
      return pricePerUnit;
  }
}

/** feeType별 계산식 문구 */
function formatFormula(props: PaymentOptionCardProps): string | null {
  const { feeType, pricePerUnit, weeklyCount, weeks, totalSessions, gameCount } = props;
  switch (feeType) {
    case 'MONTHLY_FIXED':
      if (!weeklyCount || weeklyCount <= 0) return null;
      return MESSAGES.payment2.card.formula.monthlyFixed(weeklyCount, pricePerUnit, weeks);
    case 'PER_SESSION':
      if (!totalSessions || totalSessions <= 0) return null;
      return MESSAGES.payment2.card.formula.perSession(totalSessions, pricePerUnit);
    case 'PER_GAME':
      if (!gameCount || gameCount <= 0) return null;
      return MESSAGES.payment2.card.formula.perGame(gameCount, pricePerUnit);
    default:
      return null;
  }
}

/** 필수 필드 검증 — 음수·NaN 방어 */
function hasRequiredFields(props: PaymentOptionCardProps): boolean {
  const { feeType, pricePerUnit, weeklyCount, totalSessions, gameCount, monthlyFixedAmount } = props;
  if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) return false;
  switch (feeType) {
    case 'MONTHLY_FIXED':
      if (typeof monthlyFixedAmount === 'number' && monthlyFixedAmount >= 0) return true;
      return typeof weeklyCount === 'number' && weeklyCount > 0;
    case 'PER_SESSION':
      return typeof totalSessions === 'number' && totalSessions > 0;
    case 'PER_GAME':
      return typeof gameCount === 'number' && gameCount > 0;
    default:
      return false;
  }
}

export function PaymentOptionCard(props: PaymentOptionCardProps) {
  const { feeType, selected = false, onSelect, className, disabled = false, disabledBadge } = props;
  // disabled=true 면 onSelect 호출 자체 차단 (NavLink 가드와 이중 안전망).
  const isInteractive = typeof onSelect === 'function' && !disabled;
  const hasFields = hasRequiredFields(props);
  const total = hasFields ? computeTotal(props) : 0;
  const formula = hasFields ? formatFormula(props) : null;

  const badge = MESSAGES.payment2.card.badge[BADGE_KEY[feeType]];
  // DB 우선 원칙: product.productName / product.description 이 있으면 그대로 노출하고,
  // 없을 때만 messages.ts 의 feeType 별 기본 카피로 폴백한다.
  // 이로써 상품별 문구를 어드민에서 DB 로 커스터마이즈 가능.
  const title = props.productName?.trim()
    ? props.productName
    : MESSAGES.payment2.card.title[TITLE_KEY[feeType]];
  const summary = props.productDescription?.trim()
    ? props.productDescription
    : MESSAGES.payment2.card.summary[SUMMARY_KEY[feeType]];
  const totalLabel = MESSAGES.payment2.card.totalLabel[TOTAL_LABEL_KEY[feeType]];

  // [수정 2026-05-22 사용자 직접 지시] 학부모 결제 화면 카드 높이 축소.
  //   - p-5(20px) → p-4(16px) · gap-4(16px) → gap-3(12px) 로 누적 여백 28px 감소.
  //   - 정보 위계는 유지 (배지·제목·요약·계산식·총액 5단 그대로).
  const containerBase =
    'relative flex w-full flex-col gap-3 rounded-2xl border bg-white dark:bg-rink-800 p-4 shadow-md transition-colors motion-reduce:transition-none';
  // PACKAGE_END_GUARD: 비활성 시 grayscale + opacity-50, 클릭 비활성, hover/select 효과 제거.
  const borderClass = disabled
    ? 'border-wline-2 dark:border-rink-700 grayscale opacity-50 cursor-not-allowed shadow-none'
    : selected
      ? 'border-ice-500 ring-2 ring-ice-500/30'
      : 'border-wline dark:border-rink-700 hover:border-wline dark:hover:border-rink-700';

  const Wrapper: React.ElementType = isInteractive ? 'button' : 'div';

  // 누락 안내 카드
  if (!hasFields) {
    return (
      <div
        className={`${containerBase} ${borderClass} ${className ?? ''} text-left`}
        role="group"
        aria-label={`${badge} 결제 방식`}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-wline-2 dark:bg-rink-700 px-2.5 py-1 text-xs font-bold text-wtext-2 dark:text-rink-100">
            <Icon name={ICON_BY_FEE_TYPE[feeType]} className="text-[14px]" />
            {badge}
          </span>
        </div>
        <p className="text-sm text-wtext-3 dark:text-rink-300">
          {MESSAGES.payment2.card.missingInfo}
        </p>
      </div>
    );
  }

  return (
    <Wrapper
      type={isInteractive ? 'button' : undefined}
      onClick={isInteractive ? onSelect : undefined}
      disabled={disabled || undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      className={`${containerBase} ${borderClass} ${className ?? ''} ${
        isInteractive ? 'cursor-pointer text-left active:brightness-95' : ''
      }`}
      aria-pressed={isInteractive ? selected : undefined}
      aria-label={`${badge} ${title}${disabled && disabledBadge ? ` (${disabledBadge})` : ''}`}
    >
      {/* 상단: 배지 + 선택 체크 (disabled 시 disabledBadge 우선) */}
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 text-xs font-bold text-ice-500">
          <Icon name={ICON_BY_FEE_TYPE[feeType]} className="text-[14px]" />
          {badge}
        </span>
        {disabled && disabledBadge ? (
          <span className="inline-flex items-center h-6 px-2 rounded-full text-[11px] font-bold bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-200">
            {disabledBadge}
          </span>
        ) : selected ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ice-500 text-white">
            <Icon name="check" className="text-sm" />
          </span>
        ) : null}
      </div>

      {/* 제목/요약 */}
      <div className="flex flex-col gap-1">
        <h4 className="text-card-title text-wtext-1 dark:text-white">{title}</h4>
        <p className="text-card-meta text-wtext-3 dark:text-rink-300 leading-relaxed">{summary}</p>
      </div>

      {/* 계산식 — 배경 박스 제거 (2026-05-11 사용자 피드백). 카드 표면(bg-white)
          위에 inline 텍스트만 우측 정렬로 노출하여 시각 노이즈 제거. 상단에 hairline
          divider 만 유지해 제목·요약과 계산식 영역을 명확히 분리. */}
      {formula && (
        <p className="border-t border-wline-2 dark:border-rink-700 pt-2 text-card-meta font-medium text-wtext-2 dark:text-rink-100 tabular-nums text-right">
          {formula}
        </p>
      )}

      {/* 최종 금액 (오른쪽 정렬 필수) */}
      <div className="flex items-end justify-between gap-3">
        <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">{totalLabel}</span>
        <span className="text-card-section text-wtext-1 dark:text-white tabular-nums text-right">
          {total.toLocaleString('ko-KR')}원
        </span>
      </div>
    </Wrapper>
  );
}
