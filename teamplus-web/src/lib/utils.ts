import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 한국나이(세는나이) 계산.
 *
 * 한국나이 = 현재 연도 - 출생 연도 + 1 (생일 무관, 1/1 자정에 일괄 +1).
 *
 * TEAMPLUS 일반 비즈니스 표준 (자녀 표시·CHILD/TEEN 분류·수업 나이 제한·결제 검증 등).
 * 백엔드 `src/common/utils/age.util.ts:calculateKoreanAge` 와 동일 로직.
 *
 * @param birthDate 생년월일 (ISO 문자열 또는 Date)
 * @returns 한국나이. 유효하지 않은 날짜면 null.
 */
export function calculateKoreanAge(birthDate: string | Date | null | undefined): number | null {
  if (!birthDate) return null;
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  return new Date().getFullYear() - birth.getFullYear() + 1;
}

/**
 * 만나이(국제나이) 계산 (월/일 고려).
 *
 * 「개인정보보호법」 제22조의2, 약관 §1조 9항(만 14세 미만 = 아동 회원),
 * 약관 §8조(만 14세 이상 ~ 만 18세 미만 = 청소년 회원) 등 법령·약관 검증 전용.
 *
 * 일반 비즈니스 로직에서는 calculateKoreanAge 사용.
 *
 * @param birthDate 생년월일 (ISO 문자열 또는 Date)
 * @returns 만나이. 유효하지 않은 날짜면 null.
 */
export function calculateInternationalAge(
  birthDate: string | Date | null | undefined,
): number | null {
  if (!birthDate) return null;
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * [2026-05-21] 출생연도 표시 — "2016년생".
 *
 * 시스템 전반에서 자녀/학생 연령을 "N세" 대신 출생연도로 표기한다.
 * birthDate 가 있으면 그 연도를, 없으면 한국나이로 역산
 * (출생연도 = 현재연도 - 한국나이 + 1).
 *
 * @returns "YYYY년생" 또는 정보 부족 시 빈 문자열.
 */
export function formatBirthYear(
  birthDate?: string | Date | null,
  koreanAge?: number | null,
): string {
  if (birthDate) {
    const d = birthDate instanceof Date ? birthDate : new Date(birthDate);
    if (!isNaN(d.getTime())) return `${d.getFullYear()}년생`;
  }
  if (typeof koreanAge === "number" && koreanAge > 0) {
    return `${new Date().getFullYear() - koreanAge + 1}년생`;
  }
  return "";
}

/**
 * 한국나이 ageMin/ageMax 를 출생연도 범위 표시로 환산 (선택적 활용).
 *
 * 일반 검증 메시지에는 "N세" 표기를 권장하며, 코치 수업 등록 화면 등
 * 의도 확인이 필요한 보조 표시에서 사용한다.
 *
 * @example
 * formatBirthYearRange(5, 10) // "2017년생 ~ 2022년생" (2026 기준)
 */
export function formatBirthYearRange(
  ageMin?: number | null,
  ageMax?: number | null,
): string {
  const cy = new Date().getFullYear();
  const maxBy = ageMin ? cy - ageMin + 1 : null;
  const minBy = ageMax ? cy - ageMax + 1 : null;
  if (minBy && maxBy) return `${minBy}년생 ~ ${maxBy}년생`;
  if (maxBy) return `${maxBy}년생 이전`;
  if (minBy) return `${minBy}년생 이후`;
  return '';
}
