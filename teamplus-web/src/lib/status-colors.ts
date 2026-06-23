/**
 * Status 의미 색상 SoT (Single Source of Truth)
 *
 * 출석·결제·승인·알림 등 모든 도메인의 상태 표시에 사용되는 의미 색상을 단일 정의한다.
 * 각 화면이 `bg-green-100`, `text-red-700` 등을 직접 hardcode 하지 않고 이 파일에서
 * 가져다 써서 디자인 일관성을 보장한다.
 *
 * 사용 예:
 *   import { STATUS_BADGE_CLASS, STATUS_DOT_CLASS, type StatusVariant } from '@/lib/status-colors';
 *   const cls = STATUS_BADGE_CLASS[variant];
 */

export type StatusVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'primary';

/** 배지(rounded full pill)용 배경+텍스트 클래스 — dark 변형 포함 */
export const STATUS_BADGE_CLASS: Record<StatusVariant, string> = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  error:   'bg-red-100   text-red-700   dark:bg-red-900/20   dark:text-red-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  info:    'bg-blue-100  text-blue-700  dark:bg-blue-900/20  dark:text-blue-400',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
  primary: 'bg-primary/10 text-primary  dark:bg-primary/20   dark:text-primary',
};

/** 작은 점/dot 인디케이터 (h-2 w-2 rounded-full) */
export const STATUS_DOT_CLASS: Record<StatusVariant, string> = {
  success: 'bg-green-500',
  error:   'bg-red-500',
  warning: 'bg-amber-500',
  info:    'bg-blue-500',
  neutral: 'bg-slate-400',
  primary: 'bg-primary',
};

/** 차트/프로그레스 바 채우기용 단색 */
export const STATUS_BAR_CLASS: Record<StatusVariant, string> = {
  success: 'bg-green-500',
  error:   'bg-red-500',
  warning: 'bg-amber-500',
  info:    'bg-blue-500',
  neutral: 'bg-slate-400',
  primary: 'bg-primary',
};

/** 텍스트 강조 (예: 수치 라벨) */
export const STATUS_TEXT_CLASS: Record<StatusVariant, string> = {
  success: 'text-green-600 dark:text-green-400',
  error:   'text-red-600   dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  info:    'text-blue-600  dark:text-blue-400',
  neutral: 'text-slate-600 dark:text-slate-400',
  primary: 'text-primary',
};

/** 차트/그래프 hex (dot 시각 일관성용) */
export const STATUS_HEX: Record<StatusVariant, string> = {
  success: '#22C55E',
  error:   '#EF4444',
  warning: '#F59E0B',
  info:    '#3B82F6',
  neutral: '#94A3B8',
  primary: '#1E3FAE',
};
