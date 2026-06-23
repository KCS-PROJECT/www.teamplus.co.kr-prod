/**
 * 나이 계산 유틸리티
 *
 * 단일 진실(Single Source of Truth): birthDate.
 * - TEAMPLUS 내 모든 나이 표시·검증은 이 유틸을 거쳐 birthDate 에서 계산한다.
 * - User.koreanAge / ClubMember.playerAge 등 저장된 컬럼은 등록 시점 스냅샷이며,
 *   비즈니스 로직에서는 신뢰하지 않는다(현재 연도가 바뀌면 stale 됨).
 *
 * 두 가지 나이 체계:
 * - 한국나이(세는나이): currentYear - birthYear + 1 — 일반 비즈니스 표준 (자녀 등록 검증·CHILD/TEEN 분류·수업 나이 제한·표시 등)
 * - 만나이(국제나이): 월/일까지 비교 — 법령·약관 (만 14세 미만 보호자 동의) 전용
 *
 * 참고 정책 문서: docs/Planning/PAYMENT_FEE_POLICY.md §5 (나이 제한 검증)
 */

// ──────────────────────────────────────────────────────────────────
// 한국나이 (세는나이) — 일반 비즈니스 표준
// ──────────────────────────────────────────────────────────────────

/**
 * 한국나이(세는나이) 계산.
 *
 * 한국나이 = 현재 연도 - 출생 연도 + 1 (생일 무관)
 *
 * @param birthDate 생년월일 (Date)
 * @returns 한국나이(정수). 1월 1일 0시에 모든 사람이 일괄 +1 된다.
 */
export function calculateKoreanAge(birthDate: Date): number {
  return new Date().getFullYear() - birthDate.getFullYear() + 1;
}

/**
 * nullable birthDate 로부터 한국나이를 안전하게 계산.
 *
 * @param birthDate 생년월일 (Date | string | null | undefined)
 * @returns 한국나이 또는 null (유효하지 않은 입력일 때)
 */
export function calculateKoreanAgeSafe(
  birthDate: Date | string | null | undefined,
): number | null {
  if (!birthDate) return null;
  const date = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(date.getTime())) return null;
  return calculateKoreanAge(date);
}

// ──────────────────────────────────────────────────────────────────
// 만나이 (국제나이) — 법령·약관 전용
// ──────────────────────────────────────────────────────────────────

/**
 * 만나이 계산 (월/일 고려).
 *
 * 만나이 = 현재 연도 - 출생 연도 (생일이 지나지 않았으면 -1)
 *
 * 「개인정보보호법」 제22조의2 / 약관 §1조 9항 (만 14세 미만 = 아동 회원) /
 * 약관 §8조 (만 14세 이상 ~ 만 18세 미만 = 청소년 회원) 등 법령·약관 검증 전용.
 *
 * 일반 비즈니스 로직(자녀 등록·수업 나이 제한·표시 등) 에서는 calculateKoreanAge 사용.
 *
 * @param birthDate 생년월일 (Date)
 * @returns 만나이(정수)
 */
export function calculateInternationalAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());
  if (!hasBirthdayPassed) age -= 1;
  return age;
}

/**
 * nullable birthDate 로부터 만나이를 안전하게 계산.
 *
 * @param birthDate 생년월일 (Date | string | null | undefined)
 * @returns 만나이 또는 null (유효하지 않은 입력일 때)
 */
export function calculateInternationalAgeSafe(
  birthDate: Date | string | null | undefined,
): number | null {
  if (!birthDate) return null;
  const date = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(date.getTime())) return null;
  return calculateInternationalAge(date);
}

// ──────────────────────────────────────────────────────────────────
// 법령 검증 전용 헬퍼
// ──────────────────────────────────────────────────────────────────

/**
 * 만 14세 미만 여부 — 법정대리인 동의 필수 판별.
 *
 * 「개인정보보호법」 제22조의2, 「정보통신망법」, 약관 §1조 9항·§4조·§7조.
 * 만나이 기준이며 한국나이로 환산하지 말 것.
 *
 * @param birthDate 생년월일 (Date)
 * @returns true 면 보호자 동의 필수
 */
export function requiresGuardianConsent(birthDate: Date): boolean {
  return calculateInternationalAge(birthDate) < 14;
}

// ──────────────────────────────────────────────────────────────────
// 표시용 헬퍼 — 출생연도 환산 (선택적 활용)
// ──────────────────────────────────────────────────────────────────

/**
 * 한국나이 ageMin/ageMax 를 출생연도 범위 표시 문자열로 환산.
 *
 * 일반 검증 메시지에는 "N세" 표기를 권장하며, 코치 수업 등록 화면 등
 * 의도 확인이 필요한 보조 표시에서 선택적으로 사용한다.
 *
 * @example
 * formatBirthYearRange(5, 10) // "2017년생 ~ 2022년생" (2026 기준)
 * formatBirthYearRange(5, null) // "2022년생 이전"
 * formatBirthYearRange(null, 10) // "2017년생 이후"
 */
export function formatBirthYearRange(
  ageMin?: number | null,
  ageMax?: number | null,
): string {
  const cy = new Date().getFullYear();
  const maxBy = ageMin ? cy - ageMin + 1 : null; // 가장 늦은 출생연도 (어린쪽 한계)
  const minBy = ageMax ? cy - ageMax + 1 : null; // 가장 이른 출생연도 (나이 든쪽 한계)
  if (minBy && maxBy) return `${minBy}년생 ~ ${maxBy}년생`;
  if (maxBy) return `${maxBy}년생 이전`;
  if (minBy) return `${minBy}년생 이후`;
  return "";
}
