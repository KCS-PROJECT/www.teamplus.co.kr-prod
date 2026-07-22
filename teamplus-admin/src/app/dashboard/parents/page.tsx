'use client';

/**
 * /dashboard/parents — "학부모/선수 관리"로 통합(2026-07-22).
 *  학부모관리 단독 메뉴는 제거되고, 학부모/선수를 한 화면에서 관리한다.
 *  북마크·직접 접근 대응으로 통합 페이지(/dashboard/members)로 리다이렉트.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ParentsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/members');
  }, [router]);
  return null;
}
