'use client';

// 감독/코치 팀 공지 '관리' 화면 — 공용 코어 TeamNoticeListView 사용.
//   관리 권한(케밥 수정/삭제)·작성 FAB 노출.
//   mode="manage" → 관리 목록 API(admin/list) — 미게시·예약·만료 공지까지 상태 배지와 함께 노출.
//   BottomNav 는 (director) 그룹 layout 이 렌더한다.
import { TeamNoticeListView } from '@/components/notice/TeamNoticeListView';

export default function DirectorNoticesPage() {
  return (
    <TeamNoticeListView
      title="공지사항 관리"
      canManage
      canWrite
      mode="manage"
      iceTheme
    />
  );
}
