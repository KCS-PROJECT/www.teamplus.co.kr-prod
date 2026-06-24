'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { Icon } from '@/components/ui/Icon';
import { ClassListCard, ClassCardInfoRow } from '@/components/classes/ClassListCard';
import { useNavigation } from '@/components/ui/NavLink';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { usePathname } from 'next/navigation';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { openShareSheet } from '@/lib/share';
import { resolveImageUrl } from '@/lib/image-url';
import { api } from '@/services/api-client';
import {
  listTournaments,
  type TournamentListItem,
} from '@/services/tournament.service';
import { shouldHideTypeBadge } from '@/lib/class-categories';


// ─── Types ──────────────────────────────────────────
interface ClassItem {
  id: string;
  title: string;
  dayOfWeek: string;
  time: string;
  startTime?: string;
  endTime?: string;
  /** [2026-06-09] 오픈클래스 날짜별 일정(ISO) — 카드 일정 날짜 표시. */
  scheduledDates?: string[];
  /** [추가 2026-05-12] 실제 운영 기간 — schedules first/last (startTime/endTime은 하루 세션 시간만 의미) */
  firstScheduleDate?: string | null;
  lastScheduleDate?: string | null;
  classDays?: string[];
  location: string;
  studentCount: number;
  maxStudents: number;
  level: string;
  /** U8~U12 신규 카테고리 또는 레거시 KIDS/JUNIOR/ADULT 값 */
  category: string;
  /** [추가 2026-05-13] 대상연령 — category 가 명시되지 않으면 ageMin/ageMax 로 도출 */
  ageMin?: number | null;
  ageMax?: number | null;
  /** [추가 2026-06-19] 대상 출생연도 — 카드에 "2014, 2015년생" 표기용 */
  targetBirthYears?: number[] | null;
  status: 'ACTIVE' | 'INACTIVE' | 'COMPLETED';
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  coach: string;
  /** [추가 2026-05-11] 코치의 실제 userType (백엔드 응답) — 호칭(감독/코치) 결정용 */
  coachUserType?: string | null;
  /** [추가 2026-05-12] 다중 코치 배정 (ClassCoachAssignment ACCEPTED) — LEAD 먼저 */
  coachAssignments?: Array<{
    coachUserId: string;
    role: string; // LEAD | ASSISTANT
    coachName: string;
    coachUserType?: string | null;
  }>;
  singlePrice?: number;
  monthlyPrice?: number;
  /** [추가 2026-05-15 T03 협업] 가격 표시 라벨 (tbd/krw).
   *  krw → 금액원, tbd → "별도 책정". null 시 금액 기반 폴백. */
  singlePriceLabel?: 'tbd' | 'krw' | null;
  monthlyPriceLabel?: 'tbd' | 'krw' | null;
  /** 정기 패키지 총 회수 (ClassProduct.sessionsPerMonth — 백엔드 packageTotalSessions).
   *  ⚠️ 구 데이터(sessionsPerMonth=4 잔재) 신뢰 불가 — packageWeeks × packageSessionsPerWeek 우선 사용.
   *  UI 폴백용. null/0 이면 '월정액' 폴백. */
  packageTotalSessions?: number | null;
  /** 정기 패키지 운영 주(week) 수 — durationDays / 7. UI '{N}주(...회)' 라벨용. */
  packageWeeks?: number | null;
  /** 정기 패키지 주당 횟수 — ClassProduct.sessionsPerWeek (fallback: classDays.length).
   *  총 회수 = packageWeeks × packageSessionsPerWeek (PACKAGE_WEEKS_SPEC §3 SoT). */
  packageSessionsPerWeek?: number | null;
  teamLogoUrl?: string | null;
  /** classes 도메인 수업 유형 (regular/lesson). 2026-05-11 회의 정책 SoT. */
  trainingType?: string | null;
  /** [추가 2026-05-15] 오픈클래스 구분 — academyId 가 있으면 오픈클래스(open 탭). */
  academyId?: string | null;
}

// [추가 2026-05-11] 로그인 사용자 역할 → 한글 라벨 매핑.
//  · 수업 카드의 "{이름} 코치" 하드코딩을 본인 역할에 맞는 호칭으로 동적화.
//  · 예: 임감독(DIRECTOR) → "임감독 감독", 김코치(COACH) → "김코치 코치"
//  · 클래스 instructor 가 로그인 사용자와 다른 경우에도 본인 컨텍스트 기반.
const ROLE_KO_LABEL: Record<string, string> = {
  ADMIN: '관리자',
  SYSTEM: '관리자',
  OPER: '관리자',
  DIRECTOR: '감독',
  ACADEMY_DIRECTOR: '감독',
  COACH: '코치',
  PARENT: '부모',
  TEEN: '학생',
  CHILD: '학생',
};
function getRoleLabel(userType?: string | null): string {
  if (!userType) return '코치';
  const upper = userType.toUpperCase();
  return ROLE_KO_LABEL[upper] ?? '코치';
}

// [추가 2026-05-11] 요일 표기 정규화 — DB 가 한글("월","화",...) 또는 영어("MON","TUE",...) 혼재.
//  · 화면 표시는 한글 단일로 통일.
//  · 정렬은 월요일 시작 (월/화/수/목/금/토/일).
const DAY_NORMALIZE_MAP: Record<string, string> = {
  // 한글 단일
  '일': '일', '월': '월', '화': '화', '수': '수', '목': '목', '금': '금', '토': '토',
  // 영어 3글자 / 풀네임 (대소문자 무관)
  SUN: '일', SUNDAY: '일',
  MON: '월', MONDAY: '월',
  TUE: '화', TUES: '화', TUESDAY: '화',
  WED: '수', WEDNESDAY: '수',
  THU: '목', THUR: '목', THURSDAY: '목',
  FRI: '금', FRIDAY: '금',
  SAT: '토', SATURDAY: '토',
};

// 월요일 시작 정렬 인덱스 (월=0, ..., 일=6)
const DAY_ORDER_MON_FIRST: Record<string, number> = {
  '월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5, '일': 6,
};

function normalizeDayLabel(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  return DAY_NORMALIZE_MAP[t] ?? DAY_NORMALIZE_MAP[t.toUpperCase()] ?? '';
}

