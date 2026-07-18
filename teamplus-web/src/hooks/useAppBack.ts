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
 * 동작 우선순위 (history -1 + 2단 백 폴백 — 2026-07-17 사용자 재지시 v2):
 *   0) 열린 provider-level 모달 → 최상단 모달 닫기
 *   1) `onIntercept` true 반환 → 핸들러가 처리, 추가 back 동작 X (모달 닫기 등)
 *   2) 메인(홈) 화면 (ROLE_HOME_PATHS) → 종료 ConfirmDialog (requestAppExit)
 *      - "종료하기" → (native) 로컬·세션 클리어(clearSession) 후 nativeNav.exitApp()
 *      - "취소" → 화면 유지
 *   3) 그 외 → router.back() (history -1 — 직전 화면 복귀. 앱/웹 공통).
 *      단, 뒤로 갈 위치 소진(isBackHistoryExhausted) 또는 back 목적지가 인증 진입
 *      화면(isBackTargetAuthEntry — 로그인/온보딩 등 리다이렉트 루프)이면 역할
 *      메인으로 replace (2단 백 폴백) → 이후 메인에서 백 → (2)의 종료 확인.
 *      (구 v1 2026-07-16 "native submain → 무조건 메인 replace"는 상세 페이지에서도
 *       홈으로 점프하는 회귀라 폐기)
 *
 * 2026-07-16 (종료 시 세션 클리어 — 백버튼 앱 종료 프로세스):
 *   - 종료 확인 시 AuthContext.clearSession() 으로 로컬·세션(토큰) 클리어 후 종료 →
 *     재실행 시 반드시 로그인 화면을 거친다. clearSession 은 /login 이동·서버 로그아웃을
 *     하지 않아(종료 직전 로그인 화면 플래시·네트워크 hang 지연 제거) hybridAuth.clearToken()
 *     을 await 하므로 native 에서도 종료 전 토큰이 확실히 비워진다(iOS 포함).
 *   - 소프트 백(useNavigation.back)의 히스토리 소진도 APP_BACK_EXHAUSTED_EVENT 로
 *     위임받아 동일한 종료 confirm 플로우를 태운다 (SoT 단일화).
 *
 * Android 하드웨어 백:
 *   - useEffect 에서 setHardwareBackEnabled(true) + onHardwareBack(...) 자동 등록
 *   - 컴포넌트 언마운트 시 cleanup (setHardwareBackEnabled(false))
 *   - modal/clearSession 은 ref 로 고정 — ModalContext 리렌더(모달 열림/닫힘)마다
 *     back 이 재생성되어 하드웨어 백 setEnabled(false→true) 브릿지가 스팸되던 churn 차단.
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
import { isAndroid, isNativeApp, navigation as nativeNav } from '@/services/native-bridge';
import {
  isHomePath,
  isBackHistoryExhausted,
  isBackTargetAuthEntry,
  APP_BACK_EXHAUSTED_EVENT,
} from '@/lib/nav-stack';
import { useModal, modalBackController } from '@/components/ui/Modal/ModalContext';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardPathByUserType } from '@/lib/auth-routing';
import { MESSAGES } from '@/lib/messages';

// 종료 전 세션 클리어(브릿지 clearToken = FCM 해제 + secure storage 삭제 + 쿠키) 최대 대기.
// 네이티브 브릿지 hang 이 앱 종료를 무한정 막지 않도록 상한을 둔다 — 타임아웃으로 미완료된
// 클리어는 Flutter exitApp 쪽 세션 클리어(AppExit.terminateWithSessionClear)가 재수행한다.
const EXIT_CLEAR_TIMEOUT_MS = 5000;

