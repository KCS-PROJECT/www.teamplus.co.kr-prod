/**
 * 수업 분류 단일 SoT (Source of Truth).
 *
 * 두 차원의 분류를 한 파일에 응집한다:
 *  1) 상위 분류 (3개) — 탭 · 캘린더 · 대시보드에서 사용
 *  2) 세부 형태 (7개) — 폼 · 카드 배지 · 라벨에서 사용
 *
 * 원칙:
 *  - 다른 곳에서 분류값을 새로 정의하지 않는다 (하드코딩 금지).
 *  - className 문자열로 분류를 추측하지 않는다 (휴리스틱 금지).
 *  - 모든 곳이 이 파일에서만 import 한다.
 *
 * 외래키 기반 분류:
 *  - regular     → Class.teamId IS NOT NULL && Class.academyId IS NULL
 *  - open        → Class.academyId IS NOT NULL
 *  - tournament  → Tournament 모델 (별 도메인)
 */

import { MESSAGES } from '@/lib/messages';

// ─── 상위 분류 (탭 · 캘린더) ────────────────────────────────────────

export type ClassCategoryCode = 'regular' | 'open' | 'tournament';

export interface ClassCategoryDef {
  code: ClassCategoryCode;
  /** 정식 라벨 (탭 · 페이지 헤더) */
  label: string;
  /** 짧은 라벨 (캘린더 좁은 영역 등) */
  shortLabel: string;
  /** Material Symbols 아이콘 */
  icon: string;
  /** 색상 토큰 — DESIGN.md 솔리드 컬러 원칙 준수 (gradient/blur/colored shadow 금지) */
  color: {
    /** SVG dot 등에 사용되는 hex */
    dot: string;
    /** Tailwind 배경 (light + dark) */
    bg: string;
    /** Tailwind 텍스트 */
    text: string;
    /** 강조 텍스트 */
    accent: string;
    /** 솔리드 배경 (filled 카드용) */
    solidBg: string;
  };
  /** 데이터 출처 API */
  apiSource: 'classes' | 'tournaments';
  /** 설명 (Swagger · 운영자 안내용) */
  description: string;
}

export const CLASS_CATEGORIES: Record<ClassCategoryCode, ClassCategoryDef> = {
  regular: {
    code: 'regular',
    label: '정규훈련',
    shortLabel: '정규',
    icon: 'sports_hockey',
    color: {
      dot: '#10B981',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      accent: 'text-emerald-600 dark:text-emerald-400',
      solidBg: 'bg-emerald-500',
    },
    apiSource: 'classes',
    description: '클럽이 운영하는 정기 수업 (소속 회원 대상)',
  },
  open: {
    code: 'open',
    label: '오픈클래스',
    shortLabel: '오픈',
    icon: 'school',
    color: {
      dot: '#3B82F6',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      text: 'text-blue-700 dark:text-blue-400',
      accent: 'text-blue-600 dark:text-blue-400',
      solidBg: 'bg-blue-500',
    },
    apiSource: 'classes',
    description: '오픈클래스 감독이 운영하는 수업 (소속 무관, 자유 신청)',
  },
  tournament: {
    code: 'tournament',
    label: '대회',
    shortLabel: '대회',
    icon: 'emoji_events',
    color: {
      dot: '#EF4444',
      bg: 'bg-red-50 dark:bg-red-950/30',
      text: 'text-red-700 dark:text-red-400',
      accent: 'text-red-600 dark:text-red-400',
      solidBg: 'bg-red-500',
    },
    apiSource: 'tournaments',
    description: '대회 (Tournament 모델 — 별 API)',
  },
} as const;

/** 탭 등에서 순회용 */
export const CLASS_CATEGORY_LIST: readonly ClassCategoryDef[] =
  Object.values(CLASS_CATEGORIES);

// ─── 분류 함수 (휴리스틱 대체) ──────────────────────────────────────

export interface ClassifiableItem {
  teamId?: string | null;
  academyId?: string | null;
}

/**
 * Class 레코드를 상위 분류로 매핑한다.
 *  - academyId 가 있으면 'open'
 *  - 그 외에는 'regular'
 *
 * 'tournament' 는 Tournament 모델(별 API)이므로 이 함수 대상이 아님.
 */
export function classifyClass(item: ClassifiableItem): 'regular' | 'open' {
  return item.academyId ? 'open' : 'regular';
}

export function getCategoryDef(code: ClassCategoryCode): ClassCategoryDef {
  return CLASS_CATEGORIES[code];
}

