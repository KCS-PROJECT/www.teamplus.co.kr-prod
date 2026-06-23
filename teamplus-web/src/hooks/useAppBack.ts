'use client';

/**
 * useAppBack — 소프트(브라우저) 백 + 하드웨어(Android) 백 통합 훅
 *
 * 2026-05-16 (백키 통합 처리 — 기획서 hardware-back-key-2026-05-16):
 *   - window.confirm → ConfirmDialog(variant='danger') 로 전환 (디자인 가이드 준수)
 *   - history 비었을 때 → 사용자 역할의 홈으로 router.replace
 *   - 홈 페이지에서 "종료하기" 선택 → nativeNav.exitApp() (Android 종료)
 *   - 다이얼로그 중복 표시 방지 (백키 연타)
 *
 * 동작 우선순위:
 *   1) `onIntercept` true 반환 → 핸들러가 처리, 추가 back 동작 X
 *   2) 홈 페이지 (ROLE_HOME_PATHS) → ConfirmDialog 표시
 *      - "종료하기" → nativeNav.exitApp()
 *      - "취소" → 화면 유지
 *   3) history.length <= 1 → router.replace(getDashboardPathByUserType(user.userType))
 *   4) 그 외 → router.back()
 *
 * Android 하드웨어 백:
 *   - useEffect 에서 setHardwareBackEnabled(true) + onHardwareBack(...) 자동 등록
 *   - 컴포넌트 언마운트 시 cleanup (setHardwareBackEnabled(false))
 *
 * 사용:
 *   - AppBackHandlerSetup 에서 1회 호출 (전역 등록)
 *   - 또는 특정 페이지에서 onIntercept 로 모달/폼 dirty 우선 처리
 *
 * @example
 * // 전역 — 자동 통합 핸들러
 * useAppBack();
 *
 * // 페이지별 — 모달 우선 처리
 * useAppBack({
 *   onIntercept: () => {
 *     if (isModalOpen) { closeModal(); return true; }
 *     return false;
 *   },
 * });
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isAndroid, navigation as nativeNav } from '@/services/native-bridge';
import { isHomePath } from '@/lib/nav-stack';
import { useModal } from '@/components/ui/Modal/ModalContext';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardPathByUserType } from '@/lib/auth-routing';
import { MESSAGES } from '@/lib/messages';

export interface UseAppBackOptions {
  /**
   * 백 동작 가로채기. true 반환 시 기본 back 동작 차단.
   * 모달/시트 닫기, 폼 dirty confirm 등 UI 컨텍스트 우선 처리에 사용.
   */
  onIntercept?: () => boolean | Promise<boolean>;
  /**
   * 활성화 여부. false 면 모든 핸들러 등록 skip.
   * 기본: true
   */
  enabled?: boolean;
}

export function useAppBack(options: UseAppBackOptions = {}): { back: () => Promise<void> } {
  const { onIntercept, enabled = true } = options;

  const router = useRouter();
  const pathname = usePathname();
  const { modal } = useModal();
  const { user } = useAuth();

  // 최신 onIntercept 참조 — closure 갱신 회피
  const interceptRef = useRef(onIntercept);
  useEffect(() => { interceptRef.current = onIntercept; }, [onIntercept]);

  // 종료 다이얼로그 중복 표시 방지 (백키 연타)
  const exitDialogOpenRef = useRef(false);

  const back = useCallback(async () => {
    // 1) intercept — 모달/폼 dirty 등 UI 컨텍스트 우선
    if (interceptRef.current) {
      const intercepted = await interceptRef.current();
      if (intercepted) return;
    }

    // 2) 홈 페이지 → ConfirmDialog (variant=danger)
    if (isHomePath(pathname)) {
      if (exitDialogOpenRef.current) return; // 중복 차단
      exitDialogOpenRef.current = true;
      try {
        const confirmed = await modal.confirm({
          title: MESSAGES.common.exitConfirmTitle,
          message: MESSAGES.common.exitConfirmMessage,
          confirmText: MESSAGES.common.exitConfirmButton,
          cancelText: MESSAGES.common.cancel,
          variant: 'danger',
        });
        if (confirmed) {
          // Android 만 실제 종료. iOS / 웹은 native-bridge 측에서 silent no-op.
          await nativeNav.exitApp();
        }
      } finally {
        exitDialogOpenRef.current = false;
      }
      return;
    }

    // 3) history 없음 → 사용자 역할의 홈으로 replace
    //    딥링크 진입(history.length===1)이거나 직접 URL 입력 진입 시 대응.
    if (typeof window !== 'undefined' && window.history.length <= 1) {
      const homePath = getDashboardPathByUserType(user?.userType, '/login');
      router.replace(homePath);
      return;
    }

    // 4) 일반 페이지 → 기본 back
    router.back();
  }, [router, pathname, modal, user?.userType]);

  // ── Android 하드웨어 백 버튼 등록 ──────────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (!isAndroid()) return; // iOS/web 미적용

    nativeNav.setHardwareBackEnabled(true);
    const cleanup = nativeNav.onHardwareBack(() => {
      // void Promise — onHardwareBack 은 sync 콜백
      void back();
    });

    return () => {
      cleanup();
      // 페이지 언마운트 시 시스템 백 동작 복원 — 다른 페이지가 다시 등록할 수 있음
      nativeNav.setHardwareBackEnabled(false);
    };
  }, [enabled, back]);

  return { back };
}
