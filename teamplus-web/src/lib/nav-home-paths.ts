/**
 * 홈 페이지 경로 SoT
 *
 * 5개 메인 대시보드 + BottomNav 의 홈 탭 진입 경로.
 * `useAppBack` / `nav-stack` 유틸에서 "홈 진입 여부" 판정에 사용.
 */

export const ROLE_HOME_PATHS = new Set<string>([
  '/admin',
  '/director',
  // [2026-07-16] academy_director 홈 — 누락 시 아카데미원장이 홈에서 백키 시
  //   종료 확인이 발동하지 않고 자기 자신으로 replace 되는 데드엔드가 됐다.
  //   (auth-routing DASHBOARD_PATHS.academy_director='/academy-director' 와 정합)
  '/academy-director',
  '/coach',
  '/parent',
  '/student',
  '/child',
  '/teen',
]);