// ─── 세부 형태 (폼 · 카드 배지) ─────────────────────────────────────
// classes 도메인의 학부모용 카테고리.
//   - regular: 팀 정기 수업 (teamId 기반)
//   - lesson:  오픈클래스 레슨 (academyId 기반)
// ※ training 도메인(REGULAR_TRAINING/GAME/FUN/CAMP/PICKUP)은 @/hooks/useTraining 별도 SoT.

// [2026-06-25 용어통일] 카테고리 칩 라벨 = '정규훈련' (수업→훈련 통일). 카드 배지는
// TRAINING_TYPE_LABEL 에서 '정규' 2글자로 별도 통일한다(아래).
// 이 옵션은 (director/parent) 수업 목록 카테고리 칩에서 사용된다.
export const TRAINING_TYPE_OPTIONS = [
  { value: 'regular', label: '정규훈련' },
  // [2026-06-19] 'lesson' 표기를 '오픈클래스'로 통일 — 카테고리 정의·섹션 헤더·감독 화면과 일치.
  { value: 'lesson', label: '오픈클래스' },
] as const;

export type TrainingType = (typeof TRAINING_TYPE_OPTIONS)[number]['value'];

// 라벨 매핑 — 신규 3종 + 'tournament'(대회 어댑팅 키) + 하위 호환 (deprecated).
export const TRAINING_TYPE_LABEL: Record<string, string> = {
  ...Object.fromEntries(TRAINING_TYPE_OPTIONS.map((o) => [o.value, o.label])),
  // 카드 배지는 분류 라벨을 짧게 통일 — 정규 계열은 '정규', 오픈 계열은 '오픈'으로 override
  // (칩/상위분류 풀 라벨은 유지). trainingType 코드값과 무관하게 배지 문구를 단일화한다.
  regular: '정규',
  lesson: '오픈',
  tournament: '대회',
  // 하위 호환 (deprecated, 2026-05-11) — 과거 데이터/training 도메인 응답 표시용
  regular_training: '정규',
  regular_class: '정규',
  group_class: '정규',
  game: '정규',
  fun: '정규',
  camp: '정규',
  academy_lesson: '오픈',
  game_lesson: '오픈',
};

/**
 * 세부 형태별 카드 아이콘. 신규 3종 + 하위 호환 키.
 */
export const TRAINING_TYPE_ICON: Record<string, string> = {
  regular: 'fitness_center',
  lesson: 'sports',
  // 대회 — Tournament 응답을 ClassItem 으로 어댑팅할 때 trainingType='tournament' 부여.
  tournament: 'emoji_events',
  // 하위 호환 (deprecated)
  regular_training: 'fitness_center',
  regular_class: 'fitness_center',
  group_class: 'fitness_center',
  game: 'fitness_center',
  fun: 'fitness_center',
  camp: 'fitness_center',
  academy_lesson: 'sports',
  game_lesson: 'sports',
};

/**
 * 세부 형태별 배지 색상 (awards/AwardListCard 패턴 — bg-100 + text-700).
 * 솔리드 컬러만 사용, gradient/blur/colored shadow 금지.
 */
export const TRAINING_TYPE_BADGE_CLASS: Record<string, string> = {
  regular:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  lesson: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  tournament:
    'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  // 하위 호환 (deprecated)
  regular_training:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  regular_class:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  group_class:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  game: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  fun: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  camp: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  academy_lesson:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  game_lesson:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
};

export function getTrainingTypeIcon(type?: string | null): string {
  return (type && TRAINING_TYPE_ICON[type]) ?? 'sports_hockey';
}

/**
 * 목록 카드에서 유형 배지를 숨길지 여부.
 * 정규수업(regular)·오픈클래스(lesson 계열)·대회(tournament)는 페이지·카테고리에서 이미 분류가
 * 드러나므로 배지를 생략하고, '정규훈련'(training 도메인) 계열만 분류 식별을 위해 배지를 유지한다.
 */
export function shouldHideTypeBadge(type?: string | null): boolean {
  const t = String(type ?? '').toLowerCase();
  return ['regular', 'lesson', 'academy_lesson', 'game_lesson', 'tournament'].includes(t);
}

export function getTrainingTypeBadgeClass(type?: string | null): string {
  return (
    (type && TRAINING_TYPE_BADGE_CLASS[type]) ??
    'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
  );
}

// ─── 요일별 시간·장소 (ClassDaySchedule) 표시 SoT ───────────────────
// 백엔드 상세/목록 응답의 daySchedules: [{ dayOfWeek, startTime("HH:mm"), endTime, venueId, venueName }].
// 규칙 없으면 [] → 호출부는 단일 startTime/endTime 폴백을 사용한다.

/** 표시용 요일별 규칙 1건. startTime/endTime 은 "HH:mm" 문자열. */
export interface DaySchedule {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  venueId?: string | null;
  venueName?: string | null;
}

