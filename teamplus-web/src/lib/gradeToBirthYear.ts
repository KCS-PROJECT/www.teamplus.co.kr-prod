/**
 * 학년(U6~U12) ↔ 출생연도 변환 유틸
 * 아이스하키 U(X) = X세 이하 기준
 * 예: U8 = 초1 = 7세 기준
 */

export type AgeGroupKey = 'U6' | 'U7' | 'U8' | 'U9' | 'U10' | 'U11' | 'U12';

export const AGE_GROUPS: AgeGroupKey[] = ['U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12'];

const AGE_BY_GROUP: Record<AgeGroupKey, number> = {
  U6: 5,
  U7: 6,
  U8: 7,
  U9: 8,
  U10: 9,
  U11: 10,
  U12: 11,
};

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

export function ageGroupToBirthYear(group: AgeGroupKey, currentYear = getCurrentYear()): number {
  return currentYear - AGE_BY_GROUP[group];
}

export interface BirthYearRange {
  targetBirthYearFrom?: number;
  targetBirthYearTo?: number;
}

/**
 * 선택된 학년 리스트를 targetBirthYearFrom/To 범위로 변환
 * - 빈 배열 → 전체 학년 (undefined)
 * - U12 선택 → birthYear 2015 (2026-11)
 * - U6~U8 선택 → from 2018, to 2020 (가장 어린 ~ 가장 나이든 범위)
 */
export function selectedGroupsToBirthYearRange(
  selected: AgeGroupKey[],
  currentYear = getCurrentYear(),
): BirthYearRange {
  if (selected.length === 0) return {};
  const years = selected.map((g) => ageGroupToBirthYear(g, currentYear));
  return {
    targetBirthYearFrom: Math.min(...years),
    targetBirthYearTo: Math.max(...years),
  };
}

/**
 * 출생연도 범위 → 학년 키 역변환 (edit 모드 prefill 용)
 * 예: 2019~2020 → [U6, U7]
 * null/undefined 처리 시 빈 배열 반환 (전체 학년)
 */
export function birthYearRangeToGroups(
  from: number | null | undefined,
  to: number | null | undefined,
  currentYear = getCurrentYear(),
): AgeGroupKey[] {
  if (from == null && to == null) return [];
  const min = from ?? to ?? currentYear;
  const max = to ?? from ?? currentYear;
  return AGE_GROUPS.filter((g) => {
    const y = ageGroupToBirthYear(g, currentYear);
    return y >= min && y <= max;
  });
}

/**
 * [추가 2026-05-13] 출생연도 범위 → U라벨 표기 (대회/경기 목록 등 노출용).
 *  예: 2017~2017 → "U10"
 *      2015~2017 → "U10~U12"  (낮은 → 높은 라벨, "U" 접두어 1회 출력)
 *  매칭되는 그룹이 없으면 fallbackLabel 반환.
 */
export function formatBirthYearAsAgeGroupLabel(
  from: number | null | undefined,
  to: number | null | undefined,
  fallbackLabel = 'Amateur League',
  currentYear = getCurrentYear(),
): string {
  if (from == null && to == null) return fallbackLabel;
  const groups = birthYearRangeToGroups(from, to, currentYear);
  if (groups.length === 0) return fallbackLabel;
  if (groups.length === 1) return groups[0];
  // 가장 어린 그룹(U? 큰 숫자, birthYear 낮음) ~ 가장 나이든 그룹(U? 작은 숫자)
  //  AGE_GROUPS 는 U6→U12 오름차순. birthYear 가 낮을수록 U값이 큰 그룹.
  //  사용자 가독성 위해 작은 U → 큰 U 순서로 표기.
  return `${groups[0]}~${groups[groups.length - 1]}`;
}

/**
 * 선택된 학년 → 출생연도 라벨 (미리보기용)
 * 예: [U6, U7] → "2019~2020년"
 */
export function formatBirthYearPreview(
  selected: AgeGroupKey[],
  allLabel: string,
  currentYear = getCurrentYear(),
): string {
  if (selected.length === 0) return allLabel;
  const { targetBirthYearFrom, targetBirthYearTo } = selectedGroupsToBirthYearRange(
    selected,
    currentYear,
  );
  if (targetBirthYearFrom === undefined || targetBirthYearTo === undefined) return allLabel;
  if (targetBirthYearFrom === targetBirthYearTo) return `${targetBirthYearFrom}년생`;
  return `${targetBirthYearFrom}~${targetBirthYearTo}년생`;
}

