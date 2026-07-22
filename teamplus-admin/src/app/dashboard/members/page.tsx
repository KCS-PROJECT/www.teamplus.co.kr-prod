'use client';

/**
 * /dashboard/members — 학부모/선수 관리 (2026-07-22 통합)
 *
 * 변경:
 *  - 기존 학생관리(/members) + 학부모관리(/parents)를 한 화면으로 통합.
 *  - 팀별 카드에 학부모+선수를 함께 표시 (학부모는 자녀 소속 팀으로 자동 매핑,
 *    자녀가 여러 팀이면 각 팀에 중복 표시 · 실제 팀 소속은 없음 = 자녀 따라감).
 *  - 행별 뱃지 구분(학부모=에메랄드 · 선수=앰버), 부모 행 클릭 시 실제 자녀(선수) 펼침.
 *  - 팀 소속이 없는 그룹은 "소속 팀 없음"으로 표기(학부모 정책 반영).
 *  - /dashboard/parents 는 이 페이지로 리다이렉트, 사이드바 "학생관리" 메뉴 제거.
 *  - 결제권 등 세부 기능은 학생 상세(`/dashboard/members/[id]`), 승인 대기는 `/members/pending`.
 */

import { TeamGroupedUserList } from '@/components/admin/TeamGroupedUserList';

export default function ParentsPlayersPage() {
  return (
    <TeamGroupedUserList
      title="학부모/선수 관리"
      userType="PARENT,TEEN,CHILD"
      roleLabel="학부모/선수"
      accentClass="border-l-slate-400"
    />
  );
}
