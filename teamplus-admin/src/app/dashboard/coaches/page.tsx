'use client';

/**
 * /dashboard/coaches — 코치 관리 (2026-05-12 재구성)
 *
 * 변경:
 *  - 단일 테이블 → 팀별 그룹 카드 (수업관리 페이지와 동일 형태)
 *  - 수정/삭제 버튼 추가 (admin)
 *  - 삭제 시 본인 소속 팀에 학부모/학생이 있으면 백엔드가 차단 (메시지 토스트)
 */

import { TeamGroupedUserList } from '@/components/admin/TeamGroupedUserList';

export default function CoachesPage() {
  // [수정 2026-05-13] ACADEMY_DIRECTOR 는 감독관리(/dashboard/directors)로 이동.
  //  코치관리에는 COACH 만 표시.
  return (
    <TeamGroupedUserList
      title="코치 관리"
      userType="COACH"
      roleLabel="코치"
      accentClass="border-l-blue-500/70"
    />
  );
}
