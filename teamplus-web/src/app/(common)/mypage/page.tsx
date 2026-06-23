"use client";

/**
 * 마이페이지 — 04h Director · My (개선) 정합 (2026-05-09)
 *
 * 참고: docs/screens/04h_director_my (DirectorMyScreen)
 *
 * Body(contents) 영역만 04h 디자인 spec 으로 인라인 직접 구현 (사용자 결정: 100% 일치 우선):
 *   • Hero: 다크 슬레이트 그라데이션(#1a2240 → #0f1426, 04h 원본) + 원형 border 데코 + ice SVG radial 글로우
 *           - DESIGN.md "gradient 0" 룰 사용자 명시 우회 (예외: mypage hero 한정)
 *   • Row: bg-wsurface + border 1px wline-2 + shadow 0 2px 8px + 44×44 ice50 아이콘 컨테이너 (radius 12)
 *   • SectionLabel: 14px font-extrabold (padding 20/24/10), action 은 ice500 12px
 *   • Doc: Row 와 동일 스킨 + 28×32 line2 코너 트라이앵글 아이콘 + "체결완료" mint500
 *
 * AppBar / BottomNav 불가침 — WalletScreen wrapper 의 Tabs / WalletAppBar 그대로.
 */

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { api } from "@/services/api-client";
import { HeroTeamLogo } from "@/components/dashboard/HeroTeamLogo";
import nextDynamic from "next/dynamic";

import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNativeUI } from "@/hooks/useNativeUI";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useNotificationCount } from "@/hooks/useNotificationCount";
import { useAppSettings } from "@/hooks/useAppSettings";
import { ConfirmDialog } from "@/components/ui/Modal/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Icon } from "@/components/ui/Icon";
import { MESSAGES } from "@/lib/messages";
import { PATHS } from "@/lib/paths";

import { WalletScreen } from "@/components/wallet";
import { usePageReady } from '@/hooks/usePageReady';

const GlobalMenu = nextDynamic(
  () =>
    import("@/components/layout/GlobalMenu").then((mod) => ({
      default: mod.GlobalMenu,
    })),
  { ssr: false },
);

// ─── Role labels ──────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  parent: "학부모",
  coach: "코치",
  admin: "관리자",
  director: "감독",
  teen: "학생",
  child: "학생",
  // [수정 2026-05-12] director 그룹 분류 정합 — 마이페이지에서도 "오픈클래스 감독"으로 통일.
  //   배지·"오픈클래스 감독 계정 · TEAMPLUS"·"오픈클래스 감독 메인 화면 바로가기" 모두 자동 반영.
  academy_director: "오픈클래스 감독",
};

