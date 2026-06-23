/**
 * TEAMPLUS 공통 색상 상수
 *
 * === Design 7 Principles ===
 * 1. 모든 페이지에서 일관된 색상 사용
 * 2. 휴먼 디자인: gradient, blur 미사용
 * 3. Dark mode 지원
 */

// ============================================
// Primary Colors (Ice Blue)
// ============================================

export const PRIMARY = {
  DEFAULT: '#1E40AF',
  HOVER: '#1E3A8A',
  LIGHT: '#DBEAFE',
  DARK: '#1E3A8A',
} as const;

// ============================================
// Status Badge Colors
// ============================================

export const STATUS_COLORS = {
  // 승인/완료/성공
  approved: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-200 dark:border-green-700',
    full: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700',
  },
  completed: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-200 dark:border-green-700',
    full: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-200 dark:border-green-700',
    full: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700',
  },

  // 대기/보류
  pending: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-700',
    full: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-700',
    full: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700',
  },

  // 거절/실패/에러
  rejected: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-700',
    full: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700',
  },
  failed: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-700',
    full: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-700',
    full: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700',
  },

  // 환불/취소
  refunded: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-primary-light',
    border: 'border-blue-200 dark:border-blue-700',
    full: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-primary-light border-blue-200 dark:border-blue-700',
  },
  cancelled: {
    bg: 'bg-slate-50 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-700',
    full: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  },

  // 정보/기본
  info: {
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    text: 'text-cyan-700 dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-700',
    full: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-700',
  },
  default: {
    bg: 'bg-slate-50 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-700',
    full: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  },
} as const;

// ============================================
// Action Button Colors (Icon Buttons)
// ============================================

export const ACTION_COLORS = {
  // 보기/수정
  view: {
    hover: 'hover:bg-blue-50 dark:hover:bg-blue-900/30',
    text: 'text-blue-600 dark:text-primary-light',
    full: 'hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-primary-light',
  },
  edit: {
    hover: 'hover:bg-blue-50 dark:hover:bg-blue-900/30',
    text: 'text-blue-600 dark:text-primary-light',
    full: 'hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-primary-light',
  },

  // 승인
  approve: {
    hover: 'hover:bg-green-50 dark:hover:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
    full: 'hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400',
  },

  // 삭제/거절
  delete: {
    hover: 'hover:bg-red-50 dark:hover:bg-red-900/30',
    text: 'text-red-600 dark:text-red-400',
    full: 'hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400',
  },
  reject: {
    hover: 'hover:bg-red-50 dark:hover:bg-red-900/30',
    text: 'text-red-600 dark:text-red-400',
    full: 'hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400',
  },

  // 추가
  add: {
    hover: 'hover:bg-cyan-50 dark:hover:bg-cyan-900/30',
    text: 'text-cyan-600 dark:text-cyan-400',
    full: 'hover:bg-cyan-50 dark:hover:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
  },

  // 연락/메시지
  contact: {
    hover: 'hover:bg-violet-50 dark:hover:bg-violet-900/30',
    text: 'text-violet-600 dark:text-violet-400',
    full: 'hover:bg-violet-50 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400',
  },

  // 기본/중립
  default: {
    hover: 'hover:bg-slate-100 dark:hover:bg-slate-700',
    text: 'text-slate-600 dark:text-slate-400',
    full: 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400',
  },
} as const;

// ============================================
// 타입 정의
// ============================================

export type StatusType = keyof typeof STATUS_COLORS;
export type ActionType = keyof typeof ACTION_COLORS;

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 상태에 따른 배지 스타일 반환
 */
export function getStatusStyle(status: string): string {
  const normalizedStatus = status.toLowerCase() as StatusType;
  return STATUS_COLORS[normalizedStatus]?.full || STATUS_COLORS.default.full;
}

/**
 * 액션 타입에 따른 버튼 스타일 반환
 */
export function getActionStyle(action: string): string {
  const normalizedAction = action.toLowerCase() as ActionType;
  return ACTION_COLORS[normalizedAction]?.full || ACTION_COLORS.default.full;
}
