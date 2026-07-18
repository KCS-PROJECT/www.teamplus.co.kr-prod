/**
 * useAppBack — 안드로이드 하드웨어 백키 통합 처리 단위 테스트.
 *
 * 검증 시나리오 (Plan §7.1, hardware-back-key-2026-05-16):
 *   1) onIntercept → true → router.back / modal.confirm 미호출
 *   2) 홈 페이지 + 사용자 "종료하기" → modal.confirm 인자 검증 + nativeNav.exitApp 호출
 *   3) 홈 페이지 + 사용자 "취소" → nativeNav.exitApp 미호출, 화면 유지
 *   4) 홈 페이지 + 백키 연타 → modal.confirm 1회만 호출 (중복 차단)
 *   5) 웹 일반 페이지 + history > 1 → router.back 호출
 *   6) 웹 일반 페이지 + history <= 1 → router.replace(getDashboardPathByUserType(userType))
 *   6-native) history -1 + 2단 백 폴백(2026-07-17 v2): native 비홈 + history 있음 →
 *             router.back (직전 화면 복귀) / history 소진 → 역할 메인 replace /
 *             native 메인(홈) → 종료 확인 팝업 → 취소: 유지 / 확인: clearSession 후 exitApp
 *   7) iOS 환경 → setHardwareBackEnabled 미호출
 *   8) APP_BACK_EXHAUSTED_EVENT(소프트 백 위치 소진 위임) 수신 → 2단 백 폴백(메인 replace / 홈 종료)
 *
 * 의존성 모킹:
 *   - next/navigation (useRouter, usePathname)
 *   - @/services/native-bridge (isAndroid, isNativeApp, navigation)
 *   - @/components/ui/Modal/ModalContext (useModal)
 *   - @/contexts/AuthContext (useAuth)
 */

import { renderHook, act } from '@testing-library/react';
import { useAppBack } from '@/hooks/useAppBack';
import { MESSAGES } from '@/lib/messages';
import { APP_BACK_EXHAUSTED_EVENT } from '@/lib/nav-stack';

// ─── 모듈 모킹 ───────────────────────────────────────────────────────────

const routerBackMock = jest.fn();
const routerReplaceMock = jest.fn();
const usePathnameMock = jest.fn<string, []>(() => '/parent/credits');

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    back: routerBackMock,
    replace: routerReplaceMock,
    push: jest.fn(),
  }),
  usePathname: () => usePathnameMock(),
}));

const isAndroidMock = jest.fn(() => true);
// 기본 false(웹) — native 시나리오 테스트에서 개별 true 설정
const isNativeAppMock = jest.fn(() => false);
const setHardwareBackEnabledMock = jest.fn();
const onHardwareBackMock = jest.fn();
const exitAppMock = jest.fn(() => Promise.resolve());

jest.mock('@/services/native-bridge', () => ({
  isAndroid: () => isAndroidMock(),
  isNativeApp: () => isNativeAppMock(),
  navigation: {
    setHardwareBackEnabled: (...args: unknown[]) => setHardwareBackEnabledMock(...args),
    onHardwareBack: (handler: () => void) => {
      onHardwareBackMock(handler);
      // cleanup 함수 반환 — useAppBack 의 useEffect cleanup 시 호출
      return jest.fn();
    },
    exitApp: () => exitAppMock(),
  },
}));

const confirmMock = jest.fn<Promise<boolean>, [unknown]>();
const modalOpenCountMock = jest.fn(() => 0);
const modalCloseTopMock = jest.fn();

jest.mock('@/components/ui/Modal/ModalContext', () => ({
  useModal: () => ({
    modal: {
      confirm: (opts: unknown) => confirmMock(opts),
      alert: jest.fn(),
      open: jest.fn(),
      close: jest.fn(),
    },
  }),
  modalBackController: {
    getOpenCount: () => modalOpenCountMock(),
    closeTop: () => modalCloseTopMock(),
  },
}));

