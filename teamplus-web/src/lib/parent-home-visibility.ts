/**
 * 학부모 홈 노출 판정 — 자녀/팀 조회 상태 기반 순수 함수 (테스트 가능 SoT).
 *
 * 공통 원칙(SPEC_DASHBOARD_READING_CONTENT §2-4): **조회 실패 ≠ 빈 상태**.
 * 실패를 "자녀 0명/팀 0개 확정"으로 오인하면 CTA 를 잘못 숨기거나 포스트를 잘못
 * 승격한다 — 판정은 조회가 정상 완료된 확정 값에서만 내린다.
 */

export interface ParentHomeVisibilityInput {
  /** useChildren 로딩 중 */
  isChildrenLoading: boolean;
  /** useChildren 조회 실패 — 자녀 존재 여부 미확정 */
  hasChildrenError: boolean;
  /** 계정 전체 자녀 수 (성공 응답 기준) */
  childCount: number;
  /** listParentVisibleTeams 도착 여부 (teams !== null) */
  teamsResolved: boolean;
  /** 팀 조회 실패 — 무소속 확정 아님 */
  teamsError: boolean;
  /** 정상 조회된 자녀 팀 개수 (본인 팀 폴백 미포함) — null=미확정 */
  childTeamCount: number | null;
}

/**
 * myOnly 빈 상태 '수업 둘러보기' CTA 노출 여부.
 * 숨기는 경우는 "자녀 0명 **확정**"(성공 응답의 빈 배열) 하나뿐 — 로딩·조회 실패는
 * 낙관적으로 노출을 유지한다 (수업 신청 가능성이 남아 있는 상태).
 */
export function resolveShowBrowseCta(
  input: Pick<
    ParentHomeVisibilityInput,
    'isChildrenLoading' | 'hasChildrenError' | 'childCount'
  >,
): boolean {
  if (input.isChildrenLoading) return true;
  if (input.hasChildrenError) return true;
  return input.childCount > 0;
}

/**
 * 포스트 섹션 배치.
 * - null: 판정 미확정 — 렌더하지 않는다 (선렌더 후 이동 금지).
 * - promoted: 자녀 0명 확정 또는 자녀 팀 0개 확정.
 * - footer: 운영 데이터 있음 또는 조회 실패(확정 불가 — 기본 위치).
 */
export function resolveReadingPlacement(
  input: ParentHomeVisibilityInput,
): 'promoted' | 'footer' | null {
  if (input.isChildrenLoading || !input.teamsResolved) return null;
  if (input.hasChildrenError) return 'footer';
  if (input.childCount === 0) return 'promoted';
  if (input.teamsError || input.childTeamCount === null) return 'footer';
  return input.childTeamCount === 0 ? 'promoted' : 'footer';
}