// 한글 요일 정렬 우선순위 (월=0 … 일=6). DAY_OPTIONS(월→일) 컨벤션과 동일 SoT.
const DAY_ORDER_KR: Record<string, number> = {
  월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6,
};

/**
 * 요일별 규칙을 월→일 순으로 정렬한 새 배열을 반환 (원본 불변).
 * dayOfWeek 만 요구하는 제네릭 — DaySchedule(표시용)·DayScheduleItem(폼용) 양쪽 호환 SoT.
 */
export function sortDaySchedules<T extends { dayOfWeek: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (DAY_ORDER_KR[a.dayOfWeek] ?? 99) - (DAY_ORDER_KR[b.dayOfWeek] ?? 99),
  );
}

/** 시간 구분자 통일 — "17:00 ~ 18:00". endTime 없으면 startTime 만. */
function formatHHmmRange(startTime?: string, endTime?: string): string {
  const s = (startTime ?? '').trim();
  const e = (endTime ?? '').trim();
  if (s && e) return `${s} ~ ${e}`;
  return s || e || '';
}

/** 요일 집합 압축 라벨 — 7일="매일" · 평일 5일="평일" · 토+일="주말" · 그 외 "월·수·금". */
function compressDayLabel(days: string[]): string {
  if (days.length === 7) return '매일';
  const WEEKDAYS_KR = ['월', '화', '수', '목', '금'];
  if (days.length === 5 && WEEKDAYS_KR.every((d) => days.includes(d)))
    return '평일';
  if (days.length === 2 && days.includes('토') && days.includes('일'))
    return '주말';
  return days.join('·');
}

/**
 * 목록·요약용 — 카드 1줄에 맞춘 압축 표기.
 *  - 모든 요일의 시간이 동일: "월·수·금 17:00 ~ 18:00" (평일/주말/매일 압축 포함)
 *  - 요일별 시간 상이: "매주 월·수·금 · 시간 상이" — 전체 나열은 카드에서 잘려
 *    오독을 유발하므로 요일 + 보조 표기만, 정확한 요일별 시간은
 *    상세(formatDaySchedulesFull)가 담당한다.
 * 빈 배열이면 null → 호출부 폴백.
 */
export function formatDaySchedulesShort(
  items?: DaySchedule[] | null,
): string | null {
  if (!items || items.length === 0) return null;
  const sorted = sortDaySchedules(items);
  const dayLabel = compressDayLabel(sorted.map((d) => d.dayOfWeek));
  const uniform = sorted.every(
    (d) =>
      d.startTime === sorted[0].startTime && d.endTime === sorted[0].endTime,
  );
  const time = uniform
    ? formatHHmmRange(sorted[0].startTime, sorted[0].endTime)
    : '';
  if (time) return `${dayLabel} ${time}`;
  const isSpecial =
    dayLabel === '매일' || dayLabel === '평일' || dayLabel === '주말';
  const base = isSpecial ? dayLabel : `매주 ${dayLabel}`;
  // 시간 미입력(드묾)과 구분 — 상이한 경우에만 보조 표기.
  return uniform ? base : `${base} · ${MESSAGES.class.timeVaries}`;
}

/**
 * 상세용 — "월 17:00 ~ 18:00 A링크장 / 수 19:00 ~ 20:00 B링크장" (장소 포함).
 * 장소(venueName)가 있으면 시간 뒤에 덧붙인다. 빈 배열이면 null → 호출부 폴백.
 */
export function formatDaySchedulesFull(
  items?: DaySchedule[] | null,
): string | null {
  if (!items || items.length === 0) return null;
  return sortDaySchedules(items)
    .map((d) => {
      const base = `${d.dayOfWeek} ${formatHHmmRange(d.startTime, d.endTime)}`.trim();
      return d.venueName ? `${base} ${d.venueName}` : base;
    })
    .join(' / ');
}

// JS Date.getDay() (일=0…토=6) → 한글 요일.
const JS_DOW_TO_KR = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 다음 회차 정보 — 백엔드 nextSchedule 응답(비취소·오늘 이후 첫 회차) 계약. */
export interface NextScheduleInfo {
  scheduledDate: string;
  startTime?: string | null;
  endTime?: string | null;
}

/**
 * 다음 회차 라벨 — "7/8 (화) 19:00 ~ 20:00" | 회차 시간 없으면 "7/8 (화)".
 * scheduledDate 는 @db.Date(UTC 자정) 저장이라 getUTC* 로 추출해야 KST 달력일과 일치.
 */
