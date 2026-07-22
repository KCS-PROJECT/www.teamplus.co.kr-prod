'use client';

/**
 * /dashboard/coaches — "감독/코치 관리"로 통합(2026-07-22).
 *  코치관리 단독 메뉴는 제거되고, 감독/코치를 한 화면에서 관리한다.
 *  북마크·직접 접근 대응으로 통합 페이지로 리다이렉트.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CoachesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/directors');
  }, [router]);
  return null;
}