/** ["MON","WED","FRI"] → ["월","수","금"] · 항상 월요일 시작 정렬 */
function normalizeClassDays(input: string[] | undefined | null): string[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  const koreans = input
    .map(normalizeDayLabel)
    .filter((d): d is string => Boolean(d));
  // 중복 제거 + 월요일 시작 정렬
  const uniq = Array.from(new Set(koreans));
  uniq.sort(
    (a, b) =>
      (DAY_ORDER_MON_FIRST[a] ?? 99) - (DAY_ORDER_MON_FIRST[b] ?? 99),
  );
  return uniq;
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
    `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  const fmtMonthDay = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  if (first.getTime() === last.getTime()) return fmtFull(first);
  const end =
    first.getFullYear() === last.getFullYear() ? fmtMonthDay(last) : fmtFull(last);
  return `${fmtFull(first)} ~ ${end}`;
}

/** [2026-06-19] 대상 출생연도 — "2014, 2015년생" 형태. 중복 제거 + 오름차순. */
function formatBirthYears(years?: number[] | null): string | null {
  if (!Array.isArray(years) || years.length === 0) return null;
  const sorted = Array.from(new Set(years.filter((y) => Number.isFinite(y)))).sort(
    (a, b) => a - b,
  );
  if (sorted.length === 0) return null;
  return `${sorted.join(', ')}년생`;
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

/**
 * [추가 2026-05-12] 수업 기간 라벨 — 우측에 표시.
 *  · 동일 날짜 (start === end) → "단일"
 *  · 그 외 → 주(week) — ceil(daysDiff / 7) (수업 상세 페이지 동일 공식)
 *
 * [수정 2026-05-12] 상세 페이지(classes/[id]) 와 동일한 ceil(days/7) 사용.
 *  기존엔 (+1) 로 1주 더 크게 나왔던 오차 제거 (목록 5주 vs 상세 4주 불일치 해소).
 */
// [2026-06-04] formatDurationLabel 제거 — 카드 우측 기간(N주) 배지 삭제로 미사용.

// 탭 분류 — 학부모 /classes 와 통일.
//   regular: 정규 수업 (teamId 기반)
//   tournament: 대회 — 외부 라우팅 제거, 동일 페이지 내 필터로만 동작
// 'open' 미포함 — 오픈클래스는 ACADEMY_DIRECTOR `/academy-classes` 전용 (팀↔오픈 도메인 분리).
type CategoryKey = 'all' | 'regular' | 'tournament';

/**
 * [추가 2026-05-13] 수업의 category 라벨 도출.
 *  - category 가 명시되어 있으면 그대로 사용 (ALL/U8~U12/KIDS/JUNIOR/ADULT).
 *  - 비어있으면 ageMin/ageMax 로 U{age} 자동 도출 — 수정 후 즉시 반영되도록.
 *  - 둘 다 없으면 'ALL'.
 */
function deriveCategoryLabel(
  category?: string | null,
  ageMin?: number | null,
  ageMax?: number | null,
): string {
  const c = (category ?? '').trim();
  // ageMin/ageMax 우선 — 사용자가 수정한 값을 즉시 반영
  if (ageMax != null) {
    if (ageMax >= 8 && ageMax <= 12) return `U${ageMax}`;
  }
  if (ageMin != null && ageMin >= 8 && ageMin <= 12) return `U${ageMin}`;
  if (c) return c;
  return 'ALL';
}

// ─── Mode Config (수업 유형 = trainingType SoT 기반 색상 시스템) ────
//   · REGULAR (정규 수업)  → emerald-500  · 팀 정기 수업 (반복 일정)
//   · LESSON  (오픈클래스)        → ice-500 · 오픈클래스가 운영하는 오픈클래스
// 색상은 lib/calendar-colors.ts 의 소문자 키(regular/lesson)와 정합.
// 옛 데이터(regular_class/group_class/game/fun/camp) + training 도메인 대문자값은
// 모두 REGULAR 로 fallback 한다 (호환 매핑).
type ClassMode = 'REGULAR' | 'LESSON';

const MODE_CONFIG: Record<ClassMode, {
  label: string;
  bgColor: string;
  textColor: string;
  accentBorder: string;
  priceBg: string;
  priceBorder: string;
  priceText: string;
}> = {
  REGULAR: {
    label: '정규훈련',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    accentBorder: 'bg-emerald-500',
    priceBg: 'bg-emerald-50 dark:bg-emerald-900/15',
    priceBorder: 'border-emerald-100 dark:border-emerald-500/20',
    priceText: 'text-emerald-700 dark:text-emerald-400',
  },
  LESSON: {
    // [2026-05-13] '레슨' → '오픈클래스' — 회의록(L533, L962) "오픈클래스" 도메인 표현 통일.
    //   trainingType='lesson' = Academy.classes (오픈클래스 감독 운영 수업).
    label: '오픈클래스',
    bgColor: 'bg-ice-50 dark:bg-ice-500/15',
    textColor: 'text-ice-600 dark:text-ice-500',
    accentBorder: 'bg-ice-500',
    priceBg: 'bg-ice-50 dark:bg-ice-500/10',
    priceBorder: 'border-ice-100 dark:border-ice-500/20',
    priceText: 'text-ice-700 dark:text-ice-500',
  },
};

function resolveMode(item: ClassItem): ClassMode {
  // trainingType SoT (회의 정책 2026-04-23). 옛 데이터 + training 도메인 대문자값은
  // REGULAR 로 안전하게 fallback. toLowerCase 로 대문자 데이터까지 흡수.
  const t = String(item.trainingType ?? '').toLowerCase();
  if (t === 'lesson' || t === 'academy_lesson' || t === 'game_lesson') {
    return 'LESSON';
  }
  return 'REGULAR';
}

// ─── 기간 기반 상태 (B1 2026-05-26) ───────────────────
//  수업/대회의 진행 상태를 DB status 가 아닌 "오늘 날짜 ↔ 시작/종료일" 비교로 산출.
//   · 종료일 < 오늘            → 'ENDED'    (종료)
//   · 시작일 > 오늘            → 'UPCOMING' (예정)
//   · 시작일 ≤ 오늘 ≤ 종료일   → 'ONGOING'  (진행 중)
//  날짜 경계(자정)·KST: 시/분/초를 절삭하고 연·월·일(브라우저 로컬=KST) 만 비교한다.
//  종료일 미지정 시 시작일을 종료일로 간주 (단일 세션 — formatDurationLabel 동일 컨벤션).
type PeriodStatus = 'UPCOMING' | 'ONGOING' | 'ENDED';

function toDateOnly(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function resolvePeriodStatus(
  startIso?: string | null,
  endIso?: string | null,
): PeriodStatus | null {
  const start = toDateOnly(startIso);
  const end = toDateOnly(endIso) ?? start;
  if (!start && !end) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (end && end.getTime() < today.getTime()) return 'ENDED';
  if (start && start.getTime() > today.getTime()) return 'UPCOMING';
  return 'ONGOING';
}

// ─── Status Config ───────────────────────────────────
type CardStatus = 'PENDING' | 'REJECTED' | 'ACTIVE' | 'INACTIVE' | 'UPCOMING' | 'ENDED';

const STATUS_CONFIG: Record<CardStatus, {
  label: string;
  icon: string;
  dotColor: string;
  pillBg: string;
  pillText: string;
}> = {
  PENDING: {
    label: '승인 대기',
    icon: 'hourglass_top',
    dotColor: 'bg-yellow-500',
    pillBg: 'bg-yellow-50 dark:bg-yellow-900/20',
    pillText: 'text-yellow-700 dark:text-yellow-400',
  },
  REJECTED: {
    label: '거절됨',
    icon: 'block',
    dotColor: 'bg-red-500',
    pillBg: 'bg-red-50 dark:bg-red-900/20',
    pillText: 'text-red-700 dark:text-red-400',
  },
  ACTIVE: {
    label: '진행 중',
    icon: 'play_circle',
    dotColor: 'bg-emerald-500',
    pillBg: 'bg-emerald-50 dark:bg-emerald-900/20',
    pillText: 'text-emerald-700 dark:text-emerald-400',
  },
  INACTIVE: {
    label: '비활성',
    icon: 'pause_circle',
    dotColor: 'bg-wtext-4',
    pillBg: 'bg-wline dark:bg-rink-700',
    pillText: 'text-wtext-3 dark:text-wtext-4',
  },
  // [B1 2026-05-26] 시작 전 — ice(블루) 톤.
  UPCOMING: {
    label: '예정',
    icon: 'event_upcoming',
    dotColor: 'bg-ice-500',
    pillBg: 'bg-ice-50 dark:bg-ice-500/15',
    pillText: 'text-ice-700 dark:text-ice-500',
  },
  // [B1 2026-05-26] 기간 종료 — 중립 회색 톤.
  ENDED: {
    label: '종료',
    icon: 'check_circle',
    dotColor: 'bg-wtext-4',
    pillBg: 'bg-wline dark:bg-rink-700',
    pillText: 'text-wtext-3 dark:text-wtext-4',
  },
};

function resolveStatus(item: ClassItem): CardStatus {
  if (item.approvalStatus === 'PENDING') return 'PENDING';
  if (item.approvalStatus === 'REJECTED') return 'REJECTED';
  // 상태(예정/진행/종료)는 실제 일정(ClassSchedule)의 첫·마지막 날짜를 SoT 로 판단한다.
  //   입력 기간(Class.startTime/endTime)은 실제 운영 일정과 어긋날 수 있어(특히 오픈클래스·
  //   일정 누적 운영) 일정이 남았는데도 '종료'로 표시되던 문제를 방지. 일정 메타가 없으면
  //   기존 startTime/endTime 로 폴백(회귀 방지).
  const period = resolvePeriodStatus(
    item.firstScheduleDate ?? item.startTime,
    item.lastScheduleDate ?? item.endTime,
  );
  // 기간이 끝난 수업은 DB status 와 무관하게 '종료' (기간이 SoT).
  if (period === 'ENDED') return 'ENDED';
  // 운영자가 명시적으로 비활성/완료 처리한 수업.
  if (item.status === 'INACTIVE' || item.status === 'COMPLETED') return 'INACTIVE';
  // 아직 시작 전이면 '예정'.
  if (period === 'UPCOMING') return 'UPCOMING';
  // 진행 기간 내 또는 날짜 미정 + ACTIVE → '진행 중'.
  return 'ACTIVE';
}

// ─── Class Card (04b 감독 수업 목록 개선판 + 2색 모드 시스템) ───
// · 수업 유형(trainingType) → 색상 결정: REGULAR=emerald / LESSON=ice
// · 좌측 4px 컬러 액센트 + 52px 아이콘 + 카테고리 라벨 배지 + 모드 라벨
// · 빠른 액션 footer는 NavLink 외부에 분리 (클릭 시 상세 이동 차단)
function ClassCard({ item }: { item: ClassItem }) {
  const mode = resolveMode(item);
  const modeCfg = MODE_CONFIG[mode];
  const status = resolveStatus(item);
  const statusCfg = STATUS_CONFIG[status];
  const isDimmed = status === 'PENDING' || status === 'REJECTED';

  return (
    <ClassListCard
      href={`/classes/${item.id}`}
      iceTheme
      trainingType={item.trainingType}
      iconImageUrl={item.teamLogoUrl}
      typeBadgeLabel={shouldHideTypeBadge(item.trainingType) ? undefined : modeCfg.label}
      dimmed={isDimmed}
      titleDimmed={isDimmed}
      ariaLabel={`${item.title} 훈련 상세 보기`}
      title={item.title}
      titleRight={
        // [2026-06-19] 진행 상태(예정/진행 중/종료) 배지를 제목 줄 우측 상단으로 이동.
        <span
          className={cn(
            'inline-flex items-center px-2.5 py-1 rounded-full text-card-meta font-bold',
            statusCfg.pillBg,
            statusCfg.pillText,
          )}
        >
          {statusCfg.label}
        </span>
      }
    >
      {status === 'PENDING' && (
        <p className={cn('px-3 py-2 rounded-lg text-card-meta font-semibold', statusCfg.pillBg, statusCfg.pillText)}>
          관리자 승인을 기다리고 있습니다
        </p>
      )}
      {status === 'REJECTED' && (
        <p className={cn('px-3 py-2 rounded-lg text-card-meta font-semibold', statusCfg.pillBg, statusCfg.pillText)}>
          관리자에 의해 거절된 훈련입니다
        </p>
      )}
      {/* 전체일정 — 모든 타입 실제 일정 날짜로 통일 (등록일자 제거 · 2026-06-10 사용자 지시). */}
      {(() => {
        const allDates = formatOpenClassDates(item.scheduledDates);
        return allDates ? (
          <ClassCardInfoRow icon="event_available" iconClassName={modeCfg.textColor} strong>
            <span className="font-medium text-wtext-3 dark:text-rink-300">전체일정 </span>
            {allDates}
          </ClassCardInfoRow>
        ) : null;
      })()}
      <ClassCardInfoRow icon="schedule">
        {item.dayOfWeek
          ? `${item.dayOfWeek} ${item.time}`.trim()
          : item.time || '시간 미정'}
      </ClassCardInfoRow>
      {/* [2026-06-19] 대상 출생연도 — 입력 없으면 '전체'(전체 대상)로 표기. */}
      <ClassCardInfoRow icon="cake">
        {formatBirthYears(item.targetBirthYears) ?? '전체'}
      </ClassCardInfoRow>
    </ClassListCard>
  );
}

// ─── 대회 카드 (classes-manage 대회 탭 전용) ──────────
// [2026-06-11] 팀감독 정규수업 카드(ClassCard)와 동일 골격으로 통일.
//   ClassListCard 공통 셸 사용 → 아이콘 박스(대회=빨강 trophy) + 진행중 상태배지(topRight)
//   + 수업명 + 일정 InfoRow. (이전: 자체 레이아웃이라 정규수업 카드와 형태/아이콘이 달랐음)
//   클릭 시 /tournaments/[id] 대회 정보 페이지로 이동.
function TournamentManageCard({ item }: { item: TournamentListItem }) {
  const fmtDate = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  };
  const dateLabel = (() => {
    const s = fmtDate(item.startDate);
    const e = fmtDate(item.endDate);
    if (s && e) return s === e ? s : `${s} ~ ${e}`;
    return s || e || '';
  })();
  // [B1 2026-05-26] 대회도 동일 규칙 — 기간 지난 대회가 '예정'으로 표시되던 문제 보정.
  //   'cancelled'(취소)는 날짜로 도출 불가한 수동 상태이므로 우선 유지.
  const statusLabel = (() => {
    if (item.status === 'cancelled') return '취소';
    const period = resolvePeriodStatus(item.startDate, item.endDate);
    if (period === 'ENDED') return '종료';
    if (period === 'UPCOMING') return '예정';
    if (period === 'ONGOING') return '진행 중';
    // 날짜 미정 → 기존 status 폴백.
    return item.status === 'finished'
      ? '종료'
      : item.status === 'ongoing'
        ? '진행 중'
        : '예정';
  })();
  // [2026-06-17] 상태(예정/진행 중/종료/취소)를 학부모 수업목록처럼 우측 하단 배지로 표기.
  const statusPill =
    statusLabel === '진행 중'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
      : statusLabel === '예정'
        ? 'bg-ice-50 text-ice-700 dark:bg-ice-500/15 dark:text-ice-500'
        : statusLabel === '종료'
          ? 'bg-wline text-wtext-3 dark:bg-rink-700 dark:text-wtext-4'
          : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400';

  return (
    <ClassListCard
      href={`/tournaments/${item.id}`}
      iceTheme
      trainingType="tournament"
      ariaLabel={`${item.name} 대회 상세 보기`}
      title={item.name}
      titleRight={
        // [2026-06-19] 대회 상태 배지를 제목 줄 우측 상단으로 이동.
        <span
          className={cn(
            'inline-flex items-center px-2.5 py-1 rounded-full text-card-meta font-bold',
            statusPill,
          )}
        >
          {statusLabel}
        </span>
      }
    >
      {dateLabel && (
        <ClassCardInfoRow icon="event_available" strong>
          <span className="font-medium text-wtext-3 dark:text-rink-300">일정 </span>
          {dateLabel}
        </ClassCardInfoRow>
      )}
      {/* [2026-06-19] 참가 대상 출생연도 — 입력 없으면 '전체'(전체 대상)로 표기. */}
      <ClassCardInfoRow icon="cake">
        {formatTournamentTargetYears(item) ?? '전체'}
      </ClassCardInfoRow>
    </ClassListCard>
  );
}

// ─── Flat 섹션 헤더 (ICETIMES) ───────────────────────
// wallet SectionHead(iceTheme) 와 동일 17px/800 it-ink 톤 + 우측 개수 num.
//   /director full-bleed flat 섹션 패턴과 정렬. (count 슬롯이 필요해 page-local 정의)
function ClassSectionHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-4 sm:px-5 pt-4 sm:pt-[18px] pb-2">
      <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
        {title}
      </h2>
      {/* 시안 SectionHeader count — 15px/800 it-blue (AcademyClasses.jsx) */}
      <span className="text-[15px] font-extrabold text-it-blue-500 dark:text-it-blue-300 tabular-nums">
        {count}
      </span>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────
export default function ClassManagePage() {
  const { back } = useNavigation();
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  // [2026-05-20] 대회 탭 — 대회(Tournament)는 별 도메인이라 별도 state.
  //   listTournaments 가 본인 운영 팀의 대회만 반환 (BE 가 roleInTeam 으로 필터).
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [fetchError, setFetchError] = useState(false);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });

  const teamIdsRef = useRef<string[] | null>(null);
  const academyIdsRef = useRef<string[] | null>(null);

  // [수정 2026-05-13 P2] 분기 결정 기준을 userType → URL 로 변경.
  //  /classes-manage → 팀 모드, /academy-classes → 오픈클래스 모드.
  //  오픈클래스 감독이 /classes-manage 로 직접 진입한 경우 안전망 redirect 로 표준 URL 동선 유도.
  //  회의 정책 (2026-04-23): 오픈클래스 1개 운영 가정 + 오픈클래스 수업 목록 노출.
  const pathname = usePathname();
  const { user } = useAuth();
  const { navigate } = useNavigation();
  const isAcademyMode = (pathname ?? '').startsWith('/academy-classes');

  useEffect(() => {
    const role = user?.userType?.toLowerCase();
    if (!role) return;
    // 오픈클래스 감독 → /academy-classes 강제 (표준 동선)
    if (role === 'academy_director' && !isAcademyMode) {
      navigate('/academy-classes');
      return;
    }
    // 오픈클래스 감독이 아닌 역할이 /academy-classes 진입한 경우 → /classes-manage 로 역방향 리다이렉트.
    // ADMIN 은 양쪽 모두 접근 허용 (전체 권한).
    if (isAcademyMode && role !== 'academy_director' && role !== 'admin') {
      navigate('/classes-manage');
    }
  }, [user, isAcademyMode, navigate]);

  const fetchClasses = useCallback(async () => {
    setIsLoading(true);
    setFetchError(false);
    try {
      const qs = '';

      // ── 오픈클래스 분기: /academy-classes URL — 오픈클래스 수업 조회 ───────────
      if (isAcademyMode) {
        if (!academyIdsRef.current) {
          const acadRes = await api.get<{ data?: Array<{ id: string }> } | Array<{ id: string }>>(
            '/academies/my/list',
          );
          if (acadRes.success && acadRes.data) {
            const list = Array.isArray(acadRes.data)
              ? acadRes.data
              : ((acadRes.data as { data?: Array<{ id: string }> }).data ?? []);
            academyIdsRef.current = list.map((a) => a.id);
          } else {
            setFetchError(true);
            setClasses([]);
            return;
          }
        }
        const academyIds = academyIdsRef.current ?? [];
        if (academyIds.length === 0) { setClasses([]); return; }
        // 오픈클래스 수업 응답 어댑팅 — 팀 응답과 거의 동일 구조, BE 가 academyId 기반 select.
        type AcademyClassResponse = Record<string, unknown>;
        const acadResults = await Promise.all(
          academyIds.map((id) =>
            api.get<{ data?: AcademyClassResponse[] } | AcademyClassResponse[]>(
              `/academies/${id}/classes${qs ? `?${qs}` : ''}`,
            ),
          ),
        );
        const acadMerged: AcademyClassResponse[] = [];
        let acadAnySuccess = false;
        for (const res of acadResults) {
          if (!res.success || !res.data) continue;
          acadAnySuccess = true;
          const list = Array.isArray(res.data)
            ? res.data
            : ((res.data as { data?: AcademyClassResponse[] }).data ?? []);
          acadMerged.push(...list);
        }
        if (!acadAnySuccess) {
          setFetchError(true);
          setClasses([]);
          return;
        }
        // 팀 분기와 동일한 매핑 로직 적용 (Class 단일 테이블이라 필드 호환).
        const acadSeen = new Set<string>();
        const acadDedup = acadMerged.filter((c) => {
          const id = c.id as string;
          if (acadSeen.has(id)) return false;
          acadSeen.add(id);
          return true;
        });
        setClasses(acadDedup.map((c): ClassItem => {
          const rawDaysAny = Array.isArray(c.classDays)
            ? (c.classDays as unknown[]).map((v) => String(v ?? '')).filter(Boolean)
            : (c.dayOfWeek as string | undefined)
              ? (c.dayOfWeek as string).split(/[,\s/·]+/).filter(Boolean)
              : [];
          const normalizedDays = normalizeClassDays(rawDaysAny);
          const dayOfWeekLabel = normalizedDays.join(', ');
          const products = (c.products as Array<{ feeType?: string; price?: number }> | undefined) ?? [];
          const statusRaw = (c.status as string) ?? (c.isActive ? 'ACTIVE' : 'INACTIVE');
          const status: ClassItem['status'] =
            statusRaw === 'INACTIVE' || statusRaw === 'COMPLETED' ? statusRaw : 'ACTIVE';
          const approvalRaw = (c.approvalStatus as string) ?? 'APPROVED';
          const approvalStatus: ClassItem['approvalStatus'] =
            approvalRaw === 'PENDING' || approvalRaw === 'REJECTED' ? approvalRaw : 'APPROVED';
          return {
            id: c.id as string,
            title: (c.className as string) ?? (c.title as string) ?? '',
            dayOfWeek: dayOfWeekLabel,
            time: (c.time as string) ?? '',
            startTime: (c.startTime as string) ?? '',
            scheduledDates: (c.scheduledDates as string[] | undefined) ?? [],
            endTime: (c.endTime as string) ?? '',
            classDays: normalizedDays,
            location:
              (c.location as string) ?? (c.venueName as string) ?? ((c.venue as { name?: string })?.name ?? ''),
            studentCount: (c.studentCount as number) ?? 0,
            maxStudents: (c.maxStudents as number) ?? (c.capacity as number) ?? 0,
            level: (c.level as string) ?? (c.levelRequired as string) ?? '',
            category: deriveCategoryLabel(
              c.category as string | undefined,
              c.ageMin as number | undefined,
              c.ageMax as number | undefined,
            ),
            ageMin: (c.ageMin as number | undefined) ?? null,
            ageMax: (c.ageMax as number | undefined) ?? null,
            targetBirthYears: (c.targetBirthYears as number[] | undefined) ?? [],
            status,
            approvalStatus,
            coach: (c.coach as string) ?? (c.instructorName as string) ?? '',
            coachUserType: (c.coachUserType as string) ?? null,
            coachAssignments: (c.coachAssignments as ClassItem['coachAssignments']) ?? [],
            firstScheduleDate: (c.firstScheduleDate as string) ?? null,
            lastScheduleDate: (c.lastScheduleDate as string) ?? null,
            singlePrice:
              (c.singlePrice as number) ?? products.find((p) => p.feeType === 'PER_SESSION')?.price ?? 0,
            monthlyPrice:
              (c.monthlyPrice as number) ?? products.find((p) => p.feeType === 'MONTHLY_FIXED')?.price ?? 0,
            // [추가 2026-05-15 T03 협업] 가격 라벨 (tbd/krw)
            singlePriceLabel: (c.singlePriceLabel as ClassItem['singlePriceLabel']) ?? null,
            monthlyPriceLabel: (c.monthlyPriceLabel as ClassItem['monthlyPriceLabel']) ?? null,
            packageTotalSessions: (c.packageTotalSessions as number | null) ?? null,
            packageWeeks: (c.packageWeeks as number | null) ?? null,
            packageSessionsPerWeek: (c.packageSessionsPerWeek as number | null) ?? null,
            trainingType: (c.trainingType as string) ?? null,
            // [추가 2026-05-15] academy 모드 — 항상 academyId 보유 (오픈클래스).
            academyId: (c.academyId as string) ?? null,
          };
        }));
        return;
      }

      // ── 기존 팀 분기 (무변경) ─────────────────────────────────
      // 팀 ID 목록 캐싱 — 관리 가능한 모든 팀의 수업을 병합 표시 (이전엔 첫 팀만 조회되어 누락 발생)
      if (!teamIdsRef.current) {
        const teamsRes = await api.get<Array<{ id: string }>>('/teams/managed/list');
        if (teamsRes.success && Array.isArray(teamsRes.data)) {
          teamIdsRef.current = teamsRes.data.map((t) => t.id);
        } else {
          setFetchError(true);
          setClasses([]);
          return;
        }
      }
      const teamIds = teamIdsRef.current ?? [];
      if (teamIds.length === 0) { setClasses([]); return; }

      type ClassApiResponse = ClassItem & {
        className?: string;
        venueName?: string;
        venue?: { name?: string };
        capacity?: number;
        levelRequired?: string;
        isActive?: boolean;
        instructorName?: string;
        coachUserType?: string | null;
        coachAssignments?: Array<{
          coachUserId: string;
          role: string;
          coachName: string;
          coachUserType?: string | null;
        }>;
        firstScheduleDate?: string | null;
        lastScheduleDate?: string | null;
        products?: Array<{ feeType?: string; price?: number }>;
      };

      // 모든 팀의 수업을 병렬 조회 후 병합
      const results = await Promise.all(
        teamIds.map(async (teamId) =>
          api.get<ClassApiResponse[]>(`/teams/${teamId}/classes${qs ? `?${qs}` : ''}`),
        ),
      );
      const merged: ClassApiResponse[] = [];
      let anySuccess = false;
      for (const res of results) {
        if (res.success && Array.isArray(res.data)) {
          anySuccess = true;
          merged.push(...res.data);
        }
      }

      // `/classes-manage` 는 팀 감독·코치 전용 화면 — 본인 팀 정규/대회 수업만 노출.
      //   오픈클래스는 ACADEMY_DIRECTOR 의 `/academy-classes` 경로(isAcademyMode=true) 전용.
      if (!anySuccess) {
        setFetchError(true);
        setClasses([]);
        return;
      }
      // ID 중복 제거 (같은 수업이 여러 팀에 매핑될 가능성 차단)
      const seen = new Set<string>();
      const dedup = merged.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      setClasses(dedup.map((c) => {
        // [수정 2026-05-11] 요일 표기 한글 통일 + 월요일 시작 정렬.
        //  DB 에 EN("MON","WED",...) 또는 KR("월","수") 혼재 → UI 노출은 항상 한글, 정렬 일관.
        const rawDays = Array.isArray(c.classDays)
          ? c.classDays
          : c.dayOfWeek
            ? c.dayOfWeek.split(/[,\s/·]+/).filter(Boolean)
            : [];
        const normalizedDays = normalizeClassDays(rawDays);
        const dayOfWeekLabel = normalizedDays.join(', ');
        return ({
        id: c.id,
        title: c.className ?? c.title ?? '',
        dayOfWeek: dayOfWeekLabel,
        time: c.time ?? '',
        startTime: c.startTime ?? '',
        scheduledDates: (c.scheduledDates as string[] | undefined) ?? [],
        endTime: c.endTime ?? '',
        classDays: normalizedDays,
        location: c.location ?? c.venueName ?? c.venue?.name ?? '',
        studentCount: c.studentCount ?? 0,
        maxStudents: c.maxStudents ?? c.capacity ?? 0,
        level: c.level ?? c.levelRequired ?? '',
        category: deriveCategoryLabel(c.category, c.ageMin, c.ageMax),
        ageMin: c.ageMin ?? null,
        ageMax: c.ageMax ?? null,
        targetBirthYears: c.targetBirthYears ?? [],
        status: c.status ?? (c.isActive ? 'ACTIVE' : 'INACTIVE'),
        approvalStatus: c.approvalStatus ?? 'APPROVED',
        // [수정 2026-05-15] /classes 공용 응답의 coach 는 {id, firstName, lastName} 객체로 옴
        //   (ClassApiResponse 의 coach:string 타입과 다름 — unknown cast 로 양쪽 대응).
        //   문자열 폴백("${lastName}${firstName}") 후 instructorName 폴백.
        //   ([object Object]감독 버그 수정 — 오픈클래스 머지 후 카드 표시 문제)
        coach: (() => {
          const rawCoach: unknown = c.coach;
          if (typeof rawCoach === 'string') return rawCoach;
          if (rawCoach && typeof rawCoach === 'object') {
            const coachObj = rawCoach as { firstName?: string; lastName?: string };
            const joined = `${coachObj.lastName ?? ''}${coachObj.firstName ?? ''}`.trim();
            if (joined) return joined;
          }
          return c.instructorName ?? '';
        })(),
        // [추가 2026-05-11] 코치의 실제 userType — 호칭 결정용
        coachUserType: c.coachUserType ?? null,
        // [추가 2026-05-12] 다중 코치 배정
        coachAssignments: c.coachAssignments ?? [],
        // [추가 2026-05-12] 실제 운영 기간 (백엔드 schedules min/max)
        firstScheduleDate: c.firstScheduleDate ?? null,
        lastScheduleDate: c.lastScheduleDate ?? null,
        singlePrice: c.singlePrice ?? c.products?.find((p) => p.feeType === 'PER_SESSION')?.price ?? 0,
        monthlyPrice: c.monthlyPrice ?? c.products?.find((p) => p.feeType === 'MONTHLY_FIXED')?.price ?? 0,
        // [추가 2026-05-15 T03 협업] 가격 라벨 (tbd/krw)
        singlePriceLabel: (c as { singlePriceLabel?: ClassItem['singlePriceLabel'] }).singlePriceLabel ?? null,
        monthlyPriceLabel: (c as { monthlyPriceLabel?: ClassItem['monthlyPriceLabel'] }).monthlyPriceLabel ?? null,
        // [추가 2026-05-22] 정기 패키지 단위 표시용 ('{W}주({W*P}회)') — 백엔드 응답에 이미 포함.
        packageTotalSessions: (c as { packageTotalSessions?: number | null }).packageTotalSessions ?? null,
        packageWeeks: (c as { packageWeeks?: number | null }).packageWeeks ?? null,
        packageSessionsPerWeek: (c as { packageSessionsPerWeek?: number | null }).packageSessionsPerWeek ?? null,
        trainingType: c.trainingType ?? null,
        // [2026-06-19] 팀 프로필(로고) — 카드 좌측 아이콘. 백엔드 getClubClasses 가 teamLogoUrl 반환.
        //   기존 매핑 누락으로 항상 undefined → 기본 아이콘만 보이던 버그 수정.
        teamLogoUrl: c.teamLogoUrl ?? null,
        // [추가 2026-05-15] 오픈클래스/정규 분류용 — academyId 가 있으면 'open' 탭에 포함.
        academyId: (c as { academyId?: string | null }).academyId ?? null,
      });
      }));
    } catch {
      setFetchError(true);
      setClasses([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAcademyMode]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  // [2026-05-20] 대회 목록 fetch — 마운트 1회. 대회 탭 카드 데이터 소스.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listTournaments();
      if (cancelled) return;
      if (res.success && res.data) {
        const list = Array.isArray(res.data)
          ? res.data
          : ((res.data as { data?: TournamentListItem[] }).data ?? []);
        setTournaments(list);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 탭 분류 — 정규/대회.
  //   regular: academyId 없음 (팀 정규 수업)
  //   tournament: 화면 내 필터로만 동작 (외부 라우팅 없음).
  //               classes-manage 데이터는 trainingType='tournament' 어댑팅 클래스만 포함.
  const filtered = useMemo(() => {
    if (activeCategory === 'all') return classes;
    if (activeCategory === 'regular') {
      return classes.filter(
        (c) => !c.academyId && String(c.trainingType ?? '').toLowerCase() !== 'tournament',
      );
    }
    if (activeCategory === 'tournament') {
      return classes.filter(
        (c) => String(c.trainingType ?? '').toLowerCase() === 'tournament',
      );
    }
    return classes;
  }, [classes, activeCategory]);

  // 정렬 기능 제거 (사용자 요청) — 백엔드 응답 순서(최근 등록순) 그대로 표시.
  const sortedAndFiltered = filtered;

  // 카테고리별 수업 수 — 정규/대회.
  //   tournament 는 외부 라우팅이 아니므로 클라이언트 count 산출 (어댑팅 클래스 기준).
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      // [2026-05-20] 전체 탭은 수업 + 대회 모두 노출 → 합산.
      all: classes.length + tournaments.length,
      regular: 0,
      // 대회는 별도 state(tournaments) — classes 가 아닌 그 길이로 카운트.
      tournament: tournaments.length,
    };
    for (const c of classes) {
      const tt = String(c.trainingType ?? '').toLowerCase();
      if (tt !== 'tournament') counts.regular++;
    }
    return counts;
  }, [classes, tournaments]);

  // 칩 구성. ACADEMY_DIRECTOR(오픈클래스 감독)는 본인 수업 전체만 보이면 충분하므로
  //   탭 없이 '전체' 1개만. SoT: CLASS_CATEGORIES + TRAINING_TYPE_OPTIONS.
  const categories: { key: CategoryKey; label: string }[] = isAcademyMode
    ? [{ key: 'all', label: '전체' }]
    : [
        { key: 'all', label: '전체' },
        { key: 'regular', label: '정규훈련' },
        { key: 'tournament', label: '대회' },
      ];

  // [제거 W2.A-3 2026-05-18] tabRefs — CategoryChipsRow 교체로 미사용.
  //   (이전: 카테고리 탭 ref — 스크롤 위치 동기화용. CategoryChipsRow 내부에서 자동 처리.)

  // [2026-05-30] FAB 자동 숨김 — 정적 위치 FAB(우하단)가 휴식 상태에서도 하단 카드의
  //   액션 행("공유" 등)을 덮던 문제 해소. 아래로 스크롤(카드 탐색)하면 FAB 를 내려 숨겨
  //   가려진 버튼이 드러나고, 위로 스크롤·상단 근처에선 다시 표시한다.
  //   기능적 인터랙션(장식 애니메이션 아님) · motion-reduce 대응.
  const [isFabHidden, setIsFabHidden] = useState(false);
  const lastScrollTopRef = useRef(0);

  // [2026-06-18] FAB → '추가하기' 액션 시트. 수업 등록(기존 경로) / 대회 등록(/tournaments/create) 분기.
  //   대회 항목은 팀 모드에서만 노출 — 오픈클래스(academy) 모드엔 대회 개념 없음.
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const handleAddSelect = useCallback(
    (path: string) => {
      setAddSheetOpen(false);
      navigate(path);
    },
    [navigate],
  );

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title="훈련 목록" />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8"
        onScroll={(e) => {
          const st = e.currentTarget.scrollTop;
          const last = lastScrollTopRef.current;
          if (st <= 40) setIsFabHidden(false); // 상단 근처 → 항상 표시
          else if (st > last + 8) setIsFabHidden(true); // 아래로 스크롤 → 숨김
          else if (st < last - 8) setIsFabHidden(false); // 위로 스크롤 → 표시
          lastScrollTopRef.current = st;
        }}
        aria-busy={isLoading}
      >
        {/* [ICETIMES flat 재작업 2026-06-24] 시안(AcademyClasses.jsx) 구조로 전환.
            카드 박스(px 좌우 패딩 + stripe 마커 헤더)를 제거하고 /director 와 동일하게
            full-bleed 흰 섹션(bg-it-surface)을 8px 회색 갭(mt-2)으로 쌓는다.
            각 섹션 헤더는 SectionHead 와 동일 17px/800 it-ink 톤 + 우측 개수.
            수업 행은 공유 ClassListCard iceTheme(무라운드 + 하단 hairline)이 담당. */}
        {isLoading ? null : fetchError ? (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
            <div
              className="flex flex-col items-center justify-center py-16 animate-fade-in motion-reduce:animate-none"
              role="alert"
              aria-live="polite"
            >
              <div className="w-16 h-16 rounded-w-pill bg-it-red-50 dark:bg-it-red-700/20 flex items-center justify-center mb-3">
                <Icon name="error_outline" className="text-3xl text-it-red-500 dark:text-it-red-300" aria-hidden="true" />
              </div>
              <p className="text-card-body text-wtext-2 dark:text-wtext-4 font-semibold mb-1">
                훈련 목록을 불러오지 못했습니다
              </p>
              <p className="text-card-meta text-wtext-3 dark:text-wtext-4 mb-4 text-center px-6 leading-relaxed">
                일시적인 서버 오류일 수 있습니다.<br />잠시 후 다시 시도해주세요.
              </p>
              <button
                type="button"
                onClick={() => {
                  // 양쪽 모드 캐시 모두 무효화 — 어느 모드에서 에러가 났든 깨끗하게 재조회.
                  teamIdsRef.current = null;
                  academyIdsRef.current = null;
                  fetchClasses();
                }}
                aria-label="훈련 목록 다시 불러오기"
                className="px-4 py-2 text-card-body font-semibold text-it-blue-500 bg-it-blue-500/10 rounded-lg hover:bg-it-blue-500/20 transition-colors motion-reduce:transition-none active:brightness-95"
              >
                다시 시도
              </button>
            </div>
          </section>
        ) : (
          // [2026-06-17→06-24] 정규수업 / 대회 섹션을 full-bleed flat 섹션으로 구분.
          <>
            {/* 정규수업 섹션 — full-bleed 흰 패널 + hairline 행. */}
            <section
              className="mt-2 bg-it-surface dark:bg-it-blue-950"
              aria-label={isAcademyMode ? '오픈클래스' : '정규훈련'}
            >
              <ClassSectionHead
                title={isAcademyMode ? '오픈클래스' : '정규훈련'}
                count={sortedAndFiltered.length}
              />
              {sortedAndFiltered.length > 0 ? (
                <div role="list">
                  {sortedAndFiltered.map((item, idx) => (
                    <div
                      key={`cls-${item.id}`}
                      role="listitem"
                      className="motion-reduce:animate-none"
                      style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                    >
                      <ClassCard item={item} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 sm:px-5 py-6 text-card-body text-wtext-3 dark:text-wtext-4 text-center">
                  등록된 훈련이 없습니다.
                </p>
              )}
            </section>

            {/* 대회 섹션 — 오픈클래스(academy) 모드는 대회 개념이 없어 숨김. */}
            {!isAcademyMode && (
              <section
                className="mt-2 bg-it-surface dark:bg-it-blue-950"
                aria-label="대회"
              >
                <ClassSectionHead title="대회" count={tournaments.length} />
                {tournaments.length > 0 ? (
                  <div role="list">
                    {tournaments.map((t, idx) => (
                      <div
                        key={`tnmt-${t.id}`}
                        role="listitem"
                        className="motion-reduce:animate-none"
                        style={{ animationDelay: `${Math.min(idx * 40, 280)}ms` }}
                      >
                        <TournamentManageCard item={t} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 sm:px-5 py-6 text-card-body text-wtext-3 dark:text-wtext-4 text-center">
                    등록된 대회가 없습니다.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* FAB — 수업 추가
          [2026-05-09] Android 안전영역 보정.
            기존 `bottom-24` (96px) 는 Android 제스처 네비(safe-area-inset-bottom 24~48px)
            + BottomNav(60px) 합 ≈ 84-108px 와 겹쳐 FAB 하단이 BottomNav 에 가려지는
            현상 발생. BottomNav 는 60px + safe-area-inset-bottom 으로 구성되므로,
            FAB 하단을 (BottomNav 상단 + 16px 여유) 위치로 고정. */}
      <button
        type="button"
        // [2026-06-19] 오픈클래스(academy) 모드는 생성 선택지가 '수업 등록' 1개뿐이라
        //   바텀시트(addSheet)를 건너뛰고 바로 수업 등록 페이지로 진입. 팀 모드만 2지선다 시트.
        onClick={() => {
          if (isAcademyMode) {
            navigate('/classes-manage/create');
          } else {
            setAddSheetOpen(true);
          }
        }}
        style={{
          bottom: 'calc(76px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        }}
        className={cn(
          'fixed right-6 z-30 w-14 h-14 bg-it-blue-500 hover:bg-it-blue-600 rounded-w-pill flex items-center justify-center shadow-sh-2 transition-all duration-200 motion-reduce:transition-none active:brightness-90',
          // 아래로 스크롤 시 FAB 를 화면 아래로 내려 카드 액션("공유")을 가리지 않음.
          isFabHidden
            ? 'translate-y-[160%] opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100',
        )}
        aria-label={isAcademyMode ? '수업 등록하기' : '추가'}
        tabIndex={isFabHidden ? -1 : undefined}
        aria-hidden={isFabHidden || undefined}
      >
        <Icon name="add" className="text-[28px] text-white" aria-hidden="true" />
      </button>

      {/* FAB '추가하기' 액션 시트 — 수업 등록 / 대회 등록 진입 선택 */}
      <BottomSheet
        isOpen={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        title={MESSAGES.classesEdit.addSheet.title}
        footer={
          <button
            type="button"
            onClick={() => setAddSheetOpen(false)}
            className="w-full h-11 rounded-xl border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 font-bold"
          >
            취소
          </button>
        }
      >
        <ul className="flex flex-col gap-2" role="list">
          <li>
            <button
              type="button"
              onClick={() => handleAddSelect('/classes-manage/create')}
              className="w-full flex items-center gap-3 p-4 rounded-w-md border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 hover:bg-wbg dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none text-left"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-w-md bg-emerald-50 dark:bg-emerald-900/20" aria-hidden="true">
                <Icon name="sports_hockey" className="text-card-title text-emerald-600 dark:text-emerald-400" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-card-body font-bold text-wtext-1 dark:text-white">
                  {MESSAGES.classesEdit.addSheet.classRegister}
                </span>
                <span className="block text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                  {MESSAGES.classesEdit.addSheet.classRegisterDesc}
                </span>
              </span>
              <Icon name="chevron_right" className="text-xl text-wtext-4 dark:text-rink-500 shrink-0" aria-hidden="true" />
            </button>
          </li>
          {!isAcademyMode && (
            <li>
              <button
                type="button"
                onClick={() => handleAddSelect('/tournaments/create')}
                className="w-full flex items-center gap-3 p-4 rounded-w-md border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 hover:bg-wbg dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none text-left"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-w-md bg-red-50 dark:bg-red-900/20" aria-hidden="true">
                  <Icon name="emoji_events" className="text-card-title text-red-600 dark:text-red-400" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-card-body font-bold text-wtext-1 dark:text-white">
                    {MESSAGES.classesEdit.addSheet.tournamentRegister}
                  </span>
                  <span className="block text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                    {MESSAGES.classesEdit.addSheet.tournamentRegisterDesc}
                  </span>
                </span>
                <Icon name="chevron_right" className="text-xl text-wtext-4 dark:text-rink-500 shrink-0" aria-hidden="true" />
              </button>
            </li>
          )}
        </ul>
      </BottomSheet>

    </MobileContainer>
  );
}
