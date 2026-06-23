/**
 * 학년(U6~U12) ↔ 출생연도 변환 유틸 (Admin)
 * 아이스하키 U(X) = X세 이하 기준
 */

export type AgeGroupKey = 'U6' | 'U7' | 'U8' | 'U9' | 'U10' | 'U11' | 'U12';

export const AGE_GROUPS: AgeGroupKey[] = ['U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12'];

export const AGE_GROUP_LABELS: Record<AgeGroupKey, string> = {
  U6: 'U6 (5세)',
  U7: 'U7 (6세)',
  U8: 'U8 (초1)',
  U9: 'U9 (초2)',
  U10: 'U10 (초3)',
  U11: 'U11 (초4)',
  U12: 'U12 (초5)',
};

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
