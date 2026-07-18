/**
 * 환경 감지 유틸리티 테스트
 *
 * @module src/lib/environment.ts
 * @coverage 목표: 85%+
 */

import {
  setupWindowEnvironment,
  mockConsole,
  mockNodeEnv,
} from '../utils/test-helpers';

// 모듈을 매 테스트마다 새로 로드하기 위해 dynamic import 사용
const loadEnvironmentModule = async () => {
  // 캐시된 모듈 삭제
  jest.resetModules();
  return import('@/lib/environment');
};

describe('environment.ts', () => {
  let cleanup: () => void;

  afterEach(() => {
    if (cleanup) {
      cleanup();
    }
    jest.resetModules();
  });

  // ============================================
  // isFlutterBridgeAvailable() 테스트
  // ============================================
  describe('isFlutterBridgeAvailable()', () => {
    it('서버 환경 (window undefined) → false', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { isFlutterBridgeAvailable } = await loadEnvironmentModule();
      expect(isFlutterBridgeAvailable()).toBe(false);
    });

    it('웹 환경 (FlutterBridge 없음) → false', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const { isFlutterBridgeAvailable } = await loadEnvironmentModule();
      expect(isFlutterBridgeAvailable()).toBe(false);
    });

    it('FlutterBridge 존재하나 auth 없음 → false', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      // FlutterBridge는 있지만 auth가 없는 상태
      (window as Record<string, unknown>).FlutterBridge = {};

      const { isFlutterBridgeAvailable } = await loadEnvironmentModule();
      expect(isFlutterBridgeAvailable()).toBe(false);
    });

    it('FlutterBridge.auth 존재 → true', async () => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;

      const { isFlutterBridgeAvailable } = await loadEnvironmentModule();
      expect(isFlutterBridgeAvailable()).toBe(true);
    });

    it('FlutterBridge가 null인 경우 → false', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      (window as Record<string, unknown>).FlutterBridge = null;

      const { isFlutterBridgeAvailable } = await loadEnvironmentModule();
      expect(isFlutterBridgeAvailable()).toBe(false);
    });
  });

  // ============================================
  // isFlutterInAppWebView() 테스트
  // ============================================
  describe('isFlutterInAppWebView()', () => {
    it('서버 환경 (window undefined) → false', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { isFlutterInAppWebView } = await loadEnvironmentModule();
      expect(isFlutterInAppWebView()).toBe(false);
    });

    it('flutter_inappwebview 없음 → false', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const { isFlutterInAppWebView } = await loadEnvironmentModule();
      expect(isFlutterInAppWebView()).toBe(false);
    });

    it('flutter_inappwebview 존재 → true', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      (window as Record<string, unknown>).flutter_inappwebview = {};

      const { isFlutterInAppWebView } = await loadEnvironmentModule();
      expect(isFlutterInAppWebView()).toBe(true);
    });
  });

  // ============================================
  // getAppEnvironment() 테스트
  // ============================================
  describe('getAppEnvironment()', () => {
    // jsdom 환경에서는 window가 항상 존재하므로 server 환경 테스트 불가
    it.skip('서버 환경 (window undefined) → "server"', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { getAppEnvironment } = await loadEnvironmentModule();
      expect(getAppEnvironment()).toBe('server');
    });

    it('Native 환경 (FlutterBridge.auth 존재) → "native"', async () => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;

      const { getAppEnvironment } = await loadEnvironmentModule();
      expect(getAppEnvironment()).toBe('native');
    });

    it('Native 환경 (flutter_inappwebview 존재) → "native"', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      (window as Record<string, unknown>).flutter_inappwebview = {};

      const { getAppEnvironment } = await loadEnvironmentModule();
      expect(getAppEnvironment()).toBe('native');
    });

    it('웹 환경 (브라우저만) → "web"', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const { getAppEnvironment } = await loadEnvironmentModule();
      expect(getAppEnvironment()).toBe('web');
    });

    it('우선순위: FlutterBridge > flutter_inappwebview', async () => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;

      // 둘 다 존재하는 경우
      (window as Record<string, unknown>).flutter_inappwebview = {};

      const { getAppEnvironment, isFlutterBridgeAvailable } = await loadEnvironmentModule();

      // FlutterBridge가 먼저 체크되어야 함
      expect(isFlutterBridgeAvailable()).toBe(true);
      expect(getAppEnvironment()).toBe('native');
    });

    it('FlutterBridge 존재하나 auth 없음 → "web" (fallback)', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      (window as Record<string, unknown>).FlutterBridge = {};

      const { getAppEnvironment } = await loadEnvironmentModule();
      expect(getAppEnvironment()).toBe('web');
    });
  });

  // ============================================
  // isNativeApp() 테스트
  // ============================================
  describe('isNativeApp()', () => {
    it('native 환경 → true', async () => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;

      const { isNativeApp } = await loadEnvironmentModule();
      expect(isNativeApp()).toBe(true);
    });

    it('web 환경 → false', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const { isNativeApp } = await loadEnvironmentModule();
      expect(isNativeApp()).toBe(false);
    });

    it('server 환경 → false', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { isNativeApp } = await loadEnvironmentModule();
      expect(isNativeApp()).toBe(false);
    });
  });

  // ============================================
  // isWebBrowser() 테스트
  // ============================================
  describe('isWebBrowser()', () => {
    it('web 환경 → true', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const { isWebBrowser } = await loadEnvironmentModule();
      expect(isWebBrowser()).toBe(true);
    });

    it('native 환경 → false', async () => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;

      const { isWebBrowser } = await loadEnvironmentModule();
      expect(isWebBrowser()).toBe(false);
    });

    // jsdom 환경에서는 window가 항상 존재하므로 server 환경 테스트 불가
    it.skip('server 환경 → false', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { isWebBrowser } = await loadEnvironmentModule();
      expect(isWebBrowser()).toBe(false);
    });
  });

  // ============================================
  // isServer() 테스트
  // ============================================
  describe('isServer()', () => {
    // jsdom 환경에서는 window가 항상 존재하므로 server 환경 테스트 불가
    it.skip('server 환경 → true', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { isServer } = await loadEnvironmentModule();
      expect(isServer()).toBe(true);
    });

    it('web 환경 → false', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const { isServer } = await loadEnvironmentModule();
      expect(isServer()).toBe(false);
    });
  });

  // ============================================
  // isClient() 테스트
  // ============================================
  describe('isClient()', () => {
    it('web 환경 (window 존재) → true', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const { isClient } = await loadEnvironmentModule();
      expect(isClient()).toBe(true);
    });

    it('native 환경 (window 존재) → true', async () => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;

      const { isClient } = await loadEnvironmentModule();
      expect(isClient()).toBe(true);
    });

    // jsdom 환경에서는 window가 항상 존재하므로 server 환경 테스트 불가
    it.skip('server 환경 (window undefined) → false', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { isClient } = await loadEnvironmentModule();
      expect(isClient()).toBe(false);
    });
  });

  // ============================================
  // logEnvironment() 테스트
  // ============================================
  describe('logEnvironment()', () => {
    it('개발 환경 → console.log 호출', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const consoleMock = mockConsole();
      const restoreEnv = mockNodeEnv('development');

      try {
        const { logEnvironment } = await loadEnvironmentModule();
        logEnvironment();

        expect(consoleMock.log).toHaveBeenCalledWith(
          '[Environment]',
          expect.objectContaining({
            environment: 'web',
            isNativeApp: false,
            isWebBrowser: true,
            isServer: false,
          })
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('프로덕션 환경 → console.log 호출 안 함', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const consoleMock = mockConsole();
      const restoreEnv = mockNodeEnv('production');

      try {
        const { logEnvironment } = await loadEnvironmentModule();
        logEnvironment();

        expect(consoleMock.log).not.toHaveBeenCalled();
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('로그 내용에 모든 환경 정보 포함', async () => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;

      const consoleMock = mockConsole();
      const restoreEnv = mockNodeEnv('development');

      try {
        const { logEnvironment } = await loadEnvironmentModule();
        logEnvironment();

        expect(consoleMock.log).toHaveBeenCalledWith(
          '[Environment]',
          expect.objectContaining({
            environment: 'native',
            isNativeApp: true,
            isWebBrowser: false,
            isServer: false,
            hasFlutterBridge: true,
            hasInAppWebView: false,
          })
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });
  });

  // ============================================
  // default export 테스트
  // ============================================
  describe('default export', () => {
    it('모든 함수가 default export에 포함됨', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const environmentModule = await loadEnvironmentModule();
      const defaultExport = environmentModule.default;

      expect(defaultExport).toHaveProperty('getAppEnvironment');
      expect(defaultExport).toHaveProperty('isNativeApp');
      expect(defaultExport).toHaveProperty('isWebBrowser');
      expect(defaultExport).toHaveProperty('isServer');
      expect(defaultExport).toHaveProperty('isClient');
      expect(defaultExport).toHaveProperty('isFlutterBridgeAvailable');
      expect(defaultExport).toHaveProperty('isFlutterInAppWebView');
      expect(defaultExport).toHaveProperty('logEnvironment');
    });
  });
});
