"use client";

import type { ReactNode } from "react";
import { MESSAGES } from "@/lib/messages";

/**
 * ClassPaymentList (B1b) — 수업·결제 목록형 카드
 *
 * 학부모 메인 대시보드에서 수업이 등록되어 있을 때 표시되는 목록형 hero 섹션.
 * 원본: `babel_07.js` WalletPayList (라인 480~677)
 * SPEC: `docs/Design/NEW_DESIGN_ROLLOUT_PHASE2_SPEC.md` §2.5
 *
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface ClassPaymentItem {
  id: string;
  /** 수업명 — 예: "주니어 입문반" */
  title: string;
  /** 자녀명 — 예: "지호" */
  childName: string;
  /** 패스 번호 — 예: "3054" */
  passNumber: string;
  /** 월 이용금액 (KRW, 숫자) — 예: 576793 */
  monthlyAmount: number;
  /** 월 라벨 — 예: "8월" */
  monthLabel: string;
}

export type ClassPaymentMethodTheme = "flame" | "mint" | "sun" | "ice";

export interface ClassPaymentMethodItem {
  id: string;
  /** 결제수단명 — 예: "다드림 LOVE" */
  name: string;
  /** 보조 텍스트 — 예: "포인트 결제" */
  sub: string;
  type: "point" | "card" | "account";
  /** 좌측 thumbnail 마크 — 예: "♥" / "N" */
  mark: string;
  /** thumbnail 그라디언트 테마 컬러 */
  themeColor: ClassPaymentMethodTheme;
}

export interface ClassPaymentListProps {
  /** NFT promo strip 카피 — 예: "{childName}의 기록 카드를 시작해보세요" */
  recordPromoLabel?: string;
  /** 결제할 금액 합계 (KRW) */
  totalDueAmount: number;
  /** 좌상단 코너 chip 텍스트 — 예: "9.1" */
  totalDueScore?: string;
  /** 수업 목록 — 첫 번째 항목만 main card 로 렌더링 (현재 SPEC) */
  classes: ClassPaymentItem[];
  /** 기타 결제수단 목록 */
  paymentMethods: ClassPaymentMethodItem[];
  // ─── Click handlers ────────────────────────────────────────────
  onAttendanceClick?: () => void;
  onTransferClick?: () => void;
  onMoreClick?: () => void;
  onClassClick?: (id: string) => void;
  onPaymentMethodClick?: (id: string) => void;
  onTotalDueClick?: () => void;
  onUsageHistoryClick?: () => void;
  onCardManageClick?: () => void;
  /** 카드형 토글 클릭 (현재는 list view active) */
  onCardViewClick?: () => void;
  /** 금융 round button 클릭 */
  onFinanceClick?: () => void;
  /** Promo strip 우측 캐릭터/시작 영역 클릭 */
  onPromoClick?: () => void;
  className?: string;
}

// ─── Theme map (DESIGN.md token-only solid surfaces) ────────────────

const THUMB_BACKGROUNDS: Record<ClassPaymentMethodTheme, string> = {
  flame: "var(--c-flame-500)",
  mint: "var(--c-mint-500)",
  sun: "var(--c-sun-500)",
  ice: "var(--c-ice-500)",
};

// ─── Icons (inline SVG, 의존성 0) ───────────────────────────────────

function ChevronRight({
  size = 16,
  color = "var(--c-text-3)",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      stroke={color}
      strokeWidth="2"
      fill="none"
      aria-hidden
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function CharacterSun() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 28" aria-hidden>
      <ellipse cx="16" cy="22" rx="10" ry="3" fill="rgba(20,24,38,0.12)" />
      <rect x="6" y="4" width="20" height="18" rx="9" fill="var(--c-sun-500)" />
      <circle cx="11" cy="12" r="1.6" fill="var(--c-rink-900)" />
      <circle cx="21" cy="12" r="1.6" fill="var(--c-rink-900)" />
      <path
        d="M11 17 Q16 20 21 17"
        stroke="var(--c-rink-900)"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function IconAttendance() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      stroke="#fff"
      strokeWidth="2"
      fill="none"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM18 18h3v3h-3z" />
    </svg>
  );
}

