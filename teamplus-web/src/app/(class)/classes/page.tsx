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
import { EndedCollapseToggle } from "@/components/classes/EndedCollapseToggle";
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
  formatNextScheduleSummary,
  formatPeriodSummary,
  type ClassCategoryCode,
  type DaySchedule,
  type NextScheduleInfo,
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
  /** 주최 팀 ID — 응답 select 에 포함(clubId 와 달리 실제로 내려온다). 승인 대기 팀 판정용. */
  teamId?: string | null;
  /** 주최 팀 요약 — 백엔드 select 의 team 관계. 전체공개 타 팀 수업 카드의 팀명 표기에 사용. */
  team?: { id: string; name: string; logoUrl?: string | null } | null;
  /** [2026-08-04 공개범위 상시 병합] 뷰어 소속 팀 수업 여부 — false 면 전체공개로 노출된
   *  타 팀 수업. '전체공개 수업' 섹션 분리 + 카드 팀명 표기 분기. 구버전 응답은 undefined(내 팀 취급). */
  isViewerTeam?: boolean;
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
  /** 다음 회차 (비취소·오늘 이후) — 요일 규칙 없는 수업 카드 시간 표시 소스. */
  nextSchedule?: NextScheduleInfo | null;
  /** 비취소 총 회차 수 — "총 N회" 표기용. */
  scheduleCount?: number;
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
  /** [Lifecycle v4.1] 서버 파생 상태 — 배지 판정 SoT (역산 폴백보다 우선). */
  lifecycleStatus?: 'ON_SALE' | 'PENDING_SCHEDULE' | 'ENDED';
  /** 수업 장소 (Venue 모델) */
  venue?: { id: string; name: string } | null;
  /** [2026-08-04] 수업 지역 라벨 "서울 강남구" — 백엔드 조합 문자열(regionCity+regionDistrict).
   *  지역 미입력 구 수업은 장소/팀 홈링크장 시/도로 폴백돼 시/도만 온다. */
  regionLabel?: string | null;
}

/**
 * GET /children 응답 중 이 화면이 쓰는 필드만 — 연령 분기 + 가입 승인 대기 팀 판정용.
 * (useChildren.ChildApiItem 의 부분집합 · 별도 fetch 없이 기존 호출 재사용)
 */
interface ChildApprovalItem {
  id: string;
  age?: number;
  birthDate?: string;
  clubMemberships?: Array<{ teamId: string; approvalStatus: string }>;
}

/**
 * '가입 승인 대기' 배지를 띄울 팀 ID — 없으면 null.
 *
 * 배지의 의미는 "이 팀 수업을 지금 신청할 수 있는 선수가 한 명도 없다" 이므로 두 조건을 모두 본다.
 *  ① 선택 자녀가 그 팀에 승인 대기(pending) 중
 *  ② 학부모의 자녀 중 그 팀에 승인(approved)된 선수가 **아무도 없음**
 *
 * ②가 필요한 이유: 형제가 이미 그 팀 승인 선수라면 수업 상세에서 그 선수로 신청·결제가
 * 정상 완료된다(상세는 전체 자녀로 자격을 계산하고 등록 가능한 자녀를 자동 선택한다).
 * 이때 '대기' 배지를 띄우면 신청 불가로 오독된다.
 *
 * 판정은 팀 단위다 — 선택 자녀가 다른 팀에 승인돼 있어도, 이 팀에 대기 중이면 배지 대상.
 * 무소속·거절 자녀는 대상이 아니다(완화 범위는 pending 만).
 */
