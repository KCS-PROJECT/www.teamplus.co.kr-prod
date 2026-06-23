'use client';

import { ReactNode } from 'react';
import { useAppBack } from '@/hooks/useAppBack';

/**
 * AppBackHandlerSetup
 *
 * Android 하드웨어 백 버튼 + 소프트 백 통합 핸들러를 앱 전역에 단 1회 등록한다.
 * `ClientProviders` 내부 `AuthProvider` 하위에 마운트되어 모든 페이지에서 동작.
 *
 * 동작:
 *   - Android 하드웨어 백 → useAppBack 의 통합 로직 호출
 *   - 홈 페이지(parent/coach/director/admin/student/child/teen) 에서 백 시 종료 confirm
 *   - 그 외 페이지 → router.back()
 *
 * 페이지별 가로채기(모달 닫기 등)가 필요하면 해당 페이지에서 `useAppBack({ onIntercept })` 추가 등록.
 */
export function AppBackHandlerSetup({ children }: { children: ReactNode }) {
  useAppBack();
  return <>{children}</>;
}
