/**
 * 수업 장소 표시 resolver — 2필드 모델 {venueId(name) | venueText} 공용.
 *
 * 의미(설계 claudedocs/class-venue-detail-design-2026-08-13.md v5.2 §3.6):
 *  - name(마스터 링크장명)이 있으면 venueText 는 세부 구역 → "링크장명 · 세부"
 *  - name 이 없으면 venueText 가 장소 전체 → 텍스트 그대로
 *  - 계층 폴백(회차 → 요일 기본값 → 수업 대표)은 "장소가 있는 첫 층"을 채택하고 그 층의 두 값만 쓴다
 *    (다른 층의 name 과 이 층의 text 를 교차 조합하지 않는다).
 * 구분자는 `·`(중점) — pipe-like 세로 구분선 금지 규약(RULE-D04).
 */
export interface VenueRef {
  /** 마스터 링크장명 (venue.name / venueName) */
  name?: string | null;
  /** venueText — name 있으면 세부 구역, 없으면 장소 전체 */
  text?: string | null;
}

/** 한 층의 {name, text} 를 표시 문자열로. 장소 없으면 null. */
export function formatVenueRef(ref: VenueRef | null | undefined): string | null {
  const n = ref?.name?.trim();
  const t = ref?.text?.trim();
  if (n) return t ? `${n} · ${t}` : n;
  if (t) return t;
  return null;
}

/**
 * 계층 폴백 — 인자 순서 = 우선순위(회차 → 요일 기본값 → 수업 대표).
 * 장소(name 또는 text)가 있는 첫 층만 채택한다.
 */
export function resolveVenueDisplay(
  ...layers: (VenueRef | null | undefined)[]
): string | null {
  for (const layer of layers) {
    const s = formatVenueRef(layer);
    if (s) return s;
  }
  return null;
}
