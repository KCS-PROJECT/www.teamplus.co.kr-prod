"use client";

import {
  memo,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { SubmainAppBar } from "@/components/layout/SubmainAppBar";
import { NavLink, useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { ChildCard } from "@/components/child/ChildCard";
import { ClassListCard, ClassCardInfoRow } from "@/components/classes/ClassListCard";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { useNativeUI } from "@/hooks/useNativeUI";
import { usePageReady } from "@/hooks/usePageReady";
import { MESSAGES, subjectParticle } from "@/lib/messages";
import {
  CLASS_CATEGORIES,
  TRAINING_TYPE_LABEL,
  getTrainingTypeBadgeClass,
  getTrainingTypeIcon,
  shouldHideTypeBadge,
  formatDaySchedulesShort,
  type ClassCategoryCode,
  type DaySchedule,
} from "@/lib/class-categories";
import { api } from "@/services/api-client";
import {
  listTournaments,
  type TournamentListItem,
} from "@/services/tournament.service";
import { cn } from "@/lib/utils";
import { isActiveEnrollment } from "@/lib/enrollment-visibility";

// ── Types ────────────────────────────────────────────

interface ClassItem {
  id: string;
  className: string;
  instructorName: string;
  trainingType: string;
  levelRequired?: string;
  ageMin?: number;
  ageMax?: number;
  /** [2026-06-19] 대상 출생연도 — 카드에 "2014, 2015년생" 표기용 */
  targetBirthYears?: number[] | null;
  capacity: number;
  enrolledCount: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  /** 백엔드 getAllClasses가 내려주는 flat clubId — 학부모 자녀 팀 필터에 사용 */
  clubId?: string;
  clubName?: string;
  club?: { id: string; clubName: string };
  /** 팀 프로필(로고) URL — 카드 좌측 아이콘에 표시. 없으면 기본 trainingType 아이콘 폴백. */
  teamLogoUrl?: string | null;
  /** 오픈클래스 소속 아카데미명 — 카드 제목 아래 subtitle 노출. 팀 수업은 null(미노출). */
  academyName?: string | null;
  classDays?: string[];
  /** [2026-06-05] 요일별 시간·장소 규칙 — 백엔드 목록 응답. 규칙 없으면 빈 배열. */
  daySchedules?: DaySchedule[];
  /** [2026-06-09] 오픈클래스 날짜별 일정(ISO) — 카드 일정 날짜 표시. */
  scheduledDates?: string[];
  /** [2026-06-10] 오픈클래스 카드 시간 라벨("HH:mm - HH:mm") — 첫 회차 실제 시각. */
  scheduleTimeLabel?: string | null;
  /** 정기권 가격 (원) — MONTHLY_FIXED 상품 price · PACKAGE_WEEKS_SPEC §6 응답 BC */
  monthlyPrice?: number | null;
  /** 회당 가격 (원) — PER_SESSION 상품 price · 1회권 가격 SoT */
  singlePrice?: number | null;
  /** 정기 패키지 주 수 (예: 4) · PACKAGE_WEEKS_SPEC §6 */
  packageWeeks?: number | null;
  /** 정기 패키지 주 빈도 (예: 3 = 주 3회) */
  packageSessionsPerWeek?: number | null;
  /** 정기 패키지 총 회수 (예: 12) */
  packageTotalSessions?: number | null;
  /** 월간 수강료 (원) — ref 07b 가격 표시용 optional 필드 (monthlyPrice 와 별개) */
  monthlyFee?: number | null;
  /** [추가 2026-05-15] 백엔드 응답의 products 배열 — monthlyFee 미존재 시 가격 추출용 */
  products?: Array<{ feeType?: string; price?: number | string }>;
  /** PACKAGE_END_GUARD (2026-05-22) — 수업 종료일 + 7일 초과 시 true.
   * 가격 영역을 "종료된 수업" 배지로 대체. 패키지만 비활성인 경우는 false 유지 */
  isClassEnded?: boolean;
  /** 수업 장소 (Venue 모델) */
  venue?: { id: string; name: string } | null;
}

// [수정 2026-05-15] mock fallback 제거 — 실제 가격이 없으면 0 으로 표시하고
//   UI 가 "가격 미정" 안내. mock 280,000 통일 표시로 인한 오해 방지.
const FALLBACK_MONTHLY_FEE = 0;

/**
 * [추가 2026-05-15] backend products 배열에서 수업목록 카드에 표시할 가격 추출.
 *  - MONTHLY_FIXED(정기 패키지) 우선
 *  - 없으면 PER_SESSION(1회 수강권) 가격
 *  - 둘 다 없으면 첫 product 의 price
 *  - 응답에 products 가 없거나 빈 배열이면 null 반환 → UI 에서 "가격 미정"
 */
function pickDisplayFee(
  products?: Array<{ feeType?: string; price?: number | string }>,
): number | null {
  if (!products || products.length === 0) return null;
  const toNum = (v: unknown): number | null => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const monthly = products.find((p) => p.feeType === 'MONTHLY_FIXED');
  if (monthly) return toNum(monthly.price);
  const session = products.find((p) => p.feeType === 'PER_SESSION');
  if (session) return toNum(session.price);
  return toNum(products[0]?.price);
}

/**
 * [추가 2026-05-26] 백엔드 수업 목록 응답(배열 또는 { data: [] } 래핑)을 정규화.
 *  - club.clubName 을 flat 한 clubName 으로 노출
 *  - products 에서 표시용 monthlyFee 추출 (MONTHLY_FIXED → PER_SESSION → 첫 product)
 *  '전체'·'정규/오픈' 탭 fetch 에서 공통 사용 (DRY).
 */
function normalizeClassList(
  data: ClassItem[] | { data: ClassItem[] } | undefined,
): ClassItem[] {
  const list = Array.isArray(data)
    ? data
    : (data as { data?: ClassItem[] } | undefined)?.data;
  if (!Array.isArray(list)) return [];
  return list.map((c) => ({
    ...c,
    clubName: c.clubName ?? c.club?.clubName,
    monthlyFee: c.monthlyFee ?? pickDisplayFee(c.products),
  }));
}

/**
 * [추가 2026-05-26] listTournaments() 응답(배열 또는 { data: [] } 래핑)을 안전하게 언래핑.
 *  '전체'·'대회' 탭 fetch 에서 공통 사용 (DRY).
 */
function unwrapTournamentList(
  res: Awaited<ReturnType<typeof listTournaments>>,
): TournamentListItem[] {
  if (!res.success || !res.data) return [];
  return Array.isArray(res.data)
    ? res.data
    : ((res.data as { data?: TournamentListItem[] }).data ?? []);
}

type ViewMode = "child" | "teen" | "default";

// 카드 가격 표시 헬퍼 (formatPackageLabel / formatPriceKRW) 제거됨 (2026-05-22 v6 — 옵션 A).
// 학부모/학생 카드는 가격 영역 0 노출 정책. 운영자 카드(/classes-manage)는 옵션 B 별도 구현.
// 추후 학부모 카드 가격 정책 부활 시 classes-manage/page.tsx 의 가격 렌더 블록을 SoT 로 참고.

// ── Helpers ──────────────────────────────────────────

function getViewMode(userType?: string): ViewMode {
  const t = userType?.toLowerCase();
  if (t === "child") return "child";
  if (t === "teen") return "teen";
  return "default";
}

// TRAINING_TYPE_LABEL · CLASS_TYPE_ICON · CLASS_TYPE_BADGE_CLASS 정의는
// @/lib/class-categories SoT 로 일원화 (2026-05-08).
// 기존 매핑 키가 데이터 값과 불일치(대문자 PERSONAL/GROUP/... vs 실제 소문자 lesson/group_class/...)하여
// 모든 카드가 fallback 으로만 표시되던 버그도 함께 해소.

// Teen 전용 수업 타입 팔레트 — 좌측 color stripe + 아이콘 tint + 상단 accent bar 공통 시스템.
// 솔리드 컬러만 사용 (AI 스타일 금지: gradient/blur 없음).
type TeenTheme = {
  stripe: string; // 카드 좌측 수직 띠
  iconBg: string; // 아이콘 컨테이너 배경 tint
  iconText: string; // 아이콘 컬러
  badge: string; // 타입 배지 배경
  badgeText: string; // 타입 배지 텍스트
  hoverBorder: string; // hover 테두리 강조
};
// Teen 카드 테마 — 키는 실제 데이터 값(snake_case) 기준.
// 이전 코드의 대문자 키(PERSONAL/GROUP/FUN_HOCKEY/CAMP/REGULAR)는 trainingType 값과
// 일치하지 않아 모든 카드가 fallback 으로 표시되던 버그가 있었다 (2026-05-08 정정).
const TEEN_TYPE_THEME: Record<string, TeenTheme> = {
  lesson: {
    stripe: "bg-blue-500",
    iconBg: "bg-blue-100 dark:bg-blue-950/40",
    iconText: "text-blue-600 dark:text-blue-300",
    badge: "bg-blue-500",
    badgeText: "text-white",
    hoverBorder: "hover:border-blue-400 dark:hover:border-blue-500",
  },
  regular_training: {
    stripe: "bg-emerald-500",
    iconBg: "bg-emerald-100 dark:bg-emerald-950/40",
    iconText: "text-emerald-600 dark:text-emerald-300",
    badge: "bg-emerald-500",
    badgeText: "text-white",
    hoverBorder: "hover:border-emerald-400 dark:hover:border-emerald-500",
  },
  regular_class: {
    stripe: "bg-emerald-500",
    iconBg: "bg-emerald-100 dark:bg-emerald-950/40",
    iconText: "text-emerald-600 dark:text-emerald-300",
    badge: "bg-emerald-500",
    badgeText: "text-white",
    hoverBorder: "hover:border-emerald-400 dark:hover:border-emerald-500",
  },
  group_class: {
    stripe: "bg-indigo-500",
    iconBg: "bg-indigo-100 dark:bg-indigo-950/40",
    iconText: "text-indigo-600 dark:text-indigo-300",
    badge: "bg-indigo-500",
    badgeText: "text-white",
    hoverBorder: "hover:border-indigo-400 dark:hover:border-indigo-500",
  },
  game: {
    stripe: "bg-red-500",
    iconBg: "bg-red-100 dark:bg-red-950/40",
    iconText: "text-red-600 dark:text-red-300",
    badge: "bg-red-500",
    badgeText: "text-white",
    hoverBorder: "hover:border-red-400 dark:hover:border-red-500",
  },
  fun: {
    stripe: "bg-orange-500",
    iconBg: "bg-orange-100 dark:bg-orange-950/40",
    iconText: "text-orange-600 dark:text-orange-300",
    badge: "bg-orange-500",
    badgeText: "text-white",
    hoverBorder: "hover:border-orange-400 dark:hover:border-orange-500",
  },
  camp: {
    stripe: "bg-rose-500",
    iconBg: "bg-rose-100 dark:bg-rose-950/40",
    iconText: "text-rose-600 dark:text-rose-300",
    badge: "bg-rose-500",
    badgeText: "text-white",
    hoverBorder: "hover:border-rose-400 dark:hover:border-rose-500",
  },
  // 대회 — Tournament 어댑팅 항목 (trainingType='tournament')
  tournament: {
    stripe: "bg-red-500",
    iconBg: "bg-red-100 dark:bg-red-950/40",
    iconText: "text-red-600 dark:text-red-300",
    badge: "bg-red-500",
    badgeText: "text-white",
    hoverBorder: "hover:border-red-400 dark:hover:border-red-500",
  },
};
const TEEN_FALLBACK_THEME: TeenTheme = {
  stripe: "bg-wtext-4",
  iconBg: "bg-wline-2 dark:bg-rink-800",
  iconText: "text-wtext-3 dark:text-rink-300",
  badge: "bg-wbg0",
  badgeText: "text-white",
  hoverBorder: "hover:border-wline dark:hover:border-rink-300",
};
function getTeenTheme(trainingType: string): TeenTheme {
  return TEEN_TYPE_THEME[trainingType] ?? TEEN_FALLBACK_THEME;
}

// Teen 카드 타입별 아이콘 — 키는 실제 데이터 값(snake_case) 기준.
const TEEN_TYPE_ICON: Record<string, string> = {
  lesson: "sports",
  regular_training: "fitness_center",
  regular_class: "sports_hockey",
  group_class: "groups",
  game: "scoreboard",
  fun: "celebration",
  camp: "local_fire_department",
  tournament: "emoji_events",
};

function formatClassTime(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";
  // Class.startTime/endTime 은 벽시계 시각을 KST 변환 없이 naive 저장(timestamp without tz).
  //   Prisma 가 UTC 로 역직렬화하므로 getUTCHours/getUTCMinutes 로 추출해야 입력 시각과 일치.
  const fmt = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `${fmt(s)} - ${fmt(e)}`;
}

function formatClassDays(days?: string[]): string | null {
  if (!days || days.length === 0) return null;
  if (days.length === 7) return "매일";
  if (
    days.length === 5 &&
    ["월", "화", "수", "목", "금"].every((d) => days.includes(d))
  )
    return "평일";
  if (days.length === 2 && days.includes("토") && days.includes("일"))
    return "주말";
  return `매주 ${days.join("·")}`;
}

/** [2026-06-19] 대상 출생연도 — "2014, 2015년생" 형태. 중복 제거 + 오름차순. */
function formatBirthYears(years?: number[] | null): string | null {
  if (!Array.isArray(years) || years.length === 0) return null;
  const sorted = Array.from(
    new Set(years.filter((y) => Number.isFinite(y))),
  ).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return `${sorted.join(", ")}년생`;
}

/** [2026-06-19] 대회 참가 대상 출생연도 — 개별 집합(eligibleBirthYears) 우선,
 *  비어있으면 범위(from/to) 폴백, 둘 다 없으면 null(숨김). 수업 카드와 동일 "년생" 표기. */
function formatTournamentTargetYears(t: {
  eligibleBirthYears?: number[] | null;
  eligibleBirthYearFrom?: number | null;
  eligibleBirthYearTo?: number | null;
}): string | null {
  if (Array.isArray(t.eligibleBirthYears) && t.eligibleBirthYears.length > 0) {
    return formatBirthYears(t.eligibleBirthYears);
  }
  const f = t.eligibleBirthYearFrom;
  const to = t.eligibleBirthYearTo;
  if (f != null && to != null) return f === to ? `${f}년생` : `${f} ~ ${to}년생`;
  if (f != null) return `${f}년생`;
  if (to != null) return `${to}년생`;
  return null;
}

/** ISO → 로컬 날짜만(00:00). 감독 수업목록 resolvePeriodStatus 와 동일 컨벤션. */
function toDateOnly(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * [2026-06-10] 수업 종료 판정 — 감독 수업목록 기준으로 통일.
 *  실제 일정(scheduledDates)의 마지막 날짜 < 오늘(날짜 단위) 이면 종료.
 *  마지막 일정 날짜 당일까지는 진행중(사용자 지시: "마지막날짜를 지나지 않았으면 진행중").
 *  일정 메타가 없으면 백엔드 isClassEnded(Class.endTime 기반) 로 폴백.
 */
function isClassEndedByLastSchedule(item: {
  scheduledDates?: string[];
  isClassEnded?: boolean;
}): boolean {
  const dates = item.scheduledDates;
  if (!dates || dates.length === 0) return item.isClassEnded ?? false;
  let last: Date | null = null;
  for (const iso of dates) {
    const d = toDateOnly(iso);
    if (d && (!last || d.getTime() > last.getTime())) last = d;
  }
  if (!last) return item.isClassEnded ?? false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return last.getTime() < today.getTime();
}

/** [2026-06-19] 오픈클래스 일정 — 시작~종료 기간만 표기 ("26.06.06 ~ 07.04").
 *  · 회차 1개 → 단일 날짜 ("26.06.06")
 *  · 같은 해면 종료 연도 생략, 다른 해면 양쪽 모두 연도 표기.
 *  (이전: 모든 회차 일(day)을 나열해 길었고, 월 경계 시 다른 달 날짜가 첫 달로 오인되던 버그.) */
function formatOpenClassDates(dates?: string[]): string | null {
  if (!dates || dates.length === 0) return null;
  const parsed = [...dates]
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (parsed.length === 0) return null;
  const fmtFull = (d: Date) =>
    `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const fmtMonthDay = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  if (first.getTime() === last.getTime()) return fmtFull(first);
  const end =
    first.getFullYear() === last.getFullYear() ? fmtMonthDay(last) : fmtFull(last);
  return `${fmtFull(first)} ~ ${end}`;
}

function formatScheduleLabel(item: {
  trainingType?: string | null;
  classDays?: string[];
  startTime?: string;
  scheduledDates?: string[];
}): string | null {
  if (item.trainingType === "lesson") {
    return formatOpenClassDates(item.scheduledDates);
  }
  return formatClassDays(item.classDays);
}

/** 대회 일정 포맷터 — startDate/endDate(ISO) → "1.20 ~ 1.22" 형태 */
function formatTournamentDateRange(start: string, end: string): string | null {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const fmt = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;
  if (s.toDateString() === e.toDateString()) return fmt(s);
  return `${fmt(s)} ~ ${fmt(e)}`;
}

/** 참가비 포맷 — 1인 1회 단가 + 총 경기 수 (있으면) — 빈/0 은 "무료" 표시 */
function formatTournamentFee(
  feePerGame: number | null | undefined,
  totalGames: number | null | undefined,
): string | null {
  // [수정 2026-05-15] 참가비 미설정/0 = "무료" 명시 (이전엔 null 반환으로 표시 자체 누락).
  if (!feePerGame || feePerGame <= 0) return "무료";
  const won = `${feePerGame.toLocaleString("ko-KR")}원`;
  if (totalGames && totalGames > 0) return `${won} × ${totalGames}경기`;
  return won;
}

// ── Filter Tabs ──────────────────────────────────────
// 상위 분류 SoT (정규/오픈/대회) + '전체'.
// 백엔드 SoT: classifyClass() 는 academyId 유무로 'regular' vs 'open' 만 구분.
// SoT(class-categories.ts) `TRAINING_TYPE_OPTIONS` 의 값을 칩 value 로 사용하고,
// 'all'·'open'·'tournament' 는 상위 분류와 그대로 매핑.
// '대회' 탭은 별 도메인(Tournament) 이라 응답 구조가 다르므로 후속 분기에서 처리.

type FilterValue = "all" | ClassCategoryCode;

// 4개 칩: 전체 / 정규수업 / 오픈클래스 / 대회.
const FILTER_OPTIONS: ReadonlyArray<{ value: FilterValue; label: string }> = [
  { value: "all", label: "전체" },
  { value: "regular", label: CLASS_CATEGORIES.regular.label },
  { value: "open", label: CLASS_CATEGORIES.open.label },
  { value: "tournament", label: CLASS_CATEGORIES.tournament.label },
];

function FilterTabs({
  selected,
  onChange,
  isChild,
  isTeen,
}: {
  selected: string;
  onChange: (v: string) => void;
  isChild: boolean;
  isTeen: boolean;
}) {
  // CHILD UI — WCAG AAA (72×72dp 지향 · 18px+ · 7:1 대비)
  if (isChild) {
    return (
      <div
        className="flex gap-2 overflow-x-auto hide-scrollbar"
        role="tablist"
        aria-label="수업 유형 필터"
      >
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "shrink-0 px-4 py-2 rounded-w-pill font-medium transition-colors whitespace-nowrap active:brightness-95 motion-reduce:transition-none min-h-[48px] text-card-title",
              selected === opt.value
                ? "bg-ice-500 text-white"
                : "bg-wline-2 dark:bg-rink-800 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-700",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  // TEEN UI — Pill 토글 (selected=solid primary · rest=outlined)
  if (isTeen) {
    return (
      <div
        className="flex gap-2 overflow-x-auto hide-scrollbar -mx-6 px-6"
        role="tablist"
        aria-label="수업 유형 필터"
      >
        {FILTER_OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                // 시안 Chip — h36/px16/fs14/fw700/-0.01em/pill/border1.5 (core/Chip.jsx)
                "shrink-0 inline-flex items-center h-9 px-4 rounded-w-pill text-[14px] font-bold tracking-[-0.01em] whitespace-nowrap",
                "border-[1.5px] transition-[background-color,color,border-color] motion-reduce:transition-none active:scale-[0.96]",
                active
                  ? "bg-it-blue-500 border-it-blue-500 text-white"
                  : "bg-it-surface dark:bg-rink-800 border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-rink-100 hover:border-it-blue-300 dark:hover:border-rink-600",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  // Coach/Parent (Default) — 시안 core/Chip.jsx 1:1 정합.
  //   h36 / px16 / fs14 / fw700 / -0.01em / pill / border1.5 ·
  //   active=it-blue fill·white / idle=it-surface + it-line-strong border + it-ink-600.
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto hide-scrollbar"
      role="tablist"
      aria-label="수업 유형 필터"
    >
      {FILTER_OPTIONS.map((opt) => {
        const active = selected === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "shrink-0 inline-flex items-center h-9 px-4 rounded-w-pill text-[14px] font-bold whitespace-nowrap tracking-[-0.01em]",
              "border-[1.5px] transition-colors motion-reduce:transition-none active:brightness-95",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40",
              active
                ? "bg-it-blue-500 border-it-blue-500 text-white"
                : "bg-it-surface dark:bg-rink-800 border-it-line-strong dark:border-rink-700 text-it-ink-600 dark:text-rink-100 hover:border-it-blue-300 dark:hover:bg-rink-900",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Child Class Card (WCAG AAA) ──────────────────────

const ChildClassCard = memo(function ChildClassCard({
  item,
  enrolledClassIds,
}: {
  item: ClassItem;
  /** 본인 paid 등록한 classId 집합 — 등록완료/정원마감 분기 */
  enrolledClassIds?: Set<string>;
}) {
  // [2026-06-05] 요일별 규칙이 있으면 "월 17:00 ~ 18:00 / 수 ..." 한 줄 나열(장소 생략),
  //   없으면 기존 요일 라벨 + 단일 시간 2줄 표시로 폴백.
  const dayScheduleLabel = formatDaySchedulesShort(item.daySchedules);
  const time = dayScheduleLabel
    ? null
    : item.trainingType === "lesson"
      ? (item.scheduleTimeLabel ?? null)
      : formatClassTime(item.startTime, item.endTime);
  const daysLabel = dayScheduleLabel ?? formatScheduleLabel(item);
  const rawTypeLabel = TRAINING_TYPE_LABEL[item.trainingType];
  const typeLabel = rawTypeLabel;

  // [2026-05-19] 등록상태 분기 (학생 본인 시점 — 연령 분기는 user.birthDate 미보장으로 skip)
  const isAlreadyEnrolled = enrolledClassIds?.has(item.id) ?? false;
  let registerLabel = "등록";
  let registerClass = "bg-ice-500 text-white";
  if (isAlreadyEnrolled) {
    registerLabel = "등록완료";
    registerClass = "bg-emerald-500 text-white";
  }

  return (
    <NavLink
      href={`/classes/${item.id}`}
      className="block active:brightness-95 transition-colors motion-reduce:transition-none"
      aria-label={`${item.className} 수업 상세 보기`}
    >
      <ChildCard padding="md">
        <div className="flex items-start gap-4">
          {/* [수정 2026-05-15] 좌측 아이콘 박스 — 학부모 DefaultClassCard 와 동일 패턴.
              trainingType 별 모드색(regular=emerald · lesson=ice · tournament=red) 배경
              + 전용 아이콘 + 카테고리 배지(typeLabel) 하단 오버레이.
              CHILD UI 라 박스 크기는 16x16(WCAG AAA 터치 영역) 으로 키움. */}
          <div
            className="w-16 h-16 shrink-0 grid place-items-center rounded-xl relative"
            aria-hidden="true"
          >
            <span
              className={cn(
                "absolute inset-0 rounded-xl flex items-center justify-center",
                getTrainingTypeBadgeClass(item.trainingType),
              )}
            >
              <Icon
                name={getTrainingTypeIcon(item.trainingType)}
                className="text-[30px]"
                aria-hidden="true"
              />
            </span>
            {typeLabel && !shouldHideTypeBadge(item.trainingType) && (
              <span
                className={cn(
                  "absolute -bottom-1.5 left-1/2 -translate-x-1/2 min-w-[36px] px-1.5 h-[20px] rounded-md text-[11px] font-bold tracking-[0.04em] whitespace-nowrap inline-flex items-center justify-center text-white leading-none",
                  item.trainingType === "lesson" && "bg-ice-500",
                  (!item.trainingType || item.trainingType === "regular") &&
                    "bg-emerald-500",
                  item.trainingType === "tournament" && "bg-red-500",
                )}
              >
                {typeLabel}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-wtext-1 dark:text-white truncate">
              {item.className}
            </h3>
            {daysLabel && (
              <div className="flex items-center gap-2 mt-1">
                <Icon
                  name="calendar_today"
                  className="text-card-title text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                <span className="text-card-title font-medium text-wtext-2 dark:text-rink-100">
                  {daysLabel}
                </span>
              </div>
            )}
            {time && (
              <div className="flex items-center gap-2 mt-1">
                <Icon
                  name="schedule"
                  className="text-card-title text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                <span className="text-card-title font-medium text-wtext-2 dark:text-rink-100">
                  {time}
                </span>
              </div>
            )}
            {/* [2026-05-22 v6 — 옵션 A] 가격 영역 완전 제거.
                정책: 다중 패키지 시대 단일 가격 노출은 모호·오해 유발. 가격은 상세 '수강 플랜' SoT.
                isClassEnded 시 좌측 '종료된 수업' 배지 + 우측 등록 칩, 일반 시 우측 등록 칩만. */}
            <div
              className={cn(
                'mt-3 flex items-center gap-2',
                isClassEndedByLastSchedule(item) ? 'justify-between' : 'justify-end',
              )}
            >
              {isClassEndedByLastSchedule(item) && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-200 text-card-meta font-bold">
                  {MESSAGES.classProduct.listBadgeClassEnded}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[68px] h-9 px-3 rounded-full text-base font-extrabold tracking-[-0.01em]",
                  registerClass,
                )}
                aria-hidden="true"
              >
                {registerLabel}
              </span>
            </div>
          </div>
        </div>
      </ChildCard>
    </NavLink>
  );
});

// ── Teen Class Card ──────────────────────────────────
// Teen 전용: 10대 감성 — 큰 타입 아이콘 + 좌측 컬러 stripe + 솔리드 타입 배지 + urgency 하이라이트
// AI 스타일 금지(gradient/backdrop-blur/colored shadow) — 솔리드 컬러 + subtle scale 피드백만 사용.

const TeenClassCard = memo(function TeenClassCard({
  item,
  enrolledClassIds,
}: {
  item: ClassItem;
  /** 본인 paid 등록한 classId 집합 — 등록완료/정원마감 분기 */
  enrolledClassIds?: Set<string>;
}) {
  // [2026-06-05] 요일별 규칙 우선 — 있으면 요일+시간 한 줄 나열, 없으면 기존 요일·시간 분리.
  const dayScheduleLabel = formatDaySchedulesShort(item.daySchedules);
  const time = dayScheduleLabel
    ? null
    : item.trainingType === "lesson"
      ? (item.scheduleTimeLabel ?? null)
      : formatClassTime(item.startTime, item.endTime);
  const rawTypeLabel = TRAINING_TYPE_LABEL[item.trainingType];
  const typeLabel = rawTypeLabel;
  const daysLabel = dayScheduleLabel ?? formatScheduleLabel(item);
  const theme = getTeenTheme(item.trainingType);
  // [2026-05-19] 등록상태 분기 (Teen 본인 시점 — 연령 분기 skip)
  const isAlreadyEnrolled = enrolledClassIds?.has(item.id) ?? false;
  let registerLabel = "등록";
  let registerClass = "bg-ice-500 text-white";
  if (isAlreadyEnrolled) {
    registerLabel = "등록완료";
    registerClass = "bg-emerald-500 text-white";
  }

  return (
    <NavLink
      href={`/classes/${item.id}`}
      className={cn(
        "group block overflow-hidden rounded-2xl border-2 border-wline dark:border-rink-700",
        "bg-white dark:bg-rink-900",
        "transition-[transform,border-color] duration-150 motion-reduce:transition-none",
        "active:scale-[0.98]",
        theme.hoverBorder,
      )}
      aria-label={`${item.className} 수업 상세 보기`}
    >
      <div className="flex gap-3 px-4 py-4">
        {/* [수정 2026-05-15] 좌측 아이콘 박스 — 학부모 DefaultClassCard 와 동일 패턴.
            trainingType 별 모드색(regular=emerald · lesson=ice · tournament=red) 배경
            + 전용 아이콘 + 카테고리 배지 하단 오버레이.
            TEEN 카드 자체 theme(border hover) 는 유지. */}
        <div
          className="w-14 h-14 shrink-0 grid place-items-center rounded-xl relative"
          aria-hidden="true"
        >
          <span
            className={cn(
              "absolute inset-0 rounded-xl flex items-center justify-center",
              getTrainingTypeBadgeClass(item.trainingType),
            )}
          >
            <Icon
              name={getTrainingTypeIcon(item.trainingType)}
              className="text-[26px]"
              aria-hidden="true"
            />
          </span>
          {typeLabel && !shouldHideTypeBadge(item.trainingType) && (
            <span
              className={cn(
                "absolute -bottom-1.5 left-1/2 -translate-x-1/2 min-w-[36px] px-1.5 h-[20px] rounded-md text-[11px] font-bold tracking-[0.04em] whitespace-nowrap inline-flex items-center justify-center text-white leading-none",
                item.trainingType === "lesson" && "bg-ice-500",
                (!item.trainingType || item.trainingType === "regular") &&
                  "bg-emerald-500",
                item.trainingType === "tournament" && "bg-red-500",
              )}
            >
              {typeLabel}
            </span>
          )}
        </div>

        {/* 메인 콘텐츠 */}
        <div className="min-w-0 flex-1">
          {/* 타이틀 — 크고 과감하게 */}
          <h3 className="mb-2 truncate text-card-emphasis font-extrabold tracking-tight text-wtext-1 dark:text-white">
            {item.className}
          </h3>

          {/* 메타 라인 — 전체일정 · 시간만 (레벨/팀/장소/연령 제거 · 2026-06-10 사용자 지시) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-card-meta font-medium text-wtext-2 dark:text-rink-100">
            {daysLabel && (
              <span className="inline-flex items-center gap-1">
                <Icon
                  name="calendar_today"
                  className="text-[14px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                {daysLabel}
              </span>
            )}
            {time && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon
                  name="schedule"
                  className="text-[14px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                {time}
              </span>
            )}
          </div>

          {/* 정원 상태 표시 제거 (사용자 요청) — 정원 비노출 정책 */}

          {/* [2026-05-22 v6 — 옵션 A] 가격 영역 완전 제거.
              정책: 다중 패키지 시대 단일 가격 노출 모호. 가격은 상세 '수강 플랜' SoT.
              isClassEnded 시 좌측 '종료된 수업' 배지 + 우측 등록 칩, 일반 시 우측 등록 칩만. */}
          <div
            className={cn(
              'mt-2 flex items-center gap-2',
              isClassEndedByLastSchedule(item) ? 'justify-between' : 'justify-end',
            )}
          >
            {isClassEndedByLastSchedule(item) && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-200 text-card-meta font-bold">
                {MESSAGES.classProduct.listBadgeClassEnded}
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center justify-center h-[30px] px-3.5 rounded-full text-card-meta font-extrabold tracking-[-0.01em]",
                registerClass,
              )}
              aria-hidden="true"
            >
              {registerLabel}
            </span>
          </div>
        </div>
      </div>
    </NavLink>
  );
});

// ── Parent (Default) Class Card ──────────────────────
// 학부모 전용 — 다른 학부모 화면(/children, /awards)과 동일한 디자인 언어로 통일.
// 패턴 참조: awards/AwardListCard (rounded-xl · border-wline-2 · hover:border-ice-500/30 · hover:shadow-md)
// 구조: 상단(타입 배지 + chevron) → 제목 → 메타라인 → 푸터(정원 + progress).
// 솔리드 컬러만 사용, gradient/blur/colored shadow 없음.

const DefaultClassCard = memo(function DefaultClassCard({
  item,
  enrolledClassIds,
  childAges,
  forceShowTypeBadge,
}: {
  item: ClassItem;
  /** 현재 사용자(부모)가 paid 로 등록한 classId 집합 — 등록완료 라벨 분기에 사용 */
  enrolledClassIds?: Set<string>;
  /**
   * 학부모 자녀들의 나이 배열. 한 명이라도 ageMin~ageMax 안에 들어가면 등록 가능.
   * undefined/null = 데이터 아직 로딩 중 → "등록" 기본 표시 (회귀 방지).
   * 빈 배열 = 자녀 0명 → 등록 가능 여부 판단 불가, 기본 "등록" 표시.
   */
  childAges?: number[];
  /** '등록 훈련' 섹션 등 혼합 분류 영역 — 정규수업/오픈클래스 배지를 강제 노출 */
  forceShowTypeBadge?: boolean;
}) {
  const { navigate } = useNavigation();
  // [2026-06-05] 요일별 규칙 우선 — 있으면 "월 17:00 ~ 18:00 / 수 ..." 한 줄(장소 생략),
  //   없으면 기존 요일 라벨 + 단일 시간 결합으로 폴백.
  const dayScheduleLabel = formatDaySchedulesShort(item.daySchedules);
  const time = dayScheduleLabel
    ? null
    : item.trainingType === "lesson"
      ? (item.scheduleTimeLabel ?? null)
      : formatClassTime(item.startTime, item.endTime);
  const rawTypeLabel = TRAINING_TYPE_LABEL[item.trainingType];
  const typeLabel = rawTypeLabel;
  const daysLabel = dayScheduleLabel ?? formatScheduleLabel(item);

  // [2026-05-19 추가] 등록 상태 분기
  //   priority: 등록완료 > 등록불가(연령) > 등록
  const isAlreadyEnrolled = enrolledClassIds?.has(item.id) ?? false;
  // childAges 가 nullish/빈배열 이면 기본 "등록" 으로 표시 (정보 부족 시 절대 disabled 하지 않음)
  const hasAgeEligibleChild =
    !childAges || childAges.length === 0
      ? true
      : childAges.some((age) => {
          if (item.ageMin != null && age < item.ageMin) return false;
          if (item.ageMax != null && age > item.ageMax) return false;
          return true;
        });
  let registerLabel = "등록";
  let registerClass = "bg-ice-500 text-white";
  if (isAlreadyEnrolled) {
    registerLabel = "등록완료";
    registerClass = "bg-emerald-500 text-white";
  } else if (!hasAgeEligibleChild) {
    registerLabel = "등록불가";
    registerClass = "bg-wtext-3 dark:bg-rink-500 text-white";
  }

  const scheduleLine =
    daysLabel || time
      ? `${daysLabel || time}${daysLabel && time ? ` · ${time}` : ''}`
      : null;

  const classEnded = isClassEndedByLastSchedule(item);
  // 출석확인 + 수업종료 배지만 우하단에 유지 (등록 상태 칩은 우상단 titleRight 로 이동).
  const bodyAction =
    classEnded || isAlreadyEnrolled ? (
      <div className="flex items-center justify-end gap-2">
        {classEnded && (
          <span className="mr-auto inline-flex items-center px-2.5 py-1 rounded-full bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-200 text-card-meta font-bold">
            {MESSAGES.classProduct.listBadgeClassEnded}
          </span>
        )}
        {/* 출석확인 — 등록(선불 paid/후불 approved)한 수업에만 본문 우하단에 노출.
            카드 전체가 상세 링크이므로 role=button + preventDefault/stopPropagation 으로
            상세 이동을 막고 출석내역으로 이동. 자녀는 전역 SelectedChildContext 공유라 childId 불필요. */}
        {isAlreadyEnrolled && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(`/attendance-history?classId=${item.id}`);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/attendance-history?classId=${item.id}`);
              }
            }}
            className="inline-flex items-center justify-center gap-1 h-[30px] px-3 rounded-full text-[14px] leading-[1.55] font-extrabold tracking-[-0.01em] border border-ice-500 text-ice-500 bg-transparent hover:bg-ice-500/10 active:brightness-95 transition-colors motion-reduce:transition-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
            aria-label={`${item.className} 출석 내역 보기`}
          >
            <Icon name="fact_check" className="text-[16px]" aria-hidden="true" />
            출석확인
          </span>
        )}
      </div>
    ) : undefined;

  return (
    <ClassListCard
      href={`/classes/${item.id}`}
      iceTheme
      trainingType={item.trainingType}
      iconImageUrl={item.teamLogoUrl}
      typeBadgeLabel={
        forceShowTypeBadge || !shouldHideTypeBadge(item.trainingType)
          ? typeLabel
          : undefined
      }
      ariaLabel={`${item.className} 수업 상세 보기`}
      title={item.className}
      // 오픈클래스만 소속 아카데미명을 제목 아래 subtitle 로 노출(팀 수업은 undefined → 미렌더).
      metaInline={item.academyName || undefined}
      titleRight={
        /* 등록 상태 칩 — 클릭은 카드 NavLink 가 처리 (시각 표시 전용).
           min-w-[72px] 고정 — 2글자("등록")도 4글자("등록완료")와 동일 폭 유지. */
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-[72px] h-[30px] px-3.5 rounded-full text-[14px] leading-[1.55] font-extrabold tracking-[-0.01em]",
            registerClass,
          )}
          aria-hidden="true"
        >
          {registerLabel}
        </span>
      }
      bodyAction={bodyAction}
    >
      {scheduleLine && <ClassCardInfoRow icon="schedule">{scheduleLine}</ClassCardInfoRow>}
      {/* [2026-06-19] 대상 출생연도 — 입력 없으면 '전체'(전체 대상)로 표기. */}
      <ClassCardInfoRow icon="cake">
        {formatBirthYears(item.targetBirthYears) ?? '전체'}
      </ClassCardInfoRow>
    </ClassListCard>
  );
});

