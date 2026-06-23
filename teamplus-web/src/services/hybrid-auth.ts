/**
 * 하이브리드 인증 서비스
 *
 * Native App과 Web Browser 환경에 따라 적절한 인증 방식을 선택합니다.
 * - Native: Flutter Secure Storage (Bridge 통해 접근)
 * - Web: localStorage (web-token-storage 사용)
 * - Server: 쿠키 또는 환경변수 (SSR용)
 *
 * @example
 * import { hybridAuth } from '@/services/hybrid-auth';
 *
 * // 토큰 조회 (환경에 따라 자동 선택)
 * const tokens = await hybridAuth.getToken();
 *
 * // 토큰 저장
 * await hybridAuth.saveToken({ accessToken: 'xxx', refreshToken: 'yyy' });
 */

import { getAppEnvironment, isFlutterBridgeAvailable, type AppEnvironment } from '@/lib/environment';
import { webTokenStorage, type TokenData, type TokenStorage } from './web-token-storage';
import { auth as nativeAuth } from './native-bridge';
import { handleBridgeError } from './bridge-error-handler';
import { devLog, devWarn, devError } from '@/lib/logger';

/**
 * Native Bridge Auth 인터페이스
 */
interface NativeBridgeAuth {
  getToken(): Promise<TokenData | null>;
  saveToken(data: TokenData): Promise<void>;
  clearToken(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
}

/**
 * Native Bridge를 통한 토큰 관리 어댑터.
 *
 * 2026-04-22 (SPEC_NATIVE_BRIDGE_REFACTOR · P1-2): 이전에는 `window.FlutterBridge.auth.*`
 * 를 직접 호출해 `native-bridge.ts` 의 `auth` 래퍼를 우회했다. 그 결과:
 *   · Origin 검증 / 준비 여부 체크 / 보안 컨텍스트가 우회됨
 *   · 에러 처리·로깅이 두 경로로 나뉘어 드리프트 발생 여지
 *
 * 이제 `auth` 래퍼(`native-bridge` 의 export) 를 단일 경유지로 통합한다.
 */
function getNativeBridgeAuth(): NativeBridgeAuth | null {
  if (!isFlutterBridgeAvailable()) {
    return null;
  }

  return {
    getToken: () => nativeAuth.getToken(),
    // nativeAuth.saveToken 은 boolean 반환이므로 Promise<void> 시그니처에 맞춰 래핑.
    // 실패 시 (false) 상위에서 명시적 에러를 던져 로그아웃 플로우에 사용 가능.
    saveToken: async (data: TokenData): Promise<void> => {
      const ok = await nativeAuth.saveToken(data);
      if (!ok) {
        throw new Error('네이티브 인증 정보 저장에 실패했습니다. 다시 로그인해주세요.');
      }
    },
    clearToken: async (): Promise<void> => {
      await nativeAuth.clearToken();
    },
    isAuthenticated: () => nativeAuth.isAuthenticated(),
  };
}

/**
 * JWT 토큰의 payload에서 exp 클레임을 확인하여 만료 여부를 반환
 * 파싱 실패 시에는 만료되지 않은 것으로 간주 (다른 계층에서 검증)
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    if (typeof payload.exp !== 'number') return false;
    // exp는 초 단위, Date.now()는 밀리초 단위
    return payload.exp * 1000 < Date.now();
  } catch {
    // 파싱 실패 시 만료되지 않은 것으로 간주
    return false;
  }
}

/**
 * Server 환경용 빈 토큰 저장소 (SSR에서는 토큰 없음)
 */
const serverTokenStorage: TokenStorage = {
  async getToken(): Promise<TokenData | null> {
    return null;
  },
  async saveToken(): Promise<void> {
    // Server에서는 저장하지 않음
  },
  async clearToken(): Promise<void> {
    // Server에서는 삭제하지 않음
  },
  async isAuthenticated(): Promise<boolean> {
    return false;
  },
};

/**
 * 현재 환경에 맞는 토큰 저장소 가져오기
 */
function getTokenStorage(): TokenStorage {
  const env = getAppEnvironment();

  switch (env) {
    case 'native': {
      const nativeAuth = getNativeBridgeAuth();
      if (nativeAuth) {
        return nativeAuth;
      }
      // Native 환경이지만 Bridge가 없으면 웹 저장소 fallback
      if (process.env.NODE_ENV === 'development') {
        devWarn('[HybridAuth] Native 환경이지만 Bridge 없음, 웹 저장소 사용');
      }
      return webTokenStorage;
    }

    case 'web':
      return webTokenStorage;

    case 'server':
      return serverTokenStorage;

    default:
      return webTokenStorage;
  }
}

/**
 * 하이브리드 인증 서비스
 *
 * 환경에 따라 자동으로 적절한 저장소를 선택하여 토큰을 관리합니다.
 */
export const hybridAuth: TokenStorage & {
  getEnvironment: () => AppEnvironment;
  isNativeAuthAvailable: () => boolean;
} = {
  /**
   * 현재 환경 조회
   */
  getEnvironment(): AppEnvironment {
    return getAppEnvironment();
  },

  /**
   * Native Auth(Bridge) 사용 가능 여부
   */
  isNativeAuthAvailable(): boolean {
    return isFlutterBridgeAvailable();
  },

  /**
   * 토큰 조회
   *
   * 환경에 따라:
   * - Native: Flutter Secure Storage에서 조회
   * - Web: localStorage에서 조회
   * - Server: null 반환
   */
  async getToken(): Promise<TokenData | null> {
    const storage = getTokenStorage();
    try {
      const token = await storage.getToken();

      if (process.env.NODE_ENV === 'development') {
        const env = getAppEnvironment();
        devLog(`[HybridAuth] getToken (${env}):`, token ? '토큰 있음' : '토큰 없음');
      }

      // accessToken이 만료된 경우
      if (token?.accessToken && isTokenExpired(token.accessToken)) {
        if (process.env.NODE_ENV === 'development') {
          devLog('[HybridAuth] accessToken 만료됨');
        }
        // refreshToken이 있으면 토큰 데이터 반환 (갱신 시도를 위해)
        if (token.refreshToken) {
          if (process.env.NODE_ENV === 'development') {
            devLog('[HybridAuth] refreshToken 존재, 갱신용 토큰 반환');
          }
          return token;
        }
        // refreshToken도 없으면 null (재로그인 필요)
        return null;
      }

      return token;
    } catch (error) {
      // [2026-05-13 Phase B-3] handleBridgeError 반환값 검증 — critical 시 명시적 로그.
      //   이전: 반환값 무시 → 일부 storage 오류가 silent 로 사라짐.
      const bridgeError = handleBridgeError('auth', error, {
        operation: 'getToken',
        environment: getAppEnvironment(),
      });
      if (bridgeError.severity === 'critical') {
        devError('[HybridAuth] getToken critical:', bridgeError.code, bridgeError.technicalMessage);
      }
      return null;
    }
  },

  /**
   * 토큰 저장
   *
   * 환경에 따라:
   * - Native: Flutter Secure Storage에 저장
   * - Web: localStorage에 저장
   * - Server: 무시
   */
  async saveToken(data: TokenData): Promise<void> {
    const storage = getTokenStorage();
    try {
      await storage.saveToken(data);

      if (process.env.NODE_ENV === 'development') {
        const env = getAppEnvironment();
        devLog(`[HybridAuth] saveToken (${env}): 저장 완료`);
      }
    } catch (error) {
      const bridgeError = handleBridgeError('auth', {
        code: 'AUTH_STORAGE_ERROR',
        message: error instanceof Error ? error.message : String(error),
      }, {
        operation: 'saveToken',
        environment: getAppEnvironment(),
      });
      throw new Error(bridgeError.userMessage);
    }
  },

  /**
   * 토큰 삭제
   *
   * 환경에 따라:
   * - Native: Flutter Secure Storage에서 삭제
   * - Web: localStorage에서 삭제
   * - Server: 무시
   */
  async clearToken(): Promise<void> {
    const storage = getTokenStorage();
    try {
      await storage.clearToken();

      if (process.env.NODE_ENV === 'development') {
        const env = getAppEnvironment();
        devLog(`[HybridAuth] clearToken (${env}): 삭제 완료`);
      }
    } catch (error) {
      // 토큰 삭제 실패는 warning (로그아웃 시도 중 발생 가능)
      // [2026-05-13 Phase B-3] critical 인 경우 추가 로그 — silent drop 방지.
      const bridgeError = handleBridgeError('auth', error, {
        operation: 'clearToken',
        environment: getAppEnvironment(),
      });
      if (bridgeError.severity === 'critical') {
        devError('[HybridAuth] clearToken critical:', bridgeError.code, bridgeError.technicalMessage);
      }
    }
  },

  /**
   * 인증 여부 확인
   */
  async isAuthenticated(): Promise<boolean> {
    const storage = getTokenStorage();
    try {
      return await storage.isAuthenticated();
    } catch (error) {
      // [2026-05-13 Phase B-3] 반환값 검증 — silent drop 방지.
      const bridgeError = handleBridgeError('auth', error, {
        operation: 'isAuthenticated',
        environment: getAppEnvironment(),
      });
      if (bridgeError.severity === 'critical') {
        devError('[HybridAuth] isAuthenticated critical:', bridgeError.code, bridgeError.technicalMessage);
      }
      return false;
    }
  },
};

/**
 * 인증 상태 디버깅 (개발 환경용)
 */
export async function debugAuthState(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const env = getAppEnvironment();
  const isNativeAvailable = isFlutterBridgeAvailable();
  const token = await hybridAuth.getToken();
  const isAuth = await hybridAuth.isAuthenticated();

  devLog('[HybridAuth Debug]', {
    environment: env,
    isNativeAuthAvailable: isNativeAvailable,
    hasToken: !!token,
    isAuthenticated: isAuth,
  });
}

export default hybridAuth;
