/**
 * 캘린더 색상 코드 매핑
 * TEAMPLUS 수업/훈련/경기 유형별 캘린더 색상 시스템
 *
 * Design 7 Principles: 솔리드 컬러만 사용 (gradient 금지)
 */

export interface TrainingTypeColor {
  /** Tailwind 배경 클래스 */
  bg: string;
  /** HEX 색상값 (캘린더 dot에 사용) */
  dot: string;
  /** 한글 라벨 */
  label: string;
  /** 텍스트 색상 클래스 */
  text: string;
  /** 다크모드 배경 */
  darkBg: string;
}

/**
 * 대분류 훈련 유형 색상.
 *
 * [2026-05-08] 분류 SoT(class-categories.ts) 와 정합화.
 *  - REGULAR    → 정규 수업 (클럽 운영, 초록)
 *  - OPEN       → 오픈클래스 (오픈클래스 운영, 파랑)
 *  - TOURNAMENT → 대회 (Tournament 모델, 빨강)
 *
 * LESSON / GAME / EVENT / ACADEMY 키는 다른 모듈 호환을 위해 유지하되,
 * 캘린더 범례에는 더 이상 노출하지 않는다.
 */
export const TRAINING_TYPE_COLORS: Record<string, TrainingTypeColor> = {
  REGULAR: {
    bg: 'bg-emerald-500',
    dot: '#10B981',
    // [2026-06-25 용어통일] 일정/캘린더 배지·범례 = '정규' (카드 배지와 통일)
    label: '정규',
    text: 'text-emerald-700 dark:text-emerald-400',
    darkBg: 'dark:bg-emerald-600',
  },
  // [2026-05-11] classes 도메인 SoT 정합 키 (regular/lesson) —
  // class-categories.ts TRAINING_TYPE_OPTIONS 와 1:1 매핑.
  regular: {
    bg: 'bg-emerald-500',
    dot: '#10B981',
    label: '정규',
    text: 'text-emerald-700 dark:text-emerald-400',
    darkBg: 'dark:bg-emerald-600',
  },
  lesson: {
    bg: 'bg-blue-500',
    dot: '#3B82F6',
    label: '레슨',
    text: 'text-blue-700 dark:text-blue-400',
    darkBg: 'dark:bg-blue-600',
  },
  OPEN: {
    bg: 'bg-blue-500',
    dot: '#3B82F6',
    label: '오픈',
    text: 'text-blue-700 dark:text-blue-400',
    darkBg: 'dark:bg-blue-600',
  },
  TOURNAMENT: {
    bg: 'bg-red-500',
    dot: '#EF4444',
    label: '대회',
    text: 'text-red-700 dark:text-red-400',
    darkBg: 'dark:bg-red-600',
  },
  // ── 하위 호환 (deprecated, 다른 모듈에서 점진 정리) ──
  LESSON: {
    bg: 'bg-blue-500',
    dot: '#3B82F6',
    label: '레슨',
    text: 'text-blue-700 dark:text-blue-400',
    darkBg: 'dark:bg-blue-600',
  },
  GAME: {
    bg: 'bg-red-500',
    dot: '#EF4444',
    label: '대회',
    text: 'text-red-700 dark:text-red-400',
    darkBg: 'dark:bg-red-600',
  },
  EVENT: {
    bg: 'bg-amber-500',
    dot: '#F59E0B',
    label: '행사',
    text: 'text-amber-700 dark:text-amber-400',
    darkBg: 'dark:bg-amber-600',
  },
  ACADEMY: {
    bg: 'bg-violet-500',
    dot: '#8B5CF6',
    label: '오픈',
    text: 'text-violet-700 dark:text-violet-400',
    darkBg: 'dark:bg-violet-600',
  },
} as const;

