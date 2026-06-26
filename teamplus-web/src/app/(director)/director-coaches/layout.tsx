'use client';

import { ReactNode } from 'react';
import { useRequireRole } from '@/contexts/AuthContext';
import { LoadingPuck } from '@/components/ui/LoadingPuck';

/**
 * DirectorCoachesLayout — 코치 관리(감독 운영 도구) 전용 가드.
 *
 * 상위 (director)/layout.tsx 는 임시로 coach 까지 허용하지만, 코치 관리 화면은
 * admin 전용 API(`/admin/coaches/:id`)를 호출하므로 코치가 진입하면 403 → 에러가 난다.
 * 코치는 자기 약력을 마이 프로필(/profile/edit)에서 직접 등록하므로 이 화면은 불필요 →
 * coach 를 제외한 중첩 가드를 추가한다. (백엔드 updateCoach 권한 DIRECTOR/ACADEMY_DIRECTOR 와 정렬)
 *
 * ⚠️ (director) 공통 가드(layout.tsx)는 24개 화면·academy_director 영향으로 수정 금지.
 *    BottomNav 등 레이아웃 요소는 상위 layout 이 이미 렌더하므로 여기선 가드 + children 만.
 */
export default function DirectorCoachesLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAllowed } = useRequireRole(['director', 'academy_director', 'admin']);

  if (isLoading) return <LoadingPuck />;

  if (!isAllowed) return null;

  return <>{children}</>;
}
