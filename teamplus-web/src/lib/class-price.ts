/**
 * Class Price Label Formatter (2026-05-15 T03 협업 / T05-F1)
 *
 * DB-keeper 가 추가한 `singlePriceLabel` / `monthlyPriceLabel` (값: "tbd" | "krw")
 * 을 UI 표시 문자열로 변환한다.
 *
 * 표시 규칙:
 *   - "krw"  → "{toLocaleString()}원"   (정상 금액 — singlePrice / monthlyPrice 와 함께 사용)
 *   - "tbd"  → "별도 책정"               (별도 안내)
 *   - null/undefined → null              (호출자가 폴백 결정)
 *
 * 사용 예:
 *   formatClassPriceLabel('krw', 50000)  →  "50,000원"
 *   formatClassPriceLabel('tbd')         →  "별도 책정"
 *   formatClassPriceLabel(null, 30000)   →  "30,000원"    (라벨 미설정 → krw 폴백)
 *   formatClassPriceLabel(null)          →  null
 */

export type ClassPriceLabel = 'tbd' | 'krw';

const LABEL_DISPLAY: Record<Exclude<ClassPriceLabel, 'krw'>, string> = {
  tbd: '별도 책정',
};

/**
 * Price label + 금액을 표시 문자열로 변환.
 *
 * @param label  DB-keeper 가 부여한 가격 라벨 ('tbd' | 'krw' | null)
 * @param amount 실제 금액 (라벨 'krw' 일 때만 사용, 양수만 표시)
 * @returns      표시 문자열 또는 null (둘 다 없으면 null 반환)
 */
export function formatClassPriceLabel(
  label: ClassPriceLabel | string | null | undefined,
  amount?: number | string | null,
): string | null {
  // 라벨 기반 분기 (정규화 — 대소문자 무관)
  const normalized =
    typeof label === 'string' ? (label.trim().toLowerCase() as ClassPriceLabel) : null;

  if (normalized === 'tbd') {
    return LABEL_DISPLAY[normalized];
  }

  // 'krw' 또는 라벨 없음 → 금액 기반 표시
  const numeric = toNumber(amount);
  if (numeric !== null && numeric > 0) {
    return `${numeric.toLocaleString('ko-KR')}원`;
  }
  return null;
}

/**
 * 금액을 안전하게 number 로 변환.
 *
 *  - number, NaN/Infinity 가드
 *  - Prisma Decimal 직렬화(string) 호환
 *  - bigint, 그 외 unknown 은 null
 */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