// ── Child Tournament Card (WCAG AAA) ─────────────────
// 디자인 언어: ChildClassCard 와 동일 (ChildCard + 큰 아이콘 + 큰 폰트).
// 색상: 빨강 (대회 = TRAINING_TYPE_BADGE_CLASS.tournament 와 정합).

const ChildTournamentCard = memo(function ChildTournamentCard({
  item,
}: {
  item: TournamentListItem;
}) {
  const dateLabel = formatTournamentDateRange(item.startDate, item.endDate);

  return (
    <NavLink
      href={`/tournaments/${item.id}`}
      className="block active:brightness-95 transition-colors motion-reduce:transition-none"
      aria-label={`${item.name} 대회 상세 보기`}
    >
      <ChildCard padding="md">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0"
            aria-hidden="true"
          >
            <Icon name="emoji_events" className="text-red-500 text-3xl" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-wtext-1 dark:text-white truncate">
              {item.name}
            </h3>
            {dateLabel && (
              <div className="flex items-center gap-2 mt-1">
                <Icon
                  name="calendar_today"
                  className="text-card-title text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                <span className="text-card-title font-medium text-wtext-2 dark:text-rink-100">
                  {dateLabel}
                </span>
              </div>
            )}
            {item.club?.clubName && (
              <div className="flex items-center gap-2 mt-1">
                <Icon
                  name="apartment"
                  className="text-card-title text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                <span className="text-card-title font-medium text-wtext-2 dark:text-rink-100 truncate">
                  {item.club.clubName}
                </span>
              </div>
            )}
          </div>
        </div>
      </ChildCard>
    </NavLink>
  );
});

