'use client';

/**
 * /dashboard/directors — 감독 관리 (2026-05-12 재구성)
 *
 * 변경:
 *  - 단일 테이블 → 팀별 그룹 카드 (수업관리 페이지와 동일 형태)
 *  - 수정/삭제 버튼 추가 (admin)
 *  - 삭제 시 산하 팀에 코치/학부모/학생이 있으면 백엔드가 차단 (메시지 토스트)
 */

import { TeamGroupedUserList } from '@/components/admin/TeamGroupedUserList';

export default function DirectorsPage() {
  // [수정 2026-05-13] ACADEMY_DIRECTOR(오픈클래스 감독)도 감독관리에 포함.
  //  이전엔 코치관리에 표시되어 페르소나 미스매치. 감독 그룹으로 통합.
  return (
    <TeamGroupedUserList
      title="감독 관리"
      userType="DIRECTOR,ACADEMY_DIRECTOR"
      roleLabel="감독"
      accentClass="border-l-rose-500/70"
    />
  );
}
