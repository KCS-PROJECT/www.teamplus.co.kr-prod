import { MESSAGES } from "@/lib/messages";

/**
 * 비밀번호 정책 SoT (프론트).
 *
 * 허용: 영문 + 숫자 + 특수문자 22종.
 *   특수문자 화이트리스트 → ! @ # $ % ^ & * ( ) - _ + = ~ ? . , [ ] { }
 * 금지: 공백, < > " ' / \ | : ; 및 비ASCII(한글·이모지 등).
 *
 * 백엔드 signup/reset/change 비밀번호 DTO @Matches 와 동일한 규칙을 유지한다.
 */

// 단일 문자가 허용 집합에 속하는지 판정.
const ALLOWED_PW_CHAR = /[A-Za-z0-9!@#$%^&*()_+=~?.,{}[\]-]/;

// 전체 규칙 — 영문·숫자·특수문자(허용 22종) 각 1개 이상, 허용 문자만, 8자 이상.
export const PASSWORD_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+=~?.,{}[\]-])[A-Za-z0-9!@#$%^&*()_+=~?.,{}[\]-]{8,}$/;

/**
 * 비밀번호 입력값의 문제를 사용자 친화적 문구로 반환한다. 문제 없으면 null.
 * 우선순위:
 *  (1) 허용되지 않는 문자가 있으면 → 그 문자를 지목("공백" 포함).
 *  (2) 조합/길이 미달이면 → 규칙 안내.
 */
export function describePasswordIssue(password: string): string | null {
  if (!password) return null;
  const forbidden = Array.from(
    new Set(Array.from(password).filter((ch) => !ALLOWED_PW_CHAR.test(ch))),
  );
  if (forbidden.length > 0) {
    const shown = forbidden.map((ch) => (ch === " " ? "공백" : ch)).join(" ");
    return MESSAGES.signupValidation.passwordForbiddenChars(shown);
  }
  if (!PASSWORD_REGEX.test(password)) {
    return MESSAGES.signupValidation.passwordRule;
  }
  return null;
}