export function formatNextScheduleLabel(
  next?: NextScheduleInfo | null,
): string | null {
  if (!next?.scheduledDate) return null;
  const d = new Date(next.scheduledDate);
  if (Number.isNaN(d.getTime())) return null;
  const dateLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${JS_DOW_TO_KR[d.getUTCDay()]})`;
  const time = formatHHmmRange(next.startTime ?? undefined, next.endTime ?? undefined);
  return time ? `${dateLabel} ${time}` : dateLabel;
}

/** "총 N회" 접미부 — totalCount 유효할 때만 " · 총 N회" 반환. */
function totalSuffix(totalCount?: number | null): string {
  return typeof totalCount === 'number' && totalCount > 0
    ? ` · ${MESSAGES.class.totalSessionsLabel(totalCount)}`
    : '';
}

/**
 * 다음 회차 요약 — "다음 7/8 (화) 19:00 ~ 20:00 · 총 12회".
 * "다음" 접두어와 총 회차 수로 이 날짜가 유일한 일정이 아님을 명시한다(단회 오독 방지).
 * totalCount 가 없으면 "다음 …" 만, next 가 없으면 null.
 */
export function formatNextScheduleSummary(
  next?: NextScheduleInfo | null,
  totalCount?: number | null,
): string | null {
  const label = formatNextScheduleLabel(next);
  if (!label) return null;
  return `${MESSAGES.class.nextScheduleLabel} ${label}${totalSuffix(totalCount)}`;
}

/**
 * 운영 기간 요약 — "5/7 ~ 7/1 · 총 12회" (단일 날짜면 "5/7 · 총 1회").
 * 다음 회차가 없는(종료된) 수업의 카드 라벨. 특정 회차 시각 대신 기간으로 요약한다.
 * 날짜는 @db.Date(UTC 자정) ISO — getUTC* 로 추출해야 KST 달력일과 일치.
 * 연도가 다르면 "25.12.30 ~ 26.1.5" 형태로 연도를 병기한다.
 */
export function formatPeriodSummary(
  firstIso?: string | null,
  lastIso?: string | null,
  totalCount?: number | null,
): string | null {
  if (!firstIso) return null;
  const first = new Date(firstIso);
  if (Number.isNaN(first.getTime())) return null;
  const last = lastIso ? new Date(lastIso) : first;
  const lastValid = Number.isNaN(last.getTime()) ? first : last;
  const sameYear = first.getUTCFullYear() === lastValid.getUTCFullYear();
  const md = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  const ymd = (d: Date) =>
    `${String(d.getUTCFullYear()).slice(2)}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
  const fmt = sameYear ? md : ymd;
  const sameDay =
    first.getUTCFullYear() === lastValid.getUTCFullYear() &&
    first.getUTCMonth() === lastValid.getUTCMonth() &&
    first.getUTCDate() === lastValid.getUTCDate();
  const range = sameDay ? fmt(first) : `${fmt(first)} ~ ${fmt(lastValid)}`;
  return `${range}${totalSuffix(totalCount)}`;
}

/**
 * 수업/훈련 카드 시간 표시 SoT —
 *   요일별 기본 일정 패턴 > 다음 회차 요약("다음 … · 총 N회") > 운영 기간("첫 ~ 마지막 · 총 N회") > null.
 * 대표값(Class.startTime)은 회차별 실제 시각과 다를 수 있어(요일별 상이·등록시각 폴백)
 * 표시 소스로 사용하지 않는다. null 이면 호출부가 시간 표기를 생략한다.
 */
export function formatClassScheduleDisplay(opts: {
  daySchedules?: DaySchedule[] | null;
  nextSchedule?: NextScheduleInfo | null;
  /** 비취소 총 회차 수 — "총 N회" 표기용 (없으면 생략). */
  totalScheduleCount?: number | null;
  /** 첫/마지막 비취소 회차 날짜(ISO) — 다음 회차가 없는 종료 수업의 기간 표기용. */
  firstScheduleDate?: string | null;
  lastScheduleDate?: string | null;
}): string | null {
  return (
    formatDaySchedulesShort(opts.daySchedules) ??
    formatNextScheduleSummary(opts.nextSchedule, opts.totalScheduleCount) ??
    formatPeriodSummary(
      opts.firstScheduleDate,
      opts.lastScheduleDate,
      opts.totalScheduleCount,
    )
  );
}

/**
 * 특정 날짜의 요일에 해당하는 요일별 규칙을 찾아 반환.
 * 캘린더 회차에서 "그 날짜 요일의 시각"을 표시할 때 사용. 매칭 규칙 없으면 null → 폴백.
 */
export function getDayScheduleForDate(
  items: DaySchedule[] | null | undefined,
  date: Date | string,
): DaySchedule | null {
  if (!items || items.length === 0) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const kr = JS_DOW_TO_KR[d.getDay()];
  return items.find((s) => s.dayOfWeek === kr) ?? null;
}
