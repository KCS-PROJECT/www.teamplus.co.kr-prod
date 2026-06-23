'use client';

import { useCallback, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { AuthContext } from '@/contexts/AuthContext';
import { useModal } from '@/components/ui/Modal/ModalContext';

/**
 * 인증 없이 접근 가능한 UI 경로 (메뉴 클릭 시 로그인 가드 면제).
 * API 레벨 `PUBLIC_API_PATTERNS`와 분리 — 이쪽은 라우트 전용.
 */
const PUBLIC_UI_PATHS: readonly string[] = [
  '/login',
  '/signup',
  '/find-id',
  '/find-password',
  '/password-reset-complete',
  '/splash',
  '/onboarding',
  '/faq',
  '/terms',
  '/academies',
];

export function isPublicUIPath(href: string): boolean {
  const path = href.split('?')[0].split('#')[0];
  return PUBLIC_UI_PATHS.some(
    (p) => path === p || path.startsWith(p + '/'),
  );
}

/**
 * 메뉴/버튼 클릭 시 로그인 여부를 검사하고, 비로그인이면 커스텀 알럿을 띄운 뒤
 * 확인을 누르면 `/login?redirect=...&reason=required` 로 이동시킨다.
 *
 * - 공개 경로(/login, /signup, /onboarding, ...)는 통과
 * - AuthContext `isLoading` 중에는 통과 (API layer가 최종 검증)
 * - 반환값 `false` 이면 호출자는 네비게이션을 중단해야 한다.
 *
 * @example
 * const guard = useAuthClickGuard();
 * const ok = await guard('/classes/123');
 * if (!ok) return;
 * router.push('/classes/123');
 */
export function useAuthClickGuard() {
  // AuthContext 를 직접 읽어 null-safe 처리.
  // AuthProvider 자체가 useNavigation 을 사용하므로, AuthProvider 초기 렌더 시점에는
  // context 가 아직 null 이다. 이 경우 guard 는 skip (API layer 가 최종 검증한다).
  const auth = useContext(AuthContext);
  const { modal } = useModal();
  const router = useRouter();

  return useCallback(
    async (href: string): Promise<boolean> => {
      // AuthProvider 외부 혹은 초기화 전 — guard 비활성화
      if (!auth) return true;
      if (auth.isLoading) return true;
      if (isPublicUIPath(href)) return true;
      if (auth.isAuthenticated) return true;

      await modal.alert({
        title: '로그인이 필요합니다',
        message: '이 메뉴를 이용하시려면 로그인해 주세요.',
        buttonText: '확인',
        variant: 'warning',
      });

      const encoded = encodeURIComponent(href);
      router.push(`/login?redirect=${encoded}&reason=required`);
      return false;
    },
    [auth, modal, router],
  );
}
