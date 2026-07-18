/**
 * 하이브리드 인증 서비스 테스트
 *
 * @module src/services/hybrid-auth.ts
 * @coverage 목표: 80%+
 */

import {
  setupWindowEnvironment,
  createMockJWT,
  createTestTokenData,
  mockConsole,
  mockNodeEnv,
  TOKEN_KEYS,
  type MockLocalStorage,
  type MockFlutterBridge,
} from '../utils/test-helpers';

// 모듈을 매 테스트마다 새로 로드
const loadHybridAuthModule = async () => {
  jest.resetModules();
  return import('@/services/hybrid-auth');
};

describe('hybrid-auth.ts', () => {
  let cleanup: () => void;
  let localStorage: MockLocalStorage;
  let flutterBridge: MockFlutterBridge | undefined;

  afterEach(() => {
    if (cleanup) {
      cleanup();
    }
    jest.resetModules();
  });

  // ============================================
  // getEnvironment() 테스트
  // ============================================
  describe('hybridAuth.getEnvironment()', () => {
    it('Native 환경 → "native"', async () => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;
      flutterBridge = setup.flutterBridge;

      const { hybridAuth } = await loadHybridAuthModule();
      expect(hybridAuth.getEnvironment()).toBe('native');
    });

    it('Web 환경 → "web"', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;

      const { hybridAuth } = await loadHybridAuthModule();
      expect(hybridAuth.getEnvironment()).toBe('web');
    });

    // Note: jsdom 환경에서는 window가 항상 존재하므로 server 환경을 직접 테스트할 수 없음
    // server 환경은 실제 Node.js 환경에서만 테스트 가능
    it.skip('Server 환경 → "server" (jsdom에서 테스트 불가)', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { hybridAuth } = await loadHybridAuthModule();
      expect(hybridAuth.getEnvironment()).toBe('server');
    });
  });

  // ============================================
  // isNativeAuthAvailable() 테스트
  // ============================================
  describe('hybridAuth.isNativeAuthAvailable()', () => {
    it('Native 환경 (Bridge 있음) → true', async () => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;
      flutterBridge = setup.flutterBridge;

      const { hybridAuth } = await loadHybridAuthModule();
      expect(hybridAuth.isNativeAuthAvailable()).toBe(true);
    });

    it('Web 환경 → false', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const { hybridAuth } = await loadHybridAuthModule();
      expect(hybridAuth.isNativeAuthAvailable()).toBe(false);
    });

    // Note: jsdom 환경에서는 server 환경 시뮬레이션 불가
    it.skip('Server 환경 → false - jsdom에서 테스트 불가', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { hybridAuth } = await loadHybridAuthModule();
      expect(hybridAuth.isNativeAuthAvailable()).toBe(false);
    });
  });

  // ============================================
  // getToken() 테스트 - Native 환경
  // ============================================
  describe('hybridAuth.getToken() - Native 환경', () => {
    beforeEach(() => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;
      flutterBridge = setup.flutterBridge;
    });

    it('Native Bridge에서 토큰 조회', async () => {
      const tokenData = createTestTokenData();
      flutterBridge!.__setReturnValue('getToken', tokenData);

      const { hybridAuth } = await loadHybridAuthModule();
      const result = await hybridAuth.getToken();

      expect(result).toEqual(tokenData);
      expect(flutterBridge!.auth.getToken).toHaveBeenCalled();
    });

    it('Native Bridge 오류 → null', async () => {
      flutterBridge!.__setError('getToken', new Error('Bridge error'));

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const { hybridAuth } = await loadHybridAuthModule();
        const result = await hybridAuth.getToken();

        expect(result).toBeNull();
        // handleBridgeError는 console.group/log으로 로깅 (console.error가 아님)
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('개발 환경에서 로그 출력', async () => {
      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      const tokenData = createTestTokenData();
      flutterBridge!.__setReturnValue('getToken', tokenData);

      try {
        const { hybridAuth } = await loadHybridAuthModule();
        await hybridAuth.getToken();

        // 실제 로그 형식: console.log(`[HybridAuth] getToken (${env}):`, '토큰 있음' | '토큰 없음')
        expect(consoleMock.log).toHaveBeenCalledWith(
          '[HybridAuth] getToken (native):',
          '토큰 있음'
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });
  });

  // ============================================
  // getToken() 테스트 - Web 환경
  // ============================================
  describe('hybridAuth.getToken() - Web 환경', () => {
    beforeEach(() => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;
    });

    it('localStorage에서 토큰 조회', async () => {
      const accessToken = createMockJWT();
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = accessToken;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh-token';

      const { hybridAuth } = await loadHybridAuthModule();
      const result = await hybridAuth.getToken();

      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe(accessToken);
      expect(localStorage.getItem).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN);
    });

    it('토큰 없음 → null', async () => {
      const { hybridAuth } = await loadHybridAuthModule();
      const result = await hybridAuth.getToken();

      expect(result).toBeNull();
    });

    it('localStorage 오류 → null', async () => {
      localStorage.__setError('getItem', new Error('Storage error'));

      const consoleMock = mockConsole();
      try {
        const { hybridAuth } = await loadHybridAuthModule();
        const result = await hybridAuth.getToken();

        expect(result).toBeNull();
      } finally {
        consoleMock.restore();
      }
    });
  });

  // ============================================
  // getToken() 테스트 - Server 환경
  // ============================================
  describe('hybridAuth.getToken() - Server 환경', () => {
    // Note: jsdom 환경에서는 server 환경 시뮬레이션 불가
    it.skip('항상 null 반환 - jsdom에서 테스트 불가', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { hybridAuth } = await loadHybridAuthModule();
      const result = await hybridAuth.getToken();

      expect(result).toBeNull();
    });
  });

  // ============================================
  // getToken() 테스트 - Native 환경이지만 Bridge 없음
  // ============================================
  describe('hybridAuth.getToken() - Native fallback', () => {
    it('Native 환경이지만 Bridge 없으면 웹 저장소 사용', async () => {
      // web 환경 설정 후 flutter_inappwebview만 추가 (Bridge 없이 Native 감지됨)
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;

      // flutter_inappwebview 추가하여 native로 감지되게 함
      (window as Record<string, unknown>).flutter_inappwebview = {};

      const accessToken = createMockJWT();
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = accessToken;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh-token';

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const { hybridAuth } = await loadHybridAuthModule();
        const result = await hybridAuth.getToken();

        // Bridge가 없으므로 웹 저장소 사용
        expect(result).not.toBeNull();
        expect(result?.accessToken).toBe(accessToken);
        expect(consoleMock.warn).toHaveBeenCalledWith(
          expect.stringContaining('Native 환경이지만 Bridge 없음')
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });
  });

  // ============================================
  // saveToken() 테스트 - Native 환경
  // ============================================
  describe('hybridAuth.saveToken() - Native 환경', () => {
    beforeEach(() => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;
      flutterBridge = setup.flutterBridge;
    });

    it('Native Bridge에 토큰 저장', async () => {
      const tokenData = createTestTokenData();

      const { hybridAuth } = await loadHybridAuthModule();
      await hybridAuth.saveToken(tokenData);

      expect(flutterBridge!.auth.saveToken).toHaveBeenCalledWith(tokenData);
    });

    it('Native Bridge 오류 → throw', async () => {
      flutterBridge!.__setError('saveToken', new Error('Bridge save error'));

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const { hybridAuth } = await loadHybridAuthModule();

        // handleBridgeError가 AUTH_STORAGE_ERROR 코드를 매핑하여
        // bridgeError.userMessage = '인증 정보 저장에 실패했습니다.' 로 throw
        await expect(hybridAuth.saveToken(createTestTokenData())).rejects.toThrow(
          '인증 정보 저장에 실패했습니다.'
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('개발 환경에서 로그 출력', async () => {
      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();

      try {
        const { hybridAuth } = await loadHybridAuthModule();
        await hybridAuth.saveToken(createTestTokenData());

        // 실제 로그 형식: console.log(`[HybridAuth] saveToken (${env}): 저장 완료`)
        expect(consoleMock.log).toHaveBeenCalledWith(
          '[HybridAuth] saveToken (native): 저장 완료'
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });
  });

  // ============================================
  // saveToken() 테스트 - Web 환경
  // ============================================
  describe('hybridAuth.saveToken() - Web 환경', () => {
    beforeEach(() => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;
    });

    it('localStorage에 토큰 저장', async () => {
      const tokenData = createTestTokenData();

      const { hybridAuth } = await loadHybridAuthModule();
      await hybridAuth.saveToken(tokenData);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        TOKEN_KEYS.ACCESS_TOKEN,
        tokenData.accessToken
      );
      expect(localStorage.setItem).toHaveBeenCalledWith(
        TOKEN_KEYS.REFRESH_TOKEN,
        tokenData.refreshToken
      );
    });

    // Note: localStorage 에러 테스트는 복잡한 상황입니다.
    // isLocalStorageAvailable() 체크가 먼저 setItem을 호출하므로,
    // setItem 에러를 설정하면 체크에서 먼저 실패하여 warning만 출력됩니다.
    // 실제 에러 throw 테스트는 체크를 통과한 후 저장 시점에서만 발생해야 합니다.
    it('localStorage 불가 시 → warning 출력 후 return (에러 throw 없음)', async () => {
      localStorage.__setError('setItem', new Error('Storage error'));

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const { hybridAuth } = await loadHybridAuthModule();

        // isStorageAvailable() 체크에서 false 반환 → sessionStorage 또는 메모리 저장소로 폴백
        await expect(hybridAuth.saveToken(createTestTokenData())).resolves.not.toThrow();
        // 저장소 폴백 경고가 출력됨
        expect(consoleMock.warn).toHaveBeenCalled();
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });
  });

  // ============================================
  // saveToken() 테스트 - Server 환경
  // ============================================
  describe('hybridAuth.saveToken() - Server 환경', () => {
    // Note: jsdom 환경에서는 server 환경 시뮬레이션 불가
    it.skip('무시 (void) - jsdom에서 테스트 불가', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { hybridAuth } = await loadHybridAuthModule();

      // 에러 없이 완료
      await expect(hybridAuth.saveToken(createTestTokenData())).resolves.not.toThrow();
    });
  });

  // ============================================
  // clearToken() 테스트 - Native 환경
  // ============================================
  describe('hybridAuth.clearToken() - Native 환경', () => {
    beforeEach(() => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;
      flutterBridge = setup.flutterBridge;
    });

    it('Native Bridge에서 토큰 삭제', async () => {
      const { hybridAuth } = await loadHybridAuthModule();
      await hybridAuth.clearToken();

      expect(flutterBridge!.auth.clearToken).toHaveBeenCalled();
    });

    it('Native Bridge 오류 → throw 안 함 (handleBridgeError로 처리)', async () => {
      flutterBridge!.__setError('clearToken', new Error('Bridge clear error'));

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const { hybridAuth } = await loadHybridAuthModule();

        // 에러가 throw되지 않음
        await expect(hybridAuth.clearToken()).resolves.not.toThrow();
        // handleBridgeError는 console.group/log으로 로깅 (console.error가 아님)
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('개발 환경에서 로그 출력', async () => {
      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();

      try {
        const { hybridAuth } = await loadHybridAuthModule();
        await hybridAuth.clearToken();

        // 실제 로그 형식: console.log(`[HybridAuth] clearToken (${env}): 삭제 완료`)
        expect(consoleMock.log).toHaveBeenCalledWith(
          '[HybridAuth] clearToken (native): 삭제 완료'
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });
  });

  // ============================================
  // clearToken() 테스트 - Web 환경
  // ============================================
  describe('hybridAuth.clearToken() - Web 환경', () => {
    beforeEach(() => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;
    });

    it('localStorage에서 토큰 삭제', async () => {
      const { hybridAuth } = await loadHybridAuthModule();
      await hybridAuth.clearToken();

      expect(localStorage.removeItem).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN);
      expect(localStorage.removeItem).toHaveBeenCalledWith(TOKEN_KEYS.REFRESH_TOKEN);
      expect(localStorage.removeItem).toHaveBeenCalledWith(TOKEN_KEYS.TOKEN_EXPIRY);
    });
  });

  // ============================================
  // clearToken() 테스트 - Server 환경
  // ============================================
  describe('hybridAuth.clearToken() - Server 환경', () => {
    // Note: jsdom 환경에서는 server 환경 시뮬레이션 불가
    it.skip('무시 - jsdom에서 테스트 불가', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { hybridAuth } = await loadHybridAuthModule();
      await expect(hybridAuth.clearToken()).resolves.not.toThrow();
    });
  });

  // ============================================
  // isAuthenticated() 테스트 - Native 환경
  // ============================================
  describe('hybridAuth.isAuthenticated() - Native 환경', () => {
    beforeEach(() => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;
      flutterBridge = setup.flutterBridge;
    });

    it('인증됨 → true', async () => {
      flutterBridge!.__setReturnValue('isAuthenticated', true);

      const { hybridAuth } = await loadHybridAuthModule();
      const result = await hybridAuth.isAuthenticated();

      expect(result).toBe(true);
      expect(flutterBridge!.auth.isAuthenticated).toHaveBeenCalled();
    });

    it('인증 안 됨 → false', async () => {
      flutterBridge!.__setReturnValue('isAuthenticated', false);

      const { hybridAuth } = await loadHybridAuthModule();
      const result = await hybridAuth.isAuthenticated();

      expect(result).toBe(false);
    });

    it('Native Bridge 오류 → false', async () => {
      flutterBridge!.__setError('isAuthenticated', new Error('Bridge error'));

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const { hybridAuth } = await loadHybridAuthModule();
        const result = await hybridAuth.isAuthenticated();

        expect(result).toBe(false);
        // handleBridgeError는 console.group/log으로 로깅 (console.error가 아님)
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });
  });

  // ============================================
  // isAuthenticated() 테스트 - Web 환경
  // ============================================
  describe('hybridAuth.isAuthenticated() - Web 환경', () => {
    beforeEach(() => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;
    });

    it('유효한 토큰 존재 → true', async () => {
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = createMockJWT({ expiresInMs: 3600000 });

      const { hybridAuth } = await loadHybridAuthModule();
      const result = await hybridAuth.isAuthenticated();

      expect(result).toBe(true);
    });

    it('토큰 없음 → false', async () => {
      const { hybridAuth } = await loadHybridAuthModule();
      const result = await hybridAuth.isAuthenticated();

      expect(result).toBe(false);
    });

    it('만료된 토큰 → false', async () => {
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = createMockJWT({ expiresInMs: -60000 });

      const consoleMock = mockConsole();
      try {
        const { hybridAuth } = await loadHybridAuthModule();
        const result = await hybridAuth.isAuthenticated();

        expect(result).toBe(false);
      } finally {
        consoleMock.restore();
      }
    });
  });

  // ============================================
  // isAuthenticated() 테스트 - Server 환경
  // ============================================
  describe('hybridAuth.isAuthenticated() - Server 환경', () => {
    // Note: jsdom 환경에서는 server 환경 시뮬레이션 불가
    it.skip('항상 false - jsdom에서 테스트 불가', async () => {
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { hybridAuth } = await loadHybridAuthModule();
      const result = await hybridAuth.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  // ============================================
  // debugAuthState() 테스트
  // ============================================
  describe('debugAuthState()', () => {
    it('개발 환경 → 인증 상태 출력', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();

      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = createMockJWT();

      try {
        const { debugAuthState } = await loadHybridAuthModule();
        await debugAuthState();

        expect(consoleMock.log).toHaveBeenCalledWith(
          '[HybridAuth Debug]',
          expect.objectContaining({
            environment: 'web',
            isNativeAuthAvailable: false,
            hasToken: true,
            isAuthenticated: true,
          })
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('프로덕션 환경 → 아무것도 출력 안 함', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const restoreEnv = mockNodeEnv('production');
      const consoleMock = mockConsole();

      try {
        const { debugAuthState } = await loadHybridAuthModule();
        await debugAuthState();

        expect(consoleMock.log).not.toHaveBeenCalled();
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('Native 환경에서 상태 출력', async () => {
      const setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;
      flutterBridge = setup.flutterBridge;

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();

      const tokenData = createTestTokenData();
      flutterBridge!.__setReturnValue('getToken', tokenData);
      flutterBridge!.__setReturnValue('isAuthenticated', true);

      try {
        const { debugAuthState } = await loadHybridAuthModule();
        await debugAuthState();

        expect(consoleMock.log).toHaveBeenCalledWith(
          '[HybridAuth Debug]',
          expect.objectContaining({
            environment: 'native',
            isNativeAuthAvailable: true,
            hasToken: true,
            isAuthenticated: true,
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
    it('hybridAuth가 default export', async () => {
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;

      const hybridAuthModule = await loadHybridAuthModule();
      expect(hybridAuthModule.default).toBe(hybridAuthModule.hybridAuth);
    });
  });

  // ============================================
  // 통합 테스트: 환경 전환 시나리오
  // ============================================
  describe('통합 테스트: 환경 전환', () => {
    it('Web → Native 환경 전환 시 올바른 저장소 사용', async () => {
      // Web 환경
      let setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;

      const webToken = createMockJWT({ sub: 'web-user' });
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = webToken;

      let hybridAuthModule = await loadHybridAuthModule();
      expect(hybridAuthModule.hybridAuth.getEnvironment()).toBe('web');

      let token = await hybridAuthModule.hybridAuth.getToken();
      expect(token?.accessToken).toBe(webToken);

      cleanup();

      // Native 환경
      setup = setupWindowEnvironment('native');
      cleanup = setup.cleanup;
      flutterBridge = setup.flutterBridge;

      const nativeToken = createTestTokenData();
      flutterBridge!.__setReturnValue('getToken', nativeToken);

      hybridAuthModule = await loadHybridAuthModule();
      expect(hybridAuthModule.hybridAuth.getEnvironment()).toBe('native');

      token = await hybridAuthModule.hybridAuth.getToken();
      expect(token).toEqual(nativeToken);

      // Note: Server 환경은 jsdom에서 테스트 불가 (window가 항상 존재)
    });

    it('Native 환경에서 Bridge 없을 때 Web 저장소로 fallback', async () => {
      // flutter_inappwebview만 있고 FlutterBridge.auth가 없는 상황
      const setup = setupWindowEnvironment('web');
      cleanup = setup.cleanup;
      localStorage = setup.localStorage;

      // flutter_inappwebview만 추가 (native로 감지되지만 Bridge 없음)
      (window as Record<string, unknown>).flutter_inappwebview = {};

      const webToken = createMockJWT({ sub: 'fallback-user' });
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = webToken;

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const hybridAuthModule = await loadHybridAuthModule();

        // native 환경으로 감지
        expect(hybridAuthModule.hybridAuth.getEnvironment()).toBe('native');

        // 하지만 Bridge가 없으므로 web 저장소 사용
        const token = await hybridAuthModule.hybridAuth.getToken();
        expect(token?.accessToken).toBe(webToken);

        // fallback warning 확인
        expect(consoleMock.warn).toHaveBeenCalledWith(
          '[HybridAuth] Native 환경이지만 Bridge 없음, 웹 저장소 사용'
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });
  });
});
