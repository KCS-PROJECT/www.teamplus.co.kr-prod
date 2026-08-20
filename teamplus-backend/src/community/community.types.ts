/** 커뮤니티 요청 주체 — 축별 권한 판정에 userType 이 필요하다 */
export interface CommunityActor {
  id: string;
  userType?: string;
}
