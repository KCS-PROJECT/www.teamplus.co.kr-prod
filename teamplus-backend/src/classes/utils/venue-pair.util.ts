/**
 * {venueId, venueText} 정규화 — 수업 장소 2필드 모델 단일 정규화 지점.
 *
 * 의미(설계 v5.2 §1): venueId(링크장 마스터 FK)가 있으면 venueText 는 그 안의 세부 구역,
 * 없으면 venueText 가 장소 전체(마스터 미등록 장소). 두 필드는 독립이며 결합 검증을 두지 않는다 —
 * 결합 규칙은 ① 프론트가 장소 소스 전이 시 venueText 를 초기화 ② Venue 삭제 시 텍스트 승격
 * (venues.service) 두 가지뿐.
 *
 * 모든 pair writer(수업 생성/수정 · 일정 bulk/단건/apply-draft)는 이 함수를 통과한 쌍만 기록한다.
 */
export interface VenuePair {
  venueId: string | null;
  venueText: string | null;
}

export function normalizeVenuePair(
  venueId: string | null | undefined,
  venueText: string | null | undefined,
): VenuePair {
  return {
    venueId: venueId?.trim() || null,
    venueText: venueText?.trim() || null,
  };
}
