import { redirect } from 'next/navigation';

/**
 * Legacy route — 2026-04-22 DEPRECATED
 * `/notice/create` is redirected to `/notices-create` (canonical admin route)
 *
 * usePageReady: not applicable (server component, 즉시 redirect)
 */
export default function NoticeCreateLegacyRedirect() {
  redirect('/notices-create');
}