// ─── 초등 1~6학년 출생연도 슬라이딩 (2026-05-21 신규) ──────────────────────
// teamplus-web 등록 폼(수업·대회)의 연령 선택을 U라벨 칩에서 출생연도 범위 슬라이더로
// 통일하기 위한 헬퍼. 위쪽 U6~U12 헬퍼와 의도적으로 분리한다 — 위 헬퍼는 아이스하키
// U(X) 기준이라 currentYear-5~currentYear-11 을 매핑하지만, 이 시스템은 초등 1~6학년
// 대상이라 currentYear-12~currentYear-7 (6개) 로 1:1 불일치하기 때문.
//
// 학년 ↔ 출생연도:  출생연도 = 현재연도 - 학년 - 6
//   1학년 = currentYear-7 (가장 어림) … 6학년 = currentYear-12 (가장 나이 많음)
//   currentYear=2026 → 2014(6학년)~2019(1학년), 매년 자동 이동.
// 졸업·탈퇴 학생의 birthDate 데이터는 DB 에 그대로 남고 선택지 UI 만 이동한다.

/** 초등 1~6학년에 해당하는 출생연도 경계 (오름차순 — min=6학년, max=1학년). */
export function getElementaryBirthYearBounds(currentYear = getCurrentYear()): {
  min: number;
  max: number;
} {
  return { min: currentYear - 12, max: currentYear - 7 };
}

/** 초등 1~6학년 출생연도 목록 (오름차순 6개). 슬라이더 눈금 라벨용. */
export function getElementaryBirthYears(currentYear = getCurrentYear()): number[] {
  const { min, max } = getElementaryBirthYearBounds(currentYear);
  const years: number[] = [];
  for (let y = min; y <= max; y += 1) years.push(y);
  return years;
}

/** 출생연도 → 한국나이 (현재연도 - 출생연도 + 1). 수업 ageMin/ageMax 변환용. */
export function birthYearToKoreanAge(birthYear: number, currentYear = getCurrentYear()): number {
  return currentYear - birthYear + 1;
}

/** 한국나이 → 출생연도 (역변환 — edit 모드 ageMin/ageMax prefill 용). */
export function koreanAgeToBirthYear(koreanAge: number, currentYear = getCurrentYear()): number {
  return currentYear - koreanAge + 1;
}

/**
 * 출생연도 범위를 초등 1~6학년 경계 안으로 보정.
 * null/undefined·범위 밖 값이면 전체 경계(min~max)로 폴백한다.
 */
export function clampElementaryBirthYearRange(
  from: number | null | undefined,
  to: number | null | undefined,
  currentYear = getCurrentYear(),
): { from: number; to: number } {
  const { min, max } = getElementaryBirthYearBounds(currentYear);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const f = from == null || Number.isNaN(from) ? min : clamp(from);
  const t = to == null || Number.isNaN(to) ? max : clamp(to);
  return { from: Math.min(f, t), to: Math.max(f, t) };
}

/** 출생연도 범위 라벨. 예: 2015~2018 → "2015~2018년생", 2016~2016 → "2016년생". */
export function formatBirthYearRangeLabel(from: number, to: number): string {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return lo === hi ? `${lo}년생` : `${lo}~${hi}년생`;
}

/**
 * 참가 자격 출생연도 라벨 — 개별 연도 집합 우선, 없으면 범위 폴백.
 *  · years 배열이 비지 않으면 오름차순 중점(·) 구분 개별 표기: [2014,2019,2016] → "2014·2016·2019년생".
 *  · years 없거나 비면 from/to 범위 라벨(formatBirthYearRangeLabel)로 폴백.
 *  · from/to 도 없으면 fallbackLabel("전체") 반환.
 * 대회 목록/상세/생성 요약 4곳 공유용.
 */
export function formatEligibleBirthYearsLabel(
  years: number[] | null | undefined,
  from: number | null | undefined,
  to: number | null | undefined,
  fallbackLabel = '전체',
): string {
  if (Array.isArray(years) && years.length > 0) {
    const sorted = [...years].sort((a, b) => a - b);
    return `${sorted.join('·')}년생`;
  }
  if (from != null && to != null) return formatBirthYearRangeLabel(from, to);
  return fallbackLabel;
}
