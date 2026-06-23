// 관리자 공지 작성 페이지 — /notices-create 로 redirect.
// usePageReady 신호는 redirect 대상 페이지에서 발생.
import { redirect } from 'next/navigation';

export default function AdminNoticeCreateRedirect() {
  redirect('/notices-create');
}