// 종료 다이얼로그 중복 표시 방지 — 백키 연타 + 훅 다중 인스턴스(전역 AppBackHandlerSetup
// 와 페이지별 onIntercept 등록이 공존) 모두에서 팝업이 1개만 뜨도록 모듈 레벨로 공유한다.
let exitDialogOpen = false;

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
  const { user, clearSession } = useAuth();

  // 최신 onIntercept 참조 — closure 갱신 회피
  const interceptRef = useRef(onIntercept);
  useEffect(() => { interceptRef.current = onIntercept; }, [onIntercept]);

  // modal/clearSession 최신 참조 — ModalContext(비메모이즈 value) 리렌더마다 back 이
  // 재생성되어 하드웨어 백 effect 가 재실행되던 churn 을 끊기 위해 ref 로 고정한다.
  const modalRef = useRef(modal);
  useEffect(() => { modalRef.current = modal; }, [modal]);
  const clearSessionRef = useRef(clearSession);
  useEffect(() => { clearSessionRef.current = clearSession; }, [clearSession]);
  // pathname/userType 도 ref 로 고정 — 페이지 전환마다 back 재생성 → 하드웨어 백
  // effect 재실행(setHardwareBackEnabled false→true 브릿지 왕복)되던 churn 을 없앤다.
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  const userTypeRef = useRef(user?.userType);
  useEffect(() => { userTypeRef.current = user?.userType; }, [user?.userType]);

  /**
   * 앱 종료 확인 플로우 SoT (2026-07-16). deps=[] 로 stable (내부는 ref 참조).
   *
   * ConfirmDialog → "취소": 화면 유지 / "종료하기": (native) 로컬·세션 클리어 후 종료.
   * - clearSession(): 로컬 캐시·역할뷰·최근메뉴 정리 + hybridAuth.clearToken()(FCM 해제
   *   → secure storage 삭제 → refresh 쿠키 삭제)을 await. /login 이동·서버 로그아웃 없음
   *   → 종료 직전 로그인 화면 플래시·네트워크 hang 지연 제거, 토큰은 종료 전 확실히 비움.
   * - 네이티브 브릿지 hang 대비 EXIT_CLEAR_TIMEOUT_MS 상한 — 미완료분은 Flutter
   *   exitApp(terminateWithSessionClear)이 이중 안전망으로 재클리어한다.
   * - confirm "종료하기" 이후에는 어떤 예외에도 exitApp 이 반드시 호출되도록 try/catch 로
   *   감싼다(clearSession 은 내부 전체 try/catch 라 통상 throw 없음 — 방어적).
   * - iOS/웹: exitApp 은 silent no-op. 단 clearSession 이 이미 토큰을 비웠으므로 재실행 시
   *   로그인 화면이 보장된다(iOS 안전망 부재 문제 해소).
   */
  const requestAppExit = useCallback(async () => {
    if (exitDialogOpen) return; // 중복 차단 (백키 연타 · 다중 인스턴스)
    exitDialogOpen = true;
    try {
      const confirmed = await modalRef.current.confirm({
        title: MESSAGES.common.exitConfirmTitle,
        message: MESSAGES.common.exitConfirmMessage,
        confirmText: MESSAGES.common.exitConfirmButton,
        cancelText: MESSAGES.common.cancel,
        variant: 'danger',
      });
      if (!confirmed) return; // 취소 → 화면 유지

      if (isNativeApp()) {
        try {
          await Promise.race([
            clearSessionRef.current(),
            new Promise((resolve) => setTimeout(resolve, EXIT_CLEAR_TIMEOUT_MS)),
          ]);
        } catch {
          // 방어적 — clearSession 예외에도 아래 exitApp 은 반드시 도달.
          //   미완료 클리어는 Flutter terminateWithSessionClear 가 재수행.
        }
      }
      // Android 만 실제 종료. iOS / 웹은 native-bridge 측에서 silent no-op.
      await nativeNav.exitApp();
    } finally {
      exitDialogOpen = false;
    }
  }, []);

  // 역할 메인 경로 — next.config trailingSlash:true 대응으로 슬래시 부여
  //   (초기 로드용 Flutter _dashboardPathByUserType 와 동일 규약 — 308 흰 화면 회피).
  const roleHomePath = useCallback(() => {
    const p = getDashboardPathByUserType(userTypeRef.current, '/login');
    return p.endsWith('/') ? p : `${p}/`;
  }, []);

  const back = useCallback(async () => {
    // 0) 열린 provider-level 모달(confirm/alert/open)이 있으면 우선 닫기.
    //    이 모달들은 페이지 상단 포탈에서 렌더되어 네비게이션으로 닫히지 않으므로,
    //    2단 백에서 홈으로 이동하기 전에 먼저 닫아 "모달이 홈에 잔존"하는 회귀를 막는다.
    //    (종료 확인 다이얼로그 자체도 이 경로로 취소됨 — 일관)
    if (modalBackController.getOpenCount() > 0) {
      modalBackController.closeTop();
      return;
    }

    // 1) intercept — 폼 dirty 등 페이지 UI 컨텍스트 우선
    if (interceptRef.current) {
      const intercepted = await interceptRef.current();
      if (intercepted) return;
    }

    // 2) 메인(홈) 화면 → 앱 종료 확인 팝업
    //    확인 시 세션 클리어 후 종료(재실행 시 로그인). 취소 시 화면 유지.
    if (isHomePath(pathnameRef.current)) {
      await requestAppExit();
      return;
    }

    // 3) history -1 — 하드/소프트 · 앱/웹 공통 (2026-07-17 사용자 재지시 v2).
    //    (구 2026-07-16 v1 "native submain → 무조건 메인 replace"는 상세/서브 페이지에서도
    //    홈으로 점프해 "back = 직전 화면 복귀" 기대를 깨는 회귀 — 폐기.)
    //    뒤로 갈 위치가 소진됐거나 back 목적지가 인증 진입 화면(로그인/온보딩 등 —
    //    되돌아가면 인증 가드 리다이렉트 루프)이면 역할 메인으로 replace (2단 백 폴백).
    //    BottomNav 탭 전환은 router.replace 라 탭 허브의 직전 엔트리가 인증 화면인 경우가
    //    많고, 그 경우 탭 허브 → 메인 → (2) 종료 확인의 2단 백이 유지된다.
    if (isBackHistoryExhausted() || isBackTargetAuthEntry()) {
      router.replace(roleHomePath());
      return;
    }
    router.back();
  }, [router, requestAppExit, roleHomePath]);

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

  // ── 소프트 백버튼 히스토리 소진 위임 수신 (2026-07-16) ─────────
  //   useNavigation.back() 이 native 앱에서 뒤로 갈 위치 소진을 감지하면
  //   APP_BACK_EXHAUSTED_EVENT 를 발행 — 여기서 받아 2단 백 로직(back)을 태운다.
  //   (submain → 메인 / 메인 → 종료 확인 — 하드웨어 백과 동일 SoT)
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const handler = () => {
      void back();
    };
    window.addEventListener(APP_BACK_EXHAUSTED_EVENT, handler);
    return () => window.removeEventListener(APP_BACK_EXHAUSTED_EVENT, handler);
  }, [enabled, back]);

  return { back };
}
