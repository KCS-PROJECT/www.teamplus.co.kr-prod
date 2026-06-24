'use client';

/**
 * /dashboard/members — 학생 관리 (2026-05-12 재구성)
 *
 * 변경:
 *  - 단일 테이블/결제권 위젯 → 팀별 그룹 카드 (다른 관리 페이지와 동일 형태)
 *  - 수정/삭제 버튼 (admin)
 *  - 결제권 등 학생별 세부 기능은 학생 상세(`/dashboard/members/[id]`) 로 이관
 *  - 승인 대기 학생은 별도 페이지(`/dashboard/members/pending`) 에서 처리
 */

import { TeamGroupedUserList } from '@/components/admin/TeamGroupedUserList';

export default function MembersPage() {
  return (
    <TeamGroupedUserList
      title="학생 관리"
      userType="TEEN,CHILD"
      roleLabel="학생"
      accentClass="border-l-amber-500/70"
    />
  );
}
