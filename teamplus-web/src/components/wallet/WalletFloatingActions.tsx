"use client";

import { MESSAGES } from "@/lib/messages";

/**
 * WalletFloatingActions — 좌: QR 출석체크 pill / 우: 아이스+ 원형 FAB
 *
 * - position: absolute, bottom: BottomNav(60px) + safe-area + 28px = 88px+
 * - pointerEvents: 컨테이너 none, 자식 auto (스크롤 방해 X)
 */
export interface WalletFloatingActionsProps {
  onQrClick?: () => void;
  onPlusClick?: () => void;
  /** "QR 출석체크" 라벨 변형 (코치/관리자는 "QR 발급") */
  qrLabel?: string;
}

export function WalletFloatingActions({
  onQrClick,
  onPlusClick,
  qrLabel = MESSAGES.wallet.floating.qrCheckin,
}: WalletFloatingActionsProps) {
  // onQrClick 이 전달되지 않으면 좌측 QR pill 영역을 숨긴다.
  // (관리자 화면 등에서 QR 액션 비활성)
  const showQr = typeof onQrClick === "function";

  return (
    <div
      aria-hidden={false}
      className="absolute left-0 right-0 px-4 sm:px-5 pointer-events-none"
      style={{
        bottom:
          "calc(60px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 28px)",
      }}
    >
      <div
        className={`flex items-center gap-2 ${showQr ? "justify-between" : "justify-end"}`}
      >
        {/* QR 출석체크 — 다크 pill (onQrClick 있을 때만 렌더) */}
        {showQr && (
          <button
            type="button"
            onClick={onQrClick}
            className="flex items-center font-bold text-white border-0 rounded-full h-12 sm:h-[52px] px-4 sm:px-[18px] gap-2 sm:gap-2.5 text-[13px] sm:text-[14px] tracking-[-0.02em] pointer-events-auto whitespace-nowrap min-w-0"
            style={{
              background: "var(--c-rink-900)",
              boxShadow: "var(--w-sh-rink)",
            }}
          >
            <span
              className="inline-grid place-items-center w-6 h-6 sm:w-7 sm:h-7 rounded-md shrink-0"
              style={{
                background: "rgba(255,255,255,0.12)",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                className="w-3.5 h-3.5 sm:w-4 sm:h-4"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3zM18 18h3v3h-3z" />
              </svg>
            </span>
            <span className="truncate">{qrLabel}</span>
          </button>
        )}

        {/* 아이스+ — 원형 흰색 FAB */}
        <button
          type="button"
          onClick={onPlusClick}
          aria-label={MESSAGES.wallet.floating.teamplusPlus}
          className="grid place-items-center bg-wsurface w-14 h-14 rounded-full border-0 pointer-events-auto shrink-0"
          style={{
            boxShadow: "var(--w-sh-blue), 0 0 0 1px rgba(47,95,255,0.12)",
          }}
        >
          <div
            className="flex flex-col items-center font-extrabold text-[9px] tracking-[-0.02em] gap-0.5"
            style={{
              color: "var(--c-ice-600)",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-5 h-5 sm:w-[22px] sm:h-[22px]"
            >
              <path
                d="M12 2 L14.2 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L9.8 8 Z"
                fill="var(--c-flame-500)"
              />
            </svg>
            {MESSAGES.wallet.floating.teamplusPlus}
          </div>
        </button>
      </div>
    </div>
  );
}
