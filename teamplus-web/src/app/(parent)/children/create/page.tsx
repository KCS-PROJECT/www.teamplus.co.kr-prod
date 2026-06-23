// Legacy route — 2026-04-22 DEPRECATED.
// `/children/create` is redirected to `/children/add` (canonical route).
// usePageReady 신호는 redirect 대상 페이지에서 발생.
import { redirect } from 'next/navigation';

export default function ChildrenCreateLegacyRedirect() {
  redirect('/children/add');
}
