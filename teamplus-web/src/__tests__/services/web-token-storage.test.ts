/**
 * 웹 토큰 저장소 테스트
 *
 * @module src/services/web-token-storage.ts
 * @coverage 목표: 80%+
 */

import {
  createMockJWT,
  createExpiredJWT,
  createAlmostExpiredJWT,
  setupWindowEnvironment,
  TOKEN_KEYS,
  mockConsole,
  mockNodeEnv,
  type MockLocalStorage,
} from '../utils/test-helpers';

// 모듈을 매 테스트마다 새로 로드
const loadWebTokenStorageModule = async () => {
  jest.resetModules();
  return import('@/services/web-token-storage');
};

describe('web-token-storage.ts', () => {
  let cleanup: () => void;
  let localStorage: MockLocalStorage;

  beforeEach(() => {
    const setup = setupWindowEnvironment('web');
    cleanup = setup.cleanup;
    localStorage = setup.localStorage;
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
    }
    jest.resetModules();
  });

  // ============================================
  // isLocalStorageAvailable() 테스트 (내부 함수)
  // webTokenStorage.getToken()을 통해 간접 테스트
  // ============================================
  describe('isLocalStorageAvailable() (간접 테스트)', () => {
    it('localStorage 사용 가능 → 정상 동작', async () => {
      const { webTokenStorage } = await loadWebTokenStorageModule();
      const token = createMockJWT();
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = token;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh-token';

      const result = await webTokenStorage.getToken();
      expect(result).not.toBeNull();
    });

    // jsdom 환경에서는 window가 항상 존재하므로 server 환경 테스트 불가
    it.skip('localStorage 사용 불가 (서버 환경) → null', async () => {
      cleanup();
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { webTokenStorage } = await loadWebTokenStorageModule();
      const result = await webTokenStorage.getToken();
      expect(result).toBeNull();
    });

    it('localStorage 접근 시 예외 발생 → null + 경고', async () => {
      const consoleMock = mockConsole();

      // localStorage.getItem 시 에러 발생하도록 설정
      localStorage.__setError('getItem', new Error('Storage access denied'));

      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        const result = await webTokenStorage.getToken();

        expect(result).toBeNull();
        expect(consoleMock.error).toHaveBeenCalledWith(
          expect.stringContaining('[WebTokenStorage]'),
          expect.any(Error)
        );
      } finally {
        consoleMock.restore();
      }
    });

    it('localStorage setItem 실패 시 → 저장소 불가로 판단, 경고만 출력', async () => {
      // setItem 에러 발생 → isStorageAvailable()이 false 반환
      localStorage.__setError('setItem', new DOMException('Quota exceeded', 'QuotaExceededError'));

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();

        // isStorageAvailable()이 false 반환하므로 sessionStorage 또는 메모리 저장소로 폴백
        await expect(
          webTokenStorage.saveToken({
            accessToken: createMockJWT(),
            refreshToken: 'refresh',
          })
        ).resolves.not.toThrow();

        // 저장소 폴백 경고가 출력됨 (sessionStorage 또는 메모리 저장소 사용)
        expect(consoleMock.warn).toHaveBeenCalled();
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });
  });

  // ============================================
  // getTokenExpiry() 테스트 (내부 함수, 간접 테스트)
  // ============================================
  describe('getTokenExpiry() (간접 테스트)', () => {
    it('유효한 JWT → exp * 1000 반환', async () => {
      const futureExp = Math.floor((Date.now() + 3600000) / 1000); // 1시간 후
      const token = createMockJWT({ exp: futureExp });

      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = token;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh';

      const { webTokenStorage } = await loadWebTokenStorageModule();
      const result = await webTokenStorage.getToken();

      // 만료되지 않았으므로 토큰 반환
      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe(token);
    });

    it('잘못된 형식 (2 parts) → 만료 체크 건너뜀', async () => {
      const malformedToken = createMockJWT({ malformed: true });
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = malformedToken;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh';

      const { webTokenStorage } = await loadWebTokenStorageModule();
      const result = await webTokenStorage.getToken();

      // 만료 시간을 알 수 없으므로 토큰 반환 (만료되지 않은 것으로 처리)
      expect(result).not.toBeNull();
    });

    it('exp 필드 없음 → 만료되지 않은 것으로 처리', async () => {
      const noExpToken = createMockJWT({ noExp: true });
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = noExpToken;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh';

      const { webTokenStorage } = await loadWebTokenStorageModule();
      const result = await webTokenStorage.getToken();

      expect(result).not.toBeNull();
    });

    it('유효하지 않은 base64 → 만료 체크 건너뜀', async () => {
      // base64가 아닌 문자열
      const invalidToken = 'header.!!!invalid!!!.signature';
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = invalidToken;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh';

      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        const result = await webTokenStorage.getToken();

        // 파싱 실패해도 토큰 반환 (만료 체크 불가)
        expect(result).not.toBeNull();
      } finally {
        consoleMock.restore();
      }
    });
  });

  // ============================================
  // isTokenExpired() 테스트 (내부 함수, 간접 테스트)
  // ============================================
  describe('isTokenExpired() (간접 테스트)', () => {
    it('만료된 토큰 → clearToken + null (refreshToken 없을 때)', async () => {
      const expiredToken = createExpiredJWT();
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = expiredToken;
      // refreshToken 없음

      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        const result = await webTokenStorage.getToken();

        expect(result).toBeNull();
        // clearToken이 호출되어 localStorage가 비워졌는지 확인
        expect(localStorage.removeItem).toHaveBeenCalled();
      } finally {
        consoleMock.restore();
      }
    });

    it('만료된 토큰 + refreshToken 있음 → 토큰 반환 (refresh 시도용)', async () => {
      const expiredToken = createExpiredJWT();
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = expiredToken;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh-token';

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        const result = await webTokenStorage.getToken();

        // refreshToken이 있으므로 만료된 토큰도 반환 (refresh 시도 가능)
        expect(result).not.toBeNull();
        expect(result?.refreshToken).toBe('refresh-token');
        expect(consoleMock.log).toHaveBeenCalledWith(
          expect.stringContaining('Access token이 만료되었습니다')
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('5분 버퍼 내 만료 예정 → 만료 처리', async () => {
      // 4분 후 만료 (5분 버퍼 내)
      const almostExpiredToken = createAlmostExpiredJWT();
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = almostExpiredToken;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh-token';

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        const result = await webTokenStorage.getToken();

        // 버퍼 내이므로 만료 처리, refreshToken이 있으므로 토큰 반환
        expect(result).not.toBeNull();
        expect(consoleMock.log).toHaveBeenCalled();
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('유효한 토큰 → 정상 반환', async () => {
      const validToken = createMockJWT({ expiresInMs: 3600000 }); // 1시간 후 만료
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = validToken;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh-token';

      const { webTokenStorage } = await loadWebTokenStorageModule();
      const result = await webTokenStorage.getToken();

      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe(validToken);
      expect(result?.refreshToken).toBe('refresh-token');
    });
  });

  // ============================================
  // webTokenStorage.getToken() 테스트
  // ============================================
  describe('webTokenStorage.getToken()', () => {
    it('accessToken 없음 → null', async () => {
      // localStorage에 토큰 없음

      const { webTokenStorage } = await loadWebTokenStorageModule();
      const result = await webTokenStorage.getToken();

      expect(result).toBeNull();
    });

    it('accessToken만 있고 refreshToken 없음 → refreshToken 빈 문자열', async () => {
      const token = createMockJWT();
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = token;
      // refreshToken 없음

      const { webTokenStorage } = await loadWebTokenStorageModule();
      const result = await webTokenStorage.getToken();

      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe(token);
      expect(result?.refreshToken).toBe('');
    });

    it('accessToken과 refreshToken 모두 있음 → 둘 다 반환', async () => {
      const accessToken = createMockJWT();
      const refreshToken = 'test-refresh-token';

      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = accessToken;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = refreshToken;

      const { webTokenStorage } = await loadWebTokenStorageModule();
      const result = await webTokenStorage.getToken();

      expect(result).toEqual({
        accessToken,
        refreshToken,
      });
    });

    it('localStorage 오류 → null + console.error', async () => {
      localStorage.__setError('getItem', new Error('Storage error'));

      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        const result = await webTokenStorage.getToken();

        expect(result).toBeNull();
        expect(consoleMock.error).toHaveBeenCalled();
      } finally {
        consoleMock.restore();
      }
    });
  });

  // ============================================
  // webTokenStorage.saveToken() 테스트
  // ============================================
  describe('webTokenStorage.saveToken()', () => {
    it('토큰 저장 성공', async () => {
      const accessToken = createMockJWT();
      const refreshToken = 'refresh-token';

      const { webTokenStorage } = await loadWebTokenStorageModule();
      await webTokenStorage.saveToken({ accessToken, refreshToken });

      expect(localStorage.setItem).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN, accessToken);
      expect(localStorage.setItem).toHaveBeenCalledWith(TOKEN_KEYS.REFRESH_TOKEN, refreshToken);
    });

    it('만료 시간도 함께 저장', async () => {
      const futureExp = Math.floor((Date.now() + 3600000) / 1000);
      const accessToken = createMockJWT({ exp: futureExp });
      const refreshToken = 'refresh-token';

      const { webTokenStorage } = await loadWebTokenStorageModule();
      await webTokenStorage.saveToken({ accessToken, refreshToken });

      // 만료 시간 저장 확인
      expect(localStorage.setItem).toHaveBeenCalledWith(
        TOKEN_KEYS.TOKEN_EXPIRY,
        expect.any(String)
      );
    });

    it('개발 환경에서 로그 출력', async () => {
      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();

      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        await webTokenStorage.saveToken({
          accessToken: createMockJWT(),
          refreshToken: 'refresh',
        });

        expect(consoleMock.log).toHaveBeenCalledWith(
          expect.stringContaining('[WebTokenStorage] 토큰 저장 완료')
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('프로덕션 환경에서 로그 미출력', async () => {
      const restoreEnv = mockNodeEnv('production');
      const consoleMock = mockConsole();

      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        await webTokenStorage.saveToken({
          accessToken: createMockJWT(),
          refreshToken: 'refresh',
        });

        expect(consoleMock.log).not.toHaveBeenCalled();
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('localStorage 오류 (setItem 실패) → 저장소 불가로 처리', async () => {
      // setItem 에러는 isStorageAvailable()에서 먼저 catch됨
      localStorage.__setError('setItem', new Error('Storage error'));

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();

        // isStorageAvailable()이 false 반환 → sessionStorage 또는 메모리 저장소로 폴백
        await expect(
          webTokenStorage.saveToken({
            accessToken: createMockJWT(),
            refreshToken: 'refresh',
          })
        ).resolves.not.toThrow();

        // 저장소 폴백 경고가 출력됨
        expect(consoleMock.warn).toHaveBeenCalled();
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    // jsdom 환경에서는 window가 항상 존재하므로 server 환경 테스트 불가
    it.skip('서버 환경에서 저장 시도 → 무시 (경고만)', async () => {
      cleanup();
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        await webTokenStorage.saveToken({
          accessToken: createMockJWT(),
          refreshToken: 'refresh',
        });

        // 에러 없이 완료, 경고 출력
        expect(consoleMock.warn).toHaveBeenCalledWith(
          expect.stringContaining('localStorage를 사용할 수 없습니다')
        );
      } finally {
        consoleMock.restore();
      }
    });
  });

  // ============================================
  // webTokenStorage.clearToken() 테스트
  // ============================================
  describe('webTokenStorage.clearToken()', () => {
    it('모든 토큰 키 삭제', async () => {
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = 'token';
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh';
      localStorage.__store[TOKEN_KEYS.TOKEN_EXPIRY] = '123456';

      const { webTokenStorage } = await loadWebTokenStorageModule();
      await webTokenStorage.clearToken();

      expect(localStorage.removeItem).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN);
      expect(localStorage.removeItem).toHaveBeenCalledWith(TOKEN_KEYS.REFRESH_TOKEN);
      expect(localStorage.removeItem).toHaveBeenCalledWith(TOKEN_KEYS.TOKEN_EXPIRY);
    });

    it('개발 환경에서 로그 출력', async () => {
      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();

      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        await webTokenStorage.clearToken();

        expect(consoleMock.log).toHaveBeenCalledWith(
          expect.stringContaining('[WebTokenStorage] 토큰 삭제 완료')
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('localStorage removeItem 오류 → 저장소 불가로 판단, 조용히 return', async () => {
      // removeItem 에러 → isLocalStorageAvailable()이 false 반환 (내부에서 removeItem 호출)
      localStorage.__setError('removeItem', new Error('Storage error'));

      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        // isLocalStorageAvailable()이 false이므로 조용히 return
        await expect(webTokenStorage.clearToken()).resolves.not.toThrow();
        // 에러 로그 없음 (isLocalStorageAvailable에서 catch됨)
      } finally {
        consoleMock.restore();
      }
    });

    // jsdom 환경에서는 window가 항상 존재하므로 server 환경 테스트 불가
    it.skip('서버 환경에서 clearToken 호출 → 무시', async () => {
      cleanup();
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const { webTokenStorage } = await loadWebTokenStorageModule();
      // 에러 없이 완료되어야 함
      await expect(webTokenStorage.clearToken()).resolves.not.toThrow();
    });
  });

  // ============================================
  // webTokenStorage.isAuthenticated() 테스트
  // ============================================
  describe('webTokenStorage.isAuthenticated()', () => {
    it('유효한 토큰 존재 → true', async () => {
      const validToken = createMockJWT({ expiresInMs: 3600000 });
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = validToken;

      const { webTokenStorage } = await loadWebTokenStorageModule();
      const result = await webTokenStorage.isAuthenticated();

      expect(result).toBe(true);
    });

    it('토큰 없음 → false', async () => {
      const { webTokenStorage } = await loadWebTokenStorageModule();
      const result = await webTokenStorage.isAuthenticated();

      expect(result).toBe(false);
    });

    it('만료된 토큰 → false', async () => {
      const expiredToken = createExpiredJWT();
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = expiredToken;

      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        const result = await webTokenStorage.isAuthenticated();

        expect(result).toBe(false);
      } finally {
        consoleMock.restore();
      }
    });

    it('5분 버퍼 내 만료 예정 → false', async () => {
      const almostExpiredToken = createAlmostExpiredJWT();
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = almostExpiredToken;

      const consoleMock = mockConsole();
      try {
        const { webTokenStorage } = await loadWebTokenStorageModule();
        const result = await webTokenStorage.isAuthenticated();

        expect(result).toBe(false);
      } finally {
        consoleMock.restore();
      }
    });
  });

  // ============================================
  // debugTokenInfo() 테스트
  // ============================================
  describe('debugTokenInfo()', () => {
    it('개발 환경 → 상세 정보 출력', async () => {
      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();

      const token = createMockJWT();
      localStorage.__store[TOKEN_KEYS.ACCESS_TOKEN] = token;
      localStorage.__store[TOKEN_KEYS.REFRESH_TOKEN] = 'refresh';
      localStorage.__store[TOKEN_KEYS.TOKEN_EXPIRY] = String(Date.now() + 3600000);

      try {
        const { debugTokenInfo } = await loadWebTokenStorageModule();
        debugTokenInfo();

        expect(consoleMock.log).toHaveBeenCalledWith(
          '[WebTokenStorage Debug]',
          expect.objectContaining({
            hasAccessToken: true,
            hasRefreshToken: true,
          })
        );
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    it('프로덕션 환경 → 아무것도 출력 안 함', async () => {
      const restoreEnv = mockNodeEnv('production');
      const consoleMock = mockConsole();

      try {
        const { debugTokenInfo } = await loadWebTokenStorageModule();
        debugTokenInfo();

        expect(consoleMock.log).not.toHaveBeenCalled();
      } finally {
        consoleMock.restore();
        restoreEnv();
      }
    });

    // jsdom 환경에서는 window가 항상 존재하므로 server 환경 테스트 불가
    it.skip('서버 환경 (localStorage 불가) → 경고 메시지', async () => {
      cleanup();
      const setup = setupWindowEnvironment('server');
      cleanup = setup.cleanup;

      const restoreEnv = mockNodeEnv('development');
      const consoleMock = mockConsole();

      try {
        const { debugTokenInfo } = await loadWebTokenStorageModule();
        debugTokenInfo();

        expect(consoleMock.log).toHaveBeenCalledWith(
          expect.stringContaining('localStorage 사용 불가')
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
    it('webTokenStorage가 default export', async () => {
      const webTokenStorageModule = await loadWebTokenStorageModule();
      expect(webTokenStorageModule.default).toBe(webTokenStorageModule.webTokenStorage);
    });
  });
});