// ── Teen Tournament Card ─────────────────────────────
// 디자인 언어: TeenClassCard 와 동일 (rounded-2xl border-2 + 좌측 아이콘 컨테이너 + 메타).
// 색상: 빨강 (대회). status 별 urgency 강조.

const TeenTournamentCard = memo(function TeenTournamentCard({
  item,
}: {
  item: TournamentListItem;
}) {
  const dateLabel = formatTournamentDateRange(item.startDate, item.endDate);
  const fee = formatTournamentFee(item.feePerGame, item.totalGames);
  const teamsCount = item._count?.registrations ?? 0;
  const maxTeams = item.maxParticipants ?? 0;
  const isFull = maxTeams > 0 && teamsCount >= maxTeams;
  const isClosed = item.status === "finished" || item.status === "cancelled";

  return (
    <NavLink
      href={`/tournaments/${item.id}`}
      className={cn(
        "group block overflow-hidden rounded-2xl border-2 border-wline dark:border-rink-700",
        "bg-white dark:bg-rink-900",
        "transition-[transform,border-color] duration-150 motion-reduce:transition-none",
        "active:scale-[0.98]",
        "hover:border-red-400 dark:hover:border-red-500",
      )}
      aria-label={`${item.name} 대회 상세 보기`}
    >
      <div className="flex gap-3 px-4 py-4">
        {/* 트로피 아이콘 — 시각적 앵커 */}
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/40"
          aria-hidden="true"
        >
          <Icon
            name="emoji_events"
            className="text-[30px] text-red-600 dark:text-red-300"
            filled
          />
        </div>

        {/* 메인 콘텐츠 */}
        <div className="min-w-0 flex-1">
          {/* Top Row: 클럽 (대회 배지는 유형 분류가 명확해 생략) */}
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {item.club?.clubName && (
              <span className="ml-auto inline-flex items-center gap-0.5 text-card-meta font-semibold text-wtext-3 dark:text-rink-300 max-w-[42%]">
                <Icon
                  name="apartment"
                  className="text-[13px]"
                  aria-hidden="true"
                />
                <span className="truncate">{item.club.clubName}</span>
              </span>
            )}
          </div>

          {/* 타이틀 — 크고 과감하게 */}
          <h3 className="mb-2 truncate text-card-emphasis font-extrabold tracking-tight text-wtext-1 dark:text-white">
            {item.name}
          </h3>

          {/* 메타 라인 — 일정 · 참가팀 · 참가비 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-card-meta font-medium text-wtext-2 dark:text-rink-100">
            {dateLabel && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon
                  name="calendar_today"
                  className="text-[14px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                {dateLabel}
              </span>
            )}
            {maxTeams > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon
                  name="groups"
                  className="text-[14px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                {teamsCount}/{maxTeams}팀
              </span>
            )}
            {fee && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon
                  name="payments"
                  className="text-[14px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
                {fee}
              </span>
            )}
          </div>

          {/* 하단: 모집 상태 (접수마감 D-Day 배지 제거 · 2026-06-10 사용자 지시) */}
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-wline-2 dark:border-rink-800 pt-2.5">
            {isClosed ? (
              <span className="inline-flex items-center gap-1 rounded-w-pill bg-wline dark:bg-rink-700 px-2.5 py-1 text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                {item.status === "finished" ? "종료" : "취소"}
              </span>
            ) : isFull ? (
              <span className="inline-flex items-center gap-1 rounded-w-pill bg-wline dark:bg-rink-700 px-2.5 py-1 text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                마감
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-w-pill bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-card-meta font-bold text-emerald-600 dark:text-emerald-400">
                <Icon
                  name="check_circle"
                  className="text-[13px]"
                  aria-hidden="true"
                  filled
                />
                참가 가능
              </span>
            )}
          </div>
        </div>
      </div>
    </NavLink>
  );
});