/** 세부 훈련 유형 색상 */
export const TRAINING_SUBTYPE_COLORS: Record<string, TrainingTypeColor> = {
  PRIVATE_LESSON: {
    bg: 'bg-blue-400',
    dot: '#60A5FA',
    label: '개인레슨',
    text: 'text-blue-600 dark:text-blue-400',
    darkBg: 'dark:bg-blue-500',
  },
  GROUP_LESSON: {
    bg: 'bg-blue-600',
    dot: '#2563EB',
    label: '그룹레슨',
    text: 'text-blue-800 dark:text-blue-300',
    darkBg: 'dark:bg-blue-700',
  },
  REGULAR_TRAINING: {
    bg: 'bg-emerald-600',
    dot: '#059669',
    label: '정규',
    text: 'text-emerald-800 dark:text-emerald-300',
    darkBg: 'dark:bg-emerald-700',
  },
  FUN: {
    bg: 'bg-amber-400',
    dot: '#FBBF24',
    label: '펀하키',
    text: 'text-amber-600 dark:text-amber-400',
    darkBg: 'dark:bg-amber-500',
  },
  CAMP: {
    bg: 'bg-orange-500',
    dot: '#F97316',
    label: '캠프',
    text: 'text-orange-700 dark:text-orange-400',
    darkBg: 'dark:bg-orange-600',
  },
  PICKUP: {
    bg: 'bg-red-400',
    dot: '#F87171',
    label: '픽업게임',
    text: 'text-red-600 dark:text-red-400',
    darkBg: 'dark:bg-red-500',
  },
  ACADEMY_LESSON: {
    bg: 'bg-violet-500',
    dot: '#8B5CF6',
    label: '오픈클래스 레슨',
    text: 'text-violet-700 dark:text-violet-400',
    darkBg: 'dark:bg-violet-600',
  },
  GAME_LESSON: {
    bg: 'bg-violet-600',
    dot: '#7C3AED',
    label: '게임 레슨',
    text: 'text-violet-800 dark:text-violet-300',
    darkBg: 'dark:bg-violet-700',
  },
} as const;

/** 모든 훈련 유형 색상 (대분류 + 세부) */
export const ALL_TRAINING_COLORS: Record<string, TrainingTypeColor> = {
  ...TRAINING_TYPE_COLORS,
  ...TRAINING_SUBTYPE_COLORS,
} as const;

/**
 * 훈련 유형으로 색상 정보 조회
 * @param type 훈련 유형 키
 * @returns 색상 정보 (없으면 기본 슬레이트 색상)
 */
export function getTrainingColor(type: string): TrainingTypeColor {
  return ALL_TRAINING_COLORS[type] ?? {
    bg: 'bg-slate-400',
    dot: '#94A3B8',
    label: type,
    text: 'text-slate-600 dark:text-slate-400',
    darkBg: 'dark:bg-slate-500',
  };
}

/** 캘린더 범례 표시용 대분류 목록 — 정규/오픈/대회 3분류. */
const LEGEND_VISIBLE_KEYS: ReadonlyArray<keyof typeof TRAINING_TYPE_COLORS> = [
  'REGULAR',
  'OPEN',
  'TOURNAMENT',
];
export const CALENDAR_LEGEND = LEGEND_VISIBLE_KEYS.map((key) => ({
  key,
  ...TRAINING_TYPE_COLORS[key],
}));

// [추가 2026-05-18] 오픈클래스 감독(ACADEMY_DIRECTOR) 전용 범례 — 학원과 팀은 독립
//   운영이므로 정규(팀 도메인) 노출 제거. /academy-schedules · /academy-director
//   두 화면에서 사용.
// [수정 2026-05-18] 오픈클래스는 대회/매치를 등록하지 않음 (사용자 명시) — TOURNAMENT 제거.
//   최종: OPEN 단일 범례.
const ACADEMY_LEGEND_VISIBLE_KEYS: ReadonlyArray<keyof typeof TRAINING_TYPE_COLORS> = [
  'OPEN',
];
export const ACADEMY_CALENDAR_LEGEND = ACADEMY_LEGEND_VISIBLE_KEYS.map((key) => ({
  key,
  ...TRAINING_TYPE_COLORS[key],
}));