function resolvePendingTeamId(
  children: ChildApprovalItem[],
  selectedChildId: string | null,
): string | null {
  if (!selectedChildId) return null;
  const selected = children.find((c) => c.id === selectedChildId);
  const pendingTeamId =
    (selected?.clubMemberships ?? []).find(
      (m) => m.approvalStatus === "pending",
    )?.teamId ?? null;
  if (!pendingTeamId) return null;
  const hasApprovedInTeam = children.some((c) =>
    (c.clubMemberships ?? []).some(
      (m) => m.teamId === pendingTeamId && m.approvalStatus === "approved",
    ),
  );
  return hasApprovedInTeam ? null : pendingTeamId;
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

// 시간 표시 SoT: 요일별 기본 일정 패턴 > 첫/다음 회차 실제 시각 > 미표시.
// 대표값(Class.startTime)은 회차별 실제 시각과 다를 수 있어 표시에 사용하지 않는다.

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
  lifecycleStatus?: 'ON_SALE' | 'PENDING_SCHEDULE' | 'ENDED';
  scheduledDates?: string[];
  isClassEnded?: boolean;
}): boolean {
  const dates = item.scheduledDates;
  // [Lifecycle v4.1] 서버 파생 상태(endedAt·spot 자동 종료 반영)가 있으면 역산보다 우선.
  if (item.lifecycleStatus) return item.lifecycleStatus === 'ENDED';
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

/** 대회 종료/취소 판정 — DefaultTournamentCard 상태 칩과 동일 규칙(SoT 공유).
 *  status='finished'/'cancelled' 또는 endDate 경과(날짜 단위). status 는 자동 전이되지 않는다. */
function isTournamentClosed(item: {
  status?: string;
  endDate?: string | null;
}): boolean {
  if (item.status === "finished" || item.status === "cancelled") return true;
  const t = item.endDate ? new Date(item.endDate).getTime() : NaN;
  if (Number.isNaN(t)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return t < today.getTime();
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
      : (formatNextScheduleSummary(
          item.nextSchedule,
          item.scheduleCount ?? item.scheduledDates?.length ?? null,
        ) ??
        formatPeriodSummary(
          item.scheduledDates?.[0],
          item.scheduledDates?.[item.scheduledDates.length - 1],
          item.scheduleCount ?? item.scheduledDates?.length ?? null,
        ));
  const daysLabel = dayScheduleLabel ?? formatScheduleLabel(item);
  const rawTypeLabel = TRAINING_TYPE_LABEL[item.trainingType];
  const typeLabel = rawTypeLabel;

  // [2026-05-19] 등록상태 분기 (학생 본인 시점 — 연령 분기는 user.birthDate 미보장으로 skip)
  const isAlreadyEnrolled = enrolledClassIds?.has(item.id) ?? false;
  let registerLabel = "등록";
  // [상태 칩 soft 통일] 클릭 불가한 상태 표시(카드 전체가 링크)라 솔리드 버튼 모양은
  //   오독 유발 + ICETIMES 플랫 톤·배지 관례(연한 배경+진한 글자)와 충돌 → soft 칩.
  let registerClass =
    "bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-300";
  if (isAlreadyEnrolled) {
    registerLabel = "등록완료";
    registerClass =
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400";
  }
  // [Lifecycle v4.1 §7.3] 일정 준비 중 — 미등록자의 등록 칩 자리를 상태 칩으로 대체.
  //   "등록완료"(본인 수강 상태)는 우선 유지.
  if (!isAlreadyEnrolled && item.lifecycleStatus === 'PENDING_SCHEDULE') {
    registerLabel = MESSAGES.class.preparingSchedule;
    registerClass =
      "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";
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
      : (formatNextScheduleSummary(
          item.nextSchedule,
          item.scheduleCount ?? item.scheduledDates?.length ?? null,
        ) ??
        formatPeriodSummary(
          item.scheduledDates?.[0],
          item.scheduledDates?.[item.scheduledDates.length - 1],
          item.scheduleCount ?? item.scheduledDates?.length ?? null,
        ));
  const rawTypeLabel = TRAINING_TYPE_LABEL[item.trainingType];
  const typeLabel = rawTypeLabel;
  const daysLabel = dayScheduleLabel ?? formatScheduleLabel(item);
  const theme = getTeenTheme(item.trainingType);
  // [2026-05-19] 등록상태 분기 (Teen 본인 시점 — 연령 분기 skip)
  const isAlreadyEnrolled = enrolledClassIds?.has(item.id) ?? false;
  let registerLabel = "등록";
  // [상태 칩 soft 통일] 클릭 불가한 상태 표시(카드 전체가 링크)라 솔리드 버튼 모양은
  //   오독 유발 + ICETIMES 플랫 톤·배지 관례(연한 배경+진한 글자)와 충돌 → soft 칩.
  let registerClass =
    "bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-300";
  if (isAlreadyEnrolled) {
    registerLabel = "등록완료";
    registerClass =
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400";
  }
  // [Lifecycle v4.1 §7.3] 일정 준비 중 — 미등록자의 등록 칩 자리를 상태 칩으로 대체.
  //   "등록완료"(본인 수강 상태)는 우선 유지.
  if (!isAlreadyEnrolled && item.lifecycleStatus === 'PENDING_SCHEDULE') {
    registerLabel = MESSAGES.class.preparingSchedule;
    registerClass =
      "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";
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
  pendingTeamId,
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
  /**
   * '가입 승인 대기' 배지 대상 팀 ID (resolvePendingTeamId SoT). 선택 자녀가 승인 대기 중이고
   * **그 팀에 승인된 형제도 없는** 경우에만 채워진다 — 형제로 신청이 가능하면 null 이라
   * 등록 칩이 유지된다. 이 팀 수업은 열람만 가능하므로 등록 칩을 상태 칩으로 대체한다.
   */
  pendingTeamId?: string | null;
}) {
  const { navigate } = useNavigation();
  // [2026-06-05] 요일별 규칙 우선 — 있으면 "월 17:00 ~ 18:00 / 수 ..." 한 줄(장소 생략),
  //   없으면 기존 요일 라벨 + 단일 시간 결합으로 폴백.
  const dayScheduleLabel = formatDaySchedulesShort(item.daySchedules);
  const time = dayScheduleLabel
    ? null
    : item.trainingType === "lesson"
      ? (item.scheduleTimeLabel ?? null)
      : (formatNextScheduleSummary(
          item.nextSchedule,
          item.scheduleCount ?? item.scheduledDates?.length ?? null,
        ) ??
        formatPeriodSummary(
          item.scheduledDates?.[0],
          item.scheduledDates?.[item.scheduledDates.length - 1],
          item.scheduleCount ?? item.scheduledDates?.length ?? null,
        ));
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
  const classEnded = isClassEndedByLastSchedule(item);
  let registerLabel = "등록";
  // [상태 칩 soft 통일] 클릭 불가한 상태 표시(카드 전체가 링크)라 솔리드 버튼 모양은
  //   오독 유발 + ICETIMES 플랫 톤·배지 관례(연한 배경+진한 글자)와 충돌 → soft 칩.
  let registerClass =
    "bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-300";
  // 우선순위 단일 체인 — 종료(회색·등록 유도 차단) > 등록완료(본인 수강) > 일정 준비 중
  //   > 등록불가(연령) > 등록. 종료 수업은 등록 칩이 무의미해 상태 칩으로 대체한다
  //   (classes-manage 상태 배지 위치와 통일 — 하단 중복 종료 배지는 제거).
  if (classEnded) {
    registerLabel = "종료";
    registerClass = "bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-200";
  } else if (isAlreadyEnrolled) {
    registerLabel = "등록완료";
    registerClass =
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400";
  } else if (!!pendingTeamId && item.teamId === pendingTeamId) {
    // 선택 자녀가 이 팀의 가입 승인을 기다리는 중 — 열람만 가능. 신청은 승인 후.
    //   (백엔드 enrollments 가드가 실제 차단, 여기는 이유를 미리 알리는 표시.)
    registerLabel = MESSAGES.class.pendingTeamApproval;
    registerClass =
      "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";
  } else if (item.lifecycleStatus === 'PENDING_SCHEDULE') {
    // [Lifecycle v4.1 §7.3] 일정 준비 중 — 미등록자의 등록 칩 자리를 상태 칩으로 대체.
    registerLabel = MESSAGES.class.preparingSchedule;
    registerClass =
      "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";
  } else if (!hasAgeEligibleChild) {
    registerLabel = "등록불가";
    registerClass = "bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300";
  }

  const scheduleLine =
    daysLabel || time
      ? `${daysLabel || time}${daysLabel && time ? ` · ${time}` : ''}`
      : null;

  // [2026-08-04 리스트 전환] 카드 인상을 주던 2줄 스택(일정/대상)을 한 줄로 합친다.
  //   일정이 없으면 대상만 남으므로 아이콘도 cake 로 바꿔 의미를 유지.
  const targetLine = `대상: ${formatBirthYears(item.targetBirthYears) ?? '전체'}`;
  const metaLine = scheduleLine ? `${scheduleLine} · ${targetLine}` : targetLine;

  // 출석확인 버튼만 우하단에 유지 — 등록했던 수업 식별 + 이력 진입(종료 후에도 유효).
  const bodyAction =
    isAlreadyEnrolled ? (
      <div className="flex items-center justify-end gap-2">
        {/* 출석확인 — 등록(선불 paid/후불 approved)한 수업에만 본문 우하단에 노출.
            카드 전체가 상세 링크이므로 role=button + preventDefault/stopPropagation 으로
            상세 이동을 막고 출석내역으로 이동. 자녀는 전역 SelectedChildContext 공유라 childId 불필요. */}
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
          className="inline-flex items-center justify-center gap-1 h-[26px] px-2.5 rounded-full text-[12.5px] leading-[1.55] font-bold tracking-[-0.01em] border border-ice-500 text-ice-500 bg-transparent hover:bg-ice-500/10 active:brightness-95 transition-colors motion-reduce:transition-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
          aria-label={`${item.className} 출석 내역 보기`}
        >
          <Icon name="fact_check" className="text-[15px]" aria-hidden="true" />
          출석확인
        </span>
      </div>
    ) : undefined;

  return (
    <ClassListCard
      href={`/classes/${item.id}`}
      iceTheme
      compact
      trainingType={item.trainingType}
      iconImageUrl={item.teamLogoUrl}
      typeBadgeLabel={
        forceShowTypeBadge || !shouldHideTypeBadge(item.trainingType)
          ? typeLabel
          : undefined
      }
      ariaLabel={`${item.className} 수업 상세 보기`}
      title={item.className}
      // 오픈클래스는 소속 아카데미명, 전체공개로 노출된 타 팀 수업(isViewerTeam=false)은
      //   주최 팀명을 subtitle 로 노출. 내 팀 수업은 팀명이 자명해 미노출(기존 정책 유지).
      metaInline={
        item.academyName ??
        (item.isViewerTeam === false ? (item.team?.name ?? undefined) : undefined)
      }
      titleRight={
        /* 등록 상태 칩 — 클릭은 카드 NavLink 가 처리 (시각 표시 전용).
           min-w-[72px] 고정. 준비 중 수업은 이 칩 자리가 "일정 준비 중"으로
           대체된다 (registerLabel 분기 — 별도 하단 배지 없음). */
        <span
          className={cn(
            // [2026-08-04 리스트 전환] 상태 pill — 리스트 행 높이에 맞춰 축소 (2px 8px · 11.5px/700)
            "inline-flex items-center justify-center min-w-[62px] px-2 py-0.5 rounded-full text-[11.5px] leading-[1.55] font-bold tracking-[-0.01em]",
            registerClass,
          )}
          aria-hidden="true"
        >
          {registerLabel}
        </span>
      }
      bodyAction={bodyAction}
    >
      {/* [2026-08-04] 지역 + 일정 + 대상을 한 줄로 합쳐 리스트 행 높이를 고정.
          지역을 맨 앞에 굵게 두는 이유: 좁은 화면에서 잘려도 끝까지 남아야 하는 정보다.
          "서울 수업을 부산 학부모가 신청" 사고를 막는 것이 이 표기의 목적(사용자 지시).
          대상은 입력 없으면 '전체'(전체 대상)로 표기. */}
      <ClassCardInfoRow
        icon={item.regionLabel ? "place" : scheduleLine ? "schedule" : "cake"}
      >
        {item.regionLabel ? (
          <>
            <span className="font-bold text-it-ink-700 dark:text-white">
              {item.regionLabel}
            </span>
            {` · ${metaLine}`}
          </>
        ) : (
          metaLine
        )}
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
  pendingTeamId,
}: {
  item: TournamentListItem;
  /** '가입 승인 대기' 배지 대상 팀 ID — 승인된 형제가 있으면 null(신청 가능하므로 등록 칩 유지). */
  pendingTeamId?: string | null;
}) {
  const dateLabel = formatTournamentDateRange(item.startDate, item.endDate);
  // [2026-06-17] 종료 판정 — 공용 isTournamentClosed (섹션 필터와 동일 SoT).
  const isCancelled = item.status === "cancelled";
  const isClosed = isTournamentClosed(item);
  // [2026-06-17] 자녀 1명이라도 등록(후불=신청, 선불=결제완료)이면 등록완료 표기.
  //   enrolledChildIds: 백엔드가 billingMode 별로 산출(후불 신청 포함 · 폴백 paidChildIds).
  const isEnrolled =
    ((item.enrolledChildIds ?? item.paidChildIds)?.length ?? 0) > 0;
  // 주최 팀 = 선택 자녀가 승인 대기 중인 팀이면 신청 칩을 상태 칩으로 대체.
  const isPendingTeam = !!pendingTeamId && item.team?.id === pendingTeamId;

  return (
    <ClassListCard
      href={`/tournaments/${item.id}`}
      iceTheme
      compact
      trainingType="tournament"
      ariaLabel={`${item.name} 대회 상세 보기`}
      title={item.name}
      titleRight={
        // 상태 칩 — 정규훈련 카드와 동일한 soft 톤·우선순위(종료/취소 > 등록완료 > 등록).
        //   종료된 대회는 등록 칩이 무의미해 상태 칩으로 대체 (하단 중복 종료 배지 제거).
        <span
          className={cn(
            // [2026-08-04 리스트 전환] 상태 pill — 수업 행과 동일 규격 (2px 8px · 11.5px/700)
            "inline-flex items-center justify-center min-w-[62px] px-2 py-0.5 rounded-full text-[11.5px] leading-[1.55] font-bold tracking-[-0.01em]",
            isClosed
              ? "bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-200"
              : isEnrolled
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                : isPendingTeam
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                  : "bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-500/15 dark:text-it-blue-300",
          )}
          aria-hidden="true"
        >
          {isClosed
            ? isCancelled
              ? "취소"
              : "종료"
            : isEnrolled
              ? "등록완료"
              : isPendingTeam
                ? MESSAGES.class.pendingTeamApproval
                : "등록"}
        </span>
      }
    >
      {/* [2026-08-04] 일정 + 참가 대상을 한 줄로 합쳐 리스트 행 높이를 고정.
          대상은 입력 없으면 '전체'(전체 대상)로 표기. */}
      <ClassCardInfoRow icon={dateLabel ? "event" : "cake"}>
        {[dateLabel, `대상: ${formatTournamentTargetYears(item) ?? '전체'}`]
          .filter(Boolean)
          .join(' · ')}
      </ClassCardInfoRow>
    </ClassListCard>
  );
});

// ── Empty State ──────────────────────────────────────

function EmptyState({
  isChild,
  label = "수업",
  icon = "sports_hockey",
  showExploreCta = false,
}: {
  isChild: boolean;
  label?: string;
  icon?: string;
  /** [2026-08-04] 전국 수업 찾기 진입 — 팀 미가입 학부모가 막다른 빈 화면에 갇히지 않게 한다. */
  showExploreCta?: boolean;
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

      {/* [2026-08-04] 전국 수업 찾기 — 자녀가 팀에 가입되지 않으면 정규수업은 항상 0건이라
          여기서 끝나면 학부모가 할 수 있는 게 없다. 발견 경로로 이어준다. */}
      {showExploreCta && (
        <NavLink
          href="/classes-explore"
          className="mt-6 inline-flex items-center gap-1.5 h-11 px-5 rounded-w-pill text-card-body font-bold bg-it-blue-500 text-white transition-colors motion-reduce:transition-none active:brightness-95"
        >
          <Icon name="search" className="text-[18px]" aria-hidden="true" />
          {MESSAGES.class.exploreBannerCta}
        </NavLink>
      )}
    </div>
  );
}

// ── 섹션 영역 (학부모/감독 — 정규수업/오픈클래스/대회 구분) ──────────
// [2026-06-12→06-24 ICETIMES flat] 상단 필터 태그 제거 → 유형별 섹션으로 분리.
// [2026-08-04 리스트 전환] 사용자 지시 "목록이 카드형태로 보이지 않게" —
//   흰 패널을 회색 갭으로 띄우던 구조(mt-2)를 제거해 섹션이 하나의 연속된 목록으로 이어지고,
//   구분은 연회색 그룹 헤더 바(13px)가 담당한다. 항목 행은 공유 ClassListCard
//   iceTheme + compact(32px 아이콘 · 1줄 제목 · 1줄 메타)로 카드 인상을 제거했다.
//   섹션 내부는 등록완료 → 등록(미등록) 순으로 정렬한다.
function ClassSection({
  title,
  count,
  children,
  footer,
  emptyText,
}: {
  title: string;
  count: number;
  children: ReactNode;
  /** 섹션 하단 부가 영역 — 종료 항목 접힘 토글 등. 있으면 count 0 이어도 섹션 유지. */
  footer?: ReactNode;
  /** count 0 인데 섹션이 유지될 때(footer 존재) 표시할 빈 상태 문구. */
  emptyText?: string;
}) {
  if (count === 0 && !footer) return null;
  return (
    <section
      aria-label={`${title} 목록`}
      className="bg-it-surface dark:bg-it-blue-950"
    >
      {/* [2026-08-04 리스트 전환] 회색 갭(mt-2)으로 흰 패널을 띄우면 섹션 자체가 '카드'로
          읽힌다 → 갭 제거 + 그룹 헤더 바(연회색 + 하단 hairline)로 구분하는 리스트 형태. */}
      <header className="flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-it-fill dark:bg-it-ink-900/60 border-b border-it-line dark:border-it-ink-700">
        <h2 className="text-[13px] font-bold tracking-[-0.01em] text-it-ink-500 dark:text-it-ink-300">
          {title}
        </h2>
        <span className="text-[13px] font-bold text-it-blue-500 dark:text-it-blue-300 tabular-nums">
          {count}
        </span>
      </header>
      {count === 0 && emptyText ? (
        <p className="px-4 sm:px-5 py-6 text-card-body text-wtext-3 dark:text-wtext-4 text-center">
          {emptyText}
        </p>
      ) : (
        <div role="list">{children}</div>
      )}
      {footer}
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

  // 목록 스코프는 BE 가 결정한다 (2026-08-04 공개범위 상시 병합):
  //  - 내 팀(자녀 경유) 수업 전체 + 공개범위가 허용하는 타 팀 수업(PUBLIC/PARENTS_ONLY)
  //  - 타 팀 수업은 isViewerTeam=false 로 내려와 '전체공개 수업' 섹션으로 분리 렌더
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
  // 선택 자녀가 가입 승인을 기다리는 팀 ID — 그 팀 훈련·대회는 열람만 가능(신청은 승인 후).
  //   백엔드가 pending 팀 목록을 함께 내려주므로, 카드에 이유를 표시하기 위한 판정값.
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
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
        ? classes.filter((c) => ['regular', 'spot'].includes(c.trainingType ?? ''))
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
    // 종료 항목은 일반 목록에서 전부 내리고, 자녀가 참여했던 것만 섹션 하단
    //   '종료된 훈련/대회' 접힘 영역으로 분리한다 (미참여 종료분은 이력 가치가 없어 숨김).
    const isEnded = (c: ClassItem) => isClassEndedByLastSchedule(c);
    // 대회 참가 판정 — 카드 등록완료 표기와 동일 기준(enrolledChildIds ?? paidChildIds).
    const isTournamentEnrolled = (t: TournamentListItem) =>
      ((t.enrolledChildIds ?? t.paidChildIds)?.length ?? 0) > 0;
    // [2026-08-04 공개범위 상시 병합] 백엔드가 전체공개(PUBLIC 등) 타 팀 수업을 함께
    //   내려준다(isViewerTeam=false). 내 팀 수업으로 오인하지 않도록 '전체공개 수업'
    //   별도 섹션으로 분리한다. 구버전 응답(필드 없음)은 내 팀 취급(!== false).
    const isExternal = (c: ClassItem) => c.isViewerTeam === false;
    return {
      enrolled: classes.filter((c) => isEnrolled(c) && !isEnded(c)),
      // 참여했던 종료 훈련 — '등록 훈련' 섹션 하단 접힘 (이력 확인용).
      endedEnrolled: classes.filter((c) => isEnrolled(c) && isEnded(c)),
      regular: classes.filter(
        (c) => !isOpen(c) && !isEnrolled(c) && !isEnded(c) && !isExternal(c),
      ),
      // 전체공개로 노출된 타 팀 수업 — 발견(discovery) 카탈로그.
      publicPool: classes.filter(
        (c) => !isOpen(c) && !isEnrolled(c) && !isEnded(c) && isExternal(c),
      ),
      open: classes.filter((c) => isOpen(c) && !isEnrolled(c) && !isEnded(c)),
      tournaments: tournaments.filter((t) => !isTournamentClosed(t)),
      // 참가했던 종료/취소 대회 — '대회' 섹션 하단 접힘.
      endedTournaments: tournaments.filter(
        (t) => isTournamentClosed(t) && isTournamentEnrolled(t),
      ),
    };
  }, [viewMode, classes, tournaments, enrolledClassIds]);

  // 종료 접힘 영역 펼침 상태 — 섹션별 독립 (기본 접힘).
  const [showEndedClasses, setShowEndedClasses] = useState(false);
  const [showEndedTournaments, setShowEndedTournaments] = useState(false);

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
        //   'regular' 탭은 trainingType regular+spot 노출(§7.1 — spot 은 정규 취급, 클라이언트 필터에서 분리).
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
          | { classId?: string; childId?: string; class?: { id?: string; billingMode?: string }; product?: { billingTiming?: string } | null; status?: string; hasValidPass?: boolean | null }[]
          | {
              data: {
                classId?: string;
                childId?: string;
                class?: { id?: string; billingMode?: string };
                product?: { billingTiming?: string } | null;
                status?: string;
                hasValidPass?: boolean | null;
              }[];
            }
        >("/enrollments");

        // children — default 시점만 호출.
        //   clubMemberships 를 함께 읽어 선택 자녀의 '가입 승인 대기' 팀도 판정한다
        //   (별도 fetch 없이 기존 호출 재사용 — useChildren.toChild 와 동일 우선순위).
        const childrenPromise =
          viewMode === "default"
            ? api.get<ChildApprovalItem[] | { data: ChildApprovalItem[] }>(
                "/children",
              )
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
            // 선불 paid OR 후불(POSTPAID·BOTH 후불상품) approved 만 "등록완료"로 간주 (공통 SoT).
            if (
              !isActiveEnrollment(
                e.status,
                e.class?.billingMode,
                e.product?.billingTiming,
                e.hasValidPass,
              )
            )
              return;
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
          // '가입 승인 대기' 배지 대상 팀 — 같은 팀에 승인된 형제가 있으면 신청 가능하므로 제외.
          setPendingTeamId(
            resolvePendingTeamId(
              Array.isArray(arr) ? arr : [],
              selectedChildId,
            ),
          );
        } else if (viewMode === "default") {
          setChildAges([]);
          setPendingTeamId(null);
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
            pendingTeamId={pendingTeamId}
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
        return (
          <DefaultTournamentCard
            key={item.id}
            item={item}
            pendingTeamId={pendingTeamId}
          />
        );
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
  // [2026-07-27 수정] 학부모/감독(default) 뷰는 섹션 분류 후 렌더하므로 fetch 원본이
  //   있어도 전부 종료+미참여로 걸러지면 모든 섹션이 숨겨져(count 0 && !footer → null)
  //   빈 화면이 남던 버그 — 섹션 기준으로 노출 개수를 재계산해 이 경우
  //   EmptyState("등록된 수업이 없습니다")를 표시한다.
  const visibleCount = sections
    ? sections.enrolled.length +
      sections.endedEnrolled.length +
      sections.regular.length +
      sections.publicPool.length +
      sections.open.length +
      sections.tournaments.length +
      sections.endedTournaments.length
    : visibleClassCount + visibleTournamentCount;
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

        {/* [2026-08-04] 전국 수업 찾기 진입 배너 — 학부모 전용.
            이 목록은 자녀의 소속 팀 수업만 보여주므로, 다른 클럽 수업을 찾을 경로가 필요하다.
            아동/청소년은 보호자가 등록하는 구조라 제외한다. */}
        {/* [2026-08-04 리스트 전환] 둥근 배너 박스(rounded + 좌우 여백)는 목록 위에서 '카드'로
            읽혀 흐름을 끊는다 → 목록 행과 같은 full-bleed 행으로 이어 붙인다. */}
        {!isChild && !isTeen && !isLoading && (
          <div>
            <NavLink
              href="/classes-explore"
              className="flex items-center gap-2.5 w-full px-4 py-3 bg-it-surface dark:bg-it-ink-900 border-b border-it-line dark:border-it-ink-700 transition-colors motion-reduce:transition-none active:brightness-95"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-it-blue-500/10 text-it-blue-500"
                aria-hidden="true"
              >
                {/* ⚠️ 아이콘은 서브셋 폰트(public/fonts/MaterialSymbolsOutlined.woff2, 389자)에
                    포함된 것만 사용할 것. 미포함 아이콘은 엉뚱한 glyph 로 렌더된다.
                    (2026-08-04: travel_explore 가 미포함이라 깨져 explore 로 교체) */}
                <Icon name="explore" className="text-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                  {MESSAGES.class.exploreBannerTitle}
                </span>
                <span className="block truncate text-[12.5px] font-medium text-it-ink-500 dark:text-wtext-4 mt-0.5">
                  {MESSAGES.class.exploreBannerDesc}
                </span>
              </span>
              <Icon
                name="chevron_right"
                className="text-[20px] text-it-ink-400 dark:text-wtext-4 shrink-0"
                aria-hidden="true"
              />
            </NavLink>
          </div>
        )}

        {/* [2026-08-04 공개범위 상시 병합] 소속 팀 수업이 하나도 없고 전체공개 수업만 보이는
            상태 안내 — 목록 행과 같은 full-bleed 행으로 이어 붙여 리스트 흐름을 유지한다. */}
        {!isChild &&
          !isTeen &&
          !isLoading &&
          !!sections &&
          sections.enrolled.length === 0 &&
          sections.endedEnrolled.length === 0 &&
          sections.regular.length === 0 &&
          sections.publicPool.length > 0 && (
          <div
            className="flex items-start gap-2 px-4 sm:px-5 py-3 bg-it-blue-500/5 dark:bg-it-blue-500/10 border-b border-it-line dark:border-it-ink-700"
            role="status"
          >
            <Icon
              name="info"
              className="text-[16px] text-it-blue-500 dark:text-it-blue-300 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-[12.5px] font-medium leading-relaxed text-it-ink-600 dark:text-rink-100">
              {MESSAGES.class.publicFallbackNotice}
            </p>
          </div>
        )}

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
              // 학부모 전용 — 아동/청소년은 보호자가 등록하는 구조라 탐색 진입을 노출하지 않는다.
              // 대회 탭에서도 숨긴다(수업 탐색과 무관).
              showExploreCta={!isChild && !isTeen && !isTournamentTab}
            />
          ) : sections ? (
            /* 학부모/감독 — 유형별 섹션 카드영역 (등록 훈련 → 정규 → 대회 → 오픈) */
            <>
              <ClassSection
                title="등록 훈련"
                count={sections.enrolled.length}
                emptyText={MESSAGES.class.noActiveClasses}
                footer={
                  // 참여했던 종료 훈련 — 기본 접힘, 펼치면 '종료' 칩 카드로 이력 확인.
                  sections.endedEnrolled.length > 0 ? (
                    <>
                      <EndedCollapseToggle
                        title={MESSAGES.class.endedTrainingSection}
                        count={sections.endedEnrolled.length}
                        expanded={showEndedClasses}
                        onToggle={() => setShowEndedClasses((v) => !v)}
                      />
                      {showEndedClasses && (
                        <div role="list">
                          {sections.endedEnrolled.map((item) => (
                            <div key={`ended-${item.id}`} role="listitem">
                              {renderClassCard(item, { forceShowTypeBadge: true })}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : undefined
                }
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
              {/* [2026-08-04 공개범위 상시 병합] 전체공개로 노출된 타 팀 수업 —
                  내 팀 '정규훈련'과 분리해 오인을 막고, 카드에는 주최 팀명이 표기된다. */}
              <ClassSection
                title={MESSAGES.class.publicFallbackSection}
                count={sections.publicPool.length}
              >
                {sections.publicPool.map((item) => (
                  <div key={item.id} role="listitem">
                    {renderClassCard(item)}
                  </div>
                ))}
              </ClassSection>
              <ClassSection
                title="대회"
                count={sections.tournaments.length}
                emptyText={MESSAGES.class.noActiveTournaments}
                footer={
                  // 참가했던 종료/취소 대회 — 기본 접힘, 펼치면 '종료'/'취소' 칩 카드로 이력 확인.
                  sections.endedTournaments.length > 0 ? (
                    <>
                      <EndedCollapseToggle
                        title={MESSAGES.class.endedTournamentSection}
                        count={sections.endedTournaments.length}
                        expanded={showEndedTournaments}
                        onToggle={() => setShowEndedTournaments((v) => !v)}
                      />
                      {showEndedTournaments && (
                        <div role="list">
                          {sections.endedTournaments.map((item) => (
                            <div key={`ended-tnmt-${item.id}`} role="listitem">
                              {renderTournamentCard(item)}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : undefined
                }
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
