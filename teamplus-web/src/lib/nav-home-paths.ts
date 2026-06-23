/**
 * 홈 페이지 경로 SoT
 *
 * 5개 메인 대시보드 + BottomNav 의 홈 탭 진입 경로.
 * `useAppBack` / `nav-stack` 유틸에서 "홈 진입 여부" 판정에 사용.
 */

export const ROLE_HOME_PATHS = new Set<string>([
  '/admin',
  '/director',
  '/coach',
  '/parent',
  '/student',
  '/child',
  '/teen',
]);
