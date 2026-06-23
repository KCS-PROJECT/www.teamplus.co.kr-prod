"use client";

import { ReactNode } from "react";

/**
 * HeroPassCard — B1 탭의 메인 hero (좌측 본문 + 우측 64px vertical strip)
 *
 * 신한pLay 월렛의 카드형 hero pattern.
 * 좌: mini lesson card + 타이틀+서브 + 구분선 + 이번달 이용금액
 * 우: vertical 3 actions (rink-800 배경, white)
 */
export interface HeroPassCardAction {
  label: string; // \n 포함 가능 (2줄)
  icon: ReactNode;
  onClick?: () => void;
}

export interface HeroPassCardProps {
  /** 헤드라인 (예: "주니어 입문반") */
  title: string;
  /** 서브 (예: "지호 · 3054 패스") */
  subtitle?: string;
  /** "8월 이용금액" 같은 라벨 */
  amountLabel?: string;
  /** 금액 (숫자만, ',' 자동 포매팅) */
  amount?: number;
  /** 금액 단위 (기본 "원") */
  unit?: string;
  /** 우측 vertical strip 액션 (3개 권장) */
  actions: HeroPassCardAction[];
  /** mini card 우측 상단 표시 텍스트 (기본 "TEAMPLUS") */
  cardWatermark?: string;
  onCardClick?: () => void;
  onAmountClick?: () => void;
}

export function HeroPassCard({
  title,
  subtitle,
  amountLabel,
  amount,
  unit = "원",
  actions,
  cardWatermark = "TEAMPLUS",
  onCardClick,
  onAmountClick,
}: HeroPassCardProps) {
  return (
    <div className="px-3 sm:px-5 pt-3">
      <div className="flex rounded-[18px] overflow-hidden shadow-[0_6px_20px_rgba(20,24,38,0.08)]">
        {/* Main card */}
        <div className="flex-1 min-w-0 flex flex-col bg-wsurface dark:bg-rink-800 px-4 sm:px-[18px] py-4 sm:py-5 gap-3 sm:gap-3.5">
          <button
            type="button"
            onClick={onCardClick}
            className="flex items-center text-left bg-transparent border-0 p-0 gap-2.5 sm:gap-3"
          >
            {/* Mini lesson card — stylized */}
            <div
              className="relative shrink-0 w-14 sm:w-16 h-10 sm:h-11 rounded-lg"
              style={{
                background: "var(--c-rink-800)",
                boxShadow: "0 2px 6px rgba(20,24,38,0.2)",
              }}
            >
              <div
                className="absolute top-1.5 left-1.5 w-3 sm:w-3.5 h-2 sm:h-2.5 rounded-[1px]"
                style={{
                  background: "var(--c-sun-500)",
                }}
              />
              <div
                className="absolute bottom-1.5 right-1.5 font-num font-bold text-[7px] whitespace-nowrap"
                style={{
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {cardWatermark}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-wtext-1 dark:text-white truncate text-[16px] sm:text-[17px] tracking-[-0.02em]">
                {title}
              </div>
              {subtitle && (
                <div className="text-wtext-3 dark:text-rink-300 truncate text-[12px] sm:text-[13px] mt-0.5">
                  {subtitle}
                </div>
              )}
            </div>
            <ChevronRight />
          </button>

          {/* divider */}
          <div className="bg-wline-2 dark:bg-rink-700 h-px" />

          {amount != null && (
            <button
              type="button"
              onClick={onAmountClick}
              className="text-left bg-transparent border-0 p-0 min-w-0"
            >
              <div className="text-wtext-3 dark:text-rink-300 font-medium text-[12px] sm:text-[13px] truncate">
                {amountLabel}
              </div>
              <div className="flex items-center mt-0.5 gap-2">
                <div className="font-num font-extrabold text-wtext-1 dark:text-white text-[clamp(20px,6vw,24px)] tabular-nums truncate min-w-0">
                  {amount.toLocaleString("ko-KR")}
                  <span className="font-sans text-[14px] sm:text-[16px]">
                    {unit}
                  </span>
                </div>
                <div className="flex-1" />
                <ChevronRight />
              </div>
            </button>
          )}
        </div>

        {/* Side strip — vertical actions */}
        <div
          className="flex flex-col text-white shrink-0 w-14 sm:w-16"
          style={{ background: "var(--c-rink-800)" }}
        >
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={a.onClick}
              className="flex flex-col items-center justify-center bg-transparent border-0 text-white flex-1 gap-1"
              style={{
                borderTop: i ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}
            >
              {a.icon}
              <div className="text-center font-semibold text-[10px] leading-[1.15] whitespace-pre-line break-keep">
                {a.label}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="var(--c-text-4)"
      strokeWidth="2"
      fill="none"
      className="w-4 h-4 shrink-0"
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}
