/**
 * 웹 브라우저용 토큰 저장소
 *
 * 웹 브라우저 환경에서 인증 토큰을 저장하고 관리합니다.
 *
 * 저장소 우선순위:
 * 1. localStorage (기본, 영구 저장)
 * 2. sessionStorage (시크릿 모드 등 localStorage 불가 시)
 * 3. 메모리 저장소 (모든 저장소 불가 시, 페이지 새로고침 시 손실)
 *
 * @example
 * import { webTokenStorage } from '@/services/web-token-storage';
 *
 * // 토큰 저장
 * await webTokenStorage.saveToken({ accessToken: 'xxx', refreshToken: 'yyy' });
 *
 * // 토큰 조회
 * const tokens = await webTokenStorage.getToken();
 */

import { devLog, devWarn, devError } from "@/lib/logger";

const TOKEN_KEY = "teamplus_auth_token";
const REFRESH_TOKEN_KEY = "teamplus_refresh_token";
const TOKEN_EXPIRY_KEY = "teamplus_token_expiry";

/**
 * 토큰 만료 이벤트 이름
 * AuthContext에서 이 이벤트를 수신하여 로그인 페이지로 리다이렉트
 */
export const TOKEN_EXPIRED_EVENT = "teamplus:token-expired";

/**
 * 토큰 만료 이벤트 발생
 * @param reason 만료 사유 (expired, cleared, invalid 등)
 */
function emitTokenExpiredEvent(reason: string = "expired"): void {
  if (typeof window !== "undefined") {
    const event = new CustomEvent(TOKEN_EXPIRED_EVENT, {
      detail: { reason, timestamp: Date.now() },
    });
    window.dispatchEvent(event);

    if (process.env.NODE_ENV === "development") {
      devLog(`[WebTokenStorage] 토큰 만료 이벤트 발생: ${reason}`);
    }
  }
}

/**
 * 토큰 데이터 인터페이스
 */
export interface TokenData {
  accessToken: string;
  refreshToken: string;
}

/**
 * 토큰 저장소 인터페이스 (Native Bridge와 동일한 인터페이스)
 */