// ── Default Tournament Card ──────────────────────────
// [2026-06-11] 학부모 정규수업 카드(DefaultClassCard)와 동일 골격으로 통일.
//   ClassListCard 공통 셸 사용 → 아이콘 박스(대회=빨강 trophy) + 수업명 + 일정 + 등록버튼.
//   (이전: 자체 NavLink 레이아웃이라 정규수업 카드와 형태/아이콘이 달랐음)

const DefaultTournamentCard = memo(function DefaultTournamentCard({
  item,
}: {
  item: TournamentListItem;
}) {
  const dateLabel = formatTournamentDateRange(item.startDate, item.endDate);
  // [2026-06-17] 종료 판정 — status='finished'/'cancelled' 또는 일정(endDate) 경과.
  //   status 가 자동 전이되지 않으므로 날짜가 지난 대회도 "종료" 배지로 표기.
  const isCancelled = item.status === "cancelled";
  const isEndedByDate = (() => {
    const t = item.endDate ? new Date(item.endDate).getTime() : NaN;
    if (Number.isNaN(t)) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return t < today.getTime();
  })();
  const isClosed = item.status === "finished" || isCancelled || isEndedByDate;
  // [2026-06-17] 자녀 1명이라도 등록(후불=신청, 선불=결제완료)이면 등록완료 표기.
  //   enrolledChildIds: 백엔드가 billingMode 별로 산출(후불 신청 포함 · 폴백 paidChildIds).
  const isEnrolled =
    ((item.enrolledChildIds ?? item.paidChildIds)?.length ?? 0) > 0;

  return (
    <ClassListCard
      href={`/tournaments/${item.id}`}
      iceTheme
      trainingType="tournament"
      ariaLabel={`${item.name} 대회 상세 보기`}
      title={item.name}
      titleRight={
        // [2026-06-19] 등록 상태 칩(등록/등록완료)을 제목 줄 우측 상단으로 이동.
        <span
          className={cn(
            "inline-flex items-center justify-center min-w-[72px] h-[30px] px-3.5 rounded-full text-[14px] leading-[1.55] font-extrabold tracking-[-0.01em] text-white",
            isEnrolled ? "bg-emerald-500" : "bg-ice-500",
          )}
          aria-hidden="true"
        >
          {isEnrolled ? "등록완료" : "등록"}
        </span>
      }
      bodyAction={
        // 종료/취소된 대회 배지만 우하단에 유지.
        isClosed ? (
          <div className="flex justify-start">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-200 text-card-meta font-bold">
              {isCancelled ? "취소된 대회" : "종료된 대회"}
            </span>
          </div>
        ) : undefined
      }
    >
      {dateLabel && (
        <ClassCardInfoRow icon="event">{dateLabel}</ClassCardInfoRow>
      )}
      {/* [2026-06-19] 참가 대상 출생연도 — 입력 없으면 '전체'(전체 대상)로 표기. */}
      <ClassCardInfoRow icon="cake">
        {formatTournamentTargetYears(item) ?? '전체'}
      </ClassCardInfoRow>
    </ClassListCard>
  );
});

