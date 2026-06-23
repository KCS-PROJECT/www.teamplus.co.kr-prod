'use client';

/**
 * /dashboard/parents — 학부모 관리 (2026-05-12 재구성)
 *
 * 변경:
 *  - 단일 테이블 → 팀별 그룹 카드 (수업관리 페이지와 동일 형태)
 *  - 수정/삭제 버튼 추가 (admin)
 *  - 삭제 시 등록된 자녀가 있으면 백엔드가 차단 (메시지 토스트)
 */

import { TeamGroupedUserList } from '@/components/admin/TeamGroupedUserList';

export default function ParentsPage() {
  return (
    <TeamGroupedUserList
      title="학부모 관리"
      userType="PARENT"
      roleLabel="학부모"
      accentClass="border-l-emerald-500/70"
    />
  );
}
