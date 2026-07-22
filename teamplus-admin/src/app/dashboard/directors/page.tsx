'use client';

/**
 * /dashboard/directors — 감독/코치 관리 (2026-07-22 통합)
 *
 * 변경:
 *  - 기존 감독관리(/directors) + 코치관리(/coaches)를 한 화면으로 통합.
 *  - 한 화면에서 각 팀별로 소속된 감독/코치를 함께 표시.
 *  - 행별 뱃지·색상으로 역할 구분 (감독=로즈 · 오픈클래스 감독=앰버 · 코치=블루).
 *  - /dashboard/coaches 는 이 페이지로 리다이렉트, 사이드바 "코치관리" 메뉴 제거.
 */

import { TeamGroupedUserList } from '@/components/admin/TeamGroupedUserList';

export default function DirectorsCoachesPage() {
  return (
    <TeamGroupedUserList
      title="감독/코치 관리"
      userType="DIRECTOR,ACADEMY_DIRECTOR,COACH"
      roleLabel="감독/코치"
      accentClass="border-l-slate-400"
    />
  );
}
