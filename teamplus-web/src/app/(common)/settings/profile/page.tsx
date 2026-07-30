import { redirect } from 'next/navigation';

// usePageReady: not applicable (server component)
// 프로필 확인·수정의 표준 화면은 /profile/edit — 본 경로는 구 설정 프로필 URL 호환용 스텁
export default function ProfileSettingsPage() {
  redirect('/profile/edit');
}
