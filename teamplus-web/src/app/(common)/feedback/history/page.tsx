import { redirect } from 'next/navigation';

// usePageReady: not applicable (server component)
export const dynamic = 'force-dynamic';

export default function FeedbackHistoryRedirect() {
  redirect('/feedback?tab=history');
}
