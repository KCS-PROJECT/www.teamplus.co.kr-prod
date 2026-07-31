/**
 * 실명 마스킹 공용 유틸 (개인정보의 안전성 확보조치 기준 §6 — 공개 노출 최소화).
 *
 * 비로그인(@Public) 응답에서 회원 실명을 그대로 내보내지 않기 위한 단일 SoT.
 * 픽업매치 참가 명단·공지 댓글 작성자 등 여러 공개 엔드포인트가 공유한다.
 */

/**
 * 이름 가운데를 `*` 로 가린다.
 *
 * - 3자 이상: 첫 글자 + 가운데 전부 `*` + 마지막 글자 (홍길동 → 홍*동)
 * - 2자: 첫 글자 + `*` (홍길 → 홍*)
 * - 1자: 그대로 (가릴 자리가 없다)
 * - 공백 포함(영문 이름 등): 토큰별로 첫 글자만 남긴다 (John Doe → J*** D**)
 *
 * @param name 원본 이름 (null/빈 값 허용)
 * @param fallback 이름이 비어 있을 때 반환값
 */
export function maskPersonName(
  name: string | null | undefined,
  fallback = "익명",
): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return fallback;

  // 공백이 있으면 토큰 단위로 처리 (영문 성/이름 분리 표기 등)
  if (/\s/.test(trimmed)) {
    return trimmed
      .split(/\s+/)
      .map((token) => maskSingleToken(token))
      .join(" ");
  }

  return maskSingleToken(trimmed);
}

function maskSingleToken(token: string): string {
  const chars = Array.from(token);
  if (chars.length <= 1) return token;
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

/**
 * 성·이름 컬럼(lastName + firstName)을 조립한 뒤 마스킹한다.
 * 조립 결과가 비면 fallback 을 반환한다.
 */
export function maskFullName(
  lastName: string | null | undefined,
  firstName: string | null | undefined,
  fallback = "익명",
): string {
  const full = `${lastName ?? ""}${firstName ?? ""}`.trim();
  return maskPersonName(full, fallback);
}