// ── Empty State ──────────────────────────────────────

function EmptyState({
  isChild,
  label = "수업",
  icon = "sports_hockey",
}: {
  isChild: boolean;
  label?: string;
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-5 text-center">
      {/* primary tonal — /children empty 패턴 (it-blue tonal) */}
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl bg-it-blue-500/10 text-it-blue-500 ring-4 ring-it-blue-500/5 mb-5",
          isChild ? "size-20" : "size-16",
        )}
        aria-hidden="true"
      >
        <Icon
          name={icon}
          className={cn(isChild ? "text-[44px]" : "text-[32px]")}
          aria-hidden="true"
        />
      </div>
      <p
        className={cn(
          "font-bold text-wtext-1 dark:text-white tracking-tight mb-1.5",
          isChild ? "text-card-title" : "text-card-emphasis",
        )}
      >
        {MESSAGES.empty(label)}
      </p>
      <p
        className={cn(
          "text-wtext-3 dark:text-rink-300 leading-relaxed max-w-[280px]",
          isChild ? "text-card-emphasis" : "text-card-body",
        )}
      >
        조건에 맞는 {label}{subjectParticle(label)} 아직 등록되지 않았어요.
        {!isChild && <br />}
        다른 유형을 선택하거나 잠시 후 다시 확인해주세요.
      </p>
    </div>
  );
}

