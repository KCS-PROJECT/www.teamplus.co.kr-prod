import { redirect } from 'next/navigation';

// usePageReady: not applicable (server component, 즉시 redirect)
export default function NoticePage() {
  redirect('/notices');
}