export interface TokenStorage {
  getToken(): Promise<TokenData | null>;
  saveToken(data: TokenData): Promise<void>;
  clearToken(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
}

/**
 * 저장소 타입
 */
type StorageType = "localStorage" | "sessionStorage" | "memory";

/**
 * 메모리 저장소 (폴백용)
 */
const memoryStorage: Map<string, string> = new Map();

/**
 * 현재 사용 중인 저장소 타입
 */
let currentStorageType: StorageType | null = null;

/**
 * 특정 Storage 사용 가능 여부 확인
 */
function isStorageAvailable(type: "localStorage" | "sessionStorage"): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const storage = window[type];
    const testKey = "__storage_test__";
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * 사용 가능한 저장소 결정 및 반환
 */
function getAvailableStorage(): { type: StorageType; storage: Storage | null } {
  // 이미 결정된 저장소가 있으면 재사용
  if (currentStorageType) {
    if (
      currentStorageType === "localStorage" &&
      isStorageAvailable("localStorage")
    ) {
      return { type: "localStorage", storage: window.localStorage };
    }
    if (
      currentStorageType === "sessionStorage" &&
      isStorageAvailable("sessionStorage")
    ) {
      return { type: "sessionStorage", storage: window.sessionStorage };
    }
    if (currentStorageType === "memory") {
      return { type: "memory", storage: null };
    }
  }

  // 우선순위: localStorage > sessionStorage > memory
  if (isStorageAvailable("localStorage")) {
    currentStorageType = "localStorage";
    return { type: "localStorage", storage: window.localStorage };
  }

  if (isStorageAvailable("sessionStorage")) {
    currentStorageType = "sessionStorage";
    if (process.env.NODE_ENV === "development") {
      devWarn("[WebTokenStorage] localStorage 불가, sessionStorage 사용");
    }
    return { type: "sessionStorage", storage: window.sessionStorage };
  }

  // 모든 저장소 불가 시 메모리 사용
  currentStorageType = "memory";
  if (process.env.NODE_ENV === "development") {
    devWarn(
      "[WebTokenStorage] 모든 Storage 불가, 메모리 저장소 사용 (페이지 새로고침 시 로그아웃됨)",
    );
  }
  return { type: "memory", storage: null };
}

/**
 * 저장소에서 아이템 가져오기
 */
function getItem(key: string): string | null {
  const { type, storage } = getAvailableStorage();

  if (type === "memory") {
    return memoryStorage.get(key) || null;
  }

  return storage?.getItem(key) || null;
}

/**
 * 저장소에 아이템 저장
 */
function setItem(key: string, value: string): void {
  const { type, storage } = getAvailableStorage();

  if (type === "memory") {
    memoryStorage.set(key, value);
    return;
  }

  storage?.setItem(key, value);
}

/**
 * 저장소에서 아이템 삭제
 */
function removeItem(key: string): void {
  const { type, storage } = getAvailableStorage();

  if (type === "memory") {
    memoryStorage.delete(key);
    return;
  }

  storage?.removeItem(key);
}

// [2026-05-13 Phase B-1] JWT 만료/exp 파싱 로직을 `@/lib/token-utils` 로 단일화.
//   이전: 본 파일 (isTokenExpired) + api-client.ts (isTokenExpiringSoon) 가
//   동일 5분 버퍼 로직을 복제 → 한쪽만 수정 시 회귀.
import {
  isTokenExpired,
  getTokenExpiryMs as getTokenExpiry,
} from "@/lib/token-utils";

/**
 * 웹 브라우저용 토큰 저장소
 */
export const webTokenStorage: TokenStorage & {
  getStorageType: () => StorageType | null;
} = {
  /**
   * 현재 사용 중인 저장소 타입 반환
   */
  getStorageType(): StorageType | null {
    return currentStorageType;
  },

  /**
   * 저장된 토큰 조회
   *
   * @returns 토큰 데이터 또는 null
   */
  async getToken(): Promise<TokenData | null> {
    try {
      const accessToken = getItem(TOKEN_KEY);
      const refreshToken = getItem(REFRESH_TOKEN_KEY);

      if (!accessToken) {
        return null;
      }

      // 토큰 만료 체크
      if (isTokenExpired(accessToken)) {
        if (process.env.NODE_ENV === "development") {
          devLog("[WebTokenStorage] Access token이 만료되었습니다.");
        }

        // WEB-020 레거시 제거 (2026-04-22):
        // 과거 middleware.ts가 Cookie 존재 여부만 확인하던 시절 필요했던 방어 장치.
        // 현재 middleware.ts는 JWT exp 직접 검증(line 48) → Cookie 동기화 불필요.
        // Cookie 선삭제는 refresh 진행 중 쿠키 공백 창을 만들어 페이지 이동 시
        // 강제 로그아웃을 유발하므로 제거.

        // 만료된 경우에도 refreshToken이 있으면 반환 (refresh 시도를 위해)
        if (refreshToken) {
          return { accessToken, refreshToken };
        }

        // refreshToken도 없으면 토큰 클리어 및 만료 이벤트 발생
        await webTokenStorage.clearToken();
        emitTokenExpiredEvent("expired_no_refresh");
        return null;
      }

      return {
        accessToken,
        refreshToken: refreshToken || "",
      };
    } catch (error) {
      devError("[WebTokenStorage] 토큰 조회 실패:", error);
      return null;
    }
  },

  /**
   * 토큰 저장
   *
   * @param data 저장할 토큰 데이터
   */
  async saveToken(data: TokenData): Promise<void> {
    try {
      setItem(TOKEN_KEY, data.accessToken);
      setItem(REFRESH_TOKEN_KEY, data.refreshToken);

      // 만료 시간도 저장 (디버깅용)
      const expiry = getTokenExpiry(data.accessToken);
      if (expiry) {
        setItem(TOKEN_EXPIRY_KEY, expiry.toString());
      }

      if (process.env.NODE_ENV === "development") {
        const storageType = currentStorageType;
        devLog(`[WebTokenStorage] 토큰 저장 완료 (${storageType})`);
      }
    } catch (error) {
      devError("[WebTokenStorage] 토큰 저장 실패:", error);
      throw error;
    }
  },

  /**
   * 토큰 삭제
   *
   * localStorage/sessionStorage/memory 저장소 및 Cookie 모두 삭제
   * Cookie 삭제는 middleware 인증 상태와 동기화하기 위해 필수
   */
  async clearToken(): Promise<void> {
    try {
      // 1. 저장소에서 토큰 삭제
      removeItem(TOKEN_KEY);
      removeItem(REFRESH_TOKEN_KEY);
      removeItem(TOKEN_EXPIRY_KEY);

      // 2. 미들웨어 인증용 Cookie 삭제 (중요!)
      // auth.ts의 saveTokens()에서 설정한 teamplus_access_token / teamplus_refresh_token 쿠키 삭제
      if (typeof document !== "undefined") {
        document.cookie = "teamplus_access_token=; path=/; max-age=0";
        document.cookie = "teamplus_refresh_token=; path=/; max-age=0";
      }

      if (process.env.NODE_ENV === "development") {
        devLog("[WebTokenStorage] 토큰 삭제 완료 (Storage + Cookie)");
      }
    } catch (error) {
      devError("[WebTokenStorage] 토큰 삭제 실패:", error);
    }
  },

  /**
   * 인증 여부 확인
   *
   * @returns 인증된 상태인지 여부
   */
  async isAuthenticated(): Promise<boolean> {
    const tokenData = await this.getToken();
    if (!tokenData?.accessToken) {
      return false;
    }

    // 만료 여부 확인
    return !isTokenExpired(tokenData.accessToken);
  },
};

/**
 * 토큰 정보 디버깅 (개발 환경용)
 */
export function debugTokenInfo(): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const storageType = currentStorageType || "not initialized";
  const accessToken = getItem(TOKEN_KEY);
  const expiry = getItem(TOKEN_EXPIRY_KEY);

  devLog("[WebTokenStorage Debug]", {
    storageType,
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!getItem(REFRESH_TOKEN_KEY),
    tokenExpiry: expiry ? new Date(parseInt(expiry)).toISOString() : "N/A",
    isExpired: accessToken ? isTokenExpired(accessToken) : "N/A",
  });
}

/**
 * 저장소 타입 초기화 (테스트용)
 */
export function resetStorageType(): void {
  currentStorageType = null;
  memoryStorage.clear();
}

export default webTokenStorage;
