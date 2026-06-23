/**
 * /dashboard/classes (deprecated)
 *
 * 2026-05-09: 전체 평탄 목록 페이지 폐기 — 팀별 그룹 표시인 /dashboard/attendance 로 일원화.
 * 직접 URL 진입 시 자동 redirect.
 */

import { redirect } from 'next/navigation';

export default function ClassesRedirectPage() {
  redirect('/dashboard/attendance');
}