const useAuthMock = jest.fn(() => ({
  user: { userType: 'parent', userId: 1, userName: 'Test', userEmail: 'test@x.com' },
  isAuthenticated: true,
  isLoading: false,
  login: jest.fn(),
  logout: jest.fn(),
  clearSession: jest.fn(() => Promise.resolve()),
  signup: jest.fn(),
  refreshUser: jest.fn(),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

// ─── 테스트 유틸 ─────────────────────────────────────────────────────────

/**
 * window.history.length 를 강제 설정.
 * jsdom 기본값은 누적되므로 케이스별 명시 설정 필요.
 */
function setHistoryLength(length: number) {
  Object.defineProperty(window.history, 'length', {
    configurable: true,
    get: () => length,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks 는 mockResolvedValueOnce 의 once-큐를 비우지 않는다 —
  // 테스트4(연타)가 소비하지 않은 once 값이 다음 테스트로 누수되므로 명시 reset.
  confirmMock.mockReset();
  isAndroidMock.mockReturnValue(true);
  isNativeAppMock.mockReturnValue(false); // 기본: 웹 — native 케이스는 개별 설정
  modalOpenCountMock.mockReturnValue(0); // 기본: 열린 모달 없음
  usePathnameMock.mockReturnValue('/parent/credits');
  setHistoryLength(5); // 기본: 일반 페이지처럼 history 충분
  useAuthMock.mockReturnValue({
    user: { userType: 'parent', userId: 1, userName: 'Test', userEmail: 'test@x.com' },
    isAuthenticated: true,
    isLoading: false,
    login: jest.fn(),
    logout: jest.fn(),
    clearSession: jest.fn(() => Promise.resolve()),
    signup: jest.fn(),
    refreshUser: jest.fn(),
  });
});

describe('useAppBack', () => {
  describe('Android 하드웨어 백 등록', () => {
    it('Android 환경에서는 setHardwareBackEnabled(true) 와 onHardwareBack 을 등록한다', () => {
      renderHook(() => useAppBack());

      expect(setHardwareBackEnabledMock).toHaveBeenCalledWith(true);
      expect(onHardwareBackMock).toHaveBeenCalledTimes(1);
    });

    it('iOS 환경에서는 setHardwareBackEnabled / onHardwareBack 을 등록하지 않는다', () => {
      isAndroidMock.mockReturnValue(false);

      renderHook(() => useAppBack());

      expect(setHardwareBackEnabledMock).not.toHaveBeenCalled();
      expect(onHardwareBackMock).not.toHaveBeenCalled();
    });

    it('enabled=false 면 등록을 skip 한다', () => {
      renderHook(() => useAppBack({ enabled: false }));

      expect(setHardwareBackEnabledMock).not.toHaveBeenCalled();
      expect(onHardwareBackMock).not.toHaveBeenCalled();
    });
  });

  describe('0) 열린 모달 우선 닫기', () => {
    it('provider-level 모달이 열려 있으면 닫기만 하고 네비게이션/종료 안 함', async () => {
      isNativeAppMock.mockReturnValue(true);
      usePathnameMock.mockReturnValue('/parent'); // 홈이어도 모달 우선
      modalOpenCountMock.mockReturnValue(1);

      const { result } = renderHook(() => useAppBack());

      await act(async () => {
        await result.current.back();
      });

      expect(modalCloseTopMock).toHaveBeenCalledTimes(1);
      expect(confirmMock).not.toHaveBeenCalled(); // 종료 확인 미표시
      expect(routerReplaceMock).not.toHaveBeenCalled();
      expect(routerBackMock).not.toHaveBeenCalled();
      expect(exitAppMock).not.toHaveBeenCalled();
    });
  });

  describe('1) onIntercept 우선 처리', () => {
    it('onIntercept 가 true 를 반환하면 router.back / modal.confirm 을 호출하지 않는다', async () => {
      const interceptMock = jest.fn(async () => true);

      const { result } = renderHook(() => useAppBack({ onIntercept: interceptMock }));

      await act(async () => {
        await result.current.back();
      });

      expect(interceptMock).toHaveBeenCalledTimes(1);
      expect(routerBackMock).not.toHaveBeenCalled();
      expect(routerReplaceMock).not.toHaveBeenCalled();
      expect(confirmMock).not.toHaveBeenCalled();
      expect(exitAppMock).not.toHaveBeenCalled();
    });

    it('onIntercept 가 false 를 반환하면 기본 back 로직으로 진행한다', async () => {
      const interceptMock = jest.fn(async () => false);

      const { result } = renderHook(() => useAppBack({ onIntercept: interceptMock }));

      await act(async () => {
        await result.current.back();
      });

      expect(interceptMock).toHaveBeenCalledTimes(1);
      expect(routerBackMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('2~4) 홈 페이지에서 종료 다이얼로그', () => {
    beforeEach(() => {
      usePathnameMock.mockReturnValue('/parent'); // ROLE_HOME_PATHS 포함
    });

    it('2) 홈 페이지에서 사용자가 "종료하기" 선택 → exitApp 호출 + danger variant ConfirmDialog 인자', async () => {
      confirmMock.mockResolvedValueOnce(true);

      const { result } = renderHook(() => useAppBack());

      await act(async () => {
        await result.current.back();
      });

      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: MESSAGES.common.exitConfirmTitle,
          message: MESSAGES.common.exitConfirmMessage,
          confirmText: MESSAGES.common.exitConfirmButton,
          cancelText: MESSAGES.common.cancel,
          variant: 'danger',
        }),
      );
      expect(exitAppMock).toHaveBeenCalledTimes(1);
      expect(routerBackMock).not.toHaveBeenCalled();
      expect(routerReplaceMock).not.toHaveBeenCalled();
    });

    it('3) 홈 페이지에서 사용자가 "취소" 선택 → exitApp 미호출, 화면 유지', async () => {
      confirmMock.mockResolvedValueOnce(false);

      const { result } = renderHook(() => useAppBack());

      await act(async () => {
        await result.current.back();
      });

      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(exitAppMock).not.toHaveBeenCalled();
      expect(routerBackMock).not.toHaveBeenCalled();
      expect(routerReplaceMock).not.toHaveBeenCalled();
    });

    it('4) 백키 연타 시 modal.confirm 은 1회만 호출 (중복 차단)', async () => {
      // 1번째 호출은 사용자가 응답하기 전 pending 상태
      let resolveFirst: (value: boolean) => void = () => {};
      confirmMock.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => { resolveFirst = resolve; }),
      );
      // 2번째 호출이 발생하면 즉시 resolve (테스트 fail 케이스)
      confirmMock.mockResolvedValueOnce(false);

      const { result } = renderHook(() => useAppBack());

      // 첫 백키 — pending
      const firstBack = act(async () => {
        await result.current.back();
      });

      // 즉시 두 번째 백키 (연타) — pending 상태에서 중복 호출
      await act(async () => {
        await result.current.back();
      });

      // confirm 은 첫 번째만 호출되어야 함
      expect(confirmMock).toHaveBeenCalledTimes(1);

      // 첫 번째 다이얼로그 응답 완료 → cleanup
      resolveFirst(false);
      await firstBack;
    });
  });

  describe('5) 일반 페이지 + history > 1 → router.back', () => {
    it('history.length 가 5 이면 router.back 호출, modal.confirm 미호출', async () => {
      usePathnameMock.mockReturnValue('/parent/credits');
      setHistoryLength(5);

      const { result } = renderHook(() => useAppBack());

      await act(async () => {
        await result.current.back();
      });

      expect(routerBackMock).toHaveBeenCalledTimes(1);
      expect(routerReplaceMock).not.toHaveBeenCalled();
      expect(confirmMock).not.toHaveBeenCalled();
      expect(exitAppMock).not.toHaveBeenCalled();
    });
  });

  describe('6) 일반 페이지 + history <= 1 → 역할 홈으로 router.replace', () => {
    it('history.length 가 1 이고 user.userType=parent 이면 /parent 로 replace', async () => {
      usePathnameMock.mockReturnValue('/parent/credits');
      setHistoryLength(1);

      const { result } = renderHook(() => useAppBack());

      await act(async () => {
        await result.current.back();
      });

      expect(routerReplaceMock).toHaveBeenCalledTimes(1);
      // getDashboardPathByUserType('parent') 의 실제 반환은 '/parent'
      expect(routerReplaceMock).toHaveBeenCalledWith('/parent/');
      expect(routerBackMock).not.toHaveBeenCalled();
    });

    it('user 미인증 시 fallback 경로 (/login) 로 replace', async () => {
      usePathnameMock.mockReturnValue('/some-page');
      setHistoryLength(1);
      useAuthMock.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        login: jest.fn(),
        logout: jest.fn(),
        clearSession: jest.fn(() => Promise.resolve()),
        signup: jest.fn(),
        refreshUser: jest.fn(),
      });

      const { result } = renderHook(() => useAppBack());

      await act(async () => {
        await result.current.back();
      });

      expect(routerReplaceMock).toHaveBeenCalledTimes(1);
      expect(routerReplaceMock).toHaveBeenCalledWith('/login/');
    });
  });

  describe('6-native) history -1 + 2단 백 폴백 — native 비홈 → back, 소진 시 메인, 메인 → 종료 (2026-07-17 v2)', () => {
    beforeEach(() => {
      isNativeAppMock.mockReturnValue(true);
    });

    it('native 비홈 + history 있음 → router.back (history -1), 메인 점프/팝업/exitApp 미호출', async () => {
      usePathnameMock.mockReturnValue('/some-deep-link-page');
      setHistoryLength(5);

      const { result } = renderHook(() => useAppBack());

      await act(async () => {
        await result.current.back();
      });

      expect(routerBackMock).toHaveBeenCalledTimes(1);
      expect(routerReplaceMock).not.toHaveBeenCalled();
      expect(confirmMock).not.toHaveBeenCalled();
      expect(exitAppMock).not.toHaveBeenCalled();
    });

    it('native 비홈 + history 소진 → 역할 메인 replace (2단 백 폴백)', async () => {
      usePathnameMock.mockReturnValue('/some-deep-link-page');
      setHistoryLength(1);
      const clearSessionMock = jest.fn(() => Promise.resolve());
      useAuthMock.mockReturnValue({
        user: { userType: 'parent', userId: 1, userName: 'Test', userEmail: 'test@x.com' },
        isAuthenticated: true,
        isLoading: false,
        login: jest.fn(),
        logout: jest.fn(),
        clearSession: clearSessionMock,
        signup: jest.fn(),
        refreshUser: jest.fn(),
      });

      const { result } = renderHook(() => useAppBack());

      await act(async () => {
        await result.current.back();
      });

      expect(routerReplaceMock).toHaveBeenCalledTimes(1);
      expect(routerReplaceMock).toHaveBeenCalledWith('/parent/');
      expect(confirmMock).not.toHaveBeenCalled();
      expect(exitAppMock).not.toHaveBeenCalled();
      expect(clearSessionMock).not.toHaveBeenCalled();
      expect(routerBackMock).not.toHaveBeenCalled();
    });

    it('native 메인(홈) → 종료 확인 팝업, "취소" → 화면 유지', async () => {
      usePathnameMock.mockReturnValue('/parent'); // ROLE_HOME_PATHS
      confirmMock.mockResolvedValueOnce(false);
      const clearSessionMock = jest.fn(() => Promise.resolve());
      useAuthMock.mockReturnValue({
        user: { userType: 'parent', userId: 1, userName: 'Test', userEmail: 'test@x.com' },
        isAuthenticated: true,
        isLoading: false,
        login: jest.fn(),
        logout: jest.fn(),
        clearSession: clearSessionMock,
        signup: jest.fn(),
        refreshUser: jest.fn(),
      });

      const { result } = renderHook(() => useAppBack());

      await act(async () => {
        await result.current.back();
      });

      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(clearSessionMock).not.toHaveBeenCalled();
      expect(exitAppMock).not.toHaveBeenCalled();
      expect(routerReplaceMock).not.toHaveBeenCalled();
    });

    it('native 메인(홈) → "종료하기" → clearSession 완료 후 exitApp', async () => {
      usePathnameMock.mockReturnValue('/parent');
      confirmMock.mockResolvedValueOnce(true);
      const clearSessionMock = jest.fn(() => Promise.resolve());
      useAuthMock.mockReturnValue({
        user: { userType: 'parent', userId: 1, userName: 'Test', userEmail: 'test@x.com' },
        isAuthenticated: true,
        isLoading: false,
        login: jest.fn(),
        logout: jest.fn(),
        clearSession: clearSessionMock,
        signup: jest.fn(),
        refreshUser: jest.fn(),
      });

      const { result } = renderHook(() => useAppBack());

      await act(async () => {
        await result.current.back();
      });

      expect(clearSessionMock).toHaveBeenCalledTimes(1);
      expect(exitAppMock).toHaveBeenCalledTimes(1);
      // clearSession(세션 클리어)이 exitApp(종료)보다 먼저 실행되어야 한다
      expect(clearSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
        exitAppMock.mock.invocationCallOrder[0],
      );
      expect(routerBackMock).not.toHaveBeenCalled();
    });
  });

  describe('8) 소프트 백 위치 소진 이벤트 위임 (APP_BACK_EXHAUSTED_EVENT) — 2단 백 폴백 적용', () => {
    it('native 비홈 + history 소진 상태에서 이벤트 수신 → 메인 replace (팝업 없음)', async () => {
      isNativeAppMock.mockReturnValue(true);
      usePathnameMock.mockReturnValue('/some-deep-link-page');
      // 이벤트는 소프트 백이 "히스토리 소진"을 감지했을 때 발행된다 — 동일 상태 재현
      setHistoryLength(1);

      renderHook(() => useAppBack());

      await act(async () => {
        window.dispatchEvent(new CustomEvent(APP_BACK_EXHAUSTED_EVENT));
        await Promise.resolve();
      });

      expect(routerReplaceMock).toHaveBeenCalledWith('/parent/');
      expect(confirmMock).not.toHaveBeenCalled();
      expect(exitAppMock).not.toHaveBeenCalled();
    });

    it('native 메인 에서 이벤트 수신 → 종료 확인 팝업, 취소 시 유지', async () => {
      isNativeAppMock.mockReturnValue(true);
      usePathnameMock.mockReturnValue('/parent');
      confirmMock.mockResolvedValueOnce(false);

      renderHook(() => useAppBack());

      await act(async () => {
        window.dispatchEvent(new CustomEvent(APP_BACK_EXHAUSTED_EVENT));
        await Promise.resolve();
      });

      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect(exitAppMock).not.toHaveBeenCalled();
      expect(routerBackMock).not.toHaveBeenCalled();
      expect(routerReplaceMock).not.toHaveBeenCalled();
    });
  });

  describe('7) 다양한 역할별 홈 경로', () => {
    const roleHomeCases: Array<[string, string]> = [
      ['admin', '/admin/'],
      ['director', '/director/'],
      ['coach', '/coach/'],
      ['parent', '/parent/'],
      ['child', '/child/'],
      ['teen', '/teen/'],
    ];

    it.each(roleHomeCases)(
      'history.length<=1 + userType=%s → router.replace(%s)',
      async (userType, expectedPath) => {
        usePathnameMock.mockReturnValue('/some-deep-link-page');
        setHistoryLength(1);
        useAuthMock.mockReturnValue({
          user: { userType, userId: 1, userName: 'Test', userEmail: 'test@x.com' },
          isAuthenticated: true,
          isLoading: false,
          login: jest.fn(),
          logout: jest.fn(),
          signup: jest.fn(),
          refreshUser: jest.fn(),
        });

        const { result } = renderHook(() => useAppBack());

        await act(async () => {
          await result.current.back();
        });

        expect(routerReplaceMock).toHaveBeenCalledWith(expectedPath);
      },
    );
  });
});
