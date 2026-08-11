/**
 * 사용자 email 표시 규칙
 *
 * 자녀 계정의 email 은 로그인 수단이 아니라 내부 식별자다.
 * 백엔드가 자녀 생성 시 `child_<uuid>@internal.teamplus.local` 형태로 자동 발급하며
 * (children.service.ts — 자녀 개별 로그인 폐지), 존재하지 않는 도메인이라
 * 운영자에게 의미가 없고 실제 연락처로 오인될 수 있어 화면에 노출하지 않는다.
 */

const INTERNAL_EMAIL_DOMAIN = '@internal.teamplus.local';

/** 내부 식별자용 email 인지 판정 */
export const isInternalEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(INTERNAL_EMAIL_DOMAIN);
};

/** 표시용 email — 내부 식별자면 빈 문자열을 반환한다. */
export const displayEmail = (email?: string | null): string => {
  if (!email || isInternalEmail(email)) return '';
  return email;
};