// ── 섹션 영역 (학부모/감독 — 정규수업/오픈클래스/대회 구분) ──────────
// [2026-06-12→06-24 ICETIMES flat] 상단 필터 태그 제거 → 유형별 섹션 카드영역으로 분리.
//   [재작업] 좌측 stripe + 카드 박스(gap-3) 구조를 /director 와 동일한 full-bleed flat
//   섹션으로 전환: 흰 패널(bg-it-surface)이 8px 회색 갭(mt-2)으로 쌓이고, 헤더는
//   SectionHead(iceTheme) 17px/800 it-ink 톤 + 우측 개수. 수업 행은 공유 ClassListCard
//   iceTheme(무라운드 + 하단 hairline)이 담당해 카드 박스/그림자가 사라진다.
//   섹션 내부는 등록완료 → 등록(미등록) 순으로 정렬한다.
function ClassSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section
      aria-label={`${title} 목록`}
      className="mt-2 bg-it-surface dark:bg-it-blue-950"
    >
      <header className="flex items-center gap-2 px-4 sm:px-5 pt-4 sm:pt-[18px] pb-2">
        <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
          {title}
        </h2>
        {/* 시안 SectionHeader count — 15px/800 it-blue (AcademyList.jsx) */}
        <span className="text-[15px] font-extrabold text-it-blue-500 dark:text-it-blue-300 tabular-nums">
          {count}
        </span>
      </header>
      <div role="list">{children}</div>
    </section>
  );
}

// ── Main Page ────────────────────────────────────────

