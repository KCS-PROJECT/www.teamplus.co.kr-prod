'use client';

// 팀 공지사항 '열람' 화면 — 학부모/학생 등 회원 대상 (감독/코치는 /director-notices 관리 화면 사용).
//   공용 코어 TeamNoticeListView 사용 (관리 기능 없음 · 미확인 점 노출 · 활성 공지만).
//   top-level 라우트(그룹 layout 없음)라 RoleBottomNav 를 직접 렌더한다.
//   작성 FAB 는 작성 권한 역할(감독/코치/오픈클래스원장)에게만 노출.
// usePageReady: TeamNoticeListView 내부에서 신호 발생.
import { TeamNoticeListView } from '@/components/notice/TeamNoticeListView';
import { RoleBottomNav } from '@/components/layout/RoleBottomNav';
import { useSessionAuth } from '@/hooks/useSessionAuth';

export default function TeamNoticesPage() {
  const { user } = useSessionAuth();
  const userType = user?.userType;
  const canWrite =
    userType === 'coach' ||
    userType === 'director' ||
    userType === 'academy_director';

  return (
    <div className="min-h-screen-safe flex flex-col">
      <div className="flex-1 min-h-0">
        <TeamNoticeListView
          title="팀 공지사항"
          canManage={false}
          canWrite={canWrite}
          showReadState
          activeOnly
          iceTheme
        />
      </div>
      <RoleBottomNav />
    </div>
  );
}
