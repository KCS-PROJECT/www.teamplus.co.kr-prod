import { redirect } from 'next/navigation';

// usePageReady: not applicable (server component)
export default function ProfilePage() {
  redirect('/mypage');
}