export default function ClassesPage() {
  const { user } = useSessionAuth();
  const { navigate } = useNavigation();
  const viewMode = getViewMode(user?.userType);
  const isChild = viewMode === "child";
  const isTeen = viewMode === "teen";

  // 운영자(감독/코치/오픈클래스감독)는 학부모용 수업 카탈로그(/classes) 대신 수업 관리로 보낸다.
  //   수업 상세(/classes/[id])는 공용 유지 — 본 가드는 목록 페이지에만 적용.
  const isManagerRole = (() => {
    const t = user?.userType?.toLowerCase();
    return t === "coach" || t === "director" || t === "academy_director";
  })();
  useEffect(() => {
    if (isManagerRole) navigate("/classes-manage");
  }, [isManagerRole, navigate]);

  // 학부모 본인 소속 팀 필터링은 BE에서 수행한다.
  //  - PARENT 토큰 → TeamMember(approved, PARENT).teamId 기반으로 응답을 제한
  //  - 가입 시 teamCode 필수 → 학부모는 항상 1개 이상의 소속 팀 보유
  // FE에는 자녀 팀 토글 UI가 없으며, 검색·수업 유형 필터만 노출한다.

  const [filter, setFilter] = useState<FilterValue>("all");

  // 탭 클릭 시 같은 화면에서 목록 갱신 (라우팅 없음).
  // 대회 탭은 Tournament API 를 호출하고 ClassItem 형태로 어댑팅하여 동일 카드로 표시.
  const handleFilterChange = useCallback((next: string) => {
    setFilter(next as FilterValue);
  }, []);

  // 검색·정렬 기능 제거 (사용자 요청) — 카테고리 필터만 유지.
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  // [2026-05-19 추가] 학부모 시점 자녀 나이 + 본인(부모) paid 등록 목록.
  //   - 카드 우측 버튼(등록완료/등록불가) 분기에 사용.
  //   - 학생/teen viewMode 에서는 fetch 안 함 (그 시점은 별도 카드 컴포넌트가 그림).
  const [childAges, setChildAges] = useState<number[] | undefined>(undefined);
  const [enrolledClassIds, setEnrolledClassIds] = useState<Set<string>>(
    () => new Set(),
  );
  // 초기 로딩(최초 1회)과 탭 전환 refetch를 분리 — 탭 클릭 시 스켈레톤이 번쩍 뜨며 깜빡이는 것 방지.
  // isLoading: 최초 1회만 true → 스켈레톤 표시용
  // isFetching: 재요청(필터 변경) 중 true → 기존 카드를 opacity 전환으로 유지
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  // 풀스크린 로더 fast-path (v11) — 수업/대회 목록 첫 fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  // SubmainAppBar 가 자체 GlobalMenu 관리 — 페이지 state 불필요

  const filteredClasses = useMemo(() => {
    // 0) trainingType 클라이언트 필터 — '정규수업' 칩은 정규 수업만 노출.
    //    'all'·'open' 칩은 trainingType 무시(모두 통과). 'tournament' 는 별 도메인(tournaments 배열).
    const typeFiltered =
      filter === "regular"
        ? classes.filter((c) => c.trainingType === "regular")
        : classes;

    // 검색·정렬 제거 (사용자 요청) — 카테고리 필터 결과를 백엔드 순서(최신순) 그대로 반환.
    return typeFiltered;
  }, [classes, filter]);

  const filteredTournaments = tournaments;

  // [2026-06-12] 학부모/감독(default) 섹션 분류 — 정규수업 / 오픈클래스 / 대회.
  //   · 오픈클래스: trainingType === 'lesson' (아카데미 오픈클래스)
  //   · 정규수업: 그 외(regular 등 팀 수업)
  //   각 섹션은 등록완료(enrolledClassIds 포함) → 등록(미등록) 순으로 안정 정렬한다.
  const sections = useMemo(() => {
    if (viewMode !== "default") return null;
    const isOpen = (c: ClassItem) => c.trainingType === "lesson";
    const isEnrolled = (c: ClassItem) => enrolledClassIds.has(c.id);
    // [2026-06-18] '등록 훈련' — 선택 자녀가 등록(선불 paid/후불 approved)한 수업(정규+오픈)을
    //   맨 위 별도 섹션으로 분리. 정규/오픈 섹션에서는 제외(중복 방지) → 두 섹션은 '등록 가능' 카탈로그.
    return {
      enrolled: classes.filter(isEnrolled),
      regular: classes.filter((c) => !isOpen(c) && !isEnrolled(c)),
      open: classes.filter((c) => isOpen(c) && !isEnrolled(c)),
      tournaments,
    };
  }, [viewMode, classes, tournaments, enrolledClassIds]);

  // [2026-05-12 fix] 학부모 수업목록 status bar 누락 회귀 해결.
  //   `isDataLoaded: !isLoading` 가드 제거 — fetch 중 ui.hideStatusBar() 가 호출되고
  //   fetch 완료 후 applyConfig 의 비동기 복원이 race condition 으로 누락되는 케이스가
  //   있어 사용자가 영구적으로 status bar 숨김 상태를 본다. 이 페이지는 SubmainAppBar
  //   + 카드 리스트만 렌더링하므로 fullscreen-loader 강제 가드가 불필요.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  // 선택 자녀(전역) — 학부모는 선택 자녀의 소속 팀 수업만. null(자녀0명/비학부모)이면 미전송 → BE 전체 폴백.
  const { selectedChildId } = useSelectedChild();

  const fetchClasses = useCallback(async (cat: string) => {
    // 최초 요청: 스켈레톤 (isLoading=true) · 이후 요청: 카드 유지 + opacity 전환 (isFetching=true)
    if (hasLoadedOnceRef.current) {
      setIsFetching(true);
    } else {
      setIsLoading(true);
    }
    try {
      if (cat === "tournament") {
        // 대회 탭: Tournament API 만 호출 후 전용 카드(TournamentCard)로 표시.
        // [2026-05-20] 응답이 배열 / { data: [] } 어느 쪽이어도 안전하도록 unwrap.
        const res = await listTournaments(
          selectedChildId ? { childId: selectedChildId } : undefined,
        );
        setTournaments(unwrapTournamentList(res));
        setClasses([]);
      } else if (cat === "all") {
        // [B13 수정 2026-05-26] '전체' 탭 = 일반 수업 + 대회 union 노출.
        //   기존엔 /classes 만 호출하여 대회가 누락됐다('대회' 단독 탭에서만 노출되던 버그).
        //   '전체' 는 모든 타입을 포함해야 하므로 두 도메인(수업·대회)을 병렬 fetch 하여 함께 표시.
        const [classesRes, tournamentsRes] = await Promise.all([
          api.get<ClassItem[] | { data: ClassItem[] }>(
            `/classes${selectedChildId ? `?childId=${selectedChildId}` : ""}`,
          ),
          listTournaments(
            selectedChildId ? { childId: selectedChildId } : undefined,
          ),
        ]);
        setClasses(
          classesRes.success ? normalizeClassList(classesRes.data) : [],
        );
        setTournaments(unwrapTournamentList(tournamentsRes));
      } else {
        // 정규/오픈 탭: 분류 SoT 의 category 쿼리 전송. 대회는 별 도메인이라 제외.
        //   'regular' 탭은 trainingType==='regular' 만 노출(클라이언트 필터에서 분리).
        setTournaments([]);
        const res = await api.get<ClassItem[] | { data: ClassItem[] }>(
          `/classes?category=${cat}${selectedChildId ? `&childId=${selectedChildId}` : ""}`,
        );
        setClasses(res.success ? normalizeClassList(res.data) : []);
      }
    } catch {
      setClasses([]);
      setTournaments([]);
    } finally {
      hasLoadedOnceRef.current = true;
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    fetchClasses(filter);
  }, [filter, fetchClasses]);

  // [2026-05-19] viewMode 별 fetch:
  //   - default(부모): /children(자녀 나이) + /enrollments?status=paid(부모가 결제한 자녀 등록 목록)
  //   - child/teen(학생 본인): /enrollments?status=paid 만 호출 (본인 등록 여부 분기 용)
  //   - 연령 분기는 부모 시점만 — AuthUser 에 birthDate 가 없어 학생/teen 본인 나이는 파악 불가.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // enrollments — 모든 viewMode 공통.
        //   [수정] 후불(POSTPAID) 수강 중(approved)도 "등록완료"로 표시해야 하므로
        //   status=paid 로 좁히지 않고 전체를 받아 isActiveEnrollment 공통 SoT 로 판정.
        const enrollPromise = api.get<
          | { classId?: string; childId?: string; class?: { id?: string; billingMode?: string }; status?: string }[]
          | {
              data: {
                classId?: string;
                childId?: string;
                class?: { id?: string; billingMode?: string };
                status?: string;
              }[];
            }
        >("/enrollments");

        // children — default 시점만 호출
        const childrenPromise =
          viewMode === "default"
            ? api.get<
                | { id: string; age?: number; birthDate?: string }[]
                | { data: { id: string; age?: number; birthDate?: string }[] }
              >("/children")
            : Promise.resolve(null);

        const [enrollRes, childrenRes] = await Promise.all([
          enrollPromise,
          childrenPromise,
        ]);
        if (cancelled) return;

        // enrollments — classId 만 모아 Set 으로
        if (enrollRes.success && enrollRes.data) {
          // 백엔드 응답이 배열 직접 또는 { data: T[] } 래핑 둘 다 지원.
          // 타입 시스템상 양쪽 형태가 호환되지 않으므로 unknown 경유 캐스팅.
          const arr = Array.isArray(enrollRes.data)
            ? enrollRes.data
            : (enrollRes.data as unknown as { data: typeof enrollRes.data })
                .data;
          const ids = new Set<string>();
          (Array.isArray(arr) ? arr : []).forEach((e) => {
            // 선불 paid OR 후불(POSTPAID) approved 만 "등록완료"로 간주 (공통 SoT).
            if (!isActiveEnrollment(e.status, e.class?.billingMode)) return;
            // [2026-06-17] 선택 자녀 기준 필터 — /enrollments 는 부모의 모든 자녀 등록을
            //   반환하므로, 자녀 미구분 시 형제 등록이 다른 자녀 카드에 '등록완료'로 잘못
            //   표시되던 버그 수정. 부모 뷰 + 선택 자녀 있을 때만 해당 자녀 등록으로 한정.
            if (viewMode === "default" && selectedChildId && e.childId !== selectedChildId) return;
            const id = e.classId ?? e.class?.id;
            if (id) ids.add(id);
          });
          setEnrolledClassIds(ids);
        }

        // children — age 우선, 없으면 birthDate 로 계산 (default 시점만)
        if (childrenRes && childrenRes.success && childrenRes.data) {
          const arr = Array.isArray(childrenRes.data)
            ? childrenRes.data
            : (childrenRes.data as unknown as { data: typeof childrenRes.data })
                .data;
          const ages = (Array.isArray(arr) ? arr : [])
            .map((c) => {
              if (typeof c.age === "number") return c.age;
              if (c.birthDate) {
                const d = new Date(c.birthDate);
                if (!Number.isNaN(d.getTime())) {
                  const today = new Date();
                  let a = today.getFullYear() - d.getFullYear();
                  const m = today.getMonth() - d.getMonth();
                  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
                  return a;
                }
              }
              return null;
            })
            .filter((a): a is number => typeof a === "number" && a >= 0);
          setChildAges(ages);
        } else if (viewMode === "default") {
          setChildAges([]);
        }
      } catch {
        // 실패 시 분기 없이 기본 "등록" 표시 (회귀 방지)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, selectedChildId]);

  const renderClassCard = (
    item: ClassItem,
    opts?: { forceShowTypeBadge?: boolean },
  ) => {
    switch (viewMode) {
      case "child":
        return (
          <ChildClassCard
            key={item.id}
            item={item}
            enrolledClassIds={enrolledClassIds}
          />
        );
      case "teen":
        return (
          <TeenClassCard
            key={item.id}
            item={item}
            enrolledClassIds={enrolledClassIds}
          />
        );
      default:
        return (
          <DefaultClassCard
            key={item.id}
            item={item}
            enrolledClassIds={enrolledClassIds}
            childAges={childAges}
            forceShowTypeBadge={opts?.forceShowTypeBadge}
          />
        );
    }
  };

  const renderTournamentCard = (item: TournamentListItem) => {
    switch (viewMode) {
      case "child":
        return <ChildTournamentCard key={item.id} item={item} />;
      case "teen":
        return <TeenTournamentCard key={item.id} item={item} />;
      default:
        return <DefaultTournamentCard key={item.id} item={item} />;
    }
  };

  // 현재 탭이 대회 모드인지 — EmptyState 라벨/아이콘에서 사용.
  const isTournamentTab = filter === "tournament";
  // [B13 수정 2026-05-26] '전체' 탭은 수업 + 대회를 함께 노출.
  //   showClasses: 대회 단독 탭이 아닌 모든 탭(전체/정규/오픈)에서 수업 카드 표시.
  //   showTournaments: '전체' 또는 '대회' 탭에서 대회 카드 표시.
  const showClasses = filter !== "tournament";
  const showTournaments = filter === "tournament" || filter === "all";
  const visibleClassCount = showClasses ? filteredClasses.length : 0;
  const visibleTournamentCount = showTournaments
    ? filteredTournaments.length
    : 0;
  const visibleCount = visibleClassCount + visibleTournamentCount;
  const hasItems = visibleCount > 0;

  // [v16 2026-05-16] 이중 로더 제거 — LoadingProvider 풀스크린 로더가 usePageReady 신호로 종료.
  // 데이터 fetch 완료 전까지 페이지 자체는 null 반환, 풀스크린 로더만 노출된다.
  if (isLoading && classes.length === 0 && tournaments.length === 0) {
    return null;
  }

  // 운영자 역할은 위 useEffect 에서 /classes-manage 로 리다이렉트 — 목록 미렌더(깜빡임 방지).
  if (isManagerRole) return null;

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title={MESSAGES.dashboard.links.trainingList} />

      {/* Content — Hero/Search/Filter/Cards 모두 함께 스크롤 (AppBar만 sticky 유지) */}
      {/* [ICETIMES flat 2026-06-24] default(학부모/감독) 섹션은 회색 캔버스 위 full-bleed
          흰 패널로 쌓이도록 main 배경을 it-canvas 로. 아동/청소년 카드 뷰는 기존 흰 배경 유지. */}
      <main
        className={cn(
          "flex-1 overflow-y-auto hide-scrollbar",
          !isChild && !isTeen && "bg-it-canvas dark:bg-puck !pb-8",
        )}
      >
        {/* Teen Hero — 친근한 인사말 + 큰 타이틀 + 수업 개수 강조 */}
        {isTeen && !isLoading && (
          <section className="px-6 pt-5 pb-4" aria-label="수업 요약">
            <p className="text-card-meta font-bold uppercase tracking-[0.14em] text-it-blue-500 dark:text-it-blue-300">
              Find your class
            </p>
            <h2 className="mt-1 text-w-h2 font-extrabold tracking-tight text-wtext-1 dark:text-white leading-tight">
              오늘은 어떤 수업?
            </h2>
            <div className="mt-2.5 inline-flex items-center gap-2 rounded-w-pill bg-rink-900 dark:bg-white px-3 py-1">
              <span className="text-card-meta font-bold text-white dark:text-wtext-1 tabular-nums">
                {filteredClasses.length}
              </span>
              <span className="text-card-meta font-medium text-white/70 dark:text-wtext-1/70">
                개의 수업이 기다려요
              </span>
            </div>
          </section>
        )}

        {/* 검색창 제거 (사용자 요청) */}

        {/* Filter Tabs — 아동/청소년 전용. 학부모/감독(default)은 유형별 섹션으로 분리(2026-06-12). */}
        {(isChild || isTeen) && (
          <div className="px-6 pb-4">
            <FilterTabs
              selected={filter}
              onChange={handleFilterChange}
              isChild={isChild}
              isTeen={isTeen}
            />
          </div>
        )}

        {/* Cards — 학부모/감독(default)은 정규수업/오픈클래스/대회 섹션으로 분리하고,
            각 섹션 내부는 등록완료 → 등록 순으로 정렬. 아동/청소년은 기존 단일 리스트 유지. */}
        <div
          className={cn(
            "flex flex-col",
            isChild || isTeen ? "gap-3 px-6" : "",
            "transition-opacity duration-200 motion-reduce:transition-none",
            isFetching && "pointer-events-none opacity-50",
          )}
          aria-busy={isLoading || isFetching}
        >
          {isLoading ? null : !hasItems ? (
            <EmptyState
              isChild={isChild}
              label={isTournamentTab ? "대회" : "수업"}
              icon={isTournamentTab ? "emoji_events" : "sports_hockey"}
            />
          ) : sections ? (
            /* 학부모/감독 — 유형별 섹션 카드영역 (등록 훈련 → 정규 → 대회 → 오픈) */
            <>
              <ClassSection
                title="등록 훈련"
                count={sections.enrolled.length}
              >
                {sections.enrolled.map((item) => (
                  <div key={item.id} role="listitem">
                    {renderClassCard(item, { forceShowTypeBadge: true })}
                  </div>
                ))}
              </ClassSection>
              <ClassSection
                title="정규훈련"
                count={sections.regular.length}
              >
                {sections.regular.map((item) => (
                  <div key={item.id} role="listitem">
                    {renderClassCard(item)}
                  </div>
                ))}
              </ClassSection>
              <ClassSection
                title="대회"
                count={sections.tournaments.length}
              >
                {sections.tournaments.map((item) => (
                  <div key={item.id} role="listitem">
                    {renderTournamentCard(item)}
                  </div>
                ))}
              </ClassSection>
              <ClassSection
                title="오픈클래스"
                count={sections.open.length}
              >
                {sections.open.map((item) => (
                  <div key={item.id} role="listitem">
                    {renderClassCard(item)}
                  </div>
                ))}
              </ClassSection>
            </>
          ) : (
            /* 아동/청소년 — 기존 단일 리스트 (필터 탭 기반) */
            <>
              {showClasses && filteredClasses.length > 0 && (
                <div
                  className="flex flex-col gap-3"
                  role="list"
                  aria-label="훈련 목록"
                >
                  {filteredClasses.map((item) => (
                    <div key={item.id} role="listitem">
                      {renderClassCard(item)}
                    </div>
                  ))}
                </div>
              )}
              {showTournaments && filteredTournaments.length > 0 && (
                <div
                  className="flex flex-col gap-3"
                  role="list"
                  aria-label="대회 목록"
                >
                  {filteredTournaments.map((item) => (
                    <div key={item.id} role="listitem">
                      {renderTournamentCard(item)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

      </main>
    </MobileContainer>
  );
}
