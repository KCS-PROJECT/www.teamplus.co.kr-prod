/**
 * 팀 관리 권한을 갖는 역할 집합.
 *
 * auth-routing 의 normalizeUserType()이 소문자 변환하므로 소문자로 저장.
 * academy_director 는 오픈클래스 감독(coach 확장 역할)으로 팀 관리 가능.
 */

export const TEAM_MANAGER_ROLES: ReadonlySet<string> = new Set([
  'admin',
  'director',
  'academy_director',
  'coach',
]);

export function isTeamManager(user: { userType?: string } | null): boolean {
  if (!user?.userType) return false;
  return TEAM_MANAGER_ROLES.has(user.userType);
}

/**
 * 특정 팀에 대한 관리 권한 — 글로벌 역할 + 본인 멤버십 상태까지 검증.
 *
 * [정책 강화 2026-05-21] 백엔드 `assertTeamManagerPermission` 의 3경로
 * (coachProfile/team.coachId/TeamMember approved) 와 정확히 동일하게 미러링.
 *
 *  - admin                                → 항상 true (시스템 관리자만 글로벌 통과)
 *  - director / academy_director / coach  → team.myApprovalStatus === 'approved' 일 때만
 *    · owner 케이스(team.coachId === userId) 는 백엔드가 'approved' 로 합성하므로
 *      자기 팀에서는 자동 통과
 *    · 다른 팀에 진입한 director/academy_director 는 myApprovalStatus=null → 차단
 *    · pending coach 도 차단 (수정·진입 모두)
 *  - 그 외 (parent/teen/child)            → false (별도 경로/정책)
 *
 * 직전 버전의 "director/academy_director 무조건 통과" 정책은 다른 팀의 관리 UI
 * (수정/삭제 버튼) 가 노출되는 결함이 있어 폐기 (2026-05-21 사용자 보고).
 */
export function isTeamManagerOf(
  user: { userType?: string } | null,
  team: { myApprovalStatus?: 'approved' | 'pending' | null } | null | undefined,
): boolean {
  if (!user?.userType) return false;
  const role = user.userType;
  if (role === 'admin') return true;
  if (TEAM_MANAGER_ROLES.has(role)) {
    return team?.myApprovalStatus === 'approved';
  }
  return false;
}
