import { redirect } from 'next/navigation';

/**
 * Legacy route — 2026-04-22 DEPRECATED
 * `/teams` is redirected to `/team` (팀 관리 신규 구조 · 2026-04-11 재설계)
 */
// usePageReady: not applicable (server component)
export default function TeamsLegacyRedirect() {
  redirect('/team');
}