// ───────────────────────────────────────────────────────────────
// Hero — 04h ProfileTab Hero
// ───────────────────────────────────────────────────────────────
function HeroCard({
  role,
  email,
  name,
  info,
  stats,
  logoUrl,
}: {
  role: string;
  email?: string;
  name: string;
  info?: string;
  stats: { label: string; value: string; unit?: string }[];
  /** 소속 팀 로고 — 메인화면 Hero 와 동일하게 우상단 표시 (2026-05-25) */
  logoUrl?: string | null;
}) {
  return (
    <div style={{ padding: "16px 20px 0" }}>
      <div
        className="relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #1a2240 0%, #0f1426 100%)",
          borderRadius: 22,
          padding: "22px 22px 24px",
          minHeight: 200,
          boxShadow: "0 14px 30px rgba(15,20,38,0.25)",
        }}
      >
        {/* 데코 — 원형 border (solid) */}
        <span
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            right: -30,
            top: -30,
            width: 180,
            height: 180,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        />
        {/* 데코 — 원형 border (dashed) */}
        <span
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            right: 20,
            top: 30,
            width: 110,
            height: 110,
            borderRadius: "50%",
            border: "1px dashed rgba(255,255,255,0.14)",
          }}
        />
        {/* 데코 — ice 글로우 (SVG radial; CSS gradient 회피) */}
        <svg
          aria-hidden
          className="absolute pointer-events-none"
          style={{ right: -50, top: -50, width: 220, height: 220 }}
          viewBox="0 0 220 220"
        >
          <defs>
            <radialGradient id="hero-ice-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--c-ice-500)" stopOpacity="0.30" />
              <stop offset="60%" stopColor="var(--c-ice-500)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="110" cy="110" r="110" fill="url(#hero-ice-glow)" />
        </svg>

        {/* 소속 팀 로고 — 메인화면 Hero 와 동일 (우상단, 배경 없음) */}
        <HeroTeamLogo logoUrl={logoUrl} />

        {/* role badge + email */}
        <div className="relative inline-flex items-center" style={{ gap: 10 }}>
          <span
            className="font-extrabold inline-flex items-center"
            style={{
              padding: "4px 10px",
              borderRadius: 8,
              background: "var(--c-flame-500)",
              fontSize: 11,
              letterSpacing: "-0.01em",
              color: "#fff",
            }}
          >
            {role}
          </span>
          {email && (
            <span
              className="font-num truncate"
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.65)",
                maxWidth: 200,
              }}
            >
              {email}
            </span>
          )}
        </div>

        {/* name */}
        <div
          className="relative font-extrabold"
          style={{
            fontSize: 28,
            marginTop: 12,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            paddingRight: 84,
          }}
        >
          {name}
        </div>
        {info && (
          <div
            className="relative"
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.65)",
              marginTop: 4,
            }}
          >
            {info}
          </div>
        )}

        {/* stats — 3분할 grid + top divider */}
        {stats.length > 0 && (
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginTop: 22,
              paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {stats.map((s) => (
              <div key={s.label}>
                <div
                  className="font-bold"
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.55)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {s.label}
                </div>
                <div
                  className="inline-flex items-baseline"
                  style={{ marginTop: 4, gap: 2 }}
                >
                  <span
                    className="font-num font-extrabold tabular-nums"
                    style={{
                      fontSize: 18,
                      color: "#fff",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {s.value}
                  </span>
                  {s.unit && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.55)",
                      }}
                    >
                      {s.unit}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// SectionLabel — 04h SectionLabel
// ───────────────────────────────────────────────────────────────
function SectionLabel({
  children,
  action,
  onActionClick,
}: {
  children: ReactNode;
  action?: string;
  onActionClick?: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: "20px 24px 10px" }}
    >
      <span
        className="font-extrabold text-wtext-1 dark:text-white"
        style={{ fontSize: 14, letterSpacing: "-0.02em" }}
      >
        {children}
      </span>
      {action && (
        <button
          type="button"
          onClick={onActionClick}
          className="bg-transparent border-0 p-0 font-bold"
          style={{ fontSize: 12, color: "var(--c-ice-500)" }}
        >
          {action} ›
        </button>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Row — 04h Row (icon · title · subtitle · badge · right slot)
// ───────────────────────────────────────────────────────────────
function Row({
  icon,
  title,
  subtitle,
  badge,
  right,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge?: string | null;
  right?: ReactNode;
  onClick?: () => void;
}) {
  const className =
    "flex items-center w-full text-left bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700";
  const style = {
    gap: 14,
    padding: "16px 18px",
    borderRadius: 16,
    boxShadow: "0 2px 8px rgba(20,24,38,0.03)",
  } as const;

  const inner = (
    <>
      <div
        className="grid place-items-center shrink-0"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: "var(--c-ice-50)",
          color: "var(--c-ice-500)",
        }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="inline-flex items-center" style={{ gap: 8 }}>
          <span
            className="font-extrabold text-wtext-1 dark:text-white truncate"
            style={{ fontSize: 15, letterSpacing: "-0.02em" }}
          >
            {title}
          </span>
          {badge && (
            <span
              className="font-extrabold whitespace-nowrap shrink-0"
              style={{
                padding: "2px 7px",
                borderRadius: 6,
                background: "var(--c-flame-100)",
                color: "var(--c-flame-500)",
                fontSize: 10,
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <div
            className="text-wtext-3 dark:text-rink-300 truncate"
            style={{ fontSize: 12, marginTop: 3 }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {right ?? (
        <svg
          width={14}
          height={14}
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
          className="shrink-0"
        >
          <path
            d="M5 3l4 4-4 4"
            stroke="var(--c-text-4)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  );

  // onClick 미지정 시 button 중첩(<button> in <button>) 회피용 div 렌더링
  // — Toggle 등 인터랙티브 자식이 right 슬롯에 들어오는 케이스 (예: 알림 설정 행)
  if (!onClick) {
    return (
      <div className={className} style={style}>
        {inner}
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {inner}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────
// DocCard — 04h DocsTab Doc (체결완료 표시)
// ───────────────────────────────────────────────────────────────
function DocCard({
  title,
  date,
  status = "signed",
  onClick,
}: {
  title: string;
  date: string;
  status?: "signed" | "expired";
  onClick?: () => void;
}) {
  const statusLabel = status === "expired" ? "만료" : "체결완료";
  const statusColor =
    status === "expired" ? "var(--c-text-4)" : "var(--c-mint-500)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center w-full text-left bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700"
      style={{
        gap: 12,
        padding: "14px 16px",
        borderRadius: 14,
        boxShadow: "0 2px 8px rgba(20,24,38,0.03)",
      }}
    >
      <div
        className="bg-wline-2 dark:bg-rink-700 flex items-start justify-end shrink-0"
        style={{ width: 28, height: 32, borderRadius: 4, padding: 3 }}
        aria-hidden
      >
        <svg width={6} height={6} viewBox="0 0 6 6">
          <path d="M0 0h6v6L0 0z" fill="var(--c-text-4)" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="font-extrabold text-wtext-1 dark:text-white truncate"
          style={{ fontSize: 14, letterSpacing: "-0.02em" }}
        >
          {title}
        </div>
        <div
          className="font-num text-wtext-3 dark:text-rink-300 truncate"
          style={{ fontSize: 11, marginTop: 2 }}
        >
          {date}
        </div>
      </div>
      <span
        className="font-extrabold whitespace-nowrap shrink-0"
        style={{ fontSize: 12, color: statusColor }}
      >
        {statusLabel}
      </span>
    </button>
  );
}

// ───────────────────────────────────────────────────────────────
// Toggle — 04h SettingsTab Toggle (44×26 pill, ice500 ON / line2 OFF)
// ───────────────────────────────────────────────────────────────
function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 border-0 cursor-pointer transition-colors ${
        on ? "bg-ice-500" : "bg-wline-2 dark:bg-rink-500"
      }`}
      style={{
        width: 44,
        height: 26,
        borderRadius: 999,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          transition: "left 150ms",
        }}
      />
    </button>
  );
}

// ───────────────────────────────────────────────────────────────
// Icons (stroke = ice-500, 1.6 weight) — 04h 아이콘 셋 정합
// ───────────────────────────────────────────────────────────────
const I_STROKE = "var(--c-ice-500)";
const I_FILL = "var(--c-ice-500)";

const IconPerson = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="7" r="3" stroke={I_STROKE} strokeWidth={1.6} />
    <path
      d="M3.5 17c1-3.4 3.6-5 6.5-5s5.5 1.6 6.5 5"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </svg>
);
const IconLock = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M10 3a4 4 0 014 4v2H6V7a4 4 0 014-4z"
      stroke={I_STROKE}
      strokeWidth={1.6}
    />
    <rect
      x="5"
      y="9"
      width="10"
      height="8"
      rx="1.5"
      stroke={I_STROKE}
      strokeWidth={1.6}
    />
    <circle cx="10" cy="13" r="1.2" fill={I_FILL} />
  </svg>
);
const IconQR = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <rect x="3" y="3" width="6" height="6" rx="1" stroke={I_STROKE} strokeWidth={1.5} />
    <rect x="11" y="3" width="6" height="6" rx="1" stroke={I_STROKE} strokeWidth={1.5} />
    <rect x="3" y="11" width="6" height="6" rx="1" stroke={I_STROKE} strokeWidth={1.5} />
    <rect x="13" y="13" width="2" height="2" fill={I_FILL} />
    <rect x="11" y="15" width="2" height="2" fill={I_FILL} />
    <rect x="15" y="11" width="2" height="2" fill={I_FILL} />
  </svg>
);
const IconDashboard = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <rect x="3" y="3" width="6" height="6" rx="1.4" stroke={I_STROKE} strokeWidth={1.6} />
    <rect x="11" y="3" width="6" height="6" rx="1.4" stroke={I_STROKE} strokeWidth={1.6} />
    <rect x="3" y="11" width="6" height="6" rx="1.4" stroke={I_STROKE} strokeWidth={1.6} />
    <rect x="11" y="11" width="6" height="6" rx="1.4" stroke={I_STROKE} strokeWidth={1.6} />
  </svg>
);
const IconSearch = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <circle cx="9" cy="9" r="5" stroke={I_STROKE} strokeWidth={1.6} />
    <path
      d="M13 13l4 4"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </svg>
);
const IconAttendance = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <rect
      x="3"
      y="4"
      width="14"
      height="13"
      rx="2"
      stroke={I_STROKE}
      strokeWidth={1.6}
    />
    <path
      d="M3 8h14M7 2v3M13 2v3M7 12l2 2 4-4"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const IconReceipt = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M5 3h10v15l-2-1.5-2 1.5-2-1.5-2 1.5L5 16.5V3z"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <path
      d="M7.5 7h5M7.5 10h5M7.5 13h3"
      stroke={I_STROKE}
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  </svg>
);
const IconBell = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M5 14V9a5 5 0 1110 0v5l1 1.5H4L5 14z"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <path
      d="M8.5 17.5h3"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </svg>
);
const IconCalendar = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <rect
      x="3"
      y="4"
      width="14"
      height="13"
      rx="2"
      stroke={I_STROKE}
      strokeWidth={1.6}
    />
    <path
      d="M3 8h14M7 2v3M13 2v3"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </svg>
);
const IconChat = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M3.5 5.5C3.5 4.4 4.4 3.5 5.5 3.5h9c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H8L5 16v-2.5h-.5a1.5 1.5 0 01-1.5-1.5V5.5z"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <path
      d="M7 7.5h6M7 10h4"
      stroke={I_STROKE}
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  </svg>
);
const IconHistory = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M3 10a7 7 0 1010-6.5"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
    <path
      d="M3 4v3.5h3.5"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10 7v3l2 1.5"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </svg>
);
const IconCampaign = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M3 9v3l4 1.5v3.5h2l-1-5 9-2 1 1V5l-1 1-9-2-4 1.5v3.5z"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </svg>
);
const IconHelp = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke={I_STROKE} strokeWidth={1.6} />
    <path
      d="M7.5 8c0-1.4 1.1-2.4 2.5-2.4s2.5 1 2.5 2.2c0 1-.5 1.5-1.5 2-.7.4-1 .8-1 1.6"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
    <circle cx="10" cy="14.5" r="0.9" fill={I_FILL} />
  </svg>
);
const IconDoc = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M5 3h7l3 3v11a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <path
      d="M12 3v3h3M7 10h6M7 13h6"
      stroke={I_STROKE}
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  </svg>
);
const IconFeedback = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M3.5 5.5C3.5 4.4 4.4 3.5 5.5 3.5h9c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H8L5 16v-2.5h-.5a1.5 1.5 0 01-1.5-1.5V5.5z"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <path
      d="M11 6.5l-3 4 1.5 1.5"
      stroke={I_STROKE}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const IconTheme = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M10 3a7 7 0 100 14c-2 0-4-2-4-4s2-3 2-5-1-3 2-5z"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <circle cx="13" cy="7" r="0.8" fill={I_FILL} />
    <circle cx="15" cy="11" r="0.8" fill={I_FILL} />
    <circle cx="13" cy="14" r="0.8" fill={I_FILL} />
  </svg>
);
const IconAccessibility = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="4.5" r="1.6" fill={I_FILL} />
    <path
      d="M4 8h12M10 8v3M7 17l3-6 3 6M7.5 12h5"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </svg>
);
const IconShield = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M10 3l6 2v5c0 4-3 6.5-6 7.5-3-1-6-3.5-6-7.5V5l6-2z"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </svg>
);
const IconBlock = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke={I_STROKE} strokeWidth={1.6} />
    <path
      d="M5 5l10 10"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
    />
  </svg>
);
const IconFolder = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
    <path
      d="M3 7l2-2h4l1.5 1.5H17v9.5a1 1 0 01-1 1H4a1 1 0 01-1-1V7z"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
    <path
      d="M10 9v4M8 11l2 2 2-2"
      stroke={I_STROKE}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
// ───────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────
export default function MyPage() {
  // @check-usePageReady-audit-B — audit §3 B #4: 알림 badge + appSettings 는
  //   defaults(0/null) 로 즉시 렌더 가능. 데이터 도착 전에도 마이페이지 본문이 표시.
  //   audit 권장: "usePageReady(true) 유지". 자동 도구 휴리스틱 C 오탐 회피.
  usePageReady(true);
  const { user: authUser, logout } = useSessionAuth();
  const { settings: notifSettings, togglePush } = useNotificationSettings();
  const { unreadCount } = useNotificationCount();
  const { settings: appSettings } = useAppSettings();
  const { toast } = useToast();
  const { navigate } = useNavigation();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null);

  // [2026-05-25] 소속 팀 로고 — 메인화면 Hero 와 동일하게 마이페이지 Hero 우상단 표시.
  //   /teams/my/list(getUserTeams) 가 모든 역할의 본인 소속 팀(logoUrl 포함)을 반환.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        type TeamItem = { id?: string; logoUrl?: string | null };
        const r = await api.get<TeamItem[] | { data?: TeamItem[] }>("/teams/my/list");
        if (cancelled || !r.success || !r.data) return;
        const list: TeamItem[] = Array.isArray(r.data)
          ? r.data
          : ((r.data as { data?: TeamItem[] }).data ?? []);
        setTeamLogoUrl(list.find((t) => t.logoUrl)?.logoUrl ?? null);
      } catch {
        /* 로고 미조회 시 데코만 노출 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: false,
    showMenuButton: false,
    isDataLoaded: !!authUser,
  });

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      toast.error(MESSAGES.common.unknown);
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, logout, toast]);

  const roleKey = (authUser?.userType ?? "").toString().toLowerCase();
  const displayName = authUser?.name ?? "";
  const displayEmail = authUser?.email ?? "";
  const roleLabel = ROLE_LABELS[roleKey] ?? "회원";

  // 설정 항목/푸터 — [2026-06-17] 설정 탭을 프로필 탭으로 통합하면서 프로필 탭에서 사용.
  const S = MESSAGES.settings;
  const versionLabel = appSettings?.appVersion
    ? `${S.footer.brand} ${S.footer.versionPrefix}${appSettings.appVersion}`
    : S.footer.brand;

  // ─── 프로필 탭 (설정 통합: 내 정보 + 알림 + 화면 + 로그아웃) ───
  const profileTab = (
    <div className="flex flex-col">
      <HeroCard
        role={roleLabel}
        email={displayEmail}
        name={displayName ? `${displayName}님` : `${roleLabel}님`}
        info={`${roleLabel} 계정 · TEAMPLUS`}
        logoUrl={teamLogoUrl}
        stats={[
          { label: "누적 수업", value: "—", unit: "회" },
          { label: "포인트", value: "—", unit: "P" },
          { label: "활동 기간", value: "—" },
        ]}
      />

      <SectionLabel>내 정보</SectionLabel>
      <div
        style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <Row
          icon={<IconPerson />}
          title="프로필 수정"
          subtitle="이름·연락처·프로필 사진"
          onClick={() => navigate("/profile/edit")}
        />
        <Row
          icon={<IconLock />}
          title="비밀번호 변경"
          subtitle="6개월마다 변경 권장"
          onClick={() => navigate("/profile/password")}
        />
        {/* QR 출석 미사용 정책(버튼 출석 통일)에 따라 숨김. 재개 시 주석 해제. */}
        {/* <Row
          icon={<IconQR />}
          title="내 QR 코드"
          subtitle="오프라인 출석 인증용"
          badge={MESSAGES.wallet.extra.tagRecommend}
          onClick={() => navigate("/my-qr")}
        /> */}
      </div>

      {/* [제거 2026-06-17] '역할별 메인' 섹션 삭제 (사용자 직접 지시 · 전 역할 공통) */}

      {/* [2026-06-17] 설정 탭을 프로필 탭으로 통합 — 알림·화면·로그아웃을 아래에 노출, 설정 탭 삭제. */}
      <SectionLabel>{S.sections.notification}</SectionLabel>
      <div
        style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <Row
          icon={<IconBell />}
          title="푸시 알림"
          subtitle="알림 수신 여부"
          right={
            <Toggle
              on={notifSettings.pushEnabled}
              onChange={togglePush}
              label="푸시 알림 수신 여부"
            />
          }
        />
        <Row
          icon={<IconBell />}
          title={S.items.notification.label}
          subtitle="카테고리별 수신 설정"
          onClick={() => navigate("/notification-settings")}
        />
      </div>

      <SectionLabel>{S.sections.display}</SectionLabel>
      <div
        style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <Row
          icon={<IconTheme />}
          title={S.items.theme.label}
          subtitle={S.items.theme.sub}
          onClick={() => navigate("/settings/theme")}
        />
        <Row
          icon={<IconAccessibility />}
          title={S.items.accessibility.label}
          subtitle={S.items.accessibility.sub}
          onClick={() => navigate("/settings/accessibility")}
        />
      </div>

      {/* [제거 2026-06-17] '보안'(보안 설정·차단 목록) · '개인정보'(개인정보 관리) 섹션 삭제 (사용자 직접 지시) */}

      {/* Footer — 로그아웃 + 앱 버전 (settings 페이지에서 통합) */}
      <div
        style={{
          padding: "24px 20px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <button
          type="button"
          onClick={() => setIsLogoutOpen(true)}
          disabled={isLoggingOut}
          aria-label={MESSAGES.common.logoutConfirmButton}
          className="h-12 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 text-card-body font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700/50 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-puck disabled:opacity-50"
        >
          <Icon name="logout" className="text-[16px]" aria-hidden="true" />
          {isLoggingOut
            ? S.footer.logoutInProgress
            : MESSAGES.common.logoutConfirmTitle}
        </button>
        <p className="text-center text-card-meta tabular-nums text-wtext-4 dark:text-rink-300 font-num">
          {versionLabel}
        </p>
      </div>
    </div>
  );

  return (
    <MobileContainer hasBottomNav>
      <WalletScreen
        tabs={[
          { id: "profile", label: "프로필" },
        ]}
        initialTab="profile"
        tabContents={{
          profile: profileTab,
        }}
        appBar={{
          forceNative: true,
          title: MESSAGES.wallet.appBar.titleMy,
          timelineBadge: unreadCount > 0 ? unreadCount : undefined,
          onSearch: () => navigate("/search"),
          onTimeline: () => navigate("/timeline"),
          onMy: () => navigate("/notifications"),
          onMenu: openMenu,
        }}
        floating={false}
      />
      <GlobalMenu isOpen={isMenuOpen} onClose={closeMenu} />
      <ConfirmDialog
        isOpen={isLogoutOpen}
        options={{
          title: MESSAGES.common.logoutConfirmTitle,
          message: MESSAGES.common.logoutConfirmMessage,
          confirmText: MESSAGES.common.logoutConfirmButton,
          cancelText: MESSAGES.common.cancel,
          variant: "warning",
          icon: "logout",
        }}
        onConfirm={() => {
          setIsLogoutOpen(false);
          void handleLogout();
        }}
        onCancel={() => setIsLogoutOpen(false)}
      />
    </MobileContainer>
  );
}
