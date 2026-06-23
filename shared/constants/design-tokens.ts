/**
 * TEAMPLUS 공통 디자인 토큰
 *
 * 모든 프론트엔드 프로젝트(Web, Admin)의 컬러/스타일 기준값입니다.
 * Tailwind config에서 이 값을 참조하여 일관성을 유지합니다.
 *
 * Source of Truth: docs/Design/WEB_DESIGN_SYSTEM.md
 */

// ==================== 브랜드 컬러 ====================

export const COLORS = {
  primary: {
    DEFAULT: "#1E3FAE",
    dark: "#152B7A",
    light: "#60A5FA",
  },
  success: "#16A34A",
  warning: "#EAB308",
  error: "#DC2626",
  info: "#0284C7",
} as const;

// ==================== CSS 변수명 (HSL 기반) ====================
// Tailwind config에서 hsl(var(--ice-primary)) 형태로 사용

export const CSS_VARS = {
  // 시맨틱 컬러
  primary: "--ice-primary",
  primaryDark: "--ice-primary-dark",
  primaryLight: "--ice-primary-light",
  success: "--ice-success",
  warning: "--ice-warning",
  error: "--ice-error",
  info: "--ice-info",

  // 뉴트럴 (frost/neutral 통일 → neutral)
  neutral50: "--ice-slate-50",
  neutral100: "--ice-slate-100",
  neutral200: "--ice-slate-200",
  neutral300: "--ice-slate-300",
  neutral400: "--ice-slate-400",
  neutral500: "--ice-slate-500",
  neutral600: "--ice-slate-600",
  neutral700: "--ice-slate-700",
  neutral800: "--ice-slate-800",
  neutral900: "--ice-slate-900",
  neutral950: "--ice-slate-950",

  // 시맨틱 표면
  background: "--color-background",
  surface: "--color-surface",
  surfaceHover: "--color-surface-hover",
  border: "--color-border",
  textPrimary: "--color-text-primary",
  textSecondary: "--color-text-secondary",
  textTertiary: "--color-text-tertiary",
} as const;

// ==================== 그림자 (AI 스타일 금지) ====================

export const SHADOWS = {
  card: "0 1px 3px rgba(0, 0, 0, 0.08)",
  cardHover: "0 4px 12px rgba(0, 0, 0, 0.1)",
  nav: "0 -1px 0 rgba(0, 0, 0, 0.05)",
} as const;

// ==================== 접근성 ====================

export const ACCESSIBILITY = {
  /** 일반 UI 최소 터치 타겟 (WCAG AA) */
  minTouchTarget: 48,
  /** 아동 UI 최소 터치 타겟 (WCAG AAA) */
  childTouchTarget: 72,
  /** 일반 대비율 (WCAG AA) */
  contrastRatioAA: 4.5,
  /** 아동 대비율 (WCAG AAA) */
  contrastRatioAAA: 7,
} as const;

// ==================== 다크 모드 ====================

export const DARK_MODE = {
  /** 전략: Tailwind class + 쿠키 */
  strategy: "class" as const,
  /** 쿠키명 */
  cookieName: "teamplus_theme",
  /** 기본값 */
  defaultTheme: "light" as const,
} as const;