// 팀 도메인 전용 범례 — 코치·감독 일정 화면. OPEN 제외 (팀↔오픈 도메인 분리).
//   부모/자녀(useCalendar 'my') 는 결제한 오픈클래스 시야가 필요하므로 기본 'team' 4분류 유지.
const TEAM_ONLY_LEGEND_VISIBLE_KEYS: ReadonlyArray<keyof typeof TRAINING_TYPE_COLORS> = [
  'REGULAR',
  'TOURNAMENT',
];
export const TEAM_ONLY_CALENDAR_LEGEND = TEAM_ONLY_LEGEND_VISIBLE_KEYS.map((key) => ({
  key,
  ...TRAINING_TYPE_COLORS[key],
}));

/** Alias for compatibility */
export const getCalendarEventColor = getTrainingColor;
export const CALENDAR_EVENT_LEGEND = CALENDAR_LEGEND;

// =============================================================================
// Subtle Variant (배경 = 50, 텍스트 = 600, dark 변형)
// schedule/calendar 카드 톤에서 filled-500 대신 사용. Status SoT 와 동일 패턴.
// =============================================================================

export interface TrainingSubtleColor {
  /** 배경 (예: bg-blue-50 dark:bg-blue-950/30) */
  bg: string;
  /** 텍스트 강조 (예: text-blue-600 dark:text-blue-400) */
  accent: string;
  /** 라벨 한글 */
  label: string;
  /** 아이콘 (Material Symbols) */
  icon?: string;
}

/**
 * 일정 카드 등에서 사용하는 subtle 톤 매핑.
 * `(student)/schedule`, `(student)/calendar`, `(parent)/parent-calendar` 등에서 사용.
 * — bg/text 와 dark 변형이 한 줄로 SoT 됨.
 */
export const TRAINING_SUBTLE_COLORS: Record<string, TrainingSubtleColor> = {
  LESSON:   { bg: 'bg-blue-50 dark:bg-blue-950/30',       accent: 'text-blue-600 dark:text-blue-400',       label: '수업',     icon: 'sports_hockey' },
  TRAINING: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', accent: 'text-emerald-600 dark:text-emerald-400', label: '훈련',     icon: 'fitness_center' },
  GAME:     { bg: 'bg-red-50 dark:bg-red-950/30',         accent: 'text-red-600 dark:text-red-400',         label: '경기',     icon: 'sports' },
  EVENT:    { bg: 'bg-amber-50 dark:bg-amber-950/30',     accent: 'text-amber-600 dark:text-amber-400',     label: '행사',     icon: 'celebration' },
  FUN:      { bg: 'bg-orange-50 dark:bg-orange-950/30',   accent: 'text-orange-600 dark:text-orange-400',   label: '펀하키',   icon: 'celebration' },
  CAMP:     { bg: 'bg-amber-50 dark:bg-amber-950/30',     accent: 'text-amber-600 dark:text-amber-400',     label: '캠프',     icon: 'local_fire_department' },
  PICKUP:   { bg: 'bg-purple-50 dark:bg-purple-950/30',   accent: 'text-purple-600 dark:text-purple-400',   label: '픽업',     icon: 'group_add' },
  ACADEMY:  { bg: 'bg-violet-50 dark:bg-violet-950/30',   accent: 'text-violet-600 dark:text-violet-400',   label: '오픈', icon: 'school' },
} as const;

const SUBTLE_FALLBACK: TrainingSubtleColor = {
  bg: 'bg-slate-50 dark:bg-slate-800',
  accent: 'text-slate-600 dark:text-slate-400',
  label: '기타',
};

/** subtle 톤 안전 조회 (알 수 없는 키 → fallback) */
export function getTrainingSubtle(type: string): TrainingSubtleColor {
  return TRAINING_SUBTLE_COLORS[type] ?? SUBTLE_FALLBACK;
}
