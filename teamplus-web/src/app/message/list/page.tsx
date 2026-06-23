import { redirect } from 'next/navigation';

/**
 * Legacy route — 2026-04-22 DEPRECATED
 * `/message/list` is redirected to `/messages` (canonical messaging route)
 */
// usePageReady: not applicable (server component)
export default function MessageListLegacyRedirect() {
  redirect('/messages');
}