function IconTransfer() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      stroke="#fff"
      strokeWidth="2"
      fill="none"
      aria-hidden
    >
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden>
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export function ClassPaymentList({
  recordPromoLabel,
  totalDueAmount,
  totalDueScore = "9.1",
  classes,
  paymentMethods,
  onAttendanceClick,
  onTransferClick,
  onMoreClick,
  onClassClick,
  onPaymentMethodClick,
  onTotalDueClick,
  onUsageHistoryClick,
  onCardManageClick,
  onCardViewClick,
  onFinanceClick,
  onPromoClick,
  className,
}: ClassPaymentListProps) {
  // 첫 번째 수업만 main card 로 렌더링 (SPEC §2.5)
  const mainClass = classes[0];

  // promo 카피 — childName 기반 자동 생성 (없으면 "아이의" 기본)
  const promoChildPrefix = mainClass?.childName ?? recordPromoLabel ?? "아이";
  const promoUsesCustomLabel = Boolean(recordPromoLabel);

  return (
    <section className={className} aria-label={MESSAGES.wallet.list.ariaLabel}>
      {/* ─── 1) NFT-style Promo strip + 금융 round button ───────────── */}
      <div className="px-3 sm:px-5 pt-3">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={onPromoClick}
            className="flex-1 min-w-0 flex items-center bg-ice-50 dark:bg-rink-800 text-wtext-2 dark:text-rink-100 font-bold border border-ice-100 dark:border-rink-700 text-left h-10 sm:h-11 rounded-full px-3 sm:px-4 gap-1.5 text-card-meta sm:text-card-body tracking-[-0.02em]"
            aria-label={MESSAGES.wallet.recordCard.titleSelf(promoChildPrefix)}
          >
            {promoUsesCustomLabel ? (
              <span className="truncate min-w-0">{recordPromoLabel}</span>
            ) : (
              <>
                <span className="truncate min-w-0 break-keep">
                  {MESSAGES.wallet.list.recordPromoPrefix(promoChildPrefix)}
                </span>
                <span
                  className="inline-flex items-center font-num font-extrabold px-1.5 sm:px-2 py-0.5 rounded-lg text-card-meta shrink-0 whitespace-nowrap"
                  style={{
                    border: "1.5px dashed var(--c-ice-500)",
                    color: "var(--c-ice-600)",
                  }}
                >
                  {MESSAGES.wallet.recordCard.tag}
                </span>
                <span className="hidden sm:inline whitespace-nowrap">
                  {MESSAGES.wallet.list.recordPromoSuffix}
                </span>
              </>
            )}
            <span className="flex-1" />
            <CharacterSun />
          </button>
          <button
            type="button"
            onClick={onFinanceClick}
            className="grid place-items-center text-white font-extrabold border-0 bg-rink-800 dark:bg-puck w-10 sm:w-11 h-10 sm:h-11 rounded-full text-card-meta tracking-[-0.02em] shrink-0 whitespace-nowrap"
            aria-label={MESSAGES.wallet.list.financeButton}
          >
            {MESSAGES.wallet.list.financeButton}
          </button>
        </div>
      </div>

      {/* ─── 2) View toggle (목록형 active) + secondary chips ───────── */}
      <div className="px-3 sm:px-5 pt-3 flex items-center gap-2">
        <div
          className="flex border border-wline dark:border-rink-700 overflow-hidden rounded-lg shrink-0"
          role="tablist"
          aria-label={MESSAGES.wallet.list.viewToggleLabel}
        >
          {/* 카드형 (inactive) */}
          <button
            type="button"
            onClick={onCardViewClick}
            className="grid place-items-center bg-wsurface dark:bg-rink-800 border-0 w-8 h-8"
            aria-label={MESSAGES.wallet.list.viewCardLabel}
            role="tab"
            aria-selected={false}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
              <rect
                x="1"
                y="2"
                width="14"
                height="5"
                rx="1"
                fill="var(--c-text-3)"
                opacity="0.5"
              />
              <rect
                x="1"
                y="9"
                width="14"
                height="5"
                rx="1"
                fill="var(--c-text-3)"
                opacity="0.3"
              />
            </svg>
          </button>
          {/* 리스트형 (active) */}
          <button
            type="button"
            className="grid place-items-center bg-wtext-1 dark:bg-white border-0 w-8 h-8"
            aria-label={MESSAGES.wallet.list.viewListLabel}
            role="tab"
            aria-selected={true}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              stroke="var(--c-surface)"
              strokeWidth="1.6"
              aria-hidden
            >
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="14" y2="12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-w-0" />

        <button
          type="button"
          onClick={onUsageHistoryClick}
          className="bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 font-semibold h-8 px-2.5 sm:px-3.5 rounded-full text-card-meta whitespace-nowrap shrink-0"
        >
          {MESSAGES.wallet.pay.historyChip}
        </button>
        <button
          type="button"
          onClick={onCardManageClick}
          className="bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 font-semibold h-8 px-2.5 sm:px-3.5 rounded-full text-card-meta whitespace-nowrap shrink-0"
        >
          {MESSAGES.wallet.pay.manageChip}
        </button>
      </div>

      {/* ─── 3) Pay summary (with 9.1 score chip) ───────────────────── */}
      <div className="px-3 sm:px-5 pt-4">
        <button
          type="button"
          onClick={onTotalDueClick}
          className="relative flex items-center w-full bg-wsurface dark:bg-rink-800 shadow-sh-1 border-0 text-left rounded-[14px] gap-2 sm:gap-2.5 px-3 sm:px-4 py-3 sm:py-3.5"
          aria-label={`${MESSAGES.wallet.pay.monthlyDue} ${totalDueAmount.toLocaleString("ko-KR")}원`}
        >
          {totalDueScore && (
            <span
              className="absolute bg-ice-600 text-white font-num font-bold px-1.5 py-0.5 text-card-meta rounded-[3px]"
              style={{
                top: -8,
                left: 14,
              }}
              aria-hidden
            >
              {totalDueScore}
            </span>
          )}
          <div className="flex items-center font-semibold text-wtext-2 dark:text-rink-100 text-card-body gap-1.5 min-w-0 break-keep">
            <span className="truncate">
              {MESSAGES.wallet.list.payAmountLabel}
            </span>
            <span
              className="grid place-items-center font-bold w-3.5 h-3.5 rounded-full text-card-meta shrink-0"
              style={{
                border: "1px solid var(--c-text-4)",
                color: "var(--c-text-4)",
              }}
              aria-hidden
            >
              ?
            </span>
          </div>
          <div className="flex-1 min-w-0" />
          <div className="font-num font-extrabold text-ice-600 dark:text-ice-300 tabular-nums text-[clamp(18px,5vw,22px)] tracking-[-0.02em] shrink-0 whitespace-nowrap">
            {totalDueAmount.toLocaleString("ko-KR")}
            <span className="font-sans text-card-meta sm:text-card-body">원</span>
          </div>
          <ChevronRight color="var(--c-text-3)" />
        </button>
      </div>

      {/* ─── 4) Main card — 패스 + 월 이용금액 + 가로 다크 액션 strip ── */}
      {mainClass && (
        <div className="px-3 sm:px-5 pt-3">
          <div className="bg-wsurface dark:bg-rink-800 overflow-hidden shadow-sh-3 rounded-[18px]">
            {/* Top: mini pass + 수업명 + 패스번호 */}
            <button
              type="button"
              onClick={() => onClassClick?.(mainClass.id)}
              className="flex items-center w-full bg-transparent border-0 text-left px-4 sm:px-5 pt-4 sm:pt-5 pb-3 sm:pb-4 gap-3 sm:gap-3.5"
              aria-label={`${mainClass.title} 상세`}
            >
              {/* Mini pass card thumbnail */}
              <div
                className="relative shrink-0 w-16 sm:w-20 h-11 sm:h-[52px] rounded-lg"
                style={{
                  background: "var(--c-rink-800)",
                  boxShadow: "0 2px 6px rgba(20,24,38,0.2)",
                }}
                aria-hidden
              >
                <div
                  className="absolute top-1.5 left-1.5 w-3 sm:w-3.5 h-2 sm:h-2.5 rounded-[1px]"
                  style={{
                    background: "var(--c-sun-500)",
                  }}
                />
                <div
                  className="absolute bottom-1.5 right-1.5 font-num font-bold text-card-meta tracking-[0.04em] whitespace-nowrap"
                  style={{
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  TEAMPLUS
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-wtext-1 dark:text-white truncate text-card-title sm:text-card-title tracking-[-0.02em]">
                  {mainClass.title}
                </div>
                <div className="text-wtext-3 dark:text-rink-300 truncate text-card-meta sm:text-card-body mt-0.5">
                  {mainClass.childName} · {mainClass.passNumber}{" "}
                  {MESSAGES.wallet.pay.pass}
                </div>
              </div>
              <ChevronRight color="var(--c-text-4)" />
            </button>

            {/* Divider */}
            <div className="bg-wline-2 dark:bg-rink-700 h-px mx-4 sm:mx-5" />

            {/* 월 이용금액 */}
            <button
              type="button"
              onClick={() => onClassClick?.(mainClass.id)}
              className="flex flex-col w-full bg-transparent border-0 text-left px-4 sm:px-5 pt-3 sm:pt-4 pb-4 sm:pb-[18px]"
              aria-label={`${mainClass.monthLabel} ${MESSAGES.wallet.pay.lessonAmount}`}
            >
              <div className="text-wtext-3 dark:text-rink-300 font-medium text-card-meta sm:text-card-body truncate">
                {mainClass.monthLabel} {MESSAGES.wallet.pay.lessonAmount}
              </div>
              <div className="flex items-center mt-1 gap-2">
                <div className="font-num font-extrabold text-wtext-1 dark:text-white tabular-nums text-[clamp(22px,7vw,26px)] tracking-[-0.02em] truncate min-w-0">
                  {mainClass.monthlyAmount.toLocaleString("ko-KR")}
                  <span className="font-sans text-card-title sm:text-card-emphasis">
                    원
                  </span>
                </div>
                <div className="flex-1 min-w-0" />
                <ChevronRight color="var(--c-text-4)" />
              </div>
            </button>

            {/* Horizontal dark action strip (출석체크 / 송금 / 더보기) */}
            <div
              className="flex bg-rink-800 dark:bg-puck text-white h-16 sm:h-[70px]"
              role="group"
              aria-label={MESSAGES.wallet.list.actionGroupLabel}
            >
              <ActionStripButton
                icon={<IconAttendance />}
                label={MESSAGES.wallet.list.actionAttendance}
                onClick={onAttendanceClick}
                isFirst
              />
              <ActionStripButton
                icon={<IconTransfer />}
                label={MESSAGES.wallet.list.actionTransfer}
                onClick={onTransferClick}
              />
              <ActionStripButton
                icon={<IconMore />}
                label={MESSAGES.wallet.list.actionMore}
                onClick={onMoreClick}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── 5) Other payment methods (다드림 LOVE / 네이버페이 등) ──── */}
      {paymentMethods.length > 0 && (
        <div
          className="px-3 sm:px-5 pt-4 flex flex-col gap-2.5"
          aria-label={MESSAGES.wallet.pay.otherPaymentTitle}
        >
          {paymentMethods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPaymentMethodClick?.(m.id)}
              className="flex items-center w-full bg-wsurface dark:bg-rink-800 shadow-sh-1 border-0 text-left rounded-[14px] gap-2.5 sm:gap-3 px-3 sm:px-3.5 py-3"
              aria-label={`${m.name} ${m.sub}`}
            >
              {/* Thumbnail */}
              <div
                className="grid place-items-center font-num font-extrabold text-white shrink-0 w-14 sm:w-16 h-10 sm:h-[42px] rounded-md text-card-title sm:text-card-title"
                style={{
                  background: THUMB_BACKGROUNDS[m.themeColor],
                  boxShadow: "0 2px 4px rgba(20,24,38,0.15)",
                }}
                aria-hidden
              >
                {m.mark}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-wtext-1 dark:text-white truncate text-card-body sm:text-card-title tracking-[-0.02em]">
                  {m.name}
                </div>
                <div className="text-wtext-3 dark:text-rink-300 truncate text-card-meta mt-0.5">
                  {m.sub}
                </div>
              </div>
              <ChevronRight size={14} color="var(--c-text-4)" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Sub component: Action strip button ─────────────────────────────

interface ActionStripButtonProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  isFirst?: boolean;
}

function ActionStripButton({
  icon,
  label,
  onClick,
  isFirst,
}: ActionStripButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center text-white bg-transparent border-0 flex-1 min-w-0 gap-1.5"
      style={{
        // 첫 항목 제외 좌측 hairline 분리선 (rink-800 위 white/8)
        borderLeft: isFirst ? "none" : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {icon}
      <div className="font-semibold text-card-meta tracking-[-0.02em] truncate px-1 break-keep">
        {label}
      </div>
    </button>
  );
}
